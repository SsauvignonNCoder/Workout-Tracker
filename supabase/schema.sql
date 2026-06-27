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

-- Простая PIN-защита на уровне приложения (не Supabase Auth)
create table app_auth (
  id integer primary key default 1,
  pin_hash text not null,
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

-- ============================================================
-- После выполнения этого скрипта таблицы готовы.
-- PIN-код создавать вручную не нужно — при первом открытии сайта
-- приложение само предложит создать PIN и сохранит его хэш сюда.
-- ============================================================
