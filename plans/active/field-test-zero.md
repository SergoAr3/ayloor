# FIELD TEST 0

Status: complete (implementation and automated verification; operator walk pending)

## Goal

Validate a real two-account team walk through Cascade → Opera → Aznavour Square →
Republic Square in 90 minutes, with the intended ledger totaling 925 / 1000 XP.

## Scope

Fixed four-quest sequence, server timer, explicit GPS before text answers, one-use
paid hint, capped wrong-answer penalty, reloadable progress and finish summary;
operator-reviewed checkpoint setup and focused integration/UI coverage.

## Out of scope

Generic campaigns/branching, solo teams, real riddles, deployment and Git publishing.
User-owned untracked `docs/season-zero.md` stays untouched.

## Current behavior

Ordinary system/location quests still complete immediately on GPS check-in.
FIELD TEST uses fixed route steps and private solutions on Quest, persisted GPS
proof on QuestRun, existing Submission records and append-only ScoreEvents.
The opt-in field seed creates four inactive, unconfigured checkpoints.

## Desired behavior

Only the next FIELD TEST quest can start. First actual start fixes the deadline.
GPS establishes server-owned proof; the answer completes the quest atomically with
its reward. Reads reconstruct sequence, hint/penalty use and summary from the DB.

## Constraints and invariants

- Backend owns availability, GPS validation, timer, completion and XP.
- All rewards/penalties use append-only ScoreEvent with database uniqueness.
- Existing location-only quests and completed records remain compatible.
- Teams still require 2–5 members; GPS only follows explicit action.
- Never invent checkpoint coordinates or enable unreviewed field content.

## Investigation

- `game.py` serializes gameplay mutations on Team → Quest → QuestRun.
- QuestRun already stores start/completion times; first/fourth runs can anchor timer.
- Submission supports text answers; its accepted index permits one completion/run.
- Migration 0003 extends ledger reasons with constrained, unique penalty events.
- Existing healthy PostgreSQL was reused; browser harness services are temporary.
- GitHub main verified at 657fea4 before creating `feat/field-test-zero`.

## Implementation plan

- [x] Extend typed quest/run state and ledger constraints with migration 0003.
- [x] Implement fixed route rules, GPS/answer/hint endpoints and backend summary.
- [x] Add safe opt-in content setup and operator documentation.
- [x] Integrate timer, answer/hint, locked states and summary into existing UI.
- [x] Cover exact ledger, concurrency, expiry, reload and UI failure states.
- [x] Run PostgreSQL tests, frontend tests, lint/type/build, mobile browser checks,
      migration checks and final diff review.

## Acceptance criteria

- [x] Intended four-quest scenario yields exactly 925 XP and 4 / 4.
- [x] Answer alone, locked quests and expired mutations cannot award XP.
- [x] Concurrent/repeated reward, hint and wrong submissions cannot duplicate XP.
- [x] Reload reconstructs timer, sequence, GPS and paid actions.
- [x] Summary uses actual backend score, elapsed time and leaderboard rank.
- [x] Existing suites pass; operator must supply reviewed coordinates/radii.

## Verification

- [x] Full PostgreSQL backend suite: **184 passed** (including exact 925 ledger,
      concurrency, GPS/sequence/expiry, rollback and legacy migration compatibility).
- [x] Bot suite: **18 passed**.
- [x] Frontend unit tests: **156 passed**.
- [x] Playwright regression selection: **96 passed** across field route, actual API
      two-player flow, ordinary UI states and check-in dismissal/accessibility.
- [x] Final FIELD TEST browser selection: **5 passed**, including 320/390/430 px,
      lost responses, reload, Hint confirmation, wrong penalties, expiry/retry and
      immediate locking when summary confirms expiry before detail refresh.
- [x] Visually inspected mobile finish, paid Hint confirmation and expiry states.
- [x] Alembic 0003 → 0002 → 0003 preserves old completed quest/XP; `alembic check` passes.
- [x] `make lint` (Ruff, formatting, TypeScript) passes.
- [x] Production build passes with a synthetic public HTTPS API origin.
- [x] Final diff review and `git diff --check` pass. No commit/push/PR/merge.

Automated GPS is synthetic. No real Telegram messages or application DB mutations
were used for verification.

## Decisions

- Fixed FIELD TEST steps on existing quests; no campaign abstraction.
- First start validates all four checkpoints using existing quest availability/GPS
  configuration guards, so an incomplete route cannot consume the timer.
- Wrong-answer history is capped to the first rejected Submission per run alongside
  its one penalty; successful GPS proof and final answer remain separately recorded.
- Timer derives from step 1 started_at; freezes at step 4 completion or 90 minutes.
- At expiry, further gameplay mutations stop; earned XP/progress remain readable.
- Wrong-answer penalty is at most 25 XP per quest run, regardless of wrong text or
  retry count. Hint costs exactly 50 XP once, only at Opera.
- Text normalization: outer whitespace trim and uppercase, exact match, no fuzzy matching.
- Server-stored GPS verification is valid for that quest until route expiry;
  teammates share progress. No client boolean or automatic location requests.

## Remaining issues

Operator must review and supply four safe pedestrian checkpoints/radii before use;
real two-account Telegram/GPS walk remains a manual field validation.
