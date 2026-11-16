/**
 * Train › Ultra & Backyard — pure, deterministic logic (no React, no DOM, type-only imports) so
 * tools/test-ultra.ts can run it under plain Node.
 *
 * Evidence (ids → src/data/sources.ts):
 *  - Readiness / red flags: ultra-riebe (ACSM pre-participation screening), ultra-kim-cardiac, ultra-scheer-youth
 *    (no plans under 18), ultra-acog (pregnancy), ultra-scheer-health.
 *  - Progression: ultra-frandsen (single run > +10% of the longest run in the last 30 days → more overuse injuries) and
 *    ultra-nielsen (weekly jumps > 30%) → HYBRD caps weekly ramps at +10% and each long run at +10% of the 30-day max.
 *    Cut-back weeks every 3rd/4th week and the prerequisite thresholds are HYBRD coaching rules (labelled as such in UI).
 *  - Intensity: ultra-seiler (~80% easy), ultra-uphill (aerobic base, hill sprints, Z3/Z4 muscular endurance, B2B),
 *    daniels (T-pace volume ≤ 10% of the week), ultra-giovanelli (power-hike steep climbs), ultra-itra (km-effort).
 *  - Taper: ultra-bosquet (≈2 weeks, volume −41–60%, intensity kept), ultra-uphill (3 weeks for 100 mi+, ~25%/week).
 *  - Fuelling: ultra-issn, ultra-costa2019, ultra-jeuk2014, ultra-jeuk-gut, ultra-costa-gut, ultra-caffeine,
 *    ultra-hew-butler, ultra-hoffman-na, ultra-baker-sweat, acsm2016 (daily carbs g/kg).
 *  - Backyard: ultra-bigs-rules / ultra-bigs-handbook (6.7056 km = 100/24 mi every hour), ultra-runmotion,
 *    ultra-milestogether (45–55 min yards), ultra-depauw.
 * Every number is an estimate or a training prescription — never a promise of a result.
 */
import type { Sex } from './types';

// ---------------------------------------------------------------- constants
export const YARD_MI = 100 / 24; // 4.1667 mi
export const YARD_KM = 6.7056; // official metric equivalent
export const YARD_M = 6705.6;
export const YARD_FT = 22_000; // exact: (100/24) mi × 5,280 ft/mi
export const HOUR_MS = 3_600_000;
export const KM_PER_MI = 1.609344;
export const MAX_RAMP = 1.1; // weekly volume vs the last full week
export const MAX_LONG_SPIKE = 1.1; // single long run vs longest of the previous 30 days (≈4 weeks)
export const MAX_PLAN_WEEKS = 24;
export const MIN_PLAN_WEEKS = 8;
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export type RaceId = 'byu' | '50k' | '50mi' | '100k' | '100mi' | 'base';
export type Finished = 'none' | '10k' | 'half' | 'marathon' | '50k' | '50mi' | '100k' | '100mi';
export type Terrain = 'road' | 'trail' | 'mountain';
export type Climate = 'cool' | 'mild' | 'hot';
export type GutLevel = 'none' | 'some' | 'trained';
export type Phase = 'base' | 'build' | 'specific' | 'taper';
export const PHASE_LABEL: Record<Phase, string> = { base: 'Base', build: 'Build', specific: 'Race-specific', taper: 'Taper' };
export const FIN_RANK: Record<Finished, number> = { none: 0, '10k': 1, half: 2, marathon: 3, '50k': 4, '50mi': 5, '100k': 6, '100mi': 7 };
export const FIN_LABEL: Record<Finished, string> = { none: 'Nothing yet', '10k': '10K', half: 'Half marathon', marathon: 'Marathon', '50k': '50K', '50mi': '50 mi', '100k': '100K', '100mi': '100 mi or 24-yard backyard' };

export interface RaceSpec {
  id: RaceId; name: string; km: number; minWeeks: number; idealWeeks: number;
  peakWeekKm: number; peakLongKm: number; peakLongMin: number; b2b: boolean; taperWeeks: number;
  prereq: { years: number; weeklyKm: number; longestKm: number; finished: Finished };
  yards?: number;
}
/** HYBRD coaching guideline thresholds — not official race standards. */
export const RACES: Record<Exclude<RaceId, 'byu'>, RaceSpec> = {
  base: { id: 'base', name: 'Ultra Base Builder', km: 0, minWeeks: 8, idealWeeks: 12, peakWeekKm: 40, peakLongKm: 20, peakLongMin: 150, b2b: false, taperWeeks: 0, prereq: { years: 0, weeklyKm: 10, longestKm: 5, finished: 'none' } },
  '50k': { id: '50k', name: '50K', km: 50, minWeeks: 12, idealWeeks: 16, peakWeekKm: 65, peakLongKm: 32, peakLongMin: 240, b2b: false, taperWeeks: 2, prereq: { years: 1, weeklyKm: 30, longestKm: 16, finished: 'half' } },
  '50mi': { id: '50mi', name: '50 mi', km: 80.5, minWeeks: 16, idealWeeks: 20, peakWeekKm: 80, peakLongKm: 38, peakLongMin: 300, b2b: true, taperWeeks: 2, prereq: { years: 2, weeklyKm: 40, longestKm: 21, finished: 'marathon' } },
  '100k': { id: '100k', name: '100K', km: 100, minWeeks: 16, idealWeeks: 20, peakWeekKm: 85, peakLongKm: 40, peakLongMin: 330, b2b: true, taperWeeks: 2, prereq: { years: 2, weeklyKm: 45, longestKm: 24, finished: 'marathon' } },
  '100mi': { id: '100mi', name: '100 mi', km: 160.9, minWeeks: 20, idealWeeks: 24, peakWeekKm: 95, peakLongKm: 45, peakLongMin: 360, b2b: true, taperWeeks: 3, prereq: { years: 3, weeklyKm: 50, longestKm: 28, finished: '50k' } },
};
export const BYU_YARD_OPTIONS = [4, 7, 12, 15, 20, 24, 30, 36];
/** Backyard target → the training profile of the matching distance (24 yards = 100 mi). */
export function byuSpec(yards: number): RaceSpec {
  const y = Math.max(1, Math.round(yards));
  const eq = y <= 7 ? RACES['50k'] : y <= 12 ? RACES['50mi'] : y <= 15 ? RACES['100k'] : RACES['100mi'];
  const beyond = y > 24;
  return {
    ...eq, id: 'byu', yards: y, name: `Backyard · ${y} yard${y === 1 ? '' : 's'}`, km: +(y * YARD_KM).toFixed(1),
    taperWeeks: y >= 20 ? 3 : eq.taperWeeks, b2b: y >= 8,
    peakLongKm: beyond ? 54 : eq.peakLongKm, peakLongMin: beyond ? 420 : eq.peakLongMin,
    prereq: beyond ? { years: 3, weeklyKm: 55, longestKm: 32, finished: '100mi' } : eq.prereq,
  };
}
export const specOf = (race: RaceId, yards = 12): RaceSpec => (race === 'byu' ? byuSpec(yards) : RACES[race]);
export const raceLabel = (race: RaceId, yards?: number) => specOf(race, yards).name;

// ---------------------------------------------------------------- quiz & screening
export interface UltraQuiz {
  sex: Sex; age: number; weightKg: number;
  // health (red flags)
  chestPain: boolean; // chest pain/pressure, fainting, palpitations or unusual breathlessness with exercise
  heart: boolean; // diagnosed heart condition
  pregnant: boolean;
  injury: boolean; // current injury / pain that changes how you run
  kidney: boolean; // kidney disease
  diabetesMeds: boolean; // insulin or sulfonylurea
  pastEmergency: boolean; // previous heat stroke, hyponatremia, rhabdo or kidney injury
  edHistory: boolean; // past/current eating disorder
  cleared: boolean; // "my doctor has cleared me for ultra training"
  // running background
  years: number; weeklyKm: number; longestKm: number; finished: Finished; easyPaceSec: number; // sec per km
  // race
  race: RaceId; yards: number; raceDate: string; terrain: Terrain; vertM: number; climate: Climate; altitude: boolean;
  // schedule
  days: number; longDay: number; // 0 = Mon … 6 = Sun
  gut: GutLevel; lapMin: number; // backyard target lap time in minutes
}
export type Reason = 'under18' | 'chest' | 'pregnant' | 'injury' | 'heart' | 'kidney' | 'diabetes' | 'emergency' | 'ed';
export interface Screen { level: 'ok' | 'doctor' | 'stop'; stop: Reason[]; doctor: Reason[] }
export const REASON_TEXT: Record<Reason, string> = {
  under18: 'HYBRD doesn’t build ultra plans for anyone under 18. A youth consensus statement asks for an individual medical check and close supervision, and the long-term effects on growing bodies aren’t known. Shorter races and HYBRD’s running programs are still here for you.',
  chest: 'Chest pain or pressure, fainting, a racing or irregular heartbeat, or unusual breathlessness when you exercise must be checked by a doctor before any hard or long training. Most race cardiac arrests happen in people with an undiagnosed heart condition.',
  pregnant: 'During pregnancy, ultra-distance training needs your obstetric care provider, not an app. Keep moving with the exercise they approve — HYBRD won’t build an ultra plan.',
  injury: 'Train the injury first. Running ultra volume on a current injury usually makes it worse. See a physio or sports doctor, and come back when you can run pain-free.',
  heart: 'With a diagnosed heart condition, get your cardiologist’s OK for ultra-distance training and racing first.',
  kidney: 'Ultras put real strain on the kidneys (and kidney injury is common at the finish), so check with your doctor first.',
  diabetes: 'Insulin or sulfonylureas plus many hours of running can cause dangerous lows. Plan dosing and race fuelling with your diabetes team.',
  emergency: 'You’ve had heat stroke, hyponatremia, rhabdomyolysis or a kidney injury before. Ask your doctor what caused it and what to change before training for another ultra.',
  ed: 'Ultra training needs a lot of food, and under-fuelling (REDs) is common. With an eating-disorder history, train with your care team or a sports dietitian. HYBRD hides calorie numbers for you.',
};
export const REASON_SRC: Partial<Record<Reason, string[]>> = {
  under18: ['ultra-scheer-youth'], chest: ['ultra-riebe', 'ultra-kim-cardiac'], pregnant: ['ultra-acog'], injury: ['ultra-frandsen'],
  heart: ['ultra-riebe', 'ultra-scheer-health'], kidney: ['ultra-rojas', 'ultra-lipman'], diabetes: ['ultra-riebe'],
  emergency: ['ultra-hew-butler', 'ultra-acsm-heat', 'ultra-rojas'], ed: ['wl-reds'],
};
export function screen(q: Pick<UltraQuiz, 'age' | 'chestPain' | 'pregnant' | 'injury' | 'heart' | 'kidney' | 'diabetesMeds' | 'pastEmergency' | 'edHistory' | 'sex'>): Screen {
  const stop: Reason[] = [], doctor: Reason[] = [];
  if (q.age > 0 && q.age < 18) stop.push('under18');
  if (q.chestPain) stop.push('chest');
  if (q.sex === 'female' && q.pregnant) stop.push('pregnant');
  if (q.injury) stop.push('injury');
  if (q.heart) doctor.push('heart');
  if (q.kidney) doctor.push('kidney');
  if (q.diabetesMeds) doctor.push('diabetes');
  if (q.pastEmergency) doctor.push('emergency');
  if (q.edHistory) doctor.push('ed');
  return { level: stop.length ? 'stop' : doctor.length ? 'doctor' : 'ok', stop, doctor };
}
/** A doctor-level answer only lets a plan through once "cleared" is ticked. */
export const canPlan = (q: UltraQuiz) => { const s = screen(q); return s.level === 'ok' || (s.level === 'doctor' && q.cleared); };

// ---------------------------------------------------------------- dates
const pad = (n: number) => String(n).padStart(2, '0');
export const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (k: string) => new Date(k + 'T12:00:00');
export const addDaysK = (k: string, n: number) => { const d = parse(k); d.setDate(d.getDate() + n); return keyOf(d); };
export const weekdayOf = (k: string) => (parse(k).getDay() + 6) % 7; // 0 = Mon
export const mondayOf = (k: string) => addDaysK(k, -weekdayOf(k));
export const daysBetween = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / 86_400_000);
/** Weeks from the Monday of `today` up to and including the race week. */
export const weeksToRace = (today: string, race: string) => Math.floor(daysBetween(mondayOf(today), race) / 7) + 1;

// ---------------------------------------------------------------- readiness
export interface Missing { key: 'years' | 'weekly' | 'long' | 'finished'; text: string }
export interface Readiness {
  status: 'ready' | 'stretch' | 'bridge' | 'too-soon'; weeks: number; planWeeks: number; startDate: string;
  missing: Missing[]; recommend: RaceId | null; recommendYards?: number; earliestDate?: string; notes: string[];
}
export function missingFor(spec: RaceSpec, q: Pick<UltraQuiz, 'years' | 'weeklyKm' | 'longestKm' | 'finished'>): Missing[] {
  const p = spec.prereq, m: Missing[] = [];
  if (q.years < p.years) m.push({ key: 'years', text: `${p.years}+ year${p.years > 1 ? 's' : ''} of regular running (you: ${q.years < 1 ? 'under 1' : q.years})` });
  if (q.weeklyKm < p.weeklyKm) m.push({ key: 'weekly', text: `${p.weeklyKm}+ km a week for the last month (you: ${Math.round(q.weeklyKm)} km)` });
  if (q.longestKm < p.longestKm) m.push({ key: 'long', text: `A ${p.longestKm}+ km run in the last 30 days (you: ${Math.round(q.longestKm)} km)` });
  if (FIN_RANK[q.finished] < FIN_RANK[p.finished]) m.push({ key: 'finished', text: `A finished ${FIN_LABEL[p.finished]} or longer (you: ${FIN_LABEL[q.finished]})` });
  return m;
}
/** Weeks needed to lift weekly volume from `from` to `to` at +10% with a cut-back every 4th week. */
export function weeksToBuild(from: number, to: number, cycle = 4) {
  let v = Math.max(from, 5), w = 0;
  while (v < to && w < 104) { w++; if (w % cycle === 0) continue; v *= MAX_RAMP; }
  return w;
}
export function readiness(q: UltraQuiz, today: string): Readiness {
  const spec = specOf(q.race, q.yards);
  const weeks = weeksToRace(today, q.raceDate);
  const planWeeks = Math.max(0, Math.min(MAX_PLAN_WEEKS, weeks));
  const startDate = addDaysK(mondayOf(q.raceDate), -7 * (Math.max(planWeeks, 1) - 1));
  const missing = q.race === 'base' ? [] : missingFor(spec, q);
  const notes: string[] = [];
  if (weeks > MAX_PLAN_WEEKS) notes.push(`Your race is ${weeks} weeks away. The plan uses the last ${MAX_PLAN_WEEKS} weeks and starts ${startDate}; until then, keep your current easy running and strength work.`);
  const order: RaceId[] = ['100mi', '100k', '50mi', '50k'];
  const smallerRace = () => {
    if (q.race === 'byu') {
      const y = [...BYU_YARD_OPTIONS].reverse().find((y) => y < (q.yards || 0) && !missingFor(byuSpec(y), q).length);
      return y ? { race: 'byu' as RaceId, yards: y } : null;
    }
    const r = order.find((r) => r !== q.race && RACES[r as Exclude<RaceId, 'byu'>].km < spec.km && !missingFor(RACES[r as Exclude<RaceId, 'byu'>], q).length);
    return r ? { race: r, yards: undefined } : null;
  };
  const earliestDate = addDaysK(mondayOf(today), 7 * (spec.minWeeks - 1) + 5);
  if (q.race === 'base') return { status: weeks >= MIN_PLAN_WEEKS ? 'ready' : 'too-soon', weeks, planWeeks, startDate, missing, recommend: null, notes, earliestDate: addDaysK(mondayOf(today), 7 * (MIN_PLAN_WEEKS - 1) + 5) };
  if (weeks < MIN_PLAN_WEEKS) {
    const s = smallerRace();
    notes.push(`${weeks <= 0 ? 'That date has passed' : `Only ${weeks} week${weeks === 1 ? '' : 's'} to go`} — too short to build safely for ${spec.name}. Pick a race on or after ${earliestDate}${s ? `, or a shorter target` : ''}.`);
    return { status: 'too-soon', weeks, planWeeks, startDate, missing, recommend: s?.race ?? null, recommendYards: s?.yards, earliestDate, notes };
  }
  if (!missing.length) {
    if (weeks >= spec.minWeeks) return { status: 'ready', weeks, planWeeks, startDate, missing, recommend: null, notes };
    notes.push(`${weeks} weeks is shorter than the ${spec.minWeeks}+ weeks HYBRD recommends for ${spec.name}. The plan is compressed and the +10% caps still apply, so your peak week will be lower. A race on or after ${earliestDate} gives you the full build.`);
    return { status: 'stretch', weeks, planWeeks, startDate, missing, recommend: null, earliestDate, notes };
  }
  if (missing.length === 1 && missing[0].key !== 'weekly' && weeks >= spec.idealWeeks) {
    notes.push(`You’re one prerequisite short (${missing[0].text}). With ${weeks} weeks the plan can close that gap — the first long runs start from what you already do.`);
    return { status: 'stretch', weeks, planWeeks, startDate, missing, recommend: null, notes };
  }
  const s = smallerRace();
  const bw = weeksToBuild(q.weeklyKm, spec.prereq.weeklyKm);
  notes.push(s ? `Build up first: a ${raceLabel(s.race, s.yards)} fits where you are now, and it’s the best bridge to ${spec.name}.` : `Start with the Ultra Base Builder: about ${Math.max(bw, 8)} weeks of easy volume (+10% a week, cut-back weeks) and longer runs before a first ultra.`);
  return { status: 'bridge', weeks, planWeeks, startDate, missing, recommend: s ? s.race : 'base', recommendYards: s?.yards, notes };
}

// ---------------------------------------------------------------- plan
export type Kind = 'easy' | 'strides' | 'hills' | 'threshold' | 'uphill' | 'race-effort' | 'gears' | 'sharpen' | 'long' | 'b2b' | 'sim' | 'night' | 'hike' | 'strength' | 'opener' | 'race' | 'rest';
export interface StepT { label: string; sec: number; kind: 'work' | 'rest'; note?: string; round?: number; of?: number; pace?: 'E' | 'T' | 'M' }
export interface DaySession {
  wd: number; date: string; kind: Kind; title: string; km: number; min: number; vertM: number; strength: boolean;
  carbsPerH?: number; yards?: number; detail: string[]; steps: StepT[]; zone: string;
}
export interface PlanWeek { i: number; phase: Phase; cut: boolean; km: number; longKm: number; b2bKm: number; vertM: number; gut: number; days: DaySession[]; focus: string; startDate: string }
export interface Plan { spec: RaceSpec; weeks: PlanWeek[]; startDate: string; raceDate: string; peakKm: number; cycle: number }

const r1 = (x: number) => Math.round(x * 10) / 10;
const r5 = (x: number) => Math.max(5, Math.round(x / 5) * 5);
const mod7 = (x: number) => ((x % 7) + 7) % 7;
export const terrainFactor = (t: Terrain) => (t === 'road' ? 1 : t === 'trail' ? 1.05 : 1.1);
/** ITRA km-effort = km + elevation gain (m) / 100. */
export const kmEffort = (km: number, vertM: number) => km + Math.max(0, vertM) / 100;
/** Estimated minutes for an easy session (km-effort × easy pace × terrain factor). HYBRD estimate. */
export function estMin(km: number, vertM: number, paceSec: number, t: Terrain) {
  return Math.round(((t === 'road' ? km : kmEffort(km, vertM)) * paceSec * terrainFactor(t)) / 60);
}
export function phasesFor(n: number, taper: number): Phase[] {
  const T = n < 10 ? Math.min(taper, 1) : Math.min(taper, n - 6);
  const R = n - T;
  const base = Math.max(1, Math.round(R * 0.4)), build = Math.max(1, Math.round(R * 0.35)), spec = Math.max(0, R - base - build);
  return [...Array(base).fill('base'), ...Array(build).fill('build'), ...Array(spec).fill('specific'), ...Array(T).fill('taper')] as Phase[];
}
export function taperFractions(T: number) { return T <= 0 ? [] : T === 1 ? [0.55] : T === 2 ? [0.75, 0.5] : [0.8, 0.6, 0.45]; }
/** Gut training: carbs per hour on long runs, from 30 g/h up to the race target before the race-specific phase. */
export function gutTarget(q: Pick<UltraQuiz, 'gut'>) { return q.gut === 'trained' ? 75 : q.gut === 'some' ? 60 : 60; }
export function gutProgression(i: number, rampWeeks: number, target: number) {
  const f = rampWeeks <= 1 ? 1 : Math.min(1, i / (rampWeeks - 1));
  return Math.round((30 + (target - 30) * f) / 5) * 5;
}
export const lapPaceSec = (lapMin: number) => (lapMin * 60) / YARD_KM; // sec per km to finish a yard in lapMin
export const fmtPace = (secPerKm: number, imperial = false) => { const s = Math.round(imperial ? secPerKm * KM_PER_MI : secPerKm); return `${Math.floor(s / 60)}:${pad(s % 60)} /${imperial ? 'mi' : 'km'}`; };

/** Weekly layout: weekday → role, relative to the long-run day. */
export function layout(days: number, longDay: number) {
  const L = mod7(longDay), at = (o: number) => mod7(L + o);
  const d = Math.max(4, Math.min(7, Math.round(days)));
  const roles: Record<number, 'long' | 'b2b' | 'quality' | 'easy' | 'shake'> = { [L]: 'long', [at(1)]: 'b2b', [at(-4)]: 'quality', [at(-2)]: 'easy' };
  if (d >= 5) roles[at(-5)] = 'easy';
  if (d >= 6) roles[at(-3)] = 'easy';
  if (d >= 7) roles[at(-1)] = 'shake';
  const strength = d >= 5 ? [at(-5), at(-2)] : [at(-2), at(-4)];
  return { roles, strength };
}

const STRENGTH = ['Split squat or step-up 3 × 8/leg (heavy, 2–3 reps in reserve)', 'Romanian deadlift 3 × 8', 'Single-leg calf raise 3 × 12 (knee straight + bent)', 'Slow step-downs 3 × 8/leg (downhill prep)', 'Side plank 3 × 30 s/side + dead bug 3 × 10', 'Hip airplane or banded walks 2 × 10'];

export function buildPlan(q: UltraQuiz, today: string, raceForPlan: RaceId = q.race, yardsForPlan = q.yards): Plan {
  const spec = specOf(raceForPlan, yardsForPlan);
  const base = raceForPlan === 'base';
  const weeksAvail = base ? Math.max(MIN_PLAN_WEEKS, Math.min(12, weeksToRace(today, q.raceDate))) : Math.max(1, Math.min(MAX_PLAN_WEEKS, weeksToRace(today, q.raceDate)));
  const raceDate = base ? addDaysK(mondayOf(today), 7 * (weeksAvail - 1) + 6) : q.raceDate;
  const n = weeksAvail;
  const startDate = addDaysK(mondayOf(raceDate), -7 * (n - 1));
  const phases = base ? (Array(n).fill('base') as Phase[]).map((p, i) => (i >= Math.round(n * 0.6) ? 'build' : p)) as Phase[] : phasesFor(n, spec.taperWeeks);
  const T = phases.filter((p) => p === 'taper').length;
  const R = n - T;
  const dayF = ({ 4: 0.8, 5: 0.9, 6: 1, 7: 1.05 } as Record<number, number>)[Math.max(4, Math.min(7, q.days))] || 1;
  const peak = Math.round(Math.max(spec.peakWeekKm * dayF, Math.min(q.weeklyKm, spec.peakWeekKm * 1.3)));
  const startV = Math.max(10, Math.min(q.weeklyKm || 10, peak));
  const cycle = q.years < 2 || q.age >= 50 ? 3 : 4;
  const pace = q.easyPaceSec > 150 && q.easyPaceSec < 1200 ? q.easyPaceSec : 390;
  const vertPerKm = q.terrain === 'road' || !spec.km ? 0 : Math.max(0, q.vertM) / spec.km;
  const shareMax = q.days <= 4 ? 0.5 : 0.45;
  const gutGoal = gutTarget(q);
  const rampWeeks = phases.filter((p) => p === 'base' || p === 'build').length;
  const L = layout(q.days, q.longDay);
  const isByu = raceForPlan === 'byu';
  const lap = Math.max(40, Math.min(58, q.lapMin || 50));
  const vols: number[] = [], longs: number[] = [];
  let lastLoad = startV, maxLoad = startV;
  // Spread the climb to peak over the loading weeks before the race-specific block (never more than +10%/week).
  const specStart = phases.indexOf('specific') >= 0 ? phases.indexOf('specific') : R;
  const loadWeeks = Array.from({ length: Math.max(1, specStart) }, (_, i) => i).filter((i) => i > 0 && !(i % cycle === cycle - 1)).length || 1;
  const growth = Math.max(1, Math.min(MAX_RAMP, Math.pow(peak / startV, 1 / loadWeeks)));
  for (let i = 0; i < R; i++) {
    const cut = i > 0 && i % cycle === cycle - 1 && i < R - 1;
    let v: number;
    if (i === 0) v = startV;
    else if (cut) v = Math.round(lastLoad * 0.7);
    else { v = Math.min(r1(lastLoad * growth), Math.max(peak, lastLoad)); lastLoad = v; }
    if (!cut) maxLoad = Math.max(maxLoad, v);
    vols.push(v);
  }
  const tf = taperFractions(T);
  for (let i = 0; i < T; i++) vols.push(Math.round(maxLoad * tf[i]));

  const weeks: PlanWeek[] = [];
  let lastFull = startV, maxActual = startV;
  for (let i = 0; i < n; i++) {
    const phase = phases[i];
    const cut = phase !== 'taper' && i > 0 && i % cycle === cycle - 1 && i < R - 1;
    const v = phase === 'taper' ? Math.round(maxActual * (tf[i - R] ?? 0.5)) : i === 0 ? vols[i] : cut ? Math.round(lastFull * 0.7) : Math.min(vols[i], Math.floor(lastFull * MAX_RAMP * 10) / 10);
    const prev4 = longs.slice(-4);
    const hist = Math.max(q.longestKm || 8, ...prev4);
    const cap30 = r1((prev4.length ? Math.max(...prev4, i < 4 ? q.longestKm || 0 : 0) : Math.max(q.longestKm, 8)) * MAX_LONG_SPIKE);
    let longKm: number;
    if (phase === 'taper') longKm = Math.round(Math.min(hist, spec.peakLongKm) * (tf[i - R] ?? 0.5) * 0.9);
    else if (cut) longKm = Math.round((longs[longs.length - 1] || q.longestKm || 10) * 0.75);
    else longKm = Math.floor(Math.min(cap30, spec.peakLongKm, v * shareMax));
    // time-on-feet cap for the long run
    const vertLong = Math.round(longKm * vertPerKm * (phase === 'base' ? 0.5 : phase === 'build' ? 0.75 : 1));
    while (longKm > 8 && estMin(longKm, vertLong, pace, q.terrain) > spec.peakLongMin) longKm -= 1;
    longKm = Math.max(Math.min(6, v, Math.floor(cap30)), longKm);
    const b2bOn = spec.b2b && !cut && ((phase === 'build' && i >= phases.indexOf('build') + Math.floor(phases.filter((p) => p === 'build').length / 2)) || phase === 'specific');
    const b2bKm = b2bOn ? Math.round(longKm * (phase === 'specific' ? 0.6 : 0.5)) : 0;
    const gut = phase === 'base' || phase === 'build' ? gutProgression(i, rampWeeks, gutGoal) : gutGoal;
    const vertWeek = Math.round(v * vertPerKm * (phase === 'base' ? 0.5 : phase === 'build' ? 0.75 : phase === 'specific' ? 1 : 0.6));
    const days = buildWeekDays({ q, spec, i, n, phase, cut, v, longKm, b2bKm, gut, vertWeek, vertLong, pace, L, startDate, raceDate, isByu, lap, base });
    const km = r1(days.reduce((a, d) => a + (d.kind === 'race' ? 0 : d.km), 0));
    longs.push(days.find((d) => d.kind === 'long' || d.kind === 'sim')?.km ?? longKm); // the run actually planned (sims round down to whole yards)
    if (!cut && phase !== 'taper') { lastFull = km; maxActual = Math.max(maxActual, km); }
    weeks.push({ i, phase, cut, km, longKm: days.find((d) => d.kind === 'long' || d.kind === 'sim')?.km ?? 0, b2bKm: days.find((d) => d.kind === 'b2b' || d.kind === 'night')?.km ?? 0, vertM: days.reduce((a, d) => a + d.vertM, 0), gut, days, focus: focusOf(phase, cut, isByu, base), startDate: addDaysK(startDate, i * 7) });
  }
  return { spec, weeks, startDate, raceDate, peakKm: Math.max(...weeks.map((w) => w.km)), cycle };
}

function focusOf(p: Phase, cut: boolean, byu: boolean, base: boolean) {
  if (cut) return 'Cut-back week: about 30% less so the last block can sink in. Sleep, eat well and keep everything easy.';
  if (base) return p === 'base' ? 'Easy aerobic volume, strides and strength: the engine and the legs an ultra needs.' : 'Longer long runs and a first taste of hills and fuelling on the run.';
  return ({
    base: 'Aerobic base: lots of easy Zone 1–2 running, short hill sprints and two strength sessions. Gut training starts at 30 g carbs per hour.',
    build: 'Build: longer long runs, one harder session (threshold or uphill intervals) and your first back-to-backs. Raise carbs per hour step by step.',
    specific: byu ? 'Backyard-specific: on-the-hour loop simulations, lap-pace “gears”, a night session and a well-rehearsed between-yards routine.' : 'Race-specific: race terrain, race-effort running, back-to-back long days and your full race kit and fuelling.',
    taper: 'Taper: volume drops each week while short faster efforts stay, so you arrive fresh. Bank extra sleep and don’t try anything new.',
  } as Record<Phase, string>)[p];
}

interface WeekCtx { q: UltraQuiz; spec: RaceSpec; i: number; n: number; phase: Phase; cut: boolean; v: number; longKm: number; b2bKm: number; gut: number; vertWeek: number; vertLong: number; pace: number; L: ReturnType<typeof layout>; startDate: string; raceDate: string; isByu: boolean; lap: number; base: boolean }

function fuelBlocks(min: number, gut: number, label: string, note: string): StepT[] {
  const warm = Math.min(10, Math.max(5, Math.round(min * 0.1)));
  const rest = Math.max(0, min - warm);
  const n = Math.max(1, Math.round(rest / 20));
  const per = Math.round((gut * 20) / 60);
  const steps: StepT[] = [{ label: 'Warm-up', sec: warm * 60, kind: 'rest', note: 'Walk 2–3 min, then very easy running' }];
  for (let k = 0; k < n; k++) {
    const sec = k === n - 1 ? (rest - 20 * (n - 1)) * 60 : 20 * 60;
    if (sec > 0) steps.push({ label: `${label} · block ${k + 1}/${n}`, sec, kind: 'work', round: k + 1, of: n, note: `${note} · at the start: ~${per} g carbs + 150–250 mL to thirst` });
  }
  return steps;
}

function buildWeekDays(c: WeekCtx): DaySession[] {
  const { q, spec, i, phase, cut, v, longKm, b2bKm, gut, vertWeek, vertLong, pace, L, startDate, raceDate, isByu, lap, base } = c;
  const weekStart = addDaysK(startDate, i * 7);
  const raceWeek = !base && mondayOf(raceDate) === weekStart;
  const raceWd = weekdayOf(raceDate);
  const out: DaySession[] = [];
  const mk = (wd: number, kind: Kind, title: string, km: number, vertM: number, detail: string[], steps: StepT[], zone: string, extra: Partial<DaySession> = {}): DaySession => {
    const min = kind === 'strength' ? 35 : kind === 'rest' || kind === 'race' ? 0 : Math.max(10, r5(estMin(km, vertM, pace, q.terrain)));
    return { wd, date: addDaysK(weekStart, wd), kind, title, km: r1(km), min: extra.min ?? min, vertM: Math.round(vertM), strength: false, detail, steps: steps.length ? steps : [{ label: title, sec: min * 60, kind: 'work', note: zone }], zone, ...extra };
  };
  const roles = L.roles;
  const strengthDays = phase === 'taper' ? (i === c.n - 1 ? [] : L.strength.slice(0, 1)) : phase === 'specific' || cut ? L.strength.slice(0, 1) : L.strength;
  const hikeOn = q.terrain === 'mountain' && (phase === 'build' || phase === 'specific') && !cut && q.days >= 5;
  // quality
  const tPace = 'Threshold (T) pace or Zone 4 · “comfortably hard”';
  let qKm = Math.max(6, Math.round(v * 0.12));
  const quality = (wd: number): DaySession => {
    if (raceWeek) return mk(wd, 'opener', 'Race-week opener', 6, 0, ['20–30 min very easy with 4 × 20 s relaxed strides.', 'Lay out your race kit tonight; check the forecast.'], [{ label: 'Easy', sec: 20 * 60, kind: 'work', note: 'Zone 1–2' }, ...Array.from({ length: 4 }).flatMap((_, k) => [{ label: 'Stride', sec: 20, kind: 'work' as const, round: k + 1, of: 4, note: 'Fast & relaxed' }, { label: 'Walk back', sec: 60, kind: 'rest' as const, round: k + 1, of: 4 }]), { label: 'Easy', sec: 5 * 60, kind: 'rest' }], 'Zone 1–2 + strides');
    if (cut || phase === 'base') {
      const hills = i % 2 === 0 || q.terrain !== 'road';
      if (hills) {
        const nSpr = phase === 'base' ? Math.min(10, 6 + Math.floor(i / 2)) : 6;
        return mk(wd, 'hills', `Easy + ${nSpr} × 10 s hill sprints`, qKm, Math.round(vertWeek * 0.1), [`Easy ${Math.max(20, r5(estMin(qKm, 0, pace, 'road') - 20))} min, then ${nSpr} × 8–10 s all-out up a steep hill.`, 'Walk back down and rest ~2 min — each sprint should be as strong as the first.', 'Builds leg power and stride without much fatigue (Uphill Athlete).'], [{ label: 'Easy run', sec: Math.max(15, r5(estMin(qKm, 0, pace, 'road') - 20)) * 60, kind: 'rest', note: 'Zone 1–2' }, ...Array.from({ length: nSpr }).flatMap((_, k) => [{ label: 'Hill sprint', sec: 10, kind: 'work' as const, round: k + 1, of: nSpr, note: 'Max effort, steep hill' }, ...(k < nSpr - 1 ? [{ label: 'Walk down + rest', sec: 120, kind: 'rest' as const, round: k + 1, of: nSpr }] : [])]), { label: 'Cool-down', sec: 300, kind: 'rest', note: 'Easy' }], 'Zone 1–2 + short max sprints');
      }
      return mk(wd, 'strides', 'Easy + 6 × 20 s strides', qKm, 0, ['Easy running with 6 relaxed, quick strides near the end.', 'Keeps leg speed and form in an easy week.'], [{ label: 'Easy run', sec: Math.max(15, r5(estMin(qKm, 0, pace, 'road') - 8)) * 60, kind: 'rest', note: 'Zone 1–2' }, ...Array.from({ length: 6 }).flatMap((_, k) => [{ label: 'Stride', sec: 20, kind: 'work' as const, round: k + 1, of: 6, note: 'Fast & relaxed' }, ...(k < 5 ? [{ label: 'Walk back', sec: 60, kind: 'rest' as const, round: k + 1, of: 6 }] : [])])], 'Zone 1–2 + strides');
    }
    if (phase === 'build') {
      if (q.terrain === 'road') {
        // Daniels: T running ≤ 10% of weekly volume; ~10-min reps.
        const tKmPer10 = (10 * 60) / (pace * 0.82);
        const reps = Math.max(2, Math.min(4, Math.floor((v * 0.1) / tKmPer10)));
        qKm = Math.max(qKm, Math.round(reps * tKmPer10 + (25 * 60) / pace));
        return mk(wd, 'threshold', `Threshold ${reps} × 10 min`, qKm, 0, [`15 min easy, ${reps} × 10 min at threshold with 2 min easy jog, 10 min easy.`, 'Threshold stays ≤ 10% of the week (Daniels). Raises the pace you can hold for hours at low effort.'], [{ label: 'Warm-up', sec: 900, kind: 'rest', note: 'Easy' }, ...Array.from({ length: reps }).flatMap((_, k) => [{ label: 'Threshold', sec: 600, kind: 'work' as const, round: k + 1, of: reps, note: tPace, pace: 'T' as const }, ...(k < reps - 1 ? [{ label: 'Easy jog', sec: 120, kind: 'rest' as const, round: k + 1, of: reps }] : [])]), { label: 'Cool-down', sec: 600, kind: 'rest', note: 'Easy' }], tPace, { min: r5(25 + reps * 12 - 2) });
      }
      const reps = Math.min(6, 4 + Math.floor((i - c.n * 0.4) / 2));
      return mk(wd, 'uphill', `Uphill intervals ${Math.max(4, reps)} × 4 min`, qKm, Math.round(vertWeek * 0.2), [`15 min easy, ${Math.max(4, reps)} × 4 min hard uphill (Zone 4) — run or power-hike — easy back down, 10 min easy.`, 'Muscular endurance for long climbs (Uphill Athlete: Zone 4 bouts of 3–8 min).'], [{ label: 'Warm-up', sec: 900, kind: 'rest', note: 'Easy' }, ...Array.from({ length: Math.max(4, reps) }).flatMap((_, k, a) => [{ label: 'Uphill', sec: 240, kind: 'work' as const, round: k + 1, of: a.length, note: 'Zone 4 · run or power-hike' }, ...(k < a.length - 1 ? [{ label: 'Easy down', sec: 180, kind: 'rest' as const, round: k + 1, of: a.length }] : [])]), { label: 'Cool-down', sec: 600, kind: 'rest', note: 'Easy' }], 'Zone 4 uphill');
    }
    if (phase === 'specific') {
      if (isByu) {
        const g = [55, 50, 45].map((m) => fmtPace(lapPaceSec(m)));
        return mk(wd, 'gears', 'Yard-pace “gears” 55 / 50 / 45', qKm, 0, [`10 min easy, then 15 min at 55-min-yard pace (${g[0]}), 5 min easy, 15 min at 50-min pace (${g[1]}), 5 min easy, 15 min at 45-min pace (${g[2]}), 10 min easy.`, 'Learn three “gears” by feel so you can speed up for a longer rest (e.g. to sleep) or ease off when tired.'], [{ label: 'Warm-up', sec: 600, kind: 'rest', note: 'Easy' }, { label: '55-min yard pace', sec: 900, kind: 'work', note: g[0] }, { label: 'Easy', sec: 300, kind: 'rest' }, { label: '50-min yard pace', sec: 900, kind: 'work', note: g[1] }, { label: 'Easy', sec: 300, kind: 'rest' }, { label: '45-min yard pace', sec: 900, kind: 'work', note: g[2] }, { label: 'Cool-down', sec: 600, kind: 'rest', note: 'Easy' }], 'Yard pace by feel', { min: 75 });
      }
      return mk(wd, 'race-effort', 'Race-effort 3 × 15 min', qKm, Math.round(vertWeek * 0.15), [`15 min easy, 3 × 15 min at your goal ultra effort on race-like terrain (5 min easy between), 10 min easy.`, 'Ultra effort is steady and controlled — you should be able to speak in short sentences. Practise downhills and hiking the steep bits.'], [{ label: 'Warm-up', sec: 900, kind: 'rest', note: 'Easy' }, ...Array.from({ length: 3 }).flatMap((_, k) => [{ label: 'Race effort', sec: 900, kind: 'work' as const, round: k + 1, of: 3, note: 'Goal ultra effort · Zone 2–3' }, ...(k < 2 ? [{ label: 'Easy', sec: 300, kind: 'rest' as const, round: k + 1, of: 3 }] : [])]), { label: 'Cool-down', sec: 600, kind: 'rest', note: 'Easy' }], 'Zone 2–3 race effort', { min: 80 });
    }
    // taper
    return mk(wd, 'sharpen', 'Sharpen: easy + 6 × 1 min steady', Math.max(6, Math.round(qKm * 0.8)), 0, ['Easy running with 6 × 1 min at steady/threshold effort (1 min easy between).', 'Keep some intensity while volume drops — that’s what a good taper does (Bosquet meta-analysis).'], [{ label: 'Easy', sec: 900, kind: 'rest', note: 'Zone 1–2' }, ...Array.from({ length: 6 }).flatMap((_, k) => [{ label: 'Steady', sec: 60, kind: 'work' as const, round: k + 1, of: 6, note: 'Threshold effort' }, ...(k < 5 ? [{ label: 'Easy', sec: 60, kind: 'rest' as const, round: k + 1, of: 6 }] : [])]), { label: 'Easy', sec: 600, kind: 'rest' }], 'Zone 1–2 + short steady');
  };

  const longSession = (wd: number): DaySession => {
    const t = estMin(longKm, vertLong, pace, q.terrain);
    if (isByu && (phase === 'specific') && !cut) {
      const y = Math.max(2, Math.floor(longKm / YARD_KM));
      const steps: StepT[] = Array.from({ length: y }).flatMap((_, k) => [{ label: `Yard ${k + 1}/${y}`, sec: lap * 60, kind: 'work' as const, round: k + 1, of: y, note: `${YARD_KM} km in ~${lap} min (${fmtPace(lapPaceSec(lap))}) · fuel ~${gut} g carbs this hour` }, ...(k < y - 1 ? [{ label: 'Between yards', sec: (60 - lap) * 60, kind: 'rest' as const, round: k + 1, of: y, note: 'Routine: drink, eat, toilet, feet/clothes, back in the corral at −1 min' }] : [])]);
      return mk(wd, 'sim', `Backyard simulation · ${y} yards`, y * YARD_KM, Math.round(vertLong), [`${y} loops of ${YARD_KM} km (${YARD_MI.toFixed(3)} mi), each starting on the hour. Aim for ${lap}-min yards; the rest of the hour is your routine.`, `Fuel every yard: ~${gut} g carbs, fluids to thirst, salty food. Same kit and food you’ll race with.`, 'Use the Backyard lap timer — it counts the hour, your lap and the rest left.'], steps, 'Zone 1–2, walk the hills', { yards: y, carbsPerH: gut, min: y * 60 - (60 - lap) });
    }
    const label = q.terrain === 'road' ? 'Long run' : 'Long run · time on feet';
    return mk(wd, 'long', `${label} ${Math.round(longKm)} km`, longKm, vertLong, [
      `${Math.round(longKm)} km${vertLong ? ` with ~${vertLong} m climbing` : ''}, about ${Math.floor(t / 60)}:${pad(t % 60)} at easy effort (Zone 1–2). Walk/power-hike steep climbs.`,
      `Gut training: ~${gut} g carbs per hour (every 20 min: ~${Math.round(gut / 3)} g + 150–250 mL, to thirst).`,
      phase === 'specific' ? 'Dress rehearsal: race shoes, pack, food and drink.' : 'Never more than 10% longer than your longest run of the last 30 days.',
    ], fuelBlocks(Math.max(30, r5(t)), gut, 'Long run', 'Zone 1–2'), 'Zone 1–2', { carbsPerH: gut });
  };

  const b2bSession = (wd: number): DaySession => {
    if (isByu && phase === 'specific') {
      const y = Math.max(1, Math.floor(b2bKm / YARD_KM));
      return mk(wd, 'night', `Night yards · ${y} × ${YARD_KM} km`, y * YARD_KM, 0, [`Start at 20:00 or later: ${y} yard${y > 1 ? 's' : ''} on the hour with a headlamp, on tired legs from yesterday.`, 'Practise: headlamp + spare batteries, a warm layer for the rest minutes, caffeine timing, eating when you’re not hungry.'], Array.from({ length: y }).flatMap((_, k) => [{ label: `Night yard ${k + 1}/${y}`, sec: lap * 60, kind: 'work' as const, round: k + 1, of: y, note: 'Headlamp · easy' }, ...(k < y - 1 ? [{ label: 'Between yards', sec: (60 - lap) * 60, kind: 'rest' as const, round: k + 1, of: y, note: 'Warm layer on, eat, drink' }] : [])]), 'Zone 1–2', { yards: y, carbsPerH: gut, min: y * 60 - (60 - lap) });
    }
    const t = estMin(b2bKm, Math.round(vertLong * 0.6), pace, q.terrain);
    return mk(wd, 'b2b', `Back-to-back ${b2bKm} km`, b2bKm, Math.round(vertLong * 0.6), [`Day 2 of the long weekend: ${b2bKm} km easy on tired legs (~${Math.floor(t / 60)}:${pad(t % 60)}).`, 'Back-to-backs build fatigue resistance without one huge single run.', `Keep fuelling: ~${gut} g carbs per hour.`], fuelBlocks(Math.max(30, r5(t)), gut, 'Back-to-back', 'Zone 1–2 · on tired legs'), 'Zone 1–2', { carbsPerH: gut });
  };

  // assign km to easy days
  const roleOf = (wd: number) => roles[wd];
  const activeB2B = b2bKm > 0;
  const qWd = Object.keys(roles).map(Number).find((wd) => roles[wd] === 'quality');
  const qSess = qWd !== undefined ? quality(qWd) : null;
  const fixedKm = raceWeek ? (qSess?.km || 0) + 4 : longKm + (activeB2B ? b2bKm : 0) + (qSess?.km || 0);
  const easyWds = Object.keys(roles).map(Number).filter((wd) => roles[wd] === 'easy' || roles[wd] === 'shake' || (roles[wd] === 'b2b' && !activeB2B));
  const leftover = Math.max(0, v - fixedKm);
  // Keep easy runs worth doing (≥5 km): at low volume, use fewer easy days instead of many tiny ones,
  // so the week's planned km is actually run (and next week's +10% builds on it).
  const hikePick = hikeOn ? easyWds.find((wd) => roles[wd] === 'easy' && !strengthDays.includes(wd)) : undefined;
  const prio = [...easyWds].sort((a, b) => (a === hikePick ? -1 : b === hikePick ? 1 : 0) || (roles[a] === 'easy' ? 0 : roles[a] === 'b2b' ? 1 : 2) - (roles[b] === 'easy' ? 0 : roles[b] === 'b2b' ? 1 : 2));
  const nEasy = raceWeek ? easyWds.length : Math.min(easyWds.length, Math.max(leftover >= 2.5 ? 1 : 0, Math.floor(leftover / 5)));
  const usedWds = easyWds.filter((wd) => prio.slice(0, nEasy).includes(wd));
  const weights = usedWds.map((wd) => (roles[wd] === 'shake' ? 0.5 : roles[wd] === 'b2b' ? 0.8 : 1));
  const wsum = weights.reduce((a, b) => a + b, 0) || 1;
  const hikeWd = hikePick !== undefined && usedWds.includes(hikePick) && leftover / Math.max(1, nEasy) >= 5 ? hikePick : undefined;

  for (let wd = 0; wd < 7; wd++) {
    const role = roleOf(wd);
    let s: DaySession;
    if (raceWeek && wd > raceWd) s = mk(wd, 'rest', 'Recovery', 0, 0, ['Rest. Walk, eat, sleep — see Prep › Recovery.'], [], 'Rest');
    else if (raceWeek && wd === raceWd) s = mk(wd, 'race', `Race day · ${spec.name}`, spec.km, q.terrain === 'road' ? 0 : q.vertM, ['Follow your race-day plan (Prep tab) and fuelling plan (Fuel tab).', isByu ? `Every yard: ${YARD_KM} km in ~${lap} min, then your routine. Use the Backyard lap timer.` : 'Start slower than feels right. Eat early, drink to thirst, salt with fluids.'], [], 'Race', { min: 0 });
    else if (raceWeek && role === 'long') s = mk(wd, 'easy', 'Easy 20–30 min + rest', 4, 0, ['Short and easy, or rest if the race is tomorrow.'], [], 'Zone 1');
    else if (raceWeek && (wd === mod7(raceWd - 1) || wd === mod7(raceWd - 2))) s = mk(wd, role ? 'easy' : 'rest', role ? 'Shake-out 15–20 min' : 'Rest', role ? 3 : 0, 0, ['Very easy, or rest. Eat carb-rich, low-fibre meals (about 10–12 g/kg a day in the last 36–48 h if you carb-load), and sleep long.'], [], 'Zone 1');
    else if (role === 'long') s = longSession(wd);
    else if (role === 'b2b' && activeB2B) s = b2bSession(wd);
    else if (role === 'quality' && qSess) s = qSess;
    else if (role && usedWds.includes(wd)) {
      const idx = usedWds.indexOf(wd);
      const shares = usedWds.map((_, k) => Math.floor(leftover * (weights[k] / wsum)));
      let km = shares[idx] + (idx === 0 ? Math.round(leftover - shares.reduce((a, b) => a + b, 0)) : 0);
      if (raceWeek) km = Math.min(km, 6);
      if (wd === hikeWd) {
        const hv = Math.round(vertWeek * 0.25);
        s = mk(wd, 'hike', 'Power-hike / vert session', Math.max(5, km), hv, [`45–75 min steep power-hiking${hv ? `, ~${hv} m up` : ''} (stairs or treadmill incline work too).`, 'On steep grades walking costs less energy than running — practise a strong hike.', 'Poles if your race allows them (backyard rules don’t).'], [], 'Zone 2–3 hiking', { min: 60 });
      } else if (km < 2.5) s = mk(wd, 'rest', role === 'b2b' ? 'Rest or easy walk' : 'Rest or mobility', 0, 0, ['Rest, walk or 15 min mobility.'], [], 'Rest');
      else s = mk(wd, 'easy', role === 'shake' ? `Shake-out ${km} km` : role === 'b2b' ? `Recovery ${km} km` : `Easy ${km} km`, km, Math.round(vertWeek * 0.05), [role === 'b2b' ? 'Very easy recovery run the day after your long run.' : 'Easy, conversational (Zone 1–2). Most of your week lives here.', vertWeek && q.terrain !== 'road' ? 'Trails or rolling routes if you can.' : 'Soft surfaces help.'], [], 'Zone 1–2');
    } else s = mk(wd, 'rest', 'Rest', 0, 0, ['Full rest day.'], [], 'Rest');
    if (strengthDays.includes(wd) && s.kind !== 'race' && s.kind !== 'long' && s.kind !== 'sim' && !(raceWeek && wd >= mod7(raceWd - 3))) {
      s.strength = true;
      s.detail = [...s.detail, `+ Strength & mobility ~35 min: ${STRENGTH.slice(0, phase === 'taper' || phase === 'specific' ? 4 : 6).join(' · ')}.`];
      if (s.kind === 'rest') { s.kind = 'strength'; s.title = 'Strength & mobility'; s.min = 35; s.steps = []; }
    }
    out.push(s);
  }
  return out;
}

/** All plan sessions (flattened) — handy for tests and "today". */
export const allSessions = (p: Plan) => p.weeks.flatMap((w) => w.days.map((d) => ({ w: w.i, ...d })));
export function sessionAt(p: Plan, w: number, wd: number) { return p.weeks[w]?.days.find((d) => d.wd === wd) || null; }
export function currentWeekIdx(p: Plan, today: string) { const d = daysBetween(p.startDate, today); return d < 0 ? -1 : Math.floor(d / 7); }

// ---------------------------------------------------------------- saved plan (lives on the profile, syncs with it)
export interface FuelPrefs { climate?: Climate; gut?: GutLevel; sweatRateL?: number | null; salty?: boolean; caffeineSensitive?: boolean; hours?: number; aidEveryH?: number }
export interface UltraSaved {
  version: 1; quiz: UltraQuiz; createdAt: string; target: RaceId; yards?: number; level: Screen['level'];
  applyToFuel?: boolean; checks?: Record<string, boolean>; fuel?: FuelPrefs;
}
/** The plan is rebuilt from the saved answers and creation day, so it never shifts under you. */
export const planOf = (s: UltraSaved) => buildPlan(s.quiz, s.createdAt, s.target, s.yards ?? s.quiz.yards);
export const activeUltra = (s?: UltraSaved | null) => (s && s.level !== 'stop' && canPlan(s.quiz) ? s : null);
export function ultraTargetsFor(s: UltraSaved, weightKg: number, day: string): DayTargets | null {
  if (!s.applyToFuel || s.quiz.edHistory) return null;
  const p = planOf(s);
  const w = Math.floor(daysBetween(p.startDate, day) / 7);
  if (w < 0 || w >= p.weeks.length) return null;
  const d = p.weeks[w].days.find((x) => x.date === day) || null;
  return dayTargets(weightKg, d, p.weeks[w].phase);
}

// ---------------------------------------------------------------- daily nutrition (ties into Fuel)
/** Carbohydrate g/kg/day by the day's load (ACSM/AND/DC 2016 ranges; ISSN ultra 5–8 g/kg on heavy training). */
export function carbGkg(s: Pick<DaySession, 'kind' | 'min'> | null) {
  if (!s || s.kind === 'rest') return 4; // light: 3–5
  if (s.kind === 'strength' || s.kind === 'opener') return 5;
  if (s.kind === 'race') return 10;
  if (s.kind === 'long' || s.kind === 'sim' || s.kind === 'b2b' || s.kind === 'night') return s.min > 240 ? 10 : s.min > 150 ? 8 : 7; // high 6–10, very high 8–12
  if (s.min > 75) return 6;
  return 5; // moderate 5–7
}
export interface DayTargets { kcal: number; carbs: number; protein: number; fat: number; carbGkg: number; kind: 'train' | 'rest' }
export function dayTargets(weightKg: number, s: Pick<DaySession, 'kind' | 'min'> | null, phase?: Phase): DayTargets {
  const g = carbGkg(s);
  const heavy = phase === 'specific' || (s && (s.kind === 'long' || s.kind === 'sim' || s.kind === 'b2b'));
  const pr = heavy ? 1.8 : 1.6; // ISSN: ~1.6 g/kg; up to 2.5 when demands are high
  const carbs = Math.round(weightKg * g), protein = Math.round(weightKg * pr), fat = Math.round(weightKg * 1.0);
  return { kcal: Math.round((carbs * 4 + protein * 4 + fat * 9) / 10) * 10, carbs, protein, fat, carbGkg: g, kind: s && s.kind !== 'rest' ? 'train' : 'rest' };
}

// ---------------------------------------------------------------- race fuelling planner
export interface FuelIn { weightKg: number; hours: number; climate: Climate; gut: GutLevel; sweatRateL?: number | null; salty?: boolean; caffeineSensitive?: boolean; race: RaceId; lapMin?: number; aidEveryH?: number }
export interface FuelOut {
  carbs: [number, number]; kcal: [number, number]; protein: [number, number]; fluid: [number, number]; sodium: [number, number];
  caffeine: { perDoseMg: [number, number]; maxMg: number; startHour: number; note: string } | null;
  per20: { carbs: [number, number]; fluid: [number, number] }; notes: string[];
}
export function sweatRate(preKg: number, postKg: number, drankL: number, urineL: number, minutes: number) {
  if (!(preKg > 0) || !(postKg > 0) || !(minutes >= 30)) return null;
  const v = (preKg - postKg + Math.max(0, drankL) - Math.max(0, urineL)) / (minutes / 60);
  return v > 0 && v < 4 ? Math.round(v * 100) / 100 : null;
}
const r10 = (x: number) => Math.round(x / 10) * 10;
export function fuelPlan(f: FuelIn): FuelOut {
  const long = f.hours > 11 || f.race === '100k' || f.race === '100mi' || (f.race === 'byu' && f.hours > 12);
  // ISSN: 30–50 g/h baseline; up to ~90 g/h (2:1 glucose:fructose) once gut-trained (Costa 2019, Jeukendrup 2014). Never above 90 by default.
  const carbs: [number, number] = f.gut === 'trained' ? [60, 90] : f.gut === 'some' ? [40, 60] : [30, 50];
  const protein: [number, number] = [5, 10];
  const issnK: [number, number] = long ? [200, 400] : [150, 300];
  const kcal: [number, number] = [Math.max(issnK[0], carbs[0] * 4), Math.max(issnK[1], carbs[1] * 4 + protein[1] * 4)];
  let fluid: [number, number] = [450, 750];
  const notes: string[] = [];
  if (f.sweatRateL && f.sweatRateL > 0) {
    const sr = Math.round(f.sweatRateL * 1000);
    const hi = Math.min(f.climate === 'hot' ? 1000 : 800, sr); // never plan to drink more than you sweat
    fluid = [Math.min(450, Math.round(hi * 0.6)), hi];
    notes.push(`Your sweat rate is ~${f.sweatRateL.toFixed(2)} L/h, so the top of your range is capped there. Drinking more than you sweat is how hyponatremia happens.`);
  } else notes.push(f.climate === 'cool' ? 'Cool conditions: stay near the low end. Drink to thirst.' : f.climate === 'hot' ? 'Heat raises sweat losses: aim toward the top of the range and use cooling. Do a sweat-rate test to personalise this.' : 'Drink to thirst inside this range. A sweat-rate test makes it personal.');
  fluid = [r10(fluid[0]), r10(fluid[1])];
  const naLo = (fluid[0] / 1000) * 500, naHi = (fluid[1] / 1000) * 700;
  let sodium: [number, number] = [r10(naLo), r10(naHi)];
  if (f.climate === 'hot') sodium = [Math.max(sodium[0], 300), Math.max(sodium[1], 600)];
  if (f.salty) { sodium = [sodium[0], r10(sodium[1] * 1.25)]; notes.push('Salty sweater (white streaks on kit): aim for the top of the sodium range, from salty food as well as drinks.'); }
  notes.push('Sodium won’t protect you if you over-drink. In a 100-mile study, runners who got hyponatremia hadn’t taken less sodium. They had drunk too much.');
  const caf = f.caffeineSensitive ? null : {
    perDoseMg: [Math.round(f.weightKg * 1), Math.round(f.weightKg * 2)] as [number, number],
    maxMg: Math.round(f.weightKg * 6),
    startHour: f.hours <= 6 ? Math.max(1, Math.round(f.hours * 0.5)) : Math.round(Math.min(f.hours * 0.5, 12)),
    note: f.hours > 18 ? 'Save it for the night and the low points. Stay under the daily max per 24 h, and leave time to sleep afterwards.' : 'Save it for the second half. Small doses work, and you don’t need big ones.',
  };
  return { carbs, kcal, protein, fluid, sodium, caffeine: caf, per20: { carbs: [Math.round(carbs[0] / 3), Math.round(carbs[1] / 3)], fluid: [r10(fluid[0] / 3), r10(fluid[1] / 3)] }, notes };
}
/** Rough finish-time estimate for point-to-point races (HYBRD estimate: easy pace × km-effort × 1.25 slowdown). */
export function estRaceHours(race: RaceId, yards: number, terrain: Terrain, vertM: number, easyPaceSec: number) {
  if (race === 'byu') return Math.max(1, yards);
  const spec = specOf(race, yards);
  return Math.round(((terrain === 'road' ? spec.km : kmEffort(spec.km, vertM)) * easyPaceSec * terrainFactor(terrain) * 1.25) / 360) / 10;
}

// ---------------------------------------------------------------- backyard lap timer
export interface ByuTimer { start: number | null; finishes: number[]; stopped: number | null; lapMin: number; goal: number }
export interface ByuStatus {
  yard: number; yardStart: number; nextBell: number; bellInMs: number; onLap: boolean; lapMs: number; restLeftMs: number;
  completed: number; distM: number; elapsedMs: number; warn: 0 | 1 | 2 | 3; missed: boolean; laps: number[];
}
/** Pure status for the hourly backyard clock. `finishes[k]` = timestamp yard k+1 was finished. */
export function byuStatus(t: ByuTimer, now: number): ByuStatus {
  const laps: number[] = [];
  if (!t.start) return { yard: 0, yardStart: 0, nextBell: 0, bellInMs: 0, onLap: false, lapMs: 0, restLeftMs: 0, completed: 0, distM: 0, elapsedMs: 0, warn: 0, missed: false, laps };
  const end = t.stopped ?? now;
  let completed = 0;
  for (let k = 0; k < t.finishes.length; k++) {
    const ys = t.start + k * HOUR_MS;
    if (t.finishes[k] > ys && t.finishes[k] - ys < HOUR_MS) { completed++; laps.push(t.finishes[k] - ys); } else break;
  }
  const yard = Math.floor((end - t.start) / HOUR_MS) + 1;
  const yardStart = t.start + (yard - 1) * HOUR_MS;
  const nextBell = yardStart + HOUR_MS;
  const bellInMs = Math.max(0, nextBell - end);
  const finishedThis = completed >= yard;
  const missed = completed < yard - 1; // a whole hour passed without finishing the previous yard
  const onLap = !finishedThis && !missed;
  const lapMs = finishedThis ? laps[yard - 1] : end - yardStart;
  const restLeftMs = finishedThis ? bellInMs : 0;
  const warn = (bellInMs <= 60_000 ? 1 : bellInMs <= 120_000 ? 2 : bellInMs <= 180_000 ? 3 : 0) as 0 | 1 | 2 | 3;
  return { yard, yardStart, nextBell, bellInMs, onLap, lapMs, restLeftMs, completed, distM: Math.round(completed * YARD_M), elapsedMs: end - t.start, warn, missed, laps };
}
export const yardsToKm = (y: number) => +(y * YARD_KM).toFixed(2);
export const yardsToMi = (y: number) => +(y * YARD_MI).toFixed(2);

/** Backyard distance display only — does not change the global mi/km setting. */
export type ByuDistUnit = 'mi' | 'km' | 'm' | 'ft';
export const BYU_DIST_UNITS: readonly ByuDistUnit[] = ['mi', 'km', 'm', 'ft'];
export const YARD_EXPLAIN = 'A yard = one loop';

export const isByuDistUnit = (u: unknown): u is ByuDistUnit => u === 'mi' || u === 'km' || u === 'm' || u === 'ft';
export const defaultByuUnit = (units: 'metric' | 'imperial'): ByuDistUnit => (units === 'imperial' ? 'mi' : 'km');
export function resolveByuUnit(p: { units: 'metric' | 'imperial'; byuDistUnit?: ByuDistUnit | null }): ByuDistUnit {
  return isByuDistUnit(p.byuDistUnit) ? p.byuDistUnit : defaultByuUnit(p.units);
}
/** Imperial-family units (mi, ft) show pace per mile; metric-family (km, m) show pace per kilometre. */
export const byuPaceImperial = (unit: ByuDistUnit) => unit === 'mi' || unit === 'ft';
export const fmtByuPace = (secPerKm: number, unit: ByuDistUnit) => fmtPace(secPerKm, byuPaceImperial(unit));

export function yardsToExact(yards: number, unit: ByuDistUnit): number {
  switch (unit) {
    case 'mi': return yards * YARD_MI;
    case 'km': return yards * YARD_KM;
    case 'm': return yards * YARD_M;
    case 'ft': return yards * YARD_FT;
  }
}

const trimFixed = (n: number, d: number) => n.toFixed(d).replace(/\.0+$/, '').replace(/(\.[1-9]*)0+$/, '$1');
const intSep = (n: number) => Math.round(n).toLocaleString('en-US');

/** Formatted number (no unit): 4.167 / 100 / 6.706 / 160.9 / 6,706 / 22,000 */
export function fmtByuNumber(yards: number, unit: ByuDistUnit): string {
  const v = yardsToExact(yards, unit);
  if (unit === 'mi') return trimFixed(Math.round(v * 1000) / 1000, 3);
  if (unit === 'km') {
    if (v >= 100) return (Math.round(v * 10) / 10).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    return trimFixed(Math.round(v * 1000) / 1000, 3);
  }
  return intSep(v);
}
export const fmtByuDist = (yards: number, unit: ByuDistUnit) => `${fmtByuNumber(yards, unit)} ${unit}`;
export const loopDist = (unit: ByuDistUnit) => fmtByuDist(1, unit);
/** "24 yards = 100 mi = 160.9 km = 160,934 m = 528,000 ft" */
export const fmtByuEquals = (yards: number) =>
  `${yards} yard${yards === 1 ? '' : 's'} = ${fmtByuDist(yards, 'mi')} = ${fmtByuDist(yards, 'km')} = ${fmtByuDist(yards, 'm')} = ${fmtByuDist(yards, 'ft')}`;
export const LOOP_EQUALS = fmtByuEquals(1);

/** Saved backyard workouts store metres (yards × 6705.6, rounded). Recover the yard count so feet stay exact (22,000 / yard). */
export const yardsFromDistanceM = (m: number) => Math.round(m / YARD_M);
export const fmtByuWorkoutDist = (distanceM: number, unit: ByuDistUnit) => fmtByuDist(yardsFromDistanceM(distanceM), unit);
export const isByuWorkout = (w: { source?: string }) => w.source === 'byu';

/** Speed for one yard completed in `lapMin` minutes. Useful when the unit is m or ft (pace is still shown per km / per mi). */
export function fmtByuSpeed(lapMin: number, unit: ByuDistUnit): string {
  if (!(lapMin > 0)) return '—';
  if (unit === 'm') return `${(YARD_M / (lapMin * 60)).toFixed(2)} m/s`;
  if (unit === 'ft') return `${(YARD_FT / (lapMin * 60)).toFixed(2)} ft/s`;
  if (unit === 'km') return `${((YARD_KM / lapMin) * 60).toFixed(2)} km/h`;
  return `${((YARD_MI / lapMin) * 60).toFixed(2)} mph`;
}

export const BYU_TABLE_YARDS = [1, ...BYU_YARD_OPTIONS];
export function byuTableYards(extra?: number | number[]): number[] {
  const more = extra == null ? [] : Array.isArray(extra) ? extra : [extra];
  return [...new Set([1, ...BYU_YARD_OPTIONS, ...more.filter((n) => n > 0)])].sort((a, b) => a - b);
}

/** Plan text is written in metric; convert distances, climbs and paces for imperial users. */
export function unitText(s: string, imperial: boolean) {
  if (!imperial || !s) return s;
  return s
    .replace(/6\.7056 km \(4\.167 mi\)/g, '4.167 mi (\u0000)').replace(/6\.7056 km/g, '4.167 mi')
    .replace(/(\d+):(\d\d) \/km/g, (_, m, sec) => { const t = Math.round((+m * 60 + +sec) * KM_PER_MI); return `${Math.floor(t / 60)}:${pad(t % 60)} /mi`; })
    .replace(/(?<![\d.])(?<!\()(\d+(?:\.\d+)?)\s?km\b(?!\))/g, (_, n) => `${Math.round((+n / KM_PER_MI) * 10) / 10} mi`)
    .replace(/(\d[\d,]*)\s?m\b/g, (_, n) => `${Math.round(+String(n).replace(/,/g, '') * 3.28084).toLocaleString('en-US')} ft`)
    .replace(/\u0000/g, '6.7056 km');
}
