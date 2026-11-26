// Share images (canvas → PNG): 1:1 feed, 4:5 portrait, 9:16 story; map / route / transparent sticker / stats card.
// Input is a PublicActivity ONLY — its route is already privacy-trimmed and sanitised (privacy.publicRoute), so the
// image can never show hidden points. Map tiles: OpenStreetMap (CORS-enabled, attribution drawn on the image).
import { keyStats, type ImageStyle, type PublicActivity, type Ratio } from './share';
import { fitRoute, layoutFor, tilesFor, OSM_TILE, OSM_ATTRIBUTION, type Fit } from './shareLayout';
import type { Units } from './types';

const Y = '#FFE600', BG = '#0a0a0a';
const HEAD = "'Anton', Impact, 'Arial Narrow', sans-serif", BODY = "'Inter', system-ui, sans-serif", MONO = "'JetBrains Mono', ui-monospace, monospace";

async function fontsReady() {
  try { await Promise.all([document.fonts.load(`64px ${HEAD}`), document.fonts.load(`600 28px ${BODY}`), document.fonts.load(`24px ${MONO}`)]); } catch { /* system fallback */ }
}
function loadImg(url: string, ms = 7000): Promise<HTMLImageElement | null> {
  return new Promise((res) => {
    const im = new Image(); im.crossOrigin = 'anonymous'; im.referrerPolicy = 'strict-origin-when-cross-origin';
    const t = window.setTimeout(() => res(null), ms);
    im.onload = () => { window.clearTimeout(t); res(im); }; im.onerror = () => { window.clearTimeout(t); res(null); };
    im.src = url;
  });
}
/** Night-mode the OSM tiles: invert, desaturate, darken, slight blue tint. */
function darken(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const img = ctx.getImageData(0, 0, W, H), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = 255 - d[i], g = 255 - d[i + 1], b = 255 - d[i + 2];
    const L = 0.299 * r + 0.587 * g + 0.114 * b;
    d[i] = (L * 0.75 + r * 0.25) * 0.42; d[i + 1] = (L * 0.75 + g * 0.25) * 0.44; d[i + 2] = (L * 0.75 + b * 0.25) * 0.55;
  }
  ctx.putImageData(img, 0, 0);
}
function bgGrid(ctx: CanvasRenderingContext2D, W: number, H: number) {
  ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(W * 0.5, H * 0.35, 40, W * 0.5, H * 0.35, Math.max(W, H) * 0.8);
  g.addColorStop(0, '#1d1b05'); g.addColorStop(1, BG);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(255,255,255,0.045)'; ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 54) { ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); ctx.stroke(); }
  for (let y = 0; y <= H; y += 54) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); ctx.stroke(); }
}
function drawRoute(ctx: CanvasRenderingContext2D, fit: Fit, sticker: boolean) {
  const path = () => { ctx.beginPath(); for (const s of fit.points) s.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); };
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (sticker) { path(); ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 22; ctx.stroke(); }
  path(); ctx.shadowColor = 'rgba(255,230,0,0.65)'; ctx.shadowBlur = 28; ctx.strokeStyle = Y; ctx.lineWidth = 12; ctx.stroke();
  ctx.shadowBlur = 0; path(); ctx.strokeStyle = '#fff7a8'; ctx.lineWidth = 3.5; ctx.globalAlpha = 0.55; ctx.stroke(); ctx.globalAlpha = 1;
  const first = fit.points.find((s) => s.length)?.[0], lastSeg = [...fit.points].reverse().find((s) => s.length), last = lastSeg?.[lastSeg.length - 1];
  for (const [p, c] of [[first, '#ffffff'], [last, Y]] as const) if (p) { ctx.beginPath(); ctx.arc(p[0], p[1], 13, 0, Math.PI * 2); ctx.fillStyle = BG; ctx.fill(); ctx.beginPath(); ctx.arc(p[0], p[1], 8, 0, Math.PI * 2); ctx.fillStyle = c; ctx.fill(); }
}
function logo(ctx: CanvasRenderingContext2D, x: number, y: number, s = 1) {
  const r = 14 * s, sz = 56 * s;
  ctx.fillStyle = Y; ctx.beginPath(); ctx.roundRect(x, y, sz, sz, r); ctx.fill();
  ctx.fillStyle = BG; ctx.font = `${38 * s}px ${HEAD}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('H', x + sz / 2, y + sz / 2 + 2 * s);
  ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.font = `${46 * s}px ${HEAD}`; ctx.fillText('HYBRD', x + sz + 16 * s, y + sz / 2 + 3 * s);
}
function fitText(ctx: CanvasRenderingContext2D, text: string, max: number, size: number, font: (px: number) => string) {
  let px = size; ctx.font = font(px);
  while (ctx.measureText(text).width > max && px > size * 0.55) { px -= 2; ctx.font = font(px); }
  let t = text; while (ctx.measureText(t).width > max && t.length > 4) t = t.slice(0, -2);
  return t === text ? t : t.replace(/\s*\S?$/, '') + '…';
}

export interface ShareImageOpts { ratio: Ratio; style: ImageStyle; units: Units; author?: string }
export interface Rendered { blob: Blob; url: string; w: number; h: number; usedMap: boolean; points: number }

/** Render a share image. Pass only publicActivity() output. */
export async function renderShareImage(a: PublicActivity, o: ShareImageOpts): Promise<Rendered> {
  await fontsReady();
  const L = layoutFor(o.ratio);
  const { W, H } = L;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  const route = o.style === 'stats' ? null : a.route;
  const sticker = o.style === 'transparent';
  const fit = route ? fitRoute(route, W, H, 30, L.route) : null;
  let usedMap = false;
  if (!sticker) {
    if (o.style === 'map' && fit?.bounds) {
      const tiles = tilesFor(fitRoute(route!, W, H, 30, L.route), W, H);
      const imgs = await Promise.all(tiles.map((t) => loadImg(OSM_TILE(t))));
      const ok = imgs.filter(Boolean).length;
      if (tiles.length && ok / tiles.length > 0.7) {
        ctx.fillStyle = '#d9d9d9'; ctx.fillRect(0, 0, W, H);
        tiles.forEach((t, i) => { const im = imgs[i]; if (im) ctx.drawImage(im, t.dx, t.dy, t.size + 0.5, t.size + 0.5); });
        try { darken(ctx, W, H); usedMap = true; } catch { usedMap = false; }
      }
      if (!usedMap) bgGrid(ctx, W, H);
    } else bgGrid(ctx, W, H);
    // readability: fade to black behind the stats, and at the top behind the logo
    const g = ctx.createLinearGradient(0, L.statsY - 220, 0, H); g.addColorStop(0, 'rgba(10,10,10,0)'); g.addColorStop(0.35, 'rgba(10,10,10,0.88)'); g.addColorStop(1, 'rgba(10,10,10,0.98)');
    ctx.fillStyle = g; ctx.fillRect(0, L.statsY - 220, W, H - L.statsY + 220);
    const g2 = ctx.createLinearGradient(0, 0, 0, L.logoY + 160); g2.addColorStop(0, 'rgba(10,10,10,0.85)'); g2.addColorStop(1, 'rgba(10,10,10,0)');
    ctx.fillStyle = g2; ctx.fillRect(0, 0, W, L.logoY + 160);
  }
  if (fit && fit.points.length) drawRoute(ctx, fit, sticker);
  else if (o.style !== 'stats' && !sticker && a.mapHidden) {
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = `600 30px ${BODY}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Map hidden for privacy', W / 2, L.route.y + L.route.h / 2);
  }
  if (sticker) { ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 16; }
  logo(ctx, 70, L.logoY);
  // stats block
  const x = 70, maxW = W - 140;
  let y = o.style === 'stats' ? Math.round(H * (o.ratio === 'story' ? 0.36 : 0.3)) : L.statsY;
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = Y; ctx.font = `500 26px ${MONO}`;
  const when = new Date(a.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  ctx.fillText(`${a.label.toUpperCase()} · ${when.toUpperCase()}`, x, y); y += 22;
  const title = fitText(ctx, a.title.toUpperCase(), maxW, o.style === 'stats' ? 110 : 84, (px) => `${px}px ${HEAD}`);
  const tpx = parseInt(ctx.font, 10); ctx.fillStyle = '#fff'; ctx.fillText(title, x, y + tpx); y += tpx + 46;
  const ks = keyStats(a, o.units);
  const cols = ks.length > 3 ? 4 : Math.min(3, ks.length) || 1; // 1080 px wide in every ratio, so 4 fit in one row
  const colW = maxW / cols;
  ks.forEach((k, i) => {
    const cx = x + (i % cols) * colW, cy = y + Math.floor(i / cols) * 170;
    ctx.fillStyle = '#8a8a8a'; ctx.font = `500 24px ${MONO}`; ctx.fillText(k.label.toUpperCase(), cx, cy + 24);
    ctx.fillStyle = '#fff'; const vpx = cols === 4 ? 76 : 92; ctx.font = `${vpx}px ${HEAD}`; ctx.fillText(k.value, cx, cy + 24 + vpx + 8);
    if (k.unit) { const vw = ctx.measureText(k.value).width; ctx.fillStyle = '#bdbdbd'; ctx.font = `600 28px ${BODY}`; ctx.fillText(k.unit, cx + vw + 8, cy + 24 + vpx + 6); }
    if (i % cols) { ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(cx - 18, cy + 4, 2, 120); }
  });
  y += Math.ceil(ks.length / cols) * 170;
  if (o.style === 'stats' && a.lifts?.length) {
    ctx.font = `600 30px ${BODY}`; ctx.fillStyle = '#d4d4d4';
    a.lifts.slice(0, o.ratio === 'square' ? 3 : 6).forEach((l, i) => ctx.fillText(`${l.name} — ${l.sets} set${l.sets === 1 ? '' : 's'}`, x, y + 20 + i * 48));
  }
  ctx.shadowBlur = 0;
  // footer
  ctx.fillStyle = sticker ? 'rgba(255,255,255,0.85)' : '#6b6b6b'; ctx.font = `500 22px ${MONO}`; ctx.textAlign = 'left';
  ctx.fillText(o.author ? `@${o.author}`.toUpperCase() : 'TRAIN · TRACK · FUEL', x, L.safeBottom);
  if (usedMap) { ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = `500 18px ${BODY}`; ctx.fillText(OSM_ATTRIBUTION, W - 24, H - 22); }
  const blob: Blob = await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not create the image'))), 'image/png'));
  const pts = fit ? fit.points.reduce((s, p) => s + p.length, 0) : 0;
  (window as unknown as { __hybrdLastShare?: unknown }).__hybrdLastShare = { points: route ? route.flat() : [], style: o.style, ratio: o.ratio, usedMap };
  return { blob, url: URL.createObjectURL(blob), w: W, h: H, usedMap, points: pts };
}
