import fetch from 'node-fetch';
import { setTimeout as sleep } from 'timers/promises';


const MAX_REQUESTS_PER_MINUTE = 10;
const WINDOW_MS = 60_000;
const requestTimestamps: number[] = [];

function enforceClientRateLimit() {
  const now = Date.now();
  while (requestTimestamps.length && now - requestTimestamps[0] > WINDOW_MS) {
    requestTimestamps.shift();
  }
  if (requestTimestamps.length >= MAX_REQUESTS_PER_MINUTE) {
    const waitMs = WINDOW_MS - (now - requestTimestamps[0]);
    return sleep(waitMs);
  }
  requestTimestamps.push(now);
  return Promise.resolve();
}


export async function fetchWithTimeout(
  url: string,
  options: any,
  timeoutMs = 5000
) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Request timeout');
    }
    throw error;
  }
}


export interface RetryOptions {
  timeoutMs?: number;
  maxRetries?: number;
  baseDelayMs?: number;
}

export async function fetchWithTimeoutAndRetry(
  url: string,
  options: any,
  retryOptions: RetryOptions = {}
) {
  const {
    timeoutMs = 5000,
    maxRetries = 5,
    baseDelayMs = 500
  } = retryOptions;

  let attempt = 0;

  while (true) {
    await enforceClientRateLimit();

    try {
      const response = await fetchWithTimeout(url, options, timeoutMs);


      if (response.status === 429) {
        const retryAfterHeader = response.headers.get('retry_after') || response.headers.get('retry-after');
        const retryAfterSec = retryAfterHeader ? parseInt(retryAfterHeader, 10) : 60;
        const delayMs = retryAfterSec * 1000;
        console.warn(`Received 429. Waiting ${delayMs}ms before retrying...`);
        await sleep(delayMs);
        attempt++;
        if (attempt > maxRetries) {
          return response; 
        }
        continue;
      }

     
      if (response.status >= 500 && response.status < 600 && attempt < maxRetries) {
        const backoff = baseDelayMs * Math.pow(2, attempt);
        console.warn(`HTTP ${response.status} from ${url}. Retrying in ${backoff}ms (attempt ${attempt + 1}/${maxRetries})...`);
        await sleep(backoff);
        attempt++;
        continue;
      }

      return response;
    } catch (error: any) {
    
      if (attempt >= maxRetries) {
        console.error(`Failed request to ${url} after ${attempt + 1} attempts:`, error.message);
        throw error;
      }
      const backoff = baseDelayMs * Math.pow(2, attempt);
      console.warn(`Error calling ${url}: ${error.message}. Retrying in ${backoff}ms (attempt ${attempt + 1}/${maxRetries})...`);
      await sleep(backoff);
      attempt++;
    }
  }
}
