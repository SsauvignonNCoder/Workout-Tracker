-- Напоминание о несохранённой тренировке (api/missed-check.js → decideUnsaved).
--   unsaved_alerts      — включено ли (переключатель в «Профиле»), по умолчанию да;
--   last_unsaved_alert  — дата ('ГГГГ-ММ-ДД' по местному времени) последнего
--                         напоминания: не чаще раза в день;
--   workout_touched_at  — последнее действие в пошаговой тренировке, когда в
--                         черновике уже есть записанные подходы (вес или повторы);
--                         от неё считается «час без действий». Просто открыл
--                         тренировку и вышел — метки нет, напоминания нет.
-- Метка active_workout_at (уже есть) теперь — время последнего действия вообще;
-- обе приложение обновляет не чаще раза в 5 минут и снимает при закрытии.
--
-- Безопасно для работающей версии: колонки новые, старые клиенты их не передают.
-- Идемпотентна. Применить ДО выкладки: новый клиент пишет unsaved_alerts в
-- upsert профиля, а сервер выбирает по ним.

alter table public.profile
  add column if not exists unsaved_alerts boolean not null default true,
  add column if not exists last_unsaved_alert text,
  add column if not exists workout_touched_at timestamptz;

-- Метки active_workout_at и workout_touched_at ставит приложение, но время —
-- по часам СЕРВЕРА: сервер сравнивает их со своим «сейчас» и с created_at
-- тренировок, а часы телефона бывают сбиты (ручное время, чужой пояс). Снятие
-- метки (null) триггер не трогает.
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
