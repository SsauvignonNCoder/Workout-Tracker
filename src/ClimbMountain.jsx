import React, { useMemo, useRef } from 'react';

/**
 * ClimbMountain — гора, построенная из секторов кардио-тренировки.
 *
 *   <ClimbMountain sectors={sectors} width={390} />
 *
 * Пропсы:
 *   sectors          [{ distance: км, incline: % }]  обязательный, порядок = порядок прохождения
 *   width            ширина кадра в px (по умолчанию 390). Высота считается сама
 *   marks            [{ at: км }] — красные флаги на реальных отметках высоты
 *   highlightSector  индекс сектора (0-based) — подсветить участок золотой линией, иначе null
 *   showStars        звёзды в небе (по умолчанию true)
 *   animate          рост горы при появлении + мерцание/дрейф (по умолчанию true)
 *   look             'a' гравюра | 'b' мягкие массы | 'c' гибрид (по умолчанию 'c')
 *
 * Внутри нет внешних зависимостей, только React + SVG. Всё детерминировано:
 * один и тот же набор секторов всегда даёт одну и ту же картинку (сид в rnd()).
 *
 * МАСШТАБ ЧЕСТНЫЙ 1:1 — px на км по X и по Y одинаковый, поэтому гора занимает
 * нижнюю часть кадра, а небо — основную площадь. Это намеренно.
 *
 * Зоны по абсолютной высоте (км набора): 0–0.5 луга, 0.5–1 камни, 1–1.5 снег, >1.5 лёд.
 * У каждого сектора свой мотив: 5 вариаций на зону, выбор по индексу сектора (i % 5).
 */

const KEYFRAMES = `@keyframes goraTwinkle { 0%, 100% { opacity: var(--o, 0.7); } 50% { opacity: calc(var(--o, 0.7) * 0.25); } }
@keyframes goraGrow { from { transform: scaleX(0); } to { transform: scaleX(1); } }
@keyframes goraDrift { from { transform: translateX(var(--x0)); } to { transform: translateX(var(--x1)); } }
@keyframes goraPuff { 0%, 100% { transform: scale(1, 1); } 33% { transform: scale(1.09, 0.88); } 66% { transform: scale(0.93, 1.12); } }
@keyframes goraSunRays { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@keyframes goraFlap { 0%, 100% { transform: scaleY(1); } 50% { transform: scaleY(0.45); } }
@keyframes goraShoot { 0%, 88% { opacity: 0; transform: none; } 91% { opacity: 0.9; } 100% { opacity: 0; transform: translate(64px, 23px); } }
@keyframes goraBlizzard { from { transform: translate(-16px, -5px); opacity: 0; } 20% { opacity: 0.8; } 80% { opacity: 0.5; } to { transform: translate(26px, 8px); opacity: 0; } }`;

class MountainScene {
  constructor(props) {
    this.props = props;
    this.state = { animKey: props.animKey || 0, cur: props.highlightSector == null ? null : props.highlightSector };
    this._solo = null;
    this._v = props.look || 'c';
  }

  SKY() { return ['#07080B', '#111018', '#221A1C', '#4A3020', '#8A6636', '#C09A52']; }
  TERRAIN() {
    return [
      { e: 0.00, c: '#284C33' }, { e: 0.28, c: '#3C7044' }, { e: 0.44, c: '#59955C' },
      { e: 0.56, c: '#6D6152' }, { e: 0.80, c: '#8A7B67' }, { e: 0.94, c: '#9C8E7B' },
      { e: 1.08, c: '#7C93AC' }, { e: 1.26, c: '#93AAC3' }, { e: 1.42, c: '#B2C8DC' },
      { e: 1.56, c: '#D8ECFA' }, { e: 1.70, c: '#EDF8FF' }, { e: 2.00, c: '#FFFFFF' },
    ];
  }


  rnd(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  mix(c1, c2, t) {
    const p = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
    const a = p(c1), b = p(c2);
    return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('');
  }

  colorAt(km) {
    const T = this.TERRAIN();
    if (km <= T[0].e) return T[0].c;
    for (let i = 1; i < T.length; i++) {
      if (km <= T[i].e) return this.mix(T[i - 1].c, T[i].c, (km - T[i - 1].e) / (T[i].e - T[i - 1].e));
    }
    return T[T.length - 1].c;
  }

  geo(sectors, w) {
    let x = 0, y = 0;
    const prof = [{ x: 0, y: 0 }];
    sectors.forEach((s) => {
      x += s.distance || 0;
      y += (s.distance || 0) * ((s.incline || 0) / 100);
      prof.push({ x, y });
    });
    const totalD = x || 1, gainKm = y;
    const pxPerKm = w / totalD;
    const mtnPx = gainKm * pxPerKm;
    const h = Math.round(Math.max(196, Math.min(420, mtnPx / 0.34)));
    const base = h - (mtnPx < 14 ? 22 : 6);
    const P = prof.map((p) => ({ x: p.x * pxPerKm, y: base - p.y * pxPerKm }));
    const yOfKm = (km) => base - km * pxPerKm;
    const kmOfY = (yy) => (base - yy) / pxPerKm;
    const yAt = (xx) => {
      if (xx <= P[0].x) return P[0].y;
      for (let i = 1; i < P.length; i++) {
        if (xx <= P[i].x) {
          const t = (xx - P[i - 1].x) / Math.max(1e-6, P[i].x - P[i - 1].x);
          return P[i - 1].y + (P[i].y - P[i - 1].y) * t;
        }
      }
      return P[P.length - 1].y;
    };
    let maxI = 0;
    sectors.forEach((s) => { maxI = Math.max(maxI, s.incline || 0); });
    return { P, base, h, w, pxPerKm, totalD, gainKm, maxI, yOfKm, kmOfY, yAt };
  }

  // ——— слои ———
  defsFor(v, g, e) {
    const id = (k) => k + '-' + v;
    const SKY = this.SKY(), T = this.TERRAIN();
    const d = [];
    const sunR = Math.max(11, g.h * 0.075);
    const sunCy = Math.max(sunR * 1.25, g.base - Math.max(14, g.gainKm * g.pxPerKm) * 1.5 - sunR * 1.15);
    const dawnY = Math.min(g.h, sunCy + sunR * 1.3);
    d.push(e('linearGradient', { key: 'sky', id: id('sky'), gradientUnits: 'userSpaceOnUse', x1: 0, y1: 0, x2: 0, y2: dawnY },
      SKY.map((c, i) => e('stop', { key: i, offset: i / (SKY.length - 1), stopColor: c }))));
    const stops = T.slice().reverse().map((s, i) => e('stop', {
      key: i, offset: Math.max(0, Math.min(1, (2 - s.e) / 2)), stopColor: s.c,
    }));
    d.push(e('linearGradient', { key: 'ter', id: id('ter'), gradientUnits: 'userSpaceOnUse', x1: 0, y1: g.yOfKm(2), x2: 0, y2: g.base }, stops));
    d.push(e('radialGradient', { key: 'glow', id: id('glow') },
      e('stop', { offset: 0, stopColor: 'rgba(233,197,120,0.55)' }),
      e('stop', { offset: 0.45, stopColor: 'rgba(216,168,86,0.22)' }),
      e('stop', { offset: 1, stopColor: 'rgba(216,168,86,0)' })));
    d.push(e('linearGradient', { key: 'fog', id: id('fog'), x1: 0, y1: 0, x2: 0, y2: 1 },
      e('stop', { offset: 0, stopColor: 'rgba(226,200,160,0)' }),
      e('stop', { offset: 1, stopColor: 'rgba(226,200,160,0.20)' })));
    d.push(e('linearGradient', { key: 'shade', id: id('shade'), x1: 0, y1: 0, x2: 1, y2: 0 },
      e('stop', { offset: 0, stopColor: 'rgba(255,222,170,0.16)' }),
      e('stop', { offset: 0.5, stopColor: 'rgba(0,0,0,0)' }),
      e('stop', { offset: 1, stopColor: 'rgba(6,8,14,0.30)' })));
    d.push(e('filter', { key: 'blur', id: 'blur-' + v, x: '-60%', y: '-60%', width: '220%', height: '220%' },
      e('feGaussianBlur', { stdDeviation: 5 })));
    d.push(e('filter', { key: 'soft', id: 'soft-' + v, x: '-30%', y: '-60%', width: '160%', height: '260%' },
      e('feGaussianBlur', { stdDeviation: 0.9 })));
    const path = this.mtnPath(g);
    d.push(e('clipPath', { key: 'mtn', id: id('mtn') }, e('path', { d: path })));
    d.push(e('clipPath', { key: 'rev', id: id('rev') }, e('rect', {
      x: 0, y: 0, width: g.w, height: g.h,
      style: { transformBox: 'fill-box', transformOrigin: 'left center', animation: 'goraGrow 1.15s cubic-bezier(.22,.9,.2,1) both' },
    })));
    return e('defs', null, d);
  }

  mtnPath(g) {
    let p = 'M ' + g.P[0].x.toFixed(2) + ' ' + g.P[0].y.toFixed(2);
    for (let i = 1; i < g.P.length; i++) p += ' L ' + g.P[i].x.toFixed(2) + ' ' + g.P[i].y.toFixed(2);
    p += ' L ' + g.w.toFixed(2) + ' ' + g.P[g.P.length - 1].y.toFixed(2);
    p += ' L ' + g.w.toFixed(2) + ' ' + (g.h + 4) + ' L 0 ' + (g.h + 4) + ' Z';
    return p;
  }

  stars(v, g, R, e) {
    const out = [];
    const top = g.h * 0.3;
    for (let i = 0; i < 150; i++) {
      const x = R() * g.w, y = R() * top;
      const wgt = Math.pow(1 - y / top, 1.2);
      if (R() > wgt * 0.92 + 0.05) continue;
      const r = 0.45 + R() * (v === 'b' ? 1.1 : 0.85);
      const op = 0.22 + wgt * 0.65;
      const st = { '--o': op.toFixed(2), animation: 'goraTwinkle ' + (2.4 + R() * 5).toFixed(2) + 's ease-in-out ' + (R() * 4).toFixed(2) + 's infinite', opacity: op };
      if (v !== 'b' && R() > 0.78) {
        const l = r * 2.6;
        out.push(e('g', { key: 'sx' + i, stroke: '#F6EFE0', strokeWidth: 0.6, style: st },
          e('line', { x1: x - l, y1: y, x2: x + l, y2: y }),
          e('line', { x1: x, y1: y - l, x2: x, y2: y + l })));
      } else {
        if (v === 'b' && R() > 0.86) out.push(e('circle', { key: 'sg' + i, cx: x, cy: y, r: r * 3.4, fill: '#CFE0F5', opacity: op * 0.14 }));
        out.push(e('circle', { key: 's' + i, cx: x, cy: y, r, fill: '#F4F1E6', style: st }));
      }
    }
    return out;
  }

  cloudNew(v, g, R, e, key, cy, rxBase, depth) {
    // кучевое облако: плоское основание + неровная гряда клубов сверху, мягкий край
    const rx = rxBase * (0.78 + R() * 0.5);
    const warm = Math.max(0, Math.min(1, 1.15 - cy / (g.h * 0.72)));
    const far = 1 - depth;
    const dark = this.mix(this.mix('#4A3E4E', '#9C6E48', 0.3 + warm * 0.6), '#5A5470', far * 0.55);
    const litc = this.mix(this.mix('#8E7458', '#FFE2B8', 0.35 + warm * 0.6), '#8E90AC', far * 0.45);
    const bry = Math.max(1.6, rx * 0.13);
    const bumps = [];
    const n = 5 + Math.floor(R() * 4);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5 + (R() - 0.5) * 0.4) / n - 0.5;
      const hump = Math.pow(Math.cos(t * Math.PI * 0.92), 1.3);
      const pr = rx * (0.15 + 0.26 * hump) * (0.7 + R() * 0.7);
      bumps.push({ x: t * rx * 1.8, y: -pr * (0.35 + 0.5 * hump) + (R() - 0.5) * pr * 0.35, r: pr });
    }
    // фестончатый низ — как на референсе
    const low = [];
    const nb = 3 + Math.floor(R() * 3);
    for (let i = 0; i < nb; i++) {
      const t = (i + 0.5) / nb - 0.5;
      const pr = rx * (0.12 + R() * 0.11);
      low.push({ x: t * rx * 1.45, y: bry * 0.3 + pr * 0.2, r: pr });
    }
    // цельный силуэт: одна непрозрачная масса без внутренних швов
    const sil = [e('ellipse', { key: 'base', cx: 0, cy: -bry * 0.1, rx, ry: bry, fill: dark })];
    bumps.concat(low).forEach((b, i) => sil.push(e('circle', { key: 'b' + i, cx: b.x, cy: b.y, r: b.r, fill: dark })));
    const kids = [e('g', { key: 'sil' }, sil)];
    // подсветка сверху-слева и тень снизу
    const hi = [];
    bumps.forEach((b, i) => {
      hi.push(e('circle', { key: 'h' + i, cx: b.x - b.r * 0.26, cy: b.y - b.r * 0.3, r: b.r * 0.66, fill: litc, opacity: 0.30 + warm * 0.28 }));
      hi.push(e('circle', { key: 'h2' + i, cx: b.x - b.r * 0.4, cy: b.y - b.r * 0.42, r: b.r * 0.34, fill: litc, opacity: 0.3 }));
    });
    kids.push(e('g', { key: 'hi' }, hi));
    kids.push(e('ellipse', { key: 'sh', cx: rx * 0.06, cy: bry * 0.35, rx: rx * 0.92, ry: bry * 0.72, fill: '#1A1520', opacity: 0.30 }));
    const dur = ((150 - depth * 105) * (0.8 + R() * 0.4)).toFixed(1);
    return e('g', {
      key,
      opacity: 0.26 + depth * 0.26,
      style: {
        '--x0': (-rx * 2.2).toFixed(1) + 'px', '--x1': (g.w + rx * 2.2).toFixed(1) + 'px',
        animation: 'goraDrift ' + dur + 's linear ' + (-R() * dur).toFixed(1) + 's infinite',
      },
    }, e('g', { transform: 'translate(0,' + cy.toFixed(1) + ')' },
      e('g', {
        style: { animation: 'goraPuff ' + (14 + R() * 10).toFixed(1) + 's ease-in-out ' + (-R() * 12).toFixed(1) + 's infinite', transformBox: 'fill-box', transformOrigin: 'center' },
      }, kids)));
  }


  clouds(v, g, R, e, layer) {
    // layer: 0 — дальний план (мелкие, блёклые, медленные), 1 — средний, 2 — передний
    const cfg = [
      { n: 3, depth: 0.15, rx: g.w * 0.028, y: [0.20, 0.32] },
      { n: 3, depth: 0.5, rx: g.w * 0.04, y: [0.32, 0.44] },
      { n: 2, depth: 1.0, rx: g.w * 0.058, y: [0.44, 0.54] },
    ][layer];
    const out = [];
    for (let i = 0; i < cfg.n; i++) {
      const cy = g.h * (cfg.y[0] + (cfg.y[1] - cfg.y[0]) * ((i + R()) / cfg.n));
      out.push(this.cloudNew(v, g, R, e, 'cl' + layer + '-' + i, cy, cfg.rx, cfg.depth));
    }
    return out;
  }

  bgRidge(g, R, e, key, depth) {
    // дальние хребты: чем меньше depth, тем дальше, бледнее и выше по кадру
    // повторяет профиль основной горы со случайными отклонениями, непрозрачно
    const mtn = Math.max(14, g.gainKm * g.pxPerKm);
    const far = depth < 0.4;
    const kScale = far ? 1.34 : 1.1;
    const dx = far ? -g.w * 0.3 : -g.w * 0.12;
    const steps = 18;
    let d = 'M ' + (-14) + ' ' + (g.h + 4);
    const pts = [];
    let lastY = g.base;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const sx = -14 + t * (g.w + 28);
      const src = Math.max(0, Math.min(g.w, sx - dx));
      const rise = (g.base - g.yAt(src)) * kScale;
      const wob = mtn * (R() - 0.5) * 0.07 + Math.sin(t * 5.5 + depth * 6) * mtn * 0.06;
      const y = Math.min(g.base, g.base - Math.max(2, rise + wob) - (far ? mtn * 0.16 : mtn * 0.05));
      d += ' L ' + sx.toFixed(1) + ' ' + y.toFixed(1);
      pts.push({ x: sx, y });
      lastY = y;
    }
    d += ' L ' + (g.w + 14) + ' ' + (g.h + 4) + ' Z';
    const fill = far ? '#3B3244' : '#2A2029';
    const det = [];
    // снеговые шапки на верхушках дальних хребтов
    pts.forEach((p, i) => {
      if (i === 0 || i === pts.length - 1) return;
      const a = pts[i - 1], b = pts[i + 1];
      if (!(p.y < a.y && p.y < b.y)) return;
      const wl = Math.min(11, (p.x - a.x) * 0.5), wr = Math.min(11, (b.x - p.x) * 0.5);
      const dep = mtn * (0.05 + R() * 0.05);
      det.push(e('ellipse', {
        key: 'cap' + i,
        cx: p.x, cy: p.y + dep * 0.55, rx: (wl + wr) * 0.55, ry: dep * 0.7,
        fill: far ? 'rgba(230,234,248,0.20)' : 'rgba(238,242,252,0.16)',
        filter: 'url(#blur-' + (this._v || 'c') + ')',
      }));
    });
    // лес силуэтом по кромке ближнего хребта
    if (!far) {
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        for (let k = 0; k < 5; k++) {
          const t = (k + R() * 0.7) / 5;
          const x = a.x + (b.x - a.x) * t;
          const y = a.y + (b.y - a.y) * t;
          if (y > g.base - mtn * 0.06) continue;
          const hh = 2.6 + R() * 2.4;
          det.push(e('path', {
            key: 'bt' + i + '-' + k,
            d: 'M ' + x.toFixed(1) + ' ' + (y - hh).toFixed(1) + ' L ' + (x + hh * 0.34).toFixed(1) + ' ' + (y + 0.6).toFixed(1) + ' L ' + (x - hh * 0.34).toFixed(1) + ' ' + (y + 0.6).toFixed(1) + ' Z',
            fill: '#221A22', opacity: 0.85,
          }));
        }
      }
    }
    // пелена тумана у подножия хребта — разделяет планы
    det.push(e('ellipse', {
      key: 'mist', cx: g.w * (far ? 0.35 : 0.6), cy: lastY + mtn * 0.1,
      rx: g.w * 0.75, ry: Math.max(3, mtn * 0.12),
      fill: far ? 'rgba(214,196,206,0.14)' : 'rgba(226,200,168,0.12)',
    }));
    return e('g', { key },
      e('path', { d, fill }),
      e('clipPath', { id: 'clip-' + key + '-' + (this._v || 'c') }, e('path', { d })),
      e('g', { clipPath: 'url(#clip-' + key + '-' + (this._v || 'c') + ')' }, det),
      e('path', { d, fill: 'none', stroke: far ? 'rgba(222,196,196,0.28)' : 'rgba(255,214,164,0.32)', strokeWidth: 0.9, strokeLinejoin: 'round' }));
  }

  birds(g, R, e) {
    const out = [];
    for (let i = 0; i < 7; i++) {
      const y = g.h * (0.26 + R() * 0.26);
      const s = 1.8 + R() * 1.8;
      const dur = (55 + R() * 45).toFixed(1);
      out.push(e('g', {
        key: 'bird' + i,
        style: {
          '--x0': (-20).toFixed(1) + 'px', '--x1': (g.w + 20).toFixed(1) + 'px',
          animation: 'goraDrift ' + dur + 's linear ' + (-R() * dur).toFixed(1) + 's infinite',
        },
      }, e('path', {
        d: 'M 0 ' + y.toFixed(1) + ' q ' + s + ' ' + (-s * 0.9) + ' ' + s * 2 + ' 0 q ' + s + ' ' + (-s * 0.9) + ' ' + s * 2 + ' 0',
        fill: 'none', stroke: 'rgba(28,22,20,0.55)', strokeWidth: 0.9, strokeLinecap: 'round',
        style: { animation: 'goraFlap ' + (0.9 + R() * 0.7).toFixed(2) + 's ease-in-out infinite', transformBox: 'fill-box', transformOrigin: 'center' },
      })));
    }
    // клин: пять птиц строем
    const fy = g.h * (0.22 + R() * 0.1);
    const flock = [];
    for (let i = 0; i < 5; i++) {
      const k = i - 2;
      const fx = Math.abs(k) * 7;
      const s = 1.5;
      flock.push(e('path', {
        key: 'f' + i,
        d: 'M ' + fx.toFixed(1) + ' ' + (fy + k * 4).toFixed(1) + ' q ' + s + ' ' + (-s) + ' ' + s * 2 + ' 0 q ' + s + ' ' + (-s) + ' ' + s * 2 + ' 0',
        fill: 'none', stroke: 'rgba(24,18,18,0.5)', strokeWidth: 0.8, strokeLinecap: 'round',
        style: { animation: 'goraFlap ' + (1 + R() * 0.4).toFixed(2) + 's ease-in-out ' + (-R()).toFixed(2) + 's infinite', transformBox: 'fill-box', transformOrigin: 'center' },
      }));
    }
    const fdur = (95 + R() * 40).toFixed(1);
    out.push(e('g', {
      key: 'flock',
      style: {
        '--x0': '-40px', '--x1': (g.w + 40) + 'px',
        animation: 'goraDrift ' + fdur + 's linear ' + (-R() * fdur).toFixed(1) + 's infinite',
      },
    }, flock));
    // падающая звезда
    out.push(e('g', { key: 'shoot', transform: 'translate(' + (g.w * 0.55).toFixed(0) + ',' + (g.h * 0.12).toFixed(0) + ')' },
      e('line', {
        x1: 0, y1: 0, x2: 26, y2: 9,
        stroke: 'rgba(255,244,222,0.85)', strokeWidth: 1, strokeLinecap: 'round',
        style: { animation: 'goraShoot 11s ease-in 2.5s infinite' },
      })));
    return out;
  }

  relief(g, R, e) {
    // косметический рельеф ВНУТРИ силуэта: отроги и полки, сама линия графика не трогается
    const out = [];
    const body = Math.max(6, g.gainKm * g.pxPerKm);
    for (let i = 0; i < 10; i++) {
      const x = g.w * (0.05 + R() * 0.9);
      const top = g.yAt(x);
      const dep = body * (0.08 + R() * 0.16);
      const wdt = dep * (1.4 + R() * 1.6);
      const dir = R() > 0.45 ? 1 : -1;
      const mx = x + dir * wdt * 0.55;
      out.push(e('path', {
        key: 'sp' + i,
        d: 'M ' + x.toFixed(1) + ' ' + (top + 1).toFixed(1) +
          ' Q ' + mx.toFixed(1) + ' ' + (top + dep * 0.45).toFixed(1) + ' ' + (x + dir * wdt).toFixed(1) + ' ' + (top + dep).toFixed(1) +
          ' Q ' + (x + dir * wdt * 0.4).toFixed(1) + ' ' + (top + dep * 0.75).toFixed(1) + ' ' + x.toFixed(1) + ' ' + (top + 1).toFixed(1) + ' Z',
        fill: dir > 0 ? 'rgba(8,12,18,0.13)' : 'rgba(255,226,180,0.05)',
      }));
    }
    for (let i = 0; i < 6; i++) {
      const x = g.w * R();
      const y = g.yAt(x) + 3 + R() * body * 0.5;
      const len = 14 + R() * 46;
      out.push(e('path', {
        key: 'lg' + i,
        d: 'M ' + x.toFixed(1) + ' ' + y.toFixed(1) + ' L ' + (x + len).toFixed(1) + ' ' + (g.yAt(x + len) + (y - g.yAt(x))).toFixed(1),
        fill: 'none', stroke: 'rgba(255,240,214,0.07)', strokeWidth: 1, strokeLinecap: 'round',
      }));
    }
    return out;
  }

  marks(g, e) {
    const list = this.props.marks || [];
    return list.map((m, i) => {
      const x = Math.max(0, Math.min(g.w, (m.at / g.totalD) * g.w));
      const y = g.yAt(x);
      const hh = 13;
      return e('g', { key: 'mk' + i },
        e('line', { x1: x, y1: y, x2: x, y2: y - hh, stroke: '#F2EAE0', strokeWidth: 1, opacity: 0.85 }),
        e('path', { d: 'M ' + x + ' ' + (y - hh) + ' L ' + (x + 9) + ' ' + (y - hh + 3.2) + ' L ' + x + ' ' + (y - hh + 6.4) + ' Z', fill: '#D8452F' }),
        e('circle', { cx: x, cy: y, r: 2.2, fill: '#D8452F', stroke: '#F2EAE0', strokeWidth: 0.7 }));
    });
  }

  sun(v, g, e) {
    const cx = g.w * 0.27;
    const r = Math.max(11, g.h * 0.075);
    const mtn0 = Math.max(14, g.gainKm * g.pxPerKm);
    const cy = Math.max(r * 1.25, g.base - mtn0 * 1.5 - r * 1.15);
    const id = (k) => k + '-' + v;
    const rays = [];
    for (let i = 0; i < 7; i++) {
      const a = (-95 + i * 27) * Math.PI / 180;
      const len = r * (2.6 + (i % 3) * 1.5);
      const wd = r * 0.13;
      rays.push(e('path', {
        key: 'ray' + i,
        d: 'M ' + cx + ' ' + cy + ' L ' + (cx + Math.cos(a) * len - Math.sin(a) * wd) + ' ' + (cy + Math.sin(a) * len + Math.cos(a) * wd) +
          ' L ' + (cx + Math.cos(a) * len + Math.sin(a) * wd) + ' ' + (cy + Math.sin(a) * len - Math.cos(a) * wd) + ' Z',
        fill: 'rgba(255,214,140,0.10)', filter: 'url(#' + id('blur') + ')',
      }));
    }
    return e('g', { key: 'sun' },
      e('ellipse', { cx, cy, rx: r * 9, ry: r * 5.5, fill: 'url(#' + id('glow') + ')' }),
      e('g', { style: { animation: 'goraSunRays 24s linear infinite', transformOrigin: cx.toFixed(1) + 'px ' + cy.toFixed(1) + 'px' } }, rays),
      e('ellipse', { cx, cy, rx: r * 3.4, ry: r * 0.5, fill: 'rgba(255,220,152,0.20)', filter: 'url(#' + id('blur') + ')' }),
      e('circle', { cx, cy, r: r * 1.7, fill: 'rgba(233,197,120,0.20)' }),
      e('circle', { cx, cy, r: r * 1.18, fill: 'rgba(240,208,138,0.35)' }),
      e('circle', { cx, cy, r, fill: '#F6DFA4' }),
      e('circle', { cx, cy: cy - r * 0.12, r: r * 0.62, fill: '#FFF3D2' }),
      v === 'a' ? e('circle', { cx, cy, r: r * 2.2, fill: 'none', stroke: 'rgba(233,197,120,0.35)', strokeWidth: 0.7, strokeDasharray: '1 3' }) : null);
  }

  texture(v, g, R, e) {
    if (v === 'b') return null;
    const out = [];
    const nearRidge = v === 'c';
    const n = nearRidge ? 320 : 460;
    for (let i = 0; i < n; i++) {
      const x = R() * g.w;
      const top = g.yAt(x);
      const depth = nearRidge ? Math.pow(R(), 2.4) * Math.min(26, g.h * 0.14) : Math.pow(R(), 1.7) * (g.base - top);
      const y = top + depth;
      if (y > g.base) continue;
      const km = g.kmOfY(y);
      const light = km > 1.0;
      const r = 0.35 + R() * (light ? 0.7 : 0.55);
      out.push(e('circle', { key: 'd' + i, cx: x, cy: y, r, fill: light ? '#F4FAFF' : '#0C1410', opacity: (light ? 0.5 : 0.42) * (1 - depth / Math.max(1, g.base - top) * 0.6) }));
    }
    const hatch = Math.round(nearRidge ? 26 : 48);
    for (let i = 0; i < hatch; i++) {
      const x = R() * g.w * 0.98;
      const top = g.yAt(x);
      const y = top + 1.5 + Math.pow(R(), 2) * Math.min(g.base - top, nearRidge ? 22 : g.h * 0.2);
      const len = 5 + R() * 14;
      const x2 = Math.min(g.w, x + len);
      const km = g.kmOfY(y);
      out.push(e('line', {
        key: 'h' + i, x1: x, y1: y, x2, y2: g.yAt(x2) + (y - top),
        stroke: km > 1.0 ? 'rgba(255,255,255,0.35)' : 'rgba(10,18,14,0.35)', strokeWidth: 0.55,
      }));
    }
    return out;
  }

  ZONES() { return ['луга', 'камни', 'снег', 'лёд']; }
  MOTIFS() {
    return [
      ['роща', 'озерцо', 'поле', 'ручей', 'валун в кустах'],
      ['осыпь', 'валуны', 'козлы', 'кустарник', 'скальный выступ'],
      ['сугробы', 'карниз', 'вехи', 'заструги', 'ель под снегом'],
      ['сераки', 'трещина', 'ледяные грани', 'ветровой флаг', 'вершинный тур'],
    ];
  }

  zoneOf(km) { return km < 0.5 ? 0 : km < 1.0 ? 1 : km < 1.5 ? 2 : 3; }

  sectorList(g) {
    const M = this.MOTIFS(), Z = this.ZONES();
    const out = [];
    for (let i = 1; i < g.P.length; i++) {
      const a = g.P[i - 1], b = g.P[i];
      const km = g.kmOfY((a.y + b.y) / 2);
      const z = this.zoneOf(km);
      const vr = this._solo != null ? this._solo : (i - 1) % 5;
      out.push({ i: i - 1, a, b, zone: z, zoneName: Z[z], variant: vr, motif: M[z][vr] });
    }
    return out;
  }

  motif(s, R, e, key) {
    // один мотив на сектор: свой для каждой зоны и каждого из 5 вариантов
    const { a, b, zone, variant } = s;
    const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    const run = Math.max(10, b.x - a.x);
    const k = this._solo != null ? 2.8 : Math.max(0.6, Math.min(1.25, run / 34));
    const ang = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
    const p = [];
    const fir = (x, h, fill, snow) => {
      const w = h * 0.36;
      const arr = [e('path', { key: 'f' + x + h, d: 'M ' + x + ' ' + (-h) + ' L ' + (x + w) + ' 0.6 L ' + (x - w) + ' 0.6 Z', fill })];
      if (snow) arr.push(e('path', { key: 's' + x + h, d: 'M ' + x + ' ' + (-h) + ' L ' + (x + w * 0.5) + ' ' + (-h * 0.45) + ' L ' + (x - w * 0.5) + ' ' + (-h * 0.45) + ' Z', fill: 'rgba(248,252,255,0.75)' }));
      return arr;
    };
    if (zone === 0 && variant === 0) {
      p.push(...fir(-6 * k, 11 * k, '#14301E'), ...fir(0, 15 * k, '#0E2617'), ...fir(6 * k, 9 * k, '#173821'));
    } else if (zone === 0 && variant === 1) {
      const rx = 9 * k, ry = 2.4 * k;
      p.push(e('ellipse', { key: 'w', cx: 0, cy: 0, rx, ry, fill: '#22394A' }),
        e('ellipse', { key: 'w2', cx: 0, cy: -ry * 0.2, rx: rx * 0.9, ry: ry * 0.6, fill: '#2E4A58' }),
        e('rect', { key: 'g1', x: -rx * 0.4, y: -ry * 0.35, width: rx * 0.8, height: 0.8, fill: 'rgba(255,216,152,0.55)' }),
        e('rect', { key: 'g2', x: -rx * 0.2, y: ry * 0.25, width: rx * 0.5, height: 0.6, fill: 'rgba(255,216,152,0.32)' }));
    } else if (zone === 0 && variant === 2) {
      for (let i = 0; i < 4; i++) {
        p.push(e('path', { key: 'r' + i, d: 'M ' + (-11 * k) + ' ' + (i * 2.4 - 1) + ' L ' + (11 * k) + ' ' + (i * 2.4 - 1), stroke: i % 2 ? 'rgba(168,200,140,0.32)' : 'rgba(40,70,45,0.34)', strokeWidth: 1.2, fill: 'none' }));
      }
    } else if (zone === 0 && variant === 3) {
      p.push(e('path', {
        key: 'st',
        d: 'M ' + (-9 * k) + ' -2 q ' + 4 * k + ' 3 ' + 6 * k + ' 0 q ' + 3 * k + ' -3 ' + 6 * k + ' 2',
        fill: 'none', stroke: 'rgba(176,214,232,0.55)', strokeWidth: 1.6, strokeLinecap: 'round',
      }), e('path', {
        key: 'st2',
        d: 'M ' + (-9 * k) + ' -2.6 q ' + 4 * k + ' 3 ' + 6 * k + ' 0',
        fill: 'none', stroke: 'rgba(255,236,200,0.4)', strokeWidth: 0.6,
      }));
    } else if (zone === 0 && variant === 4) {
      const s = 4 * k;
      p.push(e('path', { key: 'b', d: 'M ' + (-s) + ' ' + s * 0.4 + ' L ' + (-s * 0.4) + ' ' + (-s * 0.9) + ' L ' + s * 0.8 + ' ' + (-s * 0.4) + ' L ' + s + ' ' + s * 0.4 + ' Z', fill: '#3A3228' }),
        e('path', { key: 'bh', d: 'M ' + (-s * 0.4) + ' ' + (-s * 0.9) + ' L ' + s * 0.8 + ' ' + (-s * 0.4) + ' L ' + (-s) + ' ' + s * 0.4 + ' Z', fill: 'rgba(230,212,180,0.22)' }),
        e('circle', { key: 'q1', cx: -s * 1.6, cy: 0, r: s * 0.5, fill: '#2C3A26' }),
        e('circle', { key: 'q2', cx: s * 1.7, cy: -s * 0.2, r: s * 0.45, fill: '#31402A' }));
    } else if (zone === 1 && variant === 0) {
      for (let i = 0; i < 9; i++) {
        const x = (R() - 0.5) * 20 * k, y = R() * 7 * k;
        const t = 1 + R() * 1.8;
        p.push(e('path', { key: 'sc' + i, d: 'M ' + x + ' ' + (y - t) + ' L ' + (x + t) + ' ' + y + ' L ' + (x - t) + ' ' + (y + t * 0.4) + ' Z', fill: R() > 0.5 ? 'rgba(34,28,22,0.6)' : 'rgba(226,214,192,0.32)' }));
      }
    } else if (zone === 1 && variant === 1) {
      [[-6, 1.15], [5, 0.85]].forEach(([bx, bs], j) => {
        const s = 4.6 * k * bs;
        p.push(e('path', { key: 'bo' + j, d: 'M ' + (bx * k - s) + ' ' + s * 0.45 + ' L ' + (bx * k - s * 0.3) + ' ' + (-s) + ' L ' + (bx * k + s * 0.8) + ' ' + (-s * 0.35) + ' L ' + (bx * k + s) + ' ' + s * 0.45 + ' Z', fill: '#332B22' }),
          e('path', { key: 'bl' + j, d: 'M ' + (bx * k - s * 0.3) + ' ' + (-s) + ' L ' + (bx * k + s * 0.8) + ' ' + (-s * 0.35) + ' L ' + (bx * k - s) + ' ' + s * 0.45 + ' Z', fill: 'rgba(236,220,190,0.20)' }));
      });
    } else if (zone === 1 && variant === 2) {
      [[-5, 1], [4, 0.85]].forEach(([gx, gs], j) => {
        const s = 3.6 * k * gs, x = gx * k;
        p.push(e('g', { key: 'go' + j },
          e('ellipse', { cx: x, cy: -s * 0.9, rx: s * 0.85, ry: s * 0.42, fill: '#2A2119' }),
          e('circle', { cx: x + s * 0.85, cy: -s * 1.25, r: s * 0.3, fill: '#2A2119' }),
          e('path', { d: 'M ' + (x + s * 0.95) + ' ' + (-s * 1.55) + ' q ' + s * 0.5 + ' ' + (-s * 0.5) + ' ' + s * 0.15 + ' ' + (-s * 0.85), fill: 'none', stroke: '#2A2119', strokeWidth: 0.8, strokeLinecap: 'round' }),
          e('path', { d: 'M ' + (x - s * 0.5) + ' ' + (-s * 0.5) + ' L ' + (x - s * 0.55) + ' 0 M ' + (x + s * 0.5) + ' ' + (-s * 0.5) + ' L ' + (x + s * 0.45) + ' 0', stroke: '#2A2119', strokeWidth: 0.8 })));
      });
    } else if (zone === 1 && variant === 3) {
      for (let i = 0; i < 3; i++) {
        const x = (i - 1) * 7 * k, s = (1.8 + R() * 1.4) * k;
        p.push(e('g', { key: 'bu' + i },
          e('circle', { cx: x - s * 0.6, cy: 0, r: s * 0.7, fill: '#2C3A26' }),
          e('circle', { cx: x + s * 0.5, cy: -s * 0.15, r: s * 0.6, fill: '#31402A' }),
          e('circle', { cx: x, cy: -s * 0.55, r: s * 0.62, fill: '#3A4A30' })));
      }
    } else if (zone === 1 && variant === 4) {
      const w = 11 * k, h = 6 * k;
      p.push(e('path', { key: 'cl', d: 'M ' + (-w) + ' 1 L ' + (-w * 0.55) + ' ' + (-h) + ' L ' + w * 0.2 + ' ' + (-h * 0.8) + ' L ' + w + ' 1 Z', fill: '#2B2520' }),
        e('path', { key: 'cl2', d: 'M ' + (-w * 0.55) + ' ' + (-h) + ' L ' + w * 0.2 + ' ' + (-h * 0.8) + ' L ' + (-w) + ' 1 Z', fill: 'rgba(240,222,190,0.18)' }),
        e('path', { key: 'cl3', d: 'M ' + (-w * 0.55) + ' ' + (-h) + ' L ' + w * 0.2 + ' ' + (-h * 0.8), stroke: 'rgba(255,226,180,0.4)', strokeWidth: 0.7, fill: 'none' }));
    } else if (zone === 2 && variant === 0) {
      for (let i = 0; i < 3; i++) {
        const x = (i - 1) * 8 * k, rx = (3.5 + R() * 3) * k;
        p.push(e('path', { key: 'dr' + i, d: 'M ' + (x - rx) + ' 0 q ' + rx * 0.5 + ' ' + (-rx * 0.65) + ' ' + rx + ' ' + (-rx * 0.12) + ' q ' + rx * 0.55 + ' ' + rx * 0.22 + ' ' + rx + ' ' + rx * 0.12 + ' Z', fill: 'rgba(248,253,255,0.45)' }));
      }
    } else if (zone === 2 && variant === 1) {
      const w = 12 * k;
      p.push(e('path', { key: 'co', d: 'M ' + (-w) + ' 0 Q ' + (-w * 0.2) + ' ' + (-6 * k) + ' ' + w + ' ' + (-2.4 * k) + ' Q ' + w * 0.3 + ' ' + (-1 * k) + ' ' + (-w) + ' 0 Z', fill: 'rgba(250,254,255,0.72)' }),
        e('path', { key: 'co2', d: 'M ' + w + ' ' + (-2.4 * k) + ' q ' + (-3 * k) + ' ' + 3 * k + ' ' + (-6 * k) + ' ' + 2 * k, fill: 'none', stroke: 'rgba(174,206,230,0.5)', strokeWidth: 0.8 }));
    } else if (zone === 2 && variant === 2) {
      for (let i = 0; i < 4; i++) {
        const x = (i - 1.5) * 6.5 * k;
        p.push(e('g', { key: 'po' + i },
          e('line', { x1: x, y1: 0, x2: x + 0.6, y2: -8 * k, stroke: '#2A2219', strokeWidth: 1 }),
          e('rect', { x: x + 0.4, y: -8 * k, width: 3.4 * k, height: 2 * k, fill: 'rgba(240,226,196,0.7)' })));
      }
    } else if (zone === 2 && variant === 3) {
      for (let i = 0; i < 5; i++) {
        const y = -i * 1.9 * k;
        p.push(e('path', { key: 'za' + i, d: 'M ' + (-11 * k) + ' ' + y + ' q ' + 5 * k + ' ' + (-1.6 * k) + ' ' + 10 * k + ' 0 q ' + 5 * k + ' ' + 1.6 * k + ' ' + 10 * k + ' 0', fill: 'none', stroke: 'rgba(255,255,255,0.32)', strokeWidth: 0.9 }));
      }
    } else if (zone === 2 && variant === 4) {
      p.push(...fir(0, 15 * k, '#16241E', true),
        e('ellipse', { key: 'sn', cx: 0, cy: 1, rx: 8 * k, ry: 2 * k, fill: 'rgba(248,253,255,0.55)' }));
    } else if (zone === 3 && variant === 0) {
      [[-6, 1], [0, 1.4], [6, 0.8]].forEach(([sx, ss], j) => {
        const w = 3.2 * k * ss, h = 8 * k * ss;
        p.push(e('path', { key: 'se' + j, d: 'M ' + (sx * k - w) + ' 0 L ' + (sx * k - w * 0.5) + ' ' + (-h) + ' L ' + (sx * k + w * 0.7) + ' ' + (-h * 0.85) + ' L ' + (sx * k + w) + ' 0 Z', fill: 'rgba(226,244,255,0.55)', stroke: 'rgba(255,255,255,0.4)', strokeWidth: 0.4 }));
      });
    } else if (zone === 3 && variant === 1) {
      const w = 12 * k;
      p.push(e('path', { key: 'cr', d: 'M ' + (-w) + ' 0 L ' + (-w * 0.2) + ' ' + (-3 * k) + ' L ' + w + ' ' + (-1 * k) + ' L ' + w * 0.3 + ' ' + 1.6 * k + ' Z', fill: '#123047' }),
        e('path', { key: 'cr2', d: 'M ' + (-w) + ' 0 L ' + (-w * 0.2) + ' ' + (-3 * k) + ' L ' + w + ' ' + (-1 * k), fill: 'none', stroke: 'rgba(255,255,255,0.75)', strokeWidth: 1 }));
    } else if (zone === 3 && variant === 2) {
      for (let i = 0; i < 5; i++) {
        const x = (R() - 0.5) * 20 * k, y = (R() - 0.4) * 5 * k, s = (2 + R() * 3.5) * k;
        p.push(e('path', { key: 'ic' + i, d: 'M ' + x + ' ' + (y - s) + ' L ' + (x + s * 1.1) + ' ' + (y + s * 0.2) + ' L ' + (x + s * 0.3) + ' ' + (y + s * 0.9) + ' L ' + (x - s * 0.9) + ' ' + (y + s * 0.1) + ' Z', fill: R() > 0.45 ? 'rgba(255,255,255,0.42)' : 'rgba(150,196,228,0.3)', stroke: 'rgba(255,255,255,0.3)', strokeWidth: 0.4 }));
      }
    } else if (zone === 3 && variant === 3) {
      for (let i = 0; i < 4; i++) {
        const y = -2 * k - i * 2.6 * k;
        p.push(e('path', { key: 'pl' + i, d: 'M ' + (-4 * k) + ' ' + y + ' q ' + 7 * k + ' ' + (-2 * k) + ' ' + 15 * k + ' ' + (-1 * k), fill: 'none', stroke: 'rgba(255,255,255,' + (0.5 - i * 0.09).toFixed(2) + ')', strokeWidth: 1, strokeLinecap: 'round' }));
      }
    } else {
      const s = 3 * k;
      p.push(e('path', { key: 'ca', d: 'M ' + (-s) + ' 0 L 0 ' + (-s * 2.4) + ' L ' + s + ' 0 Z', fill: '#2E2A2E' }),
        e('path', { key: 'ca2', d: 'M 0 ' + (-s * 2.4) + ' L ' + s + ' 0 L ' + (-s * 0.2) + ' 0 Z', fill: 'rgba(236,240,250,0.35)' }),
        e('line', { key: 'po', x1: 0, y1: -s * 2.4, x2: 0, y2: -s * 4.4, stroke: '#F2EAE0', strokeWidth: 0.9 }),
        e('path', { key: 'fl', d: 'M 0 ' + (-s * 4.4) + ' L ' + s * 2.2 + ' ' + (-s * 3.8) + ' L 0 ' + (-s * 3.2) + ' Z', fill: '#D8452F' }));
    }
    if (this._solo != null) {
      p.unshift(e('ellipse', { key: 'spot', cx: 0, cy: -6 * k, rx: 26 * k, ry: 13 * k, fill: 'rgba(255,238,206,0.10)' }),
        e('ellipse', { key: 'spot2', cx: 0, cy: -3 * k, rx: 16 * k, ry: 8 * k, fill: 'rgba(255,242,214,0.10)' }));
    }
    return e('g', { key, transform: 'translate(' + cx.toFixed(1) + ',' + (cy + 2.2).toFixed(1) + ') rotate(' + ang.toFixed(1) + ')' }, p);
  }

  sectorArt(g, R, e, cur) {
    const list = this.sectorList(g);
    const out = [];
    list.forEach((s) => {
      if (s.b.x - s.a.x < 4) return;
      out.push(this.motif(s, R, e, 'mo' + s.i));
    });
    if (cur != null && list[cur]) {
      const s = list[cur];
      const solo = this._solo != null;
      out.push(e('g', { key: 'cur' },
        solo ? null : e('path', {
          d: 'M ' + s.a.x.toFixed(1) + ' ' + s.a.y.toFixed(1) + ' L ' + s.b.x.toFixed(1) + ' ' + s.b.y.toFixed(1) +
            ' L ' + s.b.x.toFixed(1) + ' ' + (g.base + 4) + ' L ' + s.a.x.toFixed(1) + ' ' + (g.base + 4) + ' Z',
          fill: 'rgba(255,226,170,0.13)',
        }),
        e('line', { x1: s.a.x, y1: s.a.y, x2: s.b.x, y2: s.b.y, stroke: '#FFE3AE', strokeWidth: 2, strokeLinecap: 'round' }),
        e('circle', { cx: s.b.x, cy: s.b.y, r: 2.6, fill: '#FFE3AE' })));
    }
    return out;
  }

  flora(v, g, R, e) {
    const out = [];
    const solo = this._solo != null;
    const treeTop = solo ? -1 : Math.min(0.5, g.gainKm * 0.92);
    const scale = Math.max(0.65, Math.min(1.7, g.pxPerKm / 118));
    const step = Math.max(2.6, g.w / 130);
    let i = 0;
    for (let x = step * 0.6; x < g.w; x += step) {
      i++;
      const y = g.yAt(x);
      const km = g.kmOfY(y);
      if (km > treeTop) continue;
      const dens = treeTop > 0.001 ? 1 - km / treeTop : 0.06;
      if (R() > 0.18 + dens * 0.8) continue;
      const hh = (4.5 + R() * 5) * scale;
      const bw = hh * 0.36;
      const dpath = 'M ' + x.toFixed(1) + ' ' + (y - hh).toFixed(1) + ' L ' + (x + bw).toFixed(1) + ' ' + (y + 0.6).toFixed(1) + ' L ' + (x - bw).toFixed(1) + ' ' + (y + 0.6).toFixed(1) + ' Z';
      const dark = this.mix('#0A1A12', '#1E3A24', R() * 0.7);
      if (v === 'a') {
        out.push(e('g', { key: 't' + i },
          e('path', { d: dpath, fill: '#0B1710', opacity: 0.9 }),
          e('line', { x1: x, y1: y - hh * 0.85, x2: x, y2: y + 0.6, stroke: 'rgba(230,214,180,0.30)', strokeWidth: 0.5 })));
      } else if (v === 'c') {
        out.push(e('g', { key: 't' + i },
          e('path', { d: dpath, fill: dark, opacity: 0.88 }),
          e('path', { d: 'M ' + x.toFixed(1) + ' ' + (y - hh).toFixed(1) + ' L ' + (x - bw).toFixed(1) + ' ' + (y + 0.6).toFixed(1), fill: 'none', stroke: 'rgba(255,222,170,0.28)', strokeWidth: 0.5 })));
      } else {
        out.push(e('path', { key: 't' + i, d: dpath, fill: dark, opacity: 0.62 + R() * 0.22 }));
      }
    }
    // трава на нижней зоне
    const grassTop = Math.min(0.16, g.gainKm * 0.5);
    if (v !== 'b') {
      for (let k = 0; k < 90; k++) {
        const x = R() * g.w;
        const y = g.yAt(x) + R() * 6;
        if (g.kmOfY(y) > grassTop) continue;
        const l = 1.8 + R() * 3;
        out.push(e('line', { key: 'gr' + k, x1: x, y1: y, x2: x + (R() - 0.5) * 2, y2: y - l, stroke: 'rgba(150,190,140,0.35)', strokeWidth: 0.5 }));
      }
    }
    // осыпи / камни во второй зоне
    for (let k = 0; k < (solo ? 0 : 70); k++) {
      const x = R() * g.w;
      const y = g.yAt(x) + Math.pow(R(), 1.6) * 22;
      const km = g.kmOfY(y);
      if (km < 0.5 || km > 1.05) continue;
      const s = 0.8 + R() * (v === 'b' ? 2.6 : 1.8);
      out.push(v === 'b'
        ? e('ellipse', { key: 'r' + k, cx: x, cy: y, rx: s * 1.6, ry: s, fill: R() > 0.5 ? 'rgba(40,34,26,0.35)' : 'rgba(215,200,178,0.22)' })
        : e('path', { key: 'r' + k, d: 'M ' + x + ' ' + (y - s) + ' L ' + (x + s) + ' ' + y + ' L ' + (x - s * 0.7) + ' ' + (y + s * 0.6) + ' Z', fill: R() > 0.5 ? 'rgba(30,26,20,0.5)' : 'rgba(226,214,192,0.3)' }));
    }
    // снежные шапки выше 1 км
    for (let k = 0; k < (solo ? 0 : 60); k++) {
      const x = R() * g.w;
      const y = g.yAt(x) + Math.pow(R(), 1.5) * 30;
      const km = g.kmOfY(y);
      if (km < 1.0 || km > 1.5) continue;
      const rx = 2 + R() * 7;
      out.push(e('ellipse', { key: 'sn' + k, cx: x, cy: y, rx, ry: rx * 0.42, fill: 'rgba(246,251,255,' + (0.35 + R() * 0.45).toFixed(2) + ')' }));
    }
    // лёд выше 1.5 км — гранёные плоскости и холодные тени
    for (let k = 0; k < (solo ? 0 : 90); k++) {
      const x = R() * g.w;
      const y = g.yAt(x) + Math.pow(R(), 1.5) * 40;
      if (g.kmOfY(y) < 1.5 || y > g.base) continue;
      const s = 2 + R() * 6;
      const facet = 'M ' + x.toFixed(1) + ' ' + (y - s).toFixed(1) + ' L ' + (x + s * 1.1).toFixed(1) + ' ' + (y + s * 0.2).toFixed(1) +
        ' L ' + (x + s * 0.3).toFixed(1) + ' ' + (y + s * 0.9).toFixed(1) + ' L ' + (x - s * 0.9).toFixed(1) + ' ' + (y + s * 0.1).toFixed(1) + ' Z';
      out.push(e('path', {
        key: 'ice' + k, d: facet,
        fill: R() > 0.45 ? 'rgba(255,255,255,' + (0.35 + R() * 0.45).toFixed(2) + ')' : 'rgba(150,196,228,' + (0.20 + R() * 0.28).toFixed(2) + ')',
        stroke: 'rgba(255,255,255,0.35)', strokeWidth: 0.4,
      }));
    }
    // ЗОНА 1 — озёра на пологих полках, полосы полей
    for (let i = 1; i < g.P.length; i++) {
      const a = g.P[i - 1], b = g.P[i];
      const run = b.x - a.x;
      if (run < 8) continue;
      const slope = Math.abs((b.y - a.y) / run);
      const km = g.kmOfY(b.y);
      if (slope > 0.12 || km > 0.5 || true) continue;
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2 + 1.5;
      const rx = Math.min(run * 0.42, 26), ry = Math.max(1.6, rx * 0.16);
      out.push(e('g', { key: 'lk' + i },
        e('ellipse', { cx, cy, rx, ry, fill: '#243B4A', opacity: 0.85 }),
        e('ellipse', { cx, cy: cy - ry * 0.15, rx: rx * 0.9, ry: ry * 0.6, fill: 'rgba(230,190,130,0.30)' }),
        e('ellipse', { cx: cx - rx * 0.35, cy: cy + ry * 0.2, rx: rx * 0.28, ry: ry * 0.3, fill: 'rgba(255,232,190,0.22)' })));
    }
    for (let i = 0; i < 16; i++) {
      const x = R() * g.w;
      const y = g.yAt(x) + 3 + R() * 14;
      if (g.kmOfY(y) > 0.42) continue;
      const len = 14 + R() * 40;
      out.push(e('path', {
        key: 'fld' + i,
        d: 'M ' + x.toFixed(1) + ' ' + y.toFixed(1) + ' L ' + (x + len).toFixed(1) + ' ' + (g.yAt(x + len) + (y - g.yAt(x))).toFixed(1),
        fill: 'none', stroke: R() > 0.5 ? 'rgba(168,200,140,0.16)' : 'rgba(40,70,45,0.22)', strokeWidth: 1.4,
      }));
    }
    // ЗОНА 2 — редкие валуны фоном
    for (let i = 0; i < (solo ? 0 : 5); i++) {
      const x = R() * g.w;
      const y = g.yAt(x) + 2 + R() * 16;
      const km = g.kmOfY(y);
      if (km < 0.5 || km > 1.0) continue;
      const s = 2.5 + R() * 4;
      out.push(e('g', { key: 'bld' + i },
        e('path', { d: 'M ' + (x - s) + ' ' + (y + s * 0.5) + ' L ' + (x - s * 0.5) + ' ' + (y - s * 0.8) + ' L ' + (x + s * 0.7) + ' ' + (y - s * 0.4) + ' L ' + (x + s) + ' ' + (y + s * 0.5) + ' Z', fill: 'rgba(38,32,25,0.72)' }),
        e('path', { d: 'M ' + (x - s * 0.5) + ' ' + (y - s * 0.8) + ' L ' + (x + s * 0.7) + ' ' + (y - s * 0.4) + ' L ' + (x - s) + ' ' + (y + s * 0.5) + ' Z', fill: 'rgba(226,206,172,0.16)' })));
    }
    for (let i = 0; i < (solo ? 0 : 8); i++) {
      const x = R() * g.w;
      const y = g.yAt(x) + 1 + R() * 12;
      const km = g.kmOfY(y);
      if (km < 0.42 || km > 1.0) continue;
      const s = 1.6 + R() * 2.2;
      out.push(e('g', { key: 'bsh' + i, opacity: 0.75 },
        e('circle', { cx: x - s * 0.6, cy: y, r: s * 0.7, fill: '#2C3A26' }),
        e('circle', { cx: x + s * 0.5, cy: y - s * 0.15, r: s * 0.6, fill: '#31402A' }),
        e('circle', { cx: x, cy: y - s * 0.55, r: s * 0.62, fill: '#3A4A30' })));
    }
    if (false) {
      for (let i = 0; i < 3; i++) {
        const x = g.w * (0.15 + R() * 0.75);
        const y = g.yAt(x) - 0.5;
        const km = g.kmOfY(y);
        if (km < 0.5 || km > 1.05) continue;
        const s = 3.4;
        out.push(e('g', { key: 'goat' + i, opacity: 0.9 },
          e('ellipse', { cx: x, cy: y - s * 0.9, rx: s * 0.85, ry: s * 0.45, fill: '#2A2119' }),
          e('circle', { cx: x + s * 0.85, cy: y - s * 1.25, r: s * 0.32, fill: '#2A2119' }),
          e('path', { d: 'M ' + (x + s * 0.95) + ' ' + (y - s * 1.55) + ' q ' + s * 0.5 + ' ' + (-s * 0.5) + ' ' + s * 0.15 + ' ' + (-s * 0.85), fill: 'none', stroke: '#2A2119', strokeWidth: 0.8, strokeLinecap: 'round' }),
          e('path', { d: 'M ' + (x - s * 0.5) + ' ' + (y - s * 0.5) + ' L ' + (x - s * 0.55) + ' ' + y + ' M ' + (x + s * 0.5) + ' ' + (y - s * 0.5) + ' L ' + (x + s * 0.45) + ' ' + y, stroke: '#2A2119', strokeWidth: 0.8 })));
      }
    }
    // ЗОНА 3 — редкие сугробы и метель
    for (let i = 0; i < (solo ? 0 : 10); i++) {
      const x = R() * g.w;
      const y = g.yAt(x) + 1 + R() * 18;
      const km = g.kmOfY(y);
      if (km < 0.95 || km > 1.6) continue;
      const rx = 2 + R() * 5;
      out.push(e('path', {
        key: 'drf' + i,
        d: 'M ' + (x - rx) + ' ' + y + ' q ' + rx * 0.5 + ' ' + (-rx * 0.55) + ' ' + rx + ' ' + (-rx * 0.12) + ' q ' + rx * 0.55 + ' ' + rx * 0.22 + ' ' + rx + ' ' + rx * 0.12 + ' Z',
        fill: 'rgba(248,253,255,' + (0.35 + R() * 0.4).toFixed(2) + ')',
      }));
    }
    if (g.gainKm > 0.9) {
      for (let i = 0; i < 26; i++) {
        const x = R() * g.w;
        const top = Math.max(g.yAt(x), g.yOfKm(1.6));
        const y = top + R() * Math.max(6, g.yOfKm(1.0) - top);
        if (y < g.yAt(x) || y > g.base) continue;
        const len = 5 + R() * 12;
        const dur = (2.2 + R() * 3).toFixed(2);
        out.push(e('line', {
          key: 'blz' + i, x1: x, y1: y, x2: x + len, y2: y + len * 0.32,
          stroke: 'rgba(255,255,255,0.45)', strokeWidth: 0.7, strokeLinecap: 'round',
          style: { animation: 'goraBlizzard ' + dur + 's linear ' + (-R() * 4).toFixed(2) + 's infinite' },
        }));
      }
    }
    return out;
  }

  scene(v, sectors, w) {
    this._v = v;
    const e = React.createElement;
    const g = this.geo(sectors, w);
    const R = this.rnd(v === 'a' ? 7 : v === 'b' ? 21 : 43);
    const id = (k) => k + '-' + v;
    const showStars = this.props.showStars ?? true;
    const animate = this.props.animate ?? true;
    const kids = [];
    kids.push(this.defsFor(v, g, e));
    kids.push(e('rect', { key: 'skyr', x: 0, y: 0, width: g.w, height: g.h, fill: 'url(#' + id('sky') + ')' }));
    if (showStars) kids.push(e('g', { key: 'stars' }, this.stars(v, g, R, e)));
    kids.push(this.sun(v, g, e));
    kids.push(this.bgRidge(g, R, e, 'bg0', 0.15));
    kids.push(this.bgRidge(g, R, e, 'bg1', 0.55));
    kids.push(e('g', { key: 'cl0' }, this.clouds(v, g, R, e, 0)));
    kids.push(e('g', { key: 'cl1' }, this.clouds(v, g, R, e, 1)));
    kids.push(e('g', { key: 'birds' }, this.birds(g, R, e)));
    kids.push(e('g', { key: 'cl2' }, this.clouds(v, g, R, e, 2)));
    kids.push(e('rect', { key: 'fogband', x: 0, y: g.h * 0.55, width: g.w, height: g.h * 0.45, fill: 'url(#' + id('fog') + ')', opacity: 0.7 }));

    const mtn = [
      e('g', { key: 'fill', clipPath: 'url(#' + id('mtn') + ')' },
        e('path', { d: this.mtnPath(g), fill: 'url(#' + id('ter') + ')' }),
        e('g', null, this.texture(v, g, R, e)),
        e('g', null, this.relief(g, R, e)),
        e('path', { d: this.mtnPath(g), fill: 'url(#' + id('shade') + ')' })),
      e('g', { key: 'flora' }, this.flora(v, g, R, e)),
      e('g', { key: 'sect' }, this.sectorArt(g, R, e, this._solo != null ? 0 : this.state.cur)),
      e('path', { key: 'rim', d: this.ridge(g), fill: 'none', stroke: 'rgba(255,225,175,0.42)', strokeWidth: v === 'a' ? 1 : 1.4, strokeLinejoin: 'round' }),
    ];
    kids.push(animate
      ? e('g', { key: 'reveal', clipPath: 'url(#' + id('rev') + ')' }, mtn)
      : e('g', { key: 'reveal' }, mtn));

    // дымка в низинах — объёмная, ползёт вдоль подножия
    kids.push(e('g', { key: 'lake' }, this.valleyLake(g, R, e)));
    kids.push(e('g', { key: 'haze' }, this.fog(g, R, e)));
    kids.push(e('g', { key: 'pts' }, g.P.map((p, i) => e('circle', { key: i, cx: p.x, cy: p.y, r: 2, fill: '#fff', opacity: 0.28 }))));
    kids.push(e('g', { key: 'marks' }, this.marks(g, e)));

    return e('svg', {
      key: v + this.state.animKey, width: w, height: g.h, viewBox: '0 0 ' + w + ' ' + g.h,
      style: { display: 'block' }, role: 'img',
    }, kids);
  }

  valleyLake(g, R, e) {
    // озеро в низине с отражением рассвета — вне графика, у левого края
    const mtn = Math.max(10, g.gainKm * g.pxPerKm);
    const cx = g.w * 0.17, cy = g.base - mtn * 0.012;
    const rx = g.w * 0.2, ry = Math.max(2.4, mtn * 0.045);
    const sunX = g.w * 0.27;
    const out = [e('ellipse', { key: 'w', cx, cy, rx, ry, fill: '#1E2E3C', opacity: 0.9 }),
      e('ellipse', { key: 'w2', cx, cy: cy - ry * 0.2, rx: rx * 0.94, ry: ry * 0.7, fill: '#26404F', opacity: 0.8 })];
    for (let i = 0; i < 7; i++) {
      const t = i / 6;
      const yy = cy - ry * 0.75 + ry * 1.5 * t;
      const half = rx * 0.9 * Math.sqrt(Math.max(0, 1 - Math.pow((yy - cy) / ry, 2)));
      const wl = Math.min(half, (2.5 + R() * 7) * (1 - t * 0.4));
      out.push(e('rect', {
        key: 'r' + i, x: Math.max(cx - half, sunX - wl), y: yy, width: wl * 2, height: 0.9 + R() * 0.7,
        fill: 'rgba(255,214,150,' + (0.30 - t * 0.16).toFixed(2) + ')', rx: 0.5,
      }));
    }
    out.push(e('ellipse', { key: 'rim', cx, cy, rx, ry, fill: 'none', stroke: 'rgba(226,208,178,0.20)', strokeWidth: 0.7 }));
    return out;
  }

  fog(g, R, e) {
    // клубящиеся пласты тумана у подножия: те же принципы, что у облаков
    const out = [];
    const mtn = Math.max(10, g.gainKm * g.pxPerKm);
    for (let b = 0; b < 4; b++) {
      const cy = g.base - mtn * (0.02 + b * 0.055);
      const rx = g.w * (0.13 + b * 0.035);
      const bry = Math.max(1.6, mtn * 0.02 + b * 0.6);
      const kids = [];
      const n = 6 + Math.floor(R() * 3);
      const blobs = [e('ellipse', { key: 'base', cx: 0, cy: 0, rx, ry: bry })];
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n - 0.5;
        const pr = rx * (0.05 + R() * 0.05);
        blobs.push(e('ellipse', { key: 'p' + i, cx: t * rx * 1.8, cy: -pr * (0.1 + R() * 0.25), rx: pr, ry: pr * (0.4 + R() * 0.25) }));
      }
      kids.push(e('g', { key: 'm', fill: b % 2 === 0 ? 'rgba(240,222,196,0.09)' : 'rgba(222,208,204,0.07)', filter: 'url(#blur-' + (this._v || 'c') + ')' }, blobs));
      const dur = (70 + b * 26 + R() * 30).toFixed(1);
      out.push(e('g', {
        key: 'fg' + b,
        style: {
          '--x0': (-rx * 2).toFixed(1) + 'px', '--x1': (g.w + rx * 2).toFixed(1) + 'px',
          animation: 'goraDrift ' + dur + 's linear ' + (-R() * dur).toFixed(1) + 's infinite',
        },
      }, e('g', { transform: 'translate(0,' + cy.toFixed(1) + ')' },
        e('g', { style: { animation: 'goraPuff ' + (16 + R() * 10).toFixed(1) + 's ease-in-out ' + (-R() * 14).toFixed(1) + 's infinite', transformBox: 'fill-box', transformOrigin: 'center' } }, kids))));
    }
    return out;
  }

  ridge(g) {
    let p = 'M ' + g.P[0].x.toFixed(2) + ' ' + g.P[0].y.toFixed(2);
    for (let i = 1; i < g.P.length; i++) p += ' L ' + g.P[i].x.toFixed(2) + ' ' + g.P[i].y.toFixed(2);
    p += ' L ' + g.w.toFixed(2) + ' ' + g.P[g.P.length - 1].y.toFixed(2);
    return p;
  }


}

export default function ClimbMountain(props) {
  const { sectors = [], width = 390 } = props;
  const styleRef = useRef(false);
  if (typeof document !== 'undefined' && !styleRef.current) {
    styleRef.current = true;
    if (!document.getElementById('climb-mountain-keyframes')) {
      const tag = document.createElement('style');
      tag.id = 'climb-mountain-keyframes';
      tag.textContent = KEYFRAMES;
      document.head.appendChild(tag);
    }
  }
  return useMemo(() => {
    if (!sectors.length) return null;
    const scene = new MountainScene(props);
    return scene.scene(props.look || 'c', sectors, width);
  }, [JSON.stringify(sectors), width, props.look, props.showStars, props.animate, props.highlightSector, JSON.stringify(props.marks || [])]);
}
