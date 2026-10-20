# AYLOOR v0.1 — локальная проверка

Дата: 2026-10-19 (Asia/Yerevan).
Ветка: `feat/ayloor-v01`. Commit/push/PR не выполнялись.

## Результаты после исправления P1 в browser/test DB tooling

| Проверка | Результат |
| --- | --- |
| Общий guard / regression tests без подключения к БД | **52 passed** |
| Полный backend suite / отдельный PostgreSQL | **113 passed**, включая 52 guard tests |
| Bot pytest | **10 passed** |
| Frontend Vitest | **26 passed** |
| Playwright / настоящий Chrome | **4 passed** |
| TypeScript `--noEmit` | Passed |
| Ruff lint + format check | Passed |
| `git diff --check` + whitespace изменённых/untracked файлов | Passed |

Итого: **153 теста прошли**. Unsafe URL проверялись только mocks/spies, без настоящего
подключения. Полный backend suite и browser smoke выполнялись последовательно на
отдельной test DB. Application DB эти проверки не изменяли.

Validator перенесён из backend/tests/db_safety.py в backend/app/core/test_database.py
и используется conftest, prepare_test_db и browser bootstrap. Guard выполняется до
test overrides, engine/connect/SQL, Alembic subprocess, seed и запуска backend.
Регрессии проверяют оба CLI напрямую, отсутствие побочных эффектов и преждевременного
импорта модулей, создающих engine; сравнение DB, environment-over-dotenv precedence,
lowercase aliases и безопасную последовательность migrations → seed.

Query selectors database/dbname/dsn отклоняются в обоих URL, включая пустые,
percent-encoded и повторные параметры. Сохраняются PostgreSQL+asyncpg, суффикс _test
и консервативный запрет одинаковых имён БД при разных hosts/ports/credentials.
Tooling сохраняет существующий fallback .env.example; production database logic,
миграции и зависимости не менялись. Commit/push/PR/merge не выполнялись.

## Результаты после исправления трёх review findings

| Проверка | Результат |
| --- | --- |
| DB guard regression tests без подключения к БД | **12 passed**, выполнены до полного backend suite |
| Полный backend pytest / PostgreSQL | **73 passed**, включая DB guard и placeholder regressions |
| Bot pytest | **10 passed** |
| Frontend Vitest | **26 passed** |
| Playwright / настоящий Chrome | **4 passed** |
| TypeScript + Vite production build | Passed |
| Ruff lint + format check | Passed |
| `git diff --check` и whitespace новых файлов | Passed |

Итого после исправлений: **113 тестов прошли** (12 DB guard tests уже включены в 73).
Новые зависимости и миграции не добавлены. Ветка не менялась; commit/push/PR/merge не выполнялись.

DB guard использует приоритет process environment над `.env` и проверяет target
до подмены test configuration и повторно перед созданием fixture engine.
Регрессии подтверждают блокировку env-only collision, override `.env`, сохранение
существующих ограничений и отсутствие engine/connect/SQL до успешного guard.
Application DB для destructive tests не использовалась.

Admin PUT сохраняет marker при metadata-only update, включая изменение координат
ниже точности хранения; production activation остаётся запрещённой через PUT/PATCH.
Проверен marker на ненулевом development checkpoint, его снятие при фактической
замене координат и сохранение остальных rules.

Frontend различает HTTP errors и неоднозначные transport errors. Unit tests
подтверждают reconciliation только для transport/membership conflict и сохранение
реальных validation errors, включая неправильную team из `/me` и unexpected error body.
Session expiration 401 продолжает очищать session. Browser tests выполняют настоящий
create/join commit, затем теряют HTTP response и проверяют переход на Team screen без reload.
Дополнительно проверен повторный join с настоящим membership 409 после неудачной
первой reconciliation; автоматических повторов мутации нет.

## Первичная проверка реализации (до review fixes)

| Проверка | Результат |
| --- | --- |
| Docker Compose PostgreSQL 16 | Контейнер healthy, loopback port 5432 |
| Alembic `upgrade head` | Revision `0001` применена к application DB и отдельной test DB |
| Alembic `check` | No new upgrade operations detected |
| `python -m app.seed`, повторный запуск | Успешно, существующие данные сохранены |
| Backend pytest / реальный PostgreSQL | **57 passed** |
| Bot pytest / без Telegram network | **10 passed** |
| Frontend Vitest | **4 passed** |
| Playwright / настоящий Chrome, 390×844 | **1 passed** |
| TypeScript `tsc --noEmit` + Vite production build | Passed, включая TS browser tests/config |
| Production bundle | Debug sign-in/coordinates controls и имена server secrets отсутствуют |
| Ruff lint + format check | Passed |
| Python compileall | Passed |
| `pip check` | No broken requirements found |
| `npm audit` | 0 vulnerabilities |

Итого: **72 автоматических теста прошли**. Версии Python dependencies зафиксированы
в `requirements-dev.lock`, frontend — в `miniapp/package-lock.json`.

## Что действительно проверено локально

Backend tests выполняют HTTP-запросы к настоящему FastAPI app с реальным request
transaction handler и PostgreSQL migrations. В проверках конкурентности запросы
используют независимые DB connections; fake in-memory DB не используется.

Проверены Telegram HMAC и возраст initData, создание/повторное использование User,
JWT expiry, admin whitelist, pending/active membership, лимит 5 человек, срок и
uses invite, конкурирующие create/join/start/check-in, GPS radius/accuracy/finite
values, blocked team, availability quest/season, атомарный rollback при конфликте
ledger, прямой запрет повторного QuestRun и completion ScoreEvent в БД,
append-only ledger и детерминированный leaderboard.

Browser smoke запускает реальные uvicorn и Vite, открывает два изолированных
Chrome contexts. Синтетические Telegram WebApp initData подписаны известным
локальным test token. Выполнены create → invite handoff → join → active → start →
проверка ошибки вне radius → check-in через mock Telegram LocationManager → +100 XP
→ leaderboard → reload → completed quest без возможности нового старта.
До нажатия CHECK IN запрос location отсутствует. Проверены отсутствие JS page errors
и горизонтального overflow в мобильном viewport. Screenshot leaderboard визуально проверен.

Bot URL builder/handlers проверены отдельно: корректные и некорректные start parameters,
правильная WebApp-кнопка и отсутствие сохранения invite code между запросами.

## Ручной real-device smoke-test — PASS

Дата фиксации: 2026-10-20 (Asia/Yerevan). Результаты подтверждены пользователем
при ручной проверке с двумя настоящими Telegram-аккаунтами и реальным устройством.

| Проверка | Подтверждённый результат |
| --- | --- |
| Открытие Mini App | PASS — настоящий Telegram Mini App открыт через реального бота. |
| Telegram auth | PASS — авторизация успешно прошла. |
| Создание команды | PASS — Account A создал команду. |
| Invite deep-link | PASS — на Account B открылась правильная приглашённая команда. |
| Join | PASS — Account B вступил в команду. |
| Активация команды | PASS — команда автоматически стала active при 2 участниках. |
| GPS permission и геопозиция | PASS — разрешение и получение реальной геопозиции работают. |
| Outside radius | PASS — при расстоянии примерно 161.77 м и radius 100 м backend отклонил check-in как outside radius. |
| Реальный GPS check-in | PASS — после временного переноса checkpoint ближе к устройству quest успешно завершён реальным GPS check-in. |
| Начисление XP | PASS — начислено ровно +100 XP. |
| Повторное открытие Mini App | PASS — после закрытия и повторного открытия quest отображается как COMPLETED. |
| Повторное прохождение через UI | PASS — недоступно. |
| Leaderboard после повторного открытия | PASS — показывает 100 XP; дополнительного начисления не произошло. |

Для smoke использовались временный development checkpoint и Cloudflare Quick Tunnel.
Это проверка development-окружения на реальном устройстве, не production deployment.

## Что остаётся проверить вручную

- Отказ в location permission и восстановление доступа через настройки устройства/Telegram.
- Подготовка постоянного проверенного публичного Yerevan checkpoint для production.
- Проверка production deployment с HTTPS API routing и собственными секретами.

Подробная последовательность и точные команды: [README](../README.md).
При автоматических проверках реальные сообщения Telegram не отправлялись;
production deployment не выполнялся.
