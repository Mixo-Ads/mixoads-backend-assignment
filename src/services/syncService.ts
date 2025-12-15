// src/services/syncService.ts

import { getAccessToken } from "../api/authClient";
import { fetchAllCampaigns } from "../api/adPlatformClient";
import { saveCampaignToDB } from "../db/database";
import { createConcurrencyPool } from "../utils/concurrency";
import { syncCampaignWithRetry } from "../utils/syncRetry";

export async function syncAllCampaigns() {
  console.log("Syncing campaigns from Ad Platform...\n");

  // STEP 1 → AUTH
  console.log("Step 1: Getting access token...");
  const accessToken = await getAccessToken();
  console.log("Access token retrieved.\n");

  // STEP 2 → FETCH CAMPAIGNS (all pages)
  console.log("Step 2: Fetching campaigns...");
  const campaigns = await fetchAllCampaigns(accessToken);
  console.log(`Fetched ${campaigns.length} campaigns.\n`);

  // STEP 3 → SYNC CAMPAIGNS (with concurrency + retries)
  console.log("Step 3: Syncing campaigns to database...\n");

  const pool = createConcurrencyPool(5);
  let successCount = 0;

  const tasks = campaigns.map((campaign) =>
    pool.run(async () => {
      console.log(`→ Syncing ${campaign.name} (${campaign.id})`);

      try {
        await syncCampaignWithRetry(campaign, accessToken);
        await saveCampaignToDB(campaign);

        console.log(`✓ Synced ${campaign.name}`);
        successCount++;
      } catch (err: any) {
        console.error(`✗ Failed to sync ${campaign.name}: ${err.message}`);
      }
    })
  );

  await Promise.all(tasks);

  console.log("\n" + "=".repeat(60));
  console.log(`Sync complete: ${successCount}/${campaigns.length} campaigns synced`);
  console.log("=".repeat(60));
}
