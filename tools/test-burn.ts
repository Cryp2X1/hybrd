// Unit checks for the calories-burned tracker (aggregation, resting proration, step double-count rules, streak).
// Run: node --experimental-strip-types --import ./tools/ts-resolve.mjs tools/test-burn.ts
import { dayBurn, rangeBurn, burnStreak, stepBurnSteps, stepBurnKcal, kcalPerStep, metBurnKcal, elapsedMinutes, burnGoalOf, workoutKcal, DEFAULT_BURN_GOAL } from '../src/lib/burn.ts';
import { bmr, estKcal, strideM } from '../src/lib/calc.ts';
import type { BurnEntry, DataState, FoodEntry, Profile, StepDay, Workout } from '../src/lib/types.ts';

let failed = 0;
const check = (name: string, cond: boolean, detail?: unknown) => { if (!cond) { failed++; console.error('FAIL', name, detail ?? ''); } else console.log('ok', name); };
const near = (a: number, b: number, tol = 1) => Math.abs(a - b) <= tol;

const P: Profile = { name: 'T', sex: 'male', age: 30, heightCm: 175, weightKg: 75, activity: 1.55, goal: 'maintain', units: 'imperial', disciplines: ['hybrid'], weeklySessions: 4, onboarded: true };
const D = '2026-11-10';
const NOON_LATER = new Date('2026-11-20T12:00:00'); // D is a past day at this "now"
const empty = (): DataState => ({ workouts: [], routes: [], foods: [], water: [], body: [], templates: [], steps: [], burns: [] });
const W = (p: Partial<Workout>): Workout => ({ id: Math.random().toString(36).slice(2), updatedAt: 1, date: `${D}T07:00:00`, type: 'run', title: 'Run', durationSec: 1800, ...p });
const S = (steps: number, mode: 'add' | 'set', date = D): StepDay => ({ id: `s-${date}`, updatedAt: 1, date, steps, mode });
const B = (p: Partial<BurnEntry>): BurnEntry => ({ id: Math.random().toString(36).slice(2), updatedAt: 1, date: D, activity: 'yoga', label: 'Yoga', minutes: 60, kcal: 190, method: 'met', met: 2.5, ...p });
const F = (kcal: number, date = D): FoodEntry => ({ id: Math.random().toString(36).slice(2), updatedAt: 1, date, meal: 'lunch', name: 'x', kcal, protein: 0, carbs: 0, fat: 0, source: 'custom' });

// --- per-step estimate (ACSM net): 0.0005 × 75 × (0.415 × 1.75 = 0.72625) = 0.027234
check('kcal/step = 0.0005 × kg × stride', near(kcalPerStep(P), 0.0005 * 75 * 0.72625, 1e-6), kcalPerStep(P));
check('10,000 steps ≈ 272 kcal', stepBurnKcal(10000, P) === 272, stepBurnKcal(10000, P));
check('user stride used', near(kcalPerStep({ ...P, strideCm: 80 }), 0.0005 * 75 * 0.8, 1e-9));

// --- resting proration
check('past day = 1440 min', elapsedMinutes(D, NOON_LATER) === 1440);
check('future day = 0 min', elapsedMinutes('2026-11-30', NOON_LATER) === 0);
check('today at noon = 720 min', near(elapsedMinutes('2026-11-20', NOON_LATER), 720, 0.01));
{
  const empty1 = dayBurn(empty(), D, P, NOON_LATER);
  check('empty past day: resting = full BMR', empty1.resting === Math.round(bmr(P)), [empty1.resting, bmr(P)]);
  check('empty day: active 0, total = resting', empty1.active === 0 && empty1.total === empty1.resting);
  const t = dayBurn(empty(), '2026-11-20', P, NOON_LATER);
  check('today at noon: half of BMR', near(t.resting, bmr(P) / 2, 1) && t.partial, t.resting);
  check('future day: nothing', dayBurn(empty(), '2026-11-25', P, NOON_LATER).total === 0);
}

// --- workouts: saved kcal is reused, rest days ignored, minutes removed from resting
{
  const d = empty();
  d.workouts = [W({ kcal: 400, kcalMethod: 'hr' }), W({ type: 'strength', title: 'Lift', durationSec: 3600, rpe: 6 }), W({ type: 'rest', title: 'Rest', durationSec: 0 })];
  const b = dayBurn(d, D, P, NOON_LATER);
  const lift = estKcal({ type: 'strength', durationSec: 3600, rpe: 6 }, 75);
  check('workouts = saved kcal + MET fallback', b.workouts === 400 + lift, [b.workouts, lift]);
  check('rest day not a session', b.sessions.length === 2);
  check('sessions sorted by kcal', b.sessions[0].kcal >= b.sessions[1].kcal);
  check('covered minutes = 90', b.coveredMin === 90);
  check('resting excludes workout minutes', near(b.resting, (bmr(P) / 1440) * (1440 - 90), 1), b.resting);
  check('total = resting + active', b.total === b.resting + b.active);
  check('workoutKcal of rest = 0', workoutKcal(W({ type: 'rest' }), 75) === 0);
}

// --- steps: double counting
{
  // 'set' full-day total includes sensor steps from a recorded walk → only the remainder counts
  const d = empty();
  d.workouts = [W({ type: 'walk', steps: 4000, stepsSource: 'sensor', distanceM: 3000 })];
  d.steps = [S(10000, 'set')];
  const s = stepBurnSteps(d, D, P);
  check('set: outside = total − recorded', s.outside === 6000 && s.inWorkouts === 4000, s);
  const b = dayBurn(d, D, P, NOON_LATER);
  check('set: step kcal only for 6000 steps', b.steps === stepBurnKcal(6000, P), b.steps);

  // a walk imported without a step count: its distance becomes steps, so a 'set' total doesn't count it twice
  const d2 = empty();
  d2.workouts = [W({ type: 'walk', distanceM: 2905 })]; // 2905 / 0.72625 = 4000 steps
  d2.steps = [S(10000, 'set')];
  const s2 = stepBurnSteps(d2, D, P);
  check('set: distance-only walk converted to steps', s2.estimatedInWorkouts === Math.round(2905 / strideM(P, 'walk')) && s2.outside === 10000 - s2.estimatedInWorkouts, s2);

  // run without steps uses the run stride
  const d3 = empty(); d3.workouts = [W({ type: 'run', distanceM: 5000 })]; d3.steps = [S(12000, 'set')];
  check('set: run distance uses run stride', stepBurnSteps(d3, D, P).estimatedInWorkouts === Math.round(5000 / strideM(P, 'run')));

  // 'add' steps are on top of recordings → all count
  const d4 = empty(); d4.workouts = [W({ type: 'walk', steps: 4000, stepsSource: 'sensor' })]; d4.steps = [S(3000, 'add')];
  check('add: all typed steps count', stepBurnSteps(d4, D, P).outside === 3000);

  // no typed steps → recorded steps belong to the workout, nothing outside
  const d5 = empty(); d5.workouts = [W({ type: 'walk', steps: 5000, stepsSource: 'sensor' })];
  check('none: nothing outside', stepBurnSteps(d5, D, P).outside === 0 && dayBurn(d5, D, P, NOON_LATER).steps === 0);

  // a 'set' total smaller than recorded steps never goes negative
  const d6 = empty(); d6.workouts = [W({ type: 'run', steps: 9000, stepsSource: 'sensor' })]; d6.steps = [S(5000, 'set')];
  check('set below recorded → 0 outside', stepBurnSteps(d6, D, P).outside === 0);

  // non-walking workouts (strength) with a distance don't eat into the step total
  const d7 = empty(); d7.workouts = [W({ type: 'cycle', distanceM: 20000 })]; d7.steps = [S(8000, 'set')];
  check('ride distance not converted to steps', stepBurnSteps(d7, D, P).outside === 8000);
}

// --- manual entries
{
  check('MET kcal: 2.5 × 75 × 1 h = 188', metBurnKcal(2.5, 60, 75) === 188, metBurnKcal(2.5, 60, 75));
  check('MET kcal: zero minutes = 0', metBurnKcal(5, 0, 75) === 0);
  const d = empty(); d.burns = [B({ kcal: 250, minutes: 45 }), B({ kcal: 999, deleted: true }), B({ date: '2026-11-11', kcal: 50 })];
  const b = dayBurn(d, D, P, NOON_LATER);
  check('manual: only this day, deleted ignored', b.manual === 250, b.manual);
  check('manual minutes removed from resting', b.coveredMin === 45);
  check('manual is active', b.active === 250);
}

// --- net balance
{
  const d = empty(); d.foods = [F(2000), F(500)];
  const b = dayBurn(d, D, P, NOON_LATER);
  check('net = eaten − total', b.net === 2500 - b.total && b.foodLogged);
  check('no food → net null', dayBurn(empty(), D, P, NOON_LATER).net === null);
}

// --- range aggregation
{
  const d = empty();
  d.workouts = [W({ kcal: 300 }), W({ date: '2026-11-08T07:00:00', kcal: 500, type: 'cycle', title: 'Ride' }), W({ date: '2026-11-09T07:00:00', kcal: 200 })];
  d.burns = [B({ date: '2026-11-07', kcal: 150 })];
  d.steps = [S(10000, 'set', '2026-11-09')];
  d.foods = [F(2600, '2026-11-08'), F(2400, '2026-11-09')];
  const r = rangeBurn(d, P, D, 7, NOON_LATER);
  const sumDays = r.days.reduce((a, x) => a + x.active, 0);
  check('range: 7 days', r.days.length === 7 && r.days[6].date === D && r.from === '2026-11-04');
  check('range: active = sum of days', r.active === sumDays && r.active === 300 + 500 + 200 + 150 + stepBurnKcal(10000, P), [r.active, sumDays]);
  check('range: total = resting + active', r.total === r.resting + r.active);
  check('range: groups sorted, run grouped', r.byGroup[0].kcal >= r.byGroup[r.byGroup.length - 1].kcal && r.byGroup.find((g) => g.group === 'Run')?.n === 2, r.byGroup);
  check('range: steps group present', r.byGroup.some((g) => g.group.startsWith('Steps')));
  check('range: top session = 500 ride', r.top[0].kcal === 500 && r.top.length <= 5);
  check('range: best day = Nov 8 or 9', r.best != null && r.best.active === Math.max(...r.days.map((x) => x.active)));
  check('range: net over 2 food days', r.netDays === 2 && r.net === r.days.filter((x) => x.net != null).reduce((a, x) => a + (x.net as number), 0));
  check('range: goal days with default 500', r.goalDays === r.days.filter((x) => x.active >= 500).length);
}

// --- goal + streak
{
  check('default goal', burnGoalOf({}) === DEFAULT_BURN_GOAL && burnGoalOf({ burnGoal: 650 }) === 650);
  const today = '2026-11-20';
  const now = new Date('2026-11-20T20:00:00');
  const d = empty();
  for (const k of ['2026-11-15', '2026-11-17', '2026-11-18', '2026-11-19']) d.workouts.push(W({ date: `${k}T07:00:00`, kcal: 600 }));
  let s = burnStreak(d, P, today, now);
  check('streak runs through yesterday when today not hit', s.current === 3 && !s.hitToday, s);
  check('best streak', s.best === 3);
  d.workouts.push(W({ date: `${today}T07:00:00`, kcal: 520 }));
  s = burnStreak(d, P, today, now);
  check('today hit extends streak', s.current === 4 && s.hitToday, s);
  s = burnStreak(d, { ...P, burnGoal: 700 }, today, now);
  check('higher goal breaks streak', s.current === 0 && s.best === 0, s);
}

if (failed) { console.error(`\n${failed} burn check(s) failed`); process.exit(1); }
console.log('\nall burn checks passed');
