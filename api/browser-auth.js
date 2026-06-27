// Vercel Serverless Function: POST /api/browser-auth
// Регистрация и вход через придуманные имя + PIN (для входа не из Telegram).
// Body: { mode: 'register' | 'login', displayName, pin }

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function sha256Hex(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
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

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    res.status(500).json({ error: 'Сервер не настроен — проверь переменные окружения' });
    return;
  }

  const { mode, displayName, pin } = req.body || {};

  if (!displayName || typeof displayName !== 'string' || !displayName.trim()) {
    res.status(400).json({ error: 'Укажи имя' });
    return;
  }
  if (!pin || typeof pin !== 'string' || pin.length < 4) {
    res.status(400).json({ error: 'PIN должен быть не короче 4 символов' });
    return;
  }

  const name = displayName.trim();
  const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    if (mode === 'register') {
      const { data: existing, error: findErr } = await supabaseAdmin
        .from('users')
        .select('id')
        .ilike('display_name', name)
        .is('telegram_id', null)
        .maybeSingle();
      if (findErr) throw findErr;
      if (existing) {
        res.status(409).json({ error: 'Это имя уже занято — выбери другое или войди с существующим PIN' });
        return;
      }

      const pinHash = sha256Hex(pin);
      const { data: created, error: createErr } = await supabaseAdmin
        .from('users')
        .insert({ display_name: name, pin_hash: pinHash })
        .select('id, display_name')
        .single();
      if (createErr) throw createErr;

      res.status(200).json({ ok: true, userId: created.id, displayName: created.display_name });
      return;
    }

    if (mode === 'login') {
      const pinHash = sha256Hex(pin);
      const { data: user, error: findErr } = await supabaseAdmin
        .from('users')
        .select('id, display_name, pin_hash')
        .ilike('display_name', name)
        .is('telegram_id', null)
        .maybeSingle();
      if (findErr) throw findErr;

      if (!user || user.pin_hash !== pinHash) {
        res.status(401).json({ error: 'Неверное имя или PIN' });
        return;
      }

      res.status(200).json({ ok: true, userId: user.id, displayName: user.display_name });
      return;
    }

    res.status(400).json({ error: 'Неизвестный режим — ожидается register или login' });
  } catch (e) {
    res.status(500).json({ error: 'Ошибка сервера', details: String(e.message || e) });
  }
}
