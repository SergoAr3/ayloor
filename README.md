# AYLOOR v0.1

**Play the real world.**

Multiplayer real-world game. Первый город — Ереван, Армения (`Asia/Yerevan`).
Первый сезон — **AYLOOR YEREVAN — SEASON ZERO / The city is your game.**

v0.1 реализует один vertical slice:

Telegram → Mini App → Telegram auth → Create Team → Invite → Join → Team Active
→ First Checkpoint → Start Quest → GPS Check-in → Backend Verification → +100 XP → Leaderboard.

Цель — проверить реальную командную игру и возвращение команды на вторую IRL-сессию,
а не строить глобальную платформу. Участие бесплатное, команды 2–5 человек.

## Стек и структура

Python 3.12+, FastAPI, PostgreSQL 16, SQLAlchemy 2.x async, asyncpg, Alembic,
Pydantic v2, PyJWT, pytest; aiogram 3.x; React, TypeScript, Vite; Docker Compose.

```text
backend/
  app/
    api/            REST /api/v1, зависимости auth/admin
    core/           настройки, Telegram HMAC, JWT
    db/             async sessions и транзакции
    models/         ORM и ограничения данных
    schemas/        Pydantic input/output
    services/       команды, invites, quests, GPS, leaderboard
    main.py         FastAPI
    seed.py         idempotent seed CLI
  migrations/       Alembic revision 0001
  tests/            PostgreSQL integration и business tests
bot/app/            пакет ayloor_bot: /start + WebApp-кнопка, без FSM
bot/tests/          stateless URL handoff и handlers без запросов Telegram
miniapp/src/        mobile-first Telegram Mini App
miniapp/e2e/        локальный браузерный smoke с синтетическими игроками
scripts/            test DB, dev initData, локальный browser harness
docs/               MVP и зафиксированные решения v0.1
docker-compose.yml  только PostgreSQL
.env.example        шаблон конфигурации без реальных секретов
```

Backend — модульный монолит. Bot отвечает за вход, Mini App — за gameplay.
Решения, уточняющие исходное ТЗ: [docs/DECISIONS_V01.md](docs/DECISIONS_V01.md).

## Установка

Нужны Python 3.12+, Node.js 22.12+ (или 24 LTS), npm, Docker с Compose.
Все команды ниже выполняются из корня репозитория, если явно не указан `cd`.

```bash
git clone <YOUR_REPOSITORY_URL> ayloor
cd ayloor
cp .env.example .env
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements-dev.lock -e './backend[dev]' -e './bot[dev]'
cd miniapp
npm ci
cd ..
```

Заполните `.env` по таблице ниже. Backend и bot читают корневой `.env` независимо
от рабочей директории. Vite читает из него только публичные `VITE_*` значения;
server-side config использует URL Mini App для точечного allowlist tunnel hostname.
Изменение `.env` требует перезапуска соответствующего процесса.

`requirements-dev.lock` фиксирует проверенные Python dependencies (backend, bot,
tests) для локального окружения; `miniapp/package-lock.json` — frontend dependencies.
Диапазоны допустимых версий описаны отдельно в pyproject.toml и package.json.

## Переменные окружения

| Переменная | Что указать |
| --- | --- |
| `ENVIRONMENT` | `development` локально; `production` при публичном запуске. По умолчанию production. |
| `POSTGRES_USER` | Локальный пользователь БД, например `ayloor`. |
| `POSTGRES_PASSWORD` | Собственный пароль; `ayloor-local-only` из примера допустим только локально. |
| `POSTGRES_DB` | Имя приложения, например `ayloor`. |
| `POSTGRES_PORT` | Свободный локальный порт, по умолчанию `5432`. |
| `DATABASE_URL` | `postgresql+asyncpg://USER:PASSWORD@localhost:PORT/DB`; согласовать с PostgreSQL. Спецсимволы в пароле URL-encode. |
| `TEST_DATABASE_URL` | Отдельная одноразовая БД с суффиксом `_test`, например `ayloor_test`; никогда не БД приложения. |
| `TELEGRAM_BOT_TOKEN` | Реальный token от @BotFather, только backend/bot. |
| `TELEGRAM_BOT_USERNAME` | Username бота без `@`, нужен для invite links. |
| `TELEGRAM_WEBAPP_URL` | Публичный HTTPS URL Mini App или вашего локального HTTPS tunnel. Без `#fragment`. |
| `TELEGRAM_WEBHOOK_SECRET` | В v0.1 оставить пустым: bot использует polling, webhook endpoint не реализован. |
| `APP_SECRET_KEY` | Собственный случайный секрет минимум 32 символа; например `python -c 'import secrets; print(secrets.token_urlsafe(48))'`. |
| `JWT_EXPIRATION_MINUTES` | Срок JWT, по умолчанию `60`. |
| `TELEGRAM_INIT_DATA_MAX_AGE_SECONDS` | Допустимый возраст initData, по умолчанию `3600`; будущие timestamp ограничены 30 секундами. |
| `MAX_ACCEPTABLE_GPS_ACCURACY_M` | Максимальная погрешность GPS, development default `150` метров. |
| `ADMIN_TELEGRAM_IDS` | Ваши положительные Telegram user IDs через запятую, например `123456789,987654321`. Пустое значение запрещает весь admin-доступ. |
| `CORS_ORIGINS` | Разрешённые frontend origins через запятую. Локально `http://localhost:5173`; при отдельном публичном frontend добавьте его HTTPS origin. |
| `VITE_API_BASE_URL` | Локально оставить пустым: `/api` идёт через Vite proxy на `127.0.0.1:8000`. При раздельном production hosting — публичный HTTPS origin backend без `/api/v1`. |

Не помещайте token, JWT secret или DB URL в `VITE_*`. `.env` игнорируется Git.
`CORS_ORIGINS` не является авторизацией: каждый игровой endpoint проверяет JWT.
Compose публикует PostgreSQL только на loopback. Уже созданный volume сохраняет
первоначальные учётные данные: изменение пароля в `.env` само по себе не меняет пароль в БД.

## PostgreSQL, migrations и seed

```bash
docker compose up -d --wait
.venv/bin/alembic -c backend/alembic.ini upgrade head
.venv/bin/python -m app.seed
```

Миграция `0001_initial_vertical_slice.py` создаёт 10 таблиц: User, City, Team,
TeamMember, Season, Quest, QuestRun, Submission, ScoreEvent, Invite; enums, FK,
индексы, check constraints и append-only trigger ledger.

Seed создаёт Yerevan, активный Season Zero на 14 дней относительно первого запуска
и **First Checkpoint / location / system / 100 XP**. Повторный seed не дублирует
и не перезаписывает существующие записи, включая ручные изменения. Конкурентные
seed сериализуются PostgreSQL advisory transaction lock.

**Координаты `(0, 0)` — development placeholder, не реальный checkpoint Еревана.**
В коде есть `TODO: replace with verified Yerevan Season Zero checkpoint`.
В production seed создаёт quest выключенным; backend также запрещает запуск
placeholder, оставшегося после development. Перед beta замените координаты через
admin PUT, задав проверенную безопасную точку, затем активируйте quest. Marker
снимается только при фактической смене координат с точностью хранения БД (7 знаков).
Изменение title/description/XP/radius сохраняет marker и остальные rules; production
activation по PUT или PATCH при оставшемся marker запрещена. Повторный seed не продлевает
сезон; даты сезона после его окончания оператор меняет через БД до следующего этапа продукта.

## Локальный запуск

После установки зависимостей и заполнения корневого `.env` рекомендуемый запуск:

```bash
make dev
```

Команда проверяет `.env`, поднимает PostgreSQL, применяет migrations, выполняет
idempotent seed и запускает backend, bot и Mini App параллельно в foreground.
`Ctrl+C` завершает процессы этого запуска вместе с reload/npm workers; если один
сервис завершился, остальные также останавливаются. PostgreSQL остаётся работать.
Перед запуском остановите отдельные экземпляры этих сервисов на портах 8000/5173
и другой polling-процесс того же бота. Переустановка зависимостей не выполняется.

```bash
make help     # Все доступные команды
make tunnel   # Отдельный временный Cloudflare Quick Tunnel к localhost:5173
make stop     # Остановить PostgreSQL через docker compose down
```

`make tunnel` требует установленный `cloudflared` (`brew install cloudflared`).
Tunnel не запускается внутри `make dev`. Его HTTPS URL нужно самостоятельно
записать в `TELEGRAM_WEBAPP_URL`, затем перезапустить `make dev`, сохранив tunnel
работающим. `VITE_API_BASE_URL` оставьте пустым для Vite `/api` proxy.
`make test` подготавливает отдельную test DB через общий guard и запускает backend,
bot и frontend suites; PostgreSQL должен быть запущен (`make db`). Browser smoke
запускается отдельно, как описано ниже. `make lint` проверяет Ruff и TypeScript.

### Ручные команды для troubleshooting/reference

Backend, первый терминал:

```bash
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Bot, второй терминал:

```bash
.venv/bin/python -m ayloor_bot
```

Mini App, третий терминал:

```bash
cd miniapp
npm run dev
```

Открыть локально: `http://localhost:5173`. OpenAPI: `http://127.0.0.1:8000/docs`.
Readiness: `GET http://127.0.0.1:8000/health` проверяет соединение с БД.

Для production-сборки:

```bash
cd miniapp
npm run build
```

Публикуйте `miniapp/dist` через HTTPS static hosting. При пустом `VITE_API_BASE_URL`
ваш reverse proxy должен направлять `/api` на FastAPI; dev proxy в build не входит.
Это задача локального MVP, автоматического deployment нет. Не публикуйте Vite dev
server как production. В production установите `ENVIRONMENT=production`, реальный
JWT secret, token и HTTPS URLs, исключите dev harness и ограничьте доступ к БД.

## Создание Telegram bot и HTTPS Mini App URL

1. В официальном `@BotFather` выполните `/newbot`, получите token и username.
2. Запишите их в `.env`. Token не нужен frontend.
3. Для локального smoke направьте ваш HTTPS tunnel на `http://localhost:5173`.
   Tunnel не добавляется в инфраструктуру проекта: используйте привычный локальный инструмент.
4. Запишите полученный HTTPS URL в `TELEGRAM_WEBAPP_URL`, перезапустите Vite и bot.
   Vite разрешает hostname именно этого URL. `/api` проксируется на локальный backend,
   поэтому отдельный tunnel для API и дополнительные CORS origins не нужны.
5. В настройках bot у @BotFather задайте Mini App/menu URL тем же HTTPS URL
   (Main Mini App удобен, но кнопка `/start` работает самостоятельно).
6. Откройте приватный чат с ботом, выполните `/start`, нажмите **OPEN AYLOOR**.
7. Если у bot раньше был webhook, удалите его через Telegram Bot API `deleteWebhook`
   перед polling. Приложение не удаляет внешнюю конфигурацию бота автоматически.

## Telegram auth и JWT

Mini App отправляет **raw** `Telegram.WebApp.initData` в
`POST /api/v1/auth/telegram`. Backend проверяет HMAC-SHA-256 с bot token по
[официальному алгоритму Telegram](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app),
сравнивает подпись constant-time, отклоняет дубли query-полей и устаревший/будущий
`auth_date`, затем извлекает подписанного user. Переданный напрямую `telegram_id`
не авторизует пользователя. Concurrent upsert гарантирует единственную запись User.

В ответ выдаётся HS256 JWT: `sub` = внутренний UUID, `exp`, `iat`, фиксированные
`iss`/`aud`. Mini App хранит JWT в `sessionStorage` своей вкладки, при новом открытии
Telegram повторно авторизуется. При expiry UI предлагает переоткрыть bot/Mini App.
Logout/refresh tokens в v0.1 отсутствуют. При закрытии вкладки session исчезает.

## Команды и invites

Создание Team и captain membership — одна транзакция. Начальный статус `pending`.
Участник может находиться максимум в одной **pending или active** команде города,
что защищено частичным уникальным индексом текущего membership `(user_id, city_id)`.
Составной FK не позволяет подменить город membership.

Invite имеет случайный code, срок (default 7 дней) и max_uses (default 4).
Ссылка: `https://t.me/<bot_username>?start=join_<code>`.
Stateless bot строит WebApp-кнопку с `?invite=<code>`; Mini App также понимает
`start_param=join_<code>`. Bot не хранит code на сервере между запросами.
Join требует обычный JWT и явное нажатие JOIN TEAM; одна ссылка не авторизует user.

Join проверяет expiry, uses, blocked/full team и текущее членство. Блокировки User,
Team и Invite защищают от concurrent joins, переполнения и превышения uses.
Второй участник активирует команду. Pending screen обновляется раз в 5 секунд;
есть ручной REFRESH TEAM. При block membership освобождается, история сохраняется.

Если ответ create/join потерялся после commit, Mini App запрашивает `/me` и
переходит на Team screen после подтверждения membership. При повторном запросе
membership-related 409 также вызывает reconciliation; для join проверяется
совпадение команды с приглашением. Остальные HTTP validation errors отображаются
пользователю. Мутация автоматически не повторяется, duplicate join по-прежнему запрещён.

## Quests, GPS и privacy

Start разрешён только текущему участнику active team, для доступного location/system
quest нужного города и активного по датам сезона. Уникальная пара
`(team_id, quest_id)` запрещает повторный запуск, в том числе после completion.
Существующий started run можно продолжить с другого устройства/участника через quest detail.

Location запрашивается **только по CHECK IN** через Telegram `LocationManager`
(Telegram API 8.0+). Отказ, недоступный GPS, отсутствующая точность и timeout
отображаются как ошибки с возможностью повторить. Нет background tracking,
route recording или постоянного опроса GPS.

Backend проверяет членство, активность команды/quest, сезон и временное окно,
валидность/конечность координат, `horizontal_accuracy <= MAX_ACCEPTABLE_GPS_ACCURACY_M`,
затем Haversine distance `<= radius_m`. Отсутствующая/отрицательная точность
не принимается. Нет `skip_verification` или аналога; лишние input-поля запрещены.
Отклонённые координаты не сохраняются. Успешный Submission хранит только координаты,
точность, user, run и время, необходимые для проверки; admin видит их через защищённый API.

GPS клиента нельзя считать доказательством отсутствия spoofing. Сложный anti-spoofing
не входит в v0.1. Production получает те же серверные проверки независимо от клиента.
Gameplay не награждает за опасную скорость и не требует незаконных действий.

## Development GPS и вход в обычном браузере

Только при **Vite dev build + backend `ENVIRONMENT=development`** показываются
Development sign in и Development coordinates. В production build блоки выключены,
production backend возвращает `development_gps_enabled=false` и запрещает placeholder.
Настроек из body/query для включения dev mode нет. Debug coordinates проходят
обычную backend validation, включая radius и accuracy; подмены серверного результата нет.

Для входа без Telegram используйте synthetic user ID, не ID реального пользователя:

```bash
.venv/bin/python scripts/dev_init_data.py 700001
```

Вставьте выведенный signed initData в Development sign in на `http://localhost:5173`.
CLI использует локальный bot token, требует `ENVIRONMENT=development`, не выводит
token и не обходит Telegram signature validation. Payload истекает через configured
max age. Второго synthetic user откройте в другом browser profile/incognito с ID `700002`.
Для dev-среды предпочтителен отдельный bot token, не production bot.

В started quest раскройте Development coordinates: `(0, 0, accuracy=25)` проходит
seed checkpoint; `(1, 0, accuracy=25)` отклоняется. Обычный CHECK IN в dev browser
может использовать `navigator.geolocation`, только после явного нажатия; production
ожидает Telegram LocationManager. UI не делает автоматического check-in.

## Atomic completion и XP ledger

Успешный check-in выполняет в одной PostgreSQL transaction:

1. Блокирует Team, Quest, QuestRun и проверяет актуальные правила.
2. Создаёт accepted Submission.
3. Меняет QuestRun на completed, выставляет UTC completed_at.
4. Вставляет `ScoreEvent(reason=quest_completion, amount=100)`.
5. Commit; при любой ошибке все изменения откатываются.

Частичный unique index на completion `quest_run_id` запрещает двойной XP независимо
от Python-проверки. Accepted Submission также уникален на run. Повторный/concurrent
check-in возвращает завершённый run, `already_completed=true`, `awarded_xp=0`.
Весь response отправляется после успешного commit request transaction.

XP = `SUM(ScoreEvent.amount)` текущего сезона, поля `team.xp` и cache нет.
PostgreSQL trigger запрещает UPDATE/DELETE ScoreEvent. Admin корректирует баланс
новой положительной/отрицательной записью `admin_adjustment` с обязательным note
и UUID автора. Старые события не редактируются.

Leaderboard показывает active teams города, включая 0 XP; исключает pending/blocked.
Порядок: XP DESC, Team.created_at ASC, Team.id ASC. Возвращает свой rank/XP и
`xp_to_next_rank`: разность + 1 XP для гарантированного обгона предыдущей команды.
При равном XP значение 1; у лидера/без команды — null.

## Минимальный admin API

Отдельных ролей, паролей, admin token и CMS нет. Нужен обычный Telegram → JWT user,
чей **Telegram ID из БД** входит в `ADMIN_TELEGRAM_IDS`. Whitelist проверяется
на каждом запросе; ID из request/header не даёт дополнительных прав.
Администратор может пользоваться `/docs` с кнопкой Authorize и своим Bearer JWT.

| Метод и `/api/v1` endpoint | Назначение |
| --- | --- |
| `GET /admin/users` | Users, с `offset` и `limit <= 200`. |
| `GET /admin/teams` | Teams. |
| `POST /admin/teams/{id}/block` | Заблокировать команду и освободить memberships атомарно. |
| `GET /admin/quests` | Все quests, включая inactive. |
| `POST /admin/quests` | Создать system/location quest текущего города; по умолчанию inactive. |
| `PUT /admin/quests/{id}` | Заменить поля quest; development marker снимается только при фактической смене координат. |
| `PATCH /admin/quests/{id}/active` | `{"is_active": true/false}`. |
| `GET /admin/submissions` | Submissions; только admin имеет доступ к этим GPS-данным. |
| `POST /admin/score-events` | `{"team_id":"UUID","season_id":"UUID","amount":100,"note":"Reason"}`. |

POST/PUT quest требует `season_id`, `slug`, `title`, `description`, `latitude`,
`longitude`; принимает `base_xp`, `radius_m`, timezone-aware `starts_at`/`expires_at`,
`is_active`, `city_slug`. Полная схема есть в OpenAPI. Перенос существующего quest
между сезонами/городами не поддерживается. Получить season UUID можно через
`GET /api/v1/seasons/current?city=yerevan`.

Контент места задаётся теми же POST/PUT: nullable `look_for_hint` (до 1000 символов),
`place_label` (до 255) и `hero_image_url` (HTTPS URL до 2048 символов, без credentials).
Эти поля возвращаются admin API и публичными quest list/detail. PUT заменяет поля:
передавайте существующий контент, чтобы сохранить его, либо `null` для очистки.
Изображение должно быть доступно клиенту по URL; загрузки файлов и Maps SDK нет.
Seed оставляет контент пустым до авторского заполнения: Mini App показывает явное
отсутствие фото/подсказки, без автоматического Cascade или другого prototype content.
Перед запуском обновлённого backend примените `make migrate`.

## Автоматические проверки

Backend-тесты используют **настоящий PostgreSQL**, не SQLite. Нужна отдельная
БД с суффиксом `_test`; тесты очищают её таблицы, но не БД приложения. Не запускайте
backend tests одновременно с browser smoke на одной test DB. Реальная Telegram
сеть, bot token и два настоящих аккаунта для автотестов не нужны.

Общий guard находится в `backend/app/core/test_database.py`. Его используют pytest
conftest, `prepare_test_db.py` и `local_smoke_server.py` до engine/connect/SQL,
Alembic subprocess, seed и запуска browser backend. До подмены test environment
читается effective application `DATABASE_URL` с тем же приоритетом, что у приложения:
process environment выше `.env`. Скрипты сохраняют прежний fallback `.env.example`.
Fixture повторно проверяет target перед созданием engine. Совпадающие имена
application/test DB запрещены даже при разных hosts/ports/credentials; суффикс
`_test` остаётся обязательным дополнительным требованием. Query selectors `database`,
`dbname`, `dsn` запрещены в обоих URL, включая пустые, encoded и повторные параметры.
Заданный application URL без имени БД отклоняется. Lowercase environment aliases
не могут переопределить проверенный target при запуске Alembic/backend. При unsafe
конфигурации guard останавливает запуск без побочных эффектов; секреты не выводятся.

```bash
docker compose up -d --wait
.venv/bin/python scripts/prepare_test_db.py
.venv/bin/pytest -c backend/pyproject.toml backend/tests/test_db_safety.py -q
.venv/bin/pytest -c backend/pyproject.toml backend/tests -q
.venv/bin/pytest -c bot/pyproject.toml bot/tests -q
.venv/bin/ruff check backend bot scripts
.venv/bin/ruff format --check backend bot scripts
.venv/bin/pip check
.venv/bin/alembic -c backend/alembic.ini check
cd miniapp
npm test
npm run build
```

`prepare_test_db.py` читает `.env` (fallback `.env.example`), создаёт отдельную test
DB при отсутствии и применяет именно Alembic migrations. Нужны права CREATE DATABASE
у локального PostgreSQL user; в другом окружении БД можно создать заранее.

Проверяются signed/invalid/expired initData, повторный и concurrent auth, JWT,
captain/pending/activation, invite expiry/uses/size/privacy, concurrent membership
и joins, quest availability, GPS radius/accuracy, atomic rollback, uniqueness в БД,
concurrent starts/check-ins, ledger ordering/rank/gap, admin ACL/CRUD, append-only
ledger и production dev restrictions. Bot tests проверяют stateless handoff без отправки сообщений.

### Локальный браузерный smoke

```bash
cd miniapp
npx playwright install chromium
PLAYWRIGHT_CHROME_CHANNEL=chromium npm run test:e2e
```

Если установлен Google Chrome, можно просто `npm run test:e2e` (default channel chrome).
Harness сам запускает backend на `127.0.0.1:8001` и Vite на `127.0.0.1:5174`,
использует `TEST_DATABASE_URL`, synthetic credentials и безопасно повторяет seed.
Настоящий token из `.env` не применяется. Тест открывает два независимых browser
contexts, подставляет Telegram WebApp API, проходит реальные HTTP API и PostgreSQL,
проверяет отказ вне radius, +100 XP, leaderboard и отсутствие повторного старта
после reload. Telegram location API замокан; это локальный smoke, а не проверка
Telegram-клиента или GPS устройства. Screenshot: `miniapp/test-results/leaderboard-mobile.png`.

## Ручной smoke-test через два Telegram-аккаунта

1. Настройте реальный bot token/username, HTTPS tunnel и `.env` development.
   Поднимите PostgreSQL, migrations, seed, backend, bot и Vite командами выше.
2. Аккаунт A: `/start` → **OPEN AYLOOR**. Убедитесь, что Telegram auth проходит,
   без ручного ввода user ID. Создайте **Kentron Mafia**.
3. Убедитесь: `1 / 5`, `Waiting for teammates`; START QUEST недоступен.
4. Нажмите **INVITE FRIENDS**, отправьте полученную ссылку аккаунту B.
5. Аккаунт B: откройте invite, нажмите **JOIN AYLOOR TEAM**, затем **JOIN TEAM**.
   Проверьте название команды до вступления и `2 / 5` после него.
6. Аккаунт A: дождитесь polling или **REFRESH TEAM**. Команда должна стать active.
   Попытка повторного вступления/создания второй pending-команды должна отклоняться API.
7. Откройте QUESTS → First Checkpoint → **START QUEST** от captain или member.
   На втором устройстве откройте тот же quest: должен отображаться тот же run.
8. До CHECK IN не должно быть запроса GPS-разрешения. Нажмите **CHECK IN**:
   проверьте native Telegram location prompt, отказ в разрешении, повторную попытку
   и LOCATION SETTINGS. Настоящая GPS-точка в Ереване не совпадёт с `(0,0)`:
   backend должен отклонить её. Это ожидаемо для placeholder.
9. Для успешного dev завершения раскройте Development coordinates: сначала latitude=1,
   longitude=0, accuracy=25 → отказ; затем 0,0,25 → **QUEST COMPLETE / +100 XP**.
   accuracy=151 также должна отклоняться при default MAX=150.
10. Откройте leaderboard: команда имеет 100 XP, строка выделена, rank отображается.
11. На втором аккаунте попробуйте повторный check-in того же run/обновите quest.
    Повторного XP нет, completed quest нельзя запустить заново. В БД ровно один
    accepted Submission и один completion ScoreEvent для run.
12. Для реальной GPS-проверки замените placeholder через защищённый admin PUT на
    **заранее проверенный безопасный публичный checkpoint Еревана**, используя
    новый quest либо новую тестовую команду (завершённый quest повторять нельзя).
    Дойдите до него обычным безопасным путём, проверьте отказ вне radius и успех внутри.
13. Отдельно проверьте production build + ENVIRONMENT=production: debug UI отсутствует,
    placeholder недоступен, admin доступен только whitelist-пользователю.

## Текущие ограничения и намеренно не реализованное

- Единственный development checkpoint `(0,0)` не пригоден для публичной игры.
- Реальные Telegram account/device/GPS smoke требуют ручной проверки по инструкции.
- Нет сложного anti-spoofing, rate limiting сервиса, moderation, CMS, deployment/CI automation.
- Нет выхода из команды, передачи капитана, unblock или повторного прохождения quest;
  failed run не перезапускается. Season rollover не автоматизирован.
- Production frontend требует HTTPS hosting и API routing; polling bot запускается в одном экземпляре.
- Photo/answer/team/mixed types и verification levels зарезервированы только в моделях;
  UI и admin в v0.1 поддерживают только system/location.
- Нет Redis, Celery, Kafka, Kubernetes, Terraform, GraphQL, микросервисов или AI/LLM.
- Нет Secret Sidequests, achievements, badges, inventory, shop, платежей/Stars,
  sponsors, leagues/global/player rankings, divisions, clans, friends/chat/feed,
  route generator/complex map/AR/live tracking, notification scheduler,
  Flash/Daily quests или Final Raid.

Дальнейшие продуктовые шаги: проверенный Yerevan checkpoint и closed beta;
несколько verified quests; затем Season Zero mechanics по результатам реальной игры.
