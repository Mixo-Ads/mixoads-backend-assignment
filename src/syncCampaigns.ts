import fetch from "node-fetch";
import { saveCampaignToDB } from "./database";
import { fetchWithTimeout } from "./httpClient";
import { retry } from "./retry";

// Configuration constants
const API_BASE_URL = process.env.AD_PLATFORM_API_URL || "http://localhost:3001";
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

/**
 * Fetch ALL campaigns using pagination
 * This fixes the "only first 10 campaigns" bug
 */
async function fetchAllCampaigns(accessToken: string): Promise<Campaign[]> {
  let page = 1;
  const allCampaigns: Campaign[] = [];

  while (true) {
    const response = await retry(async () => {
      const res = await fetchWithTimeout(
        `${API_BASE_URL}/api/campaigns?page=${page}&limit=${PAGE_SIZE}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
        3000
      );

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Fetch campaigns failed (${res.status}): ${text}`);
      }

      return res;
    });

    const data = await response.json();

    allCampaigns.push(...data.data);

    if (!data.pagination.has_more) {
      break;
    }
    page++;
  }
  return allCampaigns;
}

export async function syncAllCampaigns() {
  console.log("Syncing campaigns from Ad Platform...\n");

  const email = process.env.AD_PLATFORM_EMAIL;
  const password = process.env.AD_PLATFORM_PASSWORD;

  if (!email || !password) {
    throw new Error("Missing Ad Platform credentials");
  }
  const authString = Buffer.from(`${email}:${password}`).toString("base64");

  console.log("\nStep 1: Getting access token...");

  const authResponse = await retry(() =>
    fetchWithTimeout(
      `${API_BASE_URL}/auth/token`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${authString}`,
        },
      },
      3000
    )
  );
  if (!authResponse.ok) {
    throw new Error(`Auth failed: ${authResponse.status}`);
  }
  const authData: any = await authResponse.json();
  const accessToken = authData.access_token;

  // Fetch ALL campaigns (pagination fixed)
  console.log("\nStep 2: Fetching all campaigns...");
  const campaigns = await fetchAllCampaigns(accessToken);

  console.log(`Found ${campaigns.length} campaigns`);

  console.log("\nStep 3: Syncing campaigns to database...");

  let successCount = 0;

  for (const campaign of campaigns) {
    console.log(`\n   Syncing: ${campaign.name} (ID: ${campaign.id})`);

    try {
      const syncResponse = await retry(async () => {
        const res = await fetchWithTimeout(
          `${API_BASE_URL}/api/campaigns/${campaign.id}/sync`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ campaign_id: campaign.id }),
          },
          3000
        );

        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Sync failed ${res.status}: ${text}`);
        }

        return res;
      });

      await syncResponse.json();

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
