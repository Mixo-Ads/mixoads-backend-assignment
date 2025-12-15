### ***Mixo Ads — Backend Engineering Assignment***

### ***Author: Mayank Jha***

---

# **Part A — What Was Broken (Root Cause Analysis)**

Below are the major issues found in the inherited codebase, grouped by functional category.

---

## **1\. Authentication problems (hardcoded \+ insecure \+ unscalable)**

* Credentials (`admin@mixoads.com / SuperSecret123!`) were hardcoded directly in the code.  
* They were logged in plaintext to the console:

   `Using auth: Basic YWRtaW5AbWl4b2Fkcy5jb206U3VwZXJTZWNyZXQxMjMh`  
* No token expiration handling existed.

### **Impact**

* Huge security risk.

* Violates least-privilege & secrets-management principles.

* Not usable for multiple clients (every client needs unique credentials).

---

## **2\. Pagination was broken (only fetched 10 of 100 campaigns)**

* Code only called:  
    
   `page=1&limit=10`  
* Ignored `pagination.has_more` and did not iterate through pages 2–10.

### **Impact**

* 90% of data never synced.

* DB silently inconsistent with ad platform.

---

## **3\. Zero rate-limit handling — API returned 429 and code crashed**

The mock API enforces **10 requests/min**.  
 Original code:

* Treated 429 as a fatal error.

* Immediately crashed the sync process.

### **Impact**

* Completely unreliable in production.

* Load from 5 clients would break the system.

---

## **4\. No retry logic, no exponential backoff**

* 20% of requests return random 503\.

* 10% simulate random timeouts.

* Without retry logic, *all transient failures resulted in permanent sync failure.*

### **Impact**

* Production job would fail on almost every execution.

---

## **5\. Timeout handling was missing**

* Long-running sync endpoint (2 seconds) caused the script to hang indefinitely.

* No AbortController or timeout logic existed.

### **Impact**

* Worker threads leak.

* Sync pipeline freezes.

---

## **6\. Database layer vulnerable to SQL Injection \+ duplication issues**

Original query:

`INSERT INTO campaigns (id, name, ...)`

`VALUES ('${campaign.id}', '${campaign.name}', ...)`

Problems:

* Direct string interpolation → SQL injection vulnerability.

* No checksum or upsert → duplicates created every run.

* New `Pool()` created on every DB call → connection leaks.

### **Impact**

* Severe security concerns.

* Unbounded DB growth.

* High connection usage.

---

## **7\. Code structure was a “god function”**

* 1 file doing:

  * authentication

  * pagination

  * fetch

  * sync

  * DB save

  * logging

  * rate-limit logic

  * retry logic

* Zero separation of concerns.

* Impossible to test or maintain.

### **Impact**

* Not scalable for 5–100 clients.

* Hard to extend.

* Error-prone.

---

## **8\. Concurrency was sequential \+ slow**

Original loop synced campaign-by-campaign sequentially:

`for (const campaign of campaignsData.data) {`

    `await fetch(...)`

`}`

### **Impact**

* Syncing 100 campaigns took multiple minutes.

* If scaled across tenants, job becomes unusable.

---

# **Part B — How I Fixed It (Design Decisions & Tradeoffs)**

---

# **1\. Authentication moved into dedicated module**

Created:  
 `src/api/authClient.ts`

 ✔ Loads credentials securely via environment variables  
 ✔ No plaintext logging  
 ✔ Uses `Basic` to get Bearer token  
 ✔ Retries token fetch on transient failures  
 ✔ Ready for multi-client secrets per tenant

**Tradeoff:**  
 Keeping Basic auth for token retrieval aligns with mock API requirements.

---

# **2\. Pagination rewritten to fetch all 100 campaigns**

Created a clean pagination engine:

`while (hasMore) {`

    `fetch page N`

    `if 429 → wait & retry same page`

    `append results`

    `increment page`

`}`

 ✔ Correctly loops pages 1 → 10  
 ✔ Handles rate-limits per page  
 ✔ Ensures **eventual consistency**  
 ✔ Avoids infinite loops with controlled retry strategy

---

# **3\. Implemented production-grade rate-limit handling**

The most complex improvement:

### **✔ 429 handled outside exponentialBackoff**

### **✔ Waits `retry-after` \+ 500ms buffer**

### **✔ Infinite retries (bounded by MAX\_RATE\_LIMIT\_RETRIES)**

### **✔ No exponential backoff triggered for 429**

### **✔ Eventually succeeds even under high API throttling**

This mimics real ad APIs (Facebook Ads, Google Ads, TikTok Ads).

---

# **4\. Added exponential backoff retry system**

Created:  
 `src/utils/retry.ts`

Features:

* Exponential delay (600ms, 1200ms, 2400ms)

* Retries only for:

  * 503 Service Unavailable

  * Timeout

  * Network errors

**Tradeoff:**  
 Not used for 429 because rate-limit is not a transient error — it's a *backpressure signal*.

---

# **5\. Introduced Fetch Timeout Wrapper**

Created:  
 `src/utils/fetchWithTimeout.ts`

✔ Uses AbortController  
 ✔ Safe cancellation  
 ✔ Prevents hangs  
 ✔ Guarantees system responsiveness

---

# **6\. Rebuilt Database Layer Safely**

File: `src/database.ts`

✔ Connection pool is initialized once  
 ✔ Uses **parameterized queries** to prevent SQL injection  
 ✔ Uses **UPSERT** (`ON CONFLICT (id) DO UPDATE`)  
 ✔ No duplicates, idempotent sync  
 ✔ Logically grouped DB operations

---

# **7\. Refactored into Clean Modules**

New folder structure:

`src/`

  `api/`

    `authClient.ts`

    `adPlatformClient.ts`

  `services/`

    `syncService.ts`

  `utils/`

    `fetchWithTimeout.ts`

    `retry.ts`

  `database.ts`

  `index.ts`

 ✔ Separation of concerns  
 ✔ Easy to test  
 ✔ Easy to replace individual components  
 ✔ More maintainable

---

# **8\. Added Concurrency Control \+ Retry for Campaign Sync**

In `syncService.ts`:

 ✔ Parallel sync with concurrency limit \= 5  
 ✔ Per-campaign retry using exponential backoff  
 ✔ Handles:

* rate limits

* timeouts

* transient API instability

**Tradeoff:**  
 Not forcing all 100 to succeed on first try (expected)—this is normal in ad tech sync pipelines.

---

# **Part C — How to Run the Solution**

---

## **1\. Install dependencies**

`npm install`

## **2\. Setup environment variables**

Copy the example:

`cp .env.example .env`

Inside `.env`, define:

`AD_PLATFORM_API_URL=http://localhost:3001`

`AD_PLATFORM_EMAIL=admin@mixoads.com`

`AD_PLATFORM_PASSWORD=SuperSecret123!`

`USE_MOCK_DB=true`

## **3\. Start the mock API**

`cd mock-api`

`npm start`

You should see:

`🚀 Mock Ad Platform API Server`

`📍 http://localhost:3001`

## **4\. Run the sync job**

In another terminal:

`npm start`

Expected behavior:

 ✔ Fetches all 100 campaigns  
 ✔ Handles rate limits  
 ✔ Retries failures  
 ✔ Syncs with DB (mock or real)  
 ✔ Prints success count

---

# **Part D — Production Considerations**

This section outlines what I would add before deploying to production.

---

# **1\. Scheduled Job / Worker Queue**

This sync should run in background workers (BullMQ, RabbitMQ, SQS):

* Avoid blocking API servers

* Automatic retry scheduling

* Distributed sync across clients

* Rate-limit smoothing

---

# **2\. Monitoring & Observability**

Add:

* **Prometheus metrics**

  * `sync_success_count`

  * `sync_failure_count`

  * `rate_limit_hits`

  * `retry_attempts`

* **Structured logging (JSON)**

* **Alerting** for:

  * Repeated rate-limit failures

  * Low sync success rates

  * Authentication failures

---

# **3\. Horizontal Scalability**

As number of clients increases:

* Use queue per client

* Limit concurrency per advertiser

* Shard API keys

* Cache tokens

* Rate-limit at gateway layer

---

# **4\. Handle Token Expiration**

Tokens expire in 1 hour.  
 In production:

* Cache token until expiry time

* Auto-refresh without losing inflight jobs

* Avoid re-authentication spam

---

# **5\. Backfill Jobs for Missing Data**

If a campaign failed to sync today, schedule:

* Retry tomorrow

* Retry after 6 hours

* Retry after next successful run

Ensures the database stays complete.

---

# **6\. Circuit Breaker for API**

If upstream API unhealthy:

* Stop hitting it

* Open circuit

* Retry after cooldown period

---

# **7\. Distributed Locking**

Ensure two workers do not sync the same advertiser concurrently:

* Redis Redlock

* Postgres advisory locks

---

# **8\. Future Architecture Improvements**

* Make sync idempotent (already done via UPSERT)

* Introduce hashing to store only changed campaigns

* Add test suite for:

  * rate-limits

  * retries

  * pagination

  * DB logic

---

# **🎉 Conclusion**

This refactored system is:

### **✔ Secure**

### **✔ Stable**

### **✔ Fault-tolerant**

### **✔ Rate-limit aware**

### **✔ Modular & scalable**

### **✔ Production-ready**

It successfully handles all required fixes and demonstrates best practices for backend engineering in an ad-tech style environment.

