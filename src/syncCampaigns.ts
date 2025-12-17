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

async function fetchAllCampaigns(accessToken: string): Promise<Campaign[]> {
  let page = 1;
  let hasMore = true;
  const allCampaigns: Campaign[] = [];

  while (hasMore) {
    const res = await fetchWithRetry(
      `${API_BASE_URL}/api/campaigns?page=${page}&limit=${PAGE_SIZE}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    const data: any = await res.json();
    allCampaigns.push(...data.data);
    hasMore = data.pagination.has_more;
    page++;
  }

  return allCampaigns;
}

async function fetchWithRetry(
  url: string,
  options: any,
  retries = 3,
  baseDelay = 500
) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options);

      // Handle rate limit
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get("retry-after")) || 60;
        console.warn(`Rate limited. Retrying after ${retryAfter}s`);
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        continue;
      }

      // Retry on server errors
      if (res.status >= 500) {
        throw new Error(`Server error ${res.status}`);
      }

      return res;
    } catch (err) {
      if (attempt === retries) throw err;

      const delay = baseDelay * Math.pow(2, attempt);
      console.warn(`Retrying (${attempt}/${retries}) after ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw new Error("Unreachable");
}

async function syncCampaignWithRetry(
  campaignId: string,
  accessToken: string,
  retries = 3
) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetchWithTimeout(
        `${API_BASE_URL}/api/campaigns/${campaignId}/sync`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ campaign_id: campaignId }),
        },
        3000 // must be > 2s
      );

      if (res.status === 429) {
        const retryAfter = Number(res.headers.get("retry-after")) || 60;
        console.warn(
          `Rate limited syncing ${campaignId}. Waiting ${retryAfter}s`
        );
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        continue;
      }

      if (!res.ok) {
        throw new Error(`Sync failed: ${res.status}`);
      }

      return;
    } catch (err) {
      if (attempt === retries) throw err;

      const delay = 1000 * attempt;
      console.warn(
        `Retrying sync for ${campaignId} (${attempt}/${retries}) after ${delay}ms`
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

export async function syncAllCampaigns() {
  console.log("Syncing campaigns from Ad Platform...\n");

  const email = process.env.AD_PLATFORM_EMAIL!;
  const password = process.env.AD_PLATFORM_PASSWORD!;

  const authString = Buffer.from(`${email}:${password}`).toString("base64");

  console.log("\nStep 1: Getting access token...");

  const authResponse = await fetch(`${API_BASE_URL}/auth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${authString}`,
    },
  });

  if (!authResponse.ok) {
    throw new Error(`Auth failed: ${authResponse.status}`);
  }

  const authData: any = await authResponse.json();
  const accessToken = authData.access_token;

  console.log("Got access token");

  console.log("\nStep 2: Fetching campaigns...");

  const campaigns = await fetchAllCampaigns(accessToken);

  console.log(`Fetched ${campaigns.length} campaigns`);

  console.log("\nStep 3: Syncing campaigns to database...");

  let successCount = 0;

  for (const campaign of campaigns) {
    console.log(`\n   Syncing: ${campaign.name} (ID: ${campaign.id})`);

    try {
      await syncCampaignWithRetry(campaign.id, accessToken);
      await saveCampaignToDB(campaign);

      successCount++;

      console.log(`   Successfully synced ${campaign.name}`);
    } catch (error: any) {
      console.error(`   Failed to sync ${campaign.name}:`, error.message);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log(
    `Sync complete: ${successCount}/${campaigns.length} campaigns synced`
  );
  console.log("=".repeat(60));
}

