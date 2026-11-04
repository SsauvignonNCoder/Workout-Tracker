// Свои планы пользователей: формат, проверка, перевод в вид движка. Чистые функции —
// их прогоняют тесты; хранит App.jsx (таблица user_plans), показывает tabs/PlanEditor.jsx.
//
// ФОРМАТ — недели, потому что так их редактируют и так их пишет человек или ИИ:
//   { weekdays: ['mon','wed','fri'],
//     weeks: [{ label, load: [75, 80] | null, days: [день на каждый из weekdays] }],
//     history: [{ before: 'YYYY-MM-DD', weeks }] }
// Силовой день: { type:'strength', title, warmupRun, finisherRun,
//                 exercises:[{ name, sets, reps, where?, tip? }], warmup?, cooldown? }.
// Кардио: { type:'cardio', title, distance, incline }. Бассейн: { type:'pool', title, duration }.
// load — процент от рекорда для подсказки веса, [75, 80] или [100, null] («100%+»).
//
// Движок (plans.js и всё, что на нём) работает с плоским days[] с номерами дней —
// как у встроенных планов. Его собирает planFromRow.

import {
  WEEKDAY_CODES, weekdayNumbers, planWeekOf,
} from './plans.js';
import { tr, exKey } from './i18n.js';

export const WEEK_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const MAX_WEEKS = 8;
export const MAX_EXERCISES = 20;
export const MAX_USER_PLANS = 30;
const MAX_SETS = 10;
const MAX_TITLE = 60;
const MAX_REPS_TEXT = 20;
const MAX_NOTE = 200;
const LOAD_MIN = 10;
const LOAD_MAX = 200;
export const CARDIO_NAME = 'Беговая дорожка';
export const POOL_NAME = 'Бассейн';

// Волна встроенных планов — для их копий: у базовых упражнений те же проценты
// (guidedSteps.js → WEEK_LOAD). Разделения на базовые и исключения ЧТ–СБ в копии нет.
const BUILTIN_LOADS = [[75, 80], [80, 85], [100, null], [70, 75]];

const clean = (v, max) => String(v == null ? '' : v).trim().slice(0, max);

export function emptyDay() {
  return { type: 'strength', title: '', warmupRun: true, finisherRun: true, exercises: [] };
}

// Смена типа дня: название оставляем, поля нового типа — по умолчанию.
export function dayOfType(day, type) {
  const title = day && day.title ? day.title : '';
  if (type === 'cardio') return { type, title, distance: '', incline: '' };
  if (type === 'pool') return { type, title, duration: '60' };
  return { ...emptyDay(), title };
}

export function emptyDraft() {
  return { title: '', weekdays: ['mon', 'wed', 'fri'], weeks: [{ label: '', load: null, days: [emptyDay(), emptyDay(), emptyDay()] }] };
}

export const cloneWeek = (week) => JSON.parse(JSON.stringify(week));

function runtimeDay(d, n) {
  const base = { day: n, type: d.type, title: d.title };
  if (d.type === 'cardio') {
    return { ...base, cardio: { name: CARDIO_NAME, distance: String(d.distance == null ? '' : d.distance), incline: String(d.incline == null ? '' : d.incline) } };
  }
  if (d.type === 'pool') return { ...base, cardio: { name: POOL_NAME, duration: String(d.duration || '60') } };
  return {
    ...base,
    ...(d.warmup ? { warmup: d.warmup } : {}),
    ...(d.cooldown ? { cooldown: d.cooldown } : {}),
    ...(d.warmupRun === false ? { warmupRun: false } : {}),
    ...(d.finisherRun === false ? { finisherRun: false } : {}),
    exercises: (d.exercises || []).map((ex) => ({
      name: ex.name, sets: ex.sets, reps: ex.reps,
      ...(ex.where ? { where: ex.where } : {}),
      ...(ex.tip ? { tip: ex.tip } : {}),
    })),
  };
}

export function flattenWeeks(weeks) {
  let n = 0;
  return (weeks || []).flatMap((w) => (w.days || []).map((d) => {
    n += 1;
    return runtimeDay(d, n);
  }));
}

// Строка таблицы user_plans → план для движка.
export function planFromRow(row) {
  const stored = row.plan || {};
  const weeks = stored.weeks || [];
  const weekLabels = {};
  const weekLoads = {};
  weeks.forEach((w, i) => {
    if (w.label) weekLabels[i + 1] = w.label;
    if (w.load) weekLoads[i + 1] = w.load;
  });
  return {
    id: row.id,
    title: row.title,
    custom: true,
    hidden: !!row.deleted_at,
    daysPerWeek: (stored.weekdays || []).length || 1,
    trainingWeekdays: weekdayNumbers(stored.weekdays),
    weekLabels,
    weekLoads,
    weekCount: weeks.length,
    days: flattenWeeks(weeks),
    history: (stored.history || []).map((h) => ({ before: h.before, days: flattenWeeks(h.weeks) })),
    stored,
  };
}

export function planSummary(plan) {
  const perWeek = plan.daysPerWeek || 1;
  const weeks = plan.weekCount || Math.max(1, Math.round((plan.days || []).length / perWeek));
  return tr('{0} дн. в неделю · {1} нед.', perWeek, weeks);
}

// Встроенный план → черновик своего: недели, дни и подсказки те же.
export function draftFromBuiltin(plan) {
  const per = plan.daysPerWeek || 6;
  const weekCount = Math.ceil(plan.days.length / per);
  const weeks = [];
  for (let w = 0; w < weekCount; w += 1) {
    const days = plan.days.filter((d) => planWeekOf(plan, d.day) === w + 1).map((d) => {
      if (d.type === 'cardio') return { type: 'cardio', title: d.title, distance: d.cardio.distance || '', incline: d.cardio.incline || '' };
      if (d.type === 'pool') return { type: 'pool', title: d.title, duration: d.cardio.duration || '60' };
      return {
        type: 'strength', title: d.title,
        ...(d.warmup ? { warmup: d.warmup } : {}),
        ...(d.cooldown ? { cooldown: d.cooldown } : {}),
        warmupRun: true, finisherRun: true,
        exercises: d.exercises.map((ex) => ({
          name: ex.name, sets: ex.sets, reps: ex.reps,
          ...(ex.where ? { where: ex.where } : {}),
          ...(ex.tip ? { tip: ex.tip } : {}),
        })),
      };
    });
    weeks.push({
      label: (plan.weekLabels && plan.weekLabels[w + 1]) || '',
      load: weekCount === BUILTIN_LOADS.length ? BUILTIN_LOADS[w] : null,
      days,
    });
  }
  const weekdays = WEEK_ORDER.filter((code) => (plan.trainingWeekdays || []).includes(WEEKDAY_CODES.indexOf(code)));
  return { title: tr('{0} (копия)', tr(plan.title)), weekdays, weeks };
}

export function normalizeLoad(load) {
  if (!Array.isArray(load)) return null;
  const nums = load.map((x) => (x === '' || x == null ? null : Number(x)));
  const lo = nums[0];
  const hi = nums[1];
  if (lo == null || !isFinite(lo) || lo < LOAD_MIN || lo > LOAD_MAX) return null;
  if (hi == null || !isFinite(hi) || hi < LOAD_MIN || hi > LOAD_MAX) return [Math.round(lo), null];
  return lo <= hi ? [Math.round(lo), Math.round(hi)] : [Math.round(hi), Math.round(lo)];
}

function normalizeDay(day, where, errors) {
  const type = day && (day.type === 'cardio' || day.type === 'pool') ? day.type : 'strength';
  const title = clean(day && day.title, MAX_TITLE);
  if (type === 'cardio') {
    return { type, title: title || tr('Кардио'), distance: clean(day.distance, 10), incline: clean(day.incline, 10) };
  }
  if (type === 'pool') {
    return { type, title: title || tr('Бассейн'), duration: clean(day.duration, 10) || '60' };
  }
  const exercises = (Array.isArray(day && day.exercises) ? day.exercises : [])
    .map((ex) => {
      const name = exKey(clean(ex && ex.name, 120));
      if (!name) return null;
      const sets = Math.min(MAX_SETS, Math.max(1, parseInt(ex.sets, 10) || 3));
      const reps = clean(ex.reps, MAX_REPS_TEXT);
      const note = clean(ex.where, MAX_NOTE);
      const tip = clean(ex.tip, MAX_NOTE);
      return { name, sets, reps, ...(note ? { where: note } : {}), ...(tip ? { tip } : {}) };
    })
    .filter(Boolean);
  if (exercises.length === 0) errors.push(tr('{0}: добавь хотя бы одно упражнение', where));
  if (exercises.length > MAX_EXERCISES) errors.push(tr('{0}: больше {1} упражнений', where, MAX_EXERCISES));
  return {
    type,
    title: title || where,
    ...(day.warmup ? { warmup: clean(day.warmup, MAX_TITLE) } : {}),
    ...(day.cooldown ? { cooldown: clean(day.cooldown, MAX_TITLE) } : {}),
    warmupRun: day.warmupRun !== false,
    finisherRun: day.finisherRun !== false,
    exercises,
  };
}

// Проверка и чистка перед записью — и для редактора, и для всего, что приходит
// извне. Ответ: { ok: true, title, plan } или { ok: false, errors: [текст] }.
export function validatePlan({ title, weekdays, weeks } = {}) {
  const errors = [];
  const name = clean(title, MAX_TITLE);
  if (!name) errors.push(tr('Назови план'));
  const codes = WEEK_ORDER.filter((c) => (weekdays || []).includes(c));
  if (codes.length === 0) errors.push(tr('Выбери хотя бы один день недели'));
  const list = Array.isArray(weeks) ? weeks : [];
  if (list.length === 0) errors.push(tr('В плане нет ни одной недели'));
  if (list.length > MAX_WEEKS) errors.push(tr('В плане больше {0} недель', MAX_WEEKS));
  const outWeeks = list.slice(0, MAX_WEEKS).map((w, wi) => {
    const days = Array.isArray(w && w.days) ? w.days : [];
    if (codes.length && days.length !== codes.length) {
      errors.push(tr('Неделя {0}: дней {1}, а дней недели выбрано {2}', wi + 1, days.length, codes.length));
    }
    return {
      label: clean(w && w.label, MAX_TITLE),
      load: normalizeLoad(w && w.load),
      days: days.map((d, di) => normalizeDay(d, tr('Неделя {0}, день {1}', wi + 1, di + 1), errors)),
    };
  });
  if (errors.length) return { ok: false, errors: [...new Set(errors)] };
  return { ok: true, title: name, plan: { weekdays: codes, weeks: outWeeks } };
}

// Какие дни могут принять упражнение: только силовые, в текущей неделе или в любой, если
// добавляем во все недели.
export function strengthDayIndexes(weeks, weekIdx, allWeeks) {
  const scope = allWeeks ? weeks : [weeks[weekIdx]];
  return scope[0].days.map((_, i) => i).filter((i) => scope.some((w) => w.days[i].type === 'strength'));
}

// Новое упражнение в выбранные дни. День, где такое упражнение уже есть, пропускаем:
// «Все дни» не должны его удваивать. Исключение — день, из которого добавляют: там
// человек видит список и повтор может быть намеренным.
export function addExerciseToWeeks(weeks, {
  weekIdx, openedDay, dayIdxs, item, allWeeks, maxExercises = MAX_EXERCISES,
}) {
  return weeks.map((w, wi) => {
    if (!allWeeks && wi !== weekIdx) return w;
    return {
      ...w,
      days: w.days.map((d, di) => {
        if (!dayIdxs.includes(di) || d.type !== 'strength') return d;
        const list = d.exercises || [];
        const opened = wi === weekIdx && di === openedDay;
        if (list.length >= maxExercises || (!opened && list.some((ex) => ex.name === item.name))) return d;
        return { ...d, exercises: [...list, { ...item }] };
      }),
    };
  });
}

// Правка упражнения. Для всех недель меняем только то, что человек реально поменял,
// и только у того же упражнения в том же дне: переименование не должно затирать
// подходы других недель. Пометки плана (where, tip — есть у копий встроенных планов)
// относятся к старому упражнению: при замене они не переходят на новое.
const EXERCISE_FIELDS = ['name', 'sets', 'reps'];

export function editExerciseInWeeks(weeks, { weekIdx, dayIdx, exIdx, vals, allWeeks }) {
  const old = weeks[weekIdx].days[dayIdx].exercises[exIdx];
  const renamed = vals.name !== old.name;
  const changed = {};
  EXERCISE_FIELDS.forEach((k) => {
    if ((vals[k] || '') !== (old[k] || '')) changed[k] = vals[k];
  });
  return weeks.map((w, wi) => {
    if (!allWeeks && wi !== weekIdx) return w;
    return {
      ...w,
      days: w.days.map((d, di) => {
        if (di !== dayIdx || !d.exercises) return d;
        return {
          ...d,
          exercises: d.exercises.map((ex, i) => {
            const same = wi === weekIdx ? i === exIdx : ex.name === old.name;
            if (!same) return ex;
            const next = { ...ex, ...changed };
            if (renamed) { delete next.where; delete next.tip; }
            return next;
          }),
        };
      }),
    };
  });
}

export function removeExerciseFromWeeks(weeks, { weekIdx, dayIdx, exIdx, allWeeks }) {
  const old = weeks[weekIdx].days[dayIdx].exercises[exIdx];
  return weeks.map((w, wi) => {
    if (!allWeeks && wi !== weekIdx) return w;
    return {
      ...w,
      days: w.days.map((d, di) => {
        if (di !== dayIdx || !d.exercises) return d;
        return { ...d, exercises: d.exercises.filter((ex, i) => (wi === weekIdx ? i !== exIdx : ex.name !== old.name)) };
      }),
    };
  });
}

// Своя часть резервной копии.
export const planRowsForBackup = (rows) => (rows || []).map((r) => ({
  id: r.id, title: r.title, plan: r.plan, deleted_at: r.deleted_at || null,
}));

export function looksLikePlanRows(rows) {
  return Array.isArray(rows) && rows.every((r) => r && typeof r === 'object'
    && typeof r.id === 'string' && r.id.startsWith('u-') && typeof r.title === 'string'
    && r.plan && typeof r.plan === 'object' && Array.isArray(r.plan.weeks) && Array.isArray(r.plan.weekdays));
}

// Копия другого аккаунта: своих id у её планов здесь нет, они получают новые (как и
// тренировки), а тренировки и профиль переводятся на новые id. Ответ: { rows, planIdOf }.
export function adoptPlanRows(rows, mineIds, suffix) {
  const own = new Set(mineIds);
  const map = {};
  const out = (rows || []).map((r) => {
    if (own.has(r.id)) return r;
    map[r.id] = `${r.id}${suffix}`;
    return { ...r, id: map[r.id] };
  });
  return { rows: out, planIdOf: (id) => map[id] || id };
}

// Правка плана действует со следующей тренировки, а прошлые сверяются с той версией,
// что была на их дату (plans.js → planDayAt). Без тренировок по плану истории не нужно.
export function withHistory(prevStored, nextPlan, hasSessions, today) {
  const history = (prevStored && prevStored.history) || [];
  const changed = prevStored && JSON.stringify(prevStored.weeks) !== JSON.stringify(nextPlan.weeks);
  if (!changed || !hasSessions || history.some((h) => h.before === today)) return { ...nextPlan, history };
  return { ...nextPlan, history: [...history, { before: today, weeks: prevStored.weeks }] };
}
