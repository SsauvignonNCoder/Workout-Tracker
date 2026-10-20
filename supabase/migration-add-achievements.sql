-- Постоянные достижения (1.1.3): profile.achievements — { id достижения: 'ГГГГ-ММ-ДД' },
-- дата открытия. Открытое достижение больше не снимается, даже если условие
-- перестало выполняться (src/gamification.js → achievementUnlockDates, пишет App).
--
-- Безопасно для работающей версии: колонка новая, старые клиенты её не передают
-- и upsert профиля её не трогает. Идемпотентна.

alter table public.profile add column if not exists achievements jsonb not null default '{}'::jsonb;
