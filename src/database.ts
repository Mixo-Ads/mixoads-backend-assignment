import { Pool, PoolClient } from 'pg';
import { config } from './config';

// Singleton pool instance
let pool: Pool | null = null;

/**
 * Get or create the database connection pool
 */
function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      host: config.database.host,
      port: config.database.port,
      database: config.database.database,
      user: config.database.user,
      password: config.database.password,
      max: 20, // Maximum number of clients in the pool
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    // Handle pool errors
    pool.on('error', (err: Error) => {
      console.error('Unexpected error on idle client', err);
    });
  }

  return pool;
}

/**
 * Close the database connection pool
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
  created_at: string;
}

/**
 * Save a campaign to the database using parameterized queries (prevents SQL injection)
 * Uses ON CONFLICT to handle duplicates (upsert)
 */
export async function saveCampaignToDB(campaign: Campaign): Promise<void> {
  if (config.useMockDb) {
    // Simulate a small delay to mimic database write
    await new Promise(resolve => setTimeout(resolve, 10));
    console.log(`[MOCK DB] Saved campaign: ${campaign.id} - ${campaign.name}`);
    return;
  }

  const dbPool = getPool();

  try {
    // Use parameterized query to prevent SQL injection
    // ON CONFLICT handles duplicates by updating existing records
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

    await dbPool.query(query, [
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.budget,
      campaign.impressions,
      campaign.clicks,
      campaign.conversions,
    ]);
  } catch (error: any) {
    // Log the error but don't expose sensitive database details
    const errorMessage = error?.message || error?.toString() || 'Unknown database error';
    console.error(`Database error saving campaign ${campaign.id}:`, errorMessage);
    
    // If it's a connection error, suggest using mock DB mode
    if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('connect')) {
      throw new Error(
        `Failed to connect to database. ` +
        `Set USE_MOCK_DB=true in .env to use mock database mode, ` +
        `or ensure PostgreSQL is running at ${config.database.host}:${config.database.port}`
      );
    }
    
    throw new Error(`Failed to save campaign ${campaign.id} to database: ${errorMessage}`);
  }
}
