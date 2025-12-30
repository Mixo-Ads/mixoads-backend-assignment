import { getAccessToken } from "./authService";
import { fetchAllCampaigns, syncCampaign } from "./campaignApi";
import { saveCampaignToDB } from "./database";
import pLimit from "p-limit";

/**
 * Main orchestration function
 * - Handles authentication
 * - Fetches all campaigns
 * - Syncs campaigns with controlled concurrency
 * - Persists data
 */
export async function syncAllCampaigns() {
  console.log("Syncing campaigns from Ad Platform...\n");

  console.log("Step 1: Getting access token...");
  const accessToken = await getAccessToken();

  console.log("\nStep 2: Fetching all campaigns...");
  const campaigns = await fetchAllCampaigns(accessToken);
  
  console.log(`Found ${campaigns.length} campaigns`);
  console.log("\nStep 3: Syncing campaigns to database...");

  let successCount = 0;

  /**
   * p-limit ensures we do NOT overload the API.
   * Concurrency of 2 is intentional:
   * - API limit is 10 requests/min
   * - Sync endpoint is slow (2s)
   * - Keeps rate limiting predictable
   */
  const limit = pLimit(2);

  await Promise.all(
    campaigns.map((campaign) =>
      limit(async () => {
        console.log(`\n   Syncing: ${campaign.name} (${campaign.id})`);

        try {
          await syncCampaign(accessToken, campaign.id);

          await saveCampaignToDB(campaign);

          successCount++;
          console.log(`Successfully synced ${campaign.name}`);
        } catch (err: any) {
          console.error(`Failed to sync ${campaign.name}:`, err.message);
        }
      })
    )
  );
  console.log("\n" + "=".repeat(60));
  console.log(
    `Sync complete: ${successCount}/${campaigns.length} campaigns synced`
  );
  console.log("=".repeat(60));
}
