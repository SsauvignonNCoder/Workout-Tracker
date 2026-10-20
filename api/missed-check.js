// Vercel Serverless Function: /api/missed-check
// Напоминание в Telegram о пропущенной тренировке.
//
// КТО ВЫЗЫВАЕТ.
//   • QStash по расписанию — каждый час в :30 (POST, в теле секрет
//     REST_ALERT_SECRET, тот же, что у напоминаний таймера отдыха). Проверка в
//     21:30 по местному времени человека — ровно в этот запуск; запуски в 22:30
//     и 23:30 — запас на случай сбоя. Больше одного сообщения в день не уходит.
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

import { createClient } from '@supabase/supabase-js';
import { decideMissed, localParts, trainingDaysBack, CHECK_FROM_MINUTES, MSG_MISSED_3 } from './_missed.js';
import { trainingWeekdaysOf } from '../src/plans.js';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ALERT_SECRET = process.env.REST_ALERT_SECRET;
const QSTASH_TOKEN = process.env.QSTASH_TOKEN;
const CRON_SECRET = process.env.CRON_SECRET;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const SCHEDULE_ID = 'wt-missed-check';
const SCHEDULE_CRON = '30 * * * *';

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

async function sendTelegram(chatId, text) {
  const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  return r.ok;
}

async function runCheck(now) {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data: profiles, error } = await admin
    .from('profile')
    .select('user_id, tz, last_missed_alert, active_workout_at, plan_id')
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

    const sent = await sendTelegram(user.telegram_id, decision.text);
    // Отметку ставим и при неудачной отправке: лучше пропустить одно
    // напоминание, чем слать его каждый час до полуночи.
    await admin.from('profile').update({ last_missed_alert: decision.date }).eq('user_id', p.user_id);
    results.push({ user: p.user_id.slice(0, 8), sent, harsh: decision.text === MSG_MISSED_3 });
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
