/**
 * Core type definitions for the campaign sync system
 */

// ============================================================================
// Campaign Types
// ============================================================================

export interface Campaign {
  id: string;
  name: string;
  status: 'active' | 'paused' | 'completed';
  budget: number;
  impressions: number;
  clicks: number;
  conversions: number;
  created_at: string;
}

export interface CampaignSyncData extends Campaign {
  synced_at?: Date;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface AuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    per_page: number;
    total: number;
    has_more: boolean;
  };
}

export interface SyncResponse {
  success: boolean;
  campaign_id: string;
  synced_at: string;
  message?: string;
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

// ============================================================================
// Token Types
// ============================================================================

export interface Token {
  access_token: string;
  token_type: string;
  expires_in: number;
  issued_at: number; // Unix timestamp in seconds
}

export interface TokenState {
  token: Token | null;
  isRefreshing: boolean;
  refreshPromise: Promise<Token> | null;
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface Config {
  api: {
    baseUrl: string;
    email: string;
    password: string;
    fetchTimeout: number;
    syncTimeout: number;
  };
  sync: {
    maxConcurrent: number;
    pageSize: number;
  };
  retry: {
    maxAttempts: number;
    baseDelay: number;
    jitter: number;
    maxDelay: number;
  };
  rateLimit: {
    maxRequests: number;
    windowMs: number;
  };
  database: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    max: number;
    idleTimeoutMillis: number;
    connectionTimeoutMillis: number;
  };
  logging: {
    level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
    format: 'text' | 'json';
  };
}

// ============================================================================
// Error Types
// ============================================================================

export enum ErrorCode {
  // Authentication errors
  AUTH_FAILED = 'AUTH_FAILED',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  
  // API errors
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  TIMEOUT = 'TIMEOUT',
  NETWORK_ERROR = 'NETWORK_ERROR',
  API_ERROR = 'API_ERROR',
  
  // Database errors
  DATABASE_ERROR = 'DATABASE_ERROR',
  CONNECTION_ERROR = 'CONNECTION_ERROR',
  QUERY_ERROR = 'QUERY_ERROR',
  
  // Sync errors
  SYNC_FAILED = 'SYNC_FAILED',
  FETCH_FAILED = 'FETCH_FAILED',
  MAX_RETRIES_EXCEEDED = 'MAX_RETRIES_EXCEEDED',
  
  // Validation errors
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  CONFIG_ERROR = 'CONFIG_ERROR'
}

export interface ErrorDetails {
  code: ErrorCode;
  message: string;
  statusCode?: number;
  retryAfter?: number;
  originalError?: Error;
  context?: Record<string, unknown>;
}

// ============================================================================
// Retry Types
// ============================================================================

export interface RetryOptions {
  maxAttempts: number;
  baseDelay: number;
  jitter: number;
  maxDelay: number;
  retryableErrors: ErrorCode[];
}

export interface RetryContext {
  attempt: number;
  maxAttempts: number;
  lastError: Error;
  nextDelay: number;
}

// ============================================================================
// Rate Limiting Types
// ============================================================================

export interface RateLimitState {
  requests: number[];
  queue: QueuedRequest[];
}

export interface QueuedRequest {
  id: string;
  execute: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  priority: number;
  timestamp: number;
}

// ============================================================================
// Sync Types
// ============================================================================

export interface SyncJob {
  campaign: Campaign;
  retryCount: number;
  lastError?: Error;
}

export interface SyncResult {
  campaignId: string;
  success: boolean;
  error?: Error;
  retries: number;
  duration: number;
}

export interface SyncReport {
  startTime: Date;
  endTime: Date;
  duration: number;
  totalCampaigns: number;
  successCount: number;
  failureCount: number;
  retryCount: number;
  results: SyncResult[];
  failures: Array<{
    campaignId: string;
    error: string;
  }>;
}

// ============================================================================
// Logging Types
// ============================================================================

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR'
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
}

// ============================================================================
// Queue Types
// ============================================================================

export interface QueueTask<T> {
  id: string;
  execute: () => Promise<T>;
  priority: number;
}

export interface QueueStats {
  pending: number;
  active: number;
  completed: number;
  failed: number;
}