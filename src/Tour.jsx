import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Compass, X } from 'lucide-react';
import { useTheme } from './theme.js';

// ============================================================
// Обучение по приложению: затемнение с «окошком» над нужным местом, окошко
// плавно переезжает от шага к шагу, вкладки переключаются сами. Внизу заодно
// подсвечивается кнопка вкладки — чтобы было видно, где это искать потом.
//
// Цели — элементы с атрибутом data-tour="…" (у шага может быть несколько
// кандидатов — берётся первый видимый). Вкладка «Тренировка» не размонтируется,
// а прячется display:none — у спрятанного элемента нулевой размер, его
// пропускаем. Новую цель — добавить data-tour на элемент; тест проверяет, что у
// каждого шага цель в коде есть.
//
// Позиция окошка обновляется в requestAnimationFrame НАПРЯМУЮ в DOM, без
// React-состояния (как блик латуни в useBrassShine): иначе 60 перерисовок в
// секунду. Так же окошко следует за элементом при прокрутке и смене вкладки.
//
// Тур рендерится в портал (document.body) поверх всего, включая свёрнутую
// тренировку (z-index 1000–1200).
// ============================================================

export const TOUR_STEPS = [
  {
    id: 'tabbar', targets: ['tabbar'], fixed: true,
    title: 'Пять вкладок',
    text: 'Внизу вся навигация: Прогресс, Вес, Тренировка, Ассистент и Профиль. Между вкладками можно ещё листать свайпом влево-вправо.',
  },
  {
    id: 'plan', tab: 'profile', targets: ['plan'],
    title: 'Выбери план',
    text: 'Начни с плана тренировок: в нём дни, упражнения, подходы и повторы на 4 недели. Тапни сюда и выбери план — следующая тренировка начнётся с первого дня.',
  },
  {
    id: 'start', tab: 'workout', targets: ['workout-start'],
    title: 'Начать тренировку',
    text: 'Здесь день плана на сегодня — его можно сменить. «Начать тренировку» проведёт по упражнениям: цель, рекорд, как выполнять, секундомер и отдых. В конце тренировка сохранится сама.',
  },
  {
    id: 'weight', tab: 'measurements', targets: ['weight'],
    title: 'Записать вес',
    text: 'Взвешивайся утром: с 6 до 10 приложение само открывается на этой вкладке. В «Параметрах тела» — талия, грудь, плечи и другие замеры с историей.',
  },
  {
    id: 'progress', tab: 'progress', targets: ['progress'],
    title: 'Прогресс',
    text: 'Неделя по плану, история тренировок, графики по каждому упражнению и рекорды. Любую тренировку из истории можно открыть и поправить.',
  },
  {
    id: 'assistant', tab: 'assistant', targets: ['assistant-intro', 'assistant-input'],
    title: 'Ассистент',
    text: 'Спроси обычными словами: как растут веса, где застой, что подтянуть. Он видит тренировки и замеры, но ничего не меняет. Работает внутри Telegram.',
  },
  {
    id: 'level', tab: 'profile', targets: ['level'],
    title: 'Уровень и достижения',
    text: 'За тренировки начисляется опыт, серия без пропусков его умножает. Уровни — до 60. Ниже — 99 достижений: у закрытых видно, сколько осталось.',
  },
  {
    id: 'alerts', tab: 'profile', targets: ['alerts'],
    title: 'Напоминания',
    text: 'Бот в Telegram напомнит о пропущенной тренировке — вечером, если по плану был день, а записи нет, — и о протеине через час после тренировки. Включай и выключай здесь.',
  },
  {
    id: 'restart', targets: ['tour-restart'],
    title: 'Готово!',
    text: 'Обучение всегда можно пройти ещё раз — кнопка с компасом здесь, вверху экрана. Хороших тренировок!',
  },
];

const Z = 2000;
const PAD = 8; // поле вокруг цели
const TOP_GAP = 96; // куда прокручивать цель: столько от верха экрана
const MISSING_MS = 1500; // цель так и не появилась — шаг без окошка, карточка по центру

function findTarget(ids) {
  for (const id of ids) {
    const els = document.querySelectorAll(`[data-tour="${id}"]`);
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return el;
    }
  }
  return null;
}

// Прямоугольник цели с полем, не шире экрана.
function holeOf(el, pad) {
  const r = el.getBoundingClientRect();
  const vw = window.innerWidth;
  const x = Math.max(4, r.left - pad);
  const right = Math.min(vw - 4, r.right + pad);
  return { x, y: r.top - pad, w: Math.max(0, right - x), h: r.height + pad * 2 };
}

// Плавно подтянуть текущий прямоугольник к цели; первый раз — сразу на место.
function approach(cur, goal, a) {
  if (!goal) return cur;
  if (!cur) return { ...goal };
  return {
    x: cur.x + (goal.x - cur.x) * a,
    y: cur.y + (goal.y - cur.y) * a,
    w: cur.w + (goal.w - cur.w) * a,
    h: cur.h + (goal.h - cur.h) * a,
  };
}

function setRect(svgRect, ring, r) {
  if (!svgRect || !ring) return;
  const hide = !r || r.w <= 0;
  svgRect.setAttribute('x', hide ? -100 : r.x);
  svgRect.setAttribute('y', hide ? -100 : r.y);
  svgRect.setAttribute('width', hide ? 0 : r.w);
  svgRect.setAttribute('height', hide ? 0 : r.h);
  ring.style.opacity = hide ? '0' : '1';
  if (!hide) {
    ring.style.transform = `translate(${r.x}px, ${r.y}px)`;
    ring.style.width = `${r.w}px`;
    ring.style.height = `${r.h}px`;
  }
}

function TourStyles() {
  return (
    <style>{`
      @keyframes tourPulse {
        0% { box-shadow: 0 0 0 0 rgba(199,154,78,0.55), 0 0 18px rgba(199,154,78,0.35); }
        70% { box-shadow: 0 0 0 12px rgba(199,154,78,0), 0 0 18px rgba(199,154,78,0.35); }
        100% { box-shadow: 0 0 0 0 rgba(199,154,78,0), 0 0 18px rgba(199,154,78,0.35); }
      }
      .tour-ring { animation: tourPulse 1.6s ease-out infinite; }
      @keyframes tourIn {
        from { opacity: 0; transform: translateY(6px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .tour-in { animation: tourIn 0.28s ease-out; }
      @keyframes tourPop {
        from { opacity: 0; transform: scale(0.94); }
        to { opacity: 1; transform: scale(1); }
      }
      .tour-pop { animation: tourPop 0.26s cubic-bezier(0.34, 1.4, 0.64, 1); }
      @keyframes tourFade { from { opacity: 0; } to { opacity: 1; } }
      .tour-fade { animation: tourFade 0.25s ease-out; }
    `}</style>
  );
}

// Вопрос новичку при первом входе: «Да» — тур, «Нет» — просто закрыть.
export function TourPrompt({ onYes, onNo }) {
  const t = useTheme();
  return createPortal(
    <div
      role="dialog" aria-modal="true" aria-labelledby="tour-ask-title"
      className="tour-fade"
      style={{
        position: 'fixed', inset: 0, zIndex: Z, background: 'rgba(0,0,0,0.62)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        fontFamily: t.FONT, touchAction: 'none',
      }}
    >
      <TourStyles />
      <div className="tour-pop" style={{
        width: '100%', maxWidth: 380, boxSizing: 'border-box', background: t.BG_RAISED,
        border: `1px solid ${t.ACCENT_BORDER}`, borderRadius: 22, padding: '22px 20px 18px',
        boxShadow: `${t.CARD_SHADOW}, ${t.GLOW}`, textAlign: 'center',
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: 18, margin: '0 auto 14px', background: t.ACCENT_BG,
          border: `1px solid ${t.ACCENT_BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Compass size={28} color={t.ACCENT_SOFT} strokeWidth={1.7} />
        </div>
        <div id="tour-ask-title" style={{ fontSize: 18, fontWeight: 700, color: t.TEXT, fontFamily: t.FONT_DISPLAY, marginBottom: 8, lineHeight: 1.25 }}>
          Ознакомиться с функциями трекера?
        </div>
        <div style={{ fontSize: 13.5, color: t.TEXT_DIM, lineHeight: 1.5, marginBottom: 18 }}>
          Покажу за минуту самое нужное: как выбрать план и начать тренировку, где записать
          вес и смотреть прогресс, как включить напоминания.
        </div>
        <button
          onClick={onYes}
          style={{
            width: '100%', padding: '14px', borderRadius: 14, border: 'none', marginBottom: 8,
            background: t.ACCENT_GRAD, color: t.ON_ACCENT, fontSize: 15.5, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit', boxShadow: t.GLOW,
          }}
        >
          Да, покажи
        </button>
        <button
          onClick={onNo}
          style={{
            width: '100%', padding: '12px', borderRadius: 14, border: `1px solid ${t.BORDER}`,
            background: 'transparent', color: t.TEXT_DIM, fontSize: 14.5, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          Нет, спасибо
        </button>
      </div>
    </div>,
    document.body,
  );
}

// Сам тур. onClose(true) — дошли до конца, onClose(false) — пропустили.
export function Tour({ tab, goToTab, onClose }) {
  const t = useTheme();
  const [i, setI] = useState(0);
  const step = TOUR_STEPS[i];
  const isLast = i === TOUR_STEPS.length - 1;

  const holeRef = useRef(null);
  const ringRef = useRef(null);
  const pillHoleRef = useRef(null);
  const pillRingRef = useRef(null);
  const cardRef = useRef(null);
  // Свежие tab/goToTab для эффектов — App пересоздаёт goToTab на каждый рендер.
  const nav = useRef({ tab, goToTab });
  nav.current = { tab, goToTab };
  const stepRef = useRef({ i: 0, since: 0, scrolled: false });

  // Новый шаг: своя вкладка, прокрутка к цели — заново.
  useEffect(() => {
    stepRef.current = { i, since: performance.now(), scrolled: false };
    const s = TOUR_STEPS[i];
    if (s.tab && nav.current.tab !== s.tab) nav.current.goToTab(s.tab);
  }, [i]);

  useEffect(() => {
    let raf = 0;
    let prev = performance.now();
    let main = null;
    let pill = null;
    let cardY = null;
    const tick = (now) => {
      const dt = Math.min(64, now - prev);
      prev = now;
      const a = 1 - Math.exp(-dt / 90); // ~0.3 с до места
      const s = TOUR_STEPS[stepRef.current.i];
      const vh = window.innerHeight;

      const el = findTarget(s.targets);
      if (el && !s.fixed && !stepRef.current.scrolled) {
        stepRef.current.scrolled = true;
        const top = el.getBoundingClientRect().top;
        window.scrollTo({ top: Math.max(0, window.scrollY + top - TOP_GAP), behavior: 'smooth' });
      }
      const missing = !el && now - stepRef.current.since > MISSING_MS;
      if (missing) main = null;
      else main = approach(main, el ? holeOf(el, PAD) : null, a);

      const pillEl = s.tab ? findTarget([`tab-${s.tab}`]) : null;
      pill = pillEl ? approach(pill, holeOf(pillEl, 4), a) : null;

      setRect(holeRef.current, ringRef.current, main);
      setRect(pillHoleRef.current, pillRingRef.current, pill);

      // Карточка: под окошком, если влезает над таб-баром; иначе над ним;
      // иначе — прямо над таб-баром, заходя на низ окошка: подсвеченная кнопка
      // вкладки должна оставаться видна.
      const card = cardRef.current;
      if (card) {
        const ch = card.offsetHeight;
        const bar = findTarget(['tabbar']);
        const barTop = bar ? bar.getBoundingClientRect().top : vh - 90;
        let goalY;
        if (!main) goalY = Math.max(16, (vh - ch) / 2);
        else if (s.fixed) goalY = main.y - 14 - ch;
        else if (main.y + main.h + 14 + ch <= barTop - 8) goalY = main.y + main.h + 14;
        else if (main.y - 14 - ch >= 12) goalY = main.y - 14 - ch;
        else goalY = barTop - 8 - ch;
        goalY = Math.max(12, Math.min(vh - ch - 12, goalY));
        cardY = cardY == null ? goalY : cardY + (goalY - cardY) * a;
        card.style.transform = `translate(-50%, ${cardY}px)`;
        card.style.opacity = '1';
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const next = () => (isLast ? onClose(true) : setI(i + 1));
  const back = () => { if (i > 0) setI(i - 1); };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose(false);
      else if (e.key === 'ArrowRight' || e.key === 'Enter') next();
      else if (e.key === 'ArrowLeft') back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const ring = {
    position: 'fixed', left: 0, top: 0, width: 0, height: 0, opacity: 0, pointerEvents: 'none',
    boxSizing: 'border-box', border: `2px solid ${t.ACCENT}`,
  };

  return createPortal(
    <div
      role="dialog" aria-modal="true" aria-label="Обучение"
      className="tour-fade"
      // Тур только показывает: тапы по приложению под затемнением не проходят.
      onClick={(e) => e.stopPropagation()}
      style={{ position: 'fixed', inset: 0, zIndex: Z, fontFamily: t.FONT, touchAction: 'none' }}
    >
      <TourStyles />
      <svg width="100%" height="100%" style={{ position: 'fixed', inset: 0 }} aria-hidden>
        <defs>
          <mask id="wt-tour-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            <rect ref={holeRef} rx="14" ry="14" fill="black" />
            <rect ref={pillHoleRef} rx="17" ry="17" fill="black" />
          </mask>
        </defs>
        <rect x="0" y="0" width="100%" height="100%" fill="rgba(0,0,0,0.74)" mask="url(#wt-tour-mask)" />
      </svg>
      <div ref={ringRef} className="tour-ring" style={{ ...ring, borderRadius: 14 }} />
      <div ref={pillRingRef} className="tour-ring" style={{ ...ring, borderRadius: 17 }} />

      <div
        ref={cardRef}
        style={{
          position: 'fixed', left: '50%', top: 0, opacity: 0,
          width: 'min(400px, calc(100vw - 32px))', boxSizing: 'border-box',
          background: t.BG_RAISED, border: `1px solid ${t.ACCENT_BORDER}`, borderRadius: 18,
          padding: '14px 16px 14px', boxShadow: `${t.CARD_SHADOW}, 0 0 30px rgba(184,146,74,0.22)`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
          <div style={{ display: 'flex', gap: 4 }} aria-label={`Шаг ${i + 1} из ${TOUR_STEPS.length}`}>
            {TOUR_STEPS.map((s, k) => (
              <span key={s.id} style={{
                width: k === i ? 16 : 6, height: 6, borderRadius: 3,
                background: k <= i ? t.ACCENT : t.BORDER, transition: 'width 0.25s ease, background 0.25s ease',
              }} />
            ))}
          </div>
          {!isLast && (
            <button
              onClick={() => onClose(false)}
              style={{
                display: 'flex', alignItems: 'center', gap: 4, background: 'transparent', border: 'none',
                color: t.TEXT_FAINT, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit', padding: '2px 0',
              }}
            >
              Пропустить <X size={13} />
            </button>
          )}
        </div>
        <div key={step.id} className="tour-in" aria-live="polite">
          <div style={{ fontSize: 16, fontWeight: 700, color: t.TEXT, fontFamily: t.FONT_DISPLAY, marginBottom: 5 }}>
            {step.title}
          </div>
          <div style={{ fontSize: 13.5, color: t.TEXT_DIM, lineHeight: 1.5, marginBottom: 14 }}>
            {step.text}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {i > 0 && (
            <button
              onClick={back}
              style={{
                flex: 1, padding: '11px', borderRadius: 12, border: `1px solid ${t.BORDER}`,
                background: 'transparent', color: t.TEXT_DIM, fontSize: 14, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Назад
            </button>
          )}
          <button
            onClick={next}
            style={{
              flex: 2, padding: '11px', borderRadius: 12, border: 'none',
              background: t.ACCENT_GRAD, color: t.ON_ACCENT, fontSize: 14.5, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit', boxShadow: t.GLOW,
            }}
          >
            {isLast ? 'Начать' : 'Далее'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
