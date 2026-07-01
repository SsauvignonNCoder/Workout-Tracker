import React, { useState, useMemo } from 'react';
import { TrendingUp, TrendingDown, X } from 'lucide-react';
import { useTheme } from '../theme.js';
import { todayISO, shiftDate, fmtDateShort } from '../dateUtils.js';
import { getMonday } from '../gamification.js';
import { Field, getInputStyle, DatePicker } from './workoutTabHelpers.jsx';

function average(nums) {
  if (!nums.length) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}

function WeightHistoryRow({ m, prevWeight, onDelete }) {
  const t = useTheme();
  const delta = prevWeight != null && m.weight != null ? Math.round((m.weight - prevWeight) * 10) / 10 : null;
  const isDown = delta != null && delta < 0;
  const isUp = delta != null && delta > 0;
  const deltaColor = isDown ? t.POSITIVE : isUp ? t.ACCENT_SOFT : t.TEXT_FAINT;

  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 2px',
      borderBottom: `1px solid ${t.BORDER}`, fontSize: 13.5,
    }}>
      <span style={{ color: t.TEXT_DIM }}>{fmtDateShort(m.date)}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ color: t.TEXT, fontFamily: "'JetBrains Mono', 'SF Mono', monospace", fontWeight: 600 }}>{m.weight} кг</span>
        {delta != null && delta !== 0 && (
          <span style={{
            display: 'flex', alignItems: 'center', gap: 3, fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
            fontSize: 12, fontWeight: 700, color: deltaColor,
            background: isDown ? t.POSITIVE_BG : t.ACCENT_BG,
            padding: '2px 7px', borderRadius: 6,
          }}>
            {isDown ? <TrendingDown size={11} /> : <TrendingUp size={11} />}
            {delta > 0 ? '+' : ''}{delta}
          </span>
        )}
        {onDelete && (
          <button onClick={onDelete} style={{ background: 'transparent', border: 'none', color: t.TEXT_FAINT, cursor: 'pointer', padding: 2, display: 'flex' }}>
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

function WeekGroupRow({ weekStart, entries, onDelete }) {
  const t = useTheme();
  const [expanded, setExpanded] = useState(false);
  const avg = average(entries.map((e) => e.weight));
  const weekEnd = shiftDate(weekStart, 6);
  const rangeLabel = `${fmtDateShort(weekStart)} – ${fmtDateShort(weekEnd)}`;

  return (
    <div style={{ marginBottom: 6 }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%',
          padding: '11px 2px', background: 'transparent', border: 'none', borderBottom: `1px solid ${t.BORDER}`,
          cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
        }}
      >
        <span style={{ color: t.TEXT_DIM, fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: t.TEXT_FAINT, fontSize: 11 }}>{expanded ? '▼' : '▶'}</span>
          {rangeLabel}
        </span>
        <span style={{ color: t.TEXT, fontFamily: "'JetBrains Mono', 'SF Mono', monospace", fontWeight: 600, fontSize: 13.5 }}>
          {avg != null ? `${avg} кг` : '—'} <span style={{ color: t.TEXT_FAINT, fontSize: 11.5, fontWeight: 400 }}>сред.</span>
        </span>
      </button>
      {expanded && (
        <div style={{ paddingLeft: 14 }}>
          {entries.slice().reverse().map((m) => (
            <div key={m.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 2px',
              borderBottom: `1px solid ${t.BORDER}`, fontSize: 13,
            }}>
              <span style={{ color: t.TEXT_FAINT }}>{fmtDateShort(m.date)}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ color: t.TEXT_DIM, fontFamily: "'JetBrains Mono', 'SF Mono', monospace" }}>{m.weight} кг</span>
                {onDelete && (
                  <button
                    onClick={() => onDelete(m.id)}
                    style={{ background: 'transparent', border: 'none', color: t.TEXT_FAINT, cursor: 'pointer', padding: 2, display: 'flex' }}
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function MeasurementsTab({ measurements, saveMeasurements, setError }) {
  const t = useTheme();
  const [date, setDate] = useState(todayISO());
  const [weight, setWeight] = useState('');
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const sorted = useMemo(() => [...(measurements || [])].sort((a, b) => a.date.localeCompare(b.date)), [measurements]);

  const stats = useMemo(() => {
    const today = todayISO();
    const weekAgo = shiftDate(today, -7);
    const monthAgo = shiftDate(today, -30);
    const yearAgo = shiftDate(today, -365);
    const weekVals = sorted.filter((m) => m.date >= weekAgo && m.weight != null).map((m) => m.weight);
    const monthVals = sorted.filter((m) => m.date >= monthAgo && m.weight != null).map((m) => m.weight);
    const yearVals = sorted.filter((m) => m.date >= yearAgo && m.weight != null).map((m) => m.weight);
    return {
      week: average(weekVals),
      month: average(monthVals),
      year: average(yearVals),
    };
  }, [sorted]);

  const latest = sorted.length > 0 ? sorted[sorted.length - 1] : null;
  const prevLatest = sorted.length > 1 ? sorted[sorted.length - 2] : null;

  const handleDelete = async (id) => {
    const next = (measurements || []).filter((m) => m.id !== id);
    await saveMeasurements(next);
  };

  const { currentWeekEntries, pastWeeks } = useMemo(() => {
    const thisMonday = getMonday(todayISO());
    const current = sorted.filter((m) => m.date >= thisMonday);
    const past = sorted.filter((m) => m.date < thisMonday);
    const groups = {};
    past.forEach((m) => {
      const wk = getMonday(m.date);
      if (!groups[wk]) groups[wk] = [];
      groups[wk].push(m);
    });
    const weekList = Object.entries(groups)
      .map(([weekStart, entries]) => ({ weekStart, entries }))
      .sort((a, b) => b.weekStart.localeCompare(a.weekStart));
    return { currentWeekEntries: current, pastWeeks: weekList };
  }, [sorted]);

  const handleSave = async () => {
    if (!weight) {
      setError('Укажи вес');
      return;
    }
    const w = Math.max(0, parseFloat(weight));
    if (!w) {
      setError('Вес должен быть больше 0');
      return;
    }
    setSaving(true);
    const existingIdx = (measurements || []).findIndex((m) => m.date === date);
    let next;
    if (existingIdx >= 0) {
      next = [...measurements];
      next[existingIdx] = { ...next[existingIdx], weight: w };
    } else {
      next = [...(measurements || []), { id: `${date}-${Date.now()}`, date, weight: w }];
    }
    next.sort((a, b) => a.date.localeCompare(b.date));
    await saveMeasurements(next);
    setSaving(false);
    setWeight('');
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2200);
  };

  return (
    <div>
      <div style={{ marginBottom: 18, minWidth: 0, width: '100%' }}>
        <Field label="Дата замера">
          <DatePicker value={date} onChange={setDate} />
        </Field>
      </div>
      <div style={{ marginBottom: 22 }}>
        <Field label="Вес, кг">
          <input style={getInputStyle(t)} type="number" inputMode="decimal" min="0" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder={latest ? String(latest.weight) : '—'} />
        </Field>
      </div>
      <button
        onClick={handleSave}
        disabled={saving}
        className={justSaved ? 'save-bounce' : ''}
        style={{
          width: '100%', padding: '15px', borderRadius: 16, border: 'none',
          background: justSaved ? t.POSITIVE : t.ACCENT_GRAD, color: t.ON_ACCENT,
          fontSize: 15.5, fontWeight: 700, cursor: saving ? 'default' : 'pointer',
          opacity: saving ? 0.7 : 1, fontFamily: 'inherit',
          boxShadow: justSaved ? 'none' : t.GLOW,
          transition: 'background 0.2s ease, box-shadow 0.2s ease',
        }}
      >
        {justSaved ? 'Сохранено ✓' : saving ? 'Сохраняю...' : 'Сохранить вес'}
      </button>

      {sorted.length > 0 && (
        <>
          <div style={{ height: 1, background: t.BORDER, margin: '24px 0 18px' }} />
          <div style={{ fontSize: 12, color: t.TEXT_FAINT, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.02em', marginBottom: 12 }}>
            Средний вес
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            {[
              { label: 'За неделю', value: stats.week },
              { label: 'За месяц', value: stats.month },
              { label: 'За год', value: stats.year },
            ].map((s) => (
              <div key={s.label} style={{
                flex: 1, minWidth: 0, background: t.BG_RAISED, border: `1px solid ${t.BORDER}`, borderRadius: 10,
                padding: '10px 8px', textAlign: 'center',
              }}>
                <div style={{ fontSize: 10.5, color: t.TEXT_FAINT, fontWeight: 600, marginBottom: 4, whiteSpace: 'nowrap' }}>{s.label}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: t.TEXT, fontFamily: "'JetBrains Mono', 'SF Mono', monospace" }}>
                  {s.value != null ? `${s.value}` : '—'}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {sorted.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 12, color: t.TEXT_FAINT, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.02em', marginBottom: 10 }}>
            Эта неделя
          </div>
          {currentWeekEntries.length === 0 ? (
            <div style={{ fontSize: 13, color: t.TEXT_FAINT, marginBottom: 8 }}>Замеров на этой неделе пока нет.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {[...currentWeekEntries].reverse().map((m) => {
                const idx = sorted.findIndex((x) => x.id === m.id);
                const prev = sorted[idx - 1];
                return (
                  <WeightHistoryRow
                    key={m.id} m={m} prevWeight={prev ? prev.weight : null}
                    onDelete={() => handleDelete(m.id)}
                  />
                );
              })}
            </div>
          )}

          {pastWeeks.length > 0 && (
            <>
              <div style={{ fontSize: 12, color: t.TEXT_FAINT, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.02em', marginTop: 22, marginBottom: 10 }}>
                Прошлые недели
              </div>
              <div>
                {pastWeeks.map((w) => (
                  <WeekGroupRow key={w.weekStart} weekStart={w.weekStart} entries={w.entries} onDelete={handleDelete} />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
