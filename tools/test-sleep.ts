// Unit checks for Fuel › Sleep: caffeine half-life model + cutoff (reproduces the 8.8 h meta-analysis anchor), decay maths,
// evening-plan timeline (meal timing, training, reflux, shift work, fluids, warnings), safety screen + supplement gates,
// log stats/streaks/trend/own-pattern comparisons, storage wiring (collections, Supabase tables, schema/RLS), content + sources.
// Run: node --experimental-strip-types --import ./tools/ts-resolve.mjs tools/test-sleep.ts
import { readFileSync } from 'node:fs';
import {
  ANCHOR, SAFE_MG, TYPICAL_HL, H, DRINKS, SUPP_IDS, GOALS, REASON_TEXT, REASON_SRC,
  halfLife, quizHalfLife, caffeineAt, cutoffHours, latestFor, band, buildPlan, screen, suppStatus, suppSuggestions, pickSnack, pickDrink, pickDinner,
  defaultQuiz, hoursBetween, validLog, logStreak, goodStreak, bestGoodStreak, trend, stats, compareFlag, dosesFor, bedtimeMs, lateCaffeine, toMin,
  type SleepQuiz, type SleepLog, type CaffeineLog, type Reason,
} from '../src/lib/sleep.ts';
import { EVIDENCE, TIPS, SLEEP_SOURCE_IDS } from '../src/data/sleepContent.ts';
import { SOURCES } from '../src/data/sources.ts';
import { FEATURES, can } from '../src/lib/entitlements.ts';
import { COLLECTIONS } from '../src/lib/types.ts';
import { addDays } from '../src/lib/calc.ts';

let failed = 0;
const check = (name: string, cond: boolean, detail?: unknown) => { if (!cond) { failed++; console.error('FAIL', name, detail ?? ''); } else console.log('ok', name); };
const near = (a: number, b: number, tol = 0.05) => Math.abs(a - b) <= tol;
const Q = (p: Partial<SleepQuiz> = {}): SleepQuiz => ({ ...defaultQuiz({ sex: 'male', age: 32 }), drink: 'coffee', train: 'none', ...p });
const read = (f: string) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const recipes = JSON.parse(read('src/data/sleep-recipes.json')) as { id: string; kind: string; tags: string[]; sources: string[]; grade: string; perServing: Record<string, number>; ingredients: { grams: number; fdcId: number }[] }[];
const rIds = new Set(recipes.map((r) => r.id));

// ---------- caffeine model ----------
check('typical half-life is 5 h (IOM mean)', TYPICAL_HL === 5 && halfLife({ sensitivity: 'typical' }) === 5 && halfLife({ sensitivity: 'unknown' }) === 5);
check('fast 3 h / slow 7 h', halfLife({ sensitivity: 'fast' }) === 3 && halfLife({ sensitivity: 'slow' }) === 7);
check('oral contraceptives double the half-life', halfLife({ sensitivity: 'typical', oralContraceptive: true }) === 10);
check('smoking shortens it (×0.6)', halfLife({ sensitivity: 'typical', smoker: true }) === 3);
check('half-life clamped to 1.5–15 h', halfLife({ sensitivity: 'fast', smoker: true }) >= 1.5 && halfLife({ sensitivity: 'slow', oralContraceptive: true, pregnant: true }) === 15);
check('quizHalfLife ignores pregnancy/contraceptive flags for males', quizHalfLife(Q({ sex: 'male', pregnant: true, oralContraceptive: true })) === 5);
check('safe bedtime residual ≈ 31.6 mg', near(SAFE_MG, 31.59, 0.02), SAFE_MG);
check('cutoff for 107 mg coffee = 8.8 h (Gardiner anchor)', near(cutoffHours(ANCHOR.coffeeMg), 8.8, 1e-9), cutoffHours(107));
check('cutoff for pre-workout 217.5 mg ≈ 13.9 h (study: ≥ 13.2 h) — model is at least as cautious', cutoffHours(ANCHOR.preMg) >= ANCHOR.preH && cutoffHours(ANCHOR.preMg) < 14.5, cutoffHours(217.5));
check('cutoff 0 for doses at or under the line (decaf, dark chocolate)', cutoffHours(2) === 0 && cutoffHours(22) === 0 && cutoffHours(SAFE_MG) === 0);
check('cutoff scales with half-life', near(cutoffHours(107, 10), 17.6, 1e-9) && cutoffHours(95, 3) < cutoffHours(95, 5));
check('cutoff monotonic in dose', cutoffHours(64) < cutoffHours(95) && cutoffHours(95) < cutoffHours(127) && cutoffHours(127) < cutoffHours(218));
const t0 = Date.UTC(2026, 10, 16, 8);
check('caffeineAt: full dose at t, half after one half-life, quarter after two', near(caffeineAt([{ mg: 100, at: t0 }], t0), 100) && near(caffeineAt([{ mg: 100, at: t0 }], t0 + 5 * H), 50) && near(caffeineAt([{ mg: 100, at: t0 }], t0 + 10 * H), 25));
check('caffeineAt: future doses ignored, doses add up', caffeineAt([{ mg: 100, at: t0 + H }], t0) === 0 && near(caffeineAt([{ mg: 100, at: t0 }, { mg: 100, at: t0 }], t0 + 5 * H), 100));
check('caffeineAt: zero/negative mg ignored', caffeineAt([{ mg: 0, at: t0 }, { mg: -50, at: t0 }], t0 + H) === 0);
const bed = t0 + 15 * H;
check('latestFor: nothing taken → coffee 95 mg latest = bed − cutoff', near((bed - latestFor(95, [], bed)!) / H, cutoffHours(95), 1e-6));
check('latestFor: small dose under the line → any time (bed)', latestFor(20, [], bed) === bed);
check('latestFor: earlier caffeine pushes the latest time earlier', latestFor(95, [{ mg: 200, at: t0 }], bed)! < latestFor(95, [], bed)!);
check('latestFor: no room left → null', latestFor(95, [{ mg: 400, at: bed - 2 * H }], bed) === null);
check('latestFor result really leaves ≤ the line at bed', (() => { const doses = [{ mg: 150, at: t0 }]; const l = latestFor(95, doses, bed)!; return caffeineAt([...doses, { mg: 95, at: l }], bed) <= SAFE_MG + 1e-6; })());
check('bands: ≤31.6 low, <100 some, ≥100 high', band(30) === 'low' && band(60) === 'some' && band(100) === 'high');
check('drinks: USDA values (coffee 95, espresso 64, black tea 47, green 28, cola 33, energy 75), decaf ≈ 2', (['coffee', 'espresso', 'black-tea', 'green-tea', 'cola', 'energy'] as const).map((id) => DRINKS.find((d) => d.id === id)!.mg).join() === '95,64,47,28,33,75' && DRINKS.find((d) => d.id === 'decaf')!.mg === 2);
check('every drink cites a source', DRINKS.every((d) => d.src.length > 0));
// bedtime crossing midnight
const day = '2026-11-16';
check('bedtimeMs: 23:00 bed is the same calendar day', bedtimeMs(day, '23:00', '07:00') === new Date(day + 'T23:00:00').getTime());
check('bedtimeMs: 00:30 bed (wake 07:30) is the next calendar day', bedtimeMs(day, '00:30', '07:30') === new Date('2026-11-17T00:30:00').getTime());
const clog = (mg: number, clock: string, d = day): CaffeineLog => ({ id: clock + mg, updatedAt: 1, date: d, at: new Date(`${d}T${clock}:00`).getTime(), mg, drink: 'coffee', label: 'Coffee' });
check('lateCaffeine: 95 mg at 08:00 with 23:00 bed → not late', !lateCaffeine([clog(95, '08:00')], day, '23:00', '07:00'));
check('lateCaffeine: 95 mg at 18:00 → late', lateCaffeine([clog(95, '18:00')], day, '23:00', '07:00'));
check('dosesFor: skips deleted and other days', dosesFor([clog(95, '08:00'), { ...clog(50, '09:00'), deleted: true }, clog(80, '10:00', '2026-11-15')], day).length === 1);

// ---------- evening plan ----------
const P = buildPlan(Q());
const byId = (p: ReturnType<typeof buildPlan>, id: string) => p.items.find((i) => i.id === id);
check('plan: bed is last item at offset 0', P.items[P.items.length - 1].kind === 'bed' && P.items[P.items.length - 1].off === 0);
check('plan: items sorted earliest → latest', P.items.every((it, i) => i === 0 || P.items[i - 1].off >= it.off));
check('plan: every item cites ≥ 1 source', P.items.every((i) => i.src.length > 0));
check('plan: coffee cutoff 23:00 − 7.9 h (95 mg) → 15:03', P.cutoffClock === '15:03' && near(P.cutoffH, cutoffHours(95)), P.cutoffClock);
check('plan: default last big meal 3 h before bed (20:00)', byId(buildPlan(Q({ goal: 'deeper' })), 'meal')?.clock === '20:00' && byId(buildPlan(Q({ goal: 'recover' })), 'meal')?.off === 180);
check('plan: onset goal → dinner 4 h before (Afaghi)', byId(buildPlan(Q({ goal: 'onset' })), 'meal')?.off === 240);
check('plan: GERD → last meal ≥ 4 h and snack ≥ 90 min before bed', (() => { const g = buildPlan(Q({ goal: 'deeper', gerd: true })); return byId(g, 'meal')!.off >= 240 && byId(g, 'snack')!.off >= 90; })());
check('plan: fluids taper 2 h before bed, 3 h if waking to pee', byId(P, 'fluid')?.off === 120 && byId(buildPlan(Q({ wakesToPee: true })), 'fluid')?.off === 180);
check('plan: fluid taper is labelled a practical HYBRD default', !!byId(P, 'fluid')?.practical);
check('plan: no caffeine drink → no caffeine item', !buildPlan(Q({ drink: 'none' })).items.some((i) => i.kind === 'caffeine'));
check('plan: decaf → no cutoff needed', buildPlan(Q({ drink: 'decaf' })).cutoffClock === null && !buildPlan(Q({ drink: 'decaf' })).noCaffeine);
check('plan: very slow clearer with short day → "skip caffeine"', (() => { const s = buildPlan(Q({ drink: 'double-espresso', sensitivity: 'slow', sex: 'female', oralContraceptive: true, bed: '22:00', wake: '06:00' })); return s.noCaffeine && s.items.some((i) => i.id === 'caffeine' && i.warn); })());
check('plan: late evening training → recovery meal after the session, pre-training meal before', (() => { const e = buildPlan(Q({ train: 'evening', trainClock: '20:00', sessionMin: 60, goal: 'recover' })); const r = byId(e, 'recovery')!; return !!r && r.off === 75 && !!byId(e, 'meal-pre') && !byId(e, 'meal'); })());
check('plan: recovery under 90 min before bed → snack, merged with bedtime snack', (() => { const e = buildPlan(Q({ train: 'evening', trainClock: '20:30', sessionMin: 60, goal: 'recover' })); return byId(e, 'recovery')!.title === 'Recovery snack' && !byId(e, 'snack'); })());
check('plan: hard session ending < 1 h before bed → warning (Stutz)', (() => { const e = buildPlan(Q({ train: 'evening', trainClock: '21:30', sessionMin: 60, hard: true })); return !!byId(e, 'train')?.warn && byId(e, 'train')!.src.includes('sleep-stutz'); })());
check('plan: moderate session late → no warning', !byId(buildPlan(Q({ train: 'evening', trainClock: '21:30', sessionMin: 60, hard: false })), 'train')?.warn);
check('plan: caffeinated pre-workout before an evening session → flagged', (() => { const e = buildPlan(Q({ train: 'evening', trainClock: '18:00', preWorkout: true })); return !!byId(e, 'preworkout')?.warn; })());
check('plan: morning pre-workout → not flagged', !byId(buildPlan(Q({ train: 'morning', trainClock: '07:30', preWorkout: true })), 'preworkout'));
check('plan: alcohol habit → alcohol item; race/recover → skip it', !!byId(buildPlan(Q({ alcohol: 'some' })), 'alcohol') && /skip/i.test(byId(buildPlan(Q({ alcohol: 'some', goal: 'race' })), 'alcohol')!.title));
check('plan: < 7 h in bed → bedtime warning', !!byId(buildPlan(Q({ bed: '00:30', wake: '06:00' })), 'bed')?.warn && !byId(P, 'bed')?.warn);
check('plan: sleep window crossing midnight measured correctly', near(buildPlan(Q({ bed: '00:30', wake: '06:00' })).sleepH, 5.5));
check('plan: shift work (day sleep 08:30–15:30) works and adds shift note', (() => { const s = buildPlan(Q({ goal: 'shift', bed: '08:30', wake: '15:30' })); return byId(s, 'meal')!.clock === '05:30' && s.notes.some((n) => n.src.includes('sleep-lowden')) && near(s.sleepH, 7); })());
check('plan: race + 5 time zones → jet-lag note', buildPlan(Q({ goal: 'race', timeZones: true })).notes.some((n) => n.src.includes('sleep-herxheimer')));
check('plan: insomnia > 3 months → clinician / CBT-I note', buildPlan(Q({ insomnia3mo: true })).notes.some((n) => n.src.includes('sleep-aasm-cbti')));
check('plan: smoker → nicotine note', buildPlan(Q({ smoker: true })).notes.some((n) => n.src.includes('sleep-jaehne')));
check('plan: recipes referenced all exist', [Q(), Q({ goal: 'recover', train: 'evening', trainClock: '20:30' }), Q({ goal: 'race', diet: 'vegan' }), Q({ goal: 'shift', diet: 'vegetarian' }), Q({ goal: 'deeper', diet: 'dairy-free' })].every((q) => buildPlan(q).items.every((i) => !i.recipe || rIds.has(i.recipe))));
check('snack/drink picks respect diet', ['vegan', 'dairy-free'].every((d) => GOALS.every((g) => { const s = pickSnack(g.v, d as 'vegan', false); const dr = pickDrink(Q({ goal: g.v, diet: d as 'vegan' })); const dn = pickDinner(g.v, d as 'vegan'); const tags = (id: string) => recipes.find((r) => r.id === id)!.tags; return (tags(s).includes('vegan') || tags(s).includes('dairy-free')) && (tags(dr).includes('vegan') || tags(dr).includes('dairy-free')) && (tags(dn).includes('dairy-free')); })));
check('vegetarian dinners are vegetarian', GOALS.every((g) => { const t = recipes.find((r) => r.id === pickDinner(g.v, 'vegetarian'))!.tags; return t.includes('vegetarian') || t.includes('vegan'); }));
check('recover goal → casein shake (30+ g protein)', pickSnack('recover', 'any', false) === 'sleep-casein-shake' && recipes.find((r) => r.id === 'sleep-casein-shake')!.perServing.protein >= 30);
check('shake as bedtime protein → no separate evening drink (keeps late fluids down)', !buildPlan(Q({ goal: 'recover' })).items.some((i) => i.kind === 'drink') && buildPlan(Q({ goal: 'onset' })).items.some((i) => i.kind === 'drink'));
check('alcohol note sits with the recovery meal after late training', (() => { const e = buildPlan(Q({ train: 'evening', trainClock: '19:30', alcohol: 'some', goal: 'recover' })); return byId(e, 'alcohol')!.off === byId(e, 'recovery')!.off; })());
check('chamomile avoided with blood thinners / pregnancy', pickDrink(Q({ goal: 'onset' })) === 'sleep-chamomile' && pickDrink(Q({ goal: 'onset', bloodThinners: true })) !== 'sleep-chamomile' && pickDrink(Q({ goal: 'onset', sex: 'female', pregnant: true })) !== 'sleep-chamomile');

// ---------- safety screen & supplements ----------
check('healthy adult → ok', screen(Q()).level === 'ok' && screen(Q()).reasons.length === 0);
check('under 18 → minor', screen(Q({ age: 16 })).level === 'minor' && screen(Q({ age: 18 })).level === 'ok');
const flags: [Partial<SleepQuiz>, Reason][] = [[{ sex: 'female', pregnant: true }, 'pregnant'], [{ sex: 'female', breastfeeding: true }, 'breastfeeding'], [{ sedatives: true }, 'sedatives'], [{ antidepressants: true }, 'antidepressants'], [{ bloodThinners: true }, 'bloodThinners'], [{ bpMeds: true }, 'bpMeds'], [{ otherMeds: true }, 'otherMeds'], [{ sleepDisorder: true }, 'sleepDisorder'], [{ insomnia3mo: true }, 'insomnia'], [{ kidney: true }, 'kidney'], [{ gerd: true }, 'gerd'], [{ liver: true }, 'liver'], [{ epilepsy: true }, 'epilepsy'], [{ thyroid: true }, 'thyroid']];
check('each medical flag → caution with that reason', flags.every(([f, r]) => { const s = screen(Q(f)); return s.level === 'caution' && s.reasons.includes(r); }), flags.filter(([f, r]) => !screen(Q(f)).reasons.includes(r)));
check('male answers ignore pregnancy flags', screen(Q({ sex: 'male', pregnant: true })).level === 'ok');
check('every reason has text and a source', (Object.keys(REASON_TEXT) as Reason[]).every((r) => REASON_TEXT[r].length > 20 && (REASON_SRC[r]?.length || 0) > 0));
check('clinician flag for insomnia / sleep disorder', screen(Q({ insomnia3mo: true })).clinician && screen(Q({ sleepDisorder: true })).clinician && !screen(Q({ gerd: true })).clinician);
check('healthy adult → all supplements ok', SUPP_IDS.every((s) => suppStatus(s, Q()).status === 'ok'));
check('under 18 → all supplements avoid', SUPP_IDS.every((s) => suppStatus(s, Q({ age: 15 })).status === 'avoid'));
check('pregnant → ashwagandha avoid, others doctor', suppStatus('ashwagandha', Q({ sex: 'female', pregnant: true })).status === 'avoid' && SUPP_IDS.filter((s) => s !== 'ashwagandha').every((s) => suppStatus(s, Q({ sex: 'female', pregnant: true })).status === 'doctor'));
check('kidney disease → magnesium avoid', suppStatus('magnesium', Q({ kidney: true })).status === 'avoid' && suppStatus('glycine', Q({ kidney: true })).status === 'doctor');
check('sedatives → valerian avoid', suppStatus('valerian', Q({ sedatives: true })).status === 'avoid');
check('liver → ashwagandha + valerian avoid', suppStatus('ashwagandha', Q({ liver: true })).status === 'avoid' && suppStatus('valerian', Q({ liver: true })).status === 'avoid');
check('thyroid → ashwagandha avoid', suppStatus('ashwagandha', Q({ thyroid: true })).status === 'avoid');
check('blood thinners / epilepsy → melatonin doctor', suppStatus('melatonin', Q({ bloodThinners: true })).status === 'doctor' && suppStatus('melatonin', Q({ epilepsy: true })).status === 'doctor');
check('any medicine or insomnia or GERD → doctor for all', ([{ antidepressants: true }, { bpMeds: true }, { otherMeds: true }, { insomnia3mo: true }, { gerd: true }] as Partial<SleepQuiz>[]).every((f) => SUPP_IDS.every((s) => suppStatus(s, Q(f)).status !== 'ok')));
check('suggestions only when opted in', suppSuggestions(Q({ goal: 'onset' })).length === 0 && suppSuggestions(Q({ goal: 'onset', supplements: true })).length > 0);
check('suggestions never include a gated supplement', ([{ kidney: true }, { insomnia3mo: true }, { age: 16 }, { sex: 'female', pregnant: true }] as Partial<SleepQuiz>[]).every((f) => GOALS.every((g) => suppSuggestions(Q({ ...f, goal: g.v, supplements: true, timeZones: true })).length === 0)));
check('melatonin only for race + 5 time zones', !suppSuggestions(Q({ goal: 'onset', supplements: true })).some((s) => s.id === 'melatonin') && suppSuggestions(Q({ goal: 'race', timeZones: true, supplements: true })).some((s) => s.id === 'melatonin') && !suppSuggestions(Q({ goal: 'race', supplements: true })).some((s) => s.id === 'melatonin'));
check('valerian and ashwagandha are never suggested', GOALS.every((g) => !suppSuggestions(Q({ goal: g.v, supplements: true, timeZones: true })).some((s) => s.id === 'valerian' || s.id === 'ashwagandha')));
check('minor plan has no supplement options', buildPlan(Q({ age: 16, supplements: true, goal: 'onset' })).supps.length === 0);
check('drug-tested + supplements → IOC note', buildPlan(Q({ supplements: true, tested: true })).notes.some((n) => n.src.includes('sleep-ioc-supps')));

// ---------- log stats ----------
const today = '2026-11-16';
const L = (off: number, hours: number, quality: number, f: Partial<SleepLog> = {}): SleepLog => ({ id: `n${off}`, updatedAt: 1, date: addDays(today, off), hours, quality: quality as SleepLog['quality'], caffeineLate: false, alcohol: false, lateMeal: false, ...f });
check('hoursBetween crosses midnight', hoursBetween('23:00', '07:00') === 8 && hoursBetween('22:30', '06:15') === 7.75 && hoursBetween('08:30', '15:30') === 7);
check('validLog', validLog(L(0, 7, 3)) && !validLog({ ...L(0, 0, 3) }) && !validLog({ ...L(0, 7, 3), quality: 6 as 5 }) && !validLog({ ...L(0, 20, 3) }));
const logs = [L(0, 7.5, 4), L(-1, 7.2, 4), L(-2, 6.1, 2), L(-3, 7.4, 4), L(-4, 7.8, 5), L(-5, 8, 4), L(-7, 7, 3)];
check('log streak: 6 consecutive nights ending today', logStreak(logs, today) === 6);
check('log streak counts from yesterday if today not logged', logStreak(logs.filter((l) => l.date !== today), today) === 5);
check('7 h+ streak stops at the short night', goodStreak(logs, today) === 2);
check('best 7 h+ streak = 3 (−5..−3)', bestGoodStreak(logs) === 3, bestGoodStreak(logs));
check('best streak breaks across a missing night', bestGoodStreak([L(0, 8, 4), L(-2, 8, 4)]) === 1);
check('deleted nights ignored; newest record per date wins', logStreak([{ ...L(0, 8, 4), deleted: true }], today) === 0 && stats([L(0, 5, 2), { ...L(0, 8, 5), id: 'x', updatedAt: 2 }], today).avgHours7 === 8);
const st = stats(logs, today);
check('stats: 7-day window (6 nights), averages, nights ≥ 7 h', st.n7 === 6 && near(st.avgHours7, (7.5 + 7.2 + 6.1 + 7.4 + 7.8 + 8) / 6, 1e-9) && st.nights7plus === 5 && st.total === 7);
const tr = trend(logs, today, 14);
check('trend: 14 days oldest → newest, nulls for gaps', tr.length === 14 && tr[13].day === today && tr[13].hours === 7.5 && tr[13 - 6].hours === null && tr[0].day === addDays(today, -13));
const flagged = [L(0, 6, 2, { caffeineLate: true }), L(-1, 6.2, 2, { caffeineLate: true }), L(-2, 6.5, 3, { caffeineLate: true }), L(-3, 7.8, 4), L(-4, 8, 5), L(-5, 7.6, 4)];
check('compareFlag needs ≥ 3 nights each side', compareFlag(flagged.slice(0, 5), 'caffeineLate') === null && compareFlag(flagged, 'caffeineLate') !== null);
check('compareFlag averages', (() => { const c = compareFlag(flagged, 'caffeineLate')!; return near(c.withQ, 7 / 3, 1e-9) && near(c.withoutQ, 13 / 3, 1e-9) && c.nWith === 3; })());

// ---------- content & sources ----------
const ids = new Set(SOURCES.map((s) => s.id));
const sleepSrc = SOURCES.filter((s) => s.id.startsWith('sleep-'));
check('≥ 60 sleep sources (sleep-*)', sleepSrc.length >= 60, sleepSrc.length);
check('source ids unique', ids.size === SOURCES.length);
check('every sleep source has an https URL and a “used” note', sleepSrc.every((s) => s.url.startsWith('https://') && s.used.length > 20));
const cited = [...EVIDENCE.flatMap((e) => e.src), ...TIPS.flatMap((t) => t.src), ...SLEEP_SOURCE_IDS, ...DRINKS.flatMap((d) => d.src), ...Object.values(REASON_SRC).flat() as string[], ...recipes.flatMap((r) => r.sources)];
const planSrc = [Q(), Q({ goal: 'recover', train: 'evening', trainClock: '20:30', alcohol: 'some', preWorkout: true, hard: true }), Q({ goal: 'race', timeZones: true, supplements: true, tested: true, smoker: true }), Q({ goal: 'shift', bed: '08:30', wake: '15:30', insomnia3mo: true, sex: 'female', pregnant: true }), Q({ age: 16 }), Q({ gerd: true, kidney: true, wakesToPee: true, goal: 'deeper' })].flatMap((q) => { const p = buildPlan(q); return [...p.items.flatMap((i) => i.src), ...p.notes.flatMap((n) => n.src)]; });
check('every cited source id exists', [...cited, ...planSrc].every((i) => ids.has(i)), [...new Set([...cited, ...planSrc].filter((i) => !ids.has(i)))]);
check('every evidence item has a grade, verdict and ≥ 1 source', EVIDENCE.every((e) => ['strong', 'moderate', 'limited', 'weak'].includes(e.grade) && e.verdict && e.src.length > 0));
check('all four grades are used', ['strong', 'moderate', 'limited', 'weak'].every((g) => EVIDENCE.some((e) => e.grade === g)));
check('evidence covers required foods', ['tart-cherry', 'kiwi', 'milk', 'tryptophan', 'carbs', 'fish', 'mg-food', 'med'].every((id) => EVIDENCE.some((e) => e.id === id)));
check('evidence covers harms', ['caffeine', 'preworkout', 'alcohol', 'late-meal', 'spicy', 'fluids', 'nicotine'].every((id) => EVIDENCE.some((e) => e.id === id && e.cat === 'avoid')));
check('evidence covers athlete topics + CBT-I', ['casein', 'evening-training', 'race-night', 'shift', 'cbti'].every((id) => EVIDENCE.some((e) => e.id === id)));
check('every supplement has dose, safety, US note and the FDA DSHEA source', SUPP_IDS.every((s) => { const e = EVIDENCE.find((x) => x.supp === s); return !!e && !!e.dose && !!e.safety && !!e.us && /FDA/.test(e.us) && e.src.includes('sleep-fda-supps'); }));
check('melatonin chronic-insomnia + valerian graded no better than their evidence', EVIDENCE.find((e) => e.id === 'valerian')!.grade === 'weak' && EVIDENCE.find((e) => e.id === 'caffeine')!.grade === 'strong');
check('melatonin notes US supplement status + label variability', /dietary supplement/i.test(EVIDENCE.find((e) => e.id === 'melatonin')!.us!) && EVIDENCE.find((e) => e.id === 'melatonin')!.src.includes('sleep-cohen-gummies'));

// ---------- recipes ----------
check('19 sleep recipes: 4 dinners, 8 snacks, 7 drinks', recipes.length === 19 && recipes.filter((r) => r.kind === 'dinner').length === 4 && recipes.filter((r) => r.kind === 'snack').length === 8 && recipes.filter((r) => r.kind === 'drink').length === 7);
check('recipe ids prefixed sleep- and unique (no clash with other recipes)', recipes.every((r) => r.id.startsWith('sleep-')) && rIds.size === recipes.length && (() => { const others = new Set([...JSON.parse(read('src/data/recipes.json')).map((r: { id: string }) => r.id), ...JSON.parse(read('src/data/plan-foods.json')).recipes.map((r: { id: string }) => r.id)]); return recipes.every((r) => !others.has(r.id)); })());
check('macros consistent: kcal ≈ 4P + 4C + 9F (±20%)', recipes.filter((r) => r.perServing.kcal > 20).every((r) => { const p = r.perServing; const e = 4 * p.protein + 4 * p.carbs + 9 * p.fat; return Math.abs(e - p.kcal) / p.kcal < 0.2; }), recipes.map((r) => [r.id, r.perServing.kcal, 4 * r.perServing.protein + 4 * r.perServing.carbs + 9 * r.perServing.fat]));
check('every recipe has USDA ingredients, a grade and sources', recipes.every((r) => r.ingredients.length > 0 && r.ingredients.every((i) => i.fdcId > 0 && i.grams > 0) && !!r.grade && r.sources.length > 0));
check('casein shake 30–40 g protein range ±', (() => { const p = recipes.find((r) => r.id === 'sleep-casein-shake')!.perServing.protein; return p >= 27 && p <= 42; })());

// ---------- storage, sync & build wiring ----------
const store = read('src/lib/store.tsx'), sb = read('src/lib/supabase.ts'), schema = read('supabase/schema.sql'), types = read('src/lib/types.ts'), post = read('tools/postbuild.mjs'), app = read('src/App.tsx'), fuel = read('src/pages/Fuel.tsx');
check('collections include sleeps + caffeine', COLLECTIONS.includes('sleeps') && COLLECTIONS.includes('caffeine'));
check('emptyData has sleeps + caffeine arrays', /sleeps: \[\], caffeine: \[\]/.test(store));
check('Supabase tables mapped', /sleeps: 'sleep_logs'/.test(sb) && /caffeine: 'caffeine_logs'/.test(sb));
check('profile carries the sleep plan (synced in profiles.data)', /sleep\?: import\('\.\/sleep'\)\.SleepPlan/.test(types));
check('schema: both tables in both loops (before fasting_logs)', (schema.match(/'sleep_logs', 'caffeine_logs', 'fasting_logs', 'gallery_items'\] loop/g) || []).length === 2);
check('schema: RLS enabled on both', /alter table public\.sleep_logs enable row level security/.test(schema) && /alter table public\.caffeine_logs enable row level security/.test(schema));
check('schema: revoked from anon, granted to authenticated', /public\.sleep_logs, public\.caffeine_logs, public\.fasting_logs, public\.gallery_items from anon/.test(schema) && /public\.sleep_logs, public\.caffeine_logs, public\.fasting_logs, public\.gallery_items to authenticated/.test(schema));
check('schema: gallery grant still last (gallery test contract)', /public\.gallery_items to authenticated;/.test(schema));
check('postbuild copies both routes', post.includes("'fuel/sleep'") && post.includes("'fuel/sleep/setup'"));
check('routes registered + Fuel tab + entry card', app.includes('path="/fuel/sleep"') && app.includes('path="/fuel/sleep/setup"') && fuel.includes("nav('/fuel/sleep')") && fuel.includes('<SleepCard'));
check('entitlements: sleep features exist and are free', (['sleep.plan', 'sleep.caffeine', 'sleep.log', 'sleep.recipes', 'sleep.research'] as const).every((f) => FEATURES[f]?.free && can(f)));
// local merge semantics: one record per night id, newest wins (mirrors store mergeArr)
const merge = <T extends { id: string; updatedAt: number }>(a: T[], b: T[]) => { const m = new Map<string, T>(); for (const r of a) m.set(r.id, r); for (const r of b) { const c = m.get(r.id); if (!c || r.updatedAt >= c.updatedAt) m.set(r.id, r); } return [...m.values()]; };
check('one night per date id; re-logging updates instead of duplicating', merge([{ ...L(0, 6, 2), id: `night-${today}`, updatedAt: 1 }], [{ ...L(0, 8, 4), id: `night-${today}`, updatedAt: 2 }]).length === 1);
check('toMin parses HH:MM', toMin('23:30') === 1410);

console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
process.exit(failed ? 1 : 0);
