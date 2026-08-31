// Проверка подписи initData от Telegram Mini App.
//
// Алгоритм официальный:
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
//
// Файл начинается с подчёркивания — Vercel не превращает такие файлы в эндпоинты,
// это просто общий модуль для функций из этой папки.
//
// ИСТОРИЧЕСКОЕ: ровно та же проверка своими копиями лежит в `telegram-auth.js` и
// `rest-schedule.js`. Их сюда не переводил намеренно — это работающий код
// авторизации, трогать его заодно с новой задачей не стоит. Но третью копию
// плодить тем более незачем, поэтому новый код берёт проверку отсюда. Когда
// понадобится править те два файла — заодно перевести и их.

import crypto from 'crypto';

export function checkTelegramAuth(initData, botToken) {
  if (!initData || typeof initData !== 'string' || !botToken) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const pairs = [];
  for (const [key, value] of params.entries()) pairs.push(`${key}=${value}`);
  pairs.sort();
  const dataCheckString = pairs.join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  // Сравнение постоянного времени. Длины проверяем заранее: timingSafeEqual
  // бросает на буферах разной длины.
  const a = Buffer.from(computedHash, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length || a.length === 0 || !crypto.timingSafeEqual(a, b)) return null;

  // Свежесть: initData не старше суток. Отсутствие auth_date считаем подозрительным
  // и отклоняем — в подлинных данных это поле есть всегда.
  const authDate = Number(params.get('auth_date'));
  if (!authDate || Date.now() / 1000 - authDate > 86400) return null;

  const userRaw = params.get('user');
  if (!userRaw) return null;
  try {
    return JSON.parse(userRaw);
  } catch (e) {
    return null;
  }
}
