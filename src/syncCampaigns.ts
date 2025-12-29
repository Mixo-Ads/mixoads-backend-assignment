import fetch from 'node-fetch';
import { saveCampaignToDB } from './database';

// Configuration constants
const API_BASE_URL = process.env.AD_PLATFORM_API_URL || 'http://localhost:3001';
const PAGE_SIZE = 10;
const BATCH_SIZE = 5;

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

// Fetch all campaigns from API, handling pagination, transient errors, and rate limits.
async function fetchAllCampaigns(accessToken: string) {
  let page = 1;
  let campaigns: Campaign[] = [];
  let hasMore = true;

  while (hasMore) {
    try {
      console.log(`Fetching page ${page}...`);

      const res = await fetchWithTimeout(
        `${API_BASE_URL}/api/campaigns?page=${page}&limit=${PAGE_SIZE}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
        5000
      );

       // Handle 429 Rate Limit
      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get('retry-after') || '5', 10) * 1000;
        console.log(`Rate limit hit. Waiting ${retryAfter / 1000}s before retry...`);
        await new Promise((r) => setTimeout(r, retryAfter));
        continue; // retry same page
      }

      if (!res.ok) {
        throw new Error(`API returned ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();
      campaigns = campaigns.concat(data.data);
      hasMore = data.pagination.has_more;
      page++;
      console.log(`  Found ${data.data.length} campaigns on page ${page - 1}`);
    } catch (error: any) {
      console.log(`Transient error. Retrying page ${page} in 1s...`);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  console.log(`Total campaigns fetched: ${campaigns.length}`);
  return campaigns;
}

// Process a single campaign: sync to API + save to DB
// Implements per-campaign retry with exponential backoff
async function processCampaign(campaign: Campaign, accessToken: string) {
  const maxRetries = 3;
  let attempt = 0;
  const baseBackoff = 1000;

  while (attempt < maxRetries) {
    try {
      const syncRes = await fetchWithTimeout(
        `${API_BASE_URL}/api/campaigns/${campaign.id}/sync`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ campaign_id: campaign.id }),
        },
        3000
      );
// Handle rate limiting per campaign
      if (syncRes.status === 429) {
        const retryAfter = parseInt(syncRes.headers.get('retry-after') || '5', 10) * 1000;
        console.log(`Rate limit hit for ${campaign.name}. Waiting ${retryAfter / 1000}s...`);
        await new Promise((r) => setTimeout(r, retryAfter));
        continue;
      }

// Save to database after successful sync
      await saveCampaignToDB(campaign);
      console.log(`   Successfully synced ${campaign.name}`);
      return true;
    } catch (error: any) {
      attempt++;
      console.log(`   Retry ${attempt} for ${campaign.name} in ${baseBackoff * attempt}ms due to: ${error.message}`);
      await new Promise((r) => setTimeout(r, baseBackoff * attempt));
    }
  }

  console.error(`   Failed to sync ${campaign.name} after ${maxRetries} attempts`);
  return false;
}

// Main function: fetch all campaigns and process them in batches
export async function syncAllCampaigns() {
  console.log('Syncing campaigns from Ad Platform...\n');

  const email = process.env.AD_PLATFORM_EMAIL!;
  const password = process.env.AD_PLATFORM_PASSWORD!;

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
  const campaigns = await fetchAllCampaigns(accessToken);

  console.log('\nStep 3: Syncing campaigns to database...');

  let successCount = 0;

  // Process in batches
  for (let i = 0; i < campaigns.length; i += BATCH_SIZE) {
    const batch = campaigns.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map((c) => processCampaign(c, accessToken)));
    successCount += results.filter(Boolean).length;
  }

  console.log('\n' + '='.repeat(60));
  console.log(`Sync complete: ${successCount}/${campaigns.length} campaigns synced`);
  console.log('='.repeat(60));
}
