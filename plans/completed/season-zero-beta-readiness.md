# Season Zero beta readiness audit

Status: completed

## Goal

Determine what prevents several real Yerevan teams from testing the complete Season Zero loop, and recommend exactly one next implementation branch.

## Scope

Audit gameplay, authored content, checkpoint safety, operator/admin recovery, deployment, privacy/security sanity, field verification and persistence/restart readiness. Classify evidence-backed findings B0–B3.

## Out of scope

No product source, DB, quest data, deployment configuration or other documentation changes. No fixes, new features, admin UI, commit, push, PR or merge. Only this plan may change.

## Current behavior

Baseline: clean `main` at `6652273`, confirmed equal to `origin/main` after fetch on 2026-10-25. Audit branch: `chore/season-zero-beta-readiness`.

Telegram stateless invite handoff, Telegram HMAC/JWT auth, atomic team activation and GPS completion, append-only XP and leaderboard exist. Production placeholder checkpoint is guarded. README describes local runtime and manual production requirements; these are evidence of intended operation, not proof of deployed state.

## Desired behavior

An actionable audit with flow readiness, prioritized findings and scenarios, current operator capabilities, launch/field/restart checklists, cohort gates and one next branch. Unknown real-device/deployment facts remain explicitly unknown.

## Constraints and invariants

- Read-only product investigation; do not connect to or mutate development DB.
- Do not start backend, bot, Vite, cloudflared or `make dev` for this audit.
- Preserve backend auth/GPS authority, 2–5 member teams, atomic mutations and idempotent append-only XP.
- No background location tracking or unsafe checkpoint incentives.
- Prefer existing API/OpenAPI and simple operations over speculative architecture.
- Documentation may lag code; documented intentional limits are not automatically blockers.

## Investigation

### Verdict and evidence boundary

**READY AFTER BLOCKERS.** The core loop is implemented; this audit found no new demonstrated gameplay B0/B1 code defect. Do not invite several real teams until stable production operation, verified real checkpoints and the release/field gates below are demonstrated. These are release prerequisites, not claims that an external deployment or production data definitely does not exist.

Read AGENTS, README, MVP, Decisions, Verification, relevant source/tests, both migrations, seed, admin and frontend flows. Decisions override older MVP requirements: membership covers pending and active teams; no leave/unblock/captain transfer; one completion per team/quest; failed runs reserved. README's migration overview still mentions only 0001, while actual head and test fixture require 0002. Historical counts in VERIFICATION are not current suite results.

Historical evidence: `docs/VERIFICATION_V01.md:117–145` records user-confirmed two-account Telegram/real-GPS success on 2026-10-20, using a temporary development checkpoint and a Quick Tunnel. Device OS is unspecified; this is neither current production nor complete iOS/Android evidence. Actual production resources, secrets, DB revision/dates/data and checkpoint safety were deliberately not inspected or changed.

### Gameplay readiness matrix

READY means repository implementation with relevant tests; it does not certify current deployed behavior. UNKNOWN items require the described device/field check.

| Stage/state | Status | Evidence / practical limit |
| --- | --- | --- |
| Telegram /start → Mini App / invite | READY | `bot/app/handlers.py:13–48`; stateless query handoff, private chat only, 10 fresh bot tests. Telegram HTTPS URL remains release configuration. |
| Auth | READY | `backend/app/core/security.py:27–87`, `api/routes.py:55–68`; signed raw initData, expiry/future/duplicates checks, concurrent user upsert, JWT iss/aud/exp. |
| Auth expiry / old tab | ACCEPTABLE FOR CLOSED BETA | `miniapp/src/api.ts:35–39`, `App.tsx:162–179`; 401 clears gameplay/session; close and reopen from bot. Reload of old WebView initData can still expire; no refresh-token feature required. |
| Create team | READY | `services/game.py:127–144`; atomic captain + pending team, user lock and DB membership index. |
| Invite / join / reconciliation | READY | `game.py:147–214`, `teamMutation.ts`; expiry/uses/5 seats/current membership enforced; lost response and membership 409 reconciled via /me, exact invite team checked. Expired link: ask an existing member for a new invite. |
| Pending → active | READY | Second member activates atomically; `App.tsx:195–201` polls pending team every 5s and manual refresh exists. |
| Quests / empty / loading / unavailable / errors | ACCEPTABLE FOR CLOSED BETA | `game.py:272–293`, `App.tsx:104–141`, Home/Quests screens; real empty/loading/retry states, old ranking warns when refresh fails. No active season returns no quests and empty ranking, not deleted XP. |
| START / concurrent or lost start response | READY | `game.py:296–313`, `questState.ts:startQuest`; per-team/quest uniqueness, server detail reconciliation, no automatic POST repeat. |
| Multiple different started quests | READY | Only `(team_id, quest_id)` is unique; list groups all in-progress runs; Home chooses one, QUESTS exposes others. No single-active-quest limitation. |
| CHECK IN explicit GPS | READY in code; UNKNOWN / NEEDS FIELD TEST per supported client | `App.tsx:267–275`, `telegram.ts:41–129`; no GPS until click; Telegram 8.0+ LocationManager; production has no browser GPS fallback. Any current teammate can check in; whole-team physical co-presence is not verified. |
| Denied / unavailable / null accuracy / timeout | ACCEPTABLE FOR CLOSED BETA; native recovery UNKNOWN | Error + retry, native settings only when supported and denied; manual settings/update fallback. FE API/location wait bounds are 20s/30s. Native permissions/settings need device checks. |
| Outside radius / poor accuracy | READY in code; radius/GPS UNKNOWN in field | Backend rejects before any Submission/XP; local feedback distinguishes outside/accuracy/unavailable, last explicit sample is labelled non-live. Client distance never decides completion. |
| Completion / XP / concurrency | READY | `game.py:323–369`, transaction `db/session.py:13–20`; Team→Quest→Run locks, atomic accepted Submission/completion/ledger; DB unique completion and accepted submission indexes. Repeat returns awarded_xp=0. Integration tests cover races and rollback; not freshly executed here. |
| Lost completion response | ACCEPTABLE FOR CLOSED BETA | `App.tsx:252–264`; transport error reads server detail; confirmed completion uses unknown fresh-award display, not invented +XP. HTTP 5xx or failed reconciliation leaves retry/reopen; idempotent backend protects later retry. |
| Reload / another member or session | READY in code; restart UNKNOWN | Membership/run/completion/score loaded from DB; available quest detail includes own team's run. GPS sample itself is ephemeral. Second device needs refresh/navigation/reopen; no realtime push required. |
| Leaderboard / persistence | READY in code; runtime persistence UNKNOWN | `game.py:373–403`; SUM(ScoreEvent), current season, deterministic XP/created_at/id ordering, active teams only. Restart/backup/restore still require rehearsal. |
| Completed quest | READY while quest remains available | Read-only detail/list; no new start/check-in controls. Inactive/expired quest disappears from available list even if completed; ledger XP remains. Freeze published quest identity/reward during a cohort. |

### Prioritized findings

B0/B1 below are explicit launch gates. B2 engineering can follow a supervised beta when its stated workaround is accepted; scope describes the minimal remedy, not work authorized in this audit.

**B0-01 — Stable public runtime and recoverable database are unverified (deployment).**
- Evidence: `README.md:177–192` describes static HTTPS + API routing as external work; Makefile runtime targets use reload/Vite; `docker-compose.yml:1–20` provides PostgreSQL only, a local named volume and restart policy; `bot/app/__main__.py:9–15` starts polling without deployment singleton enforcement. No production release/restart/backup procedure is supplied in the inspected repo.
- Scenario / impact: static build has no Vite proxy; wrong API origin gives failed auth; laptop/tunnel exit or bot duplication interrupts entry; storage loss loses teams, runs and ledger. Likelihood unknown for an external environment; high if the documented dev workflow is used as unattended production.
- Existing workaround: operator-attended tunnel for phase 0 only, not a stable multi-team launch. External provider setup may already satisfy the gate, but no evidence was supplied.
- Minimum remedy: one repeatable small deployment with HTTPS static/API routing, production config, supervised backend and exactly one polling bot, migrations to 0002, private persistent PostgreSQL, retained logs, automated backup and tested restore. Managed DB or persistent self-hosted DB are both possible; no orchestration platform required.
- Scope: **Medium** for one concrete deployment target plus operating instructions; broader infra is out of scope. Must be demonstrated before unattended real-team beta.

**B0-02 — No field-approved launch content is established by this baseline (content/safety).**
- Evidence: `backend/app/seed.py:23–56` supplies one 14-day season and (0,0) placeholder, inactive in production; `game.py:238–239,291–292` hides/blocks marked placeholder. No actual production contents were queried.
- Scenario / impact: fresh production seed gives an empty quest list; arbitrary replacement coordinates can send players to inaccessible or unsafe locations. Likelihood certain on a fresh seeded DB, external data unknown; impact no playable loop or unsafe field task.
- Existing workaround: current protected admin API already authors real quests; seed is intentionally safe. This does not require a feature branch or CMS.
- Minimum remedy: operator inspects launch points and records the per-checkpoint checklist below; authors one verified quest for phase 1 and a small set enabling a second session for later cohorts; verifies active season/dates and correct public visibility before activation. No locations selected or data changed in this audit.
- Scope: **Small per checkpoint**, operator/content/field work. Engineering fix before beta: **no**, existing API suffices.

**B1-01 — Current release/device/outage/restart evidence is incomplete (verification).**
- Evidence: historical smoke `docs/VERIFICATION_V01.md:117–145` explicitly leaves native denial recovery, permanent checkpoint and production deployment open. Existing E2E mocks Telegram/GPS (`miniapp/e2e/local-flow.spec.ts`, `ui-state.spec.ts`); Playwright config starts local services and test DB harness. No runtime restart/restore test was performed here.
- Scenario / impact: permissions cannot recover on a recruited client's OS; resume uses stale state; mobile response is lost; restart points at a different DB or loses data. Likelihood unknown; can block a cohort despite passing browser tests.
- Existing workaround: resolve these directly with operator/test accounts and the first trusted team; admit only client/device combinations actually verified. Absence of a full Android matrix alone is not a blocker.
- Minimum remedy: run current PostgreSQL integration suite on a dedicated disposable DB, browser flow, the field checklist and persistence/outage rehearsal below against the candidate release. Stop cohort expansion on unrecoverable auth/location, inconsistent state or duplicate XP.
- Scope: **Medium validation**, no new feature presumed. Required before multiple teams; phase 0/1 exists to obtain this evidence.

**B2-01 — Selective membership and mistaken-block recovery are missing (operator).**
- Evidence: `docs/DECISIONS_V01.md:7–12`; `routes.py:198–208` blocks and releases all current members; no leave/remove/transfer/unblock endpoints; `game.py:389` removes blocked team from ranking. DB `uq_team_member` also prevents blindly inserting a returning member into the same team.
- Scenario / impact: wrong invite, abandoned pending captain or mistaken block; moderate likelihood, high impact to that team's continuity. Other members can invite/start/check in, so captain absence alone does not halt an active team.
- Workaround: verify roster before JOIN; operator can block/disband and players recreate/join another team. Old run/completion/XP history remains attached to the old team; it does not transfer automatically. Compensating score events can restore an agreed score, not old completions. Selective SQL recovery must lock/recompute membership, captain and status; a single released_at/status edit is unsafe.
- Minimum remedy: explicit support procedure now; if preserving team continuity becomes necessary, one narrow audited transactional recovery command/API with authorization and concurrency tests. No admin UI or general team lifecycle is required for the supervised cohort.
- Scope: **Medium** for recovery engineering; **Small** for procedure. Engineering required before 2–3 supervised teams: **no**, provided destructive restart limits are accepted and communicated.

**B2-02 — XP support has blind spots and non-idempotent manual adjustments (operator/data).**
- Evidence: `routes.py:175–316` lists users/teams/quests/submissions, but no admin membership/run/score ledger detail GET; `routes.py:300–316` always inserts a new adjustment with no request key. SubmissionOut contains run/user, not team/quest linkage; normal rejected check-ins are not persisted (`game.py:337–354`).
- Scenario / impact: operator retries an adjustment after a lost response and doubles it; or cannot map an unsuccessful attempt to a team/run quickly. Moderate likelihood in poor network support; wrong score or slower incident diagnosis.
- Workaround: one operator, no automatic/blind adjustment POST retries; record returned event UUID and unique support reference in note (note is not uniqueness). If response is lost, inspect ledger by read-only SQL before any repeat; append an opposite adjustment for a confirmed error. Use player time, team/quest/run IDs, exact error and provider status logs; absence of Submission does not prove no attempt.
- Minimum remedy: documented support queries/procedure; later narrow read-only support view and/or adjustment idempotency if incident volume warrants it. Never edit/delete ledger or mark completion merely by awarding XP.
- Scope: **Medium** for API/tooling; **Small** for runbook. Engineering before small supervised beta: **no**.

**B2-03 — Season dates have no API recovery (season operations).**
- Evidence: `seed.py:22–34` creates +14 days once; repeat seed preserves existing values. `game.py:55–64,233–235,272–275,373–397` requires an active interval; only `GET /seasons/current` exists. README explicitly documents DB adjustment of dates.
- Scenario / impact: beta starts after old seed expires or crosses ends_at; no quests, new completion rejected, current leaderboard empty although ledger remains. High likelihood if an old DB is reused unchecked; global gameplay impact.
- Workaround: check dates before recruitment and keep cohort within a verified interval. If extension is needed, controlled backed-up transactional SQL by UUID preserving the same season; confirm one active season/city and UTC dates. No SQL executed here.
- Minimum remedy: preflight and expiration reminder/recovery procedure. New season CRUD is unnecessary before a short beta. This preflight is mandatory as part of B0-02; the missing API itself is B2.
- Scope: **Small** operational work. Engineering before beta: **no** if dates are prepared.

**B2-04 — Database exception tracebacks can include sensitive bound parameters (privacy/logging).**
- Evidence: `backend/app/db/session.py:9` does not set `hide_parameters`; installed SQLAlchemy `exc.py:486,520–533` defaults to including params in StatementError formatting. Auth upsert binds Telegram profile (`routes.py:58–65`); accepted submission INSERT binds GPS (`game.py:345–354`). IntegrityError is translated to 409, but other DB exceptions can escape to runtime logs.
- Scenario / impact: non-integrity DB failure while inserting profile/submission generates a traceback with personal/GPS data; lower likelihood, sensitive log retention impact. This is a verified error-formatting risk, not evidence of an observed production leak. No explicit initData/JWT/body logging found in application code.
- Workaround: restricted short-retention provider logs, no body/Authorization capture and no raw traceback copying to public support; this limits exposure but does not redact SQLAlchemy params.
- Minimum remedy: suppress bound params in engine exceptions and verify provider/proxy log redaction using synthetic failures; keep useful exception/status context. Can fit the deployment branch.
- Scope: **Small**. Recommended before beta; does not require observability infrastructure.

**B3 — Reserved failed runs, broad lifecycle/UI/realtime improvements.** No normal gameplay writer sets `failed`; HTTP/GPS failures leave the run started, and transactions roll back. A manually corrupted/failed run has no reset API and can require careful SQL or a replacement quest, but no current player-triggered permanent failure was demonstrated. Live push updates, perfect UI, full season/lifecycle CRUD and broad admin dashboards do not block the learning loop.

### Content authoring readiness

Existing `/api/v1/admin/quests` GET/POST, full PUT `/admin/quests/{id}` and PATCH `/active` are enough for one developer via HTTPS OpenAPI Authorize or an API client. Admin uses normal Telegram→JWT plus `ADMIN_TELEGRAM_IDS` on every request; rehearse obtaining/renewing the operator's JWT before live play.

`schemas/api.py:163–210` supports multiple unique-slug quests: title≤255, description≤10000, optional place_label≤255/look_for_hint≤1000/HTTPS hero URL≤2048 without credentials; finite lat/lon, radius 1–10000m, XP 1–100000, inactive default, timezone-aware ordered time window, required same-city season binding. Limits are validation bounds, not recommended field radius/rewards. Only location/system authoring is exposed. Existing quest city/season cannot be moved; create a new quest when appropriate.

Use inactive drafts → read full values → PUT preserving all content, XP, radius, dates and is_active → field approval → PATCH active. PUT is replacement: omitted optional values can clear fields or reset defaults; use PATCH for urgent off/on. For the seed, coordinate change must survive 7-decimal DB rounding to remove only the placeholder marker. Metadata/radius edits do not remove it; activation with marker is blocked. Admin POST trusts approved coordinates; an unmarked (0,0) or inaccessible point is not automatically caught as unsafe.

Hero file upload is absent; use an owned/licensed stable public HTTPS image URL, or omit it. UI has honest no-photo/broken-photo/no-hint fallback (`QuestContent.tsx:5–25`); no prototype checkpoint photo is invented. External map link uses server coordinates; embedded display is explicitly schematic, not a route. Freeze published coordinates/rewards during a cohort where possible: edits affect subsequent check-ins, completed ledger amounts remain original and displayed base_xp is current metadata. Deactivate immediately for safety, then repair and notify affected teams before reactivation.

### Checkpoint approval checklist (every real point)

- [ ] Public and legal access; no trespassing/private shortcuts; physically verify the entrance.
- [ ] Safe pedestrian approach and waiting area; no road-crossing/rushing incentive or location across a barrier.
- [ ] Field GPS reliability on participating devices; sample both safe inside and outside positions; practical radius accommodates variance without rewarding an unsafe side of the street.
- [ ] Opening hours/temporary restrictions and quest availability window agree; specify any relevant hours in briefing.
- [ ] Coordinates, place label and recognition hint identify the same accessible place; verify external Maps destination.
- [ ] Photo/content rights and HTTPS image availability; no requirement to photograph strangers or interact dangerously.
- [ ] XP is for completion/exploration, no speed reward; description explicitly allows safe walking/public paths.
- [ ] Operator knows how to disable the quest and contact affected players immediately.

### Operator incident / recovery matrix

All API paths below use `/api/v1`; admin operations require whitelisted JWT. Current API gives sufficient routine content control, but not complete API-only support. Read-only SQL diagnostics and bounded recovery procedures must be available to the sole operator.

| Player incident | Existing action/tool | SQL / limits / likelihood and impact | Fix needed before beta? |
| --- | --- | --- | --- |
| Cannot join | Read invite error, team count; teammate generates fresh invite | Expired/used/full/blocked/current-membership are distinct rules. Moderate/common; usually no SQL. Admin cannot forcibly join. | No; refresh/new invite/support. |
| Wrong team / abandoned pending team | No selective release; whole-team block releases memberships | Moderate; player cannot leave via UI/API. Disband/recreate works but old continuity is lost (B2-01). | No for supervised cohort accepting this fallback. |
| Mistaken block | Players are free to create/join another team | Low but high team impact; no unblock. Preserving original team/memberships needs careful SQL; status-only unblock is insufficient. | No if fallback accepted; never use block as a reversible toggle. |
| Captain absent | Any current member invites/starts/checks in | Moderate; active team is playable. No captain transfer; last remaining/abandoned member issue is B2-01. | No general captain lifecycle. |
| Quest will not start | Check active team, same city, active quest/season, dates, existing run | Read admin quest fields; player detail exposes own run. Expired season needs SQL. Moderate; rule-dependent. | No; preflight + diagnosis. |
| CHECK IN rejected / network uncertain | Retry GPS outdoors/settings; refresh/reopen detail, then safe idempotent retry | High likelihood transient; no normal failed-run transition. Rejected attempts not recorded; ask exact time/error. | Field gate B1-01; no bypass/manual completion. |
| Wrong XP | Leaderboard and admin submissions; append ± ScoreEvent with note | Low–moderate; ledger detail needs SQL. Adjustment lost response must be reconciled before retry. | B2-02 procedure sufficient. |
| Bad coordinates / unsafe quest | PATCH active=false, full PUT corrected fields, approve, reactivate | Moderate content-error risk; serializes with check-in on Quest row. Already-committed completion remains valid history; compensate score only by new event if needed. | No new UI. |
| Season expired | Check current season before test; controlled date repair | Predictable if old DB; all gameplay affected. No season-write API, repeated seed won't repair. | Mandatory date gate, no new season feature. |
| Manually failed/corrupt run | Diagnose with read-only SQL | Low/non-player-triggered; no retry/reset API; unique team/quest prevents fresh run. Do not delete completion/ledger. | B3 unless observed in real flow. |

### Deployment, security and minimum support

- Mini App: build `dist`, serve via HTTPS at root (current assets use root paths), correct Telegram WebApp/menu URL. Same-origin `/api` reverse proxy is simplest; split origin requires build-time HTTPS `VITE_API_BASE_URL` without `/api/v1` and exact CORS origin. Vite dev proxy is absent in production. Built-in assets/fonts exist; external authored image/network availability still needs field testing.
- Backend: production environment, strong random stable APP_SECRET_KEY, bot token/username, nonempty operator whitelist and correct DB URL; supervised uvicorn without reload, `/health` SELECT 1, migrate to head 0002 before traffic. Health does not certify schema revision, season or bot. Provider networking determines bind host; no unnecessary framework change needed.
- Bot: a supervised polling process, exactly one across local and hosted environments, restart policy, correct stable HTTPS WebApp URL, clear old webhook if present; no Redis/state store required. Polling needs outgoing Telegram access, not a new webhook endpoint.
- PostgreSQL: stable private database, TLS according to provider, persistent storage, automated backups with retention and a tested restore to a separate database; migration credentials/commands and rollback/redeploy procedure. Managed DB is convenient, not mandatory. A named volume alone is not backup; never reuse development DB as production or as disposable test target.
- Security sanity: backend validates raw signed initData and JWT expiry; admin uses DB Telegram ID, not supplied frontend ID; CORS is not authorization; all GPS/rules/XP authority stays backend. Default environment is production, production URL/placeholder-secret checks exist, admin empty whitelist denies all. Production sample `.env` must not be copied unchanged (development mode/local credentials). GPS accuracy default 150m is configurable, not auto-calibrated for each checkpoint; spoof resistance/co-presence are limited by design.
- Privacy: successful GPS is stored for verification/support and admin access only, rejected coordinates are not persisted; no continuous tracking. Brief participants before recruitment about account/GPS data, access, support and retention; agree a bounded retention/deletion procedure. Do not promise automatic erasure of append-only history. This is an operating requirement, not a legal compliance audit. B2-04 covers exception traces; runtime log settings remain unverified.
- Provider stdout/stderr/access logs plus sole operator support channel are enough initially for backend exceptions, bot poll failures and DB outages. Ordinary 4xx check-ins need player error/time/team/quest/run plus access status; logs do not contain rejection reason/context automatically and absence of a submission is inconclusive. No analytics/Sentry/Prometheus is mandatory. Restrict logs and avoid body/JWT/initData/GPS capture. Verify operators can view logs and process health before field sessions.

### Manual field smoke (candidate release, not executed in this audit)

- [ ] Verify current commit, migration 0002, active season dates spanning cohort, intended quests visible, real admin token/access, production gates, stable HTTPS URLs and exactly one polling bot.
- [ ] Two real accounts: bot→auth→create (1/5 pending)→invite correct team preview→explicit join→2/5 active on both devices by refresh/poll. No GPS prompt yet; test expired/full/wrong-team handling with operator test accounts.
- [ ] Native Telegram iOS and Android for the recruited cohort: location supported (8.0+), allow, deny, settings recovery and retry; unsupported client receives actionable update/manual instructions. If only one platform is verified, restrict initial cohort accordingly; no full device matrix is required.
- [ ] On each approved point: map/hint/photo match; safe outside check-in rejected; safe inside accepted with recorded practical accuracy; poor/unavailable/null-accuracy GPS does not award XP. No request before explicit CHECK IN and no background polling.
- [ ] Start two different quests; reopen both; another member sees same run; complete once, repeat/concurrent attempt yields no extra XP; completed detail is read-only. Any member may check in; do not claim all members physically checked in.
- [ ] Bad network / airplane mode / dropped response during create/join/start/check-in; restore connectivity, refresh/reopen and reconcile; no duplicate membership, completion or XP. Backend 5xx stays retryable, not success.
- [ ] Background/foreground during GPS and API wait, app close/reopen, old-session expiry (>configured lifetime) and fresh bot launch. No hidden busy dead-end; stale GPS sample is not current position.
- [ ] Real safe areas, keyboard/focused create input, long team/quest names, bottom CTA and external Maps return at relevant narrow widths. Browser suites cover 320/360/390 and other layouts with mocks; they do not certify native keyboard/viewport behavior.
- [ ] Operator can identify a report, disable a quest, explain ordinary GPS denial, reconcile an ambiguous operation and restore service. Stop expansion if a participant needs unsafe movement or unsupported state repair.

### Persistence / outage / restore rehearsal

- [ ] With production-equivalent isolated test accounts/data, record team/member IDs, started/completed run IDs, exact current XP/rank and exactly one accepted submission/completion event for a completed quest; keep another run started.
- [ ] Restart backend through supervisor; /health recovers; reopen Mini App and verify same team/members, started run, completion, XP and deterministic leaderboard. Do not reseed/reset DB to make the check pass.
- [ ] Restart bot alone; exactly one poller resumes /start and invite handoff; backend/DB state unchanged.
- [ ] Brief controlled backend outage before and during check-in; UI reports timeout/error within configured client wait after control returns, does not invent completion. Restore backend; refresh/reopen/read then retry if needed; at most one XP event. Include ambiguous post-commit response.
- [ ] Restart persistent DB in the isolated rehearsal if supported; verify original volume/database and data survive, not a new empty DB.
- [ ] Restore backup to a separate database and verify schema, ledger counts/balances and runs; document restore/repoint process and expected data-loss window. Do not practice restore over live development/production data.

### Beta operating model

| Phase | Cohort and checks | Success / expansion gate |
| --- | --- | --- |
| 0 | Operator + test accounts: candidate deployment, current dedicated-PG tests, admin auth/actions, safe content, restart/outage/restore and consent/support procedure | All B0 preconditions demonstrated; no duplicate XP, missing persistent state or unavailable operator recovery. No real cohort recruitment yet. |
| 1 | One trusted real team, operator present, actual checkpoints and recruited devices; do first and second session | Complete full loop without developer coordinate edits or unsafe movement; auth/permissions recover; completion/team/XP persist on reopen; B1 checklist passes for admitted clients. |
| 2 | 2–3 simultaneous teams with fixed content, operator available | Independent invites/runs/ranks correct; concurrent attempts don't double XP; ordinary issues resolved by the bounded procedures; teams return for another session. Expand after one complete concurrent round plus a second session, not merely account creation. |
| 3 | 5+ teams only after phase 2 evidence | Runtime stable, backup/recovery proven, support load manageable by one developer. If recovery repeatedly needs risky SQL or recreation destroys the learning signal, pause growth and prioritize that measured gap. |

Record only cohort size, started/completed quests, errors/recovery and return-session outcome plus qualitative player feedback; no analytics platform needed. Explain fixed roster, any-teammate completion, safe walking, GPS use, operator contact and current team-reset limits before entry.

## Implementation plan

- [x] Confirm clean/current baseline, create requested branch and audit plan.
- [x] Trace gameplay, content/admin and recovery using code, tests and docs.
- [x] Inspect production runtime, security, observability and persistence paths.
- [x] Run safe verification without services or development DB writes; distinguish historical evidence from fresh checks.
- [x] Reconcile findings, document field/rollout gates and select one next branch.
- [x] Review final diff: only this plan changed; no fixes or Git publication.
- [x] Finalize completed status and archive the audit in `plans/completed/` for durable project history; review the complete document and repository state without rerunning application/runtime tests.

## Parallel work

- Track A: gameplay/frontend/content presentation and real-device gaps; read-only evidence.
- Track B: admin/content authoring/operator recovery; read-only evidence.
- Track C: deployment/runtime/security/observability; read-only evidence.
- Lead: backend invariants, safe verification, independent validation, prioritization and final report.

## Acceptance criteria

- [x] Every gameplay stage receives a readiness status.
- [x] Each B0/B1/B2 has evidence, scenario, impact, workaround, minimal fix and size.
- [x] Content authoring, recovery limits, checkpoint safety and deployment prerequisites are explicit.
- [x] Concrete field/restart checks and phased rollout are documented.
- [x] Exactly one next implementation branch is recommended.
- [x] Product source/data unchanged; final status/diff reviewed.

## Verification

The application checks below were performed during the completed audit; they were not rerun during archival. Unchecked field, restart and next-branch acceptance checklists elsewhere in this document remain future release work, not unfinished audit steps.

- Passed: clean baseline and upstream equality after fetch on 2026-10-25.
- Passed: `npm --prefix miniapp test` — 9 files, **134 tests**.
- Passed: bot pytest with bytecode/cache writes disabled — **10 tests**, no Telegram network.
- Passed: backend `test_db_safety.py`, `test_quests.py::test_haversine`, `test_quest_content.py::test_image_url_schema_checks_final_representation` — **63 tests**, synthetic non-connectable URLs and mocks, no DB connection/mutations.
- Passed: backend collect-only — **144 tests collected**, not 144 executed.
- Passed: `make lint` — Ruff lint/format (36 files) and TypeScript `--noEmit`.
- Passed: production TypeScript + Vite build with synthetic HTTPS API base, output outside repo. Checked compiled bundle: dev sign-in/coordinates, motion debug and server-secret variable names absent; seven local CSS asset references resolve. This is not a full secret audit or proof of production host delivery.
- Passed: `alembic heads` — **0002 (head)**; offline PostgreSQL SQL generation traverses **0001→0002**, without connection. Online migration application/schema comparison was not run.
- Not run intentionally: PostgreSQL integration tests, Playwright (configured to start backend/Vite/DB harness), public deployment checks, native devices/GPS, restart/outage and backup restore. Audit uses source/tests/historical evidence; no backend, bot, Vite or tunnel process was started, and no development DB was accessed.
- Historical only: full PostgreSQL/browser tests and 2026-10-20 real-device smoke in `docs/VERIFICATION_V01.md`; migration/source have since evolved, so fresh candidate-release checks remain required.
- Passed: archival review of the complete completed plan, repository state and whitespace. Tracked diff remains empty; the sole untracked addition is `plans/completed/season-zero-beta-readiness.md`, and `plans/active/` contains only `.gitkeep`. No product source/tests/config changes, database operations or Git publication.
- Passed: durable document contains no absolute local paths, secret values, local PIDs, temporary file paths or screenshot inventories. Source references remain relative; no application/runtime tests or services were run during archival.

## Decisions

- This is an audit only; Implementation plan lists investigation steps, not future code changes.
- Preserve the completed audit in `plans/completed/season-zero-beta-readiness.md` as durable project history.
- The gameplay loop has no confirmed B0/B1 code blockers in the audited baseline.
- A stable production runtime is an engineering prerequisite; its actual deployed state remains unverified.
- Real checkpoints/content and safety approval are an operational launch gate, supported by the existing API.
- Native field, restart and outage smoke are a release gate before cohort expansion.
- A full admin UI is unnecessary before a small supervised beta.
- The single recommended next implementation branch is `chore/season-zero-beta-deployment`.
- No new admin UI/content pipeline/season platform/team lifecycle is justified before a supervised learning cohort; existing API plus controlled operations is sufficient with stated recovery limits.
- Provider logs suffice initially, with B2 privacy hardening and manual incident correlation; no automatic observability dependency.
- Do not delay beta for custom domain (provider HTTPS suffices), advanced analytics, notifications, achievements, broad anti-cheat/co-presence verification, realtime sync, perfect cosmetics, full device matrix, advanced CI/CD or scalable infrastructure. None repairs the immediate release/content/field gates.

### Exactly one recommended next implementation branch

**`chore/season-zero-beta-deployment` — Medium.** Stable public operation is the broadest unverified prerequisite; content is already supported by API and bounded recovery has supervised workarounds. Build and document one minimal reproducible deployment, not several platform alternatives. If an external deployment already exists, validate it and capture its actual commands instead of duplicating it.

Scope: HTTPS static frontend + correct API routing/config, supervised backend and singleton polling bot, migration/preflight sequence, persistent private PostgreSQL with backup/restore, usable restricted logs (including bound-parameter suppression), production/restart/outage smoke and concise operator operating instructions. No gameplay feature, CMS, admin UI, broad recovery endpoints or real quest data added to source.

Acceptance criteria:

- [ ] Reproducible build/start/redeploy for one target, no reload/Vite/dev harness; root asset delivery and HTTPS auth/API routing work from Telegram.
- [ ] Secrets remain server-side; exact CORS if split origin; production dev gates off; operator can obtain/renew admin JWT; bot username/URL correct.
- [ ] One supervised bot across environments, webhook/polling state known; process restart recovers without losing DB state.
- [ ] Migration head 0002 and current backend integration/browser checks pass on isolated PostgreSQL; data preflight rejects/flags missing season/approved content operationally, without inventing real checkpoint data.
- [ ] Backup/restore to separate DB and backend/bot/DB restart/outage checks preserve membership, runs, XP and ranking; repeated/ambiguous completion never double-awards.
- [ ] Provider logs diagnose exceptions/polling/DB problems, with restricted access/retention and synthetic checks for sensitive parameter/body/header capture.
- [ ] Operator has deploy/rollback/restart/incident commands; real checkpoint approval and native phase-1 smoke remain explicit field gates and are actually performed before cohort expansion.

## Remaining issues

All findings remain unfixed intentionally. B0-01 deployment/DB operation and B0-02 approved content must be demonstrated; B1-01 candidate-release field/restart verification is open. B2 operator recovery, XP diagnostics/idempotency, season operations and exception parameter privacy have the documented limits/workarounds. Actual external infrastructure, production DB/content, native device behavior and field safety remain unknown. Only this plan may be changed in this audit; no publication requested.
