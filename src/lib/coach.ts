// HYBRD Coach — a deterministic, rule-based plan generator (no AI, no server). Pure functions only (no React, no
// JSON imports) so tools/test-coach.ts can run them under plain Node. The meal catalog is passed in.
//
// Pipeline: answers → level detection (self-tests) → weekly mix of session roles (goal × days, hybrid ordering
// rules) → each role resolved to an existing program session or a library template → fitness regressions,
// equipment swaps and injury swaps → scaled to the user's minutes → weekly progression with deloads.
// Nutrition reuses the weight-loss engine (src/lib/wl.ts) and its guardrails.
import type { Rec, Sex, Workout, WorkoutType } from './types';
import { PROGRAMS, type Block, type Session } from '../data/programs';
import { exById } from '../data/exercises';
import {
  buildWeek, computeWL, screen, REASON_TEXT, weekdayOf, WEEKDAYS,
  type Activity, type Allergen, type Catalog, type CookTime, type DayMacro, type DietPattern, type EnergyInput, type Health,
  type Pace, type PlanDay, type Religious, type ScreenLevel, type TrainType, type WLQuiz, type WLTargets,
} from './wl';

// ---------------------------------------------------------------- answers
export type CoachGoal = 'fat-loss' | 'muscle' | 'endurance' | 'race' | 'skills' | 'health';
export type RaceKind = '5k' | '10k' | 'half' | 'marathon' | 'hyrox';
export type TrainPref = 'strength' | 'calisthenics' | 'running' | 'cycling' | 'walking' | 'hiit' | 'hyrox';
export type Equip = 'none' | 'bar' | 'dumbbells' | 'gym' | 'bike' | 'treadmill';
export type Injury = 'knees' | 'back' | 'shoulders' | 'wrists';
export type CLevel = 'Beginner' | 'Intermediate' | 'Expert';
export type Experience = 'new' | 'some' | 'year';
export type RunAbility = 'none' | 'mile' | '5k' | '10k';

export interface CoachAnswers {
  goal: CoachGoal; race?: RaceKind;
  experience: Experience;
  /** Self-tests. pullUps null = no bar / not sure. Minutes are rough bands (see *_BANDS). */
  pushUps: number; pullUps: number | null;
  run: RunAbility; mileMin?: number; fiveKMin?: number;
  days: number; minutes: number; weeks: 4 | 6 | 8;
  prefs: TrainPref[]; equipment: Equip[]; injuries: Injury[];
  sex: Sex; age: number; heightCm: number; weightKg: number; activity: Activity;
  health: Health;
  /** PAR-Q style: a doctor said to avoid exercise, or chest pain / fainting / dizziness with exercise. */
  parq: boolean;
  pace: Pace; diet: DietPattern; religious: Religious; exclude: Allergen[]; meals: 2 | 3 | 4 | 5; cookTime: CookTime; budget: boolean;
}

export const GOALS: { v: CoachGoal; label: string; hint: string }[] = [
  { v: 'fat-loss', label: 'Lose fat', hint: 'Keep muscle, feel lighter' },
  { v: 'muscle', label: 'Build muscle & strength', hint: 'Get stronger, add muscle' },
  { v: 'endurance', label: 'Get fitter', hint: 'Engine, stamina, endurance' },
  { v: 'race', label: 'Prepare for a race', hint: '5K, 10K, half, marathon or HYROX' },
  { v: 'skills', label: 'Learn calisthenics skills', hint: 'Pull-ups, dips, handstands, levers' },
  { v: 'health', label: 'General health', hint: 'Move more, feel better' },
];
export const RACES: { v: RaceKind; label: string }[] = [
  { v: '5k', label: '5K' }, { v: '10k', label: '10K' }, { v: 'half', label: 'Half marathon' }, { v: 'marathon', label: 'Marathon' }, { v: 'hyrox', label: 'HYROX' },
];
export const PUSH_BANDS: { v: number; label: string }[] = [{ v: 0, label: '0' }, { v: 3, label: '1–4' }, { v: 7, label: '5–9' }, { v: 15, label: '10–19' }, { v: 25, label: '20–29' }, { v: 35, label: '30+' }];
export const PULL_BANDS: { v: number | null; label: string }[] = [{ v: null, label: 'No bar / not sure' }, { v: 0, label: '0' }, { v: 2, label: '1–3' }, { v: 5, label: '4–7' }, { v: 9, label: '8–11' }, { v: 13, label: '12+' }];
export const MILE_BANDS: { v: number; label: string }[] = [{ v: 7, label: 'Under 8 min' }, { v: 9, label: '8–10 min' }, { v: 11, label: '10–12 min' }, { v: 13, label: '12+ min' }];
export const FIVEK_BANDS: { v: number; label: string }[] = [{ v: 20, label: 'Under 22 min' }, { v: 23.5, label: '22–25 min' }, { v: 27.5, label: '25–30 min' }, { v: 32.5, label: '30–35 min' }, { v: 37, label: '35+ min' }];
export const PREFS: { v: TrainPref; label: string }[] = [
  { v: 'strength', label: 'Weights' }, { v: 'calisthenics', label: 'Calisthenics' }, { v: 'running', label: 'Running' }, { v: 'cycling', label: 'Cycling / indoor bike' },
  { v: 'walking', label: 'Walking' }, { v: 'hiit', label: 'HIIT' }, { v: 'hyrox', label: 'HYROX' },
];
export const EQUIPMENT: { v: Equip; label: string; hint: string }[] = [
  { v: 'none', label: 'Nothing', hint: 'Bodyweight only' }, { v: 'bar', label: 'Pull-up bar', hint: 'Door frame or park' },
  { v: 'dumbbells', label: 'Dumbbells / kettlebells', hint: 'At home' }, { v: 'gym', label: 'Full gym', hint: 'Barbells, machines, sled, erg' },
  { v: 'bike', label: 'Bike / indoor bike', hint: 'Road, trainer or stationary' }, { v: 'treadmill', label: 'Treadmill', hint: 'Indoor running' },
];
export const INJURIES: { v: Injury; label: string }[] = [{ v: 'knees', label: 'Knees' }, { v: 'back', label: 'Lower back' }, { v: 'shoulders', label: 'Shoulders' }, { v: 'wrists', label: 'Wrists' }];
export const bandLabel = (bands: { v: number | null; label: string }[], v: number | null | undefined) => bands.find((b) => b.v === v)?.label ?? String(v ?? '—');
export const raceLabel = (r?: RaceKind) => RACES.find((x) => x.v === r)?.label || 'race';
export const goalLabel = (g: CoachGoal) => GOALS.find((x) => x.v === g)?.label || g;

export function defaultAnswers(p: { sex: Sex; age: number; heightCm: number; weightKg: number; activity: Activity; weeklySessions?: number }): CoachAnswers {
  return {
    goal: 'health', experience: 'some', pushUps: 7, pullUps: null, run: 'mile', mileMin: 11,
    days: Math.max(2, Math.min(6, p.weeklySessions || 3)), minutes: 45, weeks: 6, prefs: [], equipment: ['none'], injuries: [],
    sex: p.sex, age: p.age, heightCm: p.heightCm, weightKg: p.weightKg, activity: p.activity, health: {}, parq: false,
    pace: 'moderate', diet: 'omnivore', religious: 'none', exclude: [], meals: 4, cookTime: 0, budget: false,
  };
}

// ---------------------------------------------------------------- level detection
export const LEVELS_C: CLevel[] = ['Beginner', 'Intermediate', 'Expert'];
const rank = (l: CLevel) => LEVELS_C.indexOf(l);
const minL = (a: CLevel, b: CLevel) => (rank(a) <= rank(b) ? a : b);
export interface LevelResult { strength: CLevel; endurance: CLevel; overall: CLevel; cap: CLevel; capWhy: string[] }

/** Strength level from the push-up / pull-up self-test. Expert also needs 1+ year of consistent training. */
export function strengthLevel(a: Pick<CoachAnswers, 'pushUps' | 'pullUps' | 'experience'>): CLevel {
  if (a.pushUps >= 30 && (a.pullUps ?? 0) >= 12 && a.experience === 'year') return 'Expert';
  if (a.pushUps >= 12 && (a.pullUps == null ? a.pushUps >= 20 : a.pullUps >= 3)) return 'Intermediate';
  return 'Beginner';
}
/** Endurance level from the run self-test. */
export function enduranceLevel(a: Pick<CoachAnswers, 'run' | 'mileMin' | 'fiveKMin' | 'experience'>): CLevel {
  if (a.run === '10k' && a.fiveKMin != null && a.fiveKMin <= 25 && a.experience === 'year') return 'Expert';
  if ((a.run === '5k' || a.run === '10k') && (a.fiveKMin == null || a.fiveKMin < 35)) return 'Intermediate';
  if (a.run === 'mile' && a.mileMin != null && a.mileMin <= 9) return 'Intermediate';
  return 'Beginner';
}
export function detectLevel(a: CoachAnswers, boost = 0): LevelResult {
  const capWhy: string[] = [];
  let cap: CLevel = 'Expert';
  if (a.experience === 'new') { cap = 'Beginner'; capWhy.push('new'); }
  if (a.injuries.length && rank(cap) > 1) { cap = 'Intermediate'; capWhy.push('injury'); }
  if (a.sex === 'female' && a.health.pregnant) { cap = 'Beginner'; capWhy.push('pregnant'); }
  if ((a.health.medical || a.health.diabetes) && rank(cap) > 1) { cap = 'Intermediate'; capWhy.push('medical'); }
  if (a.age < 18 && rank(cap) > 1) { cap = 'Intermediate'; capWhy.push('under-18'); }
  const up = (l: CLevel) => LEVELS_C[Math.max(0, Math.min(2, rank(l) + boost))];
  const strength = minL(up(strengthLevel(a)), cap), endurance = minL(up(enduranceLevel(a)), cap);
  const overall = a.goal === 'muscle' || a.goal === 'skills' ? strength
    : a.goal === 'endurance' || (a.goal === 'race' && a.race !== 'hyrox') ? endurance
      : minL(strength, endurance);
  return { strength, endurance, overall, cap, capWhy };
}

// ---------------------------------------------------------------- session catalog
export type Role = 'strength' | 'skill' | 'easy' | 'quality' | 'tempo' | 'long' | 'hiit' | 'hyrox' | 'sim' | 'brick' | 'mobility';
export type Modality = 'run' | 'ride' | 'walk';
const ROLE_LABEL: Record<Role, string> = { strength: 'Strength', skill: 'Skill', easy: 'Easy cardio', quality: 'Intervals', tempo: 'Tempo', long: 'Long session', hiit: 'HIIT', hyrox: 'HYROX', sim: 'Race simulation', brick: 'Brick', mobility: 'Mobility' };
export const roleLabel = (r: Role) => ROLE_LABEL[r];
export const HARD_ROLES: Role[] = ['quality', 'tempo', 'hiit', 'hyrox', 'sim', 'brick'];

/** Coach-only sessions assembled from the exercise library (for gaps the programs don't cover). */
export const CUSTOM: Record<string, Session> = {
  'db-a': { id: 'db-a', name: 'Full Body A · Dumbbells', type: 'strength', minutes: 45, focus: 'Squat, row, press, hinge, core', blocks: [
    { exId: 'goblet-squat', sets: 3, reps: 10, note: 'Leave 2–3 reps in reserve' }, { exId: 'db-row', sets: 3, reps: 10, note: 'Per arm' },
    { exId: 'ohp', sets: 3, reps: 8, note: 'Dumbbells' }, { exId: 'rdl', sets: 3, reps: 10, note: 'Dumbbells, slow lowering' }, { exId: 'plank', sets: 3, timeSec: 30 }] },
  'db-b': { id: 'db-b', name: 'Full Body B · Dumbbells', type: 'strength', minutes: 40, focus: 'Lunge, push, swing, carry, core', blocks: [
    { exId: 'lunge', sets: 3, reps: 10, note: 'Per leg, hold dumbbells when bodyweight is easy' }, { exId: 'push-up', sets: 3, reps: 10 },
    { exId: 'kb-swing', sets: 3, reps: 15, note: 'Kettlebell or one dumbbell' }, { exId: 'farmers', sets: 3, distanceM: 40 }, { exId: 'dead-bug', sets: 3, reps: 10 }] },
  mobility: { id: 'mobility', name: 'Mobility & Core', type: 'calisthenics', minutes: 30, focus: 'Easy movement, trunk control, recovery', blocks: [
    { exId: 'walk', sets: 1, distanceM: 1500, note: 'Easy walk to warm up' }, { exId: 'dead-bug', sets: 3, reps: 10 }, { exId: 'glute-bridge', sets: 3, reps: 12 },
    { exId: 'plank', sets: 3, timeSec: 30 }, { exId: 'calf-raise', sets: 2, reps: 15 }] },
  'hyrox-intro': { id: 'hyrox-intro', name: 'HYROX Basics', type: 'hyrox', minutes: 40, focus: 'Short runs + station skills at easy loads', blocks: [
    { exId: 'run-easy', sets: 4, distanceM: 500, note: 'Easy, conversational' }, { exId: 'wall-ball', sets: 4, reps: 10, note: 'Light ball, full depth' },
    { exId: 'farmers', sets: 4, distanceM: 40 }, { exId: 'row', sets: 4, distanceM: 250 }] },
  'hyrox-half': { id: 'hyrox-half', name: 'Half Race Simulation', type: 'hyrox', minutes: 50, focus: '4 × (1 km run → station), official order', blocks: [
    { exId: 'run-easy', sets: 4, distanceM: 1000, note: 'Steady, a bit slower than race pace' }, { exId: 'skierg', sets: 1, distanceM: 500 }, { exId: 'sled-push', sets: 1, distanceM: 25 },
    { exId: 'sled-pull', sets: 1, distanceM: 25 }, { exId: 'bbj', sets: 1, distanceM: 40 }] },
  'brick-intro': { id: 'brick-intro', name: 'Run + Bodyweight Brick', type: 'hybrid', minutes: 30, focus: '4 rounds: short run → squats → push-ups', blocks: [
    { exId: 'run-easy', sets: 4, distanceM: 400, note: 'Easy pace — walk breaks are fine' }, { exId: 'air-squat', sets: 4, reps: 15 }, { exId: 'push-up', sets: 4, reps: 8 }] },
};
const P = (p: string, s: string) => `p:${p}:${s}`;
type Pool = Record<CLevel, string[]>;
const same = (x: string[]): Pool => ({ Beginner: x, Intermediate: x, Expert: x });
export const POOLS: Record<string, Pool> = {
  'strength-bw': { Beginner: [P('cali-foundations', 'a'), P('cali-foundations', 'b'), P('cali-foundations', 'c')], Intermediate: [P('cali-skills', 'push'), P('cali-skills', 'pull'), P('cali-foundations', 'c'), P('cali-skills', 'core')], Expert: [P('cali-expert', 'pull'), P('cali-expert', 'push'), P('cali-expert', 'legs')] },
  'strength-db': { Beginner: ['c:db-a', 'c:db-b'], Intermediate: ['c:db-a', 'c:db-b', P('cali-foundations', 'c')], Expert: ['c:db-a', 'c:db-b', P('cali-expert', 'legs')] },
  'strength-gym': { Beginner: ['c:db-a', 'c:db-b'], Intermediate: [P('hybrid-week', 'lower'), P('hybrid-week', 'upper')], Expert: [P('hybrid-expert', 'lower'), P('hybrid-expert', 'upper')] },
  skill: { Beginner: [P('cali-foundations', 'a'), P('cali-foundations', 'b'), P('cali-foundations', 'c')], Intermediate: [P('cali-skills', 'pull'), P('cali-skills', 'push'), P('cali-skills', 'core')], Expert: [P('cali-expert', 'pull'), P('cali-expert', 'push'), P('cali-expert', 'legs'), P('cali-expert', 'emom')] },
  'easy-run': { Beginner: [P('run-5k', 'easy')], Intermediate: [P('run-10k', 'easy')], Expert: [P('run-expert', 'easy')] },
  'quality-run': { Beginner: [P('run-5k', 'rw')], Intermediate: [P('run-10k', 'int'), P('run-10k', 'tempo')], Expert: [P('run-expert', 'cruise'), P('run-expert', 'vo2'), P('run-expert', 'reps')] },
  'tempo-run': { Beginner: [P('run-5k', 'rw')], Intermediate: [P('run-10k', 'tempo')], Expert: [P('run-expert', 'tempo')] },
  'long-run': { Beginner: [P('run-5k', 'easy')], Intermediate: [P('run-10k', 'long')], Expert: [P('run-expert', 'long')] },
  'easy-ride': { Beginner: [P('indoor-bike', 'endurance')], Intermediate: [P('ride-base', 'endurance')], Expert: [P('ride-base', 'endurance')] },
  'quality-ride': { Beginner: [P('indoor-bike', 'int')], Intermediate: [P('indoor-bike', 'int'), P('indoor-bike', 'hiit')], Expert: [P('ride-expert', 'vo2'), P('ride-expert', 'ou'), P('ride-expert', '3015')] },
  'tempo-ride': { Beginner: [P('indoor-bike', 'endurance')], Intermediate: [P('ride-base', 'int')], Expert: [P('ride-expert', 'ss')] },
  'long-ride': { Beginner: [P('ride-base', 'endurance')], Intermediate: [P('ride-base', 'long')], Expert: [P('ride-expert', 'long')] },
  'easy-walk': same([P('walk-ladder', 'brisk')]), 'quality-walk': same([P('walk-ladder', 'hills')]), 'tempo-walk': same([P('walk-ladder', 'hills')]), 'long-walk': same([P('walk-ladder', 'brisk')]),
  hiit: { Beginner: [P('hiit-engine', 'amrap'), P('hiit-engine', 'emom')], Intermediate: [P('hiit-engine', 'tabata'), P('hiit-engine', 'emom'), P('hiit-engine', 'amrap')], Expert: [P('hiit-engine', 'tabata'), P('hiit-engine', 'emom'), P('hiit-engine', 'amrap')] },
  hyrox: { Beginner: ['c:hyrox-intro'], Intermediate: [P('hyrox-prep', 'compromised'), P('hyrox-prep', 'stations'), P('hyrox-prep', 'engine')], Expert: [P('hyrox-expert', 'compromised'), P('hyrox-expert', 'power'), P('hyrox-expert', 'threshold'), P('hyrox-expert', 'emom')] },
  sim: { Beginner: ['c:hyrox-intro'], Intermediate: ['c:hyrox-half'], Expert: [P('hyrox-expert', 'sim')] },
  brick: { Beginner: ['c:brick-intro'], Intermediate: [P('hybrid-week', 'brick')], Expert: [P('hybrid-expert', 'brick')] },
  mobility: same(['c:mobility']),
};
/** Base session for a ref ("p:<program>:<session>" or "c:<template>"). */
export function baseSession(ref: string): { s: Session; programId?: string; programName?: string } | null {
  if (ref.startsWith('c:')) { const s = CUSTOM[ref.slice(2)]; return s ? { s } : null; }
  const [, pid, sid] = ref.split(':');
  const p = PROGRAMS.find((x) => x.id === pid); const s = p?.sessions.find((x) => x.id === sid);
  return p && s ? { s, programId: p.id, programName: p.name } : null;
}

// ---------------------------------------------------------------- equipment & injury swaps
const BAR: string[] = ['pull-up', 'chin-up', 'scap-pull', 'muscle-up', 'dead-hang', 'hkr', 't2b', 'front-lever', 'weighted-pull-up'];
const DB: string[] = ['goblet-squat', 'db-row', 'kb-swing', 'farmers', 'rdl', 'ohp', 'thruster'];
const GYM: string[] = ['back-squat', 'deadlift', 'bench', 'dip', 'weighted-dip', 'skierg', 'sled-push', 'sled-pull', 'row', 'sb-lunge', 'wall-ball', 'assault-bike'];
const BIKE: string[] = ['bike', 'indoor-bike', 'stationary-bike'];
export const RUN_IDS = ['run-easy', 'run-tempo', 'run-intervals', 'strides'];
/** Equipment needed (any of). Empty = nothing needed. */
export function needs(id: string): Equip[] {
  if (BAR.includes(id)) return ['bar', 'gym'];
  if (DB.includes(id)) return ['dumbbells', 'gym'];
  if (GYM.includes(id)) return ['gym'];
  if (BIKE.includes(id)) return ['bike', 'gym'];
  return [];
}
/** Exercises that load a sore area. Swapped for something friendlier when the user flags it. */
export const INJURY_AVOID: Record<Injury, string[]> = {
  knees: ['jump-squat', 'pistol', 'lunge', 'bulgarian', 'bbj', 'sb-lunge', 'burpee', 'jump-rope', 'back-squat', 'wall-ball', 'thruster', 'sled-push', ...RUN_IDS],
  back: ['deadlift', 'back-squat', 'rdl', 'kb-swing', 'ohp', 'thruster', 't2b', 'hkr', 'burpee', 'row', 'sled-pull', 'sb-lunge'],
  shoulders: ['hspu', 'pike-push-up', 'ohp', 'dip', 'weighted-dip', 'muscle-up', 'handstand', 'planche', 'bench', 'wall-ball', 'thruster', 'skierg', 'archer-push-up', 'one-arm-push-up', 'pull-up', 'chin-up', 'weighted-pull-up', 'front-lever', 't2b'],
  wrists: ['push-up', 'diamond-push-up', 'archer-push-up', 'one-arm-push-up', 'pike-push-up', 'hspu', 'handstand', 'planche', 'burpee', 'mountain-climber', 'l-sit'],
};
/** Ordered alternatives. The first one that fits the equipment and injuries wins (searched breadth-first). */
export const ALT: Record<string, string[]> = {
  'pull-up': ['aus-row'], 'chin-up': ['aus-row'], 'scap-pull': ['aus-row'], 'muscle-up': ['pull-up', 'aus-row'], 'dead-hang': ['plank'], hkr: ['dead-bug'], t2b: ['hkr', 'hollow', 'dead-bug'],
  'front-lever': ['hollow', 'dead-bug'], 'weighted-pull-up': ['pull-up', 'aus-row'],
  dip: ['diamond-push-up', 'push-up', 'incline-push-up'], 'weighted-dip': ['dip', 'diamond-push-up', 'incline-push-up'],
  'back-squat': ['goblet-squat', 'bulgarian', 'air-squat', 'glute-bridge'], deadlift: ['rdl', 'glute-bridge'], rdl: ['glute-bridge'], bench: ['push-up', 'incline-push-up'], ohp: ['pike-push-up', 'incline-push-up'],
  'goblet-squat': ['air-squat', 'glute-bridge'], 'db-row': ['aus-row'], 'kb-swing': ['glute-bridge'], farmers: ['plank', 'dead-bug'], thruster: ['goblet-squat', 'air-squat', 'glute-bridge'],
  skierg: ['row', 'assault-bike', 'mountain-climber', 'dead-bug'], 'sled-push': ['lunge', 'air-squat', 'glute-bridge'], 'sled-pull': ['db-row', 'aus-row'], row: ['assault-bike', 'stationary-bike', 'burpee', 'mountain-climber', 'dead-bug'],
  'sb-lunge': ['lunge', 'goblet-squat', 'glute-bridge'], 'wall-ball': ['thruster', 'air-squat', 'glute-bridge'], 'assault-bike': ['stationary-bike', 'burpee', 'mountain-climber', 'dead-bug'],
  bike: ['indoor-bike', 'stationary-bike', 'walk'], 'indoor-bike': ['stationary-bike', 'bike', 'walk'], 'stationary-bike': ['indoor-bike', 'bike', 'walk'],
  'jump-squat': ['air-squat', 'glute-bridge'], pistol: ['bulgarian', 'glute-bridge'], lunge: ['glute-bridge'], bulgarian: ['glute-bridge'], bbj: ['mountain-climber', 'dead-bug'], burpee: ['mountain-climber', 'dead-bug'],
  'jump-rope': ['mountain-climber', 'stationary-bike', 'dead-bug'], 'mountain-climber': ['dead-bug'],
  hspu: ['pike-push-up', 'incline-push-up', 'dead-bug'], 'pike-push-up': ['incline-push-up', 'dead-bug'], handstand: ['plank', 'dead-bug'], planche: ['plank', 'dead-bug'],
  'archer-push-up': ['push-up', 'incline-push-up', 'dead-bug'], 'one-arm-push-up': ['archer-push-up', 'push-up', 'incline-push-up', 'dead-bug'], 'diamond-push-up': ['push-up', 'incline-push-up', 'dead-bug'],
  'push-up': ['incline-push-up', 'dead-bug'], 'incline-push-up': ['dead-bug'], 'l-sit': ['hollow', 'dead-bug'], hollow: ['dead-bug'], plank: ['dead-bug'], nordic: ['glute-bridge'],
  'run-easy': ['stationary-bike', 'walk'], 'run-tempo': ['stationary-bike', 'walk'], 'run-intervals': ['stationary-bike', 'walk'], strides: ['walk'],
};
const FALLBACK: Record<string, string> = { calisthenics: 'glute-bridge', strength: 'glute-bridge', core: 'dead-bug', cardio: 'walk', hyrox: 'walk' };

export interface SwapCtx { equip: Set<Equip>; injuries: Injury[]; keepRun: boolean; regress: Record<string, { to: string; why: string }> }
export function allowedEx(id: string, c: SwapCtx): boolean {
  const n = needs(id);
  if (n.length && !n.some((e) => c.equip.has(e))) return false;
  for (const i of c.injuries) if (INJURY_AVOID[i].includes(id) && !(c.keepRun && i === 'knees' && RUN_IDS.includes(id))) return false;
  return true;
}
function blockedWhy(id: string, c: SwapCtx): string {
  const n = needs(id);
  if (n.length && !n.some((e) => c.equip.has(e))) return `no ${n[0] === 'bar' ? 'pull-up bar' : n[0] === 'dumbbells' ? 'dumbbells' : n[0] === 'bike' ? 'bike' : 'gym equipment'}`;
  const inj = c.injuries.find((i) => INJURY_AVOID[i].includes(id));
  return inj ? `easier on your ${inj === 'back' ? 'lower back' : inj}` : '';
}
/** Pick the exercise to use instead of `id` (or `id` itself), with the reason. */
export function swapExercise(id: string, c: SwapCtx, avoid: Set<string> = new Set()): { id: string; why?: string } {
  let start = id, firstWhy: string | undefined;
  const r = c.regress[id];
  if (r) { start = r.to; firstWhy = r.why; }
  if (allowedEx(start, c) && (start === id || !avoid.has(start))) return start === id ? { id } : { id: start, why: firstWhy };
  const why = firstWhy || blockedWhy(start, c) || 'already in this session';
  const seen = new Set([id, start]); const q = [...(ALT[start] || [])];
  let dup: string | null = null;
  while (q.length) {
    const x = q.shift()!; if (seen.has(x)) continue; seen.add(x);
    if (allowedEx(x, c)) { if (!avoid.has(x)) return { id: x, why }; dup ||= x; }
    q.push(...(ALT[x] || []));
  }
  const fb = FALLBACK[exById(start)?.cat || 'core'] || 'dead-bug';
  return { id: !avoid.has(fb) ? fb : dup || fb, why };
}
const r100 = (m: number) => Math.max(100, Math.round(m / 100) * 100);
const r5 = (s: number) => Math.max(10, Math.round(s / 5) * 5);
/** Convert a block's target when the swapped exercise uses a different metric. */
export function convertBlock(b: Block, to: string): Block {
  const from = exById(b.exId), m = exById(to)?.metric || 'reps';
  const out: Block = { exId: to, sets: b.sets, note: b.note };
  const estMin = b.timeSec ? b.timeSec / 60 : b.distanceM ? (b.distanceM / 1000) * (from?.cat === 'hyrox' && b.exId !== 'farmers' ? 4 : 6) : 0;
  if (m === 'reps' || m === 'weight') out.reps = b.reps ?? (b.timeSec ? Math.max(8, Math.round(b.timeSec / 3)) : 10);
  else if (m === 'time') out.timeSec = b.timeSec ?? (estMin ? r5(estMin * 60) : 30);
  else if (m === 'distance') out.distanceM = to === 'walk' ? r100((estMin || 10) * 100) : b.distanceM ?? r100((estMin || 3) * 150);
  if (b.pace && to.startsWith('run-')) out.pace = b.pace;
  if (b.ftp && BIKE.includes(to)) out.ftp = b.ftp;
  if (!b.pace && !b.ftp && b.rpe) out.rpe = b.rpe;
  if (b.pace && !to.startsWith('run-')) out.rpe = b.pace === 'E' ? 'RPE 3–4' : b.pace === 'M' ? 'RPE 5–6' : b.pace === 'T' ? 'RPE 7' : 'RPE 8–9';
  if (m === 'distance' && to === 'walk') out.note = 'Brisk walk';
  return out;
}

// ---------------------------------------------------------------- plan model
export interface CoachSlot { id: string; role: Role; ref: string; mod?: Modality; minutes?: number }
export type Phase = 'build' | 'deload' | 'taper';
export interface CoachWeek { index: number; phase: Phase; vol: number; step: number; adj: number; layout: (string | null)[] }
export interface CheckIn {
  week: number; date: string; feel: 'easy' | 'right' | 'hard'; done: number; planned: number;
  energy: number; soreness: number; pain: Injury[]; sharp?: boolean; note?: string;
}
export type Decision = 'progress' | 'bump' | 'hold' | 'deload' | 'see-pro' | 'level-up' | 'edit';
export interface ChangeEntry { date: string; week: number; decision: Decision; title: string; changes: string[] }
export interface CoachNutrition {
  mode: 'fat-loss' | 'maintain' | 'surplus' | 'stop';
  quiz: WLQuiz; targets: WLTargets | null; week: PlanDay[]; trainDays: number[];
  level: ScreenLevel; reasons: string[]; surplus: number; notes: string[];
}
export interface CoachPlan extends Rec {
  version: 1; startDate: string; seed: number; answers: CoachAnswers;
  levels: LevelResult; levelBoost: number;
  slots: CoachSlot[]; weeks: CoachWeek[];
  painAreas: Injury[]; checkins: CheckIn[]; changelog: ChangeEntry[];
  nutrition: CoachNutrition | null; applyToFuel: boolean; logged: Record<string, string[]>;
  /** PAR-Q positive: no plan, see a professional first. */
  stopped?: boolean;
}

// ---------------------------------------------------------------- dates
const pad = (n: number) => String(n).padStart(2, '0');
const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const addDaysK = (key: string, n: number) => { const d = new Date(key + 'T12:00:00'); d.setDate(d.getDate() + n); return keyOf(d); };
export const mondayOf = (key: string) => addDaysK(key, -weekdayOf(key));
export const daysBetweenK = (a: string, b: string) => Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86400000);
export const dateFor = (plan: Pick<CoachPlan, 'startDate'>, week: number, wd: number) => addDaysK(plan.startDate, week * 7 + wd);
/** Index of the plan week containing `today` (may be < 0 or ≥ weeks.length). */
export const weekIndexOf = (plan: Pick<CoachPlan, 'startDate'>, today: string) => Math.floor(daysBetweenK(plan.startDate, today) / 7);

// ---------------------------------------------------------------- weekly structure
const MIXES: Record<string, Record<number, Role[]>> = {
  'fat-loss': { 2: ['strength', 'hiit'], 3: ['strength', 'easy', 'strength'], 4: ['strength', 'quality', 'strength', 'easy'], 5: ['strength', 'quality', 'strength', 'easy', 'long'], 6: ['strength', 'quality', 'strength', 'easy', 'strength', 'long'] },
  muscle: { 2: ['strength', 'strength'], 3: ['strength', 'strength', 'strength'], 4: ['strength', 'strength', 'strength', 'strength'], 5: ['strength', 'strength', 'strength', 'strength', 'easy'], 6: ['strength', 'strength', 'strength', 'strength', 'easy', 'mobility'] },
  endurance: { 2: ['easy', 'quality'], 3: ['easy', 'quality', 'long'], 4: ['easy', 'quality', 'strength', 'long'], 5: ['easy', 'quality', 'easy', 'strength', 'long'], 6: ['easy', 'quality', 'easy', 'tempo', 'strength', 'long'] },
  race: { 2: ['quality', 'long'], 3: ['easy', 'quality', 'long'], 4: ['easy', 'quality', 'strength', 'long'], 5: ['easy', 'quality', 'easy', 'strength', 'long'], 6: ['easy', 'quality', 'easy', 'tempo', 'strength', 'long'] },
  hyrox: { 2: ['hyrox', 'strength'], 3: ['hyrox', 'strength', 'easy'], 4: ['hyrox', 'strength', 'easy', 'brick'], 5: ['hyrox', 'strength', 'easy', 'brick', 'long'], 6: ['hyrox', 'strength', 'easy', 'brick', 'hyrox', 'long'] },
  skills: { 2: ['skill', 'skill'], 3: ['skill', 'skill', 'skill'], 4: ['skill', 'skill', 'skill', 'easy'], 5: ['skill', 'skill', 'skill', 'skill', 'easy'], 6: ['skill', 'skill', 'skill', 'skill', 'easy', 'mobility'] },
  health: { 2: ['strength', 'easy'], 3: ['strength', 'easy', 'strength'], 4: ['strength', 'easy', 'strength', 'mobility'], 5: ['strength', 'easy', 'strength', 'easy', 'mobility'], 6: ['strength', 'easy', 'strength', 'easy', 'mobility', 'easy'] },
  hybrid: { 2: ['strength', 'brick'], 3: ['strength', 'easy', 'brick'], 4: ['strength', 'quality', 'strength', 'long'], 5: ['strength', 'quality', 'strength', 'brick', 'long'], 6: ['strength', 'quality', 'strength', 'easy', 'brick', 'long'] },
};
export const DAY_SETS: Record<number, number[]> = { 2: [1, 4], 3: [0, 2, 4], 4: [0, 1, 3, 5], 5: [0, 1, 3, 4, 5], 6: [0, 1, 2, 3, 4, 5] };
export const clampDays = (n: number) => Math.max(2, Math.min(6, Math.round(n || 3)));

const STRENGTH_PREFS: TrainPref[] = ['strength', 'calisthenics'];
const CARDIO_PREFS: TrainPref[] = ['running', 'cycling'];
export function mixKey(a: CoachAnswers): string {
  if (a.goal === 'race') return a.race === 'hyrox' ? 'hyrox' : 'race';
  const s = a.prefs.some((p) => STRENGTH_PREFS.includes(p)), c = a.prefs.some((p) => CARDIO_PREFS.includes(p));
  if ((a.goal === 'endurance' || a.goal === 'fat-loss') && (a.prefs.includes('hyrox') || (s && c))) return 'hybrid';
  return a.goal;
}
export function equipSet(a: Pick<CoachAnswers, 'equipment' | 'prefs'>): Set<Equip> {
  const e = new Set<Equip>(a.equipment);
  if (e.has('gym')) { e.add('bar'); e.add('dumbbells'); e.add('bike'); e.add('treadmill'); }
  if (a.prefs.includes('cycling')) e.add('bike');
  return e;
}
const raceRun = (a: CoachAnswers) => a.goal === 'race' && a.race !== 'hyrox';
/** Cardio modality for a role: race → run; knees → bike or walk; otherwise preferences. */
export function modalityFor(a: CoachAnswers, role: Role, injuries: Injury[]): Modality {
  const e = equipSet(a);
  const knees = injuries.includes('knees');
  if (raceRun(a)) return 'run';
  if (knees) return e.has('bike') ? 'ride' : 'walk';
  if (a.goal === 'race') return 'run';
  const run = a.prefs.includes('running'), ride = a.prefs.includes('cycling') && e.has('bike'), walk = a.prefs.includes('walking');
  if (run && ride) return role === 'easy' ? 'ride' : 'run';
  if (run) return 'run';
  if (ride) return 'ride';
  if (walk) return 'walk';
  if (a.goal === 'endurance') return 'run';
  return a.run === 'none' ? 'walk' : 'run';
}
function strengthFamily(a: CoachAnswers): string {
  if (a.goal === 'skills') return 'skill';
  const e = equipSet(a);
  if (a.prefs.includes('calisthenics') && !a.prefs.includes('strength')) return 'strength-bw';
  if (e.has('gym')) return 'strength-gym';
  if (e.has('dumbbells')) return 'strength-db';
  return 'strength-bw';
}
export function rolesFor(a: CoachAnswers): Role[] {
  const n = clampDays(a.days);
  let roles = [...MIXES[mixKey(a)][n]];
  const knees = a.injuries.includes('knees');
  // HIIT fans get one quality slot as HIIT; non-runners get HIIT instead of hill walks (knees OK)
  if ((a.goal === 'fat-loss' || a.goal === 'health') && !knees) {
    const qi = roles.indexOf('quality');
    if (qi >= 0 && (a.prefs.includes('hiit') || modalityFor(a, 'quality', a.injuries) === 'walk')) roles[qi] = 'hiit';
    else if (qi < 0 && a.prefs.includes('hiit')) { const ei = roles.lastIndexOf('easy'); if (ei >= 0 && n >= 4) roles[ei] = 'hiit'; }
  }
  if (knees) roles = roles.map((r) => (r === 'hiit' ? 'quality' : r));
  return roles;
}

/** Order roles over the training days: long on the last day, hard days apart, heavy legs not before hard runs. */
export function orderRoles(roles: Role[], days: number[]): Role[] {
  const n = roles.length;
  let best: number[] = roles.map((_, i) => i), bestCost = Infinity;
  const isHard = (r: Role) => HARD_ROLES.includes(r) || r === 'long';
  const cost = (seq: Role[]) => {
    let c = 0;
    for (let i = 0; i < n; i++) {
      const r = seq[i], nx = seq[(i + 1) % n];
      const gap = i + 1 < n ? days[i + 1] - days[i] : days[0] + 7 - days[n - 1];
      if (gap === 1 && isHard(r) && isHard(nx)) c += 3;
      if (gap === 1 && r === 'strength' && (nx === 'quality' || nx === 'long' || nx === 'tempo')) c += 2;
      if (gap === 1 && r === nx && r !== 'easy' && r !== 'mobility') c += 1;
    }
    if (seq.includes('long') && seq[n - 1] !== 'long') c += 4;
    return c;
  };
  const perm = (arr: number[], k: number) => {
    if (k === arr.length) { const c = cost(arr.map((i) => roles[i])); if (c < bestCost) { bestCost = c; best = [...arr]; } return; }
    for (let i = k; i < arr.length; i++) { [arr[k], arr[i]] = [arr[i], arr[k]]; perm(arr, k + 1); [arr[k], arr[i]] = [arr[i], arr[k]]; }
  };
  perm(roles.map((_, i) => i), 0);
  return best.map((i) => roles[i]);
}
export const hardBackToBack = (roles: (Role | null)[]) => roles.some((r, i) => { const nx = roles[(i + 1) % 7]; const h = (x: Role | null) => !!x && (HARD_ROLES.includes(x) || x === 'long'); return h(r) && h(nx); });

function poolKey(a: CoachAnswers, role: Role, injuries: Injury[]): { key: string; mod?: Modality } {
  if (role === 'strength') return { key: strengthFamily(a) };
  if (role === 'skill') return { key: 'skill' };
  if (role === 'easy' || role === 'quality' || role === 'tempo' || role === 'long') { const mod = modalityFor(a, role, injuries); return { key: `${role}-${mod}`, mod }; }
  return { key: role };
}
export function levelForRole(l: LevelResult, role: Role): CLevel {
  if (role === 'strength' || role === 'skill' || role === 'mobility') return l.strength;
  if (role === 'hyrox' || role === 'sim' || role === 'brick' || role === 'hiit') return minL(l.strength, l.endurance);
  return l.endurance;
}
function poolFor(a: CoachAnswers, l: LevelResult, role: Role, injuries: Injury[]): { refs: string[]; mod?: Modality } {
  const { key, mod } = poolKey(a, role, injuries);
  const lv = levelForRole(l, role);
  let refs = POOLS[key]?.[lv] || POOLS.mobility.Beginner;
  // can't run a mile yet: run/walk intervals and brisk walks instead of continuous running
  if (mod === 'run' && a.run === 'none' && lv === 'Beginner') refs = role === 'easy' ? [P('walk-ladder', 'brisk')] : [P('run-5k', 'rw')];
  if (role === 'sim' && lv === 'Intermediate' && a.minutes >= 90) refs = [P('hyrox-prep', 'sim')];
  return { refs, mod };
}

const VOLS: Record<number, number[]> = { 4: [1, 1.05, 1.1, 0.7], 6: [1, 1.05, 1.1, 0.7, 1.08, 1.15], 8: [1, 1.05, 1.1, 0.7, 1.05, 1.1, 1.15, 0.7] };
const STEPS: Record<number, number[]> = { 4: [0, 1, 2, 0], 6: [0, 1, 2, 0, 2, 3], 8: [0, 1, 2, 0, 1, 2, 3, 0] };
/** Highest effective weekly volume (planned peak 1.15 + room for a "too easy" bump). Sessions are fitted so PEAK still fits the minutes. */
export const PEAK = 1.2;

export interface GenOpts { today: string; id: string; seed?: number; catalog?: Catalog; energy?: EnergyInput; levelBoost?: number; painAreas?: Injury[] }

/** Build a full plan from the intake answers. Deterministic for the same answers + seed. */
export function generatePlan(a0: CoachAnswers, o: GenOpts): Omit<CoachPlan, 'updatedAt'> {
  const a: CoachAnswers = { ...a0, days: clampDays(a0.days), minutes: Math.max(20, Math.min(120, a0.minutes)), weeks: ([4, 6, 8].includes(a0.weeks) ? a0.weeks : 6) as 4 | 6 | 8 };
  const seed = o.seed ?? 1;
  const boost = o.levelBoost || 0;
  const levels = detectLevel(a, boost);
  const base = { id: o.id, version: 1 as const, startDate: mondayOf(o.today), seed, answers: a, levels, levelBoost: boost, painAreas: o.painAreas || [], checkins: [], changelog: [], applyToFuel: true, logged: {} };
  if (a.parq) return { ...base, slots: [], weeks: [], nutrition: null, stopped: true };
  const injuries = [...new Set([...a.injuries, ...(o.painAreas || [])])];
  const days = DAY_SETS[a.days];
  const roles = orderRoles(rolesFor(a), days);
  const rot: Record<string, number> = {};
  const slots: CoachSlot[] = roles.map((role, i) => {
    const { refs, mod } = poolFor(a, levels, role, injuries);
    const k = refs.join(',');
    const n = rot[k] ?? (seed % refs.length); rot[k] = n + 1;
    return { id: `s${i + 1}`, role, ref: refs[n % refs.length], mod };
  });
  // heavy-legs sessions never the day before a hard run / long session (Expert Hybrid ordering rule)
  const sIdx = slots.map((s, i) => (s.role === 'strength' ? i : -1)).filter((i) => i >= 0);
  const legsy = (ref: string) => /:(lower|legs)$/.test(ref) || ref === 'c:db-b';
  const beforeHard = (i: number) => { const j = (i + 1) % slots.length; const gap = i + 1 < slots.length ? days[i + 1] - days[i] : days[0] + 7 - days[slots.length - 1]; return gap === 1 && (HARD_ROLES.includes(slots[j].role) || slots[j].role === 'long'); };
  const refs0 = sIdx.map((i) => slots[i].ref);
  const order = [...sIdx].sort((x, y) => Number(beforeHard(x)) - Number(beforeHard(y)));
  const sortedRefs = [...refs0].sort((x, y) => Number(legsy(y)) - Number(legsy(x)));
  if (sIdx.length > 1 && sIdx.some(beforeHard)) order.forEach((si, k) => { slots[si] = { ...slots[si], ref: sortedRefs[k] }; });
  const layout: (string | null)[] = Array(7).fill(null);
  days.forEach((d, i) => { layout[d] = slots[i].id; });
  const vols = [...VOLS[a.weeks]], steps = STEPS[a.weeks];
  const phases: Phase[] = vols.map((v) => (v < 0.8 ? 'deload' : 'build'));
  if (a.goal === 'race' && a.weeks >= 6) { vols[a.weeks - 1] = 0.6; phases[a.weeks - 1] = 'taper'; }
  const weeks: CoachWeek[] = vols.map((vol, i) => ({ index: i, phase: phases[i], vol, step: steps[i], adj: 1, layout: [...layout] }));
  // HYROX race prep: a race simulation replaces the brick (or a HYROX session) in the last build week before each deload / taper
  if (a.goal === 'race' && a.race === 'hyrox') {
    const bi = slots.findIndex((s) => s.role === 'brick');
    const ti = bi >= 0 ? bi : slots.findIndex((s) => s.role === 'hyrox');
    if (ti >= 0) {
      const { refs } = poolFor(a, levels, 'sim', injuries);
      const sim: CoachSlot = { id: `s${slots.length + 1}`, role: 'sim', ref: refs[0] };
      const target = slots[ti].id;
      slots.push(sim);
      weeks.forEach((w, i) => { const next = weeks[i + 1]; if (w.phase === 'build' && (!next || next.phase !== 'build')) w.layout = w.layout.map((x) => (x === target ? sim.id : x)); });
    }
  }
  const plan: Omit<CoachPlan, 'updatedAt'> = { ...base, slots, weeks, nutrition: null };
  if (o.catalog) plan.nutrition = coachNutrition(a, o.catalog, seed, trainDaysOf(plan, 0), levels, o.energy);
  return plan;
}

export const trainDaysOf = (plan: Pick<CoachPlan, 'weeks'>, w: number) => (plan.weeks[w]?.layout || []).map((x, i) => (x ? i : -1)).filter((i) => i >= 0);
export const slotById = (plan: Pick<CoachPlan, 'slots'>, id: string | null) => (id ? plan.slots.find((s) => s.id === id) || null : null);

// ---------------------------------------------------------------- materialize a session
export interface CoachBlock extends Block { swappedFrom?: string; why?: string }
export interface CoachSession {
  slotId: string; role: Role; ref: string; name: string; type: WorkoutType; minutes: number; focus: string; blocks: CoachBlock[];
  level: CLevel; programId?: string; programName?: string; sessionId?: string; phase: Phase; notes: string[];
  scale: number; guided: boolean; timer?: string; anyBike?: boolean; hard: boolean; mod?: Modality;
}
export function swapCtx(plan: Pick<CoachPlan, 'answers' | 'painAreas'>): SwapCtx {
  const a = plan.answers;
  const injuries = [...new Set([...a.injuries, ...plan.painAreas])];
  const regress: SwapCtx['regress'] = {};
  if (a.pushUps < 5) {
    const why = `you did ${bandLabel(PUSH_BANDS, a.pushUps)} push-ups — incline push-ups build up to the floor version`;
    regress['push-up'] = { to: 'incline-push-up', why }; regress['diamond-push-up'] = { to: 'incline-push-up', why }; regress['archer-push-up'] = { to: 'push-up', why };
  }
  if (a.pullUps === 0) {
    const why = 'you can’t do a pull-up yet — rows build the same muscles';
    regress['pull-up'] = { to: 'aus-row', why }; regress['chin-up'] = { to: 'aus-row', why }; regress['muscle-up'] = { to: 'aus-row', why };
  }
  // runners preparing for a race keep running, unless knee pain came up in a check-in
  return { equip: equipSet(a), injuries, keepRun: raceRun(a) && !plan.painAreas.includes('knees'), regress };
}
/** Knees flagged (at intake or in a check-in) → re-pick a running session from the bike / walk pool. */
function roleSwapRef(plan: CoachPlan, slot: CoachSlot): CoachSlot {
  if (slot.mod !== 'run') return slot;
  const c = swapCtx(plan);
  if (!c.injuries.includes('knees') || c.keepRun) return slot;
  const mod: Modality = c.equip.has('bike') ? 'ride' : 'walk';
  const refs = POOLS[`${slot.role}-${mod}`]?.[plan.levels.endurance] || POOLS['easy-walk'].Beginner;
  return { ...slot, ref: refs[0], mod };
}
export function effectiveVol(w: Pick<CoachWeek, 'vol' | 'adj'>) { return Math.max(0.5, Math.min(PEAK, w.vol * (w.adj || 1))); }

export function materialize(plan: CoachPlan, weekIdx: number, slotId: string): CoachSession | null {
  const slot0 = slotById(plan, slotId); const w = plan.weeks[weekIdx];
  if (!slot0 || !w) return null;
  const slot = roleSwapRef(plan, slot0);
  const b = baseSession(slot.ref); if (!b) return null;
  const a = plan.answers, ctx = swapCtx(plan);
  const target = slot.minutes || a.minutes;
  const fit = Math.min(1, target / (b.s.minutes * PEAK));
  const vol = effectiveVol(w);
  const deload = w.phase !== 'build' || vol < 0.8;
  const notes: string[] = [];
  const cardio = ['run', 'walk', 'cycle', 'indoor-cycle'].includes(b.s.type);
  const used = new Set(b.s.blocks.map((x) => x.exId).filter((x) => swapExercise(x, ctx).id === x));
  const blocks: CoachBlock[] = [];
  b.s.blocks.forEach((blk, bi) => {
    const sw = swapExercise(blk.exId, ctx, used);
    if (sw.id !== blk.exId && used.has(sw.id) && !RUN_IDS.includes(blk.exId) && sw.id !== 'walk') return; // would repeat an exercise already in the session: drop it
    used.add(sw.id);
    const nb: CoachBlock = sw.id === blk.exId ? { ...blk } : { ...convertBlock(blk, sw.id), swappedFrom: blk.exId, why: sw.why };
    const ex = exById(nb.exId);
    const timed = ex?.cat === 'cardio' && ex.metric !== 'reps';
    if (cardio || timed) {
      if (nb.distanceM) nb.distanceM = r100(nb.distanceM * fit * vol);
      if (nb.timeSec) nb.timeSec = r5(nb.timeSec * fit * vol);
      if (!cardio && nb.sets > 1 && fit < 0.8) nb.sets = Math.max(2, Math.round(nb.sets * fit));
    } else {
      const minSets = bi === 0 && blk.sets >= 2 ? 2 : 1;
      if (fit < 1) nb.sets = Math.max(minSets, Math.round(blk.sets * fit));
      if (deload) nb.sets = Math.max(1, Math.round(nb.sets * 0.6));
      if (ex?.metric === 'reps' && nb.reps && !deload) nb.reps = Math.min(nb.reps + w.step, Math.max(nb.reps, 25));
      if (ex?.metric === 'time' && nb.timeSec) nb.timeSec = r5(nb.timeSec * (deload ? 0.8 : vol));
      if (ex?.cat === 'hyrox' && ex.metric === 'distance' && nb.distanceM && fit < 1) nb.distanceM = Math.max(10, Math.round((nb.distanceM * Math.max(fit, 0.5)) / 5) * 5);
    }
    blocks.push(nb);
  });
  if (fit < 0.55 && blocks.length > 3 && !cardio) blocks.splice(Math.max(3, Math.ceil(blocks.length * 0.7)));
  const swapped = blocks.filter((x) => x.swappedFrom).length;
  let type: WorkoutType = b.s.type, name = b.s.name;
  if (slot.ref !== slot0.ref) notes.push(slot.mod === 'ride' ? 'Swapped to the bike to keep load off your knees.' : 'Swapped to walking to keep load off your knees.');
  if (blocks.every((x) => x.exId === 'walk')) type = 'walk';
  else if (b.s.type === 'run' && blocks.every((x) => !RUN_IDS.includes(x.exId))) { type = blocks.some((x) => BIKE.includes(x.exId)) ? 'indoor-cycle' : 'walk'; name = name.replace(/Run(s)?\b/, type === 'walk' ? 'Walk' : 'Ride'); }
  const minutes = Math.max(10, Math.min(target, Math.round(b.s.minutes * fit * (deload ? Math.min(vol, 0.75) : vol))));
  if (w.phase === 'taper') notes.push('Taper week: less volume, a little sharpness — arrive fresh.');
  else if (deload) notes.push('Lighter week: about 30–40% less work so your body absorbs the last weeks.');
  else if (w.step > 0 && !cardio && blocks.some((x) => exById(x.exId)?.metric === 'reps')) notes.push(`Week ${w.index + 1}: +${w.step} rep${w.step > 1 ? 's' : ''} on bodyweight sets vs week 1. Add load when every set has 2 reps left.`);
  if (cardio && !deload && vol > 1.001) notes.push(`About ${Math.round((vol - 1) * 100)}% more than week 1.`);
  if (type === 'run' && equipSet(a).has('treadmill')) notes.push('Treadmill is fine — set a 1% incline.');
  if (swapped) notes.push(`${swapped} exercise${swapped > 1 ? 's' : ''} swapped for your equipment, level or injuries.`);
  if (fit < 0.95) notes.push(`Shortened from ~${b.s.minutes} min to fit your ${target} minutes.`);
  const near = fit * vol > 0.85 && fit * vol < 1.18 && !swapped && slot.ref === slot0.ref;
  let timer = b.s.timer;
  if (timer && timer.startsWith('interval&')) {
    const q = new URLSearchParams(timer.slice('interval&'.length));
    const rounds = +(q.get('rounds') || 0);
    if (rounds) q.set('rounds', String(Math.max(2, Math.round(rounds * fit * (deload ? 0.7 : vol)))));
    timer = `interval&${q.toString()}`;
  } else if (timer === 'hyrox' && fit < 0.9) timer = undefined;
  return {
    slotId: slot0.id, role: slot.role, ref: slot.ref, name, type, minutes, focus: b.s.focus, blocks, level: levelForRole(plan.levels, slot.role),
    programId: b.programId, programName: b.programName, sessionId: b.programId ? b.s.id : undefined, phase: w.phase, notes,
    scale: fit * vol, guided: !!(near && b.programId && (b.s.plan || b.s.pieces)), timer, anyBike: b.s.anyBike,
    hard: HARD_ROLES.includes(slot.role) || slot.role === 'long', mod: slot.mod,
  };
}
export function weekSessions(plan: CoachPlan, w: number): { wd: number; date: string; s: CoachSession | null }[] {
  const wk = plan.weeks[w]; if (!wk) return [];
  return wk.layout.map((id, wd) => ({ wd, date: dateFor(plan, w, wd), s: id ? materialize(plan, w, id) : null }));
}

/** Where a coach session starts (existing timers / GPS record / the workout logger). */
export function startLinks(plan: Pick<CoachPlan, 'id'>, w: number, wd: number, s: CoachSession): { to: string; label: string; primary?: boolean }[] {
  const out: { to: string; label: string; primary?: boolean }[] = [];
  if (s.guided && s.programId) {
    const b = baseSession(s.ref)?.s;
    if (b?.plan) out.push({ to: `/timers?t=plan&program=${s.programId}&session=${s.sessionId}`, label: 'Start session timer', primary: true });
    else if (b?.pieces) out.push({ to: `/timers?t=stopwatch&program=${s.programId}&session=${s.sessionId}`, label: 'Start guided stopwatch', primary: true });
  }
  if (!out.length && s.timer) { const id = s.timer.split('&')[0]; out.push({ to: `/timers?t=${s.timer}`, label: id === 'hyrox' ? 'Start HYROX Sim' : id === 'interval' ? 'Start interval timer' : `Start ${id.toUpperCase()} timer`, primary: true }); }
  if (s.type === 'run' || s.type === 'walk' || (s.type === 'cycle' && !s.anyBike)) out.push({ to: `/record?type=${s.type}`, label: out.length ? 'Record with GPS' : 'Start with GPS', primary: !out.length });
  if (s.type === 'indoor-cycle' || s.anyBike) out.push({ to: '/record?type=indoor-cycle&kind=indoor', label: 'Start indoor ride', primary: !out.length });
  out.push({ to: `/train/log?coach=${plan.id}&w=${w}&d=${wd}`, label: out.length ? 'Log sets' : 'Start workout', primary: !out.length });
  return out;
}

// ---------------------------------------------------------------- completion
const FAMILY: Record<string, string> = { run: 'run', walk: 'walk', cycle: 'ride', 'indoor-cycle': 'ride', strength: 'str', calisthenics: 'str', hyrox: 'mix', hybrid: 'mix', cardio: 'mix' };
type WLite = Pick<Workout, 'date' | 'type' | 'source' | 'deleted'>;
/** A session counts as done when a workout was logged from it, or the same program session / a matching type was saved that day. */
export function isDone(plan: Pick<CoachPlan, 'id'>, w: number, wd: number, date: string, s: CoachSession, workouts: WLite[]): boolean {
  const mine = `coach:${plan.id}:${w}:${wd}`;
  const prog = s.programId ? `program:${s.programId}:${s.sessionId}` : '';
  return workouts.some((x) => {
    if (x.deleted || x.type === 'rest') return false;
    if (x.source === mine) return true;
    if (keyOf(new Date(x.date)) !== date) return false;
    if (x.source?.startsWith('coach:')) return false;
    if (prog && x.source === prog) return true;
    const f1 = FAMILY[s.type], f2 = FAMILY[x.type];
    return f1 === f2 || f1 === 'mix' || f2 === 'mix' || (f1 === 'walk' && f2 === 'run');
  });
}
export function weekProgress(plan: CoachPlan, w: number, workouts: WLite[], today?: string) {
  const items = weekSessions(plan, w).filter((x) => x.s);
  const done = items.filter((x) => isDone(plan, w, x.wd, x.date, x.s!, workouts)).length;
  const due = today ? items.filter((x) => x.date <= today).length : items.length;
  return { planned: items.length, done, due };
}

// ---------------------------------------------------------------- weekly check-ins
const clonePlan = (p: CoachPlan): CoachPlan => ({ ...p, slots: [...p.slots], weeks: p.weeks.map((w) => ({ ...w, layout: [...w.layout] })), changelog: [...p.changelog], checkins: [...p.checkins], painAreas: [...p.painAreas] });
function snapshot(plan: CoachPlan, w: number): { n: string; e: string[] }[] {
  return weekSessions(plan, w).filter((x) => x.s).map((x) => ({ n: x.s!.name, e: x.s!.blocks.map((b) => b.exId) }));
}
function diffSwaps(A: { n: string; e: string[] }[], B: { n: string; e: string[] }[]): string[] {
  const out = new Set<string>();
  B.forEach((b, i) => {
    const a = A[i]; if (!a) return;
    if (a.n !== b.n) out.add(`${a.n} → ${b.n}`);
    else b.e.forEach((id, j) => { const old = a.e[j]; if (old && old !== id) out.add(`${exById(old)?.name || old} → ${exById(id)?.name || id}`); });
  });
  return [...out].map((x) => `Swapped: ${x}`);
}
/**
 * Weekly check-in rules (applied to NEXT week, logged in the changelog):
 *  - sharp pain, or pain in the same area two check-ins running → deload + "see a physio or doctor"
 *  - any pain → swap exercises that load that area for the rest of the plan, and hold (no progression)
 *  - too hard AND (under half done, soreness ≥ 4/5 or energy ≤ 2/5) → deload (≈25% less)
 *  - too hard, or under half done, or soreness ≥ 4, or energy ≤ 2 → hold (repeat this week's level)
 *  - too easy with ≥ 75% done and soreness ≤ 3 → +5% volume; two easy check-ins in a row → move up a level
 *  - otherwise → progress as planned
 */
export function applyCheckIn(plan: CoachPlan, ci: CheckIn): CoachPlan {
  const p = clonePlan(plan);
  p.checkins = [...plan.checkins.filter((c) => c.week !== ci.week), ci].sort((x, y) => x.week - y.week);
  const prev = plan.checkins.filter((c) => c.week < ci.week).sort((x, y) => y.week - x.week)[0];
  const cur = p.weeks[ci.week], next = p.weeks[ci.week + 1];
  const rate = ci.planned ? ci.done / ci.planned : 1;
  const curEff = cur ? effectiveVol(cur) : 1;
  const before = next ? snapshot(plan, ci.week + 1) : [];
  const changes: string[] = [];
  let decision: Decision = 'progress', title = '';
  const setNextEff = (eff: number) => { if (next) next.adj = Math.max(0.5, Math.min(PEAK, eff)) / next.vol; };
  const painRepeat = ci.pain.length > 0 && !!prev && prev.pain.some((x) => ci.pain.includes(x));
  for (const x of ci.pain) if (!p.painAreas.includes(x)) p.painAreas.push(x);
  if (ci.sharp || painRepeat) {
    decision = 'see-pro'; title = ci.sharp ? 'Sharp pain — easing off and getting it checked' : 'Pain came back — please get it checked';
    const eff = Math.min(curEff, 0.7); setNextEff(eff);
    changes.push(`Next week is lighter (about ${Math.round((1 - eff / Math.max(curEff, 0.01)) * 100) || 30}% less than this week).`);
    changes.push('Please see a physiotherapist or doctor before training hard on it. Stop any exercise that causes sharp pain.');
  } else if (ci.pain.length) {
    decision = 'hold'; title = 'Holding steady and training around the sore spot';
    setNextEff(Math.min(curEff, next ? next.vol : curEff));
    changes.push('Next week stays at this week’s level instead of progressing.');
  } else if (ci.feel === 'hard' && (rate < 0.5 || ci.soreness >= 4 || ci.energy <= 2)) {
    decision = 'deload'; title = 'Too much this week — easing off';
    setNextEff(Math.min(curEff * 0.75, next ? next.vol : 1));
    changes.push('Next week is lighter (about 25% less volume) so you can recover.');
  } else if (ci.feel === 'hard' || rate < 0.5 || ci.soreness >= 4 || ci.energy <= 2) {
    decision = 'hold'; title = 'Repeating this week’s level';
    setNextEff(Math.min(curEff, next ? next.vol : curEff));
    changes.push(rate < 0.5 ? `You completed ${ci.done} of ${ci.planned} sessions, so next week repeats this week’s level.` : 'Next week repeats this week’s level instead of progressing.');
    if (rate < 0.5 && prev && prev.planned && prev.done / prev.planned < 0.5) changes.push(`Two weeks under half done — consider rebuilding the plan with ${Math.max(2, plan.answers.days - 1)} days a week.`);
  } else if (ci.feel === 'easy' && rate >= 0.75 && ci.soreness <= 3) {
    decision = 'bump'; title = 'Felt easy — stepping it up';
    if (next && next.phase === 'build') { setNextEff(Math.min(PEAK, Math.max(next.vol, curEff) * 1.05)); changes.push('Next week has about 5% more volume than planned.'); }
    else changes.push('Next week is a planned lighter week — keep it easy; the step up comes after.');
    if (prev && prev.feel === 'easy' && plan.levels.overall !== 'Expert' && plan.levels.overall !== plan.levels.cap) {
      decision = 'level-up'; title = 'Two easy weeks in a row — moving up a level';
      p.levelBoost = (plan.levelBoost || 0) + 1;
      p.levels = detectLevel(plan.answers, p.levelBoost);
      p.slots = plan.slots.map((s) => {
        const { refs, mod } = poolFor(plan.answers, p.levels, s.role, [...plan.answers.injuries, ...p.painAreas]);
        return refs.includes(s.ref) ? s : { ...s, ref: refs[0], mod };
      });
      changes.push(`Level: ${plan.levels.overall} → ${p.levels.overall}. Sessions from here on use the harder versions.`);
    }
  } else {
    title = 'On track — progressing as planned';
    changes.push(next ? (next.phase === 'deload' ? 'Next week is the planned lighter week.' : next.phase === 'taper' ? 'Next week is your taper.' : 'Next week progresses as planned.') : 'That was the last week of this block — build your next block.');
  }
  if (next) changes.push(...diffSwaps(before, snapshot(p, ci.week + 1)));
  p.changelog.push({ date: ci.date, week: ci.week, decision, title, changes });
  return p;
}

// ---------------------------------------------------------------- user edits
const WD = WEEKDAYS;
/** Move a session to another weekday (swapping with whatever is there), this week and later weeks. */
export function moveDay(plan: CoachPlan, w: number, from: number, to: number, date: string): CoachPlan {
  const p = clonePlan(plan);
  const id = plan.weeks[w]?.layout[from]; const name = (id ? materialize(plan, w, id) : null)?.name || 'Rest';
  for (let i = w; i < p.weeks.length; i++) { const L = p.weeks[i].layout; [L[from], L[to]] = [L[to], L[from]]; }
  p.changelog.push({ date, week: w, decision: 'edit', title: `Moved ${name} from ${WD[from]} to ${WD[to]}`, changes: [`Applies from week ${w + 1} on.`] });
  return p;
}
const modOfRef = (ref: string): Modality | undefined => (/run-5k|run-10k|run-expert/.test(ref) ? 'run' : /ride|indoor-bike/.test(ref) ? 'ride' : /walk-ladder/.test(ref) ? 'walk' : undefined);
/** Other sessions that can fill the same slot (same role, other variants, other cardio types). */
export function alternatives(plan: CoachPlan, slotId: string): string[] {
  const s = slotById(plan, slotId); if (!s) return [];
  const a = plan.answers, e = equipSet(a), out = new Set<string>();
  const lv = levelForRole(plan.levels, s.role);
  const keys = s.role === 'easy' || s.role === 'quality' || s.role === 'tempo' || s.role === 'long'
    ? (['run', 'ride', 'walk'] as Modality[]).filter((m) => m !== 'ride' || e.has('bike')).map((m) => `${s.role}-${m}`)
    : s.role === 'strength' ? ['strength-bw', ...(e.has('dumbbells') ? ['strength-db'] : []), ...(e.has('gym') ? ['strength-gym'] : []), 'mobility']
      : [s.role, 'mobility'];
  for (const k of keys) for (const r of POOLS[k]?.[lv] || []) if (r !== s.ref) out.add(r);
  return [...out];
}
/** Replace one day's session with another (this week and later weeks). */
export function swapSession(plan: CoachPlan, w: number, wd: number, ref: string, date: string): CoachPlan {
  const p = clonePlan(plan);
  const oldId = p.weeks[w]?.layout[wd] ?? null; const old = slotById(p, oldId);
  if (!old || !baseSession(ref)) return plan;
  const ns: CoachSlot = { ...old, id: `s${p.slots.length + 1}`, ref, mod: modOfRef(ref) };
  p.slots.push(ns);
  for (let i = w; i < p.weeks.length; i++) if (p.weeks[i].layout[wd] === oldId) p.weeks[i].layout[wd] = ns.id;
  const oldName = materialize(plan, w, old.id)?.name || 'session', newName = baseSession(ref)?.s.name || ref;
  p.changelog.push({ date, week: w, decision: 'edit', title: `Swapped ${WD[wd]}: ${oldName} → ${newName}`, changes: [`Applies from week ${w + 1} on.`] });
  return p;
}
/** Edit a day: change its length, make it a rest day, or add a session to a rest day. */
export function editDay(plan: CoachPlan, w: number, wd: number, patch: { minutes?: number; rest?: boolean; add?: Role }, date: string): CoachPlan {
  const p = clonePlan(plan);
  const id = p.weeks[w]?.layout[wd] ?? null; const slot = slotById(p, id);
  if (patch.rest && id) {
    const nm = materialize(plan, w, id)?.name || 'session';
    for (let i = w; i < p.weeks.length; i++) if (p.weeks[i].layout[wd] === id) p.weeks[i].layout[wd] = null;
    p.changelog.push({ date, week: w, decision: 'edit', title: `${WD[wd]} is now a rest day (was ${nm})`, changes: [`Applies from week ${w + 1} on.`] });
  } else if (patch.add && !id) {
    const { refs, mod } = poolFor(p.answers, p.levels, patch.add, [...p.answers.injuries, ...p.painAreas]);
    const ns: CoachSlot = { id: `s${p.slots.length + 1}`, role: patch.add, ref: refs[0], mod };
    p.slots.push(ns);
    for (let i = w; i < p.weeks.length; i++) if (!p.weeks[i].layout[wd]) p.weeks[i].layout[wd] = ns.id;
    p.changelog.push({ date, week: w, decision: 'edit', title: `Added ${baseSession(ns.ref)?.s.name || roleLabel(ns.role)} on ${WD[wd]}`, changes: [`Applies from week ${w + 1} on.`] });
  } else if (patch.minutes && slot) {
    const ns: CoachSlot = { ...slot, id: `s${p.slots.length + 1}`, minutes: Math.max(15, Math.min(120, Math.round(patch.minutes))) };
    p.slots.push(ns);
    for (let i = w; i < p.weeks.length; i++) if (p.weeks[i].layout[wd] === id) p.weeks[i].layout[wd] = ns.id;
    p.changelog.push({ date, week: w, decision: 'edit', title: `${WD[wd]} set to about ${ns.minutes} min`, changes: [`Applies from week ${w + 1} on.`] });
  }
  return p;
}
/** Rebuild with the same answers and a new seed (different session variants), keeping id, start date and history. */
export function regenerate(plan: CoachPlan, today: string, catalog?: Catalog, energy?: EnergyInput): CoachPlan {
  const seed = plan.seed + 1;
  const g = generatePlan(plan.answers, { today, id: plan.id, seed, catalog, energy, levelBoost: plan.levelBoost, painAreas: plan.painAreas });
  return { ...plan, ...g, startDate: plan.startDate, checkins: plan.checkins, logged: plan.logged, applyToFuel: plan.applyToFuel,
    changelog: [...plan.changelog, { date: today, week: Math.max(0, weekIndexOf(plan, today)), decision: 'edit', title: 'Plan regenerated', changes: ['Same answers, fresh mix of sessions.'] }] };
}

// ---------------------------------------------------------------- nutrition
export function trainTypeOf(a: CoachAnswers): TrainType {
  const k = mixKey(a);
  if (k === 'hybrid' || k === 'hyrox') return 'hybrid';
  if (a.goal === 'muscle' || a.goal === 'skills') return 'strength';
  if (a.goal === 'endurance' || k === 'race') return 'endurance';
  const s = a.prefs.some((p) => STRENGTH_PREFS.includes(p)), c = a.prefs.some((p) => CARDIO_PREFS.includes(p));
  return s && c ? 'hybrid' : c ? 'endurance' : 'strength';
}
export function quizOf(a: CoachAnswers): WLQuiz {
  return {
    sex: a.sex, age: a.age, heightCm: a.heightCm, weightKg: a.weightKg, goalWeightKg: undefined, pace: a.pace, health: a.health,
    activity: a.activity, training: trainTypeOf(a), trainingDays: clampDays(a.days), energy: 'questionnaire',
    diet: a.diet, religious: a.religious, exclude: a.exclude, meals: a.meals, window: null, budget: a.budget, cookTime: a.cookTime,
  };
}
const shiftM = (m: DayMacro, k: number): DayMacro => ({ ...m, kcal: m.kcal + k, carbs: Math.max(0, m.carbs + Math.round(k / 4)) });
/**
 * Fat loss → the weight-loss engine (pace, calorie floor, ≤ 1%/week, protein first). Muscle → maintenance + a small surplus
 * (none at BMI ≥ 30). Everything else → maintenance. Endurance / hybrid get carbs periodized (more on training days).
 * Screening 'stop' (under 18, pregnancy, breastfeeding, eating-disorder history) → no calorie numbers at all.
 */
export function coachNutrition(a: CoachAnswers, cat: Catalog, seed: number, trainDays: number[], levels: LevelResult, energy?: EnergyInput): CoachNutrition {
  const quiz = quizOf(a);
  const sc = screen(quiz);
  const notes: string[] = [];
  if (sc.level === 'stop') return { mode: 'stop', quiz, targets: null, week: [], trainDays, level: sc.level, reasons: sc.reasons, surplus: 0, notes };
  const q2: WLQuiz = { ...quiz, energy: energy && (energy.trackedDays || 0) >= 7 ? 'auto' : 'questionnaire' };
  let mode: CoachNutrition['mode'] = a.goal === 'fat-loss' ? 'fat-loss' : a.goal === 'muscle' ? 'surplus' : 'maintain';
  let t: WLTargets;
  if (mode === 'fat-loss') {
    t = computeWL(q2, energy || {});
    if (t.atMaintenance) { mode = 'maintain'; if (sc.level === 'maintain') notes.push('Your BMI is under 18.5, so HYBRD keeps calories at maintenance instead of a deficit.'); }
  } else {
    t = computeWL({ ...q2, goalWeightKg: quiz.weightKg }, energy || {});
    t = { ...t, notes: t.notes.filter((n) => !/goal weight/i.test(n)), pace: null, deficit: 0, weeklyLossKg: 0, weeklyPct: 0, weeksToGoal: null, goalWeightKg: null };
  }
  let surplus = 0;
  if (mode === 'surplus') {
    if (sc.bmi >= 30) { mode = 'maintain'; notes.push('With a BMI of 30 or more, HYBRD keeps calories at maintenance: you can still build muscle while body fat comes down.'); }
    else {
      surplus = levels.strength === 'Expert' ? 150 : 250;
      t = { ...t, kcal: t.kcal + surplus, carbs: t.carbs + Math.round(surplus / 4), train: shiftM(t.train, surplus), rest: shiftM(t.rest, surplus), atMaintenance: false };
      notes.push(`About ${surplus} kcal a day above maintenance — a small surplus so most of the gain can be muscle. If your weight climbs faster than about 0.5% a week, eat a little less.`);
    }
  }
  const week = buildWeek(cat, quiz, t, seed, trainDays);
  return { mode, quiz, targets: t, week, trainDays, level: sc.level, reasons: sc.reasons, surplus, notes: [...notes, ...t.notes] };
}
/** Today's coach nutrition target (training or rest day by that week's layout). */
export function coachTargetsFor(plan: CoachPlan, key: string): (DayMacro & { kind: 'train' | 'rest'; waterMl: number }) | null {
  const n = plan.nutrition; if (!n || !n.targets || !plan.weeks.length) return null;
  const w = Math.max(0, Math.min(plan.weeks.length - 1, weekIndexOf(plan, key)));
  const kind: 'train' | 'rest' = trainDaysOf(plan, w).includes(weekdayOf(key)) ? 'train' : 'rest';
  const t = kind === 'train' ? n.targets.train : n.targets.rest;
  return { ...t, kind, waterMl: n.targets.waterMl };
}
export function activeCoachPlan<T extends { deleted?: boolean; updatedAt: number }>(plans: T[]): T | null {
  return [...plans].filter((p) => !p.deleted).sort((x, y) => y.updatedAt - x.updatedAt)[0] || null;
}

// ---------------------------------------------------------------- "Why this plan"
export interface WhyItem { title: string; body: string; src: string[] }
const andList = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
export function explain(plan: CoachPlan): WhyItem[] {
  const a = plan.answers, L = plan.levels, out: WhyItem[] = [];
  if (plan.stopped) return [{ title: 'Why there’s no plan yet', body: 'You said a doctor has advised against exercise, or that you get chest pain, fainting or dizziness when you’re active. Please get cleared by a doctor first, then come back and build your plan.', src: ['who2020'] }];
  const goalTxt = a.goal === 'race' ? `${raceLabel(a.race)} prep` : goalLabel(a.goal).toLowerCase();
  const tdays = trainDaysOf(plan, 0), rdays = [0, 1, 2, 3, 4, 5, 6].filter((d) => !tdays.includes(d));
  out.push({ title: `${tdays.length} days a week, about ${a.minutes} minutes each`, body: `${tdays.length} days because you said ${a.days}: ${andList(tdays.map((d) => WEEKDAYS[d]))}. Rest days (${andList(rdays.map((d) => WEEKDAYS[d]))}) keep the harder sessions apart. Every session is scaled to about ${a.minutes} minutes because that’s the time you have.`, src: [] });
  const pushTxt = `${bandLabel(PUSH_BANDS, a.pushUps)} push-ups`, pullTxt = a.pullUps == null ? 'didn’t test pull-ups' : `${bandLabel(PULL_BANDS, a.pullUps)} pull-ups`;
  const runTxt = a.run === 'none' ? 'can’t run a mile yet' : a.run === 'mile' ? `can run a mile${a.mileMin ? ` in ${bandLabel(MILE_BANDS, a.mileMin).toLowerCase()}` : ''}` : `can run ${a.run === '5k' ? '5K' : '10K or more'}${a.fiveKMin ? ` (5K in ${bandLabel(FIVEK_BANDS, a.fiveKMin).toLowerCase()})` : ''}`;
  const caps: string[] = [];
  if (L.capWhy.includes('new')) caps.push('you’re new to structured training, so everything starts at Beginner and the check-ins move you up when it feels easy');
  if (L.capWhy.includes('injury')) caps.push('you flagged an injury, so Expert sessions are off for now');
  if (L.capWhy.includes('medical')) caps.push('you have a medical condition, so Expert sessions are off');
  if (L.capWhy.includes('pregnant')) caps.push('you’re pregnant, so sessions stay at Beginner (follow your doctor or midwife’s advice)');
  if (L.capWhy.includes('under-18')) caps.push('you’re under 18, so Expert sessions are off');
  out.push({ title: `Level: ${L.overall}`, body: `Strength ${L.strength} because you did ${pushTxt}${a.pullUps == null ? ' and' : ' and'} ${pullTxt}. Endurance ${L.endurance} because you ${runTxt}.${caps.length ? ` Also, ${caps.join('; ')}.` : ''}${plan.levelBoost ? ` You moved up ${plan.levelBoost} level${plan.levelBoost > 1 ? 's' : ''} after easy check-ins.` : ''}`, src: ['helms-rir'] });
  const k = mixKey(a);
  const mixWhy: Record<string, [string, string[]]> = {
    'fat-loss': ['Strength sessions help you keep muscle while you eat less, and cardio adds to the calories you burn. Most of the fat loss comes from the food side.', ['wl-helms-prep', 'wl-garthe', 'who2020']],
    muscle: ['Each muscle group is trained at least twice a week, with sets taken close to failure (2–3 reps left), adding reps and then load week to week.', ['helms-rir', 'issn-protein']],
    endurance: ['Most sessions are easy so you recover and build an aerobic base; one quality session (intervals or tempo) and one longer session a week do the sharpening.', ['daniels', 'who2020']],
    race: [`Built for a ${raceLabel(a.race)}: easy running for volume, one quality session, and the long run on your last training day.${(a.race === 'marathon' || a.race === 'half') && a.minutes < 90 ? ` ${raceLabel(a.race)} training usually includes long runs over ${a.race === 'marathon' ? '90' : '75'} minutes. With ${a.minutes}-minute sessions this block builds your base, so allow a longer weekend run when you can.` : ''}`, ['daniels']],
    hyrox: ['HYROX mixes running with 8 stations, so the week pairs station work and compromised runs (running on tired legs) with strength and easy running. A race simulation lands before each lighter week.', ['hyrox-rulebook', 'daniels']],
    skills: ['Skill work comes first in each session while you’re fresh, moving from easier to harder versions of each move.', ['low-og', 'helms-rir']],
    health: ['Follows the WHO guidelines: muscle-strengthening on 2 or more days a week, plus regular moderate activity building toward 150–300 minutes a week.', ['who2020']],
    hybrid: ['Hybrid week: strength and endurance are kept apart. Heavy legs never go the day before a hard run or the long session, and hard days don’t sit back to back. That’s the ordering rule from the Expert Hybrid research.', ['wilson2012', 'schumann2022']],
  };
  const [mw, ms] = mixWhy[k] || mixWhy.health;
  out.push({ title: `Why this mix for ${goalTxt}`, body: mw, src: ms });
  const ctx = swapCtx(plan);
  const swaps = new Map<string, string>();
  weekSessions(plan, 0).forEach((x) => x.s?.blocks.forEach((b) => { if (b.swappedFrom && b.why) swaps.set(`${exById(b.swappedFrom)?.name} → ${exById(b.exId)?.name}`, b.why); }));
  const sx = [...swaps.entries()].slice(0, 8);
  const eq = EQUIPMENT.filter((e) => e.v !== 'none' && a.equipment.includes(e.v)).map((e) => e.label.toLowerCase());
  out.push({ title: 'Matched to your equipment and level', body: `You have ${eq.length ? andList(eq) : 'no equipment'}.${a.prefs.includes('cycling') && !a.equipment.includes('bike') && !a.equipment.includes('gym') ? ' You picked cycling, so the plan assumes you have a bike.' : ''}${sx.length ? ` Swaps: ${sx.map(([s, why]) => `${s} (${why})`).join('; ')}.` : ' No swaps were needed.'}`, src: ['low-og'] });
  if (ctx.injuries.length) out.push({ title: 'Working around your injuries', body: `You flagged your ${andList(ctx.injuries.map((i) => (i === 'back' ? 'lower back' : i)))}. Exercises that load ${ctx.injuries.length > 1 ? 'those areas' : 'that area'} are swapped for friendlier ones${ctx.injuries.includes('knees') ? (ctx.keepRun ? '. Running stays because you’re preparing for a race, but if your knees hurt, tell the check-in and runs switch to the bike' : ', and runs become bike or walking sessions') : ''}. Train pain-free: stop anything that hurts and tell the weekly check-in. Pain that keeps coming back needs a physio or doctor.`, src: [] });
  const deloads = plan.weeks.filter((w) => w.phase === 'deload').map((w) => String(w.index + 1)), taper = plan.weeks.find((w) => w.phase === 'taper');
  out.push({ title: `${plan.weeks.length} weeks that build`, body: `Each build week adds a little: about 5–10% more running or riding, +1 rep on bodyweight sets, longer holds, and more load once every set has 2 reps left.${deloads.length ? ` Week ${andList(deloads)} ${deloads.length > 1 ? 'are lighter weeks' : 'is a lighter week'} (about 30–40% less) so the work sinks in.` : ''}${taper ? ` Week ${taper.index + 1} is a taper before your race.` : ''} The weekly check-in can hold, ease off or step up based on how it went.`, src: ['helms-rir'] });
  const n = plan.nutrition;
  if (n && n.mode === 'stop') out.push({ title: 'No calorie targets', body: n.reasons.map((r) => REASON_TEXT[r]).join(' '), src: ['wl-reds'] });
  else if (n && n.targets) {
    const t = n.targets;
    const head = n.mode === 'fat-loss' ? `${t.kcal.toLocaleString()} kcal a day: your estimated maintenance (${t.tdee.toLocaleString()}, from Mifflin-St Jeor × your activity) minus about ${t.deficit} for the ${t.pace === 'aggressive' ? 'faster' : t.pace} pace you picked. It never goes under ${t.floor.toLocaleString()} kcal or past 1% of body weight a week.`
      : n.mode === 'surplus' ? `${t.kcal.toLocaleString()} kcal a day: maintenance (${t.tdee.toLocaleString()}) plus a small surplus of ${n.surplus} for building muscle.`
        : `${t.kcal.toLocaleString()} kcal a day, your estimated maintenance (Mifflin-St Jeor × your activity), because your goal is ${goalTxt}, not changing your weight.`;
    out.push({ title: 'Your calories', body: `${head} These are estimates: your weekly trend tells you more than any formula.`, src: n.mode === 'fat-loss' ? ['mifflin', 'wl-aha2013', 'wl-helms-prep', 'wl-garthe'] : ['mifflin', 'acsm2016'] });
    out.push({ title: 'Protein, carbs and water', body: `Protein ${t.protein} g a day (${t.proteinPerKg} g/kg) because you train ${trainTypeOf(a) === 'endurance' ? 'for endurance' : 'with strength work'}${n.mode === 'fat-loss' ? ' and protein helps keep muscle in a deficit' : ''}.${t.periodized ? ` Carbs go up on training days (${t.train.carbs} g) and down on rest days (${t.rest.carbs} g), so the fuel matches the work with the same weekly total.` : ''} Water: about ${(t.waterMl / 1000).toFixed(1)} L a day from food and drinks, plus more around training.`, src: ['issn-protein', 'wl-morton', ...(t.periodized ? ['wl-impey', 'acsm2016'] : []), 'nasem-water', 'acsm-fluid'] });
    out.push({ title: '7-day meal plan', body: `${a.meals} meals a day, ${a.diet === 'lowcarb' ? 'lower carb' : a.diet}${a.exclude.length ? `, with no ${andList(a.exclude)}` : ''}${a.religious !== 'none' ? `, ${a.religious}-friendly` : ''}${a.cookTime ? `, ≤ ${a.cookTime} min cooking` : ''}${a.budget ? ', budget-friendly' : ''}. Meals come from HYBRD’s USDA-checked recipes, with portions scaled to your daily target.`, src: ['usda', 'wl-dga'] });
  }
  return out;
}
