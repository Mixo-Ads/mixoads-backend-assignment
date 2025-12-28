import fetch, { RequestInit, Response } from 'node-fetch';

const DEFAULT_TIMEOUT = 10000;
const MAX_RETRIES = 15;
const BASE_DELAY = 1000;

interface FetchOptions extends RequestInit {
    timeout?: number;
    retries?: number;
}

export class APIError extends Error {
    public status: number;
    public statusText: string;

    constructor(status: number, statusText: string, message: string) {
        super(message);
        this.status = status;
        this.statusText = statusText;
    }
}

async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export async function fetchWithRetry(url: string, options: FetchOptions = {}): Promise<Response> {
    const { timeout = DEFAULT_TIMEOUT, retries = MAX_RETRIES, ...fetchOptions } = options;

    let attempt = 0;

    while (attempt <= retries) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
            const response = await fetch(url, {
                ...fetchOptions,
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (response.status === 429) {
                // Rate limited - 429s should be retried more aggressively
                // We'll increment attempt but allow more retries for 429 specific cases
                const retryAfter = response.headers.get('retry-after');
                let delay = BASE_DELAY * Math.pow(2, attempt);

                if (retryAfter) {
                    const seconds = parseInt(retryAfter, 10);
                    if (!isNaN(seconds)) {
                        delay = seconds * 1000;
                    }
                }

                // Add some jitter to avoid thundering herd
                delay = delay + Math.random() * 1000;

                // Cap delay at 1 minute
                if (delay > 60000) delay = 60000;

                console.warn(`Rate limit hit (Attempt ${attempt + 1}/${retries}). Retrying in ${Math.round(delay)}ms...`);
                await sleep(delay);

                // If we are strictly rate limited, we shouldn't burn through retries too fast.
                // But for this assignment, let's just not count 429s effectively against the limit, 
                // or just increase the limit significantly for 429s.
                // Let's simpler: just use a larger max retries for the function call generally, 
                // or just don't increment 'attempt' for 429s if we want infinite retries.
                // Ideally we should respect the server's wish for us to back off.
                // Let's reset the attempt counter mechanism for 429s or just loop.

                // However, to avoid infinite loops in broken systems:
                // We will count it, but maybe we need more than 3 retries.
                // Let's trust the Caller to pass a high enough retry count, 
                // OR we separate 'network retries' from 'rate limit retries'.
                // For now, let's just proceed with the backoff and increment.

                attempt++;
                continue;
            }

            if (response.status === 503) {
                // Service unavailable - usually transient
                const delay = BASE_DELAY * Math.pow(2, attempt); // Exponential backoff
                console.warn(`Service unavailable (503). Retrying in ${delay}ms...`);
                await sleep(delay);
                attempt++;
                continue;
            }

            if (!response.ok) {
                throw new APIError(response.status, response.statusText, `Request failed with status ${response.status}`);
            }

            return response;

        } catch (error: any) {
            clearTimeout(timeoutId);

            if (error.name === 'AbortError') {
                throw new Error(`Request timeout after ${timeout}ms`);
            }

            // If it's a network error (no response), retry
            if (attempt < retries && (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.message.includes('network'))) {
                const delay = BASE_DELAY * Math.pow(2, attempt);
                console.warn(`Network error: ${error.message}. Retrying in ${delay}ms...`);
                await sleep(delay);
                attempt++;
                continue;
            }

            throw error;
        }
    }

    throw new Error(`Failed after ${retries} retries`);
}
