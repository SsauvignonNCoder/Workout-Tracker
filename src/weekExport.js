// Экспорт результатов недели в Markdown.
//
// Идея: у каждой сохранённой тренденировки есть programDay (1..24) — привязка к плану
// PROGRAM_DAYS. 24-дневный цикл повторяет одни и те же шаблоны дней каждые 6 program-дней
// (день 1 = день 7 = день 13 = день 19 = «Грудь, спина, плечи»), поэтому «прошлая неделя»
// естественно ложится на предыдущую календарную неделю с тем же набором упражнений.
//
// Что показываем по каждой неделе:
//  - выполненный результат по каждому упражнению (вес × повторы × подходы);
//  - дельту к прошлой календарной неделе (прогрессия ▲/▼);
//  - личный рекорд (🏆 PR если побит максимум до этой недели, иначе рекорд как ориентир);
//  - упражнения из плана, которые НЕ записаны → помечаются «⚠️ пропущено»;
//  - целиком пропущенные плановые дни → «⚠️ пропущен».

import { shiftDate, fmtDateShort, fmtDateFull, todayISO } from './dateUtils.js';
import { getMonday, computeRecords } from './gamification.js';
import { PROGRAM_DAYS, isWeightlessExercise } from './tabs/workoutTabHelpers.jsx';

export const PROGRAM_WEEK_LABEL = { 1: 'База', 2: 'Объём', 3: 'Интенсив', 4: 'Разгрузка' };

// Номер недели программы (1..4) для program-дня 1..20.
export function programWeekOf(day) {
  return Math.floor((day - 1) / 6) + 1;
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
// (видно, где повторы просели) и заметка, которую ты писал к упражнению.
function pushExerciseDetails(lines, exercises) {
  const rows = [];
  (exercises || []).forEach((ex) => {
    const parts = [];
    if ((ex.setLog || []).length) parts.push(`подходы: ${fmtSetLog(ex)}`);
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
  if (!pr) return '🆕 новое';
  if (w > pr.weight) return `🏆 PR (+${fmtNum(w - pr.weight)} кг)`;
  if (w === pr.weight) return `= PR (${fmtNum(pr.weight)} кг)`;
  return `рекорд ${fmtNum(pr.weight)} кг`;
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

  const progWeeks = [...new Set(inWeek.filter((s) => s.programDay).map((s) => programWeekOf(s.programDay)))]
    .sort((a, b) => a - b);

  const sessionByDay = {};
  inWeek.forEach((s) => { if (s.programDay && !sessionByDay[s.programDay]) sessionByDay[s.programDay] = s; });

  const plannedDays = PROGRAM_DAYS.filter((d) => progWeeks.includes(programWeekOf(d.day)));
  const doneCount = plannedDays.filter((d) => sessionByDay[d.day]).length;

  // --- Сводка ---
  if (progWeeks.length) {
    const label = progWeeks.map((w) => `${w} — ${PROGRAM_WEEK_LABEL[w] || ''}`).join('; ');
    lines.push(`**Неделя программы:** ${label}`);
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
  lines.push('');

  const renderedIds = new Set();

  // --- Плановые дни ---
  plannedDays.forEach((plan) => {
    const s = sessionByDay[plan.day];
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
      lines.push(...TABLE_HEADER);
      const usedIdx = new Set();
      (plan.exercises || []).forEach((pex) => {
        const idx = (s.exercises || []).findIndex((re, i) => !usedIdx.has(i) && normName(re.name) === normName(pex.name));
        if (idx === -1) {
          lines.push(`| ${cell(pex.name)} | — | ⚠️ пропущено | — |`);
        } else {
          usedIdx.add(idx);
          const re = s.exercises[idx];
          lines.push(`| ${cell(re.name)} | ${cell(fmtExerciseResult(re))} | ${cell(deltaVsPrev(re, prevMap))} | ${cell(recordMark(re, priorRecords))} |`);
        }
      });
      // Записанные упражнения, которых нет в плане.
      (s.exercises || []).forEach((re, i) => {
        if (usedIdx.has(i)) return;
        lines.push(`| ${cell(re.name)} _(вне плана)_ | ${cell(fmtExerciseResult(re))} | ${cell(deltaVsPrev(re, prevMap))} | ${cell(recordMark(re, priorRecords))} |`);
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
    if (s.sleep) note.push(`сон ${fmtNum(s.sleep)} ч`);
    if (s.energy) note.push(`энергия ${s.energy}/5`);
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

  lines.push('');
  lines.push('---');
  lines.push(`_Экспортировано из «Дневник тренировок» · ${fmtDateShort(todayISO())} ${todayISO().slice(0, 4)}_`);
  lines.push('');
  return lines.join('\n');
}
