# Backend Engineer Assignment - Submission

**Name:** G V KArthik
**Date:** 2025-12-28
**Time Spent:** ~2 hours  
**GitHub:** https://github.com/GVKarthik-dev/mixoads-backend-assignment

---

## Part 1: What Was Broken

### Issue 1: Exposed Credentials
**What was wrong:**  
Credentials (email, password) were hardcoded directly in `src/syncCampaigns.ts` and logged to the console during execution.

**Why it mattered:**  
This is a critical security vulnerability. Secrets in source code can leak via version control. Logging secrets exposes them to anyone with access to logs (e.g., in CI/CD or logging platforms).

**Where in the code:**  
`src/syncCampaigns.ts` lines 43-48.

---

### Issue 2: Lack of Error Handling
**What was wrong:**  
The code lacked `try/catch` blocks around network requests and blindly assumed successful responses (calling `.json()` on error responses). Code crashed immediately on any network or API error.

**Why it mattered:**  
The service was fragile and would crash in production upon any transient issue, requiring manual intervention to restart.

**Where in the code:**  
Throughout `src/syncCampaigns.ts`.

---

### Issue 3: Ignored Rate Limitations & No Retries
**What was wrong:**  
The code made requests without respecting the 10 requests/minute limit. It did not handle HTTP 429 responses or implement any retry logic for 503s or network blips.

**Why it mattered:**  
The sync process failed consistently as soon as it hit the rate limit or any network jitter, processing only a fraction of the data.

**Where in the code:**  
`src/syncCampaigns.ts` loop logic.

---

### Issue 4: Broken Pagination
**What was wrong:**  
The code only fetched the first page of campaigns (`page=1`) and processed them. It ignored the `pagination.has_more` field.

**Why it mattered:**  
Data incompleteness – only 10% of campaigns (10 out of 100) were ever synced.

**Where in the code:**  
`src/syncCampaigns.ts` line 66 (single fetch).

---

### Issue 5: SQL Injection Vulnerability & Duplicates
**What was wrong:**  
Code constructed SQL queries by concatenating strings: `VALUES ('${campaign.id}'...)`. Also, it performed simple `INSERT`s without checking for existing records.

**Why it mattered:**  
String concatenation allows SQL injection functionality if campaign data is malicious. Simple INSERTs cause duplicate key errors if the sync runs twice.

**Where in the code:**  
`src/database.ts` lines 23-28.

---

## Part 2: How I Fixed It

### Fix 1: Secure Authentication
**My approach:**  
Created a dedicated `authService` that reads credentials strictly from environment variables. Removed all console logs of sensitive data.

**Why this approach:**  
Following the 12-factor app methodology for config separation.

**Code changes:**  
`src/services/authService.ts`, `src/index.ts`.

---

### Fix 2: Robust API Client
**My approach:**  
Implemented a generic `fetchWithRetry` utility. It handles 429 responses (respecting `Retry-After`), retries on 503s/network errors, and includes exponential backoff.

**Why this approach:**  
Centralizes resilience logic, making all API calls (auth, fetch, sync) robust by default.

**Trade-offs:**  
Increased complexity in the fetch wrapper. Processing is slower due to backoff waits, but reliable.

**Code changes:**  
`src/utils/apiClient.ts`.

---

### Fix 3: Pagination & Concurrency Control
**My approach:**  
Created `campaignService.ts` which loops through pages while `has_more` is true. Reduced concurrency to 1 request at a time to strictly adhere to the 10 req/min limit without overwhelming the retry logic.

**Why this approach:**  
Ensures complete data accuracy. Sequential/Low-concurrency processing is necessary due to the extremely strict rate limit.

**Code changes:**  
`src/services/campaignService.ts`.

---

### Fix 4: Database Safety
**My approach:**  
Refactored DB layer to use a singleton `Pool`. Used parameterized queries (`$1, $2`) for safety. Implemented `ON CONFLICT DO UPDATE` (Upsert) to handle idempotency.

**Why this approach:**  
Prevents SQL injection completely. Allows the sync job to be re-run safely without errors or duplicates.

**Code changes:**  
`src/db/index.ts`.

---

## Part 3: Code Structure Improvements

**What I changed:**  
Refactored the monolithic script into:
- `src/db`: Database connection and queries.
- `src/services`: Business logic (Auth, Campaigns).
- `src/utils`: Shared utilities (API Client).
- `src/index.ts`: Clean entry point.

**Why it's better:**  
Separation of concerns makes the code testable and maintainable. The API client is reusable. Database logic is isolated.

---

## Part 4: Testing & Verification

**Test scenarios I ran:**
1.  **Full Sync**: Successfully synced campaigns against the Mock API.
2.  **Rate Limiting**: Verified warnings in logs "Rate limit hit. Retrying in Xms..." and successful recovery.
3.  **Idempotency**: Verified code uses `ON CONFLICT` logic.

**Expected behavior:**  
Process starts, logs progress, waits when rate limited, and exits with success message.

**Actual results:**  
Sync handles rate limits gracefully, waiting (e.g., ~16s) when necessary, and proceeds.

---

## Part 5: Production Considerations

### Monitoring & Observability
-   **Metrics**: Track sync success/failure rates, API latency, and 429 occurrence freq.
-   **Logging**: Use structured logging (JSON) for ingestion by tools like Datadog/Splunk.

### Error Handling & Recovery
-   **Dead Letter Queue (DLQ)**: If a specific campaign fails permanently, send to DLQ for manual inspection.

### Scaling Considerations
-   **Queue-based Architecture**: For 100+ clients, move to a Producer-Consumer model with queues (e.g., SQS/RabbitMQ).
-   **Rate Limiting**: Use Redis to manage distributed rate limits if running multiple workers.

### Security Improvements
-   **Secret Management**: Use AWS Secrets Manager or Vault instead of plain `.env` files in production.

---

## Part 6: Limitations & Next Steps

**Current limitations:**  
-   **Speed**: Strictly limited by the upstream API's 10 req/min.
-   **Memory**: Loading all campaigns into memory arrays.

**What I'd do with more time:**  
-   Implement a stream-based processing.
-   Add unit tests (Jest) for the services.

---

## Part 7: How to Run My Solution

### Setup
```bash
# Clone and install
git clone <repo>
cd mixoads-backend-assignment
npm install

# Setup Env
cp .env.example .env
```

### Running Logic
1.  **Mock API** (Terminal 1):
    ```bash
    cd mock-api
    npm install && npm start
    ```
2.  **Sync Service** (Terminal 2):
    ```bash
    npm start
    ```

### Expected Output
```
Starting Mixo Ads Campaign Sync Service
============================================================
...
Sync complete! Processed X/X campaigns successfully.
============================================================
```

---
