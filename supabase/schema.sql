-- ============================================================
-- Workout Tracker — схема базы данных для Supabase (multi-user)
-- Выполнить целиком в Supabase: SQL Editor → New query → Run
--
-- ВАЖНО: если у тебя уже была старая single-user версия (таблицы
-- sessions/measurements/profile/app_auth без user_id) — НЕ выполняй
-- этот файл как есть, он создаст дублирующие таблицы и упадёт с
-- ошибкой "already exists". Смотри файл migration-to-multiuser.sql —
-- он переносит твои существующие данные в новую структуру.
-- ============================================================

-- Пользователи: либо через Telegram (telegram_id), либо через
-- логин + PIN, придуманные в браузере (display_name + pin_hash).
create table users (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  telegram_id bigint unique,
  pin_hash text,
  created_at timestamptz default now()
);

create index users_telegram_id_idx on users (telegram_id);

-- Тренировки (силовые / кардио / бассейн) — принадлежат пользователю
create table sessions (
  id text primary key,
  user_id uuid not null references users(id) on delete cascade,
  date text not null,
  exercises jsonb not null default '[]',
  cardio jsonb not null default '[]',
  sleep numeric,
  energy integer,
  feeling text,
  program_day integer,
  created_at timestamptz default now()
);

create index sessions_user_date_idx on sessions (user_id, date);

-- Замеры веса
create table measurements (
  id text primary key,
  user_id uuid not null references users(id) on delete cascade,
  date text not null,
  weight numeric,
  created_at timestamptz default now()
);

create index measurements_user_date_idx on measurements (user_id, date);

-- Профиль (один ряд на пользователя): последний день программы + параметры тела
create table profile (
  user_id uuid primary key references users(id) on delete cascade,
  last_program_day integer,
  height numeric,
  waist numeric,
  hips numeric,
  chest numeric,
  shoulders numeric,
  body_fat numeric,
  updated_at text
);

-- ============================================================
-- Row Level Security
-- Анонимный ключ (anon key) есть в коде фронтенда — это нормально
-- для Supabase, но имей в виду: доступ разделён по user_id только
-- на уровне логики приложения, а не настоящей Supabase Auth.
-- Для личного использования среди доверенных людей это ок,
-- но не банковский уровень защиты.
-- ============================================================
alter table users enable row level security;
alter table sessions enable row level security;
alter table measurements enable row level security;
alter table profile enable row level security;

create policy "allow all users" on users for all using (true) with check (true);
create policy "allow all sessions" on sessions for all using (true) with check (true);
create policy "allow all measurements" on measurements for all using (true) with check (true);
create policy "allow all profile" on profile for all using (true) with check (true);

-- ============================================================
-- После выполнения: таблицы готовы для нескольких пользователей.
--
-- Вход через Telegram — при первом открытии бота автоматически
-- создаётся новый пользователь, привязанный к Telegram ID.
--
-- Вход через браузер — пользователь сам придумывает имя и PIN
-- при регистрации, дальше входит этим же именем + PIN.
-- ============================================================
