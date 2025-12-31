/**
 * Token manager for handling authentication token lifecycle
 * - Token acquisition and refresh
 * - Expiry tracking with proactive refresh (5 minutes before expiry)
 * - Concurrent request handling during token refresh
 */

import { Token, AuthResponse } from '../types';
import { AuthCredentials, ITokenManager, TokenRefreshState } from './types';
import { AuthError } from '../utils/ErrorHandler';
import { logger } from '../utils/Logger';
import { withRetry } from '../utils/RetryStrategy';

/**
 * Token refresh buffer - refresh token 5 minutes before expiry
 */
const TOKEN_REFRESH_BUFFER_SECONDS = 300; // 5 minutes

/**
 * Token Manager class
 */
export class TokenManager implements ITokenManager {
  private token: Token | null = null;
  private refreshState: TokenRefreshState = {
    isRefreshing: false,
    promise: null,
  };

  constructor(
    private credentials: AuthCredentials,
    private authEndpoint: string,
    private fetchFn: (url: string, options?: RequestInit) => Promise<Response> = fetch
  ) {}

  /**
   * Get current token (refresh if needed)
   */
  public async getToken(): Promise<Token> {
    // If we're currently refreshing, wait for that to complete
    if (this.refreshState.isRefreshing && this.refreshState.promise) {
      logger.debug('Waiting for ongoing token refresh');
      return this.refreshState.promise;
    }

    // If no token, acquire one
    if (!this.token) {
      logger.info('No token present, acquiring new token');
      return this.acquireToken();
    }

    // If token is expired, refresh it
    if (this.isTokenExpired()) {
      logger.warn('Token expired, refreshing');
      return this.refreshToken();
    }

    // If token needs refresh soon, refresh proactively
    if (this.needsRefresh()) {
      logger.info('Token expiring soon, proactive refresh');
      return this.refreshToken();
    }

    // Token is valid
    return this.token;
  }

  /**
   * Refresh the current token
   */
  public async refreshToken(): Promise<Token> {
    // If already refreshing, return existing promise
    if (this.refreshState.isRefreshing && this.refreshState.promise) {
      return this.refreshState.promise;
    }

    // Start refresh process
    this.refreshState.isRefreshing = true;
    this.refreshState.promise = this.acquireToken();

    try {
      const token = await this.refreshState.promise;
      return token;
    } finally {
      this.refreshState.isRefreshing = false;
      this.refreshState.promise = null;
    }
  }

  /**
   * Check if token is valid
   */
  public isTokenValid(): boolean {
    if (!this.token) {
      return false;
    }

    return !this.isTokenExpired();
  }

  /**
   * Check if token needs refresh
   */
  public needsRefresh(): boolean {
    if (!this.token) {
      return true;
    }

    const now = Math.floor(Date.now() / 1000);
    const expiryTime = this.token.issued_at + this.token.expires_in;
    const refreshTime = expiryTime - TOKEN_REFRESH_BUFFER_SECONDS;

    return now >= refreshTime;
  }

  /**
   * Clear stored token
   */
  public clearToken(): void {
    this.token = null;
    logger.debug('Token cleared');
  }

  /**
   * Get token expiry time
   */
  public getExpiryTime(): Date | null {
    if (!this.token) {
      return null;
    }

    const expiryTimestamp = (this.token.issued_at + this.token.expires_in) * 1000;
    return new Date(expiryTimestamp);
  }

  /**
   * Get time until token expires
   */
  public getTimeUntilExpiry(): number | null {
    const expiryTime = this.getExpiryTime();
    if (!expiryTime) {
      return null;
    }

    return expiryTime.getTime() - Date.now();
  }

  /**
   * Acquire new token from API
   */
  private async acquireToken(): Promise<Token> {
    try {
      const token = await withRetry(
        () => this.authenticateWithApi(),
        {
          maxAttempts: 3,
          baseDelay: 1000,
          jitter: 250,
          maxDelay: 5000,
          retryableErrors: [],
        },
        { operation: 'token_acquisition' }
      );

      this.token = token;
      
      const expiryTime = this.getExpiryTime();
      logger.info('Token acquired successfully', {
        expiresAt: expiryTime?.toISOString(),
        expiresIn: `${token.expires_in}s`,
      });

      return token;
    } catch (error) {
      logger.error('Failed to acquire token', error as Error);
      throw new AuthError(
        'Failed to authenticate with API',
        error as Error
      );
    }
  }

  /**
   * Authenticate with API
   */
  private async authenticateWithApi(): Promise<Token> {
    const authHeader = this.encodeCredentials(
      this.credentials.email,
      this.credentials.password
    );

    try {
      const response = await this.fetchFn(this.authEndpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${authHeader}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new AuthError(
          `Authentication failed: ${response.status} ${errorText}`
        );
      }

      const authResponse = await response.json() as AuthResponse;

      // Create token with issued_at timestamp
      const token: Token = {
        access_token: authResponse.access_token,
        token_type: authResponse.token_type,
        expires_in: authResponse.expires_in,
        issued_at: Math.floor(Date.now() / 1000),
      };

      return token;
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }

      throw new AuthError(
        `Network error during authentication: ${(error as Error).message}`,
        error as Error
      );
    }
  }

  /**
   * Check if token is expired
   */
  private isTokenExpired(): boolean {
    if (!this.token) {
      return true;
    }

    const now = Math.floor(Date.now() / 1000);
    const expiryTime = this.token.issued_at + this.token.expires_in;

    return now >= expiryTime;
  }

  /**
   * Encode credentials to Base64
   */
  private encodeCredentials(email: string, password: string): string {
    const credentials = `${email}:${password}`;
    return Buffer.from(credentials).toString('base64');
  }
}

/**
 * Create token manager instance
 */
export function createTokenManager(
  credentials: AuthCredentials,
  authEndpoint: string,
  fetchFn?: (url: string, options?: RequestInit) => Promise<Response>
): TokenManager {
  return new TokenManager(credentials, authEndpoint, fetchFn);
}