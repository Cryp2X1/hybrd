// Sharing a saved activity: the public payload, key stats, share links (X / Facebook / copy), file names and GPX.
// PURE — tested in tools/test-share.ts. Routes come ONLY from privacy.publicRoute(), never from the raw route.
import { activityLabel, distUnit, fmtElev, fmtSpeed, fmtTime, isBikeType, isGpsType, toDist } from './calc';
import { prefsOf, publicRoute, type SharePoint, type Visibility } from './privacy';
import type { GpsRoute, Profile, Units, Workout } from './types';

export const SHARE_PATH = 'a';
export interface PublicStats {
  distanceM?: number; movingSec: number; elapsedSec?: number; elevGainM?: number;
  avgHr?: number; maxHr?: number; kcal?: number; steps?: number; cadence?: number;
  avgWatts?: number; rpe?: number; exercises?: number; sets?: number;
}
export interface PublicActivity {
  v: 1;
  title: string;
  description?: string;
  type: Workout['type'];
  label: string;
  date: string;
  stats: PublicStats;
  splits?: { sec: number; distanceM?: number }[];
  /** Top exercises for gym sessions (names + set counts only). */
  lifts?: { name: string; sets: number }[];
  /** Privacy-trimmed, sanitised route; null = no map (indoor, hidden, or nothing left after trimming). */
  route: SharePoint[][] | null;
  mapHidden: boolean;
  /** Plain words about what was hidden, for viewers ("Start and end hidden for privacy"). */
  privacyNote?: string;
}

/** Build the payload every share target uses. */
export function publicActivity(w: Workout, route: Pick<GpsRoute, 'segments'> | undefined, profile: Pick<Profile, 'privacy' | 'dob' | 'age'>): PublicActivity {
  const prefs = prefsOf(profile);
  const pr = publicRoute(w, route?.segments, profile);
  const stats: PublicStats = { movingSec: Math.round(w.durationSec || 0) };
  if (w.distanceM && w.distanceM > 0) stats.distanceM = Math.round(w.distanceM);
  if (w.elapsedSec && w.elapsedSec > stats.movingSec) stats.elapsedSec = Math.round(w.elapsedSec);
  if (w.elevGainM) stats.elevGainM = Math.round(w.elevGainM);
  if (w.steps) stats.steps = Math.round(w.steps);
  if (w.cadence) stats.cadence = Math.round(w.cadence);
  if (w.avgWatts) stats.avgWatts = Math.round(w.avgWatts);
  if (w.rpe) stats.rpe = w.rpe;
  if (prefs.shareHealth) { if (w.hr?.avg) { stats.avgHr = Math.round(w.hr.avg); stats.maxHr = Math.round(w.hr.max); } if (w.kcal) stats.kcal = Math.round(w.kcal); }
  const ex = (w.exercises || []).filter((e) => e.sets?.length);
  if (ex.length) { stats.exercises = ex.length; stats.sets = ex.reduce((a, e) => a + e.sets.filter((s) => s.done !== false).length, 0); }
  const hasRoute = !!route?.segments?.some((s) => s.length > 1);
  const out: PublicActivity = {
    v: 1, title: (w.title || activityLabel(w)).slice(0, 100), type: w.type, label: activityLabel(w), date: w.date, stats,
    route: pr.hiddenAll ? null : pr.segments, mapHidden: hasRoute && pr.hiddenAll,
  };
  if (w.description?.trim()) out.description = w.description.trim().slice(0, 2000);
  if (w.splits?.length && w.source !== 'hyrox-sim') out.splits = w.splits.slice(0, 200).map((s) => ({ sec: Math.round(s.sec), ...(s.distanceM ? { distanceM: Math.round(s.distanceM) } : {}) }));
  if (ex.length) out.lifts = ex.slice(0, 8).map((e) => ({ name: e.name.slice(0, 60), sets: e.sets.length }));
  if (hasRoute) out.privacyNote = pr.hiddenAll ? (pr.reason === 'hide-map' ? 'Map hidden by the athlete.' : 'Map hidden for privacy.') : pr.mp.hideEnds || pr.removed ? 'Start and end hidden for privacy.' : undefined;
  if (!out.privacyNote) delete out.privacyNote;
  return out;
}

/** Every lat/lng in a payload (for tests and the "nothing hidden leaked" check). */
export const payloadPoints = (a: Pick<PublicActivity, 'route'>) => (a.route || []).flat();

export interface KeyStat { label: string; value: string; unit?: string }
const paceType = (t: Workout['type']) => t === 'run' || t === 'walk' || t === 'hyrox' || t === 'hybrid';
/** 3–4 headline numbers for cards and share images, in the viewer's units. */
export function keyStats(a: Pick<PublicActivity, 'type' | 'stats'>, u: Units): KeyStat[] {
  const s = a.stats, out: KeyStat[] = [];
  const t = s.movingSec;
  if (s.distanceM) out.push({ label: 'Distance', value: toDist(s.distanceM, u).toFixed(2), unit: distUnit(u) });
  if (s.distanceM && t > 0 && paceType(a.type)) { const p = t / toDist(s.distanceM, u); out.push({ label: 'Pace', value: p > 0 && p < 3600 ? fmtTime(p) : '—', unit: `/${distUnit(u)}` }); }
  else if (s.distanceM && t > 0 && (isBikeType(a.type) || isGpsType(a.type))) { const [v, un] = fmtSpeed(s.distanceM / t, u).split(' '); out.push({ label: 'Speed', value: v, unit: un }); }
  out.push({ label: 'Time', value: fmtTime(t) });
  if (s.elevGainM && out.length < 4) { const [v, un] = fmtElev(s.elevGainM, u).split(' '); out.push({ label: 'Elev gain', value: v, unit: un }); }
  if (!s.distanceM && s.exercises && out.length < 4) out.push({ label: 'Exercises', value: String(s.exercises) });
  if (!s.distanceM && s.sets && out.length < 4) out.push({ label: 'Sets', value: String(s.sets) });
  if (s.avgWatts && out.length < 4) out.push({ label: 'Avg power', value: String(s.avgWatts), unit: 'W' });
  if (s.avgHr && out.length < 4) out.push({ label: 'Avg HR', value: String(s.avgHr), unit: 'bpm' });
  if (s.kcal && out.length < 4) out.push({ label: 'Calories', value: String(s.kcal), unit: 'kcal' });
  if (s.steps && out.length < 4) out.push({ label: 'Steps', value: s.steps.toLocaleString('en-US') });
  if (s.rpe && out.length < 3) out.push({ label: 'Effort', value: `${s.rpe}/10` });
  return out.slice(0, 4);
}

// ---------- links ----------
export const newShareId = (): string => (globalThis.crypto as Crypto).randomUUID();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const isShareId = (s: string | null | undefined): s is string => !!s && UUID.test(s);
/** `https://host/hybrd/a?id=<uuid>` — appBase must end with "/". */
export const shareUrl = (appBase: string, shareId: string) => `${appBase.replace(/\/?$/, '/')}${SHARE_PATH}?id=${encodeURIComponent(shareId)}`;
export function shareText(a: Pick<PublicActivity, 'title' | 'type' | 'stats' | 'label'>, u: Units): string {
  const k = keyStats(a, u).slice(0, 3).map((x) => `${x.value}${x.unit ? (x.unit.startsWith('/') ? ' ' + x.unit : ' ' + x.unit) : ''}`);
  return `${a.title} · ${k.join(' · ')} on HYBRD`;
}
/** X (Twitter) web intent: text + link. Opens the composer; nothing is posted until the person taps Post. */
export function xIntentUrl(text: string, url?: string): string {
  const q = new URLSearchParams({ text: text.slice(0, 240) });
  if (url) q.set('url', url);
  return `https://x.com/intent/post?${q.toString()}`;
}
/** Facebook sharer: link only (Facebook ignores pre-filled text). */
export const facebookShareUrl = (url: string) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;

export type Ratio = 'square' | 'portrait' | 'story';
export const RATIOS: Record<Ratio, { w: number; h: number; label: string; sub: string }> = {
  square: { w: 1080, h: 1080, label: '1:1', sub: 'Feed' },
  portrait: { w: 1080, h: 1350, label: '4:5', sub: 'Portrait' },
  story: { w: 1080, h: 1920, label: '9:16', sub: 'Story' },
};
export type ImageStyle = 'map' | 'route' | 'transparent' | 'stats';
export const IMAGE_STYLES: { v: ImageStyle; label: string; sub: string }[] = [
  { v: 'map', label: 'Map', sub: 'Route on the map' },
  { v: 'route', label: 'Route', sub: 'Route line, dark background' },
  { v: 'transparent', label: 'Sticker', sub: 'Transparent PNG for stories' },
  { v: 'stats', label: 'Stats', sub: 'Stats card, no map' },
];
export const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'activity';
export function shareFileName(a: Pick<PublicActivity, 'title' | 'date'>, ext: 'png' | 'gpx', variant?: string): string {
  return `hybrd-${a.date.slice(0, 10)}-${slug(a.title)}${variant ? `-${variant}` : ''}.${ext}`;
}

// ---------- GPX (privacy-trimmed) ----------
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const GPX_TYPE: Partial<Record<Workout['type'], string>> = { run: 'running', walk: 'walking', cycle: 'cycling' };
export function toGpx(a: Pick<PublicActivity, 'title' | 'type' | 'date' | 'description'>, segs: SharePoint[][]): string {
  const trk = segs.filter((s) => s.length > 1).map((s) => `   <trkseg>\n${s.map((p) => `    <trkpt lat="${p.lat.toFixed(6)}" lon="${p.lng.toFixed(6)}">${typeof p.alt === 'number' ? `<ele>${p.alt.toFixed(1)}</ele>` : ''}${p.t ? `<time>${new Date(p.t).toISOString()}</time>` : ''}</trkpt>`).join('\n')}\n   </trkseg>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="HYBRD" xmlns="http://www.topografix.com/GPX/1/1">
 <metadata><name>${esc(a.title)}</name><time>${new Date(a.date).toISOString()}</time></metadata>
 <trk>
  <name>${esc(a.title)}</name>${a.description ? `\n  <desc>${esc(a.description)}</desc>` : ''}
  <type>${GPX_TYPE[a.type] || esc(a.type)}</type>
${trk}
 </trk>
</gpx>
`;
}
/** GPX for sharing: privacy applied, timestamps kept for the visible points only. */
export function shareGpx(w: Workout, route: Pick<GpsRoute, 'segments'> | undefined, profile: Pick<Profile, 'privacy' | 'dob' | 'age'>): string | null {
  const pr = publicRoute(w, route?.segments, profile, { keepTime: true, max: 100_000 });
  if (pr.hiddenAll) return null;
  const a = publicActivity(w, route, profile);
  return toGpx(a, pr.segments);
}
/** GPX of the full, untrimmed route — only offered to the owner, labelled private. */
export function originalGpx(w: Workout, route: Pick<GpsRoute, 'segments'>): string {
  return toGpx({ title: w.title, type: w.type, date: w.date, description: w.description }, route.segments.map((s) => s.map((p) => ({ lat: p.lat, lng: p.lng, ...(typeof p.alt === 'number' ? { alt: p.alt } : {}), t: p.t }))));
}

// ---------- auto title ----------
export function autoTitle(type: Workout['type'], label: string, at = new Date()): string {
  const h = at.getHours();
  const part = h < 5 ? 'Night' : h < 12 ? 'Morning' : h < 14 ? 'Lunch' : h < 18 ? 'Afternoon' : h < 22 ? 'Evening' : 'Night';
  return `${part} ${type === 'indoor-cycle' ? label : label}`;
}
export const visibilityLabel = (v: Visibility | undefined) => (v === 'public' ? 'Everyone' : v === 'friends' ? 'Friends' : 'Only me');
