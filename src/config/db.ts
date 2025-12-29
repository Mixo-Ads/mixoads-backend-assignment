import { Pool } from 'pg';
import logger from '../utils/logger';

// We use a singleton pool to manage DB connections efficiently.
let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'mixoads',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      max: 20,
      idleTimeoutMillis: 30000,
    });
    
    // If a client sits idle and breaks, we want to know about it.
    pool.on('error', (err, client) => {
      logger.error('Unexpected error on idle client', { error: err.message });
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
