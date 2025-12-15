import { fetchAllCampaigns, syncCampaignOnRemote } from './campaignApiClient';
import { saveCampaignToDB } from './database';

export async function syncAllCampaigns(): Promise<void> {
  console.log('Syncing campaigns from Ad Platform...');
  console.log('='.repeat(60));

  const campaigns = await fetchAllCampaigns();

  console.log('\nStep 3: Syncing campaigns to database and remote sync endpoint...\n');
  let successCount = 0;

  // For simplicity keep sequential; can be batched with p-limit if needed
  for (const campaign of campaigns) {
    console.log(`  Syncing: ${campaign.name} (ID: ${campaign.id})`);

    try {
      await syncCampaignOnRemote(campaign.id);
      await saveCampaignToDB(campaign);
      successCount++;
      console.log(`  Successfully synced ${campaign.name}`);
    } catch (error: any) {
      console.error(`  Failed to sync ${campaign.name}:`, error.message);
      // do not throw; continue with others
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`Sync complete: ${successCount}/${campaigns.length} campaigns synced`);
  console.log('='.repeat(60));
}
