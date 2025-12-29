# Backend Engineer Assignment - Submission

**Name:** Mohd Shadab
**Date:** 2025-12-28
**Time Spent:** ~2.5 hour
**GitHub:** https://github.com/shaad82663

---

## Part 1: What Was Broken

I started by running the application end-to-end to observe failures in real execution before touching the code.

### Issue 1: Hardcoded Credentials

**What was wrong:**
Credentials (email, password) were hardcoded directly in `src/syncCampaigns.ts` and encoded inline.

**Why it mattered:**
Security risk. If the code is committed to version control, credentials are compromised.

**Where in the code:**
`src/syncCampaigns.ts` (lines 218-219 originally).

---

### Issue 2: No Rate Limit Handling

**What was wrong:**
The code did not check for `429 Too Many Requests` status codes and had no backoff mechanism.

**Why it mattered:**
The application would get banned or fail to sync data when the API limit (10 req/min) was reached.

**Where in the code:**
`src/syncCampaigns.ts` (fetch logic).

---

### Issue 3: Broken Pagination

**What was wrong:**
The code only fetched the first page (`page=1&limit=10`) and ignored `pagination.has_more`.

**Why it mattered:**
Data loss. Only 10% of the campaigns (10 out of 100) were being synced.

**Where in the code:**
`src/syncCampaigns.ts`.

---

### Issue 4: Database Connection Leaks & Inefficiency

**What was wrong:**
A new `pg.Pool` was created for _every single database operation_ and never closed properly.

**Why it mattered:**
Resource exhaustion. The application would quickly run out of database connections and crash.

**Where in the code:**
`src/database.ts`.

---

### Issue 5: SQL Injection Vulnerability

**What was wrong:**
SQL queries were constructed using string concatenation (`VALUES ('${campaign.id}', ...)`).

**Why it mattered:**
Security risk. Malicious input in campaign names could execute arbitrary SQL commands.

**Where in the code:**
`src/database.ts` (saveCampaignToDB).

---

### Issue 6: No Error Handling or Retries

**What was wrong:**
The sync process would crash on the first error (network, 5xx, or 503 from the mock API) with no recovery.

**Why it mattered:**
Reliability. Transient network issues or API instability would cause the entire sync job to fail.

**Where in the code:**
`src/syncCampaigns.ts`.

---

### Issue 7: Overloaded Function (Single-Responsibility Violation)

**What was wrong:**
All logic (auth, API calls, DB saves, loops) was squashed into a single `syncAllCampaigns` function.

**Why it mattered:**
Maintainability. The code was hard to read, test, and debug.

**Where in the code:**
`src/syncCampaigns.ts`.

---

## Part 2: How I Fixed It

### Fix 1: Environment Variables & Deployment

**My approach:**
Moved credentials to `.env`. Updated `dotenv` configuration.

**Why this approach:**
Standard best practice for 12-factor apps. Keeps secrets out of code.

**Code changes:**
`src/index.ts`, `src/services/campaignSyncService.ts`.

---

### Fix 2: Robust Rate Limiting

**My approach:**
Implemented a `fetchWithRetry` wrapper that checks for `429` status. If hit, it parses the `Retry-After` header and sleeps for that duration before retrying.

**Why this approach:**
This shows how I’ve handled real-world rate limits in production systems where APIs are shared and failure isn’t an option.

**Code changes:**
`src/services/campaignSyncService.ts`.

---

### Fix 3: Full Pagination Support

**My approach:**
Added a `while(hasMore)` loop in `syncAll` to fetch pages sequentially until `has_more` is false.

**Why this approach:**
Ensures complete data synchronization.

**Code changes:**
`src/services/campaignSyncService.ts`.

---

### Fix 4: Database Connection Pooling & Security

**My approach:**
Implemented a singleton `Pool` instance in `src/config/db.ts`. Switched to parameterized queries (`$1, $2`) and used `ON CONFLICT DO UPDATE` for upserts.

**Why this approach:**

- Singleton: Efficient resource usage.
- Parameterized: Prevents SQL injection.
- Upsert: Idempotency (safe to run sync multiple times).

**Code changes:**
`src/config/db.ts`, `src/repositories/campaignRepository.ts`.

---

### Fix 5: Architecture Refactor

**My approach:**
Split the codebase into `services`, `repositories`, `config`, and `utils`.

**Why this approach:**
Separation of concerns makes the code modular, testable, and easier to maintain.

**Code changes:**
Created `src/services/campaignSyncService.ts`, `src/repositories/campaignRepository.ts`.

---

## Part 3: Code Structure Improvements

**What I changed:**

- **`src/config/db.ts`**: Database connection management.
- **`src/services/campaignSyncService.ts`**: Business logic (Auth, API interactions, Sync orchestration).
- **`src/repositories/campaignRepository.ts`**: Data persistence.
- **`src/utils/logger.ts`**: Logging utility.
- **`src/types/index.ts`**: TypeScript interfaces.

**Why it's better:**

- **Separation of Concerns:** DB logic is separate from API logic.
- **Reusability:** The repository functions can be reused by other services.
- **Maintainability:** Smaller, focused files are easier to understand.

**Architecture decisions:**

- **Service-Repository Pattern:** Standard pattern for backend applications to decouple business logic from data access.
- **Singleton Database Pool:** Ensures we don't leak connections.

---

## Part 4: Testing & Verification

### Test scenarios I ran:

1. **Full Sync:** Ran `npm start` multiple times. Verified that subsequent runs update existing records (via logs) instead of crashing on duplicates.
2. **Rate Limit Handling:** Observed logs showing "Rate limit hit. Waiting 60s..." and confirming the process paused and resumed automatically.
3. **Database Integrity:** checked `docker exec ... psql` to confirm row counts match expected values (multiples of page size).
4. **Resilience:** The Mock API throws random 503s. Verified logs show "Server error 503. Retrying..." and successful recovery.

### Expected behavior:

The script starts, authenticates, fetches pages 1-10, waits when rate-limited, inserts/updates records, and finishes with a success message.

### Actual results:

Matches expected behavior. Handles the heavy 60s rate limit of the Mock API gracefully.

---

## Part 5: Production Considerations

### Containerization & Deployment

- PostgreSQL and the Mock API are containerized using Docker to provide a consistent and reproducible local environment.
- This avoids local setup issues, ensures identical database behavior across machines, and makes the sync process easier to run and test.
- **In production**, the application itself can also be deployed as a container and orchestrated using Kubernetes for scalability, rollout control, and fault isolation.

### Monitoring & Observability

- **Metrics:** Track sync duration, success/failure rate, records processed per second.
- **Alerts:** Alert on `sync_failed` (after retries) or if `last_synced` timestamp is > X hours.
- **Health Checks:** Add a `/health` endpoint if this were a long-running server.

### Error Handling & Recovery

- **Dead Letter Queue (DLQ):** If a specific campaign fails to sync repeatedly (e.g., data validation error), save it to a DLQ for manual inspection instead of failing the page.
- **Circuit Breaker:** If the Ad Platform is down for a long time, stop trying for a while.

### Scaling Considerations

- **Concurrency:** Currently parallelizes within a page. For 100+ clients, we'd process different clients in parallel workers (e.g., BullMQ).
- **Batch Inserts:** If volume grows, switch back to batch inserts (handled carefully to avoid head-of-line blocking if APIs are individual).

### Security Improvements

- **Secret Management:** Use AWS Secrets Manager or Vault instead of `.env` files in production.
- **Least Privilege:** DB user should only have `INSERT/UPDATE` rights on specific tables.

---

## Part 6: Limitations & Next Steps

**Current limitations:**

- **Head-of-Line Blocking (in Batch Mode):** I reverted to single inserts because batch mode meant one slow API call blocked the DB save for 9 others. In a high-throughput system, we'd decouple fetching and saving with a queue.
- **Console Logs:** While we use Winston, we are logging to files on the local FS. In production, we'd ship these to ELK/Datadog.

**What I'd do with more time:**

- **Unit Tests:** Add Jest tests for `CampaignSyncService` mocking the fetch calls.
- **Queue System:** Introduce a job queue (like Bull) to decouple "fetching data" from "saving data`.

---

## Part 7: How to Run My Solution

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Setup environment
cp .env.example .env

# 3. Start Infrastructure (Postgres + Mock API)
npm run docker
```

### Running

```bash
# Run the sync process
npm start
```

### Expected Output

```
info: Starting campaign sync application...
info: Authenticating...
info: Page synced {"page": 1, "successCount": 10...}
warn: Rate limit hit. Waiting 60s...
...
info: Sync completed {"totalSynced": 100}
```

### Testing

```bash
# Verify DB data (in another terminal)
docker exec mixoads_postgres psql -U postgres -d mixoads -c "SELECT count(*) FROM campaigns;"
```

---

**Thank you for taking the time to review my submission. I’m happy to walk through any part of the implementation or discuss trade-offs during the review call.**
