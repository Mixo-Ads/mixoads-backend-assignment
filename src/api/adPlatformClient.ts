// src/api/adPlatformClient.ts
import { fetchWithTimeout } from "../utils/fetchWithTimeout";
import { exponentialBackoff } from "../utils/retry";

const API_URL = process.env.AD_PLATFORM_API_URL!;
const PAGE_SIZE = 10;

export async function fetchAllCampaigns(accessToken: string) {
  let page = 1;
  let allCampaigns: any[] = [];
  let hasMore = true;

  // ⭐ Add retry counter
  let rateLimitRetries = 0;
  const MAX_RATE_LIMIT_RETRIES = 10;

  console.log("\nFetching all campaigns with pagination...");

  while (hasMore) {
    const url = `${API_URL}/api/campaigns?page=${page}&limit=${PAGE_SIZE}`;

    let response;

    while (true) {
      try {
        // Use exponentialBackoff ONLY for 5xx + timeouts, NOT for 429
        response = await exponentialBackoff(async () => {
          const resp = await fetchWithTimeout(
            url,
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
              },
            },
            5000
          );
    
          // If rate-limited, handle outside exponentialBackoff
          if (resp.status === 429) {
            const retryAfter = parseInt(resp.headers.get("retry-after") || "2");
            console.log(`Rate limited. Waiting ${retryAfter}s...`);
            await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
    
            console.log("Waiting extra 500ms to avoid repeated 429...");
            await new Promise((resolve) => setTimeout(resolve, 500));
    
            throw { rateLimit: true, retryAfter };
          }
    
          if (!resp.ok) {
            throw new Error(`Failed to fetch page ${page}: ${resp.status}`);
          }
    
          return resp;
        });
    
        // If request succeeded → break out of retry loop
        break;
    
      } catch (err: any) {
        // Handle rate limit OUTSIDE exponentialBackoff
        if (err.rateLimit) {
          rateLimitRetries++;
    
          if (rateLimitRetries > MAX_RATE_LIMIT_RETRIES) {
            throw new Error(
              `Pagination aborted: Hit rate limit too many times on page ${page}`
            );
          }
    
          // Retry same page
          continue;
        }
    
        // Any other error → stop pagination
        throw err;
      }
    }
    

    // ⭐ If we successfully fetched this page, reset retry counter
    rateLimitRetries = 0;

    const data = await response.json();

    console.log(
      `Fetched page ${page}: ${data.data.length} campaigns, has_more=${data.pagination.has_more}`
    );

    allCampaigns.push(...data.data);
    hasMore = data.pagination.has_more;
    page++;
  }

  console.log(`\nTotal campaigns fetched: ${allCampaigns.length}`);
  return allCampaigns;
}
