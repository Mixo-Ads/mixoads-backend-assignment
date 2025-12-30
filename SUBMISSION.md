# Backend Engineer Assignment - Submission

**Name:** Aman Singh  
**Date:** December 30, 2025  
**Time Spent:** ~2.5 hours  
**GitHub:** https://github.com/devamansingh-ai/Aman-shingham

---

## Part 1: What Was Broken

### Issue 1: Hardcoded Credentials and Security Exposure
**What was wrong:**  
Credentials (`admin@mixoads.com` / `SuperSecret123!`) were hardcoded directly in `syncCampaigns.ts` (lines 43-44). Additionally, the base64-encoded auth string was being logged to the console (line 48), exposing sensitive credentials.

**Why it mattered:**  
- **Security risk**: Credentials in source code can be committed to version control
- **No flexibility**: Can't use different credentials for different environments
- **Compliance**: Violates security best practices for credential management
- **Logging exposure**: Credentials visible in logs could be accessed by unauthorized users

**Where in the code:**  
`src/syncCampaigns.ts` lines 43-48

---

### Issue 2: Broken Pagination - Only Fetched First 10 Campaigns
**What was wrong:**  
The code only fetched the first page of campaigns (10 out of 100 total). It made a single request to `/api/campaigns?page=1&limit=10` and never checked `pagination.has_more` or fetched subsequent pages.

**Why it mattered:**  
- **Data loss**: 90% of campaigns were never synced
- **Incomplete sync**: System appeared to work but was missing most data
- **Business impact**: Campaigns not in database couldn't be analyzed or optimized

**Where in the code:**  
`src/syncCampaigns.ts` line 66 - only fetched page 1

---

### Issue 3: No Rate Limiting Handling
**What was wrong:**  
The API has a rate limit of 10 requests per minute, but the code made no attempt to handle 429 (Too Many Requests) responses. When rate limited, requests would fail immediately without retrying.

**Why it mattered:**  
- **Sync failures**: Any sync with more than 10 requests would fail
- **No resilience**: System couldn't handle API constraints
- **Poor user experience**: Failures without clear error messages

**Where in the code:**  
`src/syncCampaigns.ts` - no handling for 429 status codes

---

### Issue 4: No Retry Logic for Transient Failures
**What was wrong:**  
The mock API randomly returns 503 (Service Unavailable) errors (~20% of requests) and timeouts (~10% of requests). The original code had no retry mechanism, so any transient failure would cause the entire sync to fail.

**Why it mattered:**  
- **Unreliability**: Random failures would kill the entire job
- **No resilience**: Single point of failure for transient issues
- **Production risk**: Real APIs have transient issues; system would be unusable

**Where in the code:**  
`src/syncCampaigns.ts` - no retry logic for 503 or timeout errors

---

### Issue 5: SQL Injection Vulnerability
**What was wrong:**  
Database queries used string interpolation instead of parameterized queries. Values were directly inserted into SQL strings using template literals (e.g., `'${campaign.id}'`).

**Why it mattered:**  
- **Security vulnerability**: Malicious campaign names could execute arbitrary SQL
- **Data corruption risk**: Special characters in campaign names could break queries
- **Compliance**: Violates OWASP security guidelines

**Where in the code:**  
`src/database.ts` lines 23-28 - string interpolation in SQL query

---

### Issue 6: Database Connection Leaks
**What was wrong:**  
A new database connection pool was created on every `saveCampaignToDB` call, and connections were never closed. This would exhaust database connections over time.

**Why it mattered:**  
- **Resource exhaustion**: Database connections are limited
- **Performance degradation**: Creating new pools is expensive
- **System crashes**: Eventually the database would reject new connections

**Where in the code:**  
`src/database.ts` - `getDB()` created new Pool on every call, no connection cleanup

---

### Issue 7: No Duplicate Handling
**What was wrong:**  
The INSERT query had no `ON CONFLICT` clause, so attempting to sync the same campaign twice would fail with a duplicate key error.

**Why it mattered:**  
- **Idempotency**: Re-running sync would fail on already-synced campaigns
- **No updates**: Couldn't update existing campaign data
- **Error handling complexity**: Had to manually check for duplicates

**Where in the code:**  
`src/database.ts` - simple INSERT without conflict handling

---

### Issue 8: Monolithic God Function
**What was wrong:**  
All logic was crammed into a single `syncAllCampaigns()` function (100+ lines) that handled authentication, API calls, error handling, database operations, and business logic.

**Why it mattered:**  
- **Untestable**: Can't unit test individual components
- **Unmaintainable**: Changes require modifying a massive function
- **Not reusable**: Can't reuse auth or API client logic elsewhere
- **Poor separation of concerns**: Violates SOLID principles

**Where in the code:**  
`src/syncCampaigns.ts` - entire file was one function doing everything

---

### Issue 9: Poor Error Handling
**What was wrong:**  
Errors were caught but not properly handled. Some errors would crash the entire process, while others were silently ignored. No distinction between retryable and non-retryable errors.

**Why it mattered:**  
- **Unclear failures**: Hard to debug what went wrong
- **No recovery**: System couldn't recover from transient issues
- **Poor observability**: No structured logging or error tracking

**Where in the code:**  
Throughout `src/syncCampaigns.ts` - inconsistent error handling

---

### Issue 10: No Timeout Handling
**What was wrong:**  
While there was a `fetchWithTimeout` helper, it had a 1-second timeout for sync endpoints that take 2 seconds, causing unnecessary failures. Also, no timeout for the initial auth request.

**Why it mattered:**  
- **False failures**: Requests would timeout before API could respond
- **Hanging requests**: Without timeouts, requests could hang indefinitely
- **Resource waste**: Long-running requests consume resources

**Where in the code:**  
`src/syncCampaigns.ts` line 99 - 1000ms timeout for 2000ms endpoint

---

## Part 2: How I Fixed It

### Fix 1: Authentication Security

**My approach:**  
- Created `src/config.ts` to centralize configuration management
- Moved credentials to environment variables with sensible defaults
- Removed all credential logging
- Added validation that warns (but doesn't fail) if using defaults

**Why this approach:**  
- Environment variables are the standard for credential management
- Defaults allow the code to work out-of-the-box for development
- Warning alerts developers without breaking functionality
- Centralized config makes it easy to change settings

**Trade-offs:**  
- Defaults are convenient but could be a security risk if deployed without proper env vars
- Could use a secrets manager in production (AWS Secrets Manager, etc.)
- With more time: Add validation that fails in production mode

**Code changes:**  
- Created `src/config.ts` - centralized configuration
- Modified `src/auth.ts` - removed credential logging, uses config
- Updated `src/syncCampaigns.ts` - removed hardcoded credentials

---

### Fix 2: Complete Pagination

**My approach:**  
- Implemented a while loop that continues fetching pages until `has_more` is false
- Tracks current page number and accumulates all campaigns
- Handles errors gracefully - if some pages fail, continues with what was fetched

**Why this approach:**  
- Simple and straightforward - follows the API's pagination design
- Resilient - doesn't fail completely if one page fails
- Clear logging shows progress through pages

**Trade-offs:**  
- Sequential fetching is slower than parallel, but respects rate limits
- With more time: Could implement parallel page fetching with rate limit awareness

**Code changes:**  
- `src/syncCampaigns.ts` lines 19-43 - pagination loop
- `src/apiClient.ts` - `fetchCampaignsPage()` function for reusable page fetching

---

### Fix 3: Rate Limiting with Exponential Backoff

**My approach:**  
- Created `makeRequest()` function in `apiClient.ts` that checks for 429 status
- Reads `retry-after` header from response
- Waits the specified time before retrying
- Respects max retry count to avoid infinite loops

**Why this approach:**  
- Follows HTTP standards (429 with retry-after header)
- Respects API's rate limit guidance
- Prevents overwhelming the API with retries

**Trade-offs:**  
- Waiting 60 seconds can slow down syncs significantly
- With more time: Could implement token bucket or sliding window rate limiting client-side

**Code changes:**  
- `src/apiClient.ts` lines 36-50 - rate limit detection and handling

---

### Fix 4: Retry Logic with Exponential Backoff

**My approach:**  
- Implemented exponential backoff for 503 errors and timeouts
- Formula: `delay = baseDelay * 2^retryCount` (1s, 2s, 4s)
- Maximum of 3 retries to prevent infinite loops
- Clear logging shows retry attempts

**Why this approach:**  
- Exponential backoff is industry standard for transient failures
- Prevents thundering herd problem
- Balances quick recovery with API protection

**Trade-offs:**  
- 3 retries might not be enough for very unstable APIs
- Fixed max retries - could be configurable
- With more time: Add jitter to prevent synchronized retries

**Code changes:**  
- `src/apiClient.ts` lines 52-61 (503 handling), 73-82 (timeout handling)

---

### Fix 5: SQL Injection Prevention

**My approach:**  
- Replaced string interpolation with parameterized queries using `$1, $2, ...` placeholders
- All user input passed as parameters to `pool.query()`
- PostgreSQL handles escaping and type conversion automatically

**Why this approach:**  
- Industry standard for SQL security
- Prevents all SQL injection attacks
- Type-safe parameter handling

**Trade-offs:**  
- None - this is the correct approach
- With more time: Could add input validation/sanitization layer

**Code changes:**  
- `src/database.ts` lines 68-90 - parameterized query with `$1-$7` placeholders

---

### Fix 6: Connection Pool Management

**My approach:**  
- Implemented singleton pattern for database pool
- Pool created once and reused across all requests
- Added `closePool()` function for graceful shutdown
- Configured pool with reasonable limits (max 20 connections)

**Why this approach:**  
- Efficient - reuses connections instead of creating new ones
- Prevents connection exhaustion
- Standard pattern for database connection management

**Trade-offs:**  
- Pool size (20) is arbitrary - should be tuned based on load
- With more time: Add connection health checks and automatic pool resizing

**Code changes:**  
- `src/database.ts` lines 4-30 - singleton pool pattern
- `src/index.ts` - calls `closePool()` on shutdown

---

### Fix 7: Duplicate Handling with UPSERT

**My approach:**  
- Added `ON CONFLICT (id) DO UPDATE SET ...` clause to INSERT query
- Updates existing records if campaign ID already exists
- Ensures idempotency - can run sync multiple times safely

**Why this approach:**  
- PostgreSQL's native UPSERT is efficient and atomic
- Handles both inserts and updates in one query
- Makes sync idempotent - safe to retry

**Trade-offs:**  
- Assumes `id` is the primary key (which it should be)
- With more time: Could add versioning/timestamps to track update history

**Code changes:**  
- `src/database.ts` lines 68-80 - ON CONFLICT clause

---

### Fix 8: Modular Code Structure

**My approach:**  
- Separated concerns into distinct modules:
  - `config.ts` - Configuration management
  - `auth.ts` - Authentication and token management
  - `apiClient.ts` - API communication with retry/rate limit logic
  - `database.ts` - Database operations
  - `syncCampaigns.ts` - Business logic orchestration
  - `index.ts` - Entry point

**Why this approach:**  
- Single Responsibility Principle - each module has one job
- Testable - can mock and test each component independently
- Reusable - auth and API client can be used elsewhere
- Maintainable - changes are isolated to relevant modules

**Trade-offs:**  
- More files to navigate, but better organization
- With more time: Could add interfaces/abstract classes for better testability

**Code changes:**  
- Created 5 new module files
- Refactored `syncCampaigns.ts` to orchestrate instead of implement

---

### Fix 9: Comprehensive Error Handling

**My approach:**  
- Added try-catch blocks at appropriate levels
- Distinguished between retryable (503, timeouts) and non-retryable errors
- Improved error messages with context
- Added error tracking in sync summary
- Graceful degradation - continues with partial success

**Why this approach:**  
- System doesn't crash on single failures
- Clear error messages help debugging
- Tracks failures for reporting
- Allows partial success (better than total failure)

**Trade-offs:**  
- Some errors might be swallowed that should fail fast
- With more time: Add error categorization and alerting

**Code changes:**  
- Throughout all modules - consistent error handling
- `src/syncCampaigns.ts` - tracks and reports failures

---

### Fix 10: Proper Timeout Configuration

**My approach:**  
- Increased timeout to 10 seconds (configurable)
- Applied timeout to all API requests (auth, campaigns, sync)
- Timeout handled as retryable error with exponential backoff

**Why this approach:**  
- 10 seconds gives API time to respond (sync endpoint takes 2s)
- Consistent timeout across all requests
- Timeouts are retried (might be transient network issues)

**Trade-offs:**  
- 10 seconds might be too long for some use cases
- With more time: Make timeout configurable per endpoint type

**Code changes:**  
- `src/config.ts` - `requestTimeout: 10000`
- `src/apiClient.ts` - timeout applied to all requests

---

## Part 3: Code Structure Improvements

**What I changed:**  
Refactored the monolithic `syncCampaigns.ts` into a modular architecture:

1. **`src/config.ts`** - Centralized configuration with environment variable support
2. **`src/auth.ts`** - Token management with caching and refresh logic
3. **`src/apiClient.ts`** - Reusable API client with retry, rate limiting, and timeout handling
4. **`src/database.ts`** - Database operations with connection pooling and parameterized queries
5. **`src/syncCampaigns.ts`** - Business logic that orchestrates the sync process
6. **`src/index.ts`** - Entry point with proper cleanup

**Why it's better:**  
- **Testability**: Each module can be unit tested in isolation
- **Separation of concerns**: Each file has a single, clear responsibility
- **Reusability**: Auth and API client can be used by other services
- **Maintainability**: Changes are localized to relevant modules
- **Readability**: Smaller, focused files are easier to understand

**Architecture decisions:**  
- **Functional approach**: Used functions instead of classes for simplicity
- **Singleton pattern**: Database pool is a singleton to prevent connection leaks
- **Dependency injection via imports**: Modules import what they need (easy to mock)
- **Error-first design**: Functions throw errors that callers handle (explicit error flow)

---

## Part 4: Testing & Verification

**Test scenarios I ran:**
1. **Full sync test**: Ran complete sync to verify all 100 campaigns are fetched and saved
2. **Rate limiting test**: Triggered rate limits to verify 60-second wait and retry
3. **503 error test**: Verified exponential backoff retries for service unavailable errors
4. **Timeout test**: Confirmed timeout handling works correctly
5. **Pagination test**: Verified all 10 pages are fetched sequentially
6. **Error recovery test**: Allowed some pages to fail to test graceful degradation
7. **Multiple runs**: Ran sync multiple times to verify idempotency (no duplicate errors)

**Expected behavior:**  
- Fetches all 100 campaigns across 10 pages
- Handles rate limits by waiting and retrying
- Retries 503 errors with exponential backoff
- Saves all campaigns to database (or mock DB)
- Provides clear progress logging
- Shows summary with success/failure counts

**Actual results:**  
✅ All tests passed successfully:
- All 100 campaigns fetched correctly
- Rate limiting handled properly (waits 60s when needed)
- 503 errors retried successfully
- Timeouts handled with retries
- Mock database saves all campaigns
- Clear logging shows progress
- Summary report shows accurate counts

**Edge cases tested:**  
- API server not running (clear error message)
- Partial page failures (continues with fetched data)
- Rate limit during campaign sync (waits and retries)
- Multiple 503 errors in a row (retries with backoff)
- Empty campaign list (throws appropriate error)

---

## Part 5: Production Considerations

### Monitoring & Observability

**Metrics to track:**
- Sync duration (total time, per campaign)
- Success/failure rates (by campaign, by error type)
- API request counts and rate limit hits
- Database operation latency
- Token refresh frequency
- Retry counts and patterns

**Alerts to set up:**
- Sync failure rate > 10%
- Sync duration > 30 minutes
- Rate limit hits > 5 per sync
- Database connection pool exhaustion
- API error rate > 20%
- Token refresh failures

**Tools:**
- Structured logging (JSON format) for log aggregation
- APM tool (DataDog, New Relic) for performance monitoring
- Error tracking (Sentry) for exception monitoring
- Metrics dashboard (Grafana) for visualization

### Error Handling & Recovery

**Additional error handling:**
- Dead letter queue for permanently failed campaigns
- Circuit breaker pattern for API failures
- Graceful shutdown handling (finish current batch before exit)
- Health check endpoint for monitoring
- Automatic retry scheduling for failed syncs

**Recovery strategies:**
- Resume from last successful campaign on failure
- Partial sync reporting (which campaigns succeeded/failed)
- Manual retry mechanism for specific campaigns
- Scheduled retries for transient failures

### Scaling Considerations

**For 100+ clients:**
- **Current bottleneck**: Sequential processing (2s per campaign = 200s for 100 campaigns)
- **Rate limiting**: 10 req/min means ~17 minutes minimum for 100 campaigns
- **Database**: Connection pool (20) should handle multiple concurrent syncs
- **What would break first**: Rate limiting - would need to implement client-side rate limiting or request queuing

**Scaling solutions:**
- **Horizontal scaling**: Run multiple sync workers with distributed locking
- **Request queuing**: Use message queue (RabbitMQ, SQS) to distribute work
- **Batch processing**: Process campaigns in batches with controlled concurrency
- **Database sharding**: If database becomes bottleneck, shard by client
- **Caching**: Cache campaign data to reduce API calls

### Security Improvements

**Additional security:**
- Secrets management (AWS Secrets Manager, HashiCorp Vault)
- Encrypted credentials at rest
- API key rotation mechanism
- Audit logging for all database operations
- Input validation and sanitization
- Rate limiting on our side to prevent abuse
- HTTPS only for all API communications
- Principle of least privilege for database user

### Performance Optimizations

**Optimizations:**
- **Parallel processing**: Process campaigns in batches (e.g., 5 concurrent) while respecting rate limits
- **Batch database inserts**: Insert multiple campaigns in one transaction
- **Connection pooling tuning**: Adjust pool size based on load
- **Caching**: Cache access tokens, campaign metadata
- **Database indexing**: Ensure proper indexes on `campaigns.id` and `synced_at`
- **Compression**: Compress API responses if supported

---

## Part 6: Limitations & Next Steps

**Current limitations:**  
1. **Sequential processing**: Very slow for large numbers of campaigns (could take hours for 1000+ campaigns)
2. **No resume capability**: If sync fails halfway, must restart from beginning
3. **Basic logging**: No structured logging or log aggregation
4. **No monitoring**: No metrics, alerts, or dashboards
5. **Single-threaded**: Can't handle multiple clients concurrently
6. **No idempotency keys**: Can't detect duplicate sync requests
7. **Hardcoded retry counts**: Should be configurable per error type
8. **No backpressure**: Doesn't slow down if database is overwhelmed

**What I'd do with more time:**  
1. **Add unit tests**: Test each module in isolation with mocks
2. **Add integration tests**: Test full sync flow with test database
3. **Implement batch processing**: Process campaigns in parallel batches
4. **Add resume capability**: Save progress and resume from last successful campaign
5. **Structured logging**: Use winston/pino with JSON format
6. **Add metrics**: Use Prometheus or similar for metrics collection
7. **Database migrations**: Add schema migration system
8. **API versioning**: Handle API version changes gracefully
9. **Configuration validation**: Validate all config values on startup
10. **Health checks**: Add health check endpoint for monitoring

**Questions I have:**  
1. What's the expected sync frequency? (affects caching strategy)
2. How many clients will this need to support? (affects scaling approach)
3. What's the acceptable sync duration? (affects parallelization needs)
4. Should syncs be idempotent? (already implemented, but want confirmation)
5. What's the disaster recovery plan? (backup/restore strategy)
6. Are there any compliance requirements? (GDPR, SOC2, etc.)

---

## Part 7: How to Run My Solution

### Setup

```bash
# 1. Clone the repository
git clone <repository-url>
cd mixoads-backend-assignment

# 2. Install main app dependencies
npm install

# 3. Install mock API dependencies
cd mock-api
npm install
cd ..

# 4. (Optional) Create .env file with custom configuration
# The app will work with defaults if .env is not created
cp .env.example .env  # Edit .env if needed
```

### Running

**Terminal 1 - Start Mock API:**
```bash
cd mock-api
npm start
```

You should see:
```
============================================================
Mock Ad Platform API Server
============================================================
Server running on: http://localhost:3001
```

**Terminal 2 - Run Sync:**
```bash
npm start
```

### Expected Output

When working correctly, you should see:

```
⚠ Warning: Using default credentials. Set AD_PLATFORM_EMAIL and AD_PLATFORM_PASSWORD in .env for production.
Starting campaign sync...
============================================================
Syncing campaigns from Ad Platform...

Step 1: Getting access token...
✓ Access token obtained

Step 2: Fetching all campaigns...
   Fetched page 1: 10 campaigns (total: 10/100)
   Fetched page 2: 10 campaigns (total: 20/100)
   Service unavailable (503). Retrying in 1000ms (attempt 1/3)...
   Fetched page 3: 10 campaigns (total: 30/100)
   ...
   Rate limited. Waiting 60000ms before retry...
   Fetched page 10: 10 campaigns (total: 100/100)

✓ Fetched 100 campaigns total

Step 3: Syncing campaigns to database...
   Syncing: Campaign 1 (ID: campaign_1)
      [MOCK DB] Saved campaign: campaign_1 - Campaign 1
   ✓ Successfully synced Campaign 1
   ...

============================================================
Sync Summary:
  Total campaigns: 100
  Successful: 100
  Failed: 0
============================================================

✓ Sync completed successfully!
```

### Testing

**Test 1: Verify all campaigns are fetched**
- Check that "Fetched 100 campaigns total" appears
- Verify all 10 pages are fetched

**Test 2: Verify rate limiting**
- Watch for "Rate limited. Waiting 60000ms before retry..." message
- Verify sync continues after wait

**Test 3: Verify retry logic**
- Watch for "Service unavailable (503). Retrying..." messages
- Verify retries succeed

**Test 4: Verify database saves**
- Check for "[MOCK DB] Saved campaign..." messages
- Verify all campaigns show "✓ Successfully synced"

**Test 5: Run multiple times**
- Run sync multiple times
- Verify no duplicate errors (idempotency works)

---

## Part 8: Additional Notes

This assignment was a great exercise in identifying and fixing real-world production issues. The original code had many "works on my machine" problems that would have caused significant issues in production.

**Key learnings:**
- Security is often overlooked in initial development (hardcoded credentials)
- Error handling and resilience are critical for production systems
- Code organization matters - modular code is much easier to test and maintain
- Rate limiting and retry logic are essential for external API integrations

**What I'm proud of:**
- Complete refactoring into clean, modular architecture
- Comprehensive error handling and retry logic
- Security improvements (no credentials in code/logs)
- All critical bugs fixed while maintaining backward compatibility

**Areas for improvement:**
- Would add comprehensive test suite with more time
- Could optimize for parallel processing while respecting rate limits
- Would add more observability (metrics, structured logging)

The solution is production-ready for a single-client scenario and provides a solid foundation for scaling to multiple clients with the suggested improvements.

---

## Commits Summary

1. `[Initial]` - Refactored code structure into modular architecture
2. `[Fix]` - Moved credentials to environment variables, removed logging
3. `[Fix]` - Implemented complete pagination (all 100 campaigns)
4. `[Fix]` - Added rate limiting handling with retry-after support
5. `[Fix]` - Implemented exponential backoff retry logic for 503/timeouts
6. `[Fix]` - Fixed SQL injection with parameterized queries
7. `[Fix]` - Implemented connection pooling and proper cleanup
8. `[Fix]` - Added UPSERT for duplicate handling
9. `[Fix]` - Improved error handling and logging throughout
10. `[Fix]` - Fixed timeout configuration (10s for all requests)
11. `[Fix]` - Default to mock DB mode for easier development
12. `[Docs]` - Completed SUBMISSION.md with comprehensive documentation

---

**Thank you for reviewing my submission!**
