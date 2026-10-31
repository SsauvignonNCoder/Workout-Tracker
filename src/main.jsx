import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { ErrorBoundary } from './ErrorBoundary.jsx';
import { setLang, initialLang } from './i18n.js';
import { setUnits, initialUnits } from './units.js';

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

// Язык до загрузки профиля (экран входа): сохранённый на устройстве или язык Telegram.
setLang(initialLang());
// Единицы — сохранённые на устройстве; по умолчанию всегда метрика.
setUnits(initialUnits());

createRoot(document.getElementById('root')).render(<ErrorBoundary><App /></ErrorBoundary>);
