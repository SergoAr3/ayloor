# Season Zero: Railway deployment и операции

Один production environment, один оператор, небольшой supervised cohort. Этот runbook
готовит deployment; Railway resources, backup/restore и native/restart/outage smoke
нужно подтвердить отдельно. Beta gates: [completed audit](../plans/completed/season-zero-beta-readiness.md).

## Topology и service settings

Создать `Postgres`, `backend`, `bot`, `miniapp` в одном Railway project/environment и
регионе. PostgreSQL — отдельный service с persistent volume; app services без volumes.
Production DB не используется локальными tests. Ниже Root Directory относительно repo.

| Настройка | backend | bot | miniapp |
| --- | --- | --- | --- |
| Source / Root Directory | этот repo, `/backend` | этот repo, `/bot` | этот repo, `/miniapp` |
| Builder | Railpack, `backend/railpack.json` | Railpack, `bot/railpack.json` | Railpack, `miniapp/railpack.json` |
| Build | recipe: Python 3.12, venv, `pip install .` | recipe: Python 3.12, venv, `pip install .` | Node 22, recipe `npm ci --include=dev`, auto `npm run build` |
| Dashboard Start override | пусто: команда из recipe | пусто: команда из recipe | **пусто**, auto static `dist` через Caddy |
| Pre-deploy | `python -m alembic -c alembic.ini upgrade head` | нет | нет |
| Pre-deploy timeout | 300 секунд | — | — |
| Healthcheck | `/health`, timeout 120 секунд | нет: worker | `/`, timeout 120 секунд |
| Replicas / Regions | 1 / один регион | **1 / один регион** | 1 / один регион |
| Restart policy | Always | Always | Always |
| Serverless / autoscaling | выключены | **выключены** | выключены |
| Public networking | HTTPS domain, target provider `PORT` | **нет domain / TCP proxy** | HTTPS domain, target provider `PORT` |
| GitHub autodeploy | выключить: ручной beta release | **выключить** | выключить: ручной beta release |

Backend recipe: `exec python -m uvicorn app.main:app --host 0.0.0.0 --port "$PORT"`, без
reload; `PORT` предоставляет Railway. Bot: `exec python -m ayloor_bot` (polling).
Python recipe явно устанавливает пакет и переносит venv в runtime: bare pyproject
сам по себе недостаточен для установки Railpack. Каждый build получает свой service
root. Dependencies берутся из существующих pyproject ranges: записывать release commit
и успешный deployment image для rollback, не обещать побитово идентичный rebuild.

Railpack распознаёт Vite, обслуживает assets и SPA fallback; AYLOOR сейчас использует
state-based screens, `?invite=...` возвращает тот же index. Не запускать Vite dev/preview
в production; custom frontend start отключает auto SPA mode. Dockerfile, отдельный
reverse proxy и второй hosting provider не нужны.
Не задавать `NPM_CONFIG_PRODUCTION=true`/`NPM_CONFIG_OMIT=dev`: TypeScript/Vite нужны
во время build; recipe явно включает dev dependencies для установки.

На 2026-10-25 Railway не разрешает новым services opt-in в legacy `railway.json/toml`.
Service settings задаются в Dashboard по таблице, build/start recipes — в `railpack.json`.
SDK/IaC platform здесь не добавляется. Источники: [Railpack recipes](https://railpack.com/config/file/),
[Python](https://railpack.com/languages/python/), [static sites](https://railpack.com/languages/node/),
[monorepo](https://docs.railway.com/deployments/monorepo),
[legacy config status](https://docs.railway.com/config-as-code).

## Variables: service environment, без production `.env`

Settings → Networking → Generate Domain для `backend` и `miniapp`: зарезервировать
HTTPS domains до app release. Далее `API_ORIGIN` и `MINIAPP_ORIGIN` — обозначения этих
фактических URLs в документе, не новые app variables. Custom domain не нужен.
Не создавать циклические Railway references frontend↔backend.

| Service | Variable | Значение / назначение |
| --- | --- | --- |
| backend | `ENVIRONMENT` | `production` |
| backend | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}`, **private** endpoint; `postgresql://`/`postgres://` нормализуются в asyncpg |
| backend | `TELEGRAM_BOT_TOKEN` | dedicated production bot secret, тот же token у bot |
| backend | `TELEGRAM_BOT_USERNAME` | username без `@`, нужен invite links |
| backend | `APP_SECRET_KEY` | случайный стабильный secret ≥32 символов из password manager |
| backend | `TELEGRAM_WEBAPP_URL` | `MINIAPP_ORIGIN`, HTTPS root без fragment/credentials |
| backend | `CORS_ORIGINS` | **ровно** `MINIAPP_ORIGIN`, без wildcard/path/trailing slash |
| backend | `ADMIN_TELEGRAM_IDS` | IDs оператора через запятую; пусто означает admin denied |
| backend | `JWT_EXPIRATION_MINUTES` | 60 по умолчанию; после expiry reopen из bot |
| backend | `TELEGRAM_INIT_DATA_MAX_AGE_SECONDS` | 3600 по умолчанию |
| backend | `MAX_ACCEPTABLE_GPS_ACCURACY_M` | 150 по умолчанию; проверить на реальных точках |
| bot | `ENVIRONMENT` | `production` |
| bot | `TELEGRAM_BOT_TOKEN` | reference `${{backend.TELEGRAM_BOT_TOKEN}}` |
| bot | `TELEGRAM_WEBAPP_URL` | тот же `MINIAPP_ORIGIN` |
| miniapp | `VITE_API_BASE_URL` | `API_ORIGIN`, публичный HTTPS **origin**, без `/api/v1`, query/credentials; build-time |

DB/token/JWT secrets не задавать miniapp, `VITE_*` или project-wide shared variables.
`TEST_DATABASE_URL` и webhook secret production не нужны. Bot не вызывает backend:
он выдаёт WebApp URL, frontend обращается к одному `VITE_API_BASE_URL`. Искусственный
backend URL/env для bot не нужен. DB credentials — только backend и сама БД; public
Postgres TCP proxy для app connections не нужен.

Production Settings игнорирует dotenv secrets; local development читает `.env`.
Backend проверяет public Mini App URL, username и exact CORS origin. Frontend build
отклоняет пустой/HTTP/local/private-Railway API origin и ошибочный path. Изменение
`VITE_API_BASE_URL` требует **rebuild**, restart static runtime недостаточен.
Источники: [Vite env](https://vite.dev/guide/env-and-mode),
[public networking](https://docs.railway.com/networking/public-networking),
[PostgreSQL](https://docs.railway.com/databases/postgresql).

## Первый release

1. До подключения production token остановить любой локальный poller с ним. Лучше
   отдельный production bot; не запускать `make dev` с его token.
2. Создать services/settings/domains/variables выше; отменить initial builds до готовности
   конфигурации. После подключения source явно проверить autodeploy off. Repo сам не
   создаёт Railway resources и не задаёт Dashboard replicas/restart/health settings.
3. Дождаться healthy Postgres с attached volume. Только backend pre-deploy выполняет
   `upgrade head`, current head **0002**. Failure/timeout останавливает новую версию,
   старое приложение может продолжать работать. Проверить logs, исправить причину и
   повторить release. Не запускать параллельные releases или отдельную migration во
   время pre-deploy. Bot и app startup не мигрируют БД.
4. HTTPS backend `/health` → `{"status":"ok"}`. Он проверяет DB connection, не schema,
   season/bot и не заменяет ongoing monitoring. В Railway SSH/terminal **backend
   container** выполнить `python -m alembic -c alembic.ini current`: ожидать `0002 (head)`.
   Не использовать локальный `railway run` с private DB hostname.
5. Только на fresh production DB после migration в backend terminal один раз выполнить
   `python -m app.seed`. Не добавлять seed в каждый release. Он создаёт Yerevan, active
   Season Zero на 14 дней и **inactive `(0,0)` placeholder**. Повторный seed сохраняет
   edits/dates и не продлевает season. Production скрывает marked placeholder и
   запрещает start/activation до фактической замены GPS.
6. Deploy miniapp с реальным API origin. Проверить `/`, `?invite=...`, fonts/assets и
   отсутствие mixed content. Network calls идут на `API_ORIGIN`, не localhost/frontend
   `/api`. Backend preflight разрешает exact frontend origin; CORS не заменяет JWT.
7. BotFather Mini App/menu URL = `MINIAPP_ORIGIN`. Если был webhook, осознанно удалить
   через Telegram Bot API `deleteWebhook`, без `drop_pending_updates` без причины;
   не вставлять token в logs/screenshots/history. Запустить **один** bot deployment по
   procedure ниже. `/start` и invite открывают тот же frontend.
8. Оператор входит через Telegram, использует свой обычный JWT в HTTPS backend `/docs`
   → Authorize. Нет отдельного admin token/UI. Проверить current season UUID/dates,
   создать inactive quests через `/api/v1/admin/quests`: title/briefing/place/hint/HTTPS
   photo/GPS/radius/XP поддерживаются. PUT заменяет поля — сохранять полный payload;
   для activation/off использовать PATCH `/active`. Активировать после личного field
   approval; реальные точки и контент не входят в этот deployment change.

Источник: [pre-deploy semantics](https://docs.railway.com/deployments/pre-deploy-command).

## Singleton bot, restart и redeploy

**Одна replica не является межпроцессным lock.** Обычный Railway redeploy запускает
новый container до остановки старого. Выключить bot autodeploy, autoscaling, дополнительные
regions и preview environments с production secrets. В Deploy settings bot выставить
overlap 0 секунд и draining 10 секунд. Это ограничивает overlap, но не обещает его
полного отсутствия при provider-initiated replacement.

Плановый bot release/variable change/rollback: deployment action **Remove** текущего
deployment (не Delete service) → дождаться Removed и отсутствия running старых
deployments во всех environments/локально → Deploy выбранный commit или Redeploy
historical deployment. Проверить одну active replica, один polling startup в logs,
отсутствие TelegramConflictError. Не выполнять параллельные release actions. Устойчивый
conflict → остановить bot acquisition, найти второй poller, возобновить один. Код не
добавляет distributed lock и DB access для bot.

Restart текущего deployment перезапускает process без rebuild; если bot UI делает
replacement, использовать stop-first. Backend можно Restart отдельно без сброса БД.
Перед redeploy записать commit, revision и backup timestamp; backend pre-deploy
повторяется, healthcheck держит новую версию вне traffic до успеха. Frontend config
change требует rebuild. Источники: [actions](https://docs.railway.com/deployments/deployment-actions),
[teardown](https://docs.railway.com/deployments/deployment-teardown),
[healthchecks](https://docs.railway.com/deployments/healthchecks).

## Logs и incident control

Оператору нужны Railway backend/bot/Postgres logs: startup/pre-deploy errors, DB
failures, polling conflicts. Access status + сообщение игрока достаточно для первых
команд; для check-in жалобы нужны время, team/quest/run и точная ошибка. Rejected GPS
не сохраняется: отсутствие Submission не означает отсутствие попытки.

Не включать body/Authorization/initData/GPS logging, SQL echo или instrumentation с
таким capture. Runtime/migration SQLAlchemy скрывает bound parameters; это **не**
редактор всех driver/server messages. Ограничить доступ/retention logs, не публиковать
raw traces. Дополнительная observability platform не нужна.

Acquisition pause: Remove bot; старые WebApp-кнопки всё ещё работают. Опасный quest
немедленно выключить PATCH active=false — started runs тоже перестанут приниматься.
Полная gameplay pause: Remove backend deployment, **сохранив Postgres/volume/backups**;
API недоступен, UI предлагает retry. Не удалять БД и не менять ledger ради completion.
Связаться с cohort вручную. После recovery читать server state до повторов: check-in
idempotent, admin XP POST — нет.

## Backups и отдельный restore rehearsal

До игроков Postgres → Backups: native daily schedule, для длительного cohort также
weekly. Проверить завершённый backup и реальные retention/limits своего плана;
manual backup перед migrations. Volume persistence не заменяет backup.

**Не нажимать обычный volume Restore на production для rehearsal:** он меняет volume
исходного service и redeploys его. Безопасный native путь — PITR, если доступен:

1. До live session Backups → Enable PITR (может redeploy DB); дождаться healthy archive,
   первого base backup и доступного restore range.
2. Выбрать покрытый UTC timestamp после тестового completion → Restore to this moment.
   Проверить staged changes: **новый sibling PostgreSQL service и новый volume**, source
   не меняется. Не применять действие, меняющее production DB target.
3. В terminal restored DB проверить `SELECT version_num FROM alembic_version;`,
   team/membership/run IDs, completion/submission и ledger `SUM(amount)` на выбранный
   момент. Не менять backend URL, не запускать seed/bot на copy. Записать duration,
   archive lag/data-loss window и результат; удалить только rehearsal service/volume.

Если PITR недоступен, gate остаётся открытым до logical dump/restore. В приватном
операторском окружении с PostgreSQL client той же major версии: `pg_dump -Fc` source,
затем `pg_restore --no-owner --no-acl --exit-on-error` **в отдельную заранее созданную
пустую DB/service**. Использовать libpq env/password file без credentials в command
line. Перед restore проверить разные host/DB IDs и отсутствие backend references на
target; не применять `--clean` или restore поверх production. Dump содержит персональные
данные, не хранить в repo. Volume Restore не считается проверкой отдельного restore.
Источники: [backups](https://docs.railway.com/volumes/backups),
[PITR separate-service restore](https://docs.railway.com/volumes/point-in-time-recovery).

## Rollback и release acceptance

App rollback — предыдущий deployment/image и совместимые variables; bot stop-first.
Это **не DB rollback**. Не делать автоматический downgrade/production restore. При
несовместимой schema остановить gameplay, выбрать forward fix или отдельно спланированный
DB recovery. В этой ветке schema не меняется, required head остаётся `0002`.

- [ ] Реальный Telegram create→invite→join→active→start→GPS→completion→XP→leaderboard;
  native allow/deny/settings, safe areas, плохая сеть и background/foreground.
- [ ] Complete один quest, оставить другой started; записать IDs/XP/rank; Restart
  backend, отдельно bot, reopen: team/runs/completion/XP/ranking сохранены, дубля XP нет.
- [ ] Temporary backend outage/потерянный post-commit response: retry/reopen возвращает
  server state без второго XP; DB storage сохраняется после restart.
- [ ] Отдельный restore rehearsal выполнен; оператор видит logs и умеет остановить
  acquisition/gameplay; season dates покрывают cohort, реальные точки одобрены.

Repo checks не означают, что operator gates пройдены. Rollout: operator/test accounts →
одна trusted team + вторая сессия → 2–3 simultaneous teams → 5+ после доказанной
сохранности данных и приемлемой нагрузки поддержки.
