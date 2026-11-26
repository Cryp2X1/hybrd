/**
 * Where is the user? Used to center maps. Order: live GPS fix → last known position (localStorage) →
 * rough guess from the device time zone. Never a hard-coded demo city.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export interface Pos { lat: number; lng: number; acc?: number; t: number }
export type PosSource = 'gps' | 'last' | 'tz' | 'none';
const KEY = 'hybrd:lastpos';

export function getLastPos(): Pos | null {
  try { const j = JSON.parse(localStorage.getItem(KEY) || 'null'); return j && Number.isFinite(j.lat) && Number.isFinite(j.lng) ? j : null; } catch { return null; }
}
let lastSaved = 0;
export function saveLastPos(p: { lat: number; lng: number; acc?: number }, force = false) {
  const now = Date.now();
  if (!force && now - lastSaved < 30000) return;
  lastSaved = now;
  try { localStorage.setItem(KEY, JSON.stringify({ lat: +p.lat.toFixed(5), lng: +p.lng.toFixed(5), acc: p.acc ? Math.round(p.acc) : undefined, t: now })); } catch { /* full */ }
}

// Approximate coordinates for common IANA zones (the zone's namesake city). Only a rough starting view.
const TZ: Record<string, [number, number]> = {
  'America/New_York': [40.71, -74.0], 'America/Detroit': [42.33, -83.05], 'America/Toronto': [43.65, -79.38], 'America/Montreal': [45.5, -73.57],
  'America/Chicago': [41.88, -87.63], 'America/Winnipeg': [49.9, -97.14], 'America/Mexico_City': [19.43, -99.13], 'America/Monterrey': [25.69, -100.32],
  'America/Denver': [39.74, -104.99], 'America/Phoenix': [33.45, -112.07], 'America/Edmonton': [53.55, -113.49], 'America/Boise': [43.62, -116.2],
  'America/Los_Angeles': [34.05, -118.24], 'America/Vancouver': [49.28, -123.12], 'America/Tijuana': [32.51, -117.04], 'America/Anchorage': [61.22, -149.9],
  'Pacific/Honolulu': [21.31, -157.86], 'America/Halifax': [44.65, -63.58], 'America/St_Johns': [47.56, -52.71], 'America/Puerto_Rico': [18.47, -66.11],
  'America/Santo_Domingo': [18.49, -69.93], 'America/Havana': [23.11, -82.37], 'America/Panama': [8.98, -79.52], 'America/Bogota': [4.71, -74.07],
  'America/Caracas': [10.48, -66.9], 'America/Lima': [-12.05, -77.04], 'America/Guayaquil': [-2.17, -79.92], 'America/La_Paz': [-16.5, -68.15],
  'America/Santiago': [-33.45, -70.67], 'America/Argentina/Buenos_Aires': [-34.6, -58.38], 'America/Buenos_Aires': [-34.6, -58.38], 'America/Montevideo': [-34.9, -56.16],
  'America/Asuncion': [-25.26, -57.58], 'America/Sao_Paulo': [-23.55, -46.63], 'America/Fortaleza': [-3.73, -38.52], 'America/Manaus': [-3.12, -60.02],
  'America/Guatemala': [14.63, -90.51], 'America/El_Salvador': [13.69, -89.22], 'America/Tegucigalpa': [14.07, -87.19], 'America/Managua': [12.11, -86.24],
  'America/Costa_Rica': [9.93, -84.08], 'America/Jamaica': [18.0, -76.79],
  'Europe/London': [51.51, -0.13], 'Europe/Dublin': [53.35, -6.26], 'Europe/Lisbon': [38.72, -9.14], 'Europe/Madrid': [40.42, -3.7], 'Europe/Paris': [48.86, 2.35],
  'Europe/Brussels': [50.85, 4.35], 'Europe/Amsterdam': [52.37, 4.9], 'Europe/Berlin': [52.52, 13.4], 'Europe/Zurich': [47.37, 8.54], 'Europe/Rome': [41.9, 12.5],
  'Europe/Vienna': [48.21, 16.37], 'Europe/Prague': [50.08, 14.44], 'Europe/Warsaw': [52.23, 21.01], 'Europe/Copenhagen': [55.68, 12.57], 'Europe/Stockholm': [59.33, 18.07],
  'Europe/Oslo': [59.91, 10.75], 'Europe/Helsinki': [60.17, 24.94], 'Europe/Athens': [37.98, 23.73], 'Europe/Bucharest': [44.43, 26.1], 'Europe/Budapest': [47.5, 19.04],
  'Europe/Istanbul': [41.01, 28.98], 'Europe/Kyiv': [50.45, 30.52], 'Europe/Kiev': [50.45, 30.52], 'Europe/Moscow': [55.76, 37.62], 'Atlantic/Canary': [28.12, -15.43],
  'Africa/Casablanca': [33.57, -7.59], 'Africa/Lagos': [6.52, 3.38], 'Africa/Cairo': [30.04, 31.24], 'Africa/Nairobi': [-1.29, 36.82], 'Africa/Johannesburg': [-26.2, 28.05],
  'Africa/Accra': [5.6, -0.19], 'Asia/Dubai': [25.2, 55.27], 'Asia/Riyadh': [24.71, 46.68], 'Asia/Jerusalem': [31.77, 35.21], 'Asia/Tehran': [35.69, 51.39],
  'Asia/Karachi': [24.86, 67.0], 'Asia/Kolkata': [28.61, 77.21], 'Asia/Calcutta': [28.61, 77.21], 'Asia/Dhaka': [23.81, 90.41], 'Asia/Bangkok': [13.76, 100.5],
  'Asia/Jakarta': [-6.21, 106.85], 'Asia/Singapore': [1.35, 103.82], 'Asia/Kuala_Lumpur': [3.14, 101.69], 'Asia/Manila': [14.6, 120.98], 'Asia/Ho_Chi_Minh': [10.82, 106.63],
  'Asia/Hong_Kong': [22.32, 114.17], 'Asia/Shanghai': [31.23, 121.47], 'Asia/Taipei': [25.03, 121.57], 'Asia/Seoul': [37.57, 126.98], 'Asia/Tokyo': [35.68, 139.69],
  'Australia/Perth': [-31.95, 115.86], 'Australia/Adelaide': [-34.93, 138.6], 'Australia/Brisbane': [-27.47, 153.03], 'Australia/Sydney': [-33.87, 151.21],
  'Australia/Melbourne': [-37.81, 144.96], 'Pacific/Auckland': [-36.85, 174.76],
};
/** Rough position from the device time zone (city-level at best). Falls back to the UTC offset's longitude. */
export function tzGuess(): Pos {
  let zone = '';
  try { zone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { /* old browser */ }
  const hit = TZ[zone];
  if (hit) return { lat: hit[0], lng: hit[1], acc: 50000, t: 0 };
  const lng = Math.max(-170, Math.min(170, -new Date().getTimezoneOffset() / 4)); // 15° per hour
  return { lat: 25, lng, acc: 500000, t: 0 };
}
export const zoneName = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'your time zone'; } catch { return 'your time zone'; } };

export function locateOnce(timeout = 10000): Promise<Pos> {
  return new Promise((res, rej) => {
    if (!('geolocation' in navigator)) { rej(Object.assign(new Error('unavailable'), { code: 2 })); return; }
    navigator.geolocation.getCurrentPosition((p) => {
      const pos = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, t: Date.now() };
      saveLastPos(pos, true); res(pos);
    }, (e) => rej(e), { enableHighAccuracy: true, timeout, maximumAge: 60000 });
  });
}

export type LocStatus = 'idle' | 'locating' | 'ok' | 'denied' | 'unavailable';
/** Best current guess for map centering; call locate() to (re)ask for a GPS fix. */
export function useUserLocation(auto: boolean) {
  const [pos, setPos] = useState<Pos>(() => getLastPos() || tzGuess());
  const [source, setSource] = useState<PosSource>(() => (getLastPos() ? 'last' : 'tz'));
  const [status, setStatus] = useState<LocStatus>('idle');
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  const locate = useCallback(async () => {
    setStatus('locating');
    try {
      const p = await locateOnce();
      if (!alive.current) return null;
      setPos(p); setSource('gps'); setStatus('ok'); return p;
    } catch (e) {
      if (!alive.current) return null;
      setStatus((e as GeolocationPositionError).code === 1 ? 'denied' : 'unavailable');
      return null;
    }
  }, []);
  useEffect(() => {
    if (!auto) {
      // Don't prompt, but use an already-granted permission silently
      navigator.permissions?.query({ name: 'geolocation' as PermissionName }).then((r) => { if (r.state === 'granted' && alive.current) locate(); }).catch(() => {});
      return;
    }
    locate();
  }, [auto, locate]);
  return { pos, source, status, locate };
}

/** For demo data: the user's area if we can get it quickly, else last known, else time-zone guess. */
/** `useGps` = the person allowed precise location (Settings › Privacy › Data consents); otherwise last known / time-zone guess. */
export async function demoCenter(useGps = true): Promise<[number, number]> {
  if (useGps) { try { const p = await locateOnce(4000); return [p.lat, p.lng]; } catch { /* fall through */ } }
  const p = getLastPos() || tzGuess();
  return [p.lat, p.lng];
}
