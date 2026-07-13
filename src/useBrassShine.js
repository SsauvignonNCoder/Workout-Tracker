import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * Живой перелив/блик на латунных элементах (2A).
 * ВАЖНО: позицию блика пишем ИМПЕРАТИВНО в CSS-переменную `--shine` на ref-элементе,
 * без React-состояния — иначе компонент ререндерился бы 60 раз/сек и перерисовывал
 * весь экран (из-за чего «ездили» диагональные полосы фона).
 *
 * Возвращает:
 *   - ref: повесить на корневой контейнер (родитель латунных элементов + для mousemove на десктопе)
 *   - needsPermission / requestPermission: iOS gyro-доступ по тапу
 * Латунные элементы используют `background-position: var(--shine, 50% 50%)`.
 */
export function useBrassShine() {
  const rootRef = useRef(null);
  const lastInput = useRef(0);
  const rafId = useRef(null);
  const [needsPermission, setNeedsPermission] = useState(false);

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

  const requestPermission = useCallback(() => {
    const DOE = window.DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === 'function') {
      DOE.requestPermission()
        .then((res) => {
          if (res === 'granted') window.addEventListener('deviceorientation', onOrientation);
          setNeedsPermission(false);
        })
        .catch(() => setNeedsPermission(false));
    } else {
      setNeedsPermission(false);
    }
  }, [onOrientation]);

  useEffect(() => {
    setShine(50, 50);
    const DOE = window.DeviceOrientationEvent;
    const needsPerm = typeof DOE !== 'undefined' && typeof DOE.requestPermission === 'function';
    if (needsPerm) setNeedsPermission(true);
    else if ('DeviceOrientationEvent' in window) window.addEventListener('deviceorientation', onOrientation);

    const el = rootRef.current;
    if (el) el.addEventListener('mousemove', onMouseMove);

    const tick = () => {
      if (Date.now() - lastInput.current > 1200) {
        const t = Date.now() / 2200;
        setShine(50 + Math.sin(t) * 42, 50 + Math.cos(t * 0.7) * 42);
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

  return { ref: rootRef, needsPermission, requestPermission };
}

function clamp(v) {
  return Math.max(0, Math.min(100, v));
}
