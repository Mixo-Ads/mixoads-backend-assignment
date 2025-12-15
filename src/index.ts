import dotenv from 'dotenv';
import { syncAllCampaigns } from './syncService';

dotenv.config();

async function main() {
  console.log('Starting campaign sync...');
  console.log('='.repeat(60));

  try {
    await syncAllCampaigns();
    console.log('\nSync completed successfully!');
  } catch (error: any) {
    console.error('\nSync failed:', error.message);
    process.exit(1);
  }
}

main();
