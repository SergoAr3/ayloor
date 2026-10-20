# AYLOOR v0.1 — принятые решения

Эти решения уточняют MVP_V01.md и имеют приоритет при расхождении.

1. Команда может пройти конкретный quest только один раз. Уникальная пара
   `(team_id, quest_id)` в QuestRun исключает повторные запуски, включая завершённые.
   Статус failed зарезервирован; повторные попытки после failed в v0.1 не реализованы.
2. Пользователь занимает максимум одно место в pending/active команде города.
   TeamMember содержит city_id и released_at; частичный уникальный индекс
   `(user_id, city_id) WHERE released_at IS NULL` защищает от конкурентного
   создания pending-команд и вступления. Составной FK проверяет город команды.
   Block team освобождает текущие членства в той же транзакции; история сохраняется.
   Разблокировки/выхода/перевода капитана в v0.1 нет.
3. Администратор проходит обычную Telegram initData → JWT авторизацию.
   ADMIN_TELEGRAM_IDS — CSV whitelist положительных Telegram ID; отдельной системы ролей нет.
4. Check-in блокирует Team, Quest и QuestRun до окончания транзакции.
   Submission, завершение QuestRun и completion ScoreEvent коммитятся атомарно.
   Частичный уникальный индекс по quest_run_id для reason=quest_completion
   запрещает два completion XP даже при обходе Python-проверки.
   Повторный check-in возвращает уже завершённый результат с awarded_xp=0.
   Ledger неизменяемый: корректировки — новые события с reason=admin_adjustment.
5. Bot не хранит invite-state: /start join_CODE → WebApp URL ?invite=CODE.
   Mini App также понимает Telegram start_param=join_CODE.
   Invite code не является авторизацией; join всегда требует действующий JWT.
6. Автоматические проверки работают с локальным PostgreSQL и тестовыми подписанными
   initData. Реальные аккаунты и отправка Telegram-сообщений в тестах не используются.
   README содержит ручной smoke-test с двумя аккаунтами.
7. Сезон доступен только при status=active и starts_at <= now < ends_at.
   Leaderboard: XP DESC, Team.created_at ASC, Team.id ASC. xp_to_next_rank —
   положительный XP, нужный для обгона предыдущей команды (разность + 1).
   Pending/blocked команды не участвуют в рейтинге.
8. Seed checkpoint (0, 0) — только development placeholder. В production seed
   создаёт его выключенным. Перед beta администратор обязан задать проверенные
   координаты и активировать quest. Metadata-only PUT сохраняет placeholder marker;
   только фактическая смена координат с учётом Numeric(10, 7) снимает его, не удаляя
   остальные rules. При marker production activation запрещена и через PUT, и через PATCH.
   GPS spoofing полностью не предотвращается.
9. Для разработки UI принимает вручную подписанный initData, а не Telegram ID.
   Debug GPS UI требует одновременно Vite dev build и ENVIRONMENT=development
   от backend. Backend всегда выполняет обычную проверку координат; bypass нет.
10. Автоматического деплоя, commit, push и PR эта задача не включает.
11. Test DB guard использует configuration precedence приложения и захватывает
    application DATABASE_URL до test overrides. Один validator в app/core/test_database.py
    используется pytest, prepare_test_db и browser bootstrap до engine/connect/SQL,
    Alembic, seed и запуска backend. Process environment имеет приоритет над .env;
    скрипты сохраняют fallback .env.example. Имена БД обязаны различаться независимо
    от hosts/ports/credentials, test name заканчивается на _test. Database selectors
    database/dbname/dsn в query обоих URL отклоняются без угадывания precedence.
    Lowercase environment aliases не обходят проверку или установку test configuration.
12. После неоднозначного create/join клиент выполняет reconciliation через /me,
    включая membership-related 409. Для join подтверждается именно приглашённая
    команда. Настоящие validation errors сохраняются, мутация автоматически не повторяется.
