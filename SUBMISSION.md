# Backend Engineer Assignment - Submission

**Name:** Kushagra Sharma \
**Date:** Mon, Dec 29, 2025 \
**Time Spent:** [Honest estimate] \
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

## Part 3: Code Structure Improvements

Explain how you reorganized/refactored the code.

**What I changed:**
[Describe the new structure - what modules/files did you create?]

**Why it's better:**
[Improved testability? Separation of concerns? Reusability?]

**Architecture decisions:**
[Any patterns you used? Class-based? Functional? Why?]

---

## Part 4: Testing & Verification

How did you verify your fixes work?

**Test scenarios I ran:**
1. [Scenario 1 - e.g., "Ran sync 10 times to test reliability"]
2. [Scenario 2 - e.g., "Made 20 requests to test rate limiting"]
3. [etc.]

**Expected behavior:**
[What should happen when it works correctly?]

**Actual results:**
[What happened when you tested?]

**Edge cases tested:**
[What unusual scenarios did you test?]

---

## Part 5: Production Considerations

What would you add/change before deploying this to production?

### Monitoring & Observability
[What metrics would you track? What alerts would you set up?]

### Error Handling & Recovery
[What additional error handling would you add?]

### Scaling Considerations
[How would this handle 100+ clients? What would break first?]

### Security Improvements
[What security enhancements would you add?]

### Performance Optimizations
[What could be made faster or more efficient?]

---

## Part 6: Limitations & Next Steps

Be honest about what's still not perfect.

**Current limitations:**
[What's still not production-ready?]

**What I'd do with more time:**
[If you had another 5 hours, what would you improve?]

**Questions I have:**
[Anything you're unsure about or would want to discuss?]

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
