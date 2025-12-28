import { Pool } from 'pg';

let pool: Pool | null = null;

function getPool(): Pool {
    if (!pool) {
        pool = new Pool({
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT || '5432'),
            database: process.env.DB_NAME || 'mixoads',
            user: process.env.DB_USER || 'postgres',
            password: process.env.DB_PASSWORD || 'postgres',
            max: 20, // Connection pool size
            idleTimeoutMillis: 30000,
        });

        // Test connection
        pool.on('error', (err) => {
            console.error('Unexpected error on idle client', err);
            process.exit(-1);
        });
    }
    return pool;
}

export async function closePool() {
    if (pool) {
        await pool.end();
    }
}

export async function saveCampaign(campaign: any) {
    if (process.env.USE_MOCK_DB === 'true') {
        // console.log(`      [MOCK DB] Saved campaign: ${campaign.id}`);
        return;
    }

    const client = await getPool().connect();

    try {
        // Use ON CONFLICT to handle duplicates (upsert)
        // Assuming 'id' is a primary key or unique constraint in the table
        const query = `
      INSERT INTO campaigns (id, name, status, budget, impressions, clicks, conversions, synced_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        status = EXCLUDED.status,
        budget = EXCLUDED.budget,
        impressions = EXCLUDED.impressions,
        clicks = EXCLUDED.clicks,
        conversions = EXCLUDED.conversions,
        synced_at = NOW();
    `;

        const values = [
            campaign.id,
            campaign.name,
            campaign.status,
            campaign.budget,
            campaign.impressions,
            campaign.clicks,
            campaign.conversions
        ];

        await client.query(query, values);

    } catch (error: any) {
        // If table doesn't exist, we might get an error.
        // In a real app we'd have migrations. 
        // Here we'll wrap and rethrow helpful error.
        throw new Error(`Database error saving campaign ${campaign.id}: ${error.message}`);
    } finally {
        client.release();
    }
}
