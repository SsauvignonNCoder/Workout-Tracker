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

import {
  isWeightlessExercise, isTimeBasedExercise, parseClock,
} from './tabs/workoutTabHelpers.jsx';
import { cooldownFor } from './cooldown.js';

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
    out.push({
      kind: 'cardio', title: 'Разминка на беговой дорожке',
      subtitle: 'Разгони пульс перед работой, 5–10 мин',
      name: 'Разминка (беговая дорожка)',
      fields: { distance: true, speed: true, incline: false, duration: true },
      target: { duration: '5-10' },
    });
    (day.exercises || []).forEach((ex) => {
      out.push({
        kind: 'exercise', name: ex.name,
        plannedSets: clampSets(ex.sets),
        targetReps: ex.reps,
        // Что было в плане — нужно, чтобы после замены записать replacedFrom и
        // не показывать пометки плана («скамья», «лёгкий вес») у чужого упражнения.
        plan: { name: ex.name, ...(ex.where ? { where: ex.where } : {}), ...(ex.tip ? { tip: ex.tip } : {}) },
      });
    });
    out.push({
      kind: 'cardio', finisher: true, title: 'Беговая дорожка · финиш',
      subtitle: 'Уклон 15%, 15–20 минут',
      name: 'Беговая дорожка',
      fields: { distance: true, speed: true, incline: true, duration: true },
      target: { incline: '15', duration: '15-20' },
    });
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
      kind: 'pool', title: day.title, subtitle: `${day.cardio.duration || '60'} минут`,
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

// Пустые записи для шага — при старте тренировки и при вставке нового шага.
export function initialLogsFor(step) {
  if (step.kind === 'exercise') return { ex: emptySets(step.plannedSets) };
  if (step.kind === 'cardio' || step.kind === 'pool') return { cardio: { distance: '', speed: '', incline: '', duration: '' } };
  if (step.kind === 'sectors') {
    return { sectors: { metric: 'distance', target: step.planDistance || '', sectors: [{ distance: '', speed: '', incline: '', clock: '' }] } };
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
    if (c && c.name) return c.stages > 1 ? `${c.name} · этап ${c.stage}/${c.stages}` : c.name;
  }
  return null;
}

// Сборка записи тренировки из состояния гида. null — записывать нечего.
export function buildGuidedSession({
  steps, exLogs = {}, exNotes = {}, exTimers = {}, cardioLogs = {}, sectorLogs = {},
  summary = {}, workoutDate, dayPlan, planId, startedAt, now = Date.now(), id,
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
    let maxW = 0, repsAtMax = 0, maxReps = 0;
    filled.forEach((x) => {
      const w = parseFloat(x.weight) || 0;
      const r = parseInt(x.reps, 10) || 0;
      if (w >= maxW) { maxW = w; repsAtMax = r || repsAtMax; }
      if (r > maxReps) maxReps = r;
    });
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
    durationSec: Math.max(0, Math.round((now - startedAt) / 1000)),
    feeling: (summary.feeling || '').trim(),
    programDay: (dayPlan && dayPlan.day) || null,
    planId: planId || null,
    // Если на кардио-дне был выбран готовый маршрут — сохраняем его название,
    // чтобы в «Прогрессе» тренировка называлась «Озеро Зеркальное», а не
    // безликим «Кардио по секторам».
    routeName: pickedRouteName(steps, sectorLogs),
  };
}

// ---- Черновик v3 ----
// Проверка, что сохранённый черновик относится к ЭТОЙ тренировке и цел.
export function draftMatches(d, { planId, day, date }) {
  if (!d || d.v !== 3) return false;
  if (d.planId !== planId || d.day !== day || d.date !== date) return false;
  if (!Array.isArray(d.steps) || d.steps.length === 0) return false;
  return d.steps.every((s) => s && typeof s.id === 'string' && typeof s.kind === 'string');
}
