import { Pool } from 'pg';

async function getDB() {
  return new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'mixoads',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres'
  });
}

export async function saveCampaignToDB(campaign: any) {
  console.log('USE_MOCK_DB =', process.env.USE_MOCK_DB);
  if (String(process.env.USE_MOCK_DB).toLowerCase() === 'true') {
    console.log(`      [MOCK DB] Saved campaign: ${campaign.id}`);
    return;
  }
  
  const pool = await getDB();
  
  try {

    const query = `
      INSERT INTO campaigns (id, name, status, budget, impressions, clicks, conversions, synced_at)
      VALUES ('${campaign.id}', '${campaign.name}', '${campaign.status}', 
              ${campaign.budget}, ${campaign.impressions}, ${campaign.clicks}, 
              ${campaign.conversions}, NOW())
    `;
    
    await pool.query(query);
    
  } catch (error: any) {
    throw new Error(`Database error: ${error.message}`);
  }
}
