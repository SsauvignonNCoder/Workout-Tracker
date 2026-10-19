-- Напоминание о пропущенной тренировке (1.1.2, api/missed-check.js, правила — api/_missed.js).
--   missed_alerts     — включено ли напоминание (переключатель в «Профиле»);
--   tz                — часовой пояс устройства (IANA, напр. 'Asia/Yekaterinburg'),
--                       пишет приложение; пусто — пояс по умолчанию на сервере;
--   active_workout_at — когда начата идущая сейчас тренировка (ставит приложение
--                       при старте пошаговой тренировки, снимает при закрытии);
--   last_missed_alert — дата последнего напоминания (не чаще раза в день).
--
-- Безопасно для работающей версии: колонки новые, старые клиенты их не передают
-- и upsert профиля их не трогает. Идемпотентна.

alter table public.profile
  add column if not exists missed_alerts boolean not null default false,
  add column if not exists tz text,
  add column if not exists active_workout_at timestamptz,
  add column if not exists last_missed_alert text;
