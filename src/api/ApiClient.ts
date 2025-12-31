

import { ITokenManager } from '../auth/types';
import { RateLimiter } from './RateLimiter';
import { RequestOptions } from './types';
import {
  ApiError,
  RateLimitError,
  ServiceUnavailableError,
  TimeoutError,
  NetworkError,
  TokenExpiredError,
} from '../utils/ErrorHandler';
import { logger } from '../utils/Logger';
import { withRetry } from '../utils/RetryStrategy';
import { timeout as timeoutPromise } from '../utils/helpers';


export class ApiClient {
  constructor(
    private baseUrl: string,
    private tokenManager: ITokenManager,
    private rateLimiter: RateLimiter,
    private defaultTimeout = 5000,
    private fetchFn: typeof fetch = fetch
  ) {}

 
  public async get<T>(
    path: string,
    options: Partial<RequestOptions> = {}
  ): Promise<T> {
    return this.request<T>(path, {
      ...options,
      method: 'GET',
    });
  }


  public async post<T>(
    path: string,
    body?: unknown,
    options: Partial<RequestOptions> = {}
  ): Promise<T> {
    return this.request<T>(path, {
      ...options,
      method: 'POST',
      body,
    });
  }

  
  public async put<T>(
    path: string,
    body?: unknown,
    options: Partial<RequestOptions> = {}
  ): Promise<T> {
    return this.request<T>(path, {
      ...options,
      method: 'PUT',
      body,
    });
  }

 
  public async delete<T>(
    path: string,
    options: Partial<RequestOptions> = {}
  ): Promise<T> {
    return this.request<T>(path, {
      ...options,
      method: 'DELETE',
    });
  }


  private async request<T>(
    path: string,
    options: Partial<RequestOptions> = {}
  ): Promise<T> {
    const requestTimeout = options.timeout || this.defaultTimeout;
    const url = `${this.baseUrl}${path}`;

    
    return withRetry(
      async () => {
        // Execute with rate limiting
        return this.rateLimiter.execute(async () => {
          // Make the actual HTTP request
          return this.executeRequest<T>(url, options, requestTimeout);
        });
      },
      {
        maxAttempts: 5,
        baseDelay: 1000,
        jitter: 250,
        maxDelay: 16000,
        retryableErrors: [],
      },
      { url, method: options.method || 'GET' }
    );
  }

  /**
   * Execute HTTP request
   */
  private async executeRequest<T>(
    url: string,
    options: Partial<RequestOptions>,
    requestTimeout: number
  ): Promise<T> {
    try {
      // Get fresh token
      const token = await this.tokenManager.getToken();

      // Build headers
      const headers: Record<string, string> = {
        'Authorization': `${token.token_type} ${token.access_token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      };

      // Build request init
      const init: RequestInit = {
        method: options.method || 'GET',
        headers,
      };

      if (options.body) {
        init.body = JSON.stringify(options.body);
      }

      // Make request with timeout
      const startTime = Date.now();
      
      logger.debug(`Making request`, {
        url,
        method: init.method,
      });

      const response = await timeoutPromise(
        this.fetchFn(url, init),
        requestTimeout,
        `Request timeout after ${requestTimeout}ms`
      );

      const duration = Date.now() - startTime;

      // Handle response
      return this.handleResponse<T>(response, url, duration);
    } catch (error) {
      // Transform errors
      if (error instanceof Error) {
        if (error.message.includes('timeout')) {
          throw new TimeoutError(error.message, { url });
        }

        if (
          error.message.includes('fetch failed') ||
          error.message.includes('network')
        ) {
          throw new NetworkError(`Network error: ${error.message}`, error);
        }
      }

      throw error;
    }
  }

  /**
   * Handle HTTP response
   */
  private async handleResponse<T>(
    response: Response,
    url: string,
    duration: number
  ): Promise<T> {
    const { status, statusText } = response;

    logger.debug(`Response received`, {
      url,
      status,
      duration: `${duration}ms`,
    });

    // Handle success
    if (response.ok) {
      try {
        const data = await response.json();
        return data as T;
      } catch (error) {
        throw new ApiError(
          `Failed to parse response: ${(error as Error).message}`,
          status,
          error as Error
        );
      }
    }

    // Handle errors
    const errorBody = await this.getErrorBody(response);

    // 401 Unauthorized - Token expired
    if (status === 401) {
      logger.warn('Received 401, token may be expired');
      throw new TokenExpiredError('Authentication token expired');
    }

    // 429 Rate Limit
    if (status === 429) {
      const retryAfter = this.getRetryAfter(response);
      logger.warn(`Rate limit exceeded`, { retryAfter });
      throw new RateLimitError(retryAfter, errorBody || 'Rate limit exceeded');
    }

    // 503 Service Unavailable
    if (status === 503) {
      const retryAfter = this.getRetryAfter(response);
      logger.warn(`Service unavailable`, { retryAfter });
      throw new ServiceUnavailableError(
        errorBody || 'Service temporarily unavailable',
        retryAfter
      );
    }

    // Other errors
    throw new ApiError(
      errorBody || `HTTP ${status}: ${statusText}`,
      status,
      undefined,
      { url, status }
    );
  }

  /**
   * Get error message from response body
   */
  private async getErrorBody(response: Response): Promise<string> {
    try {
      const contentType = response.headers.get('content-type');
      
      if (contentType?.includes('application/json')) {
        const json = await response.json() as Record<string, any>;
        return json.error?.message || json.message || JSON.stringify(json);
      }
      
      return await response.text();
    } catch {
      return response.statusText;
    }
  }

 
  private getRetryAfter(response: Response): number {
    const retryAfter = response.headers.get('retry-after');
    
    if (!retryAfter) {
      return 60; 
    }

    
    const seconds = parseInt(retryAfter, 10);
    if (!isNaN(seconds)) {
      return seconds;
    }

    
    try {
      const date = new Date(retryAfter);
      const secondsUntil = Math.max(0, date.getTime() - Date.now()) / 1000;
      return Math.ceil(secondsUntil);
    } catch {
      return 60; 
    }
  }
}


export function createApiClient(
  baseUrl: string,
  tokenManager: ITokenManager,
  rateLimiter: RateLimiter,
  defaultTimeout?: number
): ApiClient {
  return new ApiClient(
    baseUrl,
    tokenManager,
    rateLimiter,
    defaultTimeout
  );
}