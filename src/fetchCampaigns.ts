import { getAccessToken } from './auth';
import { fetchWithRetry } from './fetchWithRetry';

const API_BASE_URL = process.env.AD_PLATFORM_API_URL || 'http://localhost:3001';
const PAGE_SIZE = 10;

export async function fetchAllCampaigns() {
  let page = 1;
  const allCampaigns: any[] = [];

  while (true) {
    console.log(`Fetching campaigns - Page ${page}...`);
    const token = await getAccessToken();
    console.log(`Using access token: ${token}`);

    const data:any = await fetchWithRetry(
      `${API_BASE_URL}/api/campaigns?page=${page}&limit=${PAGE_SIZE}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    allCampaigns.push(...data.data);

    if (!data.pagination.has_more) break;
    page++;
  }

  return allCampaigns;
}