import React, { useState, useMemo } from 'react';
import { X, Flame, Copy, Dumbbell, Activity, Waves } from 'lucide-react';
import { useTheme } from '../theme.js';
import { todayISO, shiftDate, fmtDateFull } from '../dateUtils.js';
import { MAX_INCLINE } from '../climbs.js';

export function Field({ label, children }) {
  const t = useTheme();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 0 }}>
      <label style={{ fontSize: 10.5, color: t.TEXT_FAINT, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: t.FONT_MONO }}>
        {label}
      </label>
      {children}
    </div>
  );
}

export const getInputStyle = (t) => ({
  background: t.BG_INPUT, border: `1px solid ${t.BORDER}`, borderRadius: 12,
  padding: '11px 12px', color: t.TEXT, fontSize: 15.5, fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
  outline: 'none', width: '100%', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box',
  display: 'block',
});

export const getLabelInputStyle = (t) => ({
  ...getInputStyle(t), fontFamily: 'inherit', fontSize: 15,
});

export function DatePicker({ value, onChange }) {
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
            background: t.ACCENT_BG, padding: '2px 6px', borderRadius: 5, textTransform: 'none',
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

export function ExerciseNameInput({ value, onChange, knownNames, label = 'Упражнение', placeholder = 'Жим лёжа' }) {
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
          background: t.BG_INPUT, border: `1px solid ${t.BORDER}`, borderRadius: 12,
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

export function PercentOfRecord({ exName, weight, records }) {
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
        <span className="record-pop" style={{ alignItems: 'center', gap: 5 }}><Flame size={13} /> Новый рекорд! Прошлый максимум {record.weight} кг</span>
      ) : (
        <>{pct}% от рекорда ({record.weight} кг)</>
      )}
    </div>
  );
}

export function ExerciseRow({ ex, onChange, onRemove, removable, knownNames, records, animDelay }) {
  const t = useTheme();
  const weightless = isWeightlessExercise(ex.name);
  const timed = isTimeBasedExercise(ex.name);
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
        {!weightless && (
          <Field label="Вес, кг">
            <input
              style={getInputStyle(t)}
              type="number" inputMode="decimal" min="0"
              value={ex.weight}
              onChange={(e) => onChange({ ...ex, weight: e.target.value })}
              placeholder="0"
            />
          </Field>
        )}
        <Field label={timed ? 'Секунды' : 'Повторы'}>
          <input
            style={getInputStyle(t)}
            type="number" inputMode="numeric" min="0"
            value={ex.reps}
            onChange={(e) => onChange({ ...ex, reps: e.target.value })}
            placeholder={timed ? '60' : (ex.targetReps || '0')}
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
      {records && !weightless && <PercentOfRecord exName={ex.name} weight={ex.weight} records={records} />}
    </div>
  );
}

export const MUSCLE_GROUPS = {
  chest: { letter: 'Г', color: '#C4566E', label: 'Грудь' },
  back: { letter: 'С', color: '#5B8FB0', label: 'Спина' },
  shoulders: { letter: 'П', color: '#C9A227', label: 'Плечи' },
  legs: { letter: 'Н', color: '#5C8A4E', label: 'Ноги' },
  arms: { letter: 'Р', color: '#9B6FB5', label: 'Руки' },
  core: { letter: 'К', color: '#8A8378', label: 'Кор' },
};

export function categorizeExercise(name) {
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

// Упражнения, которые выполняются без отягощения — для них поле "Вес, кг" не нужно.
export function isWeightlessExercise(name) {
  const n = (name || '').toLowerCase();
  // «Подъём ног в висе (или лёжа)» — только повторы, вес там не при чём.
  // Подтягивания и брусья сюда НЕ добавлены намеренно: их делают и с довеском.
  return /планка|русский твист|скручиван.*наклон|подъ[её]м ног/.test(n);
}

// Упражнения на время (планка и подобные статические удержания) — вместо повторов
// вводятся секунды, и рекорд/цель считаются в секундах.
export function isTimeBasedExercise(name) {
  const n = (name || '').toLowerCase();
  return /планка|планк|вакуум|удержан/.test(n);
}

// Нижняя граница планового диапазона повторов: "10-12" → 10, "15" → 15, "8–10" → 8.
// Используется, чтобы решить, «дотянул» ли подход до плана (пункт свечения).
export function repGoalLow(target) {
  if (target == null) return 0;
  const m = String(target).match(/\d+/);
  return m ? parseInt(m[0], 10) : 0;
}

// Время: секунды → «M:SS» или «H:MM:SS» (для нарастающего таймера секторов).
export function secToClock(sec) {
  const total = Math.max(0, Math.round(sec || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return (h ? `${h}:` : '') + `${mm}:${String(s).padStart(2, '0')}`;
}

// «мм:сс» / «ч:мм:сс» / «12» → секунды. Пусто → 0. Число без двоеточия трактуется как минуты.
export function parseClock(str) {
  if (str == null) return 0;
  const raw = String(str).trim();
  if (!raw) return 0;
  if (!raw.includes(':')) {
    const n = parseFloat(raw.replace(',', '.'));
    return isNaN(n) ? 0 : Math.round(n * 60);
  }
  const parts = raw.split(':').map((p) => parseInt(p, 10) || 0);
  let sec = 0;
  parts.forEach((p) => { sec = sec * 60 + p; });
  return sec;
}

// Определяет, какие поля показывать для конкретного вида кардио.
// Потолок наклона беговой дорожки живёт в climbs.js — там он нужен, чтобы
// обрезать профили маршрутов, а здесь тем же числом ограничивается ручной ввод.
// Единственный источник, чтобы значения не разъехались.
export { MAX_INCLINE };

// Обрезка ввода наклона. Пустую строку пропускаем как есть (иначе поле нельзя
// было бы очистить), минус и всё сверх потолка — режем.
export function clampIncline(raw) {
  const v = String(raw == null ? '' : raw);
  if (v.trim() === '') return '';
  const n = parseFloat(v.replace(',', '.'));
  if (!isFinite(n)) return '';
  if (n < 0) return '0';
  if (n > MAX_INCLINE) return String(MAX_INCLINE);
  return v;
}

// distance / speed / incline / duration — какие из них релевантны.
export function getCardioFields(name) {
  const n = (name || '').toLowerCase();
  if (/гребн/.test(n)) return { distance: true, speed: false, incline: false, duration: true };
  if (/степпер/.test(n)) return { distance: false, speed: false, incline: false, duration: true };
  if (/велотренаж|эллипсо/.test(n)) return { distance: true, speed: true, incline: false, duration: true };
  // По умолчанию (беговая дорожка и любой другой кастомный ввод) — полный набор
  return { distance: true, speed: true, incline: true, duration: true };
}

export function MuscleBadge({ name, size = 20 }) {
  const group = categorizeExercise(name);
  if (!group) return null;
  return (
    <span
      title={group.label}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: size, height: size, borderRadius: 7, flexShrink: 0,
        background: `${group.color}26`, color: group.color, border: `1px solid ${group.color}40`,
        fontSize: size * 0.46, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace",
      }}
    >
      {group.letter}
    </span>
  );
}

export const STARTER_EXERCISES = [
  'Жим штанги лёжа', 'Тяга штанги в наклоне', 'Приседания со штангой на плечах', 'Румынская тяга со штангой',
  'Жим штанги узким хватом', 'Подтягивания', 'Жим штанги сидя', 'Жим гантелей сидя',
  'Тяга верхнего блока (широкий хват)', 'Разводка гантелей в стороны', 'Болгарские сплит-приседы',
  'Разгибание ног в тренажёре', 'Сгибание ног сидя в тренажёре', 'Подъём на носки стоя', 'Гиперэкстензия',
  'Французский жим', 'Отжимания на брусьях', 'Подъём штанги на бицепс стоя', 'Подъём на бицепс на скамье Скотта',
  'Подъём гантелей на бицепс «молотом»', 'Подъём штанги на бицепс обратным хватом', 'Разгибание рук на верхнем блоке',
  'Подъём ног в висе (или лёжа)', 'Скручивания на наклонной скамье', 'Русский твист', 'Планка',
];

export const STARTER_CARDIO = [
  'Беговая дорожка', 'Велотренажёр', 'Эллипсоид', 'Гребной тренажёр', 'Степпер', 'Бассейн',
];

// Подсказки по разминке для силовых дней — текст взят из месячного плана тренировок.
// Привязаны по названию дня, так как разминка повторяется для одного типа дня каждую неделю.
export const WARMUP_TIPS = {
  'Грудь, спина, плечи': [
    'Кардио 5 мин — лёгкий темп на велотренажёре или дорожке, разогнать пульс и кровоток.',
    'Суставная разминка 3 мин — вращения плечами, руками, лёгкие наклоны корпуса.',
    'Разминочные подходы 2 мин — 1–2 подхода жима с пустой штангой/гифтом перед первым рабочим подходом.',
  ],
  'Ноги': [
    'Кардио 5 мин — лёгкий темп на велотренажёре или дорожке, разогнать пульс и кровоток.',
    'Суставная разминка 3 мин — вращения тазобедренными суставами, голеностоп, лёгкие выпады без веса.',
    'Разминочные подходы 2 мин — 1–2 подхода приседа с пустой штангой/малым весом перед рабочим подходом.',
  ],
  'Руки, кор, добивка': [
    'Кардио 5 мин — лёгкий темп на велотренажёре или дорожке, разогнать пульс и кровоток.',
    'Суставная разминка 3 мин — вращения кистями, локтями, плечами.',
    'Разминочные подходы 2 мин — 1–2 подхода с лёгким весом перед первым рабочим упражнением.',
  ],
};

export function WarmupTip({ title }) {
  const t = useTheme();
  const items = WARMUP_TIPS[title];
  if (!items) return null;
  return (
    <div style={{
      background: t.BG_RAISED, border: `1px solid ${t.BORDER}`, borderRadius: 16,
      padding: '13px 15px', marginBottom: 14, boxShadow: t.CARD_SHADOW,
    }}>
      <div style={{
        fontSize: 10.5, fontWeight: 700, color: t.ACCENT_SOFT, textTransform: 'uppercase',
        letterSpacing: '0.12em', marginBottom: 7, display: 'flex', alignItems: 'center', gap: 6, fontFamily: t.FONT_MONO,
      }}>
        <Flame size={13} /> Разминка · 10 минут
      </div>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
        {items.map((line, i) => (
          <li key={i} style={{
            fontSize: 12.5, color: t.TEXT_DIM, lineHeight: 1.45,
            marginBottom: i === items.length - 1 ? 0 : 5,
            paddingLeft: 12, position: 'relative',
          }}>
            <span style={{ position: 'absolute', left: 0, color: t.TEXT_FAINT }}>·</span>
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}

export const PROGRAM_DAYS = [{"day": 1, "type": "strength", "title": "Грудь, спина, плечи", "exercises": [{"name": "Жим штанги лёжа", "sets": 4, "reps": "6-8"}, {"name": "Тяга штанги в наклоне", "sets": 4, "reps": "8-10"}, {"name": "Жим гантелей сидя над головой", "sets": 3, "reps": "10-12"}, {"name": "Тяга верхнего блока (широкий хват)", "sets": 3, "reps": "10-12"}, {"name": "Разводка гантелей в стороны", "sets": 3, "reps": "12-15"}, {"name": "Французский жим", "sets": 3, "reps": "10-12"}, {"name": "Подъём штанги на бицепс стоя", "sets": 3, "reps": "10-12"}, {"name": "Планка", "sets": 3, "reps": "40-60"}]}, {"day": 2, "type": "cardio", "title": "Кардио на дорожке", "cardio": {"name": "Беговая дорожка", "distance": "3", "incline": "20"}}, {"day": 3, "type": "strength", "title": "Ноги", "exercises": [{"name": "Приседания со штангой на плечах", "sets": 4, "reps": "6-8"}, {"name": "Румынская тяга со штангой", "sets": 4, "reps": "8-10"}, {"name": "Разгибание ног в тренажёре", "sets": 3, "reps": "12-15"}, {"name": "Сгибание ног сидя в тренажёре", "sets": 3, "reps": "12-15"}, {"name": "Подъём на носки стоя", "sets": 4, "reps": "15-20"}, {"name": "Гиперэкстензия", "sets": 3, "reps": "12-15"}, {"name": "Скручивания на наклонной скамье", "sets": 3, "reps": "15-20"}]}, {"day": 4, "type": "pool", "title": "Бассейн", "cardio": {"name": "Бассейн", "duration": "60"}}, {"day": 5, "type": "strength", "title": "Руки, кор, добивка", "exercises": [{"name": "Жим штанги узким хватом", "sets": 4, "reps": "8-10"}, {"name": "Подтягивания", "sets": 4, "reps": "8-10"}, {"name": "Подъём гантелей на бицепс «молотом»", "sets": 3, "reps": "10-12"}, {"name": "Разгибание рук на верхнем блоке", "sets": 3, "reps": "12-15"}, {"name": "Подъём штанги на бицепс обратным хватом", "sets": 3, "reps": "10-12"}, {"name": "Подъём ног в висе (или лёжа)", "sets": 3, "reps": "12-15"}]}, {"day": 6, "type": "cardio", "title": "Кардио на дорожке", "cardio": {"name": "Беговая дорожка", "distance": "", "incline": ""}}, {"day": 7, "type": "strength", "title": "Грудь, спина, плечи", "exercises": [{"name": "Жим штанги лёжа", "sets": 4, "reps": "6-8"}, {"name": "Тяга штанги в наклоне", "sets": 4, "reps": "8-10"}, {"name": "Жим штанги сидя", "sets": 3, "reps": "8-10"}, {"name": "Тяга верхнего блока (широкий хват)", "sets": 3, "reps": "10-12"}, {"name": "Разводка гантелей в стороны", "sets": 4, "reps": "12-15"}, {"name": "Отжимания на брусьях", "sets": 3, "reps": "8-10"}, {"name": "Подъём штанги на бицепс стоя", "sets": 3, "reps": "8-10"}, {"name": "Планка", "sets": 3, "reps": "40-60"}]}, {"day": 8, "type": "cardio", "title": "Кардио на дорожке", "cardio": {"name": "Беговая дорожка", "distance": "3", "incline": "20"}}, {"day": 9, "type": "strength", "title": "Ноги", "exercises": [{"name": "Приседания со штангой на плечах", "sets": 4, "reps": "6-8"}, {"name": "Румынская тяга со штангой", "sets": 4, "reps": "8-10"}, {"name": "Разгибание ног в тренажёре", "sets": 3, "reps": "12-15"}, {"name": "Сгибание ног сидя в тренажёре", "sets": 3, "reps": "12-15"}, {"name": "Подъём на носки стоя", "sets": 4, "reps": "15-20"}, {"name": "Гиперэкстензия", "sets": 3, "reps": "12-15"}, {"name": "Скручивания на наклонной скамье", "sets": 3, "reps": "15-20"}]}, {"day": 10, "type": "pool", "title": "Бассейн", "cardio": {"name": "Бассейн", "duration": "60"}}, {"day": 11, "type": "strength", "title": "Руки, кор, добивка", "exercises": [{"name": "Жим штанги узким хватом", "sets": 4, "reps": "8-10"}, {"name": "Подтягивания", "sets": 4, "reps": "8-10"}, {"name": "Подъём на бицепс на скамье Скотта", "sets": 3, "reps": "10-12"}, {"name": "Разгибание рук на верхнем блоке", "sets": 3, "reps": "12-15"}, {"name": "Подъём штанги на бицепс обратным хватом", "sets": 3, "reps": "10-12"}, {"name": "Подъём ног в висе (или лёжа)", "sets": 3, "reps": "12-15"}]}, {"day": 12, "type": "cardio", "title": "Кардио на дорожке", "cardio": {"name": "Беговая дорожка", "distance": "", "incline": ""}}, {"day": 13, "type": "strength", "title": "Грудь, спина, плечи", "exercises": [{"name": "Жим штанги лёжа", "sets": 5, "reps": "4-6"}, {"name": "Тяга штанги в наклоне", "sets": 5, "reps": "5-6"}, {"name": "Жим штанги сидя", "sets": 3, "reps": "8-10"}, {"name": "Тяга верхнего блока (широкий хват)", "sets": 3, "reps": "10-12"}, {"name": "Разводка гантелей в стороны", "sets": 3, "reps": "12-15"}, {"name": "Планка", "sets": 3, "reps": "40-60"}]}, {"day": 14, "type": "cardio", "title": "Кардио на дорожке", "cardio": {"name": "Беговая дорожка", "distance": "3", "incline": "20"}}, {"day": 15, "type": "strength", "title": "Ноги", "exercises": [{"name": "Приседания со штангой на плечах", "sets": 5, "reps": "4-6"}, {"name": "Румынская тяга со штангой", "sets": 5, "reps": "5-6"}, {"name": "Сгибание ног сидя в тренажёре", "sets": 3, "reps": "12-15"}, {"name": "Разгибание ног в тренажёре", "sets": 3, "reps": "12-15"}, {"name": "Подъём на носки стоя", "sets": 4, "reps": "15-20"}, {"name": "Гиперэкстензия", "sets": 3, "reps": "12-15"}, {"name": "Скручивания на наклонной скамье", "sets": 3, "reps": "15-20"}]}, {"day": 16, "type": "pool", "title": "Бассейн", "cardio": {"name": "Бассейн", "duration": "60"}}, {"day": 17, "type": "strength", "title": "Руки, кор, добивка", "exercises": [{"name": "Жим штанги узким хватом", "sets": 5, "reps": "5-6"}, {"name": "Подтягивания", "sets": 5, "reps": "5-6"}, {"name": "Подъём на бицепс на скамье Скотта", "sets": 3, "reps": "10-12"}, {"name": "Разгибание рук на верхнем блоке", "sets": 3, "reps": "12-15"}, {"name": "Подъём ног в висе (или лёжа)", "sets": 3, "reps": "12-15"}]}, {"day": 18, "type": "cardio", "title": "Кардио на дорожке", "cardio": {"name": "Беговая дорожка", "distance": "", "incline": ""}}, {"day": 19, "type": "strength", "title": "Грудь, спина, плечи", "exercises": [{"name": "Жим штанги лёжа", "sets": 3, "reps": "8-10"}, {"name": "Тяга штанги в наклоне", "sets": 3, "reps": "10-12"}, {"name": "Жим гантелей сидя", "sets": 2, "reps": "10-12"}, {"name": "Тяга верхнего блока (широкий хват)", "sets": 2, "reps": "12-15"}, {"name": "Разводка гантелей в стороны", "sets": 2, "reps": "15"}, {"name": "Планка", "sets": 2, "reps": "40-60"}]}, {"day": 20, "type": "cardio", "title": "Кардио на дорожке", "cardio": {"name": "Беговая дорожка", "distance": "3", "incline": "20"}}, {"day": 21, "type": "strength", "title": "Ноги", "exercises": [{"name": "Приседания со штангой на плечах", "sets": 3, "reps": "8-10"}, {"name": "Румынская тяга со штангой", "sets": 3, "reps": "10-12"}, {"name": "Разгибание ног в тренажёре", "sets": 2, "reps": "15"}, {"name": "Сгибание ног сидя в тренажёре", "sets": 2, "reps": "15"}, {"name": "Подъём на носки стоя", "sets": 3, "reps": "15-20"}, {"name": "Скручивания на наклонной скамье", "sets": 2, "reps": "15-20"}]}, {"day": 22, "type": "pool", "title": "Бассейн", "cardio": {"name": "Бассейн", "duration": "60"}}, {"day": 23, "type": "strength", "title": "Руки, кор, добивка", "exercises": [{"name": "Жим штанги узким хватом", "sets": 3, "reps": "10-12"}, {"name": "Подтягивания", "sets": 3, "reps": "8-10"}, {"name": "Подъём на бицепс на скамье Скотта", "sets": 2, "reps": "12-15"}, {"name": "Разгибание рук на верхнем блоке", "sets": 2, "reps": "15"}, {"name": "Подъём ног в висе (или лёжа)", "sets": 2, "reps": "12-15"}]}, {"day": 24, "type": "cardio", "title": "Кардио на дорожке", "cardio": {"name": "Беговая дорожка", "distance": "", "incline": ""}}];

export function CardioRow({ c, onChange, onRemove, removable, knownNames, animDelay }) {
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

  const fields = getCardioFields(c.name);

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
        {fields.distance && (
          <Field label="Дистанция, км">
            <input
              style={getInputStyle(t)}
              type="number" inputMode="decimal" min="0"
              value={c.distance}
              onChange={(e) => onChange({ ...c, distance: e.target.value })}
              placeholder={c.targetDistance || '0'}
            />
          </Field>
        )}
        {fields.speed && (
          <Field label="Скорость, км/ч">
            <input
              style={getInputStyle(t)}
              type="number" inputMode="decimal" min="0"
              value={c.speed}
              onChange={(e) => onChange({ ...c, speed: e.target.value })}
              placeholder="0"
            />
          </Field>
        )}
        {fields.incline && (
          <Field label="Наклон, %">
            <input
              style={{ ...getInputStyle(t), padding: '11px 8px', fontSize: 14 }}
              type="number" inputMode="decimal" min="0" max={MAX_INCLINE}
              value={c.incline}
              onChange={(e) => onChange({ ...c, incline: clampIncline(e.target.value) })}
              placeholder={c.targetIncline || '0'}
            />
          </Field>
        )}
        {fields.duration && (
          <Field label="Время, мин">
            <input
              style={{ ...getInputStyle(t), padding: '11px 8px', fontSize: 14 }}
              type="number" inputMode="numeric" min="0"
              value={c.duration}
              onChange={(e) => onChange({ ...c, duration: e.target.value })}
              placeholder={c.targetDuration || '0'}
            />
          </Field>
        )}
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

export function emptyExercise() {
  return { name: '', weight: '', reps: '', sets: '' };
}

export function emptyCardio() {
  return { name: '', distance: '', speed: '', incline: '', duration: '' };
}

export function RepeatWorkoutPicker({ sessions, onPick }) {
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
          background: 'rgba(20,18,15,0.44)', backdropFilter: 'blur(18px) saturate(1.35)', WebkitBackdropFilter: 'blur(18px) saturate(1.35)',
          border: `1px dashed ${t.BORDER}`, borderRadius: 9,
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

export const DAY_TYPE_ICON = { strength: Dumbbell, cardio: Activity, pool: Waves };

export function ProgramDayPicker({ value, onChange }) {
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
            flexShrink: 0, fontSize: 11, fontWeight: 700, color: t.ON_ACCENT, fontFamily: t.FONT_MONO,
            background: t.ACCENT_GRAD, padding: '4px 8px', borderRadius: 8,
          }}>День {value}/{PROGRAM_DAYS.length}</span>
          {selected && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 7, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
              {DAY_TYPE_ICON[selected.type] && React.createElement(DAY_TYPE_ICON[selected.type], { size: 15, color: t.ACCENT_SOFT, style: { flexShrink: 0 } })}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected.title}</span>
            </span>
          )}
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
              const weekNumber = Math.floor((d.day - 1) / 6) + 1;
              const isFirstOfWeek = idx === 0 || PROGRAM_DAYS[idx - 1] && Math.floor((PROGRAM_DAYS[idx - 1].day - 1) / 6) + 1 !== weekNumber;
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
                      background: d.day === value ? t.ACCENT_BG : 'transparent', border: 'none',
                      borderBottom: `1px solid ${t.BORDER}`, color: d.day === value ? t.ACCENT_SOFT : t.TEXT,
                      fontSize: 14, fontWeight: d.day === value ? 700 : 400, cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center', color: t.TEXT_DIM }}>{DAY_TYPE_ICON[d.type] && React.createElement(DAY_TYPE_ICON[d.type], { size: 14 })}</span>
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
