// Vercel Serverless Function: POST /api/telegram-auth
// Проверяет подпись initData от Telegram Mini App, и если она подлинная —
// находит существующего пользователя по telegram_id или создаёт нового.
// Возвращает userId, который фронтенд использует для всех дальнейших
// запросов к Supabase (sessions/measurements/profile).
//
// Алгоритм проверки подписи — официальный, см. документацию Telegram:
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function checkTelegramAuth(initData) {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;

  params.delete('hash');

  const pairs = [];
  for (const [key, value] of params.entries()) {
    pairs.push(`${key}=${value}`);
  }
  pairs.sort();
  const dataCheckString = pairs.join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (computedHash !== hash) return null;

  // Проверка свежести (initData не старше 24 часов)
  const authDate = Number(params.get('auth_date'));
  if (authDate && Date.now() / 1000 - authDate > 86400) return null;

  const userRaw = params.get('user');
  if (!userRaw) return null;

  try {
    return JSON.parse(userRaw);
  } catch (e) {
    return null;
  }
}

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

  if (!BOT_TOKEN || !SUPABASE_URL || !SERVICE_ROLE_KEY) {
    res.status(500).json({ error: 'Сервер не настроен — проверь переменные окружения' });
    return;
  }

  const { initData } = req.body || {};
  if (!initData || typeof initData !== 'string') {
    res.status(400).json({ error: 'Не передан initData' });
    return;
  }

  const tgUser = checkTelegramAuth(initData);
  if (!tgUser) {
    res.status(401).json({ error: 'Подпись initData не подтверждена' });
    return;
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const telegramId = tgUser.id;
  const displayName = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ') || tgUser.username || 'Пользователь';

  try {
    const { data: existing, error: findErr } = await supabaseAdmin
      .from('users')
      .select('id, display_name')
      .eq('telegram_id', telegramId)
      .maybeSingle();

    if (findErr) throw findErr;

    if (existing) {
      res.status(200).json({ ok: true, userId: existing.id, displayName: existing.display_name });
      return;
    }

    const { data: created, error: createErr } = await supabaseAdmin
      .from('users')
      .insert({ display_name: displayName, telegram_id: telegramId })
      .select('id, display_name')
      .single();

    if (createErr) throw createErr;

    res.status(200).json({ ok: true, userId: created.id, displayName: created.display_name, isNew: true });
  } catch (e) {
    res.status(500).json({ error: 'Не удалось создать/найти пользователя', details: String(e.message || e) });
  }
}
