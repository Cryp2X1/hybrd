import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { BikeKind, RoutePoint, Split, WorkoutType } from './types';
import { haversine, splitsFromTrack } from './calc';
import { acquireWakeLock, cue, say } from './cues';
import { Pedometer, type MotionStatus } from './pedometer';
import { saveLastPos } from './location';

export type RecType = Extract<WorkoutType, 'run' | 'walk' | 'cycle' | 'indoor-cycle'>;
export interface RecState {
  status: 'idle' | 'recording' | 'paused';
  type: RecType;
  indoor: boolean;
  bikeKind: BikeKind;
  autoPause: boolean;
  startedAt: number;
  pausedAt: number | null; // set while paused (manual or auto)
  autoPaused: boolean;
  accPauseMs: number;
  segments: RoutePoint[][];
  distanceM: number;
  elevGainM: number;
  splits: Split[];
  splitUnitM: number;
  lastAcc: number | null;
  lastFixAt: number;
  gaps: { at: number; sec: number }[];
  error: string;
  dropped: number;
  restored?: boolean;
  steps: number;          // accelerometer steps (sensor)
  motion: MotionStatus;   // pedometer state for this session
}
const LS = 'hybrd:rec';
const fresh = (type: RecType = 'run', splitUnitM = 1000, bikeKind: BikeKind = 'indoor'): RecState => ({
  status: 'idle', type, indoor: type === 'indoor-cycle', bikeKind, autoPause: type !== 'indoor-cycle', startedAt: 0, pausedAt: null, autoPaused: false, accPauseMs: 0,
  segments: [], distanceM: 0, elevGainM: 0, splits: [], splitUnitM, lastAcc: null, lastFixAt: 0, gaps: [], error: '', dropped: 0, steps: 0, motion: 'unknown',
});
// Tunables per activity
const MAX_ACC = 35; // m — drop worse fixes
const MAX_SPEED: Record<RecType, number> = { run: 9, walk: 4, cycle: 25, 'indoor-cycle': 25 }; // m/s — drop teleport jumps
const MOVE_SPEED: Record<RecType, number> = { run: 1.0, walk: 0.5, cycle: 1.8, 'indoor-cycle': 1.8 }; // m/s — under this = stopped
const AUTO_PAUSE_SEC = 10;
const GAP_SEC = 25; // no fix for this long (screen locked / tab hidden) = gap, never bridged

export const elapsedMs = (s: RecState, now = Date.now()) => (s.startedAt ? (s.pausedAt ?? now) - s.startedAt - s.accPauseMs : 0);

interface Ctx {
  s: RecState;
  setup(p: Partial<Pick<RecState, 'type' | 'indoor' | 'bikeKind' | 'autoPause' | 'splitUnitM'>>): void;
  start(): void; pause(): void; resume(): void; finish(): RecState; discard(): void;
  currentPaceSec(): number; // sec per meter, recent
  setMotion(m: MotionStatus): void; // result of the permission request (from a tap)
  sensorCadence(): number; // steps/min from the accelerometer, 0 if none
}
const C = createContext<Ctx>(null as unknown as Ctx);
export const useRecorder = () => useContext(C);

export function RecorderProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<RecState>(() => {
    try {
      const j = JSON.parse(localStorage.getItem(LS) || 'null') as RecState | null;
      if (j && j.status !== 'idle') {
        // Restored after reload/crash: GPS watch is gone, so come back paused and say so.
        const now = Date.now();
        return { ...j, steps: j.steps || 0, bikeKind: j.bikeKind || 'indoor', indoor: j.type === 'indoor-cycle' ? true : j.indoor, motion: j.motion === 'denied' || j.motion === 'unsupported' ? j.motion : 'unknown', status: 'paused', pausedAt: j.pausedAt ?? (j.lastFixAt || now), autoPaused: false, restored: true };
      }
    } catch { /* ignore */ }
    return fresh();
  });
  const ref = useRef(s); ref.current = s;
  const watch = useRef<number | null>(null);
  const release = useRef<(() => void) | null>(null);
  const lastSave = useRef(0);
  const lastMoveAt = useRef(0);
  const altRef = useRef<number | null>(null);
  const [, force] = useState(0);

  const save = useCallback((st: RecState, forceSave = false) => {
    const now = Date.now();
    if (!forceSave && now - lastSave.current < 1500) return;
    lastSave.current = now;
    try { localStorage.setItem(LS, JSON.stringify(st)); } catch { /* storage full */ }
  }, []);
  const update = useCallback((fn: (st: RecState) => RecState, forceSave = false) => {
    const n = fn(ref.current); ref.current = n; setS(n); save(n, forceSave);
  }, [save]);

  const ped = useRef<Pedometer | null>(null);
  const pedTimer = useRef<number | null>(null);
  const stopPedo = () => { ped.current?.stop(); ped.current = null; if (pedTimer.current) { clearTimeout(pedTimer.current); pedTimer.current = null; } };
  const startPedo = () => {
    const st = ref.current;
    if (st.type === 'cycle' || st.type === 'indoor-cycle' || st.status !== 'recording' || ped.current) return;
    if (st.motion !== 'granted' && st.motion !== 'waiting') return;
    const p = new Pedometer((n) => update((x) => ({ ...x, steps: n })), st.type === 'run' ? { minIntervalMs: 230 } : {});
    p.start(st.steps); ped.current = p;
    // No samples within 4 s → this device/browser has no usable accelerometer: fall back to the GPS estimate
    pedTimer.current = window.setTimeout(() => { if (ped.current && ped.current.samples === 0) { stopPedo(); update((x) => ({ ...x, motion: 'no-data' }), true); } else if (ped.current) update((x) => ({ ...x, motion: 'granted' }), true); }, 4000);
  };
  const stopWatch = () => { if (watch.current != null) navigator.geolocation.clearWatch(watch.current); watch.current = null; };

  const onPos = useCallback((pos: GeolocationPosition) => {
    const st = ref.current;
    if (st.status !== 'recording') return;
    const { latitude: lat, longitude: lng, accuracy, altitude, altitudeAccuracy } = pos.coords;
    const t = pos.timestamp || Date.now();
    if (!lat && !lng) return;
    if (accuracy > MAX_ACC) { update((x) => ({ ...x, lastAcc: accuracy, dropped: x.dropped + 1, lastFixAt: t })); return; }
    const p: RoutePoint = { lat, lng, alt: altitude, t, acc: Math.round(accuracy) };
    saveLastPos(p); // maps open here next time (throttled)
    if (st.error) update((x) => ({ ...x, error: '' }));
    update((x) => {
      const segs = x.segments.map((sg) => sg);
      let seg = segs[segs.length - 1];
      const prev = seg?.[seg.length - 1];
      let dist = x.distanceM, elev = x.elevGainM, splits = x.splits, gaps = x.gaps, autoPaused = x.autoPaused, pausedAt = x.pausedAt, acc = x.accPauseMs;
      const stamp = (q: RoutePoint, d0: number, accMs = x.accPauseMs, pAt = x.pausedAt): RoutePoint => ({ ...q, e: Math.round(elapsedMs({ ...x, accPauseMs: accMs, pausedAt: pAt })), d: Math.round(d0 * 10) / 10 });
      if (!seg || !prev) { const q = stamp(p, x.distanceM); if (seg && !seg.length) segs[segs.length - 1] = [q]; else segs.push([q]); lastMoveAt.current = t; return { ...x, segments: segs, lastAcc: accuracy, lastFixAt: t }; }
      const dt = (t - prev.t) / 1000;
      if (dt <= 0) return x;
      const d = haversine(prev, p);
      if (dt > GAP_SEC) {
        // gap: start a new segment, never add the straight-line distance
        segs.push([stamp(p, x.distanceM)]);
        gaps = [...gaps, { at: prev.t, sec: Math.round(dt) }];
        lastMoveAt.current = t;
        return { ...x, segments: segs, gaps, lastAcc: accuracy, lastFixAt: t };
      }
      if (d / dt > MAX_SPEED[x.type]) return { ...x, dropped: x.dropped + 1, lastAcc: accuracy, lastFixAt: t };
      const minMove = Math.max(3, accuracy * 0.4);
      if (d < minMove) return { ...x, lastAcc: accuracy, lastFixAt: t }; // jitter
      if (d / dt >= MOVE_SPEED[x.type] * 0.6 || d > 12) {
        lastMoveAt.current = t;
        if (autoPaused && pausedAt) { acc += Date.now() - pausedAt; autoPaused = false; pausedAt = null; cue('go'); say('Resumed'); }
      }
      const before = dist; dist += d;
      seg = [...seg, stamp(p, dist, acc, pausedAt)]; segs[segs.length - 1] = seg;
      // elevation gain with 3 m hysteresis, only when the device reports a usable altitude
      if (altitude != null && (altitudeAccuracy == null || altitudeAccuracy < 20)) {
        if (altRef.current == null) altRef.current = altitude;
        else if (altitude - altRef.current > 3) { elev += altitude - altRef.current; altRef.current = altitude; }
        else if (altRef.current - altitude > 3) altRef.current = altitude;
      }
      // auto splits per km / mi
      if (Math.floor(dist / x.splitUnitM) > Math.floor(before / x.splitUnitM)) {
        splits = splitsFromTrack(segs, x.splitUnitM);
        const last = splits[splits.length - 1];
        if (last) { cue('go'); say(`${x.splitUnitM > 1500 ? 'Mile' : 'Kilometer'} ${last.label}. ${Math.floor(last.sec / 60)} minutes ${last.sec % 60} seconds`); }
      }
      return { ...x, segments: segs, distanceM: dist, elevGainM: elev, splits, autoPaused, pausedAt, accPauseMs: acc, lastAcc: accuracy, lastFixAt: t };
    });
  }, [update]);

  const onErr = useCallback((e: GeolocationPositionError) => {
    const msg = e.code === 1 ? 'Location permission denied. Allow location for this site in your browser settings (on iPhone: Settings › Privacy & Security › Location Services › Safari Websites, or the HYBRD Home Screen app).'
      : e.code === 2 ? 'No GPS signal yet — head outside with a clear view of the sky.' : 'GPS timed out — still trying…';
    update((x) => ({ ...x, error: msg }), true);
    if (e.code === 1) cue('warn');
  }, [update]);

  const startWatch = useCallback(() => {
    if (ref.current.indoor) return;
    if (!('geolocation' in navigator)) { update((x) => ({ ...x, error: 'This browser has no GPS/geolocation support.' })); return; }
    stopWatch();
    watch.current = navigator.geolocation.watchPosition(onPos, onErr, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
  }, [onPos, onErr, update]);

  // UI refresh + auto-pause watchdog
  useEffect(() => {
    if (s.status === 'idle') return;
    const id = window.setInterval(() => {
      const st = ref.current;
      if (st.status === 'recording' && st.autoPause && !st.indoor && !st.autoPaused && lastMoveAt.current && Date.now() - lastMoveAt.current > AUTO_PAUSE_SEC * 1000 && st.segments.length) {
        update((x) => ({ ...x, autoPaused: true, pausedAt: lastMoveAt.current }), true);
        cue('rest'); say('Auto paused');
      }
      force((n) => n + 1);
    }, 500);
    return () => window.clearInterval(id);
  }, [s.status, update]);

  // When the page becomes visible again after a lock, recompute; and record a gap if GPS was silent
  useEffect(() => {
    const v = () => { if (document.visibilityState === 'visible') force((n) => n + 1); };
    document.addEventListener('visibilitychange', v);
    return () => document.removeEventListener('visibilitychange', v);
  }, []);

  const setup: Ctx['setup'] = (p) => update((x) => {
    const n = { ...x, ...p };
    if (n.type === 'indoor-cycle') { n.indoor = true; n.autoPause = false; }
    else if (p.type && p.type !== 'indoor-cycle' && x.type === 'indoor-cycle') {
      n.indoor = p.indoor ?? false;
      n.autoPause = p.autoPause ?? true;
    }
    // Unit switched mid-session: rebuild splits for the new unit from the raw points (nothing is lost).
    if (p.splitUnitM && p.splitUnitM !== x.splitUnitM && x.status !== 'idle') n.splits = splitsFromTrack(x.segments, p.splitUnitM);
    return n;
  }, true);
  const start = () => {
    const base = ref.current;
    const now = Date.now();
    lastMoveAt.current = now; altRef.current = null;
    update(() => ({ ...fresh(base.type, base.splitUnitM, base.bikeKind), indoor: base.type === 'indoor-cycle' || base.indoor, autoPause: base.type === 'indoor-cycle' ? false : base.autoPause, bikeKind: base.bikeKind || 'indoor', motion: base.motion === 'denied' || base.motion === 'unsupported' ? base.motion : 'unknown', status: 'recording', startedAt: now }), true);
    release.current?.(); release.current = acquireWakeLock();
    startWatch(); cue('go'); say('Workout started');
    startPedo();
  };
  const pause = () => {
    stopWatch(); stopPedo();
    update((x) => ({ ...x, status: 'paused', pausedAt: x.pausedAt ?? Date.now(), autoPaused: false }), true);
    cue('rest');
  };
  const resume = () => {
    lastMoveAt.current = Date.now();
    update((x) => ({ ...x, status: 'recording', accPauseMs: x.accPauseMs + (x.pausedAt ? Date.now() - x.pausedAt : 0), pausedAt: null, autoPaused: false, restored: false, segments: [...x.segments, []].filter((sg, i, a) => sg.length || i === a.length - 1) }), true);
    release.current?.(); release.current = acquireWakeLock();
    startWatch(); cue('go');
    startPedo();
  };
  const finish = () => {
    stopWatch(); stopPedo(); release.current?.(); release.current = null;
    const final = { ...ref.current, pausedAt: ref.current.pausedAt ?? Date.now() };
    localStorage.removeItem(LS);
    const next = { ...fresh(final.type, final.splitUnitM, final.bikeKind), indoor: final.indoor, autoPause: final.autoPause, bikeKind: final.bikeKind };
    ref.current = next; setS(next);
    cue('done');
    return final;
  };
  const discard = () => { stopWatch(); stopPedo(); release.current?.(); release.current = null; localStorage.removeItem(LS); const n = { ...fresh(ref.current.type, ref.current.splitUnitM), indoor: ref.current.indoor, autoPause: ref.current.autoPause }; ref.current = n; setS(n); };

  const currentPaceSec = () => {
    const seg = ref.current.segments[ref.current.segments.length - 1] || [];
    if (seg.length < 2 || ref.current.autoPaused) return 0;
    const last = seg[seg.length - 1];
    let d = 0, i = seg.length - 1;
    while (i > 0 && last.t - seg[i - 1].t <= 30000) { d += haversine(seg[i - 1], seg[i]); i--; }
    const dt = (last.t - seg[i].t) / 1000;
    return d > 10 && dt > 0 ? dt / d : 0;
  };

  const setMotion = (m: MotionStatus) => {
    if (m === 'granted') { if (ref.current.motion !== 'granted') update((x) => ({ ...x, motion: 'waiting' }), true); startPedo(); }
    else update((x) => ({ ...x, motion: m }), true);
  };
  const sensorCadence = () => (ped.current ? ped.current.cadence() : 0);
  useEffect(() => () => { stopWatch(); stopPedo(); release.current?.(); }, []);
  return <C.Provider value={{ s, setup, start, pause, resume, finish, discard, currentPaceSec, setMotion, sensorCadence }}>{children}</C.Provider>;
}
