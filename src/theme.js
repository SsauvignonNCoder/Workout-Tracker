import { useState, useEffect, useMemo, useContext, createContext } from 'react';

export const THEMES = {
  dark: {
    ACCENT: '#E08A3C', ACCENT_SOFT: '#F2B273', ACCENT_DEEP: '#C8643C', POSITIVE: '#93A86A',
    BG: '#16100A', BG_RAISED: '#211913', BG_INPUT: '#1D150F', BORDER: '#322619',
    TEXT: '#F2EAE0', TEXT_DIM: '#A89A8A', TEXT_FAINT: '#7A6A58',
    ACCENT_GRAD: 'linear-gradient(135deg, #EDA053, #C8643C)', ON_ACCENT: '#1A130D',
    ACCENT_BG: 'rgba(224,138,60,0.15)', ACCENT_BORDER: 'rgba(224,138,60,0.30)',
    POSITIVE_BG: 'rgba(147,168,106,0.16)',
    GLOW: '0 6px 22px rgba(224,138,60,0.30)', NAV_BG: 'rgba(26,19,13,0.72)',
    CARD_SHADOW: '0 12px 30px rgba(0,0,0,0.45)',
    FONT: "'Manrope', system-ui, -apple-system, sans-serif",
    FONT_DISPLAY: "'Space Grotesk', system-ui, sans-serif",
    FONT_MONO: "'JetBrains Mono', 'SF Mono', monospace",
  },
  light: {
    ACCENT: '#BC6A28', ACCENT_SOFT: '#A85A20', ACCENT_DEEP: '#A85A20', POSITIVE: '#5C7048',
    BG: '#F6EFE4', BG_RAISED: '#FFFFFF', BG_INPUT: '#F1E8DA', BORDER: '#E7DCC9',
    TEXT: '#2A2018', TEXT_DIM: '#6F6253', TEXT_FAINT: '#A2917C',
    ACCENT_GRAD: 'linear-gradient(135deg, #E0913F, #BC6A28)', ON_ACCENT: '#FFFFFF',
    ACCENT_BG: 'rgba(188,106,40,0.12)', ACCENT_BORDER: 'rgba(188,106,40,0.28)',
    POSITIVE_BG: 'rgba(92,112,72,0.12)',
    GLOW: '0 6px 20px rgba(188,106,40,0.22)', NAV_BG: 'rgba(255,253,249,0.80)',
    CARD_SHADOW: '0 10px 26px rgba(120,90,50,0.10)',
    FONT: "'Manrope', system-ui, -apple-system, sans-serif",
    FONT_DISPLAY: "'Space Grotesk', system-ui, sans-serif",
    FONT_MONO: "'JetBrains Mono', 'SF Mono', monospace",
  },
};

export const isNightNow = () => {
  const h = new Date().getHours();
  return h >= 19 || h < 7;
};

export function getTelegramColorScheme() {
  if (typeof window === 'undefined') return null;
  const tg = window.Telegram && window.Telegram.WebApp;
  if (!tg || !tg.initData) return null; // не в Telegram
  return tg.colorScheme === 'dark' || tg.colorScheme === 'light' ? tg.colorScheme : null;
}

export const ThemeContext = createContext(THEMES.dark);

export function useTheme() {
  return useContext(ThemeContext);
}

export function useThemeController() {
  const tgScheme = useMemo(() => getTelegramColorScheme(), []);
  const [mode, setMode] = useState('auto'); // 'auto' | 'light' | 'dark'
  const [autoIsDark, setAutoIsDark] = useState(() => (tgScheme ? tgScheme === 'dark' : isNightNow()));

  useEffect(() => {
    if (tgScheme) {
      // В Telegram следим за сменой темы пользователем в настройках Telegram
      const tg = window.Telegram.WebApp;
      const handler = () => setAutoIsDark(tg.colorScheme === 'dark');
      tg.onEvent && tg.onEvent('themeChanged', handler);
      return () => { tg.offEvent && tg.offEvent('themeChanged', handler); };
    }
    // Вне Telegram — по времени суток, как раньше
    const id = setInterval(() => setAutoIsDark(isNightNow()), 60000);
    return () => clearInterval(id);
  }, [tgScheme]);

  const isDark = mode === 'auto' ? autoIsDark : mode === 'dark';
  const theme = isDark ? THEMES.dark : THEMES.light;
  const cycle = () => setMode((m) => (m === 'auto' ? 'light' : m === 'light' ? 'dark' : 'auto'));

  return { theme, mode, isDark, cycle };
}
