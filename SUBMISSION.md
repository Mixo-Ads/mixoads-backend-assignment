


Backend Engineer Assignment – Submission

Name: Surendiran R
Date: 28-Dec-2025
Time Spent: ~3.5 hours
GitHub: github.com/your-username

=====================Part 1: What Was Broken
========Issue 1: Sync API Requests Timing Out

What was wrong:
The campaign sync API calls were wrapped with a hardcoded timeout of 1000 ms (1 second) using AbortController. Most /sync endpoints take longer than 1 second due to DB operations or processing logic, causing requests to be aborted prematurely.

Why it mattered:
This resulted in 9 out of 10 campaigns failing to sync, even though the backend API was working correctly. The system appeared unreliable and caused partial data synchronization.

Where in the code:
fetchWithTimeout() usage inside syncAllCampaigns()

fetchWithTimeout(..., 1000)

========Issue 2: Inconsistent API Base URL Usage

What was wrong:
Although API_BASE_URL was defined globally, the /sync API still used a hardcoded localhost URL.

Why it mattered:
This breaks portability and makes the application fail in staging or production environments where the API base URL differs.

Where in the code:

http://localhost:3001/api/campaigns/${campaign.id}/sync

========Issue 3: Sensitive Data Logged to Console

What was wrong:
The application logged Base64 encoded credentials and access tokens to the console.

Why it mattered:
This is a security risk, especially in shared logs or production environments. Tokens could be leaked and misused.

Where in the code:

console.log(`Using auth: Basic ${authString}`);
console.log(`Got access token: ${accessToken}`);

========Issue 4: Missing Error Validation on HTTP Responses

What was wrong:
Some fetch responses were assumed to be successful without checking response.ok.

Why it mattered:
Failures such as 401, 500, or 503 were not clearly handled, making debugging difficult.

Where in the code:
Auth token fetch and sync fetch responses.

========Issue 5: Weak Error Isolation During Campaign Sync

What was wrong:
Although errors were caught per campaign, the error messages were not descriptive enough and didn’t differentiate timeout vs API failures clearly.

Why it mattered:
Reduced observability and made root-cause analysis harder.

Where in the code:
Campaign sync loop error handling.






=====================Part 2: How I Fixed It
Fix 1: Increased Request Timeout

My approach:
Increased the timeout from 1 second to 5 seconds and centralized it as a constant.

Why this approach:
The sync API performs I/O-heavy operations. Increasing timeout avoids unnecessary aborts without affecting performance significantly.

Trade-offs:
Longer timeout could delay failure detection, but it improves reliability.

Code changes:

const REQUEST_TIMEOUT = 5000;

Fix 2: Centralized API Base URL Usage

My approach:
Replaced all hardcoded URLs with API_BASE_URL.

Why this approach:
Improves environment flexibility and deployment readiness.

Trade-offs:
None.

Code changes:

`${API_BASE_URL}/api/campaigns/${campaign.id}/sync`

Fix 3: Removed Sensitive Logs

My approach:
Stopped logging credentials and tokens. Logged only success states.

Why this approach:
Prevents security leaks and follows best practices.

Trade-offs:
Less verbose logs, but safer.

Fix 4: Added HTTP Status Validation

My approach:
Checked response.ok after every fetch request and threw meaningful errors.

Why this approach:
Ensures failures are caught early and explained clearly.

Trade-offs:
Slightly more code, much better reliability.

Fix 5: Improved Error Handling per Campaign

My approach:
Wrapped each campaign sync in its own try/catch and added descriptive logs.

Why this approach:
One failure should not stop the entire sync process.

Trade-offs:
Sequential execution is slower, but safer.







=====================Part 3: Code Structure Improvements

What I changed:

Introduced centralized configuration constants

Improved helper function (fetchWithTimeout)

Cleaned up logging and error flow

Why it's better:

Easier to debug

More maintainable

Production-ready structure

Architecture decisions:
Used functional approach for simplicity and clarity. No over-engineering for the assignment scope.







=====================Part 4: Testing & Verification

Test scenarios I ran:

Ran sync with default 1s timeout (failure)

Increased timeout to 5s and reran

Verified DB save for all campaigns

Simulated API downtime

Expected behavior:
All campaigns should sync successfully without premature failures.

Actual results:
10/10 campaigns synced successfully after fixes.

Edge cases tested:

Slow API response

Partial campaign failure

Token fetch failure





=====================Part 5: Production Considerations
Monitoring & Observability

Campaign sync success rate

API latency

Timeout count

Error Handling & Recovery

Retry mechanism with exponential backoff

Dead-letter queue for failed campaigns

Scaling Considerations

Batch sync with concurrency limits

Worker queues (BullMQ / SQS)

Security Improvements

Move credentials to secret manager

OAuth token rotation

Remove Basic Auth

Performance Optimizations

Parallel sync with controlled concurrency

Caching campaign metadata





=====================Part 6: Limitations & Next Steps

Current limitations:

Sequential campaign sync

No retry logic

No unit tests

What I'd do with more time:

Add retries with backoff

Add Jest unit tests

Implement pagination loop

Questions I have:

Expected SLA for sync completion?

Is partial sync acceptable?







=====================Part 7: How to Run My Solution
Setup
npm install

Running
npm run sync

Expected Output
Sync complete: 10/10 campaigns synced

Testing
Check database records and logs