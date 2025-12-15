import fetch from 'node-fetch';
import { fetchWithTimeoutAndRetry } from './httpClient';


const API_BASE_URL = process.env.AD_PLATFORM_API_URL || 'http://localhost:3001';

let cachedToken: string | null = null;
let tokenExpiresAt: number | null = null; // epoch ms

export async function getAccessToken(): Promise<string> {
  const email = process.env.AD_PLATFORM_EMAIL;
  const password = process.env.AD_PLATFORM_PASSWORD;

  if (!email || !password) {
    throw new Error('AD_PLATFORM_EMAIL and AD_PLATFORM_PASSWORD must be set in environment variables');
  }


  if (cachedToken && tokenExpiresAt && Date.now() < tokenExpiresAt - 60_000) {
    return cachedToken;
  }

  const authString = Buffer.from(`${email}:${password}`).toString('base64');
  console.log('Requesting new access token...');

  const response = await fetchWithTimeoutAndRetry(
    `${API_BASE_URL}/auth/token`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${authString}`
      }
    },
    { timeoutMs: 5000, maxRetries: 3, baseDelayMs: 500 }
  );

  if (!response.ok) {
    throw new Error(`Auth API returned ${response.status}: ${response.statusText}`);
  }

  const data: any = await response.json();
  cachedToken = data.access_token;
  const expiresInSec = data.expires_in || 3600;
  tokenExpiresAt = Date.now() + expiresInSec * 1000;

  console.log('Access token acquired successfully');
  return cachedToken!;
}
