import React, { useState, useMemo, useEffect } from 'react';
import { Dumbbell, Ruler, LineChart as LineIcon, TrendingUp, Pencil, Trash2, Flame } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts';
import { useTheme } from '../theme.js';
import { todayISO, shiftDate, fmtDateShort, fmtDateFull } from '../dateUtils.js';
import { computeRecords, getMonday, computeWeekStreak } from '../gamification.js';
import { MuscleBadge, isWeightlessExercise } from './workoutTabHelpers.jsx';

function average(nums) {
  if (!nums.length) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}

const SERIES_COLORS = ['#E08A3C', '#5B8FB0', '#C9A227', '#5C8A4E', '#9B6FB5'];

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
          background: t.BG_INPUT, border: `1px solid ${t.BORDER}`, borderRadius: 10,
          padding: '13px 14px', color: t.TEXT, fontSize: 15, fontWeight: 600,
          cursor: 'pointer', fontFamily: 'inherit', boxSizing: 'border-box',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selectedLabels.length === 0 ? 'Выбери, что показать' : selectedLabels.join(', ')}
        </span>
        <span style={{ color: t.TEXT_FAINT, flexShrink: 0, marginLeft: 8 }}>{open ? '▲' : '▼'}</span>
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
        <LineChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <CartesianGrid stroke={t.BORDER} strokeDasharray="2 4" vertical={false} />
          <XAxis dataKey="date" tick={{ fill: t.TEXT_FAINT, fontSize: 10 }} axisLine={{ stroke: t.BORDER }} tickLine={false} />
          <YAxis tick={{ fill: t.TEXT_FAINT, fontSize: 10 }} axisLine={false} tickLine={false} width={30} />
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

function SessionCard({ s, onEdit, onDelete }) {
  const t = useTheme();
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
        {(s.exercises || []).map((ex, i) => {
          const isLastOverall = i === (s.exercises.length - 1) && (!s.cardio || s.cardio.length === 0);
          const weightless = isWeightlessExercise(ex.name);
          return (
            <div key={`ex-${i}`} style={{
              padding: '7px 0', borderBottom: isLastOverall ? 'none' : `1px solid ${t.BORDER}`, fontSize: 13.5,
            }}>
              <div style={{ color: t.TEXT, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 7 }}>
                <MuscleBadge name={ex.name} size={17} />
                <span>{ex.name}</span>
              </div>
              <div style={{ color: t.TEXT_DIM, fontFamily: "'JetBrains Mono', 'SF Mono', monospace", fontSize: 13 }}>
                {weightless ? `${ex.reps}${ex.sets > 1 ? ` × ${ex.sets}` : ''}` : `${ex.weight} кг × ${ex.reps}${ex.sets > 1 ? ` × ${ex.sets}` : ''}`}
              </div>
            </div>
          );
        })}
        {(s.cardio || []).map((c, i) => {
          const isPool = c.name.trim().toLowerCase().includes('бассейн');
          return (
            <div key={`c-${i}`} style={{
              padding: '7px 0',
              borderBottom: i === (s.cardio.length - 1) ? 'none' : `1px solid ${t.BORDER}`,
              fontSize: 13.5,
            }}>
              <div style={{ color: t.TEXT, marginBottom: 2 }}>{c.name}</div>
              <div style={{ color: t.TEXT_DIM, fontFamily: "'JetBrains Mono', 'SF Mono', monospace", fontSize: 13 }}>
                {isPool
                  ? `${c.duration} мин`
                  : <>{c.distance ? `${c.distance} км` : ''}{c.speed ? `${c.distance ? ' · ' : ''}${c.speed} км/ч` : ''}{c.incline ? `${(c.distance || c.speed) ? ' · ' : ''}накл. ${c.incline}%` : ''}{c.duration ? `${(c.distance || c.speed || c.incline) ? ' · ' : ''}${c.duration} мин` : ''}</>
                }
              </div>
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

export function ProgressTab({ sessions, measurements, profile, onDeleteSession, onEditSession }) {
  const t = useTheme();

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
    const cardioOpts = Object.entries(cardioSeries)
      .filter(([name, pts]) => pts.length >= 2 && !name.trim().toLowerCase().includes('бассейн'))
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

  const sortedSessions = useMemo(() => [...(sessions || [])].reverse(), [sessions]);
  const recentSessions = sortedSessions.slice(0, 5);
  const archivedSessions = sortedSessions.slice(5);

  const archiveWeeks = useMemo(() => {
    const groups = {};
    archivedSessions.forEach((s) => {
      const wk = getMonday(s.date);
      if (!groups[wk]) groups[wk] = [];
      groups[wk].push(s);
    });
    return Object.entries(groups)
      .map(([weekStart, items]) => ({ weekStart, items: items.sort((a, b) => b.date.localeCompare(a.date)) }))
      .sort((a, b) => b.weekStart.localeCompare(a.weekStart));
  }, [archivedSessions]);

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

  return (
    <div>
      <div style={{
        background: t.BG_RAISED, border: `1px solid ${t.BORDER}`, borderRadius: 12,
        padding: '14px 16px', marginBottom: 22,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <Flame size={16} color={streaks.currentWeekDone > 0 ? t.ACCENT_SOFT : t.TEXT_FAINT} />
          <span style={{ fontSize: 11.5, color: t.TEXT_FAINT, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.02em' }}>
            Неделя
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {streaks.currentWeekDays.map((d, i) => (
            <div
              key={d.date}
              title={dayLetters[i]}
              style={{
                width: 22, height: 22, borderRadius: '50%',
                background: d.done ? t.ACCENT : 'transparent',
                border: `2px solid ${d.done ? t.ACCENT : t.BORDER}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 700, color: d.done ? t.ON_ACCENT : t.TEXT_FAINT,
                flexShrink: 0, opacity: d.isFuture ? 0.5 : 1,
              }}
            >
              {dayLetters[i]}
            </div>
          ))}
        </div>
        {streaks.weekMultiplier > 0 && (
          <span style={{
            fontSize: 13, fontWeight: 800, color: t.ACCENT_SOFT, fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
            flexShrink: 0,
          }}>
            ×{streaks.weekMultiplier}
          </span>
        )}
      </div>

      <div style={{ fontSize: 12, color: t.TEXT_FAINT, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.02em', marginBottom: 12 }}>
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

      <div style={{ height: 1, background: t.BORDER, margin: '22px 0 18px' }} />

      <button
        onClick={() => setShowRecords(!showRecords)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
          background: 'transparent', border: 'none', padding: '0 0 12px', cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        <span style={{ fontSize: 12, color: t.TEXT_FAINT, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.02em' }}>
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
                background: t.BG_RAISED, border: `1px solid ${t.BORDER}`, borderRadius: 11, padding: '12px 14px',
              }}>
                <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 9 }}>
                  <MuscleBadge name={name} size={22} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: t.TEXT, marginBottom: 2 }}>{name}</div>
                    <div style={{ fontSize: 11.5, color: t.TEXT_FAINT }}>{fmtDateShort(r.date)} · {r.reps} повт.</div>
                  </div>
                </div>
                <div style={{
                  fontSize: 17, fontWeight: 800, color: t.ACCENT_SOFT, fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
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

      <div style={{ fontSize: 12, color: t.TEXT_FAINT, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.02em', marginBottom: 12 }}>
        Последние тренировки
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
        {recentSessions.map((s) => (
          <SessionCard key={s.id} s={s} onEdit={onEditSession} onDelete={onDeleteSession} />
        ))}
      </div>

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
              {archiveWeeks.map((w) => (
                <ArchiveWeekGroup
                  key={w.weekStart} weekStart={w.weekStart} items={w.items}
                  onEdit={onEditSession} onDelete={onDeleteSession}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
