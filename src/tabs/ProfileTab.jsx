import React, { useState, useMemo } from 'react';
import { LogOut, Award, CheckCircle2, Circle, Pencil, Trash2, Copy, Share2, Sparkles, KeyRound } from 'lucide-react';
import { useTheme, GLASS_SHEEN, GLASS_BORDER, GLASS_EDGE, GLASS_BLUR, glassCard } from '../theme.js';
import { fmtDateShort } from '../dateUtils.js';
import {
  ACH_ICON, computeAchievements, groupAchievements, computeTotalXpFromSessions, getLevelInfo,
} from '../gamification.js';
import { PLANS, DEFAULT_PLAN_ID, getPlan } from '../plans.js';
import {
  planFromRow, planSummary, draftFromBuiltin, emptyDraft, MAX_USER_PLANS, planRowsForBackup, looksLikePlanRows, adoptPlanRows,
} from '../userPlans.js';
import { PlanEditor } from './PlanEditor.jsx';
import { PlanStudio, PlanShareSheet } from './PlanStudio.jsx';
import { APP_VERSION } from '../version.js';
import { tr, achTitle, achDescription, locale } from '../i18n.js';
import { toDisp, unit as unitLabel, KIND_OF_UNIT, convertText, isImperial, showNum } from '../units.js';

// Выбор плана тренировок (1.1.0). Планы живут в src/plans.js; старый план не
// удаляется — к нему привязаны все тренировки до 1.1.0, и на него можно
// вернуться. Переключение сбрасывает «последний день» в 0: следующая
// тренировка начнётся с первого дня выбранного плана. История и рекорды не
// меняются — каждая тренировка помнит свой план.
function PlanPicker({
  profile, saveProfile, sessions, planRows, saveUserPlan, deleteUserPlan, createPlanShare, fetchPlanShare,
}) {
  const t = useTheme();
  const current = (profile && profile.planId) || DEFAULT_PLAN_ID;
  // Блок свёрнут: в заголовке видно, какой план ведётся, список планов — по тапу.
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(null);
  const [saving, setSaving] = useState(false);
  const lastDay = profile && profile.lastProgramDay;
  const currentPlan = getPlan(current);
  const ownPlans = (planRows || []).filter((r) => !r.deleted_at).map(planFromRow);
  const [editing, setEditing] = useState(null); // { id?, heading, title, weekdays, weeks }
  const [studio, setStudio] = useState(null); // 'ai' | 'code'
  const [sharing, setSharing] = useState(null); // свой план
  const [armedDelete, setArmedDelete] = useState(null);
  const [planNote, setPlanNote] = useState('');

  const openNew = () => setEditing({ ...emptyDraft(), heading: tr('Новый план') });
  const openCopy = (p) => setEditing({ ...draftFromBuiltin(p), heading: tr('Новый план') });
  const openEdit = (p) => setEditing({
    id: p.id, heading: tr('Изменить план'), title: p.title, weekdays: p.stored.weekdays, weeks: p.stored.weeks,
  });
  const removePlan = async (id) => {
    if (armedDelete !== id) { setArmedDelete(id); return; }
    setArmedDelete(null);
    try {
      await deleteUserPlan(id);
    } catch (e) {
      setPlanNote(tr('Не удалось удалить план — проверь связь'));
    }
  };
  const planAction = {
    flex: '1 1 0', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '7px 9px', borderRadius: 8, border: `1px solid ${t.BORDER}`,
    background: 'transparent', color: t.TEXT_DIM, fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
  };

  const confirm = async () => {
    if (!pending) return;
    setSaving(true);
    try {
      await saveProfile({ planId: pending, lastProgramDay: 0 });
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
          {tr("План тренировок")}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          {!open && (
            <span style={{ fontSize: 12.5, fontWeight: 700, color: t.ACCENT_SOFT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {tr(currentPlan.title)}
            </span>
          )}
          <span style={{ color: t.TEXT_FAINT, fontSize: 11, flexShrink: 0 }}>{open ? '▼' : '▶'}</span>
        </span>
      </button>
      {open && (
        <div className="dropdown-open">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[...PLANS, ...ownPlans].map((p) => {
              const active = p.id === current;
              const chosen = p.id === pending;
              return (
                <div key={p.id}>
                <button
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
                      {tr(p.title)}
                    </span>
                    <span style={{ display: 'block', fontSize: 12, color: t.TEXT_FAINT, lineHeight: 1.4 }}>
                      {p.custom ? planSummary(p) : tr(p.description)}
                    </span>
                    {active && lastDay > 0 && (
                      <span style={{ display: 'block', fontSize: 11.5, color: t.TEXT_DIM, marginTop: 5, fontFamily: t.FONT_MONO }}>
                        {tr("последний сделанный день:")} {lastDay} {tr("из")} {p.days.length}
                      </span>
                    )}
                  </span>
                </button>
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  {p.custom ? (
                    <>
                      <button onClick={() => openEdit(p)} style={planAction}><Pencil size={12} /> {tr('Изменить')}</button>
                      <button onClick={() => setSharing(p)} style={planAction}><Share2 size={12} /> {tr('Поделиться')}</button>
                      {/* Текущий план не удаляем: сначала надо переключиться на другой. */}
                      {!active && (
                        <button
                          onClick={() => removePlan(p.id)}
                          style={armedDelete === p.id ? { ...planAction, color: t.DANGER, borderColor: t.DANGER_BORDER, background: t.DANGER_BG } : planAction}
                        >
                          <Trash2 size={12} /> {armedDelete === p.id ? tr('Точно удалить?') : tr('Удалить')}
                        </button>
                      )}
                    </>
                  ) : (
                    <button onClick={() => openCopy(p)} style={planAction}><Copy size={12} /> {tr('Сделать свою копию')}</button>
                  )}
                </div>
                </div>
              );
            })}
          </div>

          {ownPlans.length < MAX_USER_PLANS && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: t.TEXT_FAINT, marginBottom: 7 }}>{tr('Создать свой план')}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
                {[
                  { key: 'manual', label: tr('Вручную'), icon: Pencil, onClick: openNew },
                  { key: 'ai', label: tr('С ИИ'), icon: Sparkles, onClick: () => setStudio('ai') },
                  { key: 'code', label: tr('По коду'), icon: KeyRound, onClick: () => setStudio('code') },
                ].map(({ key, label, icon: Icon, onClick }) => (
                  <button
                    key={key}
                    onClick={onClick}
                    style={{
                      padding: '11px 4px', borderRadius: 12, border: `1px dashed ${t.ACCENT_BORDER}`, background: 'transparent',
                      color: t.ACCENT_SOFT, fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    }}
                  >
                    <Icon size={14} /> {label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {planNote && <div style={{ marginTop: 8, fontSize: 12.5, color: t.DANGER }}>{planNote}</div>}

          {pending && (
            <div style={{
              marginTop: 10, padding: '12px', background: t.BG_RAISED, border: `1px solid ${t.ACCENT}`, borderRadius: 12,
            }}>
              <div style={{ fontSize: 12.5, color: t.TEXT_DIM, lineHeight: 1.5, marginBottom: 10 }}>
                {tr("Переключить с «{0}» на «{1}»? Следующая тренировка начнётся с дня 1. История и рекорды не меняются — прошлые тренировки остаются в своём плане.", tr(currentPlan.title), tr(getPlan(pending).title))}
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
                  {saving ? tr("Переключаю…") : tr("Переключить")}
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
                  {tr("Отмена")}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {studio && (
        <PlanStudio
          mode={studio}
          sessions={sessions}
          planCount={ownPlans.length}
          saveUserPlan={saveUserPlan}
          saveProfile={saveProfile}
          fetchPlanShare={fetchPlanShare}
          onClose={() => setStudio(null)}
        />
      )}
      {sharing && (
        <PlanShareSheet
          title={sharing.title}
          stored={sharing.stored}
          createPlanShare={createPlanShare}
          onClose={() => setSharing(null)}
        />
      )}
      {editing && (
        <PlanEditor
          initial={editing}
          heading={editing.heading}
          sessions={sessions}
          onClose={() => setEditing(null)}
          onSave={async ({ title, plan }) => {
            await saveUserPlan({ id: editing.id, title, plan });
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

// Напоминания бота в «Настройках»: о пропущенной тренировке и о несохранённой
// (api/missed-check.js), о протеине через час после тренировки (api/rest-fire.js). Пояс устройства
// сохраняем вместе с переключением: сервер считает 21:30 по нему.
function AlertToggles({ profile, saveProfile }) {
  const [saving, setSaving] = useState(false);
  const save = async (patch) => {
    if (saving) return;
    let tz = null;
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch (e) { /* no-op */ }
    setSaving(true);
    try {
      await saveProfile({ ...patch, ...(tz ? { tz } : {}) });
    } catch (e) { /* сообщение уже показал saveProfile */ }
    setSaving(false);
  };
  const missedOn = !!(profile && profile.missedAlerts);
  // Протеин: у профилей до переключателя флага нет — значит включено, как было.
  const proteinOn = !(profile && profile.proteinAlerts === false);
  const unsavedOn = !(profile && profile.unsavedAlerts === false);
  return (
    <>
      <SettingToggle label={tr("Напоминать о пропущенной тренировке")} on={missedOn} saving={saving} onToggle={() => save({ missedAlerts: !missedOn })} />
      <SettingToggle label={tr("Напоминать о несохранённой тренировке")} on={unsavedOn} saving={saving} onToggle={() => save({ unsavedAlerts: !unsavedOn })} />
      <SettingToggle label={tr("Напоминать о протеине")} on={proteinOn} saving={saving} onToggle={() => save({ proteinAlerts: !proteinOn })} />
    </>
  );
}

// Язык интерфейса и система единиц: подпись всегда на обоих языках — чтобы
// найти, даже не понимая текущий.
function LangSwitch({ lang, onLang }) {
  const opts = [{ key: 'ru', label: 'Русский' }, { key: 'en', label: 'English' }];
  return <ChoiceSwitch title="Язык · Language" opts={opts} value={lang} onChange={onLang} />;
}

function UnitsSwitch({ units, onUnits }) {
  const opts = [{ key: 'metric', label: tr('кг, км') }, { key: 'imperial', label: tr('фнт, мили') }];
  return <ChoiceSwitch title="Единицы · Units" opts={opts} value={units} onChange={onUnits} />;
}

function ChoiceSwitch({ title, opts, value, onChange }) {
  const t = useTheme();
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '8px 8px 8px 14px', marginBottom: 10,
      borderRadius: 12, background: t.BG_RAISED, border: `1px solid ${t.BORDER}`,
    }}>
      <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: t.TEXT }}>{title}</span>
      <div role="radiogroup" aria-label={title} style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        {opts.map((o) => {
          const on = o.key === value;
          return (
            <button
              key={o.key}
              role="radio"
              aria-checked={on}
              onClick={() => onChange(o.key)}
              style={{
                padding: '7px 11px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit',
                fontSize: 12.5, fontWeight: 700,
                background: on ? t.ACCENT_BG : 'transparent', color: on ? t.ACCENT_SOFT : t.TEXT_DIM,
                border: `1px solid ${on ? t.ACCENT_BORDER : 'transparent'}`,
              }}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
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
      <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: t.TEXT }}>
        {label}
      </span>
      {/* Тумблер длинный и тонкий (52 × 20), ползунок — вытянутая «таблетка»
          24 × 16, а не круг: так попросил Никита (было 44 × 26 с кругом). */}
      <span aria-hidden style={{
        flexShrink: 0, width: 52, height: 20, borderRadius: 10, position: 'relative',
        background: on ? t.ACCENT : t.BG_INPUT, border: `1px solid ${on ? t.ACCENT : t.BORDER}`,
        transition: 'background 0.2s ease',
      }}>
        <span style={{
          position: 'absolute', top: 2, left: on ? 26 : 2, width: 24, height: 16, borderRadius: 8,
          background: on ? t.ON_ACCENT : t.TEXT_DIM, transition: 'left 0.2s ease',
        }} />
      </span>
    </button>
  );
}

// «4.4 / 5 км», «68 / 100», «15 181 / 20 000 м». Числа — без лишних нулей,
// от 10 000 — с разделителем тысяч.
// Пороги — в метрике; кг, км, м, см и тонны показываются в выбранной системе.
function fmtProgress({ cur, goal, unit }) {
  const k = KIND_OF_UNIT[unit];
  // Пересчитанные — как в описании (showNum), порог — вверх: «143 / 221 lb», а не
  // «220 / 220 lb» у закрытого достижения (порог 100 кг = 220.46 lb).
  const conv = k && isImperial();
  const n = (x, ceil = false) => {
    if (conv) return showNum(toDisp(k, x), ceil);
    const r = Math.round(x * 100) / 100;
    return r >= 10000 ? Math.round(r).toLocaleString(locale()) : String(r);
  };
  return `${n(cur)} / ${n(goal, true)}${unit ? ` ${k ? unitLabel(k) : tr(unit)}` : ''}`;
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
            <div style={{ fontSize: 15.5, fontWeight: 700, color: t.TEXT, letterSpacing: '-0.01em' }}>{tr("Уровень")} {levelInfo.level}</div>
            <div style={{ fontSize: 11, color: t.TEXT_FAINT, fontFamily: t.FONT_MONO, marginTop: 3 }}>{Math.round(totalXp)} {tr("XP всего")}</div>
          </div>
          <div style={{ flexShrink: 0, textAlign: 'right' }}>
            {levelInfo.isMaxLevel ? (
              <div style={{ fontSize: 11, color: t.ACCENT_SOFT, fontFamily: t.FONT_MONO, letterSpacing: '0.04em' }}>{tr("МАКС.")}</div>
            ) : (
              <>
                <div style={{ fontSize: 13, fontWeight: 600, color: t.TEXT, fontFamily: t.FONT_MONO }}>
                  {Math.round(levelInfo.xpIntoLevel)}<span style={{ color: t.TEXT_FAINT }}>/{levelInfo.xpForLevel}</span>
                </div>
                <div style={{ fontSize: 10.5, color: t.TEXT_FAINT, marginTop: 3 }}>{tr("до ур.")} {levelInfo.level + 1}</div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ExportImportPanel({ sessions, measurements, profile, planRows, restoreUserPlans, saveSessions, saveMeasurements, saveProfile, setError }) {
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
      userPlans: planRowsForBackup(planRows),
    };
    return JSON.stringify(payload);
  }, [sessions, measurements, profile, planRows]);

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
          setError(tr("Не удалось скопировать — выдели текст вручную и скопируй"));
        }
      }
    }
  };

  const handleImport = async () => {
    if (!importText.trim()) {
      setError(tr("Вставь сохранённый текст экспорта"));
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
      setError(tr("Не удалось прочитать текст — проверь, что это полная копия из экспорта"));
      return;
    }
    const looksLikeRows = (arr) => Array.isArray(arr)
      && arr.every((r) => r && typeof r === 'object' && typeof r.id === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.date || ''));
    // Тренировка без списка упражнений (или со списком не того вида) роняла
    // приложение при отрисовке — такую копию не берём.
    const looksLikeSessions = (arr) => looksLikeRows(arr) && arr.every((r) => (
      (r.exercises === undefined || (Array.isArray(r.exercises) && r.exercises.every((e) => e && typeof e === 'object' && typeof e.name === 'string')))
      && (r.cardio === undefined || (Array.isArray(r.cardio) && r.cardio.every((c) => c && typeof c === 'object')))
    ));
    if (!data || typeof data !== 'object'
      || (data.sessions !== undefined && !looksLikeSessions(data.sessions))
      || (data.measurements !== undefined && !looksLikeRows(data.measurements))
      || (data.profile !== undefined && (typeof data.profile !== 'object' || data.profile === null))
      || (data.userPlans !== undefined && !looksLikePlanRows(data.userPlans))) {
      setConfirmingImport(false);
      setError(tr("Копия повреждена или это не тот текст — восстановление отменено, данные не тронуты"));
      return;
    }

    // Три части восстанавливаются по очереди и общей транзакции не образуют: если
    // тренировки уже записались, а замеры не успели, восстановление окажется
    // половинчатым. Сказать об этом честнее, чем показать общий баннер «не удалось
    // сохранить» и оставить человека гадать, что именно доехало.
    // Записи, id которых нет среди своих, получают новый id: запись в базу идёт
    // по id, и копия ДРУГОГО аккаунта (Telegram ↔ вход по PIN) иначе не
    // копировалась бы, а переезжала сюда — и пропадала у того аккаунта.
    const suffix = `-r${Date.now().toString(36)}`;
    const adopt = (rows, mine) => {
      const own = new Set((mine || []).map((r) => r.id));
      return rows.map((r) => (own.has(r.id) ? r : { ...r, id: `${r.id}${suffix}` }));
    };
    // Планы — первыми: тренировки и профиль ссылаются на них.
    const plansIn = adoptPlanRows(data.userPlans || [], (planRows || []).map((r) => r.id), suffix);
    const sessionsIn = data.sessions
      && adopt(data.sessions.map((s) => ({ ...s, exercises: s.exercises || [], cardio: s.cardio || [], planId: plansIn.planIdOf(s.planId) })), sessions);
    const measurementsIn = data.measurements && adopt(data.measurements, measurements);
    const profileIn = data.profile && (data.profile.planId
      ? { ...data.profile, planId: plansIn.planIdOf(data.profile.planId) } : data.profile);
    let done = 0;
    try {
      if (plansIn.rows.length) { await restoreUserPlans(plansIn.rows); done += 1; }
      if (sessionsIn) { await saveSessions(sessionsIn); done += 1; }
      if (measurementsIn) { await saveMeasurements(measurementsIn); done += 1; }
      if (profileIn) { await saveProfile(profileIn); done += 1; }
      setMode(null);
      setImportText('');
      setConfirmingImport(false);
    } catch (err) {
      setConfirmingImport(false);
      if (done > 0) {
        setError(tr("Восстановление прошло не полностью — часть данных заменена, часть осталась прежней. Проверь связь и повтори: текст копии не стёрт."));
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
          {tr("Резервная копия данных текстом — на случай сбоев автосохранения")}
        </span>
        <button
          onClick={() => setMode(mode === 'export' ? null : 'export')}
          style={{
            flex: 1, padding: '9px 10px', borderRadius: 8, border: `1px solid ${mode === 'export' ? t.ACCENT : t.BORDER}`,
            background: mode === 'export' ? t.ACCENT_BG : t.BG_INPUT, color: mode === 'export' ? t.ACCENT_SOFT : t.TEXT,
            fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          {tr("Создать копию")}
        </button>
        <button
          onClick={() => { setMode(mode === 'import' ? null : 'import'); setConfirmingImport(false); }}
          style={{
            flex: 1, padding: '9px 10px', borderRadius: 8, border: `1px solid ${mode === 'import' ? t.ACCENT : t.BORDER}`,
            background: mode === 'import' ? t.ACCENT_BG : t.BG_INPUT, color: mode === 'import' ? t.ACCENT_SOFT : t.TEXT,
            fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          {tr("Восстановить")}
        </button>
      </div>

      {mode === 'export' && (
        <div style={{ marginTop: 10, padding: '12px', background: t.BG_RAISED, border: `1px solid ${t.BORDER}`, borderRadius: 10 }}>
          <div style={{ fontSize: 12.5, color: t.TEXT_DIM, marginBottom: 8, lineHeight: 1.5 }}>
            {tr("Нажми «Скопировать», затем сохрани этот текст куда угодно (заметки, сообщение себе) — позже вставь его в «Восстановить», если данные пропадут.")}
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
            {copied ? tr("Скопировано ✓") : tr("Скопировать")}
          </button>
        </div>
      )}

      {mode === 'import' && (
        <div style={{ marginTop: 10, padding: '12px', background: t.BG_RAISED, border: `1px solid ${t.BORDER}`, borderRadius: 10 }}>
          <div style={{ fontSize: 12.5, color: t.TEXT_DIM, marginBottom: 8, lineHeight: 1.5 }}>
            {tr("Вставь сюда ранее сохранённый текст копии. Это заменит текущие данные.")}
          </div>
          <textarea
            value={importText}
            onChange={(e) => { setImportText(e.target.value); setConfirmingImport(false); }}
            placeholder={tr("Вставь сюда скопированный текст...")}
            style={{
              width: '100%', height: 100, background: t.BG_INPUT, border: `1px solid ${t.BORDER}`, borderRadius: 8,
              padding: '10px', color: t.TEXT, fontSize: 11, fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
              boxSizing: 'border-box', resize: 'vertical', marginBottom: 10,
            }}
          />
          {confirmingImport && (
            <div style={{ fontSize: 12.5, color: t.ACCENT_SOFT, fontWeight: 600, marginBottom: 8, lineHeight: 1.4 }}>
              {tr("Точно заменить текущие данные этой копией? Действие необратимо — нажми ещё раз, чтобы подтвердить.")}
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
            {confirmingImport ? tr("Да, заменить данные") : tr("Восстановить данные")}
          </button>
        </div>
      )}
    </div>
  );
}

export function ProfileTab({ profile, saveProfile, sessions, setError, planRows, saveUserPlan, deleteUserPlan, restoreUserPlans, createPlanShare, fetchPlanShare, measurements, saveSessions, saveMeasurements, onLogout, lang, onLang, units, onUnits }) {
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
          {tr("Достижения (")}{unlockedCount}/{achievements.length})
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
                <span>{tr(g.title)}</span>
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
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: t.TEXT, marginBottom: 2 }}>{convertText(achTitle(a), { ceil: true })}</div>
                    <div style={{ fontSize: 11.5, color: t.TEXT_FAINT, lineHeight: 1.35 }}>{convertText(achDescription(a), { ceil: true })}</div>
                    {a.unlocked && a.unlockedAt && (
                      <div style={{ fontSize: 11, color: t.ACCENT_SOFT, marginTop: 3, fontFamily: t.FONT_MONO }}>{tr("открыто")} {fmtDateShort(a.unlockedAt)}</div>
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
        <PlanPicker profile={profile} saveProfile={saveProfile} sessions={sessions} planRows={planRows} saveUserPlan={saveUserPlan} deleteUserPlan={deleteUserPlan} createPlanShare={createPlanShare} fetchPlanShare={fetchPlanShare} />
      </div>

      {/* Параметры тела переехали во вкладку «Вес» — там у них история замеров. */}

      <div style={{ height: 1, background: t.BORDER, margin: '12px 0 18px' }} />

      <div style={{ fontSize: 12, color: t.TEXT_FAINT, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.02em', marginBottom: 12 }}>
        {tr("Настройки")}
      </div>

      {/* Кнопка «Тема оформления» удалена в 1.0.6. Она крутила подпись
          «Авто · ночь → Светлая → Тёмная», но не меняла ничего: приложение
          жёстко в теме 2A с 13 июля. */}

      {onLang && <LangSwitch lang={lang} onLang={onLang} />}
      {onUnits && <UnitsSwitch units={units} onUnits={onUnits} />}

      <div data-tour="alerts">
        <AlertToggles profile={profile} saveProfile={saveProfile} />
      </div>

      <div style={{ height: 4 }} />

      <ExportImportPanel
        sessions={sessions} measurements={measurements} profile={profile}
        planRows={planRows} restoreUserPlans={restoreUserPlans}
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
            {tr("Выйти из аккаунта")}
          </button>
          {confirmLogout && (
            <div className="dropdown-open" style={{
              marginTop: 10, padding: '13px', background: t.BG_RAISED, border: `1px solid ${t.DANGER_BORDER}`, borderRadius: 14,
            }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: t.TEXT, marginBottom: 5 }}>
                {tr("Выйти из аккаунта?")}
              </div>
              <div style={{ fontSize: 12.5, color: t.TEXT_DIM, lineHeight: 1.5, marginBottom: 12 }}>
                {tr("Тренировки и замеры останутся в базе. Чтобы вернуться, войди снова через Telegram или по имени и PIN. Незаконченная тренировка на этом устройстве сохранится черновиком.")}
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
                  {tr("Да, выйти")}
                </button>
                <button
                  onClick={() => setConfirmLogout(false)}
                  style={{
                    flex: 1, padding: '12px', borderRadius: 11, border: `1px solid ${t.BORDER}`,
                    background: 'transparent', color: t.TEXT_DIM, fontSize: 14, fontWeight: 600,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  {tr("Отмена")}
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
        {tr("Дневник тренировок · v")}{APP_VERSION}
      </div>
    </div>
  );
}
