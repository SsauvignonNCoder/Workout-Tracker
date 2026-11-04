// Обмен планами: промт для стороннего ИИ, разбор его ответа, сверка названий упражнений,
// коды и ссылки для друзей. Чистые функции — их прогоняют тесты; экраны — tabs/PlanStudio.jsx.
//
// Формат тот же, что хранится (src/userPlans.js), поэтому встроенный ИИ, когда его
// подключат, сможет отдавать план в те же decodePlanText и экран проверки.
//
// Ответ ИИ — это чужой текст: разбираем терпимо (лишние слова вокруг, запятая в конце
// списка, типографские кавычки), но всё проходит через validatePlan.
//
// ДЛЯ ИИ ФОРМАТ КОМПАКТНЫЙ: дни описаны один раз, у упражнения — строка на все недели,
// ["Жим штанги лёжа", "4x8-10", "5x8-10", "5x4-6", "3x8-10"]. Настоящий ответ в полном формате на
// 3 дня × 4 недели занял 10 000 знаков, половина — отступы, и оборвался на полуслове. Полный
// формат (weeks[].days) тоже принимаем: не все ИИ точно следуют образцу.

import { exName, tr, getLang } from './i18n.js';
import { validatePlan, normalizeLoad, WEEK_ORDER } from './userPlans.js';

export const FORMAT_ID = 'workout-plan-v2';
const BOT_LINK = 'https://t.me/WorkoutTrackerSBot';
const START_PREFIX = 'plan_';

const WEEKDAY_ALIASES = {
  mon: ['mon', 'monday', 'пн', 'пон', 'понедельник'],
  tue: ['tue', 'tuesday', 'вт', 'вторник'],
  wed: ['wed', 'wednesday', 'ср', 'среда'],
  thu: ['thu', 'thursday', 'чт', 'четверг'],
  fri: ['fri', 'friday', 'пт', 'пятница'],
  sat: ['sat', 'saturday', 'сб', 'суббота'],
  sun: ['sun', 'sunday', 'вс', 'воскресенье'],
};
const TYPE_ALIASES = {
  strength: 'strength', силовая: 'strength', gym: 'strength',
  cardio: 'cardio', кардио: 'cardio', treadmill: 'cardio', дорожка: 'cardio',
  pool: 'pool', бассейн: 'pool', swim: 'pool', swimming: 'pool',
};

// Текст с планом → строка JSON: блок кода, а если его нет — от первой до последней скобки.
export function extractJson(text) {
  const s = String(text || '');
  const fence = s.match(/```[a-zA-Z]*\s*([\s\S]*?)```/);
  if (fence && fence[1].includes('{')) return fence[1].trim();
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  return a >= 0 && b > a ? s.slice(a, b + 1) : null;
}

function parseLoose(json) {
  try {
    return JSON.parse(json);
  } catch (e) { /* ниже — вторая попытка */ }
  try {
    return JSON.parse(json
      .replace(/[“”„‟]/g, '"')
      .replace(/ /g, ' ')
      .replace(/^\s*\/\/.*$/gm, '')
      .replace(/,(\s*[}\]])/g, '$1'));
  } catch (e) {
    return null;
  }
}

function weekdayCode(v) {
  if (typeof v === 'number') return WEEK_ORDER[v - 1] || null;
  const s = String(v == null ? '' : v).trim().toLowerCase().replace(/\.$/, '');
  return WEEK_ORDER.find((code) => WEEKDAY_ALIASES[code].includes(s)) || null;
}

// load бывает и строкой: «75-80», «100+».
function loadFrom(v) {
  if (Array.isArray(v)) return normalizeLoad(v);
  const m = String(v == null ? '' : v).match(/(\d+)\s*(?:[-–—]\s*(\d+))?/);
  return m ? normalizeLoad([m[1], m[2] == null ? null : m[2]]) : null;
}

function dayFrom(d) {
  const type = TYPE_ALIASES[String((d && d.type) || 'strength').trim().toLowerCase()] || 'strength';
  const title = d && (d.title || d.name);
  if (type === 'cardio') return { type, title, distance: d.distance, incline: d.incline };
  if (type === 'pool') return { type, title, duration: d.duration };
  return {
    type,
    title,
    warmupRun: d && d.warmupRun !== false,
    finisherRun: d && d.finisherRun !== false,
    exercises: (Array.isArray(d && d.exercises) ? d.exercises : []).map((ex) => ({
      name: ex && (ex.name || ex.exercise),
      sets: ex && ex.sets,
      reps: ex && ex.reps,
      where: ex && ex.where,
      tip: ex && ex.tip,
    })),
  };
}

// «4x8-10» → подходы и повторы. Разделитель бывает разный: x, х, ×, *.
function parseSetsReps(text) {
  const s = String(text == null ? '' : text).trim();
  const m = s.match(/^(\d+)\s*[xXхХ×*]\s*(.+)$/);
  return m ? { sets: m[1], reps: m[2].trim() } : { sets: 3, reps: s };
}

const isSkip = (v) => v == null || /^[-–—]?$/.test(String(v).trim());

// Строка упражнения на неделю. Записей меньше, чем недель, — последняя действует дальше.
function exerciseForWeek(row, week) {
  if (!Array.isArray(row)) return row;
  const parts = row.slice(1);
  if (parts.length === 0) return { name: row[0] };
  const part = parts[Math.min(week, parts.length - 1)];
  return isSkip(part) ? null : { name: row[0], ...parseSetsReps(part) };
}

const rowWeeks = (d) => (Array.isArray(d && d.exercises) ? d.exercises : [])
  .reduce((max, row) => (Array.isArray(row) ? Math.max(max, row.length - 1) : max), 1);

// Компактный план: root.days — дни, root.weeks — только подписи и проценты недель (или число).
function weeksFromCompact(root) {
  const meta = Array.isArray(root.weeks) ? root.weeks : [];
  const count = Math.max(meta.length, typeof root.weeks === 'number' ? root.weeks : 0, ...root.days.map(rowWeeks), 1);
  return Array.from({ length: count }, (_, w) => ({
    label: meta[w] && meta[w].label,
    load: meta[w] && meta[w].load,
    days: root.days.map((d) => (d && Array.isArray(d.exercises)
      ? { ...d, exercises: d.exercises.map((row) => exerciseForWeek(row, w)).filter(Boolean) }
      : d)),
  }));
}

// Разобранный объект → вид для validatePlan. Дни недели могут прийти не с понедельника:
// вместе с ними сортируем и дни в неделях, иначе они разъехались бы.
function fromExternal(obj) {
  const root = obj.plan && (obj.plan.weeks || obj.plan.days) ? obj.plan : obj;
  const codes = (Array.isArray(root.weekdays) ? root.weekdays : []).map(weekdayCode);
  const known = codes.filter(Boolean);
  const order = WEEK_ORDER.filter((c) => known.includes(c));
  const source = Array.isArray(root.days) ? weeksFromCompact(root) : (Array.isArray(root.weeks) ? root.weeks : []);
  const weeks = source.map((w) => {
    const raw = Array.isArray(w && w.days) ? w.days : [];
    const days = raw.length === codes.length && known.length === codes.length
      ? order.map((c) => raw[codes.indexOf(c)])
      : raw;
    return { label: w && w.label, load: loadFrom(w && w.load), days: days.map(dayFrom) };
  });
  return { title: root.title || root.name, weekdays: order, weeks };
}

const normName = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, ' ').trim();

function bigrams(s) {
  const out = new Map();
  for (let i = 0; i < s.length - 1; i += 1) {
    const g = s.slice(i, i + 2);
    out.set(g, (out.get(g) || 0) + 1);
  }
  return out;
}

function dice(a, b) {
  const A = bigrams(a);
  const B = bigrams(b);
  let hit = 0;
  let total = 0;
  A.forEach((n, g) => { total += n; hit += Math.min(n, B.get(g) || 0); });
  B.forEach((n) => { total += n; });
  return total ? (2 * hit) / total : 0;
}

const SUGGEST_FROM = 0.45;
const SUGGEST_SURE = 0.7;
const SUGGEST_GAP = 0.1;
const MAX_SUGGESTIONS = 3;

// Похожие упражнения из своего списка, лучшие первыми. Сверяем и с ключом, и с названием на
// языке интерфейса: английский ответ ИИ сопоставляется с английскими названиями.
export function suggestExercises(name, known) {
  const q = normName(name);
  return (known || [])
    .map((n) => ({ name: n, score: Math.max(dice(q, normName(n)), dice(q, normName(exName(n)))) }))
    .filter((x) => x.score >= SUGGEST_FROM)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_SUGGESTIONS);
}

function mapExercises(plan, fn) {
  return {
    ...plan,
    weeks: plan.weeks.map((w) => ({
      ...w,
      days: w.days.map((d) => (d.exercises ? { ...d, exercises: d.exercises.map(fn) } : d)),
    })),
  };
}

// Сводим названия к своему списку. Разница в регистре, ё и знаках — то же упражнение,
// исправляем молча. Остальное — на проверку: { name, suggestions, choice }.
export function resolveNames(plan, known) {
  const byNorm = new Map();
  (known || []).forEach((n) => {
    byNorm.set(normName(n), n);
    byNorm.set(normName(exName(n)), n);
  });
  const unknown = new Map();
  const out = mapExercises(plan, (ex) => {
    const hit = byNorm.get(normName(ex.name));
    if (hit) return { ...ex, name: hit };
    if (!unknown.has(ex.name)) {
      const suggestions = suggestExercises(ex.name, known);
      unknown.set(ex.name, {
        name: ex.name,
        suggestions: suggestions.map((s) => s.name),
        // Сами выбираем только явного лидера: при равных вариантах (гантели или штанга)
        // сохранение без выбора молча подменило бы упражнение.
        choice: suggestions[0] && suggestions[0].score >= SUGGEST_SURE
          && (!suggestions[1] || suggestions[0].score - suggestions[1].score >= SUGGEST_GAP)
          ? suggestions[0].name : ex.name,
      });
    }
    return ex;
  });
  return { plan: out, unknown: [...unknown.values()] };
}

// Выбор человека на экране проверки: { как в ответе: на что заменить }.
export const applyNameChoices = (plan, choices) => mapExercises(plan, (ex) => (
  choices[ex.name] ? { ...ex, name: choices[ex.name] } : ex
));

// Оборван ли текст: остались незакрытые скобки или строка. Скобки внутри строк не считаем.
export function looksCutOff(text) {
  const s = String(text || '');
  const start = s.indexOf('{');
  if (start < 0) return false;
  let depth = 0;
  let inString = false;
  for (let i = start; i < s.length; i += 1) {
    const c = s[i];
    if (inString) {
      if (c === '\\') i += 1;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === '{' || c === '[') depth += 1;
    else if (c === '}' || c === ']') depth -= 1;
  }
  return inString || depth > 0;
}

// Ответ: { ok: true, title, plan, unknown } или { ok: false, errors }.
export function decodePlanText(text, known) {
  const json = extractJson(text);
  if (!json) return { ok: false, errors: [tr('Не нашёл в тексте план — скопируй ответ ИИ целиком')] };
  const obj = parseLoose(json);
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return {
      ok: false,
      errors: [looksCutOff(text)
        ? tr('Ответ оборван: ИИ не дописал план. Напиши ему «выдай план заново, компактно, одним блоком кода» и вставь новый ответ')
        : tr('План в ответе повреждён — попроси ИИ прислать его ещё раз одним блоком кода')],
    };
  }
  const res = validatePlan(fromExternal(obj));
  if (!res.ok) return res;
  const { plan, unknown } = resolveNames(res.plan, known);
  return { ok: true, title: res.title, plan, unknown };
}

// ---- Друзья ----

// Что уходит другу: сам план, без истории правок. Весов, рекордов и имени автора в плане нет.
export const planForShare = (title, stored) => ({
  title, weekdays: stored.weekdays, weeks: stored.weeks,
});

export const normalizeCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);

export const shareLink = (code) => `${BOT_LINK}?startapp=${START_PREFIX}${code}`;

export function codeFromStartParam(param) {
  const m = String(param || '').match(/^plan_([A-Za-z0-9]{4,16})$/);
  return m ? normalizeCode(m[1]) : null;
}

// Параметр запуска: Telegram кладёт его и в initData, и в адрес страницы.
export function launchPlanCode() {
  try {
    const tg = window.Telegram && window.Telegram.WebApp;
    const param = (tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param)
      || new URLSearchParams(window.location.search).get('tgWebAppStartParam');
    return codeFromStartParam(param);
  } catch (e) {
    return null;
  }
}

// ---- Промт ----

const EXAMPLE_NAMES = ['Жим штанги лёжа', 'Тяга штанги в наклоне'];

function exampleJson(lang) {
  const en = lang === 'en';
  const q = (s) => JSON.stringify(s);
  const weeks = en
    ? [['Base', [75, 80]], ['Volume', [80, 85]], ['Heavy', [100, null]], ['Deload', [70, 75]]]
    : [['База', [75, 80]], ['Объём', [80, 85]], ['Тяжёлая', [100, null]], ['Разгрузка', [70, 75]]];
  return `{
"format":${q(FORMAT_ID)},
"title":${q(en ? 'Strength, 3 days' : 'Сила на 3 дня')},
"weekdays":["mon","wed","fri"],
"weeks":[${weeks.map(([label, load]) => `{"label":${q(label)},"load":${JSON.stringify(load)}}`).join(',')}],
"days":[
{"type":"strength","title":${q(en ? 'Upper body' : 'Верх')},"warmupRun":true,"finisherRun":false,"exercises":[
[${q(exName(EXAMPLE_NAMES[0]))},"4x8-10","5x8-10","5x4-6","3x8-10"],
[${q(exName(EXAMPLE_NAMES[1]))},"3x10-12","4x10-12","4x6-8","-"]
]},
{"type":"cardio","title":${q(en ? 'Treadmill' : 'Дорожка')},"distance":3,"incline":10},
{"type":"pool","title":${q(en ? 'Pool' : 'Бассейн')},"duration":45}
]
}`;
}

const PROMPT_RU = (example, list) => `Ты опытный тренер. Составь мне план тренировок для приложения «Дневник тренировок».

Сначала задай мне вопросы и дождись ответов:
- цель: сила, масса, рельеф, общая форма;
- опыт и сколько уже тренируюсь;
- в какие дни недели могу заниматься и сколько длится тренировка;
- какое оборудование есть: зал, дом, гантели, беговая дорожка, бассейн;
- травмы и ограничения.

Когда данных хватит, коротко опиши план словами и спроси, всё ли устраивает. После моего согласия выдай итоговый план строго одним блоком кода JSON, без комментариев и лишних отступов, точно как в образце.

Формат:
${example}

Правила:
- weekdays — дни тренировок: mon, tue, wed, thu, fri, sat, sun.
- weeks — от 1 до 8 недель, план идёт по кругу. Для каждой недели: label — необязательное название, разгрузочную назови «Разгрузка»; load — необязательный процент от рекорда для подсказки веса: [75, 80] или [100, null] («от 100%»), если не нужен, ставь null.
- days — дни одной недели: ровно столько и в том же порядке, что в weekdays. Дни отдыха не включай. Недели отличаются только подходами и повторами, поэтому каждый день описывай один раз.
- type: strength — силовая, cardio — беговая дорожка (distance в км, incline в %), pool — бассейн (duration в минутах).
- Каждое упражнение силового дня — одна строка: название, затем по одной записи "подходыxповторы" на каждую неделю. До 20 упражнений, подходов от 1 до 10. Повторы: "4x8-10" или "3x12"; у планки и других упражнений на время — секунды. Если в какую-то неделю упражнения нет, ставь "-".
- warmupRun и finisherRun — true, если в этот день нужны разминка и финиш на беговой дорожке. Если дорожки нет, ставь false.
- Названия упражнений бери точно из списка ниже. Если подходящего нет, можно написать своё.

Список упражнений:
${list}`;

const PROMPT_EN = (example, list) => `You are an experienced coach. Create a training plan for me for the Workout Diary app.

First ask me these questions and wait for my answers:
- goal: strength, muscle, definition, general fitness;
- experience and how long I have been training;
- which weekdays I can train and how long a workout lasts;
- available equipment: gym, home, dumbbells, treadmill, pool;
- injuries and limitations.

When you have enough information, briefly describe the plan in words and ask if it works for me. After I agree, output the final plan strictly as a single JSON code block, with no comments or extra indentation, exactly like the sample.

Format:
${example}

Rules:
- weekdays: training days: mon, tue, wed, thu, fri, sat, sun.
- weeks: 1 to 8 weeks, the plan repeats in a cycle. For each week: label is an optional name, call a deload week "Deload"; load is an optional percentage of the record for the weight hint: [75, 80] or [100, null] ("from 100%"), use null if not needed.
- days: the days of one week, exactly as many and in the same order as weekdays. Do not include rest days. Weeks differ only in sets and reps, so describe each day once.
- type: strength, cardio for the treadmill (distance in km, incline in %), pool (duration in minutes).
- Each exercise of a strength day is one line: the name, then one "setsxreps" entry for each week. Up to 20 exercises, 1 to 10 sets. Reps: "4x8-10" or "3x12"; for planks and other timed exercises use seconds. If an exercise is not in a given week, use "-".
- warmupRun and finisherRun: true if that day needs a treadmill warm-up and finisher. If there is no treadmill, use false.
- Take exercise names exactly from the list below. If nothing fits, you may write your own.

Exercise list:
${list}`;

export function buildAiPrompt(names) {
  const lang = getLang();
  const list = (names || []).map((n) => `- ${exName(n)}`).join('\n');
  return (lang === 'en' ? PROMPT_EN : PROMPT_RU)(exampleJson(lang), list);
}
