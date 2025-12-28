import dotenv from 'dotenv';
import { syncAllCampaigns } from './services/campaignService';
import { closePool } from './db';

dotenv.config();

async function main() {
  console.log('Starting Mixo Ads Campaign Sync Service');
  console.log('='.repeat(60));

  try {
    await syncAllCampaigns();
  } catch (error: any) {
    console.error('\nFATAL ERROR: Sync failed unexpectedly');
    console.error(error.message);
    process.exit(1);
  } finally {
    // Clean up database connection
    await closePool();
  }
}

main();
