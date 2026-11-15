/**
 * Personal intensity targets for Expert sessions.
 *
 * Running — Daniels' Running Formula (J. Daniels, 3rd ed., Human Kinetics 2014) VDOT concepts, using the
 * Daniels & Gilbert (1979, "Oxygen Power") equations:
 *   VO2 (ml/kg/min) at velocity v (m/min) = −4.60 + 0.182258·v + 0.000104·v²
 *   fraction of VO2max sustainable for t minutes = 0.8 + 0.1894393·e^(−0.012778·t) + 0.2989558·e^(−0.1932605·t)
 *   VDOT = VO2(race velocity) / fraction(race time)
 * Training intensities as fractions of VDOT, matching Daniels' tables: E ≈ 59–74 %, T ≈ 88 %, I ≈ 97.5 %.
 * M = predicted marathon race pace. R ≈ I pace minus 6 s per 400 m (Daniels' rule of thumb).
 * These are estimates from one race result, not a lab test.
 *
 * Cycling — Coggan power levels as % of FTP (H. Allen & A. Coggan, Training and Racing with a Power Meter,
 * 3rd ed., VeloPress 2019): L1 < 55 %, L2 56–75 %, L3 76–90 %, L4 91–105 %, L5 106–120 %, L6 121–150 %.
 * "Sweet spot" ≈ 88–94 % FTP. 20-min test: FTP ≈ 95 % of the 20-min average power.
 */
import type { Profile, Units } from './types';
// Kept dependency-free (type imports only) so tools/test-expert.ts can run under plain Node.
const KM_PER_MI = 1.609344;
function fmtTime(sec: number) {
  const s = Math.max(0, Math.round(sec)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}

export type PaceKey = 'E' | 'M' | 'T' | 'I' | 'R';
export const PACE_INFO: Record<PaceKey, { name: string; rpe: string; desc: string }> = {
  E: { name: 'Easy', rpe: 'RPE 3–4', desc: 'Conversational; most of your weekly running.' },
  M: { name: 'Marathon', rpe: 'RPE 5–6', desc: 'Your current marathon race pace.' },
  T: { name: 'Threshold', rpe: 'RPE 7', desc: '“Comfortably hard” — about the pace you could race for roughly an hour.' },
  I: { name: 'Interval', rpe: 'RPE 8–9', desc: 'VO2max work: hard, about 3K–5K race effort.' },
  R: { name: 'Repetition', rpe: 'RPE 9', desc: 'Fast, relaxed speed with full recovery.' },
};

export const vo2At = (vMpm: number) => -4.6 + 0.182258 * vMpm + 0.000104 * vMpm * vMpm;
export const fracAt = (tMin: number) => 0.8 + 0.1894393 * Math.exp(-0.012778 * tMin) + 0.2989558 * Math.exp(-0.1932605 * tMin);
export function vdot(distM: number, sec: number) {
  if (!(distM > 0) || !(sec > 0)) return 0;
  const t = sec / 60;
  return vo2At(distM / t) / fracAt(t);
}
/** velocity (m/min) that costs `vo2` ml/kg/min */
export function velAt(vo2: number) {
  const a = 0.000104, b = 0.182258, c = -4.6 - vo2;
  return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
}
/** Race time (s) predicted for `distM` at a given VDOT (bisection; VDOT falls as time rises). */
export function predictSec(v: number, distM: number) {
  let lo = distM / 600 * 60, hi = distM / 50 * 60; // 600 m/min … 50 m/min
  for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (vdot(distM, mid) > v) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}
const spk = (vMpm: number) => 60000 / vMpm; // sec per km

export interface Paces { vdot: number; E: [number, number]; M: number; T: number; I: number; R: number } // sec per km; E = [slow, fast]
export function trainingPaces(distM: number, sec: number): Paces | null {
  const v = vdot(distM, sec);
  if (!(v > 20 && v < 90)) return null;
  const I = spk(velAt(0.975 * v));
  return {
    vdot: v,
    E: [spk(velAt(0.59 * v)), spk(velAt(0.74 * v))],
    M: predictSec(v, 42195) / 42.195,
    T: spk(velAt(0.88 * v)),
    I,
    R: I - 15, // 6 s per 400 m = 15 s per km
  };
}
export const paceFor = (pp: Paces, k: PaceKey) => (k === 'E' ? (pp.E[0] + pp.E[1]) / 2 : pp[k]);
export const perUnit = (secPerKm: number, u: Units) => (u === 'imperial' ? secPerKm * KM_PER_MI : secPerKm);
export const fmtPaceKm = (secPerKm: number, u: Units) => `${fmtTime(Math.round(perUnit(secPerKm, u)))} /${u === 'imperial' ? 'mi' : 'km'}`;
export function paceText(pp: Paces | null, k: PaceKey, u: Units) {
  if (!pp) return `${k} pace · ${PACE_INFO[k].rpe}`;
  if (k === 'E') return `E ${fmtTime(Math.round(perUnit(pp.E[1], u)))}–${fmtPaceKm(pp.E[0], u)}`;
  return `${k} ${fmtPaceKm(paceFor(pp, k), u)}`;
}
export const RACE_REFS = [
  { m: 1609.344, label: '1 mile' }, { m: 5000, label: '5K' }, { m: 10000, label: '10K' }, { m: 21097.5, label: 'Half marathon' }, { m: 42195, label: 'Marathon' },
];
export const profilePaces = (p: Pick<Profile, 'runRef'>) => (p.runRef ? trainingPaces(p.runRef.distM, p.runRef.sec) : null);

// ---------- cycling ----------
export const COGGAN = [
  { l: 'L1', name: 'Active recovery', lo: 0, hi: 55, rpe: 'RPE 1–2' },
  { l: 'L2', name: 'Endurance', lo: 56, hi: 75, rpe: 'RPE 3–4' },
  { l: 'L3', name: 'Tempo', lo: 76, hi: 90, rpe: 'RPE 5–6' },
  { l: 'SS', name: 'Sweet spot', lo: 88, hi: 94, rpe: 'RPE 6–7' },
  { l: 'L4', name: 'Threshold', lo: 91, hi: 105, rpe: 'RPE 7–8' },
  { l: 'L5', name: 'VO2max', lo: 106, hi: 120, rpe: 'RPE 8–9' },
  { l: 'L6', name: 'Anaerobic', lo: 121, hi: 150, rpe: 'RPE 9–10' },
];
/** RPE fallback for a %FTP range (used when no FTP or no power meter). */
export function rpeForFtp([lo, hi]: [number, number]) {
  const mid = (lo + hi) / 2;
  return mid < 56 ? 'RPE 1–2' : mid < 76 ? 'RPE 3–4' : mid < 88 ? 'RPE 5–6' : mid < 95 ? 'RPE 6–7' : mid < 106 ? 'RPE 7–8' : mid < 121 ? 'RPE 8–9' : 'RPE 9–10';
}
export function ftpText(range: [number, number], ftp?: number) {
  const pct = range[0] === range[1] ? `${range[0]}% FTP` : `${range[0]}–${range[1]}% FTP`;
  if (ftp && ftp > 50) {
    const w = range[0] === range[1] ? `${Math.round((ftp * range[0]) / 100)} W` : `${Math.round((ftp * range[0]) / 100)}–${Math.round((ftp * range[1]) / 100)} W`;
    return `${pct} · ${w}`;
  }
  return `${pct} · ${rpeForFtp(range)}`;
}

// ---------- resolving a block / plan step ----------
export interface Intensity { pace?: PaceKey; ftp?: [number, number]; rpe?: string }
export function intensityText(x: Intensity, p: Pick<Profile, 'runRef' | 'ftp' | 'units'>) {
  if (x.pace) return paceText(profilePaces(p), x.pace, p.units);
  if (x.ftp) return ftpText(x.ftp, p.ftp);
  return x.rpe || '';
}

export interface PlanStep extends Intensity { label: string; sec: number; kind: 'work' | 'rest'; distM?: number; round?: number; of?: number; note?: string }
/** Seconds for a step: distance × personal pace when a race reference is set, otherwise the step's default. */
export function stepSec(s: PlanStep, p: Pick<Profile, 'runRef'>) {
  const pp = profilePaces(p);
  if (s.distM && s.pace && pp) return Math.round((s.distM / 1000) * paceFor(pp, s.pace));
  return s.sec;
}
