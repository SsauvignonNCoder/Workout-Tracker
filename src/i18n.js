// Локализация: русский (исходный) и английский.
//
// Ключ перевода — САМА русская строка: tr('Начать тренировку'). По-русски tr
// возвращает её как есть, по-английски — из словаря (src/i18n/en.js); нет
// перевода — русский текст, ничего не ломается. Подстановки — позиционные:
// tr('Шаг {0} из {1}', i, n). Тест (tests/test.cjs → «локализация») проверяет,
// что у каждой строки в tr(…) в коде есть английский перевод.
//
// ДАННЫЕ не переводятся: названия упражнений в истории, рекорды, заметки остаются
// как записаны (иначе разъедутся рекорды и графики). На экран название идёт через
// exName(name) — перевод из словаря упражнений, если он есть.
//
// Язык — модульная переменная: tr работает и вне React (достижения, сводка,
// экспорт недели). При смене языка App перемонтирует экран (key={lang}), чтобы
// всё посчиталось заново. Выбор хранится в profile.lang и в localStorage (для
// экрана входа, пока профиль не загружен).

import { EN } from './i18n/en.js';
import { EN_EXERCISES } from './i18n/enExercises.js';
import { EN_ACH } from './i18n/enAchievements.js';

export const LANGS = ['ru', 'en'];
const STORAGE_KEY = 'wt:lang';

let LANG = 'ru';

export function getLang() { return LANG; }
export function setLang(lang) {
  LANG = lang === 'en' ? 'en' : 'ru';
  try { window.localStorage.setItem(STORAGE_KEY, LANG); } catch (e) { /* no-op */ }
  try { document.documentElement.lang = LANG; } catch (e) { /* no-op */ }
  try { document.title = tr('Дневник тренировок'); } catch (e) { /* no-op */ }
}

// Язык до загрузки профиля: сохранённый на устройстве, иначе язык Telegram
// (русскоязычные и соседние — русский, остальные — английский), иначе русский.
export function initialLang() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === 'ru' || saved === 'en') return saved;
  } catch (e) { /* no-op */ }
  try {
    const tg = window.Telegram && window.Telegram.WebApp;
    const code = tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.language_code;
    if (code) return /^(ru|uk|be|kk|uz|ky|tg)/i.test(code) ? 'ru' : 'en';
  } catch (e) { /* no-op */ }
  return 'ru';
}

function fill(s, args) {
  return args.length ? s.replace(/\{(\d+)\}/g, (m, i) => (args[i] !== undefined ? args[i] : m)) : s;
}

export function tr(s, ...args) {
  if (s == null) return s;
  // Английский: словарь интерфейса, затем словарь упражнений (названия шагов,
  // упражнений и растяжек переводятся той же функцией), иначе — как есть.
  const out = LANG === 'en' ? (EN[s] !== undefined ? EN[s] : EN_EXERCISES[s] !== undefined ? EN_EXERCISES[s] : s) : s;
  return fill(out, args);
}

// Число с формой слова: trn(5, ['тренировка', 'тренировки', 'тренировок'], ['workout', 'workouts']).
export function trn(n, ruForms, enForms) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (LANG === 'en') return Math.abs(n) === 1 ? enForms[0] : enForms[1];
  if (a > 10 && a < 20) return ruForms[2];
  if (b === 1) return ruForms[0];
  if (b >= 2 && b <= 4) return ruForms[1];
  return ruForms[2];
}

// Название упражнения (кардио, растяжки) на экран. Данные не меняются.
export function exName(name) {
  if (LANG !== 'en' || !name) return name;
  if (EN_EXERCISES[name] !== undefined) return EN_EXERCISES[name];
  const sector = /^Сектор (.+)$/.exec(name);
  if (sector) return `Sector ${sector[1]}`;
  return name;
}

// Название маршрута из истории на экран. В данных оно по-русски и с этапом:
// «Пслух · этап 2/3» (guidedSteps.js → pickedRouteName).
export function routeTitle(name) {
  if (!name) return name;
  const m = /^(.*) · этап (\d+)\/(\d+)$/.exec(name);
  return m ? tr('{0} · этап {1}/{2}', tr(m[1]), m[2], m[3]) : tr(name);
}

// Обратно: название, набранное по-английски («plank», «Barbell bench press»), —
// к русскому ключу данных. Иначе английское название сохранялось бы отдельным
// упражнением: история и рекорды раскалывались, терялись группа мышц и гайд.
let EX_REVERSE = null;
export function exKey(name) {
  if (!name) return name;
  const s = String(name).trim();
  if (!EX_REVERSE) {
    EX_REVERSE = new Map();
    Object.entries(EN_EXERCISES).forEach(([ru, en]) => {
      const k = String(en).toLowerCase();
      if (!EX_REVERSE.has(k)) EX_REVERSE.set(k, ru);
    });
  }
  const ru = EX_REVERSE.get(s.toLowerCase());
  if (ru) return ru;
  const sector = /^Sector (.+)$/i.exec(s);
  return sector ? `Сектор ${sector[1]}` : s;
}

// Локаль для дат и чисел.
export function locale() { return LANG === 'en' ? 'en-GB' : 'ru-RU'; }

// Достижение на экран: название и описание из словаря по id (src/i18n/enAchievements.js).
export function achTitle(a) {
  return LANG === 'en' && EN_ACH[a.id] ? EN_ACH[a.id][0] : a.title;
}
export function achDescription(a) {
  return LANG === 'en' && EN_ACH[a.id] ? EN_ACH[a.id][1] : a.description;
}
