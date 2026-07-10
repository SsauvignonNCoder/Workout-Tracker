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

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const QSTASH_TOKEN = process.env.QSTASH_TOKEN;
const ALERT_SECRET = process.env.REST_ALERT_SECRET;

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

  const { initData, duration } = req.body || {};
  if (!initData || typeof initData !== 'string') {
    res.status(400).json({ error: 'Не передан initData' });
    return;
  }

  const tgUser = checkTelegramAuth(initData);
  if (!tgUser) { res.status(401).json({ error: 'Подпись initData не подтверждена' }); return; }

  const chatId = tgUser.id;
  const delaySec = Math.min(900, Math.max(5, parseInt(duration, 10) || 120));

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
        text: '⏱️ Отдых окончен — следующий подход',
        secret: ALERT_SECRET,
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
