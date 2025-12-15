// src/utils/syncRetry.ts
import { fetchWithTimeout } from "./fetchWithTimeout";
import { exponentialBackoff } from "./retry";

export async function syncCampaignWithRetry(campaign: any, accessToken: string) {
  return exponentialBackoff(
    async () => {
      const resp = await fetchWithTimeout(
        `http://localhost:3001/api/campaigns/${campaign.id}/sync`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ campaign_id: campaign.id }),
        },
        3000
      );

      if (resp.status === 429) {
        const retryAfter = parseInt(resp.headers.get("retry-after") || "2");
        console.log(`Rate limited on ${campaign.id}, waiting ${retryAfter}s`);
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        throw new Error("Rate limited");
      }

      if (!resp.ok) {
        throw new Error(`Sync failed: ${resp.status}`);
      }

      return resp.json();
    },
    { retries: 3 }
  );
}
