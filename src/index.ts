import { syncAllCampaigns } from './syncCampaigns';
import { closePool } from './database';

async function main() {
  console.log('Starting campaign sync...');
  console.log('='.repeat(60));
  
  try {
    await syncAllCampaigns();
    console.log('\n✓ Sync completed successfully!');
    process.exit(0);
  } catch (error: any) {
    console.error('\n✗ Sync failed:', error.message);
    if (error.stack && process.env.NODE_ENV === 'development') {
      console.error('\nStack trace:', error.stack);
    }
    process.exit(1);
  } finally {
    // Clean up database connections
    await closePool();
  }
}

main();
