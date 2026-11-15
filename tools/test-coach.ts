// Unit checks for HYBRD Coach (src/lib/coach.ts): level detection, equipment & injury swaps, days/minutes respected,
// safety guardrails, weekly check-in adjustments, user edits and nutrition exclusions.
// Run: node --experimental-strip-types --import ./tools/ts-resolve.mjs tools/test-coach.ts
import { readFileSync } from 'node:fs';
import {
  generatePlan, defaultAnswers, detectLevel, weekSessions, applyCheckIn, effectiveVol, needs, INJURY_AVOID, RUN_IDS, HARD_ROLES, explain,
  moveDay, swapSession, alternatives, editDay, regenerate, trainDaysOf, coachTargetsFor, materialize, startLinks,
  type CoachAnswers, type CoachPlan, type CheckIn, type Equip,
} from '../src/lib/coach.ts';
import { makeCatalog, planViolations, KCAL_FLOOR, type Allergen, type DietPattern } from '../src/lib/wl.ts';
import { FEATURES, can, getEntitlements } from '../src/lib/entitlements.ts';

let failed = 0;
const check = (name: string, cond: boolean, detail?: unknown) => { if (!cond) { failed++; console.error('FAIL', name, detail ?? ''); } else console.log('ok', name); };
const cat = makeCatalog(JSON.parse(readFileSync(new URL('../src/data/recipes.json', import.meta.url), 'utf8')), JSON.parse(readFileSync(new URL('../src/data/plan-foods.json', import.meta.url), 'utf8')));
const TODAY = '2026-11-14';
const base = defaultAnswers({ sex: 'male', age: 32, heightCm: 178, weightKg: 84, activity: 1.55, weeklySessions: 4 });
const A = (p: Partial<CoachAnswers> = {}): CoachAnswers => ({ ...base, ...p });
const gen = (p: Partial<CoachAnswers> = {}, seed = 7): CoachPlan => ({ ...generatePlan(A(p), { today: TODAY, id: 'p1', seed, catalog: cat }), updatedAt: 1 } as CoachPlan);
const allBlocks = (plan: CoachPlan) => plan.weeks.flatMap((_, w) => weekSessions(plan, w).flatMap((x) => (x.s ? x.s.blocks : [])));
const sessions = (plan: CoachPlan, w: number) => weekSessions(plan, w).filter((x) => x.s).map((x) => x.s!);

// ---------- entitlements (premium-ready, all free today) ----------
check('every coach feature is free today', Object.values(FEATURES).every((f) => f.free) && Object.keys(FEATURES).every((k) => can(k as keyof typeof FEATURES)));
check('no premium entitlement is assumed', getEntitlements().premium === false);

// ---------- level detection ----------
check('0 push-ups, no run → Beginner', detectLevel(A({ pushUps: 0, pullUps: 0, run: 'none' })).overall === 'Beginner');
check('15 push-ups + 5 pull-ups → strength Intermediate', detectLevel(A({ pushUps: 15, pullUps: 5 })).strength === 'Intermediate');
check('15 push-ups, no bar → still Beginner (needs ≥20 without a pull-up test)', detectLevel(A({ pushUps: 15, pullUps: null })).strength === 'Beginner');
check('25 push-ups, no bar → Intermediate', detectLevel(A({ pushUps: 25, pullUps: null })).strength === 'Intermediate');
check('35 push-ups + 13 pull-ups + 1 year → strength Expert', detectLevel(A({ pushUps: 35, pullUps: 13, experience: 'year' })).strength === 'Expert');
check('same numbers but only months of training → not Expert', detectLevel(A({ pushUps: 35, pullUps: 13, experience: 'some' })).strength === 'Intermediate');
check('5K in 23.5 min → endurance Intermediate', detectLevel(A({ run: '5k', fiveKMin: 23.5 })).endurance === 'Intermediate');
check('10K, 5K ≤ 25 min, 1 year → endurance Expert', detectLevel(A({ run: '10k', fiveKMin: 20, experience: 'year' })).endurance === 'Expert');
check('mile under 9 min → endurance Intermediate', detectLevel(A({ run: 'mile', mileMin: 7 })).endurance === 'Intermediate');
check('slow mile → endurance Beginner', detectLevel(A({ run: 'mile', mileMin: 13 })).endurance === 'Beginner');
check('new to training caps everything at Beginner', detectLevel(A({ pushUps: 35, pullUps: 13, run: '10k', fiveKMin: 20, experience: 'new' })).overall === 'Beginner');
check('an injury caps at Intermediate', detectLevel(A({ pushUps: 35, pullUps: 13, experience: 'year', goal: 'muscle', injuries: ['back'] })).overall === 'Intermediate');
check('under 18 caps at Intermediate', detectLevel(A({ pushUps: 35, pullUps: 13, experience: 'year', goal: 'muscle', age: 16 })).overall === 'Intermediate');
check('pregnancy caps at Beginner', detectLevel(A({ sex: 'female', health: { pregnant: true }, pushUps: 25, pullUps: 5, run: '5k', fiveKMin: 27.5 })).overall === 'Beginner');
check('muscle goal uses the strength level', detectLevel(A({ goal: 'muscle', pushUps: 15, pullUps: 5, run: 'none' })).overall === 'Intermediate');
check('endurance goal uses the endurance level', detectLevel(A({ goal: 'endurance', pushUps: 0, run: '5k', fiveKMin: 23.5 })).overall === 'Intermediate');
check('check-in boost moves up one level (not past the cap)', detectLevel(A({ pushUps: 0, run: 'none' }), 1).overall === 'Intermediate' && detectLevel(A({ experience: 'new' }), 2).overall === 'Beginner');

// ---------- days, minutes, rest, ordering ----------
{
  let ok = true, mins = true, rest = true, b2b = true; const bad: string[] = [];
  for (const goal of ['fat-loss', 'muscle', 'endurance', 'race', 'skills', 'health'] as const) for (const days of [2, 3, 4, 5, 6]) for (const minutes of [20, 30, 45, 60, 90]) {
    const p = gen({ goal, days, minutes, race: goal === 'race' ? '10k' : undefined, equipment: ['gym'], prefs: goal === 'endurance' ? ['running', 'strength'] : [] });
    p.weeks.forEach((wk, w) => {
      const ss = sessions(p, w);
      if (ss.length !== days) { ok = false; bad.push(`${goal} ${days}d w${w}: ${ss.length}`); }
      if (ss.some((s) => s.minutes > minutes)) { mins = false; bad.push(`${goal} ${minutes}min w${w}: ${ss.map((s) => s.minutes)}`); }
      if (wk.layout.filter((x) => !x).length < 1) rest = false;
      const roles = wk.layout.map((id, wd) => (id ? weekSessions(p, w)[wd].s!.role : null));
      if (days <= 4 && roles.some((r, i) => r && HARD_ROLES.includes(r) && roles[i + 1] && HARD_ROLES.includes(roles[i + 1]!))) b2b = false;
    });
  }
  check('every week has exactly the chosen number of sessions (2–6)', ok, bad.slice(0, 5));
  check('no session runs longer than the chosen minutes', mins, bad.slice(0, 5));
  check('at least one full rest day every week', rest);
  check('no hard sessions back to back (≤ 4 days)', b2b);
}
{
  const p = gen({ weeks: 4 });
  check('4-week block: 3 build weeks then a lighter week', p.weeks.length === 4 && p.weeks.map((w) => w.phase).join() === 'build,build,build,deload');
  const p8 = gen({ weeks: 8, goal: 'race', race: 'half', run: '10k', fiveKMin: 27.5 });
  check('8-week race block ends with a taper', p8.weeks[7].phase === 'taper' && p8.weeks[3].phase === 'deload');
  const v = p.weeks.map((w) => effectiveVol(w));
  check('volume progresses then drops on the deload', v[1] >= v[0] && v[2] >= v[1] && v[3] < v[2], v);
  const s0 = sessions(p, 0).find((s) => s.blocks.some((b) => b.sets > 1)), s3 = sessions(p, 3).find((s) => s.slotId === s0?.slotId);
  check('deload week cuts sets', !!s0 && !!s3 && s3.blocks.reduce((t, b) => t + b.sets, 0) < s0.blocks.reduce((t, b) => t + b.sets, 0));
}

// ---------- equipment swaps ----------
const hasNeed = (plan: CoachPlan, e: Equip) => allBlocks(plan).filter((b) => needs(b.exId).includes(e)).map((b) => b.exId);
for (const goal of ['muscle', 'fat-loss', 'race', 'skills'] as const) {
  const p = gen({ goal, race: goal === 'race' ? 'hyrox' : undefined, equipment: ['none'], pushUps: 25, pullUps: null, days: 5, minutes: 60, prefs: ['strength', 'running'] });
  check(`bodyweight only (${goal}): no bar, dumbbell, gym or bike exercises`, !hasNeed(p, 'bar').length && !hasNeed(p, 'dumbbells').length && !hasNeed(p, 'gym').length && !hasNeed(p, 'bike').length,
    [...hasNeed(p, 'bar'), ...hasNeed(p, 'dumbbells'), ...hasNeed(p, 'gym'), ...hasNeed(p, 'bike')]);
}
{
  const p = gen({ goal: 'muscle', equipment: ['dumbbells'], pushUps: 15, pullUps: null, days: 4 });
  const bad = allBlocks(p).filter((b) => needs(b.exId).length && !needs(b.exId).includes('dumbbells')).map((b) => b.exId);
  check('dumbbells only: nothing that needs a bar, gym or bike', !bad.length, [...new Set(bad)]);
  const sw = allBlocks(p).filter((b) => b.swappedFrom);
  check('swapped blocks explain why', sw.every((b) => !!b.why));
  const g = gen({ goal: 'muscle', equipment: ['gym'], pushUps: 25, pullUps: 9, days: 4 });
  check('full gym: strength days use gym kit', hasNeed(g, 'gym').length > 0 || hasNeed(g, 'bar').length > 0);
}
{
  const p = gen({ goal: 'muscle', pushUps: 3, pullUps: 0, equipment: ['bar'] });
  const ids = allBlocks(p).map((b) => b.exId);
  check('can’t do a push-up yet → no floor push-ups (regressed)', !ids.includes('push-up'), [...new Set(ids)]);
  check('0 pull-ups → no full pull-ups (regressed)', !ids.includes('pull-up'));
}

// ---------- injury swaps ----------
for (const inj of ['knees', 'back', 'shoulders', 'wrists'] as const) {
  const p = gen({ goal: inj === 'knees' ? 'fat-loss' : 'muscle', injuries: [inj], equipment: ['gym'], pushUps: 25, pullUps: 9, days: 4, prefs: ['running', 'strength'] });
  const hit = allBlocks(p).filter((b) => INJURY_AVOID[inj].includes(b.exId)).map((b) => b.exId);
  check(`${inj}: no exercises that load the area`, !hit.length, [...new Set(hit)]);
}
{
  const p = gen({ goal: 'health', injuries: ['knees'], equipment: ['bike'], prefs: ['running'], run: '5k', fiveKMin: 27.5 });
  check('knees (non-race): runs become rides/walks', !allBlocks(p).some((b) => RUN_IDS.includes(b.exId)));
  check('injury flagged in “Why”', explain(p).some((x) => /knee/i.test(x.body)));
}

// ---------- guardrails ----------
{
  const p = gen({ parq: true });
  check('PAR-Q positive → no training plan', !!p.stopped && p.weeks.every((w) => w.layout.every((x) => !x)) && !p.nutrition?.targets);
  const teen = gen({ age: 16, goal: 'fat-loss' });
  check('under 18 → training ok, no calorie targets', !teen.stopped && teen.nutrition?.mode === 'stop' && !teen.nutrition?.targets && sessions(teen, 0).length > 0);
  const preg = gen({ sex: 'female', health: { pregnant: true }, goal: 'fat-loss' });
  check('pregnant → no calorie cut, Beginner sessions', preg.nutrition?.mode === 'stop' && sessions(preg, 0).every((s) => s.level === 'Beginner'));
  const ed = gen({ health: { eatingDisorder: true }, goal: 'fat-loss' });
  check('eating disorder → no calorie targets', ed.nutrition?.mode === 'stop' && !ed.nutrition?.targets);
  const small = gen({ sex: 'female', age: 55, heightCm: 152, weightKg: 52, activity: 1.2, goal: 'fat-loss', pace: 'aggressive', days: 2 });
  const k = small.nutrition?.targets;
  check('fat loss never goes below the calorie floor', !!k && k.rest.kcal >= KCAL_FLOOR.female && k.train.kcal >= KCAL_FLOOR.female, k && [k.rest.kcal, k.train.kcal]);
  const diab = gen({ health: { diabetes: true }, goal: 'fat-loss', pace: 'aggressive' });
  check('diabetes → gentle pace only', diab.nutrition?.targets?.pace === 'gentle');
  const mus = gen({ goal: 'muscle' });
  check('muscle goal → small surplus over maintenance', mus.nutrition?.mode === 'surplus' && (mus.nutrition?.targets?.kcal || 0) > (mus.nutrition?.targets?.tdee || 0));
  const hl = gen({ goal: 'health' });
  check('general goal → maintenance', hl.nutrition?.mode === 'maintain' && Math.abs((hl.nutrition?.targets?.kcal || 0) - (hl.nutrition?.targets?.tdee || 0)) <= 60, [hl.nutrition?.targets?.kcal, hl.nutrition?.targets?.tdee]);
  const t = coachTargetsFor(hl, TODAY);
  check('daily targets resolve with water', !!t && t.waterMl > 1500 && t.kcal > 1200);
}

// ---------- nutrition exclusions ----------
{
  const combos: [DietPattern, Allergen[]][] = [['vegan', ['nuts', 'gluten']], ['vegetarian', ['dairy', 'egg']], ['pescatarian', ['shellfish', 'soy']], ['omnivore', ['fish', 'sesame', 'nuts']], ['lowcarb', ['dairy']], ['mediterranean', ['gluten']]];
  for (const [diet, exclude] of combos) for (const goal of ['fat-loss', 'muscle', 'endurance'] as const) {
    const p = gen({ goal, diet, exclude, run: '5k', fiveKMin: 27.5 });
    const v = p.nutrition && p.nutrition.week.length ? planViolations(cat, p.nutrition.quiz, p.nutrition.week) : ['no meal plan'];
    check(`${goal}: ${diet} without ${exclude.join('/')} → 7 days, no violations`, p.nutrition?.week.length === 7 && !v.length, v.slice(0, 3));
  }
  const halal = gen({ religious: 'halal' });
  check('halal-friendly respected', !planViolations(cat, halal.nutrition!.quiz, halal.nutrition!.week).length);
  const p = gen({ days: 3 });
  check('meal plan training days match the schedule', JSON.stringify([...p.nutrition!.trainDays].sort()) === JSON.stringify(trainDaysOf(p, 0)));
}

// ---------- weekly check-ins ----------
{
  const p = gen({ weeks: 6, days: 4, equipment: ['gym'], pushUps: 15, pullUps: 5, run: '5k', fiveKMin: 27.5 });
  const ci = (x: Partial<CheckIn>): CheckIn => ({ week: 0, date: '2026-11-22', feel: 'right', done: 4, planned: 4, energy: 3, soreness: 2, pain: [], ...x });
  const last = (q: CoachPlan) => q.changelog[q.changelog.length - 1];
  const r1 = applyCheckIn(p, ci({}));
  check('about right → progress as planned', last(r1).decision === 'progress' && effectiveVol(r1.weeks[1]) === effectiveVol(p.weeks[1]));
  const r2 = applyCheckIn(p, ci({ feel: 'easy' }));
  check('too easy → +5% next week', last(r2).decision === 'bump' && effectiveVol(r2.weeks[1]) > effectiveVol(p.weeks[1]));
  const r3 = applyCheckIn(r2, ci({ week: 1, feel: 'easy', date: '2026-11-29' }));
  check('two easy weeks → level up', last(r3).decision === 'level-up' && r3.levelBoost === 1 && r3.levels.overall !== p.levels.overall, [p.levels.overall, r3.levels.overall]);
  const r4 = applyCheckIn(p, ci({ feel: 'hard', soreness: 5 }));
  check('too hard + very sore → deload ~25%', last(r4).decision === 'deload' && effectiveVol(r4.weeks[1]) <= effectiveVol(p.weeks[0]) * 0.76);
  const r5 = applyCheckIn(p, ci({ done: 1 }));
  check('under half done → hold this level', last(r5).decision === 'hold' && effectiveVol(r5.weeks[1]) <= effectiveVol(p.weeks[0]) + 1e-9);
  const r5b = applyCheckIn(r5, ci({ week: 1, done: 1, date: '2026-11-29' }));
  check('two weeks under half → suggests fewer days', last(r5b).changes.some((c) => /fewer|days a week/.test(c)));
  const r6 = applyCheckIn(p, ci({ pain: ['knees'] }));
  const hit6 = [1, 2].flatMap((w) => sessions(r6, w).flatMap((s) => s.blocks)).filter((b) => INJURY_AVOID.knees.includes(b.exId));
  check('pain → hold + swaps away from the area', last(r6).decision === 'hold' && r6.painAreas.includes('knees') && !hit6.length, hit6.map((b) => b.exId));
  check('pain swaps listed in the changelog', last(r6).changes.some((c) => c.startsWith('Swapped')) || !allBlocks(p).some((b) => INJURY_AVOID.knees.includes(b.exId)));
  const r7 = applyCheckIn(p, ci({ pain: ['back'], sharp: true }));
  check('sharp pain → see a professional + lighter week', last(r7).decision === 'see-pro' && effectiveVol(r7.weeks[1]) <= 0.7 + 1e-9 && last(r7).changes.some((c) => /physio|doctor/.test(c)));
  const r8 = applyCheckIn(applyCheckIn(p, ci({ pain: ['shoulders'] })), ci({ week: 1, pain: ['shoulders'], date: '2026-11-29' }));
  check('same pain two weeks running → see a professional', last(r8).decision === 'see-pro');
  check('check-ins are stored per week', r3.checkins.length === 2 && applyCheckIn(r1, ci({ feel: 'hard' })).checkins.length === 1);
}

// ---------- edits ----------
{
  const p = gen({ days: 3 });
  const td = trainDaysOf(p, 0), restDay = [0, 1, 2, 3, 4, 5, 6].find((d) => !td.includes(d))!;
  const m = moveDay(p, 0, td[0], restDay, TODAY);
  check('move day keeps the session count and lands on the new day', trainDaysOf(m, 0).length === 3 && trainDaysOf(m, 0).includes(restDay) && !trainDaysOf(m, 0).includes(td[0]));
  const sid = p.weeks[0].layout[td[0]]!;
  const alt = alternatives(p, sid);
  const sw = alt.length ? swapSession(p, 0, td[0], alt[0], TODAY) : p;
  check('swap session changes that day (and logs it)', alt.length > 0 && materialize(sw, 0, sw.weeks[0].layout[td[0]]!)!.ref === alt[0] && sw.changelog.length === p.changelog.length + 1);
  const r = editDay(p, 0, td[1], { rest: true }, TODAY);
  check('make rest day removes the session', trainDaysOf(r, 0).length === 2);
  const add = editDay(r, 0, td[1], { add: 'mobility' }, TODAY);
  check('add a session to a rest day', trainDaysOf(add, 0).length === 3);
  const ln = editDay(p, 0, td[0], { minutes: 20 }, TODAY);
  check('shorter day respected', materialize(ln, 0, ln.weeks[0].layout[td[0]]!)!.minutes <= 20);
  const g = regenerate(p, TODAY, cat);
  check('regenerate keeps id, start date and history', g.id === p.id && g.startDate === p.startDate && g.changelog.length === p.changelog.length + 1);
  const s = materialize(p, 0, sid)!;
  const links = startLinks(p, 0, td[0], s);
  check('every session can be started (timer / GPS / logger)', links.length > 0 && links.some((l) => l.primary) && links.some((l) => l.to.startsWith('/train/log?coach=p1')));
}
check('plan start date is a Monday', new Date(gen().startDate + 'T12:00:00').getDay() === 1);
check('same answers + seed → same plan (deterministic)', JSON.stringify(gen({}, 3).weeks) === JSON.stringify(gen({}, 3).weeks) && JSON.stringify(gen({}, 3).slots) === JSON.stringify(gen({}, 3).slots));
check('“Why” covers level, schedule and food with sources', (() => { const w = explain(gen({ goal: 'fat-loss' })); return w.length >= 6 && w.some((x) => x.title.startsWith('Level')) && w.some((x) => x.src.length > 0); })());

console.log(failed ? `\n${failed} FAILED` : '\nall coach checks passed');
process.exit(failed ? 1 : 0);
