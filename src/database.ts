/**
 * This file simulates a database layer.
 * For this assignment, persistence beyond runtime is not required.
 */

interface Campaign {
  id: string;
  name: string;
  status: string;
  budget: number;
  impressions: number;
  clicks: number;
  conversions: number;
  created_at: string;
  synced_at: string;
}

// Simple in-memory store
const campaignStore = new Map<string, Campaign>();

/**
 * Save or update a campaign in memory.
 */
export async function saveCampaignToDB(
  campaign: Omit<Campaign, 'synced_at'>
): Promise<void> {
  campaignStore.set(campaign.id, {
    ...campaign,
    synced_at: new Date().toISOString()
  });

  console.log(`      💾 Saved campaign ${campaign.id}`);
}

/**
 * Optional helper (useful for debugging / testing).
 */
export function getAllCampaigns(): Campaign[] {
  return Array.from(campaignStore.values());
}
