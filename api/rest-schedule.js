// Vercel Serverless Function: POST /api/rest-schedule
// Планирует отложенное сообщение бота «Отдых окончен» через точный планировщик
// (Upstash QStash). Вызывается из пошаговой тренировки в момент старта отдыха.
// Возвращает messageId, по которому клиент может отменить уведомление, если
// пропустил отдых раньше времени (кнопка-наушник).
//
// Зачем сервер: когда экран телефона гаснет, JS в Mini App замораживается и
// клиентский таймер не может подать сигнал. Внешнее сообщение бота приходит в
// наушники даже при выключенном экране (особенно если на чат с ботом назначен
// кастомный звук — см. инструкцию).
//
// Подпись initData проверяется тем же официальным алгоритмом, что и в
// api/telegram-auth.js — chat_id берём из проверенных данных, не из тела запроса.

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const QSTASH_TOKEN = process.env.QSTASH_TOKEN;
const ALERT_SECRET = process.env.REST_ALERT_SECRET;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Виды уведомлений. Клиент передаёт только `kind`, текст выбирается здесь —
// так эндпоинт не превращается в способ отправить боту произвольное сообщение,
// а тексты лежат в одном месте.
const ALERTS = {
  rest: {
    text: '⏱️ Отдых окончен — следующий подход',
    defaultDelay: 120,
    maxDelay: 900,
  },
  protein: {
    text: '🥤 Час после тренировки — время протеинового коктейля',
    defaultDelay: 3600,
    maxDelay: 7200,
  },
};

function checkTelegramAuth(initData) {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const pairs = [];
  for (const [key, value] of params.entries()) pairs.push(`${key}=${value}`);
  pairs.sort();
  const dataCheckString = pairs.join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  if (computedHash !== hash) return null;

  const authDate = Number(params.get('auth_date'));
  if (authDate && Date.now() / 1000 - authDate > 86400) return null;

  const userRaw = params.get('user');
  if (!userRaw) return null;
  try { return JSON.parse(userRaw); } catch (e) { return null; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  if (!BOT_TOKEN || !QSTASH_TOKEN || !ALERT_SECRET) {
    res.status(500).json({ error: 'Сервер не настроен (нужны TELEGRAM_BOT_TOKEN, QSTASH_TOKEN, REST_ALERT_SECRET)' });
    return;
  }

  const { initData, duration, kind, sessionId, date } = req.body || {};
  if (!initData || typeof initData !== 'string') {
    res.status(400).json({ error: 'Не передан initData' });
    return;
  }

  const tgUser = checkTelegramAuth(initData);
  if (!tgUser) { res.status(401).json({ error: 'Подпись initData не подтверждена' }); return; }

  const alert = ALERTS[kind] || ALERTS.rest;

  // Для напоминания после тренировки кладём в задание, ЧТО именно проверить перед
  // отправкой: чья тренировка, за какое число и какая. Сверка делается в момент
  // отправки (api/rest-fire.js) — так напоминание не придёт по удалённой
  // тренировке, даже если удалили с другого устройства.
  let check = null;
  if (kind === 'protein' && sessionId && date) {
    try {
      const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
      const { data: user } = await admin.from('users').select('id').eq('telegram_id', tgUser.id).maybeSingle();
      if (user) check = { user_id: user.id, session_id: String(sessionId), date: String(date) };
    } catch (e) {
      // Не нашли пользователя или база недоступна — напоминание всё равно ставим,
      // просто без сверки. Потерять напоминание хуже, чем прислать лишнее.
      console.error('rest-schedule: не удалось собрать данные для сверки', e);
    }
  }

  const chatId = tgUser.id;
  // Потолок задержки свой у каждого вида: таймеру отдыха больше пятнадцати минут
  // не нужно, а напоминанию после тренировки нужен час. Общий потолок в 900 секунд
  // раньше молча обрезал бы такое напоминание до пятнадцати минут.
  const delaySec = Math.min(alert.maxDelay, Math.max(5, parseInt(duration, 10) || alert.defaultDelay));

  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0];
  const host = req.headers.host;
  const fireUrl = `${proto}://${host}/api/rest-fire`;

  try {
    const r = await fetch(`https://qstash.upstash.io/v2/publish/${fireUrl}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${QSTASH_TOKEN}`,
        'Content-Type': 'application/json',
        'Upstash-Delay': `${delaySec}s`,
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: alert.text,
        secret: ALERT_SECRET,
        ...(check ? { check } : {}),
      }),
    });
    if (!r.ok) {
      const details = await r.text().catch(() => '');
      res.status(502).json({ error: 'Планировщик недоступен', details });
      return;
    }
    const data = await r.json().catch(() => ({}));
    res.status(200).json({ ok: true, messageId: data.messageId || null });
  } catch (e) {
    res.status(502).json({ error: 'Не удалось запланировать уведомление', details: String(e.message || e) });
  }
}
