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
// Английский — для profile.lang = 'en' (src/i18n.js).
export const MSG_EN = {
  [MSG_MISSED]: 'Looks like you missed a workout!',
  [MSG_MISSED_3]: 'You are nothing! Your results are gone! You stayed weak and fat!',
};
export const msgIn = (text, lang) => (lang === 'en' && MSG_EN[text] ? MSG_EN[text] : text);

// Часовой пояс по умолчанию — пока приложение не записало пояс устройства в профиль.
export const DEFAULT_TZ = 'Asia/Yekaterinburg';
// Не раньше 21:30 по местному времени.
export const CHECK_FROM_MINUTES = 21 * 60 + 30;
// Тренировка считается идущей, если её начали не раньше чем 4 часа назад и не
// закрыли: дольше тренировки не бывает, а брошенная метка так сама протухнет.
export const ACTIVE_WINDOW_MS = 4 * 60 * 60 * 1000;
// Сколько пропусков подряд — уже «ничтожество».
export const HARSH_STREAK = 3;

// ---- Несохранённая тренировка ----
// workout_touched_at — время последнего действия в пошаговой тренировке, когда в
// черновике уже есть записанные подходы (вес или повторы). Приложение обновляет её
// не чаще раза в 5 минут и снимает при сохранении или закрытии. Тренировку только
// открыли и ничего не записали — метки нет, напоминания нет. Час без действий, а
// метка не снята — скорее всего, забыли нажать «Сохранить».
export const MSG_UNSAVED = 'Кажется, вы не сохранили тренировку! Откройте приложение и завершите её — черновик ждёт на телефоне.';
MSG_EN[MSG_UNSAVED] = "Looks like you didn't save your workout! Open the app and finish it — the draft is waiting on your phone.";
export const UNSAVED_IDLE_MS = 60 * 60 * 1000;
// Метка старше 12 часов — брошенная (приложение закрыли посреди тренировки
// давно), о ней не пишем.
export const UNSAVED_STALE_MS = 12 * 60 * 60 * 1000;

// Решение по одному пользователю.
//   profile — { tz, workout_touched_at, last_unsaved_alert }
//   savedAfter — есть ли тренировка, сохранённая после последнего действия.
// Возвращает { send: true, text, date } или { send: false, reason }.
export function decideUnsaved({ now, profile, savedAfter = false }) {
  const p = profile || {};
  const last = p.workout_touched_at ? Date.parse(p.workout_touched_at) : NaN;
  if (!isFinite(last)) return { send: false, reason: 'нет записанных подходов' };
  const idle = now.getTime() - last;
  if (idle < UNSAVED_IDLE_MS) return { send: false, reason: 'меньше часа без действий' };
  if (idle > UNSAVED_STALE_MS) return { send: false, reason: 'метка устарела' };
  const { date } = localParts(now, p.tz);
  if (p.last_unsaved_alert === date) return { send: false, reason: 'сегодня уже напоминали' };
  if (savedAfter) return { send: false, reason: 'тренировка сохранена' };
  return { send: true, text: MSG_UNSAVED, date };
}

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
//   profile   — { tz, last_missed_alert, active_workout_at, plan_id,
//                 last_unsaved_alert, workout_touched_at }
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
  // Сегодня тренировался, но не сохранил: об этом — напоминание о несохранённой
  // (decideUnsaved), а не «пропустил» (тем более жёсткое).
  if (p.last_unsaved_alert === date) return { send: false, reason: 'сегодня напоминали о несохранённой' };
  const touched = p.workout_touched_at ? Date.parse(p.workout_touched_at) : NaN;
  if (isFinite(touched) && localParts(new Date(touched), p.tz).date === date) {
    return { send: false, reason: 'тренировка сегодня была, не сохранена' };
  }
  if (planDates.has(date)) return { send: false, reason: 'тренировка сегодня есть' };
  if (!firstPlanDate || firstPlanDate > date) return { send: false, reason: 'ещё не тренировался по плану' };

  const lastDays = trainingDaysBack(date, HARSH_STREAK, days);
  const harsh = lastDays.every((d) => d >= firstPlanDate && !planDates.has(d));
  return { send: true, text: harsh ? MSG_MISSED_3 : MSG_MISSED, date };
}
