# Backend Engineer Assignment - Submission

**Name:** Soumen Sarkar
**Date:** 31/12/2025
**Time Spent:** 4-5 Hrs
**GitHub:** https://github.com/soumens7

---

## Part 1: What Was Broken

List the major issues you identified. For each issue, explain what was wrong and why it mattered.

### Issue 1: Hardcoded & Insecure Authentication

**What was wrong:**  
API credentials (email/password) were hardcoded in the source code and printed to logs during execution.

**Why it mattered:**  
This is a serious security risk. Credentials could leak via logs, source control, or CI systems, and it makes rotating secrets impossible.

**Where in the code:**  
src/syncCampaigns.ts – authentication logic inside syncAllCampaigns

---

### Issue 2: Pagination Was Broken

**What was wrong:**  
The sync only fetched the first page (10 campaigns) even though the API contained 100 campaigns and provided pagination metadata.

**Why it mattered:**  
90% of campaign data was never synced, leading to incomplete and incorrect data.

**Where in the code:**  
src/syncCampaigns.ts – hardcoded request to page=1

---

### Issue 3: No Rate Limit Handling

**What was wrong:**  
The Ad Platform API enforces a strict 10 requests/min limit. The code did not handle HTTP 429 responses.

**Why it mattered:**  
Once the limit was exceeded, the sync would fail randomly and repeatedly.

**Where in the code:**  
All API fetch calls in syncCampaigns.ts

---

### Issue 4: No Retry Logic for Transient Failures

**What was wrong:**  
The API randomly returns 503 errors and timeouts, but the code did not retry failed requests.

**Why it mattered:**  
Temporary network or service issues caused permanent sync failures.

**Where in the code:**  
Campaign list fetch and campaign sync logic

---

### Issue 5: Timeout Handling Was Incorrect

**What was wrong:**  
The campaign sync endpoint intentionally takes ~2 seconds, but the timeout was set too low.

**Why it mattered:**  
Valid sync requests were aborted prematurely, causing false failures.

**Where in the code:**  
fetchWithTimeout usage in campaign sync

---

### Issue 6: Database Safety & Mocking

**What was wrong:**  
Database writes were attempted even during testing. The USE_MOCK_DB flag was not working because .env was not loaded correctly.

**Why it mattered:**  
Caused database errors during testing and made local development harder.

**Where in the code:**  
src/database.ts, .env loading in index.ts

---

## Part 2: How I Fixed It

For each issue above, explain your fix in detail.

### Fix 1: Authentication

**My approach:**  
Moved credentials to environment variables and removed sensitive logging.

**Why this approach:**  
This matches real production practices and allows secure secret rotation.

**Trade-offs:**  
None — this is strictly better.

**Code changes:**  
syncCampaigns.ts, .env, index.ts

---

### Fix 2: Pagination

**My approach:**  
Implemented a loop that fetches campaigns page-by-page until has_more === false.

**Why this approach:**  
It uses the API’s intended pagination mechanism and guarantees complete data.

**Trade-offs:**  
More requests → required proper rate-limit handling.

**Code changes:**  
fetchAllCampaigns() in syncCampaigns.ts

---

### Fix 3: Rate Limiting

**My approach:**  
Handled HTTP 429 responses using the Retry-After header, with a capped delay for local testing.

**Why this approach:**  
Respects server instructions while keeping the job moving during development.

**Trade-offs:**  
In production, I would not cap the delay.

**Code changes:**  
Campaign fetch & sync retry logic

---

### Fix 4: Retry Logic

**My approach:**  
Added retries for transient failures (429, 503, timeouts) with small backoffs.

**Why this approach:**  
Transient failures are expected in real APIs and should not fail the entire job.

**Trade-offs:**  
Retries increase runtime but improve reliability.

**Code changes:**  
Retry loops around fetch & sync calls

---

### Fix 5: Timeout Handling

**My approach:**
Used AbortController and increased sync timeout to 3000ms.

**Why this approach:**
Matches the API’s actual behavior (2s delay).

**Trade-offs:**
Slightly slower failure detection.

**Code changes:**
fetchWithTimeout usage

---

### Fix 6: Database & Mock Mode

**My approach:**
Ensured .env loads from project root and made USE_MOCK_DB reliably skip DB writes.

**Why this approach:**
Allows fast, safe testing without a real database.

**Trade-offs:**
Mock DB only logs instead of persisting data.

**Code changes:**
database.ts, .env placement, index.ts

---

## Part 3: Code Structure Improvements

Explain how you reorganized/refactored the code.

**What I changed:**  
 - Separated pagination logic into its own function - Centralized retry and timeout handling - Removed duplicated logic - Improved logging clarity

**Why it's better:**  
 - Easier to debug - Easier to extend - Logic is testable in isolation

**Architecture decisions:**  
Used simple functional modules instead of over-engineering with classes.

---

## Part 4: Testing & Verification

How did you verify your fixes work?

**Test scenarios I ran:**

1. Full sync of all 100 campaigns
2. Multiple runs to confirm retry stability
3. Forced rate-limit scenarios
4. Timeout and 503 simulations
5. Mock DB verification

**Expected behavior:**  
 • All campaigns fetched
• Sync completes without crashing
• Transient failures recover automatically

**Actual results:**  
 • 100 campaigns fetched and synced
• No crashes
• Stable behavior across runs

**Edge cases tested:**  
 • Rate limit bursts
• API timeouts
• Service unavailable responses

---

## Part 5: Production Considerations

What would you add/change before deploying this to production?

### Monitoring & Observability

    •	Metrics: sync duration, failure count, retry count
    •	Alerts on repeated failures or long runtimes

### Error Handling & Recovery

    •	Dead-letter queue for failed campaigns
    •	Resume from last successful campaign

### Scaling Considerations

    •	Queue-based sync (BullMQ / SQS)
    •	Controlled concurrency
    •	Token caching

### Security Improvements

    •	Secrets manager
    •	Remove stack traces from responses
    •	Encrypted DB connections

### Performance Optimizations

    •	Batch inserts
    •	Limited parallel syncs
    •	Connection pooling reuse

---

## Part 6: Limitations & Next Steps

Be honest about what's still not perfect.

**Current limitations:**  
	•	Sequential syncing (intentionally for safety)
	•	No automated tests

**What I'd do with more time:**  
	•	Add unit tests
	•	Add concurrency with limits
	•	Add structured logging

**Questions I have:**  
	•	Expected sync frequency?
	•	SLA for data freshness?
---

## Part 7: How to Run My Solution

Clear step-by-step instructions.

### Setup

```bash
npm install
cd mock-api && npm install
```

### Running

```bash
cd mock-api && npm start
npm start
```

### Expected Output

```
Fetched 100 campaigns
[MOCK DB] Saved campaign: campaign_1
...
Sync complete: 100/100 campaigns synced

Sync completed successfully!
```

### Testing

```bash
Run multiple times to observe retry & rate-limit handling
```

---

## Part 8: Additional Notes

This assignment closely resembles real-world third-party API integrations.
My focus was reliability, correctness, and clarity rather than over-engineering.

---

## Commits Summary

List your main commits and what each one addressed:

1. `[commit hash]` - [Description of what this commit fixed]
2. `[commit hash]` - [Description]
3. etc.

---

**Thank you for reviewing my submission!**
