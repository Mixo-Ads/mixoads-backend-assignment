import { authenticate, getAuthConfig } from './auth';
import { ApiClient } from './api-client';
import { saveCampaignToDB, closePool, Campaign } from './database';

const PAGE_SIZE = 10;

export interface CampaignResponse {
  data: Campaign[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    has_more: boolean;
  };
}

/**
 * Fetches all campaigns from all pages
 */
async function fetchAllCampaigns(apiClient: ApiClient): Promise<Campaign[]> {
  const allCampaigns: Campaign[] = [];
  let page = 1;
  let hasMore = true;

  console.log('Fetching campaigns from all pages...');

  while (hasMore) {
    console.log(`   Fetching page ${page}...`);
    
    const response = await apiClient.request(`/api/campaigns?page=${page}&limit=${PAGE_SIZE}`);
    const data: CampaignResponse = await response.json();

    allCampaigns.push(...data.data);
    console.log(`   Found ${data.data.length} campaigns on page ${page} (total: ${allCampaigns.length}/${data.pagination.total})`);

    hasMore = data.pagination.has_more;
    page++;
  }

  return allCampaigns;
}

/**
 * Syncs a single campaign by calling the sync endpoint and saving to DB
 */
async function syncCampaign(apiClient: ApiClient, campaign: Campaign): Promise<boolean> {
  try {
    // Call sync endpoint (this can take ~2 seconds)
    const syncResponse = await apiClient.request(`/api/campaigns/${campaign.id}/sync`, {
      method: 'POST',
      body: JSON.stringify({ campaign_id: campaign.id })
    });

    if (!syncResponse.ok) {
      throw new Error(`Sync endpoint returned ${syncResponse.status}`);
    }

    // Save to database
    await saveCampaignToDB(campaign);
    return true;
  } catch (error: any) {
    console.error(`   Failed to sync ${campaign.name} (${campaign.id}): ${error.message}`);
    return false;
  }
}

/**
 * Main sync function that orchestrates the entire sync process
 */
export async function syncAllCampaigns(): Promise<void> {
  const authConfig = getAuthConfig();
  
  console.log('Step 1: Authenticating...');
  const tokenData = await authenticate(authConfig);
  console.log('   Authentication successful');
  
  const apiClient = new ApiClient({
    baseUrl: authConfig.apiBaseUrl,
    accessToken: tokenData.access_token,
    timeout: 15000 // 15 seconds - enough for the 2-second sync endpoint
  });

  console.log('\nStep 2: Fetching all campaigns...');
  const campaigns = await fetchAllCampaigns(apiClient);
  console.log(`\n   Total campaigns to sync: ${campaigns.length}`);

  console.log('\nStep 3: Syncing campaigns...');
  let successCount = 0;
  let failureCount = 0;

  // Process campaigns sequentially to respect rate limits
  // In production, you might want to batch these or use a queue
  for (let i = 0; i < campaigns.length; i++) {
    const campaign = campaigns[i];
    console.log(`\n   [${i + 1}/${campaigns.length}] Syncing: ${campaign.name} (${campaign.id})`);
    
    const success = await syncCampaign(apiClient, campaign);
    
    if (success) {
      successCount++;
      console.log(`   ✓ Successfully synced ${campaign.name}`);
    } else {
      failureCount++;
    }

    // Small delay between requests to be respectful of rate limits
    // The API client handles rate limiting, but we also add a small delay
    if (i < campaigns.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`Sync Summary:`);
  console.log(`   Total campaigns: ${campaigns.length}`);
  console.log(`   Successful: ${successCount}`);
  console.log(`   Failed: ${failureCount}`);
  console.log('='.repeat(60));

  // Close database pool
  await closePool();
}
