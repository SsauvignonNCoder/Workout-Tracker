-- Блокировка входа по PIN после серии неудач (api/_pinLock.js, api/browser-auth.js).
--
-- Выполнить ПЕРЕД выкладкой кода: api/browser-auth.js читает эти колонки при входе.
-- Безопасно для работающей версии: колонки новые, старый код их не трогает.
-- Идемпотентна: повторный запуск ничего не меняет.

alter table public.users
  add column if not exists pin_fail_count integer not null default 0,
  add column if not exists pin_locked_until timestamptz;
