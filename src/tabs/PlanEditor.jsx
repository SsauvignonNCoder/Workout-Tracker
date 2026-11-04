import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Plus, Minus, ChevronUp, ChevronDown, Check, Trash2,
} from 'lucide-react';
import { useTheme } from '../theme.js';
import { tr, exName, exKey } from '../i18n.js';
import { inputVal, store, unit } from '../units.js';
import {
  Field, getInputStyle, getLabelInputStyle, ExerciseNameInput, STARTER_EXERCISES,
} from './workoutTabHelpers.jsx';
import { clampSets, MAX_SETS } from '../guidedSteps.js';
import {
  WEEK_ORDER, MAX_WEEKS, emptyDay, dayOfType, cloneWeek, validatePlan,
  editExerciseInWeeks, removeExerciseFromWeeks, addExerciseToWeeks, strengthDayIndexes,
} from '../userPlans.js';

const WEEKDAY_LABELS = {
  mon: 'ПН', tue: 'ВТ', wed: 'СР', thu: 'ЧТ', fri: 'ПТ', sat: 'СБ', sun: 'ВС',
};
const DAY_TYPES = [
  { key: 'strength', label: 'Силовая' },
  { key: 'cardio', label: 'Кардио' },
  { key: 'pool', label: 'Бассейн' },
];

// Поле в единицах экрана: в черновике — метрика (как в данных), пересчёт — по выходу
// из поля, чтобы не сбивать набор.
function DistanceInput({ value, onChange, style }) {
  const [text, setText] = useState(() => (value ? inputVal('d', value) : ''));
  return (
    <input
      style={style}
      type="number" inputMode="decimal" min="0"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => onChange(text ? String(store('d', text)) : '')}
      placeholder="3"
    />
  );
}

function ChoiceChip({ on, onClick, children, t, style }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      style={{
        padding: '8px 10px', borderRadius: 10, fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
        background: on ? t.ACCENT_BG : t.BG_INPUT, color: on ? t.ACCENT_SOFT : t.TEXT_DIM,
        border: `1px solid ${on ? t.ACCENT : t.BORDER}`,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function iconButtonStyle(t, disabled) {
  return {
    width: 30, height: 30, flexShrink: 0, borderRadius: 8, border: `1px solid ${t.BORDER}`, background: t.BG_INPUT,
    color: disabled ? t.TEXT_FAINT : t.TEXT_DIM, opacity: disabled ? 0.45 : 1, cursor: disabled ? 'default' : 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0,
  };
}

// Шторка упражнения в плане. Новое по умолчанию идёт во все недели, правка — только в
// текущую: подходы по неделям обычно разные. Новое можно добавить сразу в несколько дней.
function PlanExerciseSheet({
  exercise, knownNames, showAllWeeks, weeks, weekIdx, weekdays, openedDay, onClose, onSubmit, onRemove,
}) {
  const t = useTheme();
  const isNew = !exercise;
  const [name, setName] = useState(() => (isNew ? '' : exName(exercise.name)));
  const [sets, setSets] = useState(() => String(isNew ? 3 : exercise.sets));
  const [reps, setReps] = useState(() => (isNew ? '' : exercise.reps || ''));
  const [allWeeks, setAllWeeks] = useState(isNew);
  const [picked, setPicked] = useState([openedDay]);
  const dayChoices = strengthDayIndexes(weeks, weekIdx, showAllWeeks && allWeeks);
  const chosenDays = picked.filter((i) => dayChoices.includes(i));
  const allDaysOn = dayChoices.length > 0 && dayChoices.every((i) => picked.includes(i));
  const toggleDay = (i) => {
    if (!picked.includes(i)) { setPicked([...picked, i]); return; }
    if (chosenDays.length > 1) setPicked(picked.filter((x) => x !== i));
  };
  const key = exKey(name.trim());
  const setsNum = clampSets(sets);
  const submit = () => {
    if (!key) return;
    onSubmit({ name: key, sets: setsNum, reps: reps.trim() }, showAllWeeks && allWeeks, chosenDays);
  };
  const stepper = (disabled) => ({
    flexShrink: 0, width: 42, borderRadius: 12, border: `1px solid ${t.BORDER}`, background: t.BG_INPUT,
    color: disabled ? t.TEXT_FAINT : t.TEXT_DIM, cursor: disabled ? 'default' : 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  });
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="dropdown-open"
        style={{
          width: '100%', maxWidth: 480, maxHeight: '86vh', overflowY: 'auto', WebkitOverflowScrolling: 'touch', boxSizing: 'border-box',
          background: t.BG_RAISED, border: `1px solid ${t.BORDER}`, borderTopLeftRadius: 22, borderTopRightRadius: 22,
          padding: '18px max(18px, env(safe-area-inset-right)) calc(22px + env(safe-area-inset-bottom)) max(18px, env(safe-area-inset-left))',
          boxShadow: '0 -12px 40px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: t.TEXT }}>{isNew ? tr('Новое упражнение') : tr('Упражнение')}</h3>
          <button onClick={onClose} aria-label={tr('Закрыть')} style={{ ...iconButtonStyle(t), width: 34, height: 34, borderRadius: 10 }}><X size={16} /></button>
        </div>

        <div style={{ marginBottom: 12 }}>
          <ExerciseNameInput value={name} onChange={setName} knownNames={knownNames} label={tr('Название')} placeholder={tr('Например, Бабочка')} />
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 14 }}>
          <Field label={tr('Подходы')}>
            <div style={{ display: 'flex', alignItems: 'stretch', gap: 6 }}>
              <button aria-label={tr('Меньше подходов')} disabled={setsNum <= 1} onClick={() => setSets(String(clampSets(setsNum - 1)))} style={stepper(setsNum <= 1)}><Minus size={16} /></button>
              <input
                style={{ ...getInputStyle(t), textAlign: 'center', padding: '11px 4px' }}
                type="number" inputMode="numeric" min="1" max={MAX_SETS}
                value={sets}
                onChange={(e) => setSets(e.target.value)}
                onBlur={() => setSets(String(setsNum))}
              />
              <button aria-label={tr('Больше подходов')} disabled={setsNum >= MAX_SETS} onClick={() => setSets(String(clampSets(setsNum + 1)))} style={stepper(setsNum >= MAX_SETS)}><Plus size={16} /></button>
            </div>
          </Field>
          <Field label={tr('Повторы')}>
            <input style={getLabelInputStyle(t)} value={reps} maxLength={20} onChange={(e) => setReps(e.target.value)} placeholder="10-12" />
          </Field>
        </div>

        {isNew && dayChoices.length > 1 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{
              fontSize: 11, color: t.TEXT_FAINT, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: t.FONT_MONO, marginBottom: 7,
            }}>
              {tr('В какие дни')}
            </div>
            <div style={{ display: 'flex', gap: 5 }}>
              <ChoiceChip t={t} on={allDaysOn} style={{ flexShrink: 0, whiteSpace: 'nowrap' }} onClick={() => setPicked(allDaysOn ? [dayChoices.includes(openedDay) ? openedDay : dayChoices[0]] : dayChoices)}>
                {allDaysOn && <Check size={13} />} {tr('Все дни')}
              </ChoiceChip>
              {dayChoices.map((i) => (
                <ChoiceChip key={i} t={t} on={picked.includes(i)} style={{ flex: '1 1 0', minWidth: 0, paddingLeft: 0, paddingRight: 0 }} onClick={() => toggleDay(i)}>
                  {tr(WEEKDAY_LABELS[weekdays[i]])}
                </ChoiceChip>
              ))}
            </div>
          </div>
        )}

        {showAllWeeks && (
          <div style={{ marginBottom: 14 }}>
            <ChoiceChip t={t} on={allWeeks} style={{ width: '100%', boxSizing: 'border-box' }} onClick={() => setAllWeeks(!allWeeks)}>
              {allWeeks && <Check size={13} />} {tr('Во все недели')}
            </ChoiceChip>
          </div>
        )}

        <button
          onClick={submit}
          disabled={!key}
          style={{
            width: '100%', padding: '14px', borderRadius: 14, border: 'none',
            background: key ? t.ACCENT_GRAD : t.BG_INPUT, color: key ? t.ON_ACCENT : t.TEXT_FAINT,
            fontSize: 15, fontWeight: 700, fontFamily: 'inherit', cursor: key ? 'pointer' : 'default',
          }}
        >
          {isNew ? tr('Добавить') : tr('Сохранить')}
        </button>

        {!isNew && (
          <button
            onClick={() => onRemove(showAllWeeks && allWeeks)}
            style={{
              width: '100%', marginTop: 9, padding: '12px', borderRadius: 14, border: `1px solid ${t.BORDER}`, background: 'transparent',
              color: t.TEXT_DIM, fontSize: 14, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            }}
          >
            <Trash2 size={15} /> {showAllWeeks && allWeeks ? tr('Убрать из всех недель') : tr('Убрать из дня')}
          </button>
        )}
      </div>
    </div>
  );
}

// Редактор своего плана. initial — { id?, title, weekdays, weeks }, onSave(результат
// validatePlan) записывает план; ошибку показывает здесь же.
export function PlanEditor({ initial, sessions, heading, onSave, onClose }) {
  const t = useTheme();
  const [title, setTitle] = useState(initial.title || '');
  const [weekdays, setWeekdays] = useState(initial.weekdays);
  const [weeks, setWeeks] = useState(() => initial.weeks.map(cloneWeek));
  const [weekIdx, setWeekIdx] = useState(0);
  const [sheet, setSheet] = useState(null); // { dayIdx, exIdx } — exIdx null: добавление
  const [armed, setArmed] = useState(null); // 'close' | 'week' | код дня недели — ждём второго нажатия
  const [errors, setErrors] = useState([]);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const week = weeks[Math.min(weekIdx, weeks.length - 1)];

  const knownNames = useMemo(() => {
    const counts = {};
    (sessions || []).forEach((s) => (s.exercises || []).forEach((ex) => { counts[ex.name] = (counts[ex.name] || 0) + 1; }));
    const used = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
    const seen = new Set(used.map((n) => n.toLowerCase()));
    return [...used, ...STARTER_EXERCISES.filter((n) => !seen.has(n.toLowerCase()))];
  }, [sessions]);

  const change = (fn) => { setWeeks(fn); setDirty(true); setArmed(null); setErrors([]); };
  const patchDay = (dayIdx, fn) => change((all) => all.map((w, wi) => (wi !== weekIdx ? w
    : { ...w, days: w.days.map((d, di) => (di === dayIdx ? fn(d) : d)) })));
  const patchWeek = (patch) => change((all) => all.map((w, wi) => (wi === weekIdx ? { ...w, ...patch } : w)));

  const toggleWeekday = (code) => {
    const idx = weekdays.indexOf(code);
    if (idx < 0) {
      const next = WEEK_ORDER.filter((c) => c === code || weekdays.includes(c));
      const at = next.indexOf(code);
      setWeekdays(next);
      change((all) => all.map((w) => {
        const days = w.days.slice();
        days.splice(at, 0, emptyDay());
        return { ...w, days };
      }));
      return;
    }
    if (weekdays.length === 1) return;
    const hasContent = weeks.some((w) => (w.days[idx].exercises || []).length > 0 || w.days[idx].type !== 'strength');
    if (hasContent && armed !== code) { setArmed(code); return; }
    setWeekdays(weekdays.filter((c) => c !== code));
    change((all) => all.map((w) => ({ ...w, days: w.days.filter((_, i) => i !== idx) })));
  };

  const addWeek = () => {
    if (weeks.length >= MAX_WEEKS) return;
    change((all) => [...all, cloneWeek(all[all.length - 1])]);
    setWeekIdx(weeks.length);
  };
  const removeWeek = () => {
    if (weeks.length <= 1) return;
    if (armed !== 'week') { setArmed('week'); return; }
    change((all) => all.filter((_, i) => i !== weekIdx));
    setWeekIdx(Math.max(0, weekIdx - 1));
  };

  const addExercise = (vals, allWeeks, dayIdxs) => {
    const item = { name: vals.name, sets: vals.sets, reps: vals.reps };
    change((all) => addExerciseToWeeks(all, {
      weekIdx, openedDay: sheet.dayIdx, dayIdxs, item, allWeeks,
    }));
    setSheet(null);
  };
  const editExercise = (vals, allWeeks) => {
    change((all) => editExerciseInWeeks(all, { weekIdx, dayIdx: sheet.dayIdx, exIdx: sheet.exIdx, vals, allWeeks }));
    setSheet(null);
  };
  const removeExercise = (allWeeks) => {
    change((all) => removeExerciseFromWeeks(all, { weekIdx, dayIdx: sheet.dayIdx, exIdx: sheet.exIdx, allWeeks }));
    setSheet(null);
  };
  const moveExercise = (dayIdx, exIdx, delta) => patchDay(dayIdx, (d) => {
    const list = d.exercises.slice();
    const to = exIdx + delta;
    if (to < 0 || to >= list.length) return d;
    [list[exIdx], list[to]] = [list[to], list[exIdx]];
    return { ...d, exercises: list };
  });

  const save = async () => {
    const res = validatePlan({ title, weekdays, weeks });
    if (!res.ok) { setErrors(res.errors); return; }
    setSaving(true);
    setErrors([]);
    try {
      await onSave(res);
    } catch (e) {
      setSaving(false);
      setErrors([tr('Не удалось сохранить план — проверь связь и нажми ещё раз')]);
    }
  };

  const tryClose = () => {
    if (dirty && armed !== 'close') { setArmed('close'); return; }
    onClose();
  };

  const smallLabel = {
    fontSize: 11, color: t.TEXT_FAINT, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: t.FONT_MONO,
  };
  const sheetDay = sheet ? week.days[sheet.dayIdx] : null;
  const sheetEx = sheet && sheet.exIdx != null && sheetDay ? sheetDay.exercises[sheet.exIdx] : null;

  return createPortal(
    <div
      role="dialog"
      aria-label={heading}
      style={{
        position: 'fixed', inset: 0, zIndex: 1100, background: t.BG, color: t.TEXT, fontFamily: t.FONT,
        display: 'flex', flexDirection: 'column',
      }}
    >
      <div style={{
        flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, borderBottom: `1px solid ${t.BORDER}`,
        padding: 'max(12px, env(safe-area-inset-top)) max(14px, env(safe-area-inset-right)) 12px max(14px, env(safe-area-inset-left))',
      }}>
        <button onClick={tryClose} aria-label={tr('Закрыть')} style={{ ...iconButtonStyle(t), width: 36, height: 36, borderRadius: 10 }}>
          <X size={17} />
        </button>
        <div style={{ flex: 1, minWidth: 0, fontSize: 16.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{heading}</div>
        <button
          onClick={save}
          disabled={saving}
          style={{
            flexShrink: 0, padding: '10px 16px', borderRadius: 11, border: 'none', background: t.ACCENT_GRAD, color: t.ON_ACCENT,
            fontSize: 14, fontWeight: 700, fontFamily: 'inherit', cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? tr('Сохраняю…') : tr('Сохранить')}
        </button>
      </div>

      {armed === 'close' && (
        <div style={{ flexShrink: 0, padding: '9px 16px', fontSize: 12.5, color: t.ACCENT_SOFT, background: t.ACCENT_BG, borderBottom: `1px solid ${t.ACCENT_BORDER}` }}>
          {tr('Изменения не сохранены. Нажми крестик ещё раз, чтобы выйти без них.')}
        </div>
      )}

      <div style={{
        flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', boxSizing: 'border-box',
        padding: '16px max(16px, env(safe-area-inset-right)) calc(28px + env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left))',
      }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          {errors.length > 0 && (
            <div role="alert" style={{
              marginBottom: 14, padding: '10px 12px', borderRadius: 10, fontSize: 13, lineHeight: 1.45,
              color: t.DANGER, background: t.DANGER_BG, border: `1px solid ${t.DANGER_BORDER}`,
            }}>
              {errors.slice(0, 5).map((e) => <div key={e}>{e}</div>)}
              {errors.length > 5 && <div>{tr('и ещё {0}', errors.length - 5)}</div>}
            </div>
          )}

          <Field label={tr('Название плана')}>
            <input
              style={getLabelInputStyle(t)}
              value={title}
              maxLength={60}
              onChange={(e) => { setTitle(e.target.value); setDirty(true); setArmed(null); setErrors([]); }}
              placeholder={tr('Например, Сила на 3 дня')}
            />
          </Field>

          <div style={{ ...smallLabel, margin: '16px 0 8px' }}>{tr('Дни тренировок')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 5 }}>
            {WEEK_ORDER.map((code) => (
              <ChoiceChip key={code} t={t} on={weekdays.includes(code)} onClick={() => toggleWeekday(code)}>
                {tr(WEEKDAY_LABELS[code])}
              </ChoiceChip>
            ))}
          </div>
          {armed && WEEKDAY_LABELS[armed] && (
            <div style={{ marginTop: 7, fontSize: 12.5, color: t.ACCENT_SOFT, lineHeight: 1.4 }}>
              {tr('В {0} есть упражнения, они пропадут во всех неделях. Нажми день ещё раз, чтобы убрать.', tr(WEEKDAY_LABELS[armed]))}
            </div>
          )}

          <div style={{ ...smallLabel, margin: '18px 0 8px' }}>{tr('Недели')}</div>
          {/* Вкладки делят ряд поровну; добавление и удаление — в том же ряду, справа. */}
          <div style={{ display: 'flex', gap: 5, alignItems: 'stretch' }}>
            {weeks.map((w, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <button
                key={i}
                onClick={() => { setWeekIdx(i); setArmed(null); }}
                aria-pressed={i === weekIdx}
                style={{
                  flex: '1 1 0', minWidth: 0, padding: '9px 0', borderRadius: 10, fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
                  background: i === weekIdx ? t.ACCENT_BG : t.BG_INPUT, color: i === weekIdx ? t.ACCENT_SOFT : t.TEXT_DIM,
                  border: `1px solid ${i === weekIdx ? t.ACCENT : t.BORDER}`,
                }}
              >
                {tr('Н{0}', i + 1)}
              </button>
            ))}
            {weeks.length < MAX_WEEKS && (
              <button onClick={addWeek} aria-label={tr('Добавить неделю')} style={{ ...iconButtonStyle(t), width: 38, height: 'auto', borderRadius: 10, color: t.ACCENT_SOFT, borderColor: t.ACCENT_BORDER }}>
                <Plus size={16} />
              </button>
            )}
            {weeks.length > 1 && (
              <button
                onClick={removeWeek}
                aria-label={tr('Удалить неделю {0}', weekIdx + 1)}
                style={{
                  ...iconButtonStyle(t), width: 38, height: 'auto', borderRadius: 10,
                  ...(armed === 'week' ? { color: t.DANGER, background: t.DANGER_BG, borderColor: t.DANGER_BORDER } : {}),
                }}
              >
                <Trash2 size={15} />
              </button>
            )}
          </div>
          <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.4, color: armed === 'week' ? t.DANGER : t.TEXT_FAINT }}>
            {armed === 'week'
              ? tr('Нажми ещё раз, чтобы удалить неделю {0}', weekIdx + 1)
              : tr('Новая неделя — копия последней. После последней план начинается заново.')}
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 12 }}>
            <Field label={tr('Название недели')}>
              <input
                style={getLabelInputStyle(t)}
                value={week.label || ''}
                maxLength={30}
                onChange={(e) => patchWeek({ label: e.target.value })}
                placeholder={tr('Необязательно')}
              />
            </Field>
            <Field label={tr('% от рекорда')}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <input
                  style={{ ...getInputStyle(t), textAlign: 'center', padding: '11px 4px' }}
                  type="number" inputMode="numeric" min="10" max="200"
                  aria-label={tr('от')}
                  value={(week.load && week.load[0]) ?? ''}
                  onChange={(e) => patchWeek({ load: e.target.value === '' ? null : [e.target.value, week.load ? week.load[1] : null] })}
                  placeholder="75"
                />
                <span style={{ color: t.TEXT_FAINT }}>–</span>
                <input
                  style={{ ...getInputStyle(t), textAlign: 'center', padding: '11px 4px' }}
                  type="number" inputMode="numeric" min="10" max="200"
                  aria-label={tr('до')}
                  value={(week.load && week.load[1]) ?? ''}
                  onChange={(e) => patchWeek({ load: week.load ? [week.load[0], e.target.value] : null })}
                  placeholder="80"
                />
              </div>
            </Field>
          </div>
          <div style={{ marginTop: 6, fontSize: 12, color: t.TEXT_FAINT, lineHeight: 1.4 }}>
            {tr('Процент — для подсказки веса. Без него в поле веса будет вес с прошлого раза.')}
          </div>

          {week.days.map((day, dayIdx) => (
            // eslint-disable-next-line react/no-array-index-key
            <div key={`${weekIdx}-${dayIdx}`} style={{ marginTop: 16, padding: 13, background: t.BG_RAISED, border: `1px solid ${t.BORDER}`, borderRadius: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
                <span style={{
                  flexShrink: 0, padding: '4px 8px', borderRadius: 7, fontSize: 12, fontWeight: 700, fontFamily: t.FONT_MONO,
                  color: t.ACCENT_SOFT, background: t.ACCENT_BG,
                }}>
                  {tr(WEEKDAY_LABELS[weekdays[dayIdx]])}
                </span>
                <input
                  style={{ ...getLabelInputStyle(t), flex: 1, minWidth: 0 }}
                  aria-label={tr('Название дня')}
                  value={day.title || ''}
                  maxLength={60}
                  onChange={(e) => patchDay(dayIdx, (d) => ({ ...d, title: e.target.value }))}
                  placeholder={tr('Название дня')}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6, marginBottom: 11 }}>
                {DAY_TYPES.map((dt) => (
                  <ChoiceChip key={dt.key} t={t} on={day.type === dt.key} onClick={() => { if (day.type !== dt.key) patchDay(dayIdx, (d) => dayOfType(d, dt.key)); }}>
                    {tr(dt.label)}
                  </ChoiceChip>
                ))}
              </div>

              {day.type === 'strength' && (
                <>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 11 }}>
                    <ChoiceChip t={t} on={day.warmupRun !== false} style={{ flex: '1 1 auto' }} onClick={() => patchDay(dayIdx, (d) => ({ ...d, warmupRun: d.warmupRun === false }))}>
                      {day.warmupRun !== false && <Check size={13} />} {tr('Разминка на дорожке')}
                    </ChoiceChip>
                    <ChoiceChip t={t} on={day.finisherRun !== false} style={{ flex: '1 1 auto' }} onClick={() => patchDay(dayIdx, (d) => ({ ...d, finisherRun: d.finisherRun === false }))}>
                      {day.finisherRun !== false && <Check size={13} />} {tr('Финиш на дорожке')}
                    </ChoiceChip>
                  </div>

                  {(day.exercises || []).map((ex, exIdx) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <div key={exIdx} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 0', borderTop: `1px solid ${t.BORDER}` }}>
                      <button
                        onClick={() => setSheet({ dayIdx, exIdx })}
                        style={{
                          flex: 1, minWidth: 0, background: 'transparent', border: 'none', padding: 0, textAlign: 'left',
                          color: t.TEXT, fontFamily: 'inherit', cursor: 'pointer',
                        }}
                      >
                        <span style={{ display: 'block', fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{exName(ex.name)}</span>
                        <span style={{ display: 'block', marginTop: 1, fontSize: 12.5, color: t.TEXT_DIM, fontFamily: t.FONT_MONO }}>
                          {ex.sets}{ex.reps ? `×${ex.reps}` : ` ${tr('подх.')}`}
                        </span>
                      </button>
                      <button aria-label={tr('Выше')} disabled={exIdx === 0} onClick={() => moveExercise(dayIdx, exIdx, -1)} style={iconButtonStyle(t, exIdx === 0)}><ChevronUp size={15} /></button>
                      <button aria-label={tr('Ниже')} disabled={exIdx === day.exercises.length - 1} onClick={() => moveExercise(dayIdx, exIdx, 1)} style={iconButtonStyle(t, exIdx === day.exercises.length - 1)}><ChevronDown size={15} /></button>
                    </div>
                  ))}

                  <button
                    onClick={() => setSheet({ dayIdx, exIdx: null })}
                    style={{
                      width: '100%', marginTop: 8, padding: '10px', borderRadius: 10, border: `1px dashed ${t.ACCENT_BORDER}`, background: 'transparent',
                      color: t.ACCENT_SOFT, fontSize: 13.5, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    }}
                  >
                    <Plus size={15} /> {tr('Упражнение')}
                  </button>
                </>
              )}

              {day.type === 'cardio' && (
                <div style={{ display: 'flex', gap: 10 }}>
                  <Field label={tr('Дистанция, {0}', unit('d'))}>
                    <DistanceInput style={getInputStyle(t)} value={day.distance} onChange={(v) => patchDay(dayIdx, (d) => ({ ...d, distance: v }))} />
                  </Field>
                  <Field label={tr('Наклон, %')}>
                    <input
                      style={getInputStyle(t)} type="number" inputMode="decimal" min="0"
                      value={day.incline || ''}
                      onChange={(e) => patchDay(dayIdx, (d) => ({ ...d, incline: e.target.value }))}
                      placeholder="10"
                    />
                  </Field>
                </div>
              )}

              {day.type === 'pool' && (
                <Field label={tr('Минуты')}>
                  <input
                    style={getInputStyle(t)} type="number" inputMode="numeric" min="1"
                    value={day.duration || ''}
                    onChange={(e) => patchDay(dayIdx, (d) => ({ ...d, duration: e.target.value }))}
                    placeholder="60"
                  />
                </Field>
              )}
            </div>
          ))}
        </div>
      </div>

      {sheet && (
        <PlanExerciseSheet
          key={`${sheet.dayIdx}-${sheet.exIdx}`}
          exercise={sheetEx}
          knownNames={knownNames}
          showAllWeeks={weeks.length > 1}
          weeks={weeks}
          weekIdx={weekIdx}
          weekdays={weekdays}
          openedDay={sheet.dayIdx}
          onClose={() => setSheet(null)}
          onSubmit={sheetEx ? editExercise : addExercise}
          onRemove={removeExercise}
        />
      )}
    </div>,
    document.body,
  );
}
