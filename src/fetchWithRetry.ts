
interface RateLimitResponse {
  retry_after?: number;
}

export async function fetchWithRetry(
  url: string,
  options: any,
  retries = 3,
  timeout = 5000
) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);

    try {
      const res = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      if (res.status === 429) {
        const body = (await res.json().catch(() => ({}))) as RateLimitResponse;
        const waitTime = (body.retry_after || 60) * 1000;

        console.warn(`Rate limited. Waiting ${waitTime / 1000}s`);
        await new Promise(r => setTimeout(r, waitTime));
        throw new Error('RETRY_429');
      }

      if (res.status >= 500) {
        throw new Error(`RETRY_${res.status}`);
      }

      if (!res.ok) {
        throw new Error(`FAILED_${res.status}`);
      }

      return res.json();
    } catch (err) {
      if (attempt === retries) throw err;
    } finally {
      clearTimeout(id);
    }
  }
}