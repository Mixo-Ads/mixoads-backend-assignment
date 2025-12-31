/**
 * Custom error classes for typed error handling throughout the application
 */

import { ErrorCode, ErrorDetails } from '../types';

/**
 * Base error class for all application errors
 */
export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode?: number;
  public readonly retryAfter?: number;
  public readonly originalError?: Error;
  public readonly context?: Record<string, unknown>;
  public readonly isRetryable: boolean;

  constructor(details: ErrorDetails, isRetryable = false) {
    super(details.message);
    this.name = 'AppError';
    this.code = details.code;
    this.statusCode = details.statusCode;
    this.retryAfter = details.retryAfter;
    this.originalError = details.originalError;
    this.context = details.context;
    this.isRetryable = isRetryable;

    // Maintains proper stack trace for where our error was thrown
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      retryAfter: this.retryAfter,
      isRetryable: this.isRetryable,
      context: this.context,
      stack: this.stack
    };
  }
}

/**
 * Authentication related errors
 */
export class AuthError extends AppError {
  constructor(message: string, originalError?: Error) {
    super(
      {
        code: ErrorCode.AUTH_FAILED,
        message,
        statusCode: 401,
        originalError,
      },
      true // Auth errors are retryable
    );
    this.name = 'AuthError';
  }
}

/**
 * Token expiry error
 */
export class TokenExpiredError extends AppError {
  constructor(message = 'Authentication token has expired') {
    super(
      {
        code: ErrorCode.TOKEN_EXPIRED,
        message,
        statusCode: 401,
      },
      true
    );
    this.name = 'TokenExpiredError';
  }
}

/**
 * Rate limiting error
 */
export class RateLimitError extends AppError {
  constructor(retryAfter: number, message = 'Rate limit exceeded') {
    super(
      {
        code: ErrorCode.RATE_LIMIT_EXCEEDED,
        message,
        statusCode: 429,
        retryAfter,
      },
      true
    );
    this.name = 'RateLimitError';
  }
}

/**
 * Service unavailable error (503)
 */
export class ServiceUnavailableError extends AppError {
  constructor(message = 'Service temporarily unavailable', retryAfter?: number) {
    super(
      {
        code: ErrorCode.SERVICE_UNAVAILABLE,
        message,
        statusCode: 503,
        retryAfter,
      },
      true
    );
    this.name = 'ServiceUnavailableError';
  }
}

/**
 * Request timeout error
 */
export class TimeoutError extends AppError {
  constructor(message = 'Request timeout', context?: Record<string, unknown>) {
    super(
      {
        code: ErrorCode.TIMEOUT,
        message,
        context,
      },
      true
    );
    this.name = 'TimeoutError';
  }
}

/**
 * Network error
 */
export class NetworkError extends AppError {
  constructor(message: string, originalError?: Error) {
    super(
      {
        code: ErrorCode.NETWORK_ERROR,
        message,
        originalError,
      },
      true
    );
    this.name = 'NetworkError';
  }
}

/**
 * Generic API error
 */
export class ApiError extends AppError {
  constructor(
    message: string,
    statusCode?: number,
    originalError?: Error,
    context?: Record<string, unknown>
  ) {
    super(
      {
        code: ErrorCode.API_ERROR,
        message,
        statusCode,
        originalError,
        context,
      },
      false // Generic API errors are not retryable by default
    );
    this.name = 'ApiError';
  }
}

/**
 * Database related errors
 */
export class DatabaseError extends AppError {
  constructor(message: string, originalError?: Error) {
    super(
      {
        code: ErrorCode.DATABASE_ERROR,
        message,
        originalError,
      },
      false
    );
    this.name = 'DatabaseError';
  }
}

/**
 * Sync operation errors
 */
export class SyncError extends AppError {
  constructor(
    campaignId: string,
    message: string,
    originalError?: Error,
    isRetryable = false
  ) {
    super(
      {
        code: ErrorCode.SYNC_FAILED,
        message,
        originalError,
        context: { campaignId },
      },
      isRetryable
    );
    this.name = 'SyncError';
  }
}

/**
 * Max retries exceeded error
 */
export class MaxRetriesExceededError extends AppError {
  constructor(message: string, attempts: number, lastError?: Error) {
    super(
      {
        code: ErrorCode.MAX_RETRIES_EXCEEDED,
        message,
        originalError: lastError,
        context: { attempts },
      },
      false
    );
    this.name = 'MaxRetriesExceededError';
  }
}

/**
 * Configuration validation error
 */
export class ConfigError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(
      {
        code: ErrorCode.CONFIG_ERROR,
        message,
        context,
      },
      false
    );
    this.name = 'ConfigError';
  }
}

/**
 * Validation error
 */
export class ValidationError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(
      {
        code: ErrorCode.VALIDATION_ERROR,
        message,
        context,
      },
      false
    );
    this.name = 'ValidationError';
  }
}

/**
 * Type guard to check if error is retryable
 */
export function isRetryableError(error: Error): boolean {
  if (error instanceof AppError) {
    return error.isRetryable;
  }
  
  // Network errors are generally retryable
  if (error.message.includes('ECONNREFUSED') || 
      error.message.includes('ENOTFOUND') ||
      error.message.includes('ETIMEDOUT')) {
    return true;
  }
  
  return false;
}

/**
 * Extract retry-after value from error
 */
export function getRetryAfter(error: Error): number | undefined {
  if (error instanceof AppError) {
    return error.retryAfter;
  }
  return undefined;
}

/**
 * Check if error is a specific type
 */
export function isErrorCode(error: Error, code: ErrorCode): boolean {
  return error instanceof AppError && error.code === code;
}