// src/utils/retry.ts
export async function exponentialBackoff<T>(
    fn: () => Promise<T>,
    { retries = 3, baseDelay = 300 } = {}
  ): Promise<T> {
    let attempt = 0;
  
    while (true) {
      try {
        return await fn();
    } catch (err: any) {
        // ✔ Do NOT consume a retry attempt for 429 rate limit
        if (err && err.rateLimit) {
          // just continue loop without incrementing attempt
          continue;
        }
    
        // normal error → consume a retry attempt
        attempt++;
        if (attempt > retries) throw err;
    
        const wait = baseDelay * Math.pow(2, attempt);
        console.log(`Retrying in ${wait}ms... (attempt ${attempt}/${retries})`);
        await new Promise((resolve) => setTimeout(resolve, wait));
    }
    
      
    }
  }
  