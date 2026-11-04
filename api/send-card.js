// Vercel Serverless Function: POST /api/send-card
// Запасной путь для картинки «Поделиться»: в части клиентов Telegram нет системного
// «Поделиться», поэтому картинку присылает бот — в чат самому пользователю.
// Body: { token, image (JPEG в base64), lang }. Получателя берём из токена сессии,
// а не из запроса: отправить картинку кому-то другому так нельзя.

import { createClient } from '@supabase/supabase-js';
import { verifySessionJwt } from './_session.js';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const MAX_BYTES = 3 * 1024 * 1024;
const LINK = 't.me/WorkoutTrackerSBot';
const CAPTION = {
  ru: `Дневник тренировок\n${LINK}`,
  en: `Workout Diary\n${LINK}`,
};

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

  const { token, image, lang } = req.body || {};
  const userId = verifySessionJwt(token);
  if (!userId) {
    res.status(401).json({ ok: false, code: 'invalid_token' });
    return;
  }

  const bytes = Buffer.from(String(image || ''), 'base64');
  const isJpeg = bytes.length > 2 && bytes[0] === 0xff && bytes[1] === 0xd8;
  if (!isJpeg || bytes.length > MAX_BYTES) {
    res.status(400).json({ ok: false, code: 'bad_image' });
    return;
  }

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const { data: user, error } = await admin.from('users').select('telegram_id').eq('id', userId).maybeSingle();
    if (error) throw error;
    if (!user || !user.telegram_id) {
      res.status(400).json({ ok: false, code: 'no_telegram' });
      return;
    }

    const form = new FormData();
    form.append('chat_id', String(user.telegram_id));
    form.append('caption', CAPTION[lang] || CAPTION.ru);
    form.append('photo', new Blob([bytes], { type: 'image/jpeg' }), 'workout.jpg');
    const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, { method: 'POST', body: form });
    if (!r.ok) {
      // Чаще всего пользователь ни разу не нажимал «Старт» в чате с ботом.
      res.status(502).json({ ok: false, code: 'telegram_failed' });
      return;
    }
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, code: 'server_error' });
  }
}
