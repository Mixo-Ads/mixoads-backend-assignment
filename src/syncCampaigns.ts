import fetch from 'node-fetch';
import { saveCampaignToDB } from './database';

const API_BASE_URL =
  process.env.AD_PLATFORM_API_URL || 'http://localhost:3001';

const PAGE_SIZE = 10;

// Credentials are expected via environment variables
const EMAIL = process.env.AD_PLATFORM_EMAIL;
const PASSWORD = process.env.AD_PLATFORM_PASSWORD;

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

/**
 * Fetch wrapper with timeout protection.
 */
async function fetchWithTimeout(
  url: string,
  options: any,
  timeoutMs = 5000
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Basic campaign validation to avoid crashes on bad data.
 */
function isValidCampaign(data: any): data is Campaign {
  return data && typeof data.id === 'string' && typeof data.name === 'string';
}

/**
 * Main sync function.
 */
export async function syncAllCampaigns(): Promise<void> {
  if (!EMAIL || !PASSWORD) {
    throw new Error('Missing ad platform credentials');
  }

  // -------- STEP 1: AUTH --------
  console.log('🔐 Authenticating with Ad Platform...');

  const authHeader = Buffer.from(`${EMAIL}:${PASSWORD}`).toString('base64');

  const authResponse = await fetch(`${API_BASE_URL}/auth/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${authHeader}`
    }
  });

  if (!authResponse.ok) {
    throw new Error('Authentication failed');
  }

  const authData: any = await authResponse.json();
  const accessToken = authData?.access_token;

  if (!accessToken) {
    throw new Error('Access token missing from auth response');
  }

  console.log('✅ Authenticated successfully');

  // -------- STEP 2: FETCH & SYNC (PAGINATED) --------
  let page = 1;
  let hasMore = true;
  let syncedCount = 0;

  console.log('\n📦 Fetching campaigns...');

  while (hasMore) {
    const response = await fetch(
      `${API_BASE_URL}/api/campaigns?page=${page}&limit=${PAGE_SIZE}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );

    if (response.status === 429) {
  console.warn(
    `⚠️ Rate limited while fetching campaigns (page ${page}). Stopping sync gracefully.`
  );
  break;
}

if (!response.ok) {
  console.error(
    `❌ Failed to fetch campaigns (page ${page}). Status: ${response.status}`
  );
  break;
}


    const payload: any = await response.json();
    const campaigns: any[] = Array.isArray(payload?.data)
      ? payload.data
      : [];

    hasMore = Boolean(payload?.pagination?.has_more);

    for (const campaign of campaigns) {
      if (!isValidCampaign(campaign)) {
        console.warn('⚠️ Skipping invalid campaign record');
        continue;
      }

      console.log(`   🔄 Syncing campaign ${campaign.id}`);

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
          },
          2000
        );

        if (!syncResponse.ok) {
          throw new Error('Sync API returned error');
        }

        await saveCampaignToDB(campaign);
        syncedCount++;
      } catch (err: any) {
        console.error(
          `   ❌ Failed to sync campaign ${campaign.id}:`,
          err.message
        );
      }
    }

    page++;
  }

  console.log(`\n📊 Total campaigns synced: ${syncedCount}`);
}
