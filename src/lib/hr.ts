// Bluetooth heart-rate sensors via Web Bluetooth and the standard GATT Heart Rate Service
// (service 0x180D, Heart Rate Measurement characteristic 0x2A37, notify). Works with chest straps and
// arm bands (Polar H9/H10/Verity, Garmin HRM-Dual/HRM 200, Wahoo TICKR, Coros HRM…), and watches that broadcast HR.
import { useSyncExternalStore } from 'react';
import { get, set as idbSet } from 'idb-keyval';
import { applyKcal, downsampleHr, hrStats } from './calc';
import type { Profile, Workout } from './types';
import { isIOS } from './cues';

export type HrStatus = 'idle' | 'requesting' | 'connecting' | 'connected' | 'reconnecting' | 'lost' | 'error';
export interface HrState {
  support: { ok: boolean; reason?: string };
  status: HrStatus; device?: string; bpm?: number; at?: number; contact?: boolean | null; battery?: number | null;
  error?: string; reconnects: number;
}

/** Parses a Heart Rate Measurement (0x2A37) value per the Bluetooth GATT spec. */
export function parseHrMeasurement(v: DataView) {
  const flags = v.getUint8(0);
  const wide = flags & 0x01;
  let i = 1;
  const bpm = wide ? v.getUint16(i, true) : v.getUint8(i); i += wide ? 2 : 1;
  const contactSupported = (flags & 0x04) !== 0;
  const contact = contactSupported ? (flags & 0x02) !== 0 : null;
  let energy: number | undefined;
  if (flags & 0x08) { energy = v.getUint16(i, true); i += 2; }
  const rr: number[] = [];
  if (flags & 0x10) for (; i + 1 < v.byteLength; i += 2) rr.push((v.getUint16(i, true) / 1024) * 1000);
  return { bpm, contact, energy, rr };
}

function detectSupport(): HrState['support'] {
  if (typeof navigator === 'undefined') return { ok: false, reason: 'No browser.' };
  if ('bluetooth' in navigator) return { ok: true };
  if (isIOS()) return { ok: false, reason: 'iPhone and iPad browsers (Safari, and Chrome/Edge on iOS, which use Safari’s engine) don’t support Web Bluetooth. Options: record with your watch and import the file, sync from Strava, or use a Web Bluetooth browser such as Bluefy.' };
  if (/Firefox\//.test(navigator.userAgent)) return { ok: false, reason: 'Firefox doesn’t support Web Bluetooth. Use Chrome or Edge (Android, Windows, macOS, ChromeOS).' };
  if (!window.isSecureContext) return { ok: false, reason: 'Bluetooth needs HTTPS.' };
  return { ok: false, reason: 'This browser doesn’t support Web Bluetooth. Use Chrome or Edge on Android, Windows, macOS or ChromeOS (on Linux it must be enabled in chrome://flags).' };
}

// ------- store -------
let state: HrState = { support: detectSupport(), status: 'idle', reconnects: 0 };
const subs = new Set<() => void>();
const set = (p: Partial<HrState>) => { state = { ...state, ...p }; subs.forEach((f) => f()); };
export const getHr = () => state;
export const useHr = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, getHr);

// ------- rolling sample buffer (absolute ms, bpm), kept 6 h, saved to IndexedDB so a reload mid-workout keeps it -------
const BUF_KEY = 'hybrd:hr-buffer';
const KEEP_MS = 6 * 3600_000;
let buf: [number, number][] = [];
let lastPush = 0, saveT: number | undefined;
get(BUF_KEY).then((b) => { if (Array.isArray(b)) buf = [...(b as [number, number][]).filter((x) => x[0] > Date.now() - KEEP_MS), ...buf]; }).catch(() => {});
function push(t: number, bpm: number) {
  if (t - lastPush < 1000) return; // ≤ 1 Hz
  lastPush = t; buf.push([t, bpm]);
  if (buf.length && buf[0][0] < t - KEEP_MS) buf = buf.filter((x) => x[0] > t - KEEP_MS);
  clearTimeout(saveT); saveT = window.setTimeout(() => idbSet(BUF_KEY, buf).catch(() => {}), 5000);
}
/** HR recorded between two wall-clock times → stats + downsampled series (seconds from `from`). */
export function hrForRange(from: number, to: number) {
  const s = buf.filter((x) => x[0] >= from && x[0] <= to).map(([t, b]) => [(t - from) / 1000, b] as [number, number]);
  const st = hrStats(s);
  if (!st || s.length < 10) return null;
  return { ...st, samples: downsampleHr(s), from: 'ble' as const };
}
/** Last ~n seconds for the live chart. */
export const recentHr = (sec = 300) => { const now = Date.now(); return buf.filter((x) => x[0] > now - sec * 1000); };

// ------- connection -------
type Char = { startNotifications(): Promise<unknown>; addEventListener(t: string, f: (e: Event) => void): void; removeEventListener(t: string, f: (e: Event) => void): void; readValue?(): Promise<DataView> };
type Dev = { name?: string; gatt?: { connected: boolean; connect(): Promise<{ getPrimaryService(s: string | number): Promise<{ getCharacteristic(c: string | number): Promise<Char> }> }>; disconnect(): void }; addEventListener(t: string, f: () => void): void };
let dev: Dev | null = null, ch: Char | null = null, manual = false, retryT: number | undefined, staleT: number | undefined;

function onValue(e: Event) {
  const v = (e.target as unknown as { value: DataView }).value;
  try {
    const m = parseHrMeasurement(v);
    const now = Date.now();
    if (m.bpm > 25 && m.bpm < 250 && m.contact !== false) push(now, m.bpm);
    set({ bpm: m.bpm, at: now, contact: m.contact, status: 'connected', error: undefined });
    clearTimeout(staleT); staleT = window.setTimeout(() => set({}), 5500); // re-render so the UI can show "no signal"
  } catch { /* malformed packet */ }
}

async function attach(d: Dev) {
  set({ status: 'connecting', device: d.name || 'Heart-rate sensor' });
  const server = await d.gatt!.connect();
  const svc = await server.getPrimaryService('heart_rate');
  const c = await svc.getCharacteristic('heart_rate_measurement');
  if (ch) ch.removeEventListener('characteristicvaluechanged', onValue);
  ch = c;
  c.addEventListener('characteristicvaluechanged', onValue);
  await c.startNotifications();
  set({ status: 'connected', reconnects: 0, error: undefined });
  // battery level is optional (0x180F / 0x2A19)
  try { const b = await (await server.getPrimaryService('battery_service')).getCharacteristic('battery_level'); const v = await b.readValue?.(); if (v) set({ battery: v.getUint8(0) }); } catch { set({ battery: null }); }
}

function scheduleReconnect() {
  if (manual || !dev) return;
  const n = state.reconnects + 1;
  if (n > 8) { set({ status: 'lost', error: 'Lost the heart-rate sensor. Check it’s on your chest (straps need skin contact) and tap Reconnect.' }); return; }
  set({ status: 'reconnecting', reconnects: n });
  const wait = Math.min(15000, 1000 * 2 ** (n - 1));
  clearTimeout(retryT);
  retryT = window.setTimeout(async () => { try { await attach(dev!); } catch { scheduleReconnect(); } }, wait);
}

/** Must be called from a tap (the browser shows its device chooser). */
export async function connectHr() {
  if (!state.support.ok) throw new Error(state.support.reason);
  manual = false;
  set({ status: 'requesting', error: undefined });
  try {
    const bt = (navigator as unknown as { bluetooth: { requestDevice(o: unknown): Promise<Dev> } }).bluetooth;
    const d = await bt.requestDevice({ filters: [{ services: ['heart_rate'] }], optionalServices: ['battery_service'] });
    dev = d;
    d.addEventListener('gattserverdisconnected', () => { ch = null; if (!manual) scheduleReconnect(); else set({ status: 'idle' }); });
    await attach(d);
  } catch (e) {
    const err = e as Error;
    if (err.name === 'NotFoundError') set({ status: dev ? state.status : 'idle', error: dev ? state.error : undefined }); // chooser cancelled
    else set({ status: 'error', error: err.name === 'SecurityError' ? 'Bluetooth was blocked for this site. Allow it in the browser’s site settings.' : err.name === 'NotAllowedError' ? 'Bluetooth permission was denied.' : `Couldn’t connect: ${err.message}` });
  }
}
export async function reconnectHr() {
  if (!dev) return connectHr();
  manual = false; set({ reconnects: 0 });
  try { await attach(dev); } catch { scheduleReconnect(); }
}
export function disconnectHr() {
  manual = true; clearTimeout(retryT);
  try { dev?.gatt?.disconnect(); } catch { /* ignore */ }
  dev = null; ch = null;
  set({ status: 'idle', bpm: undefined, at: undefined, device: undefined, battery: undefined, error: undefined, reconnects: 0 });
}
/** True when a reading arrived in the last 5 s. */
export const hrFresh = (s: HrState) => s.status === 'connected' && !!s.at && Date.now() - s.at < 5000;

/** Attach HR recorded during [from, to] to a workout, then set calories (device › watts › HR › MET). */
export function attachHr<T extends Workout>(w: T, p: Profile, from: number, to = Date.now()): T {
  const h = hrForRange(from, to);
  if (h) { w.hr = h; if (state.device && !w.device) w.device = state.device; }
  return applyKcal(w, p);
}
