/**
 * Campaign Sync System - Main Entry Point
 * 
 * This application syncs advertising campaign data from an external API
 * to a PostgreSQL database with robust error handling and retry logic.
 */

import { loadConfig, validateConfig } from './config';
import { Logger } from './utils/Logger';
import { LogLevel } from './types';
import { createTokenManager } from './auth/TokenManager';
import { createRateLimiter } from './api/RateLimiter';
import { createApiClient } from './api/ApiClient';
import { createCampaignService } from './api/CampaignService';
import { createConnectionPool } from './database/ConnectionPool';
import { createCampaignRepository } from './database/CampaignRepository';
import { createSyncOrchestrator } from './sync/SyncOrchestrator';
import { formatDuration } from './utils/helpers';

/**
 * Main function
 */
async function main(): Promise<void> {
  let logger: Logger;
  let pool: ReturnType<typeof createConnectionPool> | null = null;

  try {
    // Load configuration
    console.log('Loading configuration...');
    const config = loadConfig();
    validateConfig(config);

    // Initialize logger
    logger = Logger.getInstance({
      level: config.logging.level as LogLevel,
      format: config.logging.format,
    });

    logger.info('Campaign Sync System starting...');
    logger.info('━'.repeat(60));

    // Initialize authentication
    logger.info('Initializing authentication...');
    const tokenManager = createTokenManager(
      {
        email: config.api.email,
        password: config.api.password,
      },
      `${config.api.baseUrl}/api/auth/login`
    );

    // Initialize rate limiter
    logger.info('Initializing rate limiter...', {
      maxRequests: config.rateLimit.maxRequests,
      windowMs: config.rateLimit.windowMs,
    });
    const rateLimiter = createRateLimiter({
      maxRequests: config.rateLimit.maxRequests,
      windowMs: config.rateLimit.windowMs,
    });

    // Initialize API client
    logger.info('Initializing API client...');
    const apiClient = createApiClient(
      config.api.baseUrl,
      tokenManager,
      rateLimiter,
      config.api.fetchTimeout
    );

    // Initialize campaign service
    const campaignService = createCampaignService(
      apiClient,
      config.api.fetchTimeout,
      config.api.syncTimeout
    );

    // Initialize database connection
    logger.info('Connecting to database...', {
      host: config.database.host,
      database: config.database.database,
    });
    pool = createConnectionPool(config.database);

    // Test database connection
    const isConnected = await pool.isConnected();
    if (!isConnected) {
      throw new Error('Failed to connect to database');
    }
    logger.info('✓ Database connected successfully');

    // Initialize campaign repository
    const campaignRepository = createCampaignRepository(pool);

    // Initialize database schema
    logger.info('Initializing database schema...');
    await campaignRepository.initializeSchema();
    logger.info('✓ Database schema ready');

    // Initialize sync orchestrator
    logger.info('Initializing sync orchestrator...');
    const syncOrchestrator = createSyncOrchestrator({
      fetchAllCampaignsFn: () => campaignService.fetchAllCampaigns(config.sync.pageSize),
      syncCampaignFn: async (id) => {
        await campaignService.syncCampaign(id);
      },
      saveCampaignFn: (campaign) => campaignRepository.saveCampaign(campaign),
      maxConcurrent: config.sync.maxConcurrent,
    });

    logger.info('✓ All systems initialized');
    logger.info('');

    // Execute sync
    const startTime = Date.now();
    const report = await syncOrchestrator.executeSync();
    const totalDuration = Date.now() - startTime;

    // Final statistics
    logger.info('━'.repeat(60));
    logger.info('🎉 SYNC COMPLETED SUCCESSFULLY');
    logger.info('━'.repeat(60));
    logger.info(`Total time: ${formatDuration(totalDuration)}`);
    logger.info(`Campaigns synced: ${report.successCount}/${report.totalCampaigns}`);
    
    if (report.failureCount > 0) {
      logger.warn(`Failed: ${report.failureCount}`);
      process.exit(1);
    }

    logger.info('━'.repeat(60));

  } catch (error) {
    if (logger!) {
      logger.error('Fatal error during sync', error as Error);
    } else {
      console.error('Fatal error during initialization:', error);
    }
    process.exit(1);
  } finally {
    // Cleanup
    if (pool) {
      try {
        await pool.close();
        if (logger!) {
          logger.info('Database connection closed');
        }
      } catch (error) {
        if (logger!) {
          logger.error('Error closing database connection', error as Error);
        }
      }
    }
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Run main function
if (require.main === module) {
  main();
}

export { main };