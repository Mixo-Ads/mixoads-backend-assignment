import { fetchWithTimeout } from "./httpClient";
import { retry } from "./retry";

const API_BASE_URL = process.env.AD_PLATFORM_API_URL || "http://localhost:3001";

export async function getAccessToken(): Promise<string> {
  const email = process.env.AD_PLATFORM_EMAIL;
  const password = process.env.AD_PLATFORM_PASSWORD;

  if (!email || !password) {
    throw new Error("Missing Ad Platform credentials");
  }

  const authString = Buffer.from(`${email}:${password}`).toString("base64");

  const response = await retry(async () => {
    const res = await fetchWithTimeout(
      `${API_BASE_URL}/auth/token`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${authString}`,
        },
      },
      3000
    );

    if (!res.ok) {
      throw new Error(`Auth failed: ${res.status}`);
    }

    return res;
  });

  const data = await response.json();
  return data.access_token;
}
