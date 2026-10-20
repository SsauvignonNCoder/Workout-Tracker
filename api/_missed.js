// Правила напоминания о пропущенной тренировке — чистые функции без базы и сети,
// их прогоняют тесты. Сам обход пользователей и отправка — api/missed-check.js.
//
// Файл начинается с подчёркивания — Vercel не превращает его в эндпоинт.
//
// Дни тренировок — из плана (src/plans.js → trainingWeekdays): день отдыха по
// плану не пропуск, и в «три подряд» он не входит.

import { trainingWeekdaysOf, DEFAULT_TRAINING_WEEKDAYS } from '../src/plans.js';

export const MSG_MISSED = 'Кажется вы пропустили тренировку!';
// Текст Никиты — для третьего пропуска подряд и дальше.
export const MSG_MISSED_3 = 'Вы ничтожество! Ваш результат канул в лету! Вы остались слабым и толстым!';

// Часовой пояс по умолчанию — пока приложение не записало пояс устройства в профиль.
export const DEFAULT_TZ = 'Asia/Yekaterinburg';
// Не раньше 21:30 по местному времени.
export const CHECK_FROM_MINUTES = 21 * 60 + 30;
// Тренировка считается идущей, если её начали не раньше чем 4 часа назад и не
// закрыли: дольше тренировки не бывает, а брошенная метка так сама протухнет.
export const ACTIVE_WINDOW_MS = 4 * 60 * 60 * 1000;
// Сколько пропусков подряд — уже «ничтожество».
export const HARSH_STREAK = 3;

const WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

// Местные дата, день недели (0 — воскресенье) и минуты от полуночи в поясе tz.
export function localParts(now, tz) {
  let zone = tz || DEFAULT_TZ;
  try { new Intl.DateTimeFormat('en-US', { timeZone: zone }); } catch (e) { zone = DEFAULT_TZ; }
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23',
  }).formatToParts(now).map((p) => [p.type, p.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: WEEKDAYS[parts.weekday],
    minutes: (parseInt(parts.hour, 10) % 24) * 60 + parseInt(parts.minute, 10),
  };
}

function shiftISO(iso, days) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// n тренировочных дней (по дням плана, по умолчанию ПН–СБ) назад, начиная с
// date включительно.
export function trainingDaysBack(date, n, weekdays = DEFAULT_TRAINING_WEEKDAYS) {
  const out = [];
  let cur = date;
  for (let guard = 0; out.length < n && guard < 400; guard += 1) {
    if (weekdays.includes(new Date(`${cur}T12:00:00Z`).getUTCDay())) out.push(cur);
    cur = shiftISO(cur, -1);
  }
  return out;
}

// Решение по одному пользователю.
//   profile   — { tz, last_missed_alert, active_workout_at, plan_id }
//   planDates — Set дат, в которые есть тренировка по плану (с номером дня);
//   firstPlanDate — дата самой первой такой тренировки (до неё пропусков не бывает).
// Возвращает { send: true, text, date } или { send: false, reason }.
export function decideMissed({ now, profile, planDates, firstPlanDate, weekdays }) {
  const p = profile || {};
  const days = weekdays || trainingWeekdaysOf(p.plan_id);
  const { date, weekday, minutes } = localParts(now, p.tz);
  if (!days.includes(weekday)) return { send: false, reason: 'день отдыха по плану' };
  if (minutes < CHECK_FROM_MINUTES) return { send: false, reason: 'раньше 21:30' };
  if (p.last_missed_alert === date) return { send: false, reason: 'сегодня уже напоминали' };
  const started = p.active_workout_at ? Date.parse(p.active_workout_at) : NaN;
  if (isFinite(started) && now.getTime() - started >= 0 && now.getTime() - started < ACTIVE_WINDOW_MS) {
    return { send: false, reason: 'идёт тренировка' };
  }
  if (planDates.has(date)) return { send: false, reason: 'тренировка сегодня есть' };
  if (!firstPlanDate || firstPlanDate > date) return { send: false, reason: 'ещё не тренировался по плану' };

  const lastDays = trainingDaysBack(date, HARSH_STREAK, days);
  const harsh = lastDays.every((d) => d >= firstPlanDate && !planDates.has(d));
  return { send: true, text: harsh ? MSG_MISSED_3 : MSG_MISSED, date };
}
