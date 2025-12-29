# Backend Engineer Assignment - Submission

**Name:** Kushagra Sharma \
**Date:** Mon, Dec 29, 2025 \
**Time Spent:** ~4 Hours \
**GitHub:** TheDarkArtist

---

## Part 1: What Was Broken

#### Issue 1: Hardcoded credentials and sensitive data logging

**What was wrong:**
The sync logic hardcodes API credentials directly in source code and logs both the Base64-encoded Basic Authorization header and the issued Bearer access token to stdout.

**Why it mattered:**
This results in immediate credential exposure via logs and source control, violating basic security hygiene. In a real production system this would constitute a critical incident requiring key rotation and log scrubbing.

**Where in the code:**
Authentication logic and logging in `syncAllCampaigns` (`src/syncCampaigns.ts`).

---

#### Issue 2: Incomplete pagination leading to data loss

**What was wrong:**
The campaign fetch logic retrieves only the first page of results and ignores the pagination metadata (`has_more`, `total`). As a result, only 10 of the expected 100 campaigns are processed.

**Why it mattered:**
This causes silent data loss and incorrect business state, which is more dangerous than explicit failures because it may go unnoticed.

**Where in the code:**
Campaign fetching logic in `syncAllCampaigns` (`src/syncCampaigns.ts`).

---

#### Issue 3: No rate limit handling despite explicit API constraints

**What was wrong:**
The client makes sequential API requests without any awareness of the platform’s enforced rate limit (10 requests per minute). Responses with HTTP 429 are not handled, and the `retry-after` signal is ignored.

**Why it mattered:**
Under realistic conditions the sync process will reliably exceed rate limits, resulting in cascading failures and incomplete syncs.

**Where in the code:**
All API request paths in `syncAllCampaigns` (`src/syncCampaigns.ts`).

---

#### Issue 4: Missing retry strategy for transient failures

**What was wrong:**
The API intentionally returns transient 503 errors and simulated timeouts, but the client does not implement retries, exponential backoff, or jitter. Failures are either thrown or logged and skipped.

**Why it mattered:**
This makes the sync process non-deterministic and unreliable, producing different results across runs for the same input.

**Where in the code:**
API request handling and sync loop in `syncAllCampaigns` (`src/syncCampaigns.ts`).

---

#### Issue 5: Incorrect timeout configuration

**What was wrong:**
The campaign sync endpoint intentionally responds after ~2 seconds, while the client timeout for the same request is configured to 1 second. This guarantees avoidable timeouts under normal operation.

**Why it mattered:**
Artificially short timeouts amplify failure rates and mask true performance characteristics of the system.

**Where in the code:**What was wrong: Authentica
`fetchWithTimeout` usage during campaign sync (`src/syncCampaigns.ts`).

---

#### Issue 6: Unsafe and inefficient database access patterns

**What was wrong:**
A new database connection pool is created per insert, queries are constructed using string interpolation, and there is no deduplication or idempotency guarantee.

**Why it mattered:**
This can lead to connection leaks, SQL injection vulnerabilities, duplicate records, and poor scalability.

**Where in the code:**
Database access logic in `saveCampaignToDB` (`src/database.ts`).

---

#### Issue 7: Overloaded “god function” architecture

**What was wrong:**
Authentication, API communication, retry logic, business orchestration, persistence, and logging are all implemented within a single function.

**Why it mattered:**
This tight coupling increases cognitive load, makes testing difficult, and raises the risk that fixing one issue introduces regressions elsewhere.

**Where in the code:**
`syncAllCampaigns` (`src/syncCampaigns.ts`).

---

## Part 2: How I Fixed It

For each issue above, explain your fix in detail.

### Fix 1: Authentication security

**My approach:**
Removed hardcoded API credentials from source code and loaded them from environment variables. Eliminated logging of authorization headers and access tokens, and added fail-fast validation when required configuration is missing.

**Why this approach:**
Credential exposure is the highest-severity issue in the system. Fixing it first reduces immediate security risk without altering request flow or business logic.

**Trade-offs:**
The authentication mechanism itself (Basic auth → Bearer token) remains unchanged to match API requirements. Token refresh logic is intentionally deferred.

**Code changes:**
`src/syncCampaigns.ts`

---

### Fix 2: Pagination correctness

**My approach:**
Replaced the single-page campaign fetch with an explicit pagination loop that continues requesting pages until the API indicates no more data via `has_more`.

**Why this approach:**
This is the minimal change required to ensure correctness and prevent silent data loss. It preserves the existing request pattern and avoids introducing concurrency or rate-limit complexity prematurely.

**Trade-offs:**
Pagination is handled sequentially for simplicity. Performance optimizations and rate-limit-aware batching are intentionally deferred.

**Code changes:**
`src/syncCampaigns.ts`

---

### Fix 3: Rate limiting and retry handling (Issues 3 & 4)

**My approach:**
Introduced a centralized request execution path that applies bounded retries with exponential backoff and jitter. Added client-side request pacing to ensure the API’s documented rate limit (10 requests per minute) is never exceeded, including during retries.

**Why this approach:**
Retry logic alone reacts to failures but does not prevent rate limit violations. By enforcing a minimum interval between all outgoing requests, the client proactively respects API constraints and avoids repeated 429 responses.

**Trade-offs:**
The implementation is intentionally conservative and sequential, favoring correctness and predictability over throughput. More advanced approaches (token buckets, adaptive concurrency) were intentionally avoided to keep behavior explicit and debuggable.

**Code changes:**
`src/syncCampaigns.ts`

---

### Fix 4: Timeout policy cleanup

**My approach:**
Centralized all request timeout behavior behind a single, explicitly named configuration value. Ensured that authentication, read, and write requests share the same timeout policy for consistency and predictability.

**Why this approach:**
Timeout values are a core part of system behavior and should be explicit and easy to reason about. Centralizing the policy avoids hidden duplication and makes future tuning safer.

**Trade-offs:**
A single timeout value was chosen for simplicity. With more time, different request classes could justify distinct timeout budgets.

**Code changes:**
`src/syncCampaigns.ts`

---

### Fix 5: Database correctness and idempotency

**My approach:**
Reworked the database layer to use a single shared connection pool and parameterized SQL queries. Added idempotent write behavior using `ON CONFLICT` to ensure repeated syncs are safe.

**Why this approach:**
Database writes must be safe under retries and re-runs. Idempotent upserts prevent duplicate data and allow partial failures to be retried without manual cleanup. Parameterized queries eliminate SQL injection risk.

**Trade-offs:**
This solution assumes a uniqueness constraint on `campaigns.id`. Schema migrations and transactional batching were intentionally avoided to keep the fix focused and minimal.

**Code changes:**
`src/database.ts`

---

## Part 3: Code Structure Improvements

### Structural refactor: Decomposing the sync workflow

**What I changed:**
Split the monolithic sync function into focused, single-purpose units:
- `getAccessToken` for authentication
- `fetchAllCampaigns` for pagination
- `syncCampaign` for per-campaign execution

The main `syncAllCampaigns` function now acts as a thin orchestrator.

**Why it's better:**
This reduces cognitive load, makes individual behaviors easier to test in isolation, and limits the blast radius of future changes. The refactor preserves existing behavior while improving clarity.

**Architecture decisions:**
Chose functional decomposition over new abstractions or class hierarchies to keep the system simple and explicit.

---

### Why I did not split the code into multiple files

Although the sync logic was decomposed into clear, single-responsibility units, I intentionally avoided file-level modularization at this stage.

File boundaries represent a long-term API commitment. In the context of a single-purpose sync job with one execution path and no current reuse pressure, introducing additional files would add indirection without reducing complexity. Keeping the logic co-located preserves readability, makes control flow easy to follow, and minimizes speculative abstraction.

If this code were to be reused by multiple jobs, shared with a web service, or expanded with additional sync strategies, the existing functional boundaries make it straightforward to extract stable modules into separate files without refactoring behavior.

---

## Part 4: Testing & Verification

I verified the fixes by running the sync process end-to-end against the provided mock API under different failure scenarios.

**Test scenarios I ran:**
1. Ran the full campaign sync multiple times to verify idempotency and ensure no duplicate records were created.
2. Observed behavior under simulated 503 errors during pagination and campaign sync to validate retry and backoff logic.
3. Verified client-side rate limiting by inspecting mock API logs to ensure requests were paced at ~1 request per 6 seconds.
4. Restarted the sync mid-run and re-ran it to confirm partial progress could be safely retried.
5. Ran with `USE_MOCK_DB=true` and with a real database connection to verify persistence behavior.

**Expected behavior:**
- All campaigns are eventually fetched and synced.
- Transient failures (503, timeouts) are retried automatically.
- API rate limits are respected and 429 responses are avoided.
- Re-running the sync does not create duplicate database records.
- The process fails fast on unrecoverable errors (e.g., auth failures).

**Actual results:**
- Pagination completed across all pages without data loss.
- Transient failures were retried and recovered successfully.
- Requests were consistently spaced ~6 seconds apart, respecting the API rate limit.
- All campaigns were synced successfully without duplication.
- Failures were explicit and actionable when they occurred.

**Edge cases tested:**
- Missing environment variables for authentication.
- Simulated API outages during pagination.
- Re-running the sync after partial completion.

---

## Part 5: Production Considerations

Before deploying this system to production, I would address the following areas.

### Monitoring & Observability
- Track request rate, retry counts, and error rates (by status code).
- Monitor sync duration and per-campaign latency.
- Alert on sustained failure rates, repeated auth failures, or prolonged sync runtimes.

### Error Handling & Recovery
- Persist sync progress checkpoints to allow resumable execution.
- Add structured error logging with correlation IDs.
- Introduce dead-letter handling for campaigns that repeatedly fail.

### Scaling Considerations
- For 100+ clients, a single sequential worker would become a bottleneck.
- Introduce per-client isolation and controlled concurrency with a global rate limiter.
- Move sync execution to a job queue with worker pools.

### Security Improvements
- Rotate credentials automatically and support token refresh.
- Store secrets in a secure secret manager instead of environment variables.
- Add audit logging for sync operations.

### Performance Optimizations
- Batch database writes where safe.
- Parallelize campaign syncs within rate-limit constraints.
- Cache pagination results where appropriate.


---

## Part 6: Limitations & Next Steps

**Current limitations:**
- Sync execution is intentionally sequential and slow due to strict rate limiting.
- Timeout and retry policies are static and not adaptive.
- No persistent checkpointing of sync progress.
- Limited test coverage beyond manual and integration testing.

**What I’d do with more time:**
- Add automated integration tests with fault injection.
- Introduce resumable sync checkpoints.
- Implement adaptive concurrency with a token-bucket rate limiter.
- Extract the API client into a reusable module if reuse pressure emerges.

**Questions I have:**
- Are campaign syncs expected to be strictly ordered?
- Is eventual consistency acceptable for downstream consumers?
- Are there plans to support incremental or delta-based syncs?

---

## Part 7: How to Run My Solution
Mixo Ads - Backend Challenge
About Mixo Ads
Mixo Ads is transforming AI-driven advertising for multi-location brands. We partner with major U.S. companies and government organizations to automate and optimize ad campaigns at scale.We're a lean, high-impact startup where speed, creativity, and experimentation matter. If you enjoy building data-heavy products and turning complex data into elegant UI, we'd love to see what you build.
Please find the details of the technical assignment below
Questions: hari@mixoads.com
ASSIGNMENT DETAILS
Repository: https://github.com/Mixo-Ads/mixoads-backend-assignment
Time Estimate: 4-5 hours
HOW TO SUBMIT

1. Fork the repository
  - Visit: https://github.com/Mixo-Ads/mixoads-backend-assignment
  - Click "Fork" button (top right)
2. Clone your fork
  git clone https://github.com/YOUR_USERNAME/mixoads-backend-assignment.git
  cd mixoads-backend-assignment
3. Follow setup instructions in README.md
  - Install dependencies
  - Start the mock API
  - Run the broken code
  - Identify what's wrong
4. Fix the issues and complete SUBMISSION.md
  - Fix critical bugs
  - Improve code structure
  - Document your approach thoroughly
5. Push your changes to your fork
  git add .
  git commit -m "Fix bugs and improve structure"
  git push origin main
6. Submit Pull Request
  - Go back to: https://github.com/Mixo-Ads/mixoads-backend-assignment
  - Click "Pull requests" → "New pull request"
  - Click "compare across forks"
  - Select your fork as the source
  - Title: "Backend Engineer Assignment - [Your Name]"
  - Submit PR
IMPORTANT NOTES
- Use any tools you normally use at work (ChatGPT, Claude, Copilot, Stack Overflow, documentation)
- We're testing your problem-solving approach and understanding, not memorization
- After submission, selected candidates will have a 30-45 minute technical review call to discuss your solution
- We'll walk through your code, discuss design decisions, and talk about trade-offs

Clear step-by-step instructions.

### Setup
```bash
# Clone the repository
git clone https://github.com/TheDarkArtist/mixoads-backend-assignment.git
cd mixoads-backend-assignment

# Install dependencies
npm install

# Create environment file
cp .env.example .env
```

### Running

The application loads configuration from `.env` using `dotenv`.
You may either edit `.env` directly or export variables manually.

```bash
# Terminal 1: start the mock API
cd mock-api
npm install
npm start
```

```bash
# Terminal 2: run the sync job
cd ..
export AD_PLATFORM_EMAIL=admin@mixoads.com
export AD_PLATFORM_PASSWORD=SuperSecret123!
export USE_MOCK_DB=true

npm start
```

Alternatively, environment variables can be set manually:

```bash
export AD_PLATFORM_API_URL=http://localhost:3001
export AD_PLATFORM_EMAIL=admin@mixoads.com
export AD_PLATFORM_PASSWORD=SuperSecret123!
export USE_MOCK_DB=true

npm start
```


### Expected Output

```
Syncing campaigns from Ad Platform...
Fetched 100 campaigns
Sync complete: 100/100 campaigns synced
```

You should also observe:

* Requests paced at ~1 request every 6 seconds
* No repeated 429 rate-limit errors
* Successful retries after simulated 503 errors
* Campaigns being saved once, even across re-runs

### Testing

```bash
# Re-run the sync to verify idempotency and retry safety
npm start
```

```bash
# Optional: run with a real database instead of the mock
unset USE_MOCK_DB
export DB_HOST=localhost
export DB_PORT=5432
export DB_NAME=mixoads
export DB_USER=postgres
export DB_PASSWORD=postgres

npm start
```


---

## Part 8: Additional Notes

I treated this assignment less like a checklist exercise and more like a small production system that I might actually have to wake up for if it broke. The focus was deliberately on correctness, resilience, and respecting external constraints before worrying about speed or structure.

Most changes were made incrementally and committed in isolation to keep the evolution of the system easy to review and reason about. Where the solution is intentionally conservative (sequential execution, strict rate limiting), that was a conscious trade-off in favor of predictability and debuggability over raw throughput.

Overall, the goal was to leave the code in a state where failures are boring, behavior is explainable, and future changes don’t feel scary. If this were to grow beyond the scope of the assignment, the existing boundaries should make that evolution straightforward rather than painful.


---

## Commits Summary

1. `bde2f32` — Document initial failure analysis
   Identified and documented critical security, correctness, and reliability issues in the starter code, focusing on production impact and failure modes. No code changes.

2. `18360a6` — Remove hardcoded credentials and sanitize logs
   Eliminated hardcoded API credentials, moved secrets to environment variables, and removed logging of sensitive authentication data to address a critical security flaw.

3. `ccef16e` — Fix pagination to fetch all campaigns
   Corrected campaign fetching logic to iterate through all paginated results, preventing silent data loss caused by only processing the first page.

4. `f2cec44` — Enforce client-side request pacing
   Added retry logic with exponential backoff and implemented strict client-side rate limiting to respect the API’s 10 requests per minute constraint and avoid repeated 429 errors.

5. `0280648` — Centralize and document request timeout policy
   Introduced a single, explicit timeout configuration for all HTTP requests, removing duplicated and implicit timeout behavior while preserving runtime semantics.

6. `860126a` — Make campaign persistence safe and idempotent
   Reworked the database layer to use a shared connection pool, parameterized SQL queries, and idempotent upserts to prevent duplicate data, SQL injection, and connection leaks.

7. `88acd08` — Decompose sync logic into focused units
   Refactored the monolithic sync function into clear, single-responsibility units for authentication, pagination, and campaign syncing, improving readability and testability without changing behavior.


---

**Thank you for reviewing my submission!**
