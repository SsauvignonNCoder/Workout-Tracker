// Экспорт результатов недели в Markdown.
//
// Идея: у каждой сохранённой тренировки есть programDay (1..24) — привязка к дню
// плана, и с 1.1.0 planId — к какому именно плану (src/plans.js). 24-дневный цикл
// повторяет одни и те же шаблоны дней каждые 6 program-дней (в плане 1 день 1 =
// день 7 = день 13 = день 19 = «Грудь, спина, плечи»), поэтому «прошлая неделя»
// естественно ложится на предыдущую календарную неделю с тем же набором упражнений.
// Номер дня без плана ничего не значит: «день 7» в двух планах — разные тренировки,
// поэтому каждая запись сверяется с днём СВОЕГО плана.
//
// Что показываем по каждой неделе:
//  - выполненный результат по каждому упражнению (вес × повторы × подходы);
//  - дельту к прошлой календарной неделе (прогрессия ▲/▼);
//  - личный рекорд (🏆 PR если побит максимум до этой недели, иначе рекорд как ориентир);
//  - упражнения из плана, которые НЕ записаны → помечаются «⚠️ пропущено»;
//  - целиком пропущенные плановые дни → «⚠️ пропущен».

import { shiftDate, fmtDateShort, fmtDateFull, todayISO } from './dateUtils.js';
import { getMonday, computeRecords } from './gamification.js';
import { isWeightlessExercise, secToClock } from './tabs/workoutTabHelpers.jsx';
import { getPlan, planWeekOf, DEFAULT_PLAN_ID } from './plans.js';

// Номер недели программы (1..4) для program-дня. Длина недели берётся из плана
// (plans.js, daysPerWeek); до 1.1.0 делитель 6 был зашит числом в трёх местах.
export function programWeekOf(day, plan = getPlan(DEFAULT_PLAN_ID)) {
  return planWeekOf(plan, day);
}

function planOfSession(s) {
  return getPlan((s && s.planId) || DEFAULT_PLAN_ID);
}

// Аккуратный вывод числа: целые без дробной части, дробные — до 2 знаков.
function fmtNum(n) {
  const num = Number(n);
  if (!isFinite(num)) return String(n ?? '');
  return Number.isInteger(num) ? String(num) : String(Math.round(num * 100) / 100);
}

// Нормализация имени упражнения для сопоставления плана и записи:
// нижний регистр, ё→е, убираем скобки/кавычки, схлопываем пробелы.
function normName(name) {
  return (name || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[«»"'`]/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Экранируем символы, ломающие ячейку таблицы Markdown.
function cell(s) {
  return String(s ?? '').replace(/\s*\n\s*/g, ' ').replace(/\|/g, '\\|');
}

const TABLE_HEADER = ['| Упражнение | Результат | vs прошл. неделя | Рекорд |', '| --- | --- | --- | --- |'];

function fmtExerciseResult(ex) {
  const sets = Number(ex.sets) || 1;
  const setsPart = sets > 1 ? ` × ${sets} подх` : '';
  if (isWeightlessExercise(ex.name) || !ex.weight) {
    return `${ex.reps} повт${setsPart}`;
  }
  return `${fmtNum(ex.weight)} кг × ${ex.reps} повт${setsPart}`;
}

function fmtCardioResult(c) {
  const isPool = (c.name || '').toLowerCase().includes('бассейн');
  if (isPool) return c.duration ? `${fmtNum(c.duration)} мин` : '—';
  const parts = [];
  if (c.distance) parts.push(`${fmtNum(c.distance)} км`);
  if (c.speed) parts.push(`${fmtNum(c.speed)} км/ч`);
  if (c.incline) parts.push(`накл. ${fmtNum(c.incline)}%`);
  if (c.duration) parts.push(`${fmtNum(c.duration)} мин`);
  return parts.join(' · ') || '—';
}

// Разбивка по подходам: «50×5, 55×4, 55×3» (для упражнений без веса — только повторы).
// setLog сохраняется пошаговым режимом (GuidedWorkout) по каждому подходу отдельно.
function fmtSetLog(ex) {
  const weightless = isWeightlessExercise(ex.name) || !ex.weight;
  return (ex.setLog || []).map((s) => {
    const w = Number(s.weight) || 0;
    const r = Number(s.reps) || 0;
    return (weightless || !w) ? `${r}` : `${fmtNum(w)}×${r}`;
  }).join(', ');
}

// Блок «Подходы и заметки» под таблицей дня: пофактическая разбивка по подходам
// (видно, где повторы просели), время по секундомеру упражнения (1.1.0) и
// заметка, которую ты писал к упражнению.
function pushExerciseDetails(lines, exercises) {
  const rows = [];
  (exercises || []).forEach((ex) => {
    const parts = [];
    if ((ex.setLog || []).length) parts.push(`подходы: ${fmtSetLog(ex)}`);
    if (ex.durationSec > 0) parts.push(`время ${secToClock(ex.durationSec)}`);
    const note = (ex.note || '').trim();
    if (note) parts.push(`_«${note.replace(/\s*\n\s*/g, ' ')}»_`);
    if (parts.length) rows.push(`- **${ex.name}** — ${parts.join(' · ')}`);
  });
  if (rows.length) {
    lines.push('');
    lines.push('**Подходы и заметки:**');
    rows.forEach((r) => lines.push(r));
  }
}

// Лучшая (по весу, при равенстве — по повторам) запись каждого упражнения за список тренировок.
function buildExerciseMap(sessionList) {
  const map = {};
  (sessionList || []).forEach((s) => {
    (s.exercises || []).forEach((ex) => {
      const key = normName(ex.name);
      const w = Number(ex.weight) || 0;
      const r = Number(ex.reps) || 0;
      const prev = map[key];
      const pw = prev ? Number(prev.weight) || 0 : -1;
      const pr = prev ? Number(prev.reps) || 0 : -1;
      if (!prev || w > pw || (w === pw && r > pr)) {
        map[key] = { weight: ex.weight, reps: ex.reps, sets: ex.sets };
      }
    });
  });
  return map;
}

// Дельта к прошлой неделе.
function deltaVsPrev(ex, prevMap) {
  const prev = prevMap[normName(ex.name)];
  if (!prev) return '—';
  const weightless = isWeightlessExercise(ex.name) || !ex.weight;
  if (weightless) {
    const d = (Number(ex.reps) || 0) - (Number(prev.reps) || 0);
    if (d > 0) return `+${d} повт ▲`;
    if (d < 0) return `${d} повт ▼`;
    return '=';
  }
  const dw = Math.round(((Number(ex.weight) || 0) - (Number(prev.weight) || 0)) * 100) / 100;
  if (dw > 0) return `+${fmtNum(dw)} кг ▲`;
  if (dw < 0) return `${fmtNum(dw)} кг ▼`;
  const dr = (Number(ex.reps) || 0) - (Number(prev.reps) || 0);
  if (dr > 0) return `= вес, +${dr} повт`;
  if (dr < 0) return `= вес, ${dr} повт`;
  return '=';
}

// Пометка рекорда относительно личного максимума, установленного ДО этой недели.
// priorRecords — computeRecords по всем тренировкам с датой раньше начала недели.
// Так «🏆 PR» означает именно новый рекорд, а не первую запись упражнения.
function recordMark(ex, priorRecords) {
  if (isWeightlessExercise(ex.name) || !ex.weight) return '—';
  const w = Number(ex.weight) || 0;
  const pr = priorRecords[ex.name];
  // Рекорд бывает двух форм: по весу ({weight, reps}) и безвесовой ({metric, value}).
  // Если раньше упражнение писалось без веса (например, подтягивания со своим
  // весом), а теперь с довеском, то pr.weight здесь undefined. Раньше это давало
  // строку «рекорд  кг» с пустым числом, и настоящий PR не отмечался вовсе —
  // ведь сравнения с undefined все ложны. Веса для сравнения нет → это первый
  // весовой результат по упражнению, то есть «новое».
  if (!pr || !pr.weight) return '🆕 новое';
  if (w > pr.weight) return `🏆 PR (+${fmtNum(w - pr.weight)} кг)`;
  if (w === pr.weight) return `= PR (${fmtNum(pr.weight)} кг)`;
  return `рекорд ${fmtNum(pr.weight)} кг`;
}

// Замеры веса, попавшие в календарную неделю, начинающуюся с weekStart.
function weightsInWeek(measurements, weekStart) {
  const weekEnd = shiftDate(weekStart, 6);
  return (measurements || [])
    .filter((m) => m && m.date >= weekStart && m.date <= weekEnd && m.weight != null)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));
}

function avgWeight(list) {
  const vals = list.map((m) => Number(m.weight)).filter((w) => isFinite(w) && w > 0);
  if (!vals.length) return null;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
}

function tonnage(sessionList) {
  let sum = 0;
  (sessionList || []).forEach((s) => (s.exercises || []).forEach((ex) => {
    sum += (Number(ex.weight) || 0) * (Number(ex.reps) || 0) * (Number(ex.sets) || 1);
  }));
  return sum;
}

// Список недель с записями (для выпадающего меню выбора).
export function listExportableWeeks(sessions) {
  const counts = new Map();
  (sessions || []).forEach((s) => {
    const wk = getMonday(s.date);
    counts.set(wk, (counts.get(wk) || 0) + 1);
  });
  return [...counts.entries()]
    .map(([weekStart, count]) => ({ weekStart, weekEnd: shiftDate(weekStart, 6), count }))
    .sort((a, b) => b.weekStart.localeCompare(a.weekStart));
}

export function weekFilename(weekStart) {
  return `trenirovki-nedelya-${weekStart}.md`;
}

// На какой день программы похожи фактически сделанные упражнения. Нужен, когда
// день заменён: вместо «всё пропущено» отчёт пишет, чем его заменили.
// Считаем совпадения по нормализованным именам и берём шаблон с лучшим счётом.
function guessDayTitle(exercises, plan) {
  const names = (exercises || []).map((e) => normName(e.name)).filter(Boolean);
  if (!names.length) return null;
  let best = null, bestHits = 0;
  const seen = new Set();
  plan.days.forEach((d) => {
    if (d.type !== 'strength' || seen.has(d.title)) return;
    seen.add(d.title);
    const plan = (d.exercises || []).map((e) => normName(e.name));
    const hits = names.filter((n) => plan.includes(n)).length;
    if (hits > bestHits) { bestHits = hits; best = d.title; }
  });
  // Меньше половины совпадений — уверенности нет, лучше промолчать.
  return bestHits >= Math.max(2, Math.ceil(names.length / 2)) ? best : null;
}

// Собирает Markdown-отчёт по календарной неделе, начинающейся с weekStart (понедельник, ISO).
export function buildWeekMarkdown(weekStart, allSessions, opts = {}) {
  // Рекорды, установленные ДО начала недели — чтобы «🏆 PR» отмечал именно новый максимум.
  const priorRecords = computeRecords((allSessions || []).filter((s) => s.date < weekStart));
  const weekEnd = shiftDate(weekStart, 6);
  const inWeek = (allSessions || [])
    .filter((s) => getMonday(s.date) === weekStart)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));

  const lines = [];
  lines.push(`# Дневник тренировок — неделя ${fmtDateShort(weekStart)} – ${fmtDateShort(weekEnd)} ${weekStart.slice(0, 4)}`);
  lines.push('');

  if (inWeek.length === 0) {
    lines.push('_За эту неделю нет записей._');
    lines.push('');
    return lines.join('\n');
  }

  const prevWeekStart = shiftDate(weekStart, -7);
  const prevInWeek = (allSessions || []).filter((s) => getMonday(s.date) === prevWeekStart);
  const prevMap = buildExerciseMap(prevInWeek);

  // Программная неделя у календарной ОДНА — та, в которую попало больше записей.
  // Раньше здесь собирались все встреченные недели и плановыми считались ВСЕ их
  // дни: если неделя легла на стык (дни 11–14 из одной, 17–18 из следующей),
  // выходило 12 плановых дней вместо шести, и половина из них — «пропущено»,
  // хотя четыре были сделаны на прошлой календарной неделе, а два ещё впереди.
  //
  // С 1.1.0 неделя считается вместе с планом: в неделю переключения плана
  // записи могут относиться к двум планам сразу. Главная — пара (план, неделя)
  // с большим числом записей; при равенстве — та, где запись позже по дате
  // (то есть план, который ведётся сейчас), затем — с большим номером недели.
  const keyOf = (s) => `${planOfSession(s).id}:${s.programDay}`;
  const tally = new Map();
  inWeek.forEach((s) => {
    if (!s.programDay) return;
    const p = planOfSession(s);
    const week = planWeekOf(p, s.programDay);
    const k = `${p.id}|${week}`;
    const cur = tally.get(k) || { plan: p, week, count: 0, lastDate: '' };
    cur.count += 1;
    if (s.date > cur.lastDate) cur.lastDate = s.date;
    tally.set(k, cur);
  });
  const main = [...tally.values()]
    .sort((a, b) => (b.count - a.count) || b.lastDate.localeCompare(a.lastDate) || (b.week - a.week))[0] || null;
  const mainPlan = main ? main.plan : null;

  const sessionByKey = {};
  inWeek.forEach((s) => { if (s.programDay && !sessionByKey[keyOf(s)]) sessionByKey[keyOf(s)] = s; });

  const plannedDays = main
    ? mainPlan.days.filter((d) => planWeekOf(mainPlan, d.day) === main.week)
    : [];
  const doneCount = plannedDays.filter((d) => sessionByKey[`${mainPlan.id}:${d.day}`]).length;

  // Тренировки этой календарной недели, привязанные к ДРУГОЙ программной неделе
  // (или к другому плану). Они не «вне плана» и не «пропущены» — просто относятся
  // к соседней неделе программы; показываем их отдельным блоком, без ложных пропусков.
  const plannedKeys = new Set(plannedDays.map((d) => `${mainPlan.id}:${d.day}`));
  const otherDays = [];
  Object.keys(sessionByKey).forEach((k) => {
    if (plannedKeys.has(k)) return;
    const s = sessionByKey[k];
    const p = planOfSession(s);
    const d = p.days.find((x) => x.day === s.programDay);
    if (d) otherDays.push({ day: d, planObj: p });
  });
  otherDays.sort((a, b) => (a.planObj.id === b.planObj.id ? a.day.day - b.day.day : a.planObj.id.localeCompare(b.planObj.id)));

  // --- Сводка ---
  if (main) {
    lines.push(`**План:** ${mainPlan.title}`);
    lines.push(`**Неделя программы:** ${main.week} — ${(mainPlan.weekLabels && mainPlan.weekLabels[main.week]) || ''}`);
  }
  lines.push(`**Тренировок за неделю:** ${inWeek.length}${plannedDays.length ? ` · выполнено дней плана: ${doneCount} из ${plannedDays.length}` : ''}`);

  const curTon = Math.round(tonnage(inWeek));
  let tonLine = `**Суммарный тоннаж:** ${fmtNum(curTon)} кг`;
  if (prevInWeek.length) {
    const d = curTon - Math.round(tonnage(prevInWeek));
    tonLine += d > 0 ? ` (▲ +${fmtNum(d)} кг к прошлой неделе)`
      : d < 0 ? ` (▼ ${fmtNum(d)} кг к прошлой неделе)`
      : ' (= как на прошлой неделе)';
  }
  lines.push(tonLine);

  // Вес: среднее за неделю и сдвиг к среднему прошлой недели. Сами записи —
  // отдельным блоком в конце отчёта, чтобы не забивать сводку.
  const weekWeights = weightsInWeek(opts.measurements, weekStart);
  const prevWeights = weightsInWeek(opts.measurements, prevWeekStart);
  const curAvg = avgWeight(weekWeights);
  const prevAvg = avgWeight(prevWeights);
  if (curAvg != null) {
    let wLine = `**Средний вес:** ${fmtNum(curAvg)} кг`;
    if (prevAvg != null) {
      const d = Math.round((curAvg - prevAvg) * 10) / 10;
      wLine += d > 0 ? ` (▲ +${fmtNum(d)} кг к прошлой неделе)`
        : d < 0 ? ` (▼ ${fmtNum(d)} кг к прошлой неделе)`
        : ' (= как на прошлой неделе)';
    }
    wLine += ` · замеров: ${weekWeights.length}`;
    lines.push(wLine);
  }
  lines.push('');

  const renderedIds = new Set();

  // Запись относится к упражнению плана, если совпало имя — или если это замена
  // именно этого упражнения (replacedFrom пишет пошаговый режим с 1.1.0).
  const sameEx = (re, pex) => normName(re.name) === normName(pex.name);
  const replaces = (re, pex) => !!re.replacedFrom && normName(re.replacedFrom) === normName(pex.name);

  // --- Плановые дни + дни соседней программной недели / другого плана ---
  const renderList = [
    ...plannedDays.map((d) => ({ plan: d, planObj: mainPlan, other: false })),
    ...otherDays.map((x) => ({ plan: x.day, planObj: x.planObj, other: true })),
  ];
  let lastOtherGroup = null;
  renderList.forEach(({ plan, planObj, other }) => {
    const s = sessionByKey[`${planObj.id}:${plan.day}`];
    if (other) {
      const week = planWeekOf(planObj, plan.day);
      const group = `${planObj.id}|${week}`;
      if (group !== lastOtherGroup) {
        lastOtherGroup = group;
        lines.push('');
        lines.push(planObj.id === (mainPlan && mainPlan.id)
          ? `## Из соседней недели программы (${week})`
          : `## План «${planObj.title}» · неделя ${week}`);
      }
    }
    lines.push('');
    if (!s) {
      lines.push(`## День ${plan.day} · ${plan.title} — ⚠️ пропущен`);
      lines.push('');
      return;
    }
    renderedIds.add(s.id);
    lines.push(`## День ${plan.day} · ${plan.title} — ${fmtDateFull(s.date)}`);
    lines.push('');

    if (plan.type === 'strength') {
      // Если из плана дня не сделано НИ ОДНОГО упражнения, а записаны другие —
      // это не «день, где всё пропущено», а день, заменённый на другой. Простыня
      // из шести строк «пропущено» в таком случае только сбивает с толку.
      const planHit = (plan.exercises || []).some((pex) =>
        (s.exercises || []).some((re) => sameEx(re, pex) || replaces(re, pex)));
      const swapped = !planHit && (s.exercises || []).length > 0;
      if (swapped) {
        const guess = guessDayTitle(s.exercises, planObj);
        lines.push(`_Заменён${guess ? ` на: ${guess}` : ''} — плановые упражнения этого дня не выполнялись._`);
        lines.push('');
      }

      lines.push(...TABLE_HEADER);
      const usedIdx = new Set();
      (plan.exercises || []).forEach((pex) => {
        // Сначала ищем само упражнение, и только потом — его замену: если
        // сделано и то, и другое, плановая строка должна достаться плановому.
        let idx = (s.exercises || []).findIndex((re, i) => !usedIdx.has(i) && sameEx(re, pex));
        if (idx === -1) idx = (s.exercises || []).findIndex((re, i) => !usedIdx.has(i) && replaces(re, pex));
        if (idx === -1) {
          if (swapped) return; // день заменён — плановые строки не выводим
          lines.push(`| ${cell(pex.name)} | — | ⚠️ пропущено | — |`);
        } else {
          usedIdx.add(idx);
          const re = s.exercises[idx];
          const tag = sameEx(re, pex) ? '' : ` _(вместо: ${cell(pex.name)})_`;
          lines.push(`| ${cell(re.name)}${tag} | ${cell(fmtExerciseResult(re))} | ${cell(deltaVsPrev(re, prevMap))} | ${cell(recordMark(re, priorRecords))} |`);
        }
      });
      // Записанные упражнения, которых нет в плане: добавленные по ходу
      // тренировки (1.1.0) и всё остальное «вне плана».
      (s.exercises || []).forEach((re, i) => {
        if (usedIdx.has(i)) return;
        const tag = swapped ? '' : re.added ? ' _(добавлено)_' : ' _(вне плана)_';
        lines.push(`| ${cell(re.name)}${tag} | ${cell(fmtExerciseResult(re))} | ${cell(deltaVsPrev(re, prevMap))} | ${cell(recordMark(re, priorRecords))} |`);
      });
      pushExerciseDetails(lines, s.exercises);
      (s.cardio || []).forEach((c) => {
        lines.push('');
        lines.push(`Кардио-финишер: ${cell(c.name)} — ${cell(fmtCardioResult(c))}`);
      });
    } else {
      if ((s.cardio || []).length) {
        (s.cardio || []).forEach((c) => lines.push(`- ${cell(c.name)}: ${cell(fmtCardioResult(c))}`));
      } else {
        lines.push('_нет записей кардио_');
      }
    }

    const note = [];
    // Длительность пишется в сессию пошаговым режимом (durationSec) с версии 1.0.1.
    // У тренировок, записанных руками, её нет — тогда просто не выводим.
    if (s.durationSec > 0) note.push(`длительность ${secToClock(s.durationSec)}`);
    if (s.sleep) note.push(`сон ${fmtNum(s.sleep)} ч`);
    if (s.energy) note.push(`энергия ${s.energy}/5`);
    if (s.difficulty) note.push(`тяжесть ${s.difficulty}/5`);
    const feeling = (s.feeling || '').trim();
    if (note.length || feeling) {
      lines.push('');
      if (note.length) lines.push(`_${note.join(' · ')}_`);
      if (feeling) lines.push(`> ${feeling.replace(/\s*\n\s*/g, ' ')}`);
    }
  });

  // --- Тренировки вне плана (без programDay или не покрытые планом) ---
  const freeSessions = inWeek.filter((s) => !renderedIds.has(s.id));
  if (freeSessions.length) {
    lines.push('');
    lines.push('## Вне плана');
    freeSessions.forEach((s) => {
      lines.push('');
      lines.push(`### ${fmtDateFull(s.date)}`);
      lines.push('');
      if ((s.exercises || []).length) {
        lines.push(...TABLE_HEADER);
        (s.exercises || []).forEach((re) => {
          lines.push(`| ${cell(re.name)} | ${cell(fmtExerciseResult(re))} | ${cell(deltaVsPrev(re, prevMap))} | ${cell(recordMark(re, priorRecords))} |`);
        });
      }
      pushExerciseDetails(lines, s.exercises);
      (s.cardio || []).forEach((c) => lines.push(`- ${cell(c.name)}: ${cell(fmtCardioResult(c))}`));
    });
  }

  // --- Вес по дням ---
  if (weekWeights.length) {
    lines.push('');
    lines.push('## Вес');
    lines.push('');
    lines.push('| Дата | Вес | Δ |');
    lines.push('| --- | --- | --- |');
    weekWeights.forEach((m, i) => {
      // Дельта к предыдущему замеру: внутри недели — к соседней строке, у первой
      // строки — к последнему замеру прошлой недели, если он есть.
      const prev = i > 0 ? weekWeights[i - 1] : prevWeights[prevWeights.length - 1];
      let d = '—';
      if (prev && prev.weight != null) {
        const diff = Math.round((Number(m.weight) - Number(prev.weight)) * 10) / 10;
        d = diff > 0 ? `+${fmtNum(diff)} ▲` : diff < 0 ? `${fmtNum(diff)} ▼` : '=';
      }
      const when = `${fmtDateShort(m.date)}${m.time ? ` ${m.time}` : ''}`;
      lines.push(`| ${cell(when)} | ${fmtNum(m.weight)} кг | ${cell(d)} |`);
    });
    if (curAvg != null) {
      lines.push('');
      lines.push(`_Среднее за неделю: ${fmtNum(curAvg)} кг${prevAvg != null ? ` · прошлая неделя: ${fmtNum(prevAvg)} кг` : ''}_`);
    }
  }

  lines.push('');
  lines.push('---');
  lines.push(`_Экспортировано из «Дневник тренировок» · ${fmtDateShort(todayISO())} ${todayISO().slice(0, 4)}_`);
  lines.push('');
  return lines.join('\n');
}
