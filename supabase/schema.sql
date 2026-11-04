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
  pin_fail_count integer not null default 0,
  pin_locked_until timestamptz,
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
-- achievements — открытые достижения с датой (1.1.3, src/gamification.js);
-- tour_seen — новичку уже предлагали обучение (1.1.4, src/Tour.jsx);
-- unsaved_alerts, last_unsaved_alert, workout_touched_at — напоминание о
-- несохранённой тренировке; lang — язык интерфейса и сообщений бота;
-- units — система единиц показа (данные всегда в метрике).
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
  achievements jsonb not null default '{}',
  tour_seen boolean not null default false,
  unsaved_alerts boolean not null default true,
  last_unsaved_alert text,
  workout_touched_at timestamptz,
  lang text,
  units text
);

-- ============================================================
-- Row Level Security
-- Анонимный ключ (anon key) есть в коде фронтенда — это нормально для
-- Supabase: сам по себе он не даёт доступа ни к одной таблице. При входе
-- сервер выдаёт токен сессии (api/_session.js), и политики сверяют user_id
-- строки с полем sub этого токена. Выпустить токен самому нельзя: он
-- подписан секретом проекта.
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
create policy "own sessions" on sessions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own measurements" on measurements for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own profile" on profile for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on users, sessions, measurements, profile from anon;
revoke all on users, sessions, measurements, profile from authenticated;
grant select, insert, update, delete on sessions, measurements, profile to authenticated;

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
--   1.1.4 — обучение по приложению (migration-add-tour-seen.sql).
--   1.1.5 — напоминание о несохранённой тренировке (migration-add-unsaved-alerts.sql),
--           язык интерфейса (migration-add-lang.sql),
--           система единиц (migration-add-units.sql).
--   Закрытие базы — блокировка PIN (migration-add-pin-lock.sql), затем, после
--           выкладки кода с токеном, политики (migration-close-rls.sql).
--   Свои планы — таблица user_plans (migration-add-user-plans.sql),
--           планы для друзей — plan_shares и функции (migration-add-plan-shares.sql).
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
alter table profile add column if not exists tour_seen boolean not null default false;
alter table profile
  add column if not exists unsaved_alerts boolean not null default true,
  add column if not exists last_unsaved_alert text,
  add column if not exists workout_touched_at timestamptz;
-- метки активности — по часам сервера (migration-add-unsaved-alerts.sql)
create or replace function public.profile_server_marks() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.active_workout_at is not null and new.active_workout_at is distinct from old.active_workout_at then
    new.active_workout_at := now();
  end if;
  if new.workout_touched_at is not null and new.workout_touched_at is distinct from old.workout_touched_at then
    new.workout_touched_at := now();
  end if;
  return new;
end $$;
drop trigger if exists profile_server_marks on public.profile;
create trigger profile_server_marks before update on public.profile
  for each row execute function public.profile_server_marks();
alter table profile add column if not exists lang text;
alter table profile add column if not exists units text;

-- Свои планы (src/userPlans.js); удаление мягкое, см. deleted_at.
create table if not exists public.user_plans (
  id text primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  title text not null,
  plan jsonb not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_plans_size check (pg_column_size(plan) < 500000)
);
create index if not exists user_plans_user_idx on public.user_plans (user_id);
alter table public.user_plans enable row level security;
revoke all on public.user_plans from anon, authenticated;
grant select, insert, update, delete on public.user_plans to authenticated;
drop policy if exists "own plans" on public.user_plans;
create policy "own plans" on public.user_plans for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ============================================================
-- После выполнения: таблицы готовы для нескольких пользователей.
--
-- Вход через Telegram — при первом открытии бота автоматически
-- создаётся новый пользователь, привязанный к Telegram ID.
--
-- Вход через браузер — пользователь сам придумывает имя и PIN
-- при регистрации, дальше входит этим же именем + PIN.
-- ============================================================
