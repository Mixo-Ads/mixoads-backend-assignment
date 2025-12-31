/**
 * Sync orchestrator for coordinating the entire sync process
 */

import { Campaign, SyncResult, SyncReport } from '../types';
import { SyncOrchestratorDependencies, SyncProgressCallback } from './types';
import { CampaignWorker, createCampaignWorker } from './CampaignWorker';
import { ConcurrencyQueue, createConcurrencyQueue } from './ConcurrencyQueue';
import { logger } from '../utils/Logger';
import { formatDuration, createProgressBar } from '../utils/helpers';

/**
 * Sync Orchestrator class
 */
export class SyncOrchestrator {
  private worker: CampaignWorker;
  private queue: ConcurrencyQueue<SyncResult>;

  constructor(private deps: SyncOrchestratorDependencies) {
    this.worker = createCampaignWorker({
      syncCampaignFn: deps.syncCampaignFn,
      saveCampaignFn: deps.saveCampaignFn,
    });

    this.queue = createConcurrencyQueue<SyncResult>(deps.maxConcurrent);
  }

  /**
   * Execute full sync process
   */
  public async executeSync(
    progressCallback?: SyncProgressCallback
  ): Promise<SyncReport> {
    const startTime = new Date();

    logger.info('━'.repeat(60));
    logger.info('Starting campaign synchronization');
    logger.info('━'.repeat(60));

    try {
      // Fetch all campaigns
      logger.info('Fetching campaigns from API...');
      const campaigns = await this.deps.fetchAllCampaignsFn();
      
      logger.info(`✓ Fetched ${campaigns.length} campaigns`);
      logger.info('');

      // Sync campaigns with concurrency control
      logger.info('Starting campaign sync...', {
        total: campaigns.length,
        concurrency: this.deps.maxConcurrent,
      });

      const results = await this.syncCampaignsWithProgress(
        campaigns,
        progressCallback
      );

      // Generate report
      const endTime = new Date();
      const report = this.generateReport(
        startTime,
        endTime,
        campaigns.length,
        results
      );

      // Print report
      this.printReport(report);

      return report;
    } catch (error) {
      logger.error('Sync process failed', error as Error);
      throw error;
    }
  }

  /**
   * Sync campaigns with progress updates
   */
  private async syncCampaignsWithProgress(
    campaigns: Campaign[],
    progressCallback?: SyncProgressCallback
  ): Promise<SyncResult[]> {
    const results: SyncResult[] = [];
    let successCount = 0;
    let failedCount = 0;

    // Add all campaigns to queue
    const promises = campaigns.map((campaign) =>
      this.queue.add(async () => {
        const result = await this.worker.syncCampaign(campaign);
        results.push(result);

        if (result.success) {
          successCount++;
          logger.info(
            `✓ Synced campaign ${result.campaignId} (${results.length}/${campaigns.length})`
          );
        } else {
          failedCount++;
          logger.warn(
            `✗ Failed to sync campaign ${result.campaignId} (${results.length}/${campaigns.length})`,
            { error: result.error?.message }
          );
        }

        // Progress callback
        if (progressCallback) {
          progressCallback({
            completed: results.length,
            total: campaigns.length,
            current: campaign,
            success: successCount,
            failed: failedCount,
          });
        }

        // Print progress bar
        const progressBar = createProgressBar(results.length, campaigns.length);
        logger.info(progressBar);

        return result;
      })
    );

    // Wait for all to complete
    await Promise.allSettled(promises);

    return results;
  }

  /**
   * Generate sync report
   */
  private generateReport(
    startTime: Date,
    endTime: Date,
    totalCampaigns: number,
    results: SyncResult[]
  ): SyncReport {
    const duration = endTime.getTime() - startTime.getTime();
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;
    const retryCount = results.reduce((sum, r) => sum + r.retries, 0);

    const failures = results
      .filter(r => !r.success)
      .map(r => ({
        campaignId: r.campaignId,
        error: r.error?.message || 'Unknown error',
      }));

    return {
      startTime,
      endTime,
      duration,
      totalCampaigns,
      successCount,
      failureCount,
      retryCount,
      results,
      failures,
    };
  }

  /**
   * Print sync report
   */
  private printReport(report: SyncReport): void {
    logger.info('');
    logger.info('━'.repeat(60));
    logger.info('📊 SYNC SUMMARY');
    logger.info('━'.repeat(60));
    logger.info(`Total campaigns:      ${report.totalCampaigns}`);
    logger.info(`✓ Successfully synced: ${report.successCount}`);
    logger.info(`✗ Failed:              ${report.failureCount}`);
    logger.info(`⚠ Retries required:    ${report.retryCount}`);
    logger.info(`⏱ Duration:            ${formatDuration(report.duration)}`);
    logger.info('━'.repeat(60));

    if (report.failures.length > 0) {
      logger.warn('');
      logger.warn('Failed campaigns:');
      report.failures.forEach(failure => {
        logger.warn(`  ${failure.campaignId}: ${failure.error}`);
      });
    }

    logger.info('');
  }

  /**
   * Get queue statistics
   */
  public getQueueStats() {
    return this.queue.getStats();
  }
}

/**
 * Create sync orchestrator instance
 */
export function createSyncOrchestrator(
  deps: SyncOrchestratorDependencies
): SyncOrchestrator {
  return new SyncOrchestrator(deps);
}