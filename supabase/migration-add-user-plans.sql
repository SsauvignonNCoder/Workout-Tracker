-- Свои планы пользователей (src/userPlans.js). id плана — текст «u-…», он же попадает
-- в sessions.plan_id и profile.plan_id, как 'plan1' у встроенных. Удаление — мягкое
-- (deleted_at): тренировки по удалённому плану сверяются с ним в отчётах и достижениях.
--
-- Выполнить ПЕРЕД выкладкой кода: приложение читает таблицу при загрузке.
-- Безопасно для работающей версии: таблица новая, старый код её не трогает.
-- Идемпотентна: повторный запуск ничего не меняет.

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

-- Новая таблица в public сразу получает права для anon и authenticated: снимаем (§32.3).
revoke all on public.user_plans from anon, authenticated;
grant select, insert, update, delete on public.user_plans to authenticated;

drop policy if exists "own plans" on public.user_plans;
create policy "own plans" on public.user_plans for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
