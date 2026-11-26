// Map privacy for shared activities (Strava-style "Map Visibility"): hide the start & end of a route by a
// randomised distance, hide everything inside saved privacy zones, or hide the whole map.
// PURE functions — every share path (feed post, share image, public link, GPX export, Supabase row) gets its
// route ONLY from publicRoute()/publicActivity(), so hidden points never leave the device. The owner's own copy
// (workouts/routes collections) always keeps the full route. Tested in tools/test-privacy.ts.
import { haversine } from './calc';
import { ageGate } from './social';
import type { Profile, RoutePoint, Workout } from './types';

export type Visibility = 'only-me' | 'friends' | 'public';
export interface PrivacyZone { id: string; label: string; lat: number; lng: number; radiusM: number }
export interface MapPrivacy {
  /** Hide the first and last part of the route. */
  hideEnds: boolean;
  /** Minimum distance hidden at each end, metres (200–1000). A secret random extra 0–50 % is added per activity. */
  trimM: number;
  /** Hide the whole map (stats only). */
  hideMap: boolean;
  /** Apply the saved privacy zones. */
  useZones: boolean;
}
export interface PrivacyPrefs {
  hideEnds: boolean;
  trimM: number;
  hideMap: boolean;
  zones: PrivacyZone[];
  defaultVisibility: Visibility;
  /** Show heart rate and calories to others (off by default — health data stays private). */
  shareHealth: boolean;
  /** Secret per-person seed for the random offsets (synced privately with the profile, never shared). */
  seed?: string;
}

export const TRIM_MIN = 200, TRIM_MAX = 1000, TRIM_DEFAULT = 400, MINOR_TRIM_MIN = 400;
/** Choices offered in the UI: metric in metres, imperial in miles (0.1–0.6 mi ≈ 161–966 m). */
export const TRIM_CHOICES_M = [200, 400, 600, 800, 1000];
export const TRIM_CHOICES_MI = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6];
export const ZONE_RADII_M = [200, 400, 600, 800, 1000, 1600];
export const MAX_ZONES = 10;
/** Random extra added to the trim, as a fraction of trimM (0 … EXTRA_MAX). */
export const EXTRA_MAX = 0.5;
/** Zones: the hidden circle's centre is moved up to this fraction of the radius, and the radius grown to match. */
export const ZONE_SHIFT_MAX = 0.35;

export const VISIBILITY: { v: Visibility; label: string; sub: string; icon: string }[] = [
  { v: 'only-me', label: 'Only me', sub: 'Private. Nobody else can see it.', icon: 'lock' },
  { v: 'friends', label: 'Friends', sub: 'Your HYBRD friends can see it.', icon: 'users' },
  { v: 'public', label: 'Everyone', sub: 'Anyone with the link, and everyone on HYBRD.', icon: 'globe' },
];

// ---------- people ----------
/** Under 18 (or under 13) by date of birth / age. Unknown age is treated as an adult only when no age is known at all. */
export function isMinor(p: Pick<Profile, 'dob' | 'age'>, today = new Date()): boolean {
  const g = ageGate(p.dob, p.dob ? undefined : p.age, today);
  return g === 'teen' || g === 'under13';
}
export const allowedVisibilities = (minor: boolean): Visibility[] => (minor ? ['only-me', 'friends'] : ['only-me', 'friends', 'public']);
export const clampVisibility = (v: Visibility | undefined, minor: boolean): Visibility => (!v ? 'only-me' : minor && v === 'public' ? 'friends' : v);

export const clampTrim = (m: number, minor = false) => Math.round(Math.min(TRIM_MAX, Math.max(minor ? MINOR_TRIM_MIN : TRIM_MIN, Number.isFinite(m) ? m : TRIM_DEFAULT)));

/** Profile → privacy settings with safe defaults (ON for everyone; forced ON for under-18s). */
export function prefsOf(p: Pick<Profile, 'privacy' | 'dob' | 'age'>, today = new Date()): PrivacyPrefs & { minor: boolean } {
  const minor = isMinor(p, today);
  const x = p.privacy;
  return {
    hideEnds: minor ? true : x?.hideEnds ?? true,
    trimM: clampTrim(x?.trimM ?? TRIM_DEFAULT, minor),
    hideMap: x?.hideMap ?? false,
    zones: (x?.zones || []).slice(0, MAX_ZONES),
    defaultVisibility: clampVisibility(x?.defaultVisibility ?? 'friends', minor),
    shareHealth: x?.shareHealth ?? false,
    seed: x?.seed,
    minor,
  };
}

/** The map privacy that applies to one activity: its own choice, else the defaults. Minors can't switch it off. */
export function mapPrivacyFor(w: Pick<Workout, 'mapPrivacy'> | undefined, prefs: PrivacyPrefs & { minor?: boolean }): MapPrivacy {
  const base: MapPrivacy = w?.mapPrivacy ?? { hideEnds: prefs.hideEnds, trimM: prefs.trimM, hideMap: prefs.hideMap, useZones: true };
  const minor = !!prefs.minor;
  return { hideEnds: minor ? true : !!base.hideEnds, trimM: clampTrim(base.trimM, minor), hideMap: !!base.hideMap, useZones: minor ? true : base.useZones !== false };
}

// ---------- seeded randomness (deterministic per person + activity, so re-sharing gives the same cut) ----------
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
export function rng(seed: string): () => number {
  let a = hash32(seed) || 1;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function newSeed(): string {
  const b = new Uint8Array(16);
  (globalThis.crypto as Crypto).getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}
/** Distance hidden at the start and at the end: trimM plus a secret random 0–50 % (independent at each end). */
export function trimOffsets(trimM: number, seed: string, key: string): { start: number; end: number } {
  const r = rng(`${seed}|trim|${key}`);
  return { start: Math.round(trimM * (1 + EXTRA_MAX * r())), end: Math.round(trimM * (1 + EXTRA_MAX * r())) };
}
/** A zone's hidden circle: centre moved randomly (so the gap's centre isn't your door), radius grown so the original circle is still fully covered. */
export function effectiveZone(z: PrivacyZone, seed: string): { lat: number; lng: number; radiusM: number } {
  const r = rng(`${seed}|zone|${z.id}|${z.lat.toFixed(5)},${z.lng.toFixed(5)}|${z.radiusM}`);
  const shift = z.radiusM * ZONE_SHIFT_MAX * r(), ang = 2 * Math.PI * r();
  const dLat = (shift * Math.cos(ang)) / 111_320, dLng = (shift * Math.sin(ang)) / (111_320 * Math.cos((z.lat * Math.PI) / 180) || 1);
  return { lat: z.lat + dLat, lng: z.lng + dLng, radiusM: z.radiusM + shift };
}
export const inZone = (p: { lat: number; lng: number }, ez: { lat: number; lng: number; radiusM: number }) => haversine(p, ez) <= ez.radiusM;

// ---------- the trim ----------
export interface TrimResult {
  /** Visible segments: original point objects (owner-side use); sanitise before they leave the device. */
  segments: RoutePoint[][];
  kept: number; removed: number; total: number;
  hiddenStartM: number; hiddenEndM: number;
  zoneHits: number;
  /** The map is hidden entirely (hide-map, or nothing left after trimming). */
  hiddenAll: boolean;
  reason?: 'hide-map' | 'too-short' | 'no-route';
}
export function trimRoute(segments: RoutePoint[][] | undefined, mp: MapPrivacy, zones: PrivacyZone[], seed: string, key: string): TrimResult {
  const segs = (segments || []).filter((s) => s.length > 0);
  const total = segs.reduce((a, s) => a + s.length, 0);
  const empty = (reason: TrimResult['reason']): TrimResult => ({ segments: [], kept: 0, removed: total, total, hiddenStartM: 0, hiddenEndM: 0, zoneHits: 0, hiddenAll: true, reason });
  if (!total) return empty('no-route');
  if (mp.hideMap) return empty('hide-map');
  // cumulative distance along the whole track (gaps between segments counted as a straight line)
  const cum: number[][] = []; let d = 0; let prev: RoutePoint | null = null;
  for (const s of segs) { const c: number[] = []; for (const p of s) { if (prev) d += haversine(prev, p); c.push(d); prev = p; } cum.push(c); }
  const D = d;
  const off = mp.hideEnds ? trimOffsets(mp.trimM, seed, key) : { start: 0, end: 0 };
  const from = off.start, to = D - off.end;
  if (mp.hideEnds && from >= to) return { ...empty('too-short'), hiddenStartM: off.start, hiddenEndM: off.end };
  const ez = mp.useZones ? zones.map((z) => effectiveZone(z, seed)) : [];
  const out: RoutePoint[][] = []; let kept = 0, zoneHits = 0;
  segs.forEach((s, si) => {
    let cur: RoutePoint[] = [];
    s.forEach((p, i) => {
      const c = cum[si][i];
      const endsOk = !mp.hideEnds || (c > from && c < to);
      const zone = endsOk && ez.some((z) => inZone(p, z));
      if (zone) zoneHits++;
      if (endsOk && !zone) cur.push(p);
      else { if (cur.length > 1) out.push(cur); cur = []; }
    });
    if (cur.length > 1) out.push(cur);
  });
  kept = out.reduce((a, s) => a + s.length, 0);
  if (!kept) return { ...empty('too-short'), hiddenStartM: off.start, hiddenEndM: off.end, zoneHits };
  return { segments: out, kept, removed: total - kept, total, hiddenStartM: off.start, hiddenEndM: off.end, zoneHits, hiddenAll: false };
}

/** Points that leave the device: lat/lng rounded to ~1 m, optional altitude and time — nothing else. */
export interface SharePoint { lat: number; lng: number; alt?: number; t?: number }
export function sanitize(segs: RoutePoint[][], keepTime = false): SharePoint[][] {
  return segs.map((s) => s.map((p) => {
    const o: SharePoint = { lat: Math.round(p.lat * 1e5) / 1e5, lng: Math.round(p.lng * 1e5) / 1e5 };
    if (typeof p.alt === 'number' && Number.isFinite(p.alt)) o.alt = Math.round(p.alt * 10) / 10;
    if (keepTime && p.t) o.t = p.t;
    return o;
  }));
}
/** Thin a track for sharing (max ~N points), keeping each segment's first and last point. */
export function thin(segs: SharePoint[][], max = 1500): SharePoint[][] {
  const n = segs.reduce((a, s) => a + s.length, 0);
  if (n <= max) return segs;
  const step = Math.ceil(n / max);
  return segs.map((s) => s.filter((_, i) => i === 0 || i === s.length - 1 || i % step === 0));
}

/** The one place a shareable route is made: privacy applied, sanitised, thinned. */
export function publicRoute(w: Pick<Workout, 'id' | 'mapPrivacy'>, segments: RoutePoint[][] | undefined, profile: Pick<Profile, 'privacy' | 'dob' | 'age'>, opts: { keepTime?: boolean; max?: number } = {}) {
  const prefs = prefsOf(profile);
  const mp = mapPrivacyFor(w, prefs);
  const r = trimRoute(segments, mp, prefs.zones, prefs.seed || 'hybrd', w.id);
  return { ...r, mp, segments: thin(sanitize(r.segments, opts.keepTime), opts.max ?? 1500) };
}

/** Short, honest description of what others see. */
export function privacySummary(mp: MapPrivacy, zones: number, units: 'metric' | 'imperial'): string {
  if (mp.hideMap) return 'Map hidden — others see stats only.';
  const parts: string[] = [];
  if (mp.hideEnds) parts.push(`start & end hidden (at least ${units === 'imperial' ? `${(mp.trimM / 1609.344).toFixed(1)} mi` : `${mp.trimM} m`}, plus a random extra)`);
  if (mp.useZones && zones) parts.push(`${zones} privacy zone${zones === 1 ? '' : 's'} hidden`);
  return parts.length ? `Others see the route with ${parts.join(' and ')}.` : 'Others see the full route.';
}
