// Vercel Serverless Function: POST /api/rest-cancel
// Отменяет ранее запланированное бот-уведомление об окончании отдыха — когда
// пользователь пропустил отдых кнопкой-наушником, закрыл тренировку или отдых
// завершился при открытом приложении (сигнал уже подан на клиенте).
// Идемпотентно: если сообщение уже доставлено/удалено (404) — считаем успехом.

const QSTASH_TOKEN = process.env.QSTASH_TOKEN;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  if (!QSTASH_TOKEN) { res.status(500).json({ error: 'Сервер не настроен' }); return; }

  const { messageId } = req.body || {};
  if (!messageId) { res.status(400).json({ error: 'Нет messageId' }); return; }

  try {
    const r = await fetch(`https://qstash.upstash.io/v2/messages/${encodeURIComponent(messageId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${QSTASH_TOKEN}` },
    });
    res.status(200).json({ ok: true, status: r.status });
  } catch (e) {
    res.status(200).json({ ok: false, error: String(e.message || e) });
  }
}
