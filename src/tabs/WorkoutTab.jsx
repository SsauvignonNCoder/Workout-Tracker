import React, { useState, useEffect, useMemo } from 'react';
import { Plus, X, Dumbbell, Pencil } from 'lucide-react';
import { useTheme } from '../theme.js';
import { todayISO } from '../dateUtils.js';
import { computeRecords } from '../gamification.js';
import {
  Field, getInputStyle, getLabelInputStyle, DatePicker, ExerciseRow, CardioRow,
  emptyExercise, emptyCardio, RepeatWorkoutPicker, ProgramDayPicker, WarmupTip,
  STARTER_EXERCISES, STARTER_CARDIO, PROGRAM_DAYS,
} from './workoutTabHelpers.jsx';

export function WorkoutTab({ sessions, saveSessions, setError, profile, saveProfile, editSession, onEditDone }) {
  const t = useTheme();
  const [date, setDate] = useState(todayISO());
  const [exercises, setExercises] = useState([]);
  const [cardio, setCardio] = useState([]);
  const [sleep, setSleep] = useState('');
  const [energy, setEnergy] = useState(3);
  const [feeling, setFeeling] = useState('');
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [programDay, setProgramDay] = useState(null);
  const [programDetached, setProgramDetached] = useState(false);
  const [showProgramPicker, setShowProgramPicker] = useState(false);
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    if (editSession) {
      setEditingId(editSession.id);
      setDate(editSession.date);
      const exList = (editSession.exercises || []).map((e) => ({
        name: e.name, weight: String(e.weight || ''), reps: String(e.reps || ''), sets: String(e.sets || ''),
      }));
      setExercises(exList);
      const cardioList = (editSession.cardio || []).map((c) => ({
        name: c.name, distance: String(c.distance || ''), speed: String(c.speed || ''),
        incline: String(c.incline || ''), duration: String(c.duration || ''),
      }));
      setCardio(cardioList);
      setSleep(editSession.sleep != null ? String(editSession.sleep) : '');
      setEnergy(editSession.energy || 3);
      setFeeling(editSession.feeling || '');
      setProgramDay(editSession.programDay || null);
    }
  }, [editSession]);

  useEffect(() => {
    if (editingId) return;
    if (programDetached) return;
    if (profile && programDay === null) {
      const last = profile.lastProgramDay;
      if (last) {
        setProgramDay(last >= 20 ? 1 : last + 1);
      }
    }
  }, [profile, programDay, editingId, programDetached]);

  const [justAppliedProgram, setJustAppliedProgram] = useState(false);

  const applyProgramDay = (dayNum) => {
    const dayPlan = PROGRAM_DAYS.find((d) => d.day === dayNum);
    if (!dayPlan) return;
    setProgramDay(dayNum);
    setProgramDetached(false);

    if (dayPlan.type === 'strength') {
      setExercises(dayPlan.exercises.map((e) => ({
        name: e.name, weight: '', reps: '', sets: String(e.sets), targetReps: e.reps,
      })));
      setCardio([{
        name: 'Беговая дорожка', distance: '', speed: '', incline: '',
        duration: '', targetIncline: '15', targetDuration: '15-20',
      }]);
    } else if (dayPlan.type === 'cardio') {
      setExercises([]);
      setCardio([{
        name: dayPlan.cardio.name, distance: '', speed: '', incline: '', duration: '',
        targetIncline: dayPlan.cardio.incline, targetDistance: dayPlan.cardio.distance,
      }]);
    } else if (dayPlan.type === 'pool') {
      setExercises([]);
      setCardio([{
        name: dayPlan.cardio.name, distance: '', speed: '', incline: '',
        duration: '', targetDuration: dayPlan.cardio.duration,
      }]);
    }

    setShowProgramPicker(false);
    setJustAppliedProgram(true);
    setTimeout(() => setJustAppliedProgram(false), 1500);
  };

  const knownNames = useMemo(() => {
    const counts = {};
    (sessions || []).forEach((s) => {
      s.exercises.forEach((ex) => {
        counts[ex.name] = (counts[ex.name] || 0) + 1;
      });
    });
    const used = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
    const usedLower = new Set(used.map((n) => n.toLowerCase()));
    const starters = STARTER_EXERCISES.filter((n) => !usedLower.has(n.toLowerCase()));
    return [...used, ...starters];
  }, [sessions]);

  const knownCardioNames = useMemo(() => {
    const counts = {};
    (sessions || []).forEach((s) => {
      (s.cardio || []).forEach((c) => {
        counts[c.name] = (counts[c.name] || 0) + 1;
      });
    });
    const used = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
    const usedLower = new Set(used.map((n) => n.toLowerCase()));
    const starters = STARTER_CARDIO.filter((n) => !usedLower.has(n.toLowerCase()));
    return [...used, ...starters];
  }, [sessions]);

  const handlePickWorkout = (s) => {
    const pickedExercises = (s.exercises || []).map((e) => ({
      name: e.name, weight: String(e.weight || ''), reps: String(e.reps || ''), sets: String(e.sets || ''),
    }));
    const pickedCardio = (s.cardio || []).map((c) => ({
      name: c.name, distance: String(c.distance || ''), speed: String(c.speed || ''),
      incline: String(c.incline || ''), duration: String(c.duration || ''),
    }));
    setExercises(pickedExercises.length > 0 ? pickedExercises : [emptyExercise()]);
    setCardio(pickedCardio);
  };

  const records = useMemo(() => computeRecords(sessions), [sessions]);

  const updateExercise = (i, val) => {
    const next = [...exercises];
    next[i] = val;
    setExercises(next);
  };

  const removeExercise = (i) => {
    setExercises(exercises.filter((_, idx) => idx !== i));
  };

  const updateCardio = (i, val) => {
    const next = [...cardio];
    next[i] = val;
    setCardio(next);
  };

  const removeCardio = (i) => {
    setCardio(cardio.filter((_, idx) => idx !== i));
  };

  const handleSave = async () => {
    const validExercises = exercises
      .filter((e) => e.name.trim())
      .map((e) => ({
        name: e.name.trim(),
        weight: Math.max(0, parseFloat(e.weight) || 0),
        reps: Math.max(0, parseInt(e.reps) || 0),
        sets: Math.max(1, parseInt(e.sets) || 1),
      }));
    const validCardio = cardio
      .filter((c) => c.name.trim())
      .map((c) => ({
        name: c.name.trim(),
        distance: Math.max(0, parseFloat(c.distance) || 0),
        speed: Math.max(0, parseFloat(c.speed) || 0),
        incline: Math.max(0, parseFloat(c.incline) || 0),
        duration: Math.max(0, parseInt(c.duration) || 0),
      }));
    if (validExercises.length === 0 && validCardio.length === 0) {
      setError('Добавь хотя бы одно упражнение или кардио');
      return;
    }
    setSaving(true);

    if (editingId) {
      const next = (sessions || [])
        .map((s) => s.id === editingId
          ? {
              ...s, date, exercises: validExercises, cardio: validCardio,
              sleep: sleep ? Math.max(0, parseFloat(sleep)) : null,
              energy, feeling: feeling.trim(), programDay: programDay || null,
            }
          : s)
        .sort((a, b) => a.date.localeCompare(b.date));
      await saveSessions(next);
      setSaving(false);
      setJustSaved(true);
      setTimeout(() => {
        setJustSaved(false);
        if (onEditDone) onEditDone();
      }, 900);
      return;
    }

    const entry = {
      id: `${date}-${Date.now()}`,
      date,
      exercises: validExercises,
      cardio: validCardio,
      sleep: sleep ? Math.max(0, parseFloat(sleep)) : null,
      energy,
      feeling: feeling.trim(),
      programDay: programDay || null,
    };
    const next = [...(sessions || []), entry].sort((a, b) => a.date.localeCompare(b.date));
    await saveSessions(next);
    if (programDay) {
      await saveProfile({ ...(profile || {}), lastProgramDay: programDay });
    }
    setSaving(false);
    setExercises([]);
    setCardio([]);
    setSleep('');
    setEnergy(3);
    setFeeling('');
    setProgramDay(null);
    setProgramDetached(false);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2200);
  };

  const handleCancelEdit = () => {
    if (onEditDone) onEditDone();
  };

  return (
    <div>
      <div style={{ marginBottom: 18, minWidth: 0, width: '100%' }}>
        <Field label="Дата тренировки">
          <DatePicker value={date} onChange={setDate} />
        </Field>
      </div>

      <RepeatWorkoutPicker sessions={sessions} onPick={handlePickWorkout} />

      {programDay ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 14 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <ProgramDayPicker value={programDay} onChange={applyProgramDay} />
          </div>
          <button
            onClick={() => {
              setProgramDay(null);
              setProgramDetached(true);
              setExercises([]);
              setCardio([]);
            }}
            aria-label="Отвязать от программы"
            style={{
              flexShrink: 0, width: 44, height: 44, borderRadius: 10, border: `1px solid ${t.BORDER}`,
              background: t.BG_INPUT, color: t.TEXT_FAINT, cursor: 'pointer', marginTop: 0,
            }}
          >
            <X size={16} />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowProgramPicker(!showProgramPicker)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%',
            background: 'transparent', border: `1px dashed ${t.BORDER}`, borderRadius: 9,
            padding: '10px 14px', color: t.TEXT_DIM, fontSize: 13.5, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit', marginBottom: 14, boxSizing: 'border-box',
          }}
        >
          <Dumbbell size={14} /> Выбор тренировки
        </button>
      )}
      {showProgramPicker && !programDay && (
        <div style={{ marginBottom: 14 }}>
          <ProgramDayPicker value={1} onChange={applyProgramDay} />
        </div>
      )}

      {programDay && (() => {
        const dayPlan = PROGRAM_DAYS.find((d) => d.day === programDay);
        return dayPlan && dayPlan.type === 'strength' ? <WarmupTip title={dayPlan.title} /> : null;
      })()}

      <div style={{ marginBottom: 8, fontSize: 12, color: t.TEXT_FAINT, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.02em' }}>
        Упражнения
      </div>
      {exercises.map((ex, i) => (
        <ExerciseRow
          key={i}
          ex={ex}
          onChange={(val) => updateExercise(i, val)}
          onRemove={() => removeExercise(i)}
          removable={exercises.length > 1}
          knownNames={knownNames}
          records={records}
          animDelay={justAppliedProgram ? i * 60 : null}
        />
      ))}
      <button
        onClick={() => setExercises([...exercises, emptyExercise()])}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'transparent', border: `1px dashed ${t.BORDER}`, borderRadius: 9,
          padding: '9px 14px', color: t.TEXT_DIM, fontSize: 13.5, fontWeight: 600,
          cursor: 'pointer', marginBottom: 22, marginTop: 4, fontFamily: 'inherit',
        }}
      >
        <Plus size={15} /> Добавить упражнение
      </button>

      <div style={{ height: 1, background: t.BORDER, margin: '0 0 18px' }} />

      <div style={{ marginBottom: 8, fontSize: 12, color: t.TEXT_FAINT, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.02em' }}>
        Кардио
      </div>
      {cardio.map((c, i) => (
        <CardioRow
          key={i}
          c={c}
          onChange={(val) => updateCardio(i, val)}
          onRemove={() => removeCardio(i)}
          removable
          knownNames={knownCardioNames}
          animDelay={justAppliedProgram ? exercises.length * 60 + i * 60 : null}
        />
      ))}
      <button
        onClick={() => setCardio([...cardio, emptyCardio()])}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'transparent', border: `1px dashed ${t.BORDER}`, borderRadius: 9,
          padding: '9px 14px', color: t.TEXT_DIM, fontSize: 13.5, fontWeight: 600,
          cursor: 'pointer', marginBottom: 22, marginTop: cardio.length ? 4 : 0, fontFamily: 'inherit',
        }}
      >
        <Plus size={15} /> Добавить кардио
      </button>

      <div style={{ height: 1, background: t.BORDER, margin: '0 0 18px' }} />

      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <Field label="Сон, часы">
          <input
            style={getInputStyle(t)}
            type="number" inputMode="decimal" min="0"
            value={sleep}
            onChange={(e) => setSleep(e.target.value)}
            placeholder="7.5"
          />
        </Field>
        <Field label="Энергия">
          <div style={{ display: 'flex', gap: 4, paddingTop: 2 }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => setEnergy(n)}
                style={{
                  flex: 1, height: 38, borderRadius: 8, border: `1px solid ${n <= energy ? t.ACCENT : t.BORDER}`,
                  background: n <= energy ? t.ACCENT : 'transparent',
                  cursor: 'pointer',
                }}
              />
            ))}
          </div>
        </Field>
      </div>

      <div style={{ marginBottom: 22 }}>
        <Field label="Самочувствие, заметки">
          <textarea
            style={{ ...getLabelInputStyle(t), resize: 'vertical', minHeight: 56, fontFamily: 'inherit' }}
            value={feeling}
            onChange={(e) => setFeeling(e.target.value)}
            placeholder="Как прошло, что почувствовал, есть жалобы..."
          />
        </Field>
      </div>

      {editingId && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
          background: t.ACCENT_BG, border: `1px solid ${t.ACCENT}`, borderRadius: 9,
          padding: '9px 12px', marginBottom: 14, fontSize: 12.5, color: t.ACCENT_SOFT, fontWeight: 600,
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Pencil size={13} /> Редактирование тренировки</span>
          <button
            onClick={handleCancelEdit}
            style={{ background: 'transparent', border: 'none', color: t.ACCENT_SOFT, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, textDecoration: 'underline' }}
          >
            Отмена
          </button>
        </div>
      )}

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
        {justSaved
          ? (editingId ? 'Изменения сохранены ✓' : 'Сохранено ✓')
          : saving ? 'Сохраняю...' : (editingId ? 'Сохранить изменения' : 'Сохранить тренировку')}
      </button>
    </div>
  );
}
