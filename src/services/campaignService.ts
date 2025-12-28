import { getAccessToken } from './authService';
import { fetchWithRetry } from '../utils/apiClient';
import { saveCampaign } from '../db';

const API_BASE_URL = process.env.AD_PLATFORM_API_URL || 'http://localhost:3001';
const PAGE_SIZE = 10;
const CONCURRENCY_LIMIT = 1; // Process 1 campaign at a time to respect 10 req/min limit

interface Campaign {
    id: string;
    name: string;
    status: string;
    budget: number;
    impressions: number;
    clicks: number;
    conversions: number;
    created_at: string;
}

interface CampaignsResponse {
    data: Campaign[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        has_more: boolean;
    };
}

async function syncSingleCampaign(campaign: Campaign, token: string) {
    try {
        const syncResponse = await fetchWithRetry(
            `${API_BASE_URL}/api/campaigns/${campaign.id}/sync`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ campaign_id: campaign.id }),
                timeout: 5000 // Individual sync timeout
            }
        );

        if (!syncResponse.ok) {
            throw new Error(`Status ${syncResponse.status}: ${syncResponse.statusText}`);
        }

        // We don't really need the response body for anything other than confirming success
        await syncResponse.json();

        await saveCampaign(campaign);
        return true;
    } catch (error: any) {
        console.error(`   Failed to sync ${campaign.name} (${campaign.id}): ${error.message}`);
        return false;
    }
}

// Function to process a batch of items with a concurrency limit
async function processBatchInChunks(items: Campaign[], token: string, chunkSize: number) {
    let successCount = 0;

    // Process items in chunks
    for (let i = 0; i < items.length; i += chunkSize) {
        const chunk = items.slice(i, i + chunkSize);
        const promises = chunk.map(campaign => syncSingleCampaign(campaign, token));
        const results = await Promise.all(promises);
        successCount += results.filter(r => r).length;
    }

    return successCount;
}

export async function syncAllCampaigns() {
    console.log('Starting campaign sync service...');

    const token = await getAccessToken();

    let currentPage = 1;
    let hasMore = true;
    let totalSynced = 0;
    let totalFound = 0;

    while (hasMore) {
        console.log(`\nFetching page ${currentPage}...`);

        const response = await fetchWithRetry(
            `${API_BASE_URL}/api/campaigns?page=${currentPage}&limit=${PAGE_SIZE}`,
            {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            }
        );

        const data = await response.json() as CampaignsResponse;

        if (!data.data || data.data.length === 0) {
            console.log('No more campaigns found.');
            break;
        }

        const campaigns = data.data;
        totalFound += campaigns.length;

        console.log(`Processing ${campaigns.length} campaigns from page ${currentPage}...`);

        // Sync these campaigns using limited concurrency
        const pageSuccessCount = await processBatchInChunks(campaigns, token, CONCURRENCY_LIMIT);
        totalSynced += pageSuccessCount;

        hasMore = data.pagination.has_more;
        currentPage++;
    }

    console.log('\n' + '='.repeat(60));
    console.log(`Sync complete! Processed ${totalSynced}/${totalFound} campaigns successfully.`);
    console.log('='.repeat(60));

    return {
        totalFound,
        totalSynced
    };
}
