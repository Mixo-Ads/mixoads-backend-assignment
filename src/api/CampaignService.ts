/**
 * Campaign service for fetching and syncing campaign data
 */

import { ApiClient } from './ApiClient';
import { Campaign, PaginatedResponse, SyncResponse } from '../types';
import { logger } from '../utils/Logger';

/**
 * Campaign Service class
 */
export class CampaignService {
  constructor(
    private apiClient: ApiClient,
    private fetchTimeout: number,
    private syncTimeout: number
  ) {}

  /**
   * Fetch campaigns page
   */
  public async fetchCampaignsPage(
    page: number,
    perPage: number
  ): Promise<PaginatedResponse<Campaign>> {
    logger.info(`Fetching campaigns page ${page}`, { page, perPage });

    const response = await this.apiClient.get<PaginatedResponse<Campaign>>(
      `/api/campaigns?page=${page}&per_page=${perPage}`,
      { timeout: this.fetchTimeout }
    );

    logger.info(`Fetched ${response.data.length} campaigns from page ${page}`, {
      page,
      count: response.data.length,
      hasMore: response.pagination.has_more,
    });

    return response;
  }

  
  public async fetchAllCampaigns(perPage: number): Promise<Campaign[]> {
    const allCampaigns: Campaign[] = [];
    let currentPage = 1;
    let hasMore = true;

    logger.info('Starting to fetch all campaigns');

    while (hasMore) {
      const response = await this.fetchCampaignsPage(currentPage, perPage);
      
      allCampaigns.push(...response.data);
      
      hasMore = response.pagination.has_more;
      currentPage++;

      logger.debug(`Progress: ${allCampaigns.length} campaigns fetched`, {
        currentPage: currentPage - 1,
        total: response.pagination.total,
      });
    }

    logger.info(`Fetched all ${allCampaigns.length} campaigns across ${currentPage - 1} pages`);

    return allCampaigns;
  }

  
  public async syncCampaign(campaignId: string): Promise<SyncResponse> {
    logger.debug(`Syncing campaign ${campaignId}`);

    const response = await this.apiClient.post<SyncResponse>(
      `/api/campaigns/${campaignId}/sync`,
      {},
      { timeout: this.syncTimeout }
    );

    if (!response.success) {
      throw new Error(
        response.message || `Failed to sync campaign ${campaignId}`
      );
    }

    logger.debug(`Successfully synced campaign ${campaignId}`);

    return response;
  }

  /**
   * Get single campaign details
   */
  public async getCampaign(campaignId: string): Promise<Campaign> {
    logger.debug(`Fetching campaign ${campaignId}`);

    const response = await this.apiClient.get<Campaign>(
      `/api/campaigns/${campaignId}`,
      { timeout: this.fetchTimeout }
    );

    return response;
  }
}

/**
 * Create campaign service instance
 */
export function createCampaignService(
  apiClient: ApiClient,
  fetchTimeout: number,
  syncTimeout: number
): CampaignService {
  return new CampaignService(apiClient, fetchTimeout, syncTimeout);
}