import { ApiClient } from "./api-client"
import { saveCampaignToDB, initializeDatabase } from "./database"
import pLimit from "p-limit"

const API_BASE_URL = process.env.AD_PLATFORM_API_URL || "http://localhost:3001"
const EMAIL = process.env.API_EMAIL || "admin@mixoads.com"
const PASSWORD = process.env.API_PASSWORD || "SuperSecret123!"
const PAGE_SIZE = Number.parseInt(process.env.PAGE_SIZE || "10")
const CONCURRENCY_LIMIT = Number.parseInt(process.env.CONCURRENCY_LIMIT || "3")

export interface SyncStats {
  total: number
  successful: number
  failed: number
  errors: Array<{ campaignId: string; error: string }>
}

export async function syncAllCampaigns(): Promise<SyncStats> {
  console.log("🚀 Starting campaign sync...")
  console.log("=".repeat(60))

  // Initialize database
  await initializeDatabase()

  // Create API client
  const apiClient = new ApiClient({
    baseUrl: API_BASE_URL,
    email: EMAIL,
    password: PASSWORD,
    timeout: 15000,
    maxRetries: 3,
  })

  const stats: SyncStats = {
    total: 0,
    successful: 0,
    failed: 0,
    errors: [],
  }

  try {
    // Fetch all campaigns with pagination
    const campaigns = await apiClient.fetchAllCampaigns(PAGE_SIZE)
    stats.total = campaigns.length

    console.log("\n💾 Syncing campaigns to database...")
    console.log(`   Concurrency limit: ${CONCURRENCY_LIMIT}`)

    // Create concurrency limiter
    const limit = pLimit(CONCURRENCY_LIMIT)

    // Process campaigns concurrently with limit
    const syncPromises = campaigns.map((campaign) =>
      limit(async () => {
        try {
          console.log(`   🔄 Syncing: ${campaign.name} (${campaign.id})`)

          // Call sync endpoint
          await apiClient.syncCampaign(campaign.id)

          // Save to database
          await saveCampaignToDB(campaign)

          stats.successful++
          console.log(`   ✅ Synced: ${campaign.name}`)
        } catch (error: any) {
          stats.failed++
          stats.errors.push({
            campaignId: campaign.id,
            error: error.message,
          })
          console.error(`   ❌ Failed: ${campaign.name} - ${error.message}`)
        }
      }),
    )

    // Wait for all syncs to complete
    await Promise.all(syncPromises)

    console.log("\n" + "=".repeat(60))
    console.log("📊 Sync Summary:")
    console.log(`   Total campaigns: ${stats.total}`)
    console.log(`   ✅ Successful: ${stats.successful}`)
    console.log(`   ❌ Failed: ${stats.failed}`)
    console.log(`   Success rate: ${((stats.successful / stats.total) * 100).toFixed(1)}%`)
    console.log("=".repeat(60))

    if (stats.errors.length > 0) {
      console.log("\n❌ Errors:")
      stats.errors.forEach(({ campaignId, error }) => {
        console.log(`   ${campaignId}: ${error}`)
      })
    }

    return stats
  } catch (error: any) {
    console.error("\n❌ Critical error during sync:", error.message)
    throw error
  }
}
