import { fetchWithTimeoutAndRetry } from './httpClient';

import { Campaign } from './database';
import { getAccessToken } from './auth.client';

const API_BASE_URL = process.env.AD_PLATFORM_API_URL || 'http://localhost:3001';
const PAGE_SIZE = 10;

export interface CampaignPage {
  data: Campaign[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    has_more: boolean;
  };
}

async function fetchCampaignPage(page: number): Promise<CampaignPage> {
  const token = await getAccessToken();

  const response = await fetchWithTimeoutAndRetry(
    `${API_BASE_URL}/api/campaigns?page=${page}&limit=${PAGE_SIZE}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-client-id': process.env.CLIENT_ID || 'sync-service'
      }
    },
    { timeoutMs: 5000, maxRetries: 5, baseDelayMs: 500 }
  );

  if (!response.ok) {
    throw new Error(`Campaigns API returned ${response.status}: ${response.statusText}`);
  }

  const data: any = await response.json();
  return data;
}

export async function fetchAllCampaigns(): Promise<Campaign[]> {
  console.log('Fetching all campaigns with pagination...');
  const campaigns: Campaign[] = [];

  let page = 1;
  while (true) {
    const pageData = await fetchCampaignPage(page);
    console.log(
      `Fetched page ${page}: ${pageData.data.length} campaigns, has_more=${pageData.pagination.has_more}`
    );

    campaigns.push(...pageData.data);

    if (!pageData.pagination.has_more) {
      break;
    }
    page++;
  }

  console.log(`Total campaigns fetched: ${campaigns.length}`);
  return campaigns;
}

export async function syncCampaignOnRemote(campaignId: string): Promise<void> {
  const token = await getAccessToken();

  const response = await fetchWithTimeoutAndRetry(
    `${API_BASE_URL}/api/campaigns/${campaignId}/sync`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'x-client-id': process.env.CLIENT_ID || 'sync-service'
      },
      body: JSON.stringify({ campaign_id: campaignId })
    },
    {
      // slow endpoint (2s) + random timeouts; give 5s timeout and retries [web:21][web:64]
      timeoutMs: 5000,
      maxRetries: 5,
      baseDelayMs: 500
    }
  );

  if (!response.ok) {
    throw new Error(`Sync API returned ${response.status}: ${response.statusText}`);
  }

  const data: any = await response.json();
  if (!data.success) {
    throw new Error(`Sync API responded with failure for campaign ${campaignId}`);
  }
}
