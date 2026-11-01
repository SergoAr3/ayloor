# Explore web flow — first implementation slice

This is a synthetic two-stop flow demo, not the finished **Yerevan: Look Closer**
guide or the full MVP v0.2. It implements Start → Answer → Reveal → Continue →
Resume → Finish, with a free hint. No location, Telegram, team, XP or timer is used.

## Run locally

Follow README setup and reuse healthy services. Apply migrations normally:

```bash
make migrate
.venv/bin/python -m app.explore_seed
```

Use the existing backend and Vite commands. Open
`http://localhost:5173/explore.html` (use the host/port of your Vite instance).
The synthetic answers are **closer** and **3**. No real walk is required.
The seed is opt-in and idempotent; it never rewrites an existing demo guide or
multiplayer data. Published guide rows/stops are treated as immutable versions:
content changes need a new slug/guide row. Do not edit a guide used by saved runs.

The production Vite build now includes both index.html (legacy Mini App) and
explore.html. Serve both files on the existing allowed frontend origin and keep
the existing public HTTPS API configuration. No CORS policy or legacy API contract
was changed. Hosting must serve explore.html rather than rewrite it to index.html.

## Run credential and resume limits

There is no guest account. Each run has a separate opaque bearer credential, stored
as a SHA-256 hash on the backend. It cannot authorize multiplayer/admin endpoints.
The frontend keeps access in the `ayloor-explore-demo-v1` localStorage record;
clearing site data, a private-session close or losing the device loses access.
No automatic expiry, account recovery, cross-device sync or offline queue is added.
The demo requires network access. Treat this as web demo storage, not a solution for
native secrets. JavaScript/XSS or same-origin scripts can read localStorage: keep
this origin trusted and do not embed third-party scripts in the Explore entry.

Before Start, the client persists a cryptographically random 256-bit secret retry
key. The backend derives a domain-separated HMAC run credential using APP_SECRET_KEY;
only the retry-key hash and credential hash are stored. Concurrent/repeated Start
with that key returns the same run. After successfully saving access, the client
replaces the retry key with run ID and credential. A lost response leaves the retry
key available for explicit **RESUME START**, not an automatic POST retry.
The retry key is itself sensitive: never put it or credentials in URLs/logs.
Rotating APP_SECRET_KEY can prevent recovery of pending starts (409); already-issued
run credentials still work against their stored hashes. There is no cookie auth,
so Explore fetch uses `credentials: omit`; legacy sessionStorage is untouched.

Run mutations lock the row in the request transaction. Every action names the stop.
Correct answers (trim + Unicode casefold; internal whitespace remains significant)
persist Reveal without advancing. Continue requires Reveal; old-stop replays return
current state without advancing the new stop. Future/foreign stop IDs are rejected.
Hint state is persisted without a score event. Finish is recorded only by Continue
from the final Reveal. Reads return no answer keys, and Reveal only after acceptance.

Unknown mutation outcomes block further writes until explicit Resume/read restores
server state. Reload/foreground also reads it; it does not restart the run or request
location. No run state is inferred from a locally stored completed flag.

## Verification

Use README/Makefile checks. Focused backend: `backend/tests/test_explore.py`.
Frontend transport/storage tests: `miniapp/src/explore/api.test.ts`.
Browser flow: `miniapp/e2e/explore.spec.ts` uses the real guarded test backend at
320/390/430 px, including lost Start/Answer/Continue responses, hint/reload, errors
and finish. The local browser harness installs the synthetic demo only in test DB.
Do not run browser tests and pytest concurrently against that shared test database.

Migration 0004 only adds Explore tables. Downgrade removes those demo runs/content;
it does not remove multiplayer data. Never downgrade a deployed DB with Explore
progress unless that deliberate data loss is acceptable.

This slice does not claim launch readiness: there is no public abuse-rate policy,
credential recovery/revocation UI, final field-reviewed content, native storage or
real-device validation. Before exposing an anonymous public pilot, define admission/
rate limits and operational retention; no competitive score depends on this demo.
