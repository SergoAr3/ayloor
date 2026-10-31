# AYLOOR MVP v0.2 — Yerevan: Look Closer

Status: target MVP specification for **EXPLORE**; not implemented.
Product context: [Product Direction v2](PRODUCT_DIRECTION_V2.md).

## Goal and boundaries

Deliver one playable city guide in Yerevan for English-speaking tourists aged 20–40,
visiting for a few days and exploring solo, as a couple or in a small group.

**AYLOOR — A city guide you play.**

**WALK → NOTICE → SOLVE → REVEAL → CONTINUE**

The first guide has **4–5 stops** and takes approximately **60–75 minutes** of
comfortable walking and interaction, excluding voluntary breaks. It is English-first,
solo-first and available to start anytime, without booking a tour or waiting for
others. Known access hours or temporary closures must be communicated; “start anytime”
does not promise access to a closed or unsafe stop.

No hard timer or speed reward. No required account before start, Telegram or team.
The user should look at the city more than at the phone.

## Minimum user journey

| Stage | Required experience |
| --- | --- |
| Discover / choose | Show Yerevan and the single guide: title, promise, English language, 4–5 stops, approximate duration, starting point and known access/safety limitations. No city catalogue is needed. |
| Start | Start on demand, without account creation, Telegram authentication or team setup. Explain how progress can be resumed and any device/browser limits. |
| Walk | Give brief directions to the next safe public stopping area. Make it easy to put the phone away; do not require staring at a live map. |
| Clue | Ask the walker to notice a real physical detail and solve one clear question. Keep the clue and answer entry short. |
| Hint | Offer an optional hint through explicit action, with no XP cost, timer or competitive penalty. Restore revealed hint state on resume. |
| Answer | Accept an answer, show helpful incorrect-answer feedback, allow retry and retain current progress. Do not consume the walk or charge a penalty for a typo. Matching rules and validation ownership require a separate implementation decision. |
| Reveal | After an accepted answer, show a brief sourced story connecting the detail to the city. Keep it available when returning to the stop. |
| Continue | Require explicit Continue to move to the next stop. Do not automatically skip the story or mark the next stop solved. |
| Pause/resume | Allow stopping and reopening without a deadline. Restore the current stop, accepted progress, revealed hints/stories and whether Continue is pending. |
| Finish | After the final stop and Continue, show completion and a short reflection on the walk. Finishing is not a leaderboard position. |
| Feedback | Offer optional simple feedback: whether it was worthwhile, whether something new was noticed, and an optional problem/comment. Allow dismissal without blocking completion. |

A small group may use one shared screen. Synchronized multiplayer progress is not
required. One guide is sufficient; discovery may be a single guide page.

## Stop content contract

Each stop needs an editorial record containing:

- a verified public place, approach directions and safe standing area;
- one physical observation clue and its expected answer with reviewed ambiguity;
- an optional hint that helps notice the detail rather than changing the task;
- a concise Reveal/story, with sources recorded for editorial verification;
- the next walking instruction, or the final completion transition;
- known access restrictions, closure handling and safety limitations.

This is a content checklist, not a database schema or API contract. The route and
exact places remain unconfirmed until field inspection. Do not substitute the
FIELD TEST ZERO operator codes for real observation puzzles.

## Progress, location and failure states

- Progress must survive a normal reload and close/reopen on the same supported
  device/browser context. Cross-device sync, account recovery and offline-first
  operation are not MVP requirements. Explain limits, including cleared local data
  or ephemeral browser storage; determine the persistence mechanism separately.
- Pause/resume must not depend on a season deadline or a 90-minute FIELD TEST timer.
  Do not remove the timer from the existing mode as part of documentation alignment.
- Request location only when useful, such as an explicit “help me find the stop”
  action, with a clear purpose. Denial or unavailability must leave usable written
  directions. No automatic prompt at entry, background tracking or route recording.
- Show understandable loading, network error and retry states. An ambiguous answer
  response or duplicate Continue must not skip a stop or lose accepted progress.
  Reopening the guide must restore a consistent state.
- If a stop is inaccessible or its clue is missing, provide a safe instruction to
  stop/pause and a way to report it. Do not send walkers into restricted areas or
  fabricate a correct answer. Any skip/replacement policy needs content validation
  before release; do not add generic branching now.
- Keep clues legible on mobile, controls usable while standing, and directions
  understandable without needing to interact with strangers or take photographs.

## Acceptance and validation

The first guide is ready for pilot only when:

1. All 4–5 stops and walking links have been checked on site, including safe lawful
   access, visible clues, answer ambiguity and researched stories.
2. One solo walker can start without an account, Telegram or a teammate and complete
   every Walk → Clue → optional Hint → Answer → Reveal → Continue transition.
3. Incorrect answers allow retry; hints are optional and carry no competitive cost.
4. Reload and close/reopen preserve progress before/after an answer, after a hint,
   on a Reveal, before Continue and on Finish. Pause imposes no deadline.
5. Denied/unavailable location has a useful fallback; requests follow explicit
   action only. Network failures do not lose accepted progress or advance twice.
6. The route has no hard timer, speed ranking or mandatory leaderboard interaction.
   Feedback is optional and finish remains available after dismissal or an error.
7. Target visitors test the walk at a comfortable pace. Record completion, duration,
   independent solving, discovery value and observed phone attention using the
   proposed pilot metrics in [Product Direction v2](PRODUCT_DIRECTION_V2.md).

Later implementation tasks must add relevant state-flow, persistence, authorization
and validation tests. This docs-only change does not claim these checks already pass.

## Platforms and implementation boundaries

Target platforms: **iOS / Android / Web**. This does not commit the MVP to three
separate apps or simultaneous store releases. Use a separate architecture spike to
choose the smallest viable pilot delivery and reuse current React/TypeScript
frontend investment where practical. **Capacitor is a candidate, not a decision.**

Current implementation remains FastAPI/PostgreSQL, aiogram and a Telegram Mini App
with teams, authenticated quests, server GPS verification, ScoreEvent XP and
leaderboard. FIELD TEST ZERO adds fixed sequence, text answers, penalties and a
90-minute server timer. These are working legacy contracts, not EXPLORE acceptance.

The target no-account experience needs separately scoped auth/progress migration;
it does not authorize bypassing current Telegram initData checks. No decision is
made here to remove FastAPI, ScoreEvent, Telegram auth or server GPS, or to move
answer validation to the client. Preserve backend authority, atomic mutations,
idempotent XP and existing records until an explicit migration defines otherwise.

[MVP v0.1](MVP_V01.md), [Decisions v0.1](DECISIONS_V01.md), completed plans and
[FIELD TEST ZERO](FIELD_TEST_ZERO.md) remain historical/current implementation
context. EXPLORE development and any migrations are separate tasks.

## Non-goals

No mandatory accounts, teams, invites, Telegram entry, leaderboard, XP economy,
hard timer or penalties in the new guide experience. No new PLAY/competitive season
work. No migration or deletion of those systems in the current docs task.

Do not build payments, subscriptions, a marketplace, multi-city platform, CMS,
AI-generated guides, route generation, AR, badges, achievements, inventory, social
feed, live tracking, synchronized multiplayer, cross-device sync or offline-first
infrastructure. Validate this single guide before broadening scope.
