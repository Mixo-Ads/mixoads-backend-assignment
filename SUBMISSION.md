# Backend Engineer Assignment – Submission

**Name:** Isha Kumari
**Date:** 30/12/2025  
**Time Spent:** ~5–6 hours  
**GitHub:** ishasinghh

---

## Part A: What Was Broken

Below are the major issues identified in the original codebase and why they mattered.

---

### Issue 1: Hardcoded and Insecure Authentication

**What was wrong:**  
The Ad Platform credentials were hardcoded directly in the source code and logged to the console in Base64 format.

**Why it mattered:**  
- Serious security risk (credentials exposed in logs)
- Impossible to change credentials per environment
- Violates basic production security practices

**Where in the code (original):**  
- `src/syncCampaigns.ts` – hardcoded email/password and credential logging

---

### Issue 2: Pagination Was Broken (Only 10 Campaigns Synced)

**What was wrong:**  
The code fetched only the first page of campaigns (`page=1`) and ignored pagination metadata.

**Why it mattered:**  
- Only 10 out of 100 campaigns were synced
- Data loss and incorrect system behavior

**Where in the code (original):**  
- `src/syncCampaigns.ts` – single call to `/api/campaigns?page=1`

---

### Issue 3: No Retry or Rate Limit Handling

**What was wrong:**  
The code did not handle:
- `429 Too Many Requests`
- `503 Service Unavailable`
- transient network failures

**Why it mattered:**  
- Script failed randomly
- Crashed under normal API behavior
- Not reliable or production-ready

**Where in the code (original):**  
- All API calls in `src/syncCampaigns.ts`

---

### Issue 4: Requests Could Hang Forever

**What was wrong:**  
There was no timeout handling on HTTP requests.

**Why it mattered:**  
- Script could hang indefinitely
- No recovery from unresponsive API calls

**Where in the code (original):**  
- All `fetch` calls in `src/syncCampaigns.ts`

---

### Issue 5: Sequential Processing (Very Slow)

**What was wrong:**  
Campaigns were synced strictly one by one.

**Why it mattered:**  
- Very slow execution
- Did not scale beyond a few campaigns

**Where in the code (original):**  
- Sequential `for` loop in `src/syncCampaigns.ts`

---

### Issue 6: Unsafe Database Access

**What was wrong:**  
- SQL injection risk due to string interpolation
- No UPSERT logic (duplicates on re-run)
- New DB pool created per query

**Why it mattered:**  
- Security vulnerability
- Data inconsistency
- Resource leaks

**Where in the code (original):**  
- `src/database.ts`

---

### Issue 7: Poor Observability and Misleading Logs

**What was wrong:**  
- The original logs were misleading and incomplete
- The system appeared to “hang” during long operations (pagination, rate limits)
- No visibility into pagination progress or rate-limit waits
- Logs did not clearly distinguish between start, in-progress, and completion states

**Why it mattered:**  
- Made it hard to debug whether the process was stuck or still working
- Difficult to understand system behavior under rate limiting
- Poor developer and operator experience
- In production, this would increase incident resolution time

**Where in the code (original):**  
- `src/syncCampaigns.ts`

---

## Part B: How I Fixed It

---

### Fix 1: Secure Authentication via Environment Variables

**My approach:**  
- Moved credentials to `.env`
- Removed all credential logging
- Created a dedicated `authService.ts`

**Why this approach:**  
Improves security and isolates authentication logic.

**Trade-offs:**  
Relies on correct environment configuration.

**Code changes:**  
- **Before:** `src/syncCampaigns.ts`  
- **After:** `src/authService.ts` (`getAccessToken()`)

---

### Fix 2: Correct Pagination (Fetch All 100 Campaigns)

**My approach:**  
- Implemented a loop using `pagination.has_more`
- Added per-page progress logs for observability

**Why this approach:**  
Sequential pagination respects API rate limits.

**Trade-offs:**  
Slightly slower, but correct and reliable.

**Code changes:**  
- **Before:** `src/syncCampaigns.ts`  
- **After:** `src/campaignApi.ts` (`fetchAllCampaigns()`)

---

### Fix 3: Retry, Timeout, and Rate Limit Handling

**My approach:**  
- Added `fetchWithTimeout` using `AbortController`
- Implemented reusable `retry()` with exponential backoff
- Respected `retry-after` header for 429 responses

**Why this approach:**  
Matches real-world API client behavior.

**Trade-offs:**  
Retries increase total execution time under throttling.

**Code changes:**  
- `src/httpClient.ts`
- `src/retry.ts`

---

### Fix 4: Controlled Concurrency for Syncing

**My approach:**  
- Used `p-limit` with concurrency = 2
- Avoided unbounded `Promise.all`

**Why this approach:**  
Balances performance while respecting API rate limits.

**Trade-offs:**  
Lower concurrency limits peak throughput.

**Code changes:**  
- `src/syncService.ts`

---

### Fix 5: Safe and Idempotent Database Writes

**My approach:**  
- Used parameterized queries
- Added `ON CONFLICT (id) DO UPDATE`
- Reused a single DB pool

**Why this approach:**  
Prevents SQL injection and duplicate records.

**Trade-offs:**  
Requires a unique constraint on `campaigns.id`.

**Code changes:**  
- `src/database.ts`

---
### Fix 6: Safe and Idempotent Database Writes

**My approach:**  
- Replaced string-interpolated SQL queries with **parameterized queries**
- Added **UPSERT logic** using `ON CONFLICT (id) DO UPDATE`
- Reused a **single database connection pool** instead of creating a new one per query

**Why this approach:**  
- Parameterized queries eliminate SQL injection risks  
- UPSERT makes the operation **idempotent**, allowing safe re-runs  
- A shared pool prevents connection leaks and improves performance

**Trade-offs:**  
- Requires a unique constraint on `campaigns.id`  
- Slightly more complex SQL compared to simple inserts

**Code changes:**  
- **Before:** `src/database.ts` – string interpolation, no conflict handling  
- **After:** `src/database.ts` – parameterized UPSERT query with pooled connection

---
### Fix 7: Improved Logging and Execution Transparency

**My approach:**  
- Added **progress-based logs** during pagination (page-by-page)
- Logged meaningful milestones instead of only start/end messages
- Ensured logs reflect **real async behavior**, not forced ordering
- Avoided logging sensitive information (tokens, credentials)

**Why this approach:**  
- Makes long-running jobs feel responsive and observable
- Helps operators understand where time is being spent
- Easier to debug rate-limit delays vs real failures
- Logs now represent real concurrency behavior

**Trade-offs:**  
- Slightly more verbose logs
- Requires discipline to keep logs meaningful and consistent

**Code changes:**  
- **Before:** `src/syncCampaigns.ts` – single “Fetching all campaigns” log  
- **After:** `campaignApi.ts` & `syncService.ts` – page-level and sync-level progress logs

---

## Part 3: Code Structure Improvements

### What I changed

- Originally, the entire sync logic was implemented inside a single large file (`syncCampaigns.ts`).  
  This file handled authentication, API calls, pagination, retries, rate limiting, database writes, and logging all together.

I refactored this into smaller, responsibility-focused modules:

```txt
src/
├── index.ts          # Application entry point
├── authService.ts    # Authentication & access token logic
├── campaignApi.ts    # Campaign-related API calls (fetch & sync)
├── syncService.ts    # Orchestrates the overall sync workflow
├── httpClient.ts     # HTTP utilities (timeouts, rate-limit handling)
├── retry.ts          # Generic retry with exponential backoff
└── database.ts       # Database persistence logic
```
- Each file now has a single clear responsibility.

### Why it’s better

- **Separation of concerns:** Each module does one thing and does it well  
- **Improved readability:** Easier to understand and explain the execution flow  
- **Better testability:** Individual modules can be tested in isolation  
- **Safer changes:** Modifying one part does not risk breaking unrelated logic  
- **Production-ready structure:** Matches real-world backend service design  

---

### Architecture decisions

- Used **functional modules** instead of heavy class-based architecture  
- Avoided over-engineering (no frameworks or dependency injection containers)  
- Centralized retry and HTTP behavior to ensure consistent error handling  
- Kept `syncService.ts` thin and focused only on orchestration  

This approach balances **clarity, simplicity, and scalability**.

---

## Part 4: Testing & Verification

### Test scenarios I ran

1. Ran the sync multiple times to ensure idempotent behavior (no duplicates)  
2. Verified pagination fetches all 100 campaigns (10 pages)  
3. Triggered rate limits by exceeding 10 requests per minute  
4. Observed retry behavior during simulated 503 errors  
5. Tested timeout handling when the API intentionally hangs  
6. Ran sync with both `USE_MOCK_DB=true` and real DB configuration  

---

### Expected behavior

- All 100 campaigns should be fetched using pagination  
- Rate limits should pause execution instead of failing  
- Transient failures (503, timeouts) should retry automatically  
- Sync should continue even if individual campaigns fail  
- Logs should clearly show progress and execution state  

---

### Actual results

- All 100 campaigns were fetched successfully  
- Rate limiting caused controlled waits instead of crashes  
- Retries recovered from intermittent API failures  
- Sync completed reliably with clear progress logs  
- No credentials or sensitive data were logged  

---

### Edge cases tested

- API timeouts (no response)  
- Random 503 errors  
- Rate limit exceeded (429)  
- Re-running the sync multiple times  
- Partial failures during campaign sync  

---

## Part 5: Production Considerations

### Monitoring & Observability

Before deploying to production, I would add:
- Metrics for API latency, retries, and failure rates  
- Job-level metrics (campaigns fetched, synced, failed)  
- Alerts for high failure rates or repeated retries  
- Structured logging (JSON) for easier log analysis  

---

### Error Handling & Recovery

- Persist failed campaign IDs for later retry  
- Graceful shutdown handling for in-progress jobs  

---

### Scaling Considerations

To scale to 100+ clients:
- Introduce per-client rate-limit tracking  
- Process clients in parallel with concurrency controls  
- Move long-running sync jobs to background workers  
- Use a queue system (e.g., SQS or BullMQ) for campaign sync tasks  

---

### Security Improvements

- Store secrets in a secure vault (AWS Secrets Manager or Vault)  
- Rotate credentials automatically  
- Mask sensitive values in logs  
- Enforce stricter environment-based configurations  

---

### Performance Optimizations

- Batch database writes where possible  
- Cache access tokens and refresh proactively  
- Tune concurrency limits based on API quotas  
- Parallelize sync across clients with proper isolation  

---

## Part 6: Limitations & Next Steps

### Current limitations

- No background job queue (sync runs inline)  
- Limited monitoring and alerting  
- No persistence for failed sync retries  
- Mock DB used instead of a production database  

---

### What I’d do with more time

- Add automated tests for retry and rate-limit logic  
- Introduce background workers and job queues  
- Implement token refresh logic  
- Add structured logging and metrics  
- Improve failure recovery and retry persistence  

## Part 7: How to Run My Solution

### Setup

```bash
# Clone the repository
git clone https://github.com/ishasinghh/mixoads-backend-assignment.git
cd mixoads-backend-assignment

# Install main application dependencies
npm install

# Install mock API dependencies
cd mock-api
npm install
cd ..

# Create environment file
cp .env.example .env
```
### Running
# Terminal 1: Start the mock Ad Platform API
```bash

cd mock-api
npm start

```
You should see the mock API running on http://localhost:3001.

# Terminal 2: Run the sync service
```bash
cd ..
npm start

```
### Expected Output

 - When everything works correctly, you should see logs similar to:
```bash
Starting campaign sync...
============================================================
Syncing campaigns from Ad Platform...

Step 1: Getting access token...

Step 2: Fetching all campaigns...
Fetching page 1...
Page 1 fetched (10/100)
Fetching page 2...
Page 2 fetched (20/100)
...
Fetching page 10...
Page 10 fetched (100/100)
Found 100 campaigns

Step 3: Syncing campaigns to database...

   Syncing: Campaign 1 (campaign_1)
      [MOCK DB] Saved campaign: campaign_1
Successfully synced Campaign 1

   Syncing: Campaign 2 (campaign_2)
...
Sync complete: 100/100
============================================================

```

- Key things to observe:

    - All 100 campaigns are fetched using pagination
    - Rate limits cause controlled waits (not crashes)
    - Sync continues even if individual campaigns fail
    - No credentials or sensitive data appear in logs

### Testing
 ```bash 
 npm start

```
 - Trigger rate limiting (observe controlled waiting behavior)
 - Make multiple API requests quickly or lower RATE_LIMIT in mock API
 - Test timeout and retry behavior
 - Mock API simulates random 503 errors and timeouts automatically

### Commit history
   - 8b6722a updated submission.md
   - 65636a8 Add pagination progress logging for campaign fetch
   - 4cfcd82 Harden database layer with pooling and upsert
   - de72bc4 Add controlled concurrency to campaign sync
   - d33f2fa Refactor campaign sync into API and sync services
   - b54054e Extract authentication logic into auth service
   - ebb7b55 Fix pagination to fetch all campaigns from ad platform
   - a4afa65 Handle API rate limiting using retry-after header
   - fe8d365 Add retry logic with exponential backoff for transient failures
   - 297b934 Extract HTTP timeout logic into reusable http client
   - 0ac41da Move ad platform credentials to env and stop logging secrets
   - 6897ebd Initial commit: Backend assignment starter code

