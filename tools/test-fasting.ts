// Unit checks for Fuel › Fasting: screening gates, allowed protocols, recommendation + eating-window placement
// (incl. windows crossing midnight / night shifts), timer math (crossing midnight, edit start, eating window),
// stages wording guard, streaks (daily + weekly) and the weekly view.
// Run: node --experimental-strip-types --import ./tools/ts-resolve.mjs tools/test-fasting.ts
import {
  PROTOCOLS, STAGES, MAX_FAST_H, H, screen, allowedProtocols, recommend, placeWindow, toMin, toHM, fwd, inWindow, proteinPlan, lowCalTarget,
  activeFast, fastHours, progress, remainingMs, goalAt, metTarget, startFromClock, validStart, eatingWindow, stageAt, dayOf,
  dayStreak, bestDayStreak, weekStreak, weekView, weekStart, stats, protocolById, defaultLowDays, fmtDur, fmtClock,
  type FastQuiz, type FastLog,
} from '../src/lib/fasting.ts';
import { SOURCES } from '../src/data/sources.ts';
import { FAST_RESEARCH, FAST_TIPS, FAST_SOURCE_IDS } from '../src/data/fastingContent.ts';
import { FEATURES, can } from '../src/lib/entitlements.ts';

let failed = 0;
const check = (name: string, cond: boolean, detail?: unknown) => { if (!cond) { failed++; console.error('FAIL', name, detail ?? ''); } else console.log('ok', name); };
const Q = (p: Partial<FastQuiz> = {}): FastQuiz => ({
  sex: 'male', age: 32, heightCm: 178, weightKg: 82, pregnant: false, breastfeeding: false, edHistory: false, diabetes: 'none', meds: false, heart: false,
  kidney: false, lowBP: false, fallsRisk: false, goal: 'weight', experience: 'some', prefer: 'daily', wake: '07:00', bed: '23:00', train: 'evening',
  trainClock: '18:00', sessionMin: 60, hard: false, trainDays: 4, ...p,
});

// ---------- content & sources ----------
const ids = new Set(SOURCES.map((s) => s.id));
check('≥ 25 fasting sources (fast-*)', SOURCES.filter((s) => s.id.startsWith('fast-')).length >= 25, SOURCES.filter((s) => s.id.startsWith('fast-')).length);
check('every protocol / stage / research / tip source id exists', [...PROTOCOLS.flatMap((p) => p.src), ...STAGES.flatMap((s) => s.src), ...FAST_SOURCE_IDS].every((i) => ids.has(i)),
  [...PROTOCOLS.flatMap((p) => p.src), ...STAGES.flatMap((s) => s.src), ...FAST_SOURCE_IDS].filter((i) => !ids.has(i)));
check('every source has an https link', SOURCES.filter((s) => s.id.startsWith('fast-')).every((s) => s.url.startsWith('https://')));
check('every research card and tip cites ≥ 1 source', [...FAST_RESEARCH, ...FAST_TIPS].every((x) => x.src.length > 0));
check('9 protocols across 3 levels', PROTOCOLS.length === 9 && ['beginner', 'intermediate', 'advanced'].every((l) => PROTOCOLS.some((p) => p.level === l)));
check('no protocol fasts longer than 24 h', PROTOCOLS.every((p) => p.fastH <= MAX_FAST_H));
check('daily protocols: fast + eat = 24 h', PROTOCOLS.filter((p) => p.kind === 'daily').every((p) => p.fastH + p.eatH === 24));
check('stage copy hedges autophagy/switch timing (no fixed “at X hours” promise)', STAGES.every((s) => !/autophagy (starts|begins|kicks in) at/i.test(s.body)) && /animal and cell/i.test(STAGES.find((s) => s.key === 'deep')!.body) && /typically|varies|depends/i.test(STAGES.find((s) => s.key === 'switch')!.body));
check('entitlements: fasting features exist and are free', (['fasting.plan', 'fasting.timer', 'fasting.history', 'fasting.research'] as const).every((f) => FEATURES[f]?.free && can(f)));

// ---------- screening gates ----------
check('healthy adult → ok', screen(Q()).level === 'ok');
check('under 18 → stop', screen(Q({ age: 17 })).stop.includes('under18'));
check('18 → not stopped for age', !screen(Q({ age: 18 })).stop.includes('under18'));
check('pregnant → stop', screen(Q({ sex: 'female', pregnant: true })).level === 'stop');
check('breastfeeding → stop', screen(Q({ sex: 'female', breastfeeding: true })).stop.includes('breastfeeding'));
check('eating-disorder history → stop', screen(Q({ edHistory: true })).stop.includes('eating-disorder'));
check('type 1 diabetes → stop', screen(Q({ diabetes: 't1' })).stop.includes('t1'));
check('type 2 on insulin / sulfonylurea → stop', screen(Q({ diabetes: 't2-insulin-su' })).stop.includes('insulin-su'));
check('BMI < 18.5 → stop', screen(Q({ weightKg: 55, heightCm: 178 })).stop.includes('underweight'), screen(Q({ weightKg: 55, heightCm: 178 })).bmi);
check('BMI 18.6 → not stopped', screen(Q({ weightKg: 59, heightCm: 178 })).level === 'ok');
check('type 2 on tablets → caution (doctor first)', screen(Q({ diabetes: 't2-meds' })).level === 'caution');
for (const [k, code] of [['meds', 'meds'], ['heart', 'heart'], ['kidney', 'kidney'], ['lowBP', 'low-bp'], ['fallsRisk', 'falls']] as const)
  check(`${k} → caution (${code})`, screen(Q({ [k]: true } as Partial<FastQuiz>)).caution.includes(code));
check('stop wins over caution', screen(Q({ age: 16, heart: true })).level === 'stop');
check('stop → no recommendation and nothing allowed', recommend(Q({ edHistory: true })) === null && allowedProtocols(Q({ edHistory: true })).length === 0);

// ---------- allowed protocols ----------
const lv = (q: FastQuiz) => allowedProtocols(q).map((id) => protocolById(id)!.level);
check('never fasted → beginner protocols only', lv(Q({ experience: 'none' })).every((l) => l === 'beginner'));
check('some experience → up to intermediate', lv(Q({ experience: 'some' })).every((l) => l !== 'advanced') && lv(Q({ experience: 'some' })).includes('intermediate'));
check('regular → advanced unlocked', lv(Q({ experience: 'regular' })).includes('advanced'));
check('caution caps at beginner even when experienced', lv(Q({ experience: 'regular', meds: true })).every((l) => l === 'beginner'));
check('heart disease → only daily windows ≥ 10 h', allowedProtocols(Q({ heart: true, experience: 'regular' })).every((id) => { const p = protocolById(id)!; return p.kind === 'daily' && p.eatH >= 10; }));
check('diabetes on tablets → no low-calorie days', !allowedProtocols(Q({ diabetes: 't2-meds', experience: 'regular' })).some((id) => protocolById(id)!.kind !== 'daily'));

// ---------- recommendation ----------
const r1 = recommend(Q({ experience: 'none' }))!;
check('beginner → 14:10, starting with 12:12 (NEJM gradual plan)', r1.protocol === 'tre14' && r1.startWith === 'tre12', r1);
check('some experience, normal load → 16:8', recommend(Q())!.protocol === 'tre16');
check('some experience + performance goal → 14:10 (room to fuel)', recommend(Q({ goal: 'performance' }))!.protocol === 'tre14');
check('regular, weight goal → 16:8 (longer didn’t add loss)', recommend(Q({ experience: 'regular' }))!.protocol === 'tre16');
check('regular, routine goal, light training → 18:6', recommend(Q({ experience: 'regular', goal: 'routine' }))!.protocol === 'tre18');
check('regular + hard training → capped at 16:8', recommend(Q({ experience: 'regular', goal: 'routine', hard: true }))!.protocol === 'tre16');
check('20:4 is never the default pick', [Q({ experience: 'regular', goal: 'routine' }), Q({ experience: 'regular', goal: 'health' }), Q({ experience: 'regular', train: 'none' })].every((q) => recommend(q)!.protocol !== 'tre20'));
check('health goal + morning training → early TRE', recommend(Q({ goal: 'health', train: 'morning', trainClock: '07:00' }))!.protocol === 'etre');
check('prefers weekly, weight goal, some experience → 5:2', recommend(Q({ prefer: 'weekly' }))!.protocol === 'fiveTwo');
check('weekly preference but heavy training → daily instead', protocolById(recommend(Q({ prefer: 'weekly', trainDays: 6 }))!.protocol)!.kind === 'daily');
check('caution → beginner pick', protocolById(recommend(Q({ experience: 'regular', kidney: true }))!.protocol)!.level === 'beginner');
check('heart disease → 12:12/14:10', ['tre12', 'tre14'].includes(recommend(Q({ heart: true, experience: 'regular' }))!.protocol));
check('weight goal → honest “matched, didn’t beat” note', recommend(Q())!.why.some((w) => /didn’t beat/.test(w)));
check('recommended protocol is always allowed', [Q(), Q({ experience: 'none' }), Q({ experience: 'regular', goal: 'health', train: 'morning' }), Q({ heart: true }), Q({ prefer: 'weekly' })].every((q) => allowedProtocols(q).includes(recommend(q)!.protocol)));

// ---------- eating-window placement ----------
check('clock helpers', toMin('18:30') === 1110 && toHM(1110) === '18:30' && toHM(1440 + 60) === '01:00' && toHM(-60) === '23:00' && fwd(toMin('22:00'), toMin('02:00')) === 240);
check('inWindow across midnight', inWindow(toMin('01:00'), toMin('20:00'), 8 * 60) && !inWindow(toMin('05:00'), toMin('20:00'), 8 * 60));
const w0 = placeWindow(8, Q({ train: 'none' })).window;
check('16:8, no training, 7:00–23:00 → 12:00–20:00 (3 h before bed)', w0.start === '12:00' && w0.end === '20:00', w0);
const wEve = placeWindow(8, Q({ train: 'evening', trainClock: '18:00', sessionMin: 60 })).window;
check('evening 18:00 session → post-workout meal inside the window', inWindow(toMin('19:30'), toMin(wEve.start), 480), wEve);
const wMorn = placeWindow(8, Q({ train: 'morning', trainClock: '06:30', wake: '06:00', bed: '22:00', sessionMin: 45 }));
check('morning 06:30 session → window opens for the post-workout meal', inWindow(toMin('07:45'), toMin(wMorn.window.start), 480), wMorn.window);
check('…and notes training at the end of the fast', wMorn.notes.some((n) => /end of your fast/.test(n)));
const wHard = placeWindow(8, Q({ train: 'midday', trainClock: '12:00', sessionMin: 90, hard: true }));
check('hard midday session → window holds pre (10:00) and post (14:00) meals', inWindow(toMin('10:00'), toMin(wHard.window.start), 480) && inWindow(toMin('14:00'), toMin(wHard.window.start), 480), wHard.window);
const wHardShort = placeWindow(4, Q({ train: 'midday', trainClock: '12:00', sessionMin: 120, hard: true }));
check('4-h window can’t hold pre + post → warning note', wHardShort.notes.some((n) => /pre- and post-workout/.test(n)), wHardShort);
const wNight = placeWindow(8, Q({ wake: '14:00', bed: '06:00', train: 'none' })).window;
check('night shift (wake 14:00, bed 06:00) → window crosses midnight 19:00–03:00', wNight.start === '19:00' && wNight.end === '03:00', wNight);
const wNightTrain = placeWindow(8, Q({ wake: '14:00', bed: '06:00', train: 'evening', trainClock: '23:30', sessionMin: 60 })).window;
check('night shift training 23:30 → post-workout 01:00 inside window', inWindow(toMin('01:00'), toMin(wNightTrain.start), 480), wNightTrain);
const wEarly = placeWindow(8, Q({ train: 'none' }), true).window;
check('early TRE → earliest window (08:00–16:00)', wEarly.start === '08:00' && wEarly.end === '16:00', wEarly);
check('every window ends ≥ 1 h before bed', [w0, wEve, wMorn.window, wHard.window, wEarly].every((w) => fwd(toMin(w.end), toMin('23:00')) >= 60 || fwd(toMin(w.end), toMin('22:00')) >= 60));

// ---------- protein / low-cal tie-ins ----------
check('protein: 8-h window → 3 meals; 4-h → 2; 12-h → 4', proteinPlan(150, 8).meals === 3 && proteinPlan(150, 4).meals === 2 && proteinPlan(150, 12).meals === 4 && proteinPlan(150, 8).perMeal === 50);
check('5:2 low day: 500 (women) / 600 (men) kcal', lowCalTarget('fiveTwo', 'female', 2200) === 500 && lowCalTarget('fiveTwo', 'male', 2800) === 600);
check('modified ADF low day ≈ 25% of maintenance (2,600 → 650)', lowCalTarget('madf', 'male', 2600) === 650);
check('default low days: 5:2 Mon+Thu, ADF Mon/Wed/Fri', defaultLowDays('fiveTwo').join() === '0,3' && defaultLowDays('madf').join() === '0,2,4');

// ---------- timer math ----------
const at = (y: number, mo: number, d: number, h: number, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();
const s20 = at(2026, 11, 15, 20, 0);
const n12 = at(2026, 11, 16, 12, 0);
const log = (p: Partial<FastLog>): FastLog => ({ id: Math.random().toString(36).slice(2), updatedAt: 0, date: dayOf(p.start ?? s20), kind: 'timed', start: s20, targetH: 16, protocol: 'tre16', ...p });
check('elapsed across midnight: 20:00 → 12:00 = 16 h', fastHours(log({}), n12) === 16);
check('progress 100% at goal, 50% at 8 h', progress(s20, 16, n12) === 1 && progress(s20, 16, s20 + 8 * H) === 0.5);
check('goal time 20:00 + 16 h = 12:00 next day', goalAt(s20, 16) === n12 && dayOf(goalAt(s20, 16)) === '2026-11-16');
check('remaining at 10 h = 6 h; never negative', remainingMs(s20, 16, s20 + 10 * H) === 6 * H && remainingMs(s20, 16, n12 + H) === 0);
check('met target (with 1-min grace) / missed', metTarget(log({ end: n12 - 30_000 })) && !metTarget(log({ end: n12 - 30 * 60_000 })));
check('active fast = newest unended timed log', activeFast([log({ end: n12 }), log({ id: 'a', start: n12 + H })])?.id === 'a' && activeFast([log({ end: n12 })]) === null);
check('edit start: 20:00 entered at 09:00 → yesterday 20:00', startFromClock('20:00', at(2026, 11, 16, 9, 0)) === s20);
check('edit start: 07:30 entered at 09:00 → today 07:30', startFromClock('07:30', at(2026, 11, 16, 9, 0)) === at(2026, 11, 16, 7, 30));
check('edit start: “a day earlier” goes back one more day', startFromClock('07:30', at(2026, 11, 16, 9, 0), 1) === at(2026, 11, 15, 7, 30));
check('edit start: future rejected, > 36 h rejected, overlap rejected, normal ok',
  !!validStart(n12 + H, n12) && !!validStart(n12 - 40 * H, n12) && !!validStart(s20, n12, s20 + H) && validStart(s20, n12) === null);
const ew = eatingWindow(n12, 8, at(2026, 11, 16, 17, 0));
check('eating window after a 16:8 fast ending 12:00 → closes 20:00, 3 h left at 17:00', ew.open && ew.closes === at(2026, 11, 16, 20, 0) && ew.leftMs === 3 * H);
check('eating window closed after 20:00', !eatingWindow(n12, 8, at(2026, 11, 16, 21, 0)).open);
const lateEnd = at(2026, 11, 16, 20, 0);
check('eating window crossing midnight: ends 20:00 + 6 h → 02:00 next day', dayOf(eatingWindow(lateEnd, 6, lateEnd).closes) === '2026-11-17' && new Date(eatingWindow(lateEnd, 6, lateEnd).closes).getHours() === 2);
check('stages: 2 h digesting, 13 h switch, 20 h longer, 25 h past cap', stageAt(2).key === 'fed' && stageAt(13).key === 'switch' && stageAt(20).key === 'deep' && stageAt(25).key === 'cap');
check('format helpers', fmtDur(16 * H + 5 * 60_000) === '16h 05m' && fmtClock(H + 61_000) === '01:01:01');

// ---------- streaks ----------
const fast = (endDay: string, hours = 16, target = 16): FastLog => { const end = new Date(endDay + 'T12:00:00').getTime(); return log({ start: end - hours * H, end, targetH: target, date: dayOf(end - hours * H) }); };
const today = '2026-11-16';
const run = [fast('2026-11-13'), fast('2026-11-14'), fast('2026-11-15'), fast('2026-11-16')];
check('4 consecutive days → streak 4', dayStreak(run, today) === 4);
check('today not done yet → streak counts through yesterday', dayStreak(run.slice(0, 3), today) === 3);
check('gap breaks streak', dayStreak([fast('2026-11-12'), fast('2026-11-14'), fast('2026-11-15')], today) === 2);
check('missed target doesn’t count', dayStreak([fast('2026-11-15', 12, 16), fast('2026-11-16')], today) === 1);
check('deleted entries ignored', dayStreak([{ ...fast('2026-11-16'), deleted: true }], today) === 0);
check('fast crossing midnight counts for the day it ends', dayStreak([log({ start: s20, end: n12 })], '2026-11-16') === 1 && dayStreak([log({ start: s20, end: n12 })], '2026-11-15') === 0);
check('best streak', bestDayStreak([fast('2026-11-01'), fast('2026-11-02'), fast('2026-11-03'), fast('2026-11-10'), fast('2026-11-11')]) === 3);
const low = (d: string): FastLog => ({ id: 'l' + d, updatedAt: 0, date: d, kind: 'lowcal', start: new Date(d + 'T00:00:00').getTime(), end: new Date(d + 'T23:59:00').getTime(), targetH: 24, protocol: 'fiveTwo' });
check('weekStart is Monday', weekStart('2026-11-16') === '2026-11-16' && weekStart('2026-11-19') === '2026-11-16' && weekStart('2026-11-15') === '2026-11-09');
check('5:2 week streak: 2 low days in each of 2 past weeks, none yet this week → 2', weekStreak([low('2026-11-02'), low('2026-11-05'), low('2026-11-09'), low('2026-11-12')], 2, '2026-11-16') === 2);
check('5:2 week with only 1 low day breaks the streak', weekStreak([low('2026-11-02'), low('2026-11-05'), low('2026-11-09')], 2, '2026-11-16') === 0);
const wv = weekView(run, today, n12);
check('week view: 7 days oldest→newest, today last, 16 h bars met', wv.length === 7 && wv[6].day === today && wv[6].met && Math.round(wv[6].hours) === 16 && !wv[0].met);
const st = stats([...run, low('2026-11-10')], today, n12);
check('stats: totals, avg, longest', st.total === 5 && Math.round(st.avg7) === 16 && Math.round(st.longest) === 16 && st.metRate === 1);

console.log(failed ? `\n${failed} FAILED` : '\nall fasting checks passed');
process.exit(failed ? 1 : 0);
