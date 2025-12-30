import fetch from "node-fetch";

export async function fetchWithTimeout(
  url: string,
  options: any = {},
  timeoutMs = 5000
) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });

    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("retry-after") || 60);
      await new Promise((res) => setTimeout(res, retryAfter * 1000));
      throw new Error("Rate limited");
    }

    return response;
  } catch (error: any) {
    if (error.name === "AbortError") {
      throw new Error("Request timeout");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
