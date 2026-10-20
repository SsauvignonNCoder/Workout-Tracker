// Vercel Serverless Function: POST /api/rest-fire
// Вызывается планировщиком QStash по истечении задержки. Отправляет сообщение
// боту в личный чат пользователя. Само сообщение — обычное; «голос в наушники»
// обеспечивается кастомным звуком уведомления, назначенным на чат с ботом в
// Telegram (разовая настройка на стороне пользователя).
//
// Защита: тело запроса, которое QStash доставляет дословно, содержит общий
// секрет REST_ALERT_SECRET — его знает только api/rest-schedule.js. Прямой POST
// без секрета отклоняется.
//
// СВЕРКА ПЕРЕД ОТПРАВКОЙ (поле `check`, есть только у напоминания после
// тренировки). Задание ставится за час до отправки, и за этот час всё могло
// измениться. Поэтому перед самой отправкой смотрим в базу:
//   1. Тренировки с этим id больше нет → молчим. Так напоминание не приходит по
//      удалённой тренировке, причём независимо от того, с какого устройства её
//      удалили — решение принимается на сервере по фактическому состоянию базы.
//   2. За тот же день есть тренировка, сохранённая ПОЗЖЕ нашей → молчим. У неё
//      своё напоминание, которое придёт последним. Так при двух тренировках за
//      день подряд приходит одно напоминание — после последней.
//   3. В «Профиле» выключено «Напоминать о протеине» (profile.protein_alerts) →
//      молчим: могли выключить уже после тренировки, когда задание стояло.
// Сравниваем по created_at конкретных строк, а не по времени планирования:
// расхождение часов между базой и функцией на это не влияет.
//
// У таймера отдыха поля `check` нет — он отправляется как раньше, без запросов
// к базе.

import { createClient } from '@supabase/supabase-js';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ALERT_SECRET = process.env.REST_ALERT_SECRET;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Чистое решение по уже полученным строкам: причина промолчать либо null.
// Вынесено отдельно, чтобы прогонять тестами без обращения к базе.
export function skipReason(rows, sessionId) {
  const list = rows || [];
  const mine = list.find((r) => r.id === sessionId);
  if (!mine) return 'тренировка удалена';
  const hasNewer = list.some((r) => r.id !== sessionId
    && r.created_at && mine.created_at && r.created_at > mine.created_at);
  if (hasNewer) return 'за этот день есть более поздняя тренировка';
  return null;
}

// Возвращает причину, по которой отправлять НЕ надо, либо null.
async function reasonToSkip(check) {
  if (!check || !check.user_id || !check.session_id || !check.date) return null;
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    // Проверить нечем. Лучше прислать лишнее напоминание, чем потерять нужное.
    console.error('rest-fire: сверка пропущена, не настроен доступ к базе');
    return null;
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  // 3. Напоминание выключили в «Профиле» уже после тренировки → молчим.
  const { data: prof } = await admin.from('profile').select('protein_alerts').eq('user_id', check.user_id).maybeSingle();
  if (prof && prof.protein_alerts === false) return 'напоминание о протеине выключено';

  const { data, error } = await admin
    .from('sessions')
    .select('id, created_at')
    .eq('user_id', check.user_id)
    .eq('date', check.date);

  if (error) {
    console.error('rest-fire: сверка не удалась, отправляю как есть', error);
    return null;
  }

  return skipReason(data, check.session_id);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  if (!BOT_TOKEN || !ALERT_SECRET) { res.status(500).json({ error: 'Сервер не настроен' }); return; }

  const { chat_id: chatId, text, secret, check } = req.body || {};
  if (secret !== ALERT_SECRET) { res.status(401).json({ error: 'Неверный секрет' }); return; }
  if (!chatId) { res.status(400).json({ error: 'Нет chat_id' }); return; }

  try {
    const skip = await reasonToSkip(check);
    if (skip) {
      // Всегда 200: для QStash задание выполнено, повторять не нужно.
      res.status(200).json({ ok: true, skipped: skip });
      return;
    }

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
