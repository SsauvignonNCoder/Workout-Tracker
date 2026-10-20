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
-- логин + PIN, придуманные в браузере (display_name + pin_hash + pin_salt).
-- pin_hash — scrypt(pin, pin_salt), а не голый sha256: без соли одинаковый
-- PIN у разных людей даёт одинаковый хэш и перебирается почти мгновенно
-- при утечке. pin_salt своя для каждого пользователя, генерируется на
-- сервере при регистрации (см. api/browser-auth.js).
create table users (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  telegram_id bigint unique,
  pin_hash text,
  pin_salt text,
  created_at timestamptz default now()
);

create index users_telegram_id_idx on users (telegram_id);

-- Тренировки (силовые / кардио / бассейн) — принадлежат пользователю.
-- duration_sec — длительность тренировки в секундах (пошаговый режим, 1.0.1).
-- difficulty — субъективная тяжесть тренировки 1–5 (1.0.1).
-- route_name — название выбранного маршрута для кардио-дня по секторам (1.0.3).
-- Все три поля опциональны.
-- plan_id — к какому плану тренировок относится program_day (1.1.0, src/plans.js).
create table sessions (
  id text primary key,
  user_id uuid not null references users(id) on delete cascade,
  date text not null,
  exercises jsonb not null default '[]',
  cardio jsonb not null default '[]',
  sleep numeric,
  energy integer,
  difficulty integer,
  duration_sec integer,
  route_name text,
  feeling text,
  program_day integer,
  plan_id text not null default 'plan1',
  created_at timestamptz default now()
);

create index sessions_user_date_idx on sessions (user_id, date);

-- Замеры веса. time_of_day — время с устройства в момент записи, 'ЧЧ:ММ' (может быть пустым).
create table measurements (
  id text primary key,
  user_id uuid not null references users(id) on delete cascade,
  date text not null,
  weight numeric,
  time_of_day text,
  created_at timestamptz default now()
);

create index measurements_user_date_idx on measurements (user_id, date);

-- Профиль (один ряд на пользователя): текущий план, последний день программы
-- (0 — план только что выбран, следующей будет день 1) + параметры тела.
-- body_log — история замеров параметров тела (1.1.2, src/bodyLog.js); колонки
-- height … body_fat — последнее значение каждого параметра.
-- missed_alerts, tz, active_workout_at, last_missed_alert — напоминание о
-- пропущенной тренировке (1.1.2, api/missed-check.js); protein_alerts —
-- напоминание о протеине после тренировки (1.1.3, api/rest-fire.js);
-- achievements — открытые достижения с датой (1.1.3, src/gamification.js).
create table profile (
  user_id uuid primary key references users(id) on delete cascade,
  plan_id text not null default 'plan1',
  last_program_day integer,
  height numeric,
  waist numeric,
  hips numeric,
  chest numeric,
  shoulders numeric,
  body_fat numeric,
  updated_at text,
  body_log jsonb not null default '[]',
  missed_alerts boolean not null default false,
  tz text,
  active_workout_at timestamptz,
  last_missed_alert text,
  protein_alerts boolean not null default true,
  achievements jsonb not null default '{}'
);

-- ============================================================
-- Row Level Security
-- Анонимный ключ (anon key) есть в коде фронтенда — это нормально
-- для Supabase, но имей в виду: доступ к sessions/measurements/profile
-- разделён по user_id только на уровне логики приложения (клиент сам
-- фильтрует .eq('user_id', userId)), а не настоящей Supabase Auth.
-- Для личного использования среди доверенных людей это ок, но не
-- банковский уровень защиты — тот, кто узнает чужой user_id, сможет
-- прочитать/изменить его данные напрямую через anon key.
--
-- Таблица users — отдельный случай: фронтенд к ней вообще не
-- обращается напрямую (только serverless-функции api/*-auth.js через
-- SUPABASE_SERVICE_ROLE_KEY, который не подчиняется RLS), поэтому для
-- anon/authenticated она закрыта полностью — ни одной политики нет.
-- Раньше здесь была политика "allow all", из-за которой pin_hash
-- любого пользователя можно было прочитать напрямую через anon key,
-- минуя сервер — это было закрыто.
-- ============================================================
alter table users enable row level security;
alter table sessions enable row level security;
alter table measurements enable row level security;
alter table profile enable row level security;

-- users: намеренно без политик — anon/authenticated не имеют доступа вообще.
create policy "allow all sessions" on sessions for all using (true) with check (true);
create policy "allow all measurements" on measurements for all using (true) with check (true);
create policy "allow all profile" on profile for all using (true) with check (true);

-- ============================================================
-- Миграции для уже существующих баз (идемпотентны — можно выполнять повторно):
--   1.0.0 — время записи веса.
--   1.0.1 — длительность и тяжесть тренировки.
--   1.0.3 — название маршрута кардио-дня.
--   1.1.0 — план тренировок у тренировки и профиля (migration-add-plan-id.sql).
--   1.1.2 — история параметров тела (migration-add-body-log.sql),
--           напоминание о пропущенной тренировке (migration-add-missed-alerts.sql).
--   1.1.3 — переключатель напоминания о протеине (migration-add-protein-alerts.sql),
--           постоянные достижения (migration-add-achievements.sql).
-- Уже применены к рабочей базе; здесь — для чистой установки и истории.
-- ============================================================
alter table measurements add column if not exists time_of_day text;
alter table sessions
  add column if not exists duration_sec integer,
  add column if not exists difficulty integer,
  add column if not exists route_name text;
alter table sessions add column if not exists plan_id text not null default 'plan1';
alter table profile add column if not exists plan_id text not null default 'plan1';
alter table profile add column if not exists body_log jsonb not null default '[]';
alter table profile
  add column if not exists missed_alerts boolean not null default false,
  add column if not exists tz text,
  add column if not exists active_workout_at timestamptz,
  add column if not exists last_missed_alert text;
alter table profile add column if not exists protein_alerts boolean not null default true;
alter table profile add column if not exists achievements jsonb not null default '{}';

-- ============================================================
-- После выполнения: таблицы готовы для нескольких пользователей.
--
-- Вход через Telegram — при первом открытии бота автоматически
-- создаётся новый пользователь, привязанный к Telegram ID.
--
-- Вход через браузер — пользователь сам придумывает имя и PIN
-- при регистрации, дальше входит этим же именем + PIN.
-- ============================================================
