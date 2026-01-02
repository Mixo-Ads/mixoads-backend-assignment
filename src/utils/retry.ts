import { logger } from './logger';

interface RetryOptions {
  maxAttempts: number;
  baseDelay: number;
  shouldRetry?: (error: any) => boolean;
  onRetry?: (attempt: number, error: any) => void;
}

/**
 * Execute a function with exponential backoff retry logic
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  const { maxAttempts, baseDelay, shouldRetry, onRetry } = options;
  let lastError: any;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // Check if we should retry this error
      const shouldRetryError = shouldRetry ? shouldRetry(error) : isRetryableError(error);

      if (!shouldRetryError || attempt >= maxAttempts) {
        throw error;
      }

      // Calculate delay with exponential backoff: baseDelay * 2^(attempt-1)
      const delay = baseDelay * Math.pow(2, attempt - 1);

      logger.warn(`Attempt ${attempt} failed, retrying in ${delay}ms...`, {
        error: error.message,
        attempt,
        maxAttempts,
      });

      if (onRetry) {
        onRetry(attempt, error);
      }

      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Determine if an error is retryable
 */
function isRetryableError(error: any): boolean {
  // Retry on network errors
  if (error.code === 'ECONNRESET' || error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
    return true;
  }

  // Retry on timeout errors
  if (error.message && error.message.includes('timeout')) {
    return true;
  }

  // Retry on 503 Service Unavailable
  if (error.status === 503 || error.statusCode === 503) {
    return true;
  }

  // Don't retry on client errors (4xx except 429)
  if (error.status >= 400 && error.status < 500 && error.status !== 429) {
    return false;
  }

  // Retry on 429 (rate limit) - will be handled separately
  if (error.status === 429 || error.statusCode === 429) {
    return true;
  }

  // Retry on server errors (5xx)
  if (error.status >= 500 || error.statusCode >= 500) {
    return true;
  }

  return false;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Wait for specified duration (used for rate limit retry-after)
 */
export async function wait(ms: number): Promise<void> {
  return sleep(ms);
}
