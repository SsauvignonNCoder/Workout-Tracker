import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  X, Play, Check, Timer, Headphones, ChevronLeft, ChevronRight,
  Flame, Dumbbell, CheckCircle2, Plus, Flag, Route,
} from 'lucide-react';
import { useTheme } from '../theme.js';
import { todayISO } from '../dateUtils.js';
import { Field, getInputStyle, getLabelInputStyle, MuscleBadge, isWeightlessExercise, secToClock, parseClock } from './workoutTabHelpers.jsx';

const REST_SECONDS = 120;

// Строит упорядоченный список шагов гид-тренировки из плана дня.
// Силовой день: разминка на дорожке → упражнения по порядку → заминка на дорожке (финишер).
// Кардио-день: один шаг дорожки. Бассейн: один шаг бассейна.
function buildSteps(day) {
  if (!day) return [];
  if (day.type === 'strength') {
    const out = [];
    out.push({
      kind: 'cardio', title: 'Разминка на беговой дорожке',
      subtitle: 'Разгони пульс перед работой, 5–10 мин',
      name: 'Разминка (беговая дорожка)',
      fields: { distance: true, speed: true, incline: false, duration: true },
      target: { duration: '5-10' },
    });
    day.exercises.forEach((ex) => {
      out.push({
        kind: 'exercise', name: ex.name,
        plannedSets: Math.max(1, parseInt(ex.sets) || 1),
        targetReps: ex.reps,
      });
    });
    out.push({
      kind: 'cardio', title: 'Беговая дорожка · финиш',
      subtitle: 'Уклон 15%, 15–20 минут',
      name: 'Беговая дорожка',
      fields: { distance: true, speed: true, incline: true, duration: true },
      target: { incline: '15', duration: '15-20' },
    });
    out.push(SUMMARY_STEP);
    return out;
  }
  if (day.type === 'cardio') {
    // Уникальный режим кардио-дня: интервалы по секторам до общей цели.
    return [{
      kind: 'sectors', title: day.title,
      subtitle: 'Интервалы по секторам до общей цели',
      name: day.cardio.name,
      planDistance: day.cardio.distance, planIncline: day.cardio.incline,
    }, SUMMARY_STEP];
  }
  if (day.type === 'pool') {
    return [{
      kind: 'pool', title: day.title, subtitle: `${day.cardio.duration || '60'} минут`,
      name: day.cardio.name,
      fields: { distance: false, speed: false, incline: false, duration: true },
      target: { duration: day.cardio.duration },
    }, SUMMARY_STEP];
  }
  return [];
}

const SUMMARY_STEP = { kind: 'summary', title: 'Итог тренировки', subtitle: 'Сон, энергия и заметки' };

function fmtClock(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function emptySector() { return { distance: '', speed: '', incline: '', clock: '' }; }

// Буква сектора: 0→A, 1→B … после Z — просто номер.
function sectorLabel(i) { return i < 26 ? String.fromCharCode(65 + i) : String(i + 1); }

// Достигнуто в единицах цели: дистанция — сумма км; время — максимум по нарастающему
// таймеру дорожки (последнее показание), приведённое к минутам.
function sectorAchieved(data) {
  if (!data) return 0;
  if (data.metric === 'time') {
    const maxSec = (data.sectors || []).reduce((mx, s) => Math.max(mx, parseClock(s.clock)), 0);
    return maxSec / 60; // минуты
  }
  return (data.sectors || []).reduce((acc, s) => acc + (parseFloat(s.distance) || 0), 0); // км
}

function sectorGoalReached(data) {
  const target = parseFloat(data && data.target) || 0;
  if (target <= 0) return false;
  return sectorAchieved(data) + 1e-9 >= target;
}

function trimNum(n) { return String(+(Number(n).toFixed(2))); }

export function GuidedWorkout({ dayPlan, records, onClose, onComplete }) {
  const t = useTheme();
  const steps = useMemo(() => buildSteps(dayPlan), [dayPlan]);

  const [stepIdx, setStepIdx] = useState(0);

  // Логи по индексу шага: упражнения — массив {weight,reps} по подходам; кардио — объект.
  const [exLogs, setExLogs] = useState(() => {
    const m = {};
    steps.forEach((s, i) => {
      if (s.kind === 'exercise') {
        m[i] = Array.from({ length: s.plannedSets }, () => ({ weight: '', reps: '' }));
      }
    });
    return m;
  });
  const [cardioLogs, setCardioLogs] = useState(() => {
    const m = {};
    steps.forEach((s, i) => {
      if (s.kind === 'cardio' || s.kind === 'pool') m[i] = { distance: '', speed: '', incline: '', duration: '' };
    });
    return m;
  });
  // Секторный кардио-день: метрика цели, сама цель и список секторов.
  const [sectorLogs, setSectorLogs] = useState(() => {
    const m = {};
    steps.forEach((s, i) => {
      if (s.kind === 'sectors') {
        m[i] = { metric: 'distance', target: s.planDistance || '', sectors: [emptySector()] };
      }
    });
    return m;
  });
  // Заметки по каждому упражнению (ключ — индекс шага).
  const [exNotes, setExNotes] = useState({});
  // Итоговый экран: сон, энергия, общее самочувствие.
  const [summary, setSummary] = useState({ sleep: '', energy: 3, feeling: '' });
  const [saving, setSaving] = useState(false);

  // ---- Таймер отдыха ----
  // Отсчёт по МЕТКЕ времени окончания (restEndRef), а не по «тиканью» setInterval:
  // когда экран гаснет / приложение уходит в фон, интервал замирает, поэтому
  // remaining всегда вычисляем из restEndRef и пересчитываем при возврате в
  // приложение (visibilitychange/focus/pageshow). Звук при выключенном экране
  // обеспечивает бот-уведомление (scheduleBotAlert), т.к. клиентский JS в этот
  // момент заморожен.
  const [restRemaining, setRestRemaining] = useState(0);
  const [restActive, setRestActive] = useState(false);
  const [restDone, setRestDone] = useState(false);
  const intervalRef = useRef(null);
  const audioRef = useRef(null);
  const restEndRef = useRef(0);
  const restActiveRef = useRef(false);
  const restMsgIdRef = useRef(null); // id запланированного бот-уведомления (для отмены)

  const scrollRef = useRef(null);

  const playBeep = useCallback(() => {
    // Звук через WebAudio (контекст разблокирован по жесту при старте таймера).
    try {
      const ctx = audioRef.current;
      if (ctx) {
        const now = ctx.currentTime;
        [0, 0.28, 0.56].forEach((offset, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = idx === 2 ? 1046 : 784;
          gain.gain.setValueAtTime(0.0001, now + offset);
          gain.gain.exponentialRampToValueAtTime(0.32, now + offset + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.22);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + offset);
          osc.stop(now + offset + 0.24);
        });
      }
    } catch (e) { /* нет звука — не критично */ }
    // Вибрация: браузер + Telegram haptic.
    try { if (navigator.vibrate) navigator.vibrate([220, 120, 220]); } catch (e) { /* no-op */ }
    try {
      const tg = window.Telegram && window.Telegram.WebApp;
      if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
    } catch (e) { /* no-op */ }
  }, []);

  const clearTimer = () => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  };

  // Планирование бот-уведомления (звук в наушники при выключенном экране).
  // Вне Telegram (нет initData) — тихо пропускаем: работает только клиентский таймер.
  const scheduleBotAlert = useCallback(async (durationSec) => {
    try {
      const tg = window.Telegram && window.Telegram.WebApp;
      const initData = tg && tg.initData;
      if (!initData) return;
      const r = await fetch('/api/rest-schedule', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData, duration: durationSec }),
      });
      if (!r.ok) return;
      const data = await r.json().catch(() => null);
      if (data && data.messageId) restMsgIdRef.current = data.messageId;
    } catch (e) { /* сеть/бэкенд недоступны — клиентский таймер всё равно работает */ }
  }, []);

  const cancelBotAlert = useCallback(async () => {
    const id = restMsgIdRef.current;
    restMsgIdRef.current = null;
    if (!id) return;
    try {
      await fetch('/api/rest-cancel', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: id }),
      });
    } catch (e) { /* no-op */ }
  }, []);

  const finishRest = useCallback(() => {
    clearTimer();
    restActiveRef.current = false;
    setRestActive(false);
    setRestRemaining(0);
    setRestDone(true);
    // Приложение открыто → сигналим сами и снимаем бот-уведомление (иначе задвоит).
    // Экран был выключен → бот уже прозвучал в наушники; отмена ниже — безопасный no-op.
    const visible = typeof document === 'undefined' || document.visibilityState === 'visible';
    if (visible) playBeep();
    cancelBotAlert();
  }, [playBeep, cancelBotAlert]);

  const tick = useCallback(() => {
    const rem = Math.max(0, Math.round((restEndRef.current - Date.now()) / 1000));
    setRestRemaining(rem);
    if (rem <= 0) finishRest();
  }, [finishRest]);

  const tickRef = useRef(tick);
  useEffect(() => { tickRef.current = tick; }, [tick]);

  const startRest = useCallback((durationSec = REST_SECONDS) => {
    // Разблокируем аудио по пользовательскому жесту (важно для iOS/Telegram).
    try {
      if (!audioRef.current) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) audioRef.current = new AC();
      }
      if (audioRef.current && audioRef.current.state === 'suspended') audioRef.current.resume();
    } catch (e) { /* no-op */ }
    try {
      const tg = window.Telegram && window.Telegram.WebApp;
      if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
    } catch (e) { /* no-op */ }

    clearTimer();
    restEndRef.current = Date.now() + durationSec * 1000;
    restActiveRef.current = true;
    setRestDone(false);
    setRestActive(true);
    setRestRemaining(durationSec);
    scheduleBotAlert(durationSec);
    intervalRef.current = setInterval(() => { tickRef.current(); }, 500);
  }, [scheduleBotAlert]);

  const skipRest = useCallback(() => {
    clearTimer();
    restActiveRef.current = false;
    setRestActive(false);
    setRestDone(false);
    setRestRemaining(0);
    cancelBotAlert();
    try {
      const tg = window.Telegram && window.Telegram.WebApp;
      if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('rigid');
    } catch (e) { /* no-op */ }
  }, [cancelBotAlert]);

  // Пересчёт при возврате в приложение (экран включили / развернули из фона).
  useEffect(() => {
    const onVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible' && restActiveRef.current) {
        try { if (audioRef.current && audioRef.current.state === 'suspended') audioRef.current.resume(); } catch (e) { /* no-op */ }
        tickRef.current();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    window.addEventListener('pageshow', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      window.removeEventListener('pageshow', onVisible);
    };
  }, []);

  useEffect(() => () => {
    clearTimer();
    cancelBotAlert();
    try { audioRef.current && audioRef.current.close(); } catch (e) { /* no-op */ }
  }, [cancelBotAlert]);

  // При смене шага — прокрутка наверх.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [stepIdx]);

  const step = steps[stepIdx];
  const isLast = stepIdx === steps.length - 1;

  const setExSet = (si, fieldObj) => {
    setExLogs((prev) => {
      const arr = (prev[stepIdx] || []).map((x) => ({ ...x }));
      arr[si] = { ...arr[si], ...fieldObj };
      return { ...prev, [stepIdx]: arr };
    });
  };

  const setCardioField = (fieldObj) => {
    setCardioLogs((prev) => ({ ...prev, [stepIdx]: { ...prev[stepIdx], ...fieldObj } }));
  };

  const setSectorMeta = (patch) => {
    setSectorLogs((prev) => ({ ...prev, [stepIdx]: { ...prev[stepIdx], ...patch } }));
  };
  const setSectorField = (si, patch) => {
    setSectorLogs((prev) => {
      const cur = prev[stepIdx];
      const sectors = cur.sectors.map((s, i) => (i === si ? { ...s, ...patch } : s));
      return { ...prev, [stepIdx]: { ...cur, sectors } };
    });
  };
  const addSector = () => {
    setSectorLogs((prev) => {
      const cur = prev[stepIdx];
      return { ...prev, [stepIdx]: { ...cur, sectors: [...cur.sectors, emptySector()] } };
    });
  };
  const removeSector = (si) => {
    setSectorLogs((prev) => {
      const cur = prev[stepIdx];
      if (cur.sectors.length <= 1) return prev;
      return { ...prev, [stepIdx]: { ...cur, sectors: cur.sectors.filter((_, i) => i !== si) } };
    });
  };

  const setExNote = (val) => setExNotes((prev) => ({ ...prev, [stepIdx]: val }));

  const finish = () => {
    // Упражнения → агрегат (число) + setLog + заметка. Пустые (без данных и заметки) пропускаем.
    const outEx = [];
    steps.forEach((s, i) => {
      if (s.kind !== 'exercise') return;
      const log = exLogs[i] || [];
      const weightless = isWeightlessExercise(s.name);
      const filled = log.filter((x) => (parseFloat(x.weight) || 0) > 0 || (parseInt(x.reps) || 0) > 0);
      const note = (exNotes[i] || '').trim();
      if (filled.length === 0 && !note) return;
      let maxW = 0, repsAtMax = 0, maxReps = 0;
      filled.forEach((x) => {
        const w = parseFloat(x.weight) || 0;
        const r = parseInt(x.reps) || 0;
        if (w >= maxW) { maxW = w; repsAtMax = r || repsAtMax; }
        if (r > maxReps) maxReps = r;
      });
      outEx.push({
        name: s.name,
        weight: weightless ? 0 : maxW,
        reps: weightless ? maxReps : repsAtMax,
        sets: Math.max(1, filled.length || s.plannedSets),
        setLog: filled.map((x) => ({
          weight: weightless ? 0 : (parseFloat(x.weight) || 0),
          reps: parseInt(x.reps) || 0,
        })),
        ...(note ? { note } : {}),
      });
    });

    const outCardio = [];
    steps.forEach((s, i) => {
      if (s.kind !== 'cardio' && s.kind !== 'pool') return;
      const c = cardioLogs[i] || {};
      const dist = parseFloat(c.distance) || 0, spd = parseFloat(c.speed) || 0;
      const incl = parseFloat(c.incline) || 0, dur = parseInt(c.duration) || 0;
      if (dist <= 0 && spd <= 0 && incl <= 0 && dur <= 0) return;
      outCardio.push({ name: s.name, distance: dist, speed: spd, incline: incl, duration: dur });
    });

    // Секторы кардио-дня — каждый сектор отдельной записью «Сектор A/B/…».
    // Время вводится как нарастающее показание таймера дорожки (мм:сс); длительность
    // самого сектора (дельту) считаем как разницу с предыдущим сектором.
    steps.forEach((s, i) => {
      if (s.kind !== 'sectors') return;
      const data = sectorLogs[i];
      if (!data) return;
      let prevCum = 0;
      (data.sectors || []).forEach((sec, si) => {
        const cumSec = parseClock(sec.clock);
        const dist = parseFloat(sec.distance) || 0, spd = parseFloat(sec.speed) || 0, incl = parseFloat(sec.incline) || 0;
        if (dist <= 0 && spd <= 0 && incl <= 0 && cumSec <= 0) return;
        const deltaSec = cumSec > 0 ? Math.max(0, cumSec - prevCum) : 0;
        if (cumSec > 0) prevCum = cumSec;
        outCardio.push({
          name: `Сектор ${sectorLabel(si)}`,
          distance: dist, speed: spd, incline: incl,
          duration: deltaSec ? Math.round(deltaSec / 60) : 0,
          durationSec: deltaSec || 0,
        });
      });
    });

    clearTimer();
    cancelBotAlert();

    if (outEx.length === 0 && outCardio.length === 0) { onClose(); return; }

    const session = {
      id: `${todayISO()}-${Date.now()}`,
      date: todayISO(),
      exercises: outEx,
      cardio: outCardio,
      sleep: summary.sleep ? Math.max(0, parseFloat(summary.sleep)) : null,
      energy: summary.energy || 3,
      feeling: (summary.feeling || '').trim(),
      programDay: dayPlan.day || null,
    };
    setSaving(true);
    onComplete(session);
  };

  const goNext = () => {
    if (restActiveRef.current) skipRest();
    if (isLast) { finish(); return; }
    setStepIdx((i) => Math.min(steps.length - 1, i + 1));
  };
  const goPrev = () => {
    if (restActiveRef.current) skipRest();
    setStepIdx((i) => Math.max(0, i - 1));
  };

  if (!step) {
    return null;
  }

  const progressPct = Math.round(((stepIdx + 1) / steps.length) * 100);

  const btnBase = {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
    borderRadius: 14, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
    padding: '14px 16px', boxSizing: 'border-box',
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000, background: t.BG,
      display: 'flex', flexDirection: 'column',
      fontFamily: "'Manrope', system-ui, -apple-system, sans-serif",
    }}>
      <style>{`
        @keyframes restPulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.04); } }
        @keyframes restFlash {
          0% { background: ${t.POSITIVE}; }
          100% { background: ${t.BG_RAISED}; }
        }
        .rest-done-flash { animation: restFlash 1.1s ease-out; }
        .guided-step-in { animation: stepIn 0.25s ease-out; }
        @keyframes stepIn { from { opacity: 0; transform: translateX(14px); } to { opacity: 1; transform: translateX(0); } }
      `}</style>

      {/* Шапка */}
      <div style={{
        flexShrink: 0,
        padding: 'max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) 12px max(16px, env(safe-area-inset-left))',
        borderBottom: `1px solid ${t.BORDER}`, background: t.BG,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, maxWidth: 480, margin: '0 auto' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontSize: 10.5, fontWeight: 700, color: t.ACCENT_SOFT, textTransform: 'uppercase',
              letterSpacing: '0.1em', fontFamily: t.FONT_MONO,
            }}>
              Тренировка · шаг {stepIdx + 1} из {steps.length}
            </div>
            <div style={{
              fontSize: 17, fontWeight: 700, color: t.TEXT, marginTop: 3,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {dayPlan.title}
            </div>
          </div>
          <button
            onClick={() => { clearTimer(); cancelBotAlert(); onClose(); }}
            aria-label="Закрыть"
            style={{
              flexShrink: 0, width: 40, height: 40, borderRadius: 11, border: `1px solid ${t.BORDER}`,
              background: t.BG_INPUT, color: t.TEXT_DIM, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={18} />
          </button>
        </div>
        <div style={{ maxWidth: 480, margin: '12px auto 0', height: 5, borderRadius: 3, background: t.BG_INPUT, overflow: 'hidden' }}>
          <div style={{ width: `${progressPct}%`, height: '100%', background: t.ACCENT_GRAD, transition: 'width 0.3s ease' }} />
        </div>
      </div>

      {/* Тело шага */}
      <div ref={scrollRef} style={{
        flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch',
        padding: '20px max(16px, env(safe-area-inset-right)) 24px max(16px, env(safe-area-inset-left))',
      }}>
        <div key={stepIdx} className="guided-step-in" style={{ maxWidth: 480, margin: '0 auto' }}>
          {step.kind === 'exercise' ? (
            <ExerciseStep
              step={step} sets={exLogs[stepIdx] || []} onSet={setExSet}
              records={records} note={exNotes[stepIdx] || ''} onNote={setExNote}
            />
          ) : step.kind === 'sectors' ? (
            <SectorsStep
              step={step} data={sectorLogs[stepIdx]}
              onMeta={setSectorMeta} onField={setSectorField} onAdd={addSector} onRemove={removeSector}
            />
          ) : step.kind === 'summary' ? (
            <SummaryStep summary={summary} onChange={(patch) => setSummary((prev) => ({ ...prev, ...patch }))} />
          ) : (
            <CardioStep step={step} value={cardioLogs[stepIdx] || {}} onChange={setCardioField} />
          )}
        </div>
      </div>

      {/* Навигация + компактный таймер отдыха рядом с кнопками */}
      <div style={{
        flexShrink: 0, borderTop: `1px solid ${t.BORDER}`, background: t.BG,
        padding: '12px max(16px, env(safe-area-inset-right)) calc(14px + env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left))',
      }}>
        <div style={{ maxWidth: 480, margin: '0 auto', display: 'flex', gap: 10 }}>
          <button
            onClick={goPrev}
            disabled={stepIdx === 0}
            style={{
              ...btnBase, flex: '0 0 auto', width: 54,
              border: `1px solid ${t.BORDER}`, background: t.BG_INPUT,
              color: stepIdx === 0 ? t.TEXT_FAINT : t.TEXT_DIM,
              opacity: stepIdx === 0 ? 0.5 : 1, cursor: stepIdx === 0 ? 'default' : 'pointer', padding: 0,
            }}
            aria-label="Назад"
          >
            <ChevronLeft size={20} />
          </button>

          {/* Небольшая иконка отдыха рядом со стрелками: в покое (на шаге упражнения)
              запускает отдых 2 мин, активная — показывает отсчёт и пропускает по тапу. */}
          {(step.kind === 'exercise' || restActive || restDone) && (
            <button
              onClick={restActive || restDone ? skipRest : () => startRest()}
              aria-label={restActive ? 'Пропустить отдых' : restDone ? 'Отдых окончен' : 'Отдых 2 минуты'}
              title={restActive || restDone ? 'Пропустить отдых' : 'Запустить отдых 2 мин'}
              className={restDone ? 'rest-done-flash' : ''}
              style={{
                ...btnBase, flex: '0 0 auto', minWidth: 66, padding: '0 11px', gap: 5,
                border: `1px solid ${restDone ? t.POSITIVE : restActive ? t.ACCENT_BORDER : t.BORDER}`,
                background: restDone ? t.POSITIVE_BG : restActive ? t.ACCENT_BG : t.BG_INPUT,
                color: restDone ? t.POSITIVE : restActive ? t.ACCENT_SOFT : t.TEXT_DIM,
                fontFamily: t.FONT_MONO, fontSize: 13.5,
                animation: restActive ? 'restPulse 1s ease-in-out infinite' : 'none',
              }}
            >
              {restDone
                ? <CheckCircle2 size={18} />
                : restActive
                  ? <><Timer size={16} />{fmtClock(restRemaining)}</>
                  : <><Timer size={16} />2:00</>}
            </button>
          )}

          {(() => {
            const secData = step.kind === 'sectors' ? sectorLogs[stepIdx] : null;
            const finishLocked = step.kind === 'sectors' && !sectorGoalReached(secData);
            let lockedLabel = null;
            if (finishLocked) {
              const target = parseFloat(secData && secData.target) || 0;
              const unit = secData && secData.metric === 'time' ? 'мин' : 'км';
              if (target <= 0) lockedLabel = 'Укажи цель тренировки';
              else lockedLabel = `Осталось ${trimNum(Math.max(0, target - sectorAchieved(secData)))} ${unit}`;
            }
            const disabled = finishLocked || saving;
            return (
              <button
                onClick={goNext}
                disabled={disabled}
                style={{
                  ...btnBase, flex: 1, minWidth: 0,
                  border: finishLocked ? `1px solid ${t.BORDER}` : 'none',
                  background: finishLocked ? t.BG_INPUT : (isLast ? t.POSITIVE : t.ACCENT_GRAD),
                  color: finishLocked ? t.TEXT_FAINT : t.ON_ACCENT,
                  boxShadow: (finishLocked || isLast) ? 'none' : t.GLOW,
                  cursor: disabled ? 'default' : 'pointer', opacity: saving ? 0.7 : 1,
                  overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                }}
              >
                {finishLocked
                  ? lockedLabel
                  : saving ? 'Сохраняю…'
                    : isLast ? <><Check size={19} /> Завершить и сохранить</> : <>Дальше <ChevronRight size={19} /></>}
              </button>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

function StepHeader({ icon: Icon, name, subtitle, badgeName }) {
  const t = useTheme();
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: subtitle ? 5 : 0 }}>
        {badgeName ? <MuscleBadge name={badgeName} size={26} /> : (
          <span style={{
            width: 26, height: 26, borderRadius: 8, flexShrink: 0, background: t.ACCENT_BG, color: t.ACCENT_SOFT,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}>{Icon && <Icon size={15} />}</span>
        )}
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: t.TEXT, letterSpacing: '-0.01em', lineHeight: 1.15 }}>
          {name}
        </h2>
      </div>
      {subtitle && (
        <div style={{ fontSize: 13, color: t.TEXT_FAINT, paddingLeft: 36 }}>{subtitle}</div>
      )}
    </div>
  );
}

function ExerciseStep({ step, sets, onSet, records, note, onNote }) {
  const t = useTheme();
  const weightless = isWeightlessExercise(step.name);
  const record = records && records[step.name];

  return (
    <div>
      <StepHeader name={step.name} badgeName={step.name} subtitle={null} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
        <span style={{
          fontSize: 12, fontWeight: 700, color: t.ACCENT_SOFT, background: t.ACCENT_BG,
          padding: '5px 10px', borderRadius: 8, fontFamily: t.FONT_MONO,
        }}>
          Цель: {step.targetReps} повт · {sets.length} подх
        </span>
        {record && record.weight ? (
          <span style={{
            fontSize: 12, fontWeight: 700, color: t.TEXT_DIM, background: t.BG_INPUT,
            padding: '5px 10px', borderRadius: 8, display: 'inline-flex', alignItems: 'center', gap: 5,
          }}>
            <Flame size={12} /> Рекорд {record.weight} кг
          </span>
        ) : null}
      </div>

      {sets.map((s, si) => {
        return (
          <div key={si} style={{
            background: t.BG_RAISED, border: `1px solid ${t.BORDER}`, borderRadius: 16,
            padding: '13px 14px', marginBottom: 12, boxShadow: t.CARD_SHADOW,
          }}>
            <div style={{
              fontSize: 11, fontWeight: 700, color: t.TEXT_FAINT, textTransform: 'uppercase',
              letterSpacing: '0.08em', fontFamily: t.FONT_MONO, marginBottom: 10,
            }}>
              Подход {si + 1}
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
              {!weightless && (
                <Field label="Вес, кг">
                  <input
                    style={getInputStyle(t)}
                    type="number" inputMode="decimal" min="0"
                    value={s.weight}
                    onChange={(e) => onSet(si, { weight: e.target.value })}
                    placeholder="0"
                  />
                </Field>
              )}
              <Field label="Повторы">
                <input
                  style={getInputStyle(t)}
                  type="number" inputMode="numeric" min="0"
                  value={s.reps}
                  onChange={(e) => onSet(si, { reps: e.target.value })}
                  placeholder={step.targetReps || '0'}
                />
              </Field>
            </div>
          </div>
        );
      })}

      {/* Самочувствие / заметка по упражнению */}
      <div style={{ marginTop: 4 }}>
        <Field label="Самочувствие · заметка">
          <textarea
            style={{ ...getLabelInputStyle(t), resize: 'vertical', minHeight: 52, fontFamily: 'inherit' }}
            value={note}
            onChange={(e) => onNote(e.target.value)}
            placeholder="Как ощущения, техника, боль/дискомфорт…"
          />
        </Field>
      </div>
    </div>
  );
}

function SummaryStep({ summary, onChange }) {
  const t = useTheme();
  return (
    <div>
      <StepHeader icon={CheckCircle2} name="Итог тренировки" subtitle="Сон, энергия и общие заметки — и сохраняем" />
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <Field label="Сон, часы">
          <input
            style={getInputStyle(t)} type="number" inputMode="decimal" min="0"
            value={summary.sleep} onChange={(e) => onChange({ sleep: e.target.value })}
            placeholder="7.5"
          />
        </Field>
        <Field label="Энергия">
          <div style={{ display: 'flex', gap: 4, paddingTop: 2 }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => onChange({ energy: n })}
                style={{
                  flex: 1, height: 38, borderRadius: 8,
                  border: `1px solid ${n <= summary.energy ? t.ACCENT : t.BORDER}`,
                  background: n <= summary.energy ? t.ACCENT : 'transparent', cursor: 'pointer',
                }}
              />
            ))}
          </div>
        </Field>
      </div>
      <Field label="Самочувствие, заметки">
        <textarea
          style={{ ...getLabelInputStyle(t), resize: 'vertical', minHeight: 64, fontFamily: 'inherit' }}
          value={summary.feeling} onChange={(e) => onChange({ feeling: e.target.value })}
          placeholder="Как прошло в целом, что почувствовал…"
        />
      </Field>
    </div>
  );
}

function CardioStep({ step, value, onChange }) {
  const t = useTheme();
  const f = step.fields || {};
  const isWarmup = step.kind === 'cardio' && step.name.toLowerCase().includes('разминка');
  const Icon = isWarmup ? Flame : Dumbbell;

  return (
    <div>
      <StepHeader icon={Icon} name={step.title} subtitle={step.subtitle} />
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {f.distance && (
          <div style={{ flex: '1 1 45%', minWidth: 130 }}>
            <Field label="Дистанция, км">
              <input
                style={getInputStyle(t)} type="number" inputMode="decimal" min="0"
                value={value.distance || ''} onChange={(e) => onChange({ distance: e.target.value })}
                placeholder={(step.target && step.target.distance) || '0'}
              />
            </Field>
          </div>
        )}
        {f.speed && (
          <div style={{ flex: '1 1 45%', minWidth: 130 }}>
            <Field label="Скорость, км/ч">
              <input
                style={getInputStyle(t)} type="number" inputMode="decimal" min="0"
                value={value.speed || ''} onChange={(e) => onChange({ speed: e.target.value })}
                placeholder="0"
              />
            </Field>
          </div>
        )}
        {f.incline && (
          <div style={{ flex: '1 1 45%', minWidth: 130 }}>
            <Field label="Наклон, %">
              <input
                style={getInputStyle(t)} type="number" inputMode="decimal" min="0"
                value={value.incline || ''} onChange={(e) => onChange({ incline: e.target.value })}
                placeholder={(step.target && step.target.incline) || '0'}
              />
            </Field>
          </div>
        )}
        {f.duration && (
          <div style={{ flex: '1 1 45%', minWidth: 130 }}>
            <Field label="Время, мин">
              <input
                style={getInputStyle(t)} type="number" inputMode="numeric" min="0"
                value={value.duration || ''} onChange={(e) => onChange({ duration: e.target.value })}
                placeholder={(step.target && step.target.duration) || '0'}
              />
            </Field>
          </div>
        )}
      </div>
    </div>
  );
}

function SectorsStep({ step, data, onMeta, onField, onAdd, onRemove }) {
  const t = useTheme();
  const d = data || { metric: 'distance', target: '', sectors: [] };
  const isTime = d.metric === 'time';
  const unit = isTime ? 'мин' : 'км';
  const target = parseFloat(d.target) || 0;
  const achieved = sectorAchieved(d);
  const reached = sectorGoalReached(d);
  const pct = target > 0 ? Math.min(100, (achieved / target) * 100) : 0;

  // Ввод таймера дорожки: авто-подстановка двоеточия (754 → 7:54) — чтобы можно было
  // печатать с цифровой клавиатуры без ручного двоеточия.
  const onClockChange = (si, raw) => {
    const digits = String(raw).replace(/\D/g, '').slice(0, 4);
    let formatted = digits;
    if (digits.length > 2) formatted = `${digits.slice(0, digits.length - 2)}:${digits.slice(-2)}`;
    onField(si, { clock: formatted });
  };

  const metricBtn = (key, label) => {
    const active = d.metric === key;
    return (
      <button
        onClick={() => onMeta({ metric: key })}
        style={{
          flex: 1, padding: '10px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
          fontSize: 13.5, fontWeight: 700,
          border: `1px solid ${active ? t.ACCENT : t.BORDER}`,
          background: active ? t.ACCENT_BG : 'transparent',
          color: active ? t.ACCENT_SOFT : t.TEXT_DIM,
        }}
      >
        {label}
      </button>
    );
  };

  return (
    <div>
      <StepHeader icon={Flag} name={step.title} subtitle={step.subtitle} />

      {/* Выбор цели тренировки */}
      <div style={{
        background: t.BG_RAISED, border: `1px solid ${t.BORDER}`, borderRadius: 16,
        padding: '14px', marginBottom: 16, boxShadow: t.CARD_SHADOW,
      }}>
        <div style={{
          fontSize: 10.5, fontWeight: 700, color: t.ACCENT_SOFT, textTransform: 'uppercase',
          letterSpacing: '0.1em', marginBottom: 10, fontFamily: t.FONT_MONO,
        }}>
          Цель тренировки
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {metricBtn('distance', 'Дистанция')}
          {metricBtn('time', 'Время')}
        </div>
        <Field label={isTime ? 'Цель по времени, мин' : 'Цель по дистанции, км'}>
          <input
            style={getInputStyle(t)} type="number" inputMode="decimal" min="0"
            value={d.target || ''} onChange={(e) => onMeta({ target: e.target.value })}
            placeholder={isTime ? '40' : (step.planDistance || '3')}
          />
        </Field>

        {/* Прогресс к цели */}
        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
            <span style={{ fontSize: 12.5, color: t.TEXT_DIM, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Route size={13} /> Пройдено
            </span>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: reached ? t.POSITIVE : t.TEXT, fontFamily: t.FONT_MONO }}>
              {trimNum(achieved)} / {target > 0 ? trimNum(target) : '—'} {unit}
            </span>
          </div>
          <div style={{ height: 8, borderRadius: 5, background: t.BG_INPUT, overflow: 'hidden' }}>
            <div style={{
              width: `${pct}%`, height: '100%',
              background: reached ? t.POSITIVE : t.ACCENT_GRAD, transition: 'width 0.3s ease',
            }} />
          </div>
          {reached && (
            <div style={{ marginTop: 8, fontSize: 12.5, fontWeight: 700, color: t.POSITIVE, display: 'flex', alignItems: 'center', gap: 6 }}>
              <CheckCircle2 size={14} /> Цель достигнута — можно завершать
            </div>
          )}
        </div>
      </div>

      {/* Секторы */}
      {(d.sectors || []).map((sec, si) => {
        const distHighlight = !isTime; // при цели по дистанции подсвечиваем дистанцию
        const inputBlock = (key, label, inputMode, highlight) => (
          <div style={{ flex: '1 1 45%', minWidth: 120 }}>
            <Field label={highlight ? `${label} · цель` : label}>
              <input
                style={{
                  ...getInputStyle(t),
                  border: highlight ? `1px solid ${t.ACCENT}` : `1px solid ${t.BORDER}`,
                }}
                type="number" inputMode={inputMode} min="0"
                value={sec[key] || ''} onChange={(e) => onField(si, { [key]: e.target.value })}
                placeholder="0"
              />
            </Field>
          </div>
        );
        const cumSec = parseClock(sec.clock);
        const prevSec = si > 0 ? parseClock(d.sectors[si - 1].clock) : 0;
        const deltaSec = cumSec > 0 ? Math.max(0, cumSec - prevSec) : 0;
        return (
          <div key={si} style={{
            background: t.BG_RAISED, border: `1px solid ${t.BORDER}`, borderRadius: 16,
            padding: '13px 14px', marginBottom: 12, boxShadow: t.CARD_SHADOW,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{
                fontSize: 12.5, fontWeight: 700, color: t.TEXT,
                display: 'inline-flex', alignItems: 'center', gap: 8,
              }}>
                <span style={{
                  width: 24, height: 24, borderRadius: 7, background: t.ACCENT_BG, color: t.ACCENT_SOFT,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700, fontFamily: t.FONT_MONO,
                }}>{sectorLabel(si)}</span>
                Сектор {sectorLabel(si)}
              </span>
              {(d.sectors.length > 1) && (
                <button
                  onClick={() => onRemove(si)}
                  aria-label="Удалить сектор"
                  style={{ background: 'transparent', border: 'none', color: t.TEXT_FAINT, cursor: 'pointer', padding: 4 }}
                >
                  <X size={16} />
                </button>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {inputBlock('distance', 'Дистанция, км', 'decimal', distHighlight)}
              {inputBlock('speed', 'Скорость, км/ч', 'decimal', false)}
              {inputBlock('incline', 'Наклон, %', 'decimal', false)}
              <div style={{ flex: '1 1 45%', minWidth: 120 }}>
                <Field label={`Таймер дорожки, мм:сс${isTime ? ' · цель' : ''}`}>
                  <input
                    style={{
                      ...getInputStyle(t),
                      border: isTime ? `1px solid ${t.ACCENT}` : `1px solid ${t.BORDER}`,
                    }}
                    type="text" inputMode="numeric"
                    value={sec.clock || ''} onChange={(e) => onClockChange(si, e.target.value)}
                    placeholder="00:00"
                  />
                </Field>
              </div>
            </div>
            {deltaSec > 0 && (
              <div style={{ marginTop: 9, fontSize: 11.5, color: t.TEXT_FAINT, fontFamily: t.FONT_MONO }}>
                Длительность сектора: <span style={{ color: t.ACCENT_SOFT, fontWeight: 700 }}>+{secToClock(deltaSec)}</span>
              </div>
            )}
          </div>
        );
      })}

      <button
        onClick={onAdd}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, width: '100%',
          background: 'transparent', border: `1px dashed ${t.BORDER}`, borderRadius: 12,
          padding: '12px', color: t.TEXT_DIM, fontSize: 13.5, fontWeight: 700,
          cursor: 'pointer', fontFamily: 'inherit', marginTop: 2,
        }}
      >
        <Plus size={16} /> Добавить сектор
      </button>
    </div>
  );
}
