import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Share2, X, Download, Send } from 'lucide-react';
import { useTheme } from './theme.js';
import { tr, getLang } from './i18n.js';
import { shareCardData } from './shareCard.js';
import { renderShareCard, canvasToJpeg } from './shareCardDraw.js';
import { currentSessionToken } from './sessionToken.js';

const FILE_NAME = 'workout.jpg';

const isTelegram = () => typeof window !== 'undefined'
  && !!(window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.platform && window.Telegram.WebApp.platform !== 'unknown');

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function downloadBlob(blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = FILE_NAME;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1500);
}

async function sendViaBot(blob) {
  const res = await fetch('/api/send-card', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: currentSessionToken(), image: await blobToBase64(blob), lang: getLang() }),
  });
  return res.ok;
}

// Системное «Поделиться»: сохранить, отправить в чат, выложить. Только сама картинка:
// с текстом в придачу iPhone не предлагал «Сохранить изображение», только «в Файлы»
// (Никита, 11.11.2026); адрес бота и так на картинке. Где «Поделиться» нет, как в части
// клиентов Telegram, картинку присылает бот: скачивание внутри Telegram открывает
// залипающий просмотрщик (HANDOFF, §«скачивание файла»). В браузере — файл.
// Ответ — текст для человека, null — ничего сообщать не нужно.
async function shareBlob(blob) {
  try {
    const file = new File([blob], FILE_NAME, { type: blob.type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file] });
      return null;
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return null;
  }
  if (isTelegram()) {
    try {
      if (await sendViaBot(blob)) return tr('Картинка — в чате с ботом');
    } catch (e) { /* ниже общий ответ */ }
    return tr('Бот не смог отправить картинку — открой чат с ботом и нажми «Старт»');
  }
  downloadBlob(blob);
  return tr('Картинка сохранена');
}

export function ShareCardSheet({ session, sessions, onClose }) {
  const t = useTheme();
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const blobRef = useRef(null);

  // Картинка готовится заранее: системное «Поделиться» работает только сразу по
  // нажатию, ждать отрисовку в этот момент нельзя.
  useEffect(() => {
    let alive = true;
    let objectUrl = null;
    (async () => {
      try {
        const canvas = await renderShareCard(shareCardData(session, sessions));
        const blob = await canvasToJpeg(canvas);
        if (!alive) return;
        blobRef.current = blob;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      } catch (e) {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [session, sessions]);

  const share = async () => {
    if (!blobRef.current || busy) return;
    setBusy(true);
    setNote('');
    const text = await shareBlob(blobRef.current);
    setBusy(false);
    if (text) setNote(text);
  };

  // Запасной путь в Telegram: картинка приходит фото в чат с ботом, оттуда её можно
  // сохранить в фото обычным способом.
  const sendToChat = async () => {
    if (!blobRef.current || busy) return;
    setBusy(true);
    setNote('');
    let ok = false;
    try { ok = await sendViaBot(blobRef.current); } catch (e) { /* ниже сообщение */ }
    setBusy(false);
    setNote(ok
      ? tr('Картинка — в чате с ботом: открой её и сохрани в фото')
      : tr('Бот не смог отправить картинку — открой чат с ботом и нажми «Старт»'));
  };

  const save = () => {
    if (!blobRef.current) return;
    downloadBlob(blobRef.current);
    setNote(tr('Картинка сохранена'));
  };

  const iconButton = {
    position: 'absolute', top: 'max(14px, env(safe-area-inset-top))', right: 'max(14px, env(safe-area-inset-right))',
    width: 40, height: 40, borderRadius: 20, border: `1px solid ${t.BORDER}`, background: t.BG_RAISED,
    color: t.TEXT, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
  };

  return createPortal(
    <div
      role="dialog"
      aria-label={tr('Поделиться тренировкой')}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(0,0,0,0.88)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14,
        padding: 'max(16px, env(safe-area-inset-top)) 16px max(16px, env(safe-area-inset-bottom))',
        boxSizing: 'border-box', fontFamily: t.FONT,
      }}
    >
      <button onClick={onClose} aria-label={tr('Закрыть')} style={iconButton}><X size={18} /></button>

      {url && (
        <img
          src={url}
          alt={tr('Картинка с результатами тренировки')}
          style={{
            flex: '0 1 auto', minHeight: 0, maxHeight: 'calc(100% - 120px)', maxWidth: '100%',
            aspectRatio: '9 / 16', objectFit: 'contain', borderRadius: 14, border: `1px solid ${t.BORDER}`,
          }}
        />
      )}
      {!url && !failed && <div style={{ color: t.TEXT_DIM, fontSize: 14 }}>{tr('Готовлю картинку…')}</div>}
      {failed && <div style={{ color: t.DANGER, fontSize: 14, textAlign: 'center' }}>{tr('Не удалось сделать картинку')}</div>}

      {note && <div style={{ color: t.TEXT_DIM, fontSize: 13, textAlign: 'center', lineHeight: 1.4 }}>{note}</div>}
      {url && !note && isTelegram() && (
        <div style={{ color: t.TEXT_FAINT, fontSize: 12, textAlign: 'center', lineHeight: 1.4, maxWidth: 360 }}>
          {tr('Нет «Сохранить изображение»? Кнопка справа пришлёт картинку в чат с ботом — оттуда её можно сохранить в фото.')}
        </div>
      )}

      {url && (
        <div style={{ display: 'flex', gap: 10, width: '100%', maxWidth: 360, flexShrink: 0 }}>
          <button
            onClick={share}
            disabled={busy}
            style={{
              flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '14px', borderRadius: 14, border: 'none', background: t.ACCENT_GRAD, color: t.ON_ACCENT,
              fontSize: 15, fontWeight: 700, fontFamily: 'inherit', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1,
            }}
          >
            <Share2 size={17} /> {tr('Поделиться')}
          </button>
          {isTelegram() && (
            <button
              onClick={sendToChat}
              disabled={busy}
              aria-label={tr('Прислать в чат с ботом')}
              title={tr('Прислать в чат с ботом')}
              style={{
                width: 50, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 14,
                border: `1px solid ${t.BORDER}`, background: t.BG_RAISED, color: t.TEXT, cursor: busy ? 'default' : 'pointer',
              }}
            >
              <Send size={18} />
            </button>
          )}
          {!isTelegram() && (
            <button
              onClick={save}
              aria-label={tr('Сохранить картинку')}
              style={{
                width: 50, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 14,
                border: `1px solid ${t.BORDER}`, background: t.BG_RAISED, color: t.TEXT, cursor: 'pointer',
              }}
            >
              <Download size={18} />
            </button>
          )}
        </div>
      )}
    </div>,
    document.body,
  );
}
