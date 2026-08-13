// Коллекция реальных маршрутов для цели по набору высоты.
//
// ГЛАВНЫЙ ПРИНЦИП: профиль берётся КАК ЕСТЬ, из GPS-трека, без пересчёта.
// Пешая тропа и так живёт в тех же величинах, что и беговая дорожка —
// дистанция и уклон, — поэтому подгонять её под что-либо не нужно и вредно.
// Единственные вмешательства при разборе трека:
//   1. спуски и полки выброшены (дорожка вниз не едет), подъёмы склеены встык;
//   2. уклон обрезан по потолку 30% — предел дорожки;
//   3. высота сглажена окном 100 м, иначе GPS-шум завышает набор.
//
// Класс маршрута определяется НАБОРОМ ВЫСОТЫ — это и есть нагрузка за
// тренировку. Крутизна классом не управляется: рельеф какой есть, положе его
// не сделать. Поэтому класс здесь — свойство маршрута, а не переключатель.

export const CLIMB_CLASSES = [
  { id: 'easy',   label: 'Лёгкий',  budget: 400,  sect: 0.6 },
  { id: 'medium', label: 'Средний', budget: 650,  sect: 0.5 },
  { id: 'hard',   label: 'Сложный', budget: 900,  sect: 0.4 },
  { id: 'beast',  label: 'Экстрим', budget: 1250, sect: 0.3 },
];

export const MAX_INCLINE = 30; // потолок дорожки, %

export function classById(id) {
  return CLIMB_CLASSES.find((c) => c.id === id) || CLIMB_CLASSES[0];
}

// segs — готовые секторы [длина км, уклон %]. Длина сектора подобрана под класс
// (0.6 / 0.5 / 0.4 / 0.3 км), уклоны целые и уже обрезаны по 30%.
// track — сведения о качестве исходного трека: сколько точек и насколько сырой
// набор расходится со сглаженным (шум). Больше 30% — трек плотный и врёт.
export const CLIMBS = [
  {
    id: 'pslukh', name: 'Пслух', place: 'Кавказский заповедник',
    cls: 'easy', length: 2.35, gain: 231, start: 2080, top: 2341,
    segs: [[0.6, 10], [0.6, 15], [0.6, 8], [0.55, 6]],
    note: 'Высокогорье под 2300 м, подъём мягкий и ровный. Самый короткий маршрут в списке — хорош как первый заход или как разгрузочная неделя.',
    track: { pts: 2831, noise: 63 },
    src: 'https://www.wikiloc.com/',
  },
  {
    id: 'polikarya', name: 'Водопад Поликаря', place: 'Красная Поляна',
    cls: 'medium', length: 3.49, gain: 544, start: 915, top: 1418,
    segs: [[0.5, 11], [0.5, 20], [0.5, 27], [0.5, 20], [0.5, 12], [0.5, 10], [0.49, 9]],
    note: 'Самый высокий водопад района, около 70 м. Вся тяжесть в середине: третий сектор под 27%, дальше отпускает до самого верха.',
    track: { pts: 960, noise: 8 },
    src: 'https://www.wikiloc.com/',
  },
  {
    id: 'bzerpi', name: 'Бзерпинский карниз', place: 'Красная Поляна',
    cls: 'medium', length: 3.73, gain: 574, start: 1604, top: 2113,
    segs: [[0.5, 13], [0.5, 19], [0.5, 23], [0.5, 19], [0.5, 15], [0.5, 13], [0.5, 11], [0.23, 4]],
    note: 'Через южный склон горы Табунная. Ровная нарастающая работа: разгон, максимум 23% на третьем секторе, дальше плавный спад до альпийских лугов.',
    track: { pts: 965, noise: 24 },
    src: 'https://www.wikiloc.com/',
  },
  {
    id: 'kholodny', name: 'Альпика — приют Холодный', place: 'Кавказский заповедник',
    cls: 'hard', length: 4.64, gain: 758, start: 1538, top: 2190,
    segs: [[0.4, 9], [0.4, 23], [0.4, 24], [0.4, 28], [0.4, 29], [0.4, 30], [0.4, 14],
           [0.4, 6], [0.4, 4], [0.4, 4], [0.4, 9], [0.24, 16]],
    note: 'Переход от канатной дороги к приюту. Жёсткое начало — пять секторов подряд от 23 до 30%, потом длинная пологая полка почти до конца. Терпеть надо первую половину.',
    track: { pts: 1868, noise: 20 },
    src: 'https://www.wikiloc.com/',
  },
  {
    id: 'zerkalnoe', name: 'Озеро Зеркальное', place: 'Красная Поляна',
    cls: 'beast', length: 5.22, gain: 1029, start: 836, top: 1871,
    segs: [[0.3, 12], [0.3, 11], [0.3, 7], [0.3, 7], [0.3, 14], [0.3, 23], [0.3, 25],
           [0.3, 22], [0.3, 29], [0.3, 29], [0.3, 22], [0.3, 30], [0.3, 30], [0.3, 25],
           [0.3, 17], [0.3, 19], [0.3, 18], [0.12, 8]],
    note: 'Ледниковый цирк под вершиной Ачишхо. Километр разминки, потом девять секторов подряд от 22 до 30% — и только после этого отпускает к самому озеру.',
    track: { pts: 594, noise: 4 },
    src: 'https://www.wikiloc.com/hiking-trails/krasnaya-polyana-zerkalnoe-lake-86272724',
  },
];

export function climbById(id) {
  return CLIMBS.find((c) => c.id === id) || null;
}

// Маршруты класса, в порядке возрастания набора.
export function climbsOfClass(clsId) {
  return CLIMBS.filter((c) => c.cls === clsId).sort((a, b) => a.gain - b.gain);
}

// Нарезка на этапы. Сейчас все маршруты влезают в бюджет своего класса целиком
// (класс по набору и выбирается), поэтому этап всегда один. Логика оставлена
// для маршрутов, которые не влезут даже в «Экстрим» — их придётся делить.
export function climbStages(climb) {
  const cls = classById(climb.cls);
  const total = climb.segs.reduce((a, [len, g]) => a + len * g * 10, 0);
  const count = Math.max(1, Math.ceil(total / cls.budget - 1e-9));
  if (count === 1) {
    return [{ index: 1, total: 1, sectors: toSectors(climb.segs),
              gain: gainOf(climb.segs), distance: round2(climb.length) }];
  }
  const per = total / count;
  const stages = [];
  let cur = [], curGain = 0;
  for (const [len, g] of climb.segs) {
    cur.push([len, g]);
    curGain += len * g * 10;
    if (curGain >= per - 1e-9 && stages.length < count - 1) {
      stages.push(cur); cur = []; curGain = 0;
    }
  }
  if (cur.length) stages.push(cur);
  return stages.map((segs, i) => ({
    index: i + 1,
    total: stages.length,
    sectors: toSectors(segs),
    gain: gainOf(segs),
    distance: round2(segs.reduce((a, [len]) => a + len, 0)),
  }));
}

// Цель этапа ОКРУГЛЯЕТСЯ ВНИЗ, и это принципиально. Дробная часть возникает из
// последнего сектора (0.12 км при 8% дают 9.6 м). Если округлить вверх, цель
// окажется выше того, что реально дают секторы: у Зеркального было бы 1030 м
// цели против 1029.6 набранных — кнопка «Дальше» не разблокировалась бы никогда.
function gainOf(segs) {
  return Math.floor(segs.reduce((a, [len, g]) => a + len * g * 10, 0) + 1e-9);
}

function toSectors(segs) {
  return segs.map(([len, g]) => ({
    distance: len,
    incline: Math.min(MAX_INCLINE, g),
  }));
}

function round2(n) { return Math.round(n * 100) / 100; }

// Подпись маршрута в списке: «3.49 км · ↑544 м · 15.6%».
export function climbCaption(climb) {
  const avg = (climb.gain / (climb.length * 10)).toFixed(1);
  return `${climb.length} км · ↑${climb.gain} м · ${avg}%`;
}
