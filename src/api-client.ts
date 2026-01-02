import fetch from "node-fetch"
import { AbortController } from "node-abort-controller"

export interface ApiClientConfig {
  baseUrl: string
  email: string
  password: string
  timeout?: number
  maxRetries?: number
  clientId?: string
}

export interface TokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  issued_at: number
}

export interface Campaign {
  id: string
  name: string
  status: string
  budget: number
  impressions: number
  clicks: number
  conversions: number
  created_at: string
}

export interface PaginatedResponse {
  data: Campaign[]
  pagination: {
    page: number
    limit: number
    total: number
    has_more: boolean
  }
}

export class ApiClient {
  private config: Required<ApiClientConfig>
  private accessToken: string | null = null
  private tokenExpiresAt: number | null = null

  constructor(config: ApiClientConfig) {
    this.config = {
      baseUrl: config.baseUrl,
      email: config.email,
      password: config.password,
      timeout: config.timeout || 10000,
      maxRetries: config.maxRetries || 3,
      clientId: config.clientId || `client_${Date.now()}`,
    }
  }

  /**
   * Fetch with timeout, retry logic, and exponential backoff
   */
  private async fetchWithRetry(url: string, options: any, retryCount = 0): Promise<any> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout)

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          "x-client-id": this.config.clientId,
          ...options.headers,
        },
      })

      clearTimeout(timeoutId)

      // Handle rate limiting with exponential backoff
      if (response.status === 429) {
        const retryAfter = response.headers.get("Retry-After")
        const waitTime = retryAfter ? Number.parseInt(retryAfter) * 1000 : 60000

        console.log(`[v0] ⏳ Rate limited. Waiting ${waitTime / 1000}s before retry...`)
        await this.sleep(waitTime)
        return this.fetchWithRetry(url, options, retryCount)
      }

      // Handle service unavailable with retry
      if (response.status === 503 && retryCount < this.config.maxRetries) {
        const retryAfter = response.headers.get("Retry-After")
        const waitTime = retryAfter ? Number.parseInt(retryAfter) * 1000 : Math.pow(2, retryCount) * 1000

        console.log(
          `[v0] ⚠️ Service unavailable. Retry ${retryCount + 1}/${this.config.maxRetries} after ${waitTime / 1000}s...`,
        )
        await this.sleep(waitTime)
        return this.fetchWithRetry(url, options, retryCount + 1)
      }

      return response
    } catch (error: any) {
      clearTimeout(timeoutId)

      // Handle timeout or network errors with retry
      if ((error.name === "AbortError" || error.code === "ECONNREFUSED") && retryCount < this.config.maxRetries) {
        const waitTime = Math.pow(2, retryCount) * 1000
        console.log(
          `[v0] 🔄 ${error.name === "AbortError" ? "Timeout" : "Connection failed"}. Retry ${retryCount + 1}/${this.config.maxRetries} after ${waitTime / 1000}s...`,
        )
        await this.sleep(waitTime)
        return this.fetchWithRetry(url, options, retryCount + 1)
      }

      throw error
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * Authenticate and get access token with auto-refresh
   */
  async authenticate(): Promise<string> {
    if (this.accessToken && this.tokenExpiresAt && Date.now() < this.tokenExpiresAt - 300000) {
      return this.accessToken
    }

    console.log("🔑 Authenticating...")

    const authString = Buffer.from(`${this.config.email}:${this.config.password}`).toString("base64")

    const response = await this.fetchWithRetry(`${this.config.baseUrl}/auth/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${authString}`,
      },
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(`Authentication failed: ${error.message || response.statusText}`)
    }

    const data: TokenResponse = await response.json()
    this.accessToken = data.access_token
    this.tokenExpiresAt = Date.now() + data.expires_in * 1000

    console.log(`✅ Authenticated successfully (token expires in ${data.expires_in}s)`)

    return this.accessToken
  }

  /**
   * Fetch campaigns with automatic pagination
   */
  async fetchAllCampaigns(pageSize = 10): Promise<Campaign[]> {
    const allCampaigns: Campaign[] = []
    let currentPage = 1
    let hasMore = true

    console.log("📥 Fetching campaigns...")

    while (hasMore) {
      const token = await this.authenticate()

      const response = await this.fetchWithRetry(
        `${this.config.baseUrl}/api/campaigns?page=${currentPage}&limit=${pageSize}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      )

      if (!response.ok) {
        throw new Error(`Failed to fetch campaigns: ${response.statusText}`)
      }

      const data: PaginatedResponse = await response.json()
      allCampaigns.push(...data.data)

      console.log(`   📄 Page ${currentPage}: Fetched ${data.data.length} campaigns`)

      hasMore = data.pagination.has_more
      currentPage++
    }

    console.log(`✅ Total campaigns fetched: ${allCampaigns.length}`)

    return allCampaigns
  }

  /**
   * Sync a single campaign
   */
  async syncCampaign(campaignId: string): Promise<void> {
    const token = await this.authenticate()

    const response = await this.fetchWithRetry(`${this.config.baseUrl}/api/campaigns/${campaignId}/sync`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ campaign_id: campaignId }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || "Sync failed")
    }

    await response.json()
  }
}
