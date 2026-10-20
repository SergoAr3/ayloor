Ты работаешь над новым проектом **AYLOOR**.

# 1. Что это за продукт

**AYLOOR — multiplayer game played in the real world.**

Первый рынок — **Ереван, Армения**.

Пользователь заходит через Telegram, открывает Telegram Mini App, создаёт команду, приглашает друзей, получает реальные городские задания, выходит в город, выполняет quest, подтверждает выполнение через GPS или другие механики, получает XP и поднимается вместе с командой в leaderboard.

Публичное позиционирование:

**AYLOOR**  
**Play the real world.**

Для первого сезона:

**AYLOOR YEREVAN — SEASON ZERO**  
**The city is your game.**

На этом этапе НЕ нужно строить полноценную глобальную платформу.

Нужно создать качественный технический фундамент и первый полностью рабочий vertical slice:

**Telegram → Mini App → Team → Invite → Quest → GPS Check-in → XP → Leaderboard**

---

# 2. Главная продуктовая идея

AYLOOR — это не туристический гид и не обычный scavenger hunt.

Пользователь должен чувствовать:

> город стал игровой картой.

Основной игровой цикл:

```text
Create team
    ↓
Invite friends
    ↓
Team becomes active
    ↓
Choose / receive quest
    ↓
Go into the city
    ↓
Complete real-world objective
    ↓
Verify completion
    ↓
Earn XP
    ↓
Move up leaderboard
    ↓
Return for another quest
```

Главная метрика будущего продукта:

**Second IRL Session Rate**

То есть:

> вернулась ли команда физически играть второй раз.

---

# 3. Первый рынок и первый сезон

Первый город:

```text
Yerevan
Armenia
Timezone: Asia/Yerevan
```

Первый сезон:

```text
AYLOOR YEREVAN — SEASON ZERO
```

План продукта:

- команды 2–5 человек;
- длительность будущего Season Zero — около 14 дней;
- бесплатное участие;
- основной score — XP;
- один городской leaderboard;
- сначала только несколько quests;
- без платежей;
- без AI;
- без сложной турнирной системы.

---

# 4. Технологический стек

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
- Telegram Mini Apps SDK / Telegram WebApp APIs

Infrastructure:

- Docker
- Docker Compose

Не использовать сейчас:

- Redis
- Celery
- Kafka
- Kubernetes
- Terraform
- микросервисы

Проект разрабатывает один человек с помощью Codex.

Приоритет:

**простота > архитектурная красота > premature scalability.**

---

# 5. Monorepo

Создай один monorepo:

```text
ayloor/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   ├── core/
│   │   ├── db/
│   │   ├── models/
│   │   ├── schemas/
│   │   ├── services/
│   │   └── main.py
│   ├── migrations/
│   ├── tests/
│   └── pyproject.toml
│
├── bot/
│   ├── app/
│   └── pyproject.toml
│
├── miniapp/
│   ├── src/
│   ├── package.json
│   └── vite.config.ts
│
├── docker-compose.yml
├── .env.example
├── .gitignore
└── README.md
```

Можно немного изменить внутреннюю структуру, если есть реальная техническая причина.

Не создавать дополнительные сервисы без необходимости.

---

# 6. Infrastructure

Docker Compose должен поднимать PostgreSQL.

Добавь переменные окружения:

```text
DATABASE_URL
TELEGRAM_BOT_TOKEN
TELEGRAM_WEBAPP_URL
TELEGRAM_WEBHOOK_SECRET
APP_SECRET_KEY
ENVIRONMENT
JWT_EXPIRATION_MINUTES
MAX_ACCEPTABLE_GPS_ACCURACY_M
```

Создай:

```text
.env.example
```

Не коммить реальные секреты.

---

# 7. Общие правила backend

Используй:

- UUID как внутренние primary keys;
- Telegram ID отдельно как BIGINT;
- timezone-aware UTC timestamps;
- SQLAlchemy async;
- PostgreSQL;
- транзакции там, где нужна atomicity;
- typed Python;
- Pydantic schemas отдельно от ORM models;
- понятные HTTP errors;
- database constraints;
- индексы для очевидных lookup.

Не использовать generic repository pattern только ради pattern.

Не создавать десятки interfaces, factories и abstraction layers.

Код должен быть легко понятен одному разработчику.

---

# 8. Database models

## User

```text
id UUID PK
telegram_id BIGINT UNIQUE NOT NULL
username VARCHAR nullable
first_name VARCHAR nullable
last_name VARCHAR nullable
language_code VARCHAR nullable
created_at timestamp
updated_at timestamp
```

---

## City

```text
id UUID PK
slug VARCHAR UNIQUE
name VARCHAR
country_code VARCHAR(2)
timezone VARCHAR
is_active BOOLEAN
created_at timestamp
```

Seed:

```text
slug: yerevan
name: Yerevan
country_code: AM
timezone: Asia/Yerevan
is_active: true
```

---

## Team

```text
id UUID PK
city_id FK cities
name VARCHAR
slug VARCHAR UNIQUE
captain_user_id FK users

status ENUM:
    pending
    active
    blocked

created_at
updated_at
```

Команда:

```text
pending
```

пока в ней только один человек.

Когда становится минимум 2 участника:

```text
active
```

Максимум для MVP:

```text
5 участников
```

---

## TeamMember

```text
id UUID PK
team_id FK teams
user_id FK users

role ENUM:
    captain
    member

joined_at
```

Пользователь пока может состоять максимум в одной активной команде в одном городе.

Добавь database constraint или надёжную service-level проверку.

---

## Season

```text
id UUID PK
city_id FK cities

name VARCHAR
slug VARCHAR

starts_at timestamp
ends_at timestamp

status ENUM:
    draft
    active
    finished

created_at
```

Development seed:

```text
name:
AYLOOR YEREVAN — SEASON ZERO

slug:
yerevan-season-zero

status:
active
```

---

## Quest

```text
id UUID PK
city_id FK cities
season_id FK seasons nullable

slug VARCHAR UNIQUE
title VARCHAR
description TEXT

quest_type ENUM:
    location
    photo
    answer
    team
    mixed

verification_level ENUM:
    system
    moderated
    team_confirmed
    honor

base_xp INTEGER

latitude DECIMAL nullable
longitude DECIMAL nullable
radius_m INTEGER nullable

starts_at timestamp nullable
expires_at timestamp nullable

is_active BOOLEAN

rules_json JSONB nullable

created_at
updated_at
```

### Verification levels

Эта система важна для будущей игры.

```text
SYSTEM
```

Backend может объективно проверить выполнение.

Например:

- GPS;
- timestamp;
- answer;
- in-app action.

Даёт полноценный competitive XP.

```text
MODERATED
```

Фото/video/manual review.

Позже может использовать AI preliminary validation.

```text
TEAM_CONFIRMED
```

Команда подтверждает выполнение голосованием.

Такой quest не должен давать большое количество серьёзного leaderboard XP.

```text
HONOR
```

Выполнение невозможно объективно проверить.

Используется в основном ради fun/social механик.

Не должен влиять существенно на глобальный leaderboard.

---

# 9. Первый development Quest

Создай один seed quest:

```text
title:
First Checkpoint

description:
Reach the first AYLOOR checkpoint and check in with your team.

quest_type:
location

verification_level:
system

base_xp:
100
```

Координаты должны быть development placeholder.

Не придумывай production checkpoint.

В seed/config поставь явный комментарий:

```text
TODO: replace with verified Yerevan Season Zero checkpoint
```

---

# 10. QuestRun

```text
id UUID PK
quest_id FK quests
team_id FK teams

status ENUM:
    started
    completed
    failed

started_at
completed_at nullable
```

Команда не должна иметь два active run одного и того же quest.

---

# 11. Submission

```text
id UUID PK
quest_run_id FK quest_runs
user_id FK users

submission_type ENUM:
    location
    photo
    answer
    team_confirmation

latitude DECIMAL nullable
longitude DECIMAL nullable
horizontal_accuracy FLOAT nullable

answer TEXT nullable
telegram_file_id VARCHAR nullable

status ENUM:
    pending
    accepted
    rejected

created_at
```

---

# 12. ScoreEvent

XP нельзя хранить только mutable полем:

```text
team.xp
```

Source of truth должен быть ledger.

```text
id UUID PK
season_id FK seasons
team_id FK teams
user_id FK users nullable
quest_run_id FK quest_runs nullable

amount INTEGER
reason VARCHAR

created_at
```

Current team XP:

```text
SUM(score_events.amount)
```

Позже можно добавить cache, но не сейчас.

---

# 13. Invite

```text
id UUID PK
team_id FK teams
created_by FK users

code VARCHAR UNIQUE

expires_at nullable
max_uses INTEGER nullable
uses INTEGER default 0

created_at
```

---

# 14. Telegram authentication

Mini App НЕ должен просто отправлять:

```text
telegram_id
```

и получать авторизацию.

Frontend отправляет backend raw Telegram Mini App:

```text
initData
```

Backend обязан проверить подпись Telegram server-side согласно официальному алгоритму Telegram Mini Apps.

После успешной проверки:

1. извлечь Telegram user;
2. найти User по telegram_id;
3. либо создать нового;
4. выдать внутренний JWT.

JWT:

```text
sub = internal User UUID
```

Добавь expiration.

Не хранить:

- Telegram Bot Token;
- APP_SECRET_KEY;
- DB credentials

на frontend.

---

# 15. REST API

Prefix:

```text
/api/v1
```

## Auth

```text
POST /api/v1/auth/telegram
```

Request:

```json
{
  "init_data": "raw telegram initData"
}
```

Response:

```json
{
  "access_token": "...",
  "token_type": "bearer",
  "user": {}
}
```

---

## Current user

```text
GET /api/v1/me
```

Response должен содержать:

- user;
- current team, если есть;
- city;
- current active season.

---

# 16. Teams API

```text
POST /api/v1/teams
GET  /api/v1/teams/{team_id}
GET  /api/v1/teams/{team_id}/members
```

Create:

```json
{
  "name": "Kentron Mafia",
  "city_slug": "yerevan"
}
```

Создатель автоматически:

```text
captain
```

и TeamMember создаётся в той же transaction.

Team initially:

```text
pending
```

После второго участника:

```text
active
```

Максимум:

```text
5 members
```

---

# 17. Invites API

```text
POST /api/v1/teams/{team_id}/invites
GET  /api/v1/invites/{code}
POST /api/v1/invites/{code}/join
```

Проверять:

- invite существует;
- не expired;
- max_uses не превышен;
- team существует;
- team не blocked;
- team не заполнена;
- пользователь ещё не состоит в этой команде;
- пользователь не состоит в другой active team этого города.

После join:

```text
invite.uses += 1
```

Если участников стало >=2:

```text
team.status = active
```

---

# 18. Season API

```text
GET /api/v1/seasons/current?city=yerevan
```

---

# 19. Quest API

```text
GET /api/v1/quests
GET /api/v1/quests/{quest_id}

POST /api/v1/quests/{quest_id}/start
POST /api/v1/quest-runs/{run_id}/check-in
```

Quest list пока может показывать все доступные active quests текущего сезона.

Не создавать сложную unlock system.

---

# 20. Starting a Quest

При:

```text
POST /quests/{quest_id}/start
```

проверить:

- пользователь состоит в team;
- team.status == active;
- quest active;
- quest относится к нужному city;
- quest доступен по starts_at / expires_at;
- нет другого active QuestRun этого же quest для команды.

После этого:

```text
QuestRun.status = started
```

---

# 21. GPS Check-in

Request:

```json
{
  "latitude": 40.123,
  "longitude": 44.456,
  "horizontal_accuracy": 25
}
```

Backend проверяет:

- QuestRun существует;
- QuestRun принадлежит team пользователя;
- QuestRun status == started;
- Quest active;
- team active;
- user member of team;
- location quest имеет checkpoint;
- timestamp попадает в allowed interval;
- horizontal_accuracy приемлемая;
- пользователь находится внутри radius.

Frontend никогда не решает самостоятельно:

```text
quest completed = true
```

---

# 22. Distance calculation

Используй простой корректный расчёт расстояния:

- Haversine;
- либо PostGIS только если действительно необходимо.

Для MVP Haversine достаточно.

Проверка:

```text
distance(user_coordinates, checkpoint_coordinates)
<= quest.radius_m
```

---

# 23. GPS accuracy

Используй configurable:

```text
MAX_ACCEPTABLE_GPS_ACCURACY_M
```

Development default можно поставить:

```text
150
```

Но значение должно легко меняться env-переменной.

Не строить сложный anti-GPS-spoofing сейчас.

---

# 24. Idempotency и XP

Это критично.

Повторный check-in не должен выдавать XP второй раз.

При успешном completion одной DB transaction:

1. создать accepted Submission;
2. QuestRun.status → completed;
3. QuestRun.completed_at;
4. создать ScoreEvent;
5. commit.

Нужна защита от race conditions.

Добавь подходящий unique constraint или другой надёжный database-level механизм, чтобы одному:

```text
quest_run
```

нельзя было выдать completion XP дважды.

---

# 25. Leaderboard

Endpoint:

```text
GET /api/v1/leaderboard?city=yerevan
```

Leaderboard текущего active season.

Пример:

```json
[
  {
    "rank": 1,
    "team_id": "...",
    "team_name": "Team A",
    "xp": 700
  },
  {
    "rank": 2,
    "team_id": "...",
    "team_name": "Kentron Mafia",
    "xp": 500
  }
]
```

Score source:

```text
SUM(ScoreEvent.amount)
```

Также вернуть:

```text
current_user_team_rank
current_user_team_xp
xp_to_next_rank
```

если применимо.

Tie-breaking для MVP:

1. XP DESC;
2. earliest time reaching score или deterministic fallback по created_at/team_id.

Не строить сложную tournament ranking system.

---

# 26. Telegram Bot

Использовать:

```text
aiogram 3.x
```

Bot на первом этапе делает только:

```text
/start
```

и показывает:

```text
OPEN AYLOOR
```

кнопку Telegram WebApp.

Также deep link:

```text
https://t.me/<bot_username>?start=join_<invite_code>
```

Если пользователь приходит через invite:

1. распарсить invite code;
2. передать его в Mini App flow;
3. показать кнопку:

```text
JOIN AYLOOR TEAM
```

Не строить gameplay внутри Telegram chat.

Правило:

```text
Telegram bot = acquisition + notifications
Mini App = gameplay
```

---

# 27. Mini App

Не нужно делать идеальный дизайн.

Нужен:

- mobile-first;
- быстрый;
- понятный;
- Telegram-native интерфейс.

Первичная тема:

тёмная/нейтральная игровая UI без сложного design system.

---

# 28. Mini App screens

## Screen 1 — Loading/Auth

Получить:

```text
Telegram.WebApp.initData
```

Отправить backend.

Получить JWT.

Сохранить session.

---

## Screen 2 — User without Team

Показать:

```text
AYLOOR

YEREVAN
SEASON ZERO

The city is your game.

[CREATE TEAM]
```

Если есть invite code:

```text
KENTRON MAFIA
invites you to AYLOOR.

[JOIN TEAM]
```

---

# 29. Create Team

Input:

```text
Team name
```

Button:

```text
CREATE TEAM
```

После создания:

Team Page.

---

# 30. Team Page

Показать:

```text
KENTRON MAFIA

Members:
1 / 5

Status:
Waiting for teammates
```

Button:

```text
INVITE FRIENDS
```

Использовать Telegram-native sharing/deep link.

После второго участника:

```text
TEAM ACTIVE
```

и становится доступен Quest list.

---

# 31. Home

Для active team:

```text
KENTRON MAFIA

100 XP
#4 YEREVAN

SEASON ZERO
```

Buttons:

```text
QUESTS
LEADERBOARD
TEAM
```

Не добавлять сейчас:

- store;
- profile customization;
- achievements;
- badges;
- chat.

---

# 32. Quest List

Пример:

```text
FIRST CHECKPOINT

Reach the checkpoint.

+100 XP

[OPEN]
```

---

# 33. Quest Detail

```text
FIRST CHECKPOINT

Reach the first AYLOOR checkpoint.

Reward:
+100 XP

[START QUEST]
```

После начала:

```text
QUEST ACTIVE

[CHECK IN]
```

---

# 34. Telegram Location

При:

```text
CHECK IN
```

Mini App должен запросить location через доступный Telegram Mini App location API.

Передать backend:

```text
latitude
longitude
horizontal_accuracy
```

Если Telegram location API недоступен в обычном development browser, предусмотреть безопасный dev-only fallback.

Production backend не должен доверять клиенту только потому, что frontend Telegram.

---

# 35. Development GPS mode

Разработчику нельзя каждый раз физически идти к checkpoint.

При:

```text
ENVIRONMENT=development
```

можно включить development-only способ тестировать check-in.

Например через debug UI или dev coordinates.

Но:

- production mode должен полностью отключать эту возможность;
- нельзя принимать:

```text
skip_verification=true
```

или аналогичный query/body параметр;
- пользователь production не должен иметь способ активировать dev mode.

README должен объяснять механизм.

---

# 36. Quest Complete Screen

После успешного check-in:

```text
QUEST COMPLETE

+100 XP

KENTRON MAFIA
#4 YEREVAN

[VIEW LEADERBOARD]
```

---

# 37. Leaderboard Screen

Пример:

```text
AYLOOR YEREVAN
SEASON ZERO

1. Team A          700 XP
2. Team B          500 XP
3. Kentron Mafia   400 XP
4. Team D          300 XP
```

Current team визуально highlight.

Если возможно, показать:

```text
130 XP to #2
```

---

# 38. Secret Sidequests

Система Secret Sidequests — часть будущего AYLOOR, но **НЕ реализовывать сейчас**.

Важно лишь учитывать будущую модель verification.

Будущие secret quests могут быть:

```text
SYSTEM
MODERATED
TEAM_CONFIRMED
HONOR
```

Примеры:

### Verified secret mission

```text
Get your team to reach the next checkpoint before 19:30
without explaining why.
```

Objective может быть проверен backend.

Условие:

```text
don't tell the others
```

является social contract, а не технической проверкой.

### Social secret mission

```text
Make someone say:
"Where are we even going?"
```

Нельзя объективно проверить.

Такое задание не должно давать серьёзный leaderboard XP.

Позже можно использовать:

- team confirmation;
- stealth bonus;
- suspect/spying mechanics.

Но в текущем MVP:

```text
DO NOT IMPLEMENT SECRET SIDEQUESTS
```

---

# 39. Scoring philosophy

Будущая система примерно:

```text
Easy quest       100–150 XP
Medium quest     200–300 XP
Hard quest       400–600 XP
Weekly quest     ~700 XP
Final quest      ~1000 XP
```

Но сейчас нужен только:

```text
First Checkpoint = 100 XP
```

Не реализовывать multipliers, streaks, divisions и inventory.

---

# 40. Safety philosophy

AYLOOR не должен поощрять опасное поведение.

Не строить механику:

```text
fastest player always wins
```

Speed в будущем может давать небольшой bonus, но completion/exploration должны быть важнее.

Не проектировать задания, требующие:

- нарушения закона;
- проникновения на частную территорию;
- опасного пересечения дорог;
- агрессивного взаимодействия с незнакомцами;
- съёмки людей без необходимости.

---

# 41. Privacy philosophy

AYLOOR не должен постоянно отслеживать пользователя.

В MVP location запрашивается только:

```text
when user presses CHECK IN
```

Не делать:

- background tracking;
- continuous GPS tracking;
- route recording.

Хранить только данные, необходимые для verification и debugging.

---

# 42. Admin

Не делать полноценную CMS.

Для MVP достаточно минимального protected admin functionality:

- list users;
- list teams;
- list quests;
- create/edit quest;
- activate/deactivate quest;
- list submissions;
- manually adjust ScoreEvent;
- block team.

Можно реализовать:

- simple protected FastAPI admin endpoints;
- либо minimal admin interface.

Не тратить время на красивый backoffice.

---

# 43. Seed CLI

Сделай удобный seed command.

Он должен создавать:

1. Yerevan;
2. AYLOOR YEREVAN — SEASON ZERO;
3. First Checkpoint.

Документируй команду.

Seed должен быть idempotent или безопасно сообщать о существующих данных.

---

# 44. Tests

Минимально обязательные tests.

## Telegram auth

- invalid initData rejected;
- valid initData accepted;
- user created;
- existing user reused.

Для теста Telegram initData сделай helper, который корректно генерирует signed test payload.

---

## Teams

- create team;
- creator becomes captain;
- team initially pending;
- invite created;
- second member joins;
- team becomes active;
- duplicate join rejected;
- sixth member rejected;
- user cannot join another active team in same city.

---

## Quest

- pending team cannot start;
- active team can start;
- duplicate active QuestRun rejected;
- outside-radius check-in rejected;
- unacceptable GPS accuracy rejected;
- valid check-in accepted;
- Submission created;
- QuestRun completed;
- ScoreEvent created;
- second check-in does not award XP again.

---

## Leaderboard

- score comes from ScoreEvent ledger;
- sorting works;
- current team rank works;
- xp_to_next_rank works.

---

# 45. README

README должен подробно содержать:

1. Что такое AYLOOR.
2. Product concept.
3. Tech stack.
4. Repository structure.
5. How to install.
6. Environment variables.
7. How to run PostgreSQL.
8. How to migrate DB.
9. How to seed.
10. How to run FastAPI.
11. How to run Telegram bot.
12. How to run Mini App.
13. How to create Telegram bot.
14. How to configure Mini App URL.
15. How Telegram initData authentication works.
16. How invites work.
17. How GPS verification works.
18. How development GPS testing works.
19. How XP ledger works.
20. Current limitations.
21. Intentionally unimplemented features.

---

# 46. НЕ реализовывать сейчас

Категорически не добавлять:

- Redis;
- Celery;
- Kafka;
- Kubernetes;
- Terraform;
- GraphQL;
- AI;
- LLM;
- AI generated quests;
- AI photo moderation;
- Secret Sidequests;
- achievements;
- badges;
- inventory;
- shop;
- Telegram Stars;
- subscription;
- sponsors;
- partner dashboard;
- World League;
- city vs city;
- Armenia League;
- global rankings;
- player rankings;
- divisions;
- clans;
- friends;
- chat;
- social feed;
- route generator;
- complex map;
- live tracking;
- AR;
- notification scheduler;
- Flash Quest;
- Daily Quest;
- Final Raid;
- photo quests;
- payments.

Это будущие этапы.

---

# 47. Definition of Done

После выполнения я должен иметь возможность:

1. Clone repository.

2. Создать `.env`.

3. Выполнить:

```bash
docker compose up -d
```

4. Запустить migrations.

5. Запустить seed.

6. Запустить FastAPI backend.

7. Запустить Telegram bot.

8. Запустить Mini App.

9. Открыть bot в Telegram.

10. Нажать:

```text
OPEN AYLOOR
```

11. Mini App авторизуется через Telegram initData.

12. Создать:

```text
Kentron Mafia
```

13. Получить invite link.

14. Открыть invite со второго Telegram account.

15. Второй пользователь вступает.

16. Team становится:

```text
active
```

17. Команда видит:

```text
First Checkpoint
+100 XP
```

18. Captain/member нажимает:

```text
START QUEST
```

19. Потом:

```text
CHECK IN
```

20. Telegram Mini App получает GPS location.

21. Backend проверяет координаты.

22. При неверных координатах completion запрещён.

23. При правильных координатах:

```text
QuestRun = completed
```

24. Создаётся accepted Submission.

25. Создаётся ровно один:

```text
ScoreEvent +100
```

26. Повторный check-in не создаёт новый XP.

27. Leaderboard показывает команду с 100 XP.

28. Тесты проходят.

---

# 48. Как работать

Перед написанием кода:

1. проанализируй требования;
2. найди потенциальные противоречия;
3. предложи короткий implementation plan;
4. затем начинай реализацию.

Порядок реализации:

```text
1. repo structure
2. Docker/PostgreSQL
3. FastAPI foundation
4. DB models
5. Alembic
6. seed
7. Telegram auth
8. Teams + invites
9. Quests
10. GPS verification
11. Score ledger
12. Leaderboard
13. Telegram bot
14. Mini App
15. tests
16. README
17. end-to-end verification
```

Не останавливайся после skeleton.

Нужен рабочий end-to-end vertical slice.

Если какое-либо решение неоднозначно:

- выбери самый простой production-reasonable вариант;
- не overengineer;
- документируй решение.

Если обнаружишь ошибку в требованиях, которая мешает корректной реализации, исправь её минимально необходимым образом и объясни в финальном отчёте.

---

# 49. Финальный отчёт Codex

После реализации выведи:

## Implemented

Какие компоненты созданы.

## Run commands

Точные команды запуска.

## Database

Какие migrations и seed созданы.

## Tests

Какие tests запущены и результаты.

## End-to-end flow

Подтверди, какие шаги вертикального flow реально работают.

## Known limitations

Что пока не реализовано.

## Security notes

Особенно:

- Telegram initData;
- JWT;
- GPS verification;
- XP idempotency.

## Next 3 steps

Предложи только три следующих продуктовых шага.

Приоритет после текущего MVP должен быть примерно:

1. настоящий Yerevan checkpoint + первый closed beta;
2. несколько разных verified quests;
3. Season Zero mechanics / Daily or Flash Quest.

Не предлагай World League, AI и сложную инфраструктуру до получения реальных пользовательских данных.
