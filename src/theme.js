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
  // Опасные действия (выход из аккаунта): тёплый красный, чтобы не спорить с латунью.
  DANGER: '#E0715F', DANGER_BG: 'rgba(224,113,95,0.13)', DANGER_BORDER: 'rgba(224,113,95,0.55)',
  GLOW: '0 0 22px rgba(184,146,74,0.40)', NAV_BG: 'rgba(23,21,18,0.10)',
  CARD_SHADOW: '0 16px 40px rgba(0,0,0,0.4)',
  FONT: "'Space Grotesk', system-ui, sans-serif",
  FONT_DISPLAY: "'Space Grotesk', system-ui, sans-serif",
  FONT_MONO: "'JetBrains Mono', 'SF Mono', monospace",
};

export const BG_2A = '#0A0A0A';

// Фон — сетка мелких треугольников (вместо диагональных полос 2A, §12.2):
// треугольник ~3.4 px с шагом 18 px; ярче всего внизу, к 2/3 экрана снизу гаснет
// совсем (TRIS_MASK). Под стеклом карточки уровня и таб-бара узор размывается — на ровном
// чёрном стекла не было бы видно.
// Каждый ряд снизу вверх сдвинут на 5 px вправо — узор складывается в косые
// линии. Сдвиг возвращается к нулю только через 18 рядов (5·18 кратно 18),
// поэтому плитка — 18 × 324 px с 18 треугольниками; отсчёт рядов — от низа
// экрана (backgroundPosition: bottom). Фигура у края плитки дублируется на
// соседний край, чтобы не обрезалась.
const TRI_STEP = 18;
const TRI_SHIFT = 5;
const TRI_HALF = 1.7; // половина стороны
function trisTile() {
  const h = TRI_STEP * TRI_STEP;
  const shapes = [];
  for (let k = 0; k < TRI_STEP; k += 1) {
    const x = (TRI_STEP / 2 + TRI_SHIFT * k) % TRI_STEP;
    const y = h - TRI_STEP / 2 - TRI_STEP * k;
    [x - TRI_STEP, x, x + TRI_STEP].forEach((cx) => {
      if (cx <= -TRI_HALF - 1 || cx >= TRI_STEP + TRI_HALF + 1) return;
      const pts = [[cx, y - 1.7], [cx - TRI_HALF, y + 1.25], [cx + TRI_HALF, y + 1.25]];
      shapes.push(`<polygon points='${pts.map((p) => p.map((v) => +v.toFixed(2)).join(',')).join(' ')}'/>`);
    });
  }
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${TRI_STEP}' height='${h}' fill='rgba(242,235,221,0.10)'>${shapes.join('')}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
export const TRIS_2A = trisTile();
export const TRIS_SIZE = `${TRI_STEP}px ${TRI_STEP * TRI_STEP}px`;
// Затухание: внизу узор в полную силу, к 2/3 высоты экрана (снизу) его уже нет.
export const TRIS_MASK = 'linear-gradient(to top, #000 0%, rgba(0,0,0,0.5) 30%, rgba(0,0,0,0.12) 52%, transparent 66%)';

// Стекло — карточка уровня в «Профиле» и таб-бар: светлая кромка сверху, блик
// по диагонали, размытие фона. Размытие — бонус: в Telegram iOS backdrop-filter
// ненадёжен (§12.2), стекло держится на кромке и блике. Заливку каждый элемент
// задаёт сам: над неподвижным фоном — почти прозрачная (карточка уровня), над
// прокручиваемым содержимым — плотнее, «дымчатая» (таб-бар), чтобы под ним не
// читался текст, если размытие не сработало.
export const GLASS_SHEEN = 'linear-gradient(115deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.015) 38%, transparent 62%)';
export const GLASS_BORDER = '1px solid rgba(255,255,255,0.09)';
export const GLASS_EDGE = 'inset 0 1px 0 rgba(255,255,255,0.14), inset 0 -1px 0 rgba(0,0,0,0.25)';
export const GLASS_BLUR = { backdropFilter: 'blur(16px) saturate(1.5)', WebkitBackdropFilter: 'blur(16px) saturate(1.5)' };

// Стеклянная карточка экрана: заливка, кромка и блик (+ тень). Размытие фона
// (blur) — только у одиночных крупных карточек: у длинных списков (архив,
// достижения) backdrop-filter на каждой плашке тормозит прокрутку в Telegram
// iOS, а на чёрном фоне разницы почти не видно. Цветную рамку (активный
// переключатель, текущий год архива) карточка ставит поверх своим border.
export function glassCard({ blur = false, shadow = true } = {}) {
  return {
    background: `${GLASS_SHEEN}, linear-gradient(135deg, rgba(255,255,255,0.065), rgba(255,255,255,0.015))`,
    border: GLASS_BORDER,
    boxShadow: shadow ? `${GLASS_EDGE}, 0 10px 28px rgba(0,0,0,0.3)` : GLASS_EDGE,
    ...(blur ? GLASS_BLUR : {}),
  };
}

// Фрост-стекло для полупрозрачных плашек над фоном. Подложка НАМЕРЕННО
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
