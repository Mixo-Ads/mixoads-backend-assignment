import fetch, { Response } from 'node-fetch';
import { config } from '../config';
import { logger } from '../utils/logger';
import { retryWithBackoff, wait } from '../utils/retry';
import { authManager } from '../auth/authManager';

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

interface CampaignsResponse {
  data: Campaign[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    has_more: boolean;
  };
}

interface SyncResponse {
  success: boolean;
  campaign_id: string;
  synced_at: string;
  message: string;
}

class AdPlatformClient {
  /**
   * Fetch a single page of campaigns
   */
  async fetchCampaignsPage(page: number, limit: number = 10): Promise<CampaignsResponse> {
    return await this.makeRequest(
      `${config.adPlatform.apiUrl}/api/campaigns?page=${page}&limit=${limit}`,
      {
        method: 'GET',
      },
      config.sync.timeout.list
    );
  }

  /**
   * Fetch all campaigns across all pages
   */
  async fetchAllCampaigns(): Promise<Campaign[]> {
    const allCampaigns: Campaign[] = [];
    let page = 1;
    let hasMore = true;

    logger.info('Fetching all campaigns...');

    while (hasMore) {
      const response = await this.fetchCampaignsPage(page);
      allCampaigns.push(...response.data);

      logger.info(`Fetched page ${page}: ${response.data.length} campaigns (total so far: ${allCampaigns.length}/${response.pagination.total})`);

      hasMore = response.pagination.has_more;
      page++;
    }

    logger.info(`Successfully fetched all ${allCampaigns.length} campaigns`);
    return allCampaigns;
  }

  /**
   * Sync a single campaign
   */
  async syncCampaign(campaignId: string): Promise<SyncResponse> {
    return await this.makeRequest(
      `${config.adPlatform.apiUrl}/api/campaigns/${campaignId}/sync`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ campaign_id: campaignId }),
      },
      config.sync.timeout.sync
    );
  }

  /**
   * Make an API request with retry logic, timeout, and rate limit handling
   */
  private async makeRequest<T>(
    url: string,
    options: any,
    timeout: number
  ): Promise<T> {
    return await retryWithBackoff(
      async () => {
        const token = await authManager.getAccessToken();

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
          const response = await fetch(url, {
            ...options,
            headers: {
              ...options.headers,
              'Authorization': `Bearer ${token}`,
            },
            signal: controller.signal as any,
          });

          clearTimeout(timeoutId);

          // Handle rate limiting (429)
          if (response.status === 429) {
            const retryAfter = response.headers.get('retry-after');
            const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 60000; // Default 60s

            logger.warn(`Rate limit hit, waiting ${waitTime / 1000} seconds...`);
            await wait(waitTime);

            // Retry the request after waiting
            return await this.makeRequest<T>(url, options, timeout);
          }

          // Handle token expiry (401)
          if (response.status === 401) {
            logger.warn('Token expired, refreshing...');
            authManager.clearToken();
            throw new Error('Token expired');
          }

          // Handle other errors
          if (!response.ok) {
            const error = await this.createErrorFromResponse(response);
            throw error;
          }

          return await response.json() as T;
        } catch (error: any) {
          clearTimeout(timeoutId);

          if (error.name === 'AbortError') {
            throw new Error('Request timeout');
          }

          throw error;
        }
      },
      {
        maxAttempts: config.sync.retry.maxAttempts,
        baseDelay: config.sync.retry.baseDelay,
      }
    );
  }

  /**
   * Create a detailed error from HTTP response
   */
  private async createErrorFromResponse(response: Response): Promise<Error> {
    let errorMessage = `HTTP ${response.status}: ${response.statusText}`;

    try {
      const errorData = await response.json();
      if (errorData.error || errorData.message) {
        errorMessage = errorData.error || errorData.message;
      }
    } catch {
      // Ignore JSON parse errors
    }

    const error: any = new Error(errorMessage);
    error.status = response.status;
    error.statusCode = response.status;
    return error;
  }
}

export const adPlatformClient = new AdPlatformClient();
