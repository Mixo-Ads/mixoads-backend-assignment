/**
 * Retry strategy with exponential backoff and jitter
 */

import { RetryOptions, RetryContext, ErrorCode } from '../types';
import { 
  isRetryableError, 
  getRetryAfter, 
  MaxRetriesExceededError,
  isErrorCode 
} from './ErrorHandler';
import { logger } from './Logger';

/**
 * Default retry options
 */
const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 5,
  baseDelay: 1000,
  jitter: 250,
  maxDelay: 16000,
  retryableErrors: [
    ErrorCode.SERVICE_UNAVAILABLE,
    ErrorCode.TIMEOUT,
    ErrorCode.NETWORK_ERROR,
    ErrorCode.RATE_LIMIT_EXCEEDED,
    ErrorCode.TOKEN_EXPIRED,
  ],
};

/**
 * Calculate exponential backoff delay with jitter
 */
export function calculateDelay(
  attempt: number,
  baseDelay: number,
  jitter: number,
  maxDelay: number
): number {
  // Exponential backoff: baseDelay * (2 ^ attempt)
  const exponentialDelay = baseDelay * Math.pow(2, attempt);
  
  // Cap at maximum delay
  const cappedDelay = Math.min(exponentialDelay, maxDelay);
  
  // Add random jitter (±25% by default)
  const jitterAmount = Math.random() * jitter * 2 - jitter;
  const finalDelay = Math.max(0, cappedDelay + jitterAmount);
  
  return Math.round(finalDelay);
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Determine if error should be retried
 */
export function shouldRetry(
  error: Error,
  attempt: number,
  maxAttempts: number,
  retryableErrors: ErrorCode[]
): boolean {
  // Check if max attempts exceeded
  if (attempt >= maxAttempts) {
    return false;
  }
  
  // Check if error is retryable
  if (!isRetryableError(error)) {
    return false;
  }
  
  // Check if error code is in retryable list
  if ('code' in error && retryableErrors.length > 0) {
    const errorCode = (error as { code: ErrorCode }).code;
    return retryableErrors.includes(errorCode);
  }
  
  return true;
}

/**
 * Get retry delay for specific error
 */
export function getRetryDelay(
  error: Error,
  attempt: number,
  options: RetryOptions
): number {
  // Check for retry-after header (rate limiting)
  const retryAfter = getRetryAfter(error);
  if (retryAfter !== undefined) {
    // Convert retry-after (seconds) to milliseconds and add jitter
    const delayMs = retryAfter * 1000;
    const jitterAmount = Math.random() * options.jitter * 2 - options.jitter;
    return Math.round(delayMs + jitterAmount);
  }
  
  // For 503 errors, use exponential backoff
  if (isErrorCode(error, ErrorCode.SERVICE_UNAVAILABLE)) {
    return calculateDelay(attempt, options.baseDelay, options.jitter, options.maxDelay);
  }
  
  // For timeouts, use exponential backoff
  if (isErrorCode(error, ErrorCode.TIMEOUT)) {
    return calculateDelay(attempt, options.baseDelay, options.jitter, options.maxDelay);
  }
  
  // Default exponential backoff
  return calculateDelay(attempt, options.baseDelay, options.jitter, options.maxDelay);
}

/**
 * Retry function with exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {},
  context?: Record<string, unknown>
): Promise<T> {
  const opts: RetryOptions = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let attempt = 0;
  let lastError: Error;
  
  while (attempt < opts.maxAttempts) {
    try {
      // Attempt the operation
      const result = await fn();
      
      // Log retry success if this wasn't the first attempt
      if (attempt > 0) {
        logger.info(`Operation succeeded after ${attempt} retries`, context);
      }
      
      return result;
    } catch (error) {
      lastError = error as Error;
      attempt++;
      
      // Check if we should retry
      if (!shouldRetry(lastError, attempt, opts.maxAttempts, opts.retryableErrors)) {
        logger.debug('Error not retryable or max attempts reached', {
          ...context,
          attempt,
          maxAttempts: opts.maxAttempts,
          errorMessage: lastError.message,
        });
        throw lastError;
      }
      
      // Calculate delay
      const delay = getRetryDelay(lastError, attempt - 1, opts);
      
      // Log retry attempt
      logger.warn(`Retry attempt ${attempt}/${opts.maxAttempts} after ${delay}ms`, {
        ...context,
        errorMessage: lastError.message,
        errorCode: 'code' in lastError ? (lastError as { code: ErrorCode }).code : undefined,
        delay,
      });
      
      // Wait before retrying
      await sleep(delay);
    }
  }
  
  // Max retries exceeded
  throw new MaxRetriesExceededError(
    `Operation failed after ${opts.maxAttempts} attempts`,
    opts.maxAttempts,
    lastError!
  );
}

/**
 * Create a retry context for manual retry handling
 */
export function createRetryContext(
  maxAttempts: number,
  lastError: Error
): RetryContext {
  return {
    attempt: 0,
    maxAttempts,
    lastError,
    nextDelay: 0,
  };
}

/**
 * Update retry context for next attempt
 */
export function updateRetryContext(
  context: RetryContext,
  error: Error,
  options: RetryOptions
): RetryContext {
  const nextAttempt = context.attempt + 1;
  const nextDelay = getRetryDelay(error, nextAttempt, options);
  
  return {
    attempt: nextAttempt,
    maxAttempts: context.maxAttempts,
    lastError: error,
    nextDelay,
  };
}

/**
 * Check if retry context should continue
 */
export function shouldContinueRetry(
  context: RetryContext,
  retryableErrors: ErrorCode[]
): boolean {
  return shouldRetry(
    context.lastError,
    context.attempt,
    context.maxAttempts,
    retryableErrors
  );
}