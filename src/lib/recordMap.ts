// Pure logic for the map-first Record screen (no DOM, no map library) — tested in tools/test-record-map.ts.
import type { RoutePoint, Units, WorkoutType } from './types';
import { distUnit, fmtTime, haversine, paceSec, speedUnit, toDist, toSpeed } from './calc';

export type LatLng = { lat: number; lng: number };
export type GpsSport = 'run' | 'walk' | 'cycle';
export const GPS_SPORTS: GpsSport[] = ['run', 'walk', 'cycle'];
export const isGpsSport = (t: string): t is GpsSport => (GPS_SPORTS as string[]).includes(t);
export const SPORT_LABEL: Record<GpsSport, string> = { run: 'Run', walk: 'Walk', cycle: 'Ride' };
export const SPORT_ICON: Record<GpsSport, string> = { run: 'run', walk: 'walk', cycle: 'bike' };

// ---------- live stats (the floating card) ----------
export interface CardStats {
  time: string;
  distance: string; distUnit: string;
  /** Avg. pace for run/walk, Avg. speed for rides */
  rateLabel: 'Avg. pace' | 'Avg. speed';
  rate: string; rateUnit: string;
}
/** Pace as m:ss per unit, or a placeholder when there isn't enough distance / it's slower than 59:59. */
export function fmtPaceShort(secPerUnit: number) { return secPerUnit > 0 && secPerUnit < 3600 ? fmtTime(secPerUnit) : '--:--'; }
export function cardStats(type: WorkoutType, elapsedSec: number, distanceM: number, u: Units): CardStats {
  const sec = Math.max(0, elapsedSec), m = Math.max(0, distanceM);
  const bike = type === 'cycle' || type === 'indoor-cycle';
  const base = { time: fmtTime(sec), distance: toDist(m, u).toFixed(2), distUnit: distUnit(u) };
  if (bike) return { ...base, rateLabel: 'Avg. speed', rate: sec > 0 && m > 0 ? toSpeed(m / sec, u).toFixed(1) : '0.0', rateUnit: speedUnit(u) };
  return { ...base, rateLabel: 'Avg. pace', rate: fmtPaceShort(paceSec(sec, m, u)), rateUnit: `/${distUnit(u)}` };
}
/** Current pace (sec per metre, from the recorder) → per-unit string, or speed for rides. */
export function currentRate(type: WorkoutType, secPerM: number, u: Units) {
  const bike = type === 'cycle' || type === 'indoor-cycle';
  if (!secPerM || secPerM <= 0) return bike ? '0.0' : '--:--';
  if (bike) return toSpeed(1 / secPerM, u).toFixed(1);
  return fmtPaceShort(secPerM * (u === 'imperial' ? 1609.344 : 1000));
}
/** Distance with unit, for "to go" chips: switches to ft / m below 0.1 mi / 0.1 km. */
export function fmtShortDist(m: number, u: Units) {
  const v = Math.max(0, m);
  if (u === 'imperial') return v < 160.9 ? `${Math.round(v * 3.280839895)} ft` : `${(v / 1609.344).toFixed(2)} mi`;
  return v < 100 ? `${Math.round(v)} m` : `${(v / 1000).toFixed(2)} km`;
}

// ---------- GPS quality ----------
export type GpsQuality = 'off' | 'searching' | 'weak' | 'ok' | 'good';
export function gpsQuality(acc: number | null | undefined, denied = false): GpsQuality {
  if (denied) return 'off';
  if (acc == null || !isFinite(acc)) return 'searching';
  if (acc <= 10) return 'good';
  if (acc <= 25) return 'ok';
  return 'weak';
}

// ---------- screen state machine ----------
export type Phase = 'idle' | 'recording' | 'autopaused' | 'paused' | 'finishing';
export type PhaseEvent = 'start' | 'pause' | 'resume' | 'autopause' | 'automove' | 'finish' | 'cancel' | 'save' | 'discard';
const T: Record<Phase, Partial<Record<PhaseEvent, Phase>>> = {
  idle: { start: 'recording' },
  recording: { pause: 'paused', autopause: 'autopaused', finish: 'finishing' },
  autopaused: { automove: 'recording', pause: 'paused', finish: 'finishing' },
  paused: { resume: 'recording', finish: 'finishing', discard: 'idle' },
  finishing: { cancel: 'paused', resume: 'recording', save: 'idle', discard: 'idle' },
};
/** Returns the next phase, or the same phase if the event isn't allowed there. */
export const nextPhase = (p: Phase, e: PhaseEvent): Phase => T[p][e] ?? p;
export const phaseOf = (status: 'idle' | 'recording' | 'paused', autoPaused: boolean, finishing: boolean): Phase =>
  finishing ? 'finishing' : status === 'idle' ? 'idle' : status === 'paused' ? 'paused' : autoPaused ? 'autopaused' : 'recording';
export interface Controls { primary: 'start' | 'pause' | 'resume'; primaryLabel: string; showFinish: boolean; canChangeSport: boolean; follow: boolean; side: boolean }
export function controlsFor(p: Phase): Controls {
  switch (p) {
    case 'idle': return { primary: 'start', primaryLabel: 'Start', showFinish: false, canChangeSport: true, follow: false, side: true };
    case 'recording': case 'autopaused': return { primary: 'pause', primaryLabel: 'Pause', showFinish: false, canChangeSport: false, follow: true, side: true };
    case 'paused': case 'finishing': return { primary: 'resume', primaryLabel: 'Resume', showFinish: true, canChangeSport: false, follow: false, side: false };
  }
}

// ---------- geometry ----------
const R = 6371000, RAD = Math.PI / 180;
/** Local planar metres around a reference latitude (fine for the few-km spans used here). */
function xy(p: LatLng, lat0: number) { return { x: p.lng * RAD * R * Math.cos(lat0 * RAD), y: p.lat * RAD * R }; }
export function bearing(a: LatLng, b: LatLng) {
  const φ1 = a.lat * RAD, φ2 = b.lat * RAD, dλ = (b.lng - a.lng) * RAD;
  const y = Math.sin(dλ) * Math.cos(φ2), x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dλ);
  return (Math.atan2(y, x) / RAD + 360) % 360;
}
/** Heading from the last points of a track that are at least minM apart (null if not moving enough). */
export function trackHeading(segments: RoutePoint[][], minM = 8): number | null {
  const seg = segments[segments.length - 1] || [];
  if (seg.length < 2) return null;
  const last = seg[seg.length - 1];
  for (let i = seg.length - 2; i >= 0; i--) if (haversine(seg[i], last) >= minM) return bearing(seg[i], last);
  return null;
}
export function pathLength(pts: LatLng[]) { let d = 0; for (let i = 1; i < pts.length; i++) d += haversine(pts[i - 1], pts[i]); return d; }
export function cumulative(pts: LatLng[]) { const c = [0]; for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + haversine(pts[i - 1], pts[i])); return c; }
/** Polygon ring approximating a circle of radius m (for the GPS accuracy halo). */
export function circleRing(c: LatLng, m: number, n = 48): [number, number][] {
  const out: [number, number][] = [];
  const dLat = m / (R * RAD), dLng = dLat / Math.max(0.01, Math.cos(c.lat * RAD));
  for (let i = 0; i <= n; i++) { const a = (i / n) * 2 * Math.PI; out.push([c.lng + dLng * Math.cos(a), c.lat + dLat * Math.sin(a)]); }
  return out;
}
/** Drops points closer than minM to the previous kept point and caps the count (keeps first/last). */
export function simplify(pts: LatLng[], minM = 5, max = 2500): LatLng[] {
  if (pts.length <= 2) return pts.map((p) => ({ lat: p.lat, lng: p.lng }));
  let out: LatLng[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) if (haversine(out[out.length - 1], pts[i]) >= minM) out.push(pts[i]);
  out.push(pts[pts.length - 1]);
  if (out.length > max) { const step = out.length / max; const k: LatLng[] = []; for (let i = 0; i < max - 1; i++) k.push(out[Math.floor(i * step)]); k.push(out[out.length - 1]); out = k; }
  return out.map((p) => ({ lat: Math.round(p.lat * 1e6) / 1e6, lng: Math.round(p.lng * 1e6) / 1e6 }));
}

// ---------- planned routes & following ----------
export interface PlannedRoute { id: string; name: string; points: LatLng[]; distanceM: number; source: 'drawn' | 'file' | 'activity'; sport?: GpsSport; createdAt: number }
export function makeRoute(name: string, pts: LatLng[], source: PlannedRoute['source'], id = `pr-${Date.now().toString(36)}`, sport?: GpsSport): PlannedRoute {
  const points = simplify(pts, source === 'drawn' ? 0 : 4);
  return { id, name: name.trim().slice(0, 60) || 'Route', points, distanceM: Math.round(pathLength(points)), source, sport, createdAt: Date.now() };
}
export const flatten = (segs: RoutePoint[][] | LatLng[][]): LatLng[] => segs.flat().map((p) => ({ lat: p.lat, lng: p.lng }));

export interface Projection { alongM: number; offM: number; idx: number }
/** Closest point on the route polyline to p, searching only segments whose span overlaps [fromM, toM]. */
export function project(pts: LatLng[], cum: number[], p: LatLng, fromM = -Infinity, toM = Infinity): Projection | null {
  if (pts.length < 2) return pts.length ? { alongM: 0, offM: haversine(pts[0], p), idx: 0 } : null;
  const lat0 = p.lat, P = xy(p, lat0);
  let best: Projection | null = null;
  for (let i = 0; i < pts.length - 1; i++) {
    if (cum[i + 1] < fromM || cum[i] > toM) continue;
    const A = xy(pts[i], lat0), B = xy(pts[i + 1], lat0);
    const vx = B.x - A.x, vy = B.y - A.y, L2 = vx * vx + vy * vy;
    let t = L2 ? ((P.x - A.x) * vx + (P.y - A.y) * vy) / L2 : 0;
    t = Math.max(0, Math.min(1, t));
    const qx = A.x + t * vx - P.x, qy = A.y + t * vy - P.y;
    const off = Math.sqrt(qx * qx + qy * qy);
    if (!best || off < best.offM - 0.01) best = { alongM: cum[i] + t * (cum[i + 1] - cum[i]), offM: off, idx: i };
  }
  return best;
}
export interface FollowState { alongM: number; remainingM: number; offM: number; onRoute: boolean; done: boolean; pct: number }
export const ON_ROUTE_M = 40;
/** Every segment's closest point to p (along-route distance + how far off). */
export function projectAll(pts: LatLng[], cum: number[], p: LatLng): Projection[] {
  const out: Projection[] = [];
  if (pts.length < 2) { if (pts.length) out.push({ alongM: 0, offM: haversine(pts[0], p), idx: 0 }); return out; }
  const P = xy(p, p.lat);
  for (let i = 0; i < pts.length - 1; i++) {
    const A = xy(pts[i], p.lat), B = xy(pts[i + 1], p.lat);
    const vx = B.x - A.x, vy = B.y - A.y, L2 = vx * vx + vy * vy;
    const t = L2 ? Math.max(0, Math.min(1, ((P.x - A.x) * vx + (P.y - A.y) * vy) / L2)) : 0;
    const qx = A.x + t * vx - P.x, qy = A.y + t * vy - P.y;
    out.push({ alongM: cum[i] + t * (cum[i + 1] - cum[i]), offM: Math.sqrt(qx * qx + qy * qy), idx: i });
  }
  return out;
}
/**
 * Progress along a route given the athlete's position and previous progress. Among the route legs within
 * ON_ROUTE_M, it takes the nearest one AHEAD of the last progress (−30 m … +600 m), so out-and-back, figure-8 and
 * hairpin routes don't jump to the wrong leg. If none is ahead it falls back to the closest leg anywhere (joining a
 * route mid-way); off the route, progress is held.
 */
export function followStep(route: { points: LatLng[]; cum?: number[] }, p: LatLng, prevAlong = 0): FollowState {
  const pts = route.points, cum = route.cum || cumulative(pts), total = cum[cum.length - 1] || 0;
  const cands = projectAll(pts, cum, p);
  if (!cands.length) return { alongM: 0, remainingM: total, offM: Infinity, onRoute: false, done: false, pct: 0 };
  const near = cands.filter((c) => c.offM <= ON_ROUTE_M);
  const ahead = near.filter((c) => c.alongM >= prevAlong - 30 && c.alongM <= prevAlong + 600);
  const closest = cands.reduce((a, b) => (b.offM < a.offM ? b : a));
  let along = prevAlong, off = closest.offM, onRoute = false;
  if (ahead.length) {
    // nearest leg first; among legs about as close (overlapping), the one with the least progress ahead
    const best = Math.min(...ahead.map((c) => c.offM));
    const pick = ahead.filter((c) => c.offM <= best + 8).reduce((a, b) => (b.alongM < a.alongM ? b : a));
    along = Math.max(pick.alongM, prevAlong - 25); off = pick.offM; onRoute = true;
  } else if (near.length) {
    along = Math.max(closest.alongM, prevAlong - 25); onRoute = true;
  }
  const remaining = Math.max(0, total - along);
  return { alongM: along, remainingM: remaining, offM: off, onRoute, done: onRoute && remaining < 30, pct: total ? Math.min(1, along / total) : 0 };
}
/** Replays a whole recorded track against a route (used on load / after a restore). */
export function followTrack(route: { points: LatLng[] }, segments: LatLng[][]): FollowState | null {
  const cum = cumulative(route.points); let st: FollowState | null = null;
  for (const seg of segments) for (const p of seg) st = followStep({ points: route.points, cum }, p, st?.alongM ?? 0);
  return st;
}

// ---------- personal heat ("Your streets") ----------
export interface HeatFeature { type: 'Feature'; properties: { count: number; t: number }; geometry: { type: 'LineString'; coordinates: [number, number][] } }
export interface Heat { type: 'FeatureCollection'; features: HeatFeature[]; activities: number; maxCount: number; cells: number }
/**
 * Aggregates saved GPS tracks into a personal heat layer. The map is split into ~cellM grid cells; each cell counts
 * how many DIFFERENT activities passed through it (running a street 10 times glows brighter than once, and one
 * long loop can't inflate its own street). Each track is then drawn along its real path, piece by piece, coloured by
 * the count of the cell it's in — so lines follow the streets instead of the grid.
 * Separate track segments (GPS gaps the recorder split) are never bridged.
 */
export function buildHeat(routes: { id: string; segments: LatLng[][] }[], cellM = 20): Heat {
  const all = routes.filter((r) => r.segments.some((s) => s.length > 1));
  if (!all.length) return { type: 'FeatureCollection', features: [], activities: 0, maxCount: 0, cells: 0 };
  let lat0 = 0, n = 0;
  for (const r of all) for (const s of r.segments) for (const p of s) { lat0 += p.lat; n++; }
  lat0 /= n;
  const dLat = cellM / (R * RAD), dLng = dLat / Math.max(0.05, Math.cos(lat0 * RAD));
  const key = (p: LatLng) => `${Math.round(p.lat / dLat)},${Math.round(p.lng / dLng)}`;
  // densified, lightly simplified copies of every segment
  const dense = all.map((r) => ({ id: r.id, segs: r.segments.filter((s) => s.length > 1).map((s) => {
    const sp = simplify(s, Math.min(4, cellM / 4), 20000), out: LatLng[] = [sp[0]];
    for (let i = 1; i < sp.length; i++) { const a = sp[i - 1], b = sp[i]; const k = Math.min(400, Math.floor(haversine(a, b) / (cellM * 0.5))); for (let j = 1; j <= k; j++) { const f = j / (k + 1); out.push({ lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f }); } out.push(b); }
    return out;
  }) }));
  const cells = new Map<string, Set<string>>();
  for (const r of dense) for (const s of r.segs) for (const p of s) { const k = key(p); let set = cells.get(k); if (!set) cells.set(k, (set = new Set())); set.add(r.id); }
  let max = 0; for (const v of cells.values()) max = Math.max(max, v.size);
  const features: HeatFeature[] = [];
  const t = (c: number) => (max > 1 ? (c - 1) / (max - 1) : 1);
  for (const r of dense) for (const s of r.segs) {
    let run: [number, number][] = [], runC = -1;
    for (let i = 1; i < s.length; i++) {
      const a = s[i - 1], b = s[i], mid = { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
      const c = cells.get(key(mid))?.size ?? cells.get(key(b))?.size ?? 1;
      if (c !== runC) {
        if (run.length > 1) features.push({ type: 'Feature', properties: { count: runC, t: t(runC) }, geometry: { type: 'LineString', coordinates: run } });
        run = [[a.lng, a.lat]]; runC = c;
      }
      run.push([b.lng, b.lat]);
    }
    if (run.length > 1) features.push({ type: 'Feature', properties: { count: runC, t: t(runC) }, geometry: { type: 'LineString', coordinates: run } });
  }
  features.sort((a, b) => a.properties.count - b.properties.count); // brightest drawn last
  return { type: 'FeatureCollection', features, activities: all.length, maxCount: max, cells: cells.size };
}

// ---------- bounds / fallback projection ----------
export function boundsOf(pts: LatLng[]): [[number, number], [number, number]] | null {
  if (!pts.length) return null;
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const p of pts) { w = Math.min(w, p.lng); e = Math.max(e, p.lng); s = Math.min(s, p.lat); n = Math.max(n, p.lat); }
  return [[w, s], [e, n]];
}

// ---------- saved prefs + planned routes (device only) ----------
export type MapStyleId = 'dark' | 'standard' | 'satellite';
export interface MapPrefs { style: MapStyleId; threeD: boolean; heat: boolean; heatAll: boolean; showPlan: boolean }
export const DEFAULT_PREFS: MapPrefs = { style: 'dark', threeD: false, heat: false, heatAll: false, showPlan: true };
const PREFS = 'hybrd:recmap', ROUTES = 'hybrd:planned-routes', ACTIVE = 'hybrd:planned-active';
type KV = { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void };
const ls = (): KV | null => { try { return (globalThis as unknown as { localStorage?: KV }).localStorage || null; } catch { return null; } };
export function loadPrefs(store: KV | null = ls()): MapPrefs {
  try { const j = JSON.parse(store?.getItem(PREFS) || 'null'); if (j && typeof j === 'object') return { ...DEFAULT_PREFS, ...j, style: ['dark', 'standard', 'satellite'].includes(j.style) ? j.style : 'dark' }; } catch { /* ignore */ }
  return { ...DEFAULT_PREFS };
}
export function savePrefs(p: MapPrefs, store: KV | null = ls()) { try { store?.setItem(PREFS, JSON.stringify(p)); } catch { /* full */ } }
export const MAX_ROUTES = 40;
export function loadRoutes(store: KV | null = ls()): PlannedRoute[] {
  try { const j = JSON.parse(store?.getItem(ROUTES) || '[]'); return Array.isArray(j) ? j.filter((r) => r && Array.isArray(r.points) && r.points.length > 1) : []; } catch { return []; }
}
export function saveRoutes(rs: PlannedRoute[], store: KV | null = ls()) {
  const keep = [...rs].sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_ROUTES);
  try { store?.setItem(ROUTES, JSON.stringify(keep)); } catch { /* full */ }
  return keep;
}
export function loadActive(store: KV | null = ls()): PlannedRoute | null {
  try { const j = JSON.parse(store?.getItem(ACTIVE) || 'null'); return j && Array.isArray(j.points) && j.points.length > 1 ? j : null; } catch { return null; }
}
export function saveActive(r: PlannedRoute | null, store: KV | null = ls()) { try { if (r) store?.setItem(ACTIVE, JSON.stringify(r)); else store?.removeItem(ACTIVE); } catch { /* full */ } }
export const layerCount = (p: MapPrefs, hasPlan: boolean) => (p.heat ? 1 : 0) + (hasPlan && p.showPlan ? 1 : 0) + (p.threeD ? 1 : 0);

// ---------- route files (planned routes often have no timestamps, so this doesn't need them) ----------
const ent = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&amp;/g, '&').trim();
const attr = (tag: string, name: string) => { const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`)); return m ? parseFloat(m[1]) : NaN; };
/** Reads a GPX (track or route points) or TCX course/activity as a list of points. Throws a friendly error. */
export function parseRouteText(text: string, fileName = 'route'): { name: string; points: LatLng[] } {
  const t = text.replace(/^\uFEFF/, '');
  const base = fileName.replace(/\.[^.]+$/, '');
  let pts: LatLng[] = [];
  let name = '';
  if (/<gpx[\s>]/i.test(t.slice(0, 3000))) {
    const tags = t.match(/<(?:\w+:)?(?:trkpt|rtept)\b[^>]*>/g) || [];
    pts = tags.map((g) => ({ lat: attr(g, 'lat'), lng: attr(g, 'lon') }));
    const nm = t.match(/<(?:trk|rte)\b[^>]*>[\s\S]*?<name>([\s\S]*?)<\/name>/) || t.match(/<metadata>[\s\S]*?<name>([\s\S]*?)<\/name>/);
    name = nm ? ent(nm[1]) : '';
  } else if (/TrainingCenterDatabase/.test(t.slice(0, 3000))) {
    const re = /<Position>\s*<LatitudeDegrees>([-\d.]+)<\/LatitudeDegrees>\s*<LongitudeDegrees>([-\d.]+)<\/LongitudeDegrees>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(t))) pts.push({ lat: parseFloat(m[1]), lng: parseFloat(m[2]) });
    const nm = t.match(/<(?:Course|Activity)\b[^>]*>[\s\S]*?<(?:Name|Notes)>([\s\S]*?)<\/(?:Name|Notes)>/);
    name = nm ? ent(nm[1]) : '';
  } else throw new Error('Unsupported file — use .gpx, .tcx or .fit.');
  pts = pts.filter((p) => isFinite(p.lat) && isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180 && !(p.lat === 0 && p.lng === 0));
  if (pts.length < 2) throw new Error('No route points found in that file.');
  return { name: name || base, points: pts };
}
