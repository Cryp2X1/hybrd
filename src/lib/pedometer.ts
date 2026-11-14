/**
 * Browser pedometer: DeviceMotion accelerometer → low-pass filter → gravity removal →
 * peak detection with a dynamic threshold and a minimum step interval.
 * Only works while the page is open and the screen is on (browsers stop motion events in the background).
 */
/** unknown → (tap) → waiting → granted (samples arriving) | no-data (none in 4 s); or denied / unsupported */
export type MotionStatus = 'unknown' | 'waiting' | 'granted' | 'denied' | 'unsupported' | 'no-data';

type PermFn = () => Promise<'granted' | 'denied' | 'default'>;
const permFn = (): PermFn | null => {
  const D = (typeof window !== 'undefined' ? (window as unknown as { DeviceMotionEvent?: { requestPermission?: PermFn } }).DeviceMotionEvent : undefined);
  return D && typeof D.requestPermission === 'function' ? D.requestPermission.bind(D) : null;
};
export const motionSupported = () => typeof window !== 'undefined' && 'DeviceMotionEvent' in window;
export const motionNeedsPermission = () => !!permFn();

/** Call directly from a tap handler (iOS 13+ requires a user gesture). */
export async function requestMotionPermission(): Promise<MotionStatus> {
  if (!motionSupported()) return 'unsupported';
  const fn = permFn();
  if (!fn) return 'granted'; // Android / desktop Chrome: no prompt needed
  try { return (await fn()) === 'granted' ? 'granted' : 'denied'; } catch { return 'denied'; }
}

export interface PedoOpts { minIntervalMs?: number; maxIntervalMs?: number; minAmp?: number }
export class Pedometer {
  steps = 0;
  private lp: number | null = null;     // low-passed magnitude
  private grav: number | null = null;   // slow baseline (gravity)
  private prev = 0; private prev2 = 0;  // last two detrended samples
  private lastStepAt = 0;
  private ampEnv = 1.2;                 // running envelope of recent peak heights (m/s²)
  private times: number[] = [];         // recent step timestamps for cadence
  samples = 0;
  private handler = (e: DeviceMotionEvent) => this.onMotion(e);
  private opts: Required<PedoOpts>;
  private onStep: (steps: number) => void;
  constructor(onStep: (steps: number) => void, opts: PedoOpts = {}) {
    this.onStep = onStep;
    this.opts = { minIntervalMs: 250, maxIntervalMs: 2000, minAmp: 0.6, ...opts };
  }
  start(initialSteps = 0) { this.steps = initialSteps; window.addEventListener('devicemotion', this.handler); }
  stop() { window.removeEventListener('devicemotion', this.handler); }
  /** Feed one sample (exported for tests). t in ms. */
  push(x: number, y: number, z: number, t: number) {
    const mag = Math.sqrt(x * x + y * y + z * z);
    if (!Number.isFinite(mag)) return;
    this.samples++;
    this.lp = this.lp == null ? mag : this.lp + 0.35 * (mag - this.lp);       // low-pass (≈ 4–5 Hz at 60 Hz sampling)
    this.grav = this.grav == null ? mag : this.grav + 0.02 * (mag - this.grav); // gravity / slow drift
    const v = this.lp - this.grav;
    // local maximum at the previous sample?
    if (this.prev > this.prev2 && this.prev >= v) {
      const thr = Math.max(this.opts.minAmp, this.ampEnv * 0.45);           // dynamic threshold
      const dt = t - this.lastStepAt;
      if (this.prev > thr && dt >= this.opts.minIntervalMs) {
        this.steps++; this.lastStepAt = t;
        this.times.push(t); if (this.times.length > 24) this.times.shift();
        this.ampEnv = this.ampEnv * 0.8 + this.prev * 0.2;
        this.onStep(this.steps);
      } else if (this.prev > this.opts.minAmp) {
        this.ampEnv = this.ampEnv * 0.95 + this.prev * 0.05;
      }
    }
    if (t - this.lastStepAt > 3000) this.ampEnv = Math.max(1.2, this.ampEnv * 0.995); // relax after stopping
    this.prev2 = this.prev; this.prev = v;
  }
  /** Steps per minute from the recent step intervals (0 if stopped). */
  cadence(now = performance.now()) {
    const ts = this.times.filter((t) => now - t < 12000);
    if (ts.length < 4 || now - ts[ts.length - 1] > this.opts.maxIntervalMs) return 0;
    const iv: number[] = [];
    for (let i = 1; i < ts.length; i++) { const d = ts[i] - ts[i - 1]; if (d <= this.opts.maxIntervalMs) iv.push(d); }
    if (!iv.length) return 0;
    iv.sort((a, b) => a - b);
    return Math.round(60000 / iv[Math.floor(iv.length / 2)]);
  }
  private onMotion(e: DeviceMotionEvent) {
    const a = e.accelerationIncludingGravity;
    if (!a || a.x == null || a.y == null || a.z == null) return;
    this.push(a.x, a.y, a.z, e.timeStamp || performance.now());
  }
}
