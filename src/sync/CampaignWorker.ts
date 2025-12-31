/**
 * Campaign worker for syncing individual campaigns
 */

import { Campaign, SyncResult } from '../types';
import { SyncWorkerDependencies } from './types';
import { logger } from '../utils/Logger';

/**
 * Campaign Worker class
 */
export class CampaignWorker {
  constructor(private deps: SyncWorkerDependencies) {}

  /**
   * Sync single campaign
   */
  public async syncCampaign(campaign: Campaign): Promise<SyncResult> {
    const startTime = Date.now();
    let retries = 0;

    const campaignLogger = logger.child({
      campaignId: campaign.id,
      campaignName: campaign.name,
    });

    try {
      campaignLogger.debug('Starting campaign sync');

      // Sync campaign via API
      await this.deps.syncCampaignFn(campaign.id);

      // Save campaign to database
      await this.deps.saveCampaignFn(campaign);

      const duration = Date.now() - startTime;

      campaignLogger.info('Campaign synced successfully', {
        duration: `${duration}ms`,
      });

      return {
        campaignId: campaign.id,
        success: true,
        retries,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      campaignLogger.error('Campaign sync failed', error as Error, {
        duration: `${duration}ms`,
      });

      return {
        campaignId: campaign.id,
        success: false,
        error: error as Error,
        retries,
        duration,
      };
    }
  }

  /**
   * Sync multiple campaigns
   */
  public async syncCampaigns(campaigns: Campaign[]): Promise<SyncResult[]> {
    logger.info(`Syncing ${campaigns.length} campaigns`);

    const results: SyncResult[] = [];

    for (const campaign of campaigns) {
      const result = await this.syncCampaign(campaign);
      results.push(result);
    }

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.length - successCount;

    logger.info('Campaign batch sync completed', {
      total: results.length,
      success: successCount,
      failed: failureCount,
    });

    return results;
  }
}

/**
 * Create campaign worker instance
 */
export function createCampaignWorker(
  deps: SyncWorkerDependencies
): CampaignWorker {
  return new CampaignWorker(deps);
}