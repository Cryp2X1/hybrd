import type { RoutePoint, WorkoutType } from '../types';
import { haversine, downsampleHr, hrStats } from '../calc';
import type { ParsedActivity } from './types';

export async function sha256(buf: ArrayBuffer) {
  const h = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
/** Maps sport names from GPX/TCX/FIT/Strava to HYBRD types. */
export function mapSport(raw?: string | number | null, kmh?: number, opts?: { trainer?: boolean }): WorkoutType {
  const s = String(raw ?? '').toLowerCase().replace(/[\s_-]/g, '');
  // Indoor / virtual / trainer rides first — "ride" and "cycl" would otherwise catch VirtualRide.
  if (opts?.trainer || /virtualride|indoorcycl|indoorride|indoorbike|stationary|spinning|spinbike|virtualactiv/.test(s)) return 'indoor-cycle';
  if (/run|jog|treadmill|trail/.test(s) || s === '9' || s === '1') return 'run';
  if (/walk|hik|stroll/.test(s) || s === '10' || s === '11' || s === '17') return 'walk';
  if (/bik|cycl|ride|spin|mtb|gravel/.test(s) || s === '2') return 'cycle';
  if (/strength|weight|lift/.test(s)) return 'strength';
  if (/hiit|crossfit|cardio|interval|row|elliptical|stair|swim|fitness|boxing/.test(s)) return 'cardio';
  if (/hyrox/.test(s)) return 'hyrox';
  if (kmh) return kmh > 15 ? 'cycle' : kmh > 7.5 ? 'run' : 'walk';
  return 'cardio';
}
export interface Pt { t?: number; lat?: number; lng?: number; alt?: number | null; hr?: number; cad?: number; dist?: number }
/**
 * Builds route segments (new segment after a > 60 s gap or missing position), moving time, elevation gain
 * (3 m hysteresis to ignore GPS/baro noise), HR series and average cadence from raw points.
 */
export function buildFromPoints(pts: Pt[], o: { cadenceDouble?: boolean } = {}) {
  const timed = pts.filter((p) => p.t != null).sort((a, b) => a.t! - b.t!);
  const segs: RoutePoint[][] = [];
  let cur: RoutePoint[] = [], d = 0, moving = 0, last: Pt | null = null, lastPos: Pt | null = null;
  let gain = 0, ref: number | null = null;
  const hr: [number, number][] = [], cads: number[] = [];
  const t0 = timed[0]?.t ?? 0;
  for (const p of timed) {
    if (last && p.t! - last.t! > 0 && p.t! - last.t! <= 60_000) moving += p.t! - last.t!;
    if (p.hr && p.hr > 25 && p.hr < 250) hr.push([(p.t! - t0) / 1000, p.hr]);
    if (p.cad && p.cad > 0) cads.push(o.cadenceDouble ? p.cad * 2 : p.cad);
    if (p.alt != null) { if (ref == null) ref = p.alt; else if (p.alt - ref > 3) { gain += p.alt - ref; ref = p.alt; } else if (ref - p.alt > 3) ref = p.alt; }
    if (p.lat != null && p.lng != null && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180 && !(p.lat === 0 && p.lng === 0)) {
      if (lastPos && (p.t! - lastPos.t! > 60_000)) { if (cur.length) segs.push(cur); cur = []; }
      else if (lastPos) d += haversine({ lat: lastPos.lat!, lng: lastPos.lng! }, { lat: p.lat, lng: p.lng });
      cur.push({ lat: p.lat, lng: p.lng, alt: p.alt ?? null, t: p.t!, e: moving, d: p.dist ?? d });
      lastPos = p;
    }
    last = p;
  }
  if (cur.length) segs.push(cur);
  const st = hrStats(hr);
  const lastDist = [...timed].reverse().find((p) => p.dist != null)?.dist;
  return {
    segments: segs.filter((s) => s.length > 1),
    start: t0, elapsedSec: timed.length ? (timed[timed.length - 1].t! - t0) / 1000 : 0, movingSec: moving / 1000,
    distanceM: lastDist ?? (d || undefined), elevGainM: gain ? Math.round(gain) : undefined,
    hr: st ? { ...st, samples: downsampleHr(hr) } : undefined,
    cadence: cads.length ? Math.round(cads.reduce((a, b) => a + b, 0) / cads.length) : undefined,
  };
}
export function finish(a: Omit<ParsedActivity, 'type'> & { type?: ParsedActivity['type'] }): ParsedActivity {
  const kmh = a.distanceM && a.durationSec ? a.distanceM / 1000 / (a.durationSec / 3600) : undefined;
  let type = a.type ?? mapSport(a.sportRaw, kmh);
  // Indoor trainer / spin files are often sport=cycling with no GPS points.
  if (type === 'cycle' && !a.segments.length) type = 'indoor-cycle';
  const warn = type === 'indoor-cycle' ? 'No GPS route in this file (indoor / trainer ride?).' : 'No GPS route in this file (indoor / treadmill?).';
  if (!a.segments.length && ['run', 'walk', 'cycle', 'indoor-cycle'].includes(type) && !a.warnings.includes(warn) && !a.warnings.includes('No GPS route in this file (indoor / treadmill?).')) a.warnings.push(warn);
  return { ...a, type };
}
