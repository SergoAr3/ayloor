.DEFAULT_GOAL := help

.PHONY: help check-env dev db migrate seed backend bot miniapp tunnel stop test lint

help:
	@printf '%s\n' \
	  'make dev      PostgreSQL, migrations, seed, then backend + bot + Mini App' \
	  'make db       Start PostgreSQL' \
	  'make migrate  Apply Alembic migrations' \
	  'make seed     Run the idempotent seed' \
	  'make backend  Run FastAPI with reload' \
	  'make bot      Run the Telegram bot' \
	  'make miniapp  Run Vite on port 5173' \
	  'make tunnel   Run a temporary Cloudflare Quick Tunnel' \
	  'make stop     Stop Docker Compose (PostgreSQL)' \
	  'make test     Prepare test DB; run backend, bot and frontend tests' \
	  'make lint     Check Ruff formatting/lint and TypeScript' \
	  'make help     Show this list'

check-env:
	@test -f .env || { printf '%s\n' 'Missing .env: copy .env.example to .env and fill in your local settings.' >&2; exit 1; }

dev: check-env
	$(MAKE) db
	$(MAKE) migrate
	$(MAKE) seed
	.venv/bin/python scripts/dev.py

db:
	docker compose up -d --wait

migrate:
	.venv/bin/alembic -c backend/alembic.ini upgrade head

seed:
	.venv/bin/python -m app.seed

backend:
	.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

bot:
	.venv/bin/python -m ayloor_bot

miniapp:
	npm --prefix miniapp run dev -- --port 5173 --strictPort

tunnel:
	@command -v cloudflared >/dev/null 2>&1 || { printf '%s\n' 'cloudflared is not installed. Install it with: brew install cloudflared' >&2; exit 1; }
	cloudflared tunnel --url http://localhost:5173

stop:
	docker compose down

test:
	.venv/bin/python scripts/prepare_test_db.py
	.venv/bin/pytest -c backend/pyproject.toml backend/tests -q
	.venv/bin/pytest -c bot/pyproject.toml bot/tests -q
	npm --prefix miniapp test

lint:
	.venv/bin/ruff check backend bot scripts
	.venv/bin/ruff format --check backend bot scripts
	node miniapp/node_modules/typescript/bin/tsc --project miniapp/tsconfig.json --noEmit
