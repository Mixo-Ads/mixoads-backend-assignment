import fetch from 'node-fetch';
import { saveCampaignToDB } from './database';


const API_BASE_URL =
  process.env.AD_PLATFORM_API_URL || 'http://localhost:3001';

const PAGE_SIZE = 10;
const REQUEST_TIMEOUT = 10000;

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


async function fetchWithTimeout(
  url: string,
  options: any,
  timeout = REQUEST_TIMEOUT
) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
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
  console.log('\n Syncing campaigns from Ad Platform...\n');

  try {

    const email = 'admin@mixoads.com';
    const password = 'SuperSecret123!';

    const authString = Buffer.from(`${email}:${password}`).toString('base64');

    console.log('Step 1: Getting access token...');

    const authResponse = await fetch(`${API_BASE_URL}/auth/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${authString}`
      }
    });

    if (!authResponse.ok) {
      throw new Error(`Auth failed: ${authResponse.statusText}`);
    }

    const authData: any = await authResponse.json();
    const accessToken = authData.access_token;

    console.log(' Access token received');

    console.log('\n Step 2: Fetching campaigns...');

    const campaignsResponse = await fetch(
      `${API_BASE_URL}/api/campaigns?page=1&limit=${PAGE_SIZE}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );

    if (!campaignsResponse.ok) {
      throw new Error(
        `Campaign API error: ${campaignsResponse.statusText}`
      );
    }

    const campaignsData: any = await campaignsResponse.json();

    const campaigns: Campaign[] = campaignsData.data;

    console.log(
      ` Found ${campaigns.length} campaigns (page ${campaignsData.pagination.page})`
    );

    console.log('\nStep 3: Syncing campaigns to database...\n');

    let successCount = 0;

    for (const campaign of campaigns) {
      console.log(` Syncing: ${campaign.name} (${campaign.id})`);

      try {
        const syncResponse = await fetchWithTimeout(
          `${API_BASE_URL}/api/campaigns/${campaign.id}/sync`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ campaign_id: campaign.id })
          }
        );

        if (!syncResponse.ok) {
          throw new Error(
            `Sync failed with status ${syncResponse.status}`
          );
        }

        await syncResponse.json();

        await saveCampaignToDB(campaign);

        successCount++;
        console.log(`  Successfully synced ${campaign.name}`);
      } catch (error: any) {
        console.error(
          ` Failed to sync ${campaign.name}: ${error.message}`
        );
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log(
      ` Sync complete: ${successCount}/${campaigns.length} campaigns synced`
    );
    console.log('='.repeat(60));
  } catch (error: any) {
    console.error('\n Sync process failed:', error.message);
  }
}
