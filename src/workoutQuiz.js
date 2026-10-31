// Блиц-опрос от ИИ в конце тренировки — пока НЕ ПОДКЛЮЧЁН (карточка на шаге
// «Итог» с пометкой «Скоро», GuidedWorkout.jsx → AiQuizCard).
//
// Идея: после тренировки ИИ задаёт 2–3 коротких вопроса, опираясь на то, что
// реально было: веса, повторы и подходы против плана и прошлого раза,
// добавленные, заменённые и убранные упражнения, заметки к упражнениям и к
// тренировке.
//
// Здесь — то, что не зависит от сервиса ИИ: сбор данных (buildQuizContext, под
// тестами) и инструкция модели (QUIZ_SYSTEM_PROMPT). Чтобы включить:
//   1. эндпоинт api/workout-quiz.js — проверка подписи Telegram (как в
//      api/ai-assistant.js), вызов модели с QUIZ_SYSTEM_PROMPT и контекстом,
//      ответ { questions: ['…', '…'] };
//   2. в AiQuizCard — кнопка активна, вопросы с полями ответа; куда класть
//      ответы (заметка тренировки или отдельное поле) — решить с Никитой.

import { bestSetOf } from './bestSet.js';
import { getPlan, planWeekOf } from './plans.js';

export const QUIZ_SYSTEM_PROMPT = [
  'Ты — тренер в дневнике тренировок. Тебе дают одну только что законченную тренировку:',
  'упражнения с планом и фактом по подходам, прошлый раз, добавленные, заменённые и',
  'убранные упражнения, заметки, самочувствие.',
  'Задай 2–3 коротких вопроса на языке пользователя (поле lang в данных: ru — по-русски, на «ты»; en — по-английски), по одному предложению, — о том, что в',
  'этой тренировке заметно: недобор или перебор повторов против плана, вес ниже или выше',
  'прошлого раза, замена или пропуск упражнения, заметка, которую стоит уточнить.',
  'Не давай советов и не хвали — только вопросы. Ответ — JSON: {"questions": ["…", "…"]}.',
].join(' ');

const setsText = (setLog) => (setLog || []).filter(Boolean).map((x) => (x.weight ? `${x.weight}×${x.reps}` : `${x.reps}`)).join(', ');

// Последний раз с этим упражнением до даты тренировки — лучший подход.
function lastTimeOf(name, history, beforeDate) {
  const prev = (history || [])
    .filter((s) => s && s.date < beforeDate && (s.exercises || []).some((e) => e && e.name === name))
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!prev) return null;
  const ex = prev.exercises.find((e) => e && e.name === name);
  const best = bestSetOf(ex.setLog && ex.setLog.length ? ex.setLog : [{ weight: ex.weight, reps: ex.reps }]);
  return best ? { date: prev.date, best: best.weight ? `${best.weight}×${best.reps}` : `${best.reps}` } : null;
}

// Данные для опроса из записи тренировки (то, что уходит в базу —
// buildGuidedSession), дня плана и истории. Компактно: модели нужны факты, а
// не вся запись.
export function buildQuizContext({ session, dayPlan, planId, history = [], lang } = {}) {
  const s = session || {};
  const planEx = (dayPlan && dayPlan.exercises) || [];
  const planned = (name, replacedFrom) => planEx.find((p) => p.name === name || p.name === replacedFrom);
  const exercises = (s.exercises || []).filter(Boolean).map((ex) => {
    const p = planned(ex.name, ex.replacedFrom);
    const last = lastTimeOf(ex.name, history, s.date);
    return {
      name: ex.name,
      ...(p ? { plan: `${p.sets}×${p.reps}` } : {}),
      done: setsText(ex.setLog),
      ...(last ? { lastTime: last.best } : {}),
      ...(ex.added ? { added: true } : {}),
      ...(ex.replacedFrom ? { replacedFrom: ex.replacedFrom } : {}),
      ...(ex.note ? { note: ex.note } : {}),
    };
  });
  const doneNames = new Set((s.exercises || []).filter(Boolean).flatMap((ex) => [ex.name, ex.replacedFrom].filter(Boolean)));
  const removed = planEx.map((p) => p.name).filter((n) => !doneNames.has(n));
  const plan = planId ? getPlan(planId) : null;
  const week = plan && dayPlan ? planWeekOf(plan, dayPlan.day) : null;
  return {
    date: s.date,
    ...(lang ? { lang } : {}),
    ...(dayPlan ? { day: dayPlan.day, title: dayPlan.title } : {}),
    ...(week && plan.weekLabels && plan.weekLabels[week] ? { week: `${week} · ${plan.weekLabels[week]}` } : {}),
    exercises,
    ...(removed.length ? { removed } : {}),
    ...(s.durationSec ? { minutes: Math.round(s.durationSec / 60) } : {}),
    ...(s.sleep ? { sleep: s.sleep } : {}),
    ...(s.energy ? { energy: s.energy } : {}),
    ...(s.difficulty ? { difficulty: s.difficulty } : {}),
    ...(s.feeling && s.feeling.trim() ? { feeling: s.feeling.trim() } : {}),
  };
}
