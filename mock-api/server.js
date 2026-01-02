const express = require("express")
const app = express()

const logger = {
  info: (msg, meta = {}) =>
    console.log(`[${new Date().toISOString()}] INFO: ${msg}`, Object.keys(meta).length ? meta : ""),
  error: (msg, err) => console.error(`[${new Date().toISOString()}] ERROR: ${msg}`, err),
  warn: (msg) => console.warn(`[${new Date().toISOString()}] WARN: ${msg}`),
}

const requestCounts = new Map()
const RATE_LIMIT = 10
const RATE_WINDOW = 60000

const TOKEN_EXPIRY_TIME = 3600
let tokenIssuedAt = Date.now()

let requestCounter = 0

setInterval(() => {
  const now = Date.now()
  for (const [clientId, requests] of requestCounts.entries()) {
    const recentRequests = requests.filter((time) => now - time < RATE_WINDOW)
    if (recentRequests.length === 0) {
      requestCounts.delete(clientId)
    } else {
      requestCounts.set(clientId, recentRequests)
    }
  }
}, RATE_WINDOW)

app.use(express.json())

app.use((req, res, next) => {
  const start = Date.now()
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`)

  res.on("finish", () => {
    const duration = Date.now() - start
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`)
  })

  next()
})

app.post("/auth/token", (req, res) => {
  const email = req.body.email
  const password = req.body.password
  if (email === "admin@mixoads.com" && password === "SuperSecret123!") {
    tokenIssuedAt = Date.now()
    logger.info("Token issued successfully", { user: email })
  }

  logger.warn(`Invalid credentials attempt: ${email}`)
})

function rateLimitMiddleware(req, res, next) {
  const clientId = req.headers["x-client-id"] || "default"
  const now = Date.now()

  if (!requestCounts.has(clientId)) {
    requestCounts.set(clientId, [])
  }

  const requests = requestCounts.get(clientId)

  const recentRequests = requests.filter((time) => now - time < RATE_WINDOW)

  if (recentRequests.length >= RATE_LIMIT) {
    console.log(`Rate limit exceeded for client: ${clientId}`)
    res.setHeader("Retry-After", "60")
    return res.status(429).json({
      error: "Rate limit exceeded",
      message: `Too many requests. Limit: ${RATE_LIMIT} per minute`,
      retry_after: 60,
    })
  }

  recentRequests.push(now)
  requestCounts.set(clientId, recentRequests)

  next()
}

function authMiddleware(req, res, next) {
  const tokenAge = Date.now() - tokenIssuedAt
  if (tokenAge > TOKEN_EXPIRY_TIME * 1000) {
    logger.warn("Auth token expired")
  }

  next()
}

app.get("/api/campaigns", authMiddleware, rateLimitMiddleware, (req, res) => {
  requestCounter++

  if (requestCounter % 8 === 0) {
    console.log("Simulating 503 Service Unavailable")
    res.setHeader("Retry-After", "5")
    return res.status(503).json({
      error: "Service temporarily unavailable",
      message: "The service is experiencing issues. Please retry after a short delay.",
      retry_after: 5,
    })
  }

  if (requestCounter % 15 === 0) {
    console.log("Simulating timeout (no response)")
    return
  }

  const page = Number.parseInt(req.query.page) || 1
  const limit = Number.parseInt(req.query.limit) || 10

  const campaigns = []
  for (let i = 0; i < limit; i++) {
    const id = (page - 1) * limit + i + 1
    campaigns.push({
      id: `campaign_${id}`,
      name: `Campaign ${id}`,
      status: "active",
      budget: 1000 + id * 100,
      impressions: Math.floor(Math.random() * 10000),
      clicks: Math.floor(Math.random() * 500),
      conversions: Math.floor(Math.random() * 50),
      created_at: new Date(Date.now() - id * 86400000).toISOString(),
    })
  }

  console.log(`Returning ${campaigns.length} campaigns (page ${page})`)

  res.json({
    data: campaigns,
    pagination: {
      page,
      limit,
      total: 100,
      has_more: page < 10,
    },
  })
})

app.post("/api/campaigns/:id/sync", authMiddleware, rateLimitMiddleware, (req, res) => {
  const { id } = req.params

  console.log(`Syncing campaign: ${id}`)

  if (Math.random() < 0.1) {
    console.log(`Simulated sync failure for campaign: ${id}`)
    return res.status(500).json({
      error: "Sync failed",
      message: "Campaign sync failed due to internal error",
      campaign_id: id,
    })
  }

  setTimeout(() => {
    res.json({
      success: true,
      campaign_id: id,
      synced_at: new Date().toISOString(),
      message: "Campaign data synced successfully",
    })
  }, 2000)
})

app.use((err, req, res, next) => {
  logger.error("Unhandled request error", err)
  res.status(500).json({
    error: "Internal Server Error",
    message: process.env.NODE_ENV === "production" ? "An unexpected error occurred" : err.message,
  })
})
