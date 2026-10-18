import React, { useState, useMemo } from 'react';
import { LogOut, Award, CheckCircle2, Circle } from 'lucide-react';
import { useTheme } from '../theme.js';
import { todayISO, fmtDateShort } from '../dateUtils.js';
import {
  ACH_ICON, BODY_FIELDS, computeAchievements, computeTotalXpFromSessions, getLevelInfo,
} from '../gamification.js';
import { Field, getInputStyle } from './workoutTabHelpers.jsx';
import { PLANS, DEFAULT_PLAN_ID, getPlan } from '../plans.js';
import { APP_VERSION } from '../version.js';

// Выбор плана тренировок (1.1.0). Планы живут в src/plans.js; старый план не
// удаляется — к нему привязаны все тренировки до 1.1.0, и на него можно
// вернуться. Переключение сбрасывает «последний день» в 0: следующая
// тренировка начнётся с первого дня выбранного плана. История и рекорды не
// меняются — каждая тренировка помнит свой план.
function PlanPicker({ profile, saveProfile }) {
  const t = useTheme();
  const current = (profile && profile.planId) || DEFAULT_PLAN_ID;
  const [pending, setPending] = useState(null);
  const [saving, setSaving] = useState(false);
  const lastDay = profile && profile.lastProgramDay;
  const currentPlan = getPlan(current);

  const confirm = async () => {
    if (!pending) return;
    setSaving(true);
    try {
      await saveProfile({ ...(profile || {}), planId: pending, lastProgramDay: 0 });
      setPending(null);
    } catch (e) {
      // Сообщение уже показал saveProfile; выбор остаётся прежним.
    }
    setSaving(false);
  };

  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontSize: 12, color: t.TEXT_FAINT, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.02em', marginBottom: 12 }}>
        План тренировок
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {PLANS.map((p) => {
          const active = p.id === current;
          const chosen = p.id === pending;
          return (
            <button
              key={p.id}
              onClick={() => setPending(active ? null : p.id)}
              aria-pressed={active}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 11, width: '100%', textAlign: 'left',
                boxSizing: 'border-box', padding: '12px 14px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit',
                background: active ? t.ACCENT_BG : t.BG_RAISED,
                border: `1px solid ${active || chosen ? t.ACCENT : t.BORDER}`,
              }}
            >
              <span style={{ flexShrink: 0, marginTop: 1, color: active ? t.ACCENT_SOFT : t.TEXT_FAINT }}>
                {active ? <CheckCircle2 size={19} /> : <Circle size={19} />}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 14.5, fontWeight: 700, color: active ? t.ACCENT_SOFT : t.TEXT, marginBottom: 3 }}>
                  {p.title}
                </span>
                <span style={{ display: 'block', fontSize: 12, color: t.TEXT_FAINT, lineHeight: 1.4 }}>
                  {p.description}
                </span>
                {active && lastDay > 0 && (
                  <span style={{ display: 'block', fontSize: 11.5, color: t.TEXT_DIM, marginTop: 5, fontFamily: t.FONT_MONO }}>
                    последний сделанный день: {lastDay} из {p.days.length}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {pending && (
        <div style={{
          marginTop: 10, padding: '12px', background: t.BG_RAISED, border: `1px solid ${t.ACCENT}`, borderRadius: 12,
        }}>
          <div style={{ fontSize: 12.5, color: t.TEXT_DIM, lineHeight: 1.5, marginBottom: 10 }}>
            Переключить с «{currentPlan.title}» на «{getPlan(pending).title}»? Следующая тренировка начнётся
            с дня 1. История и рекорды не меняются — прошлые тренировки остаются в своём плане.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={confirm}
              disabled={saving}
              style={{
                flex: 1, padding: '11px', borderRadius: 10, border: 'none',
                background: t.ACCENT_GRAD, color: t.ON_ACCENT, fontSize: 14, fontWeight: 700,
                cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1, fontFamily: 'inherit',
              }}
            >
              {saving ? 'Переключаю…' : 'Переключить'}
            </button>
            <button
              onClick={() => setPending(null)}
              disabled={saving}
              style={{
                flex: 1, padding: '11px', borderRadius: 10, border: `1px solid ${t.BORDER}`,
                background: 'transparent', color: t.TEXT_DIM, fontSize: 14, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Отмена
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function LevelCard({ levelInfo, totalXp }) {
  const t = useTheme();
  const pct = Math.min(100, Math.round(levelInfo.progress * 100));
  return (
    <div style={{
      background: `linear-gradient(135deg, ${t.BG_RAISED}, ${t.BG_INPUT})`,
      border: `1px solid ${t.BORDER}`, borderRadius: 20, padding: '18px', marginBottom: 20, boxShadow: t.CARD_SHADOW,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ position: 'relative', width: 60, height: 60, flexShrink: 0 }}>
            <svg width="60" height="60" viewBox="0 0 60 60">
              <circle cx="30" cy="30" r="25" fill="none" stroke={t.BORDER} strokeWidth="5" />
              <circle cx="30" cy="30" r="25" fill="none" stroke={t.ACCENT} strokeWidth="5" strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 25} strokeDashoffset={2 * Math.PI * 25 * (1 - pct / 100)}
                transform="rotate(-90 30 30)" style={{ transition: 'stroke-dashoffset 0.5s ease' }} />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: t.FONT_DISPLAY, fontSize: 23, fontWeight: 700, color: t.TEXT }}>
              {levelInfo.level}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: t.TEXT }}>Уровень {levelInfo.level}</div>
            <div style={{ fontSize: 11.5, color: t.TEXT_FAINT }}>{Math.round(totalXp)} XP всего</div>
          </div>
        </div>
        {!levelInfo.isMaxLevel && (
          <div style={{ textAlign: 'right', fontSize: 11.5, color: t.TEXT_FAINT }}>
            до ур. {levelInfo.level + 1}<br />
            <span style={{ color: t.TEXT_DIM, fontWeight: 600 }}>
              {Math.round(levelInfo.xpIntoLevel)}/{levelInfo.xpForLevel} XP
            </span>
          </div>
        )}
      </div>
      <div style={{ height: 7, borderRadius: 4, background: t.BORDER, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${pct}%`, borderRadius: 4,
          background: t.ACCENT_GRAD, transition: 'width 0.4s ease',
        }} />
      </div>
    </div>
  );
}

function ExportImportPanel({ sessions, measurements, profile, saveSessions, saveMeasurements, saveProfile, setError }) {
  const t = useTheme();
  const [mode, setMode] = useState(null); // null | 'export' | 'import'
  const [importText, setImportText] = useState('');
  const [copied, setCopied] = useState(false);
  const [confirmingImport, setConfirmingImport] = useState(false);
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
    // Первое нажатие только просит подтверждение — само восстановление (которое
    // затирает текущие тренировки/замеры/профиль) происходит вторым нажатием,
    // чтобы случайная вставка не того текста не стёрла данные необратимо.
    if (!confirmingImport) {
      setConfirmingImport(true);
      return;
    }
    // Разбор и проверка формы ДО записи. Раньше сюда уходило что угодно, что
    // разобралось как JSON: мусорные записи попадали в состояние приложения, а
    // upsert падал уже на стороне базы — и дальше приложение работало с
    // содержимым, которого в базе нет.
    let data;
    try {
      data = JSON.parse(importText.trim());
    } catch (err) {
      setConfirmingImport(false);
      setError('Не удалось прочитать текст — проверь, что это полная копия из экспорта');
      return;
    }
    const looksLikeRows = (arr) => Array.isArray(arr)
      && arr.every((r) => r && typeof r === 'object' && typeof r.id === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.date || ''));
    if (!data || typeof data !== 'object'
      || (data.sessions !== undefined && !looksLikeRows(data.sessions))
      || (data.measurements !== undefined && !looksLikeRows(data.measurements))
      || (data.profile !== undefined && (typeof data.profile !== 'object' || data.profile === null))) {
      setConfirmingImport(false);
      setError('Копия повреждена или это не тот текст — восстановление отменено, данные не тронуты');
      return;
    }

    // Три части восстанавливаются по очереди и общей транзакции не образуют: если
    // тренировки уже записались, а замеры не успели, восстановление окажется
    // половинчатым. Сказать об этом честнее, чем показать общий баннер «не удалось
    // сохранить» и оставить человека гадать, что именно доехало.
    let done = 0;
    try {
      if (data.sessions) { await saveSessions(data.sessions); done += 1; }
      if (data.measurements) { await saveMeasurements(data.measurements); done += 1; }
      if (data.profile) { await saveProfile(data.profile); done += 1; }
      setMode(null);
      setImportText('');
      setConfirmingImport(false);
    } catch (err) {
      setConfirmingImport(false);
      if (done > 0) {
        setError('Восстановление прошло не полностью — часть данных заменена, часть осталась прежней. Проверь связь и повтори: текст копии не стёрт.');
      }
      // При done === 0 общий баннер от save* уже всё сказал.
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
            background: mode === 'export' ? t.ACCENT_BG : t.BG_INPUT, color: mode === 'export' ? t.ACCENT_SOFT : t.TEXT,
            fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          Создать копию
        </button>
        <button
          onClick={() => { setMode(mode === 'import' ? null : 'import'); setConfirmingImport(false); }}
          style={{
            flex: 1, padding: '9px 10px', borderRadius: 8, border: `1px solid ${mode === 'import' ? t.ACCENT : t.BORDER}`,
            background: mode === 'import' ? t.ACCENT_BG : t.BG_INPUT, color: mode === 'import' ? t.ACCENT_SOFT : t.TEXT,
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
              padding: '10px', color: t.TEXT_DIM, fontSize: 11, fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
              boxSizing: 'border-box', resize: 'vertical', marginBottom: 10,
            }}
          />
          <button
            onClick={handleCopy}
            style={{
              width: '100%', padding: '12px', borderRadius: 12, border: 'none',
              background: copied ? t.POSITIVE : t.ACCENT_GRAD, color: t.ON_ACCENT, fontSize: 14, fontWeight: 700,
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
            onChange={(e) => { setImportText(e.target.value); setConfirmingImport(false); }}
            placeholder="Вставь сюда скопированный текст..."
            style={{
              width: '100%', height: 100, background: t.BG_INPUT, border: `1px solid ${t.BORDER}`, borderRadius: 8,
              padding: '10px', color: t.TEXT, fontSize: 11, fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
              boxSizing: 'border-box', resize: 'vertical', marginBottom: 10,
            }}
          />
          {confirmingImport && (
            <div style={{ fontSize: 12.5, color: t.ACCENT_SOFT, fontWeight: 600, marginBottom: 8, lineHeight: 1.4 }}>
              Точно заменить текущие данные этой копией? Действие необратимо — нажми ещё раз, чтобы подтвердить.
            </div>
          )}
          <button
            onClick={handleImport}
            style={{
              width: '100%', padding: '12px', borderRadius: 12, border: 'none',
              background: confirmingImport ? t.ACCENT_DEEP : t.ACCENT_GRAD, color: t.ON_ACCENT, fontSize: 14, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {confirmingImport ? 'Да, заменить данные' : 'Восстановить данные'}
          </button>
        </div>
      )}
    </div>
  );
}

export function ProfileTab({ profile, saveProfile, sessions, setError, measurements, saveSessions, saveMeasurements, onLogout }) {
  const t = useTheme();
  const [draft, setDraft] = useState(() => {
    const init = {};
    BODY_FIELDS.forEach((f) => { init[f.key] = profile && profile[f.key] != null ? String(profile[f.key]) : ''; });
    return init;
  });
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [showAchievements, setShowAchievements] = useState(false);

  const achievements = useMemo(() => computeAchievements({ sessions, measurements, profile }), [sessions, measurements, profile]);
  const achievementXp = useMemo(() => achievements.filter((a) => a.unlocked).reduce((sum, a) => sum + a.xp, 0), [achievements]);
  const totalXp = useMemo(() => computeTotalXpFromSessions(sessions) + achievementXp, [sessions, achievementXp]);
  const levelInfo = useMemo(() => getLevelInfo(totalXp), [totalXp]);
  const unlockedCount = achievements.filter((a) => a.unlocked).length;

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
    try {
      await saveProfile(next);
    } catch (e) {
      setSaving(false);
      return; // сообщение уже показал saveProfile — «Сохранено ✓» не рисуем
    }
    setSaving(false);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2200);
  };

  return (
    <div>
      <LevelCard levelInfo={levelInfo} totalXp={totalXp} />

      <button
        onClick={() => setShowAchievements(!showAchievements)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
          background: 'transparent', border: 'none', padding: '0 0 12px', cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        <span style={{ fontSize: 12, color: t.TEXT_FAINT, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.02em' }}>
          Достижения ({unlockedCount}/{achievements.length})
        </span>
        <span style={{ color: t.TEXT_FAINT, fontSize: 11 }}>{showAchievements ? '▼' : '▶'}</span>
      </button>

      {showAchievements && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
          {achievements.map((a) => (
            <div key={a.id} style={{
              display: 'flex', alignItems: 'center', gap: 11,
              background: a.unlocked ? t.BG_RAISED : 'transparent',
              border: `1px solid ${a.unlocked ? t.BORDER : t.BORDER}`,
              borderRadius: 11, padding: '12px 14px',
              opacity: a.unlocked ? 1 : 0.5,
            }}>
              <div style={{
                flexShrink: 0, width: 38, height: 38, borderRadius: 11,
                background: a.unlocked ? t.ACCENT_BG : t.BG_INPUT,
                border: `1px solid ${a.unlocked ? t.ACCENT_BORDER : t.BORDER}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {React.createElement(ACH_ICON[a.icon] || Award, { size: 18, color: a.unlocked ? t.ACCENT_SOFT : t.TEXT_FAINT, strokeWidth: 1.8 })}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: t.TEXT, marginBottom: 2 }}>{a.title}</div>
                <div style={{ fontSize: 11.5, color: t.TEXT_FAINT, lineHeight: 1.35 }}>{a.description}</div>
              </div>
              <div style={{
                flexShrink: 0, fontSize: 12, fontWeight: 700,
                color: a.unlocked ? t.ACCENT_SOFT : t.TEXT_FAINT,
              }}>
                +{a.xp} XP
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ height: 1, background: t.BORDER, margin: '0 0 18px' }} />

      <PlanPicker profile={profile} saveProfile={saveProfile} />

      <div style={{ height: 1, background: t.BORDER, margin: '0 0 18px' }} />

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
          width: '100%', padding: '15px', borderRadius: 16, border: 'none',
          background: justSaved ? t.POSITIVE : t.ACCENT_GRAD, color: t.ON_ACCENT,
          fontSize: 15.5, fontWeight: 700, cursor: saving ? 'default' : 'pointer',
          opacity: saving ? 0.7 : 1, fontFamily: 'inherit',
          boxShadow: justSaved ? 'none' : t.GLOW,
          transition: 'background 0.2s ease, box-shadow 0.2s ease',
        }}
      >
        {justSaved ? 'Сохранено ✓' : saving ? 'Сохраняю...' : 'Сохранить параметры'}
      </button>

      <div style={{ height: 1, background: t.BORDER, margin: '26px 0 18px' }} />

      <div style={{ fontSize: 12, color: t.TEXT_FAINT, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.02em', marginBottom: 12 }}>
        Настройки
      </div>

      {/* Кнопка «Тема оформления» удалена в 1.0.6. Она крутила подпись
          «Авто · ночь → Светлая → Тёмная», но не меняла ничего: приложение
          жёстко в теме 2A с 13 июля. */}

      {onLogout && (
        <button
          onClick={onLogout}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, width: '100%',
            padding: '14px 16px', borderRadius: 12, border: `1px solid ${t.ACCENT}`,
            background: t.ACCENT_BG, color: t.ACCENT_SOFT, fontSize: 15, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit', boxSizing: 'border-box',
          }}
        >
          <LogOut size={18} />
          Выйти из аккаунта
        </button>
      )}

      <div style={{ height: 1, background: t.BORDER, margin: '26px 0 18px' }} />

      <ExportImportPanel
        sessions={sessions} measurements={measurements} profile={profile}
        saveSessions={saveSessions} saveMeasurements={saveMeasurements} saveProfile={saveProfile}
        setError={setError}
      />

      {/* Версия приложения — самый низ профиля. Значение берётся из src/version.js,
          история изменений — в CHANGELOG.md в корне репозитория. */}
      <div style={{
        marginTop: 18, paddingTop: 4, textAlign: 'center',
        fontSize: 10.5, letterSpacing: '0.06em',
        color: t.TEXT_FAINT, fontFamily: t.FONT_MONO, opacity: 0.75,
      }}>
        Дневник тренировок · v{APP_VERSION}
      </div>
    </div>
  );
}
