import React, { useState, useEffect } from 'react';
import { Dumbbell, Ruler, LineChart as LineIcon, User, X } from 'lucide-react';
import { supabase } from './supabaseClient.js';
import { ThemeContext, useTheme, useThemeController } from './theme.js';
import { AuthGate } from './auth.jsx';
import { WorkoutTab } from './tabs/WorkoutTab.jsx';
import { MeasurementsTab } from './tabs/MeasurementsTab.jsx';
import { ProgressTab } from './tabs/ProgressTab.jsx';
import { ProfileTab } from './tabs/ProfileTab.jsx';

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
    const removedIds = [...prevById.keys()].filter((id) => !nextIds.has(id));

    const changed = nextList.filter((item) => {
      const prevItem = prevById.get(item.id);
      if (!prevItem) return true; // новая запись
      return JSON.stringify(toRow(prevItem, userId)) !== JSON.stringify(toRow(item, userId));
    });

    if (changed.length > 0) {
      const { error: upsertErr } = await supabase.from(table).upsert(changed.map((item) => toRow(item, userId)));
      if (upsertErr) throw upsertErr;
    }
    if (removedIds.length > 0) {
      const { error: delErr } = await supabase.from(table).delete().in('id', removedIds);
      if (delErr) throw delErr;
    }
  }

  const saveSessions = async (next) => {
    const prev = sessions || [];
    setSessions(next);
    try {
      await diffAndUpsert('sessions', prev, next, sessionToRow);
    } catch (e) {
      setError('Не удалось сохранить — попробуй ещё раз');
    }
  };

  const saveMeasurements = async (next) => {
    const prev = measurements || [];
    setMeasurements(next);
    try {
      await diffAndUpsert('measurements', prev, next, measurementToRow);
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
        padding: active ? '13px 8px' : '13px 4px', borderRadius: 14, flex: active ? 2.6 : 0.55, minWidth: 0,
        border: `1px solid ${active ? t.ACCENT_BORDER : 'transparent'}`,
        background: active ? t.ACCENT_BG : 'transparent',
        color: active ? t.ACCENT_SOFT : t.TEXT_DIM,
        boxShadow: active ? t.GLOW : 'none',
        fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
        transition: 'flex 0.25s ease, background 0.2s ease, border-color 0.2s ease, color 0.2s ease',
        fontFamily: 'inherit',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}
    >
      {Icon && <Icon size={active ? 15 : 19} strokeWidth={2.2} style={{ flexShrink: 0, transition: 'all 0.2s ease' }} />}
      {active && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{children}</span>}
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
        fontFamily: "'Manrope', system-ui, -apple-system, sans-serif",
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
      padding: '24px max(18px, env(safe-area-inset-right)) calc(110px + env(safe-area-inset-bottom)) max(18px, env(safe-area-inset-left))',
      fontFamily: "'Manrope', system-ui, -apple-system, sans-serif",
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
              mode={mode} isDark={isDark} cycle={cycle} onLogout={onLogout}
            />
          )}
        </div>
      )}

      <div style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 20,
        display: 'flex', justifyContent: 'center',
        background: `linear-gradient(to top, ${t.BG} 65%, transparent)`,
        paddingTop: 20,
      }}>
        <div style={{
          display: 'flex', gap: 6, width: '100%', maxWidth: 480, minWidth: 0,
          padding: '8px',
          margin: '0 max(14px, env(safe-area-inset-right)) calc(16px + env(safe-area-inset-bottom)) max(14px, env(safe-area-inset-left))',
          background: t.NAV_BG, backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
          border: `1px solid ${t.BORDER}`, borderRadius: 22, boxShadow: '0 14px 34px rgba(0,0,0,0.4)',
          boxSizing: 'border-box',
        }}>
          <Pill active={tab === 'workout'} onClick={() => goToTab('workout')} icon={Dumbbell}>Тренировка</Pill>
          <Pill active={tab === 'measurements'} onClick={() => goToTab('measurements')} icon={Ruler}>Вес</Pill>
          <Pill active={tab === 'progress'} onClick={() => goToTab('progress')} icon={LineIcon}>Прогресс</Pill>
          <Pill active={tab === 'profile'} onClick={() => goToTab('profile')} icon={User}>Профиль</Pill>
        </div>
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
