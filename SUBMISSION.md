# Backend Engineer Assignment - Submission

**Name:** Abhishek Ingale  
**Date:** December 31, 2025  
**Time Spent:** 4 hours  
**GitHub:** abhishek9187

---

## Part 1: What Was Broken

### Issue 1: Hardcoded Credentials and Logging Sensitive Data
**What was wrong:**  
Credentials (`admin@mixoads.com` / `SuperSecret123!`) were hardcoded and the Base64-encoded string was logged to console.  
**Why it mattered:**  
Major security risk — anyone with access to logs could decode and steal credentials.  
**Where in the code:**  
`src/syncCampaigns.ts` — lines with `const email = "admin@mixoads.com"` and `console.log(`Using auth: Basic ${authString}`)`

### Issue 2: No Pagination Support
**What was wrong:**  
Only fetched page 1 with hardcoded `page=1&limit=10`, ignoring `has_more` in response.  
**Why it mattered:**  
Only 10 out of 100 campaigns were processed → incomplete data sync.  
**Where in the code:**  
Hardcoded URL in campaigns fetch.

### Issue 3: No Retry Logic for Transient Failures
**What was wrong:**  
No retries on 503 Service Unavailable or timeout simulation.  
**Why it mattered:**  
Mock API returns 503 ~20% of the time and occasional timeouts → sync frequently failed completely.  
**Where in the code:**  
Direct `await fetch` without retry loop.

### Issue 4: No Rate Limit Handling
**What was wrong:**  
Ignored 429 responses and `retry-after` header.  
**Why it mattered:**  
After ~10 requests, API blocks for 60 seconds → sync stalls or fails.  
**Where in the code:**  
No status check for 429.

### Issue 5: Sequential Campaign Syncing
**What was wrong:**  
Processed campaigns one by one in a simple `for` loop.  
**Why it mattered:**  
Each `/sync` endpoint takes 2 seconds → 100 campaigns = over 3 minutes. Unnecessarily slow.  
**Where in the code:**  
Sequential `for` loop in Step 3.

### Issue 6: No Request Timeouts
**What was wrong:**  
`fetch` calls could hang indefinitely on simulated timeouts.  
**Why it mattered:**  
Script could freeze forever on 10% of requests that never respond.

---

## Part 2: How I Fixed It

### Fix 1: Secure Authentication
**My approach:**  
Moved credentials to environment variables using `process.env.AD_PLATFORM_EMAIL` and `AD_PLATFORM_PASSWORD`. Removed all logging of auth strings.  
**Why this approach:**  
Standard secure practice — secrets stay out of code and logs.  
**Trade-offs:**  
Requires `.env` file, but this is expected in real projects.

### Fix 2: Full Pagination
**My approach:**  
Implemented `while (hasMore)` loop that increments page until `has_more: false`.  
**Why this approach:**  
Guarantees all 100 campaigns are fetched regardless of page size.

### Fix 3 & 4: Retry Logic and Rate Limiting
**My approach:**  
Added retry loops with exponential backoff for 503s/timeouts, and explicit wait on 429 using `retry-after` header.  
**Why this approach:**  
Handles real-world transient failures gracefully without crashing.

### Fix 5: Parallel Syncing
**My approach:**  
Batched campaigns in groups of 5 and used `Promise.allSettled` for concurrent syncing.  
**Why this approach:**  
Dramatically reduced total time while avoiding overwhelming the API.

### Fix 6: Request Timeouts
**My approach:**  
Created `fetchWithTimeout` helper using `AbortController`.  
**Why this approach:**  
Prevents hanging forever on unresponsive requests.

---

## Part 3: Code Structure Improvements

**What I changed:**  
- Introduced constants at the top (`PAGE_SIZE`, `CONCURRENCY`, `REQUEST_TIMEOUT`)
- Created reusable helpers: `fetchWithTimeout` and `delay`
- Organized logic into clear sections with comments
- Used meaningful variable names and TypeScript interfaces

**Why it's better:**  
Code is now readable, maintainable, and easier to debug or extend. Separation of concerns improved through helpers.

**Architecture decisions:**  
Kept everything in one file for assignment simplicity, but structured it cleanly with functional style and pure helpers.

---

## Part 4: Testing & Verification

**Test scenarios I ran:**
1. Ran the sync script 8+ times with mock API active
2. Observed automatic retries on 503 errors
3. Confirmed rate limit handling (waited 60s automatically when hit)
4. Verified full pagination — consistently fetched 100 campaigns
5. Watched parallel syncing complete in ~30–60 seconds

**Expected behavior:**  
Script handles failures gracefully and syncs 95–100 campaigns reliably.

**Actual results:**  
Success rate 95–100%, total runtime under 1 minute, no crashes.

**Edge cases tested:**  
Rate limiting, multiple 503s, simulated timeouts — all handled without failure.

---

## Part 5: Production Considerations

### Monitoring & Observability
Track: total campaigns fetched/synced, success rate, duration, retry count. Alert if success rate <90%.

### Error Handling & Recovery
Add dead-letter queue for permanently failed campaigns and alerting on repeated failures.

### Scaling Considerations
For 100+ clients: run as scheduled jobs (e.g., via cron or queue system like BullMQ). Rate limit per client using `X-Client-ID`.

### Security Improvements
Use secret manager (AWS Secrets Manager, Vault) instead of .env in production. Proactive token refresh before expiry.

### Performance Optimizations
Cache campaign list if sync frequency is high. Add idempotency keys to prevent duplicate processing.

---

## Part 6: Limitations & Next Steps

**Current limitations:**  
- Still one large function (though well-structured)
- No proactive token refresh (relies on 1-hour expiry)
- No structured logging (uses console.log)

**What I'd do with more time:**  
- Split into modules: auth.ts, apiClient.ts, syncService.ts, database.ts
- Add winston/pino for structured logging
- Write unit/integration tests with Jest
- Add configuration validation (zod/env schema)

**Questions I have:**  
None — the assignment was clear and well-designed!

---

## Part 7: How to Run My Solution

### Setup
```bash
git clone https://github.com/abhishek9187/mixoads-backend-assignment.git
cd mixoads-backend-assignment
npm install
cd mock-api
npm install
cd ..
cp .env.example .env