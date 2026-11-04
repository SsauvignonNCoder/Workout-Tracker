// Токен сессии — HS256-JWT с role: authenticated и sub: id пользователя.
// Его выдают api/telegram-auth.js, api/browser-auth.js и api/session-refresh.js,
// фронтенд шлёт его с каждым запросом к базе (src/sessionToken.js), а политики
// RLS сверяют user_id строки с sub токена (supabase/migration-close-rls.sql).
//
// Подпись — тем же секретом проекта, что и токен ассистента (api/ai-assistant.js):
// шлюз Supabase проверяет её сам, отдельной таблицы сессий нет.
//
// Живёт 30 суток: Mini App и вкладка браузера бывают открыты долго, а продлить
// токен можно только пока он жив. Отозвать выданный токен нельзя, он просто истекает.
//
// Файл начинается с подчёркивания — Vercel не превращает такие файлы в эндпоинты.

import crypto from 'crypto';

export const SESSION_TTL_SEC = 30 * 24 * 3600;

const b64url = (input) => Buffer.from(input).toString('base64url');

// Идентификатор проекта — первая часть имени хоста Supabase (как у штатных токенов).
function projectRef() {
  try {
    return new URL(process.env.VITE_SUPABASE_URL).hostname.split('.')[0];
  } catch (e) {
    return undefined;
  }
}

// null — на сервере нет секрета: вход работает, но без токена.
export function mintSessionJwt(userId, nowMs = Date.now()) {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret || !userId) return null;
  const now = Math.floor(nowMs / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    iss: 'supabase', ref: projectRef(), role: 'authenticated', aud: 'authenticated',
    sub: userId, iat: now, exp: now + SESSION_TTL_SEC,
  };
  const data = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const sig = crypto.createHmac('sha256', secret).update(data).digest();
  return `${data}.${b64url(sig)}`;
}

// id пользователя из действующего токена сессии, иначе null. Роль проверяем явно:
// этим же секретом подписаны и другие токены проекта.
export function verifySessionJwt(token, nowMs = Date.now()) {
  const secret = process.env.SUPABASE_JWT_SECRET;
  const parts = String(token || '').split('.');
  if (!secret || parts.length !== 3) return null;
  let header;
  let payload;
  try {
    header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
  } catch (e) {
    return null;
  }
  if (!header || header.alg !== 'HS256' || !payload) return null;
  const expected = crypto.createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest();
  const got = Buffer.from(parts[2], 'base64url');
  if (got.length !== expected.length || !crypto.timingSafeEqual(got, expected)) return null;
  if (payload.role !== 'authenticated' || !payload.sub) return null;
  if (!(Number(payload.exp) > nowMs / 1000)) return null;
  return payload.sub;
}

// Принимает ли шлюз наши токены. Нужно на время выкладки: пока действуют старые
// открытые политики, приложение без токена работает, а с отвергнутым — нет. Поэтому
// при отказе шлюза токен не выдаём. Сеть подвела — не приговор, результат не запоминаем.
let gatewayAccepts;

async function tokenAccepted(token) {
  if (gatewayAccepts !== undefined) return gatewayAccepts;
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return true;
  try {
    const r = await fetch(`${url}/rest/v1/profile?select=user_id&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(3000),
    });
    if (r.status === 401) {
      console.error('session: шлюз Supabase отверг токен сессии — проверь SUPABASE_JWT_SECRET');
      gatewayAccepts = false;
      return false;
    }
    if (r.ok) gatewayAccepts = true;
  } catch (e) { /* сеть */ }
  return true;
}

export const resetGatewayCheckForTests = () => { gatewayAccepts = undefined; };

export async function issueSessionToken(userId) {
  const token = mintSessionJwt(userId);
  if (!token) return null;
  return (await tokenAccepted(token)) ? token : null;
}
