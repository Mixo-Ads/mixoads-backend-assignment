/**
 * Campaign repository with parameterized queries (SQL injection protection)
 */

import { Campaign, CampaignSyncData } from '../types';
import { ICampaignRepository, IConnectionPool } from './types';
import { DatabaseError } from '../utils/ErrorHandler';
import { logger } from '../utils/Logger';

/**
 * Campaign Repository class
 */
export class CampaignRepository implements ICampaignRepository {
  constructor(private pool: IConnectionPool) {}

  /**
   * Save single campaign (with UPSERT)
   * Uses parameterized queries to prevent SQL injection
   */
  public async saveCampaign(campaign: Campaign): Promise<void> {
    const query = `
      INSERT INTO campaigns (
        id, name, status, budget, impressions, clicks, conversions, created_at, synced_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        status = EXCLUDED.status,
        budget = EXCLUDED.budget,
        impressions = EXCLUDED.impressions,
        clicks = EXCLUDED.clicks,
        conversions = EXCLUDED.conversions,
        created_at = EXCLUDED.created_at,
        synced_at = EXCLUDED.synced_at
    `;

    const values = [
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.budget,
      campaign.impressions,
      campaign.clicks,
      campaign.conversions,
      campaign.created_at,
    ];

    try {
      await this.pool.query(query, values);
      
      logger.debug(`Campaign saved to database`, {
        campaignId: campaign.id,
        name: campaign.name,
      });
    } catch (error) {
      logger.error(`Failed to save campaign ${campaign.id}`, error as Error);
      throw new DatabaseError(
        `Failed to save campaign: ${(error as Error).message}`,
        error as Error
      );
    }
  }

  /**
   * Save multiple campaigns in a transaction
   */
  public async saveCampaigns(campaigns: Campaign[]): Promise<void> {
    if (campaigns.length === 0) {
      return;
    }

    const client = await this.pool.getClient();

    try {
      await client.query('BEGIN');

      const query = `
        INSERT INTO campaigns (
          id, name, status, budget, impressions, clicks, conversions, created_at, synced_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          status = EXCLUDED.status,
          budget = EXCLUDED.budget,
          impressions = EXCLUDED.impressions,
          clicks = EXCLUDED.clicks,
          conversions = EXCLUDED.conversions,
          created_at = EXCLUDED.created_at,
          synced_at = EXCLUDED.synced_at
      `;

      for (const campaign of campaigns) {
        const values = [
          campaign.id,
          campaign.name,
          campaign.status,
          campaign.budget,
          campaign.impressions,
          campaign.clicks,
          campaign.conversions,
          campaign.created_at,
        ];

        await client.query(query, values);
      }

      await client.query('COMMIT');

      logger.info(`Saved ${campaigns.length} campaigns to database`);
    } catch (error) {
      await client.query('ROLLBACK');
      
      logger.error(`Failed to save campaigns batch`, error as Error, {
        count: campaigns.length,
      });

      throw new DatabaseError(
        `Failed to save campaigns: ${(error as Error).message}`,
        error as Error
      );
    } finally {
      client.release();
    }
  }

  /**
   * Get campaign by ID
   */
  public async getCampaign(id: string): Promise<CampaignSyncData | null> {
    const query = `
      SELECT 
        id, name, status, budget, impressions, clicks, conversions, 
        created_at, synced_at
      FROM campaigns
      WHERE id = $1
    `;

    try {
      const result = await this.pool.query<CampaignSyncData>(query, [id]);

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];
    } catch (error) {
      logger.error(`Failed to get campaign ${id}`, error as Error);
      throw new DatabaseError(
        `Failed to get campaign: ${(error as Error).message}`,
        error as Error
      );
    }
  }

  /**
   * Get all campaigns
   */
  public async getAllCampaigns(): Promise<CampaignSyncData[]> {
    const query = `
      SELECT 
        id, name, status, budget, impressions, clicks, conversions,
        created_at, synced_at
      FROM campaigns
      ORDER BY synced_at DESC
    `;

    try {
      const result = await this.pool.query<CampaignSyncData>(query);
      return result.rows;
    } catch (error) {
      logger.error('Failed to get all campaigns', error as Error);
      throw new DatabaseError(
        `Failed to get campaigns: ${(error as Error).message}`,
        error as Error
      );
    }
  }

  /**
   * Delete campaign by ID
   */
  public async deleteCampaign(id: string): Promise<void> {
    const query = 'DELETE FROM campaigns WHERE id = $1';

    try {
      await this.pool.query(query, [id]);
      logger.debug(`Campaign deleted`, { campaignId: id });
    } catch (error) {
      logger.error(`Failed to delete campaign ${id}`, error as Error);
      throw new DatabaseError(
        `Failed to delete campaign: ${(error as Error).message}`,
        error as Error
      );
    }
  }

  /**
   * Clear all campaigns
   */
  public async clearAll(): Promise<void> {
    const query = 'TRUNCATE TABLE campaigns';

    try {
      await this.pool.query(query);
      logger.info('All campaigns cleared from database');
    } catch (error) {
      logger.error('Failed to clear campaigns', error as Error);
      throw new DatabaseError(
        `Failed to clear campaigns: ${(error as Error).message}`,
        error as Error
      );
    }
  }

  /**
   * Get campaign count
   */
  public async getCampaignCount(): Promise<number> {
    const query = 'SELECT COUNT(*) as count FROM campaigns';

    try {
      const result = await this.pool.query<{ count: string }>(query);
      return parseInt(result.rows[0].count, 10);
    } catch (error) {
      logger.error('Failed to get campaign count', error as Error);
      throw new DatabaseError(
        `Failed to get campaign count: ${(error as Error).message}`,
        error as Error
      );
    }
  }

  /**
   * Initialize database schema
   */
  public async initializeSchema(): Promise<void> {
    const query = `
      CREATE TABLE IF NOT EXISTS campaigns (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(500) NOT NULL,
        status VARCHAR(50) NOT NULL,
        budget DECIMAL(15, 2) NOT NULL,
        impressions INTEGER NOT NULL,
        clicks INTEGER NOT NULL,
        conversions INTEGER NOT NULL,
        created_at TIMESTAMP NOT NULL,
        synced_at TIMESTAMP NOT NULL,
        CONSTRAINT campaigns_status_check CHECK (status IN ('active', 'paused', 'completed'))
      );

      CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
      CREATE INDEX IF NOT EXISTS idx_campaigns_synced_at ON campaigns(synced_at DESC);
    `;

    try {
      await this.pool.query(query);
      logger.info('Database schema initialized');
    } catch (error) {
      logger.error('Failed to initialize schema', error as Error);
      throw new DatabaseError(
        `Failed to initialize schema: ${(error as Error).message}`,
        error as Error
      );
    }
  }
}

/**
 * Create campaign repository instance
 */
export function createCampaignRepository(
  pool: IConnectionPool
): CampaignRepository {
  return new CampaignRepository(pool);
}