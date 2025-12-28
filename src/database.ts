import { Pool, PoolClient } from 'pg';

// Singleton pool instance to avoid connection leaks
let pool: Pool | null = null;

/**
 * Gets or creates the database connection pool
 */
function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'mixoads',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      max: 10, // Maximum pool size
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000
    });

    // Handle pool errors
    pool.on('error', (err) => {
      console.error('Unexpected database pool error:', err);
    });
  }
  
  return pool;
}

/**
 * Closes the database connection pool
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export interface Campaign {
  id: string;
  name: string;
  status: string;
  budget: number;
  impressions: number;
  clicks: number;
  conversions: number;
  created_at?: string;
}

/**
 * Saves a campaign to the database using UPSERT to handle duplicates
 */
export async function saveCampaignToDB(campaign: Campaign): Promise<void> {
  // Use mock DB if configured
  if (process.env.USE_MOCK_DB === 'true') {
    return; // Silently succeed for mock DB
  }

  const pool = getPool();
  
  try {
    // Use parameterized query to prevent SQL injection
    // Use UPSERT (ON CONFLICT) to handle duplicate IDs gracefully
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
    
    await pool.query(query, [
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.budget,
      campaign.impressions,
      campaign.clicks,
      campaign.conversions
    ]);
    
  } catch (error: any) {
    throw new Error(`Database error saving campaign ${campaign.id}: ${error.message}`);
  }
}

/**
 * Saves multiple campaigns in a transaction for better performance
 */
export async function saveCampaignsToDB(campaigns: Campaign[]): Promise<void> {
  if (process.env.USE_MOCK_DB === 'true') {
    return; // Silently succeed for mock DB
  }

  if (campaigns.length === 0) {
    return;
  }

  const pool = getPool();
  const client: PoolClient = await pool.connect();

  try {
    await client.query('BEGIN');

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

    for (const campaign of campaigns) {
      await client.query(query, [
        campaign.id,
        campaign.name,
        campaign.status,
        campaign.budget,
        campaign.impressions,
        campaign.clicks,
        campaign.conversions
      ]);
    }

    await client.query('COMMIT');
  } catch (error: any) {
    await client.query('ROLLBACK');
    throw new Error(`Database error saving campaigns: ${error.message}`);
  } finally {
    client.release();
  }
}
