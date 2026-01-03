# Backend Engineer Assignment - Submission

**Name:** Rajat Patil  
**Date:** 02 Jan 2026  
**Time Spent:** ~4.5 hours  
**GitHub:** Rajatpatil32

---

## Part 1: What Was Broken

### Issue 1: Hardcoded credentials and sensitive logging
**What was wrong:**  
The ad platform email and password were hardcoded in the source code, and authentication headers / access tokens were logged.

**Why it mattered:**  
This posed a serious security risk and made credential rotation impossible.

**Where in the code:**  
`src/syncCampaigns.ts`

---

### Issue 2: Incorrect application entry point
**What was wrong:**  
`index.ts` contained duplicated logic instead of acting as a clean entry point.

**Why it mattered:**  
This made execution flow confusing and unreliable.

**Where in the code:**  
`src/index.ts`

---

### Issue 3: Incorrect database assumptions
**What was wrong:**  
The code attempted to connect to PostgreSQL even though no database setup was provided.

**Why it mattered:**  
The project could not run out of the box.

**Where in the code:**  
`src/database.ts`

---

### Issue 4: Pagination not handled
**What was wrong:**  
Only the first page of campaigns was fetched despite pagination metadata.

**Why it mattered:**  
This caused incomplete data syncing.

**Where in the code:**  
`src/syncCampaigns.ts`

---

### Issue 5: Fragile external API handling
**What was wrong:**  
API calls assumed success and lacked timeouts or defensive checks.

**Why it mattered:**  
Transient failures could crash the entire job.

**Where in the code:**  
`src/syncCampaigns.ts`

---

### Issue 6: Single failure crashing the entire job
**What was wrong:**  
Failures during syncing caused the whole process to terminate.

**Why it mattered:**  
Batch systems must tolerate partial failures.

**Where in the code:**  
`src/syncCampaigns.ts`

---

### Issue 7: Missing configuration validation
**What was wrong:**  
Required environment variables were not validated before execution.

**Why it mattered:**  
This caused unclear runtime failures.

**Where in the code:**  
`src/syncCampaigns.ts`

---

## Part 2: How I Fixed It

**My approach:**  
- Removed hardcoded secrets and sensitive logs  
- Used environment variables with fail-fast validation  
- Refactored `index.ts` as a clean entry point  
- Replaced unused DB dependency with an in-memory store  
- Implemented pagination handling  
- Added request timeouts and defensive API checks  
- Isolated per-campaign failures  
- Handled rate limits gracefully  

**Why this approach:**  
Focused on correctness, resilience, and clarity without over-engineering.

**Trade-offs:**  
- In-memory storage is not persistent  
- Retries were intentionally omitted to keep scope focused  

**Code changes:**  
`src/index.ts`, `src/syncCampaigns.ts`, `src/database.ts`

---

## Part 3: Code Structure Improvements

**What I changed:**  
- `index.ts` → entry point  
- `syncCampaigns.ts` → business logic  
- `database.ts` → data layer (mocked)

**Why it's better:**  
Clear separation of concerns and improved maintainability.

**Architecture decisions:**  
Functional structure suitable for a background sync job.

---

## Part 4: Testing & Verification

**Test scenarios I ran:**
1. Multiple sync runs for stability  
2. Missing credentials (fail-fast)  
3. API timeouts and failures  
4. HTTP 429 rate limiting  

**Expected behavior:**  
Job should not crash and should handle failures gracefully.

**Actual results:**  
Job completed safely with correct logging and behavior.

**Edge cases tested:**  
- Missing config  
- API timeouts  
- Rate limits  
- Invalid campaign data  

---

## Part 5: Production Considerations

### Monitoring & Observability
- Track sync duration and error rates  
- Alert on repeated auth failures  

### Error Handling & Recovery
- Add retries with backoff  
- Persist failed campaigns  

### Scaling Considerations
- Controlled concurrency  
- Job queues for multi-client scale  

### Security Improvements
- Secrets manager  
- Credential rotation  

### Performance Optimizations
- Batch DB writes  
- Token caching  

---

## Part 6: Limitations & Next Steps

**Current limitations:**  
- In-memory storage  
- No retries  

**What I'd do with more time:**  
- Structured logging  
- Retry strategy  
- Concurrency limits  

**Questions I have:**  
- Expected campaign volume per client?  
- Is persistence required between runs?

---

## Part 7: How to Run My Solution

Clear step-by-step instructions to run and verify the project locally.

### Setup
```bash
# Install backend dependencies
npm install

# Install mock API dependencies
cd mock-api
npm install
```

### Running
```bash
# How to start everything

# Terminal 1: Start the mock Ad Platform API
cd mock-api
npm start

# Terminal 2: Start the backend sync job (from project root)
npm run dev

```

### Expected Output
```
# What should you see when it works?


> mixoads-backend-assignment@1.0.0 dev
> ts-node-dev --respawn src/index.ts

[INFO] 13:56:08 ts-node-dev ver. 2.0.0 (using ts-node ver. 10.9.2, typescript ver. 5.9.3)
🚀 Starting campaign sync job...

🔐 Authenticating with Ad Platform...
✅ Authenticated successfully

📦 Fetching campaigns...
   🔄 Syncing campaign campaign_1
   ❌ Failed to sync campaign campaign_1: The user aborted a request.
   🔄 Syncing campaign campaign_2
   ❌ Failed to sync campaign campaign_2: The user aborted a request.
   🔄 Syncing campaign campaign_3
   ❌ Failed to sync campaign campaign_3: The user aborted a request.
   🔄 Syncing campaign campaign_4
   ❌ Failed to sync campaign campaign_4: The user aborted a request.
   🔄 Syncing campaign campaign_5
   ❌ Failed to sync campaign campaign_5: The user aborted a request.
   🔄 Syncing campaign campaign_6
   ❌ Failed to sync campaign campaign_6: The user aborted a request.
   🔄 Syncing campaign campaign_7
   ❌ Failed to sync campaign campaign_7: The user aborted a request.
   🔄 Syncing campaign campaign_8
   ❌ Failed to sync campaign campaign_8: The user aborted a request.
   🔄 Syncing campaign campaign_9
   ❌ Failed to sync campaign campaign_9: The user aborted a request.
   🔄 Syncing campaign campaign_10
   ❌ Failed to sync campaign campaign_10: Sync API returned error
⚠️ Rate limited while fetching campaigns (page 2). Stopping sync gracefully.

📊 Total campaigns synced: 0

✅ Campaign sync finished successfully
```

### Testing
```bash
# How to verify it's working correctly

# Re-run the job multiple times to verify stability
npm run dev

# Run without environment variables to verify fail-fast behavior
unset AD_PLATFORM_EMAIL
npm run dev

```

---

## Part 8: Additional Notes

Any other context, thoughts, or reflections on the assignment.

This assignment focuses on building a resilient background synchronization service rather than forcing successful outcomes.
The mock API intentionally introduces failures (timeouts, rate limits, and errors), and the goal was to ensure the system behaves safely, predictably, and without crashing under real-world failure conditions.

I intentionally avoided adding unnecessary infrastructure (such as web servers, queues, or databases) to keep the solution aligned with the scope of the assignment.

---

## Commits Summary

List your main commits and what each one addressed:

1. `[e0f5233]` - [Fix stability issues, improve sync resilience, and clean up structure]

---

**Thank you for reviewing my submission!**
