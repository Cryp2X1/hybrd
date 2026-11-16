// Unit checks for Train › Ultra & Backyard: sources, screening gates, readiness, plan safety caps
// (weekly ramp ≤10%, long run ≤+10% on the 30-day max, cut-backs, phase order, taper), backyard lap math
// and timer status, race fuelling bounds, sweat rate, daily targets and the Fuel-targets precedence.
// Run: node --experimental-strip-types --import ./tools/ts-resolve.mjs tools/test-ultra.ts
import {
  YARD_KM, YARD_MI, YARD_M, HOUR_MS, MAX_RAMP, RACES, specOf, byuSpec, screen, canPlan, readiness, buildPlan, planOf, activeUltra, taperFractions,
  lapPaceSec, fmtPace, yardsToKm, yardsToMi, byuStatus, fuelPlan, sweatRate, dayTargets, carbGkg, ultraTargetsFor, estRaceHours, allSessions, sessionAt,
  type UltraQuiz, type UltraSaved, type RaceId, type Terrain,
} from '../src/lib/ultra.ts';
import { SOURCES } from '../src/data/sources.ts';
import { ULTRA_RESEARCH, ULTRA_SOURCE_IDS, GEAR, CREW, ACCLIM, RECOVERY, WARNINGS, REAL_FOODS, RACE_WEEK_SRC, raceDayPlan } from '../src/data/ultraContent.ts';
import { FEATURES, can } from '../src/lib/entitlements.ts';
import { fuelTargets } from '../src/lib/fuelTargets.ts';
import type { Profile } from '../src/lib/types.ts';

let failed = 0;
const check = (name: string, cond: boolean, detail?: unknown) => { if (!cond) { failed++; console.error('FAIL', name, detail ?? ''); } else console.log('ok', name); };
const TODAY = '2026-11-16';
const Q = (p: Partial<UltraQuiz> = {}): UltraQuiz => ({
  sex: 'male', age: 34, weightKg: 72, chestPain: false, heart: false, pregnant: false, injury: false, kidney: false, diabetesMeds: false, pastEmergency: false,
  edHistory: false, cleared: false, years: 4, weeklyKm: 50, longestKm: 25, finished: 'marathon', easyPaceSec: 360, race: '50mi', yards: 24,
  raceDate: '2027-05-01', terrain: 'trail', vertM: 3000, climate: 'mild', altitude: false, days: 5, longDay: 5, gut: 'some', lapMin: 50, ...p,
});

// ---- sources & content
const ids = new Set(SOURCES.map((s) => s.id));
check('source ids unique', ids.size === SOURCES.length);
const ultraSrc = SOURCES.filter((s) => s.id.startsWith('ultra-'));
check('≥40 new ultra sources', ultraSrc.length >= 40, ultraSrc.length);
check('all ultra sources have https links + cite + used', ultraSrc.every((s) => /^https:\/\//.test(s.url) && s.cite.length > 20 && s.used.length > 10));
check('every ULTRA_SOURCE_ID exists', ULTRA_SOURCE_IDS.every((i) => ids.has(i)), ULTRA_SOURCE_IDS.filter((i) => !ids.has(i)));
check('ULTRA_SOURCE_IDS ≥ 50', ULTRA_SOURCE_IDS.length >= 50, ULTRA_SOURCE_IDS.length);
const cited = [...ULTRA_RESEARCH, ...CREW, ...ACCLIM, ...RECOVERY, ...raceDayPlan('byu', 50), ...raceDayPlan('100mi', 50)];
check('every research/prep card cites ≥1 existing source', cited.every((c) => c.src.length > 0 && c.src.every((i) => ids.has(i))), cited.filter((c) => !c.src.every((i) => ids.has(i))).map((c) => c.title));
check('every warning + gear group cites', [...WARNINGS, ...GEAR].every((c) => c.src.length > 0 && c.src.every((i) => ids.has(i))) && RACE_WEEK_SRC.every((i) => ids.has(i)));
check('≥15 research cards', ULTRA_RESEARCH.length >= 15, ULTRA_RESEARCH.length);
check('warnings cover hyponatremia, heat, rhabdo, cardiac', ['eah', 'heat', 'rhabdo', 'cardiac'].every((w) => WARNINGS.some((x) => x.id === w)));
check('real foods have USDA ids + plausible values', REAL_FOODS.length >= 10 && REAL_FOODS.every((f) => f.fdc > 0 && f.carbs > 0 && f.carbs < 120 && f.sodium >= 0 && f.sodium < 2500));
const uf = Object.keys(FEATURES).filter((k) => k.startsWith('ultra.'));
check('ultra features exist and are free', uf.length >= 5 && uf.every((k) => FEATURES[k as keyof typeof FEATURES].free && can(k as keyof typeof FEATURES)), uf);

// ---- screening
check('healthy adult ok', screen(Q()).level === 'ok' && canPlan(Q()));
check('under 18 → stop', screen(Q({ age: 16 })).stop.includes('under18'));
check('chest pain → stop', screen(Q({ chestPain: true })).level === 'stop');
check('pregnant (female) → stop', screen(Q({ sex: 'female', pregnant: true })).level === 'stop');
check('current injury → stop', screen(Q({ injury: true })).level === 'stop');
for (const [k, r] of [['heart', 'heart'], ['kidney', 'kidney'], ['diabetesMeds', 'diabetes'], ['pastEmergency', 'emergency'], ['edHistory', 'ed']] as const) {
  const s = screen(Q({ [k]: true } as Partial<UltraQuiz>));
  check(`${k} → doctor`, s.level === 'doctor' && s.doctor.includes(r));
}
check('doctor level blocks plan until cleared', !canPlan(Q({ heart: true })) && canPlan(Q({ heart: true, cleared: true })));
check('stop can’t be cleared', !canPlan(Q({ chestPain: true, cleared: true })));
check('stopped saved plan is inactive', activeUltra({ version: 1, quiz: Q({ injury: true }), createdAt: TODAY, target: '50mi', level: 'stop' }) === null);

// ---- readiness
check('ready: experienced 50mi, 24 weeks', readiness(Q(), TODAY).status === 'ready');
check('too-soon: 4 weeks out', readiness(Q({ raceDate: '2026-12-12' }), TODAY).status === 'too-soon');
const novice = readiness(Q({ race: '100mi', years: 1, weeklyKm: 25, longestKm: 15, finished: 'half' }), TODAY);
check('bridge: novice → 100mi recommends smaller race or base', novice.status === 'bridge' && !!novice.recommend, novice);
const nb = readiness(Q({ race: '50k', years: 0, weeklyKm: 10, longestKm: 6, finished: 'none' }), TODAY);
check('bridge: beginner → base builder', nb.status === 'bridge' && nb.recommend === 'base', nb);
const byuR = readiness(Q({ race: 'byu', yards: 36, weeklyKm: 50, longestKm: 25 }), TODAY);
check('byu 36 yards too much → smaller yard target', byuR.status === 'bridge' && byuR.recommend === 'byu' && (byuR.recommendYards || 0) < 36, byuR);
check('stretch: 12 weeks to 50mi', readiness(Q({ raceDate: '2027-02-06' }), TODAY).status === 'stretch');

// ---- plan safety across many profiles
const cases: Partial<UltraQuiz>[] = [];
for (const race of ['50k', '50mi', '100k', '100mi', 'byu', 'base'] as RaceId[]) for (const terrain of ['road', 'trail', 'mountain'] as Terrain[]) for (const days of [4, 5, 6, 7]) for (const [weeklyKm, longestKm, years] of [[30, 16, 1], [55, 28, 3], [80, 35, 6]])
  cases.push({ race, terrain, days, weeklyKm, longestKm, years, yards: race === 'byu' ? [7, 12, 24, 36][days % 4] : 24, finished: years >= 3 ? '100mi' : 'marathon', age: days === 4 ? 55 : 34 });
let bad = { ramp: 0, long: 0, order: 0, taper: 0, cut: 0, race: 0, long0: 0, days: 0, km: 0 };
const samples: string[] = [];
for (const c of cases) {
  const q = Q(c);
  const p = buildPlan(q, TODAY);
  const W = p.weeks;
  // weekly ramp: never > +10% on the last full (non-cut, non-taper) week's actual km, and never above the starting volume ×1.1 in week 1
  let lastFull = q.weeklyKm;
  for (const w of W) {
    if (w.phase !== 'taper' && !w.cut) { if (w.km > lastFull * MAX_RAMP + 0.6) { bad.ramp++; samples.push(`ramp ${q.race}/${q.terrain}/${q.days}d w${w.i} ${w.km} > ${lastFull}`); } lastFull = Math.max(lastFull, w.km); }
  }
  // long run: ≤ 1.1 × max long of the previous 4 weeks (or the longest run reported)
  W.forEach((w, i) => {
    const prev = [q.longestKm, ...W.slice(Math.max(0, i - 4), i).map((x) => x.longKm)];
    const cap = Math.max(...prev) * 1.1 + 0.6;
    if (w.longKm > cap && w.phase !== 'taper') { bad.long++; samples.push(`long ${q.race} w${i} ${w.longKm} > ${cap.toFixed(1)}`); }
    if (w.longKm > p.spec.peakLongKm + 0.1) { bad.long++; samples.push(`peak long ${q.race} ${w.longKm}`); }
  });
  // phase order base → build → specific → taper
  const rank = { base: 0, build: 1, specific: 2, taper: 3 } as const;
  if (!W.every((w, i) => i === 0 || rank[w.phase] >= rank[W[i - 1].phase])) bad.order++;
  // taper: decreasing, average reduction within Bosquet 2007's effective 41–60% band (±5)
  const tap = W.filter((w) => w.phase === 'taper');
  if (p.spec.taperWeeks) {
    const peak = Math.max(...W.filter((w) => w.phase !== 'taper').map((w) => w.km));
    const avgCut = 1 - tap.reduce((a, w) => a + w.km, 0) / tap.length / peak;
    if (tap.length !== p.spec.taperWeeks || !tap.every((w, i) => i === 0 || w.km <= tap[i - 1].km + 0.1) || avgCut < 0.36 || avgCut > 0.65) { bad.taper++; samples.push(`taper ${q.race} ${tap.map((w) => w.km)} peak ${peak} avg ${avgCut.toFixed(2)}`); }
  }
  // cut-back weeks exist in builds ≥ 8 weeks (outside taper)
  if (W.filter((w) => w.phase !== 'taper').length >= 8 && !W.some((w) => w.cut)) bad.cut++;
  // last week contains the race on race day (non-base)
  if (q.race !== 'base') { const last = W[W.length - 1]; const r = last.days.find((d) => d.kind === 'race'); if (!r || r.date !== q.raceDate && !(q.raceDate > last.days[6].date)) { bad.race++; samples.push(`race ${q.race} ${r?.date} vs ${q.raceDate}`); } }
  // every week has a long run except race week; running days ≤ chosen days
  W.forEach((w, i) => {
    if (i < W.length - 1 && !w.days.some((d) => ['long', 'sim'].includes(d.kind))) bad.long0++;
    const run = w.days.filter((d) => d.kind !== 'rest' && d.kind !== 'strength').length;
    if (run > q.days) { bad.days++; samples.push(`days ${q.race} ${q.days}d w${i} ${run}`); }
    const sum = w.days.filter((d) => d.kind !== 'race').reduce((a, d) => a + d.km, 0);
    if (Math.abs(sum - w.km) > 1.5) { bad.km++; samples.push(`km ${q.race} w${i} sum ${sum.toFixed(1)} vs ${w.km}`); }
  });
}
console.log(`  (${cases.length} plan profiles)`);
check('weekly ramp ≤ +10% on last full week', bad.ramp === 0, samples.filter((s) => s.startsWith('ramp')).slice(0, 5));
check('long run ≤ +10% on 30-day max and ≤ race peak long', bad.long === 0, samples.filter((s) => s.includes('long')).slice(0, 5));
check('phases ordered base→build→specific→taper', bad.order === 0);
check('taper decreasing, avg cut ≈ 41–60%', bad.taper === 0, samples.filter((s) => s.startsWith('taper')).slice(0, 5));
check('cut-back weeks present', bad.cut === 0);
check('race lands on race day', bad.race === 0, samples.filter((s) => s.startsWith('race')).slice(0, 5));
check('weekly long run present (pre-race weeks)', bad.long0 === 0, bad.long0);
check('running days ≤ chosen days', bad.days === 0, samples.filter((s) => s.startsWith('days')).slice(0, 5));
check('day km sums match week km', bad.km === 0, samples.filter((s) => s.startsWith('km')).slice(0, 5));
check('taper fractions', JSON.stringify(taperFractions(2)) === '[0.75,0.5]' && JSON.stringify(taperFractions(3)) === '[0.8,0.6,0.45]');
const p100 = buildPlan(Q({ race: '100mi', years: 5, weeklyKm: 70, longestKm: 35, finished: '100mi', raceDate: '2027-05-01' }), TODAY);
check('100mi: 24 weeks, 3-week taper, B2B present', p100.weeks.length === 24 && p100.weeks.filter((w) => w.phase === 'taper').length === 3 && p100.weeks.some((w) => w.b2bKm > 0));
check('100mi: peak long ≤ 45 km, long-run time cap ≤ 6 h', Math.max(...p100.weeks.map((w) => w.longKm)) <= 45 && allSessions(p100).filter((d) => d.kind === 'long').every((d) => d.min <= 360 + 5));
check('older/novice runners cut back every 3rd week', buildPlan(Q({ age: 55 }), TODAY).cycle === 3 && buildPlan(Q({ years: 1 }), TODAY).cycle === 3 && buildPlan(Q(), TODAY).cycle === 4);
const pb = buildPlan(Q({ race: 'byu', yards: 24, weeklyKm: 65, longestKm: 35, years: 5, finished: '100mi', days: 6 }), TODAY);
const sims = allSessions(pb).filter((d) => d.kind === 'sim');
check('backyard plan has on-the-hour simulations', sims.length >= 2 && sims.every((s) => (s.yards || 0) >= 1 && s.steps.filter((x) => x.kind === 'work').length === s.yards));
check('backyard sim steps = lap + rest = 60 min each', sims.every((s) => s.steps.every((x, i, a) => x.kind === 'rest' ? x.sec + a[i - 1].sec === 3600 : true)));
check('backyard plan has night yards', allSessions(pb).some((d) => d.kind === 'night'));
check('backyard plan has yard-pace gears', allSessions(pb).some((d) => d.kind === 'gears'));
check('sessionAt finds a session', !!sessionAt(pb, 3, 5));
check('gut training climbs to ≥60 g/h before the race', pb.weeks[0].gut <= 40 && pb.weeks[pb.weeks.length - 1].gut >= 60);
check('mountain plans include climbing', buildPlan(Q({ terrain: 'mountain', vertM: 6000 }), TODAY).weeks.some((w) => w.vertM > 1000));
const saved: UltraSaved = { version: 1, quiz: Q(), createdAt: TODAY, target: '50mi', level: 'ok', applyToFuel: true };
check('planOf is stable (rebuilds same plan)', JSON.stringify(planOf(saved)) === JSON.stringify(planOf(saved)));

// ---- backyard math
check('24 yards = 100 miles', Math.abs(24 * YARD_MI - 100) < 1e-9 && yardsToMi(24) === 100);
check('yard = 6.7056 km = 4.1667 mi', YARD_KM === 6.7056 && Math.abs(YARD_MI - 4.16667) < 1e-4 && YARD_M === 6705.6 && Math.abs(YARD_KM / 1.609344 - YARD_MI) < 0.001);
check('24 yards ≈ 160.93 km', yardsToKm(24) === 160.93);
check('60-min yard = 8:57 /km', fmtPace(lapPaceSec(60)) === '8:57 /km', fmtPace(lapPaceSec(60)));
check('50-min yard = 7:27 /km, 12:00 /mi', fmtPace(lapPaceSec(50)) === '7:27 /km' && fmtPace(lapPaceSec(50), true) === '12:00 /mi', [fmtPace(lapPaceSec(50)), fmtPace(lapPaceSec(50), true)]);
const T0 = 1_800_000_000_000, min = 60_000;
const t = { start: T0, finishes: [] as number[], stopped: null, lapMin: 50, goal: 24 };
let st = byuStatus(t, T0 + 10 * min);
check('timer: on lap 1 at +10 min', st.yard === 1 && st.onLap && st.lapMs === 10 * min && st.bellInMs === 50 * min && st.completed === 0);
t.finishes = [T0 + 48 * min];
st = byuStatus(t, T0 + 55 * min);
check('timer: yard 1 done in 48 min → 5 min rest left', st.completed === 1 && !st.onLap && st.restLeftMs === 5 * min && st.lapMs === 48 * min && st.distM === Math.round(YARD_M));
check('timer: 3/2/1-min warnings', byuStatus(t, T0 + 57.5 * min).warn === 3 && byuStatus(t, T0 + 58.5 * min).warn === 2 && byuStatus(t, T0 + 59.5 * min).warn === 1 && byuStatus(t, T0 + 50 * min).warn === 0);
st = byuStatus(t, T0 + 61 * min);
check('timer: bell → yard 2 on lap', st.yard === 2 && st.onLap && st.lapMs === 1 * min);
st = byuStatus(t, T0 + 121 * min);
check('timer: miss yard 2 → out (missed)', st.missed && !st.onLap && st.completed === 1);
const t3 = { ...t, finishes: [T0 + 50 * min, T0 + HOUR_MS + 52 * min, T0 + 2 * HOUR_MS + 49 * min], stopped: T0 + 3 * HOUR_MS };
st = byuStatus(t3, T0 + 10 * HOUR_MS);
check('timer: stopped after 3 yards → 3 yards, 20.12 km, laps kept', st.completed === 3 && st.laps.length === 3 && Math.abs(st.distM - 20116.8) < 1 && st.elapsedMs === 3 * HOUR_MS);
check('timer: late finish (after bell) not counted', byuStatus({ ...t, finishes: [T0 + 61 * min] }, T0 + 62 * min).completed === 0);
check('timer: not started', byuStatus({ ...t, start: null }, T0).yard === 0);

// ---- fuelling
for (const gut of ['none', 'some', 'trained'] as const) for (const climate of ['cool', 'mild', 'hot'] as const) for (const sr of [null, 0.5, 1.4]) {
  const f = fuelPlan({ weightKg: 70, hours: 24, climate, gut, sweatRateL: sr, race: 'byu' });
  const ok = f.carbs[1] <= 90 && f.carbs[0] >= 30 && f.fluid[1] <= 1000 && (sr ? f.fluid[1] <= sr * 1000 : true) && f.fluid[0] <= f.fluid[1] && f.sodium[0] <= f.sodium[1] && (climate !== 'hot' || (f.sodium[0] >= 300 && f.sodium[1] >= 600)) && f.protein[1] <= 10;
  if (!ok) check(`fuel bounds ${gut}/${climate}/${sr}`, false, f);
}
check('fuel bounds hold across gut × climate × sweat rate', true);
check('untrained gut: 30–50 g/h; trained: 60–90 g/h', JSON.stringify(fuelPlan({ weightKg: 70, hours: 8, climate: 'mild', gut: 'none', race: '50k' }).carbs) === '[30,50]' && JSON.stringify(fuelPlan({ weightKg: 70, hours: 8, climate: 'mild', gut: 'trained', race: '50k' }).carbs) === '[60,90]');
check('fluid capped by sweat rate (0.5 L/h → ≤ 500 mL/h)', fuelPlan({ weightKg: 70, hours: 8, climate: 'mild', gut: 'some', sweatRateL: 0.5, race: '50k' }).fluid[1] <= 500);
check('ISSN kcal 200–400/h for long races', fuelPlan({ weightKg: 70, hours: 30, climate: 'mild', gut: 'none', race: '100mi' }).kcal[0] >= 200);
const caf = fuelPlan({ weightKg: 70, hours: 24, climate: 'mild', gut: 'some', race: 'byu' }).caffeine!;
check('caffeine 1–2 mg/kg doses, ≤6 mg/kg/24 h', caf.perDoseMg[0] === 70 && caf.perDoseMg[1] === 140 && caf.maxMg === 420 && caf.startHour >= 6);
check('caffeine-sensitive → no caffeine plan', fuelPlan({ weightKg: 70, hours: 24, climate: 'mild', gut: 'some', race: 'byu', caffeineSensitive: true }).caffeine === null);
check('salty sweater raises sodium', fuelPlan({ weightKg: 70, hours: 8, climate: 'mild', gut: 'some', race: '50k', salty: true }).sodium[1] > fuelPlan({ weightKg: 70, hours: 8, climate: 'mild', gut: 'some', race: '50k' }).sodium[1]);
check('sweat rate: 70→69 kg, drank 0.5 L, 60 min → 1.5 L/h', sweatRate(70, 69, 0.5, 0, 60) === 1.5);
check('sweat rate: invalid inputs → null', sweatRate(0, 69, 0, 0, 60) === null && sweatRate(70, 69, 0, 0, 10) === null && sweatRate(70, 71, 0, 0, 60) === null);
check('estRaceHours: byu = yards; 50k road at 6:00/km ≈ 6.25 h', estRaceHours('byu', 24, 'trail', 0, 360) === 24 && Math.abs(estRaceHours('50k', 24, 'road', 0, 360) - 6.25) < 0.1);

// ---- daily nutrition + Fuel precedence
check('carb g/kg: rest 4, easy 5, long >4h 10, race 10', carbGkg(null) === 4 && carbGkg({ kind: 'easy', min: 45 }) === 5 && carbGkg({ kind: 'long', min: 300 }) === 10 && carbGkg({ kind: 'race', min: 600 }) === 10);
const dt = dayTargets(70, { kind: 'long', min: 200 }, 'build');
check('day targets: long 8 g/kg, 1.8 g/kg protein, 1 g/kg fat', dt.carbs === 560 && dt.protein === 126 && dt.fat === 70 && dt.kcal === Math.round((560 * 4 + 126 * 4 + 70 * 9) / 10) * 10);
check('ED history → no ultra fuel targets', ultraTargetsFor({ ...saved, quiz: Q({ edHistory: true, cleared: true }) }, 72, '2026-11-20') === null);
check('applyToFuel off → no targets', ultraTargetsFor({ ...saved, applyToFuel: false }, 72, '2026-11-20') === null);
const prof = { weightKg: 72, heightCm: 178, sex: 'male', birthYear: 1992, activity: 'active', goal: 'maintain', units: 'metric', ultra: saved } as unknown as Profile;
const ft = fuelTargets(prof, { wlplans: [], coachplans: [] }, '2026-11-21');
check('Fuel targets follow ultra plan when applied', ft.plan && ft.label.startsWith('Ultra plan'), ft);
const ftOff = fuelTargets({ ...prof, ultra: { ...saved, applyToFuel: false } } as Profile, { wlplans: [], coachplans: [] }, '2026-11-21');
check('Fuel targets back to profile when not applied', !ftOff.plan && ftOff.label === 'Daily target', ftOff.label);
check('RACES: specs sane', Object.values(RACES).every((r) => r.minWeeks <= r.idealWeeks && r.peakLongKm <= r.peakWeekKm) && specOf('byu', 24).id === 'byu' && byuSpec(36).peakLongKm >= byuSpec(24).peakLongKm);

console.log(failed ? `\n${failed} FAILED` : '\nall ultra checks passed');
process.exit(failed ? 1 : 0);
