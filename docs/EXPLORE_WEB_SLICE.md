# Explore web flow — first implementation slice

This is a synthetic two-stop flow demo, not the finished **Yerevan: Look Closer**
guide or the full MVP v0.2. It implements Start → Answer → Reveal → Continue →
Resume → Finish, with a free hint. The default demo has no checkpoints. Configured
Explore stops support optional browser Arrival; no Telegram, team, XP or timer is used.

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

Unknown progression mutation outcomes block further progression writes until explicit Resume/read restores
server state. Reload/foreground also reads it; it does not restart the run or request
location. No run state is inferred from a locally stored completed flag.

## Optional GPS / Arrival (migration 0005)

Arrival is independent of clue/reveal/finished and **never gates Answer**. There is
no automatic location prompt at start, reload, foreground or Continue. **CHECK
ARRIVAL** requests a single fresh browser location; directions, clue, free Hint and
Answer remain usable while GPS is pending or denied. There is no watch/background
tracking, map SDK, native integration or automatic retry.

New stop fields are nullable: `latitude`, `longitude`, `radius_m`, `max_accuracy_m`,
plus written `directions`. Checkpoint configuration must be all present or all absent,
with finite valid coordinates and positive finite thresholds. Configured checkpoints
require nonblank directions as the fallback. Publish a new immutable guide version
with field-reviewed public coordinates and directions; do not change existing runs'
content. Migration does not configure any checkpoint or alter the default demo.

`POST /api/v1/explore/runs/{id}/arrival` requires the existing run bearer and:

```json
{"stop_id":"UUID","latitude":0,"longitude":0,"accuracy_m":10,"captured_at":"2026-11-01T12:00:00Z"}
```

These are **synthetic API values**, not a location to visit. The server validates
finite input, stop ownership/currentness and a timezone-aware sample timestamp.
Freshness window: at most 120 seconds old / 30 seconds ahead of server time. A bad
clock or older sample returns `stale_sample`, not a penalty. Coordinates and client
timestamps can be spoofed: Arrival is orientation assistance, not proof of presence.

The server reuses Haversine distance `d`, with reported accuracy `a`, checkpoint
radius `R` and maximum accuracy `A` (meters):

- `a > A`: `low_accuracy`.
- Otherwise `d + a <= R`: `confirmed`.
- Otherwise `d - a > R`: `outside`.
- Otherwise: `uncertain` (the accuracy area overlaps the boundary).

Response: `{outcome, run}`. The run snapshot adds
`arrival: {status: not_configured | unconfirmed | confirmed, confirmed_at: UTC | null}`;
the stop adds `directions` and nullable `checkpoint`. No answer key is added.
Only `arrived_stop_id` and server `arrived_at` are stored on the run. Request
coordinates, accuracy, rejected samples and location history are not persisted.
Do not enable request-body/bearer logging in proxies, tracing or error collectors.

Arrival uses the same row lock/transaction as Answer and Continue. Repeated
confirmation preserves the first timestamp (even if retry data is now stale).
Foreign/future/old stops, finished runs and unconfigured checkpoints return 409;
invalid fields return 422; missing/wrong run credentials return 401. Confirmation
never reveals an answer or advances a stop. Actual Continue clears the marker in
its progression transaction, including Finish; an old Continue replay does not
clear the new stop's marker.

Resume displays confirmation as a **saved check**, not live location. GPS errors
and ambiguous Arrival network responses leave Answer available. **RESUME SAVED
PROGRESS** reads the persisted confirmation without another GPS request; explicit
retry is safe. Late GPS callbacks/HTTP results from a previous stop are ignored.
Arrival responses update only Arrival, so they cannot undo a newer Reveal.

Browser geolocation requires a secure context and permission; hosting must allow
it through Permissions-Policy. See [browser API requirements](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/getCurrentPosition).
The browser timeout is 15 seconds, with a 20-second UI deadline for a missing
callback/permission wait. A timed-out native permission dialog cannot be dismissed
by this code; its late result is ignored. The UI explains denial, unavailable GPS,
timeout, low accuracy, uncertainty, outside, stale samples and network failures.
The [accuracy estimate](https://developer.mozilla.org/en-US/docs/Web/API/GeolocationCoordinates/accuracy)
is statistical, not a guaranteed error bound; thresholds need field calibration.

## Verification

Use README/Makefile checks. Focused backend: `backend/tests/test_explore.py` and
`backend/tests/test_explore_arrival.py` (including 0004→0005 roundtrip); keep
`test_field_test_migration.py` for legacy migration regression.
Frontend tests: `miniapp/src/explore/api.test.ts` and `geolocation.test.ts`.
Browser flow: `miniapp/e2e/explore.spec.ts` uses the real guarded test backend at
320/390/430 px, including lost Start/Answer/Continue responses, hint/reload, errors
and finish. The local browser harness installs the synthetic demo only in test DB.
`miniapp/e2e/explore-arrival.spec.ts` starts a separate test-only guide through the
real API and stores its run credential before loading Explore; GPS is supplied by
Playwright/mocked callbacks. It checks mobile widths, error states, no auto-prompt,
late callbacks/HTTP responses, lost responses and independent Answer progression.
This fixture is not installed by the application seed and is not a public guide.
Do not run browser tests and pytest concurrently against that shared test database.

Migration 0004 only adds Explore tables. Downgrade removes those demo runs/content;
it does not remove multiplayer data. Never downgrade a deployed DB with Explore
progress unless that deliberate data loss is acceptable. Migration 0005 adds only
nullable Explore fields, constraints and an FK; existing progress/auth/legacy data
remain intact. Downgrading 0005 discards checkpoint configuration, directions and
Arrival confirmation, but retains guide/run/answer/hint progress.

This slice does not claim launch readiness: there is no public abuse-rate policy,
credential recovery/revocation UI, final field-reviewed content, native storage or
real-device validation. Before exposing an anonymous public pilot, define admission/
rate limits and operational retention; no competitive score depends on this demo.

Before enabling real checkpoints, validate Safari on iOS and Chrome on Android over
HTTPS: first prompt/denial/re-enable, approximate location, poor signal, device clock,
background/foreground, reload, interrupted network and safe retries. Verify written
paths and standing areas on site and calibrate radius/accuracy there. Automated tests
use synthetic GPS and do not establish real-device or field readiness.
