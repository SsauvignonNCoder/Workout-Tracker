import React, { useState, useMemo } from 'react';
import { LogOut, Award, CheckCircle2, Circle } from 'lucide-react';
import { useTheme, GLASS_SHEEN, GLASS_BORDER, GLASS_EDGE, GLASS_BLUR, glassCard } from '../theme.js';
import { fmtDateShort } from '../dateUtils.js';
import {
  ACH_ICON, computeAchievements, groupAchievements, computeTotalXpFromSessions, getLevelInfo,
} from '../gamification.js';
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
  // Блок свёрнут: в заголовке видно, какой план ведётся, список планов — по тапу.
  const [open, setOpen] = useState(false);
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
      setOpen(false);
    } catch (e) {
      // Сообщение уже показал saveProfile; выбор остаётся прежним.
    }
    setSaving(false);
  };

  return (
    <div style={{ marginBottom: open ? 22 : 6 }}>
      <button
        onClick={() => { setOpen(!open); setPending(null); }}
        aria-expanded={open}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, width: '100%',
          background: 'transparent', border: 'none', padding: '0 0 12px', cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        <span style={{ fontSize: 12, color: t.TEXT_FAINT, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.02em', flexShrink: 0 }}>
          План тренировок
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          {!open && (
            <span style={{ fontSize: 12.5, fontWeight: 700, color: t.ACCENT_SOFT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {currentPlan.title}
            </span>
          )}
          <span style={{ color: t.TEXT_FAINT, fontSize: 11, flexShrink: 0 }}>{open ? '▼' : '▶'}</span>
        </span>
      </button>
      {open && (
        <div className="dropdown-open">
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
      )}
    </div>
  );
}

// Напоминания бота в «Настройках»: о пропущенной тренировке (api/missed-check.js)
// и о протеине через час после тренировки (api/rest-fire.js). Пояс устройства
// сохраняем вместе с переключением: сервер считает 21:30 по нему.
function AlertToggles({ profile, saveProfile }) {
  const [saving, setSaving] = useState(false);
  const save = async (patch) => {
    if (saving) return;
    let tz = null;
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch (e) { /* no-op */ }
    setSaving(true);
    try {
      await saveProfile({ ...(profile || {}), ...patch, ...(tz ? { tz } : {}) });
    } catch (e) { /* сообщение уже показал saveProfile */ }
    setSaving(false);
  };
  const missedOn = !!(profile && profile.missedAlerts);
  // Протеин: у профилей до переключателя флага нет — значит включено, как было.
  const proteinOn = !(profile && profile.proteinAlerts === false);
  return (
    <>
      <SettingToggle label="Напоминать о пропущенной тренировке" on={missedOn} saving={saving} onToggle={() => save({ missedAlerts: !missedOn })} />
      <SettingToggle label="Напоминать о протеине" on={proteinOn} saving={saving} onToggle={() => save({ proteinAlerts: !proteinOn })} />
    </>
  );
}

function SettingToggle({ label, on, saving, onToggle }) {
  const t = useTheme();
  return (
    <button
      onClick={onToggle}
      role="switch"
      aria-checked={on}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, width: '100%', boxSizing: 'border-box', textAlign: 'left',
        padding: '12px 14px', marginBottom: 10, borderRadius: 12, cursor: saving ? 'default' : 'pointer',
        background: t.BG_RAISED, border: `1px solid ${on ? t.ACCENT_BORDER : t.BORDER}`, fontFamily: 'inherit',
        opacity: saving ? 0.7 : 1,
      }}
    >
      {/* Без пояснения — так попросил Никита. */}
      <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700, color: t.TEXT }}>
        {label}
      </span>
      <span aria-hidden style={{
        flexShrink: 0, width: 44, height: 26, borderRadius: 13, position: 'relative',
        background: on ? t.ACCENT : t.BG_INPUT, border: `1px solid ${on ? t.ACCENT : t.BORDER}`,
        transition: 'background 0.2s ease',
      }}>
        <span style={{
          position: 'absolute', top: 2, left: on ? 20 : 2, width: 20, height: 20, borderRadius: '50%',
          background: on ? t.ON_ACCENT : t.TEXT_DIM, transition: 'left 0.2s ease',
        }} />
      </span>
    </button>
  );
}

// «4.4 / 5 км», «68 / 100», «15 181 / 20 000 м». Числа — без лишних нулей,
// от 10 000 — с разделителем тысяч.
function fmtProgress({ cur, goal, unit }) {
  const n = (v) => { const r = Math.round(v * 100) / 100; return r >= 10000 ? Math.round(r).toLocaleString('ru-RU') : String(r); };
  return `${n(cur)} / ${n(goal)}${unit ? ` ${unit}` : ''}`;
}

// Карточка уровня — стекло (theme.js → GLASS_*), такое же, как у таб-бара.
// Латунное свечение — часть кольца: мягкий ореол ровно по его центру (размыт
// своим filter, без backdrop-filter). Прогресс уровня показывает только кольцо.
function LevelCard({ levelInfo, totalXp }) {
  const t = useTheme();
  const pct = Math.min(100, Math.round(levelInfo.progress * 100));
  const R = 24;
  const C = 2 * Math.PI * R;
  return (
    <div style={{ position: 'relative', marginBottom: 20 }}>
      <div style={{
        position: 'relative', overflow: 'hidden', borderRadius: 22, padding: '16px 18px',
        background: `${GLASS_SHEEN}, linear-gradient(135deg, rgba(255,255,255,0.075), rgba(255,255,255,0.018))`,
        border: GLASS_BORDER, boxShadow: `${GLASS_EDGE}, 0 12px 32px rgba(0,0,0,0.35)`, ...GLASS_BLUR,
      }}>
        {/* Отступ от круга до «Уровень N» — 22 px: так попросил Никита (было 10). */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 22 }}>
          <div style={{ position: 'relative', width: 56, height: 56, flexShrink: 0 }}>
            <div aria-hidden style={{
              position: 'absolute', left: '50%', top: '50%', width: 92, height: 92, margin: '-46px 0 0 -46px',
              borderRadius: '50%', pointerEvents: 'none', filter: 'blur(12px)',
              background: 'radial-gradient(circle, rgba(199,154,78,0.45), rgba(199,154,78,0) 66%)',
            }} />
            <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden style={{ position: 'relative' }}>
              <defs>
                <linearGradient id="lvl-ring" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#F5E3AE" />
                  <stop offset="0.55" stopColor="#C79A4E" />
                  <stop offset="1" stopColor="#8B6B2E" />
                </linearGradient>
              </defs>
              <circle cx="28" cy="28" r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3.5" />
              {pct > 0 && (
                <circle cx="28" cy="28" r={R} fill="none" stroke="url(#lvl-ring)" strokeWidth="3.5" strokeLinecap="round"
                  strokeDasharray={C} strokeDashoffset={C * (1 - pct / 100)} transform="rotate(-90 28 28)"
                  style={{ transition: 'stroke-dashoffset 0.5s ease', filter: 'drop-shadow(0 0 4px rgba(199,154,78,0.55))' }} />
              )}
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: t.FONT_DISPLAY, fontSize: 21, fontWeight: 700, color: t.TEXT }}>
              {levelInfo.level}
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15.5, fontWeight: 700, color: t.TEXT, letterSpacing: '-0.01em' }}>Уровень {levelInfo.level}</div>
            <div style={{ fontSize: 11, color: t.TEXT_FAINT, fontFamily: t.FONT_MONO, marginTop: 3 }}>{Math.round(totalXp)} XP всего</div>
          </div>
          <div style={{ flexShrink: 0, textAlign: 'right' }}>
            {levelInfo.isMaxLevel ? (
              <div style={{ fontSize: 11, color: t.ACCENT_SOFT, fontFamily: t.FONT_MONO, letterSpacing: '0.04em' }}>МАКС.</div>
            ) : (
              <>
                <div style={{ fontSize: 13, fontWeight: 600, color: t.TEXT, fontFamily: t.FONT_MONO }}>
                  {Math.round(levelInfo.xpIntoLevel)}<span style={{ color: t.TEXT_FAINT }}>/{levelInfo.xpForLevel}</span>
                </div>
                <div style={{ fontSize: 10.5, color: t.TEXT_FAINT, marginTop: 3 }}>до ур. {levelInfo.level + 1}</div>
              </>
            )}
          </div>
        </div>
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
  const [showAchievements, setShowAchievements] = useState(false);
  // Выход — в два шага: кнопка открывает подтверждение под собой.
  const [confirmLogout, setConfirmLogout] = useState(false);

  const achievements = useMemo(() => computeAchievements({ sessions, measurements, profile }), [sessions, measurements, profile]);
  const achievementXp = useMemo(() => achievements.filter((a) => a.unlocked).reduce((sum, a) => sum + a.xp, 0), [achievements]);
  const planIdNow = profile && profile.planId;
  const totalXp = useMemo(() => computeTotalXpFromSessions(sessions, planIdNow) + achievementXp, [sessions, planIdNow, achievementXp]);
  const levelInfo = useMemo(() => getLevelInfo(totalXp), [totalXp]);
  const unlockedCount = achievements.filter((a) => a.unlocked).length;

  return (
    <div>
      {/* data-tour — цели обучения (src/Tour.jsx). */}
      <div data-tour="level">
        <LevelCard levelInfo={levelInfo} totalXp={totalXp} />
      </div>

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

      {/* По разделам: заголовок со счётчиком «открыто из», внутри — сначала
          открытые, по нарастающей (gamification.js → ACH_CATEGORIES). */}
      {showAchievements && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
          {groupAchievements(achievements).map((g) => (
            <React.Fragment key={g.key}>
              <div style={{
                display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10,
                margin: '10px 2px 2px', fontSize: 10.5, fontWeight: 700, color: t.TEXT_FAINT,
                textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: t.FONT_MONO,
              }}>
                <span>{g.title}</span>
                <span style={{ color: g.done === g.total ? t.ACCENT_SOFT : t.TEXT_FAINT }}>{g.done}/{g.total}</span>
              </div>
              {g.items.map((a) => (
                <div key={a.id} style={{
                  display: 'flex', alignItems: 'center', gap: 11,
                  ...(a.unlocked ? glassCard({ shadow: false }) : { background: 'transparent', border: `1px solid ${t.BORDER}` }),
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
                    {a.unlocked && a.unlockedAt && (
                      <div style={{ fontSize: 11, color: t.ACCENT_SOFT, marginTop: 3, fontFamily: t.FONT_MONO }}>открыто {fmtDateShort(a.unlockedAt)}</div>
                    )}
                    {/* Сколько осталось: тонкая полоска на всю ширину, справа — цифры. */}
                    {!a.unlocked && a.progress && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 7 }}>
                        <div style={{ flex: 1, height: 3, borderRadius: 2, background: t.BORDER, overflow: 'hidden' }}>
                          <div style={{ width: `${Math.round(a.progress.pct * 100)}%`, height: '100%', borderRadius: 2, background: t.ACCENT }} />
                        </div>
                        <span style={{ flexShrink: 0, minWidth: 64, textAlign: 'right', fontSize: 10, color: t.TEXT_DIM, fontFamily: t.FONT_MONO, whiteSpace: 'nowrap' }}>
                          {fmtProgress(a.progress)}
                        </span>
                      </div>
                    )}
                  </div>
                  <div style={{
                    flexShrink: 0, fontSize: 12, fontWeight: 700,
                    color: a.unlocked ? t.ACCENT_SOFT : t.TEXT_FAINT,
                  }}>
                    +{a.xp} XP
                  </div>
                </div>
              ))}
            </React.Fragment>
          ))}
        </div>
      )}

      <div style={{ height: 1, background: t.BORDER, margin: '0 0 18px' }} />

      <div data-tour="plan">
        <PlanPicker profile={profile} saveProfile={saveProfile} />
      </div>

      {/* Параметры тела переехали во вкладку «Вес» — там у них история замеров. */}

      <div style={{ height: 1, background: t.BORDER, margin: '12px 0 18px' }} />

      <div style={{ fontSize: 12, color: t.TEXT_FAINT, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.02em', marginBottom: 12 }}>
        Настройки
      </div>

      {/* Кнопка «Тема оформления» удалена в 1.0.6. Она крутила подпись
          «Авто · ночь → Светлая → Тёмная», но не меняла ничего: приложение
          жёстко в теме 2A с 13 июля. */}

      <div data-tour="alerts">
        <AlertToggles profile={profile} saveProfile={saveProfile} />
      </div>

      <div style={{ height: 4 }} />

      <ExportImportPanel
        sessions={sessions} measurements={measurements} profile={profile}
        saveSessions={saveSessions} saveMeasurements={saveMeasurements} saveProfile={saveProfile}
        setError={setError}
      />

      {/* Выход — в самом низу, под резервной копией, заметной «опасной» кнопкой
          и только после подтверждения: один случайный тап раньше выкидывал из
          аккаунта посреди дня. */}
      {onLogout && (
        <div style={{ marginTop: 22 }}>
          <button
            onClick={() => setConfirmLogout((v) => !v)}
            aria-expanded={confirmLogout}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, width: '100%',
              padding: '15px 16px', borderRadius: 14, border: `1.5px solid ${t.DANGER_BORDER}`,
              background: t.DANGER_BG, color: t.DANGER, fontSize: 15.5, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit', boxSizing: 'border-box',
            }}
          >
            <LogOut size={19} />
            Выйти из аккаунта
          </button>
          {confirmLogout && (
            <div className="dropdown-open" style={{
              marginTop: 10, padding: '13px', background: t.BG_RAISED, border: `1px solid ${t.DANGER_BORDER}`, borderRadius: 14,
            }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: t.TEXT, marginBottom: 5 }}>
                Выйти из аккаунта?
              </div>
              <div style={{ fontSize: 12.5, color: t.TEXT_DIM, lineHeight: 1.5, marginBottom: 12 }}>
                Тренировки и замеры останутся в базе. Чтобы вернуться, войди снова через Telegram
                или по имени и PIN. Незаконченная тренировка на этом устройстве сохранится черновиком.
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => { setConfirmLogout(false); onLogout(); }}
                  style={{
                    flex: 1, padding: '12px', borderRadius: 11, border: 'none',
                    background: t.DANGER, color: '#0A0A0A', fontSize: 14, fontWeight: 700,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  Да, выйти
                </button>
                <button
                  onClick={() => setConfirmLogout(false)}
                  style={{
                    flex: 1, padding: '12px', borderRadius: 11, border: `1px solid ${t.BORDER}`,
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
      )}

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
