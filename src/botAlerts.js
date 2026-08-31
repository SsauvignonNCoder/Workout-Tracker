// Отложенные уведомления от бота.
//
// Зачем сервер: когда экран телефона гаснет, JS в Mini App замораживается и
// клиентский таймер не может подать сигнал. Сообщение бота приходит в наушники
// даже при выключенном экране. Планировщик — Upstash QStash, вся кухня спрятана
// в `api/rest-schedule.js`; здесь только клиентская обёртка.
//
// Вид уведомления задаётся строкой `kind`, а не текстом: эндпоинт сам решает,
// что отправить. Так фронтенд не превращается в способ послать боту произвольный
// текст, и заодно тексты лежат в одном месте.
//
// Вне Telegram (нет initData) всё тихо пропускается — там работает только
// клиентский таймер, а слать некому.

function telegramInitData() {
  if (typeof window === 'undefined') return null;
  const tg = window.Telegram && window.Telegram.WebApp;
  return (tg && tg.initData) || null;
}

// Планирует уведомление. Возвращает messageId (по нему можно отменить) или null,
// если планировать некуда или не получилось — вызывающему это не мешает.
export async function scheduleBotAlert(kind, durationSec) {
  try {
    const initData = telegramInitData();
    if (!initData) return null;
    const r = await fetch('/api/rest-schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData, kind, duration: durationSec }),
    });
    if (!r.ok) return null;
    const data = await r.json().catch(() => null);
    return (data && data.messageId) || null;
  } catch (e) {
    return null; // сеть или бэкенд недоступны — не критично
  }
}

export async function cancelBotAlert(messageId) {
  if (!messageId) return;
  try {
    await fetch('/api/rest-cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId }),
    });
  } catch (e) { /* no-op */ }
}

// Напоминание про протеиновый коктейль через час после сохранённой тренировки.
// Отменять его не предусмотрено: пропущенное напоминание безобиднее лишнего кода.
export const PROTEIN_DELAY_SEC = 3600;

export function scheduleProteinReminder() {
  return scheduleBotAlert('protein', PROTEIN_DELAY_SEC);
}
