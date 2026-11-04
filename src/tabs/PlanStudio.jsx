import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Copy, Check, Send, Link2, ChevronRight,
} from 'lucide-react';
import { useTheme } from '../theme.js';
import { tr, exName } from '../i18n.js';
import { getLabelInputStyle, STARTER_EXERCISES } from './workoutTabHelpers.jsx';
import { PlanEditor } from './PlanEditor.jsx';
import { validatePlan, MAX_USER_PLANS } from '../userPlans.js';
import {
  buildAiPrompt, decodePlanText, applyNameChoices, planForShare, normalizeCode, shareLink,
} from '../planExchange.js';

const WEEKDAY_NAMES = {
  mon: 'ПН', tue: 'ВТ', wed: 'СР', thu: 'ЧТ', fri: 'ПТ', sat: 'СБ', sun: 'ВС',
};

async function copyText(text, fallbackRef) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    const el = fallbackRef && fallbackRef.current;
    if (!el) return false;
    el.focus();
    el.select();
    try { return document.execCommand('copy'); } catch (e2) { return false; }
  }
}

function knownExerciseNames(sessions) {
  const seen = new Set();
  const out = [];
  const add = (n) => {
    const key = String(n || '').toLowerCase();
    if (key && !seen.has(key)) { seen.add(key); out.push(n); }
  };
  STARTER_EXERCISES.forEach(add);
  (sessions || []).forEach((s) => (s.exercises || []).forEach((ex) => add(ex.name)));
  return out;
}

function primaryButton(t, disabled) {
  return {
    width: '100%', padding: '14px', borderRadius: 14, border: 'none', boxSizing: 'border-box',
    background: disabled ? t.BG_INPUT : t.ACCENT_GRAD, color: disabled ? t.TEXT_FAINT : t.ON_ACCENT,
    fontSize: 15, fontWeight: 700, fontFamily: 'inherit', cursor: disabled ? 'default' : 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  };
}

function secondaryButton(t) {
  return {
    width: '100%', padding: '13px', borderRadius: 14, border: `1px solid ${t.BORDER}`, background: 'transparent', boxSizing: 'border-box',
    color: t.TEXT, fontSize: 14.5, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  };
}

function ErrorBox({ errors, t }) {
  if (!errors || !errors.length) return null;
  return (
    <div role="alert" style={{
      marginBottom: 14, padding: '10px 12px', borderRadius: 10, fontSize: 13, lineHeight: 1.45,
      color: t.DANGER, background: t.DANGER_BG, border: `1px solid ${t.DANGER_BORDER}`,
    }}>
      {errors.slice(0, 5).map((e) => <div key={e}>{e}</div>)}
      {errors.length > 5 && <div>{tr('и ещё {0}', errors.length - 5)}</div>}
    </div>
  );
}

function Screen({ heading, onClose, children, t }) {
  return (
    <div role="dialog" aria-label={heading} style={{
      position: 'fixed', inset: 0, zIndex: 1100, background: t.BG, color: t.TEXT, fontFamily: t.FONT,
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, borderBottom: `1px solid ${t.BORDER}`,
        padding: 'max(12px, env(safe-area-inset-top)) max(14px, env(safe-area-inset-right)) 12px max(14px, env(safe-area-inset-left))',
      }}>
        <button
          onClick={onClose}
          aria-label={tr('Закрыть')}
          style={{
            width: 36, height: 36, flexShrink: 0, borderRadius: 10, border: `1px solid ${t.BORDER}`, background: t.BG_INPUT, color: t.TEXT_DIM,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0,
          }}
        >
          <X size={17} />
        </button>
        <div style={{ flex: 1, minWidth: 0, fontSize: 16.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{heading}</div>
      </div>
      <div style={{
        flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', boxSizing: 'border-box',
        padding: '16px max(16px, env(safe-area-inset-right)) calc(28px + env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left))',
      }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>{children}</div>
      </div>
    </div>
  );
}

// Проверка плана перед сохранением: неделя за неделей и названия, которых нет в списке.
function PlanPreview({
  draft, unknown, choices, onChoice, note, confirmLabel, saving, errors, onConfirm, onEdit, t,
}) {
  const [weekIdx, setWeekIdx] = useState(0);
  const week = draft.plan.weeks[Math.min(weekIdx, draft.plan.weeks.length - 1)];
  const chip = (on) => ({
    padding: '8px 10px', borderRadius: 10, fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', textAlign: 'center',
    background: on ? t.ACCENT_BG : t.BG_INPUT, color: on ? t.ACCENT_SOFT : t.TEXT_DIM, border: `1px solid ${on ? t.ACCENT : t.BORDER}`,
  });
  const days = draft.plan.weekdays;
  return (
    <>
      <div style={{ fontSize: 21, fontWeight: 700, lineHeight: 1.25, marginBottom: 4 }}>{draft.title}</div>
      <div style={{ fontSize: 13, color: t.TEXT_DIM, marginBottom: 14 }}>
        {tr('{0} дн. в неделю · {1} нед.', days.length, draft.plan.weeks.length)}
      </div>
      {note && <div style={{ fontSize: 13, color: t.TEXT_DIM, lineHeight: 1.45, marginBottom: 14 }}>{note}</div>}

      {unknown.length > 0 && (
        <div style={{ marginBottom: 16, padding: 13, borderRadius: 14, background: t.ACCENT_BG, border: `1px solid ${t.ACCENT_BORDER}` }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 3 }}>{tr('Проверь названия')}</div>
          <div style={{ fontSize: 12.5, color: t.TEXT_DIM, lineHeight: 1.4, marginBottom: 11 }}>
            {tr('Этих упражнений нет в твоём списке. Рекорды и прогресс считаются по названию, поэтому лучше выбрать похожее, если это то же упражнение.')}
          </div>
          {unknown.map((u) => (
            <div key={u.name} style={{ marginBottom: 11 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 6 }}>«{u.name}»</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {u.suggestions.map((s) => (
                  <button key={s} aria-pressed={choices[u.name] === s} onClick={() => onChoice(u.name, s)} style={chip(choices[u.name] === s)}>
                    {exName(s)}
                  </button>
                ))}
                <button aria-pressed={choices[u.name] === u.name} onClick={() => onChoice(u.name, u.name)} style={chip(choices[u.name] === u.name)}>
                  {tr('Оставить как есть')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {draft.plan.weeks.length > 1 && (
        <div style={{ display: 'flex', gap: 5, marginBottom: 12 }}>
          {draft.plan.weeks.map((w, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <button key={i} aria-pressed={i === weekIdx} onClick={() => setWeekIdx(i)} style={{ ...chip(i === weekIdx), flex: '1 1 0', minWidth: 0, padding: '9px 0' }}>
              {tr('Н{0}', i + 1)}
            </button>
          ))}
        </div>
      )}
      {(week.label || week.load) && (
        <div style={{ fontSize: 12.5, color: t.TEXT_DIM, marginBottom: 12 }}>
          {[week.label && tr(week.label), week.load && (week.load[1] == null ? tr('{0}% от рекорда и выше', week.load[0]) : tr('{0}–{1}% от рекорда', week.load[0], week.load[1]))].filter(Boolean).join(' · ')}
        </div>
      )}

      {week.days.map((day, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <div key={i} style={{ marginBottom: 10, padding: 13, background: t.BG_RAISED, border: `1px solid ${t.BORDER}`, borderRadius: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: day.type === 'strength' ? 8 : 0 }}>
            <span style={{ flexShrink: 0, padding: '4px 8px', borderRadius: 7, fontSize: 12, fontWeight: 700, fontFamily: t.FONT_MONO, color: t.ACCENT_SOFT, background: t.ACCENT_BG }}>
              {tr(WEEKDAY_NAMES[days[i]])}
            </span>
            <span style={{ fontSize: 14.5, fontWeight: 700, minWidth: 0 }}>{tr(day.title)}</span>
          </div>
          {day.type === 'strength' && (day.exercises || []).map((ex, k) => (
            // eslint-disable-next-line react/no-array-index-key
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '6px 0', borderTop: `1px solid ${t.BORDER}`, fontSize: 13.5 }}>
              <span style={{ minWidth: 0 }}>{exName(choices[ex.name] || ex.name)}</span>
              <span style={{ flexShrink: 0, color: t.TEXT_DIM, fontFamily: t.FONT_MONO, fontSize: 12.5 }}>{ex.sets}{ex.reps ? `×${ex.reps}` : ''}</span>
            </div>
          ))}
          {day.type === 'strength' && (
            <div style={{ marginTop: 6, fontSize: 12, color: t.TEXT_FAINT }}>
              {tr('Разминка на дорожке')}: {day.warmupRun === false ? tr('нет') : tr('да')} · {tr('Финиш на дорожке')}: {day.finisherRun === false ? tr('нет') : tr('да')}
            </div>
          )}
        </div>
      ))}

      <div style={{ height: 4 }} />
      <ErrorBox errors={errors} t={t} />
      <button onClick={onConfirm} disabled={saving} style={{ ...primaryButton(t, saving), marginBottom: 9 }}>
        {saving ? tr('Сохраняю…') : confirmLabel}
      </button>
      <button onClick={onEdit} disabled={saving} style={secondaryButton(t)}>{tr('Изменить перед сохранением')}</button>
    </>
  );
}

// Создание плана извне: mode 'ai' — промт и ответ стороннего ИИ, 'code' — код или ссылка
// от друга. Заканчивается одним и тем же: проверка, сохранение, предложение начать по плану.
export function PlanStudio({
  mode, initialCode, sessions, planCount, saveUserPlan, saveProfile, fetchPlanShare, onClose,
}) {
  const t = useTheme();
  const known = useMemo(() => knownExerciseNames(sessions), [sessions]);
  const prompt = useMemo(() => (mode === 'ai' ? buildAiPrompt(STARTER_EXERCISES) : ''), [mode]);
  const [view, setView] = useState(mode); // 'ai' | 'code' | 'preview' | 'edit' | 'done'
  const [answer, setAnswer] = useState('');
  const [code, setCode] = useState(initialCode || '');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState([]);
  const [copied, setCopied] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [draft, setDraft] = useState(null); // { title, plan }
  const [unknown, setUnknown] = useState([]);
  const [choices, setChoices] = useState({});
  const [savedId, setSavedId] = useState(null);
  const [saving, setSaving] = useState(false);
  const promptRef = useRef(null);
  const limitReached = planCount >= MAX_USER_PLANS;

  const openPreview = (next, list) => {
    setDraft(next);
    setUnknown(list);
    setChoices(Object.fromEntries(list.map((u) => [u.name, u.choice])));
    setErrors([]);
    setView('preview');
  };

  const decode = () => {
    const res = decodePlanText(answer, known);
    if (!res.ok) { setErrors(res.errors); return; }
    openPreview({ title: res.title, plan: res.plan }, res.unknown);
  };

  const findByCode = async (value) => {
    const c = normalizeCode(value);
    if (!c) { setErrors([tr('Введи код')]); return; }
    setBusy(true);
    setErrors([]);
    try {
      const shared = await fetchPlanShare(c);
      if (!shared) { setErrors([tr('Такого кода нет — проверь его у друга')]); setBusy(false); return; }
      const res = validatePlan(shared);
      if (!res.ok) { setErrors([tr('Этот план повреждён — попроси друга поделиться им заново')]); setBusy(false); return; }
      setBusy(false);
      openPreview({ title: res.title, plan: res.plan }, []);
    } catch (e) {
      setBusy(false);
      setErrors([tr('Не удалось получить план — проверь связь и попробуй ещё раз')]);
    }
  };

  // Ссылка от друга: сразу показываем план.
  useEffect(() => {
    if (initialCode) findByCode(initialCode);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const copyPrompt = async () => {
    const ok = await copyText(prompt, promptRef);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } else {
      setShowPrompt(true);
      setErrors([tr('Не получилось скопировать — выдели текст промта и скопируй вручную')]);
    }
  };

  const finalPlan = () => applyNameChoices(draft.plan, choices);

  const confirm = async () => {
    if (limitReached) { setErrors([tr('Уже {0} планов — удали ненужный, чтобы добавить новый', MAX_USER_PLANS)]); return; }
    setSaving(true);
    setErrors([]);
    try {
      setSavedId(await saveUserPlan({ title: draft.title, plan: finalPlan() }));
      setView('done');
    } catch (e) {
      setErrors([tr('Не удалось сохранить план — проверь связь и нажми ещё раз')]);
    }
    setSaving(false);
  };

  const startPlan = async () => {
    setSaving(true);
    setErrors([]);
    try {
      await saveProfile({ planId: savedId, lastProgramDay: 0 });
      onClose();
    } catch (e) {
      setSaving(false);
      setErrors([tr('Не удалось переключить план — проверь связь и нажми ещё раз')]);
    }
  };

  let body = null;
  if (view === 'edit') {
    return (
      <PlanEditor
        initial={{ title: draft.title, weekdays: draft.plan.weekdays, weeks: finalPlan().weeks }}
        heading={tr('Изменить план')}
        sessions={sessions}
        onClose={() => setView('preview')}
        onSave={async ({ title, plan }) => {
          if (limitReached) throw new Error('limit');
          setSavedId(await saveUserPlan({ title, plan }));
          setDraft({ title, plan });
          setView('done');
        }}
      />
    );
  }

  const step = {
    fontSize: 14, lineHeight: 1.5, color: t.TEXT, marginBottom: 10,
  };

  if (view === 'ai') {
    body = (
      <>
        <div style={step}><b>1.</b> {tr('Скопируй промт и вставь его в любой ИИ: ChatGPT, DeepSeek, Claude или другой. ИИ задаст вопросы про цель, опыт и оборудование и составит план.')}</div>
        <button onClick={copyPrompt} style={{ ...primaryButton(t, false), marginBottom: 8 }}>
          {copied ? <><Check size={17} /> {tr('Скопировано')}</> : <><Copy size={17} /> {tr('Скопировать промт')}</>}
        </button>
        <button onClick={() => setShowPrompt(!showPrompt)} style={{ ...secondaryButton(t), marginBottom: 8, fontSize: 13.5, padding: '10px' }}>
          {showPrompt ? tr('Скрыть промт') : tr('Показать промт')}
        </button>
        {/* Поле всегда в разметке: из него копирует запасной путь, когда буфер недоступен. */}
        <textarea
          ref={promptRef}
          readOnly
          value={prompt}
          aria-hidden={!showPrompt}
          tabIndex={showPrompt ? 0 : -1}
          style={showPrompt ? {
            ...getLabelInputStyle(t), width: '100%', boxSizing: 'border-box', height: 180, fontSize: 12, lineHeight: 1.4, resize: 'vertical', marginBottom: 8, fontFamily: t.FONT_MONO,
          } : {
            position: 'absolute', left: -9999, width: 1, height: 1, opacity: 0,
          }}
        />

        <div style={{ ...step, marginTop: 14 }}><b>2.</b> {tr('Когда ИИ выдаст план, скопируй его ответ и вставь сюда. Лишний текст вокруг не помешает.')}</div>
        <textarea
          value={answer}
          onChange={(e) => { setAnswer(e.target.value); setErrors([]); }}
          placeholder={tr('Вставь ответ ИИ')}
          style={{
            ...getLabelInputStyle(t), width: '100%', boxSizing: 'border-box', height: 170, fontSize: 13, lineHeight: 1.4, resize: 'vertical', marginBottom: 12,
          }}
        />
        <ErrorBox errors={errors} t={t} />
        <button onClick={decode} disabled={!answer.trim()} style={primaryButton(t, !answer.trim())}>
          {tr('Разобрать ответ')} <ChevronRight size={17} />
        </button>
      </>
    );
  } else if (view === 'code') {
    const canFind = !!normalizeCode(code) && !busy;
    body = (
      <>
        <div style={step}>{tr('Введи код, который прислал друг. Ты получишь свою копию плана: правки друга её не изменят, и твои правки не изменят его план.')}</div>
        <input
          value={code}
          onChange={(e) => { setCode(normalizeCode(e.target.value)); setErrors([]); }}
          onKeyDown={(e) => { if (e.key === 'Enter' && canFind) findByCode(code); }}
          placeholder="AB3DE7GH"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          style={{
            ...getLabelInputStyle(t), width: '100%', boxSizing: 'border-box', textAlign: 'center', fontSize: 20, letterSpacing: '0.12em', fontFamily: t.FONT_MONO, marginBottom: 12,
          }}
        />
        <ErrorBox errors={errors} t={t} />
        <button onClick={() => findByCode(code)} disabled={!canFind} style={primaryButton(t, !canFind)}>
          {busy ? tr('Ищу…') : tr('Найти план')}
        </button>
      </>
    );
  } else if (view === 'preview') {
    body = (
      <PlanPreview
        t={t}
        draft={draft}
        unknown={unknown}
        choices={choices}
        onChoice={(name, value) => setChoices((c) => ({ ...c, [name]: value }))}
        note={mode === 'code' ? tr('Это будет твоя копия: правки друга её не изменят, и твои правки не изменят его план.') : null}
        confirmLabel={mode === 'code' ? tr('Добавить себе') : tr('Сохранить план')}
        saving={saving}
        errors={errors}
        onConfirm={confirm}
        onEdit={() => setView('edit')}
      />
    );
  } else if (view === 'done') {
    body = (
      <>
        <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.3, marginBottom: 8 }}>{tr('План «{0}» сохранён', draft.title)}</div>
        <div style={{ ...step, color: t.TEXT_DIM }}>{tr('Начать по нему? Следующая тренировка будет с дня 1. История и рекорды не меняются.')}</div>
        <ErrorBox errors={errors} t={t} />
        <button onClick={startPlan} disabled={saving} style={{ ...primaryButton(t, saving), marginBottom: 9 }}>
          {saving ? tr('Переключаю…') : tr('Начать по этому плану')}
        </button>
        <button onClick={onClose} disabled={saving} style={secondaryButton(t)}>{tr('Оставить текущий план')}</button>
      </>
    );
  }

  const headings = {
    ai: tr('План с помощью ИИ'),
    code: tr('План от друга'),
    preview: tr('Проверь план'),
    done: tr('Готово'),
  };
  return createPortal(<Screen t={t} heading={headings[view]} onClose={onClose}>{body}</Screen>, document.body);
}

// Поделиться своим планом: код и ссылка. Друг получает снимок, поэтому при новых правках
// делиться нужно заново. Тот же план снова даёт тот же код.
export function PlanShareSheet({ title, stored, createPlanShare, onClose }) {
  const t = useTheme();
  const [code, setCode] = useState(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const fallbackRef = useRef(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const c = await createPlanShare(planForShare(title, stored));
        if (alive) setCode(c);
      } catch (e) {
        if (alive) setFailed(true);
      }
    })();
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const link = code ? shareLink(code) : '';
  const message = tr('План тренировок «{0}». Открой ссылку и добавь его себе, код: {1}', title, code || '');

  const send = async () => {
    const tg = window.Telegram && window.Telegram.WebApp;
    if (tg && tg.openTelegramLink && tg.platform && tg.platform !== 'unknown') {
      tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(message)}`);
      return;
    }
    if (navigator.share) {
      try {
        await navigator.share({ text: message, url: link });
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') return;
      }
    }
    copyLink();
  };

  const copyLink = async () => {
    if (await copyText(link, fallbackRef)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    }
  };

  return createPortal(
    <div
      role="dialog"
      aria-label={tr('Поделиться планом')}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center', fontFamily: t.FONT,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="dropdown-open"
        style={{
          width: '100%', maxWidth: 480, boxSizing: 'border-box', background: t.BG_RAISED, border: `1px solid ${t.BORDER}`, color: t.TEXT,
          borderTopLeftRadius: 22, borderTopRightRadius: 22, boxShadow: '0 -12px 40px rgba(0,0,0,0.5)',
          padding: '18px max(18px, env(safe-area-inset-right)) calc(22px + env(safe-area-inset-bottom)) max(18px, env(safe-area-inset-left))',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{tr('Поделиться планом')}</h3>
          <button
            onClick={onClose}
            aria-label={tr('Закрыть')}
            style={{
              width: 34, height: 34, flexShrink: 0, borderRadius: 10, border: `1px solid ${t.BORDER}`, background: t.BG_INPUT, color: t.TEXT_DIM,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0,
            }}
          >
            <X size={16} />
          </button>
        </div>
        {!code && !failed && <div style={{ fontSize: 14, color: t.TEXT_DIM, padding: '18px 0', textAlign: 'center' }}>{tr('Готовлю ссылку…')}</div>}
        {failed && <div style={{ fontSize: 14, color: t.DANGER, padding: '18px 0', textAlign: 'center' }}>{tr('Не удалось сделать ссылку — проверь связь и попробуй ещё раз')}</div>}
        {code && (
          <>
            <div style={{
              padding: '13px', borderRadius: 12, background: t.BG_INPUT, border: `1px solid ${t.BORDER}`, textAlign: 'center',
              fontFamily: t.FONT_MONO, fontSize: 24, fontWeight: 700, letterSpacing: '0.12em', color: t.ACCENT_SOFT, marginBottom: 12,
            }}>
              {code}
            </div>
            <button onClick={send} style={{ ...primaryButton(t, false), marginBottom: 9 }}><Send size={16} /> {tr('Отправить другу')}</button>
            <button onClick={copyLink} style={{ ...secondaryButton(t), marginBottom: 12 }}>
              {copied ? <><Check size={16} /> {tr('Скопировано')}</> : <><Link2 size={16} /> {tr('Скопировать ссылку')}</>}
            </button>
            <input ref={fallbackRef} readOnly value={link} aria-hidden="true" tabIndex={-1} style={{ position: 'absolute', left: -9999, width: 1, height: 1, opacity: 0 }} />
            <div style={{ fontSize: 12.5, color: t.TEXT_FAINT, lineHeight: 1.45 }}>
              {tr('Друг получит только сам план, без твоих весов, рекордов и имени. Ваши копии не связаны: если изменишь план, поделись им заново.')}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

