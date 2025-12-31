/**
 * Sync module type definitions
 */

import { Campaign } from '../types';

/**
 * Sync worker dependencies
 */
export interface SyncWorkerDependencies {
  syncCampaignFn: (campaignId: string) => Promise<void>;
  saveCampaignFn: (campaign: Campaign) => Promise<void>;
}

/**
 * Sync orchestrator dependencies
 */
export interface SyncOrchestratorDependencies {
  fetchAllCampaignsFn: () => Promise<Campaign[]>;
  syncCampaignFn: (campaignId: string) => Promise<void>;
  saveCampaignFn: (campaign: Campaign) => Promise<void>;
  maxConcurrent: number;
}

/**
 * Sync progress callback
 */
export type SyncProgressCallback = (progress: {
  completed: number;
  total: number;
  current?: Campaign;
  success: number;
  failed: number;
}) => void;