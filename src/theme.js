import { useContext, createContext } from 'react';

// ============================================================
// Тема 2A — единственная тема приложения.
//
// Светлая тема и переключатель «Авто / Светлая / Тёмная» упразднены 13 июля
// вместе с редизайном 2A (см. §12.1 хендоффа). До 1.0.6 в этом файле всё ещё
// лежала палитра предыдущего редизайна (янтарь #E08A3C + Manrope) и хук
// useThemeController — мёртвый код, который при этом был виден: экран входа
// рисовался янтарным, а в профиле висела кнопка переключения темы, менявшая
// только собственную подпись. Убрано.
//
// Токены 2A раньше жили в src/tabs/ProgressTab.jsx, и App.jsx импортировал
// тему из вкладки — перевёрнутая зависимость. Теперь они здесь: это позволяет
// экрану входа (он рендерится ДО ThemeContext.Provider) взять ту же палитру,
// не таща за собой всю вкладку «Прогресс» с recharts.
// ============================================================

export const THEME_2A = {
  ACCENT: '#C79A4E', ACCENT_SOFT: '#E4C57E', ACCENT_DEEP: '#9E7A34', POSITIVE: '#93A86A',
  BG: '#0A0A0A', BG_RAISED: '#171512', BG_INPUT: '#1C1A16', BORDER: 'rgba(242,235,221,0.12)',
  TEXT: '#F2EBDD', TEXT_DIM: '#8F897C', TEXT_FAINT: '#6E6A60',
  ACCENT_GRAD: 'linear-gradient(100deg,#8B6B2E,#C79A4E,#F5E3AE,#C79A4E,#8B6B2E)', ON_ACCENT: '#0A0A0A',
  ACCENT_BG: 'rgba(199,154,78,0.15)', ACCENT_BORDER: 'rgba(184,146,74,0.30)',
  POSITIVE_BG: 'rgba(147,168,106,0.16)',
  GLOW: '0 0 22px rgba(184,146,74,0.40)', NAV_BG: 'rgba(23,21,18,0.10)',
  CARD_SHADOW: '0 16px 40px rgba(0,0,0,0.4)',
  FONT: "'Space Grotesk', system-ui, sans-serif",
  FONT_DISPLAY: "'Space Grotesk', system-ui, sans-serif",
  FONT_MONO: "'JetBrains Mono', 'SF Mono', monospace",
};

export const BG_2A = '#0A0A0A';

// Диагональные полосы фона под 60°. Прозрачность намеренно низкая (0.038/0.032):
// более заметные полосы мешали читать панели поверх них (§12.2).
export const STRIPES_2A = 'repeating-linear-gradient(60deg, rgba(242,224,166,0.038) 0px, rgba(242,224,166,0.038) 1.5px, transparent 1.5px, transparent 11px, rgba(184,146,74,0.032) 11px, rgba(184,146,74,0.032) 12.5px, transparent 12.5px, transparent 22px)';

// Фрост-стекло для полупрозрачных плашек над полосатым фоном. Подложка НАМЕРЕННО
// плотная: backdrop-filter в Telegram iOS WKWebView ненадёжен, где-то он просто
// игнорируется — читаемость держится на заливке, блюр только бонус (§12.2).
export const FROST = {
  background: 'rgba(20,18,15,0.44)',
  backdropFilter: 'blur(18px) saturate(1.35)',
  WebkitBackdropFilter: 'blur(18px) saturate(1.35)',
};

// Латунь — не плоский цвет, а металлик-градиент с живым бликом.
// Позиция блика приходит из CSS-переменной --shine, её пишет useBrassShine
// на общий контейнер (императивно, без React-состояния — иначе ререндер 60 fps).
export const BRASS_SHEEN = 'linear-gradient(100deg,#6E5424 0%,#C79A4E 14%,#F5E3AE 24%,#FFF6DC 30%,#F5E3AE 36%,#C79A4E 46%,#8B6B2E 58%,#C79A4E 70%,#F5E3AE 78%,#C79A4E 88%,#6E5424 100%)';
export const brassFill = { backgroundImage: BRASS_SHEEN, backgroundSize: '220% 220%', backgroundPosition: 'var(--shine, 50% 50%)' };
export const brassText = { ...brassFill, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' };

export const ThemeContext = createContext(THEME_2A);

export function useTheme() {
  return useContext(ThemeContext);
}
