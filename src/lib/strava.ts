// Strava: OAuth (authorization code) with a tiny token-exchange function holding the client secret
// (Supabase Edge Function or Cloudflare Worker — see /functions in the repo). The browser never sees the secret.
//
// Strava API Policy compliance (2026):
//  • Strava data is shown only to the athlete who connected it (it lives on this device only — never synced to HYBRD's cloud).
//  • It is a cache of at most 7 days (§6.2): every entry is re-fetched on sync or deleted; anything Strava no longer returns is removed.
//  • No AI/ML use of any kind (§5.3). Consent screen before connecting (§2.1); "Disconnect & delete" with confirmation (§2.5).
import { useSyncExternalStore } from 'react';
import { get, set as idbSet, del } from 'idb-keyval';
import type { GpsRoute, Profile, RoutePoint, Workout } from './types';
import { applyKcal, downsampleHr, hrStats, splitsFromTrack, splitUnitM } from './calc';
import { mapSport } from './import/common';

const AUTH = 'https://www.strava.com/oauth/authorize';
const API = 'https://www.strava.com/api/v3'; // Strava announced https://api-v3.strava.com from Jan 4, 2027
const K = { cid: 'hybrd:strava-cid', url: 'hybrd:strava-url', tok: 'hybrd:strava-tok', st: 'hybrd:strava-state', meta: 'hybrd:strava-meta' };
const CACHE = 'hybrd:strava-cache';
export const CACHE_DAYS = 7;
const DAY = 86400_000;
export const SCOPE = 'read,activity:read_all';

interface Tokens { access: string; refresh: string; exp: number; scope: string; athlete: { id: number; name: string } }
export interface CacheEntry { w: Workout; route?: GpsRoute; cachedAt: number; streams?: boolean }
interface Meta { lastSync?: number; windowDays: number; hidden: string[] }
export interface StravaState {
  clientId: string; tokenUrl: string; origin: 'config.js' | 'device' | 'none'; setupNeeded: boolean;
  connected: boolean; athlete?: { id: number; name: string }; scope: string;
  busy: string | null; error: string | null; info: string | null;
  meta: Meta; cache: Record<string, CacheEntry>; usage?: string;
}

const read = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) as T : d; } catch { return d; } };
const write = (k: string, v: unknown) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };
function cfg() {
  const dc = read<string>(K.cid, ''), du = read<string>(K.url, '');
  const c = window.HYBRD_CONFIG || {};
  const clientId = (dc || c.stravaClientId || '').trim(), tokenUrl = (du || c.stravaTokenUrl || '').trim();
  return { clientId, tokenUrl, origin: (dc || du ? 'device' : c.stravaClientId ? 'config.js' : 'none') as StravaState['origin'], setupNeeded: !clientId || !tokenUrl };
}
let tokens = read<Tokens | null>(K.tok, null);
let state: StravaState = { ...cfg(), connected: !!tokens, athlete: tokens?.athlete, scope: tokens?.scope || '', busy: null, error: null, info: null, meta: { windowDays: 30, hidden: [], ...read<Partial<Meta>>(K.meta, {}) }, cache: {} };
const subs = new Set<() => void>();
const set = (p: Partial<StravaState>) => { state = { ...state, ...p }; subs.forEach((f) => f()); };
export const getStrava = () => state;
export const useStrava = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, getStrava);
const saveMeta = (m: Partial<Meta>) => { const meta = { ...state.meta, ...m }; write(K.meta, meta); set({ meta }); };

// ---- cache (IndexedDB, this device only) ----
let cacheLoaded = false;
const cacheKey = () => `${CACHE}:${tokens?.athlete.id ?? 'none'}`;
async function loadCache() {
  const c = ((await get(cacheKey()).catch(() => null)) || {}) as Record<string, CacheEntry>;
  cacheLoaded = true; set({ cache: purgeOld(c) });
}
function purgeOld(c: Record<string, CacheEntry>) {
  const cut = Date.now() - CACHE_DAYS * DAY, out: Record<string, CacheEntry> = {};
  let dropped = 0;
  for (const [k, v] of Object.entries(c)) { if (v.cachedAt >= cut) out[k] = v; else dropped++; }
  if (dropped) idbSet(cacheKey(), out).catch(() => {});
  return out;
}
const saveCache = (c: Record<string, CacheEntry>) => { set({ cache: c }); return idbSet(cacheKey(), c).catch(() => {}); };
if (tokens) loadCache();

export function setStravaConfig(clientId: string, tokenUrl: string) {
  const cid = clientId.trim(), url = tokenUrl.trim();
  if (cid && !/^\d{3,10}$/.test(cid)) throw new Error('A Strava Client ID is a number (e.g. 123456), from strava.com/settings/api.');
  if (url && !/^https:\/\/.+/.test(url) && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(url)) throw new Error('The token function URL must start with https://');
  write(K.cid, cid || null); write(K.url, url || null);
  set({ ...cfg(), error: null });
}

// ---- OAuth ----
const appRoot = () => new URL(import.meta.env.BASE_URL, window.location.origin).toString();
/** URL for the official "Connect with Strava" button (must link to strava.com/oauth/authorize). */
export function authorizeUrl() {
  const st = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  write(K.st, { state: st, returnTo: (window.location.pathname.slice(base.length) || '/') + window.location.search, at: Date.now() });
  const q = new URLSearchParams({ client_id: state.clientId, redirect_uri: appRoot(), response_type: 'code', approval_prompt: 'auto', scope: SCOPE, state: st });
  return `${AUTH}?${q}`;
}

async function fn(body: Record<string, string>) {
  let r: Response;
  try { r = await fetch(state.tokenUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
  catch { throw new Error('Can’t reach the Strava token function. Check the URL in Devices › Strava setup (and that it’s deployed).'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ? `Strava sign-in failed: ${j.error}` : `Token function error ${r.status}`);
  return j as { access_token: string; refresh_token: string; expires_at: number; scope?: string; athlete?: { id: number; firstname?: string } };
}

/** Runs before React renders; takes ?code=&state=&scope= if the state is ours (so Supabase/Spotify callbacks are untouched). */
export function captureStravaCallback() {
  const q = new URLSearchParams(window.location.search);
  const st = q.get('state');
  if (!st || (!q.get('code') && !q.get('error'))) return;
  const saved = read<{ state: string; returnTo: string } | null>(K.st, null);
  if (!saved || saved.state !== st) return;
  write(K.st, null);
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  window.history.replaceState(null, '', base + (saved.returnTo || '/'));
  const err = q.get('error'), code = q.get('code'), scope = q.get('scope') || '';
  if (err) { set({ error: err === 'access_denied' ? 'Strava connection cancelled.' : `Strava said: ${err}` }); return; }
  if (!/activity:read/.test(scope)) { set({ error: 'HYBRD needs the “View data about your activities” permission to import workouts. Connect again and leave that box ticked.' }); return; }
  set({ busy: 'connect' });
  fn({ action: 'exchange', code: code! }).then(async (j) => {
    tokens = { access: j.access_token, refresh: j.refresh_token, exp: j.expires_at * 1000, scope: j.scope || scope, athlete: { id: j.athlete?.id ?? 0, name: j.athlete?.firstname || 'Strava athlete' } };
    write(K.tok, tokens);
    set({ connected: true, athlete: tokens.athlete, scope: tokens.scope, error: null, busy: null });
    await loadCache();
    return syncStrava();
  }).catch((e) => set({ error: (e as Error).message, busy: null }));
}

let refreshing: Promise<void> | null = null;
async function token() {
  if (!tokens) throw new Error('Not connected to Strava.');
  if (Date.now() < tokens.exp - 5 * 60_000) return tokens.access;
  if (!refreshing) refreshing = fn({ action: 'refresh', refresh_token: tokens.refresh }).then((j) => {
    tokens = { ...tokens!, access: j.access_token, refresh: j.refresh_token || tokens!.refresh, exp: j.expires_at * 1000 }; // always keep the newest refresh token
    write(K.tok, tokens);
  }).finally(() => { refreshing = null; });
  await refreshing;
  return tokens!.access;
}
async function api<T>(path: string): Promise<T> {
  const r = await fetch(API + path, { headers: { Authorization: `Bearer ${await token()}` } }).catch(() => { throw new Error('Can’t reach Strava — check your connection.'); });
  const usage = r.headers.get('X-ReadRateLimit-Usage'), lim = r.headers.get('X-ReadRateLimit-Limit');
  if (usage && lim) set({ usage: `${usage} of ${lim} (15 min, day)` });
  if (r.status === 401) { throw new Error('Strava access was revoked or expired. Connect again.'); }
  if (r.status === 429) throw new Error('Strava’s rate limit for HYBRD is used up for now (shared by everyone using this HYBRD). Try again in 15 minutes.');
  if (!r.ok) throw new Error(`Strava error ${r.status}`);
  return r.json() as Promise<T>;
}

// ---- mapping ----
/** Google encoded polyline → [lat, lng][] */
export function decodePolyline(s: string): [number, number][] {
  const out: [number, number][] = []; let i = 0, lat = 0, lng = 0;
  while (i < s.length) {
    for (const k of [0, 1]) {
      let b, shift = 0, res = 0;
      do { b = s.charCodeAt(i++) - 63; res |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      const d = res & 1 ? ~(res >> 1) : res >> 1;
      if (k === 0) lat += d; else lng += d;
    }
    out.push([lat / 1e5, lng / 1e5]);
  }
  return out;
}
interface SAct { id: number; name: string; sport_type?: string; type?: string; trainer?: boolean; start_date: string; moving_time: number; elapsed_time: number; distance: number; total_elevation_gain?: number; average_heartrate?: number; max_heartrate?: number; has_heartrate?: boolean; calories?: number; kilojoules?: number; average_watts?: number; max_watts?: number; average_cadence?: number; device_name?: string; map?: { summary_polyline?: string; polyline?: string } }

function toEntry(a: SAct, p: Profile, prev?: CacheEntry): CacheEntry {
  const id = `strava-${a.id}`, type = mapSport(a.sport_type || a.type, undefined, { trainer: !!a.trainer });
  let route = prev?.streams ? prev.route : undefined;
  if (!route) {
    const line = a.map?.polyline || a.map?.summary_polyline;
    if (line) {
      const ll = decodePolyline(line), t0 = Date.parse(a.start_date);
      // the summary polyline has no timestamps: spread points over the moving time so the map and route history work
      const pts: RoutePoint[] = ll.map(([lat, lng], i) => ({ lat, lng, t: t0 + (i / Math.max(1, ll.length - 1)) * a.elapsed_time * 1000 }));
      route = { id: `${id}-route`, workoutId: id, segments: [pts], updatedAt: Date.now() };
    }
  }
  const w: Workout = {
    id, updatedAt: Date.now(), date: new Date(a.start_date).toISOString(), type, title: a.name, durationSec: a.moving_time,
    distanceM: a.distance || undefined, elevGainM: a.total_elevation_gain != null ? Math.round(a.total_elevation_gain) : undefined,
    routeId: route?.id, source: 'strava', extId: `strava:${a.id}`, device: a.device_name,
    hr: prev?.streams && prev.w.hr?.samples ? prev.w.hr : a.average_heartrate ? { avg: Math.round(a.average_heartrate), max: Math.round(a.max_heartrate || a.average_heartrate), from: 'strava' } : undefined,
    cadence: a.average_cadence ? Math.round(['run', 'walk'].includes(type) ? a.average_cadence * 2 : a.average_cadence) : undefined,
    avgWatts: a.average_watts ? Math.round(a.average_watts) : undefined,
    maxWatts: a.max_watts ? Math.round(a.max_watts) : undefined,
    bikeKind: type === 'indoor-cycle' ? 'indoor' : undefined,
    splits: prev?.streams ? prev.w.splits : undefined,
  };
  applyKcal(w, p, a.calories ?? (prev?.w.kcalMethod === 'device' ? prev.w.kcal : undefined));
  return { w, route, cachedAt: Date.now(), streams: prev?.streams };
}

/**
 * Sync = re-fetch the last N days from Strava (this also refreshes the 7-day cache), drop anything Strava no longer
 * returns, and purge entries older than 7 days. Detail calls (calories) only for new activities, max 20 per sync.
 */
export async function syncStrava(p?: Profile) {
  if (!tokens || state.busy === 'sync') return;
  const prof = p || lastProfile; if (prof) lastProfile = prof;
  if (!prof) return;
  if (!cacheLoaded) await loadCache();
  set({ busy: 'sync', error: null, info: null });
  try {
    const after = Math.floor((Date.now() - state.meta.windowDays * DAY) / 1000);
    const all: SAct[] = [];
    for (let page = 1; page <= 4; page++) {
      const batch = await api<SAct[]>(`/athlete/activities?after=${after}&per_page=100&page=${page}`);
      all.push(...batch);
      if (batch.length < 100) break;
    }
    const prev = state.cache, next: Record<string, CacheEntry> = {};
    let details = 0;
    for (const a of all) {
      const id = `strava-${a.id}`;
      let src = a;
      if (!prev[id] && details < 20) { try { src = { ...a, ...(await api<SAct>(`/activities/${a.id}`)) }; details++; } catch { /* keep summary */ } }
      else if (prev[id]?.w.kcalMethod === 'device') src = { ...a, calories: prev[id].w.kcal };
      next[id] = toEntry(src, prof, prev[id]);
    }
    const removed = Object.keys(prev).filter((k) => !next[k] && Date.parse(prev[k].w.date) >= after * 1000).length;
    // keep older entries (outside the window) only until their 7-day cache time runs out
    for (const [k, v] of Object.entries(prev)) if (!next[k] && Date.parse(v.w.date) < after * 1000) next[k] = v;
    await saveCache(purgeOld(next));
    saveMeta({ lastSync: Date.now() });
    set({ busy: null, info: `Synced ${all.length} activit${all.length === 1 ? 'y' : 'ies'} from the last ${state.meta.windowDays} days${removed ? ` · removed ${removed} no longer on Strava` : ''}.` });
  } catch (e) { set({ busy: null, error: (e as Error).message }); }
}
let lastProfile: Profile | undefined;
export function setSyncWindow(days: number) { saveMeta({ windowDays: days }); }

/** Full-resolution route + HR chart for one activity (streams), cached like everything else. */
export async function loadStreams(id: string, p: Profile) {
  const e = state.cache[id]; if (!e || e.streams) return;
  const sid = id.replace('strava-', '');
  set({ busy: 'streams' });
  try {
    const s = await api<Record<string, { data: unknown[] }>>(`/activities/${sid}/streams?keys=time,latlng,altitude,heartrate,distance,moving&key_by_type=true`);
    const t = (s.time?.data || []) as number[], ll = (s.latlng?.data || []) as [number, number][], alt = (s.altitude?.data || []) as number[], hr = (s.heartrate?.data || []) as number[], dist = (s.distance?.data || []) as number[], mov = (s.moving?.data || []) as boolean[];
    const t0 = Date.parse(e.w.date);
    let moving = 0;
    const pts: RoutePoint[] = [];
    for (let i = 0; i < t.length; i++) {
      if (i && (mov.length ? mov[i] : true)) moving += (t[i] - t[i - 1]) * 1000;
      if (ll[i]) pts.push({ lat: ll[i][0], lng: ll[i][1], alt: alt[i] ?? null, t: t0 + t[i] * 1000, e: moving, d: dist[i] });
    }
    const w = { ...e.w };
    let route = e.route;
    if (pts.length > 1) { route = { id: `${id}-route`, workoutId: id, segments: [pts], updatedAt: Date.now() }; w.routeId = route.id; w.splits = splitsFromTrack(route.segments, splitUnitM(p.units)); }
    if (hr.length) { const series = hr.map((b, i) => [t[i], b] as [number, number]); const st = hrStats(series); if (st) w.hr = { ...st, samples: downsampleHr(series), from: 'strava' }; }
    if (w.kcalMethod !== 'device') applyKcal(w, p);
    await saveCache({ ...state.cache, [id]: { ...e, w, route, streams: true } });
    set({ busy: null });
  } catch (err) { set({ busy: null, error: (err as Error).message }); }
}

/** Hide one Strava activity in HYBRD (until you un-hide; Strava itself is untouched). */
export function hideStravaActivity(id: string) {
  const c = { ...state.cache }; delete c[id]; saveCache(c);
  saveMeta({ hidden: [...new Set([...state.meta.hidden, id])] });
}

/** Revoke HYBRD's access at Strava and delete every piece of Strava data from this device. Returns a confirmation. */
export async function disconnectStrava(): Promise<string> {
  const n = Object.keys(state.cache).length;
  let revoked = false;
  if (tokens) {
    try { await fn({ action: 'revoke', token: tokens.refresh }); revoked = true; } catch { /* fall back */ }
    if (!revoked) { try { const r = await fetch(`https://www.strava.com/oauth/deauthorize?access_token=${encodeURIComponent(await token())}`, { method: 'POST' }); revoked = r.ok; } catch { /* offline */ } }
  }
  await del(cacheKey()).catch(() => {});
  const keys = await import('idb-keyval').then((m) => m.keys()).catch(() => [] as IDBValidKey[]);
  for (const k of keys) if (String(k).startsWith(CACHE)) await del(k).catch(() => {});
  tokens = null; write(K.tok, null); write(K.meta, null); write(K.st, null);
  cacheLoaded = false;
  const msg = `Deleted ${n} Strava activit${n === 1 ? 'y' : 'ies'} and your Strava tokens from this device on ${new Date().toLocaleString()}. HYBRD never copied Strava data anywhere else (it isn’t synced to HYBRD accounts). ${revoked ? 'HYBRD’s access was revoked at Strava.' : 'Couldn’t reach Strava to revoke access — remove HYBRD at strava.com/settings/apps to be sure.'}`;
  set({ connected: false, athlete: undefined, scope: '', cache: {}, meta: { windowDays: 30, hidden: [] }, busy: null, error: null, info: msg, usage: undefined });
  return msg;
}

/** Strava workouts/routes to merge into what HYBRD shows (deduped against your own workouts). */
export function stravaVisible(own: Workout[]) {
  const ws: Workout[] = [], rs: GpsRoute[] = []; let dup = 0;
  const hidden = new Set(state.meta.hidden);
  for (const e of Object.values(state.cache)) {
    if (hidden.has(e.w.id)) continue;
    const t = Date.parse(e.w.date);
    const twin = own.find((o) => o.extId === e.w.extId || (Math.abs(Date.parse(o.date) - t) < 3 * 60_000 && Math.abs(o.durationSec - e.w.durationSec) <= Math.max(120, e.w.durationSec * 0.15)));
    if (twin) { dup++; continue; }
    ws.push(e.w); if (e.route) rs.push(e.route);
  }
  return { workouts: ws, routes: rs, dup };
}
export const isStravaId = (id: string) => id.startsWith('strava-');
/** Auto-sync on app open, at most every 6 h (keeps the 7-day cache fresh without polling). */
export function autoSync(p: Profile) {
  lastProfile = p;
  if (tokens && (!state.meta.lastSync || Date.now() - state.meta.lastSync > 6 * 3600_000)) syncStrava(p);
}
