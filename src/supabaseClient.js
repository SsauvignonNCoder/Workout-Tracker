import { createClient } from '@supabase/supabase-js';
import { getSessionToken } from './sessionToken.js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // eslint-disable-next-line no-console
  console.error(
    'Не заданы VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Проверь .env (локально) или переменные окружения в Vercel.'
  );
}

// Токен сессии решает, чьи строки видны (RLS). Без него запрос уходит анонимно.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  accessToken: async () => getSessionToken(),
});
