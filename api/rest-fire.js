// Vercel Serverless Function: POST /api/rest-fire
// Вызывается планировщиком QStash по истечении времени отдыха. Отправляет
// сообщение боту в личный чат пользователя. Само сообщение — обычное; «голос в
// наушники» обеспечивается кастомным звуком уведомления, назначенным на чат с
// ботом в Telegram (разовая настройка на стороне пользователя).
//
// Защита: тело запроса, которое QStash доставляет дословно, содержит общий
// секрет REST_ALERT_SECRET — его знает только api/rest-schedule.js. Прямой POST
// без секрета отклоняется.

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ALERT_SECRET = process.env.REST_ALERT_SECRET;

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  if (!BOT_TOKEN || !ALERT_SECRET) { res.status(500).json({ error: 'Сервер не настроен' }); return; }

  const { chat_id: chatId, text, secret } = req.body || {};
  if (secret !== ALERT_SECRET) { res.status(401).json({ error: 'Неверный секрет' }); return; }
  if (!chatId) { res.status(400).json({ error: 'Нет chat_id' }); return; }

  try {
    const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: text || 'Отдых окончен', disable_notification: false }),
    });
    const data = await r.json().catch(() => ({}));
    // Всегда 200, чтобы QStash не повторял доставку и не задваивал сообщение.
    res.status(200).json({ ok: r.ok, telegram: data });
  } catch (e) {
    res.status(200).json({ ok: false, error: String(e.message || e) });
  }
}
