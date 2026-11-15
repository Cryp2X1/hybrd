// Calories-burned tracker. Builds on the per-workout estimates in calc.ts (device → power → Keytel HR → MET)
// and the step log; nothing here re-estimates a workout that already has kcal.
//
// Definitions used everywhere in the app:
//   ACTIVE = workouts (their saved estimate) + steps outside recorded workouts + calories added by hand
//   TOTAL  = RESTING + ACTIVE
//   RESTING = Mifflin-St Jeor BMR per minute × the minutes of the day that have passed (today) or 1,440 (past days),
//             minus the minutes spent in workouts / added activities, because those estimates are gross
//             (MET × kg × h, HR and device values already include the resting burn during the session).
import type { BurnEntry, DataState, Profile, Workout, WorkoutType } from './types';
import { activityLabel, addDays, bmr, dayKeyOf, daySteps, dayTotals, estKcal, strideM, todayKey } from './calc';

export const DEFAULT_BURN_GOAL = 500;
export const burnGoalOf = (p: Pick<Profile, 'burnGoal'>) => (p.burnGoal && p.burnGoal > 0 ? Math.round(p.burnGoal) : DEFAULT_BURN_GOAL);

// ---------- steps ----------
/**
 * Net kcal per walking step from the ACSM walking equation (horizontal component 0.1 mL O2·kg⁻¹·m⁻¹, the resting
 * 3.5 mL is left out because resting burn is counted separately) with ≈5 kcal per litre of O2:
 * kcal per metre = 0.1 × kg × 5 / 1000 = 0.0005 × kg; per step = that × step length (m).
 * Step length: the user's own (Me › Steps) or ≈0.415 × height. 75 kg, 175 cm → ≈0.027 kcal/step.
 */
export const kcalPerStep = (p: Pick<Profile, 'weightKg' | 'heightCm' | 'strideCm'>) => 0.0005 * (p.weightKg || 70) * strideM(p, 'walk');
export const stepBurnKcal = (steps: number, p: Pick<Profile, 'weightKg' | 'heightCm' | 'strideCm'>) => Math.round(Math.max(0, steps) * kcalPerStep(p));

export interface StepBurn { total: number; inWorkouts: number; outside: number; mode: 'add' | 'set' | 'none'; estimatedInWorkouts: number }
/**
 * Steps that earn "daily movement" calories, without double counting:
 * - steps recorded inside walks/runs (sensor or GPS estimate) belong to that workout's own estimate;
 * - walks/runs that have a distance but no step count (imports, Strava, typed in) are converted to steps
 *   with the step length, so a phone's full-day total ("set") doesn't count them twice;
 * - 'add' steps are on top of anything recorded, so they all count; with no typed steps there is nothing outside.
 */
export function stepBurnSteps(d: Pick<DataState, 'workouts' | 'steps'>, key: string, p: Pick<Profile, 'heightCm' | 'strideCm'>): StepBurn {
  const ds = daySteps(d, key);
  let est = 0;
  for (const w of d.workouts) {
    if (w.steps || !w.distanceM || dayKeyOf(w.date) !== key) continue;
    if (w.type === 'walk' || w.type === 'run') est += Math.round(w.distanceM / strideM(p, w.type));
  }
  const inWorkouts = ds.activity + est;
  const outside = ds.mode === 'set' ? Math.max(0, ds.manual - inWorkouts) : ds.mode === 'add' ? ds.manual : 0;
  return { total: ds.mode === 'set' ? Math.max(ds.manual, inWorkouts) : ds.total + est, inWorkouts, outside, mode: ds.mode, estimatedInWorkouts: est };
}

// ---------- sessions ----------
export type BurnKind = 'workout' | 'manual';
export interface BurnSession { id: string; kind: BurnKind; date: string; label: string; group: string; kcal: number; minutes: number; method: string; type?: WorkoutType }
export const workoutKcal = (w: Workout, weightKg: number) => (w.type === 'rest' ? 0 : Math.max(0, Math.round(w.kcal ?? estKcal(w, weightKg))));
const METHOD_LABEL: Record<string, string> = { device: 'device', power: 'power (watts)', hr: 'heart rate', met: 'MET estimate', manual: 'typed in' };
export const methodLabel = (m?: string) => METHOD_LABEL[m || 'met'] || m || 'MET estimate';

// ---------- one day ----------
export interface DayBurn {
  date: string;
  resting: number; restingFullDay: number; elapsedMin: number; coveredMin: number; partial: boolean;
  workouts: number; steps: number; manual: number;
  active: number; total: number;
  stepInfo: StepBurn;
  sessions: BurnSession[];
  eaten: number; foodLogged: boolean; net: number | null;
}
/** Minutes of `key` that have passed at `now` (0 for future days, 1,440 for past days). */
export function elapsedMinutes(key: string, now = new Date()) {
  const today = todayKey(now);
  if (key < today) return 1440;
  if (key > today) return 0;
  return now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
}
export function dayBurn(d: Pick<DataState, 'workouts' | 'steps' | 'foods'> & { burns?: BurnEntry[] }, key: string, p: Profile, now = new Date()): DayBurn {
  const sessions: BurnSession[] = [];
  let workouts = 0, manual = 0, covered = 0;
  for (const w of d.workouts) {
    if (w.type === 'rest' || dayKeyOf(w.date) !== key) continue;
    const kcal = workoutKcal(w, p.weightKg);
    workouts += kcal; covered += w.durationSec / 60;
    sessions.push({ id: w.id, kind: 'workout', date: w.date, label: w.title || activityLabel(w), group: activityLabel(w), kcal, minutes: Math.round(w.durationSec / 60), method: methodLabel(w.kcal == null ? 'met' : w.kcalMethod), type: w.type });
  }
  for (const b of d.burns || []) {
    if (b.deleted || b.date !== key) continue;
    const kcal = Math.max(0, Math.round(b.kcal || 0));
    manual += kcal; covered += Math.max(0, b.minutes || 0);
    sessions.push({ id: b.id, kind: 'manual', date: `${b.date}T12:00:00`, label: b.label, group: b.activity === 'other' || !BURN_ACTIVITIES.some((a) => a.v === b.activity) ? (b.label || 'Other') : burnActivity(b.activity).group, kcal, minutes: Math.round(b.minutes || 0), method: b.method === 'manual' ? 'typed in' : `MET ${b.met ?? ''}`.trim() });
  }
  const stepInfo = stepBurnSteps(d, key, p);
  const steps = stepBurnKcal(stepInfo.outside, p);
  const full = bmr(p);
  const elapsed = elapsedMinutes(key, now);
  const coveredMin = Math.min(covered, elapsed);
  const resting = Math.max(0, Math.round((full / 1440) * (elapsed - coveredMin)));
  const active = workouts + steps + manual;
  const food = dayTotals(d.foods, key);
  const total = resting + active;
  sessions.sort((a, b) => b.kcal - a.kcal);
  return {
    date: key, resting, restingFullDay: Math.round(full), elapsedMin: Math.round(elapsed), coveredMin: Math.round(coveredMin), partial: elapsed > 0 && elapsed < 1440,
    workouts, steps, manual, active, total, stepInfo, sessions,
    eaten: Math.round(food.kcal), foodLogged: food.n > 0, net: food.n > 0 ? Math.round(food.kcal) - total : null,
  };
}

// ---------- ranges ----------
export interface RangeBurn {
  from: string; to: string; days: DayBurn[];
  active: number; total: number; resting: number; workouts: number; steps: number; manual: number;
  avgActive: number; avgTotal: number; goalDays: number; best: DayBurn | null;
  byGroup: { group: string; kcal: number; n: number }[];
  top: BurnSession[];
  net: number | null; netDays: number; eaten: number;
}
export function rangeBurn(d: Pick<DataState, 'workouts' | 'steps' | 'foods'> & { burns?: BurnEntry[] }, p: Profile, to: string, n: number, now = new Date()): RangeBurn {
  const goal = burnGoalOf(p);
  const days = Array.from({ length: n }, (_, i) => dayBurn(d, addDays(to, i - (n - 1)), p, now));
  const sum = (f: (x: DayBurn) => number) => days.reduce((a, x) => a + f(x), 0);
  const groups = new Map<string, { group: string; kcal: number; n: number }>();
  const add = (g: string, k: number, c = 1) => { if (k <= 0) return; const cur = groups.get(g) || { group: g, kcal: 0, n: 0 }; cur.kcal += k; cur.n += c; groups.set(g, cur); };
  for (const x of days) { for (const s of x.sessions) add(s.group, s.kcal); add('Steps · daily movement', x.steps); }
  const counted = days.filter((x) => x.elapsedMin > 0);
  const withActivity = counted.filter((x) => x.active > 0);
  const netDays = days.filter((x) => x.net != null);
  return {
    from: days[0].date, to, days,
    active: sum((x) => x.active), total: sum((x) => x.total), resting: sum((x) => x.resting), workouts: sum((x) => x.workouts), steps: sum((x) => x.steps), manual: sum((x) => x.manual),
    avgActive: counted.length ? Math.round(sum((x) => x.active) / counted.length) : 0,
    avgTotal: counted.length ? Math.round(sum((x) => x.total) / counted.length) : 0,
    goalDays: days.filter((x) => x.active >= goal).length,
    best: withActivity.length ? withActivity.reduce((a, b) => (b.active > a.active ? b : a)) : null,
    byGroup: [...groups.values()].sort((a, b) => b.kcal - a.kcal),
    top: days.flatMap((x) => x.sessions).sort((a, b) => b.kcal - a.kcal).slice(0, 5),
    net: netDays.length ? netDays.reduce((a, x) => a + (x.net as number), 0) : null, netDays: netDays.length, eaten: netDays.reduce((a, x) => a + x.eaten, 0),
  };
}

// ---------- goal streak ----------
/** Days with anything that could burn active calories. */
export function burnDayKeys(d: Pick<DataState, 'workouts' | 'steps'> & { burns?: BurnEntry[] }) {
  const s = new Set<string>();
  for (const w of d.workouts) if (w.type !== 'rest') s.add(dayKeyOf(w.date));
  for (const r of d.steps || []) s.add(r.date);
  for (const b of d.burns || []) if (!b.deleted) s.add(b.date);
  return s;
}
/** Current streak counts today only once the goal is hit (otherwise it runs through yesterday, like the step streak). */
export function burnStreak(d: Pick<DataState, 'workouts' | 'steps' | 'foods'> & { burns?: BurnEntry[] }, p: Profile, today = todayKey(), now = new Date()) {
  const goal = burnGoalOf(p);
  const memo = new Map<string, boolean>();
  const hit = (k: string) => { if (!memo.has(k)) memo.set(k, dayBurn(d, k, p, now).active >= goal); return memo.get(k)!; };
  let cur = hit(today) ? today : addDays(today, -1), current = 0;
  while (current < 3660 && hit(cur)) { current++; cur = addDays(cur, -1); }
  const keys = [...burnDayKeys(d)].filter((k) => k <= today && hit(k)).sort();
  let best = 0, run = 0;
  for (let i = 0; i < keys.length; i++) { run = i > 0 && addDays(keys[i - 1], 1) === keys[i] ? run + 1 : 1; best = Math.max(best, run); }
  return { current, best: Math.max(best, current), hitToday: hit(today), goal };
}

// ---------- manual entries ----------
/**
 * MET values for activities HYBRD doesn't record, approximated from the Compendium of Physical Activities
 * (Ainsworth 2011; Herrmann 2024 Adult Compendium). They are averages for the described effort; the user can override kcal.
 */
export const BURN_ACTIVITIES: { v: string; label: string; met: number; group: string }[] = [
  { v: 'walk-casual', label: 'Walking, casual (2.8–3.2 mph)', met: 3.5, group: 'Walking' },
  { v: 'hike', label: 'Hiking, cross-country', met: 6.0, group: 'Hiking' },
  { v: 'swim', label: 'Swimming laps, freestyle, light–moderate', met: 5.8, group: 'Swimming' },
  { v: 'row', label: 'Rowing machine, moderate', met: 7.0, group: 'Rowing' },
  { v: 'elliptical', label: 'Elliptical trainer, moderate', met: 5.0, group: 'Elliptical' },
  { v: 'stairs', label: 'Stair-climber machine', met: 9.0, group: 'Stair climber' },
  { v: 'jump-rope', label: 'Jump rope, moderate (100–120/min)', met: 11.8, group: 'Jump rope' },
  { v: 'yoga', label: 'Yoga, hatha', met: 2.5, group: 'Yoga' },
  { v: 'pilates', label: 'Pilates, general', met: 3.0, group: 'Pilates' },
  { v: 'dance', label: 'Aerobic dance, general', met: 7.3, group: 'Dance' },
  { v: 'boxing-bag', label: 'Boxing, punching bag', met: 5.5, group: 'Boxing' },
  { v: 'martial-arts', label: 'Martial arts, moderate pace', met: 10.3, group: 'Martial arts' },
  { v: 'basketball', label: 'Basketball, game', met: 8.0, group: 'Basketball' },
  { v: 'soccer', label: 'Soccer, casual', met: 7.0, group: 'Soccer' },
  { v: 'tennis', label: 'Tennis, general', met: 7.3, group: 'Tennis' },
  { v: 'ski', label: 'Downhill skiing, moderate', met: 5.3, group: 'Skiing' },
  { v: 'garden', label: 'Gardening, general', met: 3.8, group: 'Gardening' },
  { v: 'cleaning', label: 'House cleaning, moderate', met: 3.5, group: 'Housework' },
  { v: 'other', label: 'Other (set your own MET)', met: 4.0, group: 'Other' },
];
export const burnActivity = (v: string) => BURN_ACTIVITIES.find((a) => a.v === v) || BURN_ACTIVITIES[BURN_ACTIVITIES.length - 1];
/** Same gross MET formula as workouts: kcal = MET × kg × hours. */
export const metBurnKcal = (met: number, minutes: number, weightKg: number) => (met > 0 && minutes > 0 ? Math.round(met * (weightKg || 70) * (minutes / 60)) : 0);
