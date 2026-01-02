import { Pool } from 'pg';
import { config } from '../config';
import { logger } from '../utils/logger';

let pool: Pool | null = null;

/**
 * Get or create the database connection pool (singleton pattern)
 */
export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      host: config.database.host,
      port: config.database.port,
      database: config.database.name,
      user: config.database.user,
      password: config.database.password,
      max: 20, // Maximum number of clients in the pool
      idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
      connectionTimeoutMillis: 2000, // Return an error after 2 seconds if no connection available
    });

    pool.on('error', (err) => {
      logger.error('Unexpected database pool error', err);
    });

    logger.info('Database connection pool initialized');
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
    logger.info('Database connection pool closed');
  }
}
