/**
 * Database module type definitions
 */

import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { Campaign, CampaignSyncData } from '../types';

/**
 * Database configuration
 */
export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  max: number;
  idleTimeoutMillis: number;
  connectionTimeoutMillis: number;
}

/**
 * Campaign repository interface
 */
export interface ICampaignRepository {
  saveCampaign(campaign: Campaign): Promise<void>;
  saveCampaigns(campaigns: Campaign[]): Promise<void>;
  getCampaign(id: string): Promise<CampaignSyncData | null>;
  getAllCampaigns(): Promise<CampaignSyncData[]>;
  deleteCampaign(id: string): Promise<void>;
  clearAll(): Promise<void>;
  getCampaignCount(): Promise<number>;
}

/**
 * Database connection pool interface
 */
export interface IConnectionPool {
  getPool(): Pool;
  query<T extends QueryResultRow = any>(text: string, params?: unknown[]): Promise<QueryResult<T>>;
  getClient(): Promise<PoolClient>;
  close(): Promise<void>;
  isConnected(): Promise<boolean>;
}