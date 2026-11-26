// Unit checks for Mind & Recovery (/mind): readiness maths (weights, sleep / HRV / resting-HR / load adjustments, overrides),
// safety (crisis words incl. training-slang exclusions, red flags, crisis messaging, under-18 framing, tool gating),
// HYBRD Pulse (original wording, 0–100 scoring, bands, gentle 988 support, legacy records) + optional PHQ-2/GAD-2 cut-offs, outcomes, training load (session RPE, uncoupled ratio, monotony, hard sessions),
// recovery planner, cold/heat, deload, breathing pacer maths, trends/streaks/patterns, programs, storage + sync wiring, content + sources.
// Run: node --experimental-strip-types --import ./tools/ts-resolve.mjs tools/test-mind.ts
import { readFileSync } from 'node:fs';
import {
  CRISIS, NOT_THERAPY, crisisInText, defaultMindQuiz, goalFromDisciplines, mindScreen, toolStatus, MIND_REASON_TEXT, MIND_REASON_SRC,
  PULSE_ITEMS, PULSE_SCALE, PULSE_BAND, PULSE_DISCLAIMER, pulseScore, pulseBand, pulseTrend, pulseSupportLine, isLegacyScreen, PHQ4_ITEMS, PHQ4_SCALE, SAFETY_Q, phq4Score, screenOutcome,
  RED_FLAGS, REC_LABEL, REC_TEXT, WEIGHTS, itemScore, baselines, sleepPenalty, readiness, validCheckIn,
  DEFAULT_RPE, sessionLoad, dailyLoads, loadSummary, BAND_TEXT, isHard, typicalSession, hardYesterday,
  coldHeatAdvice, recoveryPlan, deloadSignal, DELOAD_HOW, COLD_HEAT_SAFETY,
  PATTERNS, patternById, resonancePhases, phasesFor, cycleSec, breathsPerMin, sessionTimeline, phaseAt, totalSec, scaleAt,
  JOURNAL_MAX, validJournal, dayStreak, bestStreak, trend, mindStats, patterns, moodWatch, programProgress, isLocalOnly, dayOf, daysBetween,
  type CheckIn, type MindQuiz, type WLike, type MindSession, type JournalEntry, type Scale5,
} from '../src/lib/mind.ts';
import { MIND_EVIDENCE, MIND_EV_CATS, MIND_SOURCE_IDS, MIND_TIPS, PROGRAMS, ROUTINES, routineSteps, routineSec, TRANSITION_SEC, programById, routineById } from '../src/data/mindContent.ts';
import { SOURCES } from '../src/data/sources.ts';
import { FEATURES, can } from '../src/lib/entitlements.ts';
import { COLLECTIONS } from '../src/lib/types.ts';
import { addDays } from '../src/lib/calc.ts';

let failed = 0;
const check = (name: string, cond: boolean, detail?: unknown) => { if (!cond) { failed++; console.error('FAIL', name, detail ?? ''); } else console.log('ok', name); };
const read = (f: string) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const T = '2026-11-17';
const Q = (p: Partial<MindQuiz> = {}): MindQuiz => ({ ...defaultMindQuiz({ age: 30 }), ...p });
const all5 = (v: number) => ({ mood: v, stress: 6 - v, energy: v, motivation: v, soreness: 6 - v, sleepQ: v });
const ci = (date: string, p: Partial<CheckIn> = {}): CheckIn => ({ id: `ci-${date}`, updatedAt: 1, date, mood: 4, stress: 2, energy: 4, motivation: 4, soreness: 2, sleepQ: 4, score: 75, rec: 'go', v: 1, ...p } as CheckIn);
const W = (date: string, type: string, min: number, rpe?: number): WLike => ({ date: `${date}T07:00:00`, type, durationSec: min * 60, rpe });

// ====================================================== safety ======================================================
check('crisis: 988 call + text links, 911, international line', CRISIS.us.call === 'tel:988' && CRISIS.us.text === 'sms:988' && CRISIS.emergency.call === 'tel:911' && /local emergency services/i.test(CRISIS.intl) && CRISIS.intlUrl.startsWith('https://'));
check('not-therapy note says not therapy / medical advice', /not therapy/i.test(NOT_THERAPY) && /medical advice/i.test(NOT_THERAPY));
for (const t of ['I want to kill myself', 'thinking about suicide', 'I feel suicidal lately', 'sometimes I want to die', 'everyone would be better off dead without me', 'I keep hurting myself', 'self-harm again', 'I cut myself', 'no reason to live', 'I might take my own life', 'I wish I was dead', 'thought about an overdose'])
  check(`crisis words detected: “${t}”`, crisisInText(t));
for (const t of ['Did suicide sprints today, brutal', 'suicides drills on the court', 'Suicide runs x10', 'killed the workout', 'this hill killed me', 'dying on the last rep lol', 'I could die for a burger', 'cut weight for the meet', '', null, undefined])
  check(`no false alarm: “${t}”`, !crisisInText(t as string));
check('slang excluded but real words in same text still caught', crisisInText('suicide sprints then I thought about ending my life'));

check('screen ok for a healthy adult', mindScreen(Q()).level === 'ok' && mindScreen(Q()).reasons.length === 0);
check('screen minor for under 18', mindScreen(Q({ age: 16 })).level === 'minor' && mindScreen(Q({ age: 16 })).reasons.includes('under18'));
check('screen caution with a condition', mindScreen(Q({ heart: true })).level === 'caution');
check('every reason has text + sources that exist', Object.keys(MIND_REASON_TEXT).every((k) => MIND_REASON_TEXT[k as keyof typeof MIND_REASON_TEXT].length > 20 && MIND_REASON_SRC[k as keyof typeof MIND_REASON_SRC].length > 0));
check('under-18 text points to trusted adult + 988', /parent|guardian/.test(MIND_REASON_TEXT.under18) && /988/.test(MIND_REASON_TEXT.under18));
check('box breathing adapted for pregnancy / heart / lungs / epilepsy / panic', (['pregnant', 'heart', 'respiratory', 'epilepsy', 'panic'] as const).every((k) => toolStatus('box', Q({ [k]: true })).status === 'care'));
check('box breathing fine otherwise', toolStatus('box', Q()).status === 'ok');
check('sighing / resonance adapted for asthma or panic only', toolStatus('sigh', Q({ respiratory: true })).status === 'care' && toolStatus('resonance', Q({ panic: true })).status === 'care' && toolStatus('resonance', Q({ heart: true })).status === 'ok');
check('cold: avoided for cold sensitivity and under 18', toolStatus('cold', Q({ cold: true })).status === 'avoid' && toolStatus('cold', Q({ age: 15 })).status === 'avoid');
check('cold / sauna: ask doctor with heart condition or pregnancy', toolStatus('cold', Q({ heart: true })).status === 'doctor' && toolStatus('sauna', Q({ pregnant: true })).status === 'doctor');
check('sauna: care under 18', toolStatus('sauna', Q({ age: 16 })).status === 'care');
check('goal from disciplines', goalFromDisciplines(['hyrox']) === 'hybrid' && goalFromDisciplines(['running']) === 'endurance' && goalFromDisciplines(['calisthenics']) === 'strength' && goalFromDisciplines(['strength', 'cycling']) === 'hybrid' && goalFromDisciplines([]) === 'general');

check('red flags: 7, each with an action + source', RED_FLAGS.length === 7 && RED_FLAGS.every((f) => f.action.length > 10 && f.src.length > 0));
check('red flags: chest / numbness / dark urine are emergencies with 911', ['chest', 'numb', 'urine'].every((v) => RED_FLAGS.find((f) => f.v === v)?.emergency) && /911/.test(RED_FLAGS.find((f) => f.v === 'chest')!.action));
check('red flags: injury ones say see a clinician', ['swelling', 'bone'].every((v) => /clinician/.test(RED_FLAGS.find((f) => f.v === v)!.action)));

// ====================================================== screening ======================================================
// HYBRD Pulse — original instrument. Guard against ever re-introducing the retired licensed index's wording.
const RETIRED = ['cheerful and in good spirits', 'calm and relaxed', 'active and vigorous', 'fresh and rested', 'filled with things that interest me', 'all of the time', 'more than half of the time', 'at no time'];
const pulseText = JSON.stringify([PULSE_ITEMS, PULSE_SCALE, PULSE_BAND, PULSE_DISCLAIMER]).toLowerCase();
check('Pulse: 6 items (energy, sleep, mood, stress, drive, recovery), 0–4 emoji scale', PULSE_ITEMS.map((i) => i.k).join() === 'energy,sleep,mood,stress,drive,recovery' && PULSE_SCALE.map((s) => s.v).join() === '0,1,2,3,4' && PULSE_SCALE.every((s) => s.emoji && s.label));
check('Pulse: every item has a question, end labels, tip + link', PULSE_ITEMS.every((i) => i.q.endsWith('?') && i.lo && i.hi && i.tip.length > 30 && i.link.startsWith('/')));
check('Pulse: none of the retired index’s wording or response labels', RETIRED.every((w) => !pulseText.includes(w)));
const appText = ['src/lib/mind.ts', 'src/pages/Mind.tsx', 'src/components/Pulse.tsx', 'src/data/mindContent.ts', 'src/data/sources.ts', 'src/lib/entitlements.ts'].map(read).join('\n');
check('no WHO-5 name, licence or item text left in the app (only the stored legacy key `who5`)', !/WHO-?5|World Health Organization-Five|CC BY-NC-SA/.test(appText) /* lowercase `who5` = stored legacy data key only */ && RETIRED.slice(0, 5).every((w) => !appText.toLowerCase().includes(w)));
check('Pulse score = sum ÷ 24 × 100', pulseScore([4, 4, 4, 4, 4, 4])!.score === 100 && pulseScore([0, 0, 0, 0, 0, 0])!.score === 0 && pulseScore([2, 2, 2, 2, 2, 2])!.score === 50 && pulseScore([3, 2, 3, 3, 2, 3])!.score === 67);
check('Pulse bands 75 / 55 / 35', pulseBand(75) === 'thriving' && pulseBand(74) === 'steady' && pulseBand(55) === 'steady' && pulseBand(54) === 'low' && pulseBand(35) === 'low' && pulseBand(34) === 'care');
check('Pulse rejects bad input', pulseScore([1, 2, 3]) === null && pulseScore([5, 0, 0, 0, 0, 0]) === null && pulseScore([1.5, 0, 0, 0, 0, 0]) === null && pulseScore(undefined) === null);
check('Pulse focus = up to 2 lowest areas at “Okay” or below', pulseScore([4, 1, 4, 0, 2, 4])!.focus.join() === 'stress,sleep' && pulseScore([4, 3, 4, 3, 4, 3])!.focus.length === 0);
check('Pulse support line: low score or very low mood', pulseScore([1, 1, 1, 1, 1, 1])!.support && pulseScore([4, 4, 0, 4, 4, 4])!.support && !pulseScore([2, 2, 2, 2, 2, 2])!.support);
check('support line: 988, gentle, no diagnosis words, minors get a trusted adult', /988/.test(pulseSupportLine(false)) && !/diagnos|disorder|depress|abnormal/i.test(pulseSupportLine(false)) && /school counselor/.test(pulseSupportLine(true)));
check('disclaimer: general wellness, not medical advice / diagnosis / validated', /general wellness/.test(PULSE_DISCLAIMER) && /not medical advice/.test(PULSE_DISCLAIMER) && /diagnosis/.test(PULSE_DISCLAIMER) && /not a medical device, a validated or clinical questionnaire/.test(PULSE_DISCLAIMER));
check('Pulse copy names no disease and no clinical cut-off', !/depress|anxiety disorder|disorder|diagnos(e|is)\b(?! and)|cut-?off|screening cut/i.test(JSON.stringify([PULSE_ITEMS, PULSE_BAND])));
check('PHQ-4: 4 items, 0–3 scale', PHQ4_ITEMS.length === 4 && PHQ4_SCALE.map((s) => s.v).join() === '0,1,2,3');
check('safety question asks directly', /ending your life|hurting yourself/.test(SAFETY_Q));
check('PHQ-2 / GAD-2 sums and ≥ 3 cut-offs', (() => { const p = phq4Score([1, 2, 0, 2])!; return p.phq2 === 3 && p.gad2 === 2 && p.dep && !p.anx && p.total === 5; })());
check('PHQ-4 rejects bad input', phq4Score([4, 0, 0, 0]) === null && phq4Score([0, 0]) === null);
const crisis = screenOutcome({ pulse: [4, 4, 4, 4, 4, 4], safety: 'yes' });
check('safety “yes” → crisis, even with a great Pulse', crisis.level === 'crisis' && crisis.support);
check('crisis message: 988 call/text + 911 + local emergency services', crisis.lines.some((l) => /988/.test(l)) && crisis.lines.some((l) => /911/.test(l) && /local emergency services/.test(l)) && crisis.src.includes('mind-988'));
check('crisis message for minors names a trusted adult', screenOutcome({ safety: 'yes' }, true).lines.some((l) => /parent or guardian/.test(l)));
const low = screenOutcome({ pulse: [1, 1, 1, 1, 1, 1], safety: 'no' });
check('low Pulse → gentle “watch” with support line, not alarming', low.level === 'watch' && low.support && low.title === 'Go easy on yourself this week' && !/diagnos|disorder|abnormal/i.test(low.lines.join(' ')) && low.src.includes('mind-988'));
check('PHQ-2 ≥ 3 (opt-in) → professional, framed as not a diagnosis', (() => { const o = screenOutcome({ pulse: [3, 3, 3, 3, 3, 3], phq4: [2, 1, 0, 0], safety: 'no' }); return o.level === 'professional' && o.lines.some((l) => /not a diagnosis/.test(l)); })());
check('GAD-2 ≥ 3 → professional', screenOutcome({ phq4: [0, 0, 3, 0], safety: 'skip' }).level === 'professional');
check('“Running low” Pulse → watch, no support line', (() => { const o = screenOutcome({ pulse: [2, 2, 2, 2, 2, 1], safety: 'no' }); return o.level === 'watch' && !o.support; })());
check('good Pulse → ok', screenOutcome({ pulse: [3, 3, 3, 3, 3, 3], safety: 'no' }).level === 'ok' && screenOutcome({ pulse: [4, 4, 3, 4, 4, 3], safety: 'no' }).title === 'Looking strong');
check('professional wording for adults vs minors', /qualified professional/.test(low.lines.join(' ')) && /school counselor/.test(screenOutcome({ pulse: [0, 0, 0, 0, 0, 0] }, true).lines.join(' ')));
// legacy (pre-Nov-2026) records: kept, never scored, nothing breaks
const legacy = { who5: [3, 3, 4, 3, 4], safety: 'no' as const };
check('legacy record: recognised, not scored, labelled retired', isLegacyScreen(legacy) && screenOutcome(legacy).level === 'legacy' && screenOutcome(legacy).pulse === null && /retired format/.test(screenOutcome(legacy).lines.join(' ')) && !/\d+\/100/.test(screenOutcome(legacy).lines.join(' ')));
check('legacy record with PHQ-4 still gets the PHQ result', screenOutcome({ who5: [1, 1, 1, 1, 1], phq4: [3, 3, 0, 0], safety: 'no' }).level === 'professional');
check('legacy record with safety “yes” still → crisis', screenOutcome({ who5: [5, 5, 5, 5, 5], safety: 'yes' }).level === 'crisis');
const ptr = pulseTrend([{ id: 'a', date: '2026-11-03', pulse: [2, 2, 2, 2, 2, 2] }, { id: 'l', date: '2026-11-05', who5: [3, 3, 3, 3, 3] } as never, { id: 'b', date: '2026-11-17', pulse: [3, 3, 3, 3, 3, 3] }, { id: 'c', date: '2026-11-10', pulse: [4, 4, 4, 4, 4, 4], deleted: true }]);
check('Pulse trend: oldest → newest, skips legacy + deleted', ptr.map((x) => `${x.id}:${x.score}`).join() === 'a:50,b:75');

// ====================================================== readiness ======================================================
check('weights sum to 1', Math.abs(Object.values(WEIGHTS).reduce((a, b) => a + b, 0) - 1) < 1e-9);
check('item score: 1–5 → 0–1, stress + soreness inverted', itemScore('mood', 1) === 0 && itemScore('mood', 5) === 1 && itemScore('stress', 1) === 1 && itemScore('soreness', 5) === 0 && itemScore('energy', 3) === 0.5);
check('best answers → 100 / go', readiness(all5(5)).score === 100 && readiness(all5(5)).rec === 'go');
check('worst answers → 0 / recover', readiness(all5(1)).score === 0 && readiness(all5(1)).rec === 'recover');
check('middle answers → 50 / easy', readiness(all5(3)).score === 50 && readiness(all5(3)).rec === 'easy');
check('all 4s → 75 go; −15 for 4.5 h sleep → 60 go easier; −10 HRV more → 50 still easier', readiness(all5(4)).score === 75 && readiness(all5(4)).rec === 'go' && readiness({ ...all5(4), sleepH: 4.5 }).score === 60 && readiness({ ...all5(4), sleepH: 4.5 }).rec === 'easy');
check('example: sleepQ 3, soreness 4, energy 3, stress 3, mood 4, motivation 4 → 51', readiness({ sleepQ: 3, soreness: 4, energy: 3, stress: 3, mood: 4, motivation: 4 }).score === 51, readiness({ sleepQ: 3, soreness: 4, energy: 3, stress: 3, mood: 4, motivation: 4 }).score);
check('sleep penalty: adults need 7 h', sleepPenalty(7) === 0 && sleepPenalty(6.5) === -5 && sleepPenalty(5.5) === -10 && sleepPenalty(4.9) === -15 && sleepPenalty(undefined) === 0);
check('sleep penalty: teens need 8 h', sleepPenalty(7.5, 16) === -5 && sleepPenalty(8, 16) === 0);
check('short sleep appears as a factor', readiness({ ...all5(5), sleepH: 5 }).factors.some((f) => f.kind === 'sleep' && f.points === -10));
check('factors sorted by points lost (largest first)', (() => { const f = readiness({ sleepQ: 1, soreness: 2, energy: 5, stress: 1, mood: 5, motivation: 4 }).factors; return f.every((x, i) => i === 0 || f[i - 1].points <= x.points); })());
check('score clamped to 0–100', readiness({ ...all5(1), sleepH: 3 }, {}, { hardYesterday: true }).score === 0);
// baselines
const hist = Array.from({ length: 7 }, (_, i) => ci(addDays(T, -1 - i), { hrv: [60, 64, 62, 58, 66, 61, 63][i], rhr: [50, 51, 49, 50, 52, 50, 51][i] }));
const base = baselines(hist, T);
check('baselines: 7-day mean of ln rMSSD + resting HR', !!base.hrvLn && base.hrvLn.n === 7 && Math.abs(Math.exp(base.hrvLn.mean) - 61.9) < 0.5 && !!base.rhr && Math.abs(base.rhr.mean - 50.43) < 0.01);
check('baselines need ≥ 5 readings', baselines(hist.slice(0, 4), T).hrvLn === undefined && baselines(hist.slice(0, 4), T).rhr === undefined);
check('baselines ignore today + older than 7 days', baselines([...hist, ci(T, { hrv: 10 }), ci(addDays(T, -9), { hrv: 10 })], T).hrvLn!.n === 7);
check('HRV > 1 SD below baseline: −10', readiness({ ...all5(5), hrv: 45 }, base).score === 90 && readiness({ ...all5(5), hrv: 61 }, base).score === 100);
check('HRV ignored without a baseline', readiness({ ...all5(5), hrv: 20 }).score === 100);
check('resting HR ≥ 5 above baseline: −5', readiness({ ...all5(5), rhr: 56 }, base).score === 95 && readiness({ ...all5(5), rhr: 54 }, base).score === 100);
check('hard session yesterday: −5', readiness(all5(5), {}, { hardYesterday: true }).score === 95);
// overrides
check('red flag → stop regardless of score', readiness({ ...all5(5), flags: ['chest'] }).rec === 'stop');
check('sharp pain → stop', readiness({ ...all5(5), pain: 'sharp' }).rec === 'stop');
check('ill → recover', readiness({ ...all5(5), ill: true }).rec === 'recover');
check('niggle caps at go easier', readiness({ ...all5(5), pain: 'niggle' }).rec === 'easy' && readiness({ ...all5(1), pain: 'niggle' }).rec === 'recover');
check('override reason is explained', readiness({ ...all5(5), ill: true }).overrides.length === 1);
check('high stress / low mood adds a supportive note', readiness({ ...all5(4), stress: 5 }).notes.length === 1 && readiness(all5(4)).notes.length === 0);
check('labels + text for every recommendation', (['go', 'easy', 'recover', 'stop'] as const).every((r) => REC_LABEL[r] && REC_TEXT[r]) && /clinician/.test(REC_TEXT.stop));
check('valid check-in', validCheckIn(ci(T)) && !validCheckIn({ ...ci(T), mood: 6 as Scale5 }) && !validCheckIn({ ...ci(T), hrv: 400 }) && !validCheckIn({ ...ci(T), rhr: 10 }) && !validCheckIn({ ...ci(T), sleepH: 20 }) && !validCheckIn({ date: T }));

// ====================================================== load ======================================================
check('session load = RPE × minutes', sessionLoad(W(T, 'run', 40, 6)).load === 240 && !sessionLoad(W(T, 'run', 40, 6)).estimated);
check('no RPE → typical RPE, flagged estimated', sessionLoad(W(T, 'strength', 50)).load === 50 * DEFAULT_RPE.strength && sessionLoad(W(T, 'strength', 50)).estimated);
check('rest day = 0', sessionLoad(W(T, 'rest', 0)).load === 0);
check('daily loads oldest → newest', (() => { const d = dailyLoads([W(T, 'run', 10, 5), W(addDays(T, -2), 'run', 10, 8)], T, 3); return d.join() === '80,0,50'; })());
const steady = Array.from({ length: 35 }, (_, i) => W(addDays(T, -i), i % 7 === 3 ? 'rest' : 'run', 40, 5));
const ls = loadSummary(steady, T);
check('ratio ≈ 1 for steady training (uncoupled: 7 d vs weekly avg of 21 d before)', ls.ratio !== null && Math.abs(ls.ratio - 1) < 0.15 && ls.band === 'similar', ls);
check('ratio hidden with < 28 days of history', loadSummary(steady.slice(0, 20), T).ratio === null);
const spike = [...steady.filter((w) => daysBetween(dayOf(w.date), T) >= 7), ...Array.from({ length: 7 }, (_, i) => W(addDays(T, -i), 'run', 90, 8))];
check('big jump → spike band', loadSummary(spike, T).band === 'spike');
check('band text never says injury risk', Object.values(BAND_TEXT).every((t) => !/injur|risk/i.test(t)));
check('monotony = mean/SD of last 7 days; strain = load × monotony', ls.monotony !== null && ls.strain === Math.round(ls.acute7 * ls.monotony));
check('deleted workouts ignored', loadSummary([{ ...W(T, 'run', 60, 9), deleted: true }], T).acute7 === 0);
check('hard: RPE ≥ 7, ≥ 90 min, or ≥ 1.5 × typical', isHard(W(T, 'run', 30, 7)) && isHard(W(T, 'walk', 95, 3)) && isHard(W(T, 'run', 60, 5), 150) && !isHard(W(T, 'run', 40, 5), 200) && !isHard(W(T, 'rest', 0)));
check('typical session over 28 days', typicalSession([W(T, 'run', 40, 5), W(addDays(T, -3), 'run', 20, 5), W(addDays(T, -40), 'run', 100, 10)], T) === 150);
check('hard yesterday detection', hardYesterday([W(addDays(T, -1), 'run', 50, 8)], T) && !hardYesterday([W(addDays(T, -2), 'run', 50, 8)], T));

// ====================================================== recovery ======================================================
const now = new Date(`${T}T09:00:00`).getTime();
const rp = recoveryPlan([W(T, 'strength', 60, 8)], now, Q({ goal: 'strength' }), 80);
check('planner: refuel with 0.3 g/kg protein soon after', rp.steps[0].id === 'refuel' && /24 g/.test(rp.steps[0].detail));
check('planner: strength session → skip cold water + upper routine link', rp.steps.some((s) => s.id === 'cold' && /skip/i.test(s.title)) && rp.steps.some((s) => s.link === '/mind/routine/upper'));
check('planner: links to the Sleep plan', rp.steps.some((s) => s.link === '/fuel/sleep'));
check('planner: no hard session → general rest-day plan', recoveryPlan([W(T, 'walk', 20, 2)], now, Q(), 75).session === null && recoveryPlan([], now, Q(), 75).steps.some((s) => s.id === 'sleep'));
check('planner: back-to-back hard days flagged', recoveryPlan([W(T, 'run', 60, 8), W(addDays(T, -1), 'hyrox', 60, 8)], now, Q(), 75).backToBack);
check('cold after runs: optional for endurance', /optional/i.test(coldHeatAdvice('endurance', 'run', Q()).cold.verdict));
check('cold after lifting: skip (blunts gains)', /skip/i.test(coldHeatAdvice('hybrid', 'strength', Q()).cold.verdict) && coldHeatAdvice('hybrid', 'strength', Q()).cold.src.includes('mind-roberts'));
check('cold when competing again soon: good option', /good option/i.test(coldHeatAdvice('strength', 'strength', Q(), true).cold.verdict));
check('cold for under-18: skipped', coldHeatAdvice('endurance', 'run', Q({ age: 16 })).cold.status === 'avoid');
check('heat with heart condition: ask doctor', coldHeatAdvice('endurance', 'run', Q({ heart: true })).heat.status === 'doctor');
check('cold/heat safety mentions never alone + alcohol', COLD_HEAT_SAFETY.some((s) => /alone/.test(s)) && COLD_HEAT_SAFETY.some((s) => /alcohol/i.test(s)));
const heavy = Array.from({ length: 56 }, (_, i) => W(addDays(T, -i), 'run', 60, 7));
const tired = Array.from({ length: 6 }, (_, i) => ci(addDays(T, -i), { score: 50, soreness: 4, motivation: 2 }));
check('deload suggested after 4+ weeks + another signal', deloadSignal(heavy, tired, T).suggest);
check('deload not suggested on time alone', !deloadSignal(heavy, [], T).suggest);
check('deload how-to has 4 steps', DELOAD_HOW.length === 4);

// ====================================================== breathing ======================================================
check('4 patterns incl. sigh / box / resonance / pre-race', ['sigh', 'box', 'resonance', 'prerace'].every((id) => !!patternById(id)));
check('cyclic sigh: exhale longer than both inhales', (() => { const p = patternById('sigh')!.phases; return p.find((x) => x.kind === 'out')!.sec > p.filter((x) => x.kind !== 'out').reduce((a, x) => a + x.sec, 0); })());
check('box = 4-4-4-4 (16 s cycle)', cycleSec(patternById('box')!.phases) === 16);
check('resonance ≈ 6 breaths/min', breathsPerMin(phasesFor(patternById('resonance')!, true)) === 6 && breathsPerMin(resonancePhases(5)) === 5 && breathsPerMin(resonancePhases(7)) === 7);
check('resonance exhale longer than inhale', resonancePhases(6)[1].sec > resonancePhases(6)[0].sec);
check('no-hold variant removes holds (5 in · 5 out)', (() => { const p = phasesFor(patternById('box')!, false); return p.length === 2 && p.every((x) => x.kind !== 'hold' && x.sec === 5); })());
check('grades: sigh + resonance moderate, box + pre-race limited', patternById('sigh')!.grade === 'moderate' && patternById('resonance')!.grade === 'moderate' && patternById('box')!.grade === 'limited' && patternById('prerace')!.grade === 'limited');
const tl = sessionTimeline(patternById('box')!, 2, true);
check('timeline length = minutes', totalSec(tl) === 120);
check('phaseAt walks the cycle', phaseAt(tl, 0).phase.kind === 'in' && phaseAt(tl, 5).phase.kind === 'hold' && phaseAt(tl, 9).phase.kind === 'out' && phaseAt(tl, 13).phase.kind === 'hold' && phaseAt(tl, 17).phase.kind === 'in');
check('phaseAt: seconds left + progress', Math.abs(phaseAt(tl, 1).left - 3) < 1e-9 && Math.abs(phaseAt(tl, 1).progress - 0.25) < 1e-9);
check('phaseAt: done at the end', phaseAt(tl, 120).done && !phaseAt(tl, 119.9).done);
const pre = sessionTimeline(patternById('prerace')!, 99, true);
check('pre-race: 3 parts, 4 minutes, cues', pre.length === 3 && totalSec(pre) === 240 && pre.every((s) => !!s.cue) && phaseAt(pre, 100).seg === 1 && phaseAt(pre, 230).seg === 2);
check('orb: grows on inhale, shrinks on exhale, holds keep size', scaleAt(patternById('box')!.phases, 0, 0) === 0.55 && scaleAt(patternById('box')!.phases, 0, 1) === 1 && scaleAt(patternById('box')!.phases, 1, 0.5) === 1 && scaleAt(patternById('box')!.phases, 2, 1) === 0.55 && scaleAt(patternById('box')!.phases, 3, 0.3) === 0.55);
check('orb: sigh top-up goes past full, exhale returns to small', scaleAt(patternById('sigh')!.phases, 1, 1) > 1 && Math.abs(scaleAt(patternById('sigh')!.phases, 2, 1) - 0.55) < 1e-9);
check('every pattern has how-to steps + sources', PATTERNS.every((p) => p.how.length >= 3 && p.src.length > 0));

// ====================================================== journal, trends ======================================================
check('journal validation (non-empty, ≤ 4000)', validJournal({ date: T, kind: 'win', text: 'ok' }) && !validJournal({ date: T, kind: 'win', text: '   ' }) && !validJournal({ date: T, kind: 'win', text: 'x'.repeat(JOURNAL_MAX + 1) }));
check('streak counts back from today (or yesterday)', dayStreak([T, addDays(T, -1), addDays(T, -2), addDays(T, -4)], T) === 3 && dayStreak([addDays(T, -1), addDays(T, -2)], T) === 2 && dayStreak([addDays(T, -3)], T) === 0);
check('best streak', bestStreak(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-05', '2026-11-06']) === 3 && bestStreak([]) === 0);
const tr = trend([ci(T, { score: 80 }), ci(addDays(T, -3), { score: 40, rec: 'recover' })], T, 14);
check('trend: n days, nulls where not logged', tr.length === 14 && tr[13].score === 80 && tr[10].score === 40 && tr[10].rec === 'recover' && tr[12].score === null);
const st = mindStats([ci(T, { score: 80 }), ci(addDays(T, -1), { score: 60 })], [{ id: 's', updatedAt: 1, date: T, kind: 'breathe', ref: 'sigh', minutes: 5 } as MindSession], [{ id: 'j', updatedAt: 1, date: T, kind: 'win', text: 'x' } as JournalEntry], T);
check('stats: streak, avg, minutes, journal', st.streak === 2 && st.avgScore7 === 70 && st.minutes7 === 5 && st.sessions7 === 1 && st.journal7 === 1);
const pcis = Array.from({ length: 8 }, (_, i) => ci(addDays(T, -i), { sleepH: i < 4 ? 8 : 6, score: i < 4 ? 80 : 60, stress: 2 }));
const pats = patterns(pcis, []);
check('patterns need ≥ 3 days per side, compare averages', pats.some((p) => p.id === 'sleep' && p.a === 80 && p.b === 60 && p.na === 4 && p.nb === 4) && !pats.some((p) => p.id === 'stress'));
check('patterns: nothing with too little data', patterns(pcis.slice(0, 4), []).length === 0);
check('mood watch: notice after 3 low days in a row', moodWatch([ci(T, { mood: 2 }), ci(addDays(T, -1), { mood: 1 }), ci(addDays(T, -2), { mood: 2 })], T) === 'notice' && moodWatch([ci(T, { mood: 2 }), ci(addDays(T, -1), { mood: 4 })], T) === 'ok');
check('mood watch: professional when most of 2 weeks are low', moodWatch(Array.from({ length: 12 }, (_, i) => ci(addDays(T, -i), { mood: i === 5 ? 4 : 2 })), T) === 'professional');
check('program progress from sessions', (() => { const s = [{ id: 'a', updatedAt: 1, date: T, kind: 'program', ref: 'focus:1', minutes: 5 }, { id: 'b', updatedAt: 1, date: T, kind: 'program', ref: 'focus:2', minutes: 5 }, { id: 'c', updatedAt: 1, date: T, kind: 'program', ref: 'focus:3', minutes: 5, deleted: true }] as MindSession[]; const p = programProgress(s, 'focus', 5); return p.done.size === 2 && p.next === 3 && p.pct === 40; })());

// ====================================================== content + sources ======================================================
const ids = new Set(SOURCES.map((s) => s.id));
check('source ids unique', ids.size === SOURCES.length);
const mindSrc = SOURCES.filter((s) => s.id.startsWith('mind-'));
check('≥ 100 mind-* sources, each with a URL + what it was used for', mindSrc.length >= 100 && mindSrc.every((s) => /^https:\/\//.test(s.url) && s.used.length > 20 && s.cite.length > 20), mindSrc.length);
check('every cited id exists', MIND_SOURCE_IDS.every((id) => ids.has(id)), MIND_SOURCE_IDS.filter((id) => !ids.has(id)));
check('every evidence card, program day, routine, tip, pattern, flag cites sources', MIND_EVIDENCE.every((e) => e.src.length) && PROGRAMS.every((p) => p.days.every((d) => d.src.length)) && ROUTINES.every((r) => r.src.length) && MIND_TIPS.every((t) => t.src.length));
check('evidence: ≥ 35 cards, unique ids, every category used', MIND_EVIDENCE.length >= 35 && new Set(MIND_EVIDENCE.map((e) => e.id)).size === MIND_EVIDENCE.length && MIND_EV_CATS.every((c) => MIND_EVIDENCE.some((e) => e.cat === c.v)));
check('evidence uses all four grades', (['strong', 'moderate', 'limited', 'weak'] as const).every((g) => MIND_EVIDENCE.some((e) => e.grade === g)));
check('ACWR graded weak and says it does not predict injury', MIND_EVIDENCE.find((e) => e.id === 'acwr')!.grade === 'weak' && /not predict/i.test(MIND_EVIDENCE.find((e) => e.id === 'acwr')!.verdict));
check('box breathing graded limited (not overclaimed)', MIND_EVIDENCE.find((e) => e.id === 'box')!.grade === 'limited');
check('Pulse evidence card: limited grade, says not validated / not a diagnosis', MIND_EVIDENCE.find((e) => e.id === 'pulse')!.grade === 'limited' && /not been validated/.test(MIND_EVIDENCE.find((e) => e.id === 'pulse')!.detail) && /not a diagnosis/.test(MIND_EVIDENCE.find((e) => e.id === 'pulse')!.detail) && !MIND_EVIDENCE.some((e) => e.id === 'who5'));
check('4 programs (7, 7, 5, 5 days) with lessons, steps + prompts', PROGRAMS.length === 4 && PROGRAMS.map((p) => p.days.length).join() === '7,7,5,5' && PROGRAMS.every((p) => p.days.every((d, i) => d.day === i + 1 && d.lesson.length > 60 && d.steps.length >= 3 && d.prompt.length > 5)));
check('program tools point at real patterns / routines', PROGRAMS.every((p) => p.days.every((d) => !d.tool || (d.tool.kind === 'breathe' ? !!patternById(d.tool.pattern) : d.tool.kind === 'routine' ? !!routineById(d.tool.id) : d.tool.lines.length >= 3))));
check('5 routines, 5–12 min, sides doubled, transitions counted', ROUTINES.length === 5 && ROUTINES.every((r) => routineSec(r) >= 240 && routineSec(r) <= 720) && routineSteps(routineById('post-run')!).length === 11 && routineSec(routineById('foam')!) === 45 * 2 * 3 + 60 + 30 * 2 + (routineSteps(routineById('foam')!).length - 1) * TRANSITION_SEC);
check('recovery planner routine links resolve', ['post-run', 'upper'].every((id) => !!routineById(id)));
check('foam rolling caution avoids injured areas', /injured/.test(routineById('foam')!.caution));
check('programById works', programById('discipline')?.days.length === 7 && !programById('nope'));
check('no invented guarantees in content', !JSON.stringify([MIND_EVIDENCE, PROGRAMS, ROUTINES]).match(/guarantee|cure[sd]?\b|100% |clinically proven/i));

// ====================================================== storage, sync, wiring ======================================================
check('collections registered', ['checkins', 'journal', 'mindsessions', 'screens'].every((c) => (COLLECTIONS as string[]).includes(c)));
const store = read('src/lib/store.tsx'), sb = read('src/lib/supabase.ts'), schema = read('supabase/schema.sql'), types = read('src/lib/types.ts'), post = read('tools/postbuild.mjs'), app = read('src/App.tsx');
check('emptyData has the 4 collections', /checkins: \[\], journal: \[\], mindsessions: \[\], screens: \[\]/.test(store));
check('Supabase table mapping', /checkins: 'mind_checkins', journal: 'journal_entries', mindsessions: 'mind_sessions', screens: 'mind_screens'/.test(sb));
check('profile.mind synced with the profile', /mind\?: import\('\.\/mind'\)\.MindPlan/.test(types));
check('localOnly records skipped on push and on pull diff', /if \(r && !isLocalOnlyRec\(r\)\)/.test(store) && /!isLocalOnlyRec\(r\) && \(!remoteIds\.has/.test(store));
check('isLocalOnly helper', isLocalOnly({ localOnly: true }) && !isLocalOnly({}) && !isLocalOnly(null));
const sync = (r: Record<string, unknown> & { id: string; updatedAt: number }) => ({ id: r.id, user_id: 'u', data: r, deleted: !!r.deleted, updated_at: new Date(r.updatedAt).toISOString(), ...('date' in r ? { day: String(r.date).slice(0, 10) } : {}) });
check('sync row mapping: day from date, data = full record', (() => { const row = sync({ ...ci(T), updatedAt: 1763380000000 } as unknown as Record<string, unknown> & { id: string; updatedAt: number }); return row.day === T && (row.data as unknown as CheckIn).score === 75 && row.deleted === false; })());
for (const t of ['mind_checkins', 'journal_entries', 'mind_sessions', 'mind_screens']) {
  check(`schema: ${t} in both loops, RLS on, anon revoked, granted, checked`, (schema.match(new RegExp(`'${t}'`, 'g')) || []).length >= 3 && new RegExp(`alter table public\\.${t} enable row level security`).test(schema) && new RegExp(`public\\.${t}[^;]*from anon`).test(schema) && new RegExp(`public\\.${t}[^;]*to authenticated`).test(schema));
}
check('schema: device-only entries rejected server-side', /journal_entries_not_local_only check/.test(schema) && /mind_screens_not_local_only check/.test(schema) && /drop constraint if exists journal_entries_not_local_only/.test(schema));
check('schema: earlier test contracts kept (sleep + gallery ordering)', (schema.match(/'sleep_logs', 'caffeine_logs', 'fasting_logs', 'gallery_items'\] loop/g) || []).length === 2 && /public\.gallery_items to authenticated;/.test(schema));
check('SQL test wired into test-social-sql.sh', read('tools/test-social-sql.sh').includes('tools/sql/test-mind.sql'));
check('routes in App + postbuild', ['/mind"', '/mind/setup"', '/mind/help"', '/mind/breathe/:id"', '/mind/routine/:id"', '/mind/program/:id"'].every((r) => app.includes(`path="${r}`)) && ["'mind'", "'mind/setup'", "'mind/help'"].every((r) => post.includes(r)));
check('Mind in the side nav', /to: '\/mind', icon: 'mind', label: 'Mind'/.test(app));
check('entry points: Home card, Me row, Coach chip', read('src/pages/Home.tsx').includes('<MindCard />') && read('src/pages/Me.tsx').includes('to="/mind"') && read('src/pages/Coach.tsx').includes('<ReadinessChip />'));
check('every mind feature is free', Object.entries(FEATURES).filter(([k]) => k.startsWith('mind.')).length === 8 && Object.entries(FEATURES).filter(([k]) => k.startsWith('mind.')).every(([k, v]) => v.free && can(k as keyof typeof FEATURES)));
const pages = ['Mind', 'MindSetup', 'MindHelp', 'MindPlayer', 'MindProgram'].map((p) => read(`src/pages/${p}.tsx`));
check('crisis support on every Mind page', pages.every((p) => /CrisisCard/.test(p)) || pages.filter((p) => /CrisisCard/.test(p)).length >= 4);
check('“not therapy” note on every Mind page', pages.every((p) => /NotTherapy/.test(p)));
check('player respects reduced motion', /prefers-reduced-motion: reduce/.test(pages[3]) && /prefers-reduced-motion: reduce/.test(read('src/styles.css')));
check('journal + check-ups honour the device-only choice', (pages[0].match(/localOnly: true/g) || []).length >= 2 && /localOnly: true/.test(pages[4]));
check('journal text runs the crisis check', /crisisInText\(t\)/.test(pages[0]) && /crisisInText\(text\)/.test(pages[4]));
check('Pulse UI: disclaimer + support + PHQ opt-in with Pfizer attribution', /PulseDisclaimer/.test(pages[0]) && /PulseSupport/.test(pages[0]) && /addPhq \? \{ phq4/.test(pages[0]) && /educational grant from Pfizer/.test(pages[0]) && /v: 2, pulse:/.test(pages[0]));
check('Pulse CSS uses theme variables only (dark/light safe)', !/#[0-9a-f]{3,8}\b|rgba?\(/i.test(read('src/pulse.css')));
check('sample data covers Mind', /checkins, journal, mindsessions, screens/.test(read('src/lib/sample.ts')));

console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
process.exit(failed ? 1 : 0);
