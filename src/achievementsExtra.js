// Ещё 66 достижений: план и циклы, рекорды, сила к весу тела, «клубы», свой вес,
// объём, время в зале, дорожка и высота, регулярность, тело, дневник,
// разнообразие. Список согласован с Никитой. Подключаются в gamification.js
// после основных; как и основные, постоянные — дата открытия хранится в
// profile.achievements.
//
// Проверки получают тот же контекст { sessions, measurements, profile, today },
// что и основные, — поэтому replay в achievementUnlockDates находит и их даты.
// Общие расчёты (вес тела на дату подхода, серии, лучшие повторы) приходят из
// gamification.js параметром h — без циклического импорта.

import { getPlan, getPlanDay, makeTrainingDayCheck, DEFAULT_PLAN_ID } from './plans.js';
import { bodyLogOf } from './bodyLog.js';
import { categorizeExercise, MUSCLE_GROUPS, isTimeBasedExercise } from './tabs/workoutTabHelpers.jsx';

const num = (v) => Number(v) || 0;
const byDate = (a, b) => a.date.localeCompare(b.date);
const dayDiff = (a, b) => {
  const t = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((t(b) - t(a)) / 86400000);
};

// Подходы упражнения: записанные по отдельности или «вес × повторы × подходы».
function setsOf(ex) {
  if (Array.isArray(ex.setLog) && ex.setLog.length) return ex.setLog.map((x) => ({ weight: num(x && x.weight), reps: num(x && x.reps) }));
  const n = Math.max(1, num(ex.sets));
  return Array.from({ length: n }, () => ({ weight: num(ex.weight), reps: num(ex.reps) }));
}
const isTimed = (ex) => !!ex.timed || isTimeBasedExercise(ex.name);
const allEx = (sessions) => (sessions || []).flatMap((s) => (s.exercises || []).map((ex) => ({ s, ex })));

// ---- Вес ----
// Лучший рабочий вес среди упражнений, подходящих под regex.
function bestWeight(sessions, re) {
  let best = 0;
  allEx(sessions).forEach(({ ex }) => { if (re.test(ex.name)) best = Math.max(best, num(ex.weight)); });
  return best;
}
const BENCH = /жим штанги лёжа(?!.*головой)/i;
const SQUAT = /присед.*штанг|фронтальн/i; // со штангой: смит и гакк-машина сюда не идут
const PULL = /румынск|станов/i;
const PULLUPS = /^(?!.*австралийск).*подтягиван/i; // австралийские — это тяга, не подтягивания

// Тоннаж тренировки: вес × повторы по подходам (упражнения на время не в счёт).
function tonnage(s) {
  return (s.exercises || []).reduce((sum, ex) => (isTimed(ex) ? sum
    : sum + setsOf(ex).reduce((a, x) => a + x.weight * x.reps, 0)), 0);
}

// ---- Рекорды ----
// События «побит рекорд»: рабочий вес выше всех прошлых записей упражнения
// (без веса — повторы, на время — секунды). Первая запись рекордом не считается.
function recordEvents(sessions) {
  const best = new Map();
  const events = [];
  (sessions || []).slice().sort(byDate).forEach((s) => {
    (s.exercises || []).forEach((ex) => {
      const sets = setsOf(ex);
      const w = Math.max(0, ...sets.map((x) => x.weight));
      const kind = w > 0 ? 'w' : 'r';
      const value = w > 0 ? w : Math.max(0, ...sets.map((x) => x.reps));
      if (value <= 0) return;
      const prev = best.get(ex.name);
      if (prev && prev.kind === kind && value > prev.value) events.push({ date: s.date, id: s.id });
      if (!prev || (prev.kind === kind && value > prev.value) || (prev.kind === 'r' && kind === 'w')) best.set(ex.name, { kind, value });
    });
  });
  return events;
}
function maxBy(events, keyFn) {
  const counts = {};
  events.forEach((e) => { const k = keyFn(e); counts[k] = (counts[k] || 0) + 1; });
  return Math.max(0, ...Object.values(counts));
}

// ---- План и циклы ----
// Циклы плана по тренировкам с номером дня. Новый цикл — смена плана или
// откат номера дня больше чем на неделю (после 24-го снова 1-й, перезапуск
// плана). Повтор вчерашнего дня — тот же цикл.
function planCycles(sessions) {
  const cycles = [];
  let cur = null;
  (sessions || []).filter((s) => s.programDay).slice().sort(byDate).forEach((s) => {
    const planId = s.planId || DEFAULT_PLAN_ID;
    const day = num(s.programDay);
    if (!cur || cur.planId !== planId || day <= cur.lastDay - 6) {
      cur = { planId, days: new Set(), lastDay: 0 };
      cycles.push(cur);
    }
    cur.days.add(day);
    cur.lastDay = Math.max(cur.lastDay, day);
  });
  return cycles;
}
const cycleComplete = (c) => getPlan(c.planId).days.every((d) => c.days.has(d.day));
function cycleWeekDone(c, week) {
  const per = getPlan(c.planId).daysPerWeek || 6;
  for (let d = (week - 1) * per + 1; d <= week * per; d += 1) if (!c.days.has(d)) return false;
  return true;
}
const anyWeekDone = (c) => [1, 2, 3, 4].some((w) => cycleWeekDone(c, w));

// Тренировка по плану, где у каждого упражнения дня записаны все плановые подходы
// (замена засчитывается за плановое).
function isPerfect(s) {
  if (!s.programDay) return false;
  const day = getPlanDay(s.planId || DEFAULT_PLAN_ID, num(s.programDay));
  if (!day || day.type !== 'strength' || !Array.isArray(day.exercises) || day.exercises.length === 0) return false;
  return day.exercises.every((pe) => {
    const ex = (s.exercises || []).find((e) => e.name === pe.name || e.replacedFrom === pe.name);
    if (!ex) return false;
    return setsOf(ex).filter((x) => x.reps > 0 || x.weight > 0).length >= num(pe.sets);
  });
}

// ---- Дорожка ----
const TREADMILL = (c) => c && (/дорожк/i.test(c.name) || /^сектор\s/i.test(c.name));
// Набор высоты записи: км × наклон% × 10 = метры.
const elevationOf = (c) => num(c.distance) * num(c.incline) * 10;
const sessionElevation = (s) => (s.cardio || []).filter(TREADMILL).reduce((a, c) => a + elevationOf(c), 0);
const totalElevation = (sessions) => (sessions || []).reduce((a, s) => a + sessionElevation(s), 0);
const totalTreadmillKm = (sessions) => (sessions || []).reduce((a, s) => a + (s.cardio || []).filter(TREADMILL).reduce((b, c) => b + num(c.distance), 0), 0);
// Кардио-финиш: дорожка после силовой (не разминка).
const hasFinisher = (s) => (s.exercises || []).length > 0
  && (s.cardio || []).some((c) => TREADMILL(c) && !/разминк/i.test(c.name) && num(c.distance) > 0);

// ---- Регулярность ----
function maxCompleteWeeksInRow(h, sessions, planId) {
  const active = new Set((sessions || []).map((s) => s.date));
  const check = makeTrainingDayCheck(sessions, planId);
  const mondays = [...new Set((sessions || []).map((s) => h.getMonday(s.date)))].sort();
  let best = 0; let run = 0; let prev = null;
  mondays.forEach((m) => {
    const ok = h.isWeekComplete(active, m, check);
    run = ok ? (prev && dayDiff(prev, m) === 7 && run > 0 ? run + 1 : 1) : 0;
    best = Math.max(best, run);
    prev = m;
  });
  return best;
}
function maxConsecutiveDates(dates) {
  const list = [...new Set(dates)].sort();
  let best = 0; let run = 0;
  list.forEach((d, i) => {
    run = i > 0 && dayDiff(list[i - 1], d) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
  });
  return best;
}

// ---- Тело ----
function bodyChange(profile, today, key) {
  const log = bodyLogOf(profile, today).filter((e) => e[key] != null);
  if (log.length < 2) return 0;
  return log[0][key] - log[log.length - 1][key]; // > 0 — уменьшилось
}
function adonis(profile, today) {
  const log = bodyLogOf(profile, today);
  const last = (k) => { for (let i = log.length - 1; i >= 0; i -= 1) if (log[i][k] != null) return log[i][k]; return null; };
  const sh = last('shoulders'); const w = last('waist');
  return sh && w ? sh / w : 0;
}

// ---- Прогресс до открытия ----
// Для полоски в «Профиле»: { cur, goal, unit } — сколько уже есть и сколько нужно,
// в единицах достижения. Есть у всех достижений с числовым порогом (и основных,
// и новых); у «да/нет» (Перфекционист, Возвращение…) — нет. Считается только у
// закрытых, на экране.
const P = (cur, goal, unit = '') => ({ cur: Math.max(0, cur), goal, unit });

function maxDoneDaysInWeek(h, sessions, planId) {
  const active = new Set((sessions || []).map((s) => s.date));
  const check = makeTrainingDayCheck(sessions, planId);
  let best = 0; let goal = 6;
  [...new Set((sessions || []).map((s) => h.getMonday(s.date)))].forEach((m) => {
    let planned = 0; let done = 0;
    for (let i = 0; i < 7; i += 1) {
      const d = h.shiftDate(m, i);
      if (!check(d)) continue;
      planned += 1;
      if (active.has(d)) done += 1;
    }
    if (done > best) { best = done; goal = planned || goal; }
  });
  return { best, goal };
}

export function makeProgressMap(h) {
  const ratio = (re, goal) => ({ sessions, measurements }) => P(Math.floor(h.bestLiftRatio(sessions, measurements, re) * 100) / 100, goal, '× веса');
  const reps = (re, goal) => ({ sessions }) => P(h.bestRepsFor(sessions, re), goal, 'повт');
  const count = (fn, goal, unit = '') => (ctx) => P(fn(ctx), goal, unit);
  const tonnes = (kg) => Math.floor(kg / 100) / 10;
  const recs = ({ sessions }) => recordEvents(sessions);
  const cycles = ({ sessions }) => planCycles(sessions);
  const perOf = (c) => getPlan(c.planId).daysPerWeek || 6;
  const weekDays = (c, w) => { const per = perOf(c); let n = 0; for (let d = (w - 1) * per + 1; d <= w * per; d += 1) if (c.days.has(d)) n += 1; return n; };
  // Лучший цикл по доле сделанного: { cur, goal } в днях этого цикла.
  const bestOfCycles = (ctx, part) => {
    let best = { cur: 0, goal: part(null).goal };
    cycles(ctx).forEach((c) => { const r = part(c); if (r.cur / r.goal > best.cur / best.goal) best = r; });
    return best;
  };
  const planNow = (ctx) => getPlan((ctx.profile && ctx.profile.planId) || DEFAULT_PLAN_ID);
  const map = {
    // --- основные ---
    'bench-bodyweight': ratio(/жим.*лёж/i, 1),
    'squat-bodyweight': ratio(/присед/i, 1),
    'deadlift-bodyweight': ratio(/румынск.*тяга|тяга.*румынск/i, 1),
    'squat-1-5x': ratio(/присед/i, 1.5),
    'bench-1-5x': ratio(/жим.*лёж/i, 1.5),
    'first-week': ({ sessions, profile }) => { const r = maxDoneDaysInWeek(h, sessions, profile && profile.planId); return P(r.best, r.goal, 'дн'); },
    ...Object.fromEntries([['treadmill-100m', 0.1], ['treadmill-402m', 0.402], ['treadmill-1km', 1], ['treadmill-2km', 2], ['treadmill-3km', 3], ['treadmill-5km', 5]]
      .map(([id, km]) => [id, ({ sessions }) => P(h.maxTreadmillDistance(sessions), km, 'км')])),
    'first-pullup': reps(PULLUPS, 1),
    'pullups-10': reps(PULLUPS, 10),
    'dips-15': reps(/отжиман.*брус/i, 15),
    'one-month': count(({ sessions, today }) => h.daysSinceFirstSession(sessions, today), 30, 'дн'),
    'half-year': count(({ sessions, today }) => h.daysSinceFirstSession(sessions, today), 180, 'дн'),
    'one-year': count(({ sessions, today }) => h.daysSinceFirstSession(sessions, today), 365, 'дн'),
    'sessions-50': count(({ sessions }) => (sessions || []).length, 50),
    'sessions-100': count(({ sessions }) => (sessions || []).length, 100),
    'sessions-250': count(({ sessions }) => (sessions || []).length, 250),
    'all-cardio': ({ sessions }) => {
      const norm = (x) => (x || '').toLowerCase().replace(/ё/g, 'е');
      const used = new Set(); (sessions || []).forEach((s) => (s.cardio || []).forEach((c) => used.add(norm(c.name))));
      const types = ['беговая дорожка', 'велотренажер', 'эллипсо', 'гребн', 'степпер', 'бассейн'];
      return P(types.filter((ty) => [...used].some((n) => n.includes(ty))).length, types.length, 'видов');
    },
    'pool-10h': ({ sessions }) => P(Math.floor(h.totalPoolMinutes(sessions) / 6) / 10, 10, 'ч'),
    'pool-1h-session': ({ sessions }) => {
      let m = 0; (sessions || []).forEach((s) => (s.cardio || []).forEach((c) => { if (/бассейн/i.test(c.name)) m = Math.max(m, num(c.duration)); }));
      return P(m, 60, 'мин');
    },
    'streak-10': ({ sessions, profile }) => P(h.currentMaxStreak(sessions, profile && profile.planId), 10, 'дн'),
    'streak-20': ({ sessions, profile }) => P(h.currentMaxStreak(sessions, profile && profile.planId), 20, 'дн'),
    'full-body-profile': ({ profile }) => P(h.BODY_FIELDS.filter((f) => profile && profile[f.key] != null && profile[f.key] !== '').length, h.BODY_FIELDS.length, 'из'),
    'growing-strength': ({ sessions }) => {
      const by = {};
      (sessions || []).slice().sort(byDate).forEach((s) => (s.exercises || []).forEach((ex) => {
        if (!num(ex.weight)) return;
        if (!by[ex.name]) by[ex.name] = { first: num(ex.weight), best: num(ex.weight) };
        by[ex.name].best = Math.max(by[ex.name].best, num(ex.weight));
      }));
      return P(Math.floor(Math.max(1, ...Object.values(by).map((v) => v.best / v.first)) * 100 - 100), 20, '%');
    },
    'heavy-week': ({ sessions }) => P(tonnes(h.maxWeeklyVolume(sessions)), 10, 'т'),
    'full-body-day': ({ sessions }) => P(Math.max(0, ...(sessions || []).map((s) => {
      const g = new Set((s.exercises || []).map((ex) => categorizeExercise(ex.name)).filter(Boolean));
      return [g.has(MUSCLE_GROUPS.legs), g.has(MUSCLE_GROUPS.arms), g.has(MUSCLE_GROUPS.chest) || g.has(MUSCLE_GROUPS.back)].filter(Boolean).length;
    })), 3, 'групп'),
    'good-sleep': ({ sessions }) => P(Math.max(0, ...(sessions || []).map((s) => num(s.sleep))), 8, 'ч'),
    'notes-30': count(({ sessions }) => (sessions || []).filter((s) => s.feeling && s.feeling.trim()).length, 30),

    // --- новые ---
    'plan-week': (ctx) => { const r = bestOfCycles(ctx, (c) => (c ? { cur: Math.max(...[1, 2, 3, 4].map((w) => weekDays(c, w))), goal: perOf(c) } : { goal: planNow(ctx).daysPerWeek || 6 })); return P(r.cur, r.goal, 'дн'); },
    'cycle-1': (ctx) => { const r = bestOfCycles(ctx, (c) => (c ? { cur: getPlan(c.planId).days.filter((d) => c.days.has(d.day)).length, goal: getPlan(c.planId).days.length } : { goal: planNow(ctx).days.length })); return P(r.cur, r.goal, 'дн'); },
    'cycle-3': (ctx) => P(cycles(ctx).filter(cycleComplete).length, 3, 'циклов'),
    'heavy-week-done': (ctx) => { const r = bestOfCycles(ctx, (c) => (c ? { cur: weekDays(c, 3), goal: perOf(c) } : { goal: planNow(ctx).daysPerWeek || 6 })); return P(r.cur, r.goal, 'дн'); },
    'improviser': count(({ sessions }) => allEx(sessions).filter(({ ex }) => ex.added).length, 10),
    ...Object.fromEntries([1, 10, 25, 50, 100].map((n) => [`records-${n}`, (ctx) => P(recs(ctx).length, n)])),
    'records-session-3': (ctx) => P(maxBy(recs(ctx), (e) => `${e.date}|${e.id}`), 3),
    'records-week-6': (ctx) => P(maxBy(recs(ctx), (e) => h.getMonday(e.date)), 6),
    'bench-1-25x': ratio(BENCH, 1.25),
    'squat-2x': ratio(SQUAT, 2),
    'rdl-2x': ratio(/румынск/i, 2),
    'row-bodyweight': ratio(/тяга штанги в наклоне/i, 1),
    'ohp-0-75x': ratio(/армейск|жим штанги сидя|жим штанги стоя/i, 0.75),
    'bench-100': ({ sessions }) => P(bestWeight(sessions, BENCH), 100, 'кг'),
    'squat-100': ({ sessions }) => P(bestWeight(sessions, SQUAT), 100, 'кг'),
    'pull-150': ({ sessions }) => P(bestWeight(sessions, PULL), 150, 'кг'),
    'club-300': ({ sessions }) => P(bestWeight(sessions, BENCH) + bestWeight(sessions, SQUAT) + bestWeight(sessions, PULL), 300, 'кг'),
    'club-400': ({ sessions }) => P(bestWeight(sessions, BENCH) + bestWeight(sessions, SQUAT) + bestWeight(sessions, PULL), 400, 'кг'),
    'pullups-15': reps(PULLUPS, 15),
    'pullups-20': reps(PULLUPS, 20),
    'pullups-plus-20': ({ sessions }) => P(Math.max(0, ...allEx(sessions).filter(({ ex }) => PULLUPS.test(ex.name))
      .flatMap(({ ex }) => setsOf(ex).filter((x) => x.reps > 0).map((x) => x.weight))), 20, 'кг'),
    'dips-20': reps(/отжиман.*брус/i, 20),
    'plank-3min': ({ sessions }) => P(Math.max(0, ...allEx(sessions).filter(({ ex }) => /планк/i.test(ex.name) && !/боков/i.test(ex.name))
      .flatMap(({ ex }) => setsOf(ex).map((x) => x.reps))), 180, 'с'),
    'tonnage-session-10t': ({ sessions }) => P(tonnes(Math.max(0, ...(sessions || []).map(tonnage))), 10, 'т'),
    ...Object.fromEntries([25, 50].map((t) => [`tonnage-week-${t}t`, ({ sessions }) => {
      const by = {}; (sessions || []).forEach((s) => { const m = h.getMonday(s.date); by[m] = (by[m] || 0) + tonnage(s); });
      return P(tonnes(Math.max(0, ...Object.values(by))), t, 'т');
    }])),
    ...Object.fromEntries([100, 1000].map((t) => [`tonnage-total-${t}t`, ({ sessions }) => P(tonnes((sessions || []).reduce((a, s) => a + tonnage(s), 0)), t, 'т')])),
    'sets-1000': count(({ sessions }) => allEx(sessions).reduce((a, { ex }) => a + setsOf(ex).filter((x) => x.reps > 0 || x.weight > 0).length, 0), 1000),
    'reps-10000': count(({ sessions }) => allEx(sessions).reduce((a, { ex }) => (isTimed(ex) ? a : a + setsOf(ex).reduce((b, x) => b + x.reps, 0)), 0), 10000),
    'long-session': ({ sessions }) => P(Math.floor(Math.max(0, ...(sessions || []).map((s) => num(s.durationSec))) / 60), 90, 'мин'),
    ...Object.fromEntries([50, 100].map((hrs) => [`gym-hours-${hrs}`, ({ sessions }) => P(Math.floor((sessions || []).reduce((a, s) => a + num(s.durationSec), 0) / 360) / 10, hrs, 'ч')])),
    'climb-500': ({ sessions }) => P(Math.round(Math.max(0, ...(sessions || []).map(sessionElevation))), 500, 'м'),
    ...Object.fromEntries([['climb-1000', 1000], ['climb-elbrus', 5642], ['climb-everest', 8848], ['climb-20000', 20000]]
      .map(([id, m]) => [id, ({ sessions }) => P(Math.round(totalElevation(sessions)), m, 'м')])),
    ...Object.fromEntries([50, 100].map((km) => [`treadmill-total-${km}km`, ({ sessions }) => P(Math.floor(totalTreadmillKm(sessions) * 10) / 10, km, 'км')])),
    'finisher-30': count(({ sessions }) => (sessions || []).filter(hasFinisher).length, 30),
    'streak-30': ({ sessions, profile }) => P(h.currentMaxStreak(sessions, profile && profile.planId), 30, 'дн'),
    'streak-50': ({ sessions, profile }) => P(h.currentMaxStreak(sessions, profile && profile.planId), 50, 'дн'),
    'weeks-4': ({ sessions, profile }) => P(maxCompleteWeeksInRow(h, sessions, profile && profile.planId), 4, 'нед'),
    'weeks-12': ({ sessions, profile }) => P(maxCompleteWeeksInRow(h, sessions, profile && profile.planId), 12, 'нед'),
    'sessions-500': count(({ sessions }) => (sessions || []).length, 500),
    'two-years': count(({ sessions, today }) => h.daysSinceFirstSession(sessions, today), 730, 'дн'),
    'weigh-7-days': ({ measurements }) => P(maxConsecutiveDates((measurements || []).filter((m) => num(m.weight) > 0).map((m) => m.date)), 7, 'дн'),
    'weigh-100': count(({ measurements }) => (measurements || []).filter((m) => num(m.weight) > 0).length, 100),
    'waist-minus-2': ({ profile, today }) => P(Math.round(bodyChange(profile, today, 'waist') * 10) / 10, 2, 'см'),
    'fat-minus-2': ({ profile, today }) => P(Math.round(bodyChange(profile, today, 'bodyFat') * 10) / 10, 2, '%'),
    'adonis-1-5': ({ profile, today }) => P(Math.floor(adonis(profile, today) * 100) / 100, 1.5),
    'full-summary-30': count(({ sessions }) => (sessions || []).filter((s) => num(s.sleep) > 0 && s.energy && s.difficulty && s.feeling && s.feeling.trim()).length, 30),
    'slept-7': ({ sessions }) => {
      let run = 0; let best = 0;
      (sessions || []).slice().sort(byDate).forEach((s) => { run = num(s.sleep) >= 7 ? run + 1 : 0; best = Math.max(best, run); });
      return P(best, 7, 'подряд');
    },
    'exercise-notes-50': count(({ sessions }) => allEx(sessions).filter(({ ex }) => ex.note && String(ex.note).trim()).length, 50),
    'collector-40': count(({ sessions }) => new Set(allEx(sessions).map(({ ex }) => ex.name)).size, 40),
    'all-groups-week': ({ sessions }) => {
      const by = {};
      (sessions || []).forEach((s) => {
        const m = h.getMonday(s.date);
        if (!by[m]) by[m] = new Set();
        (s.exercises || []).forEach((ex) => { const g = categorizeExercise(ex.name); if (g) by[m].add(g); });
      });
      return P(Math.max(0, ...Object.values(by).map((x) => x.size)), Object.keys(MUSCLE_GROUPS).length, 'групп');
    },
  };
  return map;
}

export function makeExtraAchievements(h) {
  const A = (id, title, description, xp, icon, check) => ({ id, title, description, xp, icon, check });
  const planOf = (profile) => profile && profile.planId;
  return [
    // --- План и циклы ---
    A('plan-start', 'Старт плана', 'Первая тренировка по плану', 2, 'flag',
      ({ sessions }) => (sessions || []).some((s) => s.programDay)),
    A('plan-week', 'Неделя плана', 'Сделаны все дни одной недели цикла (например, дни 7–12)', 5, 'calendar-check',
      ({ sessions }) => planCycles(sessions).some(anyWeekDone)),
    A('cycle-1', 'Цикл закрыт', 'Сделаны все дни цикла плана', 12, 'crown',
      ({ sessions }) => planCycles(sessions).some(cycleComplete)),
    A('cycle-3', 'Три цикла', 'Три закрытых цикла плана', 20, 'crown',
      ({ sessions }) => planCycles(sessions).filter(cycleComplete).length >= 3),
    A('heavy-week-done', 'Тяжёлая неделя пройдена', 'Все дни 3-й недели цикла', 8, 'shield',
      ({ sessions }) => planCycles(sessions).some((c) => cycleWeekDone(c, 3))),
    A('perfectionist', 'Перфекционист', 'Тренировка по плану, где у каждого упражнения записаны все плановые подходы', 4, 'list-checks',
      ({ sessions }) => (sessions || []).some(isPerfect)),
    A('improviser', 'Импровизатор', '10 раз добавлено упражнение сверх плана', 3, 'sparkles',
      ({ sessions }) => allEx(sessions).filter(({ ex }) => ex.added).length >= 10),

    // --- Рекорды ---
    ...[[1, 'Первый рекорд', 2], [10, '10 рекордов', 5], [25, '25 рекордов', 8], [50, '50 рекордов', 12], [100, '100 рекордов', 18]]
      .map(([n, title, xp]) => A(`records-${n}`, title, n === 1 ? 'Впервые побит личный рекорд в упражнении' : `Побито ${n} личных рекордов`, xp, n >= 50 ? 'trophy' : 'star',
        ({ sessions }) => recordEvents(sessions).length >= n)),
    A('records-session-3', 'Рекордная тренировка', '3 рекорда за одну тренировку', 5, 'medal',
      ({ sessions }) => maxBy(recordEvents(sessions), (e) => `${e.date}|${e.id}`) >= 3),
    A('records-week-6', 'Рекордная неделя', '6 рекордов за одну неделю', 7, 'medal',
      ({ sessions }) => maxBy(recordEvents(sessions), (e) => h.getMonday(e.date)) >= 6),

    // --- Сила к весу тела (вес тела на дату подхода) ---
    A('bench-1-25x', 'Жим в 1.25 веса тела', 'Рабочий вес в жиме лёжа — 1.25 веса тела', 6, 'gauge',
      ({ sessions, measurements }) => h.bestLiftRatio(sessions, measurements, BENCH) >= 1.25),
    A('squat-2x', 'Присед в два веса', 'Присед со штангой — два веса тела', 15, 'gauge',
      ({ sessions, measurements }) => h.bestLiftRatio(sessions, measurements, SQUAT) >= 2),
    A('rdl-2x', 'Румынская тяга в два веса', 'Румынская тяга — два веса тела', 12, 'gauge',
      ({ sessions, measurements }) => h.bestLiftRatio(sessions, measurements, /румынск/i) >= 2),
    A('row-bodyweight', 'Тяга в наклоне в вес тела', 'Тяга штанги в наклоне — вес тела', 5, 'gauge',
      ({ sessions, measurements }) => h.bestLiftRatio(sessions, measurements, /тяга штанги в наклоне/i) >= 1),
    A('ohp-0-75x', 'Жим над головой в 0.75 веса', 'Жим штанги стоя или сидя — 0.75 веса тела', 8, 'gauge',
      ({ sessions, measurements }) => h.bestLiftRatio(sessions, measurements, /армейск|жим штанги сидя|жим штанги стоя/i) >= 0.75),

    // --- Клубы (абсолютный вес) ---
    A('bench-100', 'Сотка в жиме', 'Жим штанги лёжа — 100 кг', 12, 'weight',
      ({ sessions }) => bestWeight(sessions, BENCH) >= 100),
    A('squat-100', 'Сотка в приседе', 'Присед со штангой — 100 кг', 10, 'weight',
      ({ sessions }) => bestWeight(sessions, SQUAT) >= 100),
    A('pull-150', '150 в тяге', 'Румынская или становая тяга — 150 кг', 12, 'weight',
      ({ sessions }) => bestWeight(sessions, PULL) >= 150),
    A('club-300', 'Клуб 300', 'Сумма лучших жима лёжа, приседа и тяги — 300 кг', 12, 'dumbbell',
      ({ sessions }) => bestWeight(sessions, BENCH) + bestWeight(sessions, SQUAT) + bestWeight(sessions, PULL) >= 300),
    A('club-400', 'Клуб 400', 'Сумма лучших жима лёжа, приседа и тяги — 400 кг', 20, 'dumbbell',
      ({ sessions }) => bestWeight(sessions, BENCH) + bestWeight(sessions, SQUAT) + bestWeight(sessions, PULL) >= 400),

    // --- Свой вес ---
    A('pullups-15', '15 подтягиваний подряд', '15 подтягиваний в одном подходе', 8, 'zap',
      ({ sessions }) => h.bestRepsFor(sessions, PULLUPS) >= 15),
    A('pullups-20', '20 подтягиваний подряд', '20 подтягиваний в одном подходе', 12, 'zap',
      ({ sessions }) => h.bestRepsFor(sessions, PULLUPS) >= 20),
    A('pullups-weighted', 'С довеском', 'Подход подтягиваний с отягощением', 4, 'zap',
      ({ sessions }) => allEx(sessions).some(({ ex }) => PULLUPS.test(ex.name) && setsOf(ex).some((x) => x.weight > 0 && x.reps > 0))),
    A('pullups-plus-20', 'Подтягивания +20 кг', 'Подход подтягиваний с отягощением 20 кг', 12, 'zap',
      ({ sessions }) => allEx(sessions).some(({ ex }) => PULLUPS.test(ex.name) && setsOf(ex).some((x) => x.weight >= 20 && x.reps > 0))),
    A('dips-20', '20 на брусьях', '20 отжиманий на брусьях в одном подходе', 8, 'zap',
      ({ sessions }) => h.bestRepsFor(sessions, /отжиман.*брус/i) >= 20),
    A('plank-3min', 'Планка 3 минуты', 'Удержание планки 180 секунд', 6, 'timer',
      ({ sessions }) => allEx(sessions).some(({ ex }) => /планк/i.test(ex.name) && !/боков/i.test(ex.name)
        && setsOf(ex).some((x) => x.reps >= 180))),

    // --- Объём ---
    A('tonnage-session-10t', '10 тонн за тренировку', 'Тоннаж одной тренировки — 10 000 кг', 5, 'layers',
      ({ sessions }) => (sessions || []).some((s) => tonnage(s) >= 10000)),
    ...[[25, 5], [50, 10]].map(([t, xp]) => A(`tonnage-week-${t}t`, `Неделя на ${t} тонн`, `Тоннаж за неделю — ${t} 000 кг`, xp, 'layers',
      ({ sessions }) => {
        const by = {};
        (sessions || []).forEach((s) => { const m = h.getMonday(s.date); by[m] = (by[m] || 0) + tonnage(s); });
        return Math.max(0, ...Object.values(by)) >= t * 1000;
      })),
    ...[[100, 5], [1000, 15]].map(([t, xp]) => A(`tonnage-total-${t}t`, `${t} тонн за всё время`, `Суммарный тоннаж — ${t} 000 кг`, xp, 'layers',
      ({ sessions }) => (sessions || []).reduce((a, s) => a + tonnage(s), 0) >= t * 1000)),
    A('sets-1000', '1000 подходов', 'Записано 1000 подходов', 6, 'repeat',
      ({ sessions }) => allEx(sessions).reduce((a, { ex }) => a + setsOf(ex).filter((x) => x.reps > 0 || x.weight > 0).length, 0) >= 1000),
    A('reps-10000', '10 000 повторов', 'Суммарно 10 000 повторов (без упражнений на время)', 10, 'repeat',
      ({ sessions }) => allEx(sessions).reduce((a, { ex }) => (isTimed(ex) ? a : a + setsOf(ex).reduce((b, x) => b + x.reps, 0)), 0) >= 10000),

    // --- Время в зале ---
    A('long-session', 'Долгая тренировка', 'Тренировка дольше 90 минут', 3, 'hourglass',
      ({ sessions }) => (sessions || []).some((s) => num(s.durationSec) > 90 * 60)),
    ...[[50, 6], [100, 12]].map(([hrs, xp]) => A(`gym-hours-${hrs}`, `${hrs} часов в зале`, `Суммарная длительность тренировок — ${hrs} часов`, xp, 'clock',
      ({ sessions }) => (sessions || []).reduce((a, s) => a + num(s.durationSec), 0) >= hrs * 3600)),

    // --- Дорожка и высота ---
    A('climb-500', 'Восхождение', 'Набор высоты 500 м за одну тренировку', 4, 'mountain',
      ({ sessions }) => (sessions || []).some((s) => sessionElevation(s) >= 500)),
    ...[['climb-1000', 'Тысячник', 1000, 3], ['climb-elbrus', 'Эльбрус', 5642, 8], ['climb-everest', 'Эверест', 8848, 12], ['climb-20000', 'Выше облаков', 20000, 20]]
      .map(([id, title, m, xp]) => A(id, title, `Суммарный набор высоты на дорожке — ${m.toLocaleString('ru-RU')} м`, xp, m >= 5642 ? 'mountain-snow' : 'mountain',
        ({ sessions }) => totalElevation(sessions) >= m)),
    ...[[50, 5], [100, 10]].map(([km, xp]) => A(`treadmill-total-${km}km`, `${km} км на дорожке`, `Суммарно ${km} км на беговой дорожке`, xp, 'footprints',
      ({ sessions }) => totalTreadmillKm(sessions) >= km)),
    A('finisher-30', 'Финишёр', '30 тренировок с кардио на дорожке после силовой', 6, 'route',
      ({ sessions }) => (sessions || []).filter(hasFinisher).length >= 30),

    // --- Регулярность (по дням плана) ---
    ...[[30, 20], [50, 30]].map(([n, xp]) => A(`streak-${n}`, `Серия ${n}`, `${n} тренировочных дней подряд без пропуска`, xp, 'flame',
      ({ sessions, profile }) => h.currentMaxStreak(sessions, planOf(profile)) >= n)),
    A('weeks-4', 'Месяц без пропусков', '4 недели подряд закрыты целиком по плану', 12, 'calendar-range',
      ({ sessions, profile }) => maxCompleteWeeksInRow(h, sessions, planOf(profile)) >= 4),
    A('weeks-12', 'Квартал без пропусков', '12 недель подряд закрыты целиком по плану', 25, 'calendar-range',
      ({ sessions, profile }) => maxCompleteWeeksInRow(h, sessions, planOf(profile)) >= 12),
    A('comeback', 'Возвращение', 'Тренировка после перерыва в 7 дней и больше', 2, 'rotate',
      ({ sessions }) => {
        const d = [...new Set((sessions || []).map((s) => s.date))].sort();
        return d.some((x, i) => i > 0 && dayDiff(d[i - 1], x) >= 8);
      }),
    A('sessions-500', '500 тренировок', 'Сохранено 500 тренировок', 25, 'trophy',
      ({ sessions }) => (sessions || []).length >= 500),
    A('two-years', 'Два года с трекером', 'С первой тренировки прошло два года', 25, 'gem',
      ({ sessions, today }) => h.daysSinceFirstSession(sessions, today) >= 730),

    // --- Тело и вес ---
    A('weigh-7-days', 'Неделя на весах', '7 дней подряд со взвешиванием', 3, 'scale',
      ({ measurements }) => maxConsecutiveDates((measurements || []).filter((m) => num(m.weight) > 0).map((m) => m.date)) >= 7),
    A('weigh-100', '100 взвешиваний', 'Записано 100 взвешиваний', 6, 'scale',
      ({ measurements }) => (measurements || []).filter((m) => num(m.weight) > 0).length >= 100),
    A('waist-minus-2', 'Талия −2 см', 'Талия уменьшилась на 2 см от первого замера', 6, 'ruler',
      ({ profile, today }) => bodyChange(profile, today, 'waist') >= 2),
    A('fat-minus-2', 'Жир −2%', 'Процент жира снизился на 2 от первого замера', 8, 'ruler',
      ({ profile, today }) => bodyChange(profile, today, 'bodyFat') >= 2),
    A('adonis-1-5', 'Индекс Адониса 1.5', 'Обхват плеч, делённый на обхват талии, — 1.5 и больше (идеал — 1.618)', 10, 'target',
      ({ profile, today }) => adonis(profile, today) >= 1.5),

    // --- Дневник ---
    A('full-summary-30', 'Полный итог', '30 тренировок, где записаны сон, энергия, тяжесть и заметка', 5, 'notebook-pen',
      ({ sessions }) => (sessions || []).filter((s) => num(s.sleep) > 0 && s.energy && s.difficulty && s.feeling && s.feeling.trim()).length >= 30),
    A('slept-7', 'Выспавшийся', '7 тренировок подряд после сна 7 часов и больше', 4, 'moon',
      ({ sessions }) => {
        let run = 0; let best = 0;
        (sessions || []).slice().sort(byDate).forEach((s) => { run = num(s.sleep) >= 7 ? run + 1 : 0; best = Math.max(best, run); });
        return best >= 7;
      }),
    A('grit', 'Через не могу', 'Тренировка с энергией 1–2 и тяжестью 4–5', 3, 'battery-low',
      ({ sessions }) => (sessions || []).some((s) => s.energy && num(s.energy) <= 2 && num(s.difficulty) >= 4)),
    A('exercise-notes-50', 'Заметки к упражнениям', '50 заметок к отдельным упражнениям', 4, 'book',
      ({ sessions }) => allEx(sessions).filter(({ ex }) => ex.note && String(ex.note).trim()).length >= 50),

    // --- Разнообразие ---
    A('collector-40', 'Коллекционер', '40 разных упражнений в истории', 5, 'shapes',
      ({ sessions }) => new Set(allEx(sessions).map(({ ex }) => ex.name)).size >= 40),
    A('all-groups-week', 'Всё тело за неделю', 'За одну неделю — упражнения на все 6 групп мышц', 4, 'target',
      ({ sessions }) => {
        const by = {};
        (sessions || []).forEach((s) => {
          const m = h.getMonday(s.date);
          if (!by[m]) by[m] = new Set();
          (s.exercises || []).forEach((ex) => { const g = categorizeExercise(ex.name); if (g) by[m].add(g); });
        });
        return Object.values(by).some((set) => Object.values(MUSCLE_GROUPS).every((g) => set.has(g)));
      }),
  ];
}
