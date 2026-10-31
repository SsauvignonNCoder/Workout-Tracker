// Vercel Serverless Function: /api/missed-check
// Напоминания в Telegram: о пропущенной тренировке и о несохранённой.
//
// КТО ВЫЗЫВАЕТ.
//   • QStash по расписанию — каждые 15 минут (POST, в теле секрет
//     REST_ALERT_SECRET, тот же, что у напоминаний таймера отдыха). Пропуск
//     проверяется с 21:30 по местному времени человека — ровно в запуск :30;
//     следующие запуски — запас на случай сбоя. Больше одного сообщения каждого
//     вида в день не уходит. 15 минут — ради несохранённой тренировки: «час без
//     действий» должен ловиться через час, а не через два.
//   • Vercel Cron раз в день (GET, vercel.json). Бесплатный тариф Vercel точен
//     только до часа, поэтому сам он ничего не проверяет «вовремя» — он лишь
//     заново регистрирует расписание в QStash (идемпотентно, по постоянному id),
//     чтобы оно не потерялось. Если в Vercel задан CRON_SECRET, GET без него
//     отклоняется.
//
// КОМУ. Только тем, у кого в профиле включено «Напоминать о пропущенной
// тренировке» (profile.missed_alerts) и кто входит через Telegram.
//
// КОГДА МОЛЧИМ (правила — api/_missed.js, там же тесты): день отдыха по плану
// (дни тренировок — trainingWeekdays плана из профиля, src/plans.js); раньше
// 21:30 по поясу из профиля; сегодня уже напоминали; идёт тренировка (метку
// active_workout_at ставит приложение при старте и снимает при закрытии); за
// сегодня есть тренировка по плану (с номером дня). Три пропущенных дня
// тренировок подряд — второй текст.
//
// НЕСОХРАНЁННАЯ ТРЕНИРОВКА (правила — decideUnsaved в api/_missed.js): метка
// workout_touched_at — последнее действие в пошаговой тренировке, когда уже есть
// записанные подходы (просто открыл и вышел — метки нет); час без действий, метка
// не снята и после неё ничего не сохранено — пишем. Кому — profile.unsaved_alerts
// (по умолчанию включено) и вход через Telegram.

import { createClient } from '@supabase/supabase-js';
import {
  decideMissed, decideUnsaved, localParts, trainingDaysBack, CHECK_FROM_MINUTES, MSG_MISSED_3, UNSAVED_IDLE_MS, UNSAVED_STALE_MS, msgIn,
} from './_missed.js';
import { trainingWeekdaysOf } from '../src/plans.js';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ALERT_SECRET = process.env.REST_ALERT_SECRET;
const QSTASH_TOKEN = process.env.QSTASH_TOKEN;
const CRON_SECRET = process.env.CRON_SECRET;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const SCHEDULE_ID = 'wt-missed-check';
const SCHEDULE_CRON = '*/15 * * * *';

// Зарегистрировать (или обновить) расписание QStash. Постоянный id — повторный
// вызов перезаписывает то же расписание, а не плодит новые.
async function ensureSchedule(req) {
  if (!QSTASH_TOKEN || !ALERT_SECRET) return { ok: false, error: 'нет QSTASH_TOKEN / REST_ALERT_SECRET' };
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL || req.headers.host;
  const target = `https://${host}/api/missed-check`;
  const r = await fetch(`https://qstash.upstash.io/v2/schedules/${target}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${QSTASH_TOKEN}`,
      'Content-Type': 'application/json',
      'Upstash-Cron': SCHEDULE_CRON,
      'Upstash-Schedule-Id': SCHEDULE_ID,
    },
    body: JSON.stringify({ secret: ALERT_SECRET }),
  });
  const details = await r.text().catch(() => '');
  return r.ok ? { ok: true, target } : { ok: false, status: r.status, details };
}

// Сбой сети при отправке одному не должен обрывать проверку остальных.
async function sendTelegram(chatId, text) {
  try {
    const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    return r.ok;
  } catch (e) {
    return false;
  }
}

// Отметку «сегодня уже напоминали» ставим ДО отправки и условно — только если её
// ещё нет: из двух наложившихся запусков (QStash, Vercel Cron, ручной GET)
// отправит один. Пустой ответ — отметку уже поставил другой запуск.
async function claimAlert(admin, userId, column, date) {
  const { data, error } = await admin.from('profile')
    .update({ [column]: date })
    .eq('user_id', userId)
    .or(`${column}.is.null,${column}.neq.${date}`)
    .select('user_id');
  return !error && Array.isArray(data) && data.length > 0;
}

async function runCheck(now) {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data: profiles, error } = await admin
    .from('profile')
    .select('user_id, tz, last_missed_alert, active_workout_at, plan_id, lang, last_unsaved_alert, workout_touched_at')
    .eq('missed_alerts', true);
  if (error) throw error;

  const results = [];
  for (const p of profiles || []) {
    // До 21:30 по местному времени в базу за тренировками не ходим вовсе —
    // так 21 из 24 ежечасных запусков обходятся одним запросом.
    const local = localParts(now, p.tz);
    const weekdays = trainingWeekdaysOf(p.plan_id);
    if (!weekdays.includes(local.weekday) || local.minutes < CHECK_FROM_MINUTES || p.last_missed_alert === local.date) {
      results.push({ user: p.user_id.slice(0, 8), skipped: 'не время' });
      continue;
    }

    const { data: user } = await admin.from('users').select('telegram_id').eq('id', p.user_id).maybeSingle();
    if (!user || !user.telegram_id) { results.push({ user: p.user_id.slice(0, 8), skipped: 'нет Telegram' }); continue; }

    const from = trainingDaysBack(local.date, 4, weekdays).pop();
    const [{ data: recent }, { data: first }] = await Promise.all([
      admin.from('sessions').select('date').eq('user_id', p.user_id).not('program_day', 'is', null).gte('date', from),
      admin.from('sessions').select('date').eq('user_id', p.user_id).not('program_day', 'is', null)
        .order('date', { ascending: true }).limit(1),
    ]);
    const decision = decideMissed({
      now,
      profile: p,
      weekdays,
      planDates: new Set((recent || []).map((s) => s.date)),
      firstPlanDate: first && first[0] ? first[0].date : null,
    });
    if (!decision.send) { results.push({ user: p.user_id.slice(0, 8), skipped: decision.reason }); continue; }

    // Отметка — до отправки и при неудачной отправке тоже: лучше пропустить одно
    // напоминание, чем слать его каждые 15 минут до полуночи.
    if (!(await claimAlert(admin, p.user_id, 'last_missed_alert', decision.date))) {
      results.push({ user: p.user_id.slice(0, 8), skipped: 'отправил параллельный запуск' });
      continue;
    }
    const sent = await sendTelegram(user.telegram_id, msgIn(decision.text, p.lang));
    results.push({ user: p.user_id.slice(0, 8), sent, harsh: decision.text === MSG_MISSED_3 });
  }

  // Несохранённая тренировка: только свежие метки (час–12 часов без действий).
  const nowMs = now.getTime();
  const { data: idle, error: idleErr } = await admin
    .from('profile')
    .select('user_id, tz, workout_touched_at, last_unsaved_alert, lang')
    .eq('unsaved_alerts', true)
    .lte('workout_touched_at', new Date(nowMs - UNSAVED_IDLE_MS).toISOString())
    .gte('workout_touched_at', new Date(nowMs - UNSAVED_STALE_MS).toISOString());
  if (idleErr) throw idleErr;
  for (const p of idle || []) {
    const pre = decideUnsaved({ now, profile: p });
    if (!pre.send) { results.push({ user: p.user_id.slice(0, 8), unsaved: pre.reason }); continue; }
    const { data: user } = await admin.from('users').select('telegram_id').eq('id', p.user_id).maybeSingle();
    if (!user || !user.telegram_id) { results.push({ user: p.user_id.slice(0, 8), unsaved: 'нет Telegram' }); continue; }
    const { data: saved, error: savedErr } = await admin.from('sessions').select('id').eq('user_id', p.user_id)
      .gte('created_at', p.workout_touched_at).limit(1);
    // Не смогли проверить, сохранена ли тренировка, — молчим: ложное «не сохранил»
    // хуже пропущенного напоминания (следующий запуск через 15 минут).
    if (savedErr) { results.push({ user: p.user_id.slice(0, 8), unsaved: 'не проверить сохранение' }); continue; }
    const decision = decideUnsaved({ now, profile: p, savedAfter: (saved || []).length > 0 });
    if (!decision.send) { results.push({ user: p.user_id.slice(0, 8), unsaved: decision.reason }); continue; }
    if (!(await claimAlert(admin, p.user_id, 'last_unsaved_alert', decision.date))) {
      results.push({ user: p.user_id.slice(0, 8), unsaved: 'отправил параллельный запуск' });
      continue;
    }
    const sent = await sendTelegram(user.telegram_id, msgIn(decision.text, p.lang));
    // Об этой брошенной тренировке напомнили — метку снимаем (если с тех пор не
    // было действий): иначе в полночь, с новой датой, пришло бы второе такое же.
    await admin.from('profile').update({ workout_touched_at: null })
      .eq('user_id', p.user_id).eq('workout_touched_at', p.workout_touched_at);
    results.push({ user: p.user_id.slice(0, 8), unsavedSent: sent });
  }
  return results;
}

export default async function handler(req, res) {
  if (!BOT_TOKEN || !SUPABASE_URL || !SERVICE_ROLE_KEY) {
    res.status(500).json({ error: 'Сервер не настроен' });
    return;
  }

  let schedule = null;
  if (req.method === 'GET') {
    // Vercel Cron: обновить расписание QStash и заодно проверить (правила сами
    // не дадут написать раньше 21:30 или второй раз за день).
    if (CRON_SECRET && req.headers.authorization !== `Bearer ${CRON_SECRET}`) {
      res.status(401).json({ error: 'Нет доступа' });
      return;
    }
    schedule = await ensureSchedule(req).catch((e) => ({ ok: false, error: String(e.message || e) }));
  } else if (req.method === 'POST') {
    const { secret } = req.body || {};
    if (!ALERT_SECRET || secret !== ALERT_SECRET) {
      res.status(401).json({ error: 'Неверный секрет' });
      return;
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const results = await runCheck(new Date());
    // Всегда 200 — иначе QStash повторит доставку.
    res.status(200).json({ ok: true, schedule, results });
  } catch (e) {
    res.status(200).json({ ok: false, schedule, error: String(e.message || e) });
  }
}
