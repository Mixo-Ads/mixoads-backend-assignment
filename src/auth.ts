import fetch from 'node-fetch';

const API_BASE_URL = process.env.AD_PLATFORM_API_URL! || 'http://localhost:3001';

// Get access token from API
export async function getAccessToken(): Promise<string> {
    const email = process.env.AD_PLATFORM_EMAIL!;
    const password = process.env.AD_PLATFORM_PASSWORD!;
    const authString = Buffer.from(`${email}:${password}`).toString('base64');

    console.log(`Using auth: Basic ${authString}`);

    const authResponse = await fetch(`${API_BASE_URL}/auth/token`, {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${authString}`
        }
    });

    if (!authResponse.ok) {
        throw new Error(`Auth failed with status ${authResponse.status}`);
    }

    const authData = await authResponse.json();
    return authData.access_token;
}
