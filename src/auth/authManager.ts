import fetch from 'node-fetch';
import { config } from '../config';
import { logger } from '../utils/logger';
import { retryWithBackoff } from '../utils/retry';

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  issued_at: number;
}

class AuthManager {
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;
  private readonly REFRESH_BUFFER = 60; // Refresh 60 seconds before expiry

  /**
   * Get a valid access token, refreshing if necessary
   */
  async getAccessToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);

    // Check if we have a valid token that hasn't expired (with buffer)
    if (this.accessToken && now < (this.tokenExpiry - this.REFRESH_BUFFER)) {
      return this.accessToken;
    }

    // Token is expired or doesn't exist, fetch new one
    logger.info('Fetching new access token...');
    await this.refreshToken();

    if (!this.accessToken) {
      throw new Error('Failed to obtain access token');
    }

    return this.accessToken;
  }

  /**
   * Fetch a new access token from the API
   */
  private async refreshToken(): Promise<void> {
    const authString = Buffer.from(
      `${config.adPlatform.email}:${config.adPlatform.password}`
    ).toString('base64');

    const tokenData = await retryWithBackoff(
      async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), config.sync.timeout.auth);

        try {
          const response = await fetch(`${config.adPlatform.apiUrl}/auth/token`, {
            method: 'POST',
            headers: {
              'Authorization': `Basic ${authString}`,
            },
            signal: controller.signal as any,
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Authentication failed: ${response.status} ${errorText}`);
          }

          return await response.json() as TokenResponse;
        } catch (error: any) {
          clearTimeout(timeoutId);
          if (error.name === 'AbortError') {
            throw new Error('Authentication request timeout');
          }
          throw error;
        }
      },
      {
        maxAttempts: config.sync.retry.maxAttempts,
        baseDelay: config.sync.retry.baseDelay,
      }
    );

    this.accessToken = tokenData.access_token;
    this.tokenExpiry = tokenData.issued_at + tokenData.expires_in;

    const expiryDate = new Date(this.tokenExpiry * 1000).toISOString();
    logger.info(`Access token obtained successfully (expires: ${expiryDate})`);
  }

  /**
   * Clear the current token (useful for forcing refresh)
   */
  clearToken(): void {
    this.accessToken = null;
    this.tokenExpiry = 0;
  }
}

export const authManager = new AuthManager();
