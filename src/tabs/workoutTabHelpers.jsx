import React, { useState, useMemo } from 'react';
import { X, Flame, Copy, Dumbbell, Activity, Waves } from 'lucide-react';
import { useTheme, glassCard } from '../theme.js';
import { todayISO, shiftDate, fmtDateFull } from '../dateUtils.js';
import { MAX_INCLINE } from '../climbs.js';
import { planWeekOf } from '../plans.js';

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

// Шкалы 1–5 ползунком с цветом: тяжесть тренировки (зелёный — легко, красный —
// на пределе) и энергия (наоборот: красный — нет сил, зелёный — полон сил).
// Ползунок свой, а не <input type="range">: на iOS у штатного тап по полосе
// ничего не делает — только перетаскивание кружка. Здесь тап ставит значение
// сразу, перетаскивание — тоже, стрелки клавиатуры — на шаг.
export const DIFFICULTY_COLORS = ['#6FBF73', '#A9C25D', '#D8B654', '#E38F55', '#E0604F'];
export const DIFFICULTY_LABELS = ['легко', 'нормально', 'средне', 'тяжело', 'на пределе'];
export const ENERGY_COLORS = [...DIFFICULTY_COLORS].reverse();
export const ENERGY_LABELS = ['нет сил', 'вяло', 'нормально', 'бодро', 'полон сил'];

export function difficultyColor(v) {
  return DIFFICULTY_COLORS[Math.min(5, Math.max(1, Math.round(v))) - 1];
}

export function DifficultySlider({ label = 'Тяжесть тренировки', value, onChange }) {
  return (
    <ScaleSlider
      label={label} value={value} onChange={onChange}
      colors={DIFFICULTY_COLORS} labels={DIFFICULTY_LABELS} minLabel="легко" maxLabel="на пределе"
    />
  );
}

export function EnergySlider({ label = 'Энергия', value, onChange }) {
  return (
    <ScaleSlider
      label={label} value={value} onChange={onChange}
      colors={ENERGY_COLORS} labels={ENERGY_LABELS} minLabel="нет сил" maxLabel="полон сил"
    />
  );
}

function ScaleSlider({ label, value, onChange, colors, labels, minLabel, maxLabel }) {
  const t = useTheme();
  const trackRef = React.useRef(null);
  const draggingRef = React.useRef(false);
  const has = value != null && value >= 1;
  const v = has ? Math.min(5, Math.max(1, Math.round(value))) : 3;
  const color = has ? colors[v - 1] : t.TEXT_FAINT;
  const gradient = `linear-gradient(90deg, ${colors.join(', ')})`;
  const ratio = (v - 1) / 4;

  const setFromX = (clientX) => {
    const el = trackRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const k = Math.min(1, Math.max(0, (clientX - r.left) / (r.width || 1)));
    const n = Math.round(k * 4) + 1;
    if (n !== value) onChange(n);
  };
  const onKeyDown = (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); onChange(Math.min(5, v + (has ? 1 : 0))); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); onChange(Math.max(1, v - (has ? 1 : 0))); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
        <span style={{ fontSize: 10.5, color: t.TEXT_FAINT, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: t.FONT_MONO }}>
          {label}
        </span>
        <span style={{ fontSize: 12.5, fontWeight: 700, color, fontFamily: t.FONT_MONO, whiteSpace: 'nowrap' }}>
          {has ? `${v}/5 · ${labels[v - 1]}` : 'не указана'}
        </span>
      </div>
      {/* Касания не всплывают к свайпу вкладок в App: перетаскивание ползунка
          вбок иначе переключало бы вкладку. */}
      <div
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={1}
        aria-valuemax={5}
        aria-valuenow={has ? v : undefined}
        aria-valuetext={has ? `${v} из 5, ${labels[v - 1]}` : 'не указана'}
        onKeyDown={onKeyDown}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
        onPointerDown={(e) => {
          draggingRef.current = true;
          try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { /* no-op */ }
          setFromX(e.clientX);
        }}
        onPointerMove={(e) => { if (draggingRef.current) setFromX(e.clientX); }}
        onPointerUp={() => { draggingRef.current = false; }}
        onPointerCancel={() => { draggingRef.current = false; }}
        style={{ position: 'relative', height: 36, cursor: 'pointer', touchAction: 'pan-y', userSelect: 'none', outline: 'none' }}
      >
        <div ref={trackRef} style={{
          position: 'absolute', left: 13, right: 13, top: 14, height: 8, borderRadius: 4,
          background: gradient, opacity: has ? 1 : 0.35,
        }} />
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} aria-hidden style={{
            position: 'absolute', top: 16, width: 4, height: 4, borderRadius: '50%',
            left: `calc(13px + (100% - 26px) * ${i / 4} - 2px)`, background: 'rgba(10,10,10,0.45)',
          }} />
        ))}
        <span aria-hidden style={{
          position: 'absolute', top: 5, width: 26, height: 26, borderRadius: '50%', boxSizing: 'border-box',
          left: `calc((100% - 26px) * ${ratio})`,
          background: color, border: `3px solid ${t.BG}`,
          boxShadow: `0 0 0 1px ${has ? color : t.BORDER}, 0 4px 12px rgba(0,0,0,0.5)`,
          transition: 'left 0.15s ease, background 0.15s ease, box-shadow 0.15s ease',
        }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: t.TEXT_FAINT, padding: '0 2px' }}>
        <span>{minLabel}</span>
        <span>{maxLabel}</span>
      </div>
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
          onBlur={() => setFocused(false)}
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
              // Гасим потерю фокуса на самом нажатии: пока фокус остаётся в поле,
              // onBlur не срабатывает и список не успевает закрыться до onClick.
              // Раньше вместо этого стоял onBlur + setTimeout(120мс) — при быстром
              // тапе список иногда закрывался раньше, чем засчитывался выбор.
              onPointerDown={(e) => e.preventDefault()}
              onMouseDown={(e) => e.preventDefault()}
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

// Группа мышц по ключевым словам в названии. Порядок правил важен: более узкие
// идут раньше общих (жим узким хватом — руки, а не грудь).
//
// Раньше первые три случая были вложенным if-ом: внешнее условие ловило слово,
// а внутреннее решало группу — и если ни одно внутреннее не совпадало, проверка
// молча проваливалась мимо ВСЕХ остальных правил. Так «Отжимания на брусьях»
// (день 7 программы) оставались вообще без группы: ни бейджа в тренировке, ни
// буквы в списке рекордов. Цепочка теперь плоская — провалиться некуда.
export function categorizeExercise(name) {
  const n = (name || '').toLowerCase();
  const notLegs = !/ног/.test(n);
  // «Обратные отжимания от скамьи» — трицепс, хотя это «отжимания».
  // «Узким хватом» у тяги — спина («Тяга верхнего блока узким хватом»), у жима — трицепс.
  if (notLegs && !/тяга/.test(n) && /узк|трицепс|французск|обратн.*отжиман|запяст|предплеч/.test(n)) return MUSCLE_GROUPS.arms;
  // Плечи раньше груди: «обратная бабочка» и «махи в кроссовере» — дельты.
  if (/армейск|арнольд|подбородк|к лицу|обратн.*бабочк|перед собой|махи|разведен.*наклон|жим.*плеч|жим.*стоя(?!.*голов)/.test(n)
    && !/бицепс/.test(n)) return MUSCLE_GROUPS.shoulders;
  if (notLegs && /жим.*лёж|разводка.*лёж|жим.*наклон|разводк.*наклон|жим.*груд|кроссовер|пуловер(?!.*блок)/.test(n)) return MUSCLE_GROUPS.chest;
  if (notLegs && /отжиман|бабочк/.test(n)) return MUSCLE_GROUPS.chest;
  if (/тяга.*наклон|тяга.*блок|тяга.*пах|подтягиван|гиперэкстенз|т-гриф|рычажн|станов|пендле|пуловер.*блок|шраг/.test(n)) return MUSCLE_GROUPS.back;
  if (/жим.*сидя|жим.*стоя.*голов|разводк.*сторон/.test(n) && /сид|голов|сторон/.test(n)) return MUSCLE_GROUPS.shoulders;
  if (/присед|румынск|жим.*ног|разгибан.*ног|сгибан.*ног|разведен.*ног|сведен.*ног|носк|выпад|ягодичн|зашагив/.test(n)) return MUSCLE_GROUPS.legs;
  if (/бицепс|молот|скотт|разгибан.*рук|подъ[её]м.*рук/.test(n)) return MUSCLE_GROUPS.arms;
  // «Подъём ног» — и в висе, и лёжа (план 2): это пресс, а не ноги.
  if (/планка|скручиван|твист|подъ[её]м ног|подъ[её]м колен|пресс|вакуум|м[её]ртв.*жук|дровосек|кор\b/.test(n)) return MUSCLE_GROUPS.core;
  return null;
}

// Упражнения, которые выполняются без отягощения — для них поле "Вес, кг" не нужно.
export function isWeightlessExercise(name) {
  const n = (name || '').toLowerCase();
  // «Подъём ног в висе (или лёжа)» — только повторы, вес там не при чём.
  // Подтягивания и брусья сюда НЕ добавлены намеренно: их делают и с довеском.
  return /планк|русский твист|скручиван.*(наклон|пол)|обратн.*скручив|подъ[её]м ног|подъ[её]м колен|велосипед|ролик|м[её]ртв.*жук|вакуум|австралийск/.test(n);
}

// Упражнения на время (планка и подобные статические удержания) — вместо повторов
// вводятся секунды, и рекорд/цель считаются в секундах.
export function isTimeBasedExercise(name) {
  const n = (name || '').toLowerCase();
  return /планк|вакуум|удержан/.test(n); // «планка» покрывается «планк», отдельная ветка была лишней
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

// Ввод таймера дорожки с цифровой клавиатуры: двоеточия подставляются сами по
// мере набора (754 → «7:54», 12345 → «1:23:45»), вручную их вводить не нужно.
// Шесть цифр — потолок «99:59:59»; до 1.0.6 ввод обрезался четырьмя, то есть
// кардио длиннее 99 минут записать было нельзя.
export function formatClockInput(raw) {
  const digits = String(raw == null ? '' : raw).replace(/\D/g, '').slice(0, 6);
  // Минуты и секунды приводим к 59 ТОЛЬКО когда набраны все шесть цифр. По ходу
  // набора этого делать нельзя: значение поля — это и есть строка цифр, из которой
  // растёт следующий ввод, и обрезка посреди набора съела бы уже введённую цифру
  // (набирая «19:50», на «1:95» получишь «1:59» и дальше уже не то число).
  // На шести цифрах поле заполнено, дописать всё равно нечего — обрезать безопасно,
  // а «99:99:99» вместо ста часов в истории того стоит.
  const cap59 = (s) => (parseInt(s, 10) > 59 ? '59' : s);
  if (digits.length === 6) return `${digits.slice(0, 2)}:${cap59(digits.slice(2, 4))}:${cap59(digits.slice(4))}`;
  if (digits.length > 4) return `${digits.slice(0, digits.length - 4)}:${digits.slice(-4, -2)}:${digits.slice(-2)}`;
  if (digits.length > 2) return `${digits.slice(0, digits.length - 2)}:${digits.slice(-2)}`;
  return digits;
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
  'Жим штанги узким хватом', 'Подтягивания', 'Жим штанги сидя', 'Жим гантелей сидя над головой',
  'Тяга верхнего блока (широкий хват)', 'Разводка гантелей в стороны', 'Болгарские сплит-приседы',
  'Разгибание ног в тренажёре', 'Сгибание ног сидя в тренажёре', 'Подъём на носки стоя', 'Гиперэкстензия',
  'Французский жим', 'Отжимания на брусьях', 'Подъём штанги на бицепс стоя', 'Подъём на бицепс на скамье Скотта',
  'Подъём гантелей на бицепс «молотом»', 'Подъём штанги на бицепс обратным хватом', 'Разгибание рук на верхнем блоке',
  'Подъём ног в висе (или лёжа)', 'Скручивания на наклонной скамье', 'Русский твист', 'Планка',
  // План 2 (1.1.0)
  'Бабочка', 'Тяга к паху сидя', 'Подъём на носки в смите', 'Подъём ног лёжа',
  'Разведение ног сидя', 'Сведение ног сидя',
  // Пополнение базы: по 10 на группу мышц — для добавления и замены по ходу
  // тренировки. В планы они не входят. Группу (значок) ставит categorizeExercise.
  // Грудь
  'Жим гантелей лёжа', 'Жим штанги на наклонной скамье', 'Жим гантелей на наклонной скамье',
  'Жим штанги лёжа головой вниз', 'Разводка гантелей лёжа', 'Разводка гантелей на наклонной скамье',
  'Сведение рук в кроссовере', 'Жим от груди в тренажёре', 'Отжимания от пола', 'Пуловер с гантелью',
  // Спина
  'Тяга гантели в наклоне одной рукой', 'Тяга Т-грифа', 'Тяга верхнего блока узким хватом',
  'Тяга в рычажном тренажёре', 'Становая тяга', 'Подтягивания обратным хватом', 'Тяга штанги Пендлея',
  'Пуловер на верхнем блоке', 'Шраги со штангой', 'Австралийские подтягивания',
  // Плечи
  'Армейский жим стоя', 'Жим Арнольда', 'Жим гантелей стоя', 'Жим в тренажёре на плечи',
  'Разведение гантелей в наклоне', 'Обратная бабочка', 'Подъём гантелей перед собой',
  'Тяга штанги к подбородку', 'Тяга каната к лицу', 'Махи в стороны в кроссовере',
  // Ноги
  'Жим ногами в тренажёре', 'Фронтальные приседания', 'Гоблет-приседания', 'Выпады с гантелями',
  'Ягодичный мост со штангой', 'Сгибание ног лёжа в тренажёре', 'Гакк-приседания', 'Приседания в смите',
  'Подъём на носки сидя', 'Зашагивания на платформу',
  // Руки
  'Подъём гантелей на бицепс сидя', 'Концентрированный подъём на бицепс', 'Подъём на бицепс на нижнем блоке',
  'Подъём гантелей на бицепс на наклонной скамье', 'Подъём EZ-штанги на бицепс', 'Французский жим с гантелью сидя',
  'Разгибание рук на блоке с канатом', 'Разгибание руки с гантелью в наклоне', 'Обратные отжимания от скамьи',
  'Сгибание запястий со штангой',
  // Кор
  'Боковая планка', 'Скручивания на полу', 'Обратные скручивания', 'Скручивания на блоке',
  'Велосипед на пресс', 'Ролик для пресса', 'Подъём коленей в висе', 'Мёртвый жук', 'Вакуум',
  'Дровосек на блоке',
];

export const STARTER_CARDIO = [
  'Беговая дорожка', 'Велотренажёр', 'Эллипсоид', 'Гребной тренажёр', 'Степпер', 'Бассейн',
];

// Подсказки по разминке для силовых дней — текст взят из месячного плана тренировок.
// Ключ — название дня плана 1 (разминка повторяется для одного типа дня каждую
// неделю) либо явный day.warmup: в плане 2 названия дней другие, и он ссылается
// на те же тексты, плюс «Спина: тяга» — для дня, который начинается с тяги, а не с жима.
export const WARMUP_TIPS = {
  'Спина: тяга': [
    'Кардио 5 мин — лёгкий темп на велотренажёре или дорожке, разогнать пульс и кровоток.',
    'Суставная разминка 3 мин — вращения плечами, руками, лёгкие наклоны корпуса.',
    'Разминочные подходы 2 мин — 1–2 подхода тяги в наклоне с пустой штангой перед первым рабочим подходом.',
  ],
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

export function WarmupTip({ day }) {
  const t = useTheme();
  const items = day ? (WARMUP_TIPS[day.warmup] || WARMUP_TIPS[day.title]) : null;
  if (!items) return null;
  return (
    <div style={{
      ...glassCard({ blur: true }), borderRadius: 16,
      padding: '13px 15px', marginBottom: 14,
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

// Поле заметки, которое растёт вместе с текстом. До 1.1.0 у «Самочувствие ·
// заметка» была фиксированная высота в две строки и ручной уголок resize —
// на телефоне за него не ухватиться, и длинная заметка писалась вслепую в окне
// на две строки. Теперь высота подгоняется под содержимое на каждом вводе;
// minHeight из style остаётся нижней границей.
export function AutoGrowTextarea({ value, style, ...rest }) {
  const ref = React.useRef(null);
  const fit = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    // scrollHeight не включает рамку, а у полей box-sizing: border-box — без
    // добавки рамки последняя строка уезжала бы под край на пару пикселей.
    const cs = window.getComputedStyle(el);
    const border = (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.borderBottomWidth) || 0);
    el.style.height = `${el.scrollHeight + border}px`;
  }, []);
  React.useLayoutEffect(() => { fit(); }, [value, fit]);
  // Ширина поля меняется при повороте экрана — переносы строк тоже.
  React.useEffect(() => {
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [fit]);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      style={{ ...style, resize: 'none', overflow: 'hidden' }}
      {...rest}
    />
  );
}

// Цель по повторам для подписи: «8-10» → «8-10 повт», «40-60» у планки → «40-60 сек»,
// «до отказа» (план 2) — как есть, без «повт» в хвосте.
export function fmtTargetReps(reps, timed) {
  if (reps == null || reps === '') return timed ? 'на время' : '—';
  const s = String(reps);
  return /\d/.test(s) ? `${s} ${timed ? 'сек' : 'повт'}` : s;
}

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

// Выбор дня программы. План приходит пропом: до 1.1.0 здесь был зашит
// единственный PROGRAM_DAYS и делитель недели 6 прямо в разметке.
export function ProgramDayPicker({ plan, value, onChange }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const days = (plan && plan.days) || [];
  const selected = days.find((d) => d.day === value);

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
          }}>День {value}/{days.length}</span>
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
            {days.map((d, idx) => {
              const weekNumber = planWeekOf(plan, d.day);
              const isFirstOfWeek = idx === 0 || planWeekOf(plan, days[idx - 1].day) !== weekNumber;
              const weekLabel = plan && plan.weekLabels && plan.weekLabels[weekNumber];
              return (
                <React.Fragment key={d.day}>
                  {isFirstOfWeek && (
                    <div style={{
                      padding: '8px 14px 6px', fontSize: 10.5, fontWeight: 700, color: t.TEXT_FAINT,
                      textTransform: 'uppercase', letterSpacing: '0.04em',
                      background: t.BG_RAISED, borderBottom: `1px solid ${t.BORDER}`,
                      position: 'sticky', top: 0,
                    }}>
                      Неделя {weekNumber}{weekLabel ? ` · ${weekLabel}` : ''}
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
