// Weight-loss programs: screening, calorie / macro targets, 7-day meal plans, grocery list, weigh-in trend and
// adaptive suggestions. Pure functions (no React, no JSON imports) so they can be unit-tested with plain Node.
// The research behind every number is listed in src/data/sources.ts (ids starting with "wl-") and shown in the app.
import type { Rec, Sex } from './types';

// ---------- quiz ----------
export type Pace = 'gentle' | 'moderate' | 'aggressive';
export type TrainType = 'none' | 'strength' | 'endurance' | 'hybrid';
export type DietPattern = 'omnivore' | 'mediterranean' | 'vegetarian' | 'vegan' | 'pescatarian' | 'lowcarb';
export type Religious = 'none' | 'halal' | 'kosher';
export type Allergen = 'gluten' | 'dairy' | 'nuts' | 'egg' | 'soy' | 'shellfish' | 'fish' | 'sesame';
export type Slot = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type CookTime = 0 | 15 | 30; // 0 = any
export type Activity = 1.2 | 1.375 | 1.55 | 1.725 | 1.9;

export interface Health { pregnant?: boolean; breastfeeding?: boolean; eatingDisorder?: boolean; diabetes?: boolean; medical?: boolean }
export interface WLQuiz {
  sex: Sex; age: number; heightCm: number; weightKg: number; goalWeightKg?: number;
  pace: Pace;
  health: Health;
  activity: Activity; training: TrainType; trainingDays: number;
  energy: 'auto' | 'questionnaire';
  diet: DietPattern; religious: Religious; exclude: Allergen[];
  meals: 2 | 3 | 4 | 5;
  window: { start: string; hours: 8 | 10 | 12 } | null;
  budget: boolean; cookTime: CookTime;
}
export const ALLERGENS: { v: Allergen; label: string }[] = [
  { v: 'gluten', label: 'Gluten' }, { v: 'dairy', label: 'Dairy' }, { v: 'nuts', label: 'Nuts & peanuts' }, { v: 'egg', label: 'Eggs' },
  { v: 'soy', label: 'Soy' }, { v: 'shellfish', label: 'Shellfish' }, { v: 'fish', label: 'Fish' }, { v: 'sesame', label: 'Sesame' },
];
export const DIETS: { v: DietPattern; label: string; hint: string }[] = [
  { v: 'omnivore', label: 'Omnivore', hint: 'Everything' },
  { v: 'mediterranean', label: 'Mediterranean', hint: 'Fish, legumes, olive oil, whole grains; no red meat' },
  { v: 'vegetarian', label: 'Vegetarian', hint: 'No meat or fish; eggs & dairy OK' },
  { v: 'vegan', label: 'Vegan', hint: 'Plants only' },
  { v: 'pescatarian', label: 'Pescatarian', hint: 'Fish & seafood, no meat' },
  { v: 'lowcarb', label: 'Lower carb', hint: '≈25% of calories from carbs' },
];

// ---------- research constants (see sources) ----------
/** Calorie floor without medical supervision (Harvard Health Publishing; AHA/ACC/TOS 2013 prescribes 1,200–1,500 women / 1,500–1,800 men). */
export const KCAL_FLOOR: Record<Sex, number> = { female: 1200, male: 1500 };
/** Rough starting estimate for the energy in 1 kg of body-weight change (≈3,500 kcal/lb). It overstates long-term loss (Hall 2008; Thomas 2013). */
export const KCAL_PER_KG = 7700;
/** Paces as % of body weight per week (Helms 2014: 0.5–1%/wk; Garthe 2011: 0.7%/wk kept more lean mass than 1.4%/wk),
 *  each capped at a share of maintenance and an absolute 1,000 kcal/day (AHA 2013 prescribes 500–750 kcal/day deficits). */
export const PACES: Record<Pace, { pct: number; cap: number; label: string; hint: string }> = {
  gentle: { pct: 0.5, cap: 0.15, label: 'Gentle', hint: '≈0.5% of body weight a week · easiest to sustain' },
  moderate: { pct: 0.75, cap: 0.2, label: 'Moderate', hint: '≈0.75% a week' },
  aggressive: { pct: 1.0, cap: 0.25, label: 'Faster', hint: '≈1% a week · the maximum HYBRD offers' },
};
export const MAX_DEFICIT = 1000;
export const MAX_RATE_PCT = 1.0;
export const PROTEIN_BASE: Record<TrainType, number> = { none: 1.6, endurance: 1.8, strength: 2.0, hybrid: 2.0 };
export const PROTEIN_PACE: Record<Pace, number> = { gentle: 0, moderate: 0.1, aggressive: 0.2 };
export const PROTEIN_MAX = 2.4;
export const ENERGY_MIN_DAYS = 7;

export const bmiOf = (kg: number, cm: number) => kg / Math.pow(cm / 100, 2);
export const kgAtBmi = (bmi: number, cm: number) => bmi * Math.pow(cm / 100, 2);
export const mifflin = (q: Pick<WLQuiz, 'sex' | 'weightKg' | 'heightCm' | 'age'>) => 10 * q.weightKg + 6.25 * q.heightCm - 5 * q.age + (q.sex === 'male' ? 5 : -161);
const r10 = (v: number) => Math.round(v / 10) * 10;

// ---------- screening ----------
export type ScreenLevel = 'ok' | 'gentle' | 'maintain' | 'stop';
export interface Screen { level: ScreenLevel; reasons: string[]; paces: Pace[]; bmi: number; minGoalKg: number }
/**
 * Safety screen. 'stop' = no calorie plan (under 18, pregnant or breastfeeding, history of an eating disorder);
 * 'maintain' = BMI under 18.5, no weight loss offered, a balanced plan at maintenance only;
 * 'gentle' = diabetes or another medical condition, or BMI under 20: gentle pace only.
 */
export function screen(q: Pick<WLQuiz, 'age' | 'sex' | 'heightCm' | 'weightKg' | 'health'>): Screen {
  const bmi = bmiOf(q.weightKg, q.heightCm);
  const h = q.health || {};
  const reasons: string[] = [];
  let level: ScreenLevel = 'ok';
  if (q.age < 18) reasons.push('under-18');
  if (q.sex === 'female' && h.pregnant) reasons.push('pregnant');
  if (q.sex === 'female' && h.breastfeeding) reasons.push('breastfeeding');
  if (h.eatingDisorder) reasons.push('eating-disorder');
  if (reasons.length) level = 'stop';
  else if (bmi < 18.5) { level = 'maintain'; reasons.push('bmi-under-18.5'); }
  else {
    if (h.diabetes) reasons.push('diabetes');
    if (h.medical) reasons.push('medical');
    if (bmi < 20) reasons.push('bmi-under-20');
    if (reasons.length) level = 'gentle';
  }
  const paces: Pace[] = level === 'ok' ? ['gentle', 'moderate', 'aggressive'] : level === 'gentle' ? ['gentle'] : [];
  return { level, reasons, paces, bmi, minGoalKg: Math.ceil(kgAtBmi(18.5, q.heightCm) * 10) / 10 };
}
export const REASON_TEXT: Record<string, string> = {
  'under-18': 'You’re under 18. Teens are still growing, and the adult calorie equations here don’t apply — a doctor or registered dietitian can help with a plan made for you.',
  pregnant: 'You’re pregnant. Calorie needs change through pregnancy and weight loss isn’t usually advised — please follow your doctor or midwife’s guidance.',
  breastfeeding: 'You’re breastfeeding. Energy needs are higher while breastfeeding — please check with your doctor or a registered dietitian before cutting calories.',
  'eating-disorder': 'You told us about a history of an eating disorder. Calorie targets and weigh-ins can make recovery harder, so HYBRD won’t build a calorie-cutting plan. A doctor, therapist or registered dietitian can help you set goals safely.',
  'bmi-under-18.5': 'Your BMI is under 18.5 (underweight range), so HYBRD won’t suggest weight loss. You can still get a balanced plan at maintenance. If you’re losing weight without trying, please see a doctor.',
  diabetes: 'You have diabetes. Eating less can change blood sugar and medication needs (especially insulin or sulfonylureas) — talk to your doctor before starting. Only the gentle pace is available.',
  medical: 'You have a medical condition or take medicine that affects weight or diet. Check with your doctor or a registered dietitian first. Only the gentle pace is available.',
  'bmi-under-20': 'Your BMI is already near the low end of the healthy range, so only the gentle pace is offered.',
};

// ---------- energy ----------
export interface EnergyInput { trackedActive?: number; trackedDays?: number }
export interface Energy { bmr: number; factorTdee: number; trackedTdee: number | null; tdee: number; method: 'factor' | 'tracked' }
/**
 * Maintenance (TDEE). 'factor' = Mifflin-St Jeor × activity factor. 'tracked' = Mifflin-St Jeor × 1.2 (sedentary
 * baseline incl. digestion) + your average ACTIVE burn from the Burn tracker (workouts + steps + added activities),
 * used only when at least 7 of the last 14 days have activity logged, and capped at BMR × 2.2.
 */
export function energyOf(q: Pick<WLQuiz, 'sex' | 'weightKg' | 'heightCm' | 'age' | 'activity' | 'energy'>, e: EnergyInput = {}): Energy {
  const bmr = mifflin(q);
  const factorTdee = bmr * q.activity;
  const enough = (e.trackedDays || 0) >= ENERGY_MIN_DAYS && (e.trackedActive || 0) > 0;
  const trackedTdee = enough ? Math.min(bmr * 2.2, bmr * 1.2 + (e.trackedActive || 0)) : null;
  const useTracked = q.energy === 'auto' && trackedTdee != null;
  return { bmr: Math.round(bmr), factorTdee: Math.round(factorTdee), trackedTdee: trackedTdee == null ? null : Math.round(trackedTdee), tdee: Math.round(useTracked ? trackedTdee! : factorTdee), method: useTracked ? 'tracked' : 'factor' };
}

// ---------- targets ----------
export interface DayMacro { kcal: number; protein: number; carbs: number; fat: number }
export interface WLTargets extends DayMacro {
  bmr: number; tdee: number; method: 'factor' | 'tracked'; level: ScreenLevel;
  pace: Pace | null; deficit: number; floor: number; floorApplied: boolean; capApplied: boolean; rateCapApplied: boolean; atMaintenance: boolean;
  proteinPerKg: number; refWeightKg: number; fatPct: number; fiber: number; waterMl: number;
  periodized: boolean; train: DayMacro; rest: DayMacro; maintenance: DayMacro;
  weeklyLossKg: number; weeklyPct: number; weeksToGoal: number | null; goalWeightKg: number | null;
  adjustKcal: number; notes: string[];
}
export interface TargetOpts { adjustKcal?: number }

function macrosFor(kcal: number, protein: number, diet: DietPattern): DayMacro {
  if (diet === 'lowcarb') {
    const carbs = Math.round((kcal * 0.25) / 4);
    const fat = Math.max(Math.round((kcal * 0.2) / 9), Math.round((kcal - protein * 4 - carbs * 4) / 9));
    return { kcal, protein, carbs, fat };
  }
  const fatPct = diet === 'mediterranean' ? 0.32 : 0.27;
  const fat = Math.round((kcal * fatPct) / 9);
  return { kcal, protein, fat, carbs: Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4)) };
}

export function computeWL(q: WLQuiz, e: EnergyInput = {}, opts: TargetOpts = {}): WLTargets {
  const s = screen(q);
  const en = energyOf(q, e);
  const tdee = en.tdee;
  const notes: string[] = [];
  const floor = KCAL_FLOOR[q.sex];
  const pace: Pace | null = s.paces.includes(q.pace) ? q.pace : s.paces[0] ?? null;
  const goal = q.goalWeightKg && q.goalWeightKg > 0 ? Math.max(q.goalWeightKg, s.minGoalKg) : null;
  if (q.goalWeightKg && goal !== q.goalWeightKg) notes.push(`Goal raised to ${goal} kg so it stays at a BMI of at least 18.5.`);
  const reached = goal != null && q.weightKg <= goal;
  if (reached) notes.push('You’re at or below your goal weight, so the plan is set at maintenance.');
  let deficit = 0, capApplied = false;
  if (pace && !reached && s.level !== 'maintain' && s.level !== 'stop') {
    const want = (q.weightKg * PACES[pace].pct / 100) * KCAL_PER_KG / 7;
    const cap = Math.min(tdee * PACES[pace].cap, MAX_DEFICIT);
    deficit = Math.min(want, cap); capApplied = want > cap + 0.5;
  }
  const adjust = Math.round(opts.adjustKcal || 0);
  let kcal = tdee - deficit + adjust;
  // never above maintenance, never more than 1% of body weight a week, never under the floor (unless maintenance itself is lower)
  let rateCapApplied = false;
  const maxDeficit = (q.weightKg * MAX_RATE_PCT / 100) * KCAL_PER_KG / 7;
  if (tdee - kcal > maxDeficit) { kcal = tdee - maxDeficit; rateCapApplied = true; }
  kcal = Math.min(tdee, kcal);
  let floorApplied = false;
  if (kcal < floor) { kcal = Math.min(tdee, floor); floorApplied = kcal === floor; }
  if (tdee < floor) notes.push('Your estimated maintenance is below the usual minimum intake, so there is no deficit — please talk to a registered dietitian.');
  if (floorApplied) notes.push(`Raised to ${floor} kcal — the minimum HYBRD will set without medical supervision.`);
  kcal = r10(kcal);
  if (kcal > tdee) kcal = Math.floor(tdee / 10) * 10;
  const realDeficit = Math.max(0, tdee - kcal);
  const atMaintenance = realDeficit < 50;

  // protein first (g per kg of reference weight: actual weight, or the weight at BMI 25 if higher than that)
  const bmi = bmiOf(q.weightKg, q.heightCm);
  const refWeightKg = Math.round((bmi > 25 ? kgAtBmi(25, q.heightCm) : q.weightKg) * 10) / 10;
  const perKg = Math.min(PROTEIN_MAX, PROTEIN_BASE[q.training] + (atMaintenance || !pace ? 0 : PROTEIN_PACE[pace]));
  let protein = Math.round(refWeightKg * perKg);
  if (protein * 4 > kcal * 0.4) protein = Math.round((kcal * 0.4) / 4);
  const base = macrosFor(kcal, protein, q.diet);
  const fatPct = Math.round((base.fat * 9 / kcal) * 100);

  // carbohydrate periodization for endurance / HYROX / hybrid: more carbs on training days, fewer on rest days, same weekly total
  const T = Math.max(0, Math.min(7, Math.round(q.trainingDays)));
  let train = base, rest = base, periodized = false;
  if ((q.training === 'endurance' || q.training === 'hybrid') && T >= 1 && T <= 6) {
    let dTrain = 0.75 * q.weightKg * Math.min(1, (7 - T) / T);
    for (let i = 0; i < 20 && dTrain > 5; i++) {
      const dRest = dTrain * T / (7 - T);
      const restK = kcal - dRest * 4;
      if (restK >= Math.min(floor, kcal) && base.carbs - dRest >= Math.min(base.carbs, 75)) break;
      dTrain *= 0.8;
    }
    if (dTrain > 5) {
      const dt = Math.round(dTrain), dr = Math.round(dTrain * T / (7 - T));
      train = { ...base, carbs: base.carbs + dt, kcal: kcal + dt * 4 };
      rest = { ...base, carbs: base.carbs - dr, kcal: kcal - dr * 4 };
      periodized = true;
    }
  }
  if (q.training === 'endurance' || q.training === 'hybrid') {
    if (q.diet === 'lowcarb') notes.push('Lower-carb eating can make hard or long sessions feel harder; carbs are still shifted toward training days.');
  }
  const maintenance = macrosFor(r10(tdee), Math.round(refWeightKg * PROTEIN_BASE[q.training]), q.diet);
  const weeklyLossKg = Math.round((realDeficit * 7 / KCAL_PER_KG) * 100) / 100;
  const weeksToGoal = goal != null && !reached && weeklyLossKg > 0 ? Math.ceil((q.weightKg - goal) / weeklyLossKg) : null;
  return {
    ...base, bmr: en.bmr, tdee, method: en.method, level: s.level, pace: atMaintenance ? null : pace,
    deficit: Math.round(realDeficit), floor, floorApplied, capApplied, rateCapApplied, atMaintenance,
    proteinPerKg: Math.round((protein / refWeightKg) * 10) / 10, refWeightKg, fatPct,
    fiber: Math.round(14 * kcal / 1000), waterMl: q.sex === 'male' ? 3000 : 2200,
    periodized, train, rest, maintenance,
    weeklyLossKg, weeklyPct: Math.round((weeklyLossKg / q.weightKg) * 1000) / 10, weeksToGoal, goalWeightKg: goal,
    adjustKcal: adjust, notes,
  };
}

/** Default training days spread over the week (0 = Monday). */
export function defaultTrainDays(n: number): number[] {
  const P: number[][] = [[], [2], [1, 4], [0, 2, 4], [0, 1, 3, 5], [0, 1, 3, 4, 5], [0, 1, 2, 3, 4, 5], [0, 1, 2, 3, 4, 5, 6]];
  return P[Math.max(0, Math.min(7, Math.round(n)))];
}
export const weekdayOf = (key: string) => (new Date(key + 'T12:00:00').getDay() + 6) % 7;
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ---------- catalog ----------
export interface Macro { kcal: number; protein: number; carbs: number; fat: number; fiber: number }
export interface PlanRecipe {
  id: string; name: string; slots: Slot[]; contains: string[]; lowcarb: boolean; med: boolean; budget: boolean; mealPrep: boolean; minutes: number;
  serves: number; per: Macro; ingredients: { label: string; grams: number; fdcId: number; usda: string }[]; tags: string[];
}
export interface PlanSide { id: string; label: string; grams: number; fdcId: number; usda: string; role: 'protein' | 'carb' | 'fat'; contains: string[]; per: Macro }
export interface Catalog { recipes: PlanRecipe[]; sides: PlanSide[]; aisles: Record<string, string>; names: Record<string, string>; pieces: Record<string, number> }
interface RawRecipe { id: string; name: string; tags: string[]; serves: number; minutes: number; ingredients: { label: string; grams: number; fdcId: number; usda: string }[]; perServing: { kcal: number; protein: number; carbs: number; fat: number; fiber: number }; plan?: Omit<PlanRecipe, 'id' | 'name' | 'serves' | 'per' | 'ingredients' | 'tags'> }
interface RawPlanFoods { recipes: RawRecipe[]; meta: Record<string, RawRecipe['plan']>; sides: PlanSide[]; aisles: Record<string, string>; names: Record<string, string>; pieces: Record<string, number> }
export function makeCatalog(base: RawRecipe[], pf: RawPlanFoods): Catalog {
  const conv = (r: RawRecipe, m: NonNullable<RawRecipe['plan']>): PlanRecipe => ({ ...m, id: r.id, name: r.name, serves: r.serves, per: r.perServing, ingredients: r.ingredients, tags: r.tags });
  const recipes = [...base.filter((r) => pf.meta[r.id]).map((r) => conv(r, pf.meta[r.id]!)), ...pf.recipes.map((r) => conv(r, r.plan!))];
  return { recipes, sides: pf.sides, aisles: pf.aisles, names: pf.names, pieces: pf.pieces };
}

// ---------- eligibility ----------
/** Does a recipe (or side) fit the diet, religious flag and exclusions? */
export function fits(contains: string[], q: Pick<WLQuiz, 'diet' | 'religious' | 'exclude'>): boolean {
  const c = new Set(contains);
  for (const a of q.exclude) if (c.has(a)) return false;
  const meat = c.has('meat'), sea = c.has('fish') || c.has('shellfish');
  switch (q.diet) {
    case 'vegan': if (meat || sea || c.has('dairy') || c.has('egg') || c.has('honey')) return false; break;
    case 'vegetarian': if (meat || sea) return false; break;
    case 'pescatarian': if (meat) return false; break;
    case 'mediterranean': if (c.has('beef') || c.has('pork')) return false; break;
  }
  if (q.religious !== 'none' && c.has('pork')) return false;
  if (q.religious === 'kosher' && (c.has('shellfish') || (meat && c.has('dairy')))) return false;
  return true;
}
export const recipeFits = (r: PlanRecipe, q: WLQuiz) => fits(r.contains, q) && (!q.cookTime || r.minutes <= q.cookTime);

// ---------- slots ----------
export const SLOT_PLAN: Record<number, [Slot, number][]> = {
  2: [['lunch', 0.45], ['dinner', 0.55]],
  3: [['breakfast', 0.3], ['lunch', 0.35], ['dinner', 0.35]],
  4: [['breakfast', 0.25], ['lunch', 0.3], ['dinner', 0.3], ['snack', 0.15]],
  5: [['breakfast', 0.22], ['snack', 0.1], ['lunch', 0.28], ['snack', 0.1], ['dinner', 0.3]],
};
const DEFAULT_TIMES: Record<number, string[]> = { 2: ['12:30', '18:30'], 3: ['08:00', '12:30', '18:30'], 4: ['08:00', '12:30', '18:30', '15:30'], 5: ['08:00', '10:30', '12:30', '15:30', '18:30'] };
const hm = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(Math.round(min % 60)).padStart(2, '0')}`;
const toMin = (s: string) => { const [h, m] = s.split(':').map(Number); return (h || 0) * 60 + (m || 0); };
/** Meal times: defaults, or spread evenly inside the eating window (last meal 30 min before it closes). */
export function mealTimes(q: Pick<WLQuiz, 'meals' | 'window'>): string[] {
  if (!q.window) return DEFAULT_TIMES[q.meals];
  const n = q.meals, s = toMin(q.window.start), span = q.window.hours * 60 - 30;
  return Array.from({ length: n }, (_, i) => hm(s + (span * i) / (n - 1)));
}
export const windowEnd = (w: NonNullable<WLQuiz['window']>) => hm(toMin(w.start) + w.hours * 60);

// ---------- plan ----------
export interface PlanSideUse { id: string; n: number }
export interface PlanMeal { slot: Slot; time: string; share: number; recipeId: string; factor: number; sides: PlanSideUse[] }
export interface PlanDay { weekday: number; kind: 'train' | 'rest'; meals: PlanMeal[]; target: DayMacro; totals: Macro; ok: boolean }

const FACTORS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3];
const clampF = (f: number) => Math.max(0.5, Math.min(3, Math.round(f * 4) / 4));
const MAX_SIDES = 3;
export const KCAL_TOL = 0.05;
export const PROTEIN_TOL_LOW = 0.1;
export const PROTEIN_TOL_HIGH = 0.3;

function rng(seed: number) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

export function mealMacro(cat: Catalog, m: Pick<PlanMeal, 'recipeId' | 'factor' | 'sides'>): Macro {
  const r = cat.recipes.find((x) => x.id === m.recipeId);
  const out: Macro = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
  if (r) for (const k of Object.keys(out) as (keyof Macro)[]) out[k] += (r.per[k] || 0) * m.factor;
  for (const s of m.sides) { const sd = cat.sides.find((x) => x.id === s.id); if (sd) for (const k of Object.keys(out) as (keyof Macro)[]) out[k] += (sd.per[k] || 0) * s.n; }
  return out;
}
export function dayMacro(cat: Catalog, meals: Pick<PlanMeal, 'recipeId' | 'factor' | 'sides'>[]): Macro {
  const out: Macro = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
  for (const m of meals) { const x = mealMacro(cat, m); for (const k of Object.keys(out) as (keyof Macro)[]) out[k] += x[k]; }
  return out;
}
export function withinTolerance(t: DayMacro, x: Macro) {
  const ek = (x.kcal - t.kcal) / t.kcal, ep = (x.protein - t.protein) / t.protein;
  return Math.abs(ek) <= KCAL_TOL && ep >= -PROTEIN_TOL_LOW && ep <= PROTEIN_TOL_HIGH;
}

interface SolveState { factors: number[]; sides: PlanSideUse[][] }
function cost(cat: Catalog, t: DayMacro, recipes: PlanRecipe[], shares: number[], st: SolveState) {
  const meals = recipes.map((r, i) => ({ recipeId: r.id, factor: st.factors[i], sides: st.sides[i] }));
  const per = meals.map((m) => mealMacro(cat, m));
  const x = per.reduce((a, b) => ({ kcal: a.kcal + b.kcal, protein: a.protein + b.protein, carbs: a.carbs + b.carbs, fat: a.fat + b.fat, fiber: 0 }), { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });
  const ek = (x.kcal - t.kcal) / t.kcal, ep = (x.protein - t.protein) / t.protein, ec = (x.carbs - t.carbs) / Math.max(30, t.carbs), ef = (x.fat - t.fat) / Math.max(20, t.fat);
  let c = 14 * ek * ek + (ep < 0 ? 16 : 1.2) * ep * ep + 1.2 * ec * ec + 1.2 * ef * ef;
  if (Math.abs(ek) > KCAL_TOL) c += 2 * (Math.abs(ek) - KCAL_TOL);
  if (ep < -PROTEIN_TOL_LOW) c += 4 * (-PROTEIN_TOL_LOW - ep);
  if (ep > PROTEIN_TOL_HIGH) c += 1 * (ep - PROTEIN_TOL_HIGH);
  per.forEach((m, i) => { const sh = m.kcal / Math.max(1, x.kcal); c += 0.8 * (sh - shares[i]) ** 2; });
  const nSides = st.sides.reduce((a, s) => a + s.length, 0);
  c += 0.004 * nSides + 0.002 * st.factors.reduce((a, f) => a + Math.abs(f - 1), 0);
  return c;
}
/** Portion solver: scales each recipe (0.5–3 servings in ¼ steps) and adds up to 3 simple sides to hit the day's targets. */
export function solveDay(cat: Catalog, t: DayMacro, recipes: PlanRecipe[], shares: number[], sidePool: PlanSide[]): SolveState & { cost: number } {
  let st: SolveState = { factors: recipes.map((r, i) => clampF((shares[i] * t.kcal) / Math.max(50, r.per.kcal))), sides: recipes.map(() => []) };
  let best = cost(cat, t, recipes, shares, st);
  for (let iter = 0; iter < 80; iter++) {
    let move: SolveState | null = null, mc = best;
    const tryState = (s: SolveState) => { const c = cost(cat, t, recipes, shares, s); if (c < mc - 1e-9) { mc = c; move = s; } };
    for (let i = 0; i < recipes.length; i++) for (const d of [-0.25, 0.25]) {
      const f = st.factors[i] + d; if (f < FACTORS[0] || f > FACTORS[FACTORS.length - 1]) continue;
      tryState({ factors: st.factors.map((x, j) => (j === i ? f : x)), sides: st.sides });
    }
    const used = new Set(st.sides.flat().map((s) => s.id));
    for (let i = 0; i < recipes.length; i++) {
      for (let k = 0; k < st.sides[i].length; k++) for (const d of [-0.5, 0.5]) {
        const n = st.sides[i][k].n + d; if (n > 2) continue;
        const ns = st.sides.map((arr, j) => (j !== i ? arr : n <= 0 ? arr.filter((_, z) => z !== k) : arr.map((x, z) => (z === k ? { ...x, n } : x))));
        tryState({ factors: st.factors, sides: ns });
      }
      if (used.size < MAX_SIDES) for (const sd of sidePool) {
        if (used.has(sd.id)) continue;
        for (const n of [0.5, 1]) {
          const ns = st.sides.map((arr, j) => (j === i ? [...arr, { id: sd.id, n }] : arr));
          tryState({ factors: st.factors, sides: ns });
          // compound move: add a side and trim one meal, so protein can rise without overshooting calories
          for (let k = 0; k < recipes.length; k++) if (st.factors[k] - 0.25 >= FACTORS[0]) tryState({ factors: st.factors.map((x, z) => (z === k ? x - 0.25 : x)), sides: ns });
        }
      }
    }
    if (!move) break;
    st = move; best = mc;
  }
  return { ...st, cost: best };
}

function pools(cat: Catalog, q: WLQuiz, seed: number) {
  const rand = rng(seed);
  const out: Record<Slot, PlanRecipe[]> = { breakfast: [], lunch: [], dinner: [], snack: [] };
  for (const slot of Object.keys(out) as Slot[]) {
    let list = cat.recipes.filter((r) => r.slots.includes(slot) && fits(r.contains, q));
    const timed = list.filter((r) => !q.cookTime || r.minutes <= q.cookTime);
    if (timed.length >= 3) list = timed;
    if (q.diet === 'lowcarb' && slot !== 'snack') { const lc = list.filter((r) => r.lowcarb); if (lc.length >= 3) list = lc; }
    const score = (r: PlanRecipe) => (q.budget && r.budget ? 2 : 0) + (q.diet === 'mediterranean' && r.med ? 2 : 0) + (q.diet === 'lowcarb' && r.lowcarb ? 2 : 0) + (r.id.startsWith('wl-') ? 0.5 : 0) + rand() * 1.5;
    out[slot] = list.map((r) => ({ r, s: score(r) })).sort((a, b) => b.s - a.s).map((x) => x.r);
  }
  return out;
}
export function sidePoolFor(cat: Catalog, q: WLQuiz) { return cat.sides.filter((s) => fits(s.contains, q)); }
export function dayTarget(t: WLTargets, kind: 'train' | 'rest'): DayMacro { return kind === 'train' ? t.train : t.rest; }

/** Builds a 7-day plan (Monday-first templates). Recipes rotate so the same dish isn't served in the same slot two days running. */
export function buildWeek(cat: Catalog, q: WLQuiz, t: WLTargets, seed: number, trainDays: number[]): PlanDay[] {
  const plan = SLOT_PLAN[q.meals];
  const times = mealTimes(q);
  const P = pools(cat, q, seed);
  const sidePool = sidePoolFor(cat, q);
  const days: PlanDay[] = [];
  const prevBySlot: string[] = [];
  const cursor: Record<Slot, number> = { breakfast: 0, lunch: 0, dinner: 0, snack: 0 };
  for (let d = 0; d < 7; d++) {
    const kind: 'train' | 'rest' = trainDays.includes(d) ? 'train' : 'rest';
    const target = dayTarget(t, kind);
    let bestDay: PlanDay | null = null, bestCost = Infinity;
    for (let attempt = 0; attempt < 8; attempt++) {
      const usedToday = new Set<string>();
      const picks: PlanRecipe[] = [];
      let missing = false;
      plan.forEach(([slot], i) => {
        const pool = P[slot];
        if (!pool.length) { missing = true; return; }
        let pick: PlanRecipe | undefined;
        for (let k = 0; k < pool.length; k++) {
          const r = pool[(cursor[slot] + attempt + k) % pool.length];
          if (usedToday.has(r.id) && pool.length > 1) continue;
          if (prevBySlot[i] === r.id && pool.length > 2) continue;
          pick = r; break;
        }
        pick = pick || pool[0];
        usedToday.add(pick.id); picks.push(pick);
      });
      if (missing) break;
      const shares = plan.map(([, s]) => s);
      const sol = solveDay(cat, target, picks, shares, sidePool);
      const meals: PlanMeal[] = picks.map((r, i) => ({ slot: plan[i][0], time: times[i], share: shares[i], recipeId: r.id, factor: sol.factors[i], sides: sol.sides[i] }));
      const totals = dayMacro(cat, meals);
      const ok = withinTolerance(target, totals);
      const c = sol.cost + (ok ? 0 : 10);
      if (c < bestCost) { bestCost = c; bestDay = { weekday: d, kind, meals, target, totals: roundMacro(totals), ok }; }
      if (ok) break;
    }
    if (!bestDay) bestDay = { weekday: d, kind, meals: [], target, totals: { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }, ok: false };
    bestDay.meals.forEach((m, i) => { prevBySlot[i] = m.recipeId; });
    for (const [slot] of plan) cursor[slot] = (cursor[slot] + 1) % Math.max(1, P[slot].length);
    days.push(bestDay);
  }
  return days;
}
const roundMacro = (m: Macro): Macro => ({ kcal: Math.round(m.kcal), protein: Math.round(m.protein), carbs: Math.round(m.carbs), fat: Math.round(m.fat), fiber: Math.round(m.fiber) });

/** Re-solve one day's portions (after a swap or a target change), keeping its recipes. */
export function resolveDay(cat: Catalog, q: WLQuiz, t: WLTargets, day: PlanDay, kind: 'train' | 'rest' = day.kind): PlanDay {
  const target = dayTarget(t, kind);
  const recipes = day.meals.map((m) => cat.recipes.find((r) => r.id === m.recipeId)!).filter(Boolean);
  if (recipes.length !== day.meals.length) return day;
  const shares = day.meals.map((m) => m.share);
  const sol = solveDay(cat, target, recipes, shares, sidePoolFor(cat, q));
  const meals = day.meals.map((m, i) => ({ ...m, factor: sol.factors[i], sides: sol.sides[i] }));
  const totals = dayMacro(cat, meals);
  return { ...day, kind, meals, target, totals: roundMacro(totals), ok: withinTolerance(target, totals) };
}
export function swapOptions(cat: Catalog, q: WLQuiz, slot: Slot, current: string): PlanRecipe[] {
  const all = cat.recipes.filter((r) => r.slots.includes(slot) && fits(r.contains, q) && r.id !== current);
  const timed = all.filter((r) => !q.cookTime || r.minutes <= q.cookTime);
  return (timed.length ? timed : all).sort((a, b) => a.per.kcal / Math.max(1, a.per.protein) - b.per.kcal / Math.max(1, b.per.protein));
}
export function swapMeal(cat: Catalog, q: WLQuiz, t: WLTargets, day: PlanDay, mealIdx: number, recipeId: string): PlanDay {
  const next = { ...day, meals: day.meals.map((m, i) => (i === mealIdx ? { ...m, recipeId, factor: 1, sides: [] } : m)) };
  return resolveDay(cat, q, t, next);
}
/** Re-solve every day for new targets (after an adjustment, a diet break or a training-day change). */
export function retarget(cat: Catalog, q: WLQuiz, t: WLTargets, week: PlanDay[], trainDays: number[]): PlanDay[] {
  return week.map((d) => resolveDay(cat, q, t, d, trainDays.includes(d.weekday) ? 'train' : 'rest'));
}
/** Every plan meal must respect the exclusions and diet (used by tests and as a guard before saving). */
export function planViolations(cat: Catalog, q: WLQuiz, week: PlanDay[]): string[] {
  const bad: string[] = [];
  for (const d of week) for (const m of d.meals) {
    const r = cat.recipes.find((x) => x.id === m.recipeId);
    if (!r || !fits(r.contains, q)) bad.push(`${WEEKDAYS[d.weekday]} ${m.slot}: ${m.recipeId}`);
    for (const s of m.sides) { const sd = cat.sides.find((x) => x.id === s.id); if (!sd || !fits(sd.contains, q)) bad.push(`${WEEKDAYS[d.weekday]} ${m.slot} side: ${s.id}`); }
  }
  return bad;
}

// ---------- grocery list ----------
export interface GroceryItem { key: string; name: string; grams: number; pieces?: number; aisle: string }
export function groceryList(cat: Catalog, week: PlanDay[], days?: number[]): { aisle: string; items: GroceryItem[] }[] {
  const map = new Map<string, GroceryItem>();
  const add = (fdcId: number, grams: number) => {
    if (fdcId === 173647) return; // tap water
    const name = cat.names[String(fdcId)] || String(fdcId);
    const key = name;
    const cur = map.get(key) || { key, name, grams: 0, aisle: cat.aisles[String(fdcId)] || 'Other' };
    cur.grams += grams;
    const pg = cat.pieces[String(fdcId)];
    if (pg) cur.pieces = Math.ceil(cur.grams / pg - 0.15);
    map.set(key, cur);
  };
  for (const d of week) {
    if (days && !days.includes(d.weekday)) continue;
    for (const m of d.meals) {
      const r = cat.recipes.find((x) => x.id === m.recipeId);
      if (r) for (const ing of r.ingredients) add(ing.fdcId, (ing.grams / r.serves) * m.factor);
      for (const s of m.sides) { const sd = cat.sides.find((x) => x.id === s.id); if (sd) add(sd.fdcId, sd.grams * s.n); }
    }
  }
  const ORDER = ['Produce', 'Meat & fish', 'Dairy & eggs', 'Plant protein', 'Grains & bread', 'Cans & jars', 'Frozen', 'Nuts, seeds & pantry', 'Other'];
  const groups = new Map<string, GroceryItem[]>();
  for (const it of map.values()) { it.grams = Math.round(it.grams); (groups.get(it.aisle) || groups.set(it.aisle, []).get(it.aisle)!).push(it); }
  return ORDER.filter((a) => groups.has(a)).map((a) => ({ aisle: a, items: groups.get(a)!.sort((x, y) => x.name.localeCompare(y.name)) }));
}

// ---------- weigh-ins ----------
export interface WeighIn { date: string; weightKg: number }
export interface TrendPoint { date: string; kg: number; avg: number }
const dayNum = (key: string) => Math.round(new Date(key + 'T12:00:00').getTime() / 86400000);
/** Trend = average of the weigh-ins in the 7 days ending on each date (one weigh-in a week → the trend is that weigh-in). */
export function weightTrend(logs: WeighIn[]): TrendPoint[] {
  const byDay = new Map<string, number[]>();
  for (const l of logs) if (l.weightKg > 0) (byDay.get(l.date) || byDay.set(l.date, []).get(l.date)!).push(l.weightKg);
  const days = [...byDay.keys()].sort();
  const daily = days.map((d) => ({ date: d, kg: byDay.get(d)!.reduce((a, b) => a + b, 0) / byDay.get(d)!.length }));
  return daily.map((p) => {
    const n = dayNum(p.date);
    const win = daily.filter((x) => { const m = dayNum(x.date); return m <= n && m > n - 7; });
    return { date: p.date, kg: Math.round(p.kg * 100) / 100, avg: Math.round((win.reduce((a, x) => a + x.kg, 0) / win.length) * 100) / 100 };
  });
}
/** Least-squares slope of the trend, kg per week, over the last `days` days (needs ≥ 3 weigh-ins spanning ≥ 10 days). */
export function trendRate(points: TrendPoint[], asOf: string, days = 21): number | null {
  const end = dayNum(asOf);
  const pts = points.filter((p) => { const n = dayNum(p.date); return n <= end && n > end - days; });
  if (pts.length < 3) return null;
  const xs = pts.map((p) => dayNum(p.date)), ys = pts.map((p) => p.avg);
  if (xs[xs.length - 1] - xs[0] < 10) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0, den = 0;
  for (let i = 0; i < xs.length; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  return den ? Math.round((num / den) * 7 * 100) / 100 : null;
}

// ---------- plan record ----------
export interface WLPlan extends Rec {
  startDate: string; quiz: WLQuiz; energy: EnergyInput; seed: number; trainDays: number[];
  adjustKcal: number; adjustments: { date: string; kcal: number; reason: string }[];
  breakFrom?: string; breakUntil?: string; breaks: { from: string; to: string }[];
  targets: WLTargets; week: PlanDay[]; checked: string[]; applyToFuel: boolean;
  logged: Record<string, string[]>; // date → logged meal keys ("<slot>-<index>")
}
export const onBreak = (p: Pick<WLPlan, 'breakFrom' | 'breakUntil'>, key: string) => !!p.breakUntil && !!p.breakFrom && key >= p.breakFrom && key <= p.breakUntil;
export function planTargetsFor(p: WLPlan, key: string): DayMacro & { kind: 'train' | 'rest'; onBreak: boolean } {
  const kind = p.trainDays.includes(weekdayOf(key)) ? 'train' : 'rest';
  if (onBreak(p, key)) return { ...p.targets.maintenance, kind, onBreak: true };
  return { ...dayTarget(p.targets, kind), kind, onBreak: false };
}
export function activePlan<T extends { deleted?: boolean; updatedAt: number }>(plans: T[]): T | null {
  return plans.filter((x) => !x.deleted).sort((a, b) => b.updatedAt - a.updatedAt)[0] || null;
}

// ---------- adaptive suggestions ----------
export type SuggestKind = 'early' | 'on-track' | 'stall' | 'fast' | 'goal' | 'break' | 'on-break';
export type SuggestAction = 'minus100' | 'plus150' | 'break7' | 'break14' | 'maintain';
export interface Suggestion { kind: SuggestKind; title: string; body: string; actions: SuggestAction[]; rate: number | null }
const daysBetween = (a: string, b: string) => dayNum(b) - dayNum(a);
/**
 * Never changes anything by itself — it only suggests. Stall = the trend over the last 2–3 weeks shows less than a quarter
 * of the planned loss, at least 3 weeks after the start or the last change: suggest −100 kcal (only if it stays above the floor
 * and within 1%/week) or a 1–2-week diet break at maintenance. Losing faster than 1% of body weight a week for 2+ weeks:
 * suggest +150 kcal.
 */
export function suggest(p: WLPlan, logs: WeighIn[], today: string): Suggestion {
  if (onBreak(p, today)) return { kind: 'on-break', title: 'Diet break in progress', body: `You’re eating at maintenance until ${p.breakUntil}. Weight often goes up a little from extra food and water in the gut and muscle — that’s expected. The plan picks up again after.`, actions: [], rate: null };
  const since = [p.startDate, ...p.adjustments.map((a) => a.date), ...(p.breakUntil ? [p.breakUntil] : [])].sort().pop()!;
  const pts = weightTrend(logs.filter((l) => l.date >= p.startDate && l.date <= today));
  const rate = trendRate(pts, today);
  const last = pts[pts.length - 1];
  const goal = p.targets.goalWeightKg;
  if (goal != null && last && last.avg <= goal) return { kind: 'goal', title: 'You’ve reached your goal', body: 'Your trend is at your goal weight. A good next step is to move to maintenance calories and keep the habits that got you here.', actions: ['maintain'], rate };
  if (rate == null || pts.length < 3) return { kind: 'early', title: 'Keep logging weigh-ins', body: 'Weigh in at least once a week — same scale, morning, after the bathroom. Suggestions appear after about 2 weeks of weigh-ins; daily weight swings of 1–2 lb (0.5–1 kg) from water and food are normal.', actions: [], rate };
  const w = last.avg;
  const planned = p.targets.weeklyLossKg;
  const weeksIn = daysBetween(since, today) / 7;
  const totalWeeks = daysBetween(p.startDate, today) / 7;
  if (-rate > w * MAX_RATE_PCT / 100 && weeksIn >= 2) return { kind: 'fast', title: 'You’re losing faster than planned', body: `Your trend is about ${Math.abs(rate).toFixed(2)} kg a week — more than 1% of your weight. Losing that fast makes it harder to keep muscle and energy for training. Consider eating about 150 kcal more a day.`, actions: ['plus150'], rate };
  if (planned > 0 && weeksIn >= 3 && -rate < planned * 0.25) {
    const canCut = p.targets.kcal - 100 >= p.targets.floor && (p.targets.deficit + 100) * 7 / KCAL_PER_KG <= w * MAX_RATE_PCT / 100;
    return { kind: 'stall', title: 'Your trend has flattened', body: `Over the last few weeks your trend changed about ${rate > 0 ? '+' : ''}${rate.toFixed(2)} kg a week, against roughly −${planned.toFixed(2)} planned. This is common: your body burns a bit less as you get lighter, and logging drifts. Pick one small change${canCut ? ' — eat about 100 kcal less a day, add ~2,000 steps a day,' : ' — you’re already near the minimum intake, so add ~2,000 steps a day'} or take a 1–2 week diet break at maintenance, then reassess in 2–3 weeks.`, actions: canCut ? ['minus100', 'break7', 'break14'] : ['break7', 'break14'], rate };
  }
  if (totalWeeks >= 12 && !p.breaks.length) return { kind: 'break', title: 'Optional: plan a diet break', body: 'You’ve been in a deficit for 12+ weeks. Some studies found 1–2 weeks at maintenance between dieting blocks helped with hunger and adherence (MATADOR, ICECAP). It’s optional.', actions: ['break7', 'break14'], rate };
  return { kind: 'on-track', title: 'On track', body: `Your trend is about ${rate > 0 ? '+' : ''}${rate.toFixed(2)} kg a week (planned ≈ −${planned.toFixed(2)}). Keep going.`, actions: [], rate };
}
