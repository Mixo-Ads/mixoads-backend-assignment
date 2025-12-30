import fetch, { Response } from 'node-fetch';
import { config } from './config';
import { getAccessToken } from './auth';

export interface ApiError extends Error {
  status?: number;
  retryAfter?: number;
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Make an API request with timeout, retry logic, and rate limit handling
 */
async function makeRequest(
  url: string,
  options: any = {},
  retryCount = 0
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.sync.requestTimeout);

  try {
    let response: Response;
    try {
      response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
    } catch (fetchError: any) {
      // Handle connection errors (e.g., server not running)
      if (fetchError.code === 'ECONNREFUSED' || fetchError.message?.includes('ECONNREFUSED')) {
        throw new Error(
          `Cannot connect to API server. Please ensure the mock API is running at ${config.api.baseUrl}`
        );
      }
      throw fetchError;
    }

    clearTimeout(timeoutId);

    // Handle rate limiting (429)
    if (response.status === 429) {
      const retryAfter = parseInt(response.headers.get('retry-after') || '60', 10) * 1000;
      const error: ApiError = new Error(`Rate limit exceeded. Retry after ${retryAfter}ms`);
      error.status = 429;
      error.retryAfter = retryAfter;

      if (retryCount < config.sync.maxRetries) {
        console.log(`   Rate limited. Waiting ${retryAfter}ms before retry...`);
        await sleep(retryAfter);
        return makeRequest(url, options, retryCount + 1);
      }

      throw error;
    }

    // Handle service unavailable (503) - retry with exponential backoff
    if (response.status === 503) {
      if (retryCount < config.sync.maxRetries) {
        const delay = config.sync.retryBaseDelay * Math.pow(2, retryCount);
        console.log(`   Service unavailable (503). Retrying in ${delay}ms (attempt ${retryCount + 1}/${config.sync.maxRetries})...`);
        await sleep(delay);
        return makeRequest(url, options, retryCount + 1);
      }
      throw new Error(`Service unavailable after ${config.sync.maxRetries} retries`);
    }

    // Handle other errors
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`API request failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return response;
  } catch (error: any) {
    clearTimeout(timeoutId);

    // Handle timeout - retry with exponential backoff
    if (error.name === 'AbortError' || error.message === 'Request timeout') {
      if (retryCount < config.sync.maxRetries) {
        const delay = config.sync.retryBaseDelay * Math.pow(2, retryCount);
        console.log(`   Request timeout. Retrying in ${delay}ms (attempt ${retryCount + 1}/${config.sync.maxRetries})...`);
        await sleep(delay);
        return makeRequest(url, options, retryCount + 1);
      }
      throw new Error(`Request timeout after ${config.sync.maxRetries} retries`);
    }

    throw error;
  }
}

/**
 * Fetch campaigns from a specific page
 */
export async function fetchCampaignsPage(page: number, accessToken: string): Promise<{
  data: any[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    has_more: boolean;
  };
}> {
  const url = `${config.api.baseUrl}/api/campaigns?page=${page}&limit=${config.sync.pageSize}`;
  
  const response = await makeRequest(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  return await response.json();
}

/**
 * Sync a single campaign by calling the sync endpoint
 */
export async function syncCampaign(campaignId: string, accessToken: string): Promise<void> {
  const url = `${config.api.baseUrl}/api/campaigns/${campaignId}/sync`;
  
  const response = await makeRequest(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ campaign_id: campaignId }),
  });

  // Verify the response
  const data = await response.json();
  if (!data.success) {
    throw new Error(`Campaign sync failed: ${data.message || 'Unknown error'}`);
  }
}

