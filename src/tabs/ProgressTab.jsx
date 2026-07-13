import React, { useState, useMemo, useEffect } from 'react';
import { Dumbbell, Ruler, LineChart as LineIcon, TrendingUp, Pencil, Trash2, Flame, ChevronDown } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts';
import { useTheme, ThemeContext } from '../theme.js';
import { todayISO, shiftDate, fmtDateShort, fmtDateFull } from '../dateUtils.js';
import { computeRecords, getMonday, computeWeekStreak } from '../gamification.js';
import { MuscleBadge, isWeightlessExercise, secToClock, categorizeExercise } from './workoutTabHelpers.jsx';
import { WeekExportPanel } from './WeekExportPanel.jsx';

function muscleLetter(name) {
  const g = categorizeExercise(name);
  return g ? g.letter : (name || '?').trim().charAt(0).toUpperCase();
}

// ---- Редизайн 2A: тёмная металлик-тема «Прогресса» ----
// Фиксированная палитра (независимо от переключателя свет/тёмная) в форме токенов темы,
// чтобы все дочерние useTheme() внутри вкладки получили её через ThemeContext.Provider.
const THEME_2A = {
  ACCENT: '#C79A4E', ACCENT_SOFT: '#E4C57E', ACCENT_DEEP: '#9E7A34', POSITIVE: '#93A86A',
  BG: '#0A0A0A', BG_RAISED: '#171512', BG_INPUT: '#1C1A16', BORDER: 'rgba(242,235,221,0.12)',
  TEXT: '#F2EBDD', TEXT_DIM: '#8F897C', TEXT_FAINT: '#6E6A60',
  ACCENT_GRAD: 'linear-gradient(100deg,#8B6B2E,#C79A4E,#F5E3AE,#C79A4E,#8B6B2E)', ON_ACCENT: '#0A0A0A',
  ACCENT_BG: 'rgba(199,154,78,0.15)', ACCENT_BORDER: 'rgba(184,146,74,0.30)',
  POSITIVE_BG: 'rgba(147,168,106,0.16)',
  GLOW: '0 0 22px rgba(184,146,74,0.40)', NAV_BG: 'rgba(23,21,18,0.10)',
  CARD_SHADOW: '0 16px 40px rgba(0,0,0,0.4)',
  FONT: "'Space Grotesk', system-ui, sans-serif",
  FONT_DISPLAY: "'Space Grotesk', system-ui, sans-serif",
  FONT_MONO: "'JetBrains Mono', 'SF Mono', monospace",
};
// Крем заметно полупрозрачный + блюр — светлые карточки мягкие, не режут глаз,
// сквозь них просвечивает тёмный фон с полосами.
const CREAM = 'rgba(242,235,221,0.55)';
const ON_CREAM = '#141210';
const ON_CREAM_MUTED = 'rgba(20,18,16,0.62)';
const CREAM_BLUR = { backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' };
export const STRIPES_2A = 'repeating-linear-gradient(60deg, rgba(242,224,166,0.055) 0px, rgba(242,224,166,0.055) 1.5px, transparent 1.5px, transparent 11px, rgba(184,146,74,0.05) 11px, rgba(184,146,74,0.05) 12.5px, transparent 12.5px, transparent 22px)';
export const BG_2A = '#0A0A0A';
export const BRASS_SHEEN = 'linear-gradient(100deg,#6E5424 0%,#C79A4E 14%,#F5E3AE 24%,#FFF6DC 30%,#F5E3AE 36%,#C79A4E 46%,#8B6B2E 58%,#C79A4E 70%,#F5E3AE 78%,#C79A4E 88%,#6E5424 100%)';
// Блик берётся из CSS-переменной --shine (её пишет useBrassShine на ref-контейнере).
export const brassFill = { backgroundImage: BRASS_SHEEN, backgroundSize: '220% 220%', backgroundPosition: 'var(--shine, 50% 50%)' };
export const brassText = { ...brassFill, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' };

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

function MultiSeriesSelector({ options, selectedKeys, onToggle }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const selectedLabels = options.filter((o) => selectedKeys.includes(o.key)).map((o) => o.label);

  return (
    <div style={{ position: 'relative', width: '100%', minWidth: 0, marginBottom: 14 }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
          background: CREAM, ...CREAM_BLUR, border: 'none', borderRadius: 14,
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
                <button
                  key={o.key}
                  onClick={() => onToggle(o.key)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', padding: '11px 14px',
                    background: isSelected ? t.ACCENT_BG : 'transparent', border: 'none',
                    borderBottom: `1px solid ${t.BORDER}`, color: isSelected ? t.ACCENT_SOFT : t.TEXT,
                    fontSize: 14.5, fontWeight: isSelected ? 700 : 400, cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  <span style={{
                    flexShrink: 0, width: 16, height: 16, borderRadius: 4, border: `2px solid ${isSelected ? t.ACCENT : t.TEXT_FAINT}`,
                    background: isSelected ? t.ACCENT : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: t.ON_ACCENT,
                  }}>
                    {isSelected ? '✓' : ''}
                  </span>
                  {o.type === 'cardio' ? <LineIcon size={14} style={{ flexShrink: 0, opacity: 0.6 }} /> : o.type === 'bodyweight' ? <Ruler size={14} style={{ flexShrink: 0, opacity: 0.6 }} /> : o.type === 'ratio' ? <TrendingUp size={14} style={{ flexShrink: 0, opacity: 0.6 }} /> : <Dumbbell size={14} style={{ flexShrink: 0, opacity: 0.6 }} />}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.label}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function MultiSeriesChart({ selectedSeries }) {
  const t = useTheme();

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
    <div style={{ background: t.BG_RAISED, border: `1px solid ${t.BORDER}`, borderRadius: 18, padding: '16px 16px 8px', marginBottom: 14, boxShadow: t.CARD_SHADOW }}>
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
            contentStyle={{ background: t.BG_INPUT, border: `1px solid ${t.BORDER}`, borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: t.TEXT_DIM }}
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
function SetChips({ setLog, weightless }) {
  const t = useTheme();
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, marginTop: 5 }}>
      {setLog.map((s, i) => (
        <span key={i} style={{
          background: t.BG_INPUT, border: `1px solid ${t.BORDER}`, borderRadius: 9,
          padding: '6px 12px', fontFamily: MONO, fontSize: 13, display: 'inline-flex', alignItems: 'center',
        }}>
          {weightless ? (
            <span style={{ color: t.TEXT, fontWeight: 700 }}>{s.reps}</span>
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
function SectorBlock({ sectors }) {
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
          🏃 Кардио по секторам · {sectors.length}
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
      points.push({
        id: `${s.id}-${c.name}`, date: s.date,
        type: classifyTreadmill(c.name, duration, hasStrength),
        speed: parseFloat(c.speed) || 0, distance: parseFloat(c.distance) || 0, duration,
      });
    });
    if (sectors.length) {
      const distance = sectors.reduce((a, c) => a + (parseFloat(c.distance) || 0), 0);
      const durMin = sectors.reduce((a, c) => a + (c.durationSec != null ? c.durationSec / 60 : (parseFloat(c.duration) || 0)), 0);
      const speed = durMin > 0 ? (distance * 60) / durMin : 0;
      points.push({
        id: `${s.id}-sectors`, date: s.date, type: 'cardio', isSectors: true,
        speed: Math.round(speed * 10) / 10, distance: Math.round(distance * 100) / 100, duration: Math.round(durMin),
        sectors: sectors.map((c, i) => ({
          label: (c.name || '').replace(SECTOR_RE, '').trim() || String(i + 1),
          speed: parseFloat(c.speed) || 0, distance: parseFloat(c.distance) || 0,
          duration: c.durationSec != null ? Math.round(c.durationSec / 60) : (parseFloat(c.duration) || 0),
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
              flex: 1, padding: '8px', borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              border: `1px solid ${active ? t.ACCENT : t.BORDER}`, background: active ? t.ACCENT_BG : 'transparent',
              color: active ? t.ACCENT_SOFT : t.TEXT_DIM,
            }}
          >{mm.label}</button>
        );
      })}
    </div>
  );

  const cardStyle = { background: t.BG_RAISED, border: `1px solid ${t.BORDER}`, borderRadius: 18, padding: '16px 16px 8px', marginBottom: 14, boxShadow: t.CARD_SHADOW };

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
            <div style={{ fontSize: 14.5, fontWeight: 700, color: t.TEXT }}>Кардио-день · секторы</div>
            <div style={{ fontSize: 12, color: t.TEXT_FAINT }}>{fmtDateFull(drill.date)}</div>
          </div>
        </div>
        {metricToggle}
        <ResponsiveContainer width="100%" height={170}>
          <LineChart data={data} margin={{ top: 4, right: 6, left: 4, bottom: 0 }}>
            <CartesianGrid stroke={t.BORDER} strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="name" tick={{ fill: t.TEXT_FAINT, fontSize: 11 }} axisLine={{ stroke: t.BORDER }} tickLine={false} />
            <YAxis tick={{ fill: t.TEXT_FAINT, fontSize: 10 }} axisLine={false} tickLine={false} width={38} />
            <Tooltip contentStyle={{ background: t.BG_INPUT, border: `1px solid ${t.BORDER}`, borderRadius: 8, fontSize: 12 }} labelStyle={{ color: t.TEXT_DIM }} formatter={(v) => [`${v} ${m.unit}`, m.label]} />
            <Line type="monotone" dataKey="value" name={m.label} stroke={t.ACCENT} strokeWidth={2.2} dot={{ r: 3, fill: t.ACCENT, strokeWidth: 0 }} />
          </LineChart>
        </ResponsiveContainer>
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
        🏃 Беговая дорожка
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
            const weightless = isWeightlessExercise(ex.name);
            const hasSetLog = Array.isArray(ex.setLog) && ex.setLog.length > 0;
            return (
              <div key={b.key} style={rowStyle}>
                <div style={{ color: t.TEXT, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 7 }}>
                  <MuscleBadge name={ex.name} size={17} />
                  <span>{ex.name}</span>
                </div>
                {hasSetLog ? (
                  <SetChips setLog={ex.setLog} weightless={weightless} />
                ) : (
                  <div style={{ color: t.TEXT_DIM, fontFamily: MONO, fontSize: 13 }}>
                    {weightless ? `${ex.reps}${ex.sets > 1 ? ` × ${ex.sets}` : ''}` : `${ex.weight} кг × ${ex.reps}${ex.sets > 1 ? ` × ${ex.sets}` : ''}`}
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
              <SectorBlock sectors={b.sectors} />
            </div>
          );
        })}
      </div>
      {(s.sleep || s.energy || s.feeling) && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${t.BORDER}`, fontSize: 12.5, color: t.TEXT_FAINT, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {s.sleep && <span>Сон {s.sleep} ч</span>}
          {s.energy && <span>Энергия {s.energy}/5</span>}
          {s.feeling && <span style={{ flexBasis: '100%' }}>{s.feeling}</span>}
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
          padding: '12px 14px', background: t.BG_RAISED, border: `1px solid ${t.BORDER}`, borderRadius: 10,
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
          padding: '11px 13px', background: 'transparent', border: `1px solid ${t.BORDER}`, borderRadius: 10,
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
          padding: '13px 14px', background: t.BG_RAISED, border: `1px solid ${t.ACCENT_BORDER}`, borderRadius: 12,
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
        map[ex.name].push({ date: s.date, weight: ex.weight, reps: ex.reps });
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

  useEffect(() => {
    if (selectedKeys.length === 0 && options.length > 0) {
      setSelectedKeys([options[0].key]);
    }
  }, [options, selectedKeys]);

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
        const pts = filterByPeriod(exerciseSeries[name] || []).map((p) => ({ date: p.date, value: p.weight }));
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

  const streaks = useMemo(() => computeWeekStreak(sessions), [sessions]);

  if (!sessions || sessions.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 16px', color: t.TEXT_FAINT }}>
        <Dumbbell size={28} style={{ marginBottom: 10, opacity: 0.5 }} />
        <div style={{ fontSize: 14.5 }}>Пока нет тренировок.</div>
        <div style={{ fontSize: 13, marginTop: 4 }}>Добавь первую на вкладке «Тренировка».</div>
      </div>
    );
  }

  const dayLetters = ['П', 'В', 'С', 'Ч', 'П'];

  const sectionLabel = { fontSize: 10.5, color: t.TEXT_FAINT, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: t.FONT_MONO, marginBottom: 14 };

  return (
    <ThemeContext.Provider value={THEME_2A}>
      <div style={{ color: t.TEXT, fontFamily: t.FONT }}>

      <div style={{
        background: t.BG_RAISED, border: `1px solid ${t.BORDER}`, borderRadius: 20, boxShadow: t.CARD_SHADOW,
        padding: '16px 18px', marginBottom: 28,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', flexShrink: 0, background: streaks.currentWeekDone > 0 ? t.ACCENT_SOFT : t.TEXT_FAINT }} />
          <span style={{ fontSize: 10, color: t.TEXT_DIM, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: t.FONT_MONO, whiteSpace: 'nowrap' }}>
            Неделя
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
          {streaks.currentWeekDays.map((d, i) => (
            <div
              key={d.date}
              title={dayLetters[i]}
              style={{
                width: 22, height: 22, borderRadius: 7,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 600, fontFamily: t.FONT_MONO,
                flexShrink: 0, opacity: d.isFuture ? 0.5 : 1,
                ...(d.done
                  ? { color: t.ON_ACCENT, ...brassFill }
                  : { color: t.TEXT_FAINT, border: `1.5px solid ${t.BORDER}` }),
              }}
            >
              {dayLetters[i]}
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

      <div style={sectionLabel}>
        Прогрессия
      </div>

      <MultiSeriesSelector options={options} selectedKeys={selectedKeys} onToggle={toggleSeries} />
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
            Рекорды появятся, как только сохранишь хотя бы одну тренировку с весом.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
            {recordList.map(([name, r]) => (
              <div key={name} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: CREAM, ...CREAM_BLUR, border: 'none', borderRadius: 14, padding: '12px 15px',
              }}>
                <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{
                    width: 22, height: 22, borderRadius: 7, background: 'rgba(10,10,10,0.10)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: t.FONT_MONO, fontSize: 11, fontWeight: 600, color: ON_CREAM, flexShrink: 0,
                  }}>{muscleLetter(name)}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: ON_CREAM, marginBottom: 2 }}>{name}</div>
                    <div style={{ fontSize: 11, color: ON_CREAM_MUTED, fontFamily: t.FONT_MONO, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{fmtDateShort(r.date)} · {r.reps} повт</div>
                  </div>
                </div>
                <div style={{
                  fontSize: 17, fontWeight: 600, color: ON_CREAM, fontFamily: t.FONT_MONO,
                  flexShrink: 0, marginLeft: 12,
                }}>
                  {r.weight} кг
                </div>
              </div>
            ))}
          </div>
        )
      )}

      <div style={{ height: 1, background: t.BORDER, margin: '0 0 18px' }} />

      <WeekExportPanel sessions={sessions} />

      <div style={{ height: 1, background: t.BORDER, margin: '0 0 18px' }} />

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
              background: 'transparent', border: `1px dashed ${t.BORDER}`, borderRadius: 9,
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
      </div>
    </ThemeContext.Provider>
  );
}
