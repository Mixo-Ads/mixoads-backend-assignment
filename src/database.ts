import { Pool, type PoolClient } from "pg"

let pool: Pool | null = null

export interface Campaign {
  id: string
  name: string
  status: string
  budget: number
  impressions: number
  clicks: number
  conversions: number
  created_at: string
}

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      host: process.env.DB_HOST || "localhost",
      port: Number.parseInt(process.env.DB_PORT || "5432"),
      database: process.env.DB_NAME || "mixoads",
      user: process.env.DB_USER || "postgres",
      password: process.env.DB_PASSWORD || "postgres",
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    })
  }
  return pool
}

/**
 * Initialize database schema
 */
export async function initializeDatabase(): Promise<void> {
  if (process.env.USE_MOCK_DB === "true") {
    console.log("📦 Using mock database")
    return
  }

  const client = getPool()

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS campaigns (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        status VARCHAR(50) NOT NULL,
        budget DECIMAL(10, 2) NOT NULL,
        impressions INTEGER DEFAULT 0,
        clicks INTEGER DEFAULT 0,
        conversions INTEGER DEFAULT 0,
        synced_at TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `)

    console.log("✅ Database schema initialized")
  } catch (error: any) {
    console.error("❌ Failed to initialize database:", error.message)
    throw error
  }
}

/**
 * Save campaign to database using parameterized queries
 */
export async function saveCampaignToDB(campaign: Campaign): Promise<void> {
  if (process.env.USE_MOCK_DB === "true") {
    console.log(`      [MOCK DB] Saved campaign: ${campaign.id}`)
    return
  }

  const client = getPool()

  try {
    // Use parameterized query to prevent SQL injection
    const query = `
      INSERT INTO campaigns (
        id, name, status, budget, impressions, clicks, conversions, synced_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      ON CONFLICT (id) 
      DO UPDATE SET
        name = EXCLUDED.name,
        status = EXCLUDED.status,
        budget = EXCLUDED.budget,
        impressions = EXCLUDED.impressions,
        clicks = EXCLUDED.clicks,
        conversions = EXCLUDED.conversions,
        synced_at = NOW(),
        updated_at = NOW()
    `

    const values = [
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.budget,
      campaign.impressions,
      campaign.clicks,
      campaign.conversions,
    ]

    await client.query(query, values)
  } catch (error: any) {
    throw new Error(`Database error: ${error.message}`)
  }
}

/**
 * Batch save campaigns for better performance
 */
export async function saveCampaignsBatch(campaigns: Campaign[]): Promise<void> {
  if (process.env.USE_MOCK_DB === "true") {
    console.log(`      [MOCK DB] Saved ${campaigns.length} campaigns`)
    return
  }

  if (campaigns.length === 0) return

  const client: PoolClient = await getPool().connect()

  try {
    await client.query("BEGIN")

    const query = `
      INSERT INTO campaigns (
        id, name, status, budget, impressions, clicks, conversions, synced_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      ON CONFLICT (id) 
      DO UPDATE SET
        name = EXCLUDED.name,
        status = EXCLUDED.status,
        budget = EXCLUDED.budget,
        impressions = EXCLUDED.impressions,
        clicks = EXCLUDED.clicks,
        conversions = EXCLUDED.conversions,
        synced_at = NOW(),
        updated_at = NOW()
    `

    for (const campaign of campaigns) {
      const values = [
        campaign.id,
        campaign.name,
        campaign.status,
        campaign.budget,
        campaign.impressions,
        campaign.clicks,
        campaign.conversions,
      ]

      await client.query(query, values)
    }

    await client.query("COMMIT")
  } catch (error: any) {
    await client.query("ROLLBACK")
    throw new Error(`Batch database error: ${error.message}`)
  } finally {
    client.release()
  }
}

/**
 * Close database connection pool
 */
export async function closeDatabaseConnection(): Promise<void> {
  if (pool) {
    await pool.end()
    pool = null
  }
}
