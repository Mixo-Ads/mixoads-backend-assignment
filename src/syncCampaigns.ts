import { getAccessToken } from './auth';
import { Campaign } from './types';
import { fetchAllCampaigns, syncCampaign } from './apiClient';

// Configuration constants
const BATCH_SIZE = 5;


// Main function: fetch all campaigns and process them in batches
export async function syncAllCampaigns() {
  console.log('Syncing campaigns from Ad Platform...\n');

  console.log('\nStep 1: Getting access token...');
  const accessToken = await getAccessToken();
  console.log(`\nGot access token: ${accessToken}`);


  // Fetch all campaigns
  console.log('\nStep 2: Fetching campaigns...');
  const campaigns: Campaign[] = await fetchAllCampaigns(accessToken);
  console.log(`\nTotal campaigns fetched: ${campaigns.length}`);


  console.log('\nStep 3: Syncing campaigns to database...');
  let successCount = 0;

  // Process in batches
  for (let i = 0; i < campaigns.length; i += BATCH_SIZE) {
    const batch = campaigns.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map((c) => syncCampaign(c, accessToken)));
    successCount += results.filter(Boolean).length;
  }

  console.log('\n' + '='.repeat(60));
  console.log(`Sync complete: ${successCount}/${campaigns.length} campaigns synced`);
  console.log('='.repeat(60));
}
