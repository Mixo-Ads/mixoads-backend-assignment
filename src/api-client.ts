import fetch, { RequestInit, Response } from 'node-fetch';

export interface ApiClientConfig {
  baseUrl: string;
  accessToken: string;
  timeout?: number;
  retryConfig?: RetryConfig;
}

export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  retryableStatusCodes: number[];
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  retryableStatusCodes: [429, 503, 504]
};

const DEFAULT_TIMEOUT = 10000; // 10 seconds

/**
 * Sleeps for the specified number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculates exponential backoff delay with jitter
 */
function calculateBackoffDelay(attempt: number, initialDelay: number, maxDelay: number, retryAfter?: number): number {
  if (retryAfter) {
    return Math.min(retryAfter * 1000, maxDelay);
  }
  
  const exponentialDelay = initialDelay * Math.pow(2, attempt);
  const jitter = Math.random() * 0.3 * exponentialDelay; // Add 0-30% jitter
  return Math.min(exponentialDelay + jitter, maxDelay);
}

/**
 * Fetches with timeout support (compatible with node-fetch v2)
 */
async function fetchWithTimeout(url: string, options: RequestInit, timeout: number): Promise<Response> {
  return Promise.race([
    fetch(url, options),
    new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('Request timeout')), timeout)
    )
  ]);
}

/**
 * API Client with rate limiting, retries, and error handling
 */
export class ApiClient {
  private config: ApiClientConfig;
  private retryConfig: RetryConfig;

  constructor(config: ApiClientConfig) {
    this.config = {
      ...config,
      timeout: config.timeout || DEFAULT_TIMEOUT
    };
    this.retryConfig = config.retryConfig || DEFAULT_RETRY_CONFIG;
  }

  /**
   * Updates the access token
   */
  updateToken(token: string): void {
    this.config.accessToken = token;
  }

  /**
   * Makes an API request with automatic retry logic, rate limiting, and error handling
   */
  async request(endpoint: string, options: RequestInit = {}): Promise<Response> {
    const url = `${this.config.baseUrl}${endpoint}`;
    const timeout = this.config.timeout!;
    
    const requestOptions: RequestInit = {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${this.config.accessToken}`,
        'Content-Type': 'application/json'
      }
    };

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        const response = await fetchWithTimeout(url, requestOptions, timeout);

        // Handle rate limiting (429)
        if (response.status === 429) {
          const retryAfter = response.headers.get('retry-after');
          const retryAfterSeconds = retryAfter ? parseInt(retryAfter, 10) : 60;
          
          if (attempt < this.retryConfig.maxRetries) {
            const delay = retryAfterSeconds * 1000;
            console.log(`   Rate limit exceeded. Waiting ${retryAfterSeconds} seconds before retry...`);
            await sleep(delay);
            continue;
          } else {
            throw new Error(`Rate limit exceeded after ${this.retryConfig.maxRetries} retries`);
          }
        }

        // Handle retryable errors (503, 504, etc.)
        if (this.retryConfig.retryableStatusCodes.includes(response.status)) {
          if (attempt < this.retryConfig.maxRetries) {
            const delay = calculateBackoffDelay(
              attempt,
              this.retryConfig.initialDelayMs,
              this.retryConfig.maxDelayMs
            );
            console.log(`   Server error ${response.status}. Retrying in ${Math.round(delay / 1000)}s...`);
            await sleep(delay);
            continue;
          } else {
            throw new Error(`Server error ${response.status} after ${this.retryConfig.maxRetries} retries`);
          }
        }

        // Handle non-retryable client errors
        if (!response.ok && response.status < 500) {
          const errorText = await response.text().catch(() => 'Unknown error');
          throw new Error(`API error ${response.status}: ${errorText}`);
        }

        return response;

      } catch (error: any) {
        lastError = error;

        // Don't retry on timeout or non-retryable errors
        if (error.message === 'Request timeout' || !this.shouldRetry(error, attempt)) {
          throw error;
        }

        // Calculate backoff delay for retries
        if (attempt < this.retryConfig.maxRetries) {
          const delay = calculateBackoffDelay(
            attempt,
            this.retryConfig.initialDelayMs,
            this.retryConfig.maxDelayMs
          );
          console.log(`   Request failed: ${error.message}. Retrying in ${Math.round(delay / 1000)}s...`);
          await sleep(delay);
        }
      }
    }

    throw lastError || new Error('Request failed after all retries');
  }

  /**
   * Determines if an error should be retried
   */
  private shouldRetry(error: Error, attempt: number): boolean {
    if (attempt >= this.retryConfig.maxRetries) {
      return false;
    }

    // Retry on network errors, timeouts, etc.
    if (error.message.includes('timeout') || 
        error.message.includes('ECONNREFUSED') ||
        error.message.includes('ENOTFOUND')) {
      return true;
    }

    return false;
  }
}

