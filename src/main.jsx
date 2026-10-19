import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

// Telegram Mini App: оттягивание страницы вниз тянуло за собой само окно
// мини-приложения (жест «свернуть / закрыть»). Telegram при этом на ходу менял
// высоту окна: шапка заезжала под заголовок, таб-бар отрывался от низа или
// пропадал. Отключаем вертикальный свайп окна (Bot API 7.7+) — закрывается
// приложение кнопкой «Закрыть». Вне Telegram и в старых клиентах — ничего.
try {
  const tg = window.Telegram && window.Telegram.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
    if (typeof tg.disableVerticalSwipes === 'function') tg.disableVerticalSwipes();
  }
} catch (e) { /* no-op */ }

createRoot(document.getElementById('root')).render(<App />);
