import { fetchWithTimeout } from "./httpClient";
import { retry } from "./retry";

// Configuration constants
const API_BASE_URL = process.env.AD_PLATFORM_API_URL || "http://localhost:3001";
const PAGE_SIZE = 10;

// Type definitions for campaigns
export interface Campaign {
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
 * Fetch ALL campaigns using pagination
 */
export async function fetchAllCampaigns(
  accessToken: string
): Promise<Campaign[]> {
  let page = 1;
  const campaigns: Campaign[] = [];

  while (true) {
    const response = await retry(async () => {
      const res = await fetchWithTimeout(
        `${API_BASE_URL}/api/campaigns?page=${page}&limit=${PAGE_SIZE}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
        3000
      );

      if (!res.ok) {
        throw new Error(`Fetch campaigns failed (${res.status})`);
      }

      return res;
    });

    const data = await response.json();
    campaigns.push(...data.data);

    if (!data.pagination.has_more) break;
    page++;
  }

  return campaigns;
}

export async function syncCampaign(
  accessToken: string,
  campaignId: string
): Promise<void> {
  await retry(async () => {
    const res = await fetchWithTimeout(
      `${API_BASE_URL}/api/campaigns/${campaignId}/sync`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ campaign_id: campaignId }),
      },
      3000
    );

    if (!res.ok) {
      throw new Error(`Sync failed for ${campaignId}`);
    }

    return res;
  });
}
