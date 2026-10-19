// История параметров тела. До этого параметры жили одной строкой в профиле и
// перезаписывались, истории не было.
//
// Хранится в profile.body_log (jsonb) — массив записей в том же виде, что и в
// приложении: { id, date: 'ГГГГ-ММ-ДД', height?, waist?, hips?, chest?, shoulders?,
// bodyFat? }. В записи только те параметры, что мерили в этот день.
//
// Колонки profile.height … body_fat остаются: в них последнее известное значение
// каждого параметра. Их читают достижение «все параметры тела» и ассистент, а
// старые версии приложения — только их. Обновляются они ТОЛЬКО при сохранении
// замера (withBodyLog), а не при каждой записи профиля: иначе запись профиля
// после тренировки затирала бы их значениями из истории.

export const BODY_PARAMS = [
  { key: 'height', label: 'Рост', unit: 'см', better: null },
  { key: 'waist', label: 'Талия', unit: 'см', better: 'down' },
  { key: 'hips', label: 'Бёдра', unit: 'см', better: 'down' },
  { key: 'chest', label: 'Грудь', unit: 'см', better: 'up' },
  { key: 'shoulders', label: 'Плечи', unit: 'см', better: 'up' },
  { key: 'bodyFat', label: 'Жир', unit: '%', better: 'down' },
];

const KEYS = BODY_PARAMS.map((p) => p.key);
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

// «84,5» и «84.5» — одно и то же; ноль, минус и мусор — «не мерил».
export function parseBodyNum(v) {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  if (!isFinite(n) || n <= 0) return null;
  return Math.round(n * 10) / 10;
}

function cleanEntry(e) {
  if (!e || typeof e !== 'object' || typeof e.date !== 'string' || !ISO_RE.test(e.date)) return null;
  const out = { id: typeof e.id === 'string' && e.id ? e.id : `${e.date}-body`, date: e.date };
  let any = false;
  KEYS.forEach((k) => {
    const v = parseBodyNum(e[k]);
    if (v != null) { out[k] = v; any = true; }
  });
  return any ? out : null;
}

// Порядок — по дате, внутри даты — по id. Пустые и битые записи отбрасываются.
export function normalizeBodyLog(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map(cleanEntry).filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

// История для экрана. Если её ещё нет, а в колонках профиля значения есть
// (профиль заполнен до истории или из старой версии приложения) — показываем их
// одной записью на дату последнего обновления. В базу она уйдёт с первым
// сохранённым замером.
export function bodyLogOf(profile, today) {
  const log = normalizeBodyLog(profile && profile.bodyLog);
  if (log.length > 0 || !profile) return log;
  const legacy = cleanEntry({
    ...Object.fromEntries(KEYS.map((k) => [k, profile[k]])),
    id: 'legacy-body',
    date: profile.updatedAt && ISO_RE.test(String(profile.updatedAt).slice(0, 10))
      ? String(profile.updatedAt).slice(0, 10) : today,
  });
  return legacy ? [legacy] : [];
}

// Сохранить замер за дату. Замер за ту же дату дополняется: заполненные поля
// перезаписываются, остальные остаются. Возвращает null, если не заполнено ни
// одно поле.
export function upsertBodyEntry(log, date, values, makeId = () => `${date}-${Date.now()}`) {
  const vals = {};
  KEYS.forEach((k) => {
    const v = parseBodyNum(values && values[k]);
    if (v != null) vals[k] = v;
  });
  if (Object.keys(vals).length === 0 || !ISO_RE.test(date || '')) return null;
  const list = normalizeBodyLog(log);
  const idx = list.findIndex((e) => e.date === date);
  if (idx >= 0) list[idx] = { ...list[idx], ...vals };
  else list.push({ id: makeId(), date, ...vals });
  return normalizeBodyLog(list);
}

export function removeBodyEntry(log, id) {
  return normalizeBodyLog(log).filter((e) => e.id !== id);
}

// Последнее и предыдущее значение каждого параметра: { key: { value, date, prev } }.
export function bodyLatest(log) {
  const out = {};
  normalizeBodyLog(log).forEach((e) => {
    KEYS.forEach((k) => {
      if (e[k] == null) return;
      const cur = out[k];
      out[k] = { value: e[k], date: e.date, prev: cur ? cur.value : null };
    });
  });
  return out;
}

// Изменение параметра в записи относительно предыдущего замера этого параметра.
export function bodyDelta(log, entryId, key) {
  const list = normalizeBodyLog(log);
  const idx = list.findIndex((e) => e.id === entryId);
  if (idx < 0 || list[idx][key] == null) return null;
  for (let i = idx - 1; i >= 0; i -= 1) {
    if (list[i][key] != null) return Math.round((list[idx][key] - list[i][key]) * 10) / 10;
  }
  return null;
}

// Профиль с новой историей: колонки — последние значения, updatedAt — дата
// последнего замера. Истории нет совсем — колонки пустеют.
export function withBodyLog(profile, log) {
  const list = normalizeBodyLog(log);
  const latest = bodyLatest(list);
  const next = { ...(profile || {}), bodyLog: list };
  KEYS.forEach((k) => { next[k] = latest[k] ? latest[k].value : null; });
  next.updatedAt = list.length ? list[list.length - 1].date : null;
  return next;
}
