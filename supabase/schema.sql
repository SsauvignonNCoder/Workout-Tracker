-- ============================================================
-- Workout Tracker — схема базы данных для Supabase
-- Выполнить целиком в Supabase: SQL Editor → New query → Run
-- ============================================================

-- Таблица тренировок (силовые / кардио / бассейн)
create table sessions (
  id text primary key,
  date text not null,
  exercises jsonb not null default '[]',
  cardio jsonb not null default '[]',
  sleep numeric,
  energy integer,
  feeling text,
  program_day integer,
  created_at timestamptz default now()
);

create index sessions_date_idx on sessions (date);

-- Таблица замеров веса и параметров тела
create table measurements (
  id text primary key,
  date text not null,
  weight numeric,
  created_at timestamptz default now()
);

create index measurements_date_idx on measurements (date);

-- Профиль (один ряд): последний день программы + параметры тела
create table profile (
  id integer primary key default 1,
  last_program_day integer,
  height numeric,
  waist numeric,
  hips numeric,
  chest numeric,
  shoulders numeric,
  body_fat numeric,
  updated_at text,
  constraint single_row check (id = 1)
);

insert into profile (id) values (1);

-- Простая защита: PIN (для входа из обычного браузера) +
-- разрешённый Telegram ID (для входа из Telegram Mini App без PIN)
create table app_auth (
  id integer primary key default 1,
  pin_hash text,
  telegram_id bigint,
  constraint single_row_auth check (id = 1)
);

-- ============================================================
-- Row Level Security
-- Анонимный ключ (anon key) будет в коде фронтенда — это нормально
-- для Supabase, доступ ограничивается через PIN на уровне приложения.
-- ============================================================
alter table sessions enable row level security;
alter table measurements enable row level security;
alter table profile enable row level security;
alter table app_auth enable row level security;

create policy "allow all sessions" on sessions for all using (true) with check (true);
create policy "allow all measurements" on measurements for all using (true) with check (true);
create policy "allow all profile" on profile for all using (true) with check (true);
create policy "allow read auth" on app_auth for select using (true);
create policy "allow insert auth" on app_auth for insert with check (true);
create policy "allow update auth" on app_auth for update using (true) with check (true);

-- ============================================================
-- После выполнения этого скрипта таблицы готовы.
--
-- Вход с обычного браузера: PIN-код создавать вручную не нужно —
-- при первом открытии сайта приложение само предложит создать PIN.
--
-- Вход из Telegram Mini App: при первом успешном открытии бота
-- приложение автоматически закрепит твой Telegram ID как владельца
-- (telegram_id будет NULL до этого момента) — дальше вход идёт
-- без PIN, по подписи Telegram.
-- ============================================================
