/**
 * Concurrency queue for controlled parallel execution
 */

import { QueueTask, QueueStats } from '../types';
import { logger } from '../utils/Logger';
import { generateId } from '../utils/helpers';

/**
 * Concurrency Queue class
 */
export class ConcurrencyQueue<T> {
  private queue: Array<QueueTask<T>> = [];
  private active = 0;
  private stats: QueueStats = {
    pending: 0,
    active: 0,
    completed: 0,
    failed: 0,
  };

  constructor(private maxConcurrent: number) {
    if (maxConcurrent < 1) {
      throw new Error('maxConcurrent must be at least 1');
    }
  }

  /**
   * Add task to queue
   */
  public async add(
    task: () => Promise<T>,
    priority = 0
  ): Promise<T> {
    const queueTask: QueueTask<T> = {
      id: generateId('task'),
      execute: task,
      priority,
    };

    return new Promise((resolve, reject) => {
      const wrappedTask: QueueTask<T> = {
        ...queueTask,
        execute: async () => {
          try {
            const result = await queueTask.execute();
            this.stats.completed++;
            resolve(result);
            return result;
          } catch (error) {
            this.stats.failed++;
            reject(error);
            throw error;
          } finally {
            this.active--;
            this.stats.active = this.active;
            this.processNext();
          }
        },
      };

      this.queue.push(wrappedTask);
      this.sortQueue();
      this.stats.pending = this.queue.length;
      
      logger.debug('Task added to queue', {
        taskId: queueTask.id,
        queueLength: this.queue.length,
        active: this.active,
        priority,
      });

      this.processNext();
    });
  }

  /**
   * Add multiple tasks to queue
   */
  public async addAll(
    tasks: Array<() => Promise<T>>,
    priority = 0
  ): Promise<T[]> {
    return Promise.all(tasks.map(task => this.add(task, priority)));
  }

  /**
   * Process next task in queue
   */
  private processNext(): void {
    // Check if we can process more tasks
    if (this.active >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    // Get next task
    const task = this.queue.shift();
    
    if (!task) {
      return;
    }

    // Increment active count
    this.active++;
    this.stats.active = this.active;
    this.stats.pending = this.queue.length;

    logger.debug('Processing task', {
      taskId: task.id,
      active: this.active,
      remaining: this.queue.length,
    });

    // Execute task
    task.execute().catch(error => {
      logger.error('Task execution failed', error as Error, {
        taskId: task.id,
      });
    });

    // Process more tasks if possible
    this.processNext();
  }

  /**
   * Sort queue by priority (higher first)
   */
  private sortQueue(): void {
    this.queue.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Get queue statistics
   */
  public getStats(): QueueStats {
    return { ...this.stats };
  }

  /**
   * Get queue length
   */
  public getQueueLength(): number {
    return this.queue.length;
  }

  /**
   * Get active task count
   */
  public getActiveCount(): number {
    return this.active;
  }

  /**
   * Check if queue is idle (no tasks running or queued)
   */
  public isIdle(): boolean {
    return this.active === 0 && this.queue.length === 0;
  }

  /**
   * Wait for all tasks to complete
   */
  public async waitForIdle(): Promise<void> {
    while (!this.isIdle()) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  /**
   * Clear the queue
   */
  public clear(): void {
    this.queue = [];
    this.stats.pending = 0;
    logger.debug('Queue cleared');
  }
}

/**
 * Create concurrency queue instance
 */
export function createConcurrencyQueue<T>(
  maxConcurrent: number
): ConcurrencyQueue<T> {
  return new ConcurrencyQueue<T>(maxConcurrent);
}