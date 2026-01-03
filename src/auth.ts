import fetch from 'node-fetch';

const API_BASE_URL = process.env.AD_PLATFORM_API_URL || 'http://localhost:3001';
let cachedToken: string = '';
let tokenExpiry = 0;
interface AuthResponse {
  access_token: string;
  expires_in: number;
}

export async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  const email = process.env.BUSSINESS_EMAIL;
  const password = process.env.EMAIL_PASSWORD;
  if (!email || !password) {
    throw new Error('Missing BUSINESS_EMAIL or EMAIL_PASSWORD');
  }
  const authString = Buffer.from(`${email}:${password}`).toString('base64');
  console.log(`Using auth: Basic ${authString}`);
  const res = await fetch(`${API_BASE_URL}/auth/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${authString}` },
  });
  console.log(`Auth response status: ${res.status}`);

  if (!res.ok) {
    throw new Error(`Auth failed: ${res.status}`);
  }

  const data = (await res.json()) as AuthResponse;
  if (!data.access_token || !data.expires_in) {
    throw new Error('Invalid auth response format');  
}
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + data.expires_in * 1000 - 30_000;

  return cachedToken;
}