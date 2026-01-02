import { syncService } from './services/syncService';
import { closePool } from './database/pool';
import { logger } from './utils/logger';

async function main() {
  try {
    const result = await syncService.syncAllCampaigns();

    // Exit with error if any campaigns failed
    if (result.failureCount > 0) {
      logger.warn(`Sync completed with ${result.failureCount} failures`);
      process.exit(1);
    }

    logger.info('All campaigns synced successfully!');
  } catch (error: any) {
    logger.error('Fatal error during sync', error);
    process.exit(1);
  } finally {
    // Gracefully close database connection pool
    await closePool();
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully...');
  await closePool();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  await closePool();
  process.exit(0);
});

main();
