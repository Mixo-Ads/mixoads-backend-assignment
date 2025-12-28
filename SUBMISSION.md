# Backend Engineer Assignment - Submission

**Name:** [Your Name]  
**Date:** January 28, 2025  
**Time Spent:** ~4 hours  
**GitHub:** [Your GitHub username]

---

## Part 1: What Was Broken

List the major issues you identified. For each issue, explain what was wrong and why it mattered.

### Issue 1: Hardcoded Credentials and Security Exposure

**What was wrong:**  
The email and password were hardcoded directly in the source code (`src/syncCampaigns.ts` lines 43-44). Additionally, these credentials were being logged in plain text (line 48), and the access token was also logged (line 62). The base64-encoded credentials are trivial to decode.

**Why it mattered:**  
- **Security Risk**: Credentials in source code can be accidentally committed to version control, exposing sensitive information
- **Compliance**: Many organizations have policies against hardcoded credentials
- **Flexibility**: Cannot use different credentials for different environments (dev/staging/prod) without code changes
- **Logging Exposure**: Credentials and tokens in logs can be accessed by anyone with log access

**Where in the code:**  
`src/syncCampaigns.ts` lines 43-44, 48, 62

---

### Issue 2: Broken Pagination - Only Fetching 10 of 100 Campaigns

**What was wrong:**  
The code only fetched the first page of campaigns (line 66: `page=1&limit=10`), completely ignoring the `has_more` flag from the pagination response. This meant only 10 out of 100 campaigns were ever synced.

**Why it mattered:**  
- **Data Loss**: 90% of campaign data was never synced to the database
- **Incomplete Sync**: The system appeared to work but was silently failing to process most data
- **Business Impact**: Critical business data was missing, leading to incorrect reporting and analysis

**Where in the code:**  
`src/syncCampaigns.ts` line 66 - only fetches page 1, ignores `has_more` flag

---

### Issue 3: No Rate Limiting Handling

**What was wrong:**  
The API has a rate limit of 10 requests per minute, but the code made no attempt to handle 429 (Too Many Requests) responses. When rate limits were hit, requests would fail without retry logic or waiting for the rate limit window to reset.

**Why it mattered:**  
- **Request Failures**: Any burst of 10+ requests would result in failures
- **No Recovery**: Failed requests were not retried after the rate limit window expired
- **Unreliable Operation**: The sync job would fail randomly depending on timing, making it unreliable in production

**Where in the code:**  
`src/syncCampaigns.ts` - no handling of 429 status codes or `retry-after` headers

---

### Issue 4: Inadequate Timeout Configuration

**What was wrong:**  
The timeout for the sync endpoint was set to 1000ms (1 second) on line 99, but the mock API's sync endpoint takes approximately 2 seconds to respond. This caused all sync requests to timeout before completion.

**Why it mattered:**  
- **Complete Failure**: All sync operations would fail due to premature timeouts
- **No Data Synced**: Zero campaigns would be successfully synced despite the API working correctly
- **Wasted Resources**: Requests were made but never completed

**Where in the code:**  
`src/syncCampaigns.ts` line 99 - timeout set to 1000ms for an endpoint that takes 2000ms

---

### Issue 5: SQL Injection Vulnerability

**What was wrong:**  
Database queries used string concatenation to build SQL queries instead of parameterized queries. User-provided data (campaign names, IDs, etc.) was directly interpolated into SQL strings without sanitization.

**Why it mattered:**  
- **Security Vulnerability**: Malicious data in campaign names could execute arbitrary SQL commands
- **Data Breach Risk**: Attackers could read, modify, or delete database records
- **Compliance**: SQL injection vulnerabilities violate security best practices and compliance requirements

**Where in the code:**  
`src/database.ts` lines 23-28 - direct string interpolation in SQL query

---

### Issue 6: Database Connection Leaks

**What was wrong:**  
Every call to `saveCampaignToDB()` created a new database connection pool (`new Pool()` on line 4), but these pools were never closed. With 100 campaigns, this would create 100 connection pools, leading to resource exhaustion.

**Why it mattered:**  
- **Resource Exhaustion**: Database connections are limited resources that would eventually be exhausted
- **Performance Degradation**: Multiple pools compete for resources and increase overhead
- **System Instability**: Eventually the system would crash or become unresponsive when connections run out

**Where in the code:**  
`src/database.ts` line 4 - creates new Pool on every call, never closes them

---

### Issue 7: No Error Handling or Retry Logic

**What was wrong:**  
The code had minimal error handling - individual campaign failures were caught but not retried. There was no handling for transient failures (503 errors, network timeouts, etc.). The API randomly returns 503 errors (20% of requests) and timeouts (10% of requests), but these were treated as permanent failures.

**Why it mattered:**  
- **Unreliable Sync**: Transient failures (network issues, temporary API problems) would cause permanent data loss
- **No Resilience**: The system couldn't recover from temporary outages
- **Poor User Experience**: Legitimate temporary issues would appear as permanent failures

**Where in the code:**  
`src/syncCampaigns.ts` lines 109-111 - errors caught but not retried; no handling for specific error types

---

### Issue 8: Poor Code Structure - God Function

**What was wrong:**  
The `syncAllCampaigns()` function was a monolithic "god function" that handled authentication, API calls, pagination, error handling, and database operations all in one place. There was no separation of concerns, making the code difficult to test, maintain, and extend.

**Why it mattered:**  
- **Testability**: Impossible to unit test individual components (auth, API calls, DB operations) in isolation
- **Maintainability**: Changes to one part of the code could break unrelated functionality
- **Reusability**: Code couldn't be reused for other purposes (e.g., syncing a single campaign)
- **Code Quality**: Violates Single Responsibility Principle and makes debugging difficult

**Where in the code:**  
`src/syncCampaigns.ts` - entire `syncAllCampaigns()` function (117 lines doing everything)

---

## Part 2: How I Fixed It

For each issue above, explain your fix in detail.

### Fix 1: Authentication and Security

**My approach:**  
Created a separate `src/auth.ts` module that:
- Reads credentials from environment variables (`AD_PLATFORM_EMAIL`, `AD_PLATFORM_PASSWORD`)
- Provides a clean `authenticate()` function that handles the auth flow
- Returns structured token data without logging sensitive information
- Throws clear errors if credentials are missing

**Why this approach:**  
- **Environment Variables**: Standard practice for configuration, allows different credentials per environment
- **Separation of Concerns**: Auth logic isolated in its own module, easier to test and modify
- **Security**: No logging of credentials or tokens, reducing exposure risk
- **Error Handling**: Clear error messages when credentials are missing, fails fast

**Trade-offs:**  
- Requires environment variables to be set (but this is the correct approach)
- Could add a development mode with default values, but chose security over convenience

**Code changes:**  
- Created `src/auth.ts` - new authentication module
- Updated `src/syncCampaigns.ts` to use `authenticate()` and `getAuthConfig()` from auth module
- Removed all credential logging

---

### Fix 2: Complete Pagination Implementation

**My approach:**  
Implemented a `fetchAllCampaigns()` function that:
- Loops through all pages until `has_more` is false
- Accumulates all campaigns from all pages
- Provides progress logging showing current page and total count
- Returns the complete list of all campaigns

**Why this approach:**  
- **Simple and Correct**: Directly addresses the problem - fetch all pages
- **Progress Visibility**: Logging helps monitor progress during sync
- **Memory Efficient**: For 100 campaigns, memory usage is negligible

**Trade-offs:**  
- For extremely large datasets (millions of campaigns), would need streaming/chunking
- Sequential page fetching is slower than parallel, but simpler and respects rate limits better

**Code changes:**  
- `src/syncCampaigns.ts` - Added `fetchAllCampaigns()` function with pagination loop (lines 20-41)

---

### Fix 3: Rate Limiting with Exponential Backoff

**My approach:**  
Created a robust `ApiClient` class (`src/api-client.ts`) that:
- Detects 429 responses and reads the `retry-after` header
- Waits for the specified duration before retrying
- Implements exponential backoff with jitter for other retryable errors
- Configurable retry limits and delays

**Why this approach:**  
- **Respects API Limits**: Uses the `retry-after` header value, respecting the API's rate limit window
- **Exponential Backoff**: Prevents overwhelming the API during retries
- **Jitter**: Prevents "thundering herd" problems when multiple instances retry simultaneously
- **Reusable**: The ApiClient can be used for all API calls, not just campaigns

**Trade-offs:**  
- Adds complexity with the ApiClient class, but this complexity is necessary for production reliability
- Could implement token bucket or sliding window algorithms for more sophisticated rate limiting, but exponential backoff is simpler and sufficient

**Code changes:**  
- Created `src/api-client.ts` - comprehensive API client with rate limiting (lines 63-85 handle 429 responses)

---

### Fix 4: Appropriate Timeout Configuration

**My approach:**  
Set the timeout to 15 seconds (15000ms) in the ApiClient configuration, which is:
- Sufficient for the 2-second sync endpoint response time
- Leaves buffer for network latency and retries
- Not so long that hung requests block execution indefinitely

**Why this approach:**  
- **Pragmatic**: 15 seconds is reasonable for API calls - long enough for slow endpoints, short enough to fail fast
- **Configurable**: Timeout is a parameter, can be adjusted per endpoint if needed
- **Safety**: Prevents indefinite hangs while allowing legitimate slow responses

**Trade-offs:**  
- Could make timeout configurable per endpoint, but 15 seconds works for all current endpoints
- Could implement adaptive timeouts based on historical response times, but adds complexity

**Code changes:**  
- `src/syncCampaigns.ts` line 75 - set timeout to 15000ms
- `src/api-client.ts` - timeout parameter in ApiClient constructor (default 10 seconds)

---

### Fix 5: Parameterized Queries and SQL Injection Prevention

**My approach:**  
Replaced string concatenation with parameterized queries using PostgreSQL's `$1, $2, $3...` placeholders:
- All user data is passed as parameters to `pool.query()`
- Database driver handles proper escaping and type conversion
- Also implemented UPSERT (ON CONFLICT) to handle duplicate IDs gracefully

**Why this approach:**  
- **Security**: Parameterized queries are the industry standard for preventing SQL injection
- **Type Safety**: Database driver handles type conversion (numbers, strings, etc.)
- **UPSERT**: Handles the case where sync runs multiple times - updates existing records instead of failing

**Trade-offs:**  
- UPSERT requires a unique constraint on the `id` column (which should exist anyway)
- Could use a more sophisticated conflict resolution strategy, but updating on conflict is the most common requirement

**Code changes:**  
- `src/database.ts` lines 42-58 - parameterized query with `$1-$7` placeholders
- Added `ON CONFLICT (id) DO UPDATE SET...` for UPSERT behavior

---

### Fix 6: Singleton Connection Pool Pattern

**My approach:**  
Implemented a singleton pattern for the database connection pool:
- Single `Pool` instance created on first use and reused for all operations
- Pool configuration includes reasonable limits (max 10 connections)
- Added `closePool()` function to properly close the pool when done
- Pool is closed at the end of the sync process

**Why this approach:**  
- **Resource Efficiency**: One pool handles all database operations, properly managing connections
- **Connection Management**: Pool handles connection lifecycle (creation, reuse, cleanup)
- **Proper Cleanup**: Closing the pool ensures no hanging connections when the process exits

**Trade-offs:**  
- Could use a connection pool manager for multiple databases, but one pool is sufficient for this use case
- Pool closing happens at the end - for long-running services, might want to keep pool open, but for batch jobs this is correct

**Code changes:**  
- `src/database.ts` - Singleton pool pattern (lines 5-20)
- Added `closePool()` function (lines 22-27)
- `src/syncCampaigns.ts` - calls `closePool()` at end of sync (line 121)

---

### Fix 7: Comprehensive Error Handling and Retry Logic

**My approach:**  
Implemented a sophisticated retry mechanism in the `ApiClient` class:
- Retries transient errors (503, 504) with exponential backoff
- Handles network errors (timeouts, connection refused) with retries
- Configurable retry limits and delays
- Does not retry client errors (4xx) except 429 (rate limiting)
- Clear logging of retry attempts

**Why this approach:**  
- **Resilience**: Transient failures don't cause permanent data loss
- **Exponential Backoff**: Prevents overwhelming the API during outages
- **Selective Retries**: Only retries errors that make sense to retry (not 400 Bad Request, etc.)
- **Observability**: Logging helps debug issues and understand retry behavior

**Trade-offs:**  
- Retry logic adds latency (but ensures data isn't lost)
- Could implement circuit breaker pattern for more sophisticated failure handling, but retries are sufficient for this use case
- Could add retry metrics/telemetry, but logging provides basic observability

**Code changes:**  
- `src/api-client.ts` - comprehensive retry logic in `request()` method (lines 87-167)
- Handles 503/504 errors with exponential backoff (lines 130-142)
- Network errors retried with backoff (lines 144-159)

---

### Fix 8: Modular Code Structure

**My approach:**  
Refactored the monolithic function into separate modules:
- `src/auth.ts` - Authentication logic
- `src/api-client.ts` - API client with retry logic, rate limiting, error handling
- `src/database.ts` - Database operations (with proper connection management)
- `src/syncCampaigns.ts` - Orchestration logic (coordinates the sync process)
- `src/index.ts` - Entry point (minimal, just calls sync)

**Why this approach:**  
- **Separation of Concerns**: Each module has a single, clear responsibility
- **Testability**: Each module can be unit tested independently
- **Reusability**: ApiClient and auth modules can be used for other operations
- **Maintainability**: Changes to one area don't affect others
- **Readability**: Smaller, focused functions are easier to understand

**Trade-offs:**  
- More files to navigate, but much easier to understand and maintain
- Could use classes instead of functions, but functional approach is simpler and sufficient
- Could add dependency injection for even better testability, but would be over-engineering for this use case

**Code changes:**  
- Created 4 new module files
- Refactored `syncCampaigns.ts` to use these modules (reduced from 117 lines to ~120 lines but much more organized)

---

## Part 3: Code Structure Improvements

Explain how you reorganized/refactored the code.

**What I changed:**  
Refactored from a single monolithic file into a modular architecture:

1. **`src/auth.ts`** (47 lines)
   - `authenticate()` - Handles API authentication
   - `getAuthConfig()` - Reads credentials from environment variables
   - Exports TypeScript interfaces for type safety

2. **`src/api-client.ts`** (167 lines)
   - `ApiClient` class - Encapsulates all API communication
   - Handles rate limiting, retries, timeouts, error handling
   - Reusable for any API endpoint

3. **`src/database.ts`** (100 lines)
   - Singleton connection pool pattern
   - `saveCampaignToDB()` - Saves single campaign (with UPSERT)
   - `saveCampaignsToDB()` - Batch save with transaction (for future use)
   - `closePool()` - Proper cleanup

4. **`src/syncCampaigns.ts`** (122 lines)
   - `fetchAllCampaigns()` - Handles pagination
   - `syncCampaign()` - Syncs a single campaign
   - `syncAllCampaigns()` - Orchestrates the entire sync process

5. **`src/index.ts`** (21 lines)
   - Minimal entry point
   - Error handling and process exit codes

**Why it's better:**  
- **Separation of Concerns**: Each module has a single, clear responsibility
- **Testability**: Can unit test auth, API client, and database operations independently
- **Reusability**: ApiClient can be used for other API operations; auth module can be reused
- **Maintainability**: Changes to API handling don't affect database code, and vice versa
- **Type Safety**: TypeScript interfaces ensure type correctness across modules
- **Error Handling**: Each layer handles errors appropriately

**Architecture decisions:**  
- **Functional approach**: Used functions and classes where appropriate (ApiClient as class for state, functions elsewhere)
- **Dependency injection**: ApiClient takes config as constructor parameter (easy to test with mocks)
- **Singleton pattern**: Database pool (appropriate for this use case)
- **Error propagation**: Errors bubble up appropriately, handled at the right layer
- **No over-engineering**: Kept it simple - didn't add unnecessary abstractions like dependency injection frameworks

---

## Part 4: Testing & Verification

How did you verify your fixes work?

**Test scenarios I ran:**
1. **Full sync test** - Ran the complete sync process and verified all 100 campaigns were fetched and synced
2. **Rate limiting test** - Verified that 429 responses were handled correctly with proper wait times
3. **Error recovery test** - Confirmed that 503 errors triggered retries and eventually succeeded
4. **Pagination test** - Verified that all 10 pages were fetched (100 total campaigns)
5. **Timeout test** - Confirmed that 15-second timeout was sufficient for 2-second sync endpoint
6. **Multiple runs** - Ran sync multiple times to verify no duplicate errors and UPSERT working

**Expected behavior:**  
- All 100 campaigns should be fetched from all 10 pages
- Rate limiting should be handled gracefully (wait and retry)
- Transient errors (503) should be retried and eventually succeed
- All campaigns should be successfully synced
- No duplicate database errors when running multiple times
- Clean exit with success message

**Actual results:**  
✅ Successfully fetched all 100 campaigns from 10 pages  
✅ Rate limiting handled correctly - waited 60 seconds when rate limit hit, then continued  
✅ 503 errors retried with exponential backoff and eventually succeeded  
✅ All 100 campaigns synced successfully (100/100)  
✅ No database errors  
✅ Clean exit with summary showing 100 successful, 0 failed  

**Edge cases tested:**  
- Rate limiting during pagination (hit rate limit on page 9, waited and continued)
- Rate limiting during sync operations (hit multiple times, all handled correctly)
- 503 errors during page fetching (retried and succeeded)
- Multiple sync runs (UPSERT handled duplicates correctly)

---

## Part 5: Production Considerations

What would you add/change before deploying this to production?

### Monitoring & Observability

**Metrics to track:**
- Sync duration (total time, time per campaign)
- Success/failure rates (per sync run, over time)
- API call latency (p50, p95, p99)
- Rate limit hits (count and frequency)
- Retry counts (how many retries per sync)
- Database operation latency
- Campaign count synced per run

**Logging:**
- Structured logging (JSON format) with correlation IDs
- Log levels (DEBUG for detailed steps, INFO for milestones, ERROR for failures)
- Remove sensitive data from logs (no credentials, no tokens)
- Add timestamps and request IDs to all log entries

**Alerting:**
- Alert on sync failure rate > 5%
- Alert on sync duration > 30 minutes (indicating performance issues)
- Alert on consecutive failures (3+ failed syncs in a row)
- Alert on rate limit hits > 10 per hour (indicating need for optimization)

### Error Handling & Recovery

**Additional error handling:**
- Dead letter queue for campaigns that fail after all retries
- Partial success handling (sync 95/100 campaigns, log failures, continue)
- Token expiry handling (detect 401, re-authenticate, retry)
- Database connection retry logic (handle connection pool exhaustion)
- Graceful shutdown (allow current sync to complete before exiting)

**Recovery mechanisms:**
- Automatic retry of failed syncs (with exponential backoff between full syncs)
- Idempotency keys to prevent duplicate processing
- Checkpoint/resume capability for large syncs
- Manual retry endpoint/command for failed campaigns

### Scaling Considerations

**Current limitations with 100+ clients:**
- Sequential processing is too slow (100 campaigns × 2 seconds = 200+ seconds, plus rate limit waits)
- Rate limits would be hit frequently (10 req/min × multiple clients)
- Database connection pool might be exhausted with concurrent clients
- No horizontal scaling capability

**What would break first:**
1. **Rate limiting** - With multiple clients, rate limits hit more frequently
2. **Performance** - Sequential processing becomes a bottleneck
3. **Database connections** - Multiple instances competing for connections

**Solutions for 100+ clients:**
- **Parallel processing with concurrency control** - Process campaigns in batches (e.g., 5-10 at a time)
- **Distributed rate limiting** - Use Redis to track rate limits across instances
- **Queue-based architecture** - Use a message queue (RabbitMQ, SQS) to distribute work
- **Horizontal scaling** - Multiple worker instances processing from the same queue
- **Database connection pooling** - Increase pool size or use connection pooler (PgBouncer)
- **Caching** - Cache authentication tokens (with expiry) to reduce API calls
- **Batch API calls** - If API supports it, batch multiple campaigns in one request

### Security Improvements

**Additional security measures:**
- **Secrets management** - Use AWS Secrets Manager, HashiCorp Vault, or similar (not .env files)
- **Encryption at rest** - Encrypt database credentials and API tokens
- **Encryption in transit** - Ensure TLS for all API calls and database connections
- **Least privilege** - Database user should have minimal required permissions
- **Audit logging** - Log all database operations for compliance
- **Input validation** - Validate all API responses before processing
- **Rate limiting** - Add rate limiting on our side to prevent abuse
- **Authentication tokens** - Store tokens securely, refresh before expiry

### Performance Optimizations

**Optimizations to implement:**
- **Parallel processing** - Process campaigns in parallel with controlled concurrency (5-10 at a time)
- **Batch database operations** - Use the existing `saveCampaignsToDB()` for batch inserts
- **Connection pooling tuning** - Optimize pool size based on load
- **Caching** - Cache authentication tokens, cache frequently accessed data
- **Async processing** - Move sync to background jobs, return immediately to caller
- **Database indexing** - Ensure proper indexes on campaign table (id, synced_at, etc.)
- **Query optimization** - Use bulk UPSERT operations instead of individual inserts

---

## Part 6: Limitations & Next Steps

Be honest about what's still not perfect.

**Current limitations:**  
1. **Sequential processing** - Still processes campaigns one at a time, which is slow (200+ seconds for 100 campaigns)
2. **No parallelization** - Could process multiple campaigns concurrently with controlled concurrency
3. **Rate limit waits** - When rate limit is hit, waits 60 seconds, which adds significant latency
4. **No token refresh** - Doesn't handle token expiry during long-running syncs (though tokens last 1 hour, should be fine)
5. **No checkpoint/resume** - If sync fails halfway, must restart from beginning
6. **Basic error handling** - Could implement more sophisticated patterns (circuit breaker, bulkhead)
7. **No metrics/telemetry** - Basic console logging, no structured metrics collection
8. **Environment variables** - Relies on .env file, should use proper secrets management in production
9. **Single instance** - No horizontal scaling capability
10. **No idempotency keys** - Could add idempotency to prevent duplicate processing

**What I'd do with more time:**  
1. **Implement parallel processing** - Add controlled concurrency (process 5-10 campaigns at once)
2. **Add comprehensive logging** - Structured JSON logging with correlation IDs
3. **Implement metrics collection** - Add Prometheus metrics or similar
4. **Add unit tests** - Test each module in isolation with mocked dependencies
5. **Add integration tests** - Test the full sync flow with test data
6. **Token refresh logic** - Handle token expiry during long syncs
7. **Checkpoint/resume** - Save progress and allow resuming from last checkpoint
8. **Circuit breaker pattern** - Stop making requests if API is consistently failing
9. **Configuration management** - Move from .env to proper config management
10. **Docker containerization** - Package the application in Docker for easy deployment

**Questions I have:**  
1. **Database schema** - What does the actual campaigns table schema look like? (I assumed it has an `id` column with unique constraint)
2. **Sync frequency** - How often should this sync run? (affects how we handle rate limits and performance)
3. **Data volume** - What's the expected number of campaigns in production? (affects pagination and performance optimizations)
4. **Failure tolerance** - Is it acceptable to skip some campaigns if they consistently fail, or must all succeed?
5. **Concurrent clients** - Will multiple instances run simultaneously, or is this a single-instance batch job?
6. **Monitoring tools** - What monitoring/observability stack is in use? (affects what metrics to emit)

---

## Part 7: How to Run My Solution

Clear step-by-step instructions.

### Setup

```bash
# 1. Navigate to project directory
cd mixoads-backend-assignment

# 2. Install main application dependencies
npm install

# 3. Install mock API dependencies
cd mock-api
npm install
cd ..

# 4. Set up environment variables
# Create a .env file (or set environment variables):
# AD_PLATFORM_EMAIL=admin@mixoads.com
# AD_PLATFORM_PASSWORD=SuperSecret123!
# USE_MOCK_DB=true  # Set to false if you have a real database set up
```

**Note:** The `.env` file is gitignored for security. Create it manually or use environment variables.

### Running

**Terminal 1 - Start the Mock API:**
```bash
cd mock-api
npm start
```

You should see:
```
🚀 Mock Ad Platform API Server
📍 Server running on: http://localhost:3001
🔑 Valid credentials: admin@mixoads.com / SuperSecret123!
```

**Terminal 2 - Run the Sync:**
```bash
# Set environment variables (PowerShell)
$env:AD_PLATFORM_EMAIL="admin@mixoads.com"
$env:AD_PLATFORM_PASSWORD="SuperSecret123!"
$env:USE_MOCK_DB="true"
npm start

# Or on Linux/Mac:
export AD_PLATFORM_EMAIL="admin@mixoads.com"
export AD_PLATFORM_PASSWORD="SuperSecret123!"
export USE_MOCK_DB="true"
npm start
```

### Expected Output

When working correctly, you should see:

```
Starting campaign sync...
============================================================
Step 1: Authenticating...
   Authentication successful

Step 2: Fetching all campaigns...
Fetching campaigns from all pages...
   Fetching page 1...
   Found 10 campaigns on page 1 (total: 10/100)
   Fetching page 2...
   Found 10 campaigns on page 2 (total: 20/100)
   ...
   Found 10 campaigns on page 10 (total: 100/100)

   Total campaigns to sync: 100

Step 3: Syncing campaigns...
   [1/100] Syncing: Campaign 1 (campaign_1)
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

**Key indicators of success:**
- ✅ Fetches all 10 pages (100 total campaigns)
- ✅ Handles rate limiting (may see "Rate limit exceeded. Waiting 60 seconds...")
- ✅ Handles 503 errors (may see "Server error 503. Retrying...")
- ✅ All 100 campaigns synced successfully
- ✅ Clean exit with summary

### Testing

**Test 1: Basic Functionality**
```bash
# Run the sync and verify all 100 campaigns are synced
npm start
# Check output: "Successful: 100"
```

**Test 2: Rate Limiting**
```bash
# The code should automatically handle rate limits
# You'll see "Rate limit exceeded. Waiting 60 seconds..." messages
# Verify it continues after waiting
```

**Test 3: Error Recovery**
```bash
# Run multiple times - the mock API returns random 503 errors
# Verify that retries eventually succeed
```

**Test 4: Duplicate Handling**
```bash
# Run sync twice in a row
# Verify no duplicate errors (UPSERT should handle this)
npm start
npm start
```

**Test 5: Missing Credentials**
```bash
# Run without environment variables
unset AD_PLATFORM_EMAIL
npm start
# Should fail with clear error message about missing credentials
```

---

## Part 8: Additional Notes

### Design Decisions

**Why functional + class-based hybrid?**
- Used classes for `ApiClient` because it maintains state (access token, config)
- Used functions elsewhere because they're simpler and sufficient
- TypeScript interfaces provide type safety without over-engineering

**Why sequential processing instead of parallel?**
- Sequential is simpler and easier to reason about
- Better respects rate limits (parallel would hit limits faster)
- For 100 campaigns, sequential is acceptable (though slower)
- Can be easily changed to parallel processing later if needed

**Why 15-second timeout?**
- Sync endpoint takes ~2 seconds
- Leaves buffer for network latency and retries
- Not so long that hung requests block execution
- Configurable if needed

**Why UPSERT instead of INSERT?**
- Allows sync to be run multiple times safely
- Handles the case where sync fails partway through and is restarted
- More resilient to partial failures

### Code Quality Improvements

- **TypeScript types** - All modules use proper TypeScript interfaces
- **Error messages** - Clear, descriptive error messages throughout
- **Comments** - JSDoc comments on all exported functions
- **Consistent style** - Consistent code formatting and naming conventions
- **No magic numbers** - Constants defined at the top, easily configurable

### Future Enhancements

If I had more time, I would:
1. Add comprehensive unit tests with >80% coverage
2. Implement parallel processing with configurable concurrency
3. Add structured logging with correlation IDs
4. Implement metrics collection (Prometheus, StatsD, etc.)
5. Add Docker containerization
6. Create a configuration management system
7. Implement circuit breaker pattern for API calls
8. Add database migration scripts
9. Create API documentation
10. Add health check endpoints

---

## Commits Summary

Since this is a single comprehensive refactor, here's a summary of what was changed:

**Main Changes:**
1. **Created `src/auth.ts`** - Authentication module with environment variable support
2. **Created `src/api-client.ts`** - Robust API client with rate limiting, retries, and error handling
3. **Refactored `src/database.ts`** - Fixed SQL injection, connection leaks, added UPSERT
4. **Refactored `src/syncCampaigns.ts`** - Modular structure with pagination and orchestration
5. **Updated `src/index.ts`** - Improved error handling

**Key Improvements:**
- ✅ Moved credentials to environment variables
- ✅ Fixed pagination (fetches all 100 campaigns)
- ✅ Added rate limiting handling
- ✅ Fixed timeout configuration (15 seconds)
- ✅ Fixed SQL injection vulnerability
- ✅ Fixed connection leaks (singleton pool)
- ✅ Added comprehensive retry logic
- ✅ Modular code structure

---

**Thank you for reviewing my submission!**
