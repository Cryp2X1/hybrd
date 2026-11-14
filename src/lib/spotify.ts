// Spotify: Authorization Code with PKCE (client-side only, no secret), Web API player control (Spotify Connect),
// the user's playlists, and an optional Web Playback SDK player for desktop browsers (Premium only).
// Docs: https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow
import { useSyncExternalStore } from 'react';
import { setDucker } from './cues';

const ACCOUNTS = 'https://accounts.spotify.com';
const API = 'https://api.spotify.com/v1';
const K = { cid: 'hybrd:sp-cid', tok: 'hybrd:sp-tok', pkce: 'hybrd:sp-pkce', prefs: 'hybrd:sp-prefs' };

/** Minimal scopes: read + control playback, read your playlists. */
export const SCOPES = ['user-read-playback-state', 'user-modify-playback-state', 'user-read-currently-playing', 'playlist-read-private'];
/** Only requested when you turn on "Play in this browser" (Web Playback SDK needs these three). */
export const SDK_SCOPES = ['streaming', 'user-read-email', 'user-read-private'];

export type ErrKind = 'premium' | 'allowlist' | 'nodevice' | 'quota' | 'rate' | 'auth' | 'network' | 'setup' | 'other';
export class SpError extends Error { constructor(public kind: ErrKind, message: string, public status = 0) { super(message); } }

export interface Device { id: string | null; name: string; type: string; is_active: boolean; is_restricted?: boolean; supports_volume?: boolean; volume_percent?: number | null }
export interface Track { name: string; uri: string; duration_ms: number; artists?: { name: string }[]; album?: { name: string; images?: { url: string; width?: number | null }[] }; show?: { name: string; images?: { url: string }[] }; images?: { url: string }[] }
export interface Playback { is_playing: boolean; progress_ms: number | null; item: Track | null; device: Device; context?: { uri: string } | null; at: number }
export interface PlaylistLite { id: string; name: string; uri: string; images?: { url: string }[] | null; owner?: { display_name?: string }; total?: number }
interface Tokens { access: string; refresh: string; exp: number; scope: string }
interface Prefs { duck: boolean; browser: boolean }

export interface SpState {
  clientId: string; cidOrigin: 'device' | 'config.js' | 'none';
  connected: boolean; scope: string;
  error: { kind: ErrKind; message: string } | null;
  me?: { id: string; name: string };
  playback?: Playback | null; devices?: Device[]; playlists?: PlaylistLite[];
  prefs: Prefs;
  sdk: { status: 'off' | 'loading' | 'ready' | 'error'; deviceId?: string; error?: string };
  loading: Record<string, boolean>;
}

// ---------------- tiny store ----------------
const read = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) as T : d; } catch { return d; } };
const write = (k: string, v: unknown) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };
const cfgCid = () => (window.HYBRD_CONFIG?.spotifyClientId || '').trim();
function cidInfo(): Pick<SpState, 'clientId' | 'cidOrigin'> {
  const dev = read<string>(K.cid, '');
  if (dev) return { clientId: dev, cidOrigin: 'device' };
  const c = cfgCid();
  return c ? { clientId: c, cidOrigin: 'config.js' } : { clientId: '', cidOrigin: 'none' };
}
let tokens: Tokens | null = read<Tokens | null>(K.tok, null);
let state: SpState = { ...cidInfo(), connected: !!tokens, scope: tokens?.scope || '', error: null, prefs: { duck: true, browser: false, ...read<Partial<Prefs>>(K.prefs, {}) }, sdk: { status: 'off' }, loading: {} };
const subs = new Set<() => void>();
function set(p: Partial<SpState>) { state = { ...state, ...p }; subs.forEach((f) => f()); }
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const getSpotify = () => state;
export function useSpotify() { return useSyncExternalStore(subscribe, getSpotify); }
export const configFileHasClientId = () => !!cfgCid();

export function setClientId(id: string) {
  const v = id.trim();
  if (v && !/^[0-9a-f]{32}$/i.test(v)) throw new SpError('setup', 'A Spotify Client ID is 32 letters/numbers (0–9, a–f). Copy it from your app’s Settings in the Spotify dashboard.');
  write(K.cid, v || null);
  if (tokens) disconnect();
  set({ ...cidInfo(), error: null });
}
export function setPrefs(p: Partial<Prefs>) { const prefs = { ...state.prefs, ...p }; write(K.prefs, prefs); set({ prefs }); }

// ---------------- PKCE ----------------
/** Exact redirect URI to register in the dashboard: the app root, e.g. https://cryp2x1.github.io/hybrd/ */
export const redirectUri = () => new URL(import.meta.env.BASE_URL, window.location.origin).toString();
/** Spotify rejects "localhost" redirect URIs (since April 2025): use http://127.0.0.1:PORT for dev. */
export const onLocalhostName = () => window.location.hostname === 'localhost';

const b64url = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b instanceof Uint8Array ? b : new Uint8Array(b)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function randomString(n: number) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const v = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(v, (x) => chars[x % chars.length]).join('');
}
async function challenge(verifier: string) { return b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))); }

/** Sends the user to Spotify's consent page. `withSdk` adds the Web Playback SDK scopes. */
export async function connect(opts: { withSdk?: boolean; returnTo?: string } = {}) {
  const { clientId } = state;
  if (!clientId) throw new SpError('setup', 'Add your Spotify Client ID first (Me › Music).');
  if (!window.isSecureContext || !crypto.subtle) throw new SpError('setup', 'Spotify sign-in needs HTTPS (or http://127.0.0.1 for testing).');
  const verifier = randomString(64);
  const st = randomString(24);
  const scopes = [...SCOPES, ...(opts.withSdk || state.prefs.browser ? SDK_SCOPES : [])];
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const ret = opts.returnTo ?? (window.location.pathname.slice(base.length) || '/') + window.location.search + window.location.hash;
  write(K.pkce, { verifier, state: st, returnTo: ret, at: Date.now(), redirect: redirectUri() });
  const q = new URLSearchParams({ response_type: 'code', client_id: clientId, scope: scopes.join(' '), code_challenge_method: 'S256', code_challenge: await challenge(verifier), redirect_uri: redirectUri(), state: st });
  window.location.assign(`${ACCOUNTS}/authorize?${q}`);
}

/**
 * Runs before React renders (and before Supabase reads the URL). If the URL is a Spotify callback whose `state`
 * matches the one we stored, takes the code out of the address bar and exchanges it for tokens.
 */
export function captureSpotifyCallback() {
  const q = new URLSearchParams(window.location.search);
  const st = q.get('state');
  if (!st || (!q.get('code') && !q.get('error'))) return;
  const p = read<{ verifier: string; state: string; returnTo: string; at: number; redirect: string } | null>(K.pkce, null);
  if (!p || p.state !== st) return; // not ours (e.g. a Supabase link) — leave it alone
  const code = q.get('code'), err = q.get('error');
  write(K.pkce, null);
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  window.history.replaceState(null, '', base + (p.returnTo || '/'));
  if (err) { set({ error: { kind: 'auth', message: err === 'access_denied' ? 'Spotify connection cancelled.' : `Spotify said: ${err}` } }); return; }
  set({ loading: { ...state.loading, connect: true } });
  tokenRequest({ grant_type: 'authorization_code', code: code!, redirect_uri: p.redirect, code_verifier: p.verifier })
    .then(() => { set({ error: null }); return loadMe(); })
    .catch((e: SpError) => set({ error: { kind: e.kind || 'auth', message: e.message } }))
    .finally(() => set({ loading: { ...state.loading, connect: false } }));
}

async function tokenRequest(body: Record<string, string>) {
  let r: Response;
  try {
    r = await fetch(`${ACCOUNTS}/api/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ ...body, client_id: state.clientId }) });
  } catch { throw new SpError('network', 'Can’t reach Spotify — check your connection.'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (body.grant_type === 'refresh_token' && (j.error === 'invalid_grant' || r.status === 400)) { disconnect(); throw new SpError('auth', 'Your Spotify session ended. Connect again.'); }
    throw new SpError('auth', j.error_description ? `Spotify sign-in failed: ${j.error_description}` : `Spotify sign-in failed (${r.status}).`);
  }
  tokens = { access: j.access_token, refresh: j.refresh_token || tokens?.refresh || '', exp: Date.now() + (j.expires_in || 3600) * 1000, scope: j.scope || tokens?.scope || '' };
  write(K.tok, tokens);
  set({ connected: true, scope: tokens.scope });
  return tokens;
}

let refreshing: Promise<Tokens> | null = null;
/** A valid access token, refreshed ~1 min before it expires (one refresh at a time). */
export async function getToken(): Promise<string> {
  if (!tokens) throw new SpError('auth', 'Not connected to Spotify.');
  if (Date.now() < tokens.exp - 60_000) return tokens.access;
  if (!refreshing) refreshing = tokenRequest({ grant_type: 'refresh_token', refresh_token: tokens.refresh }).finally(() => { refreshing = null; });
  return (await refreshing).access;
}

export function disconnect() {
  try { sdkPlayer?.disconnect(); } catch { /* ignore */ }
  sdkPlayer = null;
  tokens = null; write(K.tok, null);
  set({ connected: false, scope: '', me: undefined, playback: undefined, devices: undefined, playlists: undefined, error: null, sdk: { status: 'off' } });
}

// ---------------- Web API ----------------
async function api<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}, retried = false): Promise<T | null> {
  const token = await getToken();
  let r: Response;
  try {
    r = await fetch(API + path, { method: init.method || 'GET', headers: { Authorization: `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) }, body: init.body ? JSON.stringify(init.body) : undefined });
  } catch { throw new SpError('network', 'Can’t reach Spotify — check your connection.'); }
  if (r.status === 204 || r.status === 202) return null;
  const text = await r.text();
  let j: { error?: { status?: number; message?: string; reason?: string } } & Record<string, unknown> = {};
  try { j = text ? JSON.parse(text) : {}; } catch { /* plain-text body */ }
  if (r.ok) return j as T;
  const msg = j.error?.message || text || `HTTP ${r.status}`;
  const reason = j.error?.reason || '';
  if (r.status === 401 && !retried && tokens) { tokens.exp = 0; return api<T>(path, init, true); }
  if (r.status === 401) { disconnect(); throw new SpError('auth', 'Your Spotify session ended. Connect again.', 401); }
  if (r.status === 403) {
    if (reason === 'PREMIUM_REQUIRED' || /premium/i.test(msg)) throw new SpError('premium', 'Controlling playback from HYBRD needs Spotify Premium. You can still play the workout playlists below, or use the Spotify app.', 403);
    if (/not registered|developer dashboard|user may not be registered/i.test(msg)) throw new SpError('allowlist', 'This Spotify account isn’t on the app’s user list yet. Ask the person who set up HYBRD’s Spotify app to add your Spotify email under User Management.', 403);
    if (path.startsWith('/me/player')) throw new SpError('premium', `Spotify refused the command (${msg}). Playback control needs Spotify Premium; some devices (e.g. speakers or restricted devices) can’t be controlled remotely.`, 403);
    throw new SpError('other', `Spotify refused: ${msg}`, 403);
  }
  if (r.status === 404 && (reason === 'NO_ACTIVE_DEVICE' || path.startsWith('/me/player'))) throw new SpError('nodevice', 'No active Spotify device.', 404);
  if (r.status === 429) {
    if (reason === 'QUOTA_EXCEEDED') throw new SpError('quota', 'This HYBRD Spotify app has used its development-mode quota for now. Try again later or use the Spotify app.', 429);
    const s = +(r.headers.get('Retry-After') || 0);
    throw new SpError('rate', `Spotify asked us to slow down${s ? ` — try again in ${s} s` : ''}.`, 429);
  }
  throw new SpError('other', `Spotify error ${r.status}: ${msg}`, r.status);
}
const flag = (k: string, v: boolean) => set({ loading: { ...state.loading, [k]: v } });
async function run<T>(k: string, f: () => Promise<T>): Promise<T | undefined> {
  flag(k, true);
  try { const v = await f(); if (state.error && state.error.kind !== 'premium' && state.error.kind !== 'allowlist') set({ error: null }); return v; }
  catch (e) { const er = e as SpError; set({ error: { kind: er.kind || 'other', message: er.message } }); return undefined; }
  finally { flag(k, false); }
}

export const loadMe = () => run('me', async () => {
  const m = await api<{ id: string; display_name?: string }>('/me');
  if (m) set({ me: { id: m.id, name: m.display_name || m.id } });
});
export async function refreshPlayback() {
  if (!tokens) return;
  try {
    const p = await api<Omit<Playback, 'at'>>('/me/player?additional_types=episode');
    set({ playback: p ? { ...p, at: Date.now() } : null });
    if (state.error?.kind === 'nodevice' && p) set({ error: null });
  } catch (e) { const er = e as SpError; if (er.kind !== 'network') set({ error: { kind: er.kind, message: er.message } }); }
}
export const loadDevices = () => run('devices', async () => {
  const d = await api<{ devices: Device[] }>('/me/player/devices');
  set({ devices: d?.devices || [] });
  return d?.devices || [];
});
export const loadPlaylists = () => run('playlists', async () => {
  const d = await api<{ items: (PlaylistLite & { tracks?: { total?: number }; items?: { total?: number } })[] }>('/me/playlists?limit=50');
  // Feb 2026: the playlist "tracks" field is renamed "items"; read either
  set({ playlists: (d?.items || []).filter(Boolean).map((p) => ({ id: p.id, name: p.name, uri: p.uri, images: p.images, owner: p.owner, total: p.items?.total ?? p.tracks?.total })) });
});

/** Best device to wake when nothing is active: this browser player, then a phone on phones, a computer on desktops. */
function pickDevice(ds: Device[]) {
  const ok = ds.filter((d) => d.id && !d.is_restricted);
  if (state.sdk.deviceId) { const s = ok.find((d) => d.id === state.sdk.deviceId); if (s) return s; }
  const mobile = isMobileDevice();
  return ok.find((d) => d.type === (mobile ? 'Smartphone' : 'Computer')) || ok.find((d) => d.type === 'Smartphone') || ok[0];
}
const NO_DEVICE = () => new SpError('nodevice', isMobileDevice()
  ? 'Open Spotify on this phone first (play any song for a second), then come back and tap Refresh devices.'
  : 'No Spotify device is open. Open Spotify on your phone or computer, or turn on “Play in this browser”, then tap Refresh devices.');

/** Runs a player command; if no device is active, wakes the best available one and retries once. */
async function command(path: string, init: { method?: string; body?: unknown }) {
  try { await api(path, init); }
  catch (e) {
    if ((e as SpError).kind !== 'nodevice') throw e;
    const ds = (await api<{ devices: Device[] }>('/me/player/devices'))?.devices || [];
    set({ devices: ds });
    const d = pickDevice(ds);
    if (!d?.id) throw NO_DEVICE();
    const sep = path.includes('?') ? '&' : '?';
    if (path.startsWith('/me/player/play')) await api(`${path}${sep}device_id=${encodeURIComponent(d.id)}`, init);
    else { await api('/me/player', { method: 'PUT', body: { device_ids: [d.id], play: false } }); await api(path, init); }
  }
  setTimeout(refreshPlayback, 450);
}
export const play = () => run('cmd', () => command('/me/player/play', { method: 'PUT' }));
export const pause = () => run('cmd', () => command('/me/player/pause', { method: 'PUT' }));
export const next = () => run('cmd', () => command('/me/player/next', { method: 'POST' }));
export const previous = () => run('cmd', () => command('/me/player/previous', { method: 'POST' }));
export const playContext = (uri: string) => run('cmd', () => command('/me/player/play', { method: 'PUT', body: { context_uri: uri } }));
export const transfer = (id: string, playNow = true) => run('cmd', async () => {
  await api('/me/player', { method: 'PUT', body: { device_ids: [id], play: playNow } });
  setTimeout(() => { refreshPlayback(); loadDevices(); }, 600);
});
export const clearError = () => set({ error: null });

// ---------------- playback polling (light: every 5 s, only while a player is on screen and the page is visible) ----------------
let watchers = 0, timer: number | undefined;
function tick() { if (document.visibilityState === 'visible' && tokens) refreshPlayback(); }
export function watchPlayback() {
  watchers++;
  if (watchers === 1) { tick(); timer = window.setInterval(tick, 5000); document.addEventListener('visibilitychange', tick); }
  return () => { watchers--; if (!watchers) { clearInterval(timer); document.removeEventListener('visibilitychange', tick); } };
}

// ---------------- Web Playback SDK (desktop browsers, Premium) ----------------
interface SdkPlayer { connect(): Promise<boolean>; disconnect(): void; addListener(ev: string, cb: (a: unknown) => void): void; getVolume(): Promise<number>; setVolume(v: number): Promise<void>; activateElement?(): Promise<void> }
declare global { interface Window { onSpotifyWebPlaybackSDKReady?: () => void; Spotify?: { Player: new (o: { name: string; getOAuthToken: (cb: (t: string) => void) => void; volume?: number }) => SdkPlayer } } }
let sdkPlayer: SdkPlayer | null = null;
export const isMobileDevice = () => /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const hasSdkScopes = () => SDK_SCOPES.every((s) => state.scope.split(' ').includes(s));
function loadSdkScript(): Promise<void> {
  if (window.Spotify) return Promise.resolve();
  return new Promise((res, rej) => {
    window.onSpotifyWebPlaybackSDKReady = () => res();
    const s = document.createElement('script');
    s.src = 'https://sdk.scdn.co/spotify-player.js'; s.async = true;
    s.onerror = () => rej(new Error('Could not load the Spotify player script (blocked by an extension or offline?).'));
    document.head.appendChild(s);
  });
}
/** Call from a tap. Creates a "HYBRD (this browser)" Spotify Connect device and moves playback to it. */
export async function startBrowserPlayer() {
  if (!hasSdkScopes()) { setPrefs({ browser: true }); return connect({ withSdk: true }); }
  if (sdkPlayer) { if (state.sdk.deviceId) await transfer(state.sdk.deviceId); return; }
  set({ sdk: { status: 'loading' } });
  try {
    await loadSdkScript();
    const pl = new window.Spotify!.Player({ name: 'HYBRD (this browser)', getOAuthToken: (cb) => { getToken().then(cb).catch(() => {}); }, volume: 0.8 });
    sdkPlayer = pl;
    const fail = (msg: string) => { set({ sdk: { status: 'error', error: msg } }); };
    pl.addListener('ready', (a) => { const id = (a as { device_id: string }).device_id; set({ sdk: { status: 'ready', deviceId: id } }); transfer(id, true); });
    pl.addListener('not_ready', () => set({ sdk: { ...state.sdk, status: 'loading' } }));
    pl.addListener('account_error', () => fail('Playing in the browser needs Spotify Premium.'));
    pl.addListener('authentication_error', () => fail('Spotify didn’t accept the token for the browser player — disconnect and connect again.'));
    pl.addListener('initialization_error', (a) => fail(`This browser can’t run the Spotify player (${(a as { message?: string })?.message || 'no DRM support'}). Use the Spotify app instead.`));
    pl.addListener('playback_error', (a) => fail(`Playback error: ${(a as { message?: string })?.message || 'unknown'}`));
    pl.addListener('player_state_changed', () => setTimeout(refreshPlayback, 300));
    try { await pl.activateElement?.(); } catch { /* not needed on all browsers */ }
    const ok = await pl.connect();
    if (!ok) fail('The Spotify browser player could not connect.');
  } catch (e) { set({ sdk: { status: 'error', error: (e as Error).message } }); }
}
export function stopBrowserPlayer() { try { sdkPlayer?.disconnect(); } catch { /* ignore */ } sdkPlayer = null; setPrefs({ browser: false }); set({ sdk: { status: 'off' } }); }

// ---------------- ducking: lower Spotify while HYBRD speaks a cue ----------------
let duckUntil = 0, duckTimer: number | undefined, restoreTo: number | null = null, duckOn: 'sdk' | 'api' | null = null;
async function duck(ms: number) {
  if (!state.prefs.duck || !tokens) return;
  const pb = state.playback;
  if (!pb?.is_playing) return;
  duckUntil = Math.max(duckUntil, Date.now() + ms);
  const restore = () => {
    const left = duckUntil - Date.now();
    if (left > 50) { duckTimer = window.setTimeout(restore, left); return; }
    const v = restoreTo, how = duckOn; restoreTo = null; duckOn = null;
    if (v == null) return;
    if (how === 'sdk') sdkPlayer?.setVolume(v).catch(() => {});
    else api(`/me/player/volume?volume_percent=${Math.round(v)}`, { method: 'PUT' }).catch(() => {});
  };
  clearTimeout(duckTimer); duckTimer = window.setTimeout(restore, ms);
  if (restoreTo != null) return; // already ducked — just extended
  try {
    if (sdkPlayer && state.sdk.deviceId && pb.device.id === state.sdk.deviceId) {
      restoreTo = await sdkPlayer.getVolume(); duckOn = 'sdk';
      await sdkPlayer.setVolume(Math.max(0.05, restoreTo * 0.3));
    } else if (pb.device.supports_volume && pb.device.volume_percent != null) {
      restoreTo = pb.device.volume_percent; duckOn = 'api';
      await api(`/me/player/volume?volume_percent=${Math.max(5, Math.round(restoreTo * 0.3))}`, { method: 'PUT' });
    }
  } catch { restoreTo = null; duckOn = null; }
}
setDucker((ms) => { duck(ms); });

