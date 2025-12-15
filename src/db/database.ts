import { Pool } from 'pg';

export const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432"),
  database: process.env.DB_NAME || "mixoads",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "postgres",
  max: 10, // allow pooling
});

export async function saveCampaignToDB(campaign: any) {
  if (process.env.USE_MOCK_DB === "true") {
    console.log(`      [MOCK DB] Saved campaign: ${campaign.id}`);
    return;
  }

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

  const params = [
    campaign.id,
    campaign.name,
    campaign.status,
    campaign.budget,
    campaign.impressions,
    campaign.clicks,
    campaign.conversions,
  ];

  try {
    await pool.query(query, params);
  } catch (err: any) {
    throw new Error(`Database error: ${err.message}`);
  }
}

