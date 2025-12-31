/**
 * Authentication module type definitions
 */

import { Token } from '../types';

/**
 * Authentication credentials
 */
export interface AuthCredentials {
  email: string;
  password: string;
}

/**
 * Token manager interface
 */
export interface ITokenManager {
  getToken(): Promise<Token>;
  refreshToken(): Promise<Token>;
  isTokenValid(): boolean;
  needsRefresh(): boolean;
  clearToken(): void;
}

/**
 * Token refresh state
 */
export interface TokenRefreshState {
  isRefreshing: boolean;
  promise: Promise<Token> | null;
}