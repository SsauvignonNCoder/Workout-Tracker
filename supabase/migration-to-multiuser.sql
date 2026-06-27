-- ============================================================
-- МИГРАЦИЯ со старой (single-user) схемы на новую (multi-user)
-- Выполнить ОДИН РАЗ в Supabase: SQL Editor → New query → Run
--
-- Переносит твои существующие тренировки, замеры и профиль
-- в новую структуру с user_id, не теряя ни одной записи.
-- Выполняется одним нажатием Run — никаких UUID копировать руками не нужно.
-- ============================================================

create extension if not exists "pgcrypto" with schema extensions;

create table users (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  telegram_id bigint unique,
  pin_hash text,
  created_at timestamptz default now()
);

create index users_telegram_id_idx on users (telegram_id);

do $$
declare
  my_id uuid;
begin
  -- Переносим тебя как первого пользователя, забирая существующий
  -- PIN и Telegram ID из старой таблицы app_auth (если там что-то было)
  insert into users (display_name, telegram_id, pin_hash)
  select 'Никита', telegram_id, pin_hash from app_auth where id = 1
  returning id into my_id;

  -- Если app_auth была пустой — создаём пользователя без PIN/Telegram
  if my_id is null then
    insert into users (display_name) values ('Никита') returning id into my_id;
  end if;

  alter table sessions add column user_id uuid references users(id) on delete cascade;
  alter table measurements add column user_id uuid references users(id) on delete cascade;

  update sessions set user_id = my_id where user_id is null;
  update measurements set user_id = my_id where user_id is null;

  alter table sessions alter column user_id set not null;
  alter table measurements alter column user_id set not null;

  create table profile_new (
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

  insert into profile_new (user_id, last_program_day, height, waist, hips, chest, shoulders, body_fat, updated_at)
  select my_id, last_program_day, height, waist, hips, chest, shoulders, body_fat, updated_at
  from profile where id = 1;

  drop table profile;
  alter table profile_new rename to profile;

  drop table app_auth;
end $$;

create index sessions_user_date_idx on sessions (user_id, date);
create index measurements_user_date_idx on measurements (user_id, date);

alter table users enable row level security;
create policy "allow all users" on users for all using (true) with check (true);

-- ============================================================
-- Готово. Все твои старые данные теперь привязаны к пользователю
-- "Никита". Дальше для свежих установок используется schema.sql,
-- а этот файл больше не понадобится.
-- ============================================================
