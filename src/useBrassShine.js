import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * Живой перелив/блик на латунных элементах (2A-редизайн).
 * Возвращает:
 *   - ref: повесить на корневой контейнер (для mousemove-фолбэка на десктопе)
 *   - shine: строка background-position, напр. "42.0% 63.0%"
 *   - needsPermission: true на iOS, пока пользователь не разрешил доступ к датчику
 *   - requestPermission: вызвать по тапу на кнопке «Включить блик»
 */
export function useBrassShine() {
  const [shineX, setShineX] = useState(50);
  const [shineY, setShineY] = useState(50);
  const [needsPermission, setNeedsPermission] = useState(false);

  const rootRef = useRef(null);
  const lastInput = useRef(0);
  const rafId = useRef(null);

  const onOrientation = useCallback((e) => {
    if (e.gamma == null && e.beta == null) return;
    lastInput.current = Date.now();
    setShineX(clamp(50 + (e.gamma || 0) * 1.8));
    setShineY(clamp(50 + ((e.beta || 0) - 45) * 1.8));
  }, []);

  const onMouseMove = useCallback((e) => {
    const el = rootRef.current;
    if (!el) return;
    lastInput.current = Date.now();
    const r = el.getBoundingClientRect();
    setShineX(clamp(((e.clientX - r.left) / r.width) * 100));
    setShineY(clamp(((e.clientY - r.top) / r.height) * 100));
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
    const DOE = window.DeviceOrientationEvent;
    const needsPerm = typeof DOE !== 'undefined' && typeof DOE.requestPermission === 'function';

    if (needsPerm) {
      setNeedsPermission(true); // iOS — ждём тап
    } else if ('DeviceOrientationEvent' in window) {
      window.addEventListener('deviceorientation', onOrientation);
    }

    const el = rootRef.current;
    if (el) el.addEventListener('mousemove', onMouseMove);

    const tick = () => {
      if (Date.now() - lastInput.current > 1200) {
        const time = Date.now() / 2200;
        setShineX(50 + Math.sin(time) * 42);
        setShineY(50 + Math.cos(time * 0.7) * 42);
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

  return {
    ref: rootRef,
    shine: `${shineX.toFixed(1)}% ${shineY.toFixed(1)}%`,
    needsPermission,
    requestPermission,
  };
}

function clamp(v) {
  return Math.max(0, Math.min(100, v));
}
