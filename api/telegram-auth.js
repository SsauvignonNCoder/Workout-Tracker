// Vercel Serverless Function: POST /api/telegram-auth
// Проверяет подпись initData, которую присылает Telegram Mini App,
// и возвращает данные пользователя, если подпись подлинная.
//
// Алгоритм проверки — официальный, описан в документации Telegram:
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app

import crypto from 'crypto';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

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

  // Опционально: проверка свежести (initData не старше 24 часов)
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

  if (!BOT_TOKEN) {
    res.status(500).json({ error: 'TELEGRAM_BOT_TOKEN не настроен на сервере' });
    return;
  }

  const { initData } = req.body || {};
  if (!initData || typeof initData !== 'string') {
    res.status(400).json({ error: 'Не передан initData' });
    return;
  }

  const user = checkTelegramAuth(initData);
  if (!user) {
    res.status(401).json({ error: 'Подпись initData не подтверждена' });
    return;
  }

  res.status(200).json({
    ok: true,
    user: {
      id: user.id,
      firstName: user.first_name || '',
      lastName: user.last_name || '',
      username: user.username || '',
    },
  });
}
