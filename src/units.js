// Системы измерения: метрическая (по умолчанию) и имперская.
//
// ДАННЫЕ ВСЕГДА В МЕТРИКЕ: кг, км, км/ч, м, см. Пересчитываются только показ и
// ввод — рекорды, графики, достижения и история не зависят от выбора. Ввёл 135 lb
// — в базу ушло 61.235 кг (store), на экране снова 135 (num).
//
// Виды величин:
//   w — вес (кг ↔ lb: и рабочий вес, и вес тела)   d — расстояние (км ↔ mi)
//   s — скорость (км/ч ↔ mph)                      h — высота (м ↔ ft)
//   l — обхваты и рост (см ↔ in)                   t — тоннаж (т ↔ тыс. lb)
//
// Система — модульная переменная (как язык в i18n.js): при смене App
// перемонтирует экран. Выбор — в profile.units и в localStorage.
// Пошаговая тренировка запоминает систему на старте (draft.units): переключение
// посреди тренировки не перетолкует уже введённые числа.

import { tr, locale } from './i18n.js';

const STORAGE_KEY = 'wt:units';
let SYS = 'metric';

export const getUnits = () => SYS;
export const isImperial = () => SYS === 'imperial';
export function setUnits(s) {
  SYS = s === 'imperial' ? 'imperial' : 'metric';
  try { window.localStorage.setItem(STORAGE_KEY, SYS); } catch (e) { /* no-op */ }
}
export function initialUnits() {
  try { return window.localStorage.getItem(STORAGE_KEY) === 'imperial' ? 'imperial' : 'metric'; } catch (e) { return 'metric'; }
}

const LB = 2.20462262185;
const MI = 0.621371192237;
const FACTOR = { w: LB, d: MI, s: MI, h: 3.28083989501, l: 0.393700787402, t: LB };
// Знаков после запятой на экране (лишние нули не пишутся): в метрике вес — до
// сотых (блины по 1.25 кг: 61.25), в фунтах — до десятых.
const DIGITS = {
  metric: { w: 2, d: 2, s: 2, h: 0, l: 1, t: 1 },
  imperial: { w: 1, d: 2, s: 1, h: 0, l: 1, t: 1 },
};
const LABEL = {
  metric: { w: 'кг', d: 'км', s: 'км/ч', h: 'м', l: 'см', t: 'т' },
  imperial: { w: 'фнт', d: 'миль', s: 'миль/ч', h: 'фт', l: 'дюйм', t: 'тыс. фнт' },
};

const toNum = (v) => (typeof v === 'number' ? v : parseFloat(String(v == null ? '' : v).replace(',', '.')));

// Один и тот же вес, записанный в разных системах: рекорд 60 кг на экране —
// 132.3 lb, а введённые 132.3 lb — это 60.01 кг. Это не новый рекорд и не «+0 lb».
// Шаг ввода 0.1 lb = 0.045 кг, ошибка округления — вдвое меньше; в метрике
// реальный шаг (блины) — от 0.25 кг, ему допуск не мешает.
export const SAME_KG = 0.025;
export const heavier = (a, b) => (Number(a) || 0) > (Number(b) || 0) + SAME_KG;
export const sameWeight = (a, b) => Math.abs((Number(a) || 0) - (Number(b) || 0)) <= SAME_KG;

// Метрическое значение → число в текущей системе (для графиков и сравнений на экране).
export function toDisp(k, v, sys = SYS) {
  const n = toNum(v);
  if (!isFinite(n)) return NaN;
  return sys === 'imperial' ? n * FACTOR[k] : n;
}

// Введённое в текущей (или указанной) системе → метрическое число; не число — NaN.
export function fromDisp(k, v, sys = SYS) {
  const n = toNum(v);
  if (!isFinite(n)) return NaN;
  return sys === 'imperial' ? n / FACTOR[k] : n;
}

// Для записи в данные: метрика с 3 знаками (обратный пересчёт даёт то же число на экране).
export function store(k, v, sys = SYS) {
  const n = fromDisp(k, v, sys);
  return isFinite(n) ? Math.round(n * 1000) / 1000 : 0;
}

// Метрическое значение → строка числа для экрана (без единицы).
export function num(k, v, digits) {
  const x = toDisp(k, v);
  if (!isFinite(x)) return v == null ? '' : String(v);
  const d = digits == null ? DIGITS[SYS][k] : digits;
  const p = 10 ** d;
  return String(Math.round(x * p) / p);
}

// Подпись единицы на языке интерфейса: «кг» / «lb» / «фнт»…
export const unit = (k) => tr(LABEL[SYS][k]);

// Число с единицей: U('w', 60) → «60 кг» или «132.3 lb».
export const U = (k, v, digits) => `${num(k, v, digits)} ${unit(k)}`;

// Метрическое значение → текст для поля ввода ('' остаётся '').
export function inputVal(k, v) {
  if (v === '' || v == null) return '';
  const n = toNum(v);
  if (!isFinite(n) || n === 0) return n === 0 ? '0' : '';
  return num(k, n);
}

// Единица прогресса достижений (achievementsExtra.js → P(…, unit)) → вид величины.
export const KIND_OF_UNIT = { 'кг': 'w', 'км': 'd', 'м': 'h', 'см': 'l', 'т': 't' };

// Пересчитанное число для текста: от 100 — целое (с разделителем тысяч по языку),
// от 10 — до десятых, меньше — до сотых. ceil — округлить вверх: так пишутся
// пороги («жим 221 lb»), иначе «220 / 220 lb» висело бы закрытым (100 кг = 220.46 lb).
export function showNum(x, ceil = false) {
  const a = Math.abs(x);
  const d = a >= 100 ? 0 : a >= 10 ? 1 : 2;
  const p = 10 ** d;
  const v = (ceil ? Math.ceil(x * p - 1e-9) : Math.round(x * p)) / p;
  return d === 0 ? v.toLocaleString(locale()) : String(v);
}

// Название и описание достижения: числа с единицами («100 кг», «5 км», «20 000 м»,
// «1,000,000 kg», «10 тонн», «1–3 кг») пересчитать в имперские. Пороги не
// меняются — меняется только запись. ceil — для порогов (см. showNum).
const TEXT_KIND = {
  'км/ч': 's', 'km/h': 's', 'кг': 'w', kg: 'w', 'км': 'd', km: 'd', 'см': 'l', cm: 'l',
  'тонн': 't', 'тонна': 't', 'тонны': 't', tonnes: 't', tons: 't', 'т': 't', t: 't', 'м': 'h', m: 'h',
};
const TEXT_NUM = '(\\d{1,3}(?:[ \\u00a0,]\\d{3})+(?:\\.\\d+)?|\\d+(?:[.,]\\d+)?)';
const TEXT_RE = new RegExp(
  `(?:${TEXT_NUM}\\s?([–—-])\\s?)?${TEXT_NUM}\\s?(км\\/ч|km\\/h|кг|kg|км|km|см|cm|тонн[аы]?|tonnes|tons|т|t|м|m)(?![a-zа-яё/])`, 'gi',
);
// «1,000,000» и «20 000» — тысячи, «1,5» — дробь (русская запятая).
const parseTextNum = (str) => {
  const raw = str.replace(/[\s\u00a0]/g, '');
  return parseFloat(/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(raw) ? raw.replace(/,/g, '') : raw.replace(',', '.'));
};
export function convertText(text, { ceil = false } = {}) {
  if (SYS !== 'imperial' || !text) return text;
  return text.replace(TEXT_RE, (all, lo, dash, n, u) => {
    const k = TEXT_KIND[u.toLowerCase()];
    const v = parseTextNum(n);
    if (!k || !isFinite(v)) return all;
    const hi = showNum(toDisp(k, v), ceil);
    if (lo == null) return `${hi} ${unit(k)}`;
    const l = parseTextNum(lo);
    return isFinite(l) ? `${showNum(toDisp(k, l), ceil)}${dash}${hi} ${unit(k)}` : all;
  });
}

// Записи пошаговой тренировки ({ exLogs, cardioLogs, sectorLogs } — строки, как
// введены) — из системы from в систему to. Сохранение и сводка берут их в
// метрике (to = 'metric'); черновик, записанный в другой системе, при
// восстановлении пересчитывается в текущую. Пустые и нечисловые поля — как были.
// Точность — 3 знака в обе стороны: округление до знаков экрана (100 кг → 220.5 lb)
// при обратном пересчёте давало 100.017 кг и ложный рекорд. Значение, которое
// отличается от «экранного» только шумом трёх знаков, подтягиваем к нему:
// 220 lb → 99.79 кг → 220 (а не 219.999), 100 кг → 220.462 lb → 100.
const SNAP = 0.0012;
// Одно введённое значение (строка) из системы from в систему to; пустое и
// нечисловое — как было. Так же пересчитывается ручная форма (WorkoutTab).
export function convertValue(k, v, from, to = 'metric') {
  if (from === to || v === '' || v == null) return v;
  const m = fromDisp(k, v, from);
  if (!isFinite(m)) return v;
  const x = toDisp(k, m, to);
  const p = 10 ** DIGITS[to][k];
  const shown = Math.round(x * p) / p;
  return String(Math.abs(x - shown) < SNAP ? shown : Math.round(x * 1000) / 1000);
}

export function convertLogs({ exLogs = {}, cardioLogs = {}, sectorLogs = {} }, from, to = 'metric') {
  if (from === to) return { exLogs, cardioLogs, sectorLogs };
  const cv = (k, v) => convertValue(k, v, from, to);
  const ex = Object.fromEntries(Object.entries(exLogs).map(([id, sets]) => [id,
    Array.isArray(sets) ? sets.map((x) => (x ? { ...x, weight: cv('w', x.weight) } : x)) : sets]));
  const cardio = Object.fromEntries(Object.entries(cardioLogs).map(([id, c]) => [id,
    c ? { ...c, distance: cv('d', c.distance), speed: cv('s', c.speed) } : c]));
  const sectors = Object.fromEntries(Object.entries(sectorLogs).map(([id, d]) => {
    if (!d) return [id, d];
    const targetKind = d.metric === 'elevation' ? 'h' : d.metric === 'time' ? null : 'd';
    return [id, {
      ...d,
      ...(targetKind ? { target: cv(targetKind, d.target) } : {}),
      sectors: (d.sectors || []).map((s) => ({ ...s, distance: cv('d', s.distance), speed: cv('s', s.speed) })),
    }];
  }));
  return { exLogs: ex, cardioLogs: cardio, sectorLogs: sectors };
}
