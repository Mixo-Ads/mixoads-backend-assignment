import { getAccessToken } from "./authService";
import { fetchAllCampaigns, syncCampaign } from "./campaignApi";
import { saveCampaignToDB } from "./database";

export async function syncAllCampaigns() {
  console.log("Syncing campaigns from Ad Platform...\n");

  console.log("\nStep 1: Getting access token...");

  const accessToken = await getAccessToken();

  console.log("\nStep 2: Fetching all campaigns...");
  const campaigns = await fetchAllCampaigns(accessToken);
  console.log(`Found ${campaigns.length} campaigns`);

  console.log("\nStep 3: Syncing campaigns to database...");
  let successCount = 0;

  for (const campaign of campaigns) {
    console.log(`\n Syncing: ${campaign.name} (${campaign.id})`);

    try {
      await syncCampaign(accessToken, campaign.id);
      await saveCampaignToDB(campaign);
      successCount++;
      console.log(`Successfully synced ${campaign.name}`);
    } catch (err: any) {
      console.error(`Failed to sync ${campaign.name}:`, err.message);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log(`Sync complete: ${successCount}/${campaigns.length}`);
  console.log("=".repeat(60));
}
