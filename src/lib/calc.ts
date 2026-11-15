import type { DataState, FoodEntry, Profile, RoutePoint, Units, Workout, WorkoutType } from './types';

// ---------- units & formatting ----------
export const KM_PER_MI = 1.609344;
export const LB_PER_KG = 2.2046226218;
export const distUnit = (u: Units) => (u === 'imperial' ? 'mi' : 'km');
export const wUnit = (u: Units) => (u === 'imperial' ? 'lb' : 'kg');
export const toDist = (m: number, u: Units) => (u === 'imperial' ? m / 1000 / KM_PER_MI : m / 1000);
export const fromDist = (v: number, u: Units) => (u === 'imperial' ? v * KM_PER_MI * 1000 : v * 1000);
export const toW = (kg: number, u: Units) => (u === 'imperial' ? kg * LB_PER_KG : kg);
export const fromW = (v: number, u: Units) => (u === 'imperial' ? v / LB_PER_KG : v);
export const fmtDist = (m: number, u: Units, d = 2) => `${toDist(m, u).toFixed(d)} ${distUnit(u)}`;
export const fmtW = (kg: number, u: Units) => `${Math.round(toW(kg, u) * 10) / 10} ${wUnit(u)}`;
export function fmtTime(sec: number, forceH = false) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const mm = String(m).padStart(h || forceH ? 2 : 1, '0'), ss = String(s).padStart(2, '0');
  return h || forceH ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
export function fmtMs(ms: number) {
  const t = Math.max(0, ms);
  return `${fmtTime(t / 1000)}.${String(Math.floor((t % 1000) / 10)).padStart(2, '0')}`;
}
/** pace in sec per unit distance */
export function paceSec(sec: number, m: number, u: Units) { const d = toDist(m, u); return d > 0.01 ? sec / d : 0; }
export const fmtPace = (secPerUnit: number, u: Units) => (secPerUnit > 0 && secPerUnit < 3600 ? `${fmtTime(secPerUnit)} /${distUnit(u)}` : '—');
export const FT_PER_M = 3.280839895;
export const YD_PER_M = 1.0936132983;
/** split length in metres for the distance system */
export const splitUnitM = (u: Units) => (u === 'imperial' ? KM_PER_MI * 1000 : 1000);
export const elevUnit = (u: Units) => (u === 'imperial' ? 'ft' : 'm');
export const toElev = (m: number, u: Units) => (u === 'imperial' ? m * FT_PER_M : m);
export const fmtElev = (m: number, u: Units) => `${Math.round(toElev(m, u))} ${elevUnit(u)}`;
export const speedUnit = (u: Units) => (u === 'imperial' ? 'mph' : 'km/h');
export const toSpeed = (mps: number, u: Units) => (u === 'imperial' ? mps * 2.236936 : mps * 3.6);
/** short distances (sled, carries, station work): yd or m */
export const shortUnit = (u: Units) => (u === 'imperial' ? 'yd' : 'm');
export const toShort = (m: number, u: Units) => (u === 'imperial' ? m * YD_PER_M : m);
export const fromShort = (v: number, u: Units) => (u === 'imperial' ? v / YD_PER_M : v);
export const fmtShort = (m: number, u: Units) => `${Math.round(toShort(m, u))} ${shortUnit(u)}`;
/** Official metric race distance with the imperial equivalent when the user is on miles. */
export const fmtOfficial = (m: number, u: Units) => (u === 'imperial' ? `${m >= 1000 ? `${m / 1000} km` : `${m} m`} (${m >= 400 ? `${toDist(m, u).toFixed(2)} mi` : `${Math.round(m * YD_PER_M)} yd`})` : m >= 1000 ? `${m / 1000} km` : `${m} m`);
/** Weight unit system: follows the separate lb/kg choice if set, else the distance system. */
export const wu = (p: { units: Units; weightUnit?: 'lb' | 'kg' }): Units => (p.weightUnit ? (p.weightUnit === 'lb' ? 'imperial' : 'metric') : p.units);
/** Default units from the browser locale: miles/lb for the US (and LR, MM), metric elsewhere. */
export function localeUnits(): Units {
  try {
    const langs = (typeof navigator !== 'undefined' && (navigator.languages?.length ? navigator.languages : [navigator.language])) || [];
    const region = (langs[0] || '').split('-')[1]?.toUpperCase() || (Intl.DateTimeFormat().resolvedOptions().locale.split('-')[1] || '').toUpperCase();
    return ['US', 'LR', 'MM'].includes(region) ? 'imperial' : region ? 'metric' : 'imperial';
  } catch { return 'imperial'; }
}

/**
 * Recompute whole splits for any unit from raw GPS points (metric). Uses each point's active clock (e) and
 * cumulative distance (d) when present; otherwise rebuilds them from the points (no time or distance across gaps).
 */
export function splitsFromTrack(segments: RoutePoint[][], unitM: number): { label: string; sec: number; distanceM: number }[] {
  const pts: { d: number; e: number }[] = [];
  let D = 0, E = 0;
  for (const seg of segments) {
    for (let i = 0; i < seg.length; i++) {
      const p = seg[i];
      if (p.e != null && p.d != null) { D = p.d; E = p.e; }
      else if (i > 0) { D += haversine(seg[i - 1], p); E += Math.max(0, p.t - seg[i - 1].t); }
      pts.push({ d: D, e: E });
    }
  }
  const out: { label: string; sec: number; distanceM: number }[] = [];
  let next = unitM, lastE = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    while (b.d >= next && b.d > a.d) {
      const f = (next - a.d) / (b.d - a.d);
      const at = a.e + f * (b.e - a.e);
      out.push({ label: String(out.length + 1), sec: Math.round((at - lastE) / 1000), distanceM: unitM });
      lastE = at; next += unitM;
    }
  }
  return out;
}

/** HYROX/official text is metric; show imperial equivalents in brackets when the user is on mi / lb. */
export function localizeOfficial(text: string, u: Units, wU: Units = u) {
  let t = text;
  if (wU === 'imperial') t = t.replace(/(\d+(?:\.\d+)?) kg/g, (_, v) => `${v} kg (${Math.round(+v * LB_PER_KG)} lb)`);
  if (u === 'imperial') t = t.replace(/(\d+\.\d+) m target/g, (_, v) => `${v} m (${(+v * FT_PER_M).toFixed(1)} ft) target`);
  return t;
}
export const officialWork = (work: string, distanceM: number | undefined, u: Units) => (u === 'imperial' && distanceM ? `${work} ≈ ${Math.round(distanceM * YD_PER_M)} yd` : work);

export const fmtSpeed = (mps: number, u: Units) => `${(u === 'imperial' ? mps * 2.236936 : mps * 3.6).toFixed(1)} ${u === 'imperial' ? 'mph' : 'km/h'}`;

export const todayKey = (d = new Date()) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
};
export const dayKeyOf = (iso: string) => todayKey(new Date(iso));
export const addDays = (key: string, n: number) => { const d = new Date(key + 'T12:00:00'); d.setDate(d.getDate() + n); return todayKey(d); };
export const prettyDay = (key: string) => new Date(key + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

// ---------- energy ----------
/** Mifflin-St Jeor (1990) resting energy expenditure, kcal/day */
export function bmr(p: Pick<Profile, 'sex' | 'weightKg' | 'heightCm' | 'age'>) {
  return 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age + (p.sex === 'male' ? 5 : -161);
}
export const ACTIVITY_LEVELS = [
  { v: 1.2, label: 'Sedentary', hint: 'Desk job, little exercise' },
  { v: 1.375, label: 'Light', hint: 'Exercise 1–3 days/week' },
  { v: 1.55, label: 'Moderate', hint: 'Exercise 3–5 days/week' },
  { v: 1.725, label: 'Very active', hint: 'Hard training 6–7 days/week' },
  { v: 1.9, label: 'Athlete', hint: 'Twice a day or physical job + training' },
] as const;

export interface Targets { kcal: number; protein: number; carbs: number; fat: number; waterMl: number; tdee: number; bmr: number }
export function computeTargets(p: Profile): Targets {
  const b = bmr(p), tdee = b * p.activity;
  const kcal = Math.round((p.goal === 'lose' ? tdee * 0.8 : p.goal === 'gain' ? tdee * 1.1 : tdee) / 10) * 10;
  // ISSN protein position stand: 1.4–2.0 g/kg/day for most exercising people (higher end while dieting)
  const protein = Math.round(p.weightKg * (p.goal === 'lose' ? 2.0 : p.goal === 'gain' ? 1.8 : 1.6));
  const fat = Math.round((kcal * 0.27) / 9);
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  // NASEM Adequate Intake total water 3.7 L (men) / 2.7 L (women); ~80% typically comes from drinks
  const waterMl = p.sex === 'male' ? 3000 : 2200;
  const t = p.targets || {};
  return {
    kcal: t.kcal || kcal, protein: t.protein || protein, fat: t.fat || fat, carbs: t.carbs || carbs,
    waterMl: t.waterMl || waterMl, tdee: Math.round(tdee), bmr: Math.round(b),
  };
}

/**
 * Stationary / indoor cycling METs by effort, from the 2011 Compendium of Physical Activities
 * (Ainsworth BE et al., Med Sci Sports Exerc 2011;43(8):1575–1581, codes 02011, 02017, 02012–02014).
 * The 2024 Adult Compendium (Herrmann SD et al., J Sport Health Sci 2024;13(1):6–12) keeps these
 * codes and adds finer watt bins (e.g. 5.0 METs at 60 W, 5.8 at 70–80 W). When no power is
 * entered we use the published 2011 effort buckets, not a blend:
 *   02011  3.5 METs  30–50 W, very light to light
 *   02017  4.8 METs  51–89 W, light-to-moderate
 *   02012  6.8 METs  90–100 W, moderate to vigorous
 *   02013  8.8 METs  101–160 W, vigorous
 *   02014 11.0 METs  161–200 W, vigorous (used here as “very vigorous”)
 */
export function indoorCycleMet(rpe?: number) {
  const r = rpe ?? 5;
  if (r <= 2) return 3.5;
  if (r <= 4) return 4.8;
  if (r <= 6) return 6.8;
  if (r <= 8) return 8.8;
  return 11.0;
}
/**
 * Metabolic kcal from average mechanical power. Work (J) = watts × seconds; mechanical
 * kcal = J / 4184. Dividing by a 0.24 (24%) gross-efficiency assumption gives metabolic
 * kcal ≈ kJ × ~1.0 (4184 × 0.24 ≈ 1004). Cycling gross efficiency is typically around
 * 20–25%; this is an estimate, not a measurement. Used when the user (or a file) provides watts.
 */
export function wattsKcal(avgWatts: number, durationSec: number) {
  if (!(avgWatts > 0) || !(durationSec > 0)) return 0;
  return Math.round((avgWatts * durationSec) / 4184 / 0.24);
}

/** MET values approximated from the Compendium of Physical Activities (Ainsworth 2011; Herrmann 2024). */
export function metFor(w: Pick<Workout, 'type' | 'durationSec' | 'distanceM' | 'rpe'>) {
  const hard = (w.rpe ?? 6) >= 7, easy = (w.rpe ?? 6) <= 4;
  const kmh = w.distanceM && w.durationSec ? (w.distanceM / 1000) / (w.durationSec / 3600) : 0;
  switch (w.type) {
    case 'run': return kmh ? Math.min(19, Math.max(6, kmh * 1.02)) : hard ? 11 : 9;
    case 'walk': return kmh ? (kmh < 4 ? 2.8 : kmh < 5.2 ? 3.5 : kmh < 6 ? 4.3 : kmh < 7 ? 5.0 : 7.0) : 3.5;
    case 'cycle': return kmh ? (kmh < 16 ? 4.0 : kmh < 19 ? 6.8 : kmh < 22 ? 8.0 : kmh < 25.7 ? 10.0 : 12.0) : hard ? 8.5 : 6.8;
    case 'indoor-cycle': return indoorCycleMet(w.rpe);
    case 'strength': return hard ? 6.0 : easy ? 3.5 : 5.0;
    case 'calisthenics': return hard ? 8.0 : easy ? 3.8 : 5.5;
    case 'cardio': return hard ? 8.0 : easy ? 4.0 : 6.5;
    case 'hyrox': return hard ? 9.0 : 8.0;
    case 'hybrid': return hard ? 8.0 : 6.5;
    default: return 1;
  }
}
export const estKcal = (w: Pick<Workout, 'type' | 'durationSec' | 'distanceM' | 'rpe'>, kg: number) =>
  w.type === 'rest' ? 0 : Math.round(metFor(w) * kg * (w.durationSec / 3600));

// ---------- heart rate ----------
/** Max HR: the value set in Me, else Tanaka, Monahan & Seals (2001): 208 − 0.7 × age. */
export const hrMaxOf = (p: Pick<Profile, 'hrMax' | 'age'>) => (p.hrMax && p.hrMax > 100 ? Math.round(p.hrMax) : Math.round(208 - 0.7 * (p.age || 30)));
/** 5 zones as % of max HR (the common 50/60/70/80/90 % convention). */
export const ZONES = [
  { z: 1, name: 'Easy', lo: 0.5, color: '#60a5fa' },
  { z: 2, name: 'Aerobic', lo: 0.6, color: '#22c55e' },
  { z: 3, name: 'Tempo', lo: 0.7, color: '#FFE600' },
  { z: 4, name: 'Threshold', lo: 0.8, color: '#f97316' },
  { z: 5, name: 'Max', lo: 0.9, color: '#ef4444' },
];
export function zoneOf(bpm: number, max: number) {
  const f = bpm / max;
  for (let i = ZONES.length - 1; i >= 0; i--) if (f >= ZONES[i].lo) return ZONES[i];
  return null; // below zone 1
}
export function timeInZones(samples: [number, number][], max: number) {
  const out = [0, 0, 0, 0, 0];
  for (let i = 1; i < samples.length; i++) {
    const dt = Math.min(15, samples[i][0] - samples[i - 1][0]);
    const z = zoneOf(samples[i][1], max); if (z && dt > 0) out[z.z - 1] += dt;
  }
  return out;
}
/**
 * Keytel et al. (2005) energy expenditure from heart rate, without VO2max:
 * men  kJ/min = −55.0969 + 0.6309·HR + 0.1988·kg + 0.2017·age
 * women kJ/min = −20.4022 + 0.4472·HR − 0.1263·kg + 0.074·age   (÷ 4.184 → kcal/min)
 * Derived from submaximal steady exercise; not valid for very low HR, so it is clamped at ≥ 0.
 */
export function keytelKcalPerMin(hr: number, p: Pick<Profile, 'sex' | 'weightKg' | 'age'>) {
  const kj = p.sex === 'female'
    ? -20.4022 + 0.4472 * hr - 0.1263 * p.weightKg + 0.074 * p.age
    : -55.0969 + 0.6309 * hr + 0.1988 * p.weightKg + 0.2017 * p.age;
  return Math.max(0, kj / 4.184);
}
/** Types where the HR formula is reasonable; lifting raises HR without the same energy cost, so those stay MET-based. */
export const HR_KCAL_TYPES: WorkoutType[] = ['run', 'walk', 'cycle', 'indoor-cycle', 'cardio', 'hyrox', 'hybrid'];
/**
 * HR-based kcal when there is enough HR (≥ 50 % of the workout covered and avg ≥ 90 bpm) and the type suits it;
 * otherwise null (caller keeps the MET estimate).
 */
export function hrKcal(w: Pick<Workout, 'type' | 'durationSec' | 'hr'>, p: Pick<Profile, 'sex' | 'weightKg' | 'age'>) {
  const s = w.hr?.samples;
  if (!w.hr || !HR_KCAL_TYPES.includes(w.type) || w.hr.avg < 90 || !(w.durationSec > 0)) return null;
  if (!s || s.length < 2) return Math.round(keytelKcalPerMin(w.hr.avg, p) * (w.durationSec / 60));
  let kcal = 0, cov = 0;
  for (let i = 1; i < s.length; i++) { const dt = Math.min(15, s[i][0] - s[i - 1][0]); if (dt <= 0) continue; kcal += keytelKcalPerMin(s[i][1], p) * (dt / 60); cov += dt; }
  if (cov < w.durationSec * 0.5) return null;
  return Math.round(kcal * (w.durationSec / cov));
}
/** Sets w.kcal + w.kcalMethod: device value if present, else watts, else HR (Keytel), else MET. */
export function applyKcal<T extends Workout>(w: T, p: Profile, deviceKcal?: number): T {
  if (deviceKcal && deviceKcal > 0) { w.kcal = Math.round(deviceKcal); w.kcalMethod = 'device'; return w; }
  if (w.avgWatts && w.avgWatts > 0 && w.durationSec > 0) { w.kcal = wattsKcal(w.avgWatts, w.durationSec); w.kcalMethod = 'power'; return w; }
  const h = hrKcal(w, p);
  if (h != null) { w.kcal = h; w.kcalMethod = 'hr'; } else { w.kcal = estKcal(w, p.weightKg); w.kcalMethod = 'met'; }
  return w;
}
/** Keep at most ~n points by averaging into time buckets. */
export function downsampleHr(samples: [number, number][], n = 720): [number, number][] {
  if (samples.length <= n) return samples.map(([t, b]) => [Math.round(t), Math.round(b)]);
  const span = samples[samples.length - 1][0] - samples[0][0], step = span / n;
  const out: [number, number][] = []; let i = 0;
  for (let k = 0; k < n && i < samples.length; k++) {
    const end = samples[0][0] + (k + 1) * step; let sum = 0, c = 0, t0 = samples[i][0];
    while (i < samples.length && samples[i][0] <= end) { sum += samples[i][1]; c++; i++; }
    if (c) out.push([Math.round(t0), Math.round(sum / c)]);
  }
  return out;
}
export function hrStats(samples: [number, number][]) {
  const v = samples.map((s) => s[1]).filter((b) => b > 25 && b < 250);
  if (!v.length) return null;
  return { avg: Math.round(v.reduce((a, b) => a + b, 0) / v.length), max: Math.max(...v) };
}

// ---------- geo ----------
export function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000, r = Math.PI / 180;
  const dφ = (b.lat - a.lat) * r, dλ = (b.lng - a.lng) * r;
  const h = Math.sin(dφ / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dλ / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export function segmentsDistance(segs: RoutePoint[][]) {
  let d = 0;
  for (const s of segs) for (let i = 1; i < s.length; i++) d += haversine(s[i - 1], s[i]);
  return d;
}

// ---------- daily nutrition ----------
export function dayTotals(foods: FoodEntry[], key: string) {
  const t = { kcal: 0, protein: 0, carbs: 0, fat: 0, n: 0 };
  for (const f of foods) if (f.date === key) { t.kcal += f.kcal; t.protein += f.protein; t.carbs += f.carbs; t.fat += f.fat; t.n++; }
  return t;
}

// ---------- steps ----------
export const DEFAULT_STEP_GOAL = 10000;
export const stepGoalOf = (p: Pick<Profile, 'stepGoal'>) => (p.stepGoal && p.stepGoal > 0 ? p.stepGoal : DEFAULT_STEP_GOAL);
/** Step length in metres: user-set, or the common height rule of thumb (walk ≈ 0.415 × height, run ≈ 0.65 × height). */
export const strideM = (p: Pick<Profile, 'heightCm' | 'strideCm'>, type: 'run' | 'walk' | 'cycle') =>
  p.strideCm && p.strideCm > 20 ? (p.strideCm * (type === 'run' ? 0.65 / 0.415 : 1)) / 100 : (p.heightCm * (type === 'run' ? 0.65 : 0.415)) / 100;
/** ≈0.04 kcal per step for a 70 kg adult, scaled by body weight (estimate; see Sources). */
export const KCAL_PER_STEP_70KG = 0.04;
export const stepKcal = (steps: number, weightKg: number) => Math.round(KCAL_PER_STEP_70KG * steps * (weightKg / 70));
export interface DaySteps { total: number; activity: number; manual: number; mode: 'add' | 'set' | 'none'; outside: number }
/** One day's steps. Activity steps come from in-app Walk/Run recordings. 'set' = typed full-day total (already includes them). */
export function daySteps(d: Pick<DataState, 'workouts' | 'steps'>, key: string): DaySteps {
  let activity = 0;
  for (const w of d.workouts) if (w.steps && dayKeyOf(w.date) === key) activity += w.steps;
  const rec = (d.steps || []).filter((s) => s.date === key).sort((a, b) => b.updatedAt - a.updatedAt)[0];
  if (!rec) return { total: activity, activity, manual: 0, mode: 'none', outside: 0 };
  if (rec.mode === 'set') return { total: Math.max(rec.steps, activity), activity, manual: rec.steps, mode: 'set', outside: Math.max(0, rec.steps - activity) };
  return { total: rec.steps + activity, activity, manual: rec.steps, mode: 'add', outside: rec.steps };
}
/** Calories from steps taken outside recorded activities (those already have their own MET estimate). */
export const dayStepKcal = (d: Pick<DataState, 'workouts' | 'steps'>, key: string, weightKg: number) => stepKcal(daySteps(d, key).outside, weightKg);
/** kcal burned estimate for a day: recorded workouts (MET) + steps outside them. */
export function dayBurned(d: DataState, key: string, weightKg: number) {
  const work = d.workouts.filter((w) => dayKeyOf(w.date) === key).reduce((a, w) => a + (w.kcal ?? estKcal(w, weightKg)), 0);
  const steps = dayStepKcal(d, key, weightKg);
  return { total: work + steps, workouts: work, steps };
}
export function stepDayKeys(d: Pick<DataState, 'workouts' | 'steps'>) {
  const s = new Set<string>();
  for (const r of d.steps || []) s.add(r.date);
  for (const w of d.workouts) if (w.steps) s.add(dayKeyOf(w.date));
  return s;
}
export function stepStats(d: Pick<DataState, 'workouts' | 'steps'>, goal: number, today = todayKey()) {
  const hit = (k: string) => daySteps(d, k).total >= goal;
  let cur = hit(today) ? today : addDays(today, -1), current = 0;
  while (hit(cur)) { current++; cur = addDays(cur, -1); }
  let best: { date: string; steps: number } | null = null;
  for (const k of stepDayKeys(d)) { const t = daySteps(d, k).total; if (!best || t > best.steps) best = { date: k, steps: t }; }
  return { current, best, hitToday: hit(today) };
}

// ---------- streaks ----------
export function activeDays(d: DataState) {
  const s = new Set<string>();
  for (const w of d.workouts) s.add(dayKeyOf(w.date));
  return s;
}
export function streak(d: DataState, today = todayKey()) {
  const s = activeDays(d);
  let cur = s.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (s.has(cur)) { n++; cur = addDays(cur, -1); }
  let best = 0, run = 0;
  const keys = [...s].sort();
  for (let i = 0; i < keys.length; i++) {
    run = i > 0 && addDays(keys[i - 1], 1) === keys[i] ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return { current: n, best, doneToday: s.has(today) };
}

// ---------- Hybrid Score ----------
export const SCORE_VERSION = 'hs-2';
const STRENGTH_SHARE: Record<WorkoutType, number> = { strength: 1, calisthenics: 1, hyrox: 0.5, hybrid: 0.5, run: 0, walk: 0, cycle: 0, 'indoor-cycle': 0, cardio: 0.2, rest: 0 };
export interface Pillar { key: 'strength' | 'engine' | 'consistency' | 'nutrition'; label: string; score: number | null; detail: string; formula: string }
export interface HybridScore { score: number | null; tier: string; pillars: Pillar[]; balancePenalty: number; version: string; asOf: string }

export function tierFor(s: number | null) {
  if (s == null) return 'Unrated';
  return s >= 90 ? 'Apex' : s >= 80 ? 'Elite' : s >= 60 ? 'Hybrid' : s >= 40 ? 'Contender' : 'Building';
}

export function hybridScore(d: DataState, p: Profile, asOf = todayKey()): HybridScore {
  const t = computeTargets(p);
  const from = addDays(asOf, -6), from28 = addDays(asOf, -27);
  const inWin = (iso: string, a: string) => { const k = dayKeyOf(iso); return k >= a && k <= asOf; };
  const week = d.workouts.filter((w) => w.type !== 'rest' && inWin(w.date, from));
  const month = d.workouts.filter((w) => w.type !== 'rest' && inWin(w.date, from28));
  const strengthTarget = Math.max(1, Math.round(p.weeklySessions / 2));

  // Strength: session-RPE load (minutes × RPE, Foster 2001) from strength-type work vs. target
  let sLoad = 0, sCount = 0;
  for (const w of week) { const sh = STRENGTH_SHARE[w.type]; if (sh > 0) { sLoad += sh * (w.durationSec / 60) * (w.rpe ?? 6); if (sh >= 0.5) sCount++; } }
  const sTargetLoad = strengthTarget * 45 * 7;
  const hasS = month.some((w) => STRENGTH_SHARE[w.type] >= 0.5);
  const strength = hasS ? Math.min(100, Math.round((sLoad / sTargetLoad) * 100)) : null;

  // Engine: aerobic minutes, vigorous (RPE ≥ 7) counted double — WHO 150 min moderate-equivalent/week
  let eMin = 0;
  for (const w of week) {
    const share = 1 - STRENGTH_SHARE[w.type];
    if (share <= 0) continue;
    const m = (w.durationSec / 60) * share * ((w.rpe ?? 5) >= 7 ? 2 : 1);
    eMin += m;
  }
  const hasE = month.some((w) => STRENGTH_SHARE[w.type] < 1);
  const engine = hasE ? Math.min(100, Math.round((eMin / 150) * 100)) : null;

  // Consistency: training days in the last 7 vs. the weekly goal
  const days = new Set(week.map((w) => dayKeyOf(w.date)));
  const baseCons = month.length ? Math.min(100, Math.round((days.size / p.weeklySessions) * 100)) : null;
  // Step bonus: +2 per day in the last 7 that hit the step goal (max +10), only on top of logged training
  const goal = stepGoalOf(p);
  let stepDays = 0, stepLogged = 0;
  for (let i = 0; i < 7; i++) { const ds = daySteps(d, addDays(asOf, -i)); if (ds.total > 0) stepLogged++; if (ds.total >= goal) stepDays++; }
  const stepBonus = baseCons != null ? Math.min(10, stepDays * 2) : 0;
  const consistency = baseCons != null ? Math.min(100, baseCons + stepBonus) : null;

  // Nutrition adherence: logged days only, needs ≥ 3 logged days in the last 7
  let nSum = 0, nDays = 0;
  for (let i = 0; i < 7; i++) {
    const key = addDays(asOf, -i);
    const tot = dayTotals(d.foods, key);
    if (!tot.n) continue;
    nDays++;
    const dev = Math.abs(tot.kcal - t.kcal) / t.kcal;
    const kcalPts = dev <= 0.1 ? 50 : dev >= 0.3 ? 0 : 50 * (1 - (dev - 0.1) / 0.2);
    const protPts = 35 * Math.min(1, tot.protein / t.protein);
    const wd = d.water.find((x) => x.date === key)?.ml || 0;
    const waterPts = 15 * Math.min(1, wd / t.waterMl);
    nSum += kcalPts + protPts + waterPts;
  }
  const nutrition = nDays >= 3 ? Math.round(nSum / nDays) : null;

  const pillars: Pillar[] = [
    { key: 'strength', label: 'Strength', score: strength, detail: hasS ? `${sCount} strength session${sCount === 1 ? '' : 's'} · load ${Math.round(sLoad)} / ${sTargetLoad}` : 'Not enough data — log a strength or calisthenics session', formula: `Session-RPE load (minutes × RPE) from strength, calisthenics and half of HYROX/hybrid work in the last 7 days, vs. ${strengthTarget} × 45 min × RPE 7.` },
    { key: 'engine', label: 'Engine', score: engine, detail: hasE ? `${Math.round(eMin)} of 150 moderate-equivalent min` : 'Not enough data — log a run, ride, indoor bike, walk or cardio session', formula: 'Aerobic minutes in the last 7 days (runs, rides, indoor/stationary bike, walks, cardio, half of HYROX/hybrid). Sessions at RPE 7+ count double, like the WHO guideline of 150 moderate or 75 vigorous minutes a week.' },
    { key: 'consistency', label: 'Consistency', score: consistency, detail: month.length ? `${days.size} of ${p.weeklySessions} training days${stepLogged ? ` · step goal ${stepDays}/7 days (+${stepBonus})` : ''}` : 'Not enough data — log your first workout', formula: `Distinct training days in the last 7 vs. your goal of ${p.weeklySessions} per week, plus a step bonus: +2 for each of the last 7 days that hit your ${goal.toLocaleString()}-step goal (max +10). Capped at 100; the bonus only applies once you have logged training.` },
    { key: 'nutrition', label: 'Fuel', score: nutrition, detail: nDays >= 3 ? `${nDays} logged day${nDays === 1 ? '' : 's'} averaged` : `Not enough data — log food on ${3 - nDays} more day${3 - nDays === 1 ? '' : 's'} this week`, formula: 'Per logged day: up to 50 pts for calories within ±10% of target (0 at ±30%), 35 pts for hitting protein, 15 pts for water. Averaged across logged days; needs 3+ days.' },
  ];
  const avail = pillars.map((x) => x.score).filter((x): x is number => x != null);
  if (avail.length < 2) return { score: null, tier: tierFor(null), pillars, balancePenalty: 0, version: SCORE_VERSION, asOf };
  const mean = avail.reduce((a, b) => a + b, 0) / avail.length;
  const gap = Math.max(...avail) - Math.min(...avail);
  const balancePenalty = Math.round(gap * 0.1);
  const score = Math.max(0, Math.min(100, Math.round(mean - balancePenalty)));
  return { score, tier: tierFor(score), pillars, balancePenalty, version: SCORE_VERSION, asOf };
}

// ---------- personal records ----------
export interface PR { key: string; label: string; value: string; date: string; raw: number }
export function personalRecords(d: DataState, u: Units, wU: Units = u): PR[] {
  const out: Record<string, PR> = {};
  const better = (key: string, label: string, raw: number, value: string, date: string, lowerIsBetter = false) => {
    const cur = out[key];
    if (!cur || (lowerIsBetter ? raw < cur.raw : raw > cur.raw)) out[key] = { key, label, raw, value, date };
  };
  for (const w of d.workouts) {
    for (const ex of w.exercises || []) for (const s of ex.sets) {
      if (s.weightKg && s.reps) {
        better(`w:${ex.exId}`, `${ex.name} — heaviest`, s.weightKg, `${fmtW(s.weightKg, wU)} × ${s.reps}`, w.date);
        if (s.reps <= 12 && !ex.exId.startsWith('weighted-')) { // added-load lifts: no 1RM estimate
          const e = s.weightKg * (1 + s.reps / 30); better(`e:${ex.exId}`, `${ex.name} — est. 1RM`, e, fmtW(e, wU), w.date); }
      } else if (s.reps) better(`r:${ex.exId}`, `${ex.name} — most reps`, s.reps, `${s.reps} reps`, w.date);
      if (s.timeSec && !s.reps && !s.distanceM) better(`t:${ex.exId}`, `${ex.name} — longest hold`, s.timeSec, fmtTime(s.timeSec), w.date);
    }
    if (w.avgWatts && w.type === 'indoor-cycle') better('w:indoor', 'Highest avg indoor-bike power', w.avgWatts, `${Math.round(w.avgWatts)} W`, w.date);
    if (w.distanceM && ['run', 'walk', 'cycle', 'indoor-cycle'].includes(w.type)) {
      const nm = w.type === 'run' ? 'Run' : w.type === 'walk' ? 'Walk' : w.type === 'indoor-cycle' ? 'Indoor ride' : 'Ride';
      better(`d:${w.type}`, `Longest ${nm.toLowerCase()}`, w.distanceM, fmtDist(w.distanceM, u), w.date);
      if (w.type === 'run' && w.distanceM >= 1000) {
        const pace = paceSec(w.durationSec, w.distanceM, u);
        better('p:run', 'Fastest avg run pace', pace, fmtPace(pace, u), w.date, true);
        if (w.distanceM >= 5000) { const t5 = (w.durationSec / w.distanceM) * 5000; better('5k', '5K (est. from avg pace)', t5, fmtTime(t5), w.date, true); }
      }
    }
    if (w.steps && w.cadence && w.stepsSource === 'sensor' && w.type === 'run') better('cad:run', 'Highest run cadence', w.cadence, `${w.cadence} spm`, w.date);
    if (w.type === 'hyrox' && w.source === 'hyrox-sim' && (w.splits?.length || 0) >= 16) better('hyrox', 'HYROX sim — fastest', w.durationSec, fmtTime(w.durationSec), w.date, true);
  }
  const bestSteps = stepStats(d, Infinity).best;
  if (bestSteps && bestSteps.steps > 0) out['steps'] = { key: 'steps', label: 'Most steps in a day', raw: bestSteps.steps, value: `${bestSteps.steps.toLocaleString()} steps`, date: `${bestSteps.date}T12:00:00` };
  return Object.values(out).sort((a, b) => b.date.localeCompare(a.date));
}

export const WORKOUT_TYPES: { v: WorkoutType; label: string }[] = [
  { v: 'strength', label: 'Strength' }, { v: 'calisthenics', label: 'Calisthenics' }, { v: 'run', label: 'Run' },
  { v: 'walk', label: 'Walk' }, { v: 'cycle', label: 'Ride' }, { v: 'indoor-cycle', label: 'Indoor Bike' },
  { v: 'cardio', label: 'Cardio / HIIT' }, { v: 'hyrox', label: 'HYROX' }, { v: 'hybrid', label: 'Hybrid' }, { v: 'rest', label: 'Rest day' },
];
export const typeLabel = (t: WorkoutType) => WORKOUT_TYPES.find((x) => x.v === t)?.label || t;
export const GPS_TYPES: WorkoutType[] = ['run', 'walk', 'cycle'];
export const isGpsType = (t: WorkoutType) => GPS_TYPES.includes(t);
export const isBikeType = (t: WorkoutType) => t === 'cycle' || t === 'indoor-cycle';
export function activityLabel(w: Pick<Workout, 'type' | 'bikeKind'>) {
  if (w.type === 'indoor-cycle') return w.bikeKind === 'stationary' ? 'Stationary Bike' : 'Indoor Bike';
  return typeLabel(w.type);
}
