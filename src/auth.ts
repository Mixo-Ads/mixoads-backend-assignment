import fetch from 'node-fetch';
import { config } from './config';

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  issued_at: number;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * Get an access token from the API, using cached token if still valid
 */
export async function getAccessToken(): Promise<string> {
  // Check if we have a valid cached token
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  const authString = Buffer.from(`${config.api.email}:${config.api.password}`).toString('base64');

  let response: any;
  try {
    response = await fetch(`${config.api.baseUrl}/auth/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authString}`,
      },
    });
  } catch (error: any) {
    // Handle connection errors (e.g., server not running)
    if (error.code === 'ECONNREFUSED' || error.message?.includes('ECONNREFUSED')) {
      throw new Error(
        `Cannot connect to API server at ${config.api.baseUrl}. ` +
        `Please ensure the mock API is running. Start it with: cd mock-api && npm start`
      );
    }
    throw new Error(`Failed to connect to API: ${error.message || error}`);
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to get access token: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const data: TokenResponse = await response.json();
  
  // Cache the token with a 5-minute buffer before expiry
  const bufferTime = 5 * 60 * 1000; // 5 minutes
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in * 1000) - bufferTime,
  };

  return data.access_token;
}

/**
 * Clear the cached token (useful for testing or forced refresh)
 */
export function clearTokenCache(): void {
  cachedToken = null;
}

