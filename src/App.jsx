import React, { useState, useEffect, useMemo, useContext, createContext } from 'react';
import { Plus, TrendingUp, TrendingDown, Minus, Dumbbell, Ruler, LineChart as LineIcon, Trash2, X, User, Copy, Flame, Sun, Moon, Pencil, Lock, LogOut } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, Legend } from 'recharts';
import { supabase } from './supabaseClient.js';

const THEMES = {
  dark: {
    ACCENT: '#A8334C', ACCENT_SOFT: '#C4566E', POSITIVE: '#7A8B5C',
    BG: '#1A1816', BG_RAISED: '#231F1C', BG_INPUT: '#2A2522', BORDER: '#38322D',
    TEXT: '#E8E3DB', TEXT_DIM: '#9C9489', TEXT_FAINT: '#6B6459',
  },
  light: {
    ACCENT: '#A8334C', ACCENT_SOFT: '#8C2A3F', POSITIVE: '#5C7048',
    BG: '#FAF7F2', BG_RAISED: '#FFFFFF', BG_INPUT: '#F1EBE2', BORDER: '#D8CFC0',
    TEXT: '#2B2622', TEXT_DIM: '#574E45', TEXT_FAINT: '#7A6F62',
  },
};

const isNightNow = () => {
  const h = new Date().getHours();
  return h >= 19 || h < 7;
};

function getTelegramColorScheme() {
  if (typeof window === 'undefined') return null;
  const tg = window.Telegram && window.Telegram.WebApp;
  if (!tg || !tg.initData) return null; // не в Telegram
  return tg.colorScheme === 'dark' || tg.colorScheme === 'light' ? tg.colorScheme : null;
}

const ThemeContext = createContext(THEMES.dark);

function useTheme() {
  return useContext(ThemeContext);
}

function useThemeController() {
  const tgScheme = useMemo(() => getTelegramColorScheme(), []);
  const [mode, setMode] = useState('auto'); // 'auto' | 'light' | 'dark'
  const [autoIsDark, setAutoIsDark] = useState(() => (tgScheme ? tgScheme === 'dark' : isNightNow()));

  useEffect(() => {
    if (tgScheme) {
      // В Telegram следим за сменой темы пользователем в настройках Telegram
      const tg = window.Telegram.WebApp;
      const handler = () => setAutoIsDark(tg.colorScheme === 'dark');
      tg.onEvent && tg.onEvent('themeChanged', handler);
      return () => { tg.offEvent && tg.offEvent('themeChanged', handler); };
    }
    // Вне Telegram — по времени суток, как раньше
    const id = setInterval(() => setAutoIsDark(isNightNow()), 60000);
    return () => clearInterval(id);
  }, [tgScheme]);

  const isDark = mode === 'auto' ? autoIsDark : mode === 'dark';
  const theme = isDark ? THEMES.dark : THEMES.light;
  const cycle = () => setMode((m) => (m === 'auto' ? 'light' : m === 'light' ? 'dark' : 'auto'));

  return { theme, mode, isDark, cycle };
}

const pad2 = (n) => String(n).padStart(2, '0');

const toISO = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const todayISO = () => toISO(new Date());

const shiftDate = (iso, days) => {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return toISO(dt);
};

const fmtDateShort = (iso) => {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
};

const fmtDateFull = (iso) => {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' });
};

// ------- Преобразование между форматом БД (snake_case) и форматом приложения (camelCase) -------

function sessionFromRow(row) {
  return {
    id: row.id,
    date: row.date,
    exercises: row.exercises || [],
    cardio: row.cardio || [],
    sleep: row.sleep,
    energy: row.energy,
    feeling: row.feeling || '',
    programDay: row.program_day,
  };
}

function sessionToRow(s, userId) {
  return {
    id: s.id,
    user_id: userId,
    date: s.date,
    exercises: s.exercises || [],
    cardio: s.cardio || [],
    sleep: s.sleep,
    energy: s.energy,
    feeling: s.feeling || '',
    program_day: s.programDay,
  };
}

function measurementFromRow(row) {
  return { id: row.id, date: row.date, weight: row.weight };
}

function measurementToRow(m, userId) {
  return { id: m.id, user_id: userId, date: m.date, weight: m.weight };
}

function profileFromRow(row) {
  if (!row) return {};
  return {
    lastProgramDay: row.last_program_day,
    height: row.height,
    waist: row.waist,
    hips: row.hips,
    chest: row.chest,
    shoulders: row.shoulders,
    bodyFat: row.body_fat,
    updatedAt: row.updated_at,
  };
}

function profileToRow(p, userId) {
  return {
    user_id: userId,
    last_program_day: p.lastProgramDay ?? null,
    height: p.height ?? null,
    waist: p.waist ?? null,
    hips: p.hips ?? null,
    chest: p.chest ?? null,
    shoulders: p.shoulders ?? null,
    body_fat: p.bodyFat ?? null,
    updated_at: p.updatedAt ?? null,
  };
}

function useStorage(userId) {
  const [sessions, setSessions] = useState(null);
  const [measurements, setMeasurements] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!userId) return;
    setLoaded(false);
    (async () => {
      try {
        const [sessionsRes, measurementsRes, profileRes] = await Promise.all([
          supabase.from('sessions').select('*').eq('user_id', userId).order('date', { ascending: true }),
          supabase.from('measurements').select('*').eq('user_id', userId).order('date', { ascending: true }),
          supabase.from('profile').select('*').eq('user_id', userId).maybeSingle(),
        ]);

        if (sessionsRes.error) throw sessionsRes.error;
        if (measurementsRes.error) throw measurementsRes.error;
        if (profileRes.error) throw profileRes.error;

        setSessions((sessionsRes.data || []).map(sessionFromRow));
        setMeasurements((measurementsRes.data || []).map(measurementFromRow));
        setProfile(profileFromRow(profileRes.data));
        setLoaded(true);
      } catch (e) {
        setError('Не удалось загрузить данные — проверь подключение к интернету');
        setSessions([]);
        setMeasurements([]);
        setProfile({});
        setLoaded(true);
      }
    })();
  }, [userId]);

  // Сохраняем весь список через upsert + удаление отсутствующих id —
  // так проще переиспользовать логику из артефакта, где saveX(next) перезаписывал весь массив целиком.
  const saveSessions = async (next) => {
    const prev = sessions || [];
    setSessions(next);
    try {
      const prevIds = new Set(prev.map((s) => s.id));
      const nextIds = new Set(next.map((s) => s.id));
      const removedIds = [...prevIds].filter((id) => !nextIds.has(id));

      if (next.length > 0) {
        const { error: upsertErr } = await supabase.from('sessions').upsert(next.map((s) => sessionToRow(s, userId)));
        if (upsertErr) throw upsertErr;
      }
      if (removedIds.length > 0) {
        const { error: delErr } = await supabase.from('sessions').delete().in('id', removedIds);
        if (delErr) throw delErr;
      }
    } catch (e) {
      setError('Не удалось сохранить — попробуй ещё раз');
    }
  };

  const saveMeasurements = async (next) => {
    const prev = measurements || [];
    setMeasurements(next);
    try {
      const prevIds = new Set(prev.map((m) => m.id));
      const nextIds = new Set(next.map((m) => m.id));
      const removedIds = [...prevIds].filter((id) => !nextIds.has(id));

      if (next.length > 0) {
        const { error: upsertErr } = await supabase.from('measurements').upsert(next.map((m) => measurementToRow(m, userId)));
        if (upsertErr) throw upsertErr;
      }
      if (removedIds.length > 0) {
        const { error: delErr } = await supabase.from('measurements').delete().in('id', removedIds);
        if (delErr) throw delErr;
      }
    } catch (e) {
      setError('Не удалось сохранить — попробуй ещё раз');
    }
  };

  const saveProfile = async (next) => {
    setProfile(next);
    try {
      const { error: upsertErr } = await supabase.from('profile').upsert(profileToRow(next, userId));
      if (upsertErr) throw upsertErr;
    } catch (e) {
      setError('Не удалось сохранить — попробуй ещё раз');
    }
  };

  return { sessions, measurements, profile, loaded, error, setError, saveSessions, saveMeasurements, saveProfile };
}

function Pill({ children, active, onClick, icon: Icon }) {
  const t = useTheme();
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        padding: '9px 8px', borderRadius: 10, flex: active ? 1.6 : 0.7, minWidth: 0,
        border: `1px solid ${active ? t.ACCENT : t.BORDER}`,
        background: active ? 'rgba(168,51,76,0.16)' : 'transparent',
        color: active ? t.ACCENT_SOFT : t.TEXT_DIM,
        fontSize: 13, fontWeight: 600, cursor: 'pointer',
        transition: 'flex 0.25s ease, background 0.2s ease, border-color 0.2s ease, color 0.2s ease',
        fontFamily: 'inherit',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}
    >
      {Icon && <Icon size={active ? 14 : 17} strokeWidth={2.2} style={{ flexShrink: 0, transition: 'all 0.2s ease' }} />}
      {active && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{children}</span>}
    </button>
  );
}

function Field({ label, children }) {
  const t = useTheme();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 0 }}>
      <label style={{ fontSize: 11.5, color: t.TEXT_FAINT, fontWeight: 600, letterSpacing: '0.02em', textTransform: 'uppercase' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const getInputStyle = (t) => ({
  background: t.BG_INPUT, border: `1px solid ${t.BORDER}`, borderRadius: 9,
  padding: '11px 12px', color: t.TEXT, fontSize: 15.5, fontFamily: "'SF Mono', 'Roboto Mono', monospace",
  outline: 'none', width: '100%', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box',
  display: 'block',
});

const getLabelInputStyle = (t) => ({
  ...getInputStyle(t), fontFamily: 'inherit', fontSize: 15,
});

function DatePicker({ value, onChange }) {
  const t = useTheme();
  const today = todayISO();
  const isToday = value >= today;
  const dateInputRef = React.useRef(null);

  const openCalendar = () => {
    const input = dateInputRef.current;
    if (!input) return;
    input.focus();
    if (input.showPicker) {
      try { input.showPicker(); return; } catch (e) { /* falls back below */ }
    }
    input.click();
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, width: '100%', minWidth: 0,
    }}>
      <button
        onClick={() => onChange(shiftDate(value, -1))}
        aria-label="Предыдущий день"
        style={{
          flexShrink: 0, width: 38, height: 44, borderRadius: 9, border: `1px solid ${t.BORDER}`,
          background: t.BG_INPUT, color: t.TEXT_DIM, fontSize: 17, cursor: 'pointer', fontFamily: 'inherit',
        }}
      >‹</button>
      <div
        role="button"
        tabIndex={0}
        onClick={openCalendar}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openCalendar(); } }}
        aria-label="Выбрать дату из календаря"
        style={{
          flex: 1, minWidth: 0, height: 44, borderRadius: 9, border: `1px solid ${t.BORDER}`,
          background: t.BG_INPUT, color: t.TEXT, fontSize: 14.5, fontWeight: 600,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
          textTransform: 'capitalize', overflow: 'hidden', padding: '0 6px', boxSizing: 'border-box',
          position: 'relative', cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fmtDateFull(value)}</span>
        {value === today && (
          <span style={{
            flexShrink: 0, fontSize: 10.5, fontWeight: 700, color: t.ACCENT_SOFT,
            background: 'rgba(168,51,76,0.16)', padding: '2px 6px', borderRadius: 5, textTransform: 'none',
          }}>сегодня</span>
        )}
        <input
          ref={dateInputRef}
          type="date"
          value={value}
          max={today}
          onChange={(e) => { if (e.target.value) onChange(e.target.value); }}
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            opacity: 0, border: 'none', padding: 0, cursor: 'pointer',
            // pointerEvents отключены — открытие идёт через openCalendar() с родительского div,
            // это надёжнее, чем рассчитывать на клик по самому невидимому input на десктопе
            pointerEvents: 'none',
          }}
        />
      </div>
      <button
        onClick={() => onChange(shiftDate(value, 1))}
        aria-label="Следующий день"
        disabled={isToday}
        style={{
          flexShrink: 0, width: 38, height: 44, borderRadius: 9, border: `1px solid ${t.BORDER}`,
          background: t.BG_INPUT, color: isToday ? t.TEXT_FAINT : t.TEXT_DIM, fontSize: 17,
          cursor: isToday ? 'default' : 'pointer', opacity: isToday ? 0.4 : 1, fontFamily: 'inherit',
        }}
      >›</button>
    </div>
  );
}

function ExerciseNameInput({ value, onChange, knownNames, label = 'Упражнение', placeholder = 'Жим лёжа' }) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);
  const suggestions = useMemo(() => {
    if (!value.trim()) return knownNames.slice(0, 6);
    const q = value.trim().toLowerCase();
    return knownNames.filter((n) => n.toLowerCase().includes(q) && n.toLowerCase() !== q).slice(0, 6);
  }, [value, knownNames]);

  return (
    <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
      <Field label={label}>
        <input
          style={getLabelInputStyle(t)}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 120)}
          placeholder={placeholder}
          autoComplete="off"
        />
      </Field>
      {focused && suggestions.length > 0 && (
        <div className="dropdown-open" style={{
          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 10,
          background: t.BG_INPUT, border: `1px solid ${t.BORDER}`, borderRadius: 9,
          maxHeight: 220, overflowY: 'auto', boxShadow: '0 8px 20px rgba(0,0,0,0.35)',
        }}>
          {suggestions.map((name) => (
            <button
              key={name}
              onClick={() => { onChange(name); setFocused(false); }}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px',
                background: 'transparent', border: 'none', borderBottom: `1px solid ${t.BORDER}`,
                color: t.TEXT, fontSize: 14.5, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PercentOfRecord({ exName, weight, records }) {
  const t = useTheme();
  if (!exName || !weight) return null;
  const record = records[exName];
  if (!record || !record.weight) return null;
  const w = parseFloat(weight);
  if (!w || isNaN(w) || w <= 0) return null;
  const pct = Math.round((w / record.weight) * 100);
  const isNewRecord = w > record.weight;
  const color = isNewRecord ? t.POSITIVE : pct >= 90 ? t.ACCENT_SOFT : t.TEXT_FAINT;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginTop: 6, marginBottom: 2,
      color, fontWeight: 600,
    }}>
      {isNewRecord ? (
        <span className="record-pop">🔥 Новый рекорд! Прошлый максимум {record.weight} кг</span>
      ) : (
        <>{pct}% от рекорда ({record.weight} кг)</>
      )}
    </div>
  );
}

function ExerciseRow({ ex, onChange, onRemove, removable, knownNames, records, animDelay }) {
  const t = useTheme();
  return (
    <div
      className={animDelay != null ? 'item-fade-in' : ''}
      style={{ marginBottom: 14, animationDelay: animDelay != null ? `${animDelay}ms` : undefined }}
    >
      <div style={{ marginBottom: 8, display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        {categorizeExercise(ex.name) && (
          <div style={{ paddingBottom: 11, flexShrink: 0 }}>
            <MuscleBadge name={ex.name} />
          </div>
        )}
        <ExerciseNameInput
          value={ex.name}
          onChange={(name) => onChange({ ...ex, name })}
          knownNames={knownNames}
        />
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <Field label="Вес, кг">
          <input
            style={getInputStyle(t)}
            type="number" inputMode="decimal" min="0"
            value={ex.weight}
            onChange={(e) => onChange({ ...ex, weight: e.target.value })}
            placeholder="0"
          />
        </Field>
        <Field label="Повторы">
          <input
            style={getInputStyle(t)}
            type="number" inputMode="numeric" min="0"
            value={ex.reps}
            onChange={(e) => onChange({ ...ex, reps: e.target.value })}
            placeholder={ex.targetReps || '0'}
          />
        </Field>
        <Field label="Подх.">
          <input
            style={getInputStyle(t)}
            type="number" inputMode="numeric" min="0"
            value={ex.sets}
            onChange={(e) => onChange({ ...ex, sets: e.target.value })}
            placeholder="3"
          />
        </Field>
        {removable && (
          <button
            onClick={onRemove}
            style={{
              background: 'transparent', border: 'none', color: t.TEXT_FAINT,
              cursor: 'pointer', padding: '11px 4px', flexShrink: 0,
            }}
          >
            <X size={17} />
          </button>
        )}
      </div>
      {records && <PercentOfRecord exName={ex.name} weight={ex.weight} records={records} />}
    </div>
  );
}

const MUSCLE_GROUPS = {
  chest: { letter: 'Г', color: '#C4566E', label: 'Грудь' },
  back: { letter: 'С', color: '#5B8FB0', label: 'Спина' },
  shoulders: { letter: 'П', color: '#C9A227', label: 'Плечи' },
  legs: { letter: 'Н', color: '#5C8A4E', label: 'Ноги' },
  arms: { letter: 'Р', color: '#9B6FB5', label: 'Руки' },
  core: { letter: 'К', color: '#8A8378', label: 'Кор' },
};

function categorizeExercise(name) {
  const n = (name || '').toLowerCase();
  if (/жим.*лёж|жим.*узк|отжиман|разводк.*гантел.*сторон|французск/.test(n) && !/ног/.test(n)) {
    if (/узк|трицепс/.test(n)) return MUSCLE_GROUPS.arms;
    if (/лёж/.test(n)) return MUSCLE_GROUPS.chest;
  }
  if (/тяга.*наклон|тяга.*блок|подтягиван|гиперэкстенз/.test(n)) return MUSCLE_GROUPS.back;
  if (/жим.*сидя|жим.*стоя.*голов|разводк.*сторон/.test(n) && /сид|голов|сторон/.test(n)) return MUSCLE_GROUPS.shoulders;
  if (/присед|румынск|жим.*ног|разгибан.*ног|сгибан.*ног|носк|выпад/.test(n)) return MUSCLE_GROUPS.legs;
  if (/бицепс|трицепс|молот|скотт|французск|разгибан.*рук|подъ[её]м.*рук/.test(n)) return MUSCLE_GROUPS.arms;
  if (/планка|скручиван|твист|подъ[её]м ног в висе|пресс|кор\b/.test(n)) return MUSCLE_GROUPS.core;
  return null;
}

function MuscleBadge({ name, size = 20 }) {
  const group = categorizeExercise(name);
  if (!group) return null;
  return (
    <span
      title={group.label}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: size, height: size, borderRadius: '50%', flexShrink: 0,
        background: `${group.color}26`, color: group.color,
        fontSize: size * 0.5, fontWeight: 800, fontFamily: 'system-ui, sans-serif',
      }}
    >
      {group.letter}
    </span>
  );
}

const STARTER_EXERCISES = [
  'Жим штанги лёжа', 'Тяга штанги в наклоне', 'Приседания со штангой на плечах', 'Румынская тяга со штангой',
  'Жим штанги узким хватом', 'Подтягивания', 'Жим штанги сидя', 'Жим гантелей сидя',
  'Тяга верхнего блока (широкий хват)', 'Разводка гантелей в стороны', 'Жим ногами в тренажёре',
  'Разгибание ног в тренажёре', 'Сгибание ног лёжа в тренажёре', 'Подъём на носки стоя', 'Гиперэкстензия',
  'Французский жим', 'Отжимания на брусьях', 'Подъём штанги на бицепс стоя', 'Подъём на бицепс на скамье Скотта',
  'Подъём гантелей на бицепс «молотом»', 'Подъём штанги на бицепс обратным хватом', 'Разгибание рук на верхнем блоке',
  'Подъём ног в висе (или лёжа)', 'Скручивания на наклонной скамье', 'Русский твист', 'Планка',
];

const STARTER_CARDIO = [
  'Беговая дорожка', 'Велотренажёр', 'Эллипсоид', 'Гребной тренажёр', 'Степпер', 'Бассейн',
];

const PROGRAM_DAYS = [{"day": 1, "type": "strength", "title": "Грудь, спина, плечи", "exercises": [{"name": "Жим штанги лёжа", "sets": 4, "reps": "6-8"}, {"name": "Тяга штанги в наклоне", "sets": 4, "reps": "8-10"}, {"name": "Жим гантелей сидя над головой", "sets": 3, "reps": "10-12"}, {"name": "Тяга верхнего блока (широкий хват)", "sets": 3, "reps": "10-12"}, {"name": "Разводка гантелей в стороны", "sets": 3, "reps": "12-15"}, {"name": "Французский жим", "sets": 3, "reps": "10-12"}, {"name": "Подъём штанги на бицепс стоя", "sets": 3, "reps": "10-12"}]}, {"day": 2, "type": "cardio", "title": "Кардио на дорожке", "cardio": {"name": "Беговая дорожка", "distance": "3", "incline": "20"}}, {"day": 3, "type": "strength", "title": "Ноги", "exercises": [{"name": "Приседания со штангой на плечах", "sets": 4, "reps": "6-8"}, {"name": "Румынская тяга со штангой", "sets": 4, "reps": "8-10"}, {"name": "Жим ногами в тренажёре", "sets": 3, "reps": "10-12"}, {"name": "Сгибание ног лёжа в тренажёре", "sets": 3, "reps": "12-15"}, {"name": "Подъём на носки стоя", "sets": 4, "reps": "15-20"}, {"name": "Гиперэкстензия", "sets": 3, "reps": "12-15"}]}, {"day": 4, "type": "pool", "title": "Бассейн", "cardio": {"name": "Бассейн", "duration": "60"}}, {"day": 5, "type": "strength", "title": "Руки, кор, добивка", "exercises": [{"name": "Жим штанги узким хватом", "sets": 4, "reps": "8-10"}, {"name": "Подтягивания", "sets": 4, "reps": "8-10"}, {"name": "Подъём гантелей на бицепс «молотом»", "sets": 3, "reps": "10-12"}, {"name": "Разгибание рук на верхнем блоке", "sets": 3, "reps": "12-15"}, {"name": "Подъём штанги на бицепс обратным хватом", "sets": 3, "reps": "10-12"}, {"name": "Подъём ног в висе", "sets": 3, "reps": "12-15"}, {"name": "Скручивания на наклонной скамье", "sets": 3, "reps": "15-20"}]}, {"day": 6, "type": "strength", "title": "Грудь, спина, плечи", "exercises": [{"name": "Жим штанги лёжа", "sets": 4, "reps": "6-8"}, {"name": "Тяга штанги в наклоне", "sets": 4, "reps": "8-10"}, {"name": "Жим штанги сидя", "sets": 3, "reps": "8-10"}, {"name": "Тяга верхнего блока (широкий хват)", "sets": 3, "reps": "10-12"}, {"name": "Разводка гантелей в стороны", "sets": 4, "reps": "12-15"}, {"name": "Отжимания на брусьях", "sets": 3, "reps": "8-10"}, {"name": "Подъём штанги на бицепс стоя", "sets": 3, "reps": "8-10"}]}, {"day": 7, "type": "cardio", "title": "Кардио на дорожке", "cardio": {"name": "Беговая дорожка", "distance": "3", "incline": "20"}}, {"day": 8, "type": "strength", "title": "Ноги", "exercises": [{"name": "Приседания со штангой на плечах", "sets": 4, "reps": "6-8"}, {"name": "Румынская тяга со штангой", "sets": 4, "reps": "8-10"}, {"name": "Жим ногами в тренажёре", "sets": 4, "reps": "10-12"}, {"name": "Разгибание ног в тренажёре", "sets": 3, "reps": "12-15"}, {"name": "Сгибание ног лёжа в тренажёре", "sets": 3, "reps": "12-15"}, {"name": "Подъём на носки стоя", "sets": 4, "reps": "15-20"}, {"name": "Гиперэкстензия", "sets": 3, "reps": "12-15"}]}, {"day": 9, "type": "pool", "title": "Бассейн", "cardio": {"name": "Бассейн", "duration": "60"}}, {"day": 10, "type": "strength", "title": "Руки, кор, добивка", "exercises": [{"name": "Жим штанги узким хватом", "sets": 4, "reps": "8-10"}, {"name": "Подтягивания", "sets": 4, "reps": "8-10"}, {"name": "Подъём на бицепс на скамье Скотта", "sets": 3, "reps": "10-12"}, {"name": "Разгибание рук на верхнем блоке", "sets": 3, "reps": "12-15"}, {"name": "Подъём штанги на бицепс обратным хватом", "sets": 3, "reps": "10-12"}, {"name": "Подъём ног в висе", "sets": 3, "reps": "12-15"}, {"name": "Русский твист", "sets": 3, "reps": "16-20"}]}, {"day": 11, "type": "strength", "title": "Грудь, спина, плечи", "exercises": [{"name": "Жим штанги лёжа", "sets": 5, "reps": "4-6"}, {"name": "Тяга штанги в наклоне", "sets": 5, "reps": "5-6"}, {"name": "Жим штанги сидя", "sets": 3, "reps": "8-10"}, {"name": "Тяга верхнего блока (широкий хват)", "sets": 3, "reps": "10-12"}, {"name": "Разводка гантелей в стороны", "sets": 3, "reps": "12-15"}]}, {"day": 12, "type": "cardio", "title": "Кардио на дорожке", "cardio": {"name": "Беговая дорожка", "distance": "3", "incline": "20"}}, {"day": 13, "type": "strength", "title": "Ноги", "exercises": [{"name": "Приседания со штангой на плечах", "sets": 5, "reps": "4-6"}, {"name": "Румынская тяга со штангой", "sets": 5, "reps": "5-6"}, {"name": "Жим ногами в тренажёре", "sets": 3, "reps": "10-12"}, {"name": "Разгибание ног в тренажёре", "sets": 3, "reps": "12-15"}, {"name": "Подъём на носки стоя", "sets": 4, "reps": "15-20"}, {"name": "Гиперэкстензия", "sets": 3, "reps": "12-15"}]}, {"day": 14, "type": "pool", "title": "Бассейн", "cardio": {"name": "Бассейн", "duration": "60"}}, {"day": 15, "type": "strength", "title": "Руки, кор, добивка", "exercises": [{"name": "Жим штанги узким хватом", "sets": 5, "reps": "5-6"}, {"name": "Подтягивания", "sets": 5, "reps": "5-6"}, {"name": "Подъём на бицепс на скамье Скотта", "sets": 3, "reps": "10-12"}, {"name": "Разгибание рук на верхнем блоке", "sets": 3, "reps": "12-15"}, {"name": "Подъём ног в висе", "sets": 3, "reps": "12-15"}, {"name": "Русский твист", "sets": 3, "reps": "16-20"}]}, {"day": 16, "type": "strength", "title": "Грудь, спина, плечи", "exercises": [{"name": "Жим штанги лёжа", "sets": 3, "reps": "8-10"}, {"name": "Тяга штанги в наклоне", "sets": 3, "reps": "10-12"}, {"name": "Жим гантелей сидя", "sets": 2, "reps": "10-12"}, {"name": "Тяга верхнего блока (широкий хват)", "sets": 2, "reps": "12-15"}, {"name": "Разводка гантелей в стороны", "sets": 2, "reps": "15"}]}, {"day": 17, "type": "cardio", "title": "Кардио на дорожке", "cardio": {"name": "Беговая дорожка", "distance": "3", "incline": "20"}}, {"day": 18, "type": "strength", "title": "Ноги", "exercises": [{"name": "Приседания со штангой на плечах", "sets": 3, "reps": "8-10"}, {"name": "Румынская тяга со штангой", "sets": 3, "reps": "10-12"}, {"name": "Жим ногами в тренажёре", "sets": 2, "reps": "12-15"}, {"name": "Сгибание ног лёжа в тренажёре", "sets": 2, "reps": "15"}, {"name": "Подъём на носки стоя", "sets": 3, "reps": "15-20"}]}, {"day": 19, "type": "pool", "title": "Бассейн", "cardio": {"name": "Бассейн", "duration": "60"}}, {"day": 20, "type": "strength", "title": "Руки, кор, добивка", "exercises": [{"name": "Жим штанги узким хватом", "sets": 3, "reps": "10-12"}, {"name": "Подтягивания", "sets": 3, "reps": "8-10"}, {"name": "Подъём на бицепс на скамье Скотта", "sets": 2, "reps": "12-15"}, {"name": "Разгибание рук на верхнем блоке", "sets": 2, "reps": "15"}, {"name": "Подъём ног в висе", "sets": 3, "reps": "12-15"}]}];

function CardioRow({ c, onChange, onRemove, removable, knownNames, animDelay }) {
  const t = useTheme();
  const isPool = c.name.trim().toLowerCase().includes('бассейн');
  const wrapClassName = animDelay != null ? 'item-fade-in' : '';
  const wrapStyle = { animationDelay: animDelay != null ? `${animDelay}ms` : undefined };

  if (isPool) {
    return (
      <div className={wrapClassName} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 10, flexWrap: 'wrap', ...wrapStyle }}>
        <div style={{ flexBasis: '100%', minWidth: 0 }}>
          <ExerciseNameInput
            value={c.name}
            onChange={(name) => onChange({ ...c, name })}
            knownNames={knownNames}
            label="Кардио"
            placeholder="Беговая дорожка"
          />
        </div>
        <div style={{ display: 'flex', gap: 8, flex: 1, minWidth: 0, alignItems: 'flex-end' }}>
          <Field label="Время в бассейне, мин">
            <input
              style={getInputStyle(t)}
              type="number" inputMode="numeric" min="0"
              value={c.duration}
              onChange={(e) => onChange({ ...c, duration: e.target.value })}
              placeholder="60"
            />
          </Field>
          {removable && (
            <button
              onClick={onRemove}
              style={{
                background: 'transparent', border: 'none', color: t.TEXT_FAINT,
                cursor: 'pointer', padding: '11px 4px', flexShrink: 0, alignSelf: 'flex-end',
              }}
            >
              <X size={17} />
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={wrapClassName} style={{ marginBottom: 14, ...wrapStyle }}>
      <div style={{ marginBottom: 8 }}>
        <ExerciseNameInput
          value={c.name}
          onChange={(name) => onChange({ ...c, name })}
          knownNames={knownNames}
          label="Кардио"
          placeholder="Беговая дорожка"
        />
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <Field label="Дистанция, км">
          <input
            style={getInputStyle(t)}
            type="number" inputMode="decimal" min="0"
            value={c.distance}
            onChange={(e) => onChange({ ...c, distance: e.target.value })}
            placeholder={c.targetDistance || '0'}
          />
        </Field>
        <Field label="Скорость, км/ч">
          <input
            style={getInputStyle(t)}
            type="number" inputMode="decimal" min="0"
            value={c.speed}
            onChange={(e) => onChange({ ...c, speed: e.target.value })}
            placeholder="0"
          />
        </Field>
        <Field label="Наклон, %">
          <input
            style={{ ...getInputStyle(t), padding: '11px 8px', fontSize: 14 }}
            type="number" inputMode="decimal" min="0"
            value={c.incline}
            onChange={(e) => onChange({ ...c, incline: e.target.value })}
            placeholder={c.targetIncline || '0'}
          />
        </Field>
        <Field label="Время, мин">
          <input
            style={{ ...getInputStyle(t), padding: '11px 8px', fontSize: 14 }}
            type="number" inputMode="numeric" min="0"
            value={c.duration}
            onChange={(e) => onChange({ ...c, duration: e.target.value })}
            placeholder={c.targetDuration || '0'}
          />
        </Field>
        {removable && (
          <button
            onClick={onRemove}
            style={{
              background: 'transparent', border: 'none', color: t.TEXT_FAINT,
              cursor: 'pointer', padding: '11px 4px', flexShrink: 0,
            }}
          >
            <X size={17} />
          </button>
        )}
      </div>
    </div>
  );
}

function emptyExercise() {
  return { name: '', weight: '', reps: '', sets: '' };
}

function emptyCardio() {
  return { name: '', distance: '', speed: '', incline: '', duration: '' };
}

function RepeatWorkoutPicker({ sessions, onPick }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const recent = useMemo(() => [...(sessions || [])].reverse().slice(0, 10), [sessions]);

  if (recent.length === 0) return null;

  return (
    <div style={{ position: 'relative', width: '100%', minWidth: 0, marginBottom: 18 }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%',
          background: 'transparent', border: `1px dashed ${t.BORDER}`, borderRadius: 9,
          padding: '10px 14px', color: t.TEXT_DIM, fontSize: 13.5, fontWeight: 600,
          cursor: 'pointer', fontFamily: 'inherit', boxSizing: 'border-box',
        }}
      >
        <Copy size={14} /> Повторить прошлую тренировку
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 9, background: 'transparent' }} />
          <div className="dropdown-open" style={{
            position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 10,
            background: t.BG_INPUT, border: `1px solid ${t.BORDER}`, borderRadius: 10,
            maxHeight: 320, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          }}>
            {recent.map((s) => {
              const exNames = (s.exercises || []).map((e) => e.name);
              const cardioNames = (s.cardio || []).map((c) => c.name);
              const preview = [...exNames, ...cardioNames].slice(0, 3).join(', ');
              const more = exNames.length + cardioNames.length - 3;
              return (
                <button
                  key={s.id}
                  onClick={() => { onPick(s); setOpen(false); }}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left', padding: '11px 14px',
                    background: 'transparent', border: 'none', borderBottom: `1px solid ${t.BORDER}`,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: t.TEXT, marginBottom: 2, textTransform: 'capitalize' }}>
                    {fmtDateFull(s.date)}
                  </div>
                  <div style={{ fontSize: 12, color: t.TEXT_FAINT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {preview}{more > 0 ? ` +${more}` : ''}
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

const DAY_TYPE_ICON = { strength: '💪', cardio: '🏃', pool: '🏊' };

function ProgramDayPicker({ value, onChange }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const selected = PROGRAM_DAYS.find((d) => d.day === value);

  return (
    <div style={{ position: 'relative', width: '100%', minWidth: 0, marginBottom: 14 }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
          background: t.BG_INPUT, border: `1px solid ${t.ACCENT}`, borderRadius: 10,
          padding: '12px 14px', color: t.TEXT, fontSize: 14.5, fontWeight: 600,
          cursor: 'pointer', fontFamily: 'inherit', boxSizing: 'border-box',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <span style={{
            flexShrink: 0, fontSize: 11, fontWeight: 800, color: '#FFF',
            background: t.ACCENT, padding: '3px 7px', borderRadius: 6,
          }}>День {value}/20</span>
          {selected ? `${DAY_TYPE_ICON[selected.type] || ''} ${selected.title}` : ''}
        </span>
        <span style={{ color: t.TEXT_FAINT, flexShrink: 0, marginLeft: 8 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 9, background: 'transparent' }} />
          <div className="dropdown-open" style={{
            position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 10,
            background: t.BG_INPUT, border: `1px solid ${t.BORDER}`, borderRadius: 10,
            maxHeight: 280, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          }}>
            {PROGRAM_DAYS.map((d, idx) => {
              const weekNumber = Math.floor((d.day - 1) / 5) + 1;
              const isFirstOfWeek = idx === 0 || PROGRAM_DAYS[idx - 1] && Math.floor((PROGRAM_DAYS[idx - 1].day - 1) / 5) + 1 !== weekNumber;
              return (
                <React.Fragment key={d.day}>
                  {isFirstOfWeek && (
                    <div style={{
                      padding: '8px 14px 6px', fontSize: 10.5, fontWeight: 700, color: t.TEXT_FAINT,
                      textTransform: 'uppercase', letterSpacing: '0.04em',
                      background: t.BG_RAISED, borderBottom: `1px solid ${t.BORDER}`,
                      position: 'sticky', top: 0,
                    }}>
                      Неделя {weekNumber}
                    </div>
                  )}
                  <button
                    onClick={() => { onChange(d.day); setOpen(false); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '11px 14px',
                      background: d.day === value ? 'rgba(168,51,76,0.12)' : 'transparent', border: 'none',
                      borderBottom: `1px solid ${t.BORDER}`, color: d.day === value ? t.ACCENT_SOFT : t.TEXT,
                      fontSize: 14, fontWeight: d.day === value ? 700 : 400, cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    <span style={{ flexShrink: 0, fontSize: 13 }}>{DAY_TYPE_ICON[d.type] || ''}</span>
                    <span style={{
                      flexShrink: 0, fontSize: 10.5, fontWeight: 700, color: t.TEXT_FAINT,
                      minWidth: 18,
                    }}>{d.day}</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title}</span>
                  </button>
                </React.Fragment>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function WorkoutTab({ sessions, saveSessions, setError, profile, saveProfile, editSession, onEditDone }) {
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
          background: 'rgba(168,51,76,0.1)', border: `1px solid ${t.ACCENT}`, borderRadius: 9,
          padding: '9px 12px', marginBottom: 14, fontSize: 12.5, color: t.ACCENT_SOFT, fontWeight: 600,
        }}>
          <span>✎ Редактирование тренировки</span>
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
          width: '100%', padding: '14px', borderRadius: 11, border: 'none',
          background: justSaved ? t.POSITIVE : t.ACCENT, color: '#FFF',
          fontSize: 15.5, fontWeight: 700, cursor: saving ? 'default' : 'pointer',
          opacity: saving ? 0.7 : 1, fontFamily: 'inherit',
          transition: 'background 0.2s ease',
        }}
      >
        {justSaved
          ? (editingId ? 'Изменения сохранены ✓' : 'Сохранено ✓')
          : saving ? 'Сохраняю...' : (editingId ? 'Сохранить изменения' : 'Сохранить тренировку')}
      </button>
    </div>
  );
}

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
        <span style={{ color: t.TEXT, fontFamily: "'SF Mono', monospace", fontWeight: 600 }}>{m.weight} кг</span>
        {delta != null && delta !== 0 && (
          <span style={{
            display: 'flex', alignItems: 'center', gap: 3, fontFamily: "'SF Mono', monospace",
            fontSize: 12, fontWeight: 700, color: deltaColor,
            background: isDown ? 'rgba(122,139,92,0.14)' : 'rgba(168,51,76,0.14)',
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
        <span style={{ color: t.TEXT, fontFamily: "'SF Mono', monospace", fontWeight: 600, fontSize: 13.5 }}>
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
                <span style={{ color: t.TEXT_DIM, fontFamily: "'SF Mono', monospace" }}>{m.weight} кг</span>
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

function MeasurementsTab({ measurements, saveMeasurements, setError }) {
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
          width: '100%', padding: '14px', borderRadius: 11, border: 'none',
          background: justSaved ? t.POSITIVE : t.ACCENT, color: '#FFF',
          fontSize: 15.5, fontWeight: 700, cursor: saving ? 'default' : 'pointer',
          opacity: saving ? 0.7 : 1, fontFamily: 'inherit',
          transition: 'background 0.2s ease',
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
                <div style={{ fontSize: 15, fontWeight: 700, color: t.TEXT, fontFamily: "'SF Mono', monospace" }}>
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

const BODY_FIELDS = [
  { key: 'height', label: 'Рост, см' },
  { key: 'waist', label: 'Талия, см' },
  { key: 'hips', label: 'Бёдра, см' },
  { key: 'chest', label: 'Грудь, см' },
  { key: 'shoulders', label: 'Плечи, см' },
  { key: 'bodyFat', label: '% жира (опц.)' },
];

function computeRecords(sessions) {
  const records = {};
  (sessions || []).forEach((s) => {
    (s.exercises || []).forEach((ex) => {
      if (!ex.weight) return;
      if (!records[ex.name] || ex.weight > records[ex.name].weight) {
        records[ex.name] = { weight: ex.weight, reps: ex.reps, date: s.date };
      }
    });
  });
  return records;
}

function getMonday(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const dow = dt.getDay(); // 0=Sun..6=Sat
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  dt.setDate(dt.getDate() + diffToMonday);
  return toISO(dt);
}

function computeWeekStreak(sessions) {
  const activeDates = new Set((sessions || []).map((s) => s.date));
  const todayMonday = getMonday(todayISO());

  // Текущая неделя: 5 кружков пн..пт, true если в этот день была активность
  const currentWeekDays = [];
  for (let i = 0; i < 5; i++) {
    const day = shiftDate(todayMonday, i);
    currentWeekDays.push({ date: day, done: activeDates.has(day), isFuture: day > todayISO() });
  }

  // Считаем подряд идущие ПОЛНОСТЬЮ закрытые недели (все 5 будних дней),
  // начиная с недели перед текущей и далее в прошлое.
  let weekMultiplier = 0;
  let checkMonday = shiftDate(todayMonday, -7);
  while (true) {
    let allDone = true;
    for (let i = 0; i < 5; i++) {
      const day = shiftDate(checkMonday, i);
      if (!activeDates.has(day)) { allDone = false; break; }
    }
    if (!allDone) break;
    weekMultiplier += 1;
    checkMonday = shiftDate(checkMonday, -7);
  }

  const currentWeekDone = currentWeekDays.filter((d) => d.done).length;
  const currentWeekComplete = currentWeekDone === 5;
  if (currentWeekComplete) weekMultiplier += 1;

  return { currentWeekDays, currentWeekDone, weekMultiplier, currentWeekComplete };
}

function ProfileTab({ profile, saveProfile, sessions, setError, measurements, saveSessions, saveMeasurements }) {
  const t = useTheme();
  const [draft, setDraft] = useState(() => {
    const init = {};
    BODY_FIELDS.forEach((f) => { init[f.key] = profile && profile[f.key] != null ? String(profile[f.key]) : ''; });
    return init;
  });
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const records = useMemo(() => computeRecords(sessions), [sessions]);
  const recordList = useMemo(() => Object.entries(records).sort((a, b) => a[0].localeCompare(b[0])), [records]);

  const handleChange = (key, val) => setDraft({ ...draft, [key]: val });

  const handleSave = async () => {
    const hasAny = BODY_FIELDS.some((f) => draft[f.key]);
    if (!hasAny) {
      setError('Заполни хотя бы одно значение');
      return;
    }
    setSaving(true);
    const next = { ...profile, updatedAt: todayISO() };
    BODY_FIELDS.forEach((f) => {
      next[f.key] = draft[f.key] ? Math.max(0, parseFloat(draft[f.key])) : null;
    });
    await saveProfile(next);
    setSaving(false);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2200);
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: t.TEXT_FAINT, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.02em' }}>
          Параметры тела
        </div>
        {profile && profile.updatedAt && (
          <div style={{ fontSize: 11.5, color: t.TEXT_FAINT }}>обновлено {fmtDateShort(profile.updatedAt)}</div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        {BODY_FIELDS.slice(0, 2).map((f) => (
          <Field key={f.key} label={f.label}>
            <input style={getInputStyle(t)} type="number" inputMode="decimal" min="0" value={draft[f.key]} onChange={(e) => handleChange(f.key, e.target.value)} placeholder="—" />
          </Field>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        {BODY_FIELDS.slice(2, 4).map((f) => (
          <Field key={f.key} label={f.label}>
            <input style={getInputStyle(t)} type="number" inputMode="decimal" min="0" value={draft[f.key]} onChange={(e) => handleChange(f.key, e.target.value)} placeholder="—" />
          </Field>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 22, flexWrap: 'wrap' }}>
        {BODY_FIELDS.slice(4, 6).map((f) => (
          <Field key={f.key} label={f.label}>
            <input style={getInputStyle(t)} type="number" inputMode="decimal" min="0" value={draft[f.key]} onChange={(e) => handleChange(f.key, e.target.value)} placeholder="—" />
          </Field>
        ))}
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className={justSaved ? 'save-bounce' : ''}
        style={{
          width: '100%', padding: '14px', borderRadius: 11, border: 'none',
          background: justSaved ? t.POSITIVE : t.ACCENT, color: '#FFF',
          fontSize: 15.5, fontWeight: 700, cursor: saving ? 'default' : 'pointer',
          opacity: saving ? 0.7 : 1, fontFamily: 'inherit',
          transition: 'background 0.2s ease',
        }}
      >
        {justSaved ? 'Сохранено ✓' : saving ? 'Сохраняю...' : 'Сохранить параметры'}
      </button>

      <div style={{ height: 1, background: t.BORDER, margin: '26px 0 18px' }} />

      <div style={{ fontSize: 12, color: t.TEXT_FAINT, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.02em', marginBottom: 12 }}>
        Личные рекорды
      </div>
      {recordList.length === 0 ? (
        <div style={{ fontSize: 13.5, color: t.TEXT_FAINT, lineHeight: 1.5 }}>
          Рекорды появятся, как только сохранишь хотя бы одну тренировку с весом.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
                fontSize: 17, fontWeight: 800, color: t.ACCENT_SOFT, fontFamily: "'SF Mono', monospace",
                flexShrink: 0, marginLeft: 12,
              }}>
                {r.weight} кг
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ height: 1, background: t.BORDER, margin: '26px 0 18px' }} />

      <ExportImportPanel
        sessions={sessions} measurements={measurements} profile={profile}
        saveSessions={saveSessions} saveMeasurements={saveMeasurements} saveProfile={saveProfile}
        setError={setError}
      />
    </div>
  );
}

const SERIES_COLORS = ['#A8334C', '#5B8FB0', '#C9A227', '#5C8A4E', '#9B6FB5'];

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
            background: value === p.key ? 'rgba(168,51,76,0.14)' : 'transparent',
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
                    background: isSelected ? 'rgba(168,51,76,0.1)' : 'transparent', border: 'none',
                    borderBottom: `1px solid ${t.BORDER}`, color: isSelected ? t.ACCENT_SOFT : t.TEXT,
                    fontSize: 14.5, fontWeight: isSelected ? 700 : 400, cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  <span style={{
                    flexShrink: 0, width: 16, height: 16, borderRadius: 4, border: `2px solid ${isSelected ? t.ACCENT : t.TEXT_FAINT}`,
                    background: isSelected ? t.ACCENT : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#FFF',
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
    <div style={{ background: t.BG_RAISED, border: `1px solid ${t.BORDER}`, borderRadius: 13, padding: '16px 16px 8px', marginBottom: 14 }}>
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
                <span style={{ color: t.TEXT_FAINT, fontFamily: "'SF Mono', monospace" }}>
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
    <div style={{ background: t.BG_RAISED, border: `1px solid ${t.BORDER}`, borderRadius: 12, padding: 14 }}>
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
          return (
            <div key={`ex-${i}`} style={{
              padding: '7px 0', borderBottom: isLastOverall ? 'none' : `1px solid ${t.BORDER}`, fontSize: 13.5,
            }}>
              <div style={{ color: t.TEXT, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 7 }}>
                <MuscleBadge name={ex.name} size={17} />
                <span>{ex.name}</span>
              </div>
              <div style={{ color: t.TEXT_DIM, fontFamily: "'SF Mono', monospace", fontSize: 13 }}>
                {ex.weight} кг × {ex.reps}{ex.sets > 1 ? ` × ${ex.sets}` : ''}
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
              <div style={{ color: t.TEXT_DIM, fontFamily: "'SF Mono', monospace", fontSize: 13 }}>
                {isPool
                  ? `${c.duration} мин`
                  : <>{c.distance} км{c.speed ? ` · ${c.speed} км/ч` : ''}{c.incline ? ` · накл. ${c.incline}%` : ''}{c.duration ? ` · ${c.duration} мин` : ''}</>
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

function ProgressTab({ sessions, measurements, profile, onDeleteSession, onEditSession }) {
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
                fontSize: 10, fontWeight: 700, color: d.done ? '#FFF' : t.TEXT_FAINT,
                flexShrink: 0, opacity: d.isFuture ? 0.5 : 1,
              }}
            >
              {dayLetters[i]}
            </div>
          ))}
        </div>
        {streaks.weekMultiplier > 0 && (
          <span style={{
            fontSize: 13, fontWeight: 800, color: t.ACCENT_SOFT, fontFamily: "'SF Mono', monospace",
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

function ExportImportPanel({ sessions, measurements, profile, saveSessions, saveMeasurements, saveProfile, setError }) {
  const t = useTheme();
  const [mode, setMode] = useState(null); // null | 'export' | 'import'
  const [importText, setImportText] = useState('');
  const [copied, setCopied] = useState(false);
  const textareaRef = React.useRef(null);

  const exportText = useMemo(() => {
    const payload = {
      exportedAt: new Date().toISOString(),
      sessions: sessions || [],
      measurements: measurements || [],
      profile: profile || {},
    };
    return JSON.stringify(payload);
  }, [sessions, measurements, profile]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(exportText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch (e) {
      if (textareaRef.current) {
        textareaRef.current.select();
        try {
          document.execCommand('copy');
          setCopied(true);
          setTimeout(() => setCopied(false), 2200);
        } catch (e2) {
          setError('Не удалось скопировать — выдели текст вручную и скопируй');
        }
      }
    }
  };

  const handleImport = async () => {
    if (!importText.trim()) {
      setError('Вставь сохранённый текст экспорта');
      return;
    }
    try {
      const data = JSON.parse(importText.trim());
      if (data.sessions) await saveSessions(data.sessions);
      if (data.measurements) await saveMeasurements(data.measurements);
      if (data.profile) await saveProfile(data.profile);
      setMode(null);
      setImportText('');
    } catch (err) {
      setError('Не удалось прочитать текст — проверь, что это полная копия из экспорта');
    }
  };

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{
        display: 'flex', gap: 8, padding: '11px 12px',
        background: t.BG_RAISED, border: `1px solid ${t.BORDER}`, borderRadius: 10,
        alignItems: 'center', flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 12, color: t.TEXT_FAINT, flex: '1 1 100%', marginBottom: 2 }}>
          Резервная копия данных текстом — на случай сбоев автосохранения
        </span>
        <button
          onClick={() => setMode(mode === 'export' ? null : 'export')}
          style={{
            flex: 1, padding: '9px 10px', borderRadius: 8, border: `1px solid ${mode === 'export' ? t.ACCENT : t.BORDER}`,
            background: mode === 'export' ? 'rgba(168,51,76,0.16)' : t.BG_INPUT, color: mode === 'export' ? t.ACCENT_SOFT : t.TEXT,
            fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          Создать копию
        </button>
        <button
          onClick={() => setMode(mode === 'import' ? null : 'import')}
          style={{
            flex: 1, padding: '9px 10px', borderRadius: 8, border: `1px solid ${mode === 'import' ? t.ACCENT : t.BORDER}`,
            background: mode === 'import' ? 'rgba(168,51,76,0.16)' : t.BG_INPUT, color: mode === 'import' ? t.ACCENT_SOFT : t.TEXT,
            fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          Восстановить
        </button>
      </div>

      {mode === 'export' && (
        <div style={{ marginTop: 10, padding: '12px', background: t.BG_RAISED, border: `1px solid ${t.BORDER}`, borderRadius: 10 }}>
          <div style={{ fontSize: 12.5, color: t.TEXT_DIM, marginBottom: 8, lineHeight: 1.5 }}>
            Нажми «Скопировать», затем сохрани этот текст куда угодно (заметки, сообщение себе) — позже вставь его в «Восстановить», если данные пропадут.
          </div>
          <textarea
            ref={textareaRef}
            readOnly
            value={exportText}
            onFocus={(e) => e.target.select()}
            style={{
              width: '100%', height: 100, background: t.BG_INPUT, border: `1px solid ${t.BORDER}`, borderRadius: 8,
              padding: '10px', color: t.TEXT_DIM, fontSize: 11, fontFamily: "'SF Mono', monospace",
              boxSizing: 'border-box', resize: 'vertical', marginBottom: 10,
            }}
          />
          <button
            onClick={handleCopy}
            style={{
              width: '100%', padding: '11px', borderRadius: 8, border: 'none',
              background: copied ? t.POSITIVE : t.ACCENT, color: '#FFF', fontSize: 14, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {copied ? 'Скопировано ✓' : 'Скопировать'}
          </button>
        </div>
      )}

      {mode === 'import' && (
        <div style={{ marginTop: 10, padding: '12px', background: t.BG_RAISED, border: `1px solid ${t.BORDER}`, borderRadius: 10 }}>
          <div style={{ fontSize: 12.5, color: t.TEXT_DIM, marginBottom: 8, lineHeight: 1.5 }}>
            Вставь сюда ранее сохранённый текст копии. Это заменит текущие данные.
          </div>
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder="Вставь сюда скопированный текст..."
            style={{
              width: '100%', height: 100, background: t.BG_INPUT, border: `1px solid ${t.BORDER}`, borderRadius: 8,
              padding: '10px', color: t.TEXT, fontSize: 11, fontFamily: "'SF Mono', monospace",
              boxSizing: 'border-box', resize: 'vertical', marginBottom: 10,
            }}
          />
          <button
            onClick={handleImport}
            style={{
              width: '100%', padding: '11px', borderRadius: 8, border: 'none',
              background: t.ACCENT, color: '#FFF', fontSize: 14, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Восстановить данные
          </button>
        </div>
      )}
    </div>
  );
}

function ThemeToggle({ mode, isDark, cycle }) {
  const t = useTheme();
  const title = mode === 'auto' ? (isDark ? 'Авто · ночь' : 'Авто · день') : (isDark ? 'Тёмная' : 'Светлая');
  return (
    <button
      onClick={cycle}
      aria-label="Переключить тему"
      title={title}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        width: 38, height: 38, borderRadius: 10, border: `1px solid ${t.BORDER}`,
        background: t.BG_INPUT, color: t.TEXT_DIM,
        cursor: 'pointer', position: 'relative',
      }}
    >
      {isDark ? <Moon size={16} /> : <Sun size={16} />}
      {mode === 'auto' && (
        <span style={{
          position: 'absolute', top: 3, right: 3, width: 6, height: 6, borderRadius: '50%',
          background: t.ACCENT,
        }} />
      )}
    </button>
  );
}

function WorkoutTrackerInner({ mode, isDark, cycle, userId, displayName, onLogout }) {
  const t = useTheme();
  const { sessions, measurements, profile, loaded, error, setError, saveSessions, saveMeasurements, saveProfile } = useStorage(userId);
  const TAB_ORDER = ['workout', 'measurements', 'progress', 'profile'];
  const [tab, setTab] = useState('workout');
  const [slideDir, setSlideDir] = useState(0); // -1 left, 1 right, 0 none
  const touchRef = React.useRef({ x: 0, y: 0, active: false });

  const goToTab = (nextTab) => {
    if (nextTab === tab) return;
    const fromIdx = TAB_ORDER.indexOf(tab);
    const toIdx = TAB_ORDER.indexOf(nextTab);
    setSlideDir(toIdx > fromIdx ? 1 : -1);
    setTab(nextTab);
  };

  const handleTouchStart = (e) => {
    const touch = e.touches[0];
    touchRef.current = { x: touch.clientX, y: touch.clientY, active: true };
  };

  const handleTouchEnd = (e) => {
    if (!touchRef.current.active) return;
    touchRef.current.active = false;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchRef.current.x;
    const dy = touch.clientY - touchRef.current.y;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const idx = TAB_ORDER.indexOf(tab);
    if (dx < 0 && idx < TAB_ORDER.length - 1) {
      goToTab(TAB_ORDER[idx + 1]);
    } else if (dx > 0 && idx > 0) {
      goToTab(TAB_ORDER[idx - 1]);
    }
  };

  const handleDeleteSession = async (id) => {
    const next = (sessions || []).filter((s) => s.id !== id);
    await saveSessions(next);
  };

  const [editingSession, setEditingSession] = useState(null);

  const handleEditSession = (s) => {
    setEditingSession(s);
    goToTab('workout');
  };

  const handleEditDone = () => {
    setEditingSession(null);
    goToTab('progress');
  };

  if (!loaded) {
    return (
      <div style={{
        background: t.BG, minHeight: '100vh', width: '100%',
        padding: '24px max(18px, env(safe-area-inset-right)) 40px max(18px, env(safe-area-inset-left))',
        fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
        maxWidth: 480, margin: '0 auto', boxSizing: 'border-box', overflowX: 'hidden',
      }}>
        <style>{`
          @keyframes skeletonPulse {
            0%, 100% { opacity: 0.5; }
            50% { opacity: 0.9; }
          }
          .skel { animation: skeletonPulse 1.3s ease-in-out infinite; }
        `}</style>
        <div className="skel" style={{ width: '70%', height: 22, borderRadius: 6, background: t.BG_INPUT, marginBottom: 10 }} />
        <div className="skel" style={{ width: '90%', height: 13, borderRadius: 5, background: t.BG_INPUT, marginBottom: 24, animationDelay: '0.1s' }} />
        <div style={{ display: 'flex', gap: 5, marginBottom: 24 }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skel" style={{
              flex: i === 0 ? 1.6 : 0.7, height: 38, borderRadius: 10, background: t.BG_INPUT,
              animationDelay: `${i * 0.08}s`,
            }} />
          ))}
        </div>
        {[0, 1, 2].map((i) => (
          <div key={i} className="skel" style={{
            width: '100%', height: 56, borderRadius: 10, background: t.BG_RAISED,
            border: `1px solid ${t.BORDER}`, marginBottom: 12, animationDelay: `${i * 0.12}s`,
          }} />
        ))}
      </div>
    );
  }

  return (
    <div className="content-fade-in" style={{
      background: t.BG, minHeight: '100vh', width: '100%',
      padding: '24px max(18px, env(safe-area-inset-right)) 40px max(18px, env(safe-area-inset-left))',
      fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
      maxWidth: 480, margin: '0 auto', boxSizing: 'border-box',
      overflowX: 'hidden',
      transition: 'background-color 0.4s ease',
    }}>
      <style>{`
        * {
          transition: background-color 0.4s ease, color 0.4s ease, border-color 0.4s ease, fill 0.4s ease, stroke 0.4s ease;
        }
        @keyframes saveBounce {
          0% { transform: scale(1); }
          35% { transform: scale(0.96); }
          60% { transform: scale(1.03); }
          100% { transform: scale(1); }
        }
        .save-bounce {
          animation: saveBounce 0.4s ease;
        }
        @keyframes recordPop {
          0% { transform: scale(0.7) translateY(2px); opacity: 0; }
          55% { transform: scale(1.12) translateY(-1px); opacity: 1; }
          100% { transform: scale(1) translateY(0); opacity: 1; }
        }
        .record-pop {
          animation: recordPop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1);
          display: inline-flex;
        }
        @keyframes slideInRight {
          from { transform: translateX(24px); opacity: 0.4; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideInLeft {
          from { transform: translateX(-24px); opacity: 0.4; }
          to { transform: translateX(0); opacity: 1; }
        }
        .slide-in-right { animation: slideInRight 0.22s ease-out; }
        .slide-in-left { animation: slideInLeft 0.22s ease-out; }
        @keyframes dropdownOpen {
          from { opacity: 0; transform: translateY(-6px) scaleY(0.96); }
          to { opacity: 1; transform: translateY(0) scaleY(1); }
        }
        .dropdown-open {
          animation: dropdownOpen 0.18s ease-out;
          transform-origin: top;
        }
        @keyframes itemFadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .item-fade-in {
          animation: itemFadeIn 0.3s ease-out backwards;
        }
        @keyframes contentFadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .content-fade-in {
          animation: contentFadeIn 0.35s ease-out;
        }
      `}</style>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 22 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: t.TEXT, margin: 0, letterSpacing: '-0.01em' }}>
            Дневник тренировок
          </h1>
          <p style={{ fontSize: 13, color: t.TEXT_FAINT, margin: '4px 0 0' }}>
            {displayName ? `Привет, ${displayName}!` : 'Вес, повторы, самочувствие — и динамика по каждому упражнению'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <ThemeToggle mode={mode} isDark={isDark} cycle={cycle} />
          {onLogout && (
            <button
              onClick={onLogout}
              aria-label="Выйти из аккаунта"
              title="Выйти из аккаунта"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 38, height: 38, borderRadius: 10, border: `1px solid ${t.BORDER}`,
                background: t.BG_INPUT, color: t.TEXT_DIM, cursor: 'pointer',
              }}
            >
              <LogOut size={16} />
            </button>
          )}
        </div>
      </div>

      {error && (
        <div style={{
          background: 'rgba(168,51,76,0.14)', border: `1px solid ${t.ACCENT}`, borderRadius: 9,
          padding: '10px 12px', fontSize: 13, color: t.ACCENT_SOFT, marginBottom: 16,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          {error}
          <button onClick={() => setError(null)} style={{ background: 'transparent', border: 'none', color: t.ACCENT_SOFT, cursor: 'pointer' }}>
            <X size={15} />
          </button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 5, marginBottom: 24, width: '100%', minWidth: 0 }}>
        <Pill active={tab === 'workout'} onClick={() => goToTab('workout')} icon={Dumbbell}>Тренировка</Pill>
        <Pill active={tab === 'measurements'} onClick={() => goToTab('measurements')} icon={Ruler}>Вес</Pill>
        <Pill active={tab === 'progress'} onClick={() => goToTab('progress')} icon={LineIcon}>Прогресс</Pill>
        <Pill active={tab === 'profile'} onClick={() => goToTab('profile')} icon={User}>Профиль</Pill>
      </div>

      {/* WorkoutTab рендерится всегда и просто скрывается — так черновик тренировки
          не теряется при переключении на другие вкладки и обратно. */}
      <div
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        style={{ display: tab === 'workout' ? 'block' : 'none', touchAction: 'pan-y' }}
      >
        <WorkoutTab
          sessions={sessions} saveSessions={saveSessions} setError={setError}
          profile={profile} saveProfile={saveProfile}
          editSession={editingSession} onEditDone={handleEditDone}
        />
      </div>

      {tab !== 'workout' && (
        <div
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          key={tab}
          className={slideDir === 1 ? 'slide-in-right' : slideDir === -1 ? 'slide-in-left' : ''}
          style={{ touchAction: 'pan-y' }}
        >
          {tab === 'measurements' && <MeasurementsTab measurements={measurements} saveMeasurements={saveMeasurements} setError={setError} />}
          {tab === 'progress' && <ProgressTab sessions={sessions} measurements={measurements} profile={profile} onDeleteSession={handleDeleteSession} onEditSession={handleEditSession} />}
          {tab === 'profile' && (
            <ProfileTab
              profile={profile} saveProfile={saveProfile} sessions={sessions} setError={setError}
              measurements={measurements} saveSessions={saveSessions} saveMeasurements={saveMeasurements}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Авторизация — два способа входа, у каждого свой аккаунт:
// 1. Telegram Mini App — автоматически, по подписи initData (без PIN)
// 2. Обычный браузер — имя + PIN, регистрация/вход
// ============================================================

const AUTH_SESSION_KEY = 'workout-tracker-auth';

function getTelegramWebApp() {
  if (typeof window === 'undefined') return null;
  const tg = window.Telegram && window.Telegram.WebApp;
  // initData пустой, если страница открыта не из Telegram (просто в браузере)
  if (!tg || !tg.initData) return null;
  return tg;
}

// Пытается авторизоваться через Telegram. Возвращает { userId, displayName } или null.
async function tryTelegramAuth(tg) {
  try {
    const res = await fetch('/api/telegram-auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: tg.initData }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) return null;
    return { userId: data.userId, displayName: data.displayName };
  } catch (e) {
    return null;
  }
}

async function browserAuth(mode, displayName, pin) {
  const res = await fetch('/api/browser-auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, displayName, pin }),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) {
    return { error: data.error || 'Что-то пошло не так' };
  }
  return { userId: data.userId, displayName: data.displayName };
}

function AuthGate({ children }) {
  const [checking, setChecking] = useState(true);
  const [session, setSession] = useState(() => {
    try {
      const raw = sessionStorage.getItem(AUTH_SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  });
  const [telegramFailed, setTelegramFailed] = useState(false);
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'register'
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const tg = useMemo(() => getTelegramWebApp(), []);

  useEffect(() => {
    if (session) { setChecking(false); return; }

    (async () => {
      if (tg) {
        tg.ready();
        tg.expand();
        const result = await tryTelegramAuth(tg);
        if (result) {
          sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(result));
          setSession(result);
          setChecking(false);
          return;
        }
        setTelegramFailed(true);
      }
      setChecking(false);
    })();
  }, [session, tg]);

  const handleSubmit = async () => {
    setErr('');
    if (!name.trim()) { setErr('Введи имя'); return; }
    if (pin.length < 4) { setErr('PIN должен быть не короче 4 символов'); return; }
    setBusy(true);
    const result = await browserAuth(authMode, name.trim(), pin);
    setBusy(false);
    if (result.error) { setErr(result.error); return; }
    sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(result));
    setSession(result);
  };

  const handleLogout = () => {
    sessionStorage.removeItem(AUTH_SESSION_KEY);
    setSession(null);
  };

  if (session) return children({ userId: session.userId, displayName: session.displayName, onLogout: handleLogout });

  const t = THEMES.dark;

  if (checking) {
    return <div style={{ background: t.BG, minHeight: '100vh' }} />;
  }

  return (
    <div style={{
      background: t.BG, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20, fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
    }}>
      <div style={{ width: '100%', maxWidth: 340 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 16, background: t.BG_RAISED, border: `1px solid ${t.BORDER}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Lock size={22} color={t.ACCENT_SOFT} />
          </div>
        </div>
        <h1 style={{ color: t.TEXT, fontSize: 19, textAlign: 'center', margin: '0 0 6px', fontWeight: 800 }}>
          {authMode === 'login' ? 'Вход' : 'Создай аккаунт'}
        </h1>
        <p style={{ color: t.TEXT_FAINT, fontSize: 13, textAlign: 'center', margin: '0 0 22px' }}>
          {telegramFailed
            ? 'Не получилось войти через Telegram — войди по имени и PIN'
            : authMode === 'login' ? 'Введи своё имя и PIN' : 'Придумай имя и PIN — минимум 4 символа'}
        </p>

        <input
          type="text"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Имя"
          style={{
            width: '100%', boxSizing: 'border-box', background: t.BG_INPUT, border: `1px solid ${t.BORDER}`,
            borderRadius: 10, padding: '13px 14px', color: t.TEXT, fontSize: 15, marginBottom: 10,
            outline: 'none', fontFamily: 'inherit',
          }}
        />

        <input
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
          placeholder="PIN-код"
          style={{
            width: '100%', boxSizing: 'border-box', background: t.BG_INPUT, border: `1px solid ${t.BORDER}`,
            borderRadius: 10, padding: '13px 14px', color: t.TEXT, fontSize: 17, marginBottom: 10,
            outline: 'none', textAlign: 'center', letterSpacing: '0.15em',
          }}
        />

        {err && (
          <div style={{ color: t.ACCENT_SOFT, fontSize: 13, textAlign: 'center', marginBottom: 12 }}>{err}</div>
        )}

        <button
          onClick={handleSubmit}
          disabled={busy}
          style={{
            width: '100%', padding: '13px', borderRadius: 11, border: 'none',
            background: t.ACCENT, color: '#FFF', fontSize: 15, fontWeight: 700,
            cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1, fontFamily: 'inherit', marginBottom: 12,
          }}
        >
          {busy ? 'Проверяю...' : authMode === 'login' ? 'Войти' : 'Создать и войти'}
        </button>

        <button
          onClick={() => { setAuthMode(authMode === 'login' ? 'register' : 'login'); setErr(''); }}
          style={{
            width: '100%', padding: '8px', background: 'transparent', border: 'none',
            color: t.TEXT_FAINT, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline',
          }}
        >
          {authMode === 'login' ? 'Нет аккаунта? Создать новый' : 'Уже есть аккаунт? Войти'}
        </button>
      </div>
    </div>
  );
}

export default function WorkoutTracker() {
  const { theme, mode, isDark, cycle } = useThemeController();
  return (
    <AuthGate>
      {({ userId, displayName, onLogout }) => (
        <ThemeContext.Provider value={theme}>
          <WorkoutTrackerInner
            mode={mode} isDark={isDark} cycle={cycle}
            userId={userId} displayName={displayName} onLogout={onLogout}
          />
        </ThemeContext.Provider>
      )}
    </AuthGate>
  );
}
