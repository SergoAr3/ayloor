# AYLOOR Project Instructions

## Mission

AYLOOR is a playable city guide product currently evolving from its original multiplayer city-game MVP.

Public positioning:

**AYLOOR — A city guide you play.**

First launch market: Yerevan, Armenia. First product: **Yerevan: Look Closer**.

**EXPLORE** is the current product direction and priority: solo-friendly, English-first city walks for visitors, with no mandatory Telegram or team.

Target journey:

Discover city → choose walk → start anytime → walk → notice → solve → reveal → continue → finish

Core loop: **WALK → NOTICE → SOLVE → REVEAL → CONTINUE**.

The user should look at the city more than at the phone.

Current implementation is still the multiplayer Telegram Mini App: teams, server GPS verification, quests, XP/ScoreEvent and leaderboard, including FIELD TEST ZERO. EXPLORE is a target, not an implemented flow. Keep the existing multiplayer stack until an explicit migration task changes it; do not remove legacy systems merely because the product direction changed.

**PLAY** / competitive city games and seasons remain a possible future mode, not the current priority. Validate one complete playable guide before expanding the platform.

---

## Engineering principles

This project is built and maintained by one developer.

Prefer solutions that are:

- simple
- explicit
- typed
- easy to debug
- easy to remove or change
- testable
- production-reasonable

Avoid unnecessary abstraction and architecture for hypothetical future scale. Prefer obvious code; a small amount of duplication is better than premature abstraction.

Preserve existing conventions unless a concrete reason warrants change.

---

## Source of truth

Do not treat this file as complete product or implementation documentation.

Before a non-trivial change, inspect relevant code, tests and documentation: `README.md`, `docs/PRODUCT_DIRECTION_V2.md`, `docs/MVP_V02.md`, and relevant feature-specific documents under `docs/`. Use `docs/DECISIONS_V01.md` and `docs/MVP_V01.md` for historical/current implementation context; they do not define the new product priority.

Check both code and documentation for freshness.

Do not load or rewrite unrelated documentation.

Identify conflicts with documented decisions before changing behavior.

---

## Stack

Backend:

- Python 3.12+
- FastAPI
- PostgreSQL
- SQLAlchemy 2.x async
- Alembic
- Pydantic v2
- asyncpg
- pytest

Telegram bot:

- aiogram 3.x

Mini App:

- React
- TypeScript
- Vite

Infrastructure:

- Docker
- Docker Compose

---

## Architecture

AYLOOR is a monorepo.

Main areas:

```text
ayloor/
  backend/
  bot/
  miniapp/
  docs/
  scripts/
  docker-compose.yml
  Makefile
  .env.example
  README.md
  AGENTS.md
```

The backend is a modular monolith. The Telegram bot handles entry/handoff; the Mini App handles gameplay UI.

The backend remains authoritative for authentication, game rules, quest completion and XP.

Add repository, service, event or domain abstraction layers only when they simplify the current task.

Extend the existing architecture. Unless explicitly required, do not add Redis, Celery, Kafka, Kubernetes, Terraform, GraphQL, microservices, AI/LLM, vector databases or complex event systems.

Avoid dependencies when the existing stack suffices.

---

## Local runtime safety

Before starting local services, inspect what is already running. Reuse existing healthy services when possible.

Do not start duplicate backend/uvicorn, Telegram bot, Vite, cloudflared, `make dev` or `scripts/dev.py` instances. Only one Telegram polling bot instance may run.

---

## Database invariants

Use PostgreSQL.

Prefer:

- UUID internal primary keys
- timezone-aware UTC timestamps
- explicit foreign keys
- useful database constraints
- transactions for atomic business operations
- database-level uniqueness where concurrency matters

XP uses the append-style `ScoreEvent` ledger as the source of truth.

Do not replace it with a mutable `team.xp` source of truth.

Operations that change multiple pieces of gameplay state must remain atomic.

---

## Security invariants

Never trust Telegram user IDs supplied directly by frontend code.

Telegram Mini App authentication must validate raw Telegram `initData` server-side.

Never expose secrets to frontend code.

GPS quest completion must always be validated by the backend.

Frontend code must never be authoritative for whether a quest was completed.

XP completion must remain idempotent.

Repeated or concurrent check-ins must never award completion XP twice.

Development helpers must not weaken production behavior.

Do not remove an existing backend validation merely because the frontend already performs the same check.

---

## Product invariants

EXPLORE target: solo-first, start anytime, no required account before start, no mandatory Telegram or team, pause/resume and no hard timer. Leaderboard is not central.

These targets do not authorize bypassing current authentication or gameplay validation. Existing multiplayer rules remain in force until explicitly migrated: a team requires at least 2 members to become active; team size is 2–5 people.

Location is requested only when useful and after explicit user action.

Do not implement continuous or background location tracking.

Prioritize one complete playable guide over future feature breadth. EXPLORE behavior requires separately scoped implementation work.

---

## Quest verification

Future verification levels may include:

- SYSTEM
- MODERATED
- TEAM_CONFIRMED
- HONOR

Only objectively verifiable quests should provide significant competitive leaderboard XP.

Do not implement future verification systems unless required by the current task.

---

## Safety

Gameplay must not reward dangerous speed.

Do not design mechanics that encourage:

- unsafe road crossing
- trespassing
- illegal activity
- dangerous interaction with strangers
- unnecessary photographing of strangers

Safety constraints are product requirements, not optional UX recommendations.

---

## Task classification

Use the smallest process appropriate for the task.

### Small task

Examples: localized CSS or copy changes, an obvious bug, a narrow test update or a refactor within one area.

Inspect relevant code, make the change, run focused verification and review the diff. Do not create a plan file.

### Medium task

Examples: behavior spanning several files, an API + UI adjustment, a new business rule or a meaningful state-flow change requiring tests.

After inspection, write a short in-context implementation plan, including affected invariants and likely regressions. A plan file is usually unnecessary. Follow the implementation workflow below.

### Large task

Examples: a feature spanning frontend and backend, schema/migration or authentication/security changes, significant quest lifecycle or architecture changes, or several independent investigation tracks.

Create or update a task plan in `plans/active/`, using `plans/_TEMPLATE.md`. Capture the goal, scope, current behavior, constraints/invariants, implementation areas, acceptance criteria, verification and important decisions.

The plan is living task state, not a chronological log. Keep it concise and current; update Investigation, Decisions and Verification as work progresses. Do not store secrets, local PIDs, temporary paths or screenshot inventories.

After completion, move it to `plans/completed/` only if useful as durable project history.

---

## Lead agent responsibility

The primary agent owns the task from beginning to end.

The lead owns outcome and code understanding, delegation, implementation decisions, invariants, resolving conflicting findings, final diff review, verification and reporting.

Subagents provide evidence and work products; the lead remains responsible for the result.

---

## Subagent policy

Use subagents only when they can perform meaningful independent work.

Good uses include investigating unfamiliar behavior or tests, reviewing implementation/security/concurrency, independently validating frontend behavior or the final diff, and implementing clearly separated areas in isolated worktrees.

Do not create subagents merely to simulate a large team or delegate a small sequential task one agent can solve more efficiently.

Prefer roughly 2–3 useful parallel tracks over many tiny agents.

Give each subagent a narrow objective and expected output: relevant files, behavior, constraints, risks, recommendations and missing test coverage. The lead must independently evaluate recommendations before integrating them.

---

## Parallel implementation

Parallel code editing is appropriate only when changes are genuinely separable.

Prefer separate Git branches/worktrees when multiple agents implement in parallel.

Avoid having multiple agents simultaneously modify the same files.

If several changes touch a shared contract, schema, state model or central component, establish that contract first before parallelizing implementation.

The lead performs final integration and conflict resolution.

---

## Implementation workflow

For non-trivial tasks:

1. Inspect current behavior, relevant code, tests and documentation.
2. Identify affected product, security, database and concurrency invariants; plan according to task size.
3. Implement the smallest complete solution and test changed important behavior.
4. Run relevant checks, review the final diff and fix failures or regressions.
5. Report changes, verification and remaining limitations.

Do not stop after scaffolding when a working end-to-end feature is requested.

---

## Testing expectations

Important business logic requires tests.

Pay particular attention to:

- Telegram authentication
- team creation/join
- team activation
- invite rules
- GPS radius validation
- GPS accuracy validation
- quest availability
- quest completion
- XP idempotency
- concurrent mutation behavior
- leaderboard ordering
- authorization boundaries

Reuse existing test infrastructure.

Do not replace PostgreSQL integration tests with SQLite substitutes.

For UI behavior, test the state that changed rather than merely snapshotting markup.

For user-visible Mini App changes, check relevant mobile widths and applicable loading, empty, unavailable, active, error and completed states.

Use README and Makefile for exact commands; do not duplicate them here.

---

## Definition of done

Implement requested behavior before reporting completion:

- relevant tests pass
- type/lint/build checks relevant to the change pass
- database migrations are valid when applicable
- important failure states were considered
- security and concurrency invariants remain intact
- the final diff contains no unrelated changes
- documentation is updated only when behavior or operating knowledge actually changed

---

## Scope discipline

Prioritize EXPLORE and the journey in Mission. Product direction is documented in `docs/PRODUCT_DIRECTION_V2.md`; the first guide MVP is scoped in `docs/MVP_V02.md`.

Do not start a PLAY expansion, legacy-system removal, Capacitor migration or redesign without an explicit task. Reuse current frontend investment where practical; platform and migration architecture require separate evaluation.

Do not implement unless explicitly requested:

- Secret Sidequests
- AI
- achievements
- badges
- inventory
- shop
- payments
- Telegram Stars
- sponsors
- global league
- city-vs-city
- flash quests
- daily quests
- final raid
- clans
- social feed
- route generator
- AR

Future extensibility must not complicate the current implementation.

Build the smallest solid playable guide that can be tested with real visitors, while preserving current implementation invariants until explicitly migrated.
