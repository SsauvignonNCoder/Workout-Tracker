export const pad2 = (n) => String(n).padStart(2, '0');

export const toISO = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export const todayISO = () => toISO(new Date());

export const shiftDate = (iso, days) => {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return toISO(dt);
};

// Утреннее окно взвешивания. В это время приложение открывается сразу на вкладке
// «Вес» — взвешивание происходит именно тогда, и лишний тап каждое утро ни к чему.
// Границы включают начало и не включают конец: 6:00–9:59.
export const WEIGH_IN_FROM_HOUR = 6;
export const WEIGH_IN_TO_HOUR = 10;

export const isWeighInTime = (d = new Date()) => {
  const h = d.getHours();
  return h >= WEIGH_IN_FROM_HOUR && h < WEIGH_IN_TO_HOUR;
};

export const fmtDateShort = (iso) => {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
};

export const fmtDateFull = (iso) => {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' });
};
