import fetch from 'node-fetch';
import { Campaign } from './types';
import { saveCampaignToDB } from './database';

const API_BASE_URL = process.env.AD_PLATFORM_API_URL! || 'http://localhost:3001';
const PAGE_SIZE = 10;

// Timeout wrapper for fetch
async function fetchWithTimeout(url: string, options: any, timeout = 5000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return res;
  } catch (err: any) {
    if (err.name === 'AbortError') throw new Error('Request timeout');
    throw err;
  }
}

// Fetch all campaigns with pagination, rate-limit and retry handling
export async function fetchAllCampaigns(token: string): Promise<Campaign[]> {
  let campaigns: Campaign[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    try {
      const res = await fetchWithTimeout(`${API_BASE_URL}/api/campaigns?page=${page}&limit=${PAGE_SIZE}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get('retry-after') || '5', 10) * 1000;
        console.log(`Rate limit hit. Waiting ${retryAfter / 1000}s...`);
        await new Promise(r => setTimeout(r, retryAfter));
        continue;
      }

      if (!res.ok) throw new Error(`Failed to fetch page ${page}: ${res.statusText}`);

      const data = await res.json();
      campaigns = campaigns.concat(data.data);
      hasMore = data.pagination.has_more;
      page++;
      console.log(`Fetched page ${page} with ${data.data.length} campaigns`);
    } catch (err: any) {
      console.warn(`Transient error on page ${page}, retrying in 1s... (${err.message})`);
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  return campaigns;
}

// Sync single campaign with retry and exponential backoff
export async function syncCampaign(campaign: Campaign, token: string) {
  const maxRetries = 3;
  const baseBackoff = 1000;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      const res = await fetchWithTimeout(`${API_BASE_URL}/api/campaigns/${campaign.id}/sync`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ campaign_id: campaign.id })
      }, 3000);

      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get('retry-after') || '5', 10) * 1000;
        console.log(`Rate limit hit for ${campaign.name}. Waiting ${retryAfter / 1000}s`);
        await new Promise(r => setTimeout(r, retryAfter));
        continue;
      }

      // Save to database after successful sync
      await saveCampaignToDB(campaign);
      console.log(`Successfully synced ${campaign.name}`);
      return true;
    } catch (err: any) {
      attempt++;
      console.log(`Retry ${attempt} for ${campaign.name} in ${baseBackoff * attempt}ms (${err.message})`);
      await new Promise(r => setTimeout(r, baseBackoff * attempt));
    }
  }

  console.error(`Failed to sync ${campaign.name} after ${maxRetries} attempts`);
  return false;
}
