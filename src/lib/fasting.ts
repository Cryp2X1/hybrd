// Fuel › Fasting — pure, deterministic logic (no React, no storage) so it can be unit-tested in Node.
// Screening, protocol library, personalised recommendation + eating-window placement, timer math, stages, streaks.
// Every claim shown to users lives in src/data/fastingContent.ts with its sources (src/data/sources.ts, ids `fast-*`).
import type { Rec, Sex } from './types';

// ---------------- protocols ----------------
export type ProtocolId = 'tre12' | 'tre14' | 'tre16' | 'etre' | 'tre18' | 'tre20' | 'fiveTwo' | 'madf' | 'once24';
export type Level = 'beginner' | 'intermediate' | 'advanced';
export type Evidence = 'stronger' | 'moderate' | 'limited';
export interface Protocol {
  id: ProtocolId;
  name: string;
  tag: string; // e.g. "16:8"
  level: Level;
  /** daily = a fasting window every day; lowcal = some days are ~500–600 kcal or ~25% of needs; weekly = one 24-h fast a week */
  kind: 'daily' | 'lowcal' | 'weekly';
  fastH: number; // target fast length for the timer (daily / weekly). Low-cal days use 24 (one calendar day).
  eatH: number; // eating window (daily); 0 for non-daily
  /** Low-calorie / fast days per week (lowcal + weekly kinds). */
  daysPerWeek?: number;
  schedule: string;
  what: string;
  suits: string;
  watch: string;
  evidence: Evidence;
  evidenceText: string;
  src: string[];
}
export const LEVEL_RANK: Record<Level, number> = { beginner: 0, intermediate: 1, advanced: 2 };
export const LEVEL_LABEL: Record<Level, string> = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };
export const EVIDENCE_LABEL: Record<Evidence, string> = { stronger: 'More evidence', moderate: 'Some evidence', limited: 'Limited evidence' };

export const PROTOCOLS: Protocol[] = [
  { id: 'tre12', name: 'Overnight 12:12', tag: '12:12', level: 'beginner', kind: 'daily', fastH: 12, eatH: 12,
    schedule: 'Eat within 12 hours (e.g. 7:00–19:00), fast 12 hours overnight.',
    what: 'A consistent overnight fast with no late-night eating. The gentlest starting point and a good habit on its own.',
    suits: 'Complete beginners, people who snack late at night, anyone with a medical flag who has their doctor’s OK.',
    watch: 'Little direct trial evidence for 12:12 itself; its main value is structure and a stepping stone.',
    evidence: 'limited', evidenceText: 'Many adults eat across ~15 hours a day; trimming the window is the first step researchers use. Benefits shown at shorter windows (10 h) — 12:12 is the warm-up.', src: ['fast-gill', 'fast-decabo'] },
  { id: 'tre14', name: '14:10', tag: '14:10', level: 'beginner', kind: 'daily', fastH: 14, eatH: 10,
    schedule: 'Eat within 10 hours (e.g. 9:00–19:00), fast 14 hours.',
    what: 'A 10-hour eating window. It is “month 1” in the gradual plan suggested in the NEJM review, and was workable for shift workers.',
    suits: 'Beginners moving on from 12:12, people with long or shift workdays, people training most days.',
    watch: 'Benefits in studies came alongside eating less; the window alone doesn’t guarantee weight loss.',
    evidence: 'moderate', evidenceText: '10-hour TRE cut weight, blood pressure and atherogenic lipids in metabolic syndrome (single-arm) and was feasible with no adverse effects in 24-h shift firefighters (RCT).', src: ['fast-wilkinson', 'fast-manoogian', 'fast-gill', 'fast-decabo'] },
  { id: 'tre16', name: '16:8', tag: '16:8', level: 'intermediate', kind: 'daily', fastH: 16, eatH: 8,
    schedule: 'Eat within 8 hours (e.g. 12:00–20:00), fast 16 hours.',
    what: 'The most popular daily pattern: usually skipping breakfast or eating dinner early.',
    suits: 'People who’ve done 14:10 comfortably for a few weeks and like 2–3 bigger meals.',
    watch: 'In trials that matched calories, 16:8 didn’t beat regular calorie control for weight loss. Keep protein high — one trial saw slightly more lean-mass loss.',
    evidence: 'stronger', evidenceText: 'Large RCTs: TREAT (12–8 p.m., 12 weeks) −0.26 kg vs 3 meals/day (not significant); 12-month NEJM trial −8.0 vs −6.3 kg with calorie restriction alone (P = 0.11). With resistance training, strength and fat-free mass were kept.', src: ['wl-lowe', 'wl-liu', 'fast-moro', 'fast-tinsley', 'fast-hopkins'] },
  { id: 'etre', name: 'Early 8-hour (eTRE)', tag: 'Early 8h', level: 'intermediate', kind: 'daily', fastH: 16, eatH: 8,
    schedule: 'Eat earlier in the day, e.g. 7:00–15:00 or 8:00–16:00; skip evening meals.',
    what: 'Same 16-hour fast, but the window is placed early to match the body clock.',
    suits: 'Early risers, people training in the morning, people focused on blood sugar or blood pressure.',
    watch: 'Hard to fit with family dinners and evening training. Studies are small or short.',
    evidence: 'moderate', evidenceText: '7 a.m.–3 p.m. + calorie restriction lost 2.3 kg more than eating over 12+ h in 14 weeks and improved diastolic BP; a 5-week supervised study improved insulin sensitivity and BP without weight loss.', src: ['fast-jamshed22', 'fast-sutton', 'fast-jamshed19'] },
  { id: 'tre18', name: '18:6', tag: '18:6', level: 'advanced', kind: 'daily', fastH: 18, eatH: 6,
    schedule: 'Eat within 6 hours (e.g. 13:00–19:00), fast 18 hours.',
    what: 'A longer daily fast — the “month 3–4” goal in the NEJM review’s gradual plan.',
    suits: 'Experienced fasters (several weeks of 16:8) who aren’t training hard twice a day.',
    watch: 'Harder to fit enough protein (3+ meals) and to fuel hard training. Not for people with heart disease without their doctor.',
    evidence: 'moderate', evidenceText: '6-h TRE (1–7 p.m.) gave ~3% weight loss vs control over 8 weeks, largely by eating ~550 kcal/day less. Observational data link < 8 h eating windows with higher cardiovascular death — not proof of cause.', src: ['fast-cienfuegos', 'fast-decabo', 'fast-chen'] },
  { id: 'tre20', name: '20:4', tag: '20:4', level: 'advanced', kind: 'daily', fastH: 20, eatH: 4,
    schedule: 'Eat within 4 hours (e.g. 15:00–19:00), fast 20 hours.',
    what: 'A very short eating window — usually one large meal plus a smaller one.',
    suits: 'Only experienced fasters with a light training load. Not a HYBRD default.',
    watch: 'No better than 18:6 in the only head-to-head trial, and very hard to meet protein and fuel needs for training.',
    evidence: 'limited', evidenceText: 'One 8-week RCT: 4-h and 6-h windows gave similar ~3% weight loss. No long-term data.', src: ['fast-cienfuegos', 'fast-chen'] },
  { id: 'fiveTwo', name: '5:2', tag: '5:2', level: 'intermediate', kind: 'lowcal', fastH: 24, eatH: 0, daysPerWeek: 2,
    schedule: 'Eat normally 5 days; on 2 non-consecutive days have one ~500–600 kcal meal.',
    what: 'Two low-calorie days a week instead of a daily window.',
    suits: 'People who prefer a couple of hard days over daily rules; pick rest or easy days.',
    watch: 'Low-calorie days can feel tough at first; don’t place them on hard or long training days.',
    evidence: 'stronger', evidenceText: 'Two low-calorie days a week lost about the same as daily restriction in 6 months (−6.4 vs −5.6 kg); network meta-analysis: similar to continuous calorie restriction.', src: ['fast-harvie', 'fast-hopkins', 'fast-bmj-nma', 'fast-decabo'] },
  { id: 'madf', name: 'Modified alternate-day', tag: 'ADF', level: 'advanced', kind: 'lowcal', fastH: 24, eatH: 0, daysPerWeek: 3,
    schedule: 'Alternate normal days with low days at ~25% of your usual calories (about 3–4 low days a week).',
    what: 'The most intensive pattern offered. HYBRD uses the modified version (one small meal) — never full zero-calorie days.',
    suits: 'Experienced fasters with a weight-loss goal and a light training week.',
    watch: 'Highest dropout in trials (38% vs 29% with daily restriction). Not suited to frequent hard training.',
    evidence: 'stronger', evidenceText: '1-year RCT: −6.0% vs −5.3% weight with daily restriction. The only IF strategy that beat continuous restriction in the 2025 BMJ network meta-analysis (−1.29 kg), in trials under 24 weeks.', src: ['fast-trepanowski', 'fast-bmj-nma', 'fast-varady', 'fast-harvard'] },
  { id: 'once24', name: '24-hour, once a week', tag: '24h × 1', level: 'advanced', kind: 'weekly', fastH: 24, eatH: 0, daysPerWeek: 1,
    schedule: 'Once a week, dinner to dinner (~24 h). Eat normally the other days.',
    what: 'One whole-day fast a week (water, black coffee, tea).',
    suits: 'Experienced fasters who prefer one long fast to daily windows.',
    watch: 'Little direct trial evidence. Fasts longer than 24 h aren’t necessarily better and may be dangerous — HYBRD caps the timer at 24 h.',
    evidence: 'limited', evidenceText: 'Whole-day fasting performed similarly to other IF strategies in the network meta-analysis; in lean adults, 24-h fasts without a calorie deficit barely changed weight.', src: ['fast-bmj-nma', 'fast-templeman', 'fast-hopkins'] },
];
export const protocolById = (id: string | undefined) => PROTOCOLS.find((p) => p.id === id);
/** HYBRD never runs or suggests a fast longer than this. */
export const MAX_FAST_H = 24;
export const MIN_FAST_H = 12;

// ---------------- screening ----------------
export type Diabetes = 'none' | 'prediabetes' | 't2-diet' | 't2-meds' | 't2-insulin-su' | 't1';
export interface FastQuiz {
  sex: Sex; age: number; heightCm: number; weightKg: number;
  pregnant: boolean; breastfeeding: boolean; edHistory: boolean;
  diabetes: Diabetes;
  /** Regular medicine that must be taken with food, or lowers blood sugar / blood pressure. */
  meds: boolean;
  heart: boolean; // heart disease / previous heart attack or stroke
  kidney: boolean;
  lowBP: boolean; // low blood pressure or fainting
  fallsRisk: boolean; // osteoporosis / high risk of bone loss and falls
  goal: 'weight' | 'health' | 'routine' | 'performance';
  experience: 'none' | 'some' | 'regular'; // never / tried a few times / fast regularly (16:8+ for 4+ weeks)
  prefer: 'daily' | 'weekly' | 'either';
  wake: string; // 'HH:MM'
  bed: string; // 'HH:MM'
  train: 'none' | 'morning' | 'midday' | 'evening' | 'varies';
  trainClock: string; // usual start 'HH:MM' (ignored when train is none/varies)
  sessionMin: number;
  hard: boolean; // long (> 60 min) or hard sessions are common
  trainDays: number;
}
export type ReasonCode = 'under18' | 'pregnant' | 'breastfeeding' | 'eating-disorder' | 't1' | 'insulin-su' | 'underweight'
  | 'diabetes-meds' | 'meds' | 'heart' | 'kidney' | 'low-bp' | 'falls' | 'diabetes-diet';
export interface Screen { level: 'stop' | 'caution' | 'ok'; stop: ReasonCode[]; caution: ReasonCode[]; bmi: number; maxLevel: Level }
export const bmiOf = (kg: number, cm: number) => (cm > 0 ? kg / Math.pow(cm / 100, 2) : 0);

export const REASON_TEXT: Record<ReasonCode, string> = {
  under18: 'Fasting plans aren’t recommended for anyone under 18 — growing bodies need regular fuel. Regular meals, sleep and training will do more for you right now.',
  pregnant: 'Fasting isn’t recommended during pregnancy. Please talk to your doctor or midwife about eating for you and your baby.',
  breastfeeding: 'Fasting isn’t recommended while breastfeeding. Your doctor or a dietitian can help with your energy needs.',
  'eating-disorder': 'Because of a past or current eating disorder, a fasting plan isn’t a good fit — fixed fasting windows can bring back restrictive habits. You deserve support: a doctor, therapist or eating-disorder specialist can help.',
  t1: 'With type 1 diabetes, fasting can cause dangerous low blood sugar. HYBRD won’t set a fasting plan — please plan any change in meal timing with your diabetes team.',
  'insulin-su': 'Insulin and sulfonylureas (e.g. glipizide, gliclazide, glimepiride) can cause dangerous low blood sugar while fasting. Doses usually need to be changed by your doctor first, so HYBRD won’t set a fasting plan.',
  underweight: 'Your BMI is under 18.5. Fasting usually means eating less, which isn’t recommended when you’re underweight. Please talk to your doctor or a dietitian.',
  'diabetes-meds': 'You take diabetes medicine. Fasting can change your blood sugar and medicine needs — check with your doctor before starting and monitor as they advise.',
  'diabetes-diet': 'Type 2 diabetes (managed without medicine): fasting may change your blood sugar. Let your doctor know before you start.',
  meds: 'You take medicine that needs food, or lowers blood sugar or blood pressure. Ask your doctor or pharmacist how fasting fits with your doses.',
  heart: 'Heart disease: observational data link very short eating windows (< 8–10 h) with higher cardiovascular risk in people with heart disease. It can’t prove cause, but HYBRD keeps you to 12–14 h fasts and asks you to check with your doctor.',
  kidney: 'Kidney disease affects fluid, electrolyte and protein needs. Check with your doctor or renal dietitian before fasting.',
  'low-bp': 'Low blood pressure or fainting: fasting can cause dizziness. Check with your doctor first and stop if you feel faint.',
  falls: 'If you’re at high risk of bone loss or falls, Mayo Clinic notes fasting may not be a healthy pattern. Check with your doctor first.',
};
export const REASON_SRC: Partial<Record<ReasonCode, string[]>> = {
  under18: ['fast-hopkins', 'fast-harvard'], pregnant: ['fast-hopkins', 'fast-mayo'], breastfeeding: ['fast-hopkins', 'fast-mayo'],
  'eating-disorder': ['fast-hopkins', 'fast-mayo', 'fast-ganson'], t1: ['fast-hopkins', 'fast-grajower'], 'insulin-su': ['fast-grajower', 'fast-harvard'],
  underweight: ['fast-harvard'], 'diabetes-meds': ['fast-grajower', 'fast-harvard'], 'diabetes-diet': ['fast-grajower'], meds: ['fast-harvard'],
  heart: ['fast-chen'], 'low-bp': ['fast-mayo', 'fast-zhong'], falls: ['fast-mayo'],
};

export function screen(q: Pick<FastQuiz, 'age' | 'heightCm' | 'weightKg' | 'pregnant' | 'breastfeeding' | 'edHistory' | 'diabetes' | 'meds' | 'heart' | 'kidney' | 'lowBP' | 'fallsRisk'>): Screen {
  const stop: ReasonCode[] = [], caution: ReasonCode[] = [];
  const bmi = bmiOf(q.weightKg, q.heightCm);
  if (q.age > 0 && q.age < 18) stop.push('under18');
  if (q.pregnant) stop.push('pregnant');
  if (q.breastfeeding) stop.push('breastfeeding');
  if (q.edHistory) stop.push('eating-disorder');
  if (q.diabetes === 't1') stop.push('t1');
  if (q.diabetes === 't2-insulin-su') stop.push('insulin-su');
  if (bmi > 0 && bmi < 18.5) stop.push('underweight');
  if (q.diabetes === 't2-meds') caution.push('diabetes-meds');
  if (q.diabetes === 't2-diet') caution.push('diabetes-diet');
  if (q.meds) caution.push('meds');
  if (q.heart) caution.push('heart');
  if (q.kidney) caution.push('kidney');
  if (q.lowBP) caution.push('low-bp');
  if (q.fallsRisk) caution.push('falls');
  const level = stop.length ? 'stop' : caution.length ? 'caution' : 'ok';
  return { level, stop, caution, bmi, maxLevel: caution.length ? 'beginner' : 'advanced' };
}

// ---------------- clock helpers (minutes since midnight) ----------------
export const toMin = (hm: string) => { const [h, m] = (hm || '0:0').split(':').map((x) => parseInt(x, 10) || 0); return (((h * 60 + m) % 1440) + 1440) % 1440; };
export const toHM = (min: number) => { const m = ((Math.round(min) % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
/** Minutes from a to b going forward on the clock (0–1439). Handles windows that cross midnight. */
export const fwd = (a: number, b: number) => (((b - a) % 1440) + 1440) % 1440;
export const round30 = (m: number) => Math.round(m / 30) * 30;
/** Is clock time t inside [start, start + len) (len in minutes), allowing the window to cross midnight? */
export const inWindow = (t: number, start: number, len: number) => fwd(start, t) < len;

// ---------------- recommendation ----------------
export interface EatWindow { start: string; end: string; eatH: number }
export interface Recommendation { protocol: ProtocolId; alternatives: ProtocolId[]; window: EatWindow | null; why: string[]; notes: string[]; startWith?: ProtocolId; maxLevel: Level }

/** Which protocols this person may pick (level cap from experience + screening, heart → only ≥ 10 h windows). */
export function allowedProtocols(q: FastQuiz, sc: Screen = screen(q)): ProtocolId[] {
  if (sc.level === 'stop') return [];
  const exp: Level = q.experience === 'regular' ? 'advanced' : q.experience === 'some' ? 'intermediate' : 'beginner';
  const cap = Math.min(LEVEL_RANK[exp], LEVEL_RANK[sc.maxLevel]);
  return PROTOCOLS.filter((p) => LEVEL_RANK[p.level] <= cap && !(q.heart && (p.kind !== 'daily' || p.eatH < 10)) && !(q.diabetes !== 'none' && q.diabetes !== 'prediabetes' && p.kind !== 'daily')).map((p) => p.id);
}

/**
 * Place the eating window inside the waking day so the post-workout meal (≈ 30 min after the session) is inside it,
 * plus a pre-workout meal (≈ 2 h before) for long/hard sessions. Works in "minutes since waking", so night shifts and
 * windows that cross midnight are handled. Prefers ending ≥ 3 h before bed; `early` picks the earliest valid window.
 */
export function placeWindow(eatH: number, q: Pick<FastQuiz, 'wake' | 'bed' | 'train' | 'trainClock' | 'sessionMin' | 'hard'>, early = false): { window: EatWindow; notes: string[] } {
  const notes: string[] = [];
  const wake = toMin(q.wake), bed = toMin(q.bed);
  let awake = fwd(wake, bed); if (awake < 8 * 60) awake = 16 * 60; // nonsense input → assume 16 h awake
  const len = eatH * 60;
  const firstOk = 60; // first meal ≥ 1 h after waking
  const hardEnd = awake - 60; // last meal ≥ 1 h before bed
  const anchorEnd = awake - 180; // preferred: finish eating ~3 h before bed
  const trains = q.train !== 'none' && q.train !== 'varies';
  const t = trains ? fwd(wake, toMin(q.trainClock)) : -1;
  const trainsAwake = trains && t >= 0 && t < awake;
  const sess = Math.max(15, Math.min(240, q.sessionMin || 60));
  const post = t + sess + 30;
  const needPre = trainsAwake && (q.hard || sess > 60);
  const pre = t - 120;
  const cands: number[] = [];
  for (let s = firstOk; s + len <= hardEnd; s += 30) cands.push(s);
  if (!cands.length) cands.push(Math.max(0, Math.min(firstOk, awake - len)));
  const valid = (s: number, withPre: boolean) => {
    if (!trainsAwake) return true;
    const okPost = post >= s && post <= s + len;
    const okPre = !withPre || (pre >= s && pre <= s + len);
    return okPost && okPre;
  };
  const pick = (withPre: boolean) => {
    const v = cands.filter((s) => valid(s, withPre));
    if (!v.length) return null;
    if (early) return v[0];
    return v.reduce((b, s) => (Math.abs(s + len - anchorEnd) < Math.abs(b + len - anchorEnd) ? s : b), v[0]);
  };
  let s = pick(needPre);
  if (s == null && needPre) { s = pick(false); if (s != null) notes.push('This window can’t hold both a pre- and post-workout meal. Eating before long sessions improves performance — consider a longer window (or eating normally) on long or hard days.'); }
  if (s == null) { s = pick(false) ?? (early ? cands[0] : cands.reduce((b, x) => (Math.abs(x + len - anchorEnd) < Math.abs(b + len - anchorEnd) ? x : b), cands[0])); if (trainsAwake) notes.push('Your training time doesn’t fit this eating window. On training days, slide the window so your post-workout meal is inside it.'); }
  if (trainsAwake && t < s && !needPre && valid(s, false)) notes.push('You’ll train near the end of your fast and eat soon after. That’s fine for shorter sessions; for long or hard ones, eat beforehand.');
  if (q.train === 'varies') notes.push('Your training time varies: on training days, slide the window so your post-workout meal lands inside it.');
  const start = toHM(wake + s);
  return { window: { start, end: toHM(toMin(start) + len), eatH }, notes };
}

export function recommend(q: FastQuiz): Recommendation | null {
  const sc = screen(q);
  if (sc.level === 'stop') return null;
  const allowed = allowedProtocols(q, sc);
  const has = (id: ProtocolId) => allowed.includes(id);
  const why: string[] = [];
  let pick: ProtocolId;
  let startWith: ProtocolId | undefined;
  const athleteHeavy = q.goal === 'performance' || q.trainDays >= 5 || q.hard;
  if (q.heart) { pick = q.experience === 'none' ? 'tre12' : 'tre14'; why.push('With heart disease, HYBRD keeps your eating window at 10–12 hours (see the safety note).'); }
  else if (sc.level === 'caution') { pick = q.experience === 'none' ? 'tre12' : 'tre14'; why.push('Because of a health flag, HYBRD starts you on a gentle beginner pattern until your doctor says otherwise.'); }
  else if (q.prefer === 'weekly' && q.goal === 'weight' && has('fiveTwo') && !athleteHeavy) { pick = 'fiveTwo'; why.push('You prefer a couple of focused days over a daily window — 5:2 matched daily calorie restriction for weight loss.'); }
  else if (q.experience === 'none') { pick = 'tre14'; startWith = 'tre12'; why.push('New to fasting: the NEJM review suggests starting with a 10-hour eating window on 5 days a week and building up over months.'); }
  else if (q.experience === 'some') {
    pick = athleteHeavy ? 'tre14' : 'tre16';
    why.push(athleteHeavy ? 'You train a lot: a 10-hour window leaves room for pre- and post-workout meals and 3–4 protein feeds.' : 'You’ve fasted before, so 16:8 is a sensible next step.');
  } else {
    pick = athleteHeavy ? 'tre16' : q.goal === 'weight' ? 'tre16' : 'tre18';
    why.push(athleteHeavy ? 'With your training load, HYBRD caps the daily fast at 16 hours so you can fuel and recover.' : pick === 'tre18' ? 'You fast regularly; 18:6 is the next step in the gradual plan if 16:8 feels easy.' : 'You fast regularly: 16:8 is the best-studied daily pattern; longer windows didn’t add weight loss in trials that matched calories.');
  }
  // Early TRE for health goals when mornings suit (morning/midday training, or an early riser)
  const earlyRiser = toMin(q.wake) <= toMin('06:30') && toMin(q.wake) >= toMin('04:00');
  if ((pick === 'tre16') && q.goal === 'health' && (q.train === 'morning' || q.train === 'midday' || (q.train !== 'evening' && earlyRiser)) && has('etre')) {
    pick = 'etre'; why.push('Health focus + an early day: early eating windows improved insulin sensitivity and blood pressure in small trials.');
  }
  if (!has(pick)) pick = (allowed.find((id) => protocolById(id)!.kind === 'daily') as ProtocolId) || 'tre12';
  if (q.goal === 'weight') why.push('Weight loss still comes down to eating less overall — in trials, fasting matched (but didn’t beat) daily calorie control. Use it if it makes eating less easier.');
  if (q.goal === 'performance') why.push('Fasting hasn’t been shown to improve performance; it’s about fitting your routine without hurting training.');
  const p = protocolById(pick)!;
  const notes: string[] = [];
  let window: EatWindow | null = null;
  if (p.kind === 'daily') { const w = placeWindow(p.eatH, q, pick === 'etre'); window = w.window; notes.push(...w.notes); }
  else notes.push(p.kind === 'lowcal' ? 'Pick low-calorie days that are rest or easy training days, never back to back.' : 'Pick a rest day for your 24-hour fast.');
  const alternatives = allowed.filter((id) => id !== pick && Math.abs(LEVEL_RANK[protocolById(id)!.level] - LEVEL_RANK[p.level]) <= 1).slice(0, 3);
  return { protocol: pick, alternatives, window, why, notes, startWith, maxLevel: allowed.length ? protocolById(allowed[allowed.length - 1])!.level : 'beginner' };
}

/** Protein spread across the eating window: ~every 3–4 h, 20–40 g per meal (ISSN), capped 2–4 meals. */
export function proteinPlan(dailyProteinG: number, eatH: number) {
  const meals = eatH <= 0 ? 3 : Math.max(2, Math.min(4, Math.floor(eatH / 3.5) + 1));
  return { meals, perMeal: Math.round(dailyProteinG / meals) };
}
/** Low-calorie day target: 5:2 → 500 (women) / 600 (men) kcal (Johns Hopkins: one 500–600 kcal meal); modified ADF → ~25% of maintenance. */
export function lowCalTarget(protocol: ProtocolId, sex: Sex, maintenanceKcal: number) {
  if (protocol === 'madf') return Math.max(500, Math.round((maintenanceKcal * 0.25) / 10) * 10);
  return sex === 'male' ? 600 : 500;
}

// ---------------- timer ----------------
export interface FastLog extends Rec {
  date: string; // local YYYY-MM-DD the fast STARTED (indexed as `day` in Supabase)
  kind: 'timed' | 'lowcal';
  start: number; // epoch ms
  end?: number; // epoch ms; undefined = running
  targetH: number;
  protocol: ProtocolId | 'custom';
  note?: string;
}
export const H = 3600_000;
export const activeFast = (logs: FastLog[]) => logs.filter((l) => !l.deleted && l.kind === 'timed' && !l.end).sort((a, b) => b.start - a.start)[0] || null;
export const elapsedMs = (start: number, now: number) => Math.max(0, now - start);
export const fastHours = (l: FastLog, now = Date.now()) => elapsedMs(l.start, l.end ?? now) / H;
export const goalAt = (start: number, targetH: number) => start + targetH * H;
/** 0–1 progress toward the target (capped at 1). */
export const progress = (start: number, targetH: number, now: number) => Math.min(1, elapsedMs(start, now) / (targetH * H));
export const remainingMs = (start: number, targetH: number, now: number) => Math.max(0, goalAt(start, targetH) - now);
export const metTarget = (l: FastLog) => l.kind === 'lowcal' || (l.end != null && (l.end - l.start) >= l.targetH * H - 60_000); // 1-min grace
export const fmtDur = (ms: number) => { const m = Math.floor(Math.max(0, ms) / 60000); return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`; };
export const fmtClock = (ms: number) => { const s = Math.floor(Math.max(0, ms) / 1000); return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };

/** Local YYYY-MM-DD for an epoch ms. */
export const dayOf = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const shiftDay = (key: string, n: number) => { const d = new Date(key + 'T12:00:00'); d.setDate(d.getDate() + n); return dayOf(d.getTime()); };

/**
 * "I started at HH:MM" → epoch ms of the most recent past occurrence of that clock time (today, or yesterday if that
 * time hasn't happened yet today — e.g. 20:00 entered at 09:00 means last night). daysAgo forces an extra day back.
 */
export function startFromClock(hm: string, now: number, daysAgo = 0) {
  const d = new Date(now);
  const [h, m] = hm.split(':').map((x) => parseInt(x, 10) || 0);
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m, 0, 0);
  if (t.getTime() > now) t.setDate(t.getDate() - 1);
  t.setDate(t.getDate() - daysAgo);
  return t.getTime();
}
/** Validate an edited start: not in the future, not more than the 24-h cap + 12 h ago (typo guard), not before the previous fast ended. */
export function validStart(start: number, now: number, prevEnd?: number): string | null {
  if (start > now) return 'Start time can’t be in the future.';
  if (now - start > (MAX_FAST_H + 12) * H) return 'That’s more than 36 hours ago — HYBRD doesn’t track fasts over 24 hours.';
  if (prevEnd && start < prevEnd) return 'That overlaps your previous fast.';
  return null;
}

/** After a daily fast ends: the eating window runs eatH hours from the end; the next fast starts when it closes. */
export function eatingWindow(end: number, eatH: number, now: number) {
  const closes = end + eatH * H;
  return { closes, leftMs: Math.max(0, closes - now), open: now < closes, nextFastAt: closes };
}

// ---------------- stages (hedged — timing varies person to person) ----------------
export interface Stage { from: number; to: number; key: string; title: string; body: string; src: string[] }
export const STAGES: Stage[] = [
  { from: 0, to: 4, key: 'fed', title: 'Digesting', body: 'Your body is still using energy from your last meal.', src: ['fast-anton'] },
  { from: 4, to: 12, key: 'post', title: 'Running on stores', body: 'Like a normal overnight fast: insulin falls and your liver releases stored glycogen for energy.', src: ['fast-anton', 'fast-decabo'] },
  { from: 12, to: 18, key: 'switch', title: 'Metabolic switch may begin', body: 'Reviews describe a shift toward burning more fat and making ketones that typically starts somewhere beyond ~12 h. Exactly when depends on your last meal, your liver glycogen and how active you are.', src: ['fast-anton', 'fast-decabo'] },
  { from: 18, to: 24, key: 'deep', title: 'Longer fast', body: 'Fat use and ketones tend to keep rising. Autophagy (cell “clean-up”) rises with fasting in animal and cell studies; human data are early and small, and no study shows a set hour when it starts in people.', src: ['fast-anton', 'fast-jamshed19', 'fast-bagherniya'] },
  { from: 24, to: Infinity, key: 'cap', title: 'Past 24 hours', body: 'HYBRD doesn’t guide fasts longer than 24 h. Longer fasts aren’t necessarily better and may be dangerous — consider breaking your fast.', src: ['fast-hopkins'] },
];
export const stageAt = (hours: number) => STAGES.find((s) => hours >= s.from && hours < s.to) || STAGES[STAGES.length - 1];

// ---------------- history & streaks ----------------
/** Day a completed fast counts for: the local day it ended (low-cal days: their own date). */
export const creditDay = (l: FastLog) => (l.kind === 'lowcal' ? l.date : dayOf(l.end ?? l.start));
export const doneDays = (logs: FastLog[]) => new Set(logs.filter((l) => !l.deleted && (l.kind === 'lowcal' || l.end != null) && metTarget(l)).map(creditDay));

/** Consecutive days with a completed fast, ending today (or yesterday, so an in-progress day doesn't reset it). */
export function dayStreak(logs: FastLog[], today: string) {
  const set = doneDays(logs);
  let d = set.has(today) ? today : shiftDay(today, -1);
  let n = 0;
  while (set.has(d)) { n++; d = shiftDay(d, -1); }
  return n;
}
export function bestDayStreak(logs: FastLog[]) {
  const days = [...doneDays(logs)].sort();
  let best = 0, cur = 0, prev = '';
  for (const d of days) { cur = prev && shiftDay(prev, 1) === d ? cur + 1 : 1; best = Math.max(best, cur); prev = d; }
  return best;
}
/** Monday of the week containing key. */
export const weekStart = (key: string) => { const d = new Date(key + 'T12:00:00'); const wd = (d.getDay() + 6) % 7; return shiftDay(key, -wd); };
/** Weekly protocols (5:2, ADF, 24 h): consecutive weeks (ending this week, or last week if this week isn't done yet) hitting perWeek fast days. */
export function weekStreak(logs: FastLog[], perWeek: number, today: string) {
  const set = doneDays(logs);
  const count = (ws: string) => Array.from({ length: 7 }, (_, i) => shiftDay(ws, i)).filter((d) => set.has(d)).length;
  let ws = weekStart(today);
  if (count(ws) < perWeek) ws = shiftDay(ws, -7);
  let n = 0;
  while (count(ws) >= perWeek && n < 520) { n++; ws = shiftDay(ws, -7); }
  return n;
}
/** Last 7 days (oldest first): longest fast credited to each day, and whether a target was met. */
export function weekView(logs: FastLog[], today: string, now = Date.now()) {
  return Array.from({ length: 7 }, (_, i) => {
    const day = shiftDay(today, i - 6);
    const ls = logs.filter((l) => !l.deleted && creditDay(l) === day && (l.end != null || l.kind === 'lowcal'));
    const hours = ls.reduce((m, l) => Math.max(m, l.kind === 'lowcal' ? 0 : fastHours(l, now)), 0);
    return { day, hours, met: ls.some(metTarget), lowcal: ls.some((l) => l.kind === 'lowcal'), target: ls.reduce((m, l) => Math.max(m, l.targetH), 0) };
  });
}
export function stats(logs: FastLog[], today: string, now = Date.now()) {
  const done = logs.filter((l) => !l.deleted && l.kind === 'timed' && l.end != null);
  const last7 = done.filter((l) => creditDay(l) > shiftDay(today, -7));
  const avg7 = last7.length ? last7.reduce((a, l) => a + fastHours(l, now), 0) / last7.length : 0;
  const longest = done.reduce((m, l) => Math.max(m, fastHours(l, now)), 0);
  return { total: done.length + logs.filter((l) => !l.deleted && l.kind === 'lowcal').length, avg7, longest, metRate: done.length ? done.filter(metTarget).length / done.length : 0 };
}

// ---------------- plan (stored on the profile) ----------------
export interface FastPlan { protocol: ProtocolId; quiz: FastQuiz; window: EatWindow | null; lowDays?: number[]; createdAt: string; ack?: boolean; level: Screen['level'] }
/** Default low-calorie days (0 = Monday): 5:2 → Mon + Thu; ADF → Mon/Wed/Fri; 24 h → Mon. */
export const defaultLowDays = (p: ProtocolId) => (p === 'madf' ? [0, 2, 4] : p === 'fiveTwo' ? [0, 3] : p === 'once24' ? [0] : []);
export const weekdayIdx = (key: string) => (new Date(key + 'T12:00:00').getDay() + 6) % 7;
