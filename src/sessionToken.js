// Токен сессии на стороне приложения: хранит текущий токен и продлевает его.
// Выдаёт сервер (api/_session.js), клиент базы берёт его перед каждым запросом
// (src/supabaseClient.js). Живёт 30 суток; когда осталось меньше 20, очередной
// запрос в фоне меняет токен на новый, поэтому долго открытая вкладка не выпадает.

export const AUTH_SESSION_KEY = 'workout-tracker-auth';

const REFRESH_LEFT_MS = 20 * 24 * 3600 * 1000;
const RETRY_MS = 10 * 60 * 1000;
const EXPIRY_MARGIN_MS = 60 * 1000;

let current = null;
let lastTry = 0;

// Срок из токена (секунды) — только для решения «пора продлевать»; подпись
// проверяет сервер. Токен не читается — 0.
export function tokenExp(token) {
  try {
    const part = String(token).split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return Number(JSON.parse(atob(part)).exp) || 0;
  } catch (e) {
    return 0;
  }
}

export const tokenAlive = (token, nowMs = Date.now()) => tokenExp(token) * 1000 > nowMs + EXPIRY_MARGIN_MS;

export const needsRefresh = (token, nowMs = Date.now()) => tokenExp(token) * 1000 - nowMs < REFRESH_LEFT_MS;

export function setSessionToken(token) {
  current = token || null;
  lastTry = 0;
}

export const currentSessionToken = () => current;

export async function refreshSessionToken(nowMs = Date.now()) {
  const sent = current;
  if (!sent || !tokenAlive(sent, nowMs) || !needsRefresh(sent, nowMs) || nowMs - lastTry < RETRY_MS) return;
  lastTry = nowMs;
  try {
    const res = await fetch('/api/session-refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: sent }),
    });
    const data = await res.json();
    // Пока ждали ответ, человек мог выйти или войти заново.
    if (!res.ok || !data.ok || !data.token || current !== sent) return;
    current = data.token;
    const raw = sessionStorage.getItem(AUTH_SESSION_KEY);
    if (raw) sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify({ ...JSON.parse(raw), token: data.token }));
  } catch (e) {
    // Не вышло — старый токен ещё действует, попробуем позже.
  }
}

// Для клиента базы: продление идёт в фоне и запрос не задерживает.
export function getSessionToken() {
  refreshSessionToken();
  return current;
}
