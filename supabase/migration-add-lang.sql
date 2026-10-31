-- Язык интерфейса (src/i18n.js): profile.lang — 'ru' или 'en'; null — ещё не
-- выбирали (тогда язык устройства/Telegram). По нему же сервер выбирает язык
-- сообщений бота (api/missed-check.js).
--
-- Безопасно для работающей версии: колонка новая, старые клиенты её не передают.
-- Идемпотентна. Применить ДО выкладки: новый клиент пишет lang в upsert профиля.

alter table public.profile add column if not exists lang text;
