import React, { useState, useMemo, useEffect } from 'react';
import { Dumbbell, Ruler, LineChart as LineIcon, TrendingUp, Pencil, Trash2, Flame, ChevronDown, Timer, Footprints } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts';
import { useTheme, ThemeContext, THEME_2A, FROST, brassFill, brassText, glassCard, GLASS_SHEEN, GLASS_BORDER, GLASS_EDGE } from '../theme.js';
import { todayISO, shiftDate, fmtDateShort, fmtDateFull } from '../dateUtils.js';
import { computeRecords, getMonday, computeWeekStreak } from '../gamification.js';
import { MuscleBadge, isWeightlessExercise, isTimeBasedExercise, secToClock, categorizeExercise } from './workoutTabHelpers.jsx';
import { WeekExportPanel } from './WeekExportPanel.jsx';
import { MountainBox } from '../MountainBox.jsx';

function muscleLetter(name) {
  const g = categorizeExercise(name);
  return g ? g.letter : (name || '?').trim().charAt(0).toUpperCase();
}

// Токены темы 2A (THEME_2A, FROST, brassFill, brassText) переехали в src/theme.js —
// раньше App.jsx импортировал тему из вкладки, что было перевёрнутой зависимостью.
//
// Крем — светлые карточки (селектор + рекорды). Над тёмным фоном настоящая
// прозрачность даёт серый, поэтому оставляем солидный крем.
const CREAM = '#F2EBDD';
const ON_CREAM = '#0A0A0A';
const ON_CREAM_MUTED = '#6B655A';

function average(nums) {
  if (!nums.length) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}

const SERIES_COLORS = ['#E4C57E', '#5B8FB0', '#C9A227', '#5C8A4E', '#9B6FB5'];

const PERIODS = [
  { key: '1m', label: '1 мес', days: 30 },
  { key: '6m', label: '6 мес', days: 182 },
  { key: '12m', label: '12 мес', days: 365 },
  { key: 'all', label: 'Всё время', days: null },
];

function PeriodSelector({ value, onChange }) {
  const t = useTheme();
  return (
    <div style={{ display: 'flex', gap: 5, marginBottom: 14 }}>
      {PERIODS.map((p) => (
        <button
          key={p.key}
          onClick={() => onChange(p.key)}
          style={{
            flex: 1, padding: '7px 6px', borderRadius: 8, border: `1px solid ${value === p.key ? t.ACCENT : t.BORDER}`,
            background: value === p.key ? t.ACCENT_BG : 'transparent',
            color: value === p.key ? t.ACCENT_SOFT : t.TEXT_DIM,
            fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
          }}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

// Выбор графиков: квадратик — добавить к графику / убрать, тап по названию —
// показать только это (список закрывается).
function MultiSeriesSelector({ options, selectedKeys, onToggle, onOnly }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const selectedLabels = options.filter((o) => selectedKeys.includes(o.key)).map((o) => o.label);

  return (
    <div style={{ position: 'relative', width: '100%', minWidth: 0, marginBottom: 14 }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
          background: CREAM, border: 'none', borderRadius: 14,
          padding: '14px 16px', color: ON_CREAM, fontSize: 14, fontWeight: 600,
          cursor: 'pointer', fontFamily: 'inherit', boxSizing: 'border-box',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selectedLabels.length === 0 ? 'Выбери, что показать' : selectedLabels.join(', ')}
        </span>
        <ChevronDown size={16} color={ON_CREAM_MUTED} style={{ flexShrink: 0, marginLeft: 8 }} />
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 9, background: 'transparent' }} />
          <div className="dropdown-open" style={{
            position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 10,
            background: t.BG_INPUT, border: `1px solid ${t.BORDER}`, borderRadius: 10,
            maxHeight: 320, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          }}>
            {options.length === 0 && (
              <div style={{ padding: '14px', fontSize: 13.5, color: t.TEXT_FAINT }}>Пока нет данных для графика.</div>
            )}
            {options.map((o) => {
              const isSelected = selectedKeys.includes(o.key);
              return (
                <div key={o.key} style={{
                  display: 'flex', alignItems: 'stretch',
                  background: isSelected ? t.ACCENT_BG : 'transparent', borderBottom: `1px solid ${t.BORDER}`,
                }}>
                <button
                  onClick={() => onToggle(o.key)}
                  aria-pressed={isSelected}
                  aria-label={`${isSelected ? 'Убрать с графика' : 'Добавить к графику'}: ${o.label}`}
                  style={{
                    flexShrink: 0, display: 'flex', alignItems: 'center', padding: '0 11px 0 14px',
                    background: 'transparent', border: 'none', cursor: 'pointer',
                  }}
                >
                  <span style={{
                    flexShrink: 0, width: 16, height: 16, borderRadius: 4, border: `2px solid ${isSelected ? t.ACCENT : t.TEXT_FAINT}`,
                    background: isSelected ? t.ACCENT : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: t.ON_ACCENT,
                  }}>
                    {isSelected ? '✓' : ''}
                  </span>
                </button>
                <button
                  onClick={() => { onOnly(o.key); setOpen(false); }}
                  style={{
                    flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 9, textAlign: 'left',
                    padding: '11px 14px 11px 0', background: 'transparent', border: 'none',
                    color: isSelected ? t.ACCENT_SOFT : t.TEXT,
                    fontSize: 14.5, fontWeight: isSelected ? 700 : 400, cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  {o.type === 'cardio' ? <LineIcon size={14} style={{ flexShrink: 0, opacity: 0.6 }} /> : o.type === 'bodyweight' ? <Ruler size={14} style={{ flexShrink: 0, opacity: 0.6 }} /> : o.type === 'ratio' ? <TrendingUp size={14} style={{ flexShrink: 0, opacity: 0.6 }} /> : <Dumbbell size={14} style={{ flexShrink: 0, opacity: 0.6 }} />}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.label}</span>
                </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// Серия графика по умолчанию (см. ProgressTab): случайное упражнение, у которого
// за 30 дней до today больше двух записей с весом; иначе — упражнение, сделанное
// последним; иначе — первая серия в списке. random — для тестов.
export function pickDefaultSeriesKey(exerciseSeries, options, today, random = Math.random) {
  const keys = new Set(options.map((o) => o.key));
  const monthAgo = shiftDate(today, -30);
  const candidates = Object.entries(exerciseSeries || {})
    .filter(([name, pts]) => keys.has(`ex:${name}`)
      && pts.filter((p) => p.date >= monthAgo && p.date <= today).length > 2
      && pts.some((p) => (parseFloat(p.weight) || 0) > 0))
    .map(([name]) => `ex:${name}`);
  if (candidates.length > 0) return candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))];
  const latest = Object.entries(exerciseSeries || {})
    .filter(([name]) => keys.has(`ex:${name}`))
    .map(([name, pts]) => ({ key: `ex:${name}`, last: pts.length ? pts[pts.length - 1].date : '' }))
    .sort((a, b) => b.last.localeCompare(a.last))[0];
  return latest ? latest.key : options[0].key;
}

// Подпись точки упражнения для тапа по графику — строки «вес × повторы»: подходы
// сгруппированы по весу, тяжёлые сверху, повторы в порядке подходов — «80 кг × 8, 7»,
// «75 кг × 10». Вес один — одна строка. Без подходов по отдельности (ручная
// запись) — «80 кг × 8 · 3 подх». Упражнение без веса — только повторы.
// Пусто — null.
export function exercisePointInfo(p) {
  const log = Array.isArray(p.setLog) ? p.setLog : [];
  const groups = new Map();
  log.forEach((x) => {
    const w = parseFloat(x.weight) || 0;
    const r = parseInt(x.reps, 10) || 0;
    if (r <= 0) return;
    if (!groups.has(w)) groups.set(w, []);
    groups.get(w).push(r);
  });
  if (groups.size > 0) {
    return [...groups.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([w, reps]) => (w > 0 ? `${w} кг × ${reps.join(', ')}` : `${reps.join(', ')} повт`));
  }
  const top = parseFloat(p.weight) || 0;
  const reps = parseInt(p.reps, 10) || 0;
  if (!reps) return top > 0 ? [`${top} кг`] : null;
  const sets = parseInt(p.sets, 10) || 0;
  return [`${top > 0 ? `${top} кг × ${reps}` : `${reps} повт`}${sets > 1 ? ` · ${sets} подх` : ''}`];
}

// Подсказка по тапу на точку: дата, затем по каждой серии — цвет, название и
// значение (у упражнения — вес и повторы с этим весом).
function ChartTooltip({ active, payload, label, seriesByKey }) {
  const t = useTheme();
  if (!active || !payload || payload.length === 0) return null;
  const rows = payload.filter((p) => p.value != null && seriesByKey[p.dataKey]);
  if (rows.length === 0) return null;
  return (
    <div style={{
      background: t.BG_INPUT, border: `1px solid ${t.ACCENT_BORDER}`, borderRadius: 10,
      padding: '8px 11px', fontSize: 12, boxShadow: '0 10px 26px rgba(0,0,0,0.45)', maxWidth: 230,
    }}>
      <div style={{ color: t.TEXT_FAINT, marginBottom: 5, fontFamily: "'JetBrains Mono', 'SF Mono', monospace" }}>{label}</div>
      {rows.map((p) => {
        const s = seriesByKey[p.dataKey];
        const info = p.payload && p.payload[`${p.dataKey}__info`];
        return (
          <div key={p.dataKey} style={{ marginTop: 3 }}>
            {rows.length > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: t.TEXT_DIM, fontSize: 11 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</span>
              </div>
            )}
            {(Array.isArray(info) && info.length ? info : [`${p.value}${s.unit}`]).map((line, li) => (
              <div key={li} style={{
                color: li === 0 ? t.TEXT : t.TEXT_DIM, fontWeight: 700, fontSize: li === 0 ? 13.5 : 12.5,
                fontFamily: "'JetBrains Mono', 'SF Mono', monospace", lineHeight: 1.45, whiteSpace: 'nowrap',
              }}>
                {line}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function MultiSeriesChart({ selectedSeries }) {
  const t = useTheme();
  const seriesByKey = useMemo(() => Object.fromEntries(selectedSeries.map((s) => [s.key, s])), [selectedSeries]);

  // Собираем все уникальные даты по всем сериям, сортируем
  const allDates = useMemo(() => {
    const set = new Set();
    selectedSeries.forEach((s) => s.points.forEach((p) => set.add(p.date)));
    return [...set].sort();
  }, [selectedSeries]);

  const data = useMemo(() => {
    return allDates.map((date) => {
      const row = { date: fmtDateShort(date) };
      selectedSeries.forEach((s) => {
        const pt = s.points.find((p) => p.date === date);
        row[s.key] = pt ? pt.value : null;
        if (pt && pt.info) row[`${s.key}__info`] = pt.info;
      });
      return row;
    });
  }, [allDates, selectedSeries]);

  const averages = useMemo(() => {
    const res = {};
    selectedSeries.forEach((s) => {
      const vals = s.points.map((p) => p.value).filter((v) => v != null);
      res[s.key] = average(vals);
    });
    return res;
  }, [selectedSeries]);

  if (selectedSeries.length === 0) return null;

  return (
    <div style={{ ...glassCard({ blur: true }), borderRadius: 18, padding: '16px 16px 8px', marginBottom: 14 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
        {selectedSeries.map((s) => {
          const pts = s.points;
          const first = pts[0];
          const last = pts[pts.length - 1];
          const delta = first && last ? Math.round((last.value - first.value) * 100) / 100 : 0;
          return (
            <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5 }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
              <span style={{ color: t.TEXT, fontWeight: 700 }}>{s.label}</span>
              {last && (
                <span style={{ color: t.TEXT_FAINT, fontFamily: "'JetBrains Mono', 'SF Mono', monospace" }}>
                  {last.value}{s.unit} {delta !== 0 && (delta > 0 ? `+${delta}` : delta)}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <ResponsiveContainer width="100%" height={150}>
        <LineChart data={data} margin={{ top: 4, right: 6, left: 4, bottom: 0 }}>
          <CartesianGrid stroke={t.BORDER} strokeDasharray="2 4" vertical={false} />
          <XAxis dataKey="date" tick={{ fill: t.TEXT_FAINT, fontSize: 10 }} axisLine={{ stroke: t.BORDER }} tickLine={false} />
          <YAxis tick={{ fill: t.TEXT_FAINT, fontSize: 10 }} axisLine={false} tickLine={false} width={38} />
          <Tooltip
            content={<ChartTooltip seriesByKey={seriesByKey} />}
            cursor={{ stroke: t.ACCENT_BORDER, strokeWidth: 1 }}
          />
          {selectedSeries.map((s) => (
            averages[s.key] != null && (
              <ReferenceLine
                key={`avg-${s.key}`}
                y={averages[s.key]}
                stroke={s.color}
                strokeOpacity={0.35}
                strokeDasharray="4 3"
                strokeWidth={1.5}
              />
            )
          ))}
          {selectedSeries.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2.2}
              dot={{ r: 3, fill: s.color, strokeWidth: 0 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

const MONO = "'JetBrains Mono', 'SF Mono', monospace";
const SECTOR_RE = /^сектор\s/i;

// Плитки подходов: вес ярче, крестик с воздухом, повторы приглушены.
function SetChips({ setLog, weightless, timed }) {
  const t = useTheme();
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, marginTop: 5 }}>
      {setLog.map((s, i) => (
        <span key={i} style={{
          // Плашка подхода — тёмное «дымчатое» стекло: плотная тёмная заливка,
          // светлая кромка и блик (так понравилось Никите).
          background: `${GLASS_SHEEN}, linear-gradient(135deg, rgba(36,33,28,0.95), rgba(19,17,14,0.93))`,
          border: GLASS_BORDER, boxShadow: GLASS_EDGE, borderRadius: 9,
          padding: '6px 12px', fontFamily: MONO, fontSize: 13, display: 'inline-flex', alignItems: 'center',
        }}>
          {weightless ? (
            <span style={{ color: t.TEXT, fontWeight: 700 }}>{s.reps}{timed ? ' с' : ''}</span>
          ) : (
            <>
              <span style={{ color: t.TEXT, fontWeight: 700 }}>{s.weight}</span>
              <span style={{ color: t.TEXT_FAINT, margin: '0 7px' }}>×</span>
              <span style={{ color: t.TEXT_DIM }}>{s.reps}</span>
            </>
          )}
        </span>
      ))}
    </div>
  );
}

// Блок секторов кардио: нарастающее время (мм:сс) + длительность каждого сектора.
function SectorBlock({ sectors, routeName }) {
  const t = useTheme();
  let cum = 0;
  const rows = sectors.map((c) => {
    const delta = c.durationSec != null ? c.durationSec : (parseFloat(c.duration) || 0) * 60;
    cum += delta;
    return { c, delta, cum };
  });
  const totalDist = sectors.reduce((a, c) => a + (parseFloat(c.distance) || 0), 0);
  const totalSec = cum;
  const secLetter = (name) => (name || '').replace(SECTOR_RE, '').trim() || '·';

  return (
    <div style={{ padding: '9px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: t.TEXT, display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Иконка lucide, а не эмодзи 🏃: эмодзи выбивался из стиля. */}
          <Footprints size={14} color={t.ACCENT_SOFT} strokeWidth={2} style={{ flexShrink: 0 }} />
          {routeName || 'Кардио по секторам'} · {sectors.length}
        </span>
        <span style={{ fontSize: 12, fontWeight: 700, color: t.ACCENT_SOFT, fontFamily: MONO }}>
          {totalDist > 0 ? `${Math.round(totalDist * 100) / 100} км · ` : ''}{secToClock(totalSec)}
        </span>
      </div>
      {rows.map(({ c, delta, cum: cumSec }, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: 11, padding: '6px 0',
          borderBottom: i === rows.length - 1 ? 'none' : `1px solid ${t.BORDER}`,
        }}>
          <span style={{
            width: 22, height: 22, borderRadius: 7, background: t.ACCENT_BG, color: t.ACCENT_SOFT,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 700, fontFamily: MONO, flexShrink: 0,
          }}>{secLetter(c.name)}</span>
          <span style={{ flex: 1, minWidth: 0, fontFamily: MONO, fontSize: 11.5, color: t.TEXT_DIM }}>
            {[c.distance ? `${c.distance} км` : '', c.speed ? `${c.speed} км/ч` : '', c.incline ? `накл. ${c.incline}%` : '']
              .filter(Boolean).join(' · ') || '—'}
          </span>
          <span style={{ textAlign: 'right', flexShrink: 0, fontFamily: MONO }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: t.TEXT }}>{secToClock(cumSec)}</div>
            {delta > 0 && <div style={{ fontSize: 10.5, color: t.TEXT_FAINT, marginTop: 1 }}>+{secToClock(delta)}</div>}
          </span>
        </div>
      ))}
    </div>
  );
}

// ---- Беговая дорожка: авто-классификация и отдельный график ----
const TREADMILL_TYPES = [
  { key: 'warmup', label: 'Разминка', color: '#5B8FB0' },
  { key: 'finish', label: 'Кардио-финиш', color: '#C9A227' },
  { key: 'cardio', label: 'Кардио-тренировка', color: '#5C8A4E' },
];
const TREADMILL_METRICS = [
  { key: 'speed', label: 'Скорость', unit: 'км/ч' },
  { key: 'distance', label: 'Дистанция', unit: 'км' },
  { key: 'duration', label: 'Время', unit: 'мин' },
  // «Подъём» — набор высоты. На общем графике это линия по метрам за тренировку,
  // а в раскрытом кардио-дне вместо графика рисуется гора (ClimbMountain).
  { key: 'elevation', label: 'Подъём', unit: 'м' },
];

function isTreadmillName(name) { return (name || '').toLowerCase().includes('дорожк'); }

// Классификация записи «беговая дорожка» по контексту тренировки + длительности.
// В данных упражнения и кардио — разные списки, буквального «до/после» нет,
// поэтому: есть силовые и <10 мин → разминка; есть силовые и ≥10 → кардио-финиш;
// только кардио (или кардио-день/секторы) → кардио-тренировка.
function classifyTreadmill(name, durationMin, hasStrength) {
  if (/разминк/i.test(name || '')) return 'warmup';
  if (!hasStrength) return 'cardio';
  return durationMin > 0 && durationMin < 10 ? 'warmup' : 'finish';
}

function buildTreadmillPoints(sessions) {
  const points = [];
  (sessions || []).forEach((s) => {
    const hasStrength = (s.exercises || []).some((e) => (e.name || '').trim());
    const cardio = s.cardio || [];
    const sectors = cardio.filter((c) => SECTOR_RE.test((c.name || '').trim()));
    cardio.forEach((c) => {
      if (SECTOR_RE.test((c.name || '').trim())) return; // секторы — ниже
      if (!isTreadmillName(c.name)) return;
      const duration = parseFloat(c.duration) || 0;
      const dist = parseFloat(c.distance) || 0;
      const incl = parseFloat(c.incline) || 0;
      points.push({
        id: `${s.id}-${c.name}`, date: s.date,
        type: classifyTreadmill(c.name, duration, hasStrength),
        speed: parseFloat(c.speed) || 0, distance: dist, duration,
        elevation: Math.round(dist * incl * 10), // км × % × 10 = метры набора
      });
    });
    if (sectors.length) {
      const distance = sectors.reduce((a, c) => a + (parseFloat(c.distance) || 0), 0);
      const durMin = sectors.reduce((a, c) => a + (c.durationSec != null ? c.durationSec / 60 : (parseFloat(c.duration) || 0)), 0);
      const speed = durMin > 0 ? (distance * 60) / durMin : 0;
      const elevation = sectors.reduce((a, c) => a + (parseFloat(c.distance) || 0) * (parseFloat(c.incline) || 0) * 10, 0);
      points.push({
        id: `${s.id}-sectors`, date: s.date, type: 'cardio', isSectors: true,
        routeName: s.routeName || null,
        speed: Math.round(speed * 10) / 10, distance: Math.round(distance * 100) / 100, duration: Math.round(durMin),
        elevation: Math.round(elevation),
        // incline обязателен для «Подъёма» — из него строится профиль горы.
        sectors: sectors.map((c, i) => ({
          label: (c.name || '').replace(SECTOR_RE, '').trim() || String(i + 1),
          speed: parseFloat(c.speed) || 0, distance: parseFloat(c.distance) || 0,
          incline: parseFloat(c.incline) || 0,
          duration: c.durationSec != null ? Math.round(c.durationSec / 60) : (parseFloat(c.duration) || 0),
          elevation: Math.round((parseFloat(c.distance) || 0) * (parseFloat(c.incline) || 0) * 10),
        })),
      });
    }
  });
  return points.sort((a, b) => a.date.localeCompare(b.date));
}

function TreadmillChart({ sessions }) {
  const t = useTheme();
  const [metric, setMetric] = useState('speed');
  const [drill, setDrill] = useState(null);
  const points = useMemo(() => buildTreadmillPoints(sessions), [sessions]);
  const m = TREADMILL_METRICS.find((x) => x.key === metric);

  const metricToggle = (
    <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
      {TREADMILL_METRICS.map((mm) => {
        const active = mm.key === metric;
        return (
          <button
            key={mm.key} onClick={() => setMetric(mm.key)}
            style={{
              flex: 1, minWidth: 0, padding: '8px 3px', borderRadius: 9, fontSize: 12, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              border: `1px solid ${active ? t.ACCENT : t.BORDER}`, background: active ? t.ACCENT_BG : 'transparent',
              color: active ? t.ACCENT_SOFT : t.TEXT_DIM,
            }}
          >{mm.label}</button>
        );
      })}
    </div>
  );

  const cardStyle = { ...glassCard({ blur: true }), borderRadius: 18, padding: '16px 16px 8px', marginBottom: 14 };

  if (points.length === 0) return null;

  // Разбивка одного кардио-дня по секторам (раскрытие по тапу на точку).
  if (drill) {
    const data = drill.sectors.map((s) => ({ name: s.label, value: Math.round((s[metric] || 0) * 100) / 100 }));
    return (
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <button
            onClick={() => setDrill(null)} aria-label="Назад"
            style={{ width: 34, height: 34, borderRadius: 9, border: `1px solid ${t.BORDER}`, background: t.BG_INPUT, color: t.TEXT_DIM, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          >‹</button>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: t.TEXT }}>{drill.routeName || 'Кардио-день · секторы'}</div>
            <div style={{ fontSize: 12, color: t.TEXT_FAINT }}>{fmtDateFull(drill.date)}</div>
          </div>
        </div>
        {metricToggle}
        {metric === 'elevation' ? (
          <div style={{ marginBottom: 8 }}>
            <MountainBox sectors={drill.sectors} />
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 10,
              fontFamily: MONO, fontSize: 11.5, color: t.TEXT_DIM,
            }}>
              <span>{drill.sectors.length} сект.</span>
              <span>{drill.distance} км</span>
              <span style={{ color: t.ACCENT_SOFT, fontWeight: 700 }}>↑ {drill.elevation} м</span>
            </div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={170}>
            <LineChart data={data} margin={{ top: 4, right: 6, left: 4, bottom: 0 }}>
              <CartesianGrid stroke={t.BORDER} strokeDasharray="2 4" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: t.TEXT_FAINT, fontSize: 11 }} axisLine={{ stroke: t.BORDER }} tickLine={false} />
              <YAxis tick={{ fill: t.TEXT_FAINT, fontSize: 10 }} axisLine={false} tickLine={false} width={38} />
              <Tooltip contentStyle={{ background: t.BG_INPUT, border: `1px solid ${t.BORDER}`, borderRadius: 8, fontSize: 12 }} labelStyle={{ color: t.TEXT_DIM }} formatter={(v) => [`${v} ${m.unit}`, m.label]} />
              <Line type="monotone" dataKey="value" name={m.label} stroke={t.ACCENT} strokeWidth={2.2} dot={{ r: 3, fill: t.ACCENT, strokeWidth: 0 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    );
  }

  // Основной график: точки по типам, разными цветами.
  const rowsByDate = {};
  points.forEach((p) => {
    const d = p.date;
    rowsByDate[d] = rowsByDate[d] || { date: d, label: fmtDateShort(d) };
    rowsByDate[d][p.type] = Math.round((p[metric] || 0) * 100) / 100;
    if (p.type === 'cardio' && p.isSectors) rowsByDate[d]._cardio = p;
  });
  const data = Object.values(rowsByDate).sort((a, b) => a.date.localeCompare(b.date));
  const presentTypes = TREADMILL_TYPES.filter((tp) => points.some((p) => p.type === tp.key));
  const hasSectors = points.some((p) => p.isSectors);

  const makeDot = (typeKey, color, clickable) => (props) => {
    const { cx, cy, payload } = props;
    if (cx == null || cy == null || payload[typeKey] == null) return null;
    const isClickable = clickable && payload._cardio;
    return (
      <circle
        cx={cx} cy={cy} r={isClickable ? 4.8 : 3} fill={color}
        stroke={isClickable ? t.BG_RAISED : undefined} strokeWidth={isClickable ? 1.5 : 0}
        style={{ cursor: isClickable ? 'pointer' : 'default' }}
        onClick={isClickable ? () => setDrill(payload._cardio) : undefined}
      />
    );
  };

  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 14.5, fontWeight: 700, color: t.TEXT, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 7 }}>
        <Footprints size={16} color={t.ACCENT_SOFT} strokeWidth={2} style={{ flexShrink: 0 }} />
        Беговая дорожка
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
        {presentTypes.map((tp) => (
          <span key={tp.key} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: tp.color, flexShrink: 0 }} />
            <span style={{ color: t.TEXT_DIM, fontWeight: 600 }}>{tp.label}</span>
          </span>
        ))}
      </div>
      {metricToggle}
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={data} margin={{ top: 4, right: 6, left: 4, bottom: 0 }}>
          <CartesianGrid stroke={t.BORDER} strokeDasharray="2 4" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: t.TEXT_FAINT, fontSize: 10 }} axisLine={{ stroke: t.BORDER }} tickLine={false} />
          <YAxis tick={{ fill: t.TEXT_FAINT, fontSize: 10 }} axisLine={false} tickLine={false} width={38} />
          <Tooltip contentStyle={{ background: t.BG_INPUT, border: `1px solid ${t.BORDER}`, borderRadius: 8, fontSize: 12 }} labelStyle={{ color: t.TEXT_DIM }} formatter={(v, n) => [`${v} ${m.unit}`, n]} />
          {TREADMILL_TYPES.map((tp) => (
            <Line
              key={tp.key} type="monotone" dataKey={tp.key} name={tp.label}
              stroke={tp.color} strokeWidth={2.2} connectNulls
              dot={makeDot(tp.key, tp.color, tp.key === 'cardio')} activeDot={{ r: 5 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      {hasSectors && (
        <div style={{ fontSize: 11.5, color: t.TEXT_FAINT, margin: '2px 0 8px', lineHeight: 1.4 }}>
          Тап по точке «кардио-тренировка» — разбивка того дня по секторам.
        </div>
      )}
    </div>
  );
}

function SessionCard({ s, onEdit, onDelete }) {
  const t = useTheme();
  const cardioAll = s.cardio || [];
  const sectorEntries = cardioAll.filter((c) => SECTOR_RE.test((c.name || '').trim()));
  const regularCardio = cardioAll.filter((c) => !SECTOR_RE.test((c.name || '').trim()));

  // Единый список блоков — чтобы аккуратно убрать нижнюю границу у последнего.
  const blocks = [];
  (s.exercises || []).forEach((ex, i) => blocks.push({ kind: 'ex', ex, key: `ex-${i}` }));
  regularCardio.forEach((c, i) => blocks.push({ kind: 'cardio', c, key: `c-${i}` }));
  if (sectorEntries.length) blocks.push({ kind: 'sectors', sectors: sectorEntries, key: 'sectors' });

  return (
    <div style={{ background: t.BG_RAISED, border: `1px solid ${t.BORDER}`, borderRadius: 16, padding: 15, boxShadow: t.CARD_SHADOW }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: t.TEXT_DIM, textTransform: 'capitalize' }}>{fmtDateFull(s.date)}</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => onEdit(s)} style={{ background: 'transparent', border: 'none', color: t.TEXT_FAINT, cursor: 'pointer', padding: 4 }}>
            <Pencil size={14} />
          </button>
          <button onClick={() => onDelete(s.id)} style={{ background: 'transparent', border: 'none', color: t.TEXT_FAINT, cursor: 'pointer', padding: 4 }}>
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {blocks.map((b, bi) => {
          const last = bi === blocks.length - 1;
          const rowStyle = { padding: '7px 0', borderBottom: last ? 'none' : `1px solid ${t.BORDER}`, fontSize: 13.5 };
          if (b.kind === 'ex') {
            const ex = b.ex;
            const timed = ex.timed || isTimeBasedExercise(ex.name);
            const weightless = isWeightlessExercise(ex.name) || timed;
            const hasSetLog = Array.isArray(ex.setLog) && ex.setLog.length > 0;
            const repUnit = timed ? ' с' : '';
            return (
              <div key={b.key} style={rowStyle}>
                <div style={{ color: t.TEXT, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 7 }}>
                  <MuscleBadge name={ex.name} size={17} />
                  <span style={{ minWidth: 0 }}>{ex.name}</span>
                  {/* Секундомер упражнения из пошагового режима (1.1.0) */}
                  {ex.durationSec > 0 && (
                    <span style={{
                      marginLeft: 'auto', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 4,
                      fontSize: 11.5, color: t.TEXT_FAINT, fontFamily: MONO,
                    }}>
                      <Timer size={11} style={{ opacity: 0.8 }} /> {secToClock(ex.durationSec)}
                    </span>
                  )}
                </div>
                {/* Пометки пошагового режима (1.1.0): упражнение заменили или добавили по ходу */}
                {(ex.replacedFrom || ex.added) && (
                  <div style={{ fontSize: 11.5, color: t.TEXT_FAINT, marginBottom: 3, paddingLeft: categorizeExercise(ex.name) ? 24 : 0 }}>
                    {ex.replacedFrom ? `вместо «${ex.replacedFrom}»` : 'добавлено в тренировке'}
                  </div>
                )}
                {hasSetLog ? (
                  <SetChips setLog={ex.setLog} weightless={weightless} timed={timed} />
                ) : (
                  <div style={{ color: t.TEXT_DIM, fontFamily: MONO, fontSize: 13 }}>
                    {weightless ? `${ex.reps}${repUnit}${ex.sets > 1 ? ` × ${ex.sets}` : ''}` : `${ex.weight} кг × ${ex.reps}${ex.sets > 1 ? ` × ${ex.sets}` : ''}`}
                  </div>
                )}
              </div>
            );
          }
          if (b.kind === 'cardio') {
            const c = b.c;
            const isPool = c.name.trim().toLowerCase().includes('бассейн');
            return (
              <div key={b.key} style={rowStyle}>
                <div style={{ color: t.TEXT, marginBottom: 2 }}>{c.name}</div>
                <div style={{ color: t.TEXT_DIM, fontFamily: MONO, fontSize: 13 }}>
                  {isPool
                    ? `${c.duration} мин`
                    : <>{c.distance ? `${c.distance} км` : ''}{c.speed ? `${c.distance ? ' · ' : ''}${c.speed} км/ч` : ''}{c.incline ? `${(c.distance || c.speed) ? ' · ' : ''}накл. ${c.incline}%` : ''}{c.duration ? `${(c.distance || c.speed || c.incline) ? ' · ' : ''}${c.duration} мин` : ''}</>
                  }
                </div>
              </div>
            );
          }
          return (
            <div key={b.key} style={{ borderBottom: last ? 'none' : `1px solid ${t.BORDER}` }}>
              <SectorBlock sectors={b.sectors} routeName={s.routeName} />
            </div>
          );
        })}
      </div>
      {(s.sleep || s.energy || s.difficulty || s.durationSec || s.feeling) && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${t.BORDER}`, fontSize: 12.5, color: t.TEXT_FAINT }}>
          {/* Длительность, сон, энергия, тяжесть — по центру, с равными промежутками
              между собой и до краёв. Заметка — отдельной строкой ниже. */}
          {(s.durationSec > 0 || s.sleep || s.energy || s.difficulty) && (
            <div style={{ display: 'flex', justifyContent: 'space-evenly', alignItems: 'center', flexWrap: 'wrap', rowGap: 6 }}>
              {s.durationSec > 0 && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Timer size={12} style={{ opacity: 0.8 }} /> {secToClock(s.durationSec)}
                </span>
              )}
              {s.sleep && <span>Сон {s.sleep} ч</span>}
              {s.energy && <span>Энергия {s.energy}/5</span>}
              {s.difficulty && <span>Тяжесть {s.difficulty}/5</span>}
            </div>
          )}
          {s.feeling && <div style={{ marginTop: 8, lineHeight: 1.45 }}>{s.feeling}</div>}
        </div>
      )}
    </div>
  );
}

function ArchiveWeekGroup({ weekStart, items, onEdit, onDelete }) {
  const t = useTheme();
  const [expanded, setExpanded] = useState(false);
  const weekEnd = shiftDate(weekStart, 6);

  return (
    <div style={{ marginBottom: 8 }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%',
          padding: '12px 14px', ...glassCard({ shadow: false }), borderRadius: 10,
          cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
        }}
      >
        <span style={{ color: t.TEXT, fontSize: 13.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ color: t.TEXT_FAINT, fontSize: 11 }}>{expanded ? '▼' : '▶'}</span>
          {fmtDateShort(weekStart)} – {fmtDateShort(weekEnd)}
        </span>
        <span style={{ color: t.TEXT_FAINT, fontSize: 12.5 }}>{items.length} трен.</span>
      </button>
      {expanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8, paddingLeft: 8 }}>
          {items.map((s) => (
            <SessionCard key={s.id} s={s} onEdit={onEdit} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  );
}

const MONTHS_RU = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
function monthLabel(m) { const [y, mo] = m.split('-'); return `${MONTHS_RU[parseInt(mo, 10) - 1]} ${y}`; }

// Строит дерево архива: Год → Месяц → Неделя → [сессии], всё по убыванию.
function buildArchiveTree(list) {
  const years = {};
  list.forEach((s) => {
    const year = s.date.slice(0, 4);
    const month = s.date.slice(0, 7);
    const wk = getMonday(s.date);
    years[year] = years[year] || { year, count: 0, months: {} };
    years[year].count++;
    const M = (years[year].months[month] = years[year].months[month] || { month, count: 0, weeks: {} });
    M.count++;
    const W = (M.weeks[wk] = M.weeks[wk] || { weekStart: wk, count: 0, items: [] });
    W.count++; W.items.push(s);
  });
  return Object.values(years)
    .sort((a, b) => b.year.localeCompare(a.year))
    .map((Y) => ({
      ...Y,
      months: Object.values(Y.months)
        .sort((a, b) => b.month.localeCompare(a.month))
        .map((M) => ({
          ...M,
          weeks: Object.values(M.weeks)
            .sort((a, b) => b.weekStart.localeCompare(a.weekStart))
            .map((W) => ({ ...W, items: W.items.sort((a, b) => b.date.localeCompare(a.date)) })),
        })),
    }));
}

function ArchiveMonthGroup({ month, onEdit, onDelete }) {
  const t = useTheme();
  const [expanded, setExpanded] = useState(false);
  return (
    <div style={{ marginBottom: 6 }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%',
          padding: '11px 13px', ...glassCard({ shadow: false }), borderRadius: 10,
          cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
        }}
      >
        <span style={{ color: t.TEXT_DIM, fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ color: t.TEXT_FAINT, fontSize: 10 }}>{expanded ? '▼' : '▶'}</span>
          {monthLabel(month.month)}
        </span>
        <span style={{ color: t.TEXT_FAINT, fontSize: 12 }}>{month.count} трен.</span>
      </button>
      {expanded && (
        <div style={{ marginTop: 6, paddingLeft: 8 }}>
          {month.weeks.map((w) => (
            <ArchiveWeekGroup key={w.weekStart} weekStart={w.weekStart} items={w.items} onEdit={onEdit} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  );
}

function ArchiveYearGroup({ year, onEdit, onDelete }) {
  const t = useTheme();
  const [expanded, setExpanded] = useState(false);
  return (
    <div style={{ marginBottom: 8 }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%',
          padding: '13px 14px', ...glassCard({ shadow: false }), border: `1px solid ${t.ACCENT_BORDER}`, borderRadius: 12,
          cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
        }}
      >
        <span style={{ color: t.TEXT, fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, fontFamily: t.FONT_MONO }}>
          <span style={{ color: t.ACCENT_SOFT, fontSize: 11 }}>{expanded ? '▼' : '▶'}</span>
          {year.year}
        </span>
        <span style={{ color: t.TEXT_FAINT, fontSize: 12.5 }}>{year.count} трен.</span>
      </button>
      {expanded && (
        <div style={{ marginTop: 8, paddingLeft: 8 }}>
          {year.months.map((m) => (
            <ArchiveMonthGroup key={m.month} month={m} onEdit={onEdit} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  );
}

export function ProgressTab({ sessions, measurements, profile, onDeleteSession, onEditSession }) {
  const t = THEME_2A;

  const exerciseSeries = useMemo(() => {
    const map = {};
    (sessions || []).forEach((s) => {
      (s.exercises || []).forEach((ex) => {
        if (!map[ex.name]) map[ex.name] = [];
        map[ex.name].push({ date: s.date, weight: ex.weight, reps: ex.reps, sets: ex.sets, setLog: ex.setLog });
      });
    });
    Object.keys(map).forEach((k) => map[k].sort((a, b) => a.date.localeCompare(b.date)));
    return map;
  }, [sessions]);

  const cardioSeries = useMemo(() => {
    const map = {};
    (sessions || []).forEach((s) => {
      (s.cardio || []).forEach((c) => {
        if (!map[c.name]) map[c.name] = [];
        map[c.name].push({ date: s.date, distance: c.distance, speed: c.speed, incline: c.incline, duration: c.duration });
      });
    });
    Object.keys(map).forEach((k) => map[k].sort((a, b) => a.date.localeCompare(b.date)));
    return map;
  }, [sessions]);

  const bodyweightByDate = useMemo(() => {
    const map = {};
    (measurements || []).forEach((m) => { if (m.weight != null) map[m.date] = m.weight; });
    return map;
  }, [measurements]);

  const options = useMemo(() => {
    const exOpts = Object.entries(exerciseSeries)
      .filter(([, pts]) => pts.length >= 2)
      .map(([name]) => ({ key: `ex:${name}`, label: name, type: 'exercise' }));
    // Беговая дорожка, разминка и секторы — отдельная плашка «Беговая дорожка» (TreadmillChart),
    // поэтому из общего селектора их исключаем, чтобы не дублировать.
    const cardioOpts = Object.entries(cardioSeries)
      .filter(([name, pts]) => pts.length >= 2 && !name.trim().toLowerCase().includes('бассейн')
        && !isTreadmillName(name) && !SECTOR_RE.test(name.trim()))
      .map(([name]) => ({ key: `cardio:${name}`, label: name, type: 'cardio' }));
    const bwOpts = (measurements || []).length >= 2
      ? [{ key: 'bw:weight', label: 'Вес тела', type: 'bodyweight' }]
      : [];
    const ratioOpts = Object.entries(exerciseSeries)
      .filter(([, pts]) => pts.length >= 2)
      .map(([name]) => ({ key: `ratio:${name}`, label: `${name} (коэф. к весу тела)`, type: 'ratio' }));
    return [...exOpts, ...cardioOpts, ...bwOpts, ...ratioOpts].sort((a, b) => a.label.localeCompare(b.label));
  }, [exerciseSeries, cardioSeries, measurements]);

  const [selectedKeys, setSelectedKeys] = useState([]);
  const [period, setPeriod] = useState('all');
  const [showArchive, setShowArchive] = useState(false);
  const [showRecords, setShowRecords] = useState(false);

  const records = useMemo(() => computeRecords(sessions), [sessions]);
  const recordList = useMemo(() => Object.entries(records).sort((a, b) => a[0].localeCompare(b[0])), [records]);

  // Первая серия подставляется РОВНО ОДИН РАЗ — как начальное значение, а не как
  // инвариант. Раньше этот эффект зависел от selectedKeys и возвращал серию обратно
  // сразу же, как только снимали последнюю галочку: очистить график было невозможно.
  //
  // Какую серию подставить: раньше — первую по алфавиту, и это всегда были
  // «Болгарские сплит-приседы». Теперь — случайное упражнение из тех, что за
  // последние 30 дней встречались больше двух раз (и не только с нулевым весом —
  // у упражнений без веса график по килограммам — ровная линия по нулю). Каждое
  // открытие «Прогресса» — новое. Подходящих нет — последнее сделанное упражнение.
  const seededRef = React.useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    if (options.length === 0) return;
    seededRef.current = true;
    setSelectedKeys((prev) => (prev.length > 0 ? prev : [pickDefaultSeriesKey(exerciseSeries, options, todayISO())]));
  }, [options]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSeries = (key) => {
    setSelectedKeys((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]);
  };

  const periodDays = PERIODS.find((p) => p.key === period)?.days;
  const cutoffDate = periodDays ? shiftDate(todayISO(), -periodDays) : null;

  const filterByPeriod = (pts) => cutoffDate ? pts.filter((p) => p.date >= cutoffDate) : pts;

  const selectedSeries = useMemo(() => {
    return selectedKeys.map((key, idx) => {
      const color = SERIES_COLORS[idx % SERIES_COLORS.length];
      const [type, name] = [key.split(':')[0], key.slice(key.indexOf(':') + 1)];
      if (type === 'ex') {
        const pts = filterByPeriod(exerciseSeries[name] || []).map((p) => ({ date: p.date, value: p.weight, info: exercisePointInfo(p) }));
        return { key, label: name, color, unit: ' кг', points: pts };
      }
      if (type === 'cardio') {
        const pts = filterByPeriod(cardioSeries[name] || []).map((p) => ({ date: p.date, value: p.speed }));
        return { key, label: name, color, unit: ' км/ч', points: pts };
      }
      if (type === 'bw') {
        const pts = filterByPeriod((measurements || []).map((m) => ({ date: m.date, value: m.weight })));
        return { key, label: 'Вес тела', color, unit: ' кг', points: pts };
      }
      if (type === 'ratio') {
        const raw = exerciseSeries[name] || [];
        const pts = filterByPeriod(raw)
          .map((p) => {
            const bw = bodyweightByDate[p.date];
            if (!bw) return null;
            return { date: p.date, value: Math.round((p.weight / bw) * 100) / 100 };
          })
          .filter(Boolean);
        return { key, label: `${name}, коэф.`, color, unit: '', points: pts };
      }
      return { key, label: name, color, unit: '', points: [] };
    }).filter((s) => s.points.length > 0);
  }, [selectedKeys, exerciseSeries, cardioSeries, measurements, bodyweightByDate, period]);

  // «Эта неделя» = сессии текущей календарной недели; остальное → архив (Год→Месяц→Неделя).
  const thisMonday = useMemo(() => getMonday(todayISO()), []);
  const currentWeekSessions = useMemo(
    () => [...(sessions || [])].filter((s) => getMonday(s.date) === thisMonday).sort((a, b) => b.date.localeCompare(a.date)),
    [sessions, thisMonday],
  );
  const archivedSessions = useMemo(
    () => [...(sessions || [])].filter((s) => getMonday(s.date) !== thisMonday),
    [sessions, thisMonday],
  );
  const archiveTree = useMemo(() => buildArchiveTree(archivedSessions), [archivedSessions]);

  // Дни недели в карточке — дни тренировок по плану (plans.js → trainingWeekdays).
  const planIdNow = profile && profile.planId;
  const streaks = useMemo(() => computeWeekStreak(sessions, planIdNow), [sessions, planIdNow]);

  if (!sessions || sessions.length === 0) {
    return (
      <div data-tour="progress" style={{ textAlign: 'center', padding: '48px 16px', color: t.TEXT_FAINT }}>
        <Dumbbell size={28} style={{ marginBottom: 10, opacity: 0.5 }} />
        <div style={{ fontSize: 14.5 }}>Пока нет тренировок.</div>
        <div style={{ fontSize: 13, marginTop: 4 }}>Добавь первую на вкладке «Тренировка».</div>
      </div>
    );
  }

  // Подписи — по номеру дня недели (0 — воскресенье): в карточке только дни
  // тренировок по плану. Две буквы, чтобы «П» и «С» различали понедельник с
  // пятницей и среду с субботой.
  const WEEKDAY_LABELS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

  const sectionLabel = { fontSize: 10.5, color: t.TEXT_FAINT, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: t.FONT_MONO, marginBottom: 14 };

  return (
    <ThemeContext.Provider value={THEME_2A}>
      <div style={{ color: t.TEXT, fontFamily: t.FONT }}>

      <div data-tour="progress" style={{
        ...glassCard({ blur: true }), borderRadius: 20,
        padding: '16px 18px', marginBottom: 28,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', flexShrink: 0, background: streaks.currentWeekDone > 0 ? t.ACCENT_SOFT : t.TEXT_FAINT }} />
          <span style={{ fontSize: 10, color: t.TEXT_DIM, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: t.FONT_MONO, whiteSpace: 'nowrap' }}>
            Неделя
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          {streaks.currentWeekDays.map((d, i) => (
            <div
              key={d.date}
              title={WEEKDAY_LABELS[d.weekday]}
              style={{
                width: 26, height: 22, borderRadius: 7,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 9.5, fontWeight: 600, fontFamily: t.FONT_MONO, letterSpacing: '-0.02em',
                flexShrink: 0, opacity: d.isFuture ? 0.5 : 1,
                ...(d.done
                  ? { color: t.ON_ACCENT, ...brassFill }
                  : { color: t.TEXT_FAINT, border: `1.5px solid ${t.BORDER}` }),
              }}
            >
              {WEEKDAY_LABELS[d.weekday]}
            </div>
          ))}
        </div>
        {streaks.weekMultiplier > 0 && (
          <span style={{
            fontSize: 15, fontWeight: 600, fontFamily: t.FONT_MONO, flexShrink: 0, ...brassText,
          }}>
            ×{streaks.weekMultiplier}
          </span>
        )}
      </div>

      {/* Сначала — тренировки этой недели и архив, потом графики, рекорды и
          экспорт: так попросил Никита. Архив заодно не прячется под свёрнутой
          тренировкой внизу экрана. */}
      <div style={sectionLabel}>
        Эта неделя
      </div>
      {currentWeekSessions.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
          {currentWeekSessions.map((s) => (
            <SessionCard key={s.id} s={s} onEdit={onEditSession} onDelete={onDeleteSession} />
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 13.5, color: t.TEXT_FAINT, marginBottom: 16, lineHeight: 1.5 }}>
          На этой неделе тренировок пока нет.
        </div>
      )}

      {archivedSessions.length > 0 && (
        <>
          <button
            onClick={() => setShowArchive(!showArchive)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%',
              ...FROST, border: `1px dashed ${t.BORDER}`, borderRadius: 9,
              padding: '11px 14px', color: t.TEXT_DIM, fontSize: 13.5, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit', boxSizing: 'border-box',
            }}
          >
            {showArchive ? 'Скрыть архив' : `Архив (${archivedSessions.length})`}
          </button>
          {showArchive && (
            <div style={{ marginTop: 12 }}>
              {archiveTree.length > 1
                ? archiveTree.map((y) => (
                    <ArchiveYearGroup key={y.year} year={y} onEdit={onEditSession} onDelete={onDeleteSession} />
                  ))
                : (archiveTree[0]?.months || []).map((m) => (
                    <ArchiveMonthGroup key={m.month} month={m} onEdit={onEditSession} onDelete={onDeleteSession} />
                  ))}
            </div>
          )}
        </>
      )}

      <div style={{ height: 1, background: t.BORDER, margin: '22px 0 18px' }} />

      <div style={sectionLabel}>
        Прогрессия
      </div>

      <MultiSeriesSelector options={options} selectedKeys={selectedKeys} onToggle={toggleSeries} onOnly={(key) => setSelectedKeys([key])} />
      <PeriodSelector value={period} onChange={setPeriod} />

      {options.length === 0 ? (
        <div style={{ fontSize: 13.5, color: t.TEXT_FAINT, marginBottom: 20, lineHeight: 1.5 }}>
          График появится, когда упражнение или вид кардио встретится хотя бы в двух тренировках.
        </div>
      ) : (
        <MultiSeriesChart selectedSeries={selectedSeries} />
      )}

      <TreadmillChart sessions={sessions} />

      <div style={{ height: 1, background: t.BORDER, margin: '22px 0 18px' }} />

      <button
        onClick={() => setShowRecords(!showRecords)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
          background: 'transparent', border: 'none', padding: '0 0 12px', cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        <span style={{ fontSize: 10.5, color: t.TEXT_FAINT, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: t.FONT_MONO }}>
          Личные рекорды {recordList.length > 0 ? `(${recordList.length})` : ''}
        </span>
        <span style={{ color: t.TEXT_FAINT, fontSize: 11 }}>{showRecords ? '▼' : '▶'}</span>
      </button>

      {showRecords && (
        recordList.length === 0 ? (
          <div style={{ fontSize: 13.5, color: t.TEXT_FAINT, lineHeight: 1.5, marginBottom: 18 }}>
            Рекорды появятся, как только сохранишь хотя бы одну тренировку.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
            {recordList.map(([name, r]) => {
              // Рекорд может быть по весу, по повторам или по секундам (упражнения без веса / на время).
              const bigValue = r.weight ? `${r.weight} кг`
                : r.metric === 'sec' ? `${r.value} с`
                : `${r.value} повт`;
              const subLine = r.weight
                ? `${fmtDateShort(r.date)}${r.reps ? ` · ${r.reps} повт` : ''}`
                : fmtDateShort(r.date);
              return (
                <div key={name} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  background: CREAM, border: 'none', borderRadius: 14, padding: '12px 15px',
                }}>
                  <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{
                      width: 22, height: 22, borderRadius: 7, background: 'rgba(10,10,10,0.10)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: t.FONT_MONO, fontSize: 11, fontWeight: 600, color: ON_CREAM, flexShrink: 0,
                    }}>{muscleLetter(name)}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: ON_CREAM, marginBottom: 2 }}>{name}</div>
                      <div style={{ fontSize: 11, color: ON_CREAM_MUTED, fontFamily: t.FONT_MONO, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{subLine}</div>
                    </div>
                  </div>
                  <div style={{
                    fontSize: 17, fontWeight: 600, color: ON_CREAM, fontFamily: t.FONT_MONO,
                    flexShrink: 0, marginLeft: 12,
                  }}>
                    {bigValue}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      <div style={{ height: 1, background: t.BORDER, margin: '0 0 18px' }} />

      <WeekExportPanel sessions={sessions} measurements={measurements} />
      </div>
    </ThemeContext.Provider>
  );
}
