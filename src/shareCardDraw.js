// Рисует картинку «Поделиться» на canvas: вертикальная 1080×1920, как сторис.
// Обычная вёрстка в картинку в iOS WebView снимается ненадёжно, поэтому всё рисуем
// сами. Шрифты те же, что в приложении; кириллицы в Space Grotesk нет, она берётся
// из запасного, как и на экранах.

import { THEME_2A as T } from './theme.js';
import { QR_MATRIX, BOT_ADDRESS } from './shareQr.js';

export const CARD_W = 1080;
export const CARD_H = 1920;

const MARGIN = 80;
const CONTENT_W = CARD_W - MARGIN * 2;
const FONT = '"Space Grotesk", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const MONO = '"JetBrains Mono", "SF Mono", Menlo, Consolas, monospace';
const QR_MODULE = 6;
const QR_QUIET = 4;
const FONT_WAIT_MS = 1500;

const fontOf = (weight, size, family = FONT) => `${weight} ${size}px ${family}`;

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function ellipsize(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxW) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

function wrapLines(ctx, text, maxW, maxLines) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  words.forEach((w) => {
    const next = cur ? `${cur} ${w}` : w;
    if (cur && ctx.measureText(next).width > maxW) { lines.push(cur); cur = w; } else cur = next;
  });
  if (cur) lines.push(cur);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = ellipsize(ctx, lines.slice(maxLines - 1).join(' '), maxW);
  return kept;
}

// Наибольший размер шрифта, при котором текст влезает в ширину.
function fitSize(ctx, text, weight, maxSize, minSize, maxW, family) {
  let size = maxSize;
  while (size > minSize) {
    ctx.font = fontOf(weight, size, family);
    if (ctx.measureText(text).width <= maxW) break;
    size -= 2;
  }
  ctx.font = fontOf(weight, size, family);
  return size;
}

function drawBackground(ctx) {
  ctx.fillStyle = T.BG;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  const glow = ctx.createRadialGradient(CARD_W * 0.92, 90, 0, CARD_W * 0.92, 90, 1000);
  glow.addColorStop(0, 'rgba(199,154,78,0.24)');
  glow.addColorStop(1, 'rgba(199,154,78,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  // Сетка треугольников, как на фоне приложения: ярче внизу, к верхней трети гаснет.
  const step = 54;
  const shift = 15;
  const half = 5;
  const rows = Math.ceil(CARD_H / step);
  for (let k = 0; k < rows; k += 1) {
    const y = CARD_H - step / 2 - step * k;
    const alpha = 0.12 * Math.max(0, 1 - (CARD_H - y) / (CARD_H * 0.66));
    if (alpha <= 0) break;
    ctx.fillStyle = `rgba(242,235,221,${alpha.toFixed(3)})`;
    const offset = (step / 2 + shift * k) % step;
    for (let x = offset - step; x < CARD_W + step; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, y - 5);
      ctx.lineTo(x - half, y + 4);
      ctx.lineTo(x + half, y + 4);
      ctx.closePath();
      ctx.fill();
    }
  }
}

function brassGradient(ctx, x0, x1) {
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, T.ACCENT);
  g.addColorStop(0.5, '#F5E3AE');
  g.addColorStop(1, T.ACCENT);
  return g;
}

function drawHeader(ctx, data) {
  ctx.textAlign = 'left';
  ctx.font = fontOf(500, 36, MONO);
  ctx.fillStyle = T.ACCENT_SOFT;
  ctx.fillText(String(data.date).toUpperCase(), MARGIN, 150);
  ctx.font = fontOf(700, 104);
  const lines = wrapLines(ctx, data.title, CONTENT_W, 2);
  ctx.fillStyle = T.TEXT;
  let y = 270;
  lines.forEach((line) => { ctx.fillText(line, MARGIN, y); y += 118; });
  return y - 118;
}

function drawStats(ctx, stats, top) {
  if (!stats.length) return top;
  const gap = 20;
  const h = 196;
  const w = (CONTENT_W - gap * (stats.length - 1)) / stats.length;
  stats.forEach((st, i) => {
    const x = MARGIN + i * (w + gap);
    roundedRect(ctx, x, top, w, h, 28);
    ctx.fillStyle = 'rgba(23,21,18,0.92)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = T.BORDER;
    ctx.stroke();
    ctx.textAlign = 'center';
    fitSize(ctx, st.value, 700, 68, 36, w - 36);
    ctx.fillStyle = T.TEXT;
    ctx.fillText(st.value, x + w / 2, top + 100);
    ctx.font = fontOf(500, 30);
    ctx.fillStyle = T.TEXT_DIM;
    ctx.fillText(ellipsize(ctx, st.label, w - 24), x + w / 2, top + 152);
  });
  ctx.textAlign = 'left';
  return top + h;
}

function drawHighlights(ctx, hl, top) {
  if (!hl) return top;
  let y = top;
  ctx.font = fontOf(500, 30, MONO);
  ctx.fillStyle = T.ACCENT_SOFT;
  ctx.fillText(String(hl.label).toUpperCase(), MARGIN, y);
  y += 72;
  // Размер — общий на весь список: лучше чуть мельче, чем одна строка в два этажа.
  const fits = (row, size) => {
    ctx.font = fontOf(700, size, MONO);
    const valueW = row.value ? ctx.measureText(row.value).width + 36 : 0;
    ctx.font = fontOf(500, size);
    return ctx.measureText(row.name).width <= CONTENT_W - valueW;
  };
  let size = 42;
  while (size > 34 && !hl.rows.every((row) => fits(row, size))) size -= 1;
  hl.rows.forEach((row) => {
    const inline = fits(row, size);
    ctx.font = fontOf(500, size);
    ctx.fillStyle = T.TEXT;
    ctx.fillText(ellipsize(ctx, row.name, CONTENT_W), MARGIN, y);
    if (row.value) {
      if (!inline) y += 54;
      ctx.font = fontOf(700, size, MONO);
      ctx.fillStyle = T.ACCENT_SOFT;
      ctx.textAlign = inline ? 'right' : 'left';
      ctx.fillText(row.value, inline ? CARD_W - MARGIN : MARGIN, y);
      ctx.textAlign = 'left';
    }
    y += 76;
  });
  return y;
}

function drawFooter(ctx, data) {
  const n = QR_MATRIX.length;
  const size = (n + QR_QUIET * 2) * QR_MODULE;
  const qx = CARD_W - MARGIN - size;
  const qy = CARD_H - MARGIN - size;
  roundedRect(ctx, qx, qy, size, size, 18);
  ctx.fillStyle = T.TEXT;
  ctx.fill();
  ctx.fillStyle = T.BG;
  QR_MATRIX.forEach((row, r) => {
    for (let c = 0; c < n; c += 1) {
      if (row[c] === '1') ctx.fillRect(qx + (c + QR_QUIET) * QR_MODULE, qy + (r + QR_QUIET) * QR_MODULE, QR_MODULE, QR_MODULE);
    }
  });
  const textW = qx - MARGIN - 32;
  fitSize(ctx, data.appName, 700, 46, 30, textW);
  ctx.fillStyle = T.TEXT;
  ctx.fillText(data.appName, MARGIN, qy + 118);
  fitSize(ctx, BOT_ADDRESS, 500, 34, 22, textW, MONO);
  ctx.fillStyle = T.ACCENT_SOFT;
  ctx.fillText(BOT_ADDRESS, MARGIN, qy + 170);
  return qy;
}

// Фраза — над подвалом: снизу вверх, сколько бы строк ни заняла.
function drawPhrase(ctx, phrase, bottom) {
  ctx.font = fontOf(700, 74);
  const lines = wrapLines(ctx, phrase, CONTENT_W, 3);
  const lineH = 88;
  ctx.fillStyle = brassGradient(ctx, MARGIN, CARD_W - MARGIN);
  let y = bottom - 76 - lineH * (lines.length - 1);
  lines.forEach((line) => { ctx.fillText(line, MARGIN, y); y += lineH; });
}

async function loadFonts() {
  if (!document.fonts || !document.fonts.load) return;
  const wanted = Promise.all([
    document.fonts.load(fontOf(700, 104), 'Aa1'),
    document.fonts.load(fontOf(500, 36), 'Aa1'),
    document.fonts.load(fontOf(500, 36, MONO), 'Аa1'),
    document.fonts.load(fontOf(700, 42, MONO), 'Аa1'),
  ]);
  await Promise.race([wanted, new Promise((ok) => { setTimeout(ok, FONT_WAIT_MS); })]);
}

export async function renderShareCard(data) {
  await loadFonts();
  const canvas = document.createElement('canvas');
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d');
  ctx.textBaseline = 'alphabetic';
  drawBackground(ctx);
  const titleEnd = drawHeader(ctx, data);
  const statsEnd = drawStats(ctx, data.stats, titleEnd + 64);
  drawHighlights(ctx, data.highlights, statsEnd + 96);
  const footerTop = drawFooter(ctx, data);
  drawPhrase(ctx, data.phrase, footerTop);
  return canvas;
}

export function canvasToJpeg(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('toBlob'))), 'image/jpeg', 0.92);
  });
}
