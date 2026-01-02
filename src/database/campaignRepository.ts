import { getPool } from './pool';
import { config } from '../config';
import { logger } from '../utils/logger';
import { Campaign } from '../api/adPlatformClient';

class CampaignRepository {
  /**
   * Save a campaign to the database (upsert)
   */
  async saveCampaign(campaign: Campaign): Promise<void> {
    // If using mock DB, just log
    if (config.database.useMock) {
      logger.debug(`[MOCK DB] Saved campaign: ${campaign.id}`);
      return;
    }

    const pool = getPool();

    // Use parameterized query with UPSERT to prevent SQL injection and handle duplicates
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
        synced_at = NOW()
    `;

    const values = [
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.budget,
      campaign.impressions,
      campaign.clicks,
      campaign.conversions,
    ];

    try {
      await pool.query(query, values);
    } catch (error: any) {
      logger.error(`Failed to save campaign ${campaign.id} to database`, error);
      throw new Error(`Database error: ${error.message}`);
    }
  }

  /**
   * Save multiple campaigns in a batch
   */
  async saveCampaigns(campaigns: Campaign[]): Promise<void> {
    if (config.database.useMock) {
      logger.debug(`[MOCK DB] Saved ${campaigns.length} campaigns`);
      return;
    }

    // For better performance, we could use a single multi-row insert
    // For simplicity and reliability, we'll use individual inserts
    const promises = campaigns.map(campaign => this.saveCampaign(campaign));
    await Promise.all(promises);
  }
}

export const campaignRepository = new CampaignRepository();
