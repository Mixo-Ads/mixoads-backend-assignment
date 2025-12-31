# Backend Engineer Assignment – Submission

**Name:** Faizudheen M  
**Date:** 2025-12-31  
**Time Spent:** ~8 hours  
**GitHub:** Faizudheen

---

## Part 1: What Was Broken

### 1. Authentication Handling
**What was wrong:**  
Authentication logic was embedded inside the main sync function. Credentials were hardcoded and the encoded authorization string and access token were logged to the console.

**Why it mattered:**  
This is a serious security issue. Hardcoded credentials and logging sensitive data can easily lead to credential leaks in production logs. It also made the code harder to maintain and test.

**Where:**  
`src/syncCampaigns.ts`

---

### 2. No Retry, Timeout, or Rate-Limit Handling
**What was wrong:**  
All API calls were made directly using `fetch` with no timeout, retry logic, or handling for 429 (rate limit) responses. Random 503 errors and hanging requests would cause the sync job to fail or stall indefinitely.

**Why it mattered:**  
The mock API simulates real-world failures. Without retries and timeouts, the sync job was unreliable and unsuitable for production use.

**Where:**  
`src/syncCampaigns.ts`

---

### 3. Broken Pagination
**What was wrong:**  
Only the first page of campaigns was fetched (10 campaigns), even though the API exposes 100 campaigns across multiple pages.

**Why it mattered:**  
This caused silent data loss. The system appeared to work but was syncing incomplete data.

**Where:**  
`src/syncCampaigns.ts`

---

### 4. Poor Performance (Sequential Processing)
**What was wrong:**  
Campaigns were synced one by one in a sequential loop.

**Why it mattered:**  
This made the sync extremely slow and inefficient. It also increased the chance of hitting rate limits unnecessarily.

**Where:**  
`src/syncCampaigns.ts`

---

### 5. Unsafe Database Access
**What was wrong:**  
A new database connection pool was created on every insert, SQL queries were built using string interpolation, and duplicate records were not handled.

**Why it mattered:**  
This could lead to connection exhaustion, SQL injection vulnerabilities, and duplicated data in production.

**Where:**  
`src/database.ts`

---

## Part 2: How I Fixed It

### Authentication
- Moved authentication into a dedicated module.
- Read credentials from environment variables.
- Cached the access token and refreshed it before expiry.
- Removed all credential and token logging.

**Files:**  
`src/api/auth.ts`, `src/syncCampaigns.ts`

---

### API Reliability (Retries, Timeouts, Rate Limits)
- Introduced a centralized API client wrapper.
- Added request timeouts to prevent hanging calls.
- Implemented exponential backoff retries for transient failures (503, network errors).
- Respected `429` responses using the `retry-after` header.

**Files:**  
`src/api/client.ts`

---

### Pagination
- Implemented a loop to fetch all pages until `has_more` is false.
- Ensured all 100 campaigns are retrieved before syncing.

**Files:**  
`src/syncCampaigns.ts`

---

### Performance Improvements
- Replaced sequential processing with controlled parallelism.
- Synced campaigns in small batches to balance speed and rate-limit safety.

**Files:**  
`src/syncCampaigns.ts`

---

### Database Fixes
- Reused a single PostgreSQL connection pool.
- Switched to parameterized queries to prevent SQL injection.
- Implemented UPSERT logic to make sync operations idempotent.

**Files:**  
`src/database.ts`

---

## Part 3: Code Structure Improvements

**What changed:**  
The original “god function” was broken into focused modules:
- Authentication
- API client
- Sync orchestration
- Database access

**Why it’s better:**  
This improves readability, testability, and separation of concerns. Each part of the system now has a clear responsibility.

**Architecture approach:**  
Simple functional modules with clear boundaries. No over-engineering or unnecessary abstractions.

---

## Part 4: Testing & Verification

**Test scenarios:**
1. Ran the sync multiple times to ensure idempotent behavior.
2. Observed retries during simulated 503 errors.
3. Triggered rate limiting to verify backoff behavior.
4. Confirmed all 100 campaigns were fetched and synced.

**Expected behavior:**  
The sync completes reliably without crashing, hanging, or losing data.

**Actual results:**  
The sync consistently completed successfully under simulated failures and rate limits.

---

## Part 5: Production Considerations

### Monitoring & Observability
- Metrics for sync duration, failure rate, retry count
- Alerts for repeated failures or long-running syncs

### Error Handling & Recovery
- Dead-letter handling for repeatedly failing campaigns
- Better structured logging with correlation IDs

### Scaling
- Run sync jobs per client with isolated rate limits
- Introduce job scheduling or a queue for large client counts

### Security
- Secrets stored in a secure vault
- Token rotation and stricter log sanitization

### Performance
- Adaptive concurrency based on rate-limit feedback
- Bulk database operations where possible

---

## Part 6: Limitations & Next Steps

**Current limitations:**  
No automated tests and no persistent job state.

**With more time:**  
- Add unit tests for the API client
- Introduce job resumability
- Add structured logging

---

## Part 7: How to Run the Solution

### Setup
```bash
npm install
cd mock-api && npm install && npm start
```

### Running
```bash
npm start
```

### Expected Output
- All 100 campaigns fetched
- Sync completes without crashing
- Retries and backoff visible in logs

---

## Commits Summary

1. Refactored authentication and removed hardcoded credentials  
2. Added resilient API client with retry, timeout, and rate-limit handling  
3. Fixed pagination and added controlled concurrency  
4. Secured database access with UPSERT and pooled connections  

---

**Thank you for reviewing my submission.**
