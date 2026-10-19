// Сводка в конце пошаговой тренировки: где был рост, где спад или застой, какие
// рекорды побиты. Чистые функции — их прогоняют тесты; показывает SummaryStep.
//
// С ЧЕМ СРАВНИВАЕМ. С прошлым разом, когда делалось то же упражнение (по
// названию). Разгрузочные тренировки в основу не берём, если сейчас не
// разгрузка: иначе первая неделя нового цикла «прибавляла» бы к облегчённым весам.
//
// ЧТО СРАВНИВАЕМ. Лучший подход: сначала вес, при равном весе — повторы. У
// упражнений без веса — повторы.
//
// НЕДЕЛЯ ПЛАНА. У недель порядок тяжести: разгрузка (4-я) < 1-я < 2-я < 3-я. Если
// эта неделя легче той, с которой сравниваем (4-я после 3-й, новая 1-я после
// прошлой 3-й), спад — не спад, а «по плану». Если не легче — спад засчитывается.
//
// ЧТО НЕ СРАВНИВАЕМ. Кор (планка, скручивания, подъём ног, пресс) и упражнения на
// время. Кардио, разминка и заминка — не упражнения с подходами, их тут нет.
// Упражнение впервые — сравнивать не с чем, оно помечается «новое».

import { getPlan, planWeekOf } from './plans.js';
import {
  categorizeExercise, MUSCLE_GROUPS, isWeightlessExercise, isTimeBasedExercise,
} from './tabs/workoutTabHelpers.jsx';

const norm = (s) => String(s || '').trim().toLowerCase().replace(/ё/g, 'е');
const num = (v) => { const n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isFinite(n) ? n : 0; };

export function isSummaryExcluded(name) {
  return isTimeBasedExercise(name) || categorizeExercise(name) === MUSCLE_GROUPS.core;
}

// Лучший подход из списка {weight, reps}: максимальный вес, при нём — максимум
// повторов. Без веса — максимум повторов. Пусто — null.
export function topSet(sets, weightless) {
  let best = null;
  (sets || []).forEach((x) => {
    const w = weightless ? 0 : num(x.weight);
    const r = Math.round(num(x.reps));
    if (r <= 0 && w <= 0) return;
    if (!best || w > best.weight || (w === best.weight && r > best.reps)) best = { weight: w, reps: r };
  });
  return best;
}

// Лучший подход упражнения из сохранённой тренировки: по подходам, если они
// записаны, иначе — по итоговым весу и повторам записи.
function topSetOfSaved(ex, weightless) {
  if (Array.isArray(ex.setLog) && ex.setLog.length > 0) return topSet(ex.setLog, weightless);
  return topSet([{ weight: ex.weight, reps: ex.reps }], weightless);
}

// Неделя тренировки в цикле и её «тяжесть»: разгрузка — 0, остальные — номер недели.
// Вне плана — null (тогда ни с чем не сравниваем по тяжести).
export function weekInfo(planId, day) {
  if (!day) return null;
  const plan = getPlan(planId);
  const week = planWeekOf(plan, day);
  // weekLabels — объект { 1: 'База', …, 4: 'Разгрузка' }, ключ — номер недели.
  const label = (plan.weekLabels && plan.weekLabels[week]) || '';
  const deload = /разгруз/i.test(label);
  return { week, deload, rank: deload ? 0 : week, label };
}

function cmp(a, b) {
  if (a.weight !== b.weight) return a.weight > b.weight ? 1 : -1;
  if (a.reps !== b.reps) return a.reps > b.reps ? 1 : -1;
  return 0;
}

function fmtSet(s, weightless) {
  return weightless || !s.weight ? `${s.reps} повт` : `${s.weight}×${s.reps}`;
}

function fmtDelta(cur, base, weightless) {
  const r1 = (n) => Math.round(n * 10) / 10;
  if (!weightless && cur.weight !== base.weight) {
    const d = r1(cur.weight - base.weight);
    return `${d > 0 ? '+' : '−'}${Math.abs(d)} кг`;
  }
  const d = cur.reps - base.reps;
  return d === 0 ? '=' : `${d > 0 ? '+' : '−'}${Math.abs(d)} повт`;
}

// Насколько вырос / упал результат — для выбора «лучшего» и «худшего». Прибавка
// в весе весит больше, чем такая же в процентах прибавка в повторах.
function changeScore(cur, base, weightless) {
  if (!weightless && cur.weight !== base.weight && base.weight > 0) return (cur.weight - base.weight) / base.weight;
  if (base.reps > 0) return ((cur.reps - base.reps) / base.reps) * 0.5;
  return 0;
}

// Разбор одного упражнения текущей тренировки.
//   history — сохранённые тренировки (все раньше текущей), current — { planId, day }.
export function compareExercise({ name, sets, history, records, current }) {
  const weightless = isWeightlessExercise(name);
  const cur = topSet(sets, weightless);
  if (!cur) return null;
  if (isSummaryExcluded(name)) return null;

  const key = norm(name);
  const curWeek = weekInfo(current && current.planId, current && current.day);
  // Прошлые подходы этого упражнения, свежие первыми.
  const past = [];
  (history || []).forEach((s) => {
    (s.exercises || []).forEach((ex) => {
      if (norm(ex.name) !== key) return;
      const top = topSetOfSaved(ex, weightless);
      if (!top) return;
      past.push({ date: s.date, top, week: weekInfo(s.planId, s.programDay) });
    });
  });
  past.sort((a, b) => b.date.localeCompare(a.date));

  const curDeload = !!(curWeek && curWeek.deload);
  const usable = past.filter((p) => curDeload || !(p.week && p.week.deload));
  const base = usable[0] || null;

  const rec = records && records[name];
  // Рекорд — только если прежний рекорд был: первый раз — это «новое», а не рекорд.
  const isRecord = weightless
    ? !!(rec && !rec.weight && rec.metric === 'reps' && cur.reps > (rec.value || 0))
    : !!(rec && rec.weight && cur.weight > rec.weight);

  const item = { name, weightless, current: cur, currentText: fmtSet(cur, weightless), isRecord };
  if (!base) return { ...item, outcome: 'new' };

  const c = cmp(cur, base.top);
  let outcome = c > 0 ? 'up' : c < 0 ? 'down' : 'same';
  if (outcome === 'down' && curWeek && base.week && curWeek.rank < base.week.rank) outcome = 'planned';

  // Сколько тренировок подряд (включая эту) без роста — для застоя.
  let stuck = 0;
  if (outcome === 'same') {
    stuck = 2;
    for (let i = 1; i < usable.length && cmp(usable[i].top, base.top) === 0; i += 1) stuck += 1;
  }

  return {
    ...item,
    outcome,
    base: base.top,
    baseText: fmtSet(base.top, weightless),
    baseDate: base.date,
    delta: fmtDelta(cur, base.top, weightless),
    score: changeScore(cur, base.top, weightless),
    stuck,
    planned: outcome === 'planned' ? (curDeload ? 'разгрузка' : 'новый цикл') : null,
  };
}

// Сводка тренировки: лучший рост, худшее (спад, иначе самый долгий застой),
// все новые рекорды и счётчики. exercises — [{ name, sets }] текущей тренировки.
export function buildWorkoutSummary({ exercises, history, records, current }) {
  const items = (exercises || [])
    .map((e) => compareExercise({ name: e.name, sets: e.sets, history, records, current }))
    .filter(Boolean);
  if (items.length === 0) return null;

  const ups = items.filter((i) => i.outcome === 'up').sort((a, b) => b.score - a.score);
  const downs = items.filter((i) => i.outcome === 'down').sort((a, b) => a.score - b.score);
  const sames = items.filter((i) => i.outcome === 'same').sort((a, b) => b.stuck - a.stuck);
  const planned = items.filter((i) => i.outcome === 'planned');
  const curWeek = weekInfo(current && current.planId, current && current.day);

  const counts = {
    up: ups.length, same: sames.length, down: downs.length, planned: planned.length,
    new: items.filter((i) => i.outcome === 'new').length, total: items.length,
  };
  const best = ups[0] || null;
  const worst = downs[0] || sames[0] || null;
  const newRecords = items.filter((i) => i.isRecord && i !== best);
  // Спокойная строка вместо «спада», если всё просевшее — по плану.
  const plannedNote = planned.length > 0 && !downs.length
    ? (curWeek && curWeek.deload ? 'Разгрузка: веса легче — так и задумано' : 'Новый цикл: веса ниже тяжёлой недели — так и задумано')
    : null;

  if (!best && !worst && newRecords.length === 0 && !plannedNote && counts.new === 0) return null;
  return { best, worst, records: newRecords, counts, plannedNote, items };
}
