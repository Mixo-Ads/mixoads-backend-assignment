import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'mixoads',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres'
});

export async function saveCampaignToDB(campaign: any) {
  if (process.env.USE_MOCK_DB === 'true') {
    console.log(`      [MOCK DB] Saved campaign: ${campaign.id}`);
    return;
  }
  
  try {
    const query = `
    INSERT INTO campaigns(
    id, name, status, budget, impressions, clicks, conversions, synced_at)
    VALUES ($1 ,$2, $3, $4, $5, $6, $7, NOW())
    ON CONFLICT (id)
    DO UPDATE SET 
      name = EXCLUDED.name,
      status = EXCLUDED.status,
      budget = EXCLUDED.budget,
      impressions = EXCLUDED.impressions,
      clicks = EXCLUDED.clicks,
      conversions = EXCLUDED.conversions,
      synced_at = NOW()
    `
    
    const values = [
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.budget,
      campaign.impressions,
      campaign.clicks,
      campaign.conversions
    ];
    

    await pool.query(query, values);
    
  } catch (error: any) {
    throw new Error(`Database error: ${error.message}`);
  }
}
