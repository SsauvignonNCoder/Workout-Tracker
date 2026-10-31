import React, { useState, useMemo } from 'react';
import { X } from 'lucide-react';
import { useTheme, glassCard } from '../theme.js';
import { todayISO, fmtDateShort } from '../dateUtils.js';
import { Field, getInputStyle, DatePicker } from './workoutTabHelpers.jsx';
import {
  BODY_PARAMS, bodyLogOf, bodyLatest, bodyDelta, upsertBodyEntry, removeBodyEntry, withBodyLog,
} from '../bodyLog.js';
import { tr } from '../i18n.js';
import { num, unit, store } from '../units.js';

// Обхваты и рост — длина (см ↔ in), жир — проценты без пересчёта.
const isLen = (p) => p.unit === 'см';
const shown = (p, v) => (isLen(p) ? num('l', v) : v);
const unitOf = (p) => (isLen(p) ? unit('l') : tr(p.unit));

const MONO = "'JetBrains Mono', 'SF Mono', monospace";

// Цвет изменения: в сторону цели (талия и жир вниз, грудь и плечи вверх) —
// зелёный, против — латунный, у роста — нейтральный.
function deltaColor(t, param, d) {
  if (!d || !param.better) return t.TEXT_FAINT;
  const good = param.better === 'down' ? d < 0 : d > 0;
  return good ? t.POSITIVE : t.ACCENT_SOFT;
}

function fmtDelta(d) {
  if (d == null || d === 0) return null;
  return `${d > 0 ? '+' : '−'}${Math.abs(d)}`;
}

// Параметры тела во вкладке «Вес»: последние значения, новый замер и история.
// Раньше параметры жили в «Профиле» одной строкой и перезаписывались.
export function BodyParamsSection({ profile, saveProfile }) {
  const t = useTheme();
  const today = todayISO();
  const log = useMemo(() => bodyLogOf(profile, today), [profile, today]);
  const latest = useMemo(() => bodyLatest(log), [log]);
  const lastDate = log.length ? log[log.length - 1].date : null;

  const [date, setDate] = useState(today);
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [formError, setFormError] = useState('');
  // Удаление записи — в два тапа: первый показывает «Удалить?».
  const [armedId, setArmedId] = useState(null);

  const sectionLabel = {
    fontSize: 12, color: t.TEXT_FAINT, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.02em',
  };

  const persist = async (nextLog) => {
    // Патч: история и посчитанные из неё последние значения (src/bodyLog.js).
    await saveProfile(withBodyLog({}, nextLog));
  };

  const handleSave = async () => {
    // Введено в единицах экрана → в данные см (src/units.js).
    const metricDraft = Object.fromEntries(Object.entries(draft).map(([k, v]) => {
      const p = BODY_PARAMS.find((x) => x.key === k);
      return [k, p && isLen(p) && String(v).trim() !== '' ? String(store('l', v)) : v];
    }));
    const nextLog = upsertBodyEntry(log, date, metricDraft);
    if (!nextLog) { setFormError(tr("Заполни хотя бы один параметр")); return; }
    setFormError('');
    setSaving(true);
    try {
      await persist(nextLog);
    } catch (e) {
      // Сообщение уже показал saveProfile; введённое остаётся в полях.
      setSaving(false);
      return;
    }
    setSaving(false);
    setDraft({});
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2200);
  };

  const handleDelete = async (id) => {
    if (armedId !== id) { setArmedId(id); return; }
    setArmedId(null);
    try { await persist(removeBodyEntry(log, id)); } catch (e) { /* сообщение уже показано */ }
  };

  const sameDateEntry = log.find((e) => e.date === date);

  return (
    <div>
      {/* Последние значения: по плитке на параметр, под числом — изменение к
          прошлому замеру этого параметра. */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={sectionLabel}>{tr("Сейчас")}</div>
        {lastDate && <div style={{ fontSize: 11.5, color: t.TEXT_FAINT }}>{tr("последний замер")} {fmtDateShort(lastDate)}</div>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginBottom: 24 }}>
        {BODY_PARAMS.map((p) => {
          const cur = latest[p.key];
          const d = cur && cur.prev != null ? Number(isLen(p) ? num('l', cur.value - cur.prev, 1) : Math.round((cur.value - cur.prev) * 10) / 10) : null;
          return (
            <div key={p.key} style={{
              ...glassCard({ shadow: false }), borderRadius: 12, padding: '10px 10px 9px',
              minWidth: 0,
            }}>
              <div style={{ fontSize: 10.5, color: t.TEXT_FAINT, fontWeight: 600, marginBottom: 4, whiteSpace: 'nowrap' }}>
                {tr(p.label)}, {unitOf(p)}
              </div>
              <div style={{ fontSize: 17, fontWeight: 700, color: cur ? t.TEXT : t.TEXT_FAINT, fontFamily: MONO }}>
                {cur ? shown(p, cur.value) : '—'}
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, fontFamily: MONO, color: deltaColor(t, p, d), minHeight: 15, marginTop: 2 }}>
                {fmtDelta(d) || ''}
              </div>
            </div>
          );
        })}
      </div>

      {/* Новый замер. Подсказки в полях — последние значения: видно, с чем сравнивать. */}
      <div style={{ ...sectionLabel, marginBottom: 12 }}>{tr("Новый замер")}</div>
      <div style={{ marginBottom: 14, minWidth: 0, width: '100%' }}>
        <Field label={tr("Дата замера")}>
          <DatePicker value={date} onChange={setDate} />
        </Field>
      </div>
      {[0, 2, 4].map((from) => (
        <div key={from} style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
          {BODY_PARAMS.slice(from, from + 2).map((p) => (
            <Field key={p.key} label={`${tr(p.label)}, ${unitOf(p)}`}>
              <input
                style={getInputStyle(t)}
                type="text" inputMode="decimal"
                value={draft[p.key] || ''}
                onChange={(e) => { setDraft((prev) => ({ ...prev, [p.key]: e.target.value })); setFormError(''); }}
                placeholder={latest[p.key] ? String(shown(p, latest[p.key].value)) : '—'}
              />
            </Field>
          ))}
        </div>
      ))}
      {sameDateEntry && (
        <div style={{ fontSize: 12, color: t.TEXT_FAINT, margin: '2px 0 10px', lineHeight: 1.45 }}>
          {tr("За")} {fmtDateShort(date)} {tr("замер уже есть — заполненные поля обновятся, остальные останутся.")}
        </div>
      )}
      {formError && (
        <div style={{ fontSize: 12.5, color: t.ACCENT_SOFT, fontWeight: 600, margin: '2px 0 10px' }}>{formError}</div>
      )}
      <button
        onClick={handleSave}
        disabled={saving}
        className={justSaved ? 'save-bounce' : ''}
        style={{
          width: '100%', padding: '15px', borderRadius: 16, border: 'none', marginTop: 4,
          background: justSaved ? t.POSITIVE : t.ACCENT_GRAD, color: t.ON_ACCENT,
          fontSize: 15.5, fontWeight: 700, cursor: saving ? 'default' : 'pointer',
          opacity: saving ? 0.7 : 1, fontFamily: 'inherit',
          boxShadow: justSaved ? 'none' : t.GLOW,
          transition: 'background 0.2s ease, box-shadow 0.2s ease',
        }}
      >
        {justSaved ? tr("Сохранено ✓") : saving ? tr("Сохраняю...") : tr("Сохранить замер")}
      </button>

      {/* История: новые сверху, у каждого значения — изменение к прошлому замеру. */}
      {log.length > 0 && (
        <div style={{ marginTop: 26 }}>
          <div style={{ ...sectionLabel, marginBottom: 10 }}>{tr("История замеров")}</div>
          {[...log].reverse().map((e) => (
            <div key={e.id} style={{ padding: '11px 2px', borderBottom: `1px solid ${t.BORDER}` }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 7 }}>
                <span style={{ fontSize: 13.5, color: t.TEXT_DIM }}>{fmtDateShort(e.date)}</span>
                <button
                  onClick={() => handleDelete(e.id)}
                  aria-label={armedId === e.id ? tr("Подтвердить удаление замера") : tr("Удалить замер")}
                  style={{
                    background: armedId === e.id ? t.DANGER_BG : 'transparent',
                    border: armedId === e.id ? `1px solid ${t.DANGER_BORDER}` : 'none',
                    color: armedId === e.id ? t.DANGER : t.TEXT_FAINT, borderRadius: 8,
                    cursor: 'pointer', padding: armedId === e.id ? '3px 9px' : 2, display: 'flex', alignItems: 'center',
                    fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
                  }}
                >
                  {armedId === e.id ? tr("Удалить?") : <X size={14} />}
                </button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {BODY_PARAMS.filter((p) => e[p.key] != null).map((p) => {
                  const raw = bodyDelta(log, e.id, p.key);
                  const d = raw == null ? raw : Number(isLen(p) ? num('l', raw, 1) : raw);
                  return (
                    <span key={p.key} style={{
                      display: 'inline-flex', alignItems: 'baseline', gap: 5, padding: '4px 8px', borderRadius: 8,
                      background: t.BG_RAISED, border: `1px solid ${t.BORDER}`, fontSize: 12,
                    }}>
                      <span style={{ color: t.TEXT_FAINT, fontWeight: 600 }}>{tr(p.label)}</span>
                      <span style={{ color: t.TEXT, fontWeight: 700, fontFamily: MONO }}>{shown(p, e[p.key])}</span>
                      {fmtDelta(d) && (
                        <span style={{ color: deltaColor(t, p, d), fontWeight: 700, fontFamily: MONO, fontSize: 11 }}>{fmtDelta(d)}</span>
                      )}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
