import 'dotenv/config';
import { syncAllCampaigns } from './syncCampaigns';

/**
 * Application entry point.
 * This service is a background job, not a web server.
 */
async function main() {
  // try {
    console.log('🚀 Starting campaign sync job...\n');
    await syncAllCampaigns();
    console.log('\n✅ Campaign sync finished successfully');
  // } catch (error: any) {
  //   console.error('❌ Campaign sync failed:', error.message);
  //   process.exit(1);
  // }
}

main();
