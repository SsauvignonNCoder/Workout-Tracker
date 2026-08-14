import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  X, Play, Check, Timer, Headphones, ChevronLeft, ChevronRight,
  Flame, Dumbbell, CheckCircle2, Circle, Plus, Flag, Route, Wind, RotateCcw, Shuffle,
  ChevronDown, ChevronUp, HelpCircle, TrendingUp,
} from 'lucide-react';
import { useTheme } from '../theme.js';
import { todayISO } from '../dateUtils.js';
import { cooldownFor, variantsOf } from '../cooldown.js';
import {
  Field, getInputStyle, getLabelInputStyle, MuscleBadge,
  isWeightlessExercise, isTimeBasedExercise, repGoalLow, secToClock, parseClock,
  clampIncline, MAX_INCLINE,
} from './workoutTabHelpers.jsx';
import { getExerciseGuide } from '../exerciseGuides.js';
import { MountainBox } from '../MountainBox.jsx';
import { ClimbPicker } from '../ClimbPicker.jsx';

const REST_SECONDS = 120;

// Цвета свечения по итогу упражнения (пункт 5): зелёное — выполнено, красное —
// не закрыт план / ничего не записано, синее — новый рекорд. Свечение без текста.
const FLASH_GREEN = '#3FB27F';
const FLASH_RED = '#E5484D';
const FLASH_BLUE = '#5BA3E0';

// Оценка выполнения упражнения при переходе дальше → тип свечения (цвет).
// green — все подходы записаны и в каждом повторов ≥ нижней границы плана;
// record — побит личный рекорд (вес / повторы / секунды) → синее;
// wasted — не записан ни один подход → красное;
// red — что-то записано, но план не закрыт → красное.
function evalExercise(step, log, records) {
  const timed = isTimeBasedExercise(step.name);
  const weightless = isWeightlessExercise(step.name) || timed;
  const low = repGoalLow(step.targetReps);
  const arr = log || [];
  const planned = Math.max(step.plannedSets || 0, arr.length || 0);
  const recorded = arr.filter((x) => (parseInt(x.reps, 10) || 0) > 0 || (parseFloat(x.weight) || 0) > 0);
  const withReps = arr.filter((x) => (parseInt(x.reps, 10) || 0) > 0);

  if (recorded.length === 0) {
    return { type: 'wasted', color: FLASH_RED, duration: 1150 };
  }

  const rec = records && records[step.name];
  let isRecord = false;
  if (weightless) {
    const maxVal = Math.max(0, ...withReps.map((x) => parseInt(x.reps, 10) || 0));
    const prev = rec && rec.metric ? (rec.value || 0) : 0;
    isRecord = maxVal > 0 && maxVal > prev;
  } else {
    const maxW = Math.max(0, ...arr.map((x) => parseFloat(x.weight) || 0));
    const prev = rec && rec.weight ? rec.weight : 0;
    isRecord = maxW > 0 && maxW > prev;
  }
  if (isRecord) {
    return { type: 'record', color: FLASH_BLUE, duration: 1300 };
  }

  const allRecorded = planned > 0 && withReps.length >= planned;
  const allMeet = allRecorded && withReps.every((x) => (parseInt(x.reps, 10) || 0) >= Math.max(low, 1));
  if (allMeet) {
    return { type: 'green', color: FLASH_GREEN, duration: 950 };
  }
  return { type: 'red', color: FLASH_RED, duration: 850 };
}

// Секунды → «M:SS» / «H:MM:SS» для таймера всей тренировки.
function fmtElapsed(sec) {
  const total = Math.max(0, Math.round(sec || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return (h ? `${h}:${String(m).padStart(2, '0')}` : `${m}`) + `:${String(s).padStart(2, '0')}`;
}

// ---- Черновик тренировки (автосейв) ----
// Гид-тренировка держит все введённые данные в памяти React и пишет их в базу только
// на последнем шаге. Telegram может выгрузить Mini App из памяти (погас экран на долгом
// кардио, свернул приложение) — и всё введённое пропадало. Поэтому после каждого
// изменения кладём черновик в localStorage устройства, а при следующем открытии того же
// дня предлагаем продолжить. Черновик живёт сутки и стирается после успешного сохранения.
const DRAFT_KEY = 'wt:guided-draft:v1';
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

function readDraft() {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d || d.v !== 1 || !d.savedAt) return null;
    if (Date.now() - d.savedAt > DRAFT_TTL_MS) return null;
    return d;
  } catch (e) { return null; }
}

function writeDraft(payload) {
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...payload, v: 1, savedAt: Date.now() }));
    return true;
  } catch (e) { return false; }
}

function clearDraft() {
  try { window.localStorage.removeItem(DRAFT_KEY); } catch (e) { /* no-op */ }
}

// Черновик мог быть записан для другой версии плана (упражнение добавили/убрали).
// Берём из него только те шаги, тип которых совпал с текущим планом.
function pickByKind(saved, steps, kind) {
  const out = {};
  if (!saved || typeof saved !== 'object') return out;
  Object.keys(saved).forEach((k) => {
    const i = parseInt(k, 10);
    if (steps[i] && steps[i].kind === kind) out[i] = saved[k];
  });
  return out;
}

function fmtSavedAt(ts) {
  try {
    return new Date(ts).toLocaleString('ru-RU', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  } catch (e) { return ''; }
}

// Строит упорядоченный список шагов гид-тренировки из плана дня.
// Силовой день: разминка на дорожке → упражнения по порядку → заминка на дорожке (финишер)
// → разгрузочная гимнастика → итог.
// Кардио-день: секторы → разгрузочная гимнастика → итог. Бассейн: бассейн → итог.
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
    pushCooldown(out, day);
    out.push(SUMMARY_STEP);
    return out;
  }
  if (day.type === 'cardio') {
    // Уникальный режим кардио-дня: интервалы по секторам до общей цели.
    const out = [{
      kind: 'sectors', title: day.title,
      subtitle: 'Интервалы по секторам до общей цели',
      name: day.cardio.name,
      planDistance: day.cardio.distance, planIncline: day.cardio.incline,
    }];
    pushCooldown(out, day);
    out.push(SUMMARY_STEP);
    return out;
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

// Разгрузочная гимнастика — в конце любой тренировки, кроме бассейна.
function pushCooldown(out, day) {
  const items = cooldownFor(day);
  if (!items || !items.length) return;
  out.push({
    kind: 'cooldown', title: 'Заминка',
    subtitle: 'Разгрузка и растяжка — 3–4 минуты',
    items,
  });
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

// Коды секторов вида «1A, 1B, 2A…»: цифра — километр по нарастающей дистанции
// (0–1 км → «1», 1–2 км → «2», …), буква — порядковый сектор внутри этого километра.
// Километр определяется по суммарной дистанции ДО начала сектора. Если дистанции
// нет (кардио по времени) — все попадают в «1», буквы идут подряд.
function sectorCodes(sectors) {
  let cum = 0;
  const counts = {};
  return (sectors || []).map((s) => {
    const km = Math.floor(cum) + 1;
    const li = counts[km] || 0;
    counts[km] = li + 1;
    const letter = li < 26 ? String.fromCharCode(65 + li) : String(li + 1);
    cum += parseFloat(s.distance) || 0;
    return `${km}${letter}`;
  });
}

// Набор высоты в метрах: наклон — это проценты (подъём на единицу горизонтали),
// поэтому подъём сектора = дистанция × наклон/100. Сумма по всем секторам, км → м.
// Та же формула строит профиль «горы» в визуале подъёма.
export function sectorElevationGain(sectors) {
  return (sectors || []).reduce((acc, s) => {
    const d = parseFloat(s.distance) || 0;
    const incl = parseFloat(s.incline) || 0;
    return acc + d * (incl / 100);
  }, 0) * 1000;
}

// Единицы целей: дистанция — км, время — минуты, высота — метры.
export const SECTOR_METRICS = {
  distance:  { label: 'Дистанция', unit: 'км',  goalLabel: 'Цель по дистанции, км',   ph: '3'   },
  time:      { label: 'Время',     unit: 'мин', goalLabel: 'Цель по времени, мин',    ph: '40'  },
  elevation: { label: 'Высота',    unit: 'м',   goalLabel: 'Цель по набору высоты, м', ph: '700' },
};

// Достигнуто в единицах цели: дистанция — сумма км; время — максимум по нарастающему
// таймеру дорожки (последнее показание), приведённое к минутам; высота — набор в метрах.
function sectorAchieved(data) {
  if (!data) return 0;
  if (data.metric === 'time') {
    const maxSec = (data.sectors || []).reduce((mx, s) => Math.max(mx, parseClock(s.clock)), 0);
    return maxSec / 60; // минуты
  }
  if (data.metric === 'elevation') {
    return sectorElevationGain(data.sectors); // метры
  }
  return (data.sectors || []).reduce((acc, s) => acc + (parseFloat(s.distance) || 0), 0); // км
}

function sectorGoalReached(data) {
  const target = parseFloat(data && data.target) || 0;
  if (target <= 0) return false;
  return sectorAchieved(data) + 1e-9 >= target;
}

function trimNum(n) { return String(+(Number(n).toFixed(2))); }

// Метры показываем целыми (670, а не 670.4), км и минуты — с десятыми.
function fmtGoal(n, isElev) { return isElev ? String(Math.round(n)) : trimNum(n); }

export function GuidedWorkout({ dayPlan, records, onClose, onComplete, minimized, onMinimize, onExpand }) {
  const t = useTheme();
  const steps = useMemo(() => buildSteps(dayPlan), [dayPlan]);

  const [stepIdx, setStepIdx] = useState(0);

  // Таймер всей тренировки (пункт 4): отсчёт по метке старта — переживает сворачивание,
  // фон и восстановление черновика (метку кладём в черновик).
  const startedAtRef = useRef(Date.now());
  const [elapsed, setElapsed] = useState(0);
  // Свечение по итогу упражнения (пункт 5).
  const [flash, setFlash] = useState(null);
  const flashTimerRef = useRef(null);
  // Модалка-подсказка «как выполнять» (пункт 6).
  const [guideFor, setGuideFor] = useState(null);

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
  // Отметки «сделано» на шаге заминки (ключ — индекс упражнения заминки). В базу не пишем.
  const [cooldownDone, setCooldownDone] = useState({});
  // Выбранный вариант упражнения заминки (ключ — индекс, значение — номер варианта).
  // 0 = основное упражнение, дальше — замены из cooldown.js.
  const [cooldownPick, setCooldownPick] = useState({});
  // Итоговый экран: сон, энергия, тяжесть тренировки, общее самочувствие.
  const [summary, setSummary] = useState({ sleep: '', energy: 3, difficulty: 3, feeling: '' });
  const [saving, setSaving] = useState(false);

  // Живой отсчёт времени тренировки (обновляем раз в секунду).
  useEffect(() => {
    const id = setInterval(() => {
      setElapsed(Math.round((Date.now() - startedAtRef.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // ---- Восстановление черновика ----
  const draftRef = useRef(null);
  const [restoreOffer, setRestoreOffer] = useState(() => {
    const d = readDraft();
    if (d && dayPlan && d.day === dayPlan.day) { draftRef.current = d; return true; }
    return false;
  });
  const [draftSavedAt, setDraftSavedAt] = useState(0);

  const applyDraft = () => {
    const d = draftRef.current;
    if (d) {
      const ex = pickByKind(d.exLogs, steps, 'exercise');
      const notes = pickByKind(d.exNotes, steps, 'exercise');
      const cardio = { ...pickByKind(d.cardioLogs, steps, 'cardio'), ...pickByKind(d.cardioLogs, steps, 'pool') };
      const sectors = pickByKind(d.sectorLogs, steps, 'sectors');
      setExLogs((prev) => ({ ...prev, ...ex }));
      setExNotes((prev) => ({ ...prev, ...notes }));
      setCardioLogs((prev) => ({ ...prev, ...cardio }));
      setSectorLogs((prev) => ({ ...prev, ...sectors }));
      if (d.cooldownDone) setCooldownDone(d.cooldownDone);
      if (d.cooldownPick) setCooldownPick(d.cooldownPick);
      if (d.summary) setSummary((prev) => ({ ...prev, ...d.summary }));
      if (d.startedAt) startedAtRef.current = d.startedAt; // продолжаем отсчёт времени с момента старта
      setStepIdx(Math.min(steps.length - 1, Math.max(0, parseInt(d.stepIdx, 10) || 0)));
    }
    setRestoreOffer(false);
  };

  const dropDraft = () => {
    clearDraft();
    draftRef.current = null;
    setRestoreOffer(false);
  };

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
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    cancelBotAlert();
    try { audioRef.current && audioRef.current.close(); } catch (e) { /* no-op */ }
  }, [cancelBotAlert]);

  // ---- Автосейв черновика ----
  // Актуальный снимок состояния держим в ref, чтобы записать его синхронно,
  // когда приложение уходит в фон (в этот момент React уже может не успеть отработать).
  const snapshotRef = useRef(null);
  snapshotRef.current = {
    day: dayPlan && dayPlan.day, title: dayPlan && dayPlan.title,
    stepIdx, exLogs, cardioLogs, sectorLogs, exNotes, cooldownDone, cooldownPick, summary,
    startedAt: startedAtRef.current,
  };

  useEffect(() => {
    if (restoreOffer || saving) return undefined; // не затираем черновик до решения пользователя
    const id = setTimeout(() => {
      if (writeDraft(snapshotRef.current)) setDraftSavedAt(Date.now());
    }, 400);
    return () => clearTimeout(id);
  }, [restoreOffer, saving, stepIdx, exLogs, cardioLogs, sectorLogs, exNotes, cooldownDone, cooldownPick, summary]);

  useEffect(() => {
    const flush = () => {
      if (restoreOffer || saving) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') return;
      writeDraft(snapshotRef.current);
    };
    document.addEventListener('visibilitychange', flush);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', flush);
      window.removeEventListener('pagehide', flush);
    };
  }, [restoreOffer, saving]);

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
  const toggleCooldown = (i) => setCooldownDone((prev) => ({ ...prev, [i]: !prev[i] }));

  // Перебор вариантов упражнения заминки по кругу. Отметку «сделано» сбрасываем:
  // упражнение поменялось, значит его ещё не делали.
  const swapCooldown = (i, total) => {
    setCooldownPick((prev) => ({ ...prev, [i]: (((prev[i] || 0) + 1) % Math.max(1, total)) }));
    setCooldownDone((prev) => (prev[i] ? { ...prev, [i]: false } : prev));
  };

  // Название маршрута с первого секторного шага, где он был выбран. Этап
  // дописываем, чтобы «этап 2 из 3» не потерялся в истории.
  const pickedRouteName = () => {
    for (let i = 0; i < steps.length; i += 1) {
      if (steps[i].kind !== 'sectors') continue;
      const c = sectorLogs[i] && sectorLogs[i].climb;
      if (c && c.name) {
        return c.stages > 1 ? `${c.name} · этап ${c.stage}/${c.stages}` : c.name;
      }
    }
    return null;
  };

  const finish = () => {
    // Упражнения → агрегат (число) + setLog + заметка. Пустые (без данных и заметки) пропускаем.
    const outEx = [];
    steps.forEach((s, i) => {
      if (s.kind !== 'exercise') return;
      const log = exLogs[i] || [];
      const timed = isTimeBasedExercise(s.name);
      const weightless = isWeightlessExercise(s.name) || timed;
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
        ...(timed ? { timed: true } : {}),
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
      const codes = sectorCodes(data.sectors); // «1A», «1B», «2A»… по километрам (совпадает с UI)
      let prevCum = 0;
      (data.sectors || []).forEach((sec, si) => {
        const cumSec = parseClock(sec.clock);
        const dist = parseFloat(sec.distance) || 0, spd = parseFloat(sec.speed) || 0, incl = parseFloat(sec.incline) || 0;
        if (dist <= 0 && spd <= 0 && incl <= 0 && cumSec <= 0) return;
        const deltaSec = cumSec > 0 ? Math.max(0, cumSec - prevCum) : 0;
        if (cumSec > 0) prevCum = cumSec;
        outCardio.push({
          name: `Сектор ${codes[si]}`,
          distance: dist, speed: spd, incline: incl,
          duration: deltaSec ? Math.round(deltaSec / 60) : 0,
          durationSec: deltaSec || 0,
        });
      });
    });

    clearTimer();
    cancelBotAlert();

    if (outEx.length === 0 && outCardio.length === 0) { clearDraft(); onClose(); return; }

    const session = {
      id: `${todayISO()}-${Date.now()}`,
      date: todayISO(),
      exercises: outEx,
      cardio: outCardio,
      sleep: summary.sleep ? Math.max(0, parseFloat(summary.sleep)) : null,
      energy: summary.energy || 3,
      difficulty: summary.difficulty || null,
      durationSec: Math.max(0, Math.round((Date.now() - startedAtRef.current) / 1000)),
      feeling: (summary.feeling || '').trim(),
      programDay: dayPlan.day || null,
      // Если на кардио-дне был выбран готовый маршрут — сохраняем его название,
      // чтобы в «Прогрессе» тренировка называлась «Озеро Зеркальное», а не
      // безликим «Кардио по секторам».
      routeName: pickedRouteName(),
    };
    setSaving(true);
    clearDraft(); // данные ушли в базу — черновик больше не нужен
    onComplete(session);
  };

  const advance = () => {
    if (isLast) { finish(); return; }
    setStepIdx((i) => Math.min(steps.length - 1, i + 1));
  };

  const goNext = () => {
    if (flash) return; // идёт анимация свечения — ждём
    if (restActiveRef.current) skipRest();
    if (isLast) { finish(); return; }
    // На шаге упражнения — свечение по итогу (зелёное/красное/синее), затем переход.
    if (step.kind === 'exercise') {
      const res = evalExercise(step, exLogs[stepIdx] || [], records);
      if (res) {
        setFlash(res);
        flashTimerRef.current = setTimeout(() => {
          flashTimerRef.current = null;
          setFlash(null);
          advance();
        }, res.duration || 1700);
        try {
          const tg = window.Telegram && window.Telegram.WebApp;
          if (tg && tg.HapticFeedback) {
            tg.HapticFeedback.notificationOccurred(res.type === 'red' || res.type === 'wasted' ? 'warning' : 'success');
          }
        } catch (e) { /* no-op */ }
        return;
      }
    }
    advance();
  };
  const goPrev = () => {
    if (flash) return;
    if (restActiveRef.current) skipRest();
    setStepIdx((i) => Math.max(0, i - 1));
  };

  if (!step) {
    return null;
  }

  const progressPct = Math.round(((stepIdx + 1) / steps.length) * 100);
  const shortNameOf = (st) => (!st ? null
    : st.kind === 'exercise' ? st.name
    : st.kind === 'summary' ? 'Итог тренировки'
    : (st.title || st.name || 'Тренировка'));
  const stepShort = shortNameOf(step);
  // Что будет после текущего шага — показываем прямо на упражнении, чтобы
  // не гадать, сколько ещё осталось и к чему готовиться.
  const nextShort = shortNameOf(steps[stepIdx + 1]);

  // Секторы для «Горы» на итоговом экране: собираем со всех секторных шагов
  // в порядке прохождения. Пустые (без дистанции) отсеет сам MountainBox.
  const mountainSectors = [];
  let mountainClimb = null;
  steps.forEach((s, i) => {
    if (s.kind !== 'sectors') return;
    const data = sectorLogs[i];
    if (data && data.climb && !mountainClimb) mountainClimb = data.climb;
    (data && data.sectors ? data.sectors : []).forEach((sec) => {
      mountainSectors.push({
        distance: parseFloat(sec.distance) || 0,
        incline: parseFloat(sec.incline) || 0,
      });
    });
  });

  // ---- Свёрнутый режим (пункт 3): узкая плашка над таб-баром, тап — развернуть ----
  if (minimized) {
    return (
      <div
        role="button"
        onClick={onExpand}
        style={{
          position: 'fixed', left: 0, right: 0, zIndex: 1001,
          bottom: 'calc(88px + env(safe-area-inset-bottom))',
          display: 'flex', justifyContent: 'center',
          padding: '0 max(14px, env(safe-area-inset-right)) 0 max(14px, env(safe-area-inset-left))',
          pointerEvents: 'none',
        }}
      >
        <div style={{
          pointerEvents: 'auto', width: '100%', maxWidth: 480, boxSizing: 'border-box',
          display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
          padding: '10px 14px', borderRadius: 14,
          background: 'rgba(23,21,18,0.72)', backdropFilter: 'blur(18px) saturate(1.35)', WebkitBackdropFilter: 'blur(18px) saturate(1.35)',
          border: `1px solid ${restActive ? t.ACCENT_BORDER : 'rgba(184,146,74,0.4)'}`,
          boxShadow: '0 10px 30px rgba(0,0,0,0.45), 0 0 26px rgba(184,146,74,0.35)',
        }}>
          <span style={{
            flexShrink: 0, width: 30, height: 30, borderRadius: 9, background: t.ACCENT_BG, color: t.ACCENT_SOFT,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Play size={15} />
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{
              fontSize: 10, fontWeight: 700, color: t.ACCENT_SOFT, textTransform: 'uppercase',
              letterSpacing: '0.09em', fontFamily: t.FONT_MONO,
            }}>
              Тренировка · {fmtElapsed(elapsed)}{restActive ? ` · отдых ${fmtClock(restRemaining)}` : ''}
            </div>
            <div style={{
              fontSize: 13.5, fontWeight: 700, color: t.TEXT, marginTop: 1,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {stepShort}
            </div>
          </div>
          <span style={{
            flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 11.5, fontWeight: 700, color: t.ACCENT_SOFT,
          }}>
            <ChevronUp size={17} /> Развернуть
          </span>
        </div>
      </div>
    );
  }

  const btnBase = {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
    borderRadius: 14, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
    padding: '14px 16px', boxSizing: 'border-box',
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000, background: t.BG,
      display: 'flex', flexDirection: 'column',
      fontFamily: t.FONT,
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

        /* Свечение по итогу упражнения (пункт 5): поднимается снизу, из-под кнопок. Без текста. */
        @keyframes flashRise { 0% { opacity: 0; transform: translateY(34px); } 24% { opacity: 1; transform: translateY(0); } 58% { opacity: 1; } 100% { opacity: 0; transform: translateY(0); } }
        @media (prefers-reduced-motion: reduce) {
          .guided-step-in { animation-duration: 1ms; }
        }
      `}</style>

      {/* Свечение по итогу упражнения (пункт 5): только свет снизу, из-под блока кнопок, без текста */}
      {flash && (
        <div aria-hidden style={{
          position: 'absolute', inset: 0, zIndex: 60, pointerEvents: 'none', overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', left: 0, right: 0, bottom: 0, height: '72%',
            background: `radial-gradient(135% 100% at 50% 100%, ${flash.color}82 0%, ${flash.color}3A 28%, ${flash.color}14 48%, transparent 68%)`,
            animation: `flashRise ${flash.duration}ms cubic-bezier(0.2,0.75,0.2,1) forwards`,
          }} />
        </div>
      )}

      {/* Подсказка «как выполнять» (пункт 6) */}
      {guideFor && <GuideModal name={guideFor} onClose={() => setGuideFor(null)} />}

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
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span>Шаг {stepIdx + 1} из {steps.length}</span>
              <span style={{ color: t.TEXT_FAINT }}>·</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: t.TEXT_DIM }}>
                <Timer size={11} />{fmtElapsed(elapsed)}
              </span>
            </div>
            <div style={{
              fontSize: 17, fontWeight: 700, color: t.TEXT, marginTop: 3,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {dayPlan.title}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            {onMinimize && (
              <button
                onClick={onMinimize}
                aria-label="Свернуть тренировку"
                title="Свернуть — тренировка не закроется"
                style={{
                  width: 40, height: 40, borderRadius: 11, border: `1px solid ${t.BORDER}`,
                  background: t.BG_INPUT, color: t.TEXT_DIM, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <ChevronDown size={18} />
              </button>
            )}
            <button
              onClick={() => { clearTimer(); cancelBotAlert(); onClose(); }}
              aria-label="Закрыть"
              style={{
                width: 40, height: 40, borderRadius: 11, border: `1px solid ${t.BORDER}`,
                background: t.BG_INPUT, color: t.TEXT_DIM, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>
        <div style={{ maxWidth: 480, margin: '12px auto 0', height: 5, borderRadius: 3, background: t.BG_INPUT, overflow: 'hidden' }}>
          <div style={{ width: `${progressPct}%`, height: '100%', background: t.ACCENT_GRAD, transition: 'width 0.3s ease' }} />
        </div>
        {draftSavedAt > 0 && (
          <div style={{
            maxWidth: 480, margin: '7px auto 0', fontSize: 10, color: t.TEXT_FAINT,
            fontFamily: t.FONT_MONO, display: 'flex', alignItems: 'center', gap: 5,
          }}>
            <Check size={11} /> черновик сохранён на устройстве
          </div>
        )}
      </div>

      {/* Тело шага */}
      <div ref={scrollRef} style={{
        flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', position: 'relative',
        padding: '20px max(16px, env(safe-area-inset-right)) 24px max(16px, env(safe-area-inset-left))',
      }}>
        <div key={stepIdx} className="guided-step-in" style={{ maxWidth: 480, margin: '0 auto' }}>
          {step.kind === 'exercise' ? (
            <ExerciseStep
              step={step} sets={exLogs[stepIdx] || []} onSet={setExSet}
              records={records} note={exNotes[stepIdx] || ''} onNote={setExNote}
              onGuide={() => setGuideFor(step.name)}
              nextName={nextShort}
            />
          ) : step.kind === 'sectors' ? (
            <SectorsStep
              step={step} data={sectorLogs[stepIdx]}
              onMeta={setSectorMeta} onField={setSectorField} onAdd={addSector} onRemove={removeSector}
            />
          ) : step.kind === 'cooldown' ? (
            <CooldownStep
              step={step} done={cooldownDone} onToggle={toggleCooldown}
              pick={cooldownPick} onSwap={swapCooldown}
            />
          ) : step.kind === 'summary' ? (
            <SummaryStep
              summary={summary}
              onChange={(patch) => setSummary((prev) => ({ ...prev, ...patch }))}
              mountainSectors={mountainSectors}
              mountainClimb={mountainClimb}
            />
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
              const mKey = (secData && secData.metric) || 'distance';
              const isElevGoal = mKey === 'elevation';
              const unit = (SECTOR_METRICS[mKey] || SECTOR_METRICS.distance).unit;
              if (target <= 0) lockedLabel = 'Укажи цель тренировки';
              else lockedLabel = `Осталось ${fmtGoal(Math.max(0, target - sectorAchieved(secData)), isElevGoal)} ${unit}`;
            }
            const disabled = finishLocked || saving || !!flash;
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
                  transition: 'background 0.25s ease, box-shadow 0.25s ease',
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

      {/* Предложение продолжить незавершённую тренировку */}
      {restoreOffer && draftRef.current && (
        <RestoreOverlay draft={draftRef.current} onRestore={applyDraft} onDrop={dropDraft} />
      )}
    </div>
  );
}

function RestoreOverlay({ draft, onRestore, onDrop }) {
  const t = useTheme();
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.62)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{
        maxWidth: 380, width: '100%', background: t.BG_RAISED, border: `1px solid ${t.BORDER}`,
        borderRadius: 20, padding: '20px', boxShadow: t.CARD_SHADOW,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <span style={{
            width: 30, height: 30, borderRadius: 9, background: t.ACCENT_BG, color: t.ACCENT_SOFT,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <RotateCcw size={16} />
          </span>
          <div style={{ fontSize: 16.5, fontWeight: 700, color: t.TEXT }}>Есть незавершённая тренировка</div>
        </div>
        <div style={{ fontSize: 13.5, color: t.TEXT_DIM, lineHeight: 1.5, marginBottom: 16 }}>
          {draft.title ? `«${draft.title}» · ` : ''}черновик от {fmtSavedAt(draft.savedAt)}.
          Можно продолжить с того шага, где остановился, — все подходы и заметки на месте.
        </div>
        <button
          onClick={onRestore}
          style={{
            width: '100%', padding: '14px', borderRadius: 14, border: 'none', marginBottom: 9,
            background: t.ACCENT_GRAD, color: t.ON_ACCENT, fontSize: 15, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit', boxShadow: t.GLOW,
          }}
        >
          Продолжить тренировку
        </button>
        <button
          onClick={onDrop}
          style={{
            width: '100%', padding: '13px', borderRadius: 14, border: `1px solid ${t.BORDER}`,
            background: 'transparent', color: t.TEXT_DIM, fontSize: 14, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          Начать заново
        </button>
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

function ExerciseStep({ step, sets, onSet, records, note, onNote, onGuide, nextName }) {
  const t = useTheme();
  const timed = isTimeBasedExercise(step.name);
  const weightless = isWeightlessExercise(step.name) || timed;
  const record = records && records[step.name];
  const hasGuide = !!getExerciseGuide(step.name);

  // Текст рекорда: вес / повторы / секунды в зависимости от типа упражнения.
  let recordText = null;
  if (record) {
    if (record.weight) recordText = `${record.weight} кг`;
    else if (record.metric === 'sec') recordText = `${record.value} сек`;
    else if (record.metric === 'reps') recordText = `${record.value} повт`;
  }

  return (
    <div>
      <StepHeader name={step.name} badgeName={step.name} subtitle={null} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
        <span style={{
          fontSize: 12, fontWeight: 700, color: t.ACCENT_SOFT, background: t.ACCENT_BG,
          padding: '5px 10px', borderRadius: 8, fontFamily: t.FONT_MONO,
        }}>
          Цель: {step.targetReps ? `${step.targetReps} ${timed ? 'сек' : 'повт'}` : (timed ? 'на время' : '—')} · {sets.length} подх
        </span>
        {recordText ? (
          <span style={{
            fontSize: 12, fontWeight: 700, color: t.TEXT_DIM, background: t.BG_INPUT,
            padding: '5px 10px', borderRadius: 8, display: 'inline-flex', alignItems: 'center', gap: 5,
          }}>
            <Flame size={12} /> Рекорд {recordText}
          </span>
        ) : null}
        {hasGuide && (
          <button
            onClick={onGuide}
            style={{
              fontSize: 12, fontWeight: 700, color: t.ACCENT_SOFT, background: 'transparent',
              border: `1px solid ${t.ACCENT_BORDER}`, padding: '5px 10px', borderRadius: 8,
              display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            <HelpCircle size={13} /> Как выполнять
          </button>
        )}
        {nextName && (
          <span style={{
            fontSize: 12, fontWeight: 600, color: t.TEXT_FAINT, background: t.BG_INPUT,
            padding: '5px 10px', borderRadius: 8, display: 'inline-flex', alignItems: 'center',
            gap: 5, maxWidth: '100%', minWidth: 0,
          }}>
            <ChevronRight size={12} style={{ flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Далее: {nextName}
            </span>
          </span>
        )}
      </div>

      <div>
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
                <Field label={timed ? 'Секунды' : 'Повторы'}>
                  <input
                    style={getInputStyle(t)}
                    type="number" inputMode="numeric" min="0"
                    value={s.reps}
                    onChange={(e) => onSet(si, { reps: e.target.value })}
                    placeholder={timed ? '60' : (step.targetReps || '0')}
                  />
                </Field>
              </div>
            </div>
          );
        })}
      </div>

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

function CooldownStep({ step, done, onToggle, pick, onSwap }) {
  const t = useTheme();
  const items = step.items || [];
  const doneCount = items.filter((_, i) => done[i]).length;

  return (
    <div>
      <StepHeader icon={Wind} name={step.title} subtitle={step.subtitle} />

      <div style={{
        fontSize: 12.5, color: t.TEXT_DIM, lineHeight: 1.55, marginBottom: 14,
        background: t.BG_INPUT, border: `1px solid ${t.BORDER}`, borderRadius: 12, padding: '11px 13px',
      }}>
        Записывать ничего не нужно — просто отметь, что сделал. Тянем на выдохе, спокойно,
        до ощущения натяжения, а не боли. Никаких пружинящих рывков.
        Если упражнение не подходит (нет места, ноет сустав) — жми «заменить»,
        подставится другой вариант на ту же зону.
      </div>

      <div style={{
        fontSize: 11, fontWeight: 700, color: doneCount === items.length ? t.POSITIVE : t.TEXT_FAINT,
        textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: t.FONT_MONO, marginBottom: 10,
      }}>
        Сделано {doneCount} из {items.length}
      </div>

      {items.map((it, i) => {
        const isDone = !!done[i];
        // Варианты слота: основное упражнение + замены из src/cooldown.js.
        // Кнопка «заменить» перебирает их по кругу, выбор хранится в pick[i].
        const variants = variantsOf(it);
        const idx = (pick && pick[i]) || 0;
        const cur = variants[idx] || variants[0] || it;
        const hasAlts = variants.length > 1;

        return (
          <div
            key={i}
            style={{
              boxSizing: 'border-box',
              background: isDone ? t.POSITIVE_BG : t.BG_RAISED,
              border: `1px solid ${isDone ? t.POSITIVE : t.BORDER}`,
              borderRadius: 16, marginBottom: 12,
              boxShadow: isDone ? 'none' : t.CARD_SHADOW,
              transition: 'background 0.2s ease, border-color 0.2s ease',
              overflow: 'hidden',
            }}
          >
            <button
              onClick={() => onToggle(i)}
              style={{
                display: 'block', width: '100%', textAlign: 'left', boxSizing: 'border-box',
                background: 'transparent', border: 'none', padding: '13px 14px 11px',
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11 }}>
                <span style={{ flexShrink: 0, color: isDone ? t.POSITIVE : t.TEXT_FAINT, marginTop: 1 }}>
                  {isDone ? <CheckCircle2 size={20} /> : <Circle size={20} />}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 14.5, fontWeight: 700, color: t.TEXT, marginBottom: 3,
                    textDecoration: isDone ? 'line-through' : 'none',
                    textDecorationColor: t.TEXT_FAINT,
                  }}>
                    {cur.name}
                  </div>
                  <div style={{
                    fontSize: 12, fontWeight: 700, color: isDone ? t.POSITIVE : t.ACCENT_SOFT,
                    fontFamily: t.FONT_MONO, marginBottom: 6,
                  }}>
                    {cur.dose}
                  </div>
                  <div style={{ fontSize: 12.5, color: t.TEXT_DIM, lineHeight: 1.45 }}>{cur.hint}</div>
                </div>
              </div>
            </button>

            {hasAlts && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                padding: '0 14px 11px 46px',
              }}>
                <span style={{
                  fontSize: 10.5, fontWeight: 700, color: t.TEXT_FAINT,
                  fontFamily: t.FONT_MONO, letterSpacing: '0.06em',
                }}>
                  {idx + 1} / {variants.length}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); onSwap(i, variants.length); }}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    background: t.BG_INPUT, border: `1px solid ${t.BORDER}`, borderRadius: 999,
                    padding: '6px 12px', cursor: 'pointer', fontFamily: 'inherit',
                    fontSize: 11.5, fontWeight: 700, color: t.TEXT_DIM,
                  }}
                >
                  <Shuffle size={13} />
                  заменить
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Шкала 1–5 (энергия, тяжесть тренировки и т.п.).
function Scale1to5({ label, value, onChange }) {
  const t = useTheme();
  return (
    <Field label={label}>
      <div style={{ display: 'flex', gap: 4, paddingTop: 2 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            onClick={() => onChange(n)}
            style={{
              flex: 1, height: 38, borderRadius: 8,
              border: `1px solid ${n <= value ? t.ACCENT : t.BORDER}`,
              background: n <= value ? t.ACCENT : 'transparent', cursor: 'pointer',
            }}
          />
        ))}
      </div>
    </Field>
  );
}

function SummaryStep({ summary, onChange, mountainSectors, mountainClimb }) {
  const t = useTheme();
  // Гора-награда: только для кардио-дня по секторам, где есть дистанция и наклон.
  const gainM = Math.round(sectorElevationGain(mountainSectors));
  const totalKm = (mountainSectors || []).reduce((a, s) => a + (parseFloat(s.distance) || 0), 0);
  const showMountain = totalKm > 0;

  return (
    <div>
      <StepHeader icon={CheckCircle2} name="Итог тренировки" subtitle="Сон, энергия, тяжесть — и сохраняем" />

      {showMountain && (
        <div style={{ marginBottom: 18 }}>
          <MountainBox sectors={mountainSectors} />
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 9,
            fontFamily: t.FONT_MONO, fontSize: 11.5, color: t.TEXT_DIM,
          }}>
            <span>{Math.round(totalKm * 100) / 100} км</span>
            <span style={{ color: t.ACCENT_SOFT, fontWeight: 700 }}>↑ {gainM} м</span>
          </div>
          {mountainClimb && (
            <div style={{ marginTop: 7, fontSize: 12.5, color: t.TEXT_DIM, lineHeight: 1.45 }}>
              <span style={{ fontWeight: 700, color: t.TEXT }}>{mountainClimb.name}</span>
              {mountainClimb.stages > 1 && ` · этап ${mountainClimb.stage} из ${mountainClimb.stages}`}
              {' · '}{mountainClimb.place}
            </div>
          )}
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <Field label="Сон, часы">
          <input
            style={getInputStyle(t)} type="number" inputMode="decimal" min="0"
            value={summary.sleep} onChange={(e) => onChange({ sleep: e.target.value })}
            placeholder="7.5"
          />
        </Field>
        <Scale1to5 label="Энергия" value={summary.energy} onChange={(n) => onChange({ energy: n })} />
      </div>
      <div style={{ marginBottom: 16 }}>
        <Scale1to5 label="Тяжесть тренировки" value={summary.difficulty} onChange={(n) => onChange({ difficulty: n })} />
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

// Модалка-подсказка «как выполнять» (пункт 6): техника по шагам, частые ошибки, мышцы.
function GuideModal({ name, onClose }) {
  const t = useTheme();
  const guide = getExerciseGuide(name);
  if (!guide) return null;
  const section = (title, items, color, ordered) => (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        fontSize: 10.5, fontWeight: 700, color, textTransform: 'uppercase',
        letterSpacing: '0.1em', marginBottom: 8, fontFamily: t.FONT_MONO,
      }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((line, i) => (
          <div key={i} style={{ display: 'flex', gap: 9, fontSize: 13.5, color: t.TEXT_DIM, lineHeight: 1.45 }}>
            <span style={{
              flexShrink: 0, minWidth: ordered ? 20 : 12, color, fontWeight: 700, fontFamily: t.FONT_MONO, fontSize: ordered ? 13 : 15,
            }}>{ordered ? `${i + 1}.` : '·'}</span>
            <span>{line}</span>
          </div>
        ))}
      </div>
    </div>
  );

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
        style={{
          width: '100%', maxWidth: 480, maxHeight: '82vh', overflowY: 'auto', WebkitOverflowScrolling: 'touch',
          background: t.BG_RAISED, border: `1px solid ${t.BORDER}`,
          borderTopLeftRadius: 22, borderTopRightRadius: 22,
          padding: '18px max(18px, env(safe-area-inset-right)) calc(24px + env(safe-area-inset-bottom)) max(18px, env(safe-area-inset-left))',
          boxShadow: '0 -12px 40px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
            <MuscleBadge name={name} size={26} />
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: t.TEXT, lineHeight: 1.15 }}>{name}</h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Закрыть подсказку"
            style={{
              flexShrink: 0, width: 34, height: 34, borderRadius: 10, border: `1px solid ${t.BORDER}`,
              background: t.BG_INPUT, color: t.TEXT_DIM, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {guide.muscles && guide.muscles.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 18 }}>
            {guide.muscles.map((m) => (
              <span key={m} style={{
                fontSize: 11.5, fontWeight: 700, color: t.ACCENT_SOFT, background: t.ACCENT_BG,
                padding: '4px 9px', borderRadius: 7,
              }}>{m}</span>
            ))}
          </div>
        )}

        {guide.steps && section('Как выполнять', guide.steps, t.POSITIVE, true)}
        {guide.mistakes && section('Частые ошибки', guide.mistakes, t.ACCENT_SOFT, false)}
      </div>
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
                style={getInputStyle(t)} type="number" inputMode="decimal" min="0" max={MAX_INCLINE}
                value={value.incline || ''} onChange={(e) => onChange({ incline: clampIncline(e.target.value) })}
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
  const codes = sectorCodes(d.sectors); // подписи секторов «1A, 1B, 2A…» по километрам
  const isTime = d.metric === 'time';
  const isElev = d.metric === 'elevation';
  const M = SECTOR_METRICS[d.metric] || SECTOR_METRICS.distance;
  const unit = M.unit;
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
        onClick={() => onMeta(active ? { metric: key } : { metric: key, target: '', climb: null })}
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
          {metricBtn('distance', SECTOR_METRICS.distance.label)}
          {metricBtn('time', SECTOR_METRICS.time.label)}
          {metricBtn('elevation', SECTOR_METRICS.elevation.label)}
        </div>
        <Field label={M.goalLabel}>
          <input
            style={getInputStyle(t)} type="number" inputMode="decimal" min="0"
            value={d.target || ''} onChange={(e) => onMeta({ target: e.target.value })}
            placeholder={d.metric === 'distance' ? (step.planDistance || M.ph) : M.ph}
          />
        </Field>
        {isElev && (
          <div style={{ marginTop: 8, fontSize: 11.5, color: t.TEXT_FAINT, lineHeight: 1.45 }}>
            Высота считается из дистанции и наклона каждого сектора: 0.2 км при 25% дают 50 м подъёма.
          </div>
        )}
        {isElev && (
          <ClimbPicker
            currentClimb={d.climb}
            onPick={({ target, sectors, climb }) => onMeta({ target, sectors, climb })}
          />
        )}

        {/* Прогресс к цели */}
        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
            <span style={{ fontSize: 12.5, color: t.TEXT_DIM, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {isElev ? <TrendingUp size={13} /> : <Route size={13} />} {isElev ? 'Набрано' : 'Пройдено'}
            </span>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: reached ? t.POSITIVE : t.TEXT, fontFamily: t.FONT_MONO }}>
              {fmtGoal(achieved, isElev)} / {target > 0 ? fmtGoal(target, isElev) : '—'} {unit}
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
        // Подсвечиваем поля, из которых считается цель: дистанция — км;
        // высота — дистанция и наклон вместе; время — таймер дорожки (ниже).
        const distHighlight = !isTime;
        const inclHighlight = isElev;
        const inputBlock = (key, label, inputMode, highlight) => (
          <div style={{ flex: '1 1 45%', minWidth: 120 }}>
            <Field label={highlight ? `${label} · цель` : label}>
              <input
                style={{
                  ...getInputStyle(t),
                  border: highlight ? `1px solid ${t.ACCENT}` : `1px solid ${t.BORDER}`,
                }}
                type="number" inputMode={inputMode} min="0"
                {...(key === 'incline' ? { max: MAX_INCLINE } : {})}
                value={sec[key] || ''}
                onChange={(e) => onField(si, {
                  [key]: key === 'incline' ? clampIncline(e.target.value) : e.target.value,
                })}
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
                }}>{codes[si]}</span>
                Сектор {codes[si]}
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
              {inputBlock('incline', 'Наклон, %', 'decimal', inclHighlight)}
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
