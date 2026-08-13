import React, { useEffect, useRef, useState } from 'react';
import ClimbMountain from './ClimbMountain.jsx';

// Обёртка над ClimbMountain: сам компонент рисует SVG фиксированной ширины
// (width → он же считает высоту), а нам нужно вписать его в резиновую карточку.
// Поэтому меряем контейнер и передаём целую ширину в пикселях.
//
// Здесь же — единственная защита от «плохих» данных: если суммарная дистанция 0
// (кардио по времени, пустые секторы), масштаб px/км ушёл бы в бесконечность.
// В таком случае просто ничего не рисуем.
export function MountainBox({ sectors, minWidth = 200, style, ...rest }) {
  const ref = useRef(null);
  const [w, setW] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => setW(Math.max(minWidth, Math.round(el.clientWidth)));
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [minWidth]);

  const safe = (sectors || [])
    .map((s) => ({
      distance: parseFloat(s.distance) || 0,
      incline: parseFloat(s.incline) || 0,
    }))
    .filter((s) => s.distance > 0);

  const totalDistance = safe.reduce((a, s) => a + s.distance, 0);
  if (safe.length === 0 || totalDistance <= 0) return null;

  return (
    <div ref={ref} style={{ width: '100%', borderRadius: 14, overflow: 'hidden', ...style }}>
      {w > 0 && <ClimbMountain sectors={safe} width={w} {...rest} />}
    </div>
  );
}

// Набор высоты в метрах: наклон в процентах, поэтому подъём = дистанция × наклон/100.
// Дублируется в GuidedWorkout (sectorElevationGain) — там своя копия, чтобы не тянуть
// в гид зависимость от визуала.
export function elevationGainM(sectors) {
  return (sectors || []).reduce((acc, s) => {
    const d = parseFloat(s.distance) || 0;
    const incl = parseFloat(s.incline) || 0;
    return acc + d * incl * 10; // км × % × 10 = метры
  }, 0);
}

export default MountainBox;
