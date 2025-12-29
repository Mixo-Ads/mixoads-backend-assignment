export async function retry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delayMs = 1000
): Promise<T> {
  let attempt = 0;
  let delay = delayMs;

  while (true) {
    try {
      return await fn();
    } catch (err) {
      attempt++;

      if (attempt > retries) {
        throw err;
      }

      await new Promise(res => setTimeout(res, delay));
      delay *= 2;
    }
  }
}
