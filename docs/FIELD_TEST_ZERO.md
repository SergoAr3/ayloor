# AYLOOR — FIELD TEST 0

**Cascade → Opera → Aznavour Square → Republic Square**. Four quests at 250 XP,
maximum **1000 XP**, **90 minutes**, teams **2–5 players**. An engine test with
operator-provided codes, not real riddles.

## Operator setup

Use the normal README environment setup and beta deployment runbook. Reuse healthy
local services; never start a duplicate backend, Vite or polling bot.

```bash
make migrate
.venv/bin/python -m app.field_test_seed
```

The opt-in seed creates four **inactive** quests, with **no coordinates or radius**.
It preserves existing content, old runs/XP, base seed and season dates. There are no
reliable real checkpoint coordinates in project data. The base seed's `(0, 0)` is
an explicit development placeholder and is not reused.

Copy `backend/content/field-test-zero.checkpoints.example.json` to a local file.
For steps 1–4 supply latitude, longitude and radius in metres for a safe public
pedestrian standing area, and set `reviewed_safe` to `true`. The example deliberately
fails validation until all four entries are supplied/reviewed. No coordinate or
radius is silently inferred. Inspect on site; the radius must not require traffic,
private land or restricted areas.

```bash
.venv/bin/python -m app.field_test_seed --checkpoints /tmp/ayloor-field-checkpoints.json
```

This validates all points and configures/activates four quests in one transaction.
Reconfiguration with this command is rejected once any FIELD TEST run exists.
Rerunning without `--checkpoints` preserves edits. Do not edit checkpoints mid-run.

Inspect the existing authenticated `GET /api/v1/admin/quests` before walking:

| Step | Slug | Place | Code | Hint |
| --- | --- | --- | --- | --- |
| 1 | `field-test-zero-1` | Cascade | `ZERO1` | None |
| 2 | `field-test-zero-2` | Opera | `ZERO2` | Reveals ZERO2; −50 XP once |
| 3 | `field-test-zero-3` | Aznavour Square | `ZERO3` | None |
| 4 | `field-test-zero-4` | Republic Square | `ZERO4` | None |

Review coordinates/radii, active flags, GPS accuracy limit and **current season
dates**. Existing season dates are not extended; use the beta runbook's season
operations if expired. To show only four quests, deactivate other available quests
(including First Checkpoint) through the existing admin active endpoint. The field
seed never silently disables or rewrites existing quests.

## Authoritative rules

- Only the next step can start. Completion and reward commit together; the next
  quest unlocks from completed state, with no separate unlock flag.
- Step 1's actual `QuestRun.started_at` starts the timer. Team creation, route reads
  and retries never restart it. Deadline = start + 5400 seconds.
- At `now >= deadline`, backend rejects new starts/GPS/answers/hints. Earned XP and
  progress remain saved. No overtime or restart. Elapsed freezes at 90 minutes or
  earlier at step 4 completion.
- Explicit CHECK IN uses normal backend team/city/season/radius/accuracy validation.
  It stores `gps_verified_at` and a pending location Submission, awarding **0 XP**.
  GPS proof is shared by teammates for that quest until expiry. No client GPS
  boolean is accepted, no background location is requested. Client GPS spoofing
  remains a known limitation, as with existing check-ins.
- Correct answer creates an accepted answer Submission, completes the run and
  appends `quest_completion +250` atomically. Replays award 0 extra XP.
- Normalize with outer whitespace trim and uppercase, then exact comparison.
  Internal spaces/punctuation matter; no fuzzy matching. Public quest payloads
  omit solutions and unused paid hints; the operator supplies test codes.
- Wrong answers append `wrong_answer_penalty -25` **at most once per quest run**,
  shared across all members and wrong strings. Further wrong answers cost 0.
  This deterministic cap prevents accidental charges during ambiguous retries.
- Opera's Hint requires GPS and explicit UI confirmation; it appends
  `hint_penalty -50` once. Reads restore the paid text after reload; retries cost 0.
- Writes lock Team → Quest → QuestRun. Unique indexes enforce one completion and
  one event per penalty reason/run; DB constraints require exactly −50/−25.
  The append-only ScoreEvent trigger remains unchanged.
- Completed answers can be replayed after expiry with no reward; already paid
  hints remain readable/replayable after closure with no charge.

## API and UI

`GET /api/v1/field-test-zero` returns the current season route summary or `null` when
no field content is installed. Route score sums this team's route-run ScoreEvents;
unrelated season/admin XP is excluded. Rank uses the existing **season leaderboard**
and stable tie ordering. There are no speed rewards/tiebreakers.

Quest list/detail add step, locked state, hint availability/use, paid hint text,
wrong-penalty state and run GPS timestamp. `POST /quest-runs/{id}/answer` accepts
`{"answer":"…"}`; `/hint` reveals the paid hint. Both return updated quest and
actual reward/penalty/replay flags. `/check-in` returns a started FIELD TEST run
until the answer is correct. Ordinary location-only quests still complete on GPS.

UI reconciles ambiguous writes through reads, never automatic POST retries. Live
state refreshes every 15 seconds and on visibility resume. Timer interpolation is
presentation only. Home/Quests reconstruct the summary after reopening.

## Two-account field acceptance

1. Create a team in Telegram, invite a **second Telegram account**, join explicitly
   and verify active team with two members. No one-player mode was added.
2. Cascade: start → GPS → `ZERO1` → **250 XP**; timer starts on actual start.
3. Opera: GPS → confirm Hint **−50** → `ZERO2` → **450 XP**. Reload/reveal again:
   no new charge, no automatic GPS request.
4. Aznavour: GPS → wrong code **−25** → `ZERO3` → **675 XP**. Repeated wrong codes
   cost no additional XP on this quest.
5. Republic: GPS → `ZERO4` → finish. Confirm **925 / 1000 XP**, **4 / 4 quests**,
   actual elapsed time and actual season leaderboard position. Reopen on both accounts.

Expected ledger: `250 - 50 + 250 - 25 + 250 + 250 = 925`. No hint/no errors yields
1000. UI never hardcodes 925. One route run per team; no reset mechanics added.
Walk, do not rush; use crossings and public paths. No photography or stranger
interaction is required.

## Verification and migration

Use README/Makefile test/build commands. Focused backend:
`backend/tests/test_field_test_zero.py`; browser contract tests:
`miniapp/e2e/field-test-zero.spec.ts` at 320/390/430 px, including lost responses,
reload, expiry and retry. Automated location is synthetic, not device GPS.

Migration `0003` adds private quest fields, route step, GPS proof and ledger indexes/
constraints. Existing rows keep null route fields. Downgrade to 0002 is compatible
only without penalty events or unconfigured field checkpoints: PostgreSQL rejects
incompatible constraints and rolls back. No ledger history is deleted to force it.
Real Telegram permissions, GPS accuracy and checkpoint safety require the on-site
walk. Automated tests target only the dedicated PostgreSQL test DB.
