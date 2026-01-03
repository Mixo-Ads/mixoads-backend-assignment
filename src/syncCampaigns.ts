import fetch from 'node-fetch';
import { saveCampaignToDB } from './database';
import { getAccessToken } from './auth';
import { runWithConcurrency } from './utils/concurrency';
import { fetchWithRetry } from './fetchWithRetry';
import { fetchAllCampaigns } from './fetchCampaigns';

// Configuration constants
const API_BASE_URL = process.env.AD_PLATFORM_API_URL || 'http://localhost:3001';

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
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function syncAllCampaigns() {
  console.log('Syncing campaigns from Ad Platform...\n');
  
  console.log('\nStep 1: Fetching campaigns...');

  let campaigns: any = [];

  try{
    campaigns = await fetchAllCampaigns();
  } catch(error:any){
    console.error('Error fetching all campaigns:', error.message);
    throw new Error(`Failed to fetch all campaigns: ${error.message}`);
  }
  
  console.log(`Found ${campaigns.length} campaigns`);
  if (campaigns.length === 0) {
      console.warn('No campaigns found');
      return;
  }
  console.log('\nStep 2: Syncing campaigns to database...');
  

  let success = 0;
  let failed = 0;

  await runWithConcurrency(campaigns, 3, async (campaign: any) => {
    try {
      const token = await getAccessToken();

      await fetchWithRetry(
        `${API_BASE_URL}/api/campaigns/${campaign.id}/sync`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ campaign_id: campaign.id }),
        },
        3,
        4000
      );

      await saveCampaignToDB(campaign);
      success++;
    } catch (err: any) {
      failed++;
      console.error(`${campaign.id} failed:`, err.message);
    }
  });
  
  console.log('\n' + '='.repeat(60));
  console.log(`Sync complete: ${success}/${campaigns.length} campaigns synced`);
  console.log('='.repeat(60));
}
