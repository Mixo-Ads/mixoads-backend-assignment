#Backend Engineer Assignment - Submission
Name: Kalash
Date: 15 Dec 2025
Time Spent: 5–6 hours
GitHub: kalashpal

Part 1: What Was Broken
Issue 1: Hardcoded credentials and sensitive logging
What was wrong:
The Ad Platform credentials (admin@mixoads.com / SuperSecret123!) were hardcoded directly inside the sync logic, and the basic auth header (Basic <base64>) was printed to the console.

Why it mattered:
This exposes secrets in source control and logs, which is a serious security risk and makes rotation/configuration impossible across environments.

Where in the code:

src/syncCampaigns.ts – hardcoded email and password, logging Using auth: Basic ....

Issue 2: No retry logic and broken timeout handling for sync endpoint
What was wrong:
The sync job called POST /api/campaigns/:id/sync with a 1 second timeout, even though the mock endpoint intentionally takes ~2 seconds and sometimes times out or fails. When the request timed out or failed, there was no retry mechanism and the error was just logged as “Request timeout”.

Why it mattered:
Most sync attempts failed, so only a small subset of campaigns were actually synced. A single transient network glitch or slow response caused data not to be synced, which is unacceptable for a production sync job.

Where in the code:

Original syncAllCampaigns function – used fetchWithTimeout(..., 1000) directly for the sync endpoint without retries and then moved on.

Issue 3: API rate limiting not respected (10 req/min)
What was wrong:
The client fired requests as fast as possible without any client-side rate limiting. It did not recognize or respond to HTTP 429 “Too Many Requests” responses or the retry-after header from the mock API.

Why it mattered:
The mock API enforces a 10 requests per minute limit and returns 429 with a retry-after hint. Ignoring this causes repeated rate-limit hits, wasted requests, and eventually failed syncs under real traffic patterns.

Where in the code:

Original sync logic – used plain fetch without any rate-limiting logic or specific handling for 429 responses.

Issue 4: Pagination only fetched first page (10/100 campaigns)
What was wrong:
The code requested GET /api/campaigns?page=1&limit=10 once, logged the first 10 campaigns, and then stopped. It ignored pagination.has_more and the page value in the response and never iterated over pages 2–10.

Why it mattered:
There are 100 campaigns in the mock API, but only the first page was ever fetched and synced. This means 90% of the data was always missing in the database.

Where in the code:

Original syncAllCampaigns function – a single request to /api/campaigns?page=1&limit=10 with no loop over pages.

Issue 5: Unsafe and duplicate-prone database writes
What was wrong:
The insert query used string interpolation directly in the SQL, and it did not handle duplicates. There was no ON CONFLICT clause or primary key enforcement at this layer, so running the sync multiple times could create duplicated rows.

Why it mattered:
String interpolation makes the code vulnerable to SQL injection if any campaign fields ever come from external input, and it also leads to inconsistent data (multiple rows for the same campaign ID) when the sync job is run repeatedly.

Where in the code:

src/database.ts – INSERT INTO campaigns (...) VALUES ('${campaign.id}', '${campaign.name}', ...) without parameterization or conflict handling.

Issue 6: God function and mixed concerns
What was wrong:
The original syncAllCampaigns function handled everything: authentication, HTTP calls, pagination, retry behavior, and database inserts. It also mixed business logic, IO, and error handling in one long function.

Why it mattered:
This made the code hard to understand, test, and extend. There was no clear separation of concerns (auth vs API client vs DB vs sync logic), and it would be difficult to reuse parts of the logic or write focused unit tests.

Where in the code:

src/syncCampaigns.ts – single large function containing all logic end-to-end.

Issue 7: No structured error handling for API failures
What was wrong:
Failures from the authentication endpoint, campaign listing endpoint, or sync endpoint were either thrown without context or just printed and ignored. There was no consistent error handling strategy or structured logging around the HTTP status codes and body.

Why it mattered:
On failure, it was hard to know whether the problem was rate limiting, a 5xx from the API, a timeout, or a bad token. That makes debugging painful and production monitoring nearly impossible.

Where in the code:

src/syncCampaigns.ts – try/catch blocks missing or too generic, only throwing raw errors or logging plain strings.

Part 2: How I Fixed It
Fix 1: Move credentials to environment variables and remove sensitive logging
My approach:
I removed hardcoded credentials and instead read them from environment variables AD_PLATFORM_EMAIL and AD_PLATFORM_PASSWORD. The auth logic was moved into a dedicated authClient.ts module, which constructs the Basic auth header and obtains a bearer token. Sensitive values (email, password, base64 auth string, token) are no longer logged.

Why this approach:
Using environment variables is the standard way to manage secrets in backend services and allows different credentials per environment without code changes. Keeping secrets out of logs and source control follows basic security best practices.

Trade-offs:
Local setup requires a .env file or environment variables to be configured. This is a small extra step but necessary for secure deployments.

Code changes:

New src/authClient.ts to encapsulate token acquisition and caching.

Removed hardcoded credentials and Using auth: Basic ... logging from the old syncAllCampaigns function.

Fix 2: Add timeout + retry with exponential backoff for transient failures
My approach:
I created a shared fetchWithTimeoutAndRetry function in httpClient.ts. It wraps fetch with:

A configurable timeout using AbortController.

Retries for network errors, timeouts, and 5xx responses (like 503).

Exponential backoff between retries (baseDelayMs * 2^attempt).

The sync endpoint (POST /api/campaigns/:id/sync) now uses this helper with a timeout greater than 2 seconds (the mock’s known delay) and multiple retries.

Why this approach:
Exponential backoff with limited retries is a widely recommended pattern for transient errors such as timeouts and 503s. It avoids hammering the service while still making the system resilient to temporary issues.

Trade-offs:
Retries increase the total runtime of the job under adverse network conditions. There is a balance between resilience and runtime; I capped retries to a reasonable number (e.g., 5) to avoid unbounded delays.

Code changes:

New src/httpClient.ts with fetchWithTimeout and fetchWithTimeoutAndRetry.

authClient.ts, campaignApiClient.ts, and syncService.ts now use this centralized helper instead of raw fetch.

Fix 3: Respect API rate limiting and handle 429 with backoff
My approach:
Inside httpClient.ts, I added:

A simple client-side rate limiter that tracks request timestamps and ensures no more than 10 requests per minute leave the client.

Logic to detect HTTP 429 responses, read the retry-after/Retry-After header, and sleep for that period before retrying.

On the server side (mock API), I set a Retry-After header on 429 responses so the client can follow the recommendation.

Why this approach:
Honoring 429 with Retry-After matches common API conventions and ensures the client behaves politely under enforced limits. It also makes the behavior predictable in both local and production environments.

Trade-offs:
Waiting the full retry-after duration can make the job slower when rate limits are exceeded (in the mock, up to 60 seconds per hit). In a real system, it might be better to spread requests more evenly using a queue or concurrency limits.

Code changes:

httpClient.ts: client-side limiter and 429 handling with backoff.

mockServer.js: set Retry-After header on 429 responses.

Fix 4: Implement proper pagination to fetch all 100 campaigns
My approach:
I created campaignApiClient.ts with a fetchCampaignPage(page) function and a fetchAllCampaigns() function. It:

Calls /api/campaigns?page=X&limit=10.

Pushes all results into an array.

Uses pagination.has_more from the response to decide whether to continue.

Loops pages 1..N until has_more is false.

Why this approach:
This pattern is generic and matches many real-world APIs that use page/limit and a has_more flag. It also keeps pagination logic in one place and makes it easy to test and reuse.

Trade-offs:
Fetching all 100 campaigns sequentially is straightforward but not the fastest approach. If performance became a problem, it would be possible to parallelize with care for rate limits.

Code changes:

New src/campaignApiClient.ts with fetchCampaignPage and fetchAllCampaigns.

syncService.ts now receives the full list of campaigns from fetchAllCampaigns().

Fix 5: Safe, idempotent DB writes with parameterized queries and upsert
My approach:
I refactored saveCampaignToDB to:

Use a shared Pool instance from pg for connection management.

Use parameterized queries ($1, $2, ...) instead of string interpolation to prevent SQL injection.

Use ON CONFLICT (id) DO UPDATE so re-running the sync updates existing campaigns instead of inserting duplicates.

Why this approach:
Parameterization is the standard protection against SQL injection. Using upsert semantics makes the sync idempotent, which is essential for reliable periodic jobs. A shared connection pool avoids connection leaks and improves performance.

Trade-offs:
This assumes campaigns.id is a unique key in the DB schema. If the schema differs, the conflict target might need to be adjusted.

Code changes:

src/database.ts: global Pool, parameterized insert with ON CONFLICT, proper client.release() in finally.

Fix 6: Split the god function into focused modules
My approach:
I reorganized the code into modules:

authClient.ts – token acquisition and caching.

httpClient.ts – shared HTTP logic (timeout, retries, rate limiting, 429 handling).

campaignApiClient.ts – campaigns list API + remote sync endpoint.

database.ts – Postgres connection and campaign persistence.

syncService.ts – business logic for syncing all campaigns.

index.ts – CLI entrypoint that wires everything together.

Why this approach:
Each module has a single responsibility, which improves readability, testability, and reusability. It also makes it easier to swap implementations (for example, using a different HTTP client or DB) without touching business logic.

Trade-offs:
There are more files, but each file is smaller and easier to reason about. For a simple assignment this can feel like extra structure, but it is aligned with how a production service would be organized.

Code changes:

New modules listed above; syncAllCampaigns moved into syncService.ts and now delegates to the other modules.

Fix 7: Consistent error handling and logging
My approach:
I added:

Structured logs around major steps (auth, pagination, sync, DB writes).

Try/catch blocks around the main syncAllCampaigns flow and within per-campaign sync so a single failure does not crash the whole job.

Clear error messages that include context (which URL failed, which campaign ID failed, which HTTP status was returned).

Why this approach:
Clear, consistent logging is critical in production for debugging and monitoring. It also makes it easier to see from logs that 503s and 429s are being handled correctly and that all 100 campaigns were eventually synced.

Trade-offs:
Logging can become noisy in very busy systems; in a real system, it would be useful to add log levels and filter them.

Code changes:

syncService.ts, httpClient.ts, authClient.ts: structured logging and contextual error messages.

index.ts: top-level error catch with proper exit code.

Part 3: Code Structure Improvements
What I changed:

Split the single large script into separate modules:

authClient.ts – encapsulates Basic auth and bearer token management.

httpClient.ts – shared HTTP utilities (timeout, retries, rate limiting, 429).

campaignApiClient.ts – API-specific functions for campaigns (listing and sync).

database.ts – database pooling and safe campaign persistence.

syncService.ts – orchestrates fetching all campaigns and syncing them.

index.ts – CLI entrypoint that runs syncAllCampaigns.

Why it's better:

Clear separation of concerns: each module has one main responsibility.

Easier to unit test: for example, campaignApiClient can be tested with a mocked HTTP client, and database can be tested with a test DB or a mock.

Improved readability: the main sync flow reads as a high-level sequence instead of a 100+ line god function.

Architecture decisions:

Kept a simple functional style with plain functions per module rather than heavy class-based abstractions. This keeps the code straightforward while still modular.

Used a shared HTTP client and DB pool as simple singletons to avoid overengineering while still matching common Node.js backend patterns.

Part 4: Testing & Verification
Test scenarios I ran:

Run sync once with mock DB enabled to verify all 100 campaigns are fetched and synced:

USE_MOCK_DB=true npm start

Run sync multiple times to ensure idempotency and no duplicate inserts:

Repeat npm start several times.

Trigger rate limiting and 429 handling by letting the sync job run through all 100 campaigns and observing Received 429. Waiting ... logs.

Observe behavior on random 503s and timeouts from the mock API for both list and sync endpoints (they are simulated in the mock).

Expected behavior:

All 10 pages (100 campaigns) are fetched.

Some calls occasionally hit 503 or 429, but the client retries and eventually succeeds.

The job completes with Sync complete: 100/100 campaigns synced.

Re-running the sync does not create duplicates in the campaigns table.

Actual results:

Logs show pages 1–10 fetched successfully and Total campaigns fetched: 100.

Logs show retry on 503 for listing (e.g., page 5 and 9) and success after backoff.

During syncing, multiple campaigns hit 429, and logs show Received 429. Waiting 60000ms before retrying... followed by successful sync for the same campaign.

Final output: Sync complete: 100/100 campaigns synced and Sync completed successfully!.

Edge cases tested:

Multiple runs with the same DB (mock and real) to validate upsert behavior and idempotency.

Behavior when AD_PLATFORM_EMAIL or AD_PLATFORM_PASSWORD is missing (auth fails with a clear error).

Behavior when the mock API is down (client retries and eventually fails with a clear error message).

Part 5: Production Considerations
Monitoring & Observability
Metrics to track:

Number of campaigns synced per run.

Duration of sync runs.

Count of HTTP 5xx and 429 responses, by endpoint.

DB query latency and error rate.

Logs:

Structured logs (JSON) with correlation IDs per run.

Separate log levels (info/warn/error) to help filter noise.

Alerts:

Alert on repeated sync failures.

Alert on unusually high 5xx/429 rates.

Alert on sync duration exceeding a threshold.

Error Handling & Recovery
Add a “dead-letter” mechanism for campaigns that consistently fail to sync after max retries, so they can be inspected and retried manually.

Implement a circuit breaker around the remote API if it fails continuously.

Support partial reruns (e.g., resync campaigns updated since a timestamp).

Scaling Considerations
For 100+ clients:

Run syncs via a job queue with worker processes to control concurrency.

Apply per-client rate limiting and backoff to avoid global bottlenecks.

Consider sharding DB writes and using batch inserts for performance.

Use horizontal scaling for the sync workers and DB connection pooling sized for the workload.

Security Improvements
Store secrets in a secrets manager (e.g., AWS Secrets Manager, HashiCorp Vault) instead of plain .env in production.

Enforce TLS for all API calls and DB connections.

Implement stricter input validation and output encoding around any data persisted or logged.

Performance Optimizations
Process campaigns in small concurrent batches (respecting rate limits) instead of strictly sequential syncs.

Use bulk inserts/updates where appropriate if the DB is the bottleneck.

Cache stable campaign attributes between runs if the API cost is high.

Part 6: Limitations & Next Steps
Current limitations:

The sync job is still mostly sequential; with a large number of campaigns or clients, it can be slow.

Rate limiting is implemented in-process and per-instance; a distributed system would need a central limiter.

Logging is console-based and not integrated with a centralized logging/metrics stack.

What I'd do with more time:

Add proper integration tests using a test database and a mocked HTTP server.

Introduce a configuration system (e.g., config module or typed config) instead of directly using process.env.

Implement concurrent sync with a small pool size using a library like p-limit to speed up large syncs while still respecting rate limits.

Add a simple dashboard/metrics endpoint for monitoring.



Part 7: How to Run My Solution
Setup
bash
# Install dependencies
npm install

# Copy environment template and adjust values
cp .env.example .env

# Edit .env with your values (example):
# AD_PLATFORM_API_URL=http://localhost:3001
# AD_PLATFORM_EMAIL=admin@mixoads.com
# AD_PLATFORM_PASSWORD=SuperSecret123!
# DB_HOST=localhost
# DB_PORT=5432
# DB_NAME=mixoads
# DB_USER=postgres
# DB_PASSWORD=postgres
# USE_MOCK_DB=true   # for testing without a real DB
# CLIENT_ID=sync-service

# Start the mock Ad Platform API
npm run mock-api
If using a real Postgres database:

bash
# Create database and campaigns table (example)
createdb mixoads

psql mixoads <<'SQL'
CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  budget NUMERIC,
  impressions INTEGER,
  clicks INTEGER,
  conversions INTEGER,
  created_at TIMESTAMP,
  synced_at TIMESTAMP
);
SQL
Running
bash
# Run the sync job
npm start
Expected Output
You should see something like:

text
Starting campaign sync...
============================================================
Syncing campaigns from Ad Platform...
============================================================
Fetching all campaigns with pagination...
Requesting new access token...
Access token acquired successfully
Fetched page 1: 10 campaigns, has_more=true
...
Fetched page 10: 10 campaigns, has_more=false
Total campaigns fetched: 100

Step 3: Syncing campaigns to database and remote sync endpoint...

  Syncing: Campaign 1 (ID: campaign_1)
      [MOCK DB] Saved campaign: campaign_1
  Successfully synced Campaign 1
  ...
============================================================
Sync complete: 100/100 campaigns synced
============================================================
Sync completed successfully!
You may also see occasional lines like:

text
HTTP 503 from ... Retrying in 500ms (attempt 1/5)...
Received 429. Waiting 60000ms before retrying...
These indicate the retry and rate-limiting logic is working.

Testing
bash
# 1. Run with mock DB
USE_MOCK_DB=true npm start

# 2. Run multiple times to confirm idempotent upserts (with real DB)
USE_MOCK_DB=false npm start
USE_MOCK_DB=false npm start

# 3. Observe logs for:
# - 503 handling and retries
# - 429 handling and Retry-After waits
# - "Sync complete: 100/100 campaigns synced"



## Commits Summary

1. `abc1234` – Fix authentication, pagination, retries, DB upsert, rate limiting, and refactor into separate modules.


Thank you for reviewing my submission!