// Mind & Recovery (/mind) — pure logic (no React, no JSON imports) so tools/test-mind.ts can run it in plain Node.
// Safety (crisis words, red flags, screening tools), daily readiness heuristic, session-RPE training load, recovery planner,
// cold/heat advice, breathing pacer maths, trends/streaks/patterns. Every rule maps to a source id (mind-*) in src/data/sources.ts;
// see APP-BUILDER-NOTES.md › "Mind & Recovery".
import type { Rec } from './types';
import { addDays } from './calc';
import { GRADES, GRADE_LABEL, GRADE_HINT, type Grade } from './sleep';

export { GRADES, GRADE_LABEL, GRADE_HINT };
export type { Grade };
const DAY = 86_400_000;
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const sd = (a: number[]) => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
/** Local YYYY-MM-DD of an ISO datetime or epoch ms (same as calc.dayKeyOf, kept local so tests can pass plain dates). */
export const dayOf = (iso: string | number) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export const daysBetween = (a: string, b: string) => Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / DAY);

// =====================================================================================================================
// Crisis support — shown on every Mind screen, in every risk message and on /mind/help.
// =====================================================================================================================
export const CRISIS = {
  us: { call: 'tel:988', text: 'sms:988', label: 'Call or text 988', who: '988 Suicide & Crisis Lifeline (US) — free, confidential, 24/7' },
  emergency: { call: 'tel:911', label: 'Call 911', who: 'Emergency in the US — immediate danger or a medical emergency' },
  intl: 'Outside the US: contact your local emergency services, or find a free helpline in your country at findahelpline.com.',
  intlUrl: 'https://findahelpline.com/',
  src: ['mind-988', 'mind-findahelpline', 'mind-nimh-suicide'],
} as const;
export const NOT_THERAPY = 'HYBRD Mind is self-care and training support, not therapy, diagnosis or medical advice. It can’t respond to emergencies.';

/** Words that suggest someone may be thinking about suicide or self-harm (NIMH warning signs). Training slang is excluded. */
const CRISIS_RE = /\b(kill(ing)? my ?self|end(ing)? (my|it) (life|all)|suicid(e|al)|want(ed)? to die|wish i (was|were) dead|better off dead|hurt(ing)? my ?self|self[- ]?harm(ing)?|cut(ting)? my ?self|no reason to (live|go on)|take my (own )?life|overdos(e|ing))\b/i;
const CRISIS_SLANG = /\bsuicides?\b[\s-]*(sprints?|drills?|runs?|lines?|shuttles?|squats?)\b/gi;
/** True when free text (journal, check-in note) contains crisis language. Not a risk assessment — it only triggers supportive messaging. */
export function crisisInText(text: string | undefined | null): boolean {
  if (!text) return false;
  const t = text.replace(CRISIS_SLANG, ' ');
  return CRISIS_RE.test(t);
}

// =====================================================================================================================
// Setup + safety screen (profile.mind)
// =====================================================================================================================
export type MindGoal = 'strength' | 'endurance' | 'hybrid' | 'general';
export type MindFocus = 'stress' | 'sleep' | 'confidence' | 'discipline' | 'focus' | 'recovery';
export interface MindQuiz {
  age: number;
  heart: boolean; // heart condition, chest pain on exertion, fainting, or uncontrolled high blood pressure
  pregnant: boolean;
  respiratory: boolean; // asthma / COPD / other lung condition
  epilepsy: boolean;
  panic: boolean; // panic attacks or panic disorder
  mhCare: boolean; // currently getting mental-health care or taking medicine for mood/anxiety
  cold: boolean; // Raynaud's, cold urticaria or similar cold sensitivity
  goal: MindGoal;
  focus: MindFocus[];
  privateJournal: boolean; // keep journal + check-ups on this device only (never synced)
}
export type MindLevel = 'ok' | 'caution' | 'minor';
export interface MindPlan { quiz: MindQuiz; createdAt: string; level: MindLevel; ack?: boolean }
export type MindReason = 'under18' | 'heart' | 'pregnant' | 'respiratory' | 'epilepsy' | 'panic' | 'mhCare' | 'cold';
export const MIND_REASON_TEXT: Record<MindReason, string> = {
  under18: 'You’re under 18. Everything here is written for you too, but please share how you’re feeling with a parent, guardian, school counselor or doctor — and if things feel too much, call or text 988 (US) any time. No ice baths for under-18s in HYBRD.',
  heart: 'Heart condition, chest pain when exercising, fainting or high blood pressure: ask your doctor before cold-water immersion or sauna. Gentle breathing without breath-holds is fine.',
  pregnant: 'Pregnant: skip breath-holds (use resonance or sighing patterns) and ask your midwife or doctor before sauna or cold-water immersion.',
  respiratory: 'Asthma or a lung condition: breathe gently through the nose, skip long holds, and stop if you feel wheezy or light-headed.',
  epilepsy: 'Epilepsy: avoid fast or forced breathing and long breath-holds; slow, gentle breathing patterns are the ones offered to you.',
  panic: 'Panic attacks: slow, exhale-focused breathing helps many people, but focusing on the breath can occasionally make anxiety worse. Go gently, keep your eyes open if you like, and stop if it feels worse.',
  mhCare: 'You’re already getting mental-health care: great. Use HYBRD alongside it, not instead of it, and share anything that worries you with your clinician.',
  cold: 'Cold sensitivity (e.g. Raynaud’s): skip cold-water immersion.',
};
export const MIND_REASON_SRC: Record<MindReason, string[]> = {
  under18: ['mind-nimh-teens', 'mind-988'], heart: ['mind-tipton', 'mind-laukkanen', 'ultra-riebe'], pregnant: ['mind-bentley', 'mind-laukkanen', 'mind-tipton'],
  respiratory: ['mind-bentley', 'mind-nccih-relax'], epilepsy: ['mind-bentley', 'mind-nccih-relax'], panic: ['mind-nccih-relax', 'mind-farias'],
  mhCare: ['mind-ioc-mh', 'mind-nccih-med'], cold: ['mind-tipton'],
};
export const defaultMindQuiz = (p: { age?: number; disciplines?: string[] } = {}): MindQuiz => ({
  age: p.age || 30, heart: false, pregnant: false, respiratory: false, epilepsy: false, panic: false, mhCare: false, cold: false,
  goal: goalFromDisciplines(p.disciplines || []), focus: ['stress', 'recovery'], privateJournal: false,
});
export function goalFromDisciplines(d: string[]): MindGoal {
  const str = d.some((x) => ['strength', 'calisthenics'].includes(x));
  const end = d.some((x) => ['running', 'cycling', 'walking', 'cardio'].includes(x));
  if (d.includes('hybrid') || d.includes('hyrox') || (str && end)) return 'hybrid';
  return str ? 'strength' : end ? 'endurance' : 'general';
}
export function mindScreen(q: MindQuiz): { level: MindLevel; reasons: MindReason[] } {
  const reasons: MindReason[] = [];
  if (q.age < 18) reasons.push('under18');
  for (const k of ['heart', 'pregnant', 'respiratory', 'epilepsy', 'panic', 'mhCare', 'cold'] as const) if (q[k]) reasons.push(k);
  return { level: q.age < 18 ? 'minor' : reasons.length ? 'caution' : 'ok', reasons };
}

export type Tool = 'box' | 'sigh' | 'resonance' | 'prerace' | 'cold' | 'sauna' | 'foam' | 'mobility';
export type ToolStatus = 'ok' | 'care' | 'doctor' | 'avoid';
/** Per-tool safety for this person. 'care' = OK with the modification shown; 'doctor' = ask first; 'avoid' = not offered. */
export function toolStatus(tool: Tool, q: Pick<MindQuiz, 'age' | 'heart' | 'pregnant' | 'respiratory' | 'epilepsy' | 'panic' | 'cold'>): { status: ToolStatus; why: MindReason[] } {
  const why: MindReason[] = [];
  const minor = q.age < 18;
  if (tool === 'box') { // breath-holds
    if (q.pregnant) why.push('pregnant'); if (q.heart) why.push('heart'); if (q.respiratory) why.push('respiratory'); if (q.epilepsy) why.push('epilepsy'); if (q.panic) why.push('panic');
    return { status: why.length ? 'care' : 'ok', why };
  }
  if (tool === 'sigh' || tool === 'resonance' || tool === 'prerace') {
    if (q.respiratory) why.push('respiratory'); if (q.panic) why.push('panic');
    return { status: why.length ? 'care' : 'ok', why };
  }
  if (tool === 'cold') {
    if (q.cold) return { status: 'avoid', why: ['cold'] };
    if (minor) return { status: 'avoid', why: ['under18'] };
    if (q.heart) why.push('heart'); if (q.pregnant) why.push('pregnant');
    return { status: why.length ? 'doctor' : 'ok', why };
  }
  if (tool === 'sauna') {
    if (q.heart) why.push('heart'); if (q.pregnant) why.push('pregnant');
    if (why.length) return { status: 'doctor', why };
    return minor ? { status: 'care', why: ['under18'] } : { status: 'ok', why };
  }
  return { status: 'ok', why };
}

// =====================================================================================================================
// HYBRD Pulse — HYBRD's own weekly well-being reflection (replaced the retired licensed index in Nov 2026).
// Every word, the 0–4 emoji scale, the scoring and the bands are original to HYBRD. It is a general-wellness
// self-reflection tool: NOT validated, NOT a screening test, NOT a diagnosis — see PULSE_DISCLAIMER and APP-BUILDER-NOTES.
// =====================================================================================================================
export type PulseKey = 'energy' | 'sleep' | 'mood' | 'stress' | 'drive' | 'recovery';
export interface PulseItem { k: PulseKey; label: string; q: string; lo: string; hi: string; tip: string; link: string; linkLabel: string }
/** Order matters: answers are stored as a 6-number array in this order (ScreenResult.pulse). Higher is always better. */
export const PULSE_ITEMS: PulseItem[] = [
  { k: 'energy', label: 'Energy', q: 'How much fuel has been in your tank for training and everyday life?', lo: 'Running on empty', hi: 'Fully charged',
    tip: 'Energy dipping? Check the basics first: regular meals with enough carbs around training, water, and a lighter day or two.', link: '/fuel', linkLabel: 'Open Fuel' },
  { k: 'sleep', label: 'Sleep', q: 'How well has your sleep been recharging you?', lo: 'Barely at all', hi: 'Fully recharged',
    tip: 'Protect sleep this week: a steady bedtime, caffeine before early afternoon, and a 10-minute wind-down.', link: '/fuel/sleep', linkLabel: 'Sleep tools' },
  { k: 'mood', label: 'Mood', q: 'Overall, how has your mood been?', lo: 'Really low', hi: 'Really good',
    tip: 'Mood low? Easy movement outdoors, time with people you like and a few lines in your journal can all help.', link: '/mind?tab=journal', linkLabel: 'Journal' },
  { k: 'stress', label: 'Stress', q: 'How manageable has your stress load felt?', lo: 'Overwhelming', hi: 'Easy to handle',
    tip: 'Stress running high? Five minutes of slow breathing with long exhales is a quick way to take the edge off.', link: '/mind/breathe/sigh', linkLabel: 'Breathe 5 min' },
  { k: 'drive', label: 'Drive', q: 'How strong has your drive been to move and work toward your goals?', lo: 'No drive', hi: 'Fired up',
    tip: 'Drive fading? Shrink the goal: plan one short session you can’t say no to, and decide exactly when and where you’ll do it.', link: '/mind?tab=skills', linkLabel: 'Mental skills' },
  { k: 'recovery', label: 'Recovery', q: 'How well has your body been bouncing back between sessions?', lo: 'Beat up and sore', hi: 'Bouncing back well',
    tip: 'Body not bouncing back? Swap one hard session for an easy one, and use a recovery routine after training.', link: '/mind?tab=recover', linkLabel: 'Recovery planner' },
];
export const PULSE_SCALE: { v: number; emoji: string; label: string }[] = [
  { v: 0, emoji: '😣', label: 'Very poor' }, { v: 1, emoji: '🙁', label: 'Poor' }, { v: 2, emoji: '😐', label: 'Okay' }, { v: 3, emoji: '🙂', label: 'Good' }, { v: 4, emoji: '😄', label: 'Great' },
];
export const PULSE_PERIOD = 'the past 7 days';
export const PULSE_MAX = PULSE_ITEMS.length * 4;
export type PulseBand = 'thriving' | 'steady' | 'low' | 'care';
/** HYBRD's own bands for reading your trend — not clinical cut-offs. */
export const PULSE_BAND: Record<PulseBand, { label: string; min: number; text: string }> = {
  thriving: { label: 'Thriving', min: 75, text: 'You’re in a good place this week. Keep doing what’s working.' },
  steady: { label: 'Steady', min: 55, text: 'A solid week with a soft spot or two. Small tweaks below.' },
  low: { label: 'Running low', min: 35, text: 'A tougher week. Go easier on yourself and lean on the basics: sleep, food, easy movement, people.' },
  care: { label: 'Needs some care', min: 0, text: 'This week has been heavy. Make rest and support the priority — training can wait.' },
};
export const pulseBand = (score: number): PulseBand => (score >= PULSE_BAND.thriving.min ? 'thriving' : score >= PULSE_BAND.steady.min ? 'steady' : score >= PULSE_BAND.low.min ? 'low' : 'care');
export interface PulseResult { score: number; band: PulseBand; items: { k: PulseKey; label: string; v: number; pct: number }[]; focus: PulseKey[]; support: boolean }
/** 0–100 = sum of six 0–4 answers ÷ 24 × 100. `focus` = up to 2 lowest areas scoring ≤ 2. `support` = show the gentle 988 line. */
export function pulseScore(a: number[] | undefined): PulseResult | null {
  if (!a || a.length !== PULSE_ITEMS.length || a.some((x) => !Number.isInteger(x) || x < 0 || x > 4)) return null;
  const score = Math.round((a.reduce((s, x) => s + x, 0) / PULSE_MAX) * 100);
  const items = PULSE_ITEMS.map((it, i) => ({ k: it.k, label: it.label, v: a[i], pct: a[i] * 25 }));
  const focus = items.filter((x) => x.v <= 2).sort((x, y) => x.v - y.v).slice(0, 2).map((x) => x.k);
  const mood = a[PULSE_ITEMS.findIndex((x) => x.k === 'mood')];
  return { score, band: pulseBand(score), items, focus, support: score < PULSE_BAND.low.min || mood === 0 };
}
export const PULSE_DISCLAIMER = 'HYBRD Pulse is an original self-reflection tool for general wellness. It is not a medical device, a validated or clinical questionnaire, a screening test or a diagnosis, and it is not medical advice. Scores are HYBRD’s own rule of thumb to help you notice your trends.';
export const pulseTalk = (minor: boolean) => (minor ? 'a parent or guardian, a school counselor or your doctor' : 'your doctor or another qualified professional');
/** Gentle, non-alarming support line shown when a Pulse is low. Names no condition, no threshold, no diagnosis. */
export const pulseSupportLine = (minor: boolean) => `Rough stretch? You don’t have to carry it alone. Talk to someone you trust${minor ? ' — like a parent, guardian or school counselor' : ''}, and if things ever feel like too much, you can call or text 988 (US) any time — free and confidential.`;
/** Pulse scores oldest → newest (only check-ins with a Pulse; retired-format entries are skipped). */
export function pulseTrend(screens: Pick<ScreenResult, 'date' | 'pulse' | 'deleted' | 'id'>[], n = 8): { id: string; date: string; score: number; band: PulseBand }[] {
  return screens.filter((s) => !s.deleted && s.pulse).map((s) => ({ s, p: pulseScore(s.pulse) })).filter((x) => x.p)
    .sort((x, y) => x.s.date.localeCompare(y.s.date)).slice(-n).map((x) => ({ id: x.s.id, date: x.s.date, score: x.p!.score, band: x.p!.band }));
}

// Optional add-on: PHQ-2 + GAD-2 (PHQ-4) — free to use (Pfizer PHQ Screeners: “No permission required to reproduce,
// translate, display or distribute”). Off by default; the user opts in inside the Pulse sheet.
/** PHQ-2 + GAD-2 items (PHQ-4), verbatim. 0–3 for “over the last 2 weeks”. */
export const PHQ4_ITEMS = ['Little interest or pleasure in doing things', 'Feeling down, depressed, or hopeless', 'Feeling nervous, anxious or on edge', 'Not being able to stop or control worrying'];
export const PHQ4_SCALE = [{ v: 0, label: 'Not at all' }, { v: 1, label: 'Several days' }, { v: 2, label: 'More than half the days' }, { v: 3, label: 'Nearly every day' }];
export const SAFETY_Q = 'In the past 2 weeks, have you had thoughts of ending your life or of hurting yourself?';
export type SafetyAnswer = 'yes' | 'no' | 'skip';

export function phq4Score(a: number[]): { phq2: number; gad2: number; total: number; dep: boolean; anx: boolean } | null {
  if (a.length !== 4 || a.some((x) => !Number.isInteger(x) || x < 0 || x > 3)) return null;
  const phq2 = a[0] + a[1], gad2 = a[2] + a[3];
  return { phq2, gad2, total: phq2 + gad2, dep: phq2 >= 3, anx: gad2 >= 3 }; // ≥ 3 = recommended screening cut-point for each
}
export type ScreenLevel = 'crisis' | 'professional' | 'watch' | 'ok' | 'legacy';
/** A Pulse check-in (v 2). Records saved before Nov 2026 may carry `who5` — answers to a retired licensed index. They are kept
 *  untouched so nothing breaks and they still sync/export, but they are never scored, shown or compared with Pulse. */
export interface ScreenResult extends Rec { date: string; v?: 2; pulse?: number[]; /** @deprecated retired format, kept as-is */ who5?: number[]; phq4?: number[]; safety?: SafetyAnswer; localOnly?: boolean; sample?: boolean }
export const isLegacyScreen = (s: Pick<ScreenResult, 'pulse' | 'who5'>) => !s.pulse && Array.isArray(s.who5);
export interface ScreenOutcome { level: ScreenLevel; title: string; lines: string[]; src: string[]; pulse: PulseResult | null; support: boolean }
export function screenOutcome(s: Pick<ScreenResult, 'pulse' | 'who5' | 'phq4' | 'safety'>, minor = false): ScreenOutcome {
  const pulse = pulseScore(s.pulse), p = s.phq4 ? phq4Score(s.phq4) : null;
  const talk = pulseTalk(minor);
  if (s.safety === 'yes') return {
    level: 'crisis', title: 'Thank you for telling us. You don’t have to handle this alone.', pulse, support: true,
    lines: ['Please reach out now: call or text 988 (US) to talk with a trained counselor, any time, free and confidential.', 'If you might act on these thoughts or are in danger, call 911 or go to the nearest emergency room. Outside the US, contact your local emergency services.', `When you can, also tell ${talk} — and someone you trust.`],
    src: ['mind-988', 'mind-nimh-suicide', 'mind-dazzi'],
  };
  const lines: string[] = [], src: string[] = [];
  if (pulse) { lines.push(`Pulse ${pulse.score}/100 · ${PULSE_BAND[pulse.band].label}. ${PULSE_BAND[pulse.band].text}`); src.push('mind-saw', 'mind-hooper'); }
  else if (isLegacyScreen(s)) lines.push('Older check-up in a retired format. Your answers are kept, but they aren’t scored or compared with HYBRD Pulse.');
  if (p) {
    lines.push(p.dep ? `Mood items ${p.phq2}/6 — at or above the PHQ-2 screening cut-off (3).` : `Mood items ${p.phq2}/6 (PHQ-2).`);
    lines.push(p.anx ? `Worry items ${p.gad2}/6 — at or above the GAD-2 screening cut-off (3).` : `Worry items ${p.gad2}/6 (GAD-2).`);
    src.push('mind-phq2', 'mind-gad2');
  }
  if (p && (p.dep || p.anx)) return {
    level: 'professional', title: 'Worth talking to someone', pulse, support: true,
    lines: [...lines, `This is a screening result, not a diagnosis. Scores like this are a good reason to talk with ${talk} — support works, and asking for it is a strength.`],
    src: [...src, 'mind-smhat'],
  };
  const support = !!pulse?.support;
  if (support) return {
    level: 'watch', title: 'Go easy on yourself this week', pulse, support,
    lines: [...lines, `If you’ve felt like this for a couple of weeks or more, or it’s getting in the way of daily life, talking with ${talk} can really help.`],
    src: [...src, 'mind-nimh-caring', 'mind-988'],
  };
  if (!pulse && !p) return { level: 'legacy', title: 'Older check-up', pulse, support: false, lines, src };
  const borderline = (pulse && pulse.band === 'low') || (p && (p.phq2 === 2 || p.gad2 === 2));
  if (borderline) return { level: 'watch', title: 'Keep an eye on it', pulse, support: false, lines: [...lines, 'Be kind to yourself this week. If low mood or worry sticks around for 2 weeks or more, or gets in the way of daily life, talk to someone.'], src: [...src, 'mind-nimh-caring'] };
  return { level: 'ok', title: pulse?.band === 'thriving' ? 'Looking strong' : 'Looking steady', pulse, support: false, lines: [...lines, 'Check in again next week to see your trend.'], src };
}

// =====================================================================================================================
// Daily check-in → readiness (a transparent heuristic, formula version 1)
// =====================================================================================================================
export type Scale5 = 1 | 2 | 3 | 4 | 5;
export type Pain = 'none' | 'niggle' | 'sharp';
export type RedFlag = 'chest' | 'head' | 'numb' | 'swelling' | 'urine' | 'bone' | 'fever';
export const RED_FLAGS: { v: RedFlag; label: string; action: string; src: string[]; emergency?: boolean }[] = [
  { v: 'chest', label: 'Chest pain or pressure, fainting, or unusual breathlessness', action: 'Stop. If it’s happening now or spreading to your arm, jaw or back, call 911.', src: ['mind-nhlbi-heart'], emergency: true },
  { v: 'numb', label: 'Sudden numbness, tingling or weakness (especially one side)', action: 'Stop. Sudden one-sided weakness, confusion or trouble speaking is an emergency — call 911.', src: ['mind-medline-numb'], emergency: true },
  { v: 'head', label: 'Hit your head, or headache, dizziness or confusion after a knock', action: 'No training today. Get checked for concussion before you return.', src: ['mind-patricios'] },
  { v: 'urine', label: 'Dark (tea/cola-coloured) urine with severe muscle pain or weakness', action: 'Get urgent medical care today — this can be rhabdomyolysis.', src: ['mind-medline-rhabdo'], emergency: true },
  { v: 'swelling', label: 'Sudden sharp pain, a “pop”, fast swelling, or can’t put weight on it', action: 'Stop training that area and see a clinician.', src: ['mind-aaos-sprain'] },
  { v: 'bone', label: 'Pain in one bony spot that builds with running or jumping', action: 'Stop impact training and see a clinician — it can be a stress fracture.', src: ['mind-aaos-stress'] },
  { v: 'fever', label: 'Fever, chills or body aches', action: 'Rest until you’re better. Hard training while ill isn’t worth it.', src: ['mind-schwellnus'] },
];
export interface CheckIn extends Rec {
  date: string; // YYYY-MM-DD
  mood: Scale5; stress: Scale5; energy: Scale5; motivation: Scale5; soreness: Scale5; sleepQ: Scale5;
  sleepH?: number; sleepFrom?: 'log' | 'manual';
  hrv?: number; // morning rMSSD in ms, typed in from a chest strap or app
  rhr?: number; // morning resting heart rate
  pain?: Pain; ill?: boolean; flags?: RedFlag[];
  note?: string;
  score: number; rec: Rec4; v: 1;
  sample?: boolean;
}
export type Rec4 = 'go' | 'easy' | 'recover' | 'stop';
export const REC_LABEL: Record<Rec4, string> = { go: 'Train as planned', easy: 'Go easier', recover: 'Recovery day', stop: 'Stop — get checked' };
export const REC_TEXT: Record<Rec4, string> = {
  go: 'You’re reporting good recovery. Do the session you planned — warm up properly and listen to your body.',
  easy: 'Keep moving, but keep it easy: an easy aerobic session, technique work, or your planned session with the hard part cut by about a third.',
  recover: 'Make today about recovery: rest, an easy walk, mobility or breathing. You’ll get more out of tomorrow.',
  stop: 'Don’t train today. See the steps below and get checked by a clinician.',
};
/** Weights of the 1–5 items (sum 1). Hooper/McLean domains (sleep, soreness, fatigue/energy, stress, mood) plus motivation. */
export const WEIGHTS = { sleepQ: 0.2, soreness: 0.2, energy: 0.2, stress: 0.15, mood: 0.15, motivation: 0.1 } as const;
type Item = keyof typeof WEIGHTS;
export const ITEM_LABEL: Record<Item, string> = { sleepQ: 'Sleep quality', soreness: 'Soreness', energy: 'Energy', stress: 'Stress', mood: 'Mood', motivation: 'Motivation' };
const INVERTED: Item[] = ['stress', 'soreness'];
/** 0 (worst) … 1 (best) for an item. Stress and soreness are inverted (5 = very stressed/sore). */
export const itemScore = (k: Item, v: number) => (INVERTED.includes(k) ? (5 - v) / 4 : (v - 1) / 4);
export interface ReadinessInput {
  mood: number; stress: number; energy: number; motivation: number; soreness: number; sleepQ: number;
  sleepH?: number; hrv?: number; rhr?: number; pain?: Pain; ill?: boolean; flags?: RedFlag[]; age?: number;
}
export interface Factor { label: string; points: number; why: string; src: string[]; kind: 'item' | 'sleep' | 'hrv' | 'rhr' | 'load' }
export interface Baselines { hrvLn?: { mean: number; sd: number; n: number }; rhr?: { mean: number; n: number } }
export interface Readiness { score: number; wellness: number; rec: Rec4; factors: Factor[]; overrides: string[]; notes: string[]; src: string[] }

/** 7-day rolling baselines from previous check-ins (Plews: average ln rMSSD over 7 days, need ≥ 5 values). */
export function baselines(prev: Pick<CheckIn, 'date' | 'hrv' | 'rhr' | 'deleted'>[], today: string): Baselines {
  const win = prev.filter((c) => !c.deleted && c.date < today && daysBetween(c.date, today) <= 7);
  const h = win.map((c) => c.hrv).filter((x): x is number => typeof x === 'number' && x > 0).map(Math.log);
  const r = win.map((c) => c.rhr).filter((x): x is number => typeof x === 'number' && x > 0);
  return { hrvLn: h.length >= 5 ? { mean: mean(h), sd: sd(h), n: h.length } : undefined, rhr: r.length >= 5 ? { mean: mean(r), n: r.length } : undefined };
}
/** Sleep-hours adjustment (HYBRD default anchored on the 7 h adult / 8 h teen guidance). */
export function sleepPenalty(h: number | undefined, age = 30): number {
  if (h === undefined || !(h >= 0)) return 0;
  const need = age < 18 ? 8 : 7;
  if (h < need - 2) return -15;
  if (h < need - 1) return -10;
  if (h < need) return -5;
  return 0;
}
export function readiness(i: ReadinessInput, base: Baselines = {}, load?: { hardYesterday?: boolean }): Readiness {
  const factors: Factor[] = [];
  let wellness = 0;
  for (const k of Object.keys(WEIGHTS) as Item[]) {
    const v = clamp(Math.round(i[k]), 1, 5), s = itemScore(k, v);
    wellness += WEIGHTS[k] * s;
    const lost = Math.round(WEIGHTS[k] * 100 * (1 - s));
    if (lost > 0) factors.push({ label: `${ITEM_LABEL[k]} ${v}/5`, points: -lost, why: INVERTED.includes(k) ? `Higher ${ITEM_LABEL[k].toLowerCase()} lowers readiness.` : `Lower ${ITEM_LABEL[k].toLowerCase()} lowers readiness.`, src: ['mind-hooper', 'mind-mclean', 'mind-saw'], kind: 'item' });
  }
  let score = 100 * wellness;
  const sp = sleepPenalty(i.sleepH, i.age);
  if (sp) { score += sp; factors.push({ label: `${i.sleepH} h sleep`, points: sp, why: `Under ${(i.age ?? 30) < 18 ? 8 : 7} h. Sleep loss hurts endurance, mood and focus.`, src: ['sleep-watson', 'mind-fullagar'], kind: 'sleep' }); }
  if (typeof i.hrv === 'number' && i.hrv > 0 && base.hrvLn && base.hrvLn.sd > 0) {
    const z = (Math.log(i.hrv) - base.hrvLn.mean) / base.hrvLn.sd;
    if (z < -1) { score -= 10; factors.push({ label: `HRV ${Math.round(i.hrv)} ms`, points: -10, why: 'More than 1 SD below your 7-day average (one low day can be noise — look at the trend).', src: ['mind-plews', 'mind-buchheit'], kind: 'hrv' }); }
  }
  if (typeof i.rhr === 'number' && i.rhr > 0 && base.rhr && i.rhr - base.rhr.mean >= 5) {
    score -= 5; factors.push({ label: `Resting HR ${Math.round(i.rhr)}`, points: -5, why: `${Math.round(i.rhr - base.rhr.mean)} bpm above your 7-day average (HYBRD default: ≥ 5 bpm).`, src: ['mind-buchheit'], kind: 'rhr' });
  }
  if (load?.hardYesterday) { score -= 5; factors.push({ label: 'Hard session yesterday', points: -5, why: 'Fatigue and soreness often last 24–48 h after a hard session.', src: ['mind-mclean', 'mind-cheung'], kind: 'load' }); }
  score = Math.round(clamp(score, 0, 100));
  const overrides: string[] = [], notes: string[] = [];
  let rec: Rec4 = score >= 70 ? 'go' : score >= 50 ? 'easy' : 'recover';
  if (i.flags && i.flags.length) { rec = 'stop'; overrides.push('Red-flag symptom reported'); }
  else if (i.pain === 'sharp') { rec = 'stop'; overrides.push('Sharp pain reported'); }
  else if (i.ill) { rec = 'recover'; overrides.push('Feeling ill'); }
  else if (i.pain === 'niggle' && rec === 'go') { rec = 'easy'; overrides.push('A niggle — keep load off that area'); }
  if (i.stress >= 4 || i.mood <= 2) notes.push('Stress or mood is weighing on you today — a 3–5 minute breathing session or a few lines in your journal can help.');
  factors.sort((a, b) => a.points - b.points);
  return { score, wellness: +wellness.toFixed(3), rec, factors, overrides, notes, src: ['mind-hooper', 'mind-mclean', 'mind-saw', 'mind-kellmann'] };
}
export const validCheckIn = (c: Partial<CheckIn>) => !!c.date && (['mood', 'stress', 'energy', 'motivation', 'soreness', 'sleepQ'] as const).every((k) => typeof c[k] === 'number' && c[k]! >= 1 && c[k]! <= 5)
  && (c.sleepH === undefined || (c.sleepH >= 0 && c.sleepH <= 16)) && (c.hrv === undefined || (c.hrv >= 5 && c.hrv <= 300)) && (c.rhr === undefined || (c.rhr >= 25 && c.rhr <= 130));

// =====================================================================================================================
// Training load (session RPE × minutes — Foster 2001)
// =====================================================================================================================
export interface WLike { date: string; type: string; durationSec: number; rpe?: number; deleted?: boolean }
/** Typical RPE when a session has none (labelled “estimated” in the UI). */
export const DEFAULT_RPE: Record<string, number> = { rest: 0, walk: 3, run: 5, cycle: 5, 'indoor-cycle': 5, strength: 6, calisthenics: 6, cardio: 6, hybrid: 7, hyrox: 7 };
export function sessionLoad(w: WLike): { load: number; estimated: boolean } {
  if (w.type === 'rest' || !(w.durationSec > 0)) return { load: 0, estimated: false };
  const min = w.durationSec / 60;
  if (typeof w.rpe === 'number' && w.rpe > 0) return { load: Math.round(clamp(w.rpe, 1, 10) * min), estimated: false };
  return { load: Math.round((DEFAULT_RPE[w.type] ?? 5) * min), estimated: true };
}
/** Daily loads (AU) for the n days ending today, oldest first. */
export function dailyLoads(ws: WLike[], today: string, n: number): number[] {
  const out = Array(n).fill(0);
  for (const w of ws) { if (w.deleted) continue; const k = daysBetween(dayOf(w.date), today); if (k >= 0 && k < n) out[n - 1 - k] += sessionLoad(w).load; }
  return out;
}
export type LoadBand = 'lower' | 'similar' | 'higher' | 'spike';
export interface LoadSummary {
  acute7: number; chronicWeekly: number; ratio: number | null; band: LoadBand | null; monotony: number | null; strain: number | null;
  historyDays: number; estimated: number; sessions7: number; daily: number[];
}
/** Acute = last 7 days (incl. today). Chronic = weekly average of the 21 days before that (uncoupled, so the acute week isn’t in both).
 *  The ratio is shown only with ≥ 28 days of history, as context — it does NOT predict injury (Impellizzeri 2020). */
export function loadSummary(ws: WLike[], today: string): LoadSummary {
  const live = ws.filter((w) => !w.deleted);
  const daily = dailyLoads(live, today, 28);
  const acute7 = daily.slice(21).reduce((a, b) => a + b, 0);
  const chronicWeekly = daily.slice(0, 21).reduce((a, b) => a + b, 0) / 3;
  const first = live.map((w) => dayOf(w.date)).filter((d) => d <= today).sort()[0];
  const historyDays = first ? daysBetween(first, today) + 1 : 0;
  const ratio = historyDays >= 28 && chronicWeekly > 0 ? +(acute7 / chronicWeekly).toFixed(2) : null;
  const band: LoadBand | null = ratio === null ? null : ratio < 0.8 ? 'lower' : ratio <= 1.3 ? 'similar' : ratio <= 1.5 ? 'higher' : 'spike';
  const last7 = daily.slice(21), s = sd(last7);
  const monotony = acute7 > 0 && s > 0 ? +(mean(last7) / s).toFixed(2) : null;
  const strain = monotony !== null ? Math.round(acute7 * monotony) : null;
  const recent = live.filter((w) => { const k = daysBetween(dayOf(w.date), today); return k >= 0 && k < 7 && w.type !== 'rest'; });
  return { acute7, chronicWeekly: Math.round(chronicWeekly), ratio, band, monotony, strain, historyDays, estimated: recent.filter((w) => sessionLoad(w).estimated).length, sessions7: recent.length, daily };
}
export const BAND_TEXT: Record<LoadBand, string> = {
  lower: 'Less than your recent normal — fine for a lighter week or taper.',
  similar: 'In line with your recent normal.',
  higher: 'A step up on your recent normal. Fine if planned — watch how you feel.',
  spike: 'Much more than your recent normal. Big jumps are worth easing into; how you feel matters more than this number.',
};
/** A “hard” session: RPE ≥ 7, or ≥ 90 min, or load ≥ 1.5 × your typical session (last 28 days). */
export function isHard(w: WLike, typical = 0): boolean {
  if (w.type === 'rest') return false;
  const { load } = sessionLoad(w);
  return (w.rpe ?? 0) >= 7 || w.durationSec >= 90 * 60 || (typical > 0 && load >= 1.5 * typical);
}
export function typicalSession(ws: WLike[], today: string): number {
  const l = ws.filter((w) => !w.deleted && w.type !== 'rest' && daysBetween(dayOf(w.date), today) >= 0 && daysBetween(dayOf(w.date), today) < 28).map((w) => sessionLoad(w).load).filter((x) => x > 0);
  return l.length ? Math.round(mean(l)) : 0;
}
export function hardYesterday(ws: WLike[], today: string): boolean {
  const t = typicalSession(ws, today);
  return ws.some((w) => !w.deleted && daysBetween(dayOf(w.date), today) === 1 && isHard(w, t));
}

// =====================================================================================================================
// Recovery planner + cold/heat + deload
// =====================================================================================================================
export interface PlanStep { id: string; when: string; title: string; detail: string; src: string[]; link?: string; practical?: boolean }
const STRENGTH_TYPES = ['strength', 'calisthenics'];
export function coldHeatAdvice(goal: MindGoal, sessionType: string | null, q: Pick<MindQuiz, 'age' | 'heart' | 'pregnant' | 'respiratory' | 'epilepsy' | 'panic' | 'cold'>, competing = false): { cold: { status: ToolStatus; verdict: string; detail: string; src: string[] }; heat: { status: ToolStatus; verdict: string; detail: string; src: string[] } } {
  const cs = toolStatus('cold', q), hs = toolStatus('sauna', q);
  const strengthSession = !!sessionType && STRENGTH_TYPES.includes(sessionType);
  const mixed = !!sessionType && ['hyrox', 'hybrid'].includes(sessionType);
  let cold: { verdict: string; detail: string; src: string[] };
  if (cs.status === 'avoid') cold = { verdict: 'Skip cold water', detail: cs.why.includes('cold') ? MIND_REASON_TEXT.cold : 'Not for under-18s in HYBRD. Easy movement, food and sleep do the job.', src: ['mind-tipton'] };
  else if (competing) cold = { verdict: 'Good option between events', detail: 'With another race, heat or session within ~24 h, 10–15 min at 10–15 °C can help soreness, power and feeling recovered.', src: ['mind-moore-cwi', 'mind-machado'] };
  else if (strengthSession || (mixed && goal === 'strength')) cold = { verdict: 'Skip it after strength work', detail: 'Regular ice baths after strength sessions blunted muscle and strength gains. If you love it, keep it for days you don’t lift — how many hours apart is enough isn’t known.', src: ['mind-roberts', 'mind-malta'] };
  else if (goal === 'strength') cold = { verdict: 'Keep it away from lifting days', detail: 'If size or strength is the goal, avoid cold water immersion after lifting; it’s fine on other days.', src: ['mind-roberts', 'mind-malta'] };
  else cold = { verdict: 'Optional after runs and rides', detail: 'Regular cold water didn’t blunt endurance adaptations. For soreness: 10–15 °C for 10–15 min. It feels good; the effect is small.', src: ['mind-malta', 'mind-machado', 'mind-moore-cwi'] };
  let heat: { verdict: string; detail: string; src: string[] };
  if (hs.status === 'doctor') heat = { verdict: 'Ask your doctor first', detail: hs.why.map((r) => MIND_REASON_TEXT[r]).join(' '), src: MIND_REASON_SRC[hs.why[0]] };
  else if (goal === 'endurance' || goal === 'hybrid') heat = { verdict: 'Useful for heat prep', detail: 'Post-training sauna (~25–30 min, about 3× a week for 3 weeks) improved heat tolerance and endurance markers in small runner studies. Build up from 10–15 min, drink water, leave if dizzy.', src: ['mind-scoon', 'mind-kirby', 'ultra-racinais'] };
  else heat = { verdict: 'Fine if you enjoy it', detail: 'No clear performance effect for strength; good for relaxing. Start with 10–15 min, hydrate, no alcohol.', src: ['mind-laukkanen'] };
  return { cold: { status: cs.status, ...cold }, heat: { status: hs.status === 'ok' && q.age < 18 ? 'care' : hs.status, ...heat } };
}
export const COLD_HEAT_SAFETY = ['Never do cold water alone; get in slowly — the first minute (cold shock: gasping, fast breathing) is the risky part.', 'No alcohol with sauna or cold water. Leave the sauna if you feel dizzy, sick or have a headache.', 'Ask a doctor first with heart problems, high blood pressure, or pregnancy.'];

export interface RecoveryPlan { session: (WLike & { title?: string; id?: string }) | null; hoursAgo: number; steps: PlanStep[]; backToBack: boolean }
/** What to do after the most recent hard session in the last 48 h (or a general rest-day plan). */
export function recoveryPlan(ws: (WLike & { title?: string; id?: string })[], now: number, q: MindQuiz, weightKg = 75, competing = false): RecoveryPlan {
  const today = dayOf(now);
  const t = typicalSession(ws, today);
  const recent = ws.filter((w) => !w.deleted && w.type !== 'rest' && now - new Date(w.date).getTime() >= 0 && now - new Date(w.date).getTime() <= 48 * 3600_000).sort((a, b) => b.date.localeCompare(a.date));
  const hard = recent.filter((w) => isHard(w, t));
  const s = hard[0] || null;
  const hoursAgo = s ? Math.round((now - new Date(s.date).getTime() - s.durationSec * 1000) / 3600_000) : 0;
  const days = new Set(hard.map((w) => dayOf(w.date)));
  const backToBack = [...days].some((d) => days.has(addDays(d, 1)));
  const steps: PlanStep[] = [];
  const prot = Math.round(0.3 * weightKg);
  if (s) {
    if (hoursAgo < 3) steps.push({ id: 'refuel', when: 'Within ~1 h', title: 'Refuel', detail: `A meal or snack with carbs and ~${prot} g protein (≈ 0.3 g/kg). After long or double sessions, carbs matter most.`, src: ['issn-timing', 'issn-protein'] });
    if (hoursAgo < 6) steps.push({ id: 'fluids', when: 'Next few hours', title: 'Rehydrate', detail: 'Drink with meals until your urine is pale; add salty food after heavy sweating.', src: ['acsm-fluid'] });
    const ch = coldHeatAdvice(q.goal, s.type, q, competing);
    steps.push({ id: 'cold', when: 'Optional', title: `Cold water: ${ch.cold.verdict.toLowerCase()}`, detail: ch.cold.detail, src: ch.cold.src });
  }
  steps.push({ id: 'mobility', when: s ? 'This evening' : 'Any time', title: 'Easy mobility or foam rolling (8 min)', detail: 'Feels good and keeps you moving. It won’t erase soreness — the measured effects are small.', src: ['mind-wiewelhove', 'mind-afonso'], link: s && STRENGTH_TYPES.includes(s.type) ? '/mind/routine/upper' : '/mind/routine/post-run' });
  steps.push({ id: 'sleep', when: 'Tonight', title: 'Sleep 7–9 h', detail: 'Sleep is the best-evidenced recovery tool there is. Your Sleep plan has the evening timeline.', src: ['sleep-walsh', 'mind-fullagar'], link: '/fuel/sleep' });
  if (s) steps.push({ id: 'alcohol', when: 'Tonight', title: 'Go light on alcohol', detail: 'Heavy drinking after hard exercise slows muscle recovery and hurts sleep.', src: ['mind-barnes', 'sleep-gardiner-alcohol'] });
  steps.push({ id: 'next', when: s ? 'Next 24–48 h' : 'Tomorrow', title: backToBack ? 'Take an easy day next' : 'Easy or rest before the next hard one', detail: backToBack ? 'Two hard days in a row: make the next one easy or a rest day. Soreness usually peaks 24–72 h after unaccustomed work.' : 'Keep 24–48 h between hard sessions for the same muscles; easy movement is fine.', src: ['mind-cheung', 'mind-mclean', 'mind-soligard'], practical: true });
  return { session: s, hoursAgo, steps, backToBack };
}

export interface DeloadSignal { suggest: boolean; reasons: string[]; weeksSinceLight: number | null; src: string[] }
/** Suggest a lighter week when several signals line up (HYBRD default — practice consensus, not a tested rule). */
export function deloadSignal(ws: WLike[], cis: Pick<CheckIn, 'date' | 'score' | 'soreness' | 'motivation' | 'deleted'>[], today: string): DeloadSignal {
  const daily = dailyLoads(ws, today, 56);
  const weeks = Array.from({ length: 8 }, (_, i) => daily.slice(i * 7, i * 7 + 7).reduce((a, b) => a + b, 0)); // oldest → newest
  const avg = mean(weeks.filter((x) => x > 0));
  let weeksSinceLight: number | null = null;
  if (avg > 0) { for (let i = weeks.length - 1; i >= 0; i--) if (weeks[i] < 0.7 * avg) { weeksSinceLight = weeks.length - 1 - i; break; } if (weeksSinceLight === null) weeksSinceLight = 8; }
  const last7 = cis.filter((c) => !c.deleted && daysBetween(c.date, today) >= 0 && daysBetween(c.date, today) < 7);
  const reasons: string[] = [];
  if (weeksSinceLight !== null && weeksSinceLight >= 4) reasons.push(`${weeksSinceLight >= 8 ? '8+' : weeksSinceLight} weeks since a lighter week`);
  if (last7.length >= 4) {
    if (mean(last7.map((c) => c.score)) < 60) reasons.push('readiness has averaged under 60 this week');
    if (mean(last7.map((c) => c.soreness)) >= 3.5) reasons.push('soreness has stayed high');
    if (mean(last7.map((c) => c.motivation)) <= 2.5) reasons.push('motivation is low');
  }
  const suggest = reasons.length >= 2 && reasons.some((r) => r.includes('weeks since'));
  return { suggest, reasons, weeksSinceLight, src: ['mind-bell-delphi', 'mind-rogerson', 'mind-meeusen'] };
}
export const DELOAD_HOW = [
  'Keep your usual training days and exercises.',
  'Cut the volume: roughly a third to half fewer sets, or shorter runs and rides.',
  'Ease the effort: stop each set with 3–4 reps in reserve; keep cardio easy, with a few short strides to stay sharp.',
  'Usually about a week. Then build back up from slightly above where you were before.',
];

// =====================================================================================================================
// Breathing pacer
// =====================================================================================================================
export type PhaseKind = 'in' | 'top' | 'hold' | 'out' | 'rest';
export interface BreathPhase { kind: PhaseKind; sec: number; label: string }
export interface BreathPattern { id: string; name: string; short: string; tool: Tool; phases: BreathPhase[]; minutes: number; holds: boolean; grade: Grade; src: string[]; how: string[]; segments?: { pattern: string; minutes: number; cue?: string }[] }
export const PATTERNS: BreathPattern[] = [
  { id: 'sigh', name: 'Cyclic sighing', short: 'Two inhales, one long exhale — the fastest way to downshift.', tool: 'sigh', minutes: 5, holds: false, grade: 'moderate', src: ['mind-balban', 'mind-fincham', 'mind-vlemincx'],
    phases: [{ kind: 'in', sec: 2, label: 'Inhale (nose)' }, { kind: 'top', sec: 1, label: 'Top up (sip more air)' }, { kind: 'out', sec: 6, label: 'Slow exhale (mouth)' }],
    how: ['Breathe in through your nose until your lungs feel almost full.', 'Take a second short sip of air on top.', 'Let it all out slowly through your mouth — the exhale is longer than both inhales.', 'Daily 5 minutes was the dose studied.'] },
  { id: 'box', name: 'Box breathing', short: '4 in · 4 hold · 4 out · 4 hold. Steady and simple.', tool: 'box', minutes: 5, holds: true, grade: 'limited', src: ['mind-balban', 'mind-rottger'],
    phases: [{ kind: 'in', sec: 4, label: 'Inhale' }, { kind: 'hold', sec: 4, label: 'Hold' }, { kind: 'out', sec: 4, label: 'Exhale' }, { kind: 'hold', sec: 4, label: 'Hold' }],
    how: ['In through the nose for 4, hold gently for 4, out for 4, hold for 4.', 'Holds should feel easy — shorten them to 2 if not.', 'Good before a hard set or when you need to settle quickly.'] },
  { id: 'resonance', name: 'Resonance breathing', short: 'About 6 slow breaths a minute, longer out than in.', tool: 'resonance', minutes: 10, holds: false, grade: 'moderate', src: ['mind-lehrer2014', 'mind-laborde', 'mind-lehrer2020', 'mind-zaccaro'],
    phases: [{ kind: 'in', sec: 4, label: 'Inhale (nose, belly)' }, { kind: 'out', sec: 6, label: 'Exhale (slow)' }],
    how: ['Breathe low into your belly, in through the nose.', 'Follow the circle: about 4 s in, 6 s out (6 breaths a minute).', 'Don’t force big breaths — relaxed and smooth.', '10–20 minutes a day is the typical practice in studies.'] },
  { id: 'prerace', name: 'Pre-race calm', short: '4 minutes: sigh, slow down, then switch on.', tool: 'prerace', minutes: 4, holds: false, grade: 'limited', src: ['mind-balban', 'mind-rottger', 'mind-brooks', 'mind-rupprecht'],
    phases: [{ kind: 'in', sec: 2, label: 'Inhale' }, { kind: 'top', sec: 1, label: 'Top up' }, { kind: 'out', sec: 6, label: 'Long exhale' }],
    segments: [{ pattern: 'sigh', minutes: 1.5, cue: 'Let the nerves drain out on each exhale.' }, { pattern: 'resonance', minutes: 2, cue: 'Picture the start: calm, strong, ready.' }, { pattern: 'ready', minutes: 0.5, cue: 'Say it: “I’m excited.” Pick your first cue word.' }],
    how: ['Use it 10–20 minutes before the start, in the warm-up area.', 'First cyclic sighs to drop the edge, then slow breathing with imagery.', 'Finish at a normal pace with your cue words — you want to be switched on, not sleepy.'] },
];
export const READY_PHASES: BreathPhase[] = [{ kind: 'in', sec: 3, label: 'Inhale' }, { kind: 'out', sec: 3, label: 'Exhale' }];
export const patternById = (id: string) => PATTERNS.find((p) => p.id === id);
/** Resonance pace options (breaths per minute) → phases, exhale ≈ 60% of the cycle. */
export function resonancePhases(bpm: 5 | 6 | 7): BreathPhase[] {
  const cyc = 60 / bpm, inn = +(cyc * 0.4).toFixed(1);
  return [{ kind: 'in', sec: inn, label: 'Inhale (nose, belly)' }, { kind: 'out', sec: +(cyc - inn).toFixed(3), label: 'Exhale (slow)' }];
}
/** Patterns safe for this person: breath-holds get a no-hold variant when status is 'care'. */
export function phasesFor(p: BreathPattern, holdsOk: boolean, bpm: 5 | 6 | 7 = 6): BreathPhase[] {
  if (p.id === 'resonance') return resonancePhases(bpm);
  if (p.holds && !holdsOk) return p.phases.filter((x) => x.kind !== 'hold').map((x) => ({ ...x, sec: x.sec + 1 })); // 5 in · 5 out
  return p.phases;
}
export const cycleSec = (phases: BreathPhase[]) => phases.reduce((a, p) => a + p.sec, 0);
export const breathsPerMin = (phases: BreathPhase[]) => +(60 / cycleSec(phases)).toFixed(2);
/** Timeline of a session: segments (pre-race) or one pattern for `minutes`. */
export function sessionTimeline(p: BreathPattern, minutes: number, holdsOk: boolean, bpm: 5 | 6 | 7 = 6): { phases: BreathPhase[]; sec: number; cue?: string }[] {
  if (p.segments) return p.segments.map((s) => ({ phases: s.pattern === 'ready' ? READY_PHASES : phasesFor(patternById(s.pattern)!, holdsOk, bpm), sec: Math.round(s.minutes * 60), cue: s.cue }));
  return [{ phases: phasesFor(p, holdsOk, bpm), sec: Math.round(minutes * 60) }];
}
/** Where we are at `t` seconds into a timeline: segment, phase index, seconds left in the phase, phase progress 0–1. */
export function phaseAt(tl: { phases: BreathPhase[]; sec: number; cue?: string }[], t: number): { seg: number; idx: number; phase: BreathPhase; left: number; progress: number; done: boolean; cue?: string } {
  let acc = 0;
  for (let s = 0; s < tl.length; s++) {
    const seg = tl[s];
    if (t < acc + seg.sec) {
      const within = t - acc, cyc = cycleSec(seg.phases), inCyc = within % cyc;
      let a = 0;
      for (let i = 0; i < seg.phases.length; i++) { const ph = seg.phases[i]; if (inCyc < a + ph.sec) return { seg: s, idx: i, phase: ph, left: a + ph.sec - inCyc, progress: (inCyc - a) / ph.sec, done: false, cue: seg.cue }; a += ph.sec; }
    }
    acc += seg.sec;
  }
  const last = tl[tl.length - 1];
  return { seg: tl.length - 1, idx: last.phases.length - 1, phase: last.phases[last.phases.length - 1], left: 0, progress: 1, done: true, cue: last.cue };
}
export const totalSec = (tl: { sec: number }[]) => tl.reduce((a, s) => a + s.sec, 0);
/** Orb size for a phase: inhale grows, top-up grows a little more, exhale shrinks, holds keep the size they started at. */
export function scaleAt(phases: BreathPhase[], idx: number, p: number): number {
  const lo = 0.55, hi = 1, top = 1.08;
  const endOf = (i: number): number => { const k = phases[(i + phases.length) % phases.length].kind; return k === 'in' ? hi : k === 'top' ? top : k === 'out' ? lo : endOf(i - 1); };
  const ph = phases[idx];
  if (ph.kind === 'in') return lo + (hi - lo) * p;
  if (ph.kind === 'top') return hi + (top - hi) * p;
  if (ph.kind === 'out') { const from = idx > 0 ? endOf(idx - 1) : hi; return from - (from - lo) * p; }
  return idx > 0 ? endOf(idx - 1) : lo;
}

// =====================================================================================================================
// Journal, sessions, trends
// =====================================================================================================================
export type JournalKind = 'gratitude' | 'win' | 'reflect' | 'free';
export interface JournalEntry extends Rec { date: string; kind: JournalKind; text: string; prompt?: string; program?: string; localOnly?: boolean; sample?: boolean }
export const JOURNAL_MAX = 4000;
export type SessionKind = 'breathe' | 'program' | 'routine';
export interface MindSession extends Rec { date: string; kind: SessionKind; ref: string; minutes: number; sample?: boolean }
export const validJournal = (j: Partial<JournalEntry>) => !!j.date && !!j.kind && typeof j.text === 'string' && j.text.trim().length > 0 && j.text.length <= JOURNAL_MAX;

/** Consecutive days with a record, ending today (or yesterday if today isn’t logged yet). */
export function dayStreak(dates: string[], today: string): number {
  const s = new Set(dates);
  let d = s.has(today) ? today : addDays(today, -1), n = 0;
  while (s.has(d)) { n++; d = addDays(d, -1); }
  return n;
}
export function bestStreak(dates: string[]): number {
  const u = [...new Set(dates)].sort();
  let best = 0, cur = 0, prev = '';
  for (const d of u) { cur = prev && addDays(prev, 1) === d ? cur + 1 : 1; best = Math.max(best, cur); prev = d; }
  return best;
}
export interface TrendDay { day: string; score: number | null; mood: number | null; stress: number | null; rec: Rec4 | null }
export function trend(cis: CheckIn[], today: string, n: number): TrendDay[] {
  const by = new Map(cis.filter((c) => !c.deleted).map((c) => [c.date, c]));
  return Array.from({ length: n }, (_, i) => { const day = addDays(today, i - n + 1), c = by.get(day); return { day, score: c ? c.score : null, mood: c ? c.mood : null, stress: c ? c.stress : null, rec: c ? c.rec : null }; });
}
export interface MindStats { streak: number; best: number; last14: number; avgScore7: number | null; avgMood7: number | null; avgStress7: number | null; sessions7: number; minutes7: number; journal7: number }
export function mindStats(cis: CheckIn[], sessions: MindSession[], journal: JournalEntry[], today: string): MindStats {
  const live = cis.filter((c) => !c.deleted), dates = live.map((c) => c.date);
  const w7 = live.filter((c) => daysBetween(c.date, today) >= 0 && daysBetween(c.date, today) < 7);
  const s7 = sessions.filter((s) => !s.deleted && daysBetween(s.date, today) >= 0 && daysBetween(s.date, today) < 7);
  const avg = (k: 'score' | 'mood' | 'stress') => (w7.length ? +mean(w7.map((c) => c[k])).toFixed(1) : null);
  return {
    streak: dayStreak(dates, today), best: bestStreak(dates), last14: new Set(live.filter((c) => daysBetween(c.date, today) >= 0 && daysBetween(c.date, today) < 14).map((c) => c.date)).size,
    avgScore7: avg('score'), avgMood7: avg('mood'), avgStress7: avg('stress'), sessions7: s7.length, minutes7: Math.round(s7.reduce((a, s) => a + s.minutes, 0)),
    journal7: journal.filter((j) => !j.deleted && daysBetween(j.date, today) >= 0 && daysBetween(j.date, today) < 7).length,
  };
}
/** Your own patterns — only with ≥ 3 days on each side (a pattern, not proof). */
export function patterns(cis: CheckIn[], ws: WLike[]): { id: string; label: string; a: number; b: number; na: number; nb: number; aLabel: string; bLabel: string }[] {
  const live = cis.filter((c) => !c.deleted);
  const out: ReturnType<typeof patterns> = [];
  const cmp = (id: string, label: string, aLabel: string, bLabel: string, pred: (c: CheckIn) => boolean | null) => {
    const a = live.filter((c) => pred(c) === true), b = live.filter((c) => pred(c) === false);
    if (a.length >= 3 && b.length >= 3) out.push({ id, label, aLabel, bLabel, a: Math.round(mean(a.map((c) => c.score))), b: Math.round(mean(b.map((c) => c.score))), na: a.length, nb: b.length });
  };
  cmp('sleep', 'Sleep hours', '7 h+', 'under 7 h', (c) => (typeof c.sleepH === 'number' ? c.sleepH >= 7 : null));
  cmp('hard', 'Day after a hard session', 'after hard', 'other days', (c) => hardYesterday(ws, c.date));
  cmp('stress', 'Stress', 'stress 4–5', 'stress 1–3', (c) => c.stress >= 4);
  return out;
}
/** Low mood several days running → gentle prompt; most of the last 2 weeks → suggest a professional (NIMH: 2+ weeks). */
export function moodWatch(cis: CheckIn[], today: string): 'ok' | 'notice' | 'professional' {
  const by = new Map(cis.filter((c) => !c.deleted).map((c) => [c.date, c]));
  let run = 0; for (let d = today; by.has(d) && by.get(d)!.mood <= 2; d = addDays(d, -1)) run++;
  const last14 = Array.from({ length: 14 }, (_, i) => by.get(addDays(today, -i))).filter(Boolean) as CheckIn[];
  if (last14.length >= 7 && last14.filter((c) => c.mood <= 2).length >= 10) return 'professional';
  return run >= 3 ? 'notice' : 'ok';
}
/** Program progress: completed day numbers (sessions with ref `${programId}:${day}`) and the next day to do. */
export function programProgress(sessions: MindSession[], programId: string, days: number): { done: Set<number>; next: number | null; pct: number } {
  const done = new Set(sessions.filter((s) => !s.deleted && s.kind === 'program' && s.ref.startsWith(programId + ':')).map((s) => +s.ref.split(':')[1]).filter((n) => n >= 1 && n <= days));
  let next: number | null = null; for (let d = 1; d <= days; d++) if (!done.has(d)) { next = d; break; }
  return { done, next, pct: Math.round((done.size / days) * 100) };
}
/** Records flagged localOnly never leave the device (store.tsx skips them when syncing). */
export const isLocalOnly = (r: unknown) => !!(r && typeof r === 'object' && (r as { localOnly?: boolean }).localOnly);
