import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'mixoads',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  max: 10,                
  idleTimeoutMillis: 30000 
});

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

export async function saveCampaignToDB(campaign: Campaign): Promise<void> {
  if (process.env.USE_MOCK_DB === 'true') {
    console.log(`      [MOCK DB] Saved campaign: ${campaign.id}`);
    return;
  }

  const client = await pool.connect();
  try {
    // Use parameterized query + upsert to avoid SQL injection and duplicates [web:59][web:53]
    const query = `
      INSERT INTO campaigns (id, name, status, budget, impressions, clicks, conversions, created_at, synced_at)
      VALUES ($1, $2, $3, $4,       $5,         $6,     $7,          $8,         NOW())
      ON CONFLICT (id) DO UPDATE
      SET name = EXCLUDED.name,
          status = EXCLUDED.status,
          budget = EXCLUDED.budget,
          impressions = EXCLUDED.impressions,
          clicks = EXCLUDED.clicks,
          conversions = EXCLUDED.conversions,
          created_at = EXCLUDED.created_at,
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
      campaign.created_at
    ];
    await client.query(query, values);
  } catch (error: any) {
    console.error('Database error while saving campaign:', error.message);
    throw new Error(`Database error: ${error.message}`);
  } finally {
    client.release();
  }
}
