import { getAccessToken } from './auth';
import { fetchCampaignsPage, syncCampaign } from './apiClient';
import { saveCampaignToDB, Campaign } from './database';
import { config } from './config';

/**
 * Sync all campaigns from the Ad Platform API to the database
 * Handles pagination, rate limiting, retries, and error handling
 */
export async function syncAllCampaigns(): Promise<void> {
  console.log('Syncing campaigns from Ad Platform...\n');

  try {
    // Step 1: Get access token
    console.log('Step 1: Getting access token...');
    const accessToken = await getAccessToken();
    console.log('✓ Access token obtained\n');

    // Step 2: Fetch all campaigns (handle pagination)
    console.log('Step 2: Fetching all campaigns...');
    const allCampaigns: Campaign[] = [];
    let currentPage = 1;
    let hasMore = true;

    while (hasMore) {
      try {
        const response = await fetchCampaignsPage(currentPage, accessToken);
        allCampaigns.push(...response.data);
        
        console.log(`   Fetched page ${currentPage}: ${response.data.length} campaigns (total: ${allCampaigns.length}/${response.pagination.total})`);
        
        hasMore = response.pagination.has_more;
        currentPage++;
      } catch (error: any) {
        console.error(`   Error fetching page ${currentPage}:`, error.message);
        // If we've fetched at least some campaigns, continue with what we have
        if (allCampaigns.length > 0) {
          console.log(`   Continuing with ${allCampaigns.length} campaigns already fetched...`);
          break;
        }
        throw error;
      }
    }

    if (allCampaigns.length === 0) {
      throw new Error('No campaigns found to sync');
    }

    console.log(`\n✓ Fetched ${allCampaigns.length} campaigns total\n`);

    // Step 3: Sync each campaign
    console.log('Step 3: Syncing campaigns to database...');
    let successCount = 0;
    let failureCount = 0;
    const failures: Array<{ campaign: Campaign; error: string }> = [];

    // Process campaigns sequentially to respect rate limits
    // In production, you might want to batch with controlled concurrency
    for (const campaign of allCampaigns) {
      try {
        console.log(`   Syncing: ${campaign.name} (ID: ${campaign.id})`);
        
        // Call the sync endpoint
        await syncCampaign(campaign.id, accessToken);
        
        // Save to database
        await saveCampaignToDB(campaign);
        
        successCount++;
        console.log(`   ✓ Successfully synced ${campaign.name}`);
      } catch (error: any) {
        failureCount++;
        const errorMessage = error.message || 'Unknown error';
        failures.push({ campaign, error: errorMessage });
        console.error(`   ✗ Failed to sync ${campaign.name}: ${errorMessage}`);
      }
    }

    // Step 4: Summary
    console.log('\n' + '='.repeat(60));
    console.log('Sync Summary:');
    console.log(`  Total campaigns: ${allCampaigns.length}`);
    console.log(`  Successful: ${successCount}`);
    console.log(`  Failed: ${failureCount}`);
    
    if (failures.length > 0) {
      console.log('\n  Failed campaigns:');
      failures.forEach(({ campaign, error }) => {
        console.log(`    - ${campaign.name} (${campaign.id}): ${error}`);
      });
    }
    
    console.log('='.repeat(60));

    if (successCount === 0) {
      throw new Error('No campaigns were successfully synced');
    }

    if (failureCount > 0) {
      console.warn(`\n⚠ Warning: ${failureCount} campaigns failed to sync. Check logs above for details.`);
    }
  } catch (error: any) {
    console.error('\n✗ Sync failed:', error.message);
    throw error;
  }
}
