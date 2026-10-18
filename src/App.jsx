import React, { useState, useEffect, useRef } from 'react';
import { Dumbbell, Ruler, LineChart as LineIcon, User, Sparkles, X } from 'lucide-react';
import { supabase } from './supabaseClient.js';
import { ThemeContext, useTheme, THEME_2A, STRIPES_2A, brassFill } from './theme.js';
import { useBrassShine } from './useBrassShine.js';
import { isWeighInTime } from './dateUtils.js';
import { AuthGate } from './auth.jsx';
import { WorkoutTab } from './tabs/WorkoutTab.jsx';
import { MeasurementsTab } from './tabs/MeasurementsTab.jsx';
import { ProgressTab } from './tabs/ProgressTab.jsx';
import { ProfileTab } from './tabs/ProfileTab.jsx';
import { AssistantTab } from './tabs/AssistantTab.jsx';
import { DEFAULT_PLAN_ID } from './plans.js';

// ------- Преобразование между форматом БД (snake_case) и форматом приложения (camelCase) -------

function sessionFromRow(row) {
  return {
    id: row.id,
    date: row.date,
    exercises: row.exercises || [],
    cardio: row.cardio || [],
    sleep: row.sleep,
    energy: row.energy,
    difficulty: row.difficulty ?? null,
    durationSec: row.duration_sec ?? null,
    routeName: row.route_name ?? null,
    feeling: row.feeling || '',
    programDay: row.program_day,
    // К какому плану относится programDay (1.1.0). У записей до 1.1.0 колонка
    // заполнена значением по умолчанию 'plan1'.
    planId: row.plan_id || DEFAULT_PLAN_ID,
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
    difficulty: s.difficulty ?? null,
    duration_sec: s.durationSec ?? null,
    route_name: s.routeName ?? null,
    feeling: s.feeling || '',
    program_day: s.programDay,
    plan_id: s.planId || DEFAULT_PLAN_ID,
  };
}

// В базе колонка называется time_of_day (слово time в SQL занято под тип данных),
// внутри приложения поле короче — time. Формат 'ЧЧ:ММ'. Может быть пустым:
// у замеров, сделанных до версии 1.0.0, времени нет — тогда оно просто не показывается.
function measurementFromRow(row) {
  return { id: row.id, date: row.date, weight: row.weight, time: row.time_of_day || null };
}

function measurementToRow(m, userId) {
  return { id: m.id, user_id: userId, date: m.date, weight: m.weight, time_of_day: m.time || null };
}

function profileFromRow(row) {
  if (!row) return {};
  return {
    lastProgramDay: row.last_program_day,
    // Какой план сейчас ведётся (1.1.0). Выбирается в «Профиле».
    planId: row.plan_id || DEFAULT_PLAN_ID,
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
    plan_id: p.planId || DEFAULT_PLAN_ID,
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

  // Записи, которые не доехали до базы из-за ошибки сети. Ключ — имя таблицы,
  // значение — множество id. Нужны, потому что состояние в приложении обновляется
  // оптимистично: после неудачной отправки next уже лежит в React-стейте, и при
  // следующем сохранении diff сравнил бы запись саму с собой и решил, что она не
  // менялась — то есть в базу она не уехала бы уже НИКОГДА. Держим её «грязной»,
  // пока upsert не подтвердится.
  const dirtyRef = useRef({ sessions: new Set(), measurements: new Set() });

  // То же самое для удалений, и по отдельной причине. Удалённая запись пропадает
  // из состояния сразу, поэтому в следующий раз `removedIds` (разница между prev и
  // next) её уже не увидит — её просто нет ни там, ни там. То есть не дошедшее
  // удаление не повторялось бы никогда, и «удалённая» тренировка возвращалась бы
  // из базы при следующей загрузке. Держим такие id здесь, пока delete не пройдёт.
  const pendingDeleteRef = useRef({ sessions: new Set(), measurements: new Set() });

  // Сохраняем только то, что реально изменилось: сравниваем next с prev по id и
  // по содержимому (через JSON.stringify самой строки для БД, чтобы формат сравнения
  // всегда совпадал с тем, что реально уйдёт в upsert), и отправляем только
  // изменившиеся/новые записи + удаляем только реально пропавшие id.
  // Раньше здесь на каждое сохранение (даже правку одной тренировки) переупсерчивался
  // весь массив целиком — работало корректно, но с ростом истории стало бы просто
  // лишней нагрузкой на сеть и БД без всякой пользы.
  async function diffAndUpsert(table, prevList, nextList, toRow) {
    const prevById = new Map(prevList.map((item) => [item.id, item]));
    const nextIds = new Set(nextList.map((item) => item.id));
    const dirty = dirtyRef.current[table];
    const pendingDelete = pendingDeleteRef.current[table];

    // Если запись вернулась в список (восстановление из резервной копии), снимаем
    // её с удаления — иначе доудалили бы только что восстановленное.
    if (pendingDelete) pendingDelete.forEach((id) => { if (nextIds.has(id)) pendingDelete.delete(id); });

    const removedIds = [...new Set([
      ...[...prevById.keys()].filter((id) => !nextIds.has(id)),
      ...(pendingDelete ? [...pendingDelete] : []),
    ])];

    const changed = nextList.filter((item) => {
      if (dirty && dirty.has(item.id)) return true; // прошлая отправка не дошла — повторяем
      const prevItem = prevById.get(item.id);
      if (!prevItem) return true; // новая запись
      return JSON.stringify(toRow(prevItem, userId)) !== JSON.stringify(toRow(item, userId));
    });

    if (changed.length > 0) {
      const { error: upsertErr } = await supabase.from(table).upsert(changed.map((item) => toRow(item, userId)));
      if (upsertErr) {
        if (dirty) changed.forEach((item) => dirty.add(item.id));
        throw upsertErr;
      }
      if (dirty) changed.forEach((item) => dirty.delete(item.id));
    }
    if (removedIds.length > 0) {
      // Фильтр по user_id обязателен: id генерится как `${date}-${Date.now()}` и
      // теоретически может совпасть у двух пользователей, а RLS на этих таблицах
      // открыта (осознанный компромисс, см. §3.2) и сама от этого не защитит.
      const { error: delErr } = await supabase.from(table).delete().eq('user_id', userId).in('id', removedIds);
      if (delErr) {
        if (pendingDelete) removedIds.forEach((id) => pendingDelete.add(id));
        throw delErr;
      }
      if (dirty) removedIds.forEach((id) => dirty.delete(id));
      if (pendingDelete) removedIds.forEach((id) => pendingDelete.delete(id));
    }
  }

  // ВАЖНО: save* пробрасывают ошибку наружу. Раньше они её глотали, и вызывающий
  // экран показывал «Сохранено ✓» поверх несостоявшейся записи — самый дорогой баг
  // из найденных. Теперь вызывающий обязан поймать ошибку и не врать пользователю.
  const SAVE_ERROR = 'Не удалось сохранить — данные остались в приложении, повторю при следующем сохранении';

  const saveSessions = async (next) => {
    const prev = sessions || [];
    setSessions(next);
    try {
      await diffAndUpsert('sessions', prev, next, sessionToRow);
    } catch (e) {
      setError(SAVE_ERROR);
      throw e;
    }
  };

  const saveMeasurements = async (next) => {
    const prev = measurements || [];
    setMeasurements(next);
    try {
      await diffAndUpsert('measurements', prev, next, measurementToRow);
    } catch (e) {
      setError(SAVE_ERROR);
      throw e;
    }
  };

  const saveProfile = async (next) => {
    setProfile(next);
    try {
      const { error: upsertErr } = await supabase.from('profile').upsert(profileToRow(next, userId));
      if (upsertErr) throw upsertErr;
    } catch (e) {
      setError(SAVE_ERROR);
      throw e;
    }
  };

  return { sessions, measurements, profile, loaded, error, setError, saveSessions, saveMeasurements, saveProfile };
}

// Активная вкладка — латунная пилюля с живым бликом (2A). Неактивные — приглушённые
// иконки. Отдельный случай — `main`: «Тренировка» стоит в середине бара и помечена
// как главная, поэтому даже неактивной она держит акцентную заливку, иконку покрупнее
// и чуть приподнята над общей линией. Новых цветов для этого не заводилось — только
// ACCENT_BG / ACCENT_BORDER / ACCENT_SOFT из темы 2A.
function Pill({ children, active, onClick, icon: Icon, main }) {
  const ON_BRASS = '#0A0A0A';
  const DIM = '#8F897C';
  const iconColor = active ? ON_BRASS : main ? '#E4C57E' : DIM;
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
        // Высота задана явно и одинакова у всех вкладок. Иначе её определяет самая
        // высокая «пилюля» в ряду, а состав ряда меняется при переключении: у
        // активной вкладки иконка 16 px и подпись, у неактивных — 20, у главной —
        // 22 плюс обводка. От этого бар прыгал по высоте на каждом переключении.
        // 46 px заодно держит цель нажатия выше рекомендованных 44.
        height: 46, boxSizing: 'border-box',
        padding: active ? '0 8px' : '0 3px', borderRadius: 15,
        flex: active ? 2.6 : main ? 0.75 : 0.55, minWidth: 0,
        border: !active && main ? '1px solid rgba(184,146,74,0.30)' : '1px solid transparent',
        color: active ? ON_BRASS : DIM,
        boxShadow: active ? '0 4px 16px rgba(0,0,0,0.4), 0 0 22px rgba(184,146,74,0.45)' : 'none',
        transform: !active && main ? 'translateY(-2px)' : 'none',
        fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
        transition: 'flex 0.25s ease, color 0.2s ease',
        fontFamily: "'Space Grotesk', system-ui, sans-serif",
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        ...(active ? brassFill : { background: main ? 'rgba(199,154,78,0.15)' : 'transparent' }),
      }}
    >
      {Icon && <Icon size={active ? 16 : main ? 22 : 20} strokeWidth={2.2} color={iconColor} style={{ flexShrink: 0, transition: 'all 0.2s ease' }} />}
      {active && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{children}</span>}
    </button>
  );
}

function WorkoutTrackerInner({ userId, displayName, onLogout }) {
  const t = useTheme();
  const { ref: brassRef } = useBrassShine();
  const { sessions, measurements, profile, loaded, error, setError, saveSessions, saveMeasurements, saveProfile } = useStorage(userId);
  // Порядок в баре: «Тренировка» посередине как главная, ассистент между ней и
  // профилем. Порядок задаёт и направление свайпов.
  const TAB_ORDER = ['progress', 'measurements', 'workout', 'assistant', 'profile'];
  // Стартовый экран зависит от времени: утром, в окно взвешивания, приложение
  // открывается сразу на «Весе», в остальное время — на «Тренировке». Проверка
  // делается ОДИН раз, при инициализации: если приложение открыто и время вышло
  // за границу окна, вкладка сама собой не переключится — это было бы дёрганьем
  // экрана под руками.
  const [tab, setTab] = useState(() => (isWeighInTime() ? 'measurements' : 'workout'));
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
    // Ошибку показывает сам saveSessions (баннер вверху) — здесь только гасим
    // проброс, чтобы не улетал необработанный rejection.
    try { await saveSessions(next); } catch (e) { /* сообщение уже показано */ }
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
        fontFamily: t.FONT,
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
    <div ref={brassRef} className="content-fade-in" style={{
      background: t.BG, minHeight: '100vh', width: '100%',
      padding: '24px max(18px, env(safe-area-inset-right)) calc(110px + env(safe-area-inset-bottom)) max(18px, env(safe-area-inset-left))',
      fontFamily: t.FONT,
      maxWidth: 480, margin: '0 auto', boxSizing: 'border-box',
      overflowX: 'hidden',
    }}>
      {/* Полосы 2A — ФИКСИРОВАННЫЙ слой на весь экран (не привязан к высоте контента,
          поэтому не «съезжает» при раскрытии групп). Теперь для всего приложения. */}
      <div aria-hidden style={{
        position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
        background: `${STRIPES_2A}, ${t.BG}`,
      }} />
      <div style={{ position: 'relative', zIndex: 1 }}>
      <style>{`
        /* Глобального transition на «*» здесь больше нет: он остался от эпохи
           переключения светлой/тёмной темы (её нет с 13 июля), а стоил пересчёта
           стилей на каждое изменение любого цвета — на iOS это заметно. */
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
        /* Только прозрачность, без transform. Трансформация на этом элементе делает
           его containing block для потомков с position: fixed — то есть на все 0.35 с
           анимации нижний таб-бар переставал быть прижатым к экрану и уезжал вниз
           вместе с длинной страницей. Сдвиг на 6 px того не стоил. */
        @keyframes contentFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .content-fade-in {
          animation: contentFadeIn 0.35s ease-out;
        }
      `}</style>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 22 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1 style={{ fontSize: 27, fontWeight: 700, color: t.TEXT, margin: 0, letterSpacing: '-0.02em', fontFamily: t.FONT_DISPLAY }}>
            Дневник тренировок
          </h1>
          <p style={{ fontSize: 13, color: t.TEXT_FAINT, margin: '4px 0 0' }}>
            {displayName ? `Привет, ${displayName}!` : 'Вес, повторы, самочувствие — и динамика по каждому упражнению'}
          </p>
        </div>
      </div>

      {error && (
        <div style={{
          background: t.ACCENT_BG, border: `1px solid ${t.ACCENT}`, borderRadius: 9,
          padding: '10px 12px', fontSize: 13, color: t.ACCENT_SOFT, marginBottom: 16,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          {error}
          <button onClick={() => setError(null)} style={{ background: 'transparent', border: 'none', color: t.ACCENT_SOFT, cursor: 'pointer' }}>
            <X size={15} />
          </button>
        </div>
      )}

      {/* WorkoutTab рендерится всегда и просто скрывается — так черновик тренировки
          не теряется при переключении на другие вкладки и обратно. */}
      <div
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        style={{ display: tab === 'workout' ? 'block' : 'none', touchAction: 'pan-y' }}
      >
        <WorkoutTab
          sessions={sessions} saveSessions={saveSessions} setError={setError}
          profile={profile} saveProfile={saveProfile} userId={userId}
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
          {tab === 'assistant' && <AssistantTab />}
          {tab === 'profile' && (
            <ProfileTab
              profile={profile} saveProfile={saveProfile} sessions={sessions} setError={setError}
              measurements={measurements} saveSessions={saveSessions} saveMeasurements={saveMeasurements}
              onLogout={onLogout}
            />
          )}
        </div>
      )}

      <div style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 20,
        display: 'flex', justifyContent: 'center',
        background: `linear-gradient(to top, ${t.BG} 38%, transparent)`,
        paddingTop: 22,
      }}>
        {/* Пять вкладок вместо четырёх: зазор и внутренний отступ ужаты, иначе на
            320 px неактивной иконке остаётся ровно её ширина без запаса. */}
        <div style={{
          display: 'flex', gap: 5, width: '100%', maxWidth: 480, minWidth: 0, alignItems: 'center',
          padding: 8,
          margin: '0 max(14px, env(safe-area-inset-right)) calc(16px + env(safe-area-inset-bottom)) max(14px, env(safe-area-inset-left))',
          background: 'rgba(23,21,18,0.10)', backdropFilter: 'blur(22px) saturate(1.4)', WebkitBackdropFilter: 'blur(22px) saturate(1.4)',
          border: '1px solid rgba(184,146,74,0.28)', borderRadius: 24,
          boxShadow: '0 0 0 1px rgba(255,255,255,0.06) inset, 0 16px 40px rgba(0,0,0,0.4), 0 0 52px rgba(184,146,74,0.5)',
          boxSizing: 'border-box',
        }}>
          <Pill active={tab === 'progress'} onClick={() => goToTab('progress')} icon={LineIcon}>Прогресс</Pill>
          <Pill active={tab === 'measurements'} onClick={() => goToTab('measurements')} icon={Ruler}>Вес</Pill>
          <Pill active={tab === 'workout'} onClick={() => goToTab('workout')} icon={Dumbbell} main>Тренировка</Pill>
          <Pill active={tab === 'assistant'} onClick={() => goToTab('assistant')} icon={Sparkles}>Ассистент</Pill>
          <Pill active={tab === 'profile'} onClick={() => goToTab('profile')} icon={User}>Профиль</Pill>
        </div>
      </div>
      </div>
    </div>
  );
}

export default function WorkoutTracker() {
  // Тема одна — 2A. Хук useThemeController (режим авто/светлая/тёмная) удалён
  // в 1.0.6: он не влиял ни на что с 13 июля, но продолжал работать и держал
  // интервал на 60 секунд, а в профиле ему соответствовала кнопка-обманка.
  return (
    <AuthGate>
      {({ userId, displayName, onLogout }) => (
        <ThemeContext.Provider value={THEME_2A}>
          <WorkoutTrackerInner userId={userId} displayName={displayName} onLogout={onLogout} />
        </ThemeContext.Provider>
      )}
    </AuthGate>
  );
}
