// Share-image geometry (pure, tested): Web-Mercator projection, fitting a route into a box, which map tiles cover
// it, and where things go on each image ratio. Only ever given privacy-trimmed points (see privacy.publicRoute).
import type { Ratio } from './share';
import { RATIOS } from './share';

export interface Rect { x: number; y: number; w: number; h: number }
export interface LL { lat: number; lng: number }
const MAXLAT = 85.05112878;
/** World pixel coordinates at zoom z (256-px tiles). */
export function worldPx(lat: number, lng: number, z: number): [number, number] {
  const s = 256 * 2 ** z;
  const la = Math.max(-MAXLAT, Math.min(MAXLAT, lat));
  const sin = Math.sin((la * Math.PI) / 180);
  return [((lng + 180) / 360) * s, (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * s];
}
export interface Fit {
  points: [number, number][][];
  bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number } | null;
  zoom: number; scale: number; ox: number; oy: number;
}
/** Fit segments inside `area` (with padding), returning canvas coordinates. */
export function fitRoute(segs: LL[][], w: number, h: number, pad = 60, area?: Rect, maxZoom = 17): Fit {
  const A = area ?? { x: 0, y: 0, w, h };
  const flat = segs.flat();
  if (!flat.length) return { points: [], bounds: null, zoom: 0, scale: 1, ox: 0, oy: 0 };
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const p of flat) { minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat); minLng = Math.min(minLng, p.lng); maxLng = Math.max(maxLng, p.lng); }
  const [x0, y1] = worldPx(minLat, minLng, 0), [x1, y0] = worldPx(maxLat, maxLng, 0);
  const sx = Math.max(1e-12, x1 - x0), sy = Math.max(1e-12, y1 - y0);
  const zoom = Math.min(maxZoom, Math.log2(Math.max(1, A.w - 2 * pad) / sx), Math.log2(Math.max(1, A.h - 2 * pad) / sy));
  const scale = 2 ** zoom;
  const ox = A.x + A.w / 2 - ((x0 + x1) / 2) * scale, oy = A.y + A.h / 2 - ((y0 + y1) / 2) * scale;
  const points = segs.map((s) => s.map((p) => { const [x, y] = worldPx(p.lat, p.lng, 0); return [x * scale + ox, y * scale + oy] as [number, number]; }));
  return { points, bounds: { minLat, maxLat, minLng, maxLng }, zoom, scale, ox, oy };
}
export interface Tile { z: number; x: number; y: number; dx: number; dy: number; size: number }
/** Map tiles (integer zoom ≤ the fit zoom, each drawn up to 2× larger) that cover the canvas. */
export function tilesFor(fit: Fit, w: number, h: number, maxTiles = 60): Tile[] {
  if (!fit.bounds) return [];
  let z = Math.max(0, Math.min(19, Math.floor(fit.zoom)));
  for (;;) {
    const size = 256 * 2 ** (fit.zoom - z);
    // canvas (cx,cy) ↔ world@0 (cx-ox)/scale; tile index at z = world@0 * 2^z / 256
    const t0x = Math.floor((-fit.ox / fit.scale) * 2 ** z / 256), t0y = Math.floor((-fit.oy / fit.scale) * 2 ** z / 256);
    const t1x = Math.floor(((w - fit.ox) / fit.scale) * 2 ** z / 256), t1y = Math.floor(((h - fit.oy) / fit.scale) * 2 ** z / 256);
    const count = (t1x - t0x + 1) * (t1y - t0y + 1);
    if (count > maxTiles && z > 0) { z--; continue; }
    const out: Tile[] = []; const n = 2 ** z;
    for (let ty = t0y; ty <= t1y; ty++) for (let tx = t0x; tx <= t1x; tx++) {
      if (ty < 0 || ty >= n) continue;
      out.push({ z, x: ((tx % n) + n) % n, y: ty, dx: (tx * 256 / 2 ** z) * fit.scale + fit.ox, dy: (ty * 256 / 2 ** z) * fit.scale + fit.oy, size });
    }
    return out;
  }
}
export interface Layout { W: number; H: number; route: Rect; statsY: number; logoY: number; safeBottom: number }
/** Where the route and the stats go, per ratio. Story keeps clear of Instagram's top and bottom UI. */
export function layoutFor(ratio: Ratio): Layout {
  const { w: W, h: H } = RATIOS[ratio];
  if (ratio === 'story') return { W, H, route: { x: 70, y: 300, w: W - 140, h: 860 }, statsY: 1230, logoY: 190, safeBottom: H - 230 };
  if (ratio === 'portrait') return { W, H, route: { x: 70, y: 150, w: W - 140, h: 720 }, statsY: 930, logoY: 70, safeBottom: H - 60 };
  return { W, H, route: { x: 70, y: 140, w: W - 140, h: 500 }, statsY: 690, logoY: 70, safeBottom: H - 56 };
}
export const OSM_TILE = (t: Pick<Tile, 'z' | 'x' | 'y'>) => `https://tile.openstreetmap.org/${t.z}/${t.x}/${t.y}.png`;
export const OSM_ATTRIBUTION = '© OpenStreetMap contributors';
