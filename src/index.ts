import 'dotenv/config';
import { syncAllCampaigns } from './syncCampaigns';


async function main() {
  console.log('Starting campaign sync...');
  console.log('='.repeat(60));
  
  try {
    await syncAllCampaigns();
    console.log('\nSync completed successfully!');
  } catch (error) {
    console.error('\nSync failed:', error);
    process.exit(1);
  }
}

main();
