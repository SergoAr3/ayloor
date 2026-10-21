# AYLOOR Street Frequency — актуальный пакет для Codex

Начни с CODEX_HANDOFF.md. В prototype/ — полный исходный React/TypeScript прототип с отдельными Home и Team.

Это design reference для существующего AYLOOR Mini App. Правила проекта задаёт корневой `AGENTS.md` AYLOOR; `CODEX_HANDOFF.md` описывает согласованное визуальное направление.

Для самостоятельного локального запуска:

```bash
cd design-reference/street-frequency/prototype
npm ci
npm run dev
```

Сборка: `npm run build`, результат — `prototype/dist/`. Просмотр сборки: `npm run preview` из папки `prototype/`. `package-lock.json` сохранён для воспроизводимой установки; `node_modules/` и `dist/` не включаются в Git.

`src/mobile/` и device assets в `public/assets/` нужны для локального просмотра исходного prototype. Они остаются частью reference и не предназначены для переноса в production Mini App. Sites/Worker deployment tooling, runtime-lock проверки и тесты экспортной среды удалены.

Согласованные reference assets: `yerevan-collage.png`, `cascade.png`, `wordmark.png` в `prototype/public/assets/`. Cascade — иллюстративный reference, не утверждённый production checkpoint; wordmark — растровый концепт, не master logo.

Тестовые данные хранятся в памяти и сбрасываются после перезагрузки. Telegram/GPS/backend не подключены.
