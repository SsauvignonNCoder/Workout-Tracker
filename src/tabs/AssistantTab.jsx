import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, ArrowUp } from 'lucide-react';
import { useTheme } from '../theme.js';
import { getInputStyle } from './workoutTabHelpers.jsx';

// Вкладка «Ассистент» — чат по своим тренировочным данным.
//
// Ассистент работает только внутри Telegram: подпись initData — единственное, что
// в этом проекте проверяется на сервере по-настоящему (см. api/ai-assistant.js).
// Вне Telegram вкладка честно говорит об этом и не даёт отправлять.
//
// Оформление — те же токены 2A, что и везде: карточки BG_RAISED с обводкой BORDER,
// акцент только на своих сообщениях и кнопке отправки. Никаких мессенджерных
// хвостиков и градиентов — это те же карточки, что в «Прогрессе».

const SUGGESTIONS = [
  'Сколько тренировок было на этой неделе?',
  'Как менялся мой вес за месяц?',
  'Какие у меня рекорды в жиме лёжа?',
];

function telegramInitData() {
  if (typeof window === 'undefined') return null;
  const tg = window.Telegram && window.Telegram.WebApp;
  return (tg && tg.initData) || null;
}

function TypingDots() {
  const t = useTheme();
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 0' }}>
      <style>{`
        @keyframes dotPulse { 0%, 60%, 100% { opacity: 0.25; } 30% { opacity: 1; } }
        .dot { animation: dotPulse 1.2s infinite ease-in-out; }
        @media (prefers-reduced-motion: reduce) { .dot { animation: none; opacity: 0.6; } }
      `}</style>
      {[0, 1, 2].map((i) => (
        <span key={i} className="dot" style={{
          width: 6, height: 6, borderRadius: '50%', background: t.ACCENT_SOFT,
          animationDelay: `${i * 0.18}s`,
        }} />
      ))}
    </span>
  );
}

function Bubble({ role, text, isError }) {
  const t = useTheme();
  const mine = role === 'user';
  return (
    <div style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start', marginBottom: 10 }}>
      <div style={{
        maxWidth: '86%', minWidth: 0,
        background: mine ? t.ACCENT_BG : t.BG_RAISED,
        border: `1px solid ${isError ? t.ACCENT : mine ? t.ACCENT_BORDER : t.BORDER}`,
        borderRadius: 14, padding: '11px 14px',
        fontSize: 14, lineHeight: 1.5,
        color: isError ? t.ACCENT_SOFT : mine ? t.TEXT : t.TEXT,
        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        boxShadow: mine ? 'none' : t.CARD_SHADOW,
      }}>
        {text}
      </div>
    </div>
  );
}

export function AssistantTab() {
  const t = useTheme();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  // Сколько вопросов осталось на сегодня — приходит с ответом сервера.
  const [remaining, setRemaining] = useState(null);
  const bottomRef = useRef(null);
  const initData = telegramInitData();
  const inTelegram = !!initData;

  // Держим последнее сообщение в поле зрения при добавлении новых.
  useEffect(() => {
    if (bottomRef.current && (messages.length || busy)) {
      bottomRef.current.scrollIntoView({ block: 'end', behavior: 'smooth' });
    }
  }, [messages, busy]);

  const ask = async (raw) => {
    const question = (raw != null ? raw : input).trim();
    if (!question || busy || !inTelegram) return;
    setInput('');
    const withQuestion = [...messages, { role: 'user', text: question }];
    setMessages(withQuestion);
    setBusy(true);
    try {
      const r = await fetch('/api/ai-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData, question }),
      });
      const data = await r.json().catch(() => null);
      if (data && typeof data.remaining_today === 'number') setRemaining(data.remaining_today);
      if (data && data.ok && data.answer) {
        setMessages([...withQuestion, { role: 'assistant', text: data.answer }]);
      } else {
        setMessages([...withQuestion, {
          role: 'assistant',
          text: (data && data.error) || 'Не получилось ответить — попробуй ещё раз.',
          isError: true,
        }]);
      }
    } catch (e) {
      setMessages([...withQuestion, {
        role: 'assistant', text: 'Нет связи с сервером — проверь интернет.', isError: true,
      }]);
    } finally {
      setBusy(false);
    }
  };

  const sectionLabel = {
    fontSize: 10.5, color: t.TEXT_FAINT, fontWeight: 500, textTransform: 'uppercase',
    letterSpacing: '0.1em', fontFamily: t.FONT_MONO, marginBottom: 14,
  };

  return (
    <div>
      <div style={sectionLabel}>Ассистент</div>

      {!inTelegram && (
        <div style={{
          background: t.BG_RAISED, border: `1px solid ${t.ACCENT_BORDER}`, borderRadius: 16,
          padding: '14px 16px', marginBottom: 16, fontSize: 13.5, lineHeight: 1.5, color: t.TEXT_DIM,
        }}>
          Ассистент работает только внутри Telegram — открой приложение через бота.
          Так запрос можно подтвердить подписью, и никто посторонний не прочитает твои
          тренировки.
        </div>
      )}

      {/* Пустой экран: коротко о том, что умеет, и три готовых вопроса. */}
      {messages.length === 0 && (
        <div style={{
          background: t.BG_RAISED, border: `1px solid ${t.BORDER}`, borderRadius: 20,
          padding: '18px 20px', marginBottom: 16, boxShadow: t.CARD_SHADOW,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8 }}>
            <Sparkles size={17} color={t.ACCENT_SOFT} />
            <span style={{ fontSize: 15, fontWeight: 700, color: t.TEXT }}>Спроси про свои тренировки</span>
          </div>
          <div style={{ fontSize: 13, color: t.TEXT_DIM, lineHeight: 1.5, marginBottom: 14 }}>
            Ассистент видит историю тренировок, замеры веса и рекорды. Изменить или
            удалить что-либо он не может — только читать.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => ask(s)}
                disabled={!inTelegram || busy}
                style={{
                  textAlign: 'left', width: '100%', boxSizing: 'border-box',
                  background: 'transparent', border: `1px dashed ${t.BORDER}`, borderRadius: 12,
                  padding: '10px 13px', color: inTelegram ? t.TEXT_DIM : t.TEXT_FAINT,
                  fontSize: 13, fontFamily: 'inherit',
                  cursor: inTelegram && !busy ? 'pointer' : 'default',
                  opacity: inTelegram ? 1 : 0.6,
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {messages.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          {messages.map((m, i) => (
            <Bubble key={i} role={m.role} text={m.text} isError={m.isError} />
          ))}
          {busy && (
            <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 10 }}>
              <div style={{
                background: t.BG_RAISED, border: `1px solid ${t.BORDER}`, borderRadius: 14,
                padding: '13px 16px',
              }}>
                <TypingDots />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      )}

      {/* Поле ввода живёт в обычном потоке, а не прибито к низу экрана: на iOS
          клавиатура схлопывает вьюпорт и фиксированные элементы уезжают под неё. */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <input
          style={{ ...getInputStyle(t), fontFamily: 'inherit', fontSize: 15 }}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); ask(); } }}
          placeholder={inTelegram ? 'Спроси про тренировки…' : 'Доступно в Telegram'}
          disabled={!inTelegram || busy}
          enterKeyHint="send"
        />
        <button
          onClick={() => ask()}
          disabled={!inTelegram || busy || !input.trim()}
          aria-label="Отправить"
          style={{
            flexShrink: 0, width: 46, height: 46, borderRadius: 14, border: 'none',
            background: (!inTelegram || busy || !input.trim()) ? t.BG_INPUT : t.ACCENT_GRAD,
            color: (!inTelegram || busy || !input.trim()) ? t.TEXT_FAINT : t.ON_ACCENT,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: (!inTelegram || busy || !input.trim()) ? 'default' : 'pointer',
            boxShadow: (!inTelegram || busy || !input.trim()) ? 'none' : t.GLOW,
          }}
        >
          <ArrowUp size={20} strokeWidth={2.4} />
        </button>
      </div>

      {remaining != null && (
        <div style={{
          marginTop: 8, textAlign: 'center', fontSize: 11, color: t.TEXT_FAINT,
          fontFamily: t.FONT_MONO, letterSpacing: '0.04em',
        }}>
          {remaining > 0 ? `Осталось вопросов сегодня: ${remaining}` : 'Вопросы на сегодня закончились'}
        </div>
      )}

      {messages.length > 0 && (
        <button
          onClick={() => setMessages([])}
          disabled={busy}
          style={{
            marginTop: 12, width: '100%', padding: '9px', background: 'transparent',
            border: 'none', color: t.TEXT_FAINT, fontSize: 12.5, fontFamily: 'inherit',
            cursor: busy ? 'default' : 'pointer', textDecoration: 'underline',
          }}
        >
          Очистить переписку
        </button>
      )}
    </div>
  );
}
