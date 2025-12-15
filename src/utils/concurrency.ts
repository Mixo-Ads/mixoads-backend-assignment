// src/utils/concurrency.ts
export function createConcurrencyPool(limit: number) {
    const queue: Promise<any>[] = [];
  
    async function run<T>(fn: () => Promise<T>): Promise<T> {
      while (queue.length >= limit) {
        await Promise.race(queue);
      }
  
      const job = fn();
      queue.push(job);
  
      job.finally(() => {
        const index = queue.indexOf(job);
        if (index !== -1) queue.splice(index, 1);
      });
  
      return job;
    }
  
    return { run };
  }
  