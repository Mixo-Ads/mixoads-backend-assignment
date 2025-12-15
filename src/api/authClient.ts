// src/api/authClient.ts
import fetch from "node-fetch";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";
import { exponentialBackoff } from "../utils/retry";

const API_URL = process.env.AD_PLATFORM_API_URL!;
const EMAIL = process.env.AD_PLATFORM_EMAIL!;
const PASSWORD = process.env.AD_PLATFORM_PASSWORD!;

export async function getAccessToken(): Promise<string> {
  const authString = Buffer.from(`${EMAIL}:${PASSWORD}`).toString("base64");

  return exponentialBackoff(async () => {
    const res = await fetchWithTimeout(`${API_URL}/auth/token`, {
      method: "POST",
      headers: { Authorization: `Basic ${authString}` }
    });

    if (!res.ok) {
      throw new Error(`Auth failed: ${res.status}`);
    }

    const data = await res.json();
    return data.access_token;
  }, { retries: 3 });
}
