// Vercel Serverless Function: POST /api/session-refresh
// Продление токена сессии: действующий токен меняется на новый, с полным сроком.
// Body: { token }. Пользователя сверяем с базой: удалённый аккаунт не продлевается.

import { createClient } from '@supabase/supabase-js';
import { issueSessionToken, verifySessionJwt } from './_session.js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    res.status(500).json({ error: 'Сервер не настроен — проверь переменные окружения' });
    return;
  }

  const { token } = req.body || {};
  const userId = verifySessionJwt(token);
  if (!userId) {
    res.status(401).json({ ok: false, code: 'invalid_token' });
    return;
  }

  try {
    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const { data: user, error } = await supabaseAdmin.from('users').select('id').eq('id', userId).maybeSingle();
    if (error) throw error;
    if (!user) {
      res.status(401).json({ ok: false, code: 'invalid_token' });
      return;
    }
    res.status(200).json({ ok: true, token: await issueSessionToken(user.id) });
  } catch (e) {
    res.status(500).json({ ok: false, code: 'server_error' });
  }
}
