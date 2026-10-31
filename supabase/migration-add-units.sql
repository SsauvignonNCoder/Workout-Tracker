-- Система единиц (src/units.js): profile.units — 'metric' или 'imperial'; null —
-- ещё не выбирали (метрика). Данные всегда в метрике, пересчитывается только показ.
--
-- Безопасно для работающей версии: колонка новая, старые клиенты её не передают.
-- Идемпотентна. Применить ДО выкладки: новый клиент пишет units в upsert профиля.

alter table public.profile add column if not exists units text;
