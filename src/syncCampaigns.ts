import fetch, { Response } from 'node-fetch';
import { saveCampaignToDB } from './database';

// Configuration constants
const API_BASE_URL = process.env.AD_PLATFORM_API_URL || 'http://localhost:3001';
const PAGE_SIZE = 10;

// Rate limit: 10 requests / minute → 1 request every 6 seconds
const MIN_REQUEST_INTERVAL_MS = 6000;
let lastRequestAt = 0;

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

// Helper sleep
async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Enforce client-side request pacing
async function rateLimitGuard() {
  const now = Date.now();
  const elapsed = now - lastRequestAt;

  if (elapsed < MIN_REQUEST_INTERVAL_MS) {
    await sleep(MIN_REQUEST_INTERVAL_MS - elapsed);
  }

  lastRequestAt = Date.now();
}

// Helper function to add timeout to fetch requests
async function fetchWithTimeout(
  url: string,
  options: any,
  timeout = 5000
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
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

// Fetch with retry + backoff + rate limiting
async function fetchWithRetry(
  url: string,
  options: any,
  maxRetries = 5
): Promise<Response> {
  let attempt = 0;
  let delay = 500;

  while (true) {
    try {
      await rateLimitGuard();
      const response = await fetchWithTimeout(url, options, 5000);

      if (response.status === 429) {
        const retryAfter = response.headers.get('retry-after');
        const waitTime = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : delay;

        await sleep(waitTime);
        throw new Error('Rate limited');
      }

      if (response.status >= 500) {
        throw new Error(`Server error ${response.status}`);
      }

      return response;
    } catch (error: any) {
      attempt++;

      if (attempt > maxRetries) {
        throw new Error(
          `Request failed after ${maxRetries} retries: ${error.message}`
        );
      }

      const jitter = Math.floor(Math.random() * 200) - 100;
      await sleep(delay + jitter);
      delay *= 2;
    }
  }
}

export async function syncAllCampaigns() {
  console.log('Syncing campaigns from Ad Platform...\n');

  const email = process.env.AD_PLATFORM_EMAIL;
  const password = process.env.AD_PLATFORM_PASSWORD;

  if (!email || !password) {
    throw new Error('Missing Ad Platform credentials in environment variables');
  }

  const authString = Buffer.from(`${email}:${password}`).toString('base64');

  console.log('\nStep 1: Getting access token...');

  const authResponse = await fetch(`${API_BASE_URL}/auth/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${authString}`,
    },
  });

  if (!authResponse.ok) {
    throw new Error(`Authentication failed with status ${authResponse.status}`);
  }

  const authData: any = await authResponse.json();
  const accessToken = authData.access_token;

  if (!accessToken) {
    throw new Error('Authentication response did not include access token');
  }

  console.log('Access token obtained successfully');

  console.log('\nStep 2: Fetching campaigns...');

  let allCampaigns: Campaign[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const response = await fetchWithRetry(
      `${API_BASE_URL}/api/campaigns?page=${page}&limit=${PAGE_SIZE}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(
        `Failed to fetch campaigns (page ${page}): ${response.status}`
      );
    }

    const data: any = await response.json();

    allCampaigns.push(...data.data);
    hasMore = data.pagination.has_more;
    page++;
  }

  console.log(`Fetched ${allCampaigns.length} campaigns in total`);

  console.log('\nStep 3: Syncing campaigns to database...');

  let successCount = 0;

  for (const campaign of allCampaigns) {
    console.log(`\n   Syncing: ${campaign.name} (ID: ${campaign.id})`);

    try {
      const syncResponse = await fetchWithRetry(
        `${API_BASE_URL}/api/campaigns/${campaign.id}/sync`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ campaign_id: campaign.id }),
        }
      );

      await syncResponse.json();
      await saveCampaignToDB(campaign);

      successCount++;
      console.log(`   Successfully synced ${campaign.name}`);
    } catch (error: any) {
      console.error(
        `   Failed to sync ${campaign.name}:`,
        error.message
      );
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(
    `Sync complete: ${successCount}/${allCampaigns.length} campaigns synced`
  );
  console.log('='.repeat(60));
}

