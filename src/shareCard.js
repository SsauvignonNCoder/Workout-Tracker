// Что написано на картинке «Поделиться» (рисует её src/shareCardDraw.js). Чистые
// функции — их прогоняют тесты.
//
// НА КАРТИНКЕ: день, дата, три числа, до трёх рекордов (нет рекордов — лучший рост) и
// фраза. Спадов, сна, самочувствия и заметок нет: картинка уходит посторонним.
//
// ФРАЗА зависит от ситуации, а внутри неё — от порядкового номера тренировки: фразы
// идут по кругу, а у одной тренировки остаётся та же и при открытии из истории.
// Формулировки — без рода: картинку выкладывают от своего имени.

import { planDayAt, makeTrainingDayCheck, DEFAULT_PLAN_ID } from './plans.js';
import { buildWorkoutSummary } from './workoutSummary.js';
import { computeRecords } from './gamification.js';
import { fmtDateFull, shiftDate } from './dateUtils.js';
import { tr, exName, routeTitle, locale } from './i18n.js';
import { U, unit, toDisp } from './units.js';

// Фразы выбрал Никита.
export const PHRASES = {
  regular: [
    'Сильнее, чем вчера.',
    'Дисциплина побеждает.',
    'Без шума, просто работа.',
    'Результат любит постоянство.',
    'Работа любит тишину.',
    'Система сильнее мотивации.',
    'Меньше слов, больше подходов.',
    'Сила любит терпеливых.',
    'Сегодняшняя работа — завтрашняя сила.',
    'Прогресс складывается из таких дней.',
    'Привычка сильнее настроения.',
    'Тело помнит каждую тренировку.',
  ],
  record: [
    'Старый рекорд просил передать, что он всё.',
    'Рекордам здесь неспокойно.',
    'Сильнее, чем когда-либо.',
    'Старому рекорду пора на пенсию.',
    'Рекорд продержался недолго.',
    'Рекорд обновлён без предупреждения.',
    'Прошлый рекорд больше не актуален.',
    'Таблицу рекордов снова переписывать.',
  ],
  comeback: [
    'Зал соскучился.',
    'Главное — снова начать.',
    'Перерыв окончен. Работаем.',
    'Железо не обиделось.',
    'Снова в строю.',
    'Пауза — не конец.',
  ],
  streak: [
    'Привычка крепнет вместе с мышцами.',
    'Диван подал заявление о пропаже.',
    'Постоянство — это сила.',
    'Диван перестал писать первым.',
    'Регулярность — лучшая программа.',
    'Тренировка уже не решение, а расписание.',
  ],
};

const COMEBACK_DAYS = 7;
const STREAK_STEP = 7;
const MAX_RECORDS = 3;

const dayNumber = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
};

// Тренировок подряд, считая эту: день отдыха по плану серию не рвёт (как в XP).
function trainingStreak(session, sessions) {
  const dates = new Set((sessions || []).map((x) => x.date));
  const isTraining = makeTrainingDayCheck(sessions, session.planId);
  let n = 1;
  let d = shiftDate(session.date, -1);
  for (let i = 0; i < 730; i += 1) {
    if (dates.has(d)) n += 1;
    else if (isTraining(d)) break;
    d = shiftDate(d, -1);
  }
  return n;
}

// Рекорд важнее возвращения, возвращение важнее серии. Серия отмечается раз в 7
// тренировок: иначе при шести тренировках в неделю обычных фраз не осталось бы.
export function phraseSituation(session, sessions, hasRecord) {
  if (hasRecord) return 'record';
  const earlier = (sessions || []).filter((x) => x.id !== session.id && x.date < session.date);
  if (earlier.length) {
    const last = earlier.reduce((a, x) => (x.date > a ? x.date : a), earlier[0].date);
    if (dayNumber(session.date) - dayNumber(last) >= COMEBACK_DAYS) return 'comeback';
  }
  const streak = trainingStreak(session, (sessions || []).filter((x) => x.date <= session.date));
  return streak % STREAK_STEP === 0 ? 'streak' : 'regular';
}

export function pickPhrase(session, sessions, situation) {
  const list = PHRASES[situation] || PHRASES.regular;
  const ordinal = (sessions || []).filter((x) => x.id !== session.id
    && (x.date < session.date || (x.date === session.date && String(x.id) < String(session.id)))).length;
  return tr(list[ordinal % list.length]);
}

const groupNumber = (n) => Math.round(n).toLocaleString(locale());

function fmtDuration(sec) {
  const min = Math.round(sec / 60);
  if (min < 60) return tr('{0} мин', min);
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
}

const isPoolEntry = (c) => /бассейн/i.test(c.name || '');
const setsOf = (ex) => (Array.isArray(ex.setLog) && ex.setLog.length
  ? ex.setLog
  : [{ weight: ex.weight, reps: ex.reps, times: Number(ex.sets) || 1 }]);

function strengthStats(s) {
  let tonnage = 0;
  let sets = 0;
  (s.exercises || []).forEach((ex) => setsOf(ex).forEach((x) => {
    const times = x.times || 1;
    tonnage += (Number(x.weight) || 0) * (Number(x.reps) || 0) * times;
    sets += times;
  }));
  return [
    s.durationSec >= 60 && { value: fmtDuration(s.durationSec), label: tr('время') },
    tonnage > 0 && { value: `${groupNumber(toDisp('w', tonnage))} ${unit('w')}`, label: tr('тоннаж') },
    { value: String(s.exercises.length), label: tr('упражнений') },
    { value: String(sets), label: tr('подходов') },
  ].filter(Boolean).slice(0, 3);
}

function cardioStats(s) {
  const entries = s.cardio || [];
  const pool = entries.filter(isPoolEntry);
  const run = entries.filter((c) => !isPoolEntry(c));
  const distance = run.reduce((a, c) => a + (Number(c.distance) || 0), 0);
  const gainM = run.reduce((a, c) => a + (Number(c.distance) || 0) * (Number(c.incline) || 0) * 10, 0);
  const poolMin = pool.reduce((a, c) => a + (Number(c.duration) || 0), 0);
  return [
    poolMin > 0 && { value: tr('{0} мин', poolMin), label: tr('в бассейне') },
    !poolMin && s.durationSec >= 60 && { value: fmtDuration(s.durationSec), label: tr('время') },
    distance > 0 && { value: U('d', distance), label: tr('дистанция') },
    gainM > 0 && { value: U('h', gainM, 0), label: tr('набор высоты') },
  ].filter(Boolean).slice(0, 3);
}

function titleOf(s) {
  const day = s.programDay ? planDayAt(s.planId || DEFAULT_PLAN_ID, s.programDay, s.date) : null;
  if (day) return tr(day.title);
  if ((s.exercises || []).length) return tr('Силовая тренировка');
  return (s.cardio || []).some(isPoolEntry) ? tr('Бассейн') : tr('Кардио');
}

// С единицей: картинку смотрят посторонние, «105×2» им ни о чём не говорит.
const setText = (item) => (item.weightless
  ? tr('{0} повт', item.current.reps)
  : `${U('w', item.current.weight)} × ${item.current.reps}`);

function highlightsOf(s, history) {
  const exercises = (s.exercises || []).map((ex) => ({
    name: ex.name,
    sets: Array.isArray(ex.setLog) && ex.setLog.length ? ex.setLog : [{ weight: ex.weight, reps: ex.reps }],
  }));
  const summary = exercises.length ? buildWorkoutSummary({
    exercises, history, records: computeRecords(history),
    current: { planId: s.planId, day: s.programDay },
  }) : null;
  const records = summary ? summary.items.filter((i) => i.isRecord) : [];
  if (records.length) {
    const rows = records.slice().sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, MAX_RECORDS)
      .map((i) => ({ name: exName(i.name), value: setText(i) }));
    return { kind: 'records', label: tr('Новые рекорды'), rows };
  }
  if (summary && summary.best) {
    return { kind: 'growth', label: tr('Лучший рост'), rows: [{ name: exName(summary.best.name), value: summary.best.delta }] };
  }
  if (s.routeName && !exercises.length) {
    return { kind: 'route', label: tr('Маршрут'), rows: [{ name: routeTitle(s.routeName), value: '' }] };
  }
  return null;
}

// session — сохранённая тренировка, sessions — вся история (может включать и её).
export function shareCardData(session, sessions) {
  const others = (sessions || []).filter((x) => x.id !== session.id);
  const history = others.filter((x) => x.date <= session.date);
  const highlights = highlightsOf(session, history);
  const situation = phraseSituation(session, others, !!highlights && highlights.kind === 'records');
  return {
    title: titleOf(session),
    date: fmtDateFull(session.date),
    stats: (session.exercises || []).length ? strengthStats(session) : cardioStats(session),
    highlights,
    situation,
    phrase: pickPhrase(session, others, situation),
    appName: tr('Дневник тренировок'),
  };
}
