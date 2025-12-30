
import fetch from 'node-fetch';
import { saveCampaignToDB } from './database';

const API_BASE_URL = process.env.AD_PLATFORM_API_URL || 'http://localhost:3001';
const PAGE_SIZE = 10;
const CONCURRENCY = 5;
const REQUEST_TIMEOUT = 10000; 

interface Campaign {
  id: string;
  name: string;
  status: string;
  budget: number;
  impressions: number;
  clicks: number;
  conversions: number;
  created_at: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  has_more: boolean;
}

interface ApiResponse {
  data: Campaign[];
  pagination: Pagination;
}

async function fetchWithTimeout(url: string, options: any, timeout = REQUEST_TIMEOUT) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (error: any) {
    clearTimeout(id);
    if (error.name === 'AbortError') {
      throw new Error('Request timed out');
    }
    throw error;
  }
}

// Helper: delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Main function
export async function syncAllCampaigns() {
  console.log('Syncing campaigns from Ad Platform...\n');

  // Use environment variables
  const email = process.env.AD_PLATFORM_EMAIL;
  const password = process.env.AD_PLATFORM_PASSWORD;

  if (!email || !password) {
    throw new Error('Missing AD_PLATFORM_EMAIL or AD_PLATFORM_PASSWORD in .env file');
  }

  const authString = Buffer.from(`${email}:${password}`).toString('base64');

  // Step 1: Get access token
  console.log('Step 1: Getting access token...');
  const authResponse = await fetchWithTimeout(`${API_BASE_URL}/auth/token`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${authString}` }
  });

  if (!authResponse.ok) {
    throw new Error(`Failed to get token: ${authResponse.status} ${await authResponse.text()}`);
  }

  const { access_token: token } = await authResponse.json();
  console.log('Got access token\n');

  // Step 2: Fetch ALL campaigns with pagination + retry
  console.log('Step 2: Fetching all campaigns (with pagination)...');
  const allCampaigns: Campaign[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    let attempts = 0;
    let success = false;

    while (attempts < 5 && !success) {
      try {
        const url = `${API_BASE_URL}/api/campaigns?page=${page}&limit=${PAGE_SIZE}`;
        const response = await fetchWithTimeout(url, {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.status === 429) {
          const retryAfter = response.headers.get('retry-after') || '60';
          console.log(`Rate limited. Waiting ${retryAfter}s...`);
          await delay(parseInt(retryAfter) * 1000);
          attempts++;
          continue;
        }

        if (response.status === 503) {
          console.log('503 error - retrying in 5s...');
          await delay(5000);
          attempts++;
          continue;
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data: ApiResponse = await response.json();
        allCampaigns.push(...data.data);
        hasMore = data.pagination.has_more;
        console.log(`Fetched page ${page} → ${data.data.length} campaigns (total: ${allCampaigns.length})`);
        success = true;
        page++;
      } catch (error: any) {
        attempts++;
        if (attempts >= 5) throw error;
        console.log(`Retry ${attempts}/5 after error: ${error.message}`);
        await delay(3000 * attempts); // exponential backoff
      }
    }
  }

  console.log(`\nTotal campaigns fetched: ${allCampaigns.length}\n`);

  // Step 3: Sync campaigns in parallel (with concurrency limit)
  console.log('Step 3: Syncing campaigns to database...');
  let successCount = 0;

  for (let i = 0; i < allCampaigns.length; i += CONCURRENCY) {
    const batch = allCampaigns.slice(i, i + CONCURRENCY);

    const results = await Promise.allSettled(
      batch.map(async (campaign) => {
        let syncAttempts = 0;
        while (syncAttempts < 3) {
          try {
            const syncResponse = await fetchWithTimeout(
              `${API_BASE_URL}/api/campaigns/${campaign.id}/sync`,
              {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ campaign_id: campaign.id })
              },
              15000 // longer timeout for sync
            );

            if (syncResponse.status === 429) {
              await delay(60000);
              syncAttempts++;
              continue;
            }

            if (!syncResponse.ok && syncResponse.status !== 503) {
              throw new Error(`Sync failed: ${syncResponse.status}`);
            }

            if (syncResponse.status === 503) {
              throw new Error('503');
            }

            await saveCampaignToDB(campaign);
            console.log(`   Synced: ${campaign.name} (ID: ${campaign.id})`);
            return true;
          } catch (error) {
            syncAttempts++;
            if (syncAttempts >= 3) {
              console.error(`   Failed: ${campaign.name} after 3 attempts`);
              return false;
            }
            await delay(4000 * syncAttempts);
          }
        }
        return false;
      })
    );

    successCount += results.filter(r => r.status === 'fulfilled' && r.value).length;
  }

  console.log('\n' + '='.repeat(60));
  console.log(`Sync complete: ${successCount}/${allCampaigns.length} campaigns synced successfully`);
  console.log('='.repeat(60));
}