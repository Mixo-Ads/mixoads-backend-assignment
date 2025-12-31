/**
 * Rate limiter with sliding window algorithm
 * - Tracks requests in a sliding time window
 * - Queues requests when limit is reached
 * - Respects retry-after headers
 */

import { RateLimitConfig, RateLimitInfo } from './types';
import { RateLimitState, QueuedRequest } from '../types';
import { logger } from '../utils/Logger';
import { generateId } from '../utils/helpers';

/**
 * Rate Limiter class
 */
export class RateLimiter {
  private state: RateLimitState = {
    requests: [],
    queue: [],
  };
  private processing = false;

  constructor(private config: RateLimitConfig) {}

  /**
   * Execute function with rate limiting
   */
  public async execute<T>(
    fn: () => Promise<T>,
    priority = 0
  ): Promise<T> {
    // Check if we can execute immediately
    if (this.canMakeRequest()) {
      this.recordRequest();
      return fn();
    }

    // Queue the request
    return this.queueRequest(fn, priority);
  }

  /**
   * Check if we can make a request now
   */
  public canMakeRequest(): boolean {
    this.cleanOldRequests();
    return this.state.requests.length < this.config.maxRequests;
  }

  /**
   * Get rate limit info
   */
  public getInfo(): RateLimitInfo {
    this.cleanOldRequests();
    
    const remaining = Math.max(
      0,
      this.config.maxRequests - this.state.requests.length
    );
    
    // Calculate when the oldest request will expire
    const oldestRequest = this.state.requests[0] || Date.now();
    const resetAt = oldestRequest + this.config.windowMs;
    
    return {
      remaining,
      resetAt,
      total: this.config.maxRequests,
    };
  }

  /**
   * Get queue length
   */
  public getQueueLength(): number {
    return this.state.queue.length;
  }

  /**
   * Wait for rate limit to reset
   */
  public async waitForReset(): Promise<void> {
    const info = this.getInfo();
    
    if (info.remaining > 0) {
      return;
    }

    const waitTime = Math.max(0, info.resetAt - Date.now());
    
    if (waitTime > 0) {
      logger.debug(`Waiting ${waitTime}ms for rate limit reset`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  /**
   * Clear the rate limiter state
   */
  public clear(): void {
    this.state.requests = [];
    this.state.queue = [];
    this.processing = false;
  }

  /**
   * Record a request
   */
  private recordRequest(): void {
    this.state.requests.push(Date.now());
  }

  /**
   * Clean old requests outside the window
   */
  private cleanOldRequests(): void {
    const now = Date.now();
    const cutoff = now - this.config.windowMs;
    
    this.state.requests = this.state.requests.filter(
      timestamp => timestamp > cutoff
    );
  }

  /**
   * Queue a request
   */
  private queueRequest<T>(
    fn: () => Promise<T>,
    priority: number
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const request: QueuedRequest = {
        id: generateId('req'),
        execute: fn as () => Promise<unknown>,
        resolve: resolve as (value: unknown) => void,
        reject,
        priority,
        timestamp: Date.now(),
      };

      this.state.queue.push(request);
      this.state.queue.sort((a, b) => {
        // Sort by priority (higher first), then timestamp (older first)
        if (a.priority !== b.priority) {
          return b.priority - a.priority;
        }
        return a.timestamp - b.timestamp;
      });

      logger.debug(`Request queued`, {
        requestId: request.id,
        queueLength: this.state.queue.length,
        priority,
      });

      // Start processing queue if not already processing
      if (!this.processing) {
        this.processQueue();
      }
    });
  }

  /**
   * Process the request queue
   */
  private async processQueue(): Promise<void> {
    if (this.processing) {
      return;
    }

    this.processing = true;

    while (this.state.queue.length > 0) {
      // Wait if rate limit reached
      if (!this.canMakeRequest()) {
        await this.waitForReset();
      }

      // Get next request from queue
      const request = this.state.queue.shift();
      
      if (!request) {
        break;
      }

      // Record request and execute
      this.recordRequest();

      try {
        logger.debug(`Processing queued request`, {
          requestId: request.id,
          remainingQueue: this.state.queue.length,
        });

        const result = await request.execute();
        request.resolve(result);
      } catch (error) {
        request.reject(error as Error);
      }
    }

    this.processing = false;
  }
}

/**
 * Create rate limiter instance
 */
export function createRateLimiter(config: RateLimitConfig): RateLimiter {
  return new RateLimiter(config);
}