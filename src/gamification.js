import {
  Dumbbell, TrendingUp, Flame, Footprints, Activity, Medal, Award, Zap, Calendar, Trophy, Target,
  Waves, ClipboardList, Scale, Layers, Puzzle, Moon, FileText,
} from 'lucide-react';
import { toISO, todayISO, shiftDate } from './dateUtils.js';
import { categorizeExercise, MUSCLE_GROUPS } from './tabs/workoutTabHelpers.jsx';

// Иконки достижений (lucide) вместо эмодзи — ключ совпадает с прежним полем icon.
export const ACH_ICON = {
  '🏋️': Dumbbell, '💪': Dumbbell, '🔥': Flame, '👟': Footprints, '🚶': Footprints,
  '🏃': Activity, '🏃‍♂️': Activity, '🏅': Medal, '🎖️': Medal, '🙆': Award, '🦾': Zap,
  '⚡': Zap, '📅': Calendar, '📈': TrendingUp, '🏆': Trophy, '🎯': Target, '🏊': Waves,
  '📋': ClipboardList, '⚖️': Scale, '🏗️': Layers, '🧩': Puzzle, '😴': Moon, '📝': FileText,
};

export const BODY_FIELDS = [
  { key: 'height', label: 'Рост, см' },
  { key: 'waist', label: 'Талия, см' },
  { key: 'hips', label: 'Бёдра, см' },
  { key: 'chest', label: 'Грудь, см' },
  { key: 'shoulders', label: 'Плечи, см' },
  { key: 'bodyFat', label: '% жира (опц.)' },
];

export function computeRecords(sessions) {
  const records = {};
  (sessions || []).forEach((s) => {
    (s.exercises || []).forEach((ex) => {
      if (!ex.weight) return;
      if (!records[ex.name] || ex.weight > records[ex.name].weight) {
        records[ex.name] = { weight: ex.weight, reps: ex.reps, date: s.date };
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
// Прогрессия подобрана так, чтобы 50-й уровень был достижим примерно за 1-1.5 года
// активных тренировок (5 дней в неделю со средним стрик-множителем).
export const LEVEL_THRESHOLDS = [0, 6, 13, 21, 30, 41, 53, 66, 80, 95, 111, 128, 146, 165, 185, 206, 228, 251, 275, 300, 326, 353, 381, 410, 440, 471, 503, 536, 570, 605, 641, 677, 713, 749, 785, 821, 857, 893, 929, 965, 1001, 1037, 1073, 1109, 1145, 1181, 1217, 1253, 1289, 1325];

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

// День недели: 0 = воскресенье, 6 = суббота (стандарт JS Date)
export function isWeekend(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const day = new Date(y, m - 1, d).getDay();
  return day === 0 || day === 6;
}

// Считает длину стрика последовательных тренировочных дней, заканчивающегося датой sessionDate.
// Будние дни без тренировки обрывают стрик. Выходные — особый случай: если в выходной была
// тренировка, она наращивает стрик (награждаем за дополнительное усилие); если тренировки не
// было — выходной пропускается без влияния (не обрывает и не наращивает), в отличие от буднего дня.
export function computeStreakForDate(activeDates, sessionDate) {
  let streak = 1;
  let cursor = shiftDate(sessionDate, -1);
  while (true) {
    if (isWeekend(cursor)) {
      if (activeDates.has(cursor)) { streak += 1; }
      cursor = shiftDate(cursor, -1);
      continue;
    }
    if (activeDates.has(cursor)) { streak += 1; cursor = shiftDate(cursor, -1); continue; }
    break;
  }
  return streak;
}

// Пересчитывает итоговый XP по всей истории тренировок: 1 базовый XP за тренировку,
// умноженный на стрик-множитель на момент этой тренировки (по датам, не по порядку сохранения).
export function computeTotalXpFromSessions(sessions) {
  const uniqueDates = [...new Set((sessions || []).map((s) => s.date))].sort();
  const activeDates = new Set(uniqueDates);
  let totalXp = 0;
  uniqueDates.forEach((date) => {
    const streakDay = computeStreakForDate(activeDates, date);
    totalXp += 1 * getStreakMultiplier(streakDay);
  });
  return totalXp;
}

// ============================================================
// Достижения
// Каждое достижение — условие на основе sessions/measurements/profile.
// Список пока тестовый, дальше будет расширен.
// ============================================================

export const ACHIEVEMENTS = [
  {
    id: 'bench-bodyweight',
    title: 'Жим лёжа собственного веса',
    description: 'Рабочий вес в жиме лёжа сравнялся или превысил вес тела',
    xp: 5,
    icon: '🏋️',
    check: ({ sessions, measurements }) => {
      const latestWeightEntry = (measurements || []).slice().sort((a, b) => a.date.localeCompare(b.date)).pop();
      if (!latestWeightEntry || !latestWeightEntry.weight) return false;
      const records = computeRecords(sessions);
      const benchNames = Object.keys(records).filter((name) => /жим.*лёж/i.test(name));
      if (benchNames.length === 0) return false;
      const bestBench = Math.max(...benchNames.map((name) => records[name].weight));
      return bestBench >= latestWeightEntry.weight;
    },
  },
  {
    id: 'first-week',
    title: 'Первая неделя',
    description: 'Закрыты все 5 тренировочных дней (Пн–Пт) одной недели без пропусков',
    xp: 10,
    icon: '🔥',
    check: ({ sessions }) => {
      if (!sessions || sessions.length === 0) return false;
      const activeDates = new Set(sessions.map((s) => s.date));
      const mondays = new Set([...activeDates].map((d) => getMonday(d)));
      return [...mondays].some((monday) => {
        for (let i = 0; i < 5; i++) {
          if (!activeDates.has(shiftDate(monday, i))) return false;
        }
        return true;
      });
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
    title: 'Двойной жим',
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
    check: ({ sessions }) => bestRepsFor(sessions, /подтягиван/i) >= 1,
  },
  {
    id: 'pullups-10',
    title: '10 подтягиваний подряд',
    description: '10 подтягиваний в одном подходе',
    xp: 10,
    icon: '🦾',
    check: ({ sessions }) => bestRepsFor(sessions, /подтягиван/i) >= 10,
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
    check: ({ sessions }) => daysSinceFirstSession(sessions) >= 30,
  },
  {
    id: 'half-year',
    title: 'Полгода с трекером',
    description: 'С первой тренировки прошло 180 дней',
    xp: 15,
    icon: '📅',
    check: ({ sessions }) => daysSinceFirstSession(sessions) >= 180,
  },
  {
    id: 'one-year',
    title: 'Год силы',
    description: 'С первой тренировки прошёл год',
    xp: 25,
    icon: '🎖️',
    check: ({ sessions }) => daysSinceFirstSession(sessions) >= 365,
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
      const types = ['беговая дорожка', 'велотренажёр', 'эллипсо', 'гребн', 'степпер', 'бассейн'];
      const usedNames = new Set();
      (sessions || []).forEach((s) => (s.cardio || []).forEach((c) => usedNames.add(c.name.toLowerCase())));
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
    check: ({ sessions }) => currentMaxStreak(sessions) >= 10,
  },
  {
    id: 'streak-20',
    title: 'Железная серия',
    description: 'Стрик тренировочных дней без пропуска — 20 дней (максимальный множитель XP)',
    xp: 20,
    icon: '⚡',
    check: ({ sessions }) => currentMaxStreak(sessions) >= 20,
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

// Лучшее соотношение рабочий_вес / вес_тела для упражнений, чьё название подходит под regex.
export function bestLiftRatio(sessions, measurements, nameRegex) {
  const latestWeightEntry = (measurements || []).slice().sort((a, b) => a.date.localeCompare(b.date)).pop();
  if (!latestWeightEntry || !latestWeightEntry.weight) return 0;
  const records = computeRecords(sessions);
  const matchNames = Object.keys(records).filter((name) => nameRegex.test(name));
  if (matchNames.length === 0) return 0;
  const bestWeight = Math.max(...matchNames.map((name) => records[name].weight));
  return bestWeight / latestWeightEntry.weight;
}

// Максимум повторов в одном подходе для упражнений, чьё название подходит под regex.
export function bestRepsFor(sessions, nameRegex) {
  let max = 0;
  (sessions || []).forEach((s) => (s.exercises || []).forEach((ex) => {
    if (nameRegex.test(ex.name) && ex.reps) max = Math.max(max, Number(ex.reps) || 0);
  }));
  return max;
}

export function daysSinceFirstSession(sessions) {
  if (!sessions || sessions.length === 0) return 0;
  const firstDate = sessions.map((s) => s.date).sort()[0];
  const [y, m, d] = firstDate.split('-').map(Number);
  const diffMs = Date.now() - new Date(y, m - 1, d).getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

export function totalPoolMinutes(sessions) {
  let total = 0;
  (sessions || []).forEach((s) => (s.cardio || []).forEach((c) => {
    if (/бассейн/i.test(c.name) && c.duration) total += parseFloat(c.duration) || 0;
  }));
  return total;
}

// Самый длинный стрик тренировочных дней (Пн-Пт, выходные не считаются) во всей истории,
// не только текущий — чтобы достижение оставалось разблокированным даже после паузы.
export function currentMaxStreak(sessions) {
  const uniqueDates = [...new Set((sessions || []).map((s) => s.date))].sort();
  const activeDates = new Set(uniqueDates);
  let best = 0;
  uniqueDates.forEach((date) => {
    best = Math.max(best, computeStreakForDate(activeDates, date));
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

// Максимальная дистанция (км) на беговой дорожке за одну тренировку во всей истории.
export function maxTreadmillDistance(sessions) {
  let max = 0;
  (sessions || []).forEach((s) => {
    (s.cardio || []).forEach((c) => {
      if (/беговая дорожка|дорожк/i.test(c.name) && c.distance) {
        const dist = parseFloat(c.distance);
        if (dist > max) max = dist;
      }
    });
  });
  return max;
}

export function computeAchievements({ sessions, measurements, profile }) {
  return ACHIEVEMENTS.map((a) => ({
    ...a,
    unlocked: a.check({ sessions, measurements, profile }),
  }));
}

export function computeWeekStreak(sessions) {
  const activeDates = new Set((sessions || []).map((s) => s.date));
  const todayMonday = getMonday(todayISO());

  // Текущая неделя: 5 кружков пн..пт, true если в этот день была активность
  const currentWeekDays = [];
  for (let i = 0; i < 5; i++) {
    const day = shiftDate(todayMonday, i);
    currentWeekDays.push({ date: day, done: activeDates.has(day), isFuture: day > todayISO() });
  }

  // Считаем подряд идущие ПОЛНОСТЬЮ закрытые недели (все 5 будних дней),
  // начиная с недели перед текущей и далее в прошлое.
  let weekMultiplier = 0;
  let checkMonday = shiftDate(todayMonday, -7);
  while (true) {
    let allDone = true;
    for (let i = 0; i < 5; i++) {
      const day = shiftDate(checkMonday, i);
      if (!activeDates.has(day)) { allDone = false; break; }
    }
    if (!allDone) break;
    weekMultiplier += 1;
    checkMonday = shiftDate(checkMonday, -7);
  }

  const currentWeekDone = currentWeekDays.filter((d) => d.done).length;
  const currentWeekComplete = currentWeekDone === 5;
  if (currentWeekComplete) weekMultiplier += 1;

  return { currentWeekDays, currentWeekDone, weekMultiplier, currentWeekComplete };
}
