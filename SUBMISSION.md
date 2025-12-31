Name: Mani Pal
Date: 31 Jan 2025
Time Spent: ~30–40 minutes
GitHub: https://github.com/justbytecode

Part 1: What Was Broken

This system intentionally simulates real-world ad platform constraints. Several production-critical issues prevented reliable syncing.

Issue 1: Campaign Sync Only Fetches First Page

What was wrong:
The sync logic fetched only page 1 of campaigns:

/api/campaigns?page=1&limit=10


Pagination (has_more) was logged but never used, resulting in only 10 out of 100 campaigns being synced.

Why it mattered:
90% of campaign data was silently ignored. In a real ad system, this would cause massive reporting gaps and billing errors.

Where in the code:
src/syncCampaigns.ts – campaign fetch logic

Issue 2: No Handling for Rate Limiting (429)

What was wrong:
The mock API enforces 10 requests per minute per client, but the sync loop made sequential API calls without backoff or retry logic.

Why it mattered:
Once the rate limit was hit, requests failed permanently. The sync would partially complete with no recovery.

Where in the code:
src/syncCampaigns.ts – campaign sync loop
Mock behavior defined in mock-api/server.js

Issue 3: Token Expiry Breaks Long-Running Syncs

What was wrong:
Access tokens expire after 1 hour, but the backend:

Did not track issued_at

Did not refresh tokens

Treated 401 Token expired as a fatal error

Why it mattered:
Any long-running or scheduled sync would fail unpredictably and require manual restart.

Where in the code:
src/syncCampaigns.ts – authentication handling
Mock behavior in mock-api/server.js

Issue 4: No Retry Strategy for 503 Errors and Timeouts

What was wrong:
The API intentionally returns:

503 errors (20% of requests)

Silent timeouts (10% of requests)

The client:

Did not retry

Failed immediately on timeout

Logged errors but continued inconsistently

Why it mattered:
Transient failures caused permanent data loss. This is unacceptable in ingestion pipelines.

Where in the code:
fetchWithTimeout and sync loop in src/syncCampaigns.ts

Issue 5: Unsafe SQL Query Construction

What was wrong:
SQL queries were built using string interpolation:

VALUES ('${campaign.id}', '${campaign.name}', ...)


Why it mattered:
This is vulnerable to SQL injection and breaks on malformed strings. It also prevents query plan reuse.

Where in the code:
src/database.ts

Issue 6: Database Connections Created Per Write

What was wrong:
A new Pool instance was created on every database write.

Why it mattered:
This does not scale and can exhaust database connections under load.

Where in the code:
getDB() in src/database.ts

Issue 7: Lack of Observability and Sync Metrics

What was wrong:
Logs were unstructured and provided no summary of:

Failures by type

Retry counts

Rate-limit events

Token refreshes

Why it mattered:
Operational visibility was extremely limited. Debugging production incidents would be difficult.

Where in the code:
Sync orchestration and logging throughout src/syncCampaigns.ts

Part 2: How I Fixed It
Fix 1: Full Pagination Support

My approach:
Implemented pagination handling using has_more and page counters to fetch all 10 pages (100 campaigns).

Why this approach:
Matches the API contract and ensures completeness.

Trade-offs:
Sequential pagination for clarity. Could be parallelized later.

Code changes:
Campaign fetch loop in src/syncCampaigns.ts

Fix 2: Rate Limit-Aware Syncing

My approach:
Detected 429 responses and respected retry_after before retrying requests.

Why this approach:
Prevents API blocking and aligns with real ad platform behavior.

Trade-offs:
Basic wait-based backoff. Adaptive strategies could be added later.

Fix 3: Token Refresh Handling

My approach:
Tracked token issue time and refreshed automatically on expiry or 401 Token expired.

Why this approach:
Allows long-running and scheduled syncs without human intervention.

Trade-offs:
Synchronous refresh for simplicity.

Fix 4: Retry Logic for 503s and Timeouts

My approach:
Added retries with limits and exponential backoff for:

503 errors

Request timeouts

Why this approach:
These failures are explicitly documented as transient in the mock API.

Trade-offs:
Retries are capped to avoid infinite loops.

Fix 5: Parameterized SQL Queries

My approach:
Replaced string interpolation with parameterized queries.

Why this approach:
Eliminates injection risk and improves database performance.

Trade-offs:
Slightly more verbose code.

Fix 6: Shared Database Connection Pool

My approach:
Created a single reusable pool instead of instantiating one per write.

Why this approach:
Improves scalability and aligns with PostgreSQL best practices.

Fix 7: Structured Logging and Sync Metrics

My approach:
Added:

Sync start/end logs

Success/failure counters

Retry and rate-limit logs

Why this approach:
Improves debuggability and production readiness.

Part 3: Code Structure Improvements

What I changed:
Separated responsibilities into:

API client logic

Auth handling

Sync orchestration

Persistence

Utilities

Why it's better:

Easier to test

Easier to extend

Clear ownership of logic

Architecture decisions:
Service-oriented, functional style for clarity and testability.

Part 4: Testing & Verification

Test scenarios I ran:

Full 100-campaign sync

Forced rate limiting (15 rapid requests)

Simulated 503 failures

Token expiry during sync

Repeated syncs to ensure idempotency

Expected behavior:
System recovers from failures and completes sync reliably.

Actual results:

100 campaigns synced

78/78 tests passing

No crashes or silent data loss

Edge cases tested:
Timeouts, partial failures, expired tokens, API slowness.

Part 5: Production Considerations
Monitoring & Observability

Sync success rate

Failure types

Retry counts

Sync duration

Error Handling & Recovery

Dead-letter queue for failed campaigns

Circuit breakers

Scaling Considerations

Background workers

Queue-based ingestion

Multi-tenant isolation

Security Improvements

Secret vaults

Token rotation

Audit logging

Performance Optimizations

Batched DB writes

Controlled concurrency

Part 6: Limitations & Next Steps

Current limitations:

No UI

No public API

Single-tenant

What I'd do with more time:

Scheduled hourly sync

REST API

Dashboard UI

WebSocket updates