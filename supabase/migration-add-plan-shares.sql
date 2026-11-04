-- Планы для друзей (src/planExchange.js): снимок плана по короткому коду. Друг получает
-- копию, дальше планы друг на друга не влияют. Весов, рекордов и имени автора в снимке нет.
--
-- Таблица закрыта: читать чужие планы списком нельзя, только по коду через функцию.
-- Выполнить ПЕРЕД выкладкой кода. Безопасно для работающей версии: всё новое.
-- Идемпотентна: повторный запуск ничего не меняет.

create table if not exists public.plan_shares (
  code text primary key,
  plan jsonb not null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint plan_shares_size check (pg_column_size(plan) < 500000)
);

create index if not exists plan_shares_author_idx on public.plan_shares (created_by, created_at);

alter table public.plan_shares enable row level security;
revoke all on public.plan_shares from anon, authenticated;

-- Код: 8 знаков без похожих (0/O, 1/I/L). Тот же план того же автора — тот же код, чтобы
-- повторное нажатие не плодило строки. Не больше 30 новых кодов в сутки на человека.
create or replace function public.create_plan_share(p_plan jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  new_code text;
  bytes bytea;
  existing text;
  recent int;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if jsonb_typeof(p_plan) <> 'object' or jsonb_typeof(p_plan -> 'weeks') <> 'array' then
    raise exception 'bad_plan' using errcode = '22023';
  end if;
  select s.code into existing from public.plan_shares s where s.created_by = uid and s.plan = p_plan limit 1;
  if existing is not null then return existing; end if;
  select count(*) into recent from public.plan_shares s where s.created_by = uid and s.created_at > now() - interval '1 day';
  if recent >= 30 then raise exception 'share_limit' using errcode = '53400'; end if;
  loop
    bytes := uuid_send(gen_random_uuid());
    new_code := '';
    for i in 0..7 loop
      new_code := new_code || substr(alphabet, 1 + (get_byte(bytes, i) % length(alphabet)), 1);
    end loop;
    begin
      insert into public.plan_shares (code, plan, created_by) values (new_code, p_plan, uid);
      return new_code;
    exception when unique_violation then
      -- такой код уже есть: пробуем другой
    end;
  end loop;
end $$;

create or replace function public.get_plan_share(p_code text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  found jsonb;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select s.plan into found from public.plan_shares s where s.code = upper(trim(p_code));
  return found;
end $$;

revoke all on function public.create_plan_share(jsonb) from public, anon;
revoke all on function public.get_plan_share(text) from public, anon;
grant execute on function public.create_plan_share(jsonb) to authenticated;
grant execute on function public.get_plan_share(text) to authenticated;
