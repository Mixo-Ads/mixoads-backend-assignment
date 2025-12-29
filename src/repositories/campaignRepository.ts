import { getPool } from '../config/db';
import { Campaign } from '../types';
import logger from '../utils/logger';

export async function saveCampaignToDB(campaign: Campaign) {
  if (process.env.USE_MOCK_DB === 'true') {
     return;
  }
  
  const db = getPool();
  
  try {
    /* 
     * We use an UPSERT here (INSERT ... ON CONFLICT UPDATE).
     * This ensures that if the syncer runs multiple times, we update existing records
     * instead of failing with duplicate key errors or creating duplicates.
     */
    const query = `
      INSERT INTO campaigns (id, name, status, budget, impressions, clicks, conversions, synced_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      ON CONFLICT (id) 
      DO UPDATE SET
        name = EXCLUDED.name,
        status = EXCLUDED.status,
        budget = EXCLUDED.budget,
        impressions = EXCLUDED.impressions,
        clicks = EXCLUDED.clicks,
        conversions = EXCLUDED.conversions,
        synced_at = NOW();
    `;
    
    const values = [
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.budget,
      campaign.impressions,
      campaign.clicks,
      campaign.conversions
    ];
    
    await db.query(query, values);
    logger.info(`Saved saved`, { campaignId: campaign.id, name: campaign.name });
    
  } catch (error: any) {
    logger.error(`Database error saving campaign`, { campaignId: campaign.id, error: error.message });
    throw error;
  }
}
