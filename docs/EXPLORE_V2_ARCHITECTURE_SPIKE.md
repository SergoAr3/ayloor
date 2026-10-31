# Explore v2 — architecture spike

Status: research and recommendations, not an accepted migration design.
Date: 2026-10-31. Repository baseline: `87bf5bf` (PR #9).

Scope: assess reuse, backend/data boundaries and the smallest solo-guide path.
No application changes, dependencies, native projects, database migration or runtime
experiments were made. Device feasibility remains unproven. Product requirements:
[Product Direction v2](PRODUCT_DIRECTION_V2.md), [MVP v0.2](MVP_V02.md).

## Answers to the three questions

1. **React/Vite reuse is realistic; wrapping the existing gameplay unchanged is not.**
   Keep the frontend toolchain and useful UI pieces. Add a dedicated EXPLORE entry
   and flow, isolated from Telegram/team bootstrapping. Capacitor is technically
   compatible with the build shape, but requires a separate device proof.
2. **Keep FastAPI, PostgreSQL and the existing multiplayer data intact.** Reuse City,
   transaction infrastructure and testing patterns. Add small guide/progress models
   rather than making teams optional throughout QuestRun/Submission/ScoreEvent.
3. **Introduce an additive guest-owned guide run with explicit Reveal/Continue state.**
   Keep answer validation on the backend as the initial recommendation, without
   competitive XP, season gating or a hard timer. Resume reconstructs persisted
   state; it must not depend on React memory or a Telegram JWT.

Recommendation: validate a complete mobile-web EXPLORE flow first, with a later
bounded Capacitor proof. This is sequencing advice, not a change to the target
platforms iOS / Android / Web or a commitment to a native framework.

## Evidence in the current code

| Area | Observation | Consequence |
| --- | --- | --- |
| [Frontend build](../miniapp/package.json), [Vite config](../miniapp/vite.config.ts), [HTML](../miniapp/index.html) | React 19 / Vite 6 client app, default static build, HTML root with head; Telegram script loaded globally | Existing build shape fits Capacitor; give EXPLORE an entry that does not load or require Telegram |
| [App](../miniapp/src/App.tsx) | Boot authenticates Telegram or restores a session token; refresh reads `/me`, team, leaderboard and FIELD TEST state | Reusing App unchanged would keep the wrong entry requirements; avoid sprinkling solo exceptions through it |
| [API client](../miniapp/src/api.ts) | Global token in sessionStorage; every 401 clears it and emits a Telegram session-expiry event | Reuse transport/error handling ideas, but isolate guest credentials and expiry behavior from legacy auth |
| [Location](../miniapp/src/telegram.ts) | Production location uses Telegram; browser geolocation fallback is development-only | Add an explicit EXPLORE browser/native location path; never enable the legacy dev fallback in production |
| [UI content](../miniapp/src/components/QuestContent.tsx), [FieldAnswer](../miniapp/src/components/FieldAnswer.tsx) | Useful mobile presentation exists, but props depend on Quest; answers require GPS and display penalties | Reuse styling and small controls selectively; EXPLORE needs its own clue, free hint and Reveal view |
| [Models](../backend/app/models/__init__.py) | User requires unique telegram_id; QuestRun requires team_id; Submission requires user_id; ScoreEvent ties to team/season | A guest is not a fake Telegram User or a one-person active Team |
| [Game validation](../backend/app/services/game.py) | validate_quest requires active team, current active season, system location quest and configured GPS | Do not route EXPLORE through it by disabling checks |
| [FIELD TEST](../backend/app/services/field_test.py) | Fixed four-step sequence, 90-minute deadline, GPS before answer, ledger penalties | Reuse concurrency/reconciliation patterns, not the route service as a guide engine |
| [Auth](../backend/app/api/deps.py) | CurrentUser resolves signed token subject to an existing User; admin requires Telegram allowlist | Add a separate narrowly scoped guest dependency; do not weaken CurrentUser or admin checks |
| [CORS config](../backend/app/core/config.py), [app](../backend/app/main.py) | Production requires exactly the Telegram Mini App HTTPS origin | Native/web EXPLORE needs an explicitly tested origin-policy change; adding a CORS entry alone currently fails config validation |

Existing regression assets include [Telegram location tests](../miniapp/src/telegram.test.ts),
[API failure tests](../miniapp/src/api.test.ts), [FIELD TEST backend tests](../backend/tests/test_field_test_zero.py)
and [mobile reload/retry tests](../miniapp/e2e/field-test-zero.spec.ts). They are useful
patterns and legacy protections, not proof that EXPLORE works.

## Capacitor feasibility and the bounded proof

Official [installation documentation](https://capacitorjs.com/docs/getting-started)
requires a package manifest, built assets directory and root HTML with a head.
The repository fits that source layout; a future config could point webDir to the
Vite output. Sync copies the built bundle into native projects. This supports a
compatibility inference, not a successful iOS/Android build claim.

Keep React/TypeScript/Vite; no Ionic UI or React Native rewrite is needed to assess
this option. Introduce only small boundaries where there is a real difference:
location request, durable progress/credential storage and lifecycle refresh.
Do not build a generic platform SDK or shared-component package first.

Native concerns that cannot be solved by merely packaging the bundle:

- HTTPS API calls from a native WebView have different origins from the Telegram
  website. Verify actual iOS/Android origins and preflight using the selected
  version; retain explicit allowlists and authorization. Capacitor's
  [configuration](https://capacitorjs.com/docs/config) documents native scheme and
  hostname settings. Do not add wildcard CORS or a production live-reload server.
- The [App API](https://capacitorjs.com/docs/apis/app) exposes lifecycle and Android
  Back events. Test foreground reconciliation, process termination and navigation;
  a background event alone is not a reliable final save point.
- [Geolocation](https://capacitorjs.com/docs/apis/geolocation) provides one-shot
  position requests. Use them only after an explicit useful action, with native
  permission setup and denied/unavailable fallbacks. No watch or background tracking.
- [Preferences](https://capacitorjs.com/docs/apis/preferences) is lightweight native
  key/value storage, with localStorage fallback on web. Its docs warn against
  relying on localStorage durability on mobile; uninstall clears stored data.
  It is a candidate for non-secret resume metadata, not evidence of secure token
  storage. Select credential storage separately and document recovery limits.
- Native tooling adds build/release work. The current
  [environment guide](https://capacitorjs.com/docs/getting-started/environment-setup)
  lists Node, macOS/Xcode for iOS and Android tooling. Pin and verify the chosen
  version/toolchain during the proof; do not infer installed SDK readiness here.

A later technical proof should package a minimal EXPLORE entry and use synthetic
content on an isolated test backend, then verify on iOS and Android:

1. Assets render, HTTPS API/preflight works and secrets are absent from the bundle.
2. Cold launch has no Telegram/account/team requirement.
3. Answer → Reveal → close/kill → reopen restores Reveal, without advancing.
4. Explicit Continue advances once even after a lost response or double tap.
5. Back, keyboard, safe areas and 320/390/430 px layouts remain usable.
6. Optional location works or degrades to written directions after denial.

Until those checks pass, Capacitor remains a plausible candidate. Mobile web is
also a valid pilot delivery if the native proof exposes disproportionate work.
No installable PWA or offline service worker is required for that web pilot.

## Backend and data: preserve versus add

Retain FastAPI routing, typed Pydantic input/output, SQLAlchemy async sessions,
PostgreSQL, Alembic, UUID/FK/UTC conventions and existing deployment/test machinery.
Reuse City as the geographic anchor. Reuse only verified editorial content, not
FIELD TEST codes or assumed checkpoint coordinates.

Preserve User, Team/TeamMember, Invite, Season, Quest/QuestRun, Submission,
ScoreEvent, Telegram auth, GPS validation, ledger triggers and uniqueness constraints.
Do not backfill old competitive runs into guide runs. No destructive migration is
needed for the first EXPLORE slice.

Candidate conceptual additions, to refine in the implementation plan rather than
accept as final DDL now:

| Concept | Minimum responsibility |
| --- | --- |
| Guide | City, slug, English title/summary, duration estimate, publication/content revision |
| GuideStop | Guide/revision, stable identity and unique sequence, directions, clue, hint, private answer policy and Reveal |
| GuideRun | Guest owner, pinned guide revision, current stop/phase, start/finish timestamps; no team, XP, season deadline |
| StopProgress | Run + stop uniqueness, hint-revealed and answer-accepted state; support reviewing earlier Reveals |
| Guest session | Narrow possession-based authority over its own runs; independent of Telegram User |

A simple file-based editorial seed is sufficient initially; no CMS. Publishing must
not silently reorder or change the answer for an active run. Use a small immutable
published revision or an equivalent pinned snapshot; no general content-versioning
framework is needed. Feedback can be stored minimally against the run; choose its
precise shape later, avoiding a broad analytics/event system.

Alternatives considered:

- **Force EXPLORE into QuestRun:** initially fewer tables, but requires changing
  non-null team/user ownership, season/GPS gates and scoring assumptions. Rejected
  as the first migration path because it spreads compatibility risk across working flows.
- **Client-only guide/progress:** useful for clearly labelled content prototypes,
  but choosing client answer authority now conflicts with the preserved backend
  rule. Not the recommended production starting point; would need explicit approval
  of a changed contract and an analysis of storage/recovery/spoiler tradeoffs.
- **Separate backend/service rewrite:** duplicates working infrastructure with no
  demonstrated pilot benefit. Prefer an additive area inside the modular monolith.

## Guest ownership and API boundary

No required account is not the same as unauthenticated access to saved runs.
Recommend a server-issued opaque guest credential with a server-stored hash, scoped
to EXPLORE and an owner. Do not mint Telegram identity, use public run UUIDs as
credentials, accept caller-selected owner IDs or let guest tokens satisfy CurrentUser.

A proposed small `/api/v1/explore` area provides public published-guide reads plus
guest-owned start, resume/read, hint, answer, Continue and optional feedback actions.
The exact paths and DTOs are implementation work. Public responses must omit answer
keys; gated Reveal is returned only when the server records acceptance. Guests have
no access to team/admin/ledger endpoints. Rate-limit anonymous creation and answer
attempts without introducing scoring penalties or a new infrastructure service.

Guest bootstrap and run start must handle lost responses explicitly: establish and
persist the guest credential before starting a guide, then persist a start request
key and use database-backed idempotency per owner/key. A lost bootstrap may leave
an unused guest record; it must not silently create a second run or adopt someone
else's progress. Never log credentials or return another owner's run via a retry key.

Credential transport/storage is a required implementation decision: compare a
secure cookie for web with scoped bearer credentials for native, considering CSRF,
XSS, CORS and recovery. Avoid making the current global api.ts token serve both
modes. Non-secret run IDs/cached UI state are not authorization. Losing guest
credentials or clearing storage can lose access; disclose the supported resume
window and limits. Retention, renewal and revocation policy must be defined before
pilot, without turning ordinary pause/resume into a gameplay deadline or requiring
an account to continue. Cross-device recovery is outside the first MVP.

## State contract for solo / start-anytime / Reveal / resume

Recommended server-owned progression:

`walk/clue → accepted answer / Reveal → explicit Continue → next stop → … → finished`

- Walk/clue can be one interaction phase; no need for a persisted flag for every
  screen. Persist the distinction between “answer accepted; Reveal pending Continue”
  and “advanced”. Free hint state and earlier accepted stops survive reopening.
- Start is independent of competitive seasons and team activation. Published content
  availability still matters; emergency withdrawal needs a safe explanation and
  preserved progress, not forced access to an unsafe stop.
- Answer checks only the current stop and its pinned answer policy on the backend.
  Incorrect input leaves progress unchanged. Define case/whitespace/accepted variants
  per content needs; do not blindly copy FIELD TEST exact code matching.
- Accepted answer and persisted Reveal phase commit atomically. Repeated answer
  returns the accepted result; no score event is created. Continue requires accepted
  state and an expected stop/version so a delayed duplicate cannot advance twice.
- Serialize mutations on the guest run and use database uniqueness/version checks.
  Last Continue atomically records finish. Hint, answer and Continue reconcile
  through a run read after ambiguous transport failure; no blind replay on reconnect.
- Pause needs no running timer or background task. Persist each successful action,
  return to the saved phase on launch/foreground and refresh server state. A separate
  paused boolean is unnecessary unless the UI later needs one.
- Optional navigation location never becomes a completion boolean. Existing server
  GPS checks remain unchanged for legacy quests; the proposed guide's non-GPS
  observation-answer contract must be explicitly accepted in its implementation task.

## First implementation boundary and verification gates

Suggested first feature: one English guide on mobile web, additive guest/run APIs,
server answer validation, free hint, Reveal, explicit Continue, durable same-context
resume, finish and optional feedback. Use synthetic fixtures until the actual
4–5 stops, stories and safe route have been field-reviewed. No new competitive mode,
legacy deletions, native store release, payments, map engine or offline queue.

Before implementation, settle guest credential storage/transport/lifetime, published
revision handling, concrete answer rules and public/guest DTOs. Use the project's
large-task plan template for that cross-stack/schema/auth feature.

Required meaningful checks for that feature:

- PostgreSQL tests: guest isolation, legacy token rejection, unavailable content,
  private answers/Reveal boundaries, retry-safe starts, concurrent answer/Continue,
  transaction rollback and pinned-content resume.
- UI tests: no mandatory Telegram/team/account, incorrect answer, optional hint,
  Reveal retained before Continue, reload/close/reopen, storage loss, loading/error
  recovery, location denial, finish and dismissible feedback at mobile widths.
- Regression: Telegram auth/team activation, ordinary GPS completion, FIELD TEST
  timer/penalties and XP idempotency; migrations preserve existing rows and ledger.
- Type/lint/build and the normal project checks; real browser resume validation.
  Add the native device matrix only when a Capacitor proof is actually performed.

## Verification of this spike and remaining uncertainty

Performed: source/config/test inspection, V2/V01 contract comparison, primary-source
Capacitor documentation review, local-link/whitespace/scope review and protected-file
checksum check. No runtime code or historical docs changed. No services started.

Not performed: native builds, simulator/device runs, production origin experiments,
guest token implementation, database migration or a real tourist walk. These are
explicit verification gates above, not successful results of this document.

Conclusion: reuse the stack and add a narrow EXPLORE flow. The current evidence does
not justify a rewrite or make Capacitor a project invariant.
