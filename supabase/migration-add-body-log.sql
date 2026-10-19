-- История параметров тела (1.1.2): profile.body_log — массив замеров
-- { id, date, height?, waist?, hips?, chest?, shoulders?, bodyFat? } (см. src/bodyLog.js).
-- Колонки height … body_fat остаются: в них последнее значение каждого параметра.
--
-- Безопасно для работающей версии: колонка новая, со значением по умолчанию, а
-- старые клиенты её не передают — upsert профиля её не трогает.
-- Идемпотентна: повторный запуск ничего не меняет.

alter table public.profile add column if not exists body_log jsonb not null default '[]'::jsonb;

-- Уже заполненные параметры становятся первой записью истории — на дату
-- последнего обновления профиля (или сегодня, если её нет).
update public.profile
set body_log = jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
  'id', 'legacy-body',
  'date', coalesce(nullif(substring(updated_at from 1 for 10), ''), to_char(now(), 'YYYY-MM-DD')),
  'height', height, 'waist', waist, 'hips', hips,
  'chest', chest, 'shoulders', shoulders, 'bodyFat', body_fat
)))
where body_log = '[]'::jsonb
  and (height is not null or waist is not null or hips is not null
       or chest is not null or shoulders is not null or body_fat is not null);
