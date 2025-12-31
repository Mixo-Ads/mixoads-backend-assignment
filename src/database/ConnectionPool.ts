/**
 * PostgreSQL connection pool manager
 */

import { Pool, PoolClient, PoolConfig, QueryResult, QueryResultRow } from 'pg';
import { DatabaseConfig, IConnectionPool } from './types';
import { DatabaseError } from '../utils/ErrorHandler';
import { logger } from '../utils/Logger';

/**
 * Connection Pool class
 */
export class ConnectionPool implements IConnectionPool {
  private pool: Pool;

  constructor(config: DatabaseConfig) {
    const poolConfig: PoolConfig = {
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      max: config.max,
      idleTimeoutMillis: config.idleTimeoutMillis,
      connectionTimeoutMillis: config.connectionTimeoutMillis,
    };

    this.pool = new Pool(poolConfig);

    // Handle pool errors
    this.pool.on('error', (err) => {
      logger.error('Unexpected database pool error', err);
    });

    // Log pool events in debug mode
    this.pool.on('connect', () => {
      logger.debug('New database client connected');
    });

    this.pool.on('remove', () => {
      logger.debug('Database client removed from pool');
    });
  }

  /**
   * Get the pool instance
   */
  public getPool(): Pool {
    return this.pool;
  }

  /**
   * Execute a query
   */
  public async query<T extends QueryResultRow = any>(
    text: string,
    params?: unknown[]
  ): Promise<QueryResult<T>> {
    try {
      const start = Date.now();
      const result = await this.pool.query<T>(text, params);
      const duration = Date.now() - start;

      logger.debug('Query executed', {
        duration: `${duration}ms`,
        rows: result.rowCount,
      });

      return result;
    } catch (error) {
      logger.error('Database query error', error as Error, {
        query: text.substring(0, 100), // Log first 100 chars
      });

      throw new DatabaseError(
        `Query execution failed: ${(error as Error).message}`,
        error as Error
      );
    }
  }

  /**
   * Get a client from the pool
   */
  public async getClient(): Promise<PoolClient> {
    try {
      const client = await this.pool.connect();
      
      logger.debug('Client checked out from pool');

      return client;
    } catch (error) {
      logger.error('Failed to get database client', error as Error);

      throw new DatabaseError(
        `Failed to get database client: ${(error as Error).message}`,
        error as Error
      );
    }
  }

  /**
   * Close the pool
   */
  public async close(): Promise<void> {
    try {
      await this.pool.end();
      logger.info('Database connection pool closed');
    } catch (error) {
      logger.error('Error closing database pool', error as Error);
      throw new DatabaseError(
        `Failed to close database pool: ${(error as Error).message}`,
        error as Error
      );
    }
  }

  /**
   * Check if database is connected
   */
  public async isConnected(): Promise<boolean> {
    try {
      const result = await this.pool.query('SELECT 1 as connected');
      return result.rows.length > 0;
    } catch (error) {
      logger.debug('Database connection check failed', {
        error: (error as Error).message,
      });
      return false;
    }
  }

  /**
   * Get pool statistics
   */
  public getStats(): {
    total: number;
    idle: number;
    waiting: number;
  } {
    return {
      total: this.pool.totalCount,
      idle: this.pool.idleCount,
      waiting: this.pool.waitingCount,
    };
  }
}

/**
 * Create connection pool instance
 */
export function createConnectionPool(config: DatabaseConfig): ConnectionPool {
  return new ConnectionPool(config);
}