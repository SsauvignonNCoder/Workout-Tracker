import {
  Dumbbell, TrendingUp, Flame, Footprints, Activity, Medal, Award, Zap, Calendar, Trophy, Target,
  Waves, ClipboardList, Scale, Layers, Puzzle, Moon, FileText,
  Flag, CalendarCheck, CalendarRange, Crown, Shield, ListChecks, Sparkles, Star, Gauge, Weight, Timer,
  Hourglass, Clock, Mountain, MountainSnow, Route, RotateCcw, Gem, Ruler, NotebookPen, BatteryLow,
  BookOpen, Shapes, Repeat,
} from 'lucide-react';
import { toISO, todayISO, shiftDate } from './dateUtils.js';
import { categorizeExercise, MUSCLE_GROUPS, isTimeBasedExercise } from './tabs/workoutTabHelpers.jsx';
import { bodyLogOf } from './bodyLog.js';
import { makeTrainingDayCheck } from './plans.js';
import { makeExtraAchievements, makeProgressMap } from './achievementsExtra.js';

// Иконки достижений (lucide) вместо эмодзи — ключ совпадает с прежним полем icon.
export const ACH_ICON = {
  '🏋️': Dumbbell, '💪': Dumbbell, '🔥': Flame, '👟': Footprints, '🚶': Footprints,
  '🏃': Activity, '🏃‍♂️': Activity, '🏅': Medal, '🎖️': Medal, '🙆': Award, '🦾': Zap,
  '⚡': Zap, '📅': Calendar, '📈': TrendingUp, '🏆': Trophy, '🎯': Target, '🏊': Waves,
  '📋': ClipboardList, '⚖️': Scale, '🏗️': Layers, '🧩': Puzzle, '😴': Moon, '📝': FileText,
  // Новые достижения (achievementsExtra.js) — ключи словами.
  flag: Flag, 'calendar-check': CalendarCheck, 'calendar-range': CalendarRange, crown: Crown, shield: Shield,
  'list-checks': ListChecks, sparkles: Sparkles, star: Star, trophy: Trophy, medal: Medal, gauge: Gauge,
  weight: Weight, dumbbell: Dumbbell, zap: Zap, timer: Timer, layers: Layers, repeat: Repeat,
  hourglass: Hourglass, clock: Clock, mountain: Mountain, 'mountain-snow': MountainSnow, footprints: Footprints,
  route: Route, flame: Flame, rotate: RotateCcw, gem: Gem, scale: Scale, ruler: Ruler, target: Target,
  'notebook-pen': NotebookPen, moon: Moon, 'battery-low': BatteryLow, book: BookOpen, shapes: Shapes,
};

export const BODY_FIELDS = [
  { key: 'height', label: 'Рост, см' },
  { key: 'waist', label: 'Талия, см' },
  { key: 'hips', label: 'Бёдра, см' },
  { key: 'chest', label: 'Грудь, см' },
  { key: 'shoulders', label: 'Плечи, см' },
  { key: 'bodyFat', label: '% жира (опц.)' },
];

// Личные рекорды по каждому упражнению.
// Для упражнений с весом рекорд — максимальный рабочий вес: { weight, reps, date }.
// Для упражнений без веса рекорд — максимум повторов, а для упражнений на время
// (планка) — максимум секунд: { metric: 'reps' | 'sec', value, date }.
// Разные формы записи не пересекаются: весовые упражнения дают .weight, безвесовые — .metric.
export function computeRecords(sessions) {
  const records = {};
  (sessions || []).forEach((s) => {
    (s.exercises || []).forEach((ex) => {
      const w = Number(ex.weight) || 0;
      if (w > 0) {
        const prev = records[ex.name];
        if (!prev || !prev.weight || w > prev.weight) {
          records[ex.name] = { weight: w, reps: ex.reps, date: s.date };
        }
        return;
      }
      // Без веса — рекорд по повторам или по секундам (для упражнений на время).
      const val = Number(ex.reps) || 0;
      if (val <= 0) return;
      const metric = (ex.timed || isTimeBasedExercise(ex.name)) ? 'sec' : 'reps';
      const prev = records[ex.name];
      // Весовой рекорд по этому имени (если вдруг есть) не перетираем безвесовым.
      if (prev && prev.weight) return;
      if (!prev || val > (prev.value || 0)) {
        records[ex.name] = { metric, value: val, date: s.date };
      }
    });
  });
  return records;
}

export function getMonday(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const dow = dt.getDay(); // 0=Sun..6=Sat
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  dt.setDate(dt.getDate() + diffToMonday);
  return toISO(dt);
}

// ============================================================
// Система уровней и опыта (XP)
// ============================================================

// Пороги общего накопленного XP, необходимого для достижения уровня N (индекс = уровень - 1).
// Прогрессия: шаг растёт до 36 XP к 31-му уровню, дальше постоянный — 36 XP на
// уровень. Максимум — 60-й уровень (было 50): уровни 51–60 продолжают тот же
// шаг 36, чтобы с 66 новыми достижениями было куда расти.
export const LEVEL_THRESHOLDS = [0, 6, 13, 21, 30, 41, 53, 66, 80, 95, 111, 128, 146, 165, 185, 206, 228, 251, 275, 300, 326, 353, 381, 410, 440, 471, 503, 536, 570, 605, 641, 677, 713, 749, 785, 821, 857, 893, 929, 965, 1001, 1037, 1073, 1109, 1145, 1181, 1217, 1253, 1289, 1325,
  1361, 1397, 1433, 1469, 1505, 1541, 1577, 1613, 1649, 1685];

export function getLevelInfo(totalXp) {
  const xp = totalXp || 0;
  let level = 1;
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (xp >= LEVEL_THRESHOLDS[i]) { level = i + 1; break; }
  }
  const isMaxLevel = level >= LEVEL_THRESHOLDS.length;
  const currentThreshold = LEVEL_THRESHOLDS[level - 1];
  const nextThreshold = isMaxLevel ? currentThreshold : LEVEL_THRESHOLDS[level];
  const xpIntoLevel = xp - currentThreshold;
  const xpForLevel = isMaxLevel ? 0 : nextThreshold - currentThreshold;
  const progress = isMaxLevel ? 1 : xpIntoLevel / xpForLevel;
  return { level, xpIntoLevel, xpForLevel, progress, isMaxLevel, nextThreshold };
}

// Множитель XP за стрик последовательных тренировочных дней (выходные не прерывают и не считаются).
// День 1 — x1.0 (без бонуса), день 2 — x1.2, ..., день 20+ — x5.0 (потолок), линейная прогрессия между ними.
export function getStreakMultiplier(streakDay) {
  if (streakDay <= 1) return 1.0;
  if (streakDay >= 20) return 5.0;
  return 1.2 + (5.0 - 1.2) * (streakDay - 2) / 18;
}

// Тренировочный ли день — по плану, который тогда шёл (plans.js →
// makeTrainingDayCheck): у плана свой список дней недели. По умолчанию — ПН–СБ,
// как у обоих нынешних планов.
const DEFAULT_TRAINING_DAY = makeTrainingDayCheck([], null);

// Длина серии тренировочных дней, заканчивающейся датой sessionDate. День
// тренировки по плану без тренировки серию обрывает. День отдыха по плану —
// особый: была тренировка — серия растёт (награда за лишнее усилие), не было —
// день просто пропускается, ничего не обрывая. isTrainingDay — (iso) => boolean.
export function computeStreakForDate(activeDates, sessionDate, isTrainingDay = DEFAULT_TRAINING_DAY) {
  let streak = 1;
  let cursor = shiftDate(sessionDate, -1);
  // Предохранитель: у плана без единого дня тренировок цикл шёл бы вечно.
  for (let guard = 0; guard < 800; guard += 1) {
    if (!isTrainingDay(cursor)) {
      if (activeDates.has(cursor)) streak += 1;
      cursor = shiftDate(cursor, -1);
      continue;
    }
    if (activeDates.has(cursor)) { streak += 1; cursor = shiftDate(cursor, -1); continue; }
    break;
  }
  return streak;
}

// Итоговый XP по всей истории тренировок: 1 базовый XP за тренировку, умноженный
// на множитель серии на момент этой тренировки (по датам, не по порядку
// сохранения). currentPlanId — план из профиля: по нему считаются дни после
// последней тренировки.
export function computeTotalXpFromSessions(sessions, currentPlanId = null) {
  const uniqueDates = [...new Set((sessions || []).map((s) => s.date))].sort();
  const activeDates = new Set(uniqueDates);
  const isTrainingDay = makeTrainingDayCheck(sessions, currentPlanId);
  let totalXp = 0;
  uniqueDates.forEach((date) => {
    const streakDay = computeStreakForDate(activeDates, date, isTrainingDay);
    totalXp += 1 * getStreakMultiplier(streakDay);
  });
  return totalXp;
}

// Неделя закрыта, если в ней сделаны все дни тренировок по плану (и они вообще
// есть). monday — понедельник недели.
export function isWeekComplete(activeDates, monday, isTrainingDay) {
  let planned = 0;
  for (let i = 0; i < 7; i += 1) {
    const day = shiftDate(monday, i);
    if (!isTrainingDay(day)) continue;
    planned += 1;
    if (!activeDates.has(day)) return false;
  }
  return planned > 0;
}

// ============================================================
// Достижения
// Каждое достижение — условие на основе sessions/measurements/profile и
// сегодняшней даты (today — для стажа). Открытое достижение ПОСТОЯННО: дата
// открытия хранится в profile.achievements ({ id: 'ГГГГ-ММ-ДД' }) и больше не
// снимается, даже если условие перестало выполняться (набрал вес — жим «в вес
// тела» не пропадает, удалил тренировку — тоже). Новые открытия и их даты
// находит achievementUnlockDates, сохраняет App.
// ============================================================

// Подтягивания без австралийских: те — тяга лёжа под грифом, повторов там в разы больше.
const PULLUPS_RE = /^(?!.*австралийск).*подтягиван/i;

const BASE_ACHIEVEMENTS = [
  {
    id: 'bench-bodyweight',
    title: 'Жим лёжа собственного веса',
    description: 'Рабочий вес в жиме лёжа сравнялся или превысил вес тела',
    xp: 5,
    icon: '🏋️',
    // Через bestLiftRatio — ровно та же проверка, что у приседа и тяги ниже.
    // Своя копия здесь повторяла и ту же ошибку с NaN на безвесовых рекордах.
    check: ({ sessions, measurements }) => bestLiftRatio(sessions, measurements, /жим.*лёж/i) >= 1,
  },
  {
    id: 'first-week',
    title: 'Первая неделя',
    description: 'Закрыты все тренировочные дни одной недели по плану, без пропусков',
    xp: 10,
    icon: '🔥',
    check: ({ sessions, profile }) => {
      if (!sessions || sessions.length === 0) return false;
      const activeDates = new Set(sessions.map((s) => s.date));
      const isTrainingDay = makeTrainingDayCheck(sessions, profile && profile.planId);
      const mondays = new Set([...activeDates].map((d) => getMonday(d)));
      return [...mondays].some((monday) => isWeekComplete(activeDates, monday, isTrainingDay));
    },
  },
  ...[
    { id: 'treadmill-100m', title: 'Первые шаги', meters: 0.1, xp: 2, icon: '👟' },
    { id: 'treadmill-402m', title: '1/4 мили', meters: 0.402, xp: 3, icon: '🚶' },
    { id: 'treadmill-1km', title: 'Первый километр', meters: 1, xp: 5, icon: '🏃' },
    { id: 'treadmill-2km', title: 'Два километра', meters: 2, xp: 8, icon: '🏃' },
    { id: 'treadmill-3km', title: 'Три километра', meters: 3, xp: 11, icon: '🏃‍♂️' },
    { id: 'treadmill-5km', title: 'Пятёрка', meters: 5, xp: 15, icon: '🏅' },
  ].map((d) => ({
    id: d.id,
    title: d.title,
    description: `Дистанция на беговой дорожке за одну тренировку ≥ ${d.meters} км`,
    xp: d.xp,
    icon: d.icon,
    check: ({ sessions }) => maxTreadmillDistance(sessions) >= d.meters,
  })),

  // --- Силовые рекорды относительно веса тела ---
  {
    id: 'squat-bodyweight',
    title: 'Присед собственного веса',
    description: 'Рабочий вес в приседе сравнялся или превысил вес тела',
    xp: 5,
    icon: '🏋️',
    check: ({ sessions, measurements }) => bestLiftRatio(sessions, measurements, /присед/i) >= 1,
  },
  {
    id: 'deadlift-bodyweight',
    title: 'Тяга собственного веса',
    description: 'Рабочий вес в румынской тяге сравнялся или превысил вес тела',
    xp: 5,
    icon: '🏋️',
    check: ({ sessions, measurements }) => bestLiftRatio(sessions, measurements, /румынск.*тяга|тяга.*румынск/i) >= 1,
  },
  {
    id: 'squat-1-5x',
    title: 'Полтора веса в приседе',
    description: 'Рабочий вес в приседе достиг 1.5× веса тела',
    xp: 15,
    icon: '💪',
    check: ({ sessions, measurements }) => bestLiftRatio(sessions, measurements, /присед/i) >= 1.5,
  },
  {
    id: 'bench-1-5x',
    title: 'Полтора веса в жиме',
    description: 'Рабочий вес в жиме лёжа достиг 1.5× веса тела',
    xp: 15,
    icon: '💪',
    check: ({ sessions, measurements }) => bestLiftRatio(sessions, measurements, /жим.*лёж/i) >= 1.5,
  },

  // --- Подтягивания и отжимания ---
  {
    id: 'first-pullup',
    title: 'Первое подтягивание',
    description: 'Записано хотя бы одно подтягивание',
    xp: 3,
    icon: '🙆',
    check: ({ sessions }) => bestRepsFor(sessions, PULLUPS_RE) >= 1,
  },
  {
    id: 'pullups-10',
    title: '10 подтягиваний подряд',
    description: '10 подтягиваний в одном подходе',
    xp: 10,
    icon: '🦾',
    check: ({ sessions }) => bestRepsFor(sessions, PULLUPS_RE) >= 10,
  },
  {
    id: 'dips-15',
    title: 'Мастер отжиманий',
    description: '15 отжиманий на брусьях в одном подходе',
    xp: 7,
    icon: '🦾',
    check: ({ sessions }) => bestRepsFor(sessions, /отжиман.*брус/i) >= 15,
  },

  // --- Стаж с трекером ---
  {
    id: 'one-month',
    title: 'Месяц в деле',
    description: 'С первой тренировки прошло 30 дней',
    xp: 7,
    icon: '📅',
    check: ({ sessions, today }) => daysSinceFirstSession(sessions, today) >= 30,
  },
  {
    id: 'half-year',
    title: 'Полгода с трекером',
    description: 'С первой тренировки прошло 180 дней',
    xp: 15,
    icon: '📅',
    check: ({ sessions, today }) => daysSinceFirstSession(sessions, today) >= 180,
  },
  {
    id: 'one-year',
    title: 'Год силы',
    description: 'С первой тренировки прошёл год',
    xp: 25,
    icon: '🎖️',
    check: ({ sessions, today }) => daysSinceFirstSession(sessions, today) >= 365,
  },

  // --- Количество тренировок ---
  {
    id: 'sessions-50',
    title: '50 тренировок',
    description: 'Сохранено 50 тренировок',
    xp: 10,
    icon: '📈',
    check: ({ sessions }) => (sessions || []).length >= 50,
  },
  {
    id: 'sessions-100',
    title: '100 тренировок',
    description: 'Сохранено 100 тренировок',
    xp: 15,
    icon: '📈',
    check: ({ sessions }) => (sessions || []).length >= 100,
  },
  {
    id: 'sessions-250',
    title: '250 тренировок',
    description: 'Сохранено 250 тренировок',
    xp: 25,
    icon: '🏆',
    check: ({ sessions }) => (sessions || []).length >= 250,
  },

  // --- Кардио и разнообразие ---
  {
    id: 'all-cardio',
    title: 'Везде понемногу',
    description: 'Хотя бы раз тренировался на каждом виде кардио',
    xp: 10,
    icon: '🎯',
    check: ({ sessions }) => {
      // Сверяем по нормализованным именам (ё→е): «велотренажер», набранный
      // вручную, раньше не засчитывался, потому что в списке стояло «велотренажёр».
      const norm = (s) => (s || '').toLowerCase().replace(/ё/g, 'е');
      const types = ['беговая дорожка', 'велотренажер', 'эллипсо', 'гребн', 'степпер', 'бассейн'].map(norm);
      const usedNames = new Set();
      (sessions || []).forEach((s) => (s.cardio || []).forEach((c) => usedNames.add(norm(c.name))));
      return types.every((type) => [...usedNames].some((name) => name.includes(type)));
    },
  },
  {
    id: 'pool-10h',
    title: 'Пловец',
    description: 'Суммарно 10 часов в бассейне',
    xp: 10,
    icon: '🏊',
    check: ({ sessions }) => totalPoolMinutes(sessions) >= 600,
  },
  {
    id: 'pool-1h-session',
    title: 'Час в воде',
    description: 'Одна тренировка в бассейне продолжительностью час и более',
    xp: 3,
    icon: '🏊',
    check: ({ sessions }) => {
      let max = 0;
      (sessions || []).forEach((s) => (s.cardio || []).forEach((c) => {
        if (/бассейн/i.test(c.name) && c.duration) max = Math.max(max, parseFloat(c.duration));
      }));
      return max >= 60;
    },
  },

  // --- Стрики ---
  {
    id: 'streak-10',
    title: 'Стрик-марафонец',
    description: 'Стрик тренировочных дней без пропуска — 10 дней',
    xp: 10,
    icon: '🔥',
    check: ({ sessions, profile }) => currentMaxStreak(sessions, profile && profile.planId) >= 10,
  },
  {
    id: 'streak-20',
    title: 'Железная серия',
    description: 'Стрик тренировочных дней без пропуска — 20 дней (максимальный множитель XP)',
    xp: 20,
    icon: '⚡',
    check: ({ sessions, profile }) => currentMaxStreak(sessions, profile && profile.planId) >= 20,
  },

  // --- Параметры тела ---
  {
    id: 'full-body-profile',
    title: 'Полный апдейт',
    description: 'Заполнены все параметры тела хотя бы раз',
    xp: 5,
    icon: '📋',
    check: ({ profile }) => !!profile && BODY_FIELDS.every((f) => profile[f.key] != null && profile[f.key] !== ''),
  },
  {
    id: 'growing-strength',
    title: 'Растущая сила',
    description: 'Рабочий вес хотя бы одного упражнения вырос на 20% и более от первой записи',
    xp: 15,
    icon: '📈',
    check: ({ sessions }) => {
      const byExercise = {};
      (sessions || []).slice().sort((a, b) => a.date.localeCompare(b.date)).forEach((s) => {
        (s.exercises || []).forEach((ex) => {
          if (!ex.weight) return;
          if (!byExercise[ex.name]) byExercise[ex.name] = { first: ex.weight, best: ex.weight };
          byExercise[ex.name].best = Math.max(byExercise[ex.name].best, ex.weight);
        });
      });
      return Object.values(byExercise).some((v) => v.first > 0 && v.best / v.first >= 1.2);
    },
  },
  {
    id: 'stable-weight',
    title: 'Стабильный вес',
    description: '4 последних замера веса подряд отличаются не больше чем на 1 кг',
    xp: 5,
    icon: '⚖️',
    check: ({ measurements }) => {
      const sorted = (measurements || []).slice().sort((a, b) => a.date.localeCompare(b.date));
      if (sorted.length < 4) return false;
      const last4 = sorted.slice(-4).map((m) => m.weight).filter((w) => w != null);
      if (last4.length < 4) return false;
      return Math.max(...last4) - Math.min(...last4) <= 1;
    },
  },

  // --- Объём и разнообразие тренировки ---
  {
    id: 'heavy-week',
    title: 'Тяжёлая неделя',
    description: 'Суммарный объём (вес×повторы×подходы) за календарную неделю ≥ 10 000',
    xp: 10,
    icon: '🏗️',
    check: ({ sessions }) => maxWeeklyVolume(sessions) >= 10000,
  },
  {
    id: 'full-body-day',
    title: 'Универсал',
    description: 'За одну тренировку закрыты упражнения на грудь/спину, ноги и руки',
    xp: 7,
    icon: '🧩',
    check: ({ sessions }) => (sessions || []).some((s) => {
      const groups = new Set((s.exercises || []).map((ex) => categorizeExercise(ex.name)).filter(Boolean));
      return groups.has(MUSCLE_GROUPS.legs) && groups.has(MUSCLE_GROUPS.arms)
        && (groups.has(MUSCLE_GROUPS.chest) || groups.has(MUSCLE_GROUPS.back));
    }),
  },
  {
    id: 'good-sleep',
    title: 'Утро после сна',
    description: 'Указано 8 и более часов сна перед тренировкой',
    xp: 3,
    icon: '😴',
    check: ({ sessions }) => (sessions || []).some((s) => s.sleep >= 8),
  },
  {
    id: 'notes-30',
    title: 'Дисциплина дневника',
    description: '30 тренировок с заполненным полем "самочувствие"',
    xp: 7,
    icon: '📝',
    check: ({ sessions }) => (sessions || []).filter((s) => s.feeling && s.feeling.trim()).length >= 30,
  },
];

// Все достижения: 33 основных + 66 из achievementsExtra.js. Функции-помощники
// объявлены ниже (function — поднимаются), проверки зовут их только при расчёте.
const ACH_HELPERS = {
  bestLiftRatio, bestRepsFor, currentMaxStreak, isWeekComplete, getMonday, shiftDate, daysSinceFirstSession,
  maxTreadmillDistance, totalPoolMinutes, maxWeeklyVolume, BODY_FIELDS,
};
// Прогресс до открытия (полоска в «Профиле») — { cur, goal, unit } по id.
const ACH_PROGRESS = makeProgressMap(ACH_HELPERS);

export const ACHIEVEMENTS = [
  ...BASE_ACHIEVEMENTS,
  ...makeExtraAchievements(ACH_HELPERS),
].map((a) => ({ ...a, progress: ACH_PROGRESS[a.id] || null }));

// Лучшее соотношение рабочий_вес / вес_тела для упражнений, чьё название подходит
// под regex. Вес тела — на дату подхода (последнее взвешивание в этот день или
// раньше; до первого взвешивания — первое). Раньше делилось на последнее
// взвешивание вообще, и набранная масса задним числом «отменяла» старый жим.
export function bestLiftRatio(sessions, measurements, nameRegex) {
  const weighs = (measurements || []).filter((m) => m && m.weight > 0)
    .slice().sort((a, b) => a.date.localeCompare(b.date));
  if (weighs.length === 0) return 0;
  const bodyAt = (date) => {
    let w = weighs[0].weight;
    for (const m of weighs) { if (m.date <= date) w = m.weight; else break; }
    return w;
  };
  let best = 0;
  (sessions || []).forEach((s) => (s.exercises || []).forEach((ex) => {
    if (!nameRegex.test(ex.name)) return;
    const w = Number(ex.weight) || 0;
    if (w <= 0) return;
    best = Math.max(best, w / bodyAt(s.date));
  }));
  return best;
}

// Максимум повторов в одном подходе для упражнений, чьё название подходит под
// regex. По подходам, если они записаны: итоговое «повторы» у старых записей
// пошаговой тренировки — повторы последнего подхода, а не лучшего.
export function bestRepsFor(sessions, nameRegex) {
  let max = 0;
  (sessions || []).forEach((s) => (s.exercises || []).forEach((ex) => {
    if (!nameRegex.test(ex.name)) return;
    if (Array.isArray(ex.setLog) && ex.setLog.length > 0) {
      ex.setLog.forEach((x) => { max = Math.max(max, Number(x && x.reps) || 0); });
    } else if (ex.reps) {
      max = Math.max(max, Number(ex.reps) || 0);
    }
  }));
  return max;
}

export function daysSinceFirstSession(sessions, today = todayISO()) {
  if (!sessions || sessions.length === 0) return 0;
  const firstDate = sessions.map((s) => s.date).sort()[0];
  const toUtc = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.floor((toUtc(today) - toUtc(firstDate)) / (1000 * 60 * 60 * 24));
}

export function totalPoolMinutes(sessions) {
  let total = 0;
  (sessions || []).forEach((s) => (s.cardio || []).forEach((c) => {
    if (/бассейн/i.test(c.name) && c.duration) total += parseFloat(c.duration) || 0;
  }));
  return total;
}

// Самая длинная серия тренировочных дней (по дням плана) во всей истории, а не
// только текущая.
export function currentMaxStreak(sessions, currentPlanId = null) {
  const uniqueDates = [...new Set((sessions || []).map((s) => s.date))].sort();
  const activeDates = new Set(uniqueDates);
  const isTrainingDay = makeTrainingDayCheck(sessions, currentPlanId);
  let best = 0;
  uniqueDates.forEach((date) => {
    best = Math.max(best, computeStreakForDate(activeDates, date, isTrainingDay));
  });
  return best;
}

// Максимальный суммарный объём (вес×повторы×подходы) за одну календарную неделю (Пн-Вс) во всей истории.
export function maxWeeklyVolume(sessions) {
  const byWeek = {};
  (sessions || []).forEach((s) => {
    const monday = getMonday(s.date);
    const volume = (s.exercises || []).reduce((sum, ex) => {
      const w = Number(ex.weight) || 0;
      const r = Number(ex.reps) || 0;
      const sets = Number(ex.sets) || 0;
      return sum + w * r * sets;
    }, 0);
    byWeek[monday] = (byWeek[monday] || 0) + volume;
  });
  return Math.max(0, ...Object.values(byWeek));
}

// Максимальная дистанция (км) на беговой дорожке за одну тренировку во всей
// истории: сумма всех записей дорожки тренировки — разминки, финиша и секторов
// кардио-дня («Сектор 1A»…). Раньше бралась одна запись, а секторы не
// считались вовсе — в их названии нет слова «дорожка».
export function maxTreadmillDistance(sessions) {
  let max = 0;
  (sessions || []).forEach((s) => {
    const total = (s.cardio || [])
      .filter((c) => c && (/дорожк/i.test(c.name) || /^сектор\s/i.test(c.name)))
      .reduce((sum, c) => sum + (parseFloat(c.distance) || 0), 0);
    if (total > max) max = total;
  });
  return Math.round(max * 1000) / 1000;
}

// Разделы достижений для «Профиля». Порядок внутри раздела — по нарастающей
// (100 м → 5 км, первый рекорд → 100 рекордов); на экране открытые идут первыми,
// порядок внутри открытых и закрытых — этот же. Новое достижение без раздела
// попадёт в «Прочее» — тест следит, чтобы такого не было.
export const ACH_CATEGORIES = [
  { key: 'regularity', title: 'Регулярность и стаж', ids: [
    'first-week', 'weeks-4', 'weeks-12', 'streak-10', 'streak-20', 'streak-30', 'streak-50', 'comeback',
    'one-month', 'half-year', 'one-year', 'two-years', 'sessions-50', 'sessions-100', 'sessions-250', 'sessions-500'] },
  { key: 'plan', title: 'План и циклы', ids: [
    'plan-start', 'plan-week', 'heavy-week-done', 'cycle-1', 'cycle-3', 'perfectionist', 'improviser'] },
  { key: 'records', title: 'Рекорды и рост', ids: [
    'records-1', 'records-10', 'records-25', 'records-50', 'records-100', 'records-session-3', 'records-week-6', 'growing-strength'] },
  { key: 'relative', title: 'Сила к весу тела', ids: [
    'bench-bodyweight', 'bench-1-25x', 'bench-1-5x', 'squat-bodyweight', 'squat-1-5x', 'squat-2x',
    'deadlift-bodyweight', 'rdl-2x', 'row-bodyweight', 'ohp-0-75x'] },
  { key: 'clubs', title: 'Клубы', ids: ['bench-100', 'squat-100', 'pull-150', 'club-300', 'club-400'] },
  { key: 'bodyweight', title: 'Свой вес', ids: [
    'first-pullup', 'pullups-10', 'pullups-15', 'pullups-20', 'pullups-weighted', 'pullups-plus-20', 'dips-15', 'dips-20', 'plank-3min'] },
  { key: 'volume', title: 'Объём и время', ids: [
    'heavy-week', 'tonnage-week-25t', 'tonnage-week-50t', 'tonnage-session-10t', 'tonnage-total-100t', 'tonnage-total-1000t',
    'sets-1000', 'reps-10000', 'long-session', 'gym-hours-50', 'gym-hours-100'] },
  { key: 'cardio', title: 'Кардио и высота', ids: [
    'treadmill-100m', 'treadmill-402m', 'treadmill-1km', 'treadmill-2km', 'treadmill-3km', 'treadmill-5km',
    'treadmill-total-50km', 'treadmill-total-100km', 'finisher-30',
    'climb-500', 'climb-1000', 'climb-elbrus', 'climb-everest', 'climb-20000',
    'pool-1h-session', 'pool-10h', 'all-cardio'] },
  { key: 'body', title: 'Тело и вес', ids: [
    'full-body-profile', 'weigh-7-days', 'weigh-100', 'stable-weight', 'waist-minus-2', 'fat-minus-2', 'adonis-1-5'] },
  { key: 'diary', title: 'Дневник', ids: ['good-sleep', 'slept-7', 'notes-30', 'full-summary-30', 'exercise-notes-50', 'grit'] },
  { key: 'variety', title: 'Разнообразие', ids: ['full-body-day', 'all-groups-week', 'collector-40'] },
];

// Список достижений → разделы: [{ key, title, items, done, total }]. Внутри
// раздела сначала открытые, потом закрытые, каждые — в порядке ACH_CATEGORIES.
export function groupAchievements(list) {
  const byId = new Map((list || []).map((a) => [a.id, a]));
  const used = new Set();
  const groups = ACH_CATEGORIES.map((c) => {
    const items = c.ids.map((id) => byId.get(id)).filter(Boolean);
    items.forEach((a) => used.add(a.id));
    return { key: c.key, title: c.title, items };
  });
  const rest = (list || []).filter((a) => !used.has(a.id));
  if (rest.length) groups.push({ key: 'other', title: 'Прочее', items: rest });
  return groups
    .filter((g) => g.items.length > 0)
    .map((g) => ({
      ...g,
      items: [...g.items.filter((a) => a.unlocked), ...g.items.filter((a) => !a.unlocked)],
      done: g.items.filter((a) => a.unlocked).length,
      total: g.items.length,
    }));
}

// Сохранённые открытия: { id: 'ГГГГ-ММ-ДД' }; '' — дата неизвестна.
function storedOf(profile) {
  const st = profile && profile.achievements;
  return st && typeof st === 'object' && !Array.isArray(st) ? st : {};
}

export function computeAchievements({ sessions, measurements, profile, today = todayISO() }) {
  const stored = storedOf(profile);
  return ACHIEVEMENTS.map((a) => {
    const saved = Object.prototype.hasOwnProperty.call(stored, a.id);
    const unlocked = saved || !!a.check({ sessions, measurements, profile, today });
    // Прогресс — только у закрытых и только там, где порог числовой.
    let progress = null;
    if (!unlocked && a.progress) {
      try {
        const pr = a.progress({ sessions: sessions || [], measurements: measurements || [], profile, today });
        if (pr && pr.goal > 0 && isFinite(pr.cur)) progress = { ...pr, pct: Math.min(0.99, pr.cur / pr.goal) };
      } catch (e) { progress = null; }
    }
    return {
      ...a,
      unlocked,
      unlockedAt: saved ? (stored[a.id] || null) : null,
      progress,
    };
  });
}

// Новые открытия, которых ещё нет в profile.achievements: { id: дата }. Дата —
// самый ранний день, когда условие уже выполнялось (перебор по дням с данными и
// по датам стажа); так у открытых до этой версии тоже появляются честные даты.
// Пусто — {}.
export function achievementUnlockDates({ sessions, measurements, profile, today = todayISO() }) {
  const stored = storedOf(profile);
  const all = { sessions: sessions || [], measurements: measurements || [], profile, today };
  const pending = ACHIEVEMENTS.filter((a) => !Object.prototype.hasOwnProperty.call(stored, a.id) && a.check(all));
  if (pending.length === 0) return {};

  const bodyLog = bodyLogOf(profile, today);
  const firstSession = all.sessions.map((x) => x.date).sort()[0];
  const dates = new Set([
    ...all.sessions.map((x) => x.date), ...all.measurements.map((x) => x.date), ...bodyLog.map((x) => x.date),
  ]);
  if (firstSession) [30, 180, 365].forEach((n) => dates.add(shiftDate(firstSession, n)));
  const timeline = [...dates].filter((d) => d && d <= today).sort();

  // Параметры тела на дату — для «Полного апдейта».
  const profileAt = (d) => {
    const at = { ...(profile || {}), bodyLog: bodyLog.filter((e) => e.date <= d) };
    ['height', 'waist', 'hips', 'chest', 'shoulders', 'bodyFat'].forEach((k) => { at[k] = null; });
    bodyLog.filter((e) => e.date <= d).forEach((e) => {
      ['height', 'waist', 'hips', 'chest', 'shoulders', 'bodyFat'].forEach((k) => { if (e[k] != null) at[k] = e[k]; });
    });
    return at;
  };

  const out = {};
  pending.forEach((a) => {
    const when = timeline.find((d) => a.check({
      sessions: all.sessions.filter((x) => x.date <= d),
      measurements: all.measurements.filter((x) => x.date <= d),
      profile: profileAt(d),
      today: d,
    }));
    out[a.id] = when || today;
  });
  return out;
}

// Недельная серия для карточки «Неделя» в «Прогрессе». Дни недели — только дни
// тренировок по плану (у плана на 4 дня — 4 клетки); weekday — номер дня
// (0 — воскресенье). weekMultiplier — сколько недель подряд закрыты целиком,
// считая от прошлой назад (+1, если закрыта и текущая).
export function computeWeekStreak(sessions, currentPlanId = null, today = todayISO(), isTrainingDay = null) {
  const activeDates = new Set((sessions || []).map((s) => s.date));
  const check = isTrainingDay || makeTrainingDayCheck(sessions, currentPlanId);
  const todayMonday = getMonday(today);

  const currentWeekDays = [];
  for (let i = 0; i < 7; i += 1) {
    const day = shiftDate(todayMonday, i);
    if (!check(day)) continue;
    currentWeekDays.push({ date: day, weekday: (i + 1) % 7, done: activeDates.has(day), isFuture: day > today });
  }

  let weekMultiplier = 0;
  let checkMonday = shiftDate(todayMonday, -7);
  for (let guard = 0; guard < 260 && isWeekComplete(activeDates, checkMonday, check); guard += 1) {
    weekMultiplier += 1;
    checkMonday = shiftDate(checkMonday, -7);
  }

  const currentWeekDone = currentWeekDays.filter((d) => d.done).length;
  const currentWeekComplete = currentWeekDays.length > 0 && currentWeekDone === currentWeekDays.length;
  if (currentWeekComplete) weekMultiplier += 1;

  return { currentWeekDays, currentWeekDone, weekMultiplier, currentWeekComplete };
}
