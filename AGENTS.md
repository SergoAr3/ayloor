# AYLOOR Project Instructions

## Product

AYLOOR is a multiplayer real-world game.

First launch market:
Yerevan, Armenia.

Public positioning:

AYLOOR
Play the real world.

First season:

AYLOOR YEREVAN — SEASON ZERO
The city is your game.

The core MVP flow is:

Telegram
→ Mini App
→ Create Team
→ Invite Friend
→ Team becomes active
→ Start Quest
→ GPS Check-in
→ Backend verification
→ XP
→ Leaderboard

## Development philosophy

This project is being built by one developer.

Always prefer simple, maintainable solutions.

Do not overengineer.

Do not add infrastructure or abstractions unless they are required by the current task.

Prefer:

- simple code
- explicit code
- typed code
- small modules
- tests for important business logic
- production-reasonable defaults

Avoid premature scalability work.

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

## Do not introduce unless explicitly requested

Do NOT add:

- Redis
- Celery
- Kafka
- Kubernetes
- Terraform
- GraphQL
- microservices
- AI/LLM
- vector databases
- complex event systems

## Architecture

Use a monorepo.

Expected structure:

ayloor/
  backend/
  bot/
  miniapp/
  docker-compose.yml
  .env.example
  README.md
  AGENTS.md

Backend should remain a modular monolith.

Do not create generic repository/service abstractions unless they actually simplify the current code.

## Database

Use:

- PostgreSQL
- UUID internal primary keys
- timezone-aware UTC timestamps
- explicit foreign keys
- useful constraints
- database transactions for atomic business operations

XP must use an append-style ScoreEvent ledger as the source of truth.

Do not rely only on a mutable `team.xp` field.

## Security

Never trust Telegram user IDs supplied directly by the frontend.

Telegram Mini App authentication must validate raw Telegram initData server-side.

Never expose secrets to the frontend.

GPS quest completion must always be validated on the backend.

Never let frontend code decide whether a quest is completed.

XP completion must be idempotent.

A repeated or concurrent check-in must not award XP twice.

## Product rules

A team requires at least 2 members to become active.

MVP team size:
2–5 people.

Location is requested only when the user explicitly performs a check-in.

Do not implement continuous/background location tracking.

## Quest verification

Future quest verification levels:

- SYSTEM
- MODERATED
- TEAM_CONFIRMED
- HONOR

Only objectively verifiable quests should provide significant competitive leaderboard XP.

## Safety

Do not design gameplay that rewards dangerous speed.

Do not encourage:

- unsafe road crossing
- trespassing
- illegal activity
- dangerous interaction with strangers
- unnecessary photographing of strangers

## Testing

Important business logic should have tests.

Especially test:

- Telegram authentication
- team creation/join
- team activation
- invite rules
- GPS radius validation
- GPS accuracy validation
- quest completion
- XP idempotency
- leaderboard ordering

## Workflow

Before large changes:

1. inspect existing code
2. summarize implementation approach briefly
3. make the changes
4. run relevant tests
5. fix failures
6. summarize what changed

Do not stop after generating a skeleton if the task asks for an end-to-end feature.

## Current scope

The current goal is only the first vertical slice:

Telegram
→ Mini App
→ Team
→ Invite
→ Quest
→ GPS Check-in
→ XP
→ Leaderboard

Do not implement yet:

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