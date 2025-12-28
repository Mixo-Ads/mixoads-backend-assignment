import fetch from 'node-fetch';

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  issued_at: number;
}

export interface AuthConfig {
  apiBaseUrl: string;
  email: string;
  password: string;
}

/**
 * Authenticates with the Ad Platform API and returns an access token
 */
export async function authenticate(config: AuthConfig): Promise<TokenResponse> {
  const authString = Buffer.from(`${config.email}:${config.password}`).toString('base64');
  
  const response = await fetch(`${config.apiBaseUrl}/auth/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${authString}`
    }
  });

  if (!response.ok) {
    throw new Error(`Authentication failed: ${response.status} ${response.statusText}`);
  }

  const tokenData: TokenResponse = await response.json();
  return tokenData;
}

/**
 * Gets authentication credentials from environment variables
 */
export function getAuthConfig(): AuthConfig {
  const email = process.env.AD_PLATFORM_EMAIL;
  const password = process.env.AD_PLATFORM_PASSWORD;
  const apiBaseUrl = process.env.AD_PLATFORM_API_URL || 'http://localhost:3001';

  if (!email || !password) {
    throw new Error('Missing required environment variables: AD_PLATFORM_EMAIL and AD_PLATFORM_PASSWORD must be set');
  }

  return { email, password, apiBaseUrl };
}

