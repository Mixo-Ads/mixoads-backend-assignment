import fetch, { Response } from 'node-fetch';
import { saveCampaignToDB } from '../repositories/campaignRepository';
import { Campaign, AuthResponse, CampaignsResponse } from '../types';
import logger from '../utils/logger';

const API_BASE_URL = process.env.AD_PLATFORM_API_URL || 'http://localhost:3001';
const EMAIL = process.env.AD_PLATFORM_EMAIL;
const PASSWORD = process.env.AD_PLATFORM_PASSWORD;
const PAGE_SIZE = 10;
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

class CampaignSyncService {
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  private async sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /*
   * We need a valid token to talk to the API. 
   * We cache it here so we don't have to login before every single request.
   */
  private async getAccessToken(): Promise<string> {
    const now = Date.now() / 1000;
    
    // If we have a token that's still valid for at least another minute, let's use it.
    if (this.accessToken && this.tokenExpiry > now + 60) {
      return this.accessToken;
    }

    logger.info('Authenticating with Ad Platform...');
    
    if (!EMAIL || !PASSWORD) {
        throw new Error("Missing credentials. Please check .env file.");
    }
    
    // Basic auth requirement for the token endpoint
    const authString = Buffer.from(`${EMAIL}:${PASSWORD}`).toString('base64');
    
    try {
        const response = await fetch(`${API_BASE_URL}/auth/token`, {
            method: 'POST',
            headers: { 'Authorization': `Basic ${authString}` }
        });

        if (!response.ok) {
            throw new Error(`Auth failed: ${response.status} ${response.statusText}`);
        }

        const data = (await response.json()) as AuthResponse;
        this.accessToken = data.access_token;
        this.tokenExpiry = now + data.expires_in;
        logger.info('Authentication successful');
        
        return this.accessToken;
    } catch (error: any) {
        logger.error('Authentication error', { error: error.message });
        throw error;
    }
  }

  /*
   * A wrapper around fetch to handle the flaky API.
   * It handles rate limits (429) by waiting, and temporary server issues (5xx) by retrying.
   */
  private async fetchWithRetry(url: string, options: any, retries = MAX_RETRIES): Promise<Response> {
    try {
      const response = await fetch(url, options);
      
      // If we're hitting the rate limit, respect the Retry-After header so we don't get banned.
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('retry-after') || '60', 10);
        logger.warn(`Rate limit hit. Waiting ${retryAfter}s...`);
        await this.sleep(retryAfter * 1000);
        return this.fetchWithRetry(url, options, retries);
      }

      // Server might be having a bad moment, give it a second and try again.
      if (response.status >= 500 && retries > 0) {
        logger.warn(`Server error ${response.status}. Retrying in ${RETRY_DELAY}ms...`);
        await this.sleep(RETRY_DELAY);
        return this.fetchWithRetry(url, options, retries - 1);
      }

      return response;
    } catch (error: any) {
      if (retries > 0) {
        logger.warn(`Network error: ${error.message}. Retrying...`);
        await this.sleep(RETRY_DELAY);
        return this.fetchWithRetry(url, options, retries - 1);
      }
      throw error;
    }
  }

  private async syncSingleCampaign(campaign: Campaign, token: string): Promise<boolean> {
    try {
        const response = await this.fetchWithRetry(
            `${API_BASE_URL}/api/campaigns/${campaign.id}/sync`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ campaign_id: campaign.id })
            }
        );

        if (!response.ok) {
            throw new Error(`Sync failed with status: ${response.status}`);
        }

        // We save immediately so even if the synchronization process crashes later,
        // this campaign is arguably safely stored.
        await saveCampaignToDB(campaign);
        return true;
    } catch (error: any) {
        logger.error(`Failed to sync campaign`, { campaignId: campaign.id, error: error.message });
        return false;
    }
  }

  public async syncAll() {
    logger.info('Starting sync process...');
    
    let page = 1;
    let hasMore = true;
    let totalSynced = 0;
    
    // Keep fetching pages until the API tells us there are no more results.
    while (hasMore) {
        try {
            const token = await this.getAccessToken();
            
            logger.info(`Fetching page...`, { page });
            const response = await this.fetchWithRetry(
                `${API_BASE_URL}/api/campaigns?page=${page}&limit=${PAGE_SIZE}`,
                { headers: { 'Authorization': `Bearer ${token}` } }
            );

            if (!response.ok) {
                throw new Error(`Failed to fetch campaigns: ${response.status}`);
            }

            const data = (await response.json()) as CampaignsResponse;
            const campaigns = data.data;

            if (campaigns.length === 0) {
                logger.info('No more campaigns found.');
                break;
            }

            // Sync all campaigns in this page at the same time to speed things up.
            const syncPromises = campaigns.map(campaign => this.syncSingleCampaign(campaign, token));
            const results = await Promise.all(syncPromises);
            
            const successCount = results.filter(r => r).length;
            totalSynced += successCount;
            logger.info(`Page synced`, { page, successCount, total: campaigns.length });

            hasMore = data.pagination.has_more;
            page++;
            
        } catch (error: any) {
             logger.error(`Critical error on page`, { page, error: error.message });
             break;
        }
    }
    
    logger.info(`Sync completed`, { totalSynced });
  }
}

export const syncAllCampaigns = async () => { 
    const service = new CampaignSyncService();
    await service.syncAll();
};