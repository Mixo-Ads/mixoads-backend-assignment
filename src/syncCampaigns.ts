import fetch from 'node-fetch';
import { saveCampaignToDB } from './database';

// Configuration constants
const API_BASE_URL = process.env.AD_PLATFORM_API_URL || 'http://localhost:3001';
const PAGE_SIZE = 10;

// Type definitions for campaigns
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

// Helper function to add timeout to fetch requests
async function fetchWithTimeout(url: string, options: any, timeout = 5000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new Error('Request timeout');
    }
    throw error;
  }
}

// exponential backoff helper function
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  initialDelay = 1000
): Promise<T> {
  let attempt = 0;
  let delay = initialDelay;

  while (true) {
    try {
      return await fn();
    } catch (error: any) {
      attempt++;

      if (error.status === 429 && error.retry_after) {
        const waitTime = error.retry_after * 1000;
        console.warn(`Rate limit hit. Waiting ${waitTime / 1000}s before retry...`);
        await new Promise(r => setTimeout(r, waitTime));
      } else if (error.message === 'Request timeout' || error.status === 503) {
        if (attempt > maxRetries) throw error;
        console.warn(`Transient error. Retry ${attempt} in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        delay *= 2;
      }
      else {
        throw error;
      }
    }
  }
}


export async function syncAllCampaigns() {
  console.log('Syncing campaigns from Ad Platform...\n');

  const email = "admin@mixoads.com";
  const password = "SuperSecret123!";

  const authString = Buffer.from(`${email}:${password}`).toString('base64');

  console.log(`Using auth: Basic ${authString}`);

  console.log('\nStep 1: Getting access token...');

  const authResponse = await fetch(`${API_BASE_URL}/auth/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${authString}`
    }
  });

  const authData: any = await authResponse.json();
  const accessToken = authData.access_token;

  console.log(`Got access token: ${accessToken}`);

  console.log('\nStep 2: Fetching campaigns...');

  const campaignsResponse = await fetch(`${API_BASE_URL}/api/campaigns?page=1&limit=${PAGE_SIZE}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });

  if (!campaignsResponse.ok) {
    throw new Error(`API returned ${campaignsResponse.status}: ${campaignsResponse.statusText}`);
  }

  const campaignsData: any = await campaignsResponse.json();

  console.log(`Found ${campaignsData.data.length} campaigns`);
  console.log(`Pagination: page ${campaignsData.pagination.page}, has_more: ${campaignsData.pagination.has_more}`);

  console.log('\nStep 3: Syncing campaigns to database...');

  let successCount = 0;

  for (const campaign of campaignsData.data) {
    console.log(`\n   Syncing: ${campaign.name} (ID: ${campaign.id})`);

    try {
      await retryWithBackoff(async () => {
        const syncResponse = await fetchWithTimeout(
          `http://localhost:3001/api/campaigns/${campaign.id}/sync`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ campaign_id: campaign.id })
          },
          3000 // 3 seconds timeout greater that the API limit of 2 seconds
        );

        // Throw 429 or 503 manually for helper
        if (syncResponse.status === 429) {
          const data = await syncResponse.json();
          const error: any = new Error('Rate limit');
          error.status = 429;
          error.retry_after = data.retry_after;
          throw error;
        }

        if (syncResponse.status === 503) {
          const error: any = new Error('Service unavailable');
          error.status = 503;
          throw error;
        }

        const syncData: any = await syncResponse.json();

        await saveCampaignToDB(campaign);
      });
      successCount++;
      console.log(`   Successfully synced ${campaign.name}`);
    } catch (error: any) {
      console.error(`   Failed to sync ${campaign.name}:`, error.message);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`Sync complete: ${successCount}/${campaignsData.data.length} campaigns synced`);
  console.log('='.repeat(60));
}
