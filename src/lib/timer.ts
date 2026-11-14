import { useCallback, useEffect, useRef, useState } from 'react';
import { acquireWakeLock, cue, say, unlockAudio } from './cues';

/** Timestamps are the source of truth (survive reloads, background tabs and crashes). */
export interface ClockState { startedAt: number; pausedAt: number | null; accPauseMs: number; running: boolean }
export const clockMs = (c: ClockState, now = Date.now()) => (c.startedAt ? (c.pausedAt ?? now) - c.startedAt - c.accPauseMs : 0);
const idle = (): ClockState => ({ startedAt: 0, pausedAt: null, accPauseMs: 0, running: false });

function usePersisted<T>(key: string, init: () => T): [T, (v: T | ((p: T) => T)) => void] {
  const [v, setV] = useState<T>(() => { try { const j = localStorage.getItem(key); return j ? { ...init(), ...JSON.parse(j) } : init(); } catch { return init(); } });
  const set = useCallback((n: T | ((p: T) => T)) => setV((p) => { const val = typeof n === 'function' ? (n as (p: T) => T)(p) : n; try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* ignore */ } return val; }), [key]);
  return [v, set];
}
export function useTick(active: boolean, ms = 100) {
  const [, f] = useState(0);
  useEffect(() => { if (!active) return; const id = window.setInterval(() => f((n) => n + 1), ms); const v = () => f((n) => n + 1); document.addEventListener('visibilitychange', v); return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', v); }; }, [active, ms]);
}
function useWake(active: boolean) { useEffect(() => (active ? acquireWakeLock() : undefined), [active]); }

export function useClock(key: string) {
  const [c, setC] = usePersisted<ClockState & { laps: number[] }>(key, () => ({ ...idle(), laps: [] }));
  const active = !!c.startedAt && c.running;
  useTick(active, 47); useWake(active);
  return {
    c, ms: clockMs(c), active,
    start: () => { unlockAudio(); setC({ ...idle(), running: true, startedAt: Date.now(), laps: [] }); cue('go'); },
    pause: () => setC((p) => ({ ...p, running: false, pausedAt: Date.now() })),
    resume: () => { unlockAudio(); setC((p) => ({ ...p, running: true, accPauseMs: p.accPauseMs + (p.pausedAt ? Date.now() - p.pausedAt : 0), pausedAt: null })); },
    reset: () => setC({ ...idle(), laps: [] }),
    lap: () => { setC((p) => ({ ...p, laps: [...p.laps, clockMs(p)] })); cue('tick'); },
  };
}

export interface Phase { label: string; sec: number; kind: 'prep' | 'work' | 'rest'; round?: number; of?: number }
export function useSequence(key: string, phases: Phase[], opts: { countIn?: boolean } = {}) {
  const [c, setC] = usePersisted<ClockState & { sig: string; rounds: number }>(key, () => ({ ...idle(), sig: '', rounds: 0 }));
  const sig = phases.map((p) => `${p.kind}${p.sec}`).join('|');
  const seq: Phase[] = opts.countIn === false ? phases : [{ label: 'Get ready', sec: 5, kind: 'prep' }, ...phases];
  const total = seq.reduce((a, p) => a + p.sec, 0) * 1000;
  const startedForThis = c.startedAt && c.sig === sig;
  const ms = startedForThis ? Math.min(total, clockMs(c)) : 0;
  const done = !!startedForThis && ms >= total;
  const active = !!startedForThis && c.running && !done;
  useTick(active, 100); useWake(active);
  let acc = 0, idx = 0;
  for (; idx < seq.length; idx++) { if (ms < (acc + seq[idx].sec * 1000)) break; acc += seq[idx].sec * 1000; }
  const phase = seq[Math.min(idx, seq.length - 1)];
  const remain = done ? 0 : Math.max(0, acc + phase.sec * 1000 - ms);

  // cues
  const last = useRef({ idx: -1, sec: -1, key: '' });
  useEffect(() => {
    if (!startedForThis) { last.current = { idx: -1, sec: -1, key: '' }; return; }
    const l = last.current;
    const remS = Math.ceil(remain / 1000);
    if (l.key !== String(c.startedAt)) { last.current = { idx, sec: remS, key: String(c.startedAt) }; return; } // restored: no replay
    if (done && l.idx !== -2) { cue('done'); say('Done. Great work.'); last.current = { ...l, idx: -2 }; return; }
    if (idx !== l.idx && !done) {
      if (phase.kind === 'work') { cue('go'); say(phase.label); } else if (phase.kind === 'rest') { cue('rest'); say('Rest'); }
      last.current = { ...l, idx, sec: remS }; return;
    }
    if (remS !== l.sec) { if (remS <= 3 && remS > 0 && c.running) cue('tick'); last.current = { ...l, sec: remS }; }
  });

  return {
    seq, phase, idx, ms, total, remain, done, active, started: !!startedForThis, running: c.running, rounds: c.rounds,
    start: () => { unlockAudio(); setC({ ...idle(), running: true, startedAt: Date.now(), sig, rounds: 0 }); },
    pause: () => setC((p) => ({ ...p, running: false, pausedAt: Date.now() })),
    resume: () => { unlockAudio(); setC((p) => ({ ...p, running: true, accPauseMs: p.accPauseMs + (p.pausedAt ? Date.now() - p.pausedAt : 0), pausedAt: null })); },
    reset: () => setC({ ...idle(), sig: '', rounds: 0 }),
    addRound: (n = 1) => { setC((p) => ({ ...p, rounds: Math.max(0, p.rounds + n) })); if (n > 0) cue('tick'); },
  };
}
export { usePersisted };
