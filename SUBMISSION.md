# Backend Engineer Assignment - Submission

**Name:** Ayush Raja  
**Date:** 29-Dec-2025  
**Time Spent:** ~8 hours  
**GitHub:** AyushRaja5  

---

## Part 1: What Was Broken

### Issue 1: Authentication Hardcoded
**What was wrong:**  
Credentials were hardcoded and logged in `index.ts`. No environment variable usage.

**Why it mattered:**  
*Security risk* – exposing credentials. Not flexible for production.

**Where in the code:**  
`index.ts`, `auth.ts` (originally in main function)

---

### Issue 2: Rate Limiting Not Handled
**What was wrong:**  
API requests were sequential, hitting the 10 requests/min limit, causing 429 errors.

**Why it mattered:**  
*Many campaigns failed to sync*, unreliable operation.

**Where in the code:**  
`syncCampaigns.ts` (original), `processCampaign` function

---

### Issue 3: Pagination Broken
**What was wrong:**  
Only first page (10 campaigns) fetched, total 100 campaigns ignored.

**Why it mattered:**  
*Incomplete data syncing.*

**Where in the code:**  
`syncCampaigns.ts`, `fetchAllCampaigns` function

---

### Issue 4: No Retry or Backoff
**What was wrong:**  
Transient API errors (503, timeouts) would stop sync immediately.

**Why it mattered:**  
*Sync process unreliable.*

**Where in the code:**  
`syncCampaigns.ts`, `processCampaign` and `fetchAllCampaigns`

---

### Issue 5: Database Duplicates & Connection Handling
**What was wrong:**  
`database.ts` opened new Pool each call, SQL was prone to duplicates (`INSERT` without `ON CONFLICT`).

**Why it mattered:**  
*Resource leaks and duplicate entries.*

**Where in the code:**  
`database.ts`, `saveCampaignToDB`

---

## Part 2: How I Fixed It

### Fix 1: Environment-based Authentication
**My approach:**  
Moved credentials to environment variables and used `getAccessToken()` module.

**Why this approach:**  
No sensitive info in code; production-ready.

**Trade-offs:**  
Requires env setup before running.

**Code changes:**  
`auth.ts`, `syncCampaigns.ts` (commit `e16ab1e`)

---

### Fix 2: Rate-Limit Handling
**My approach:**  
Implemented per-request handling of 429 responses using `retry-after`. Added adaptive wait instead of fixed sleep.

**Why this approach:**  
Prevents hammering API, respects rate limits.

**Trade-offs:**  
Sync may pause if hitting rate limit, but safe.

**Code changes:**  
`syncCampaigns.ts`, `processCampaign` (commit `3b66d51`)

---

### Fix 3: Pagination + Batch Processing
**My approach:**  
`fetchAllCampaigns` loops through pages until `has_more=false`. Campaigns processed in batches of 5.

**Why this approach:**  
*Complete syncing, faster with batch concurrency.*

**Trade-offs:**  
Memory usage increases slightly with large campaigns array.

**Code changes:**  
`syncCampaigns.ts` (commit `0745e67`)

---

### Fix 4: Retry Logic & Exponential Backoff
**My approach:**  
Retries for transient errors (503, timeout), with incremental backoff: 1s, 2s, 3s.

**Why this approach:**  
*Improves reliability on flaky endpoints.*

**Trade-offs:**  
Sync takes slightly longer on failing pages.

**Code changes:**  
`syncCampaigns.ts` (commit `3b66d51`)

---

### Fix 5: Database Improvements
**My approach:**  
- Singleton Pool to prevent connection leaks.  
- `ON CONFLICT (id) DO NOTHING` to avoid duplicates.

**Why this approach:**  
*Reliable DB writes, no leaks, prevents duplicate campaigns.*

**Trade-offs:**  
Simple conflict handling; does not update existing records.

**Code changes:**  
`database.ts` (commit `1280440`)

---

### Fix 6: Code Structure & Types
**My approach:**  
- Separated concerns: `auth.ts`, `apiClient.ts`, `types.ts`, `database.ts`, `syncCampaigns.ts`.  
- Added `Campaign` interface.  

**Why this approach:**  
*Improved readability, testability, maintainability.*

**Trade-offs:**  
More files, but cleaner modular structure.

**Code changes:**  
Commit `e16ab1e`

---

## Part 3: Code Structure Improvements

**What I changed:**  
- `auth.ts` → handles authentication  
- `apiClient.ts` → handles API calls and pagination  
- `database.ts` → handles DB operations  
- `types.ts` → campaign type  
- `syncCampaigns.ts` → orchestrates sync logic  

**Why it's better:**  
*Separation of concerns, easier testing, clearer responsibilities.*

**Architecture decisions:**  
Functional style, batch processing, retry/backoff patterns.

---

## Part 4: Testing & Verification

**Test scenarios I ran:**  
1. Full sync of 100 campaigns with mock API.  
2. Simulated 429 rate limit – verified backoff.  
3. Simulated 503 errors – verified retries.  
4. Mock DB enabled – logs confirmed campaign saves.  

**Expected behavior:**  
All campaigns fetched and synced, retries handled automatically.

**Actual results:**  
All 100 campaigns synced successfully, rate limits respected, transient errors retried.

**Edge cases tested:**  
- Rate-limit hits  
- API timeouts  
- Duplicate campaigns  

---

## Part 5: Production Considerations

### Monitoring & Observability
- Track API request counts, sync success/failure  
- Alert on repeated 503 or DB errors  

### Error Handling & Recovery
- Already added retries and backoff  
- Could add alert emails on repeated failures  

### Scaling Considerations
- Batch size configurable  
- Can run multiple workers for 100+ clients  

### Security Improvements
- Environment-based credentials  
- Do not log sensitive info  

### Performance Optimizations
- Batch processing  
- Concurrent DB writes  

---

## Part 6: Limitations & Next Steps

**Current limitations:**  
- DB insert ignores updates (`ON CONFLICT DO NOTHING`)  
- No logging service  

**What I'd do with more time:**  
- Add proper logging (winston/pino)  
- Update campaigns if changed  
- Add unit/integration tests  

**Questions I have:**  
- Could a more advanced backoff strategy improve throughput further?

---

## Part 7: How to Run My Solution

### Setup
```bash
git clone https://github.com/AyushRaja5/mixoads-backend-assignment.git
cd mixoads-backend-assignment
npm install
cp .env.example .env
# Step-by-step commands
```

### Running
```bash
# How to start everything
```

### Expected Output
```
# What should you see when it works?
```

### Testing
```bash
# How to verify it's working correctly
```

---

## Part 8: Additional Notes

Any other context, thoughts, or reflections on the assignment.

[Your thoughts here]

---

## Commits Summary

List your main commits and what each one addressed:

1. `[commit hash]` - [Description of what this commit fixed]
2. `[commit hash]` - [Description]
3. etc.

---

**Thank you for reviewing my submission!**
