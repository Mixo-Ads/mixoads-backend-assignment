import { fetchWithRetry } from '../utils/apiClient';

const API_BASE_URL = process.env.AD_PLATFORM_API_URL || 'http://localhost:3001';

interface TokenResponse {
    access_token: string;
    token_type: string;
    expires_in: number;
}

let cachedToken: string | null = null;
let tokenExpiration: number | null = null;

export async function getAccessToken(): Promise<string> {
    // Check if token is valid (add 1 minute buffer)
    if (cachedToken && tokenExpiration && Date.now() < tokenExpiration - 60000) {
        return cachedToken;
    }

    console.log('Authenticating with Ad Platform...');

    const email = process.env.AD_PLATFORM_EMAIL;
    const password = process.env.AD_PLATFORM_PASSWORD;

    if (!email || !password) {
        throw new Error('Missing AD_PLATFORM_EMAIL or AD_PLATFORM_PASSWORD environment variables');
    }

    try {
        const authString = Buffer.from(`${email}:${password}`).toString('base64');

        const response = await fetchWithRetry(`${API_BASE_URL}/auth/token`, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${authString}`
            }
        });

        const data = await response.json() as TokenResponse;

        cachedToken = data.access_token;
        // expires_in is in seconds, convert to ms and add to current time
        // Default to 1 hour if not provided
        const expiresIn = data.expires_in || 3600;
        tokenExpiration = Date.now() + (expiresIn * 1000);

        console.log('Successfully authenticated.');
        return cachedToken;

    } catch (error: any) {
        console.error('Authentication failed:', error.message);
        throw error;
    }
}
