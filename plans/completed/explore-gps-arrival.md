# Explore GPS / Arrival

Status: complete (uncommitted)

## Goal and scope

Optional browser Arrival for configured Explore stops, confirmed by the server and
restored on resume. Add migration 0005, API, UI, tests and the Explore runbook.
No Capacitor, real city content, legacy changes, commit/push or season-zero edits.

## Current / desired behavior

Explore has locked anonymous runs and clue → reveal → explicit Continue. Keep this
progression and existing no-checkpoint guides; GPS must never gate Answer.
Store only the confirmed current stop and server timestamp, not GPS samples/history.

## Investigation and invariants

- `owned_run` locks the run for all mutations; reuse it for Arrival/Continue races.
- Reuse `haversine_m`; do not call legacy team/season/check-in services.
- Published guide versions stay immutable. Test checkpoints belong to separate fixtures.
- GPS is one-shot, explicit action only. Written directions survive denial/errors.
- Nullable checkpoint config is all-or-none and requires written directions.

## Implementation plan / acceptance

- [x] Add nullable configuration, current Arrival marker and migration regression.
- [x] Add authenticated endpoint with accuracy/distance policy and concurrency tests.
- [x] Add browser GPS states without blocking Answer or auto-prompts on resume.
- [x] Exercise mobile layouts, late responses, lost responses and old flows.
- [x] Run lint/types/build, focused tests and final diff review.

## Decisions

- Confirmation requires accuracy ≤ max_accuracy and distance + accuracy ≤ radius.
  distance − accuracy > radius means outside; remaining overlap is uncertain.
- Reject samples older than 120 seconds or over 30 seconds in the future. Client
  timestamps/coordinates are untrusted; this bounds accidents, not spoofing.
- Repeated confirmed Arrival preserves timestamp; stale/foreign/future/finished
  stop mutations reject without changing state. Continue clears the marker atomically.
- Arrival network failures reconcile by read, never disable the independent Answer flow.

## Verification

- 83 focused PostgreSQL tests passed: Explore/Arrival, auth, quests, FIELD TEST and
  migration regression (0004→0005 and legacy downgrade/upgrade; Alembic check).
- 171 frontend unit tests passed; Ruff lint/format, TypeScript and production
  multipage build passed; `git diff --check` passed.
- 20 Playwright tests passed: Arrival, existing Explore and legacy multiplayer.
  Mobile 320/390/430 px; screenshots inspected at 320/430 px.
- Initial legacy browser failure was leftover FIELD TEST fixtures from backend
  tests. Reset through the guarded standard pytest fixture, then browser suite passed.
- Protected season-zero checksum unchanged. App DB was not migrated/seeded.
- Final read-only review: auth/input boundaries, locking, migration preservation,
  stale callbacks and progression integration; no confirmed P0–P3 findings.


## Remaining issues

Real iOS/Android GPS and field calibration remain manual release gates. Existing
anonymous admission/rate and credential recovery limitations remain unchanged.
