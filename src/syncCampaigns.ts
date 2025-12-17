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
    const res = await fetch(
      `${API_BASE_URL}/api/campaigns?page=${page}&limit=${PAGE_SIZE}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!res.ok) {
      throw new Error(`Failed to fetch campaigns: ${res.status}`);
    }

    const data: any = await res.json();
    allCampaigns.push(...data.data);
    hasMore = data.pagination.has_more;
    page++;
  }

  return allCampaigns;
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
      const syncResponse = await fetchWithTimeout(
        `${API_BASE_URL}/api/campaigns/${campaign.id}/sync`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ campaign_id: campaign.id }),
        },
        5000 // <-- IMPORTANT (mock API takes 2s)
      );

      if (!syncResponse.ok) {
        throw new Error(`Sync failed: ${syncResponse.status}`);
      }

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

