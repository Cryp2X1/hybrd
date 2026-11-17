// Fuel › Sleep — pure logic (no React, no JSON imports) so tools/test-sleep.ts can run it in plain Node.
// Safety screen + supplement gates, caffeine half-life model + cutoff, personal evening timeline, sleep & caffeine log stats.
// Every number here maps to a source id in src/data/sources.ts (sleep-*); see APP-BUILDER-NOTES.md › "Sleep nutrition".
import type { Rec } from './types';
import { toMin, toHM, fwd } from './fasting';
import { addDays } from './calc';

export { toMin, toHM, fwd };
export const H = 3_600_000;

// ---------------- evidence grades ----------------
export type Grade = 'strong' | 'moderate' | 'limited' | 'weak';
export const GRADES: Grade[] = ['strong', 'moderate', 'limited', 'weak'];
export const GRADE_LABEL: Record<Grade, string> = { strong: 'Strong evidence', moderate: 'Moderate evidence', limited: 'Limited evidence', weak: 'Weak / mixed evidence' };
export const GRADE_HINT: Record<Grade, string> = {
  strong: 'Several good trials or meta-analyses agree, or a major guideline recommends it.',
  moderate: 'Some good trials or a consensus statement, but gaps remain.',
  limited: 'Small or short trials, or mostly observational links. Might help; not proven.',
  weak: 'Inconsistent results, very small studies, or no direct trial.',
};

// ---------------- quiz, plan & screen ----------------
export type SleepGoal = 'onset' | 'deeper' | 'recover' | 'race' | 'shift';
export const GOALS: { v: SleepGoal; label: string; hint: string }[] = [
  { v: 'onset', label: 'Fall asleep faster', hint: 'Lying awake at the start of the night' },
  { v: 'deeper', label: 'Sleep deeper', hint: 'Fewer wake-ups, feel more rested' },
  { v: 'recover', label: 'Recover after training', hint: 'Evening sessions, muscle repair' },
  { v: 'race', label: 'Race or travel night', hint: 'The night before a race or a trip' },
  { v: 'shift', label: 'Shift work', hint: 'Sleeping in the day after night shifts' },
];
export type Train = 'none' | 'morning' | 'midday' | 'evening' | 'varies';
export type Diet = 'any' | 'vegetarian' | 'vegan' | 'dairy-free';
export type Sensitivity = 'fast' | 'typical' | 'slow' | 'unknown';
export type DrinkId = 'coffee' | 'espresso' | 'double-espresso' | 'black-tea' | 'green-tea' | 'cola' | 'energy' | 'preworkout' | 'dark-choc' | 'decaf' | 'none';

export interface SleepQuiz {
  age: number; sex: 'male' | 'female';
  pregnant: boolean; breastfeeding: boolean;
  sedatives: boolean; antidepressants: boolean; bloodThinners: boolean; bpMeds: boolean; otherMeds: boolean;
  sleepDisorder: boolean; insomnia3mo: boolean;
  kidney: boolean; gerd: boolean; liver: boolean; epilepsy: boolean; thyroid: boolean;
  smoker: boolean; oralContraceptive: boolean;
  bed: string; wake: string;
  train: Train; trainClock: string; sessionMin: number; hard: boolean;
  drink: DrinkId; cupsPerDay: number; lastCaffeine: string; preWorkout: boolean;
  sensitivity: Sensitivity;
  goal: SleepGoal;
  diet: Diet;
  alcohol: 'none' | 'some' | 'often';
  wakesToPee: boolean;
  timeZones: boolean; // race/travel: flying across 5+ time zones
  tested: boolean; // competes in a drug-tested sport
  supplements: boolean; // wants to see supplement options at all
}
export type ScreenLevel = 'ok' | 'caution' | 'minor';
export interface SleepPlan { quiz: SleepQuiz; createdAt: string; level: ScreenLevel; ack?: boolean }

export type Reason = 'under18' | 'pregnant' | 'breastfeeding' | 'sedatives' | 'antidepressants' | 'bloodThinners' | 'bpMeds' | 'otherMeds' | 'sleepDisorder' | 'insomnia' | 'kidney' | 'gerd' | 'liver' | 'epilepsy' | 'thyroid';
export const REASON_TEXT: Record<Reason, string> = {
  under18: 'You’re under 18. HYBRD gives food, drink and caffeine guidance only — no supplements. Teens need 8–10 hours of sleep, and experts advise against energy drinks for children and teens.',
  pregnant: 'You’re pregnant or trying to conceive. Supplement safety (melatonin, herbal products) hasn’t been studied well in pregnancy, and ashwagandha should be avoided. Caffeine: up to 200 mg a day (EFSA), and it clears more slowly in pregnancy.',
  breastfeeding: 'You’re breastfeeding. Ashwagandha shouldn’t be used, and there’s little safety data for melatonin and other sleep supplements. Ask your doctor or midwife before taking any.',
  sedatives: 'You take a sedative or sleep medicine. Valerian shouldn’t be combined with sedatives, and melatonin, ashwagandha and chamomile may add to the effect — talk to your doctor before adding anything.',
  antidepressants: 'You take an antidepressant or other mental-health medicine. Some supplements can interact — check with your doctor or pharmacist first.',
  bloodThinners: 'You take a blood thinner. People on blood thinners need medical supervision for melatonin, and chamomile has reported interactions with warfarin.',
  bpMeds: 'You take blood-pressure medicine. Ashwagandha may interact with it — talk to your doctor before trying supplements.',
  otherMeds: 'You take regular medicine. As NIH advises for all supplements, check with your doctor or pharmacist first.',
  sleepDisorder: 'You have a diagnosed sleep disorder (e.g. sleep apnoea, restless legs). Follow your sleep clinician’s plan; alcohol in particular is linked to a higher risk of sleep apnoea.',
  insomnia: 'Trouble sleeping on most nights for over 3 months can be chronic insomnia. Please see a clinician: CBT for insomnia (CBT-I) is the first-line treatment, and sleep guidelines suggest against melatonin and valerian for chronic insomnia.',
  kidney: 'You have kidney disease. Your kidneys clear magnesium, so magnesium supplements can build up — avoid them unless your doctor prescribes them, and follow your clinician’s fluid advice.',
  gerd: 'You have reflux (GERD). HYBRD moves your last big meal earlier (≥ 3–4 h before bed) and keeps bedtime snacks light. Check with your doctor or pharmacist before adding supplements alongside reflux treatment.',
  liver: 'You have liver disease. Rare liver injury has been reported with ashwagandha and valerian — avoid them, and ask your doctor before any supplement.',
  epilepsy: 'You have epilepsy. People with epilepsy need medical supervision for melatonin.',
  thyroid: 'You have a thyroid or autoimmune condition. Ashwagandha isn’t recommended for you.',
};
export const REASON_SRC: Partial<Record<Reason, string[]>> = {
  under18: ['sleep-nsf', 'sleep-fda-caffeine', 'sleep-efsa-caffeine', 'sleep-nccih-melatonin'],
  pregnant: ['sleep-nccih-melatonin', 'sleep-nccih-ashwa', 'sleep-efsa-caffeine', 'sleep-nehlig'],
  breastfeeding: ['sleep-nccih-ashwa', 'sleep-nccih-melatonin'],
  sedatives: ['sleep-nccih-valerian', 'sleep-nccih-ashwa', 'sleep-nccih-chamomile'],
  antidepressants: ['sleep-nccih-ashwa', 'sleep-nccih-melatonin'],
  bloodThinners: ['sleep-nccih-melatonin', 'sleep-herxheimer', 'sleep-nccih-chamomile'],
  bpMeds: ['sleep-nccih-ashwa'],
  otherMeds: ['sleep-nccih-melatonin'],
  sleepDisorder: ['sleep-simou', 'sleep-aasm-pharm'],
  insomnia: ['sleep-aasm-cbti', 'sleep-acp', 'sleep-aasm-pharm'],
  kidney: ['sleep-ods-mg', 'sleep-medline-nocturia'],
  gerd: ['sleep-acg-gerd', 'sleep-fujiwara'],
  liver: ['sleep-nccih-ashwa', 'sleep-nccih-valerian'],
  epilepsy: ['sleep-nccih-melatonin', 'sleep-herxheimer'],
  thyroid: ['sleep-nccih-ashwa'],
};

export interface Screen { level: ScreenLevel; reasons: Reason[]; clinician: boolean }
/** minor = under 18 (food + caffeine only); caution = any medical flag (must tick "I'll talk to my doctor"; supplements gated). */
export function screen(q: SleepQuiz): Screen {
  const r: Reason[] = [];
  if (q.age > 0 && q.age < 18) r.push('under18');
  if (q.sex === 'female' && q.pregnant) r.push('pregnant');
  if (q.sex === 'female' && q.breastfeeding) r.push('breastfeeding');
  if (q.insomnia3mo) r.push('insomnia');
  if (q.sleepDisorder) r.push('sleepDisorder');
  if (q.sedatives) r.push('sedatives');
  if (q.antidepressants) r.push('antidepressants');
  if (q.bloodThinners) r.push('bloodThinners');
  if (q.bpMeds) r.push('bpMeds');
  if (q.otherMeds) r.push('otherMeds');
  if (q.kidney) r.push('kidney');
  if (q.liver) r.push('liver');
  if (q.epilepsy) r.push('epilepsy');
  if (q.thyroid) r.push('thyroid');
  if (q.gerd) r.push('gerd');
  const level: ScreenLevel = r.includes('under18') ? 'minor' : r.length ? 'caution' : 'ok';
  return { level, reasons: r, clinician: q.insomnia3mo || q.sleepDisorder };
}

// ---------------- supplements ----------------
export type SuppId = 'melatonin' | 'magnesium' | 'glycine' | 'theanine' | 'ashwagandha' | 'valerian';
export const SUPP_IDS: SuppId[] = ['melatonin', 'magnesium', 'glycine', 'theanine', 'ashwagandha', 'valerian'];
export type SuppStatus = 'ok' | 'doctor' | 'avoid';
/** Per-supplement gate. 'ok' = may be shown as an option; 'doctor' = only with a "talk to your doctor" note, never suggested; 'avoid' = HYBRD says don't. */
export function suppStatus(id: SuppId, q: SleepQuiz): { status: SuppStatus; why: Reason[] } {
  const avoid: Reason[] = [], doctor: Reason[] = [];
  const add = (cond: boolean, list: Reason[], r: Reason) => { if (cond && !list.includes(r)) list.push(r); };
  add(q.age > 0 && q.age < 18, avoid, 'under18');
  const preg = q.sex === 'female' && q.pregnant, bf = q.sex === 'female' && q.breastfeeding;
  if (id === 'ashwagandha') { add(preg, avoid, 'pregnant'); add(bf, avoid, 'breastfeeding'); add(q.liver, avoid, 'liver'); add(q.thyroid, avoid, 'thyroid'); }
  if (id === 'valerian') { add(q.sedatives, avoid, 'sedatives'); add(q.liver, avoid, 'liver'); }
  if (id === 'magnesium') add(q.kidney, avoid, 'kidney');
  add(preg, doctor, 'pregnant'); add(bf, doctor, 'breastfeeding');
  add(q.insomnia3mo, doctor, 'insomnia'); add(q.sleepDisorder, doctor, 'sleepDisorder');
  add(q.sedatives, doctor, 'sedatives'); add(q.antidepressants, doctor, 'antidepressants'); add(q.bloodThinners, doctor, 'bloodThinners');
  add(q.bpMeds, doctor, 'bpMeds'); add(q.otherMeds, doctor, 'otherMeds');
  add(q.kidney, doctor, 'kidney'); add(q.gerd, doctor, 'gerd'); add(q.liver, doctor, 'liver');
  if (id === 'melatonin') add(q.epilepsy, doctor, 'epilepsy');
  if (id === 'ashwagandha') add(q.thyroid, doctor, 'thyroid');
  if (avoid.length) return { status: 'avoid', why: avoid };
  if (doctor.length) return { status: 'doctor', why: doctor };
  return { status: 'ok', why: [] };
}
/** Supplement options HYBRD may show on the plan (food first; never auto-recommended). Only 'ok' ones, only if the person asked to see them. */
export function suppSuggestions(q: SleepQuiz): { id: SuppId; why: string }[] {
  if (!q.supplements) return [];
  const out: { id: SuppId; why: string }[] = [];
  const ok = (id: SuppId) => suppStatus(id, q).status === 'ok';
  if (q.goal === 'race' && q.timeZones && ok('melatonin')) out.push({ id: 'melatonin', why: 'Flying across 5+ time zones: a Cochrane review found 0.5–5 mg at local bedtime reduces jet lag. Timing matters — taken at the wrong time it can make it worse.' });
  if ((q.goal === 'onset' || q.goal === 'deeper') && ok('magnesium')) out.push({ id: 'magnesium', why: 'Small trials in older adults suggest a modest effect on falling asleep (low-quality evidence). Food sources first; stay under 350 mg a day from supplements.' });
  if ((q.goal === 'onset' || q.goal === 'deeper') && ok('glycine')) out.push({ id: 'glycine', why: '3 g before bed has small trials for sleep quality and next-day fatigue.' });
  if (q.goal === 'onset' && ok('theanine')) out.push({ id: 'theanine', why: 'A 2025 meta-analysis found small improvements in subjective sleep onset and quality (often 200 mg).' });
  return out;
}

// ---------------- caffeine ----------------
/** Typical caffeine per serving from USDA FoodData Central (SR Legacy, mg/100 g × serving grams), except the pre-workout serve (Gardiner 2023) and decaf range (FDA). */
export const DRINKS: { id: Exclude<DrinkId, 'none'>; label: string; serving: string; mg: number; src: string[] }[] = [
  { id: 'coffee', label: 'Brewed coffee', serving: '8 fl oz · 240 mL', mg: 95, src: ['sleep-usda-fdc'] },
  { id: 'espresso', label: 'Espresso, single', serving: '1 fl oz · 30 mL', mg: 64, src: ['sleep-usda-fdc'] },
  { id: 'double-espresso', label: 'Espresso, double', serving: '2 fl oz · 60 mL', mg: 127, src: ['sleep-usda-fdc'] },
  { id: 'black-tea', label: 'Black tea', serving: '8 fl oz · 240 mL', mg: 47, src: ['sleep-usda-fdc'] },
  { id: 'green-tea', label: 'Green tea', serving: '8 fl oz · 240 mL', mg: 28, src: ['sleep-usda-fdc'] },
  { id: 'cola', label: 'Cola', serving: '12 fl oz can · 355 mL', mg: 33, src: ['sleep-usda-fdc'] },
  { id: 'energy', label: 'Energy drink', serving: '8.4 fl oz can · 250 mL', mg: 75, src: ['sleep-usda-fdc'] },
  { id: 'preworkout', label: 'Pre-workout', serving: '1 typical serve (check your label)', mg: 218, src: ['sleep-gardiner-caffeine'] },
  { id: 'dark-choc', label: 'Dark chocolate 70–85%', serving: '1 oz · 28 g', mg: 22, src: ['sleep-usda-fdc'] },
  { id: 'decaf', label: 'Decaf coffee', serving: '8 fl oz · 240 mL (FDA: 2–15 mg)', mg: 2, src: ['sleep-usda-fdc', 'sleep-fda-caffeine'] },
];
export const drinkById = (id: string) => DRINKS.find((d) => d.id === id);
/** Mean half-life in healthy adults ≈ 5 h, range 1.5–9.5 h (Institute of Medicine). */
export const TYPICAL_HL = 5;
export const HL_MIN = 1.5, HL_MAX = 15;
/** Gardiner 2023 anchors: one coffee (107 mg) ≥ 8.8 h before bed, a pre-workout (217.5 mg) ≥ 13.2 h. */
export const ANCHOR = { coffeeMg: 107, coffeeH: 8.8, preMg: 217.5, preH: 13.2 };
/** "Sleep-safe" bedtime residual: what one 107 mg coffee leaves after 8.8 h with a 5 h half-life (≈ 31.6 mg). The cutoff model uses this line. */
export const SAFE_MG = ANCHOR.coffeeMg * Math.pow(0.5, ANCHOR.coffeeH / TYPICAL_HL);
/** EFSA: a single 100 mg dose may affect sleep in some adults when taken close to bedtime. */
export const EFSA_BEDTIME_MG = 100;
export const DAILY_MAX_MG = 400, PREGNANCY_MAX_MG = 200;

/** Personal half-life (hours) — a modelling estimate. Smoking speeds clearance (×0.6); oral contraceptives can double it; pregnancy slows it (×2 assumed). */
export function halfLife(p: { sensitivity: Sensitivity; smoker?: boolean; oralContraceptive?: boolean; pregnant?: boolean }): number {
  let h = p.sensitivity === 'fast' ? 3 : p.sensitivity === 'slow' ? 7 : TYPICAL_HL;
  if (p.smoker) h *= 0.6;
  if (p.oralContraceptive) h *= 2;
  if (p.pregnant) h *= 2;
  return Math.round(Math.min(HL_MAX, Math.max(HL_MIN, h)) * 10) / 10;
}
export const quizHalfLife = (q: SleepQuiz) => halfLife({ sensitivity: q.sensitivity, smoker: q.smoker, oralContraceptive: q.sex === 'female' && q.oralContraceptive, pregnant: q.sex === 'female' && q.pregnant });

export interface Dose { mg: number; at: number }
/** Estimated caffeine still in the body at time t (first-order elimination, instant absorption — an estimate). */
export function caffeineAt(doses: Dose[], t: number, hl = TYPICAL_HL): number {
  let s = 0;
  for (const d of doses) if (d.at <= t && d.mg > 0) s += d.mg * Math.pow(0.5, (t - d.at) / (hl * H));
  return s;
}
/** Hours before bed a dose of `mg` should be finished so ≤ SAFE_MG is left at bedtime (0 when the dose is already ≤ SAFE_MG). */
export function cutoffHours(mg: number, hl = TYPICAL_HL): number {
  if (!(mg > SAFE_MG)) return 0;
  return hl * Math.log2(mg / SAFE_MG);
}
/** Latest time (ms) to take `mg` more caffeine so total at bedtime stays ≤ SAFE_MG, given doses already taken. null = no room left today. */
export function latestFor(mg: number, doses: Dose[], bedAt: number, hl = TYPICAL_HL): number | null {
  const room = SAFE_MG - caffeineAt(doses, bedAt, hl);
  if (room <= 0) return null;
  if (mg <= room) return bedAt;
  return bedAt - hl * Math.log2(mg / room) * H;
}
export type CaffeineBand = 'low' | 'some' | 'high';
export const band = (mg: number): CaffeineBand => (mg <= SAFE_MG ? 'low' : mg < EFSA_BEDTIME_MG ? 'some' : 'high');
export const BAND_TEXT: Record<CaffeineBand, string> = {
  low: 'About what’s left at bedtime when a coffee follows the 8.8-hour research cutoff.',
  some: 'More than the research cutoff would leave. You may take a little longer to fall asleep or sleep lighter.',
  high: 'EFSA notes 100 mg close to bedtime may affect sleep in some adults. Consider an earlier last cup.',
};

// ---------------- evening plan ----------------
export type ItemKind = 'wake' | 'caffeine' | 'preworkout' | 'train' | 'meal' | 'recovery' | 'alcohol' | 'fluid' | 'drink' | 'snack' | 'bed' | 'note';
export interface PlanItem { id: string; kind: ItemKind; off: number; clock: string; title: string; detail: string; src: string[]; practical?: boolean; warn?: boolean; recipe?: string }
export interface Plan {
  items: PlanItem[];
  notes: { text: string; src: string[]; tone?: 'warn' | 'info' }[];
  hl: number; usualMg: number; cutoffH: number; cutoffClock: string | null; noCaffeine: boolean;
  awakeMin: number; sleepH: number; lastMealOff: number; snack: string | null; drink: string; supps: { id: SuppId; why: string }[];
  screen: Screen;
}
const TRAIN_DEFAULT: Record<string, string> = { morning: '06:30', midday: '12:00', evening: '18:30' };
export const trainDefault = (t: Train) => TRAIN_DEFAULT[t] || '18:30';

/** Picks the bedtime snack (recipe id in src/data/sleep-recipes.json) for a goal + diet + reflux. null = no snack suggested. */
export function pickSnack(goal: SleepGoal, diet: Diet, gerd: boolean): string {
  const plant = diet === 'vegan' || diet === 'dairy-free';
  if (goal === 'recover') return plant ? 'sleep-soy-shake' : gerd ? 'sleep-kiwi-yogurt' : 'sleep-casein-shake';
  if (goal === 'onset' || goal === 'deeper') return plant ? 'sleep-banana-almond' : goal === 'deeper' && !gerd ? 'sleep-cottage-cherry' : 'sleep-kiwi-yogurt';
  if (goal === 'race') return gerd || plant ? 'sleep-banana-almond' : 'sleep-oats-cherry';
  return plant ? 'sleep-banana-almond' : 'sleep-kiwi-yogurt'; // shift: light before daytime sleep
}
/** Picks the last big meal (recipe id) for a goal + diet. */
export function pickDinner(goal: SleepGoal, diet: Diet): string {
  if (diet === 'vegan') return 'sleep-lentil-rice';
  if (diet === 'vegetarian') return goal === 'onset' || goal === 'race' ? 'sleep-med-bowl' : 'sleep-lentil-rice';
  if (goal === 'onset') return 'sleep-salmon-rice';
  if (goal === 'recover' || goal === 'race') return 'sleep-chicken-potato';
  return diet === 'dairy-free' ? 'sleep-salmon-rice' : 'sleep-med-bowl';
}
/** Picks the evening drink (recipe id). Avoids chamomile with blood thinners / sedatives / pregnancy (NCCIH), swaps dairy for soy. */
export function pickDrink(q: SleepQuiz): string {
  const plant = q.diet === 'vegan' || q.diet === 'dairy-free';
  const chamomileOk = !q.bloodThinners && !q.sedatives && !(q.sex === 'female' && (q.pregnant || q.breastfeeding));
  const milk = plant ? 'sleep-soy-warm' : 'sleep-warm-milk';
  if (q.goal === 'onset') return chamomileOk ? 'sleep-chamomile' : milk;
  if (q.goal === 'deeper') return 'sleep-tart-cherry';
  if (q.goal === 'recover') return milk;
  if (q.goal === 'race') return milk;
  return 'sleep-herbal';
}

/** Builds tonight's timeline. All times in minutes; `off` = minutes before bedtime (0 = bed). Pure + deterministic. */
export function buildPlan(q: SleepQuiz): Plan {
  const sc = screen(q);
  const bed = toMin(q.bed), wake = toMin(q.wake);
  const awake = fwd(wake, bed) || 1440;
  const sleepMin = fwd(bed, wake);
  const clock = (off: number) => toHM(bed - off);
  const items: PlanItem[] = [];
  const notes: Plan['notes'] = [];
  const add = (it: Omit<PlanItem, 'clock'>) => { if (it.off <= awake) items.push({ ...it, clock: clock(it.off) }); };
  const hl = quizHalfLife(q);
  const usual = q.drink === 'none' ? 0 : drinkById(q.drink)?.mg || 0;
  const cutH = cutoffHours(usual, hl);
  const cutOff = Math.round(cutH * 60);
  const noCaffeine = usual > 0 && cutOff >= awake;

  add({ id: 'wake', kind: 'wake', off: awake, title: 'Wake up', detail: q.goal === 'shift' ? 'Get bright light early in your “day” and keep meal times regular.' : 'Daylight and a regular wake time anchor your body clock.', src: q.goal === 'shift' ? ['sleep-lowden'] : ['sleep-walsh'] });

  // caffeine
  if (usual > 0) {
    const d = drinkById(q.drink)!;
    if (noCaffeine) add({ id: 'caffeine', kind: 'caffeine', off: awake, title: 'Caffeine: skip it today', detail: `With your schedule even one ${d.label.toLowerCase()} (~${d.mg} mg) would still be above the research line at bedtime. Try decaf or half-caf.`, src: ['sleep-gardiner-caffeine', 'sleep-iom-caffeine'], warn: true });
    else if (cutOff > 0) add({ id: 'caffeine', kind: 'caffeine', off: cutOff, title: `Last caffeine by ${clock(cutOff)}`, detail: `For your usual ${d.label.toLowerCase()} (~${d.mg} mg) with a ${hl} h half-life (estimate), that leaves ≤ ${Math.round(SAFE_MG)} mg at bedtime. The meta-analysis figure is 8.8 h for a coffee.${q.cupsPerDay > 1 ? ' Earlier cups add up — the tracker shows your real total.' : ''}`, src: ['sleep-gardiner-caffeine', 'sleep-drake', 'sleep-iom-caffeine'] });
    else add({ id: 'caffeine', kind: 'caffeine', off: Math.min(awake, 120), title: 'Caffeine: low dose', detail: `${d.label} (~${d.mg} mg) is already small. Keep it to one in the evening.`, src: ['sleep-efsa-caffeine', 'sleep-usda-fdc'] });
  }

  // training
  const hasTrain = q.train !== 'none' && q.train !== 'varies';
  const tStart = hasTrain ? toMin(q.trainClock || trainDefault(q.train)) : 0;
  const tStartOff = hasTrain ? fwd(tStart, bed) : 0;
  const tEndOff = hasTrain ? tStartOff - q.sessionMin : 0;
  const trainInDay = hasTrain && tStartOff <= awake && tEndOff >= 0;
  if (trainInDay) {
    add({ id: 'train', kind: 'train', off: tStartOff, title: `Training · ${q.sessionMin} min`, detail: q.hard && tEndOff < 60 ? 'Vigorous sessions that end within ~1 h of bed may delay sleep. If you can, finish hard work ≥ 2 h before bed or keep late sessions moderate.' : 'Evening exercise doesn’t harm sleep overall in the research.', src: q.hard && tEndOff < 60 ? ['sleep-stutz', 'sleep-oda'] : ['sleep-stutz'], warn: q.hard && tEndOff < 60 });
    if (q.preWorkout) {
      const pre = drinkById('preworkout')!;
      const leftover = pre.mg * Math.pow(0.5, (tStartOff + 30) / 60 / hl);
      const preCut = Math.round(cutoffHours(pre.mg, hl) * 60);
      if (leftover > SAFE_MG) add({ id: 'preworkout', kind: 'preworkout', off: tStartOff + 30, title: 'Pre-workout: go caffeine-free', detail: `A typical pre-workout (~${pre.mg} mg) 30 min before this session would leave ≈ ${Math.round(leftover)} mg at bedtime (estimate). Use a caffeine-free one for sessions starting after ${clock(Math.max(0, preCut - 30))}. Study figure: 13.2 h before bed.`, src: ['sleep-gardiner-caffeine', 'sleep-iom-caffeine'], warn: true });
    }
  }

  // last big meal
  let lastMealOff = 180; const mealSrc = ['sleep-acg-gerd', 'sleep-fujiwara'];
  if (q.goal === 'onset') { lastMealOff = 240; mealSrc.push('sleep-afaghi'); }
  if (q.gerd) lastMealOff = Math.max(lastMealOff, 240);
  const recoveryMode = q.goal === 'recover' || (trainInDay && tEndOff < lastMealOff);
  if (trainInDay && tEndOff < lastMealOff) {
    // training ends after the usual dinner time → the post-training meal becomes dinner
    const preMealOff = tStartOff + 150;
    if (preMealOff <= awake) add({ id: 'meal-pre', kind: 'meal', off: preMealOff, title: 'Main meal before training', detail: 'Eat your bigger meal 2–3 h before the session so you train fuelled and keep the late meal smaller.', src: ['acsm2016'] });
    const recOff = Math.max(30, tEndOff - 45);
    add({ id: 'recovery', kind: 'recovery', off: recOff, title: recOff >= 90 ? 'Recovery dinner' : 'Recovery snack', detail: recOff >= 90 ? 'Protein + carbohydrate within about an hour after training. Keep it moderate, lower in fat and not spicy this close to bed.' : 'It’s late: have a smaller protein-rich snack now (e.g. a protein shake) instead of a full meal — it also counts as your evening drink.', src: recOff >= 90 ? ['issn-timing', 'issn-protein', 'sleep-edwards-spicy'] : ['issn-protein', 'sleep-res', 'sleep-kinsey'], recipe: recOff >= 90 ? (q.diet === 'vegan' || q.diet === 'vegetarian' ? 'sleep-lentil-rice' : 'sleep-chicken-potato') : pickSnack('recover', q.diet, q.gerd) });
    if (q.gerd) notes.push({ text: 'Your training ends close to bed, so the recovery meal is later than the 3–4 h reflux guidance. Keep it small and low-fat, and stay upright for a while after eating.', src: ['sleep-acg-gerd'], tone: 'warn' });
  } else {
    const vDinner = pickDinner(q.goal, q.diet);
    add({ id: 'meal', kind: 'meal', off: lastMealOff, title: q.goal === 'shift' ? 'Last full meal before sleep' : 'Last big meal', detail: q.goal === 'onset' ? 'A carbohydrate-based dinner about 4 h before bed helped people fall asleep faster than the same meal 1 h before bed (small trial). Go easy on rich, fatty and spicy food.' : q.goal === 'race' ? 'Familiar, carbohydrate-focused and lower in fibre and fat. Nothing new the night before a race.' : q.goal === 'shift' ? 'Have your main meal before your shift; on shift keep eating light and regular, and avoid a large meal in the small hours.' : `Finish larger meals ${lastMealOff / 60} h before bed: eating within 3 h of bed is linked to more reflux, and the reflux guideline says 2–3 h.`, src: q.goal === 'shift' ? ['sleep-lowden', ...mealSrc] : q.goal === 'race' ? ['acsm2016', 'sleep-walsh'] : mealSrc, recipe: vDinner });
  }

  // alcohol
  if (q.alcohol !== 'none') add({ id: 'alcohol', kind: 'alcohol', off: items.find((i) => i.kind === 'recovery')?.off ?? lastMealOff, title: q.goal === 'race' || recoveryMode ? 'Alcohol: skip it tonight' : 'If you drink: one, with dinner', detail: q.goal === 'race' || recoveryMode ? 'Even ~2 drinks reduce REM sleep, and alcohol after training lowers muscle protein synthesis.' : 'Alcohol helps you nod off but fragments the second half of the night; even ~2 standard drinks reduce REM sleep. There’s no proven “safe” cutoff — less is better.', src: q.goal === 'race' || recoveryMode ? ['sleep-gardiner-alcohol', 'sleep-parr'] : ['sleep-gardiner-alcohol', 'sleep-ebrahim'], warn: true });

  // fluids
  if (trainInDay && tEndOff >= 30) add({ id: 'rehydrate', kind: 'fluid', off: Math.max(tEndOff - 15, 30), title: 'Rehydrate after training', detail: 'Drink soon after the session rather than right before bed. After big sweat losses, about 1.5 L per kg lost, with some sodium (ACSM).', src: ['acsm-fluid'] });
  const taperOff = q.wakesToPee ? 180 : 120;
  const lateTrain = trainInDay && tEndOff >= 30 && tEndOff - 15 < taperOff;
  if (lateTrain) items[items.length - 1] = { ...items[items.length - 1], detail: `Rehydrate soon after the session (ACSM: about 1.5 L per kg lost after big sweat losses, with some sodium), then switch to small sips — about one cup (250 mL) until bed, including your bedtime drink.${q.kidney ? ' With kidney disease, follow your clinician’s fluid advice instead.' : ''}`, src: ['acsm-fluid', 'sleep-medline-nocturia'] };
  else add({ id: 'fluid', kind: 'fluid', off: taperOff, title: 'Taper fluids', detail: q.kidney ? 'Follow your clinician’s fluid advice.' : `Drink well earlier in the day, then small sips only — about one cup (250 mL) in the last ${taperOff / 60} h, including your bedtime drink. Evening fluid, caffeine and alcohol are common reasons for waking to pee.`, src: ['sleep-medline-nocturia'], practical: true });

  // drink (skipped when the bedtime protein is already a milk/soy shake — that's your evening drink, and it keeps late fluids down)
  const recSnackUsed = items.some((i) => i.kind === 'recovery' && i.off < 90);
  const snack = recSnackUsed ? null : pickSnack(q.goal, q.diet, q.gerd);
  const SHAKES = ['sleep-casein-shake', 'sleep-soy-shake'];
  const shakeIsDrink = recSnackUsed || (!!snack && SHAKES.includes(snack));
  const drink = shakeIsDrink ? '' : pickDrink(q);
  const drinkOff = drink === 'sleep-tart-cherry' ? 90 : drink === 'sleep-herbal' ? 60 : 45;
  const drinkDetail: Record<string, string> = {
    'sleep-chamomile': 'Warm, caffeine-free ritual. A meta-analysis found better sleep-quality scores (mixed studies). Skip if allergic to ragweed or daisies.',
    'sleep-tart-cherry': 'Studied as 240 mL twice a day (morning + evening) or concentrate for a week or more — small trials, limited evidence. ~140 kcal per cup.',
    'sleep-warm-milk': 'Caffeine-free and adds a little protein. Milk-protein products modestly improved sleep efficiency in trials, mostly in poor sleepers.',
    'sleep-soy-warm': 'A dairy-free warm drink. No sleep trials — it’s a caffeine-free wind-down.',
    'sleep-herbal': 'Caffeine-free, so it doesn’t add to your bedtime caffeine. Keep it small.',
  };
  const drinkSrc: Record<string, string[]> = { 'sleep-chamomile': ['sleep-kazemi-chamomile', 'sleep-nccih-chamomile'], 'sleep-tart-cherry': ['sleep-howatson', 'sleep-losso', 'sleep-barforoush'], 'sleep-warm-milk': ['sleep-yu-milk', 'sleep-komada-milk'], 'sleep-soy-warm': ['sleep-usda-fdc'], 'sleep-herbal': ['sleep-usda-fdc'] };
  if (drink) add({ id: 'drink', kind: 'drink', off: drinkOff, title: 'Evening drink', detail: drinkDetail[drink], src: drinkSrc[drink], recipe: drink });

  // snack
  if (snack) {
    const snackOff = q.gerd ? 90 : snack === 'sleep-kiwi-yogurt' || snack === 'sleep-banana-almond' || snack === 'sleep-oats-cherry' ? 60 : 40;
    const snackText: Record<string, string> = {
      'sleep-casein-shake': '~30 g mostly-casein protein. Pre-sleep protein (30–40 g casein) raised overnight muscle protein synthesis and, with training, strength and muscle gains.',
      'sleep-soy-shake': '~27 g plant protein. Pre-sleep protein research mostly used casein; plant protein is less studied.',
      'sleep-cottage-cherry': '~25 g casein-rich protein with tart cherries. Small and nutrient-dense.',
      'sleep-kiwi-yogurt': 'Two kiwifruit ~1 h before bed went with faster sleep onset in a small study; the yogurt adds protein. Optional.',
      'sleep-banana-almond': 'Light and easy. No direct sleep trial — optional if you’re hungry.',
      'sleep-oats-cherry': 'Familiar, small and carbohydrate-based — tops up glycogen without a heavy stomach.',
    };
    const snackSrc: Record<string, string[]> = { 'sleep-casein-shake': ['issn-protein', 'sleep-res', 'sleep-snijders'], 'sleep-soy-shake': ['issn-protein', 'sleep-trommelen'], 'sleep-cottage-cherry': ['issn-protein', 'sleep-howatson'], 'sleep-kiwi-yogurt': ['sleep-lin-kiwi', 'sleep-kinsey'], 'sleep-banana-almond': ['sleep-kinsey', 'sleep-ods-mg'], 'sleep-oats-cherry': ['sleep-kinsey', 'sleep-vlahoyiannis'] };
    add({ id: 'snack', kind: 'snack', off: snackOff, title: q.goal === 'recover' ? 'Bedtime protein' : 'Optional bedtime snack', detail: snackText[snack] + (SHAKES.includes(snack) ? ' It doubles as your evening drink.' : '') + (q.gerd ? ' With reflux: keep it small and have it at least 1–2 h before lying down.' : ''), src: snackSrc[snack], recipe: snack });
  }

  add({ id: 'bed', kind: 'bed', off: 0, title: q.goal === 'shift' ? 'Daytime sleep' : 'Lights out', detail: sleepMin < 7 * 60 ? `That’s ${(sleepMin / 60).toFixed(1)} h in bed — under the 7+ h adults need${q.age < 18 ? ' (teens: 8–10 h)' : ''}. An earlier bedtime will do more than any food.` : `${(sleepMin / 60).toFixed(1)} h in bed. Adults need 7+ h${q.age > 0 && q.age < 18 ? ', teens 8–10 h' : ''}.`, src: ['sleep-watson', 'sleep-nsf'], warn: sleepMin < 7 * 60 });

  // notes
  if (sc.clinician) notes.push({ text: REASON_TEXT[q.insomnia3mo ? 'insomnia' : 'sleepDisorder'], src: REASON_SRC[q.insomnia3mo ? 'insomnia' : 'sleepDisorder']!, tone: 'warn' });
  if (q.goal === 'race') notes.push({ text: 'Race night: a poor night before a race is common. Bank extra sleep in the nights before, keep dinner and snacks familiar, and set the caffeine plan for race morning — not the evening before.', src: ['sleep-walsh', 'sleep-jetlag'] });
  if (q.goal === 'race' && q.timeZones) notes.push({ text: 'Crossing 5+ time zones: shift meal and sleep times toward the destination and get daylight at the right times. Melatonin has the best evidence for jet lag — see the options below (if available for you).', src: ['sleep-jetlag', 'sleep-herxheimer'] });
  if (q.goal === 'shift') notes.push({ text: 'Shift work: no caffeine in the last part of your shift (it’s still active when you try to sleep), eat lighter overnight, and keep the bedroom dark and quiet for daytime sleep.', src: ['sleep-lowden', 'sleep-gardiner-caffeine'] });
  if (q.smoker) notes.push({ text: 'Nicotine is a stimulant: smoking or vaping close to bed is linked to taking longer to fall asleep and lighter sleep. It also speeds up caffeine clearance, which HYBRD has factored in.', src: ['sleep-jaehne', 'sleep-iom-caffeine'] });
  if (q.sex === 'female' && q.pregnant) notes.push({ text: 'Pregnancy: keep caffeine to 200 mg a day or less (EFSA). Caffeine also clears more slowly, so HYBRD doubles your half-life estimate.', src: ['sleep-efsa-caffeine', 'sleep-nehlig'], tone: 'warn' });
  if (q.age > 0 && q.age < 18) notes.push({ text: 'Under 18: no energy drinks or pre-workouts, and keep caffeine to about 3 mg per kg a day at most (EFSA).', src: ['sleep-fda-caffeine', 'sleep-efsa-caffeine'], tone: 'warn' });
  if (q.tested && q.supplements) notes.push({ text: 'Drug-tested athlete: supplements can be contaminated with banned substances. Use only third-party batch-tested products and get expert advice first (IOC).', src: ['sleep-ioc-supps'], tone: 'warn' });

  items.sort((a, b) => b.off - a.off || order(a.kind) - order(b.kind));
  return {
    items, notes, hl, usualMg: usual, cutoffH: cutH, cutoffClock: usual > 0 && !noCaffeine && cutOff > 0 ? clock(cutOff) : null, noCaffeine,
    awakeMin: awake, sleepH: sleepMin / 60, lastMealOff, snack, drink, supps: sc.level === 'minor' ? [] : suppSuggestions(q), screen: sc,
  };
}
const ORDER: ItemKind[] = ['wake', 'caffeine', 'preworkout', 'meal', 'train', 'recovery', 'alcohol', 'fluid', 'drink', 'snack', 'note', 'bed'];
const order = (k: ItemKind) => ORDER.indexOf(k);

export function defaultQuiz(p: { sex?: 'male' | 'female'; age?: number }): SleepQuiz {
  return {
    age: p.age || 30, sex: p.sex || 'male', pregnant: false, breastfeeding: false, sedatives: false, antidepressants: false, bloodThinners: false, bpMeds: false, otherMeds: false,
    sleepDisorder: false, insomnia3mo: false, kidney: false, gerd: false, liver: false, epilepsy: false, thyroid: false, smoker: false, oralContraceptive: false,
    bed: '23:00', wake: '07:00', train: 'evening', trainClock: '18:30', sessionMin: 60, hard: false, drink: 'coffee', cupsPerDay: 2, lastCaffeine: '15:00', preWorkout: false,
    sensitivity: 'unknown', goal: 'onset', diet: 'any', alcohol: 'none', wakesToPee: false, timeZones: false, tested: false, supplements: false,
  };
}

// ---------------- logs ----------------
export interface SleepLog extends Rec {
  /** Date you woke up (YYYY-MM-DD) — the night belongs to this morning. */
  date: string;
  bed?: string; wake?: string;
  hours: number; quality: 1 | 2 | 3 | 4 | 5;
  caffeineLate: boolean; alcohol: boolean; lateMeal: boolean; trainedLate?: boolean;
  snack?: string; note?: string;
}
export interface CaffeineLog extends Rec { date: string; at: number; mg: number; drink: string; label: string }

export const hoursBetween = (bed: string, wake: string) => fwd(toMin(bed), toMin(wake)) / 60;
export const validLog = (l: Partial<SleepLog>) => !!l.date && typeof l.hours === 'number' && l.hours > 0 && l.hours <= 16 && !!l.quality && l.quality >= 1 && l.quality <= 5;
const live = <T extends Rec>(a: T[]) => a.filter((x) => !x.deleted);
const byDay = (logs: SleepLog[]) => { const m = new Map<string, SleepLog>(); for (const l of live(logs)) { const c = m.get(l.date); if (!c || (l.updatedAt || 0) >= (c.updatedAt || 0)) m.set(l.date, l); } return m; };

/** Consecutive nights logged, ending today (or yesterday if today isn't logged yet). */
export function logStreak(logs: SleepLog[], today: string): number {
  const m = byDay(logs); let d = m.has(today) ? today : addDays(today, -1); let n = 0;
  while (m.has(d)) { n++; d = addDays(d, -1); }
  return n;
}
/** Consecutive nights of ≥ 7 h (AASM/SRS), ending at the most recent logged night (today or yesterday). */
export function goodStreak(logs: SleepLog[], today: string, minH = 7): number {
  const m = byDay(logs); let d = m.has(today) ? today : addDays(today, -1); let n = 0;
  while (m.has(d) && m.get(d)!.hours >= minH) { n++; d = addDays(d, -1); }
  return n;
}
export function bestGoodStreak(logs: SleepLog[], minH = 7): number {
  const days = [...byDay(logs).values()].sort((a, b) => a.date.localeCompare(b.date));
  let best = 0, cur = 0, prev = '';
  for (const l of days) { const ok = l.hours >= minH; cur = ok ? (prev && addDays(prev, 1) === l.date && cur > 0 ? cur + 1 : 1) : 0; if (ok) prev = l.date; else prev = ''; best = Math.max(best, cur); }
  return best;
}
/** Last `days` nights, oldest → newest (null when not logged). */
export function trend(logs: SleepLog[], today: string, days = 14): { day: string; hours: number | null; quality: number | null }[] {
  const m = byDay(logs);
  return Array.from({ length: days }, (_, i) => { const day = addDays(today, i - days + 1); const l = m.get(day); return { day, hours: l ? l.hours : null, quality: l ? l.quality : null }; });
}
export function stats(logs: SleepLog[], today: string) {
  const last7 = trend(logs, today, 7).filter((d) => d.hours !== null);
  const all = [...byDay(logs).values()];
  const avg = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
  return {
    total: all.length,
    n7: last7.length,
    avgHours7: avg(last7.map((d) => d.hours!)),
    avgQuality7: avg(last7.map((d) => d.quality!)),
    nights7plus: last7.filter((d) => d.hours! >= 7).length,
    logStreak: logStreak(logs, today),
    goodStreak: goodStreak(logs, today),
    bestGood: bestGoodStreak(logs),
  };
}
export type Flag = 'caffeineLate' | 'alcohol' | 'lateMeal';
export const FLAG_LABEL: Record<Flag, string> = { caffeineLate: 'Late caffeine', alcohol: 'Alcohol', lateMeal: 'Late big meal' };
/** Your own pattern: average quality/hours on nights with vs without a flag. Only shown when both sides have ≥ 3 nights. */
export function compareFlag(logs: SleepLog[], flag: Flag, minN = 3): { withQ: number; withoutQ: number; withH: number; withoutH: number; nWith: number; nWithout: number } | null {
  const all = [...byDay(logs).values()];
  const w = all.filter((l) => l[flag]), wo = all.filter((l) => !l[flag]);
  if (w.length < minN || wo.length < minN) return null;
  const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
  return { withQ: avg(w.map((l) => l.quality)), withoutQ: avg(wo.map((l) => l.quality)), withH: avg(w.map((l) => l.hours)), withoutH: avg(wo.map((l) => l.hours)), nWith: w.length, nWithout: wo.length };
}
/** Today's caffeine doses for the tracker (by local date key). */
export const dosesFor = (logs: CaffeineLog[], date: string): Dose[] => live(logs).filter((l) => l.date === date).map((l) => ({ mg: l.mg, at: l.at }));
/** Bedtime (ms) for a given day key and HH:MM bed time — a bedtime after midnight but before the wake time counts as the next calendar day. */
export function bedtimeMs(day: string, bed: string, wake: string): number {
  const b = toMin(bed), w = toMin(wake);
  const base = new Date(day + 'T00:00:00').getTime();
  const nextDay = b < w; // e.g. bed 00:30, wake 07:30 → after midnight
  return base + (nextDay ? 1440 + b : b) * 60_000;
}
/** Was any logged caffeine after the personal cutoff for that night? Used to pre-tick "late caffeine" in the morning log. */
export function lateCaffeine(logs: CaffeineLog[], day: string, bed: string, wake: string, hl = TYPICAL_HL): boolean {
  return caffeineAt(dosesFor(logs, day), bedtimeMs(day, bed, wake), hl) > SAFE_MG;
}
export const fmtMg = (mg: number) => `${Math.round(mg)} mg`;
