import fetch from 'node-fetch';
import { saveCampaignToDB } from './database';

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

async function fetchAllCampaigns(accessToken: string): Promise<Campaign[]> {
  let page = 1;
  let allCampaigns: Campaign[] = [];

  while (true) {
    console.log(`Fetching campaigns page ${page}...`);

    let retries = 2;
    let response: any;

    while (retries > 0) {
      try {
        response = await fetchWithTimeout(
          `${API_BASE_URL}/api/campaigns?page=${page}&limit=${PAGE_SIZE}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          },
          5000
        );

        if (response.ok) break;

        if (response.status === 429) {
          const retryAfter =
            Number(response.headers.get("retry-after")) || 10;
        
          console.warn(
            `Rate limit hit on page ${page}. Waiting ${retryAfter}s before retrying...`
          );
        
          await new Promise((r) => setTimeout(r, retryAfter * 1000));
          continue;
        }
        
        if (response.status === 503) {
          console.warn(
            `Service unavailable on page ${page}. Retrying after short delay...`
          );
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }
      } catch (err) {
        retries--;
        console.warn(
          `Page ${page} failed, retrying... (${retries} left)`
        );

        if (retries === 0) {
          throw err;
        }

        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    const data: any = await response.json();
    allCampaigns.push(...data.data);

    if (!data.pagination?.has_more) {
      break;
    }

    page++;
  }

  return allCampaigns;
}

export async function syncAllCampaigns() {
  console.log('Syncing campaigns from Ad Platform...\n');
  
  const email = process.env.AD_PLATFORM_EMAIL;
  const password = process.env.AD_PLATFORM_PASSWORD;
  
  const authString = Buffer.from(`${email}:${password}`).toString('base64');
  
  console.log('Using Basic auth credentials');
  
  console.log('\nStep 1: Getting access token...');
  
  const authResponse = await fetch(`${API_BASE_URL}/auth/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${authString}`
    }
  });
  
  const authData: any = await authResponse.json();
  const accessToken = authData.access_token;
  
  console.log('Access token received');
  
  console.log('\nStep 2: Fetching campaigns (all pages)...');

const campaigns = await fetchAllCampaigns(accessToken);

console.log(`Fetched ${campaigns.length} campaigns`);
  
  console.log('\nStep 3: Syncing campaigns to database...');
  
  let successCount = 0;
  
  for (const campaign of campaigns) {
    console.log(`\n   Syncing: ${campaign.name} (ID: ${campaign.id})`);
    
    try {
      let retries = 3;

while (retries > 0) {
  try {
    const syncResponse = await fetchWithTimeout(
      `${API_BASE_URL}/api/campaigns/${campaign.id}/sync`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ campaign_id: campaign.id }),
      },
      3000
    );

    if (!syncResponse.ok) {
      if (syncResponse.status === 429) {
        const retryAfter = Math.min(
          Number(syncResponse.headers.get('retry-after')) || 10,
          10
        );
        console.warn(
          `Rate limited while syncing ${campaign.id}. Waiting ${retryAfter}s...`
        );

        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        continue;
      }

      throw new Error(`Sync failed with status ${syncResponse.status}`);
    }

    await syncResponse.json();
    await saveCampaignToDB(campaign);

    successCount++;
    console.log(`   Successfully synced ${campaign.name}`);
    break;

  } catch (err: any) {
    retries--;
    if (retries === 0) {
      console.error(
        `   Failed to sync ${campaign.name}:`,
        err.message
      );
    }
  }
}
      
    } catch (error: any) {
      console.error(`   Failed to sync ${campaign.name}:`, error.message);
    }
    // small delay to avoid hammering API
    await new Promise(r => setTimeout(r, 300));
  }
  
  console.log('\n' + '='.repeat(60));
  console.log(`Sync complete: ${successCount}/${campaigns.length} campaigns synced`);
  console.log('='.repeat(60));
}
