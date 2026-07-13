import { useEffect, useRef, useCallback } from 'react';

/**
 * Живой перелив/блик на латунных элементах (2A).
 * Позицию блика пишем ИМПЕРАТИВНО в CSS-переменную `--shine` на ref-элементе,
 * без React-состояния (иначе ререндер 60 fps → дрожание фона).
 *
 * Кнопки-разрешения НЕТ: на iOS gyro без requestPermission не сработает, но всегда
 * идёт мягкая авто-анимация перелива, а на десктопе блик следует за курсором.
 * Возвращает { ref } — повесить на общий контейнер (родитель латунных элементов).
 * Латунь использует `background-position: var(--shine, 50% 50%)`.
 */
export function useBrassShine() {
  const rootRef = useRef(null);
  const lastInput = useRef(0);
  const rafId = useRef(null);

  const setShine = (x, y) => {
    const el = rootRef.current;
    if (el) el.style.setProperty('--shine', `${clamp(x).toFixed(1)}% ${clamp(y).toFixed(1)}%`);
  };

  const onOrientation = useCallback((e) => {
    if (e.gamma == null && e.beta == null) return;
    lastInput.current = Date.now();
    setShine(50 + (e.gamma || 0) * 1.8, 50 + ((e.beta || 0) - 45) * 1.8);
  }, []);

  const onMouseMove = useCallback((e) => {
    const el = rootRef.current;
    if (!el) return;
    lastInput.current = Date.now();
    const r = el.getBoundingClientRect();
    setShine(((e.clientX - r.left) / r.width) * 100, ((e.clientY - r.top) / r.height) * 100);
  }, []);

  useEffect(() => {
    setShine(50, 50);
    // Добавить слушатель безопасно: на iOS без разрешения просто не сработает (тихо),
    // а авто-анимация ниже даёт живой перелив в любом случае.
    if ('DeviceOrientationEvent' in window) window.addEventListener('deviceorientation', onOrientation);
    const el = rootRef.current;
    if (el) el.addEventListener('mousemove', onMouseMove);

    const tick = () => {
      if (Date.now() - lastInput.current > 900) {
        const t = Date.now() / 2600;
        setShine(50 + Math.sin(t) * 40, 50 + Math.cos(t * 0.7) * 40);
      }
      rafId.current = requestAnimationFrame(tick);
    };
    rafId.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId.current);
      window.removeEventListener('deviceorientation', onOrientation);
      if (el) el.removeEventListener('mousemove', onMouseMove);
    };
  }, [onOrientation, onMouseMove]);

  return { ref: rootRef };
}

function clamp(v) {
  return Math.max(0, Math.min(100, v));
}
