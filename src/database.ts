import { Pool } from 'pg';

let pool : Pool;

async function getDB() {
   if (!pool) {
    pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'mixoads',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
    });
  }
  return pool;
}

export async function saveCampaignToDB(campaign: any) {
  if (process.env.USE_MOCK_DB === 'true') {
    console.log(`      [MOCK DB] Saved campaign: ${campaign.id}`);
    return;
  }
  
  try {
    const pool = await getDB();

    const query = `
      INSERT INTO campaigns (id, name, status, budget, impressions, clicks, conversions, synced_at)
      VALUES ('${campaign.id}', '${campaign.name}', '${campaign.status}', 
              ${campaign.budget}, ${campaign.impressions}, ${campaign.clicks}, 
              ${campaign.conversions}, NOW())
              ON CONFLICT (id) DO NOTHING
    `;
    
    await pool.query(query);
    
  } catch (error: any) {
    throw new Error(`Database error: ${error.message}`);
  }
}
