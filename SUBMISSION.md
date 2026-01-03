# Backend Engineer Assignment - Submission

**Name:** Bhuvan
**Date:** 04-01-2026 
**Time Spent:** 3-4 hours
**GitHub:** bhuvanbali123

---

## Part 1: What Was Broken

List the major issues you identified. For each issue, explain what was wrong and why it mattered.

### Issue 1: Authentication & Token Handling
**What was wrong:**  
The original implementation fetched an access token once and reused it without handling expiration, refresh, or failure scenarios. Credentials were also logged in plaintext (Base64), creating a security risk.

**Why it mattered:**  
Token expiry caused random 401 Unauthorized failures.
Long-running sync jobs would fail unpredictably.
Logging credentials was a critical security issue.

**Where in the code:**  
syncCampaigns.ts 52-60 lines

---

### Issue 2: No Retry and Rate-Limit Handling
**What was wrong:**  
The client made API requests without handling rate limits (429), server errors (503), or timeouts. Any transient failure immediately broke the sync.

**Why it mattered:**  
The API intentionally simulates rate limiting
Without retries, the system was unreliable
The sync would fail under realistic production conditions

**Where in the code:**  
syncCampaigns.ts 66 line, 89

---

### Issue 3: Incomplete Pagination Handling

**What was wrong:**  
Only the first page of campaigns was fetched, ignoring pagination metadata (has_more).

**Why it mattered:**  
Only a subset of campaigns were synced
The code worked only for small test datasets

**Where in the code:**  
syncCampaigns.ts 66 line

---


### Issue 4: Lack of Concurrency Control

**What was wrong:**  
Campaign sync requests were fired sequentially and without considering API rate limits.

**Why it mattered:**  
Poor performance
High chance of hitting rate limits

**Where in the code:**  
syncCampaigns.ts 85-112 lines

---


### Issue 5: Unsafe & Non-Idempotent Database Writes

**What was wrong:**  
Raw string interpolation in SQL queries. No UPSERT logic
A new DB connection pool was created per request

**Why it mattered:**  
Duplicate data on retries
Database connection exhaustion

**Where in the code:**  
database.ts connections updated

---

## Part 2: How I Fixed It

For each issue above, explain your fix in detail.

### Fix 1: Authentication & Token Handling

**My approach:**  
Implemented a cached token with expiry tracking and a refresh buffer. Token retrieval fails fast on configuration or auth errors.

**Why this approach:**  
Prevents random 401 errors
Avoids unnecessary auth requests

**Trade-offs:**  
[What compromises did you make? What would you do differently with more time?]

**Code changes:**  
[Link to commits, files, or specific line numbers]

---

### Fix 2: No Retry and Rate-Limit Handling

**My approach:**  
Created a reusable fetchWithRetry utility that:
Retries on timeouts and 5xx errors
Respects retry_after on 429 responses
Differentiates between recoverable and fatal errors

**Why this approach:**  
Keeps pagination and business logic clean

**Trade-offs:**  
Slightly slower execution under heavy rate limits

**Code changes:**  
fetchWithRetry.ts

---

### Fix 3: Incomplete Pagination Handling

**My approach:**  
Implemented a while loop driven by has_more metadata to fetch all campaign pages.

**Why this approach:**  
Guarantees completeness of base data

**Trade-offs:**  
Entire sync aborts if list fetch fails

**Code changes:**  
fetchAllCampaigns.ts

---

### Fix 4: Lack of Concurrency Control

**My approach:**  
Implemented a concurrency-limited worker pool to sync campaigns in parallel without violating rate limits.

**Why this approach:**  
Improves throughput
Prevents API hammering
Predictable behavior under load

**Trade-offs:**  
Hardcoded concurrency limit (configurable later)

**Code changes:**  
concurrency.ts

---

### Fix 5: Unsafe & Non-Idempotent Database Writes

**My approach:**  
Introduced a single shared DB pool
Used parameterized queries
Implemented UPSERT using ON CONFLICT

**Why this approach:**  
Safe against SQL injection
Retry-safe

**Trade-offs:**  
more complex SQL

**Code changes:**  
database.ts

---

## Part 3: Code Structure Improvements

Explain how you reorganized/refactored the code.

**What I changed:**  
Split logic into clear modules:

auth
fetchWithRetry
campaigns
sync

**Why it's better:**  
Clear separation of concerns
Easier to test
Reusable utils

**Architecture decisions:**  
Functional, layered design with clear boundaries between transport, business logic, and persistence.

---

## Part 4: Testing & Verification

How did you verify your fixes work?

**Test scenarios I ran:**
1. Ran sync multiple times to ensure idempotency
2. Triggered rate limits intentionally (429)

**Expected behavior:**  
[What should happen when it works correctly?]

**Actual results:**  
Sync completed reliably
Rate limits respected
DB remained consistent

**Edge cases tested:**  
Token expiry mid-sync
Empty campaign list
API downtime

---

## Part 5: Production Considerations

What would you add/change before deploying this to production?

### Monitoring & Observability
Metrics: success/failure count, retries, latency
Alerts on auth failures and repeated list-fetch failures

### Error Handling & Recovery
Dead-letter queue for failed campaigns
Resume-From-Last-Checkpoint

### Scaling Considerations
Per-client token cache
Distributed job queue (BullMQ / RabbitMQ)

### Security Improvements
Secret manager for credentials

### Performance Optimizations
Adaptive concurrency
Batch DB writes

---

## Part 6: Limitations & Next Steps

Be honest about what's still not perfect.

**Current limitations:**  
Single-tenant token cache
No persistent job state

**What I'd do with more time:**  
Add Redis-backed token & rate-limit tracking
Add structured logging & tracing

**Questions I have:**  
Expected SLA for sync completion?

---

## Part 7: How to Run My Solution

Clear step-by-step instructions.

### Setup
```bash
# Step-by-step commands
```
npm install

# Install mock API dependencies
cd mock-api
npm install
cd ..

### Running
```bash
# How to start everything
```
cd mock-api 
npm start

open new terminal
cd ..
npm start

### Expected Output
```
# What should you see when it works?
```
Starting campaign sync...
============================================================
Syncing campaigns from Ad Platform...


Step 1: Fetching campaigns...
Fetching campaigns - Page 1...
Using auth: Basic YWRtaW5AbWl4b2Fkcy5jb206U3VwZXJTZWNyZXQxMjMh
Auth response status: 200
Using access token: mock_access_token_1767473859688
Fetching campaigns - Page 2...
Using access token: mock_access_token_1767473859688
Fetching campaigns - Page 3...
Using access token: mock_access_token_1767473859688
Fetching campaigns - Page 4...
Using access token: mock_access_token_1767473859688
Fetching campaigns - Page 5...
Using access token: mock_access_token_1767473859688
Fetching campaigns - Page 6...
Using access token: mock_access_token_1767473859688
Fetching campaigns - Page 7...
Using access token: mock_access_token_1767473859688
Fetching campaigns - Page 8...
Using access token: mock_access_token_1767473859688
Fetching campaigns - Page 9...
Using access token: mock_access_token_1767473859688
Rate limited. Waiting 60s
Fetching campaigns - Page 10...
Using access token: mock_access_token_1767473859688
Found 100 campaigns

Step 2: Syncing campaigns to database...
      [MOCK DB] Saved campaign: campaign_1
      [MOCK DB] Saved campaign: campaign_2
      [MOCK DB] Saved campaign: campaign_3
      [MOCK DB] Saved campaign: campaign_4
      [MOCK DB] Saved campaign: campaign_5
      [MOCK DB] Saved campaign: campaign_6
Rate limited. Waiting 60s
      [MOCK DB] Saved campaign: campaign_

### Testing
```bash
# How to verify it's working correctly
```
    [MOCK DB] Saved campaign: campaign_97
      [MOCK DB] Saved campaign: campaign_98
⏳ Rate limited. Waiting 60s
      [MOCK DB] Saved campaign: campaign_99
      [MOCK DB] Saved campaign: campaign_100

============================================================
Sync complete: 100/100 campaigns synced
============================================================
---

## Part 8: Additional Notes

Any other context, thoughts, or reflections on the assignment.

I intentionally treated the API as an unreliable external dependency and focused on building a resilient, production-safe client.

---

**Thank you for reviewing my submission!**
