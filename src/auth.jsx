import React, { useState, useEffect, useMemo } from 'react';
import { Dumbbell } from 'lucide-react';
import { THEMES } from './theme.js';

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

export function AuthGate({ children }) {
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
    if (authMode === 'register' && !/^\d+$/.test(pin)) { setErr('PIN должен состоять только из цифр'); return; }
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
      padding: 20, fontFamily: "'Manrope', system-ui, -apple-system, sans-serif",
    }}>
      <div style={{ width: '100%', maxWidth: 340 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
          <div style={{
            width: 72, height: 72, borderRadius: 22, background: `linear-gradient(150deg, ${t.BG_RAISED}, ${t.BG})`, border: `1px solid ${t.BORDER}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: t.GLOW,
          }}>
            <Dumbbell size={34} color={t.ACCENT} strokeWidth={1.6} />
          </div>
        </div>
        <h1 style={{ color: t.TEXT, fontSize: 24, textAlign: 'center', margin: '0 0 6px', fontWeight: 700, fontFamily: t.FONT_DISPLAY, letterSpacing: '-0.01em' }}>
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
            width: '100%', padding: '14px', borderRadius: 14, border: 'none',
            background: t.ACCENT_GRAD, color: t.ON_ACCENT, fontSize: 15, fontWeight: 700,
            cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1, fontFamily: 'inherit', marginBottom: 12, boxShadow: t.GLOW,
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
