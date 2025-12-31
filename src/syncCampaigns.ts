import fetch from 'node-fetch';
import { saveCampaignToDB } from './database';
import { getAccessToken } from './api/auth';
import { apiRequest } from './api/client';

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

export async function syncAllCampaigns() {
  console.log('Syncing campaigns from Ad Platform...\n');  
  
  const campaigns: any = await fetchAllCampaigns();
  
  console.log(`Found ${campaigns.length} campaigns`);

  
  console.log('\nStep 3: Syncing campaigns to database...');
  
  let successCount = 0;
  
  // for (const campaign of campaigns) {
  //   console.log(`\n   Syncing: ${campaign.name} (ID: ${campaign.id})`);
    
  //   try {
  //     const syncData: any = await apiRequest(
  //       `/api/campaigns/${campaign.id}/sync`,
  //       {
  //         method: 'POST',
  //         body: JSON.stringify({ campaign_id: campaign.id }),
  //       }
  //     );
      
  //     await saveCampaignToDB(campaign);
      
  //     successCount++;
  //     console.log(`   Successfully synced ${campaign.name}`);
      
  //   } catch (error: any) {
  //     console.error(`   Failed to sync ${campaign.name}:`, error.message);
  //   }
  // }
  await inBatches(campaigns, 2 ,async(campaign:any)=>{
    console.log(`Syncing campaign ${campaign.id}`);

    try {
      await apiRequest(
        `/api/campaigns/${campaign.id}/sync`,
        {
          method: 'POST',
          body: JSON.stringify({campaign_id: campaign.id})
        }
      )

      await saveCampaignToDB(campaign);
      successCount++;
    } catch (error:any) {
      console.log(`Failed to sync ${campaign.id}: ${error.message}`)
    }
  });


  
  console.log('\n' + '='.repeat(60));
  console.log(`Sync complete: ${successCount}/${campaigns.length} campaigns synced`);
  console.log('='.repeat(60));
}


async function fetchAllCampaigns(): Promise<any[]> {
  const allCampaigns: any[] = [];
  let page = 1;
  const limit = 10;
  let hasMore = true;

  while(hasMore){
    console.log(`Fetching campaigns page ${page}`);

    const response = await apiRequest<any>(
      `/api/campaigns?page=${page}&limit=${limit}`
    );

    allCampaigns.push(...response.data);
    hasMore = response.pagination.has_more;
    page++;
  }
  return allCampaigns;
}

async function inBatches<T>(
  items:T[],
  batchSize: number,
  handler: (item: T) => Promise<void>
) {
  for(let i = 0; i< items.length; i+= batchSize){
    const batch = items.slice(i, i + batchSize);
    await Promise.all(batch.map(handler));
  }
}