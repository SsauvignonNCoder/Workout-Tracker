-- Закрытие базы (HANDOFF §24.7): каждый читает и меняет только свои строки.
--
-- ПОРЯДОК КРИТИЧЕН. Выполнять только после того, как на проде работает версия,
-- которая шлёт токен сессии, и это подтверждено логами. Иначе прод сразу
-- перестанет видеть данные.
--
-- anon лишается прав совсем, а не просто остаётся без строк: приложение без токена
-- получит ошибку и покажет сбой загрузки. Пустой ответ оно приняло бы за отсутствие
-- данных. Серверные функции ходят с service_role, их это не затрагивает.
--
-- ai_readonly: у роли нет доступа к схеме auth, поэтому sub читаем напрямую.

drop policy if exists "allow all sessions" on public.sessions;
drop policy if exists "allow all measurements" on public.measurements;
drop policy if exists "allow all profile" on public.profile;

create policy "own sessions" on public.sessions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own measurements" on public.measurements for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own profile" on public.profile for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "assistant reads own sessions" on public.sessions for select to ai_readonly
  using (user_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid);
create policy "assistant reads own measurements" on public.measurements for select to ai_readonly
  using (user_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid);
create policy "assistant reads own profile" on public.profile for select to ai_readonly
  using (user_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid);

revoke all on public.sessions, public.measurements, public.profile,
  public.users, public.ai_daily_usage, public.ai_monthly_usage from anon;
revoke all on public.sessions, public.measurements, public.profile,
  public.users, public.ai_daily_usage, public.ai_monthly_usage from authenticated;
grant select, insert, update, delete on public.sessions, public.measurements, public.profile to authenticated;

-- ОТКАТ, если после применения что-то пошло не так:
--
--   drop policy if exists "own sessions" on public.sessions;
--   drop policy if exists "own measurements" on public.measurements;
--   drop policy if exists "own profile" on public.profile;
--   drop policy if exists "assistant reads own sessions" on public.sessions;
--   drop policy if exists "assistant reads own measurements" on public.measurements;
--   drop policy if exists "assistant reads own profile" on public.profile;
--   create policy "allow all sessions" on public.sessions for all using (true) with check (true);
--   create policy "allow all measurements" on public.measurements for all using (true) with check (true);
--   create policy "allow all profile" on public.profile for all using (true) with check (true);
--   grant select, insert, update, delete on public.sessions, public.measurements, public.profile to anon;
