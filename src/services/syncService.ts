import { adPlatformClient, Campaign } from '../api/adPlatformClient';
import { campaignRepository } from '../database/campaignRepository';
import { logger } from '../utils/logger';
import { config } from '../config';

interface SyncResult {
  totalCampaigns: number;
  successCount: number;
  failureCount: number;
  errors: Array<{ campaignId: string; error: string }>;
}

class SyncService {
  /**
   * Sync all campaigns from the Ad Platform to the database
   */
  async syncAllCampaigns(): Promise<SyncResult> {
    const startTime = Date.now();
    logger.info('======================================');
    logger.info('Starting campaign sync...');
    logger.info('======================================');

    try {
      // Step 1: Fetch all campaigns (handles pagination)
      const campaigns = await adPlatformClient.fetchAllCampaigns();

      // Step 2: Sync campaigns with concurrency control
      logger.info(`Syncing ${campaigns.length} campaigns with concurrency: ${config.sync.concurrency}...`);
      const result = await this.syncCampaignsWithConcurrency(campaigns);

      // Step 3: Log results
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      logger.info('======================================');
      logger.info(`Sync completed in ${duration}s`);
      logger.info(`Total: ${result.totalCampaigns} | Success: ${result.successCount} | Failed: ${result.failureCount}`);
      logger.info('======================================');

      if (result.errors.length > 0) {
        logger.warn(`${result.errors.length} campaigns failed to sync:`, {
          errors: result.errors,
        });
      }

      return result;
    } catch (error: any) {
      logger.error('Campaign sync failed', error);
      throw error;
    }
  }

  /**
   * Sync campaigns with controlled concurrency to respect rate limits
   */
  private async syncCampaignsWithConcurrency(campaigns: Campaign[]): Promise<SyncResult> {
    const results: SyncResult = {
      totalCampaigns: campaigns.length,
      successCount: 0,
      failureCount: 0,
      errors: [],
    };

    // Process campaigns in batches to control concurrency
    const concurrency = config.sync.concurrency;
    const batches: Campaign[][] = [];

    for (let i = 0; i < campaigns.length; i += concurrency) {
      batches.push(campaigns.slice(i, i + concurrency));
    }

    // Process each batch
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      logger.info(`Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} campaigns)`);

      // Process campaigns in the batch concurrently
      const batchPromises = batch.map(campaign => this.syncSingleCampaign(campaign, results));
      await Promise.allSettled(batchPromises);

      // Small delay between batches to further help with rate limiting
      if (batchIndex < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return results;
  }

  /**
   * Sync a single campaign
   */
  private async syncSingleCampaign(campaign: Campaign, results: SyncResult): Promise<void> {
    try {
      // Step 1: Call sync endpoint
      await adPlatformClient.syncCampaign(campaign.id);

      // Step 2: Save to database
      await campaignRepository.saveCampaign(campaign);

      results.successCount++;
      logger.info(`✓ Synced: ${campaign.name} (${campaign.id})`);
    } catch (error: any) {
      results.failureCount++;
      results.errors.push({
        campaignId: campaign.id,
        error: error.message,
      });
      logger.error(`✗ Failed to sync: ${campaign.name} (${campaign.id})`, error);
    }
  }
}

export const syncService = new SyncService();
