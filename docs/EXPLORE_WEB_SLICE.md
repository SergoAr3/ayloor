# Explore web flow — publication, entry and resume

Explore implements Start → Answer → Reveal → Continue → Resume → Finish, with a
free hint and optional browser Arrival. Each published Guide row is one immutable
version. No Telegram, team, XP or timer is required. The included guides remain
synthetic examples, not the finished **Yerevan: Look Closer** route.

## Run locally and publish a version

Follow README setup and reuse healthy services. Apply migrations normally:

```bash
make migrate
```

Use the existing backend and Vite commands. Publishing is an operator CLI with
normal backend database access, not an anonymous API or admin UI. Review the target
DATABASE_URL before publishing; commands below write to that configured database.
For a three-stop synthetic example:

```bash
.venv/bin/python -m app.publish_guide backend/guides/example-walk-v1.json --check
.venv/bin/python -m app.publish_guide backend/guides/example-walk-v1.json
```

`--check` validates the complete document without opening the database. Publishing
validates again and writes guide, stops and publication timestamp in one transaction.
An identical re-import returns the same guide/stop IDs and timestamp. Different
content under an existing slug is refused, including for an existing draft; there
is no overwrite/force mode. Concurrent imports serialize, so conflicting imports
cannot silently replace one another. A failed/ambiguous import can be retried with
the exact same document. CLI validation output does not echo private answer values.

The JSON format is demonstrated by the example file:

- Guide: `slug`, `title`, `description`, `stops`. Extra fields are rejected.
- Slug: lowercase ASCII letters/digits separated by single hyphens, up to 100 chars.
  It identifies a **specific version**, conventionally `name-v1`, `name-v2`; there is
  no mutable `latest` alias or separate guide-family model. Changed content needs a
  new slug. Published guide/stop updates, inserts into that version and deletion
  are rejected by PostgreSQL triggers as well as by the importer.
- Stops: 1–50 records in consecutive `position` order from 1; each contains `title`,
  `clue`, private `answer`, `hint`, `reveal`. Titles are limited to 255 chars,
  answers to 200, other text to 10,000. Text must be nonblank, valid UTF-8 without
  NUL. Files are capped at 1 MB; duplicate JSON keys and invalid types are rejected.
- Optional `directions` and nullable `latitude`, `longitude`, `radius_m`,
  `max_accuracy_m` follow the Arrival rules below. Checkpoint fields are all-or-none;
  directions are mandatory when GPS is configured. Real routes need useful written
  directions even without GPS; structural validation does not certify route safety,
  historical accuracy, answer ambiguity or field readiness.

Keep real answer-bearing import files private and outside frontend assets/public
hosting. The committed JSON is explicitly synthetic. No real Yerevan content is
installed by migration or on application startup.

Open `http://localhost:5173/explore.html?guide=example-walk-v1` (adapt the host/port).
The three example answers are **closer**, **3**, **notice**. The original two-stop
demo remains opt-in and uses the same publishing workflow:

```bash
.venv/bin/python -m app.explore_seed
```

Its entry is `/explore.html?guide=explore-demo-v1`, with answers **closer** and **3**.
No walking is required for either example.

## Entry and version contract

`GET /api/v1/explore/guides/{slug}` and `POST /api/v1/explore/guides/{slug}/runs`
accept only published versions. Unknown and unpublished versions return the same
404. Start pins the selected Guide UUID; later publications never move that run.
The public guide response contains metadata/count, not private answers or Reveals.
Existing run endpoints and legacy multiplayer contracts are preserved.

`/explore.html?guide=<slug>` opens that exact version and its saved progress, if any.
There is no implicit default guide. Empty/invalid/duplicate `guide` parameters show
an error. Unknown/unpublished versions cannot start or fall back to another route.
A fresh `/explore.html` asks for a walk link; when access is saved, it resumes the
last saved version and pins the URL to that slug. A different valid entry offers a
separate **RESUME PREVIOUS WALK** link; selecting a new version never migrates an old
run into it. This is a single resume shortcut, not a guide catalogue.

Resume reads the authenticated run first and takes title, stop count, content and
phase from `run.guide`/server state. It verifies the run ID and expected immutable
slug rather than combining an old run with new entry metadata. It does not depend
on fetching metadata for a new default/version. No Start or GPS request is automatic.

The production Vite build includes both index.html (legacy Mini App) and
explore.html. Serve both files on the existing allowed frontend origin and keep
the existing public HTTPS API configuration. Hosting must serve explore.html
rather than rewrite it to index.html; no CORS or legacy auth change is needed.

## Run credential and resume limits

There is no guest account. Each run has a separate opaque bearer credential, stored
as a SHA-256 hash on the backend. It cannot authorize multiplayer/admin endpoints.
The frontend stores one pending Start or run credential per version in
`ayloor-explore:v1:guide:<slug>`. `ayloor-explore:v1:last-guide` is a navigation
pointer only; it never authorizes a run. Clearing site data, a private-session close
or losing the device loses access.
No automatic expiry, account recovery, cross-device sync or offline queue is added.
The flow requires network access. Treat this as web storage, not a solution for
native secrets. JavaScript/XSS or same-origin scripts can read localStorage: keep
this origin trusted and do not embed third-party scripts in the Explore entry.

Old `ayloor-explore-demo-v1` storage is read only for a bare Resume entry or the
explicit old demo link. A stored credential is resolved against the server to learn
its original guide; an old pending Start is bound to `explore-demo-v1`. Migration
copies access into the correct version slot without deleting the old key or
replacing an existing scoped record. A new guide entry never consumes that key.
Unreadable/mismatched saved access gives an error; it is not cleared or replaced by
a new run. Keep the version URL to return to an older run after starting another.

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

Use README/Makefile checks. Publication/CLI/migration tests:
`backend/tests/test_explore_publication.py`; entry/storage unit tests:
`miniapp/src/explore/session.test.ts`; real-API browser tests:
`miniapp/e2e/explore-versions.spec.ts` (two versions, old demo/pending starts,
unknown/draft/invalid entries, independent tabs, and 3-stop Finish at mobile widths).
Focused backend: `backend/tests/test_explore.py` and
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
If a previous backend test left extra FIELD TEST quests, reset fixtures through the
standard guarded test before running the legacy browser suite, for example:
`.venv/bin/pytest -c backend/pyproject.toml backend/tests/test_explore.py -q`.

Migration 0004 only adds Explore tables. Downgrade removes those demo runs/content;
it does not remove multiplayer data. Never downgrade a deployed DB with Explore
progress unless that deliberate data loss is acceptable. Migration 0005 adds only
nullable Explore fields, constraints and an FK; existing progress/auth/legacy data
remain intact. Downgrading 0005 discards checkpoint configuration, directions and
Arrival confirmation, but retains guide/run/answer/hint progress.

Migration 0006 adds nullable `published_at` and immutability triggers. Existing guides
were implicitly public, so they are grandfathered with `published_at = created_at`;
UUIDs, stop content and runs remain unchanged. This is compatibility preservation,
not retrospective validation of old content. New rows default unpublished. Deploy
migration before the new backend, then use the publisher for new versions.
Downgrading 0006 keeps content/progress but removes publication state and guards;
old code treats all guide rows as public. Review any drafts before such a rollback.
There is no unpublish/withdrawal or content-edit command in this slice.

This slice does not claim launch readiness: there is no public abuse-rate policy,
credential recovery/revocation UI, final field-reviewed content, native storage or
real-device validation. Before exposing an anonymous public pilot, define admission/
rate limits and operational retention; no competitive score depends on this demo.

Before enabling real checkpoints, validate Safari on iOS and Chrome on Android over
HTTPS: first prompt/denial/re-enable, approximate location, poor signal, device clock,
background/foreground, reload, interrupted network and safe retries. Verify written
paths and standing areas on site and calibrate radius/accuracy there. Automated tests
use synthetic GPS and do not establish real-device or field readiness.
