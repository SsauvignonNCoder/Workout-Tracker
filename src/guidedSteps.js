// Логика пошаговой тренировки без React: список шагов, добавление и замена
// упражнений, секундомер упражнения и сборка итоговой записи для базы.
// Компонент GuidedWorkout только хранит состояние и рисует его.
//
// Главное изменение 1.1.0: у каждого шага есть постоянный id, и ВСЕ записи
// (подходы, заметки, кардио, секторы, секундомеры) хранятся по id шага, а не
// по его номеру. До 1.1.0 ключом был номер шага — это работало, пока список
// шагов не менялся по ходу тренировки. Как только упражнение можно вставить
// посреди тренировки, номера всех последующих шагов сдвигаются, и записанный
// вес «переезжал» бы на соседнее упражнение. С id такого не бывает.

import { bestSetOf } from './bestSet.js';
import {
  isWeightlessExercise, isTimeBasedExercise, parseClock,
} from './tabs/workoutTabHelpers.jsx';
import { cooldownFor } from './cooldown.js';
import { tr } from './i18n.js';
import { num, toDisp, isImperial } from './units.js';

export const SUMMARY_KIND = 'summary';

// Сколько подходов можно задать упражнению. Больше 10 в плане не бывает,
// а ввод «100» по ошибке не должен рисовать сотню карточек.
export const MAX_SETS = 10;

export function clampSets(n) {
  const v = parseInt(n, 10);
  if (!isFinite(v) || v < 1) return 1;
  return Math.min(MAX_SETS, v);
}

export function emptySets(n) {
  return Array.from({ length: clampSets(n) }, () => ({ weight: '', reps: '' }));
}

function setHasData(x) {
  return !!x && ((parseFloat(x.weight) || 0) > 0 || (parseInt(x.reps, 10) || 0) > 0);
}

export function hasSetData(log) {
  return (log || []).some(setHasData);
}

// Есть ли в черновике хоть что-то записанное — порог для напоминания о
// несохранённой тренировке: открыл, посмотрел и вышел — не напоминаем.
// Считаются подходы с весом или повторами; на дне без силовых (кардио, бассейн)
// — записанное кардио.
export function workoutHasData({ steps = [], exLogs = {}, cardioLogs = {}, sectorLogs = {} } = {}) {
  const exSteps = steps.filter((s) => s.kind === 'exercise');
  if (exSteps.some((s) => hasSetData(exLogs[s.id]))) return true;
  if (exSteps.length > 0) return false;
  const cardio = steps.filter((s) => s.kind === 'cardio' || s.kind === 'pool').some((s) => {
    const c = cardioLogs[s.id] || {};
    return (parseFloat(c.distance) || 0) > 0 || (parseInt(c.duration, 10) || 0) > 0;
  });
  const sectors = steps.filter((s) => s.kind === 'sectors').some((s) => {
    const d = sectorLogs[s.id];
    return !!d && (d.sectors || []).some((x) => (parseFloat(x.distance) || 0) > 0 || !!x.clock);
  });
  return cardio || sectors;
}

// Новый размер списка подходов: введённое сохраняем, недостающие добавляем
// пустыми, лишние срезаем с конца.
export function resizeSets(log, n) {
  const size = clampSets(n);
  const cur = (log || []).map((x) => ({ ...x }));
  if (cur.length >= size) return cur.slice(0, size);
  return [...cur, ...emptySets(size - cur.length)];
}

// Сравнение названий без регистра и ё/е — чтобы «замена» на то же самое
// упражнение не считалась заменой.
function sameName(a, b) {
  const n = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
  return n(a) === n(b);
}

let addSeq = 0;
function newStepId() {
  addSeq += 1;
  return `a${Date.now().toString(36)}${addSeq}`;
}

function pushCooldown(out, day) {
  const items = cooldownFor(day);
  if (!items || !items.length) return;
  out.push({
    kind: 'cooldown', title: 'Заминка',
    subtitle: 'Разгрузка и растяжка — 3–4 минуты',
    items,
  });
}

const SUMMARY_STEP = { kind: SUMMARY_KIND, title: 'Итог тренировки', subtitle: 'Сон, энергия и заметки' };

// Упорядоченный список шагов из плана дня.
// Силовой день: разминка на дорожке → упражнения по порядку → дорожка-финишер
// → заминка → итог. Кардио-день: секторы → заминка → итог. Бассейн: бассейн → итог.
// id плановых шагов — «p» + номер в исходном списке: стабильны, пока план тот же,
// а вставленные по ходу шаги получают свои id («a…»), не пересекаясь с ними.
export function buildSteps(day) {
  if (!day) return [];
  let out = [];
  if (day.type === 'strength') {
    // Разминку и финиш на дорожке свой план может выключить для дня (src/userPlans.js).
    if (day.warmupRun !== false) {
      out.push({
        kind: 'cardio', title: 'Разминка на беговой дорожке',
        subtitle: 'Разгони пульс перед работой, 5–10 мин',
        name: 'Разминка (беговая дорожка)',
        fields: { distance: true, speed: true, incline: false, duration: true },
        target: { duration: '5-10' },
      });
    }
    (day.exercises || []).forEach((ex) => {
      out.push({
        kind: 'exercise', name: ex.name,
        plannedSets: clampSets(ex.sets),
        // Сколько подходов в плане: на экране отмечаем, если их добавили или убрали.
        planSets: clampSets(ex.sets),
        targetReps: ex.reps,
        // Что было в плане — нужно, чтобы после замены записать replacedFrom и
        // не показывать пометки плана («скамья», «лёгкий вес») у чужого упражнения.
        plan: { name: ex.name, ...(ex.where ? { where: ex.where } : {}), ...(ex.tip ? { tip: ex.tip } : {}) },
      });
    });
    if (day.finisherRun !== false) {
      out.push({
        kind: 'cardio', finisher: true, title: 'Беговая дорожка · финиш',
        subtitle: 'Уклон 15%, 15–20 минут',
        name: 'Беговая дорожка',
        fields: { distance: true, speed: true, incline: true, duration: true },
        target: { incline: '15', duration: '15-20' },
      });
    }
    pushCooldown(out, day);
    out.push({ ...SUMMARY_STEP });
  } else if (day.type === 'cardio') {
    // Уникальный режим кардио-дня: интервалы по секторам до общей цели.
    out.push({
      kind: 'sectors', title: day.title,
      subtitle: 'Интервалы по секторам до общей цели',
      name: day.cardio.name,
      planDistance: day.cardio.distance, planIncline: day.cardio.incline,
    });
    pushCooldown(out, day);
    out.push({ ...SUMMARY_STEP });
  } else if (day.type === 'pool') {
    out.push({
      kind: 'pool', title: day.title, subtitle: tr('{0} минут', day.cardio.duration || '60'),
      name: day.cardio.name,
      fields: { distance: false, speed: false, incline: false, duration: true },
      target: { duration: day.cardio.duration },
    });
    out.push({ ...SUMMARY_STEP });
  } else {
    out = [];
  }
  return out.map((s, i) => ({ ...s, id: `p${i}` }));
}

// Подсказка веса в пустом поле подхода — доля рекорда по неделе плана.
//   Базовые упражнения (BASE_LIFTS) — диапазон: 1-я неделя 75–80%, 2-я 80–85%,
//     3-я (тяжёлая) — рекорд и выше, 4-я (разгрузка) 70–75%.
//     Исключение 3-й недели: в ЧТ–СБ (объёмные дни) базовые — 80–85%, кроме
//     румынской тяги и жима ногами (week3Light).
//   Остальные — «от»: 1-я 80%+, 2-я 90%+, 3-я 100%+, 4-я 70%+.
// Округление — до шага блинов: 2.5 кг (65 кг × 75% = 48.75 → 50), в фунтах — 5 lb.
// recordKg — рекорд в кг; ответ — строка в единицах экрана («75 – 80», «55+»,
// «100+») или null, если подсказывать нечего.
export const WEEK_LOAD = { 1: [0.75, 0.8], 2: [0.8, 0.85], 3: [1, null], 4: [0.7, 0.75] };
export const WEEK_LOAD_OTHER = { 1: 0.8, 2: 0.9, 3: 1, 4: 0.7 };
// Базовые движения (список — от Никиты, 02.11.2026).
export const BASE_LIFTS = [
  'Жим штанги лёжа', 'Жим штанги узким хватом', 'Румынская тяга со штангой', 'Становая тяга',
  'Приседания со штангой на плечах', 'Жим ногами в тренажёре', 'Тяга штанги в наклоне',
];
const baseKey = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е').trim();
const BASE_SET = new Set(BASE_LIFTS.map(baseKey));
export const isBaseLift = (name) => BASE_SET.has(baseKey(name));

// 3-я неделя в ЧТ–СБ: базовые — 80–85% вместо «рекорд+» (Никита, 03.11.2026);
// румынская и жим ногами — по-прежнему «рекорд+». dayNum — день цикла плана.
export function week3Light(dayNum, name, perWeek = 6) {
  if (!dayNum) return false;
  const weekday = (dayNum - 1) % perWeek; // 0 — ПН … 5 — СБ
  return weekday >= 3 && !/румынск|жим.*ног/i.test(baseKey(name));
}

export function weightHint(recordKg, week, base = true, { light3 = false } = {}) {
  if (!(recordKg > 0)) return null;
  const step = isImperial() ? 5 : 2.5;
  const rec = toDisp('w', recordKg);
  const r = (x) => String(Math.round(x / step) * step);
  if (!base) {
    const p = WEEK_LOAD_OTHER[week];
    if (p == null) return null;
    return p === 1 ? `${num('w', recordKg)}+` : `${r(rec * p)}+`;
  }
  const band = week === 3 && light3 ? [0.8, 0.85] : WEEK_LOAD[week];
  if (!band) return null;
  if (band[1] == null) return `${num('w', recordKg)}+`;
  const lo = r(rec * band[0]);
  const hi = r(rec * band[1]);
  return lo === hi ? lo : `${lo} – ${hi}`;
}

// Пустые записи для шага — при старте тренировки и при вставке нового шага.
export function initialLogsFor(step) {
  if (step.kind === 'exercise') return { ex: emptySets(step.plannedSets) };
  if (step.kind === 'cardio' || step.kind === 'pool') return { cardio: { distance: '', speed: '', incline: '', duration: '' } };
  if (step.kind === 'sectors') {
    // Цель из плана — в км; поле — в единицах экрана (src/units.js).
    return { sectors: { metric: 'distance', target: step.planDistance ? num('d', step.planDistance) : '', sectors: [{ distance: '', speed: '', incline: '', clock: '' }] } };
  }
  return {};
}

export function initialLogs(steps) {
  const exLogs = {}, cardioLogs = {}, sectorLogs = {};
  (steps || []).forEach((s) => {
    const l = initialLogsFor(s);
    if (l.ex) exLogs[s.id] = l.ex;
    if (l.cardio) cardioLogs[s.id] = l.cardio;
    if (l.sectors) sectorLogs[s.id] = l.sectors;
  });
  return { exLogs, cardioLogs, sectorLogs };
}

// Шаг добавленного по ходу тренировки упражнения.
export function makeAddedExerciseStep({ name, sets, reps }) {
  return {
    id: newStepId(),
    kind: 'exercise',
    name: String(name || '').trim(),
    plannedSets: clampSets(sets),
    targetReps: String(reps == null ? '' : reps).trim(),
    added: true,
  };
}

// Куда вставлять добавленное упражнение. С шага упражнения — сразу после него:
// текущее доделываешь, новое идёт следующим. С финишной дорожки — перед ней,
// и новое упражнение сразу становится текущим (дорожка сдвигается на шаг дальше).
export function insertIndexForAdd(steps, curIdx) {
  const cur = steps[curIdx];
  if (!cur) return steps.length;
  if (cur.finisher) return curIdx;
  return curIdx + 1;
}

export function canAddExerciseAt(step) {
  return !!step && (step.kind === 'exercise' || !!step.finisher);
}

export function insertStep(steps, index, step) {
  const i = Math.max(0, Math.min(steps.length, index));
  return [...steps.slice(0, i), step, ...steps.slice(i)];
}

export function removeStep(steps, stepId) {
  return steps.filter((s) => s.id !== stepId);
}

// Перестановка в списке «Далее» (Никита, 11.11.2026): двигаются только упражнения и
// только на место другого упражнения — разминка, дорожка, заминка и итог стоят на
// своих местах. Нельзя — тот же массив.
export function moveStep(steps, from, to) {
  if (from === to || !steps[from] || !steps[to]) return steps;
  if (steps[from].kind !== 'exercise' || steps[to].kind !== 'exercise') return steps;
  const next = steps.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

// Замена упражнения / правка подходов и повторов. id шага не меняется — все
// записи по нему остаются на своих местах, а что с ними делать (сбросить или
// подрезать), решает вызывающий код через planLogAfterEdit.
// replacedFrom — исходное упражнение плана; если вернули плановое — снимается.
export function editExerciseStep(step, { name, sets, reps }) {
  const nextName = String(name || '').trim() || step.name;
  const next = {
    ...step,
    name: nextName,
    plannedSets: clampSets(sets),
    targetReps: String(reps == null ? '' : reps).trim(),
  };
  delete next.replacedFrom;
  if (step.plan && !sameName(nextName, step.plan.name)) next.replacedFrom = step.plan.name;
  return next;
}

export function isRenamed(step, name) {
  return !sameName(step.name, String(name || '').trim() || step.name);
}

// Что станет с подходами после правки и нужно ли переспросить.
// Другое упражнение — записанный вес к нему не относится, подходы обнуляются.
// То же упражнение с меньшим числом подходов — срезаются последние; если в них
// что-то записано, это потеря данных, тоже переспрашиваем.
export function planLogAfterEdit(step, log, { name, sets }) {
  const renamed = isRenamed(step, name);
  const n = clampSets(sets);
  if (renamed) return { log: emptySets(n), losesData: hasSetData(log) };
  const cut = (log || []).slice(n);
  return { log: resizeSets(log, n), losesData: hasSetData(cut) };
}

// Пометки плана показываем, только пока упражнение не заменено.
export function planNotesOf(step) {
  if (!step || !step.plan || step.replacedFrom) return null;
  return step.plan;
}

// ---- Секундомер упражнения ----
// { acc: секунды, накопленные до последней паузы; since: метка запуска или null }.
// Считаем от меток времени, а не тиканьем: когда экран гаснет, интервалы
// замирают, а метка — нет.
export function swElapsed(sw, now = Date.now()) {
  if (!sw) return 0;
  const run = sw.since ? Math.max(0, (now - sw.since) / 1000) : 0;
  return Math.max(0, Math.floor((sw.acc || 0) + run));
}

export function swIsRunning(sw) {
  return !!(sw && sw.since);
}

export function swPause(sw, now = Date.now()) {
  if (!sw || !sw.since) return sw || null;
  return { acc: (sw.acc || 0) + Math.max(0, (now - sw.since) / 1000), since: null };
}

export function swToggle(sw, now = Date.now()) {
  if (swIsRunning(sw)) return swPause(sw, now);
  return { acc: (sw && sw.acc) || 0, since: now };
}

// Остановить все бегущие секундомеры (переход на другой шаг, восстановление черновика).
export function pauseAllTimers(timers, at = Date.now()) {
  const out = {};
  let changed = false;
  Object.keys(timers || {}).forEach((k) => {
    const sw = timers[k];
    if (swIsRunning(sw)) { out[k] = swPause(sw, at); changed = true; } else out[k] = sw;
  });
  return changed ? out : timers;
}

// Секундомер идёт, пока ты на упражнении: при входе на шаг-упражнение
// он запускается сам и продолжает накопленное, все остальные встают на паузу.
// stepId = null (кардио, заминка, итог) — стоят все. Ничего не поменялось —
// тот же объект.
export function runOnlyTimer(timers, stepId, now = Date.now()) {
  const src = timers || {};
  const out = {};
  let changed = false;
  Object.keys(src).forEach((k) => {
    const sw = src[k];
    if (k !== stepId && swIsRunning(sw)) { out[k] = swPause(sw, now); changed = true; } else out[k] = sw;
  });
  if (stepId && !swIsRunning(src[stepId])) {
    out[stepId] = { acc: (src[stepId] && src[stepId].acc) || 0, since: now };
    changed = true;
  }
  return changed ? out : timers;
}

// Восстановление черновика. Секундомер упражнения, на котором закрыли
// приложение, идёт дальше, и время, пока оно было закрыто, засчитывается: со
// шага никто не уходил. Но только после короткого перерыва. После долгого это
// брошенная тренировка, и секундомер встаёт на моменте записи черновика (он
// пишется и при сворачивании), дальше пойдёт с «сейчас». Остальные — на паузу.
export const TIMER_RESUME_GAP_MS = 30 * 60 * 1000;

export function restoreTimers(timers, curStepId, savedAt, now = Date.now()) {
  const at = Math.min(savedAt || now, now);
  const keepCur = now - at <= TIMER_RESUME_GAP_MS;
  const out = {};
  Object.keys(timers || {}).forEach((k) => {
    const sw = timers[k];
    out[k] = swIsRunning(sw) && !(keepCur && k === curStepId) ? swPause(sw, at) : sw;
  });
  return out;
}

// Коды секторов вида «1A, 1B, 2A…»: цифра — километр по нарастающей дистанции
// (0–1 км → «1», 1–2 км → «2», …), буква — порядковый сектор внутри этого километра.
// Километр определяется по суммарной дистанции ДО начала сектора. Если дистанции
// нет (кардио по времени) — все попадают в «1», буквы идут подряд.
export function sectorCodes(sectors) {
  let cum = 0;
  const counts = {};
  return (sectors || []).map((s) => {
    const km = Math.floor(cum) + 1;
    const li = counts[km] || 0;
    counts[km] = li + 1;
    const letter = li < 26 ? String.fromCharCode(65 + li) : String(li + 1);
    cum += parseFloat(s.distance) || 0;
    return `${km}${letter}`;
  });
}

// Название маршрута с первого секторного шага, где он был выбран. Этап
// дописываем, чтобы «этап 2 из 3» не потерялся в истории.
export function pickedRouteName(steps, sectorLogs) {
  for (const s of steps || []) {
    if (s.kind !== 'sectors') continue;
    const c = sectorLogs && sectorLogs[s.id] && sectorLogs[s.id].climb;
    // Это данные (route_name): по-русски, как записано; на экран — routeTitle (i18n.js).
    if (c && c.name) return c.stages > 1 ? `${c.name} · этап ${c.stage}/${c.stages}` : c.name;
  }
  return null;
}

// Сборка записи тренировки из состояния гида. null — записывать нечего.
export function buildGuidedSession({
  steps, exLogs = {}, exNotes = {}, exTimers = {}, cardioLogs = {}, sectorLogs = {},
  summary = {}, workoutDate, dayPlan, planId, startedAt, now = Date.now(), id,
  durationSec: totalSec = null,
}) {
  // Упражнения → агрегат (число) + setLog + заметка. Пустые (без данных и заметки) пропускаем.
  const outEx = [];
  (steps || []).forEach((s) => {
    if (s.kind !== 'exercise') return;
    const log = exLogs[s.id] || [];
    const timed = isTimeBasedExercise(s.name);
    const weightless = isWeightlessExercise(s.name) || timed;
    const filled = log.filter(setHasData);
    const note = (exNotes[s.id] || '').trim();
    if (filled.length === 0 && !note) return;
    // Итоги — по лучшему подходу (src/bestSet.js): рабочий вес и максимум
    // повторов с ним. Раньше брались повторы последнего подхода с этим весом.
    const best = bestSetOf(weightless ? filled.map((x) => ({ weight: 0, reps: x.reps })) : filled) || { weight: 0, reps: 0 };
    const maxW = best.weight, repsAtMax = best.reps, maxReps = best.reps;
    const durationSec = swElapsed(exTimers[s.id], now);
    outEx.push({
      name: s.name,
      weight: weightless ? 0 : maxW,
      reps: weightless ? maxReps : repsAtMax,
      sets: Math.max(1, filled.length || s.plannedSets),
      setLog: filled.map((x) => ({
        weight: weightless ? 0 : (parseFloat(x.weight) || 0),
        reps: parseInt(x.reps, 10) || 0,
      })),
      ...(timed ? { timed: true } : {}),
      ...(note ? { note } : {}),
      ...(durationSec > 0 ? { durationSec } : {}),
      ...(s.replacedFrom ? { replacedFrom: s.replacedFrom } : {}),
      ...(s.added ? { added: true } : {}),
    });
  });

  const outCardio = [];
  (steps || []).forEach((s) => {
    if (s.kind !== 'cardio' && s.kind !== 'pool') return;
    const c = cardioLogs[s.id] || {};
    const dist = parseFloat(c.distance) || 0, spd = parseFloat(c.speed) || 0;
    const incl = parseFloat(c.incline) || 0, dur = parseInt(c.duration, 10) || 0;
    if (dist <= 0 && spd <= 0 && incl <= 0 && dur <= 0) return;
    outCardio.push({ name: s.name, distance: dist, speed: spd, incline: incl, duration: dur });
  });

  // Секторы кардио-дня — каждый сектор отдельной записью «Сектор 1A/1B/…».
  // Время вводится как нарастающее показание таймера дорожки (мм:сс); длительность
  // самого сектора (дельту) считаем как разницу с предыдущим сектором.
  (steps || []).forEach((s) => {
    if (s.kind !== 'sectors') return;
    const data = sectorLogs[s.id];
    if (!data) return;
    const codes = sectorCodes(data.sectors);
    let prevCum = 0;
    (data.sectors || []).forEach((sec, si) => {
      const cumSec = parseClock(sec.clock);
      const dist = parseFloat(sec.distance) || 0, spd = parseFloat(sec.speed) || 0, incl = parseFloat(sec.incline) || 0;
      if (dist <= 0 && spd <= 0 && incl <= 0 && cumSec <= 0) return;
      const deltaSec = cumSec > 0 ? Math.max(0, cumSec - prevCum) : 0;
      if (cumSec > 0) prevCum = cumSec;
      outCardio.push({
        name: `Сектор ${codes[si]}`,
        distance: dist, speed: spd, incline: incl,
        duration: deltaSec ? Math.round(deltaSec / 60) : 0,
        durationSec: deltaSec || 0,
      });
    });
  });

  if (outEx.length === 0 && outCardio.length === 0) return null;

  return {
    id: id || `${workoutDate}-${now}`,
    date: workoutDate,
    exercises: outEx,
    cardio: outCardio,
    sleep: summary.sleep ? Math.max(0, parseFloat(summary.sleep)) : null,
    energy: summary.energy || 3,
    difficulty: summary.difficulty || null,
    // Длительность — по часам тренировки (на шаге «Итог» они стоят); без них —
    // от старта до сохранения, как раньше.
    durationSec: Math.max(0, Math.round(totalSec != null ? totalSec : (now - startedAt) / 1000)),
    feeling: (summary.feeling || '').trim(),
    programDay: (dayPlan && dayPlan.day) || null,
    planId: planId || null,
    // Если на кардио-дне был выбран готовый маршрут — сохраняем его название,
    // чтобы в «Прогрессе» тренировка называлась «Озеро Зеркальное», а не
    // безликим «Кардио по секторам».
    routeName: pickedRouteName(steps, sectorLogs),
  };
}

// Подсказка веса в своём плане: проценты недели от рекорда, если они заданы, иначе вес
// с прошлого раза. Округление — как у встроенных (weightHint). Подсказать нечего — null.
export function customWeightHint({ recordKg, lastKg, load }) {
  if (load && recordKg > 0) {
    const step = isImperial() ? 5 : 2.5;
    const rec = toDisp('w', recordKg);
    const r = (x) => String(Math.round(x / step) * step);
    const lo = r(rec * (load[0] / 100));
    if (load[1] == null) return `${lo}+`;
    const hi = r(rec * (load[1] / 100));
    return lo === hi ? lo : `${lo} – ${hi}`;
  }
  return lastKg > 0 ? num('w', lastKg) : null;
}

// Вес с прошлого раза: рабочий вес упражнения в самой свежей тренировке, где он был.
export function lastWeightOf(history, name) {
  let best = { date: '', kg: 0 };
  (history || []).forEach((s) => {
    if (!s.date || s.date < best.date) return;
    (s.exercises || []).forEach((ex) => {
      const kg = Number(ex.weight) || 0;
      if (ex.name === name && kg > 0) best = { date: s.date, kg };
    });
  });
  return best.kg;
}

// ---- Черновик v3 ----
// Проверка, что сохранённый черновик относится к ЭТОЙ тренировке и цел.
// earlier — подходит и черновик того же дня плана с более ранней даты.
export function draftMatches(d, { planId, day, date }, { earlier = false } = {}) {
  if (!d || d.v !== 3) return false;
  if (d.planId !== planId || d.day !== day) return false;
  if (earlier ? !(d.date <= date) : d.date !== date) return false;
  if (!Array.isArray(d.steps) || d.steps.length === 0) return false;
  return d.steps.every((s) => s && typeof s.id === 'string' && typeof s.kind === 'string');
}
