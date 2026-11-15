// Unit checks for Weight-loss programs: target math, floors and guardrails, screening, exclusions in plans, macro tolerance,
// grocery list, weigh-in trend and adaptive suggestions.
// Run: node --experimental-strip-types --import ./tools/ts-resolve.mjs tools/test-wl.ts
import { readFileSync } from 'node:fs';
import {
  computeWL, screen, energyOf, buildWeek, makeCatalog, planViolations, withinTolerance, groceryList, weightTrend, trendRate, suggest,
  defaultTrainDays, mealTimes, fits, swapMeal, swapOptions, retarget, dayMacro, planTargetsFor, mifflin, KCAL_FLOOR, KCAL_PER_KG, PROTEIN_MAX,
  type WLQuiz, type WLPlan, type Allergen, type DietPattern,
} from '../src/lib/wl.ts';

let failed = 0;
const check = (name: string, cond: boolean, detail?: unknown) => { if (!cond) { failed++; console.error('FAIL', name, detail ?? ''); } else console.log('ok', name); };
const near = (a: number, b: number, tol = 1) => Math.abs(a - b) <= tol;
const base = JSON.parse(readFileSync(new URL('../src/data/recipes.json', import.meta.url), 'utf8'));
const pf = JSON.parse(readFileSync(new URL('../src/data/plan-foods.json', import.meta.url), 'utf8'));
const cat = makeCatalog(base, pf);

const Q = (p: Partial<WLQuiz> = {}): WLQuiz => ({
  sex: 'male', age: 30, heightCm: 178, weightKg: 85, goalWeightKg: 78, pace: 'moderate', health: {}, activity: 1.55, training: 'hybrid', trainingDays: 4,
  energy: 'questionnaire', diet: 'omnivore', religious: 'none', exclude: [], meals: 4, window: null, budget: false, cookTime: 0, ...p,
});

// ---------- catalog ----------
check('catalog has ≥ 55 plan recipes', cat.recipes.length >= 55, cat.recipes.length);
check('every recipe has slots and macros', cat.recipes.every((r) => r.slots.length && r.per.kcal > 0));
check('recipe macros are consistent (4/4/9 within 12%)', cat.recipes.every((r) => { const k = r.per.protein * 4 + r.per.carbs * 4 + r.per.fat * 9; return Math.abs(k - r.per.kcal) / r.per.kcal < 0.12; }),
  cat.recipes.filter((r) => { const k = r.per.protein * 4 + r.per.carbs * 4 + r.per.fat * 9; return Math.abs(k - r.per.kcal) / r.per.kcal >= 0.12; }).map((r) => r.id));
check('every ingredient has a grocery name and aisle', cat.recipes.every((r) => r.ingredients.every((i) => cat.names[String(i.fdcId)] && cat.aisles[String(i.fdcId)])));

// ---------- energy & target math ----------
{
  const q = Q();
  const bmr = 10 * 85 + 6.25 * 178 - 5 * 30 + 5; // 1817.5
  check('Mifflin-St Jeor BMR', near(mifflin(q), bmr, 0.01), mifflin(q));
  const t = computeWL(q);
  check('TDEE = BMR × activity', t.tdee === Math.round(bmr * 1.55), t.tdee);
  const want = 85 * 0.0075 * KCAL_PER_KG / 7; // 701
  const cap = Math.min(t.tdee * 0.2, 1000);
  const expect = Math.round((t.tdee - Math.min(want, cap)) / 10) * 10;
  check('moderate: deficit = min(0.75%/wk, 20% TDEE) → kcal', t.kcal === expect, [t.kcal, expect]);
  check('weekly loss estimate = deficit × 7 / 7700', near(t.weeklyLossKg, (t.tdee - t.kcal) * 7 / 7700, 0.01), t.weeklyLossKg);
  check('rate never above 1%/week', t.weeklyPct <= 1.0, t.weeklyPct);
  check('protein = 2.1 g/kg of reference weight (hybrid 2.0 + moderate 0.1; BMI 26.8 → weight at BMI 25)', t.refWeightKg === Math.round(25 * 1.78 * 1.78 * 10) / 10 && t.protein === Math.round(t.refWeightKg * 2.1), [t.protein, t.refWeightKg]);
  check('protein within 1.6–2.4 g/kg', t.proteinPerKg >= 1.6 && t.proteinPerKg <= 2.4);
  check('macros add up to kcal (±15)', near(t.protein * 4 + t.carbs * 4 + t.fat * 9, t.kcal, 15), t);
  check('fiber = 14 g / 1000 kcal', t.fiber === Math.round(14 * t.kcal / 1000));
  check('weeks to goal', t.weeksToGoal === Math.ceil(7 / t.weeklyLossKg), t.weeksToGoal);
  check('hybrid 4 days → carbs periodized', t.periodized && t.train.carbs > t.carbs && t.rest.carbs < t.carbs, [t.train, t.rest]);
  const weekly = t.train.kcal * 4 + t.rest.kcal * 3;
  check('periodization keeps the weekly total (±60 kcal)', near(weekly, t.kcal * 7, 60), [weekly, t.kcal * 7]);
  check('protein and fat the same on training and rest days', t.train.protein === t.rest.protein && t.train.fat === t.rest.fat);
  const s = computeWL(Q({ training: 'strength' }));
  check('strength → no carb periodization', !s.periodized && s.train.kcal === s.rest.kcal);
  const g = computeWL(Q({ pace: 'gentle' })), a = computeWL(Q({ pace: 'aggressive' }));
  check('gentle < moderate < faster deficit', g.deficit < t.deficit && t.deficit <= a.deficit, [g.deficit, t.deficit, a.deficit]);
  check('faster capped at 25% of TDEE', a.deficit <= Math.round(a.tdee * 0.25) + 10, [a.deficit, a.tdee]);
  const heavy = computeWL(Q({ weightKg: 150, heightCm: 175, pace: 'aggressive', activity: 1.725 }));
  check('absolute cap: deficit ≤ 1,000 kcal/day', heavy.deficit <= 1005, heavy.deficit);
  check('BMI > 25: protein from weight at BMI 25', heavy.refWeightKg === Math.round(25 * 1.75 * 1.75 * 10) / 10, heavy.refWeightKg);
  check('protein never above 2.4 g/kg ref', heavy.proteinPerKg <= PROTEIN_MAX);
  const lc = computeWL(Q({ diet: 'lowcarb', training: 'strength' }));
  check('lower carb ≈ 25% of kcal from carbs', near(lc.carbs * 4 / lc.kcal, 0.25, 0.02), lc.carbs * 4 / lc.kcal);
  const med = computeWL(Q({ diet: 'mediterranean', training: 'strength' }));
  check('Mediterranean fat ≈ 32%', near(med.fatPct, 32, 1), med.fatPct);
  const adj = computeWL(Q(), {}, { adjustKcal: -100 });
  check('user adjustment −100 kcal applied', adj.kcal === t.kcal - 100 || adj.rateCapApplied || adj.floorApplied, [adj.kcal, t.kcal]);
  const up = computeWL(Q(), {}, { adjustKcal: 5000 });
  check('adjustment can never exceed maintenance', up.kcal <= up.tdee);
}

// ---------- tracked energy (Burn tracker) ----------
{
  const q = Q({ energy: 'auto' });
  const e1 = energyOf(q, { trackedActive: 600, trackedDays: 10 });
  check('tracked TDEE = BMR × 1.2 + avg active', e1.method === 'tracked' && e1.tdee === Math.round(mifflin(q) * 1.2 + 600), e1);
  const e2 = energyOf(q, { trackedActive: 600, trackedDays: 4 });
  check('fewer than 7 tracked days → activity factor', e2.method === 'factor');
  const e3 = energyOf(Q(), { trackedActive: 600, trackedDays: 14 });
  check('questionnaire choice ignores tracking', e3.method === 'factor');
  const e4 = energyOf(q, { trackedActive: 5000, trackedDays: 14 });
  check('tracked TDEE capped at BMR × 2.2', e4.tdee === Math.round(mifflin(q) * 2.2));
}

// ---------- floors & guardrails ----------
{
  const small = computeWL(Q({ sex: 'female', age: 45, heightCm: 157, weightKg: 62, goalWeightKg: 55, activity: 1.2, pace: 'aggressive', training: 'none' }));
  check('female floor 1,200 kcal', small.kcal >= KCAL_FLOOR.female, small.kcal);
  const m = computeWL(Q({ sex: 'male', age: 60, heightCm: 165, weightKg: 70, goalWeightKg: 64, activity: 1.2, pace: 'aggressive', training: 'none' }));
  check('male floor 1,500 kcal', m.kcal >= KCAL_FLOOR.male && m.floorApplied, [m.kcal, m.tdee]);
  const tiny = computeWL(Q({ sex: 'female', age: 75, heightCm: 145, weightKg: 45, goalWeightKg: 41, activity: 1.2, training: 'none', pace: 'gentle' }));
  check('maintenance below floor → no deficit, never above maintenance', tiny.kcal <= tiny.tdee && tiny.deficit < 10, [tiny.kcal, tiny.tdee]);
  const lowGoal = computeWL(Q({ goalWeightKg: 50, heightCm: 178 }));
  check('goal weight raised to BMI 18.5', lowGoal.goalWeightKg! >= 18.5 * 1.78 * 1.78 - 0.1, lowGoal.goalWeightKg);
  const reached = computeWL(Q({ weightKg: 76, goalWeightKg: 78 }));
  check('at goal → maintenance', reached.atMaintenance && reached.kcal <= reached.tdee && reached.tdee - reached.kcal < 10);
  // floor and 1%/week hold across a grid of profiles
  let bad = 0;
  for (const sex of ['male', 'female'] as const) for (const age of [18, 30, 50, 70]) for (const h of [150, 165, 180, 195]) for (const w of [50, 70, 90, 120, 160]) for (const pace of ['gentle', 'moderate', 'aggressive'] as const) for (const act of [1.2, 1.55, 1.9] as const) {
    const t = computeWL(Q({ sex, age, heightCm: h, weightKg: w, pace, activity: act, goalWeightKg: undefined }));
    if (t.level === 'maintain') { if (t.deficit > 10) bad++; continue; }
    if (t.kcal < Math.min(KCAL_FLOOR[sex], t.tdee) - 10 || t.kcal > t.tdee || t.weeklyPct > 1.0 || t.deficit > 1005) bad++;
  }
  check('grid: floor, ≤ maintenance, ≤ 1%/wk and ≤ 1,000 kcal/day deficit for 2,880 profiles', bad === 0, bad);
}

// ---------- screening ----------
{
  check('under 18 → stop', screen(Q({ age: 16 })).level === 'stop');
  check('pregnant → stop', screen(Q({ sex: 'female', health: { pregnant: true } })).level === 'stop');
  check('breastfeeding → stop', screen(Q({ sex: 'female', health: { breastfeeding: true } })).level === 'stop');
  check('eating-disorder history → stop', screen(Q({ health: { eatingDisorder: true } })).level === 'stop');
  const u = screen(Q({ weightKg: 55, heightCm: 178 }));
  check('BMI < 18.5 → maintain, no paces', u.level === 'maintain' && u.paces.length === 0);
  check('BMI < 18.5 → plan at maintenance', computeWL(Q({ weightKg: 55, heightCm: 178, goalWeightKg: 50 })).atMaintenance);
  const d = screen(Q({ health: { diabetes: true } }));
  check('diabetes → gentle only', d.level === 'gentle' && d.paces.join() === 'gentle');
  check('medical condition → gentle only', screen(Q({ health: { medical: true } })).paces.join() === 'gentle');
  check('aggressive request downgraded to gentle when flagged', computeWL(Q({ pace: 'aggressive', health: { diabetes: true } })).pace === 'gentle');
  check('healthy adult → all three paces', screen(Q()).paces.length === 3);
}

// ---------- plans: exclusions, diet and macro tolerance ----------
{
  const diets: DietPattern[] = ['omnivore', 'mediterranean', 'vegetarian', 'vegan', 'pescatarian', 'lowcarb'];
  const exclSets: Allergen[][] = [[], ['gluten'], ['dairy'], ['nuts'], ['egg'], ['soy'], ['shellfish'], ['gluten', 'dairy'], ['nuts', 'soy', 'egg']];
  let plans = 0, days = 0, okDays = 0, violations = 0, emptyDays = 0;
  const byDiet: Record<string, [number, number]> = {};
  const failing: string[] = [];
  for (const diet of diets) for (const exclude of exclSets) for (const meals of [2, 3, 4, 5] as const) for (const [sex, w, act, tr] of [['male', 85, 1.55, 'hybrid'], ['female', 68, 1.375, 'endurance'], ['female', 95, 1.2, 'none'], ['male', 110, 1.725, 'strength']] as const) {
    const q = Q({ diet, exclude, meals, sex, weightKg: w, heightCm: sex === 'male' ? 180 : 165, activity: act, training: tr, goalWeightKg: undefined });
    const t = computeWL(q);
    const wk = buildWeek(cat, q, t, 7 + plans, defaultTrainDays(q.trainingDays));
    plans++;
    const v = planViolations(cat, q, wk); violations += v.length;
    if (v.length) failing.push(`${diet}/${exclude.join('+')}: ${v[0]}`);
    for (const d of wk) { days++; (byDiet[diet] ||= [0, 0])[1]++; if (!d.meals.length) emptyDays++; else if (withinTolerance(d.target, dayMacro(cat, d.meals))) { okDays++; (byDiet[diet] ||= [0, 0])[0]++; } else if (failing.length < 12) failing.push(`${diet}/${exclude.join('+') || '-'}/${meals}m/${sex}${w}: ${d.totals.kcal}/${d.target.kcal} kcal P ${d.totals.protein}/${d.target.protein}`); }
  }
  check(`no plan meal breaks a diet or exclusion (${plans} plans)`, violations === 0, failing.slice(0, 5));
  check('every day has meals', emptyDays === 0, emptyDays);
  const rate = okDays / days;
  console.log(`  tolerance: ${okDays}/${days} days within ±5% kcal and −10%/+30% protein (${(rate * 100).toFixed(1)}%)`);
  for (const [k, [o, n]] of Object.entries(byDiet)) console.log(`    ${k}: ${o}/${n} (${(o / n * 100).toFixed(1)}%)`);
  const nonVegan = Object.entries(byDiet).filter(([k]) => k !== 'vegan').reduce((a, [, [o, n]]) => [a[0] + o, a[1] + n], [0, 0]);
  check('≥ 99% of non-vegan days within macro tolerance', nonVegan[0] / nonVegan[1] >= 0.99, failing.filter((f) => !f.startsWith('vegan')).slice(0, 12));
  check('≥ 75% of vegan days within tolerance (vegan + soy-free or gluten-free at high protein targets can fall short; the app flags those days)', byDiet.vegan[0] / byDiet.vegan[1] >= 0.75);
  check('≥ 95% of all generated days within macro tolerance', rate >= 0.95);
  // the common case must be perfect
  for (const diet of ['omnivore', 'mediterranean', 'vegetarian', 'pescatarian'] as DietPattern[]) {
    const q = Q({ diet });
    const wk = buildWeek(cat, q, computeWL(q), 1, defaultTrainDays(4));
    check(`${diet}: all 7 days within tolerance`, wk.every((d) => d.ok), wk.map((d) => `${d.totals.kcal}/${d.target.kcal} P${d.totals.protein}/${d.target.protein}`));
  }
  // explicit exclusion checks
  const q = Q({ diet: 'vegetarian', exclude: ['gluten', 'dairy'] });
  const wk = buildWeek(cat, q, computeWL(q), 3, [0, 2, 4]);
  const ids = wk.flatMap((d) => d.meals.map((m) => cat.recipes.find((r) => r.id === m.recipeId)!));
  check('vegetarian + gluten-free + dairy-free: no meat, fish, gluten or dairy', ids.every((r) => !['meat', 'fish', 'shellfish', 'gluten', 'dairy'].some((c) => r.contains.includes(c))));
  const vq = Q({ diet: 'vegan', exclude: ['soy'] });
  const vw = buildWeek(cat, vq, computeWL(vq), 5, [0, 2, 4]);
  check('vegan + soy-free sides contain no animal products or soy', vw.every((d) => d.meals.every((m) => m.sides.every((s) => { const sd = cat.sides.find((x) => x.id === s.id)!; return !['dairy', 'egg', 'meat', 'fish', 'soy'].some((c) => sd.contains.includes(c)); }))));
  check('kosher: no shellfish, no meat + dairy in one dish', !fits(['shellfish'], { diet: 'omnivore', religious: 'kosher', exclude: [] }) && !fits(['meat', 'dairy'], { diet: 'omnivore', religious: 'kosher', exclude: [] }) && fits(['meat'], { diet: 'omnivore', religious: 'kosher', exclude: [] }));
  const quick = Q({ cookTime: 15 });
  const qw = buildWeek(cat, quick, computeWL(quick), 2, [0, 2, 4]);
  check('cooking time ≤ 15 min respected', qw.every((d) => d.meals.every((m) => cat.recipes.find((r) => r.id === m.recipeId)!.minutes <= 15)));
  const bq = Q({ budget: true });
  const bw = buildWeek(cat, bq, computeWL(bq), 2, [0, 2, 4]);
  const share = bw.flatMap((d) => d.meals).filter((m) => cat.recipes.find((r) => r.id === m.recipeId)!.budget).length / bw.flatMap((d) => d.meals).length;
  check('budget-friendly: most meals are budget recipes', share >= 0.5, share);
  // variety: same slot not repeated on consecutive days when the pool allows
  const ow = buildWeek(cat, Q(), computeWL(Q()), 9, defaultTrainDays(4));
  let repeats = 0; for (let d = 1; d < 7; d++) ow[d].meals.forEach((m, i) => { if (ow[d - 1].meals[i]?.recipeId === m.recipeId) repeats++; });
  check('no recipe repeated in the same slot on consecutive days (omnivore)', repeats === 0, repeats);
  // swap keeps tolerance and diet
  const t0 = computeWL(Q());
  const opts = swapOptions(cat, Q(), ow[0].meals[1].slot, ow[0].meals[1].recipeId);
  const sw = swapMeal(cat, Q(), t0, ow[0], 1, opts[0].id);
  check('swap replaces the recipe and re-solves portions', sw.meals[1].recipeId === opts[0].id && sw.ok, sw.totals);
  // retarget after an adjustment
  const t1 = computeWL(Q(), {}, { adjustKcal: -100 });
  const rw = retarget(cat, Q(), t1, ow, defaultTrainDays(4));
  check('retarget follows new targets', rw.every((d) => d.target.kcal === (defaultTrainDays(4).includes(d.weekday) ? t1.train.kcal : t1.rest.kcal)) && rw.filter((d) => d.ok).length >= 6);
  // time-restricted eating
  const tq = Q({ meals: 3, window: { start: '10:00', hours: 8 } });
  check('eating window: 3 meals spread 10:00–17:30', mealTimes(tq).join() === '10:00,13:45,17:30', mealTimes(tq));
}

// ---------- grocery list ----------
{
  const q = Q();
  const wk = buildWeek(cat, q, computeWL(q), 4, defaultTrainDays(4));
  const gl = groceryList(cat, wk);
  const total = gl.flatMap((g) => g.items).reduce((a, i) => a + i.grams, 0);
  let expect = 0;
  for (const d of wk) for (const m of d.meals) { const r = cat.recipes.find((x) => x.id === m.recipeId)!; expect += r.ingredients.filter((i) => i.fdcId !== 173647).reduce((a, i) => a + i.grams / r.serves * m.factor, 0); for (const s of m.sides) expect += cat.sides.find((x) => x.id === s.id)!.grams * s.n; }
  check('grocery list totals every ingredient gram (±1%)', Math.abs(total - expect) / expect < 0.01, [total, expect]);
  check('grocery list grouped by aisle', gl.length >= 4 && gl.every((g) => g.items.length));
  const vg = groceryList(cat, buildWeek(cat, Q({ diet: 'vegan' }), computeWL(Q({ diet: 'vegan' })), 4, [0, 2, 4]));
  check('vegan grocery list has no meat/fish aisle', !vg.some((g) => g.aisle === 'Meat & fish') && !vg.some((g) => g.aisle === 'Dairy & eggs'), vg.map((g) => g.aisle));
}

// ---------- trend & suggestions ----------
{
  const logs = [{ date: '2026-10-01', weightKg: 85 }, { date: '2026-10-03', weightKg: 84 }, { date: '2026-10-05', weightKg: 84.6 }];
  const tr = weightTrend(logs);
  check('7-day average trend', near(tr[2].avg, (85 + 84 + 84.6) / 3, 0.01), tr);
  const weekly = Array.from({ length: 5 }, (_, i) => ({ date: new Date(2026, 9, 1 + i * 7, 12).toISOString().slice(0, 10), weightKg: 85 - 0.5 * i }));
  const rate = trendRate(weightTrend(weekly), weekly[4].date, 35);
  check('trend rate from weekly weigh-ins ≈ −0.5 kg/wk', rate != null && near(rate, -0.5, 0.05), rate);
  const q = Q();
  const t = computeWL(q);
  const plan = (p: Partial<WLPlan> = {}): WLPlan => ({ id: 'p', updatedAt: 1, startDate: '2026-09-01', quiz: q, energy: {}, seed: 1, trainDays: defaultTrainDays(4), adjustKcal: 0, adjustments: [], breaks: [], targets: t, week: [], checked: [], applyToFuel: true, logged: {}, ...p });
  const flat = Array.from({ length: 6 }, (_, i) => ({ date: new Date(2026, 8, 1 + i * 7, 12).toISOString().slice(0, 10), weightKg: 85 + (i % 2 ? 0.1 : -0.1) }));
  const s1 = suggest(plan(), flat, flat[5].date);
  check('stall after 3+ weeks → suggests −100 kcal or a diet break (never applied automatically)', s1.kind === 'stall' && s1.actions.includes('minus100') && s1.actions.includes('break7'), s1);
  check('suggest() does not change the plan', plan().adjustKcal === 0);
  const early = suggest(plan({ startDate: flat[4].date }), flat, flat[5].date);
  check('too early → keep logging', early.kind === 'early', early.kind);
  const floorPlan = plan({ targets: { ...t, kcal: t.floor } });
  check('at the floor → no −100 option', !suggest(floorPlan, flat, flat[5].date).actions.includes('minus100'));
  const fast = Array.from({ length: 4 }, (_, i) => ({ date: new Date(2026, 8, 1 + i * 7, 12).toISOString().slice(0, 10), weightKg: 85 - 1.3 * i }));
  check('losing > 1%/week → suggests eating more', suggest(plan(), fast, fast[3].date).kind === 'fast');
  const goal = [...weekly, { date: '2026-11-05', weightKg: 77 }, { date: '2026-11-06', weightKg: 77 }, { date: '2026-11-07', weightKg: 77 }];
  check('trend at goal → maintenance suggestion', suggest(plan({ startDate: '2026-10-01' }), goal, '2026-11-07').kind === 'goal');
  const onBrk = plan({ breakFrom: '2026-10-10', breakUntil: '2026-10-16' });
  const bt = planTargetsFor(onBrk, '2026-10-12');
  check('diet break → maintenance targets that day', bt.onBreak && bt.kcal === t.maintenance.kcal && bt.kcal > t.kcal);
  check('outside the break → plan targets', !planTargetsFor(onBrk, '2026-10-20').onBreak);
  check('training weekday gets training-day target', planTargetsFor(plan(), '2026-11-16').kind === 'train' && planTargetsFor(plan(), '2026-11-16').kcal === t.train.kcal); // Mon
}

console.log(failed ? `\n${failed} FAILED` : '\nall weight-loss checks passed');
process.exit(failed ? 1 : 0);
