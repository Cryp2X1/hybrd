import type { SleepLog } from './sleep';
import { baselines, hardYesterday, readiness, type CheckIn, type JournalEntry, type MindSession, type ScreenResult, type Scale5 } from './mind';
import type { BodyLog, BurnEntry, DataState, FoodEntry, GpsRoute, RoutePoint, StepDay, WaterDay, Workout } from './types';
import { addDays, dayKeyOf, estKcal, haversine, splitsFromTrack, todayKey } from './calc';
import recipes from '../data/recipes.json';

// Clearly-labelled demo data so friends can explore before logging their own. Removable from Me › Data.
export const SAMPLE_TAG = 'sample';

function loop(center: [number, number], radiusM: number, n: number, startT: number, secPerM: number, phase = 0): RoutePoint[] {
  const pts: RoutePoint[] = [];
  let t = startT;
  let prev: RoutePoint | null = null;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2 + phase;
    const wob = 1 + 0.18 * Math.sin(a * 3) + 0.07 * Math.cos(a * 7);
    const dLat = (radiusM * wob * Math.sin(a)) / 111320;
    const dLng = (radiusM * 1.35 * wob * Math.cos(a)) / (111320 * Math.cos((center[0] * Math.PI) / 180));
    const p: RoutePoint = { lat: center[0] + dLat, lng: center[1] + dLng, alt: 12 + 9 * Math.sin(a * 2), t, acc: 6 };
    if (prev) { t += haversine(prev, p) * secPerM * 1000 * (0.95 + Math.random() * 0.1); p.t = Math.round(t); }
    pts.push(p); prev = p;
  }
  return pts;
}

/** center = the user's area (see demoCenter) so demo routes show up near them, not in a far-off city. */
export function buildSample(weightKg: number, center: [number, number]): Partial<DataState> {
  const today = todayKey();
  const workouts: Workout[] = [], routes: GpsRoute[] = [], foods: FoodEntry[] = [], water: WaterDay[] = [], body: BodyLog[] = [];
  const C: [number, number] = center;
  const C2: [number, number] = [center[0] - 0.0117, center[1] - 0.0088]; // rides loop a little south-west
  const plan: [number, Workout['type'], string, number, number, number?][] = [
    // dayOffset, type, title, minutes, rpe, distance km
    [-27, 'calisthenics', 'Calisthenics A · Push + Legs', 40, 7], [-26, 'run', 'Easy Run', 32, 4, 5.1], [-24, 'strength', 'Lower Strength', 55, 8],
    [-23, 'run', 'Intervals 5 × 1 km', 48, 8, 7.2], [-21, 'hyrox', 'Compromised Running', 52, 8], [-20, 'run', 'Long Run', 62, 5, 10.1],
    [-19, 'rest', 'Rest day', 0, 0], [-18, 'calisthenics', 'Calisthenics B · Pull + Core', 42, 7], [-17, 'cycle', 'Endurance Ride', 65, 5, 26.5],
    [-15, 'strength', 'Upper Strength', 55, 7], [-14, 'run', 'Tempo', 44, 7, 7.6], [-13, 'hybrid', 'Hybrid Brick', 45, 8], [-12, 'walk', 'Brisk Walk', 35, 3, 3.4],
    [-11, 'run', 'Long Run', 66, 5, 11.0], [-9, 'calisthenics', 'Calisthenics C · Full Body', 36, 7], [-8, 'run', 'Easy Run', 34, 4, 5.6],
    [-7, 'hyrox', 'Station Strength', 60, 8], [-6, 'run', 'Intervals 5 × 1 km', 50, 8, 7.4], [-5, 'rest', 'Rest day', 0, 0],
    [-4, 'strength', 'Lower Strength', 55, 8], [-3, 'cycle', '4 × 4 min Intervals', 50, 8, 21.8], [-2, 'run', 'Long Run', 70, 5, 12.0], [-1, 'calisthenics', 'Calisthenics A · Push + Legs', 40, 7],
    [0, 'run', 'Easy Run', 31, 4, 5.2],
  ];
  plan.forEach(([off, type, title, min, rpe, km], i) => {
    const day = addDays(today, off);
    const start = new Date(`${day}T${off === 0 ? '06' : String(6 + (i % 3) * 5).padStart(2, '0')}:30:00`);
    const id = `${SAMPLE_TAG}-w${i}`;
    const w: Workout = { id, updatedAt: Date.now(), date: start.toISOString(), type, title, durationSec: min * 60, rpe: rpe || undefined, source: SAMPLE_TAG };
    if (km) {
      w.distanceM = km * 1000;
      const secPerM = (min * 60) / w.distanceM;
      const r = Math.min(1400, (km * 1000) / (2 * Math.PI * 1.15));
      const laps = Math.max(1, Math.round((km * 1000) / (2 * Math.PI * r * 1.15)));
      let pts: RoutePoint[] = [];
      for (let l = 0; l < laps; l++) { const seg = loop(type === 'cycle' ? C2 : C, r, 70, pts.length ? pts[pts.length - 1].t : start.getTime(), secPerM, i * 0.3); pts = pts.concat(l ? seg.slice(1) : seg); }
      // keep the demo consistent: distance = the drawn route, and its clock spans exactly the workout duration
      let len = 0; for (let k = 1; k < pts.length; k++) len += haversine(pts[k - 1], pts[k]);
      const t0 = pts[0].t, span = pts[pts.length - 1].t - t0 || 1;
      pts = pts.map((q) => ({ ...q, t: Math.round(t0 + ((q.t - t0) / span) * min * 60000) }));
      w.distanceM = Math.round(len);
      routes.push({ id: `${id}-r`, updatedAt: Date.now(), workoutId: id, segments: [pts] });
      w.routeId = `${id}-r`;
      w.elevGainM = Math.round(18 * laps);
      w.splits = splitsFromTrack([pts], 1609.344);
      if (type === 'run' || type === 'walk') {
        const cad = type === 'run' ? 164 + (i % 4) * 2 : 110 + (i % 3) * 3; // demo cadence, steps/min
        w.steps = Math.round(cad * min); w.cadence = cad; w.stepsSource = 'sensor';
      }
    }
    if (type === 'calisthenics') w.exercises = [
      { exId: 'push-up', name: 'Push-up', sets: [15, 14, 12, 12].map((r) => ({ reps: r + Math.floor((27 + off) / 7), done: true })) },
      { exId: 'pull-up', name: 'Pull-up', sets: [8, 7, 6].map((r) => ({ reps: r + Math.floor((27 + off) / 9), done: true })) },
      { exId: 'air-squat', name: 'Air squat', sets: [20, 20, 20].map((r) => ({ reps: r, done: true })) },
      { exId: 'plank', name: 'Plank', sets: [60, 60].map((s) => ({ timeSec: s + (27 + off) * 2, done: true })) },
    ];
    if (type === 'strength') w.exercises = title.startsWith('Lower') ? [
      { exId: 'back-squat', name: 'Back squat', sets: [1, 2, 3, 4].map(() => ({ reps: 5, weightKg: 100 + Math.round((27 + off) / 7) * 5, done: true })) },
      { exId: 'rdl', name: 'Romanian deadlift', sets: [1, 2, 3].map(() => ({ reps: 8, weightKg: 80 + Math.round((27 + off) / 7) * 2.5, done: true })) },
    ] : [
      { exId: 'bench', name: 'Bench press', sets: [1, 2, 3, 4].map(() => ({ reps: 6, weightKg: 80 + Math.round((27 + off) / 7) * 2.5, done: true })) },
      { exId: 'pull-up', name: 'Pull-up', sets: [1, 2, 3, 4].map(() => ({ reps: 8, weightKg: 5, done: true })) },
    ];
    if (type === 'hyrox' || type === 'hybrid') w.exercises = [
      { exId: 'wall-ball', name: 'Wall balls', sets: [25, 25, 25, 25].map((r) => ({ reps: r, weightKg: 6, done: true })) },
      { exId: 'sb-lunge', name: 'Sandbag lunges', sets: [1, 2].map(() => ({ distanceM: 50, weightKg: 20, done: true })) },
      { exId: 'run-intervals', name: 'Run intervals', sets: [1, 2, 3, 4].map(() => ({ distanceM: 1000, timeSec: 285, done: true })) },
    ];
    w.kcal = estKcal(w, weightKg);
    workouts.push(w);
  });
  // A full HYROX simulation
  const simSplits = [292, 318, 205, 248, 301, 229, 322, 268, 312, 101, 309, 204, 318, 275, 334, 412].map((sec, k) => ({ label: k % 2 === 0 ? `Run ${k / 2 + 1}` : ['SkiErg', 'Sled Push', 'Sled Pull', 'Burpee Broad Jumps', 'Rowing', 'Farmers Carry', 'Sandbag Lunges', 'Wall Balls'][(k - 1) / 2], sec }));
  const simDay = addDays(today, -10);
  workouts.push({ id: `${SAMPLE_TAG}-sim`, updatedAt: Date.now(), date: new Date(`${simDay}T09:00:00`).toISOString(), type: 'hyrox', title: 'HYROX Simulation', durationSec: simSplits.reduce((a, s) => a + s.sec, 0), rpe: 9, splits: simSplits, source: 'hyrox-sim', kcal: estKcal({ type: 'hyrox', durationSec: 4448, rpe: 9 }, weightKg) });

  type R = { id: string; name: string; perServing: { kcal: number; protein: number; carbs: number; fat: number } };
  const R = recipes as unknown as R[];
  const pick = (id: string) => R.find((r) => r.id === id)!;
  const menu: [FoodEntry['meal'], string][][] = [
    [['breakfast', 'pre-oats'], ['lunch', 'post-chicken-bowl'], ['snacks', 'protein-yogurt'], ['dinner', 'post-salmon']],
    [['breakfast', 'protein-overnight-oats'], ['lunch', 'post-burrito'], ['snacks', 'drink-choc-milk'], ['dinner', 'budget-lentil-curry']],
    [['breakfast', 'post-eggs'], ['lunch', 'post-tuna-pasta'], ['snacks', 'drink-recovery-shake'], ['dinner', 'budget-fried-rice']],
  ];
  for (let off = -6; off <= 0; off++) {
    const day = addDays(today, off);
    const m = menu[(off + 6) % 3];
    m.forEach(([meal, rid], k) => {
      if (off === 0 && k > 1) return;
      const r = pick(rid);
      foods.push({ id: `${SAMPLE_TAG}-f${off}-${k}`, updatedAt: Date.now(), date: day, meal, name: r.name, servings: 1, ...r.perServing, source: 'recipe', ref: r.id });
    });
    water.push({ id: day, updatedAt: Date.now(), sample: true, date: day, ml: off === 0 ? 1500 : 2500 + ((off * 137) % 600) });
  }
  for (let off = -27; off <= 0; off += 3) body.push({ id: `${SAMPLE_TAG}-b${off}`, updatedAt: Date.now(), date: addDays(today, off), weightKg: +(weightKg + 1.2 + off * 0.045 + Math.sin(off) * 0.25).toFixed(1) });
  // Daily steps: most past days typed in as the phone's full-day total ("set"); today adds a little on top of the recorded run
  const steps: StepDay[] = [];
  for (let off = -29; off <= 0; off++) {
    const day = addDays(today, off);
    const act = workouts.filter((w) => w.steps && dayKeyOf(w.date) === day).reduce((a, w) => a + (w.steps || 0), 0);
    if (off === 0) { steps.push({ id: `${SAMPLE_TAG}-steps-${day}`, updatedAt: Date.now(), date: day, steps: 3150, mode: 'add', sample: true }); continue; }
    if (off % 9 === -4) continue; // a few days with nothing logged
    const base = 6200 + (Math.abs(off * 7919) % 5) * 1100 + (Math.abs(off * 31) % 3) * 450 + (off === -12 ? 5400 : 0);
    steps.push({ id: `${SAMPLE_TAG}-steps-${day}`, updatedAt: Date.now(), date: day, steps: Math.max(base, act + 2400), mode: 'set', sample: true });
  }
  // A couple of activities HYBRD didn't record, added by hand on the Burn page (MET estimates)
  const burns: BurnEntry[] = [
    { id: `${SAMPLE_TAG}-burn-yoga`, updatedAt: Date.now(), sample: true, date: addDays(today, -2), activity: 'yoga', label: 'Yoga', minutes: 45, met: 2.5, kcal: Math.round(2.5 * weightKg * 0.75), method: 'met' },
    { id: `${SAMPLE_TAG}-burn-swim`, updatedAt: Date.now(), sample: true, date: addDays(today, -5), activity: 'swim', label: 'Swimming', minutes: 30, met: 5.8, kcal: Math.round(5.8 * weightKg * 0.5), method: 'met' },
  ];
  // Two weeks of Fuel › Sleep log nights (morning-dated), a few with late caffeine / alcohol / a late meal
  const sleeps: SleepLog[] = [];
  for (let off = -13; off <= 0; off++) {
    if (off === -9) continue; // one night not logged
    const k = Math.abs(off * 7);
    const caffeineLate = off === -11 || off === -6 || off === -2, alcohol = off === -8 || off === -1, lateMeal = off === -6 || off === -4;
    const hours = +(7.6 - (caffeineLate ? 0.9 : 0) - (alcohol ? 0.6 : 0) - (lateMeal ? 0.3 : 0) + ((k % 5) - 2) * 0.15).toFixed(1);
    const quality = Math.max(1, Math.min(5, 4 - (caffeineLate ? 1 : 0) - (alcohol ? 1 : 0) + (k % 3 === 0 ? 1 : 0))) as SleepLog['quality'];
    sleeps.push({ id: `${SAMPLE_TAG}-sleep-${off}`, updatedAt: Date.now(), date: addDays(today, off), bed: '22:45', wake: '06:30', hours, quality, caffeineLate, alcohol, lateMeal, snack: off % 2 ? 'Kiwi & Greek yogurt' : undefined });
  }
  // Mind & Recovery: ~3 weeks of daily check-ins (today left open so the 20-second check-in is the first thing to try),
  // a few journal entries, breathing / routine sessions, 3 days of the Discipline program and three weekly HYBRD Pulse check-ins.
  const checkins: CheckIn[] = [];
  const cl = (x: number) => Math.max(1, Math.min(5, Math.round(x))) as Scale5;
  for (let off = -20; off <= -1; off++) {
    if (off === -16 || off === -9) continue;
    const date = addDays(today, off), k = Math.abs(off * 13);
    const sl = sleeps.find((x) => x.date === date);
    const hard = hardYesterday(workouts, date);
    const stressy = off === -12 || off === -11 || off === -4;
    const base = { mood: cl(4 - (stressy ? 1 : 0) + ((k % 4) === 0 ? -1 : 0)), stress: cl(2 + (stressy ? 2 : 0) + (k % 3 === 0 ? 1 : 0)), energy: cl(4 - (hard ? 1 : 0) - (sl && sl.hours < 7 ? 1 : 0) + (k % 5 === 0 ? 1 : 0)),
      motivation: cl(4 - (stressy ? 1 : 0) + (k % 7 === 0 ? 1 : 0)), soreness: cl(2 + (hard ? 2 : 0) - (k % 4 === 1 ? 1 : 0)), sleepQ: cl(sl ? sl.quality : 3) };
    const hrv = off >= -14 ? Math.round(64 - (hard ? 7 : 0) - (stressy ? 5 : 0) + ((k % 5) - 2) * 2) : undefined;
    const rhr = off >= -14 ? Math.round(51 + (hard ? 2 : 0) + (stressy ? 2 : 0) + ((k % 3) - 1)) : undefined;
    const r = readiness({ ...base, sleepH: sl?.hours, hrv, rhr }, baselines(checkins, date), { hardYesterday: hard });
    checkins.push({ id: `${SAMPLE_TAG}-ci-${date}`, updatedAt: Date.now(), sample: true, date, ...base, ...(sl ? { sleepH: sl.hours, sleepFrom: 'log' as const } : {}), ...(hrv ? { hrv, rhr } : {}), pain: off === -7 ? 'niggle' : 'none', ill: false, flags: [], score: r.score, rec: r.rec, v: 1 });
  }
  const journal: JournalEntry[] = [
    { id: `${SAMPLE_TAG}-j1`, updatedAt: Date.now(), sample: true, date: addDays(today, -1), kind: 'win', prompt: 'What went well in training today?', text: 'Held the push-up sets unbroken for the first time. Slow and controlled on every rep.' },
    { id: `${SAMPLE_TAG}-j2`, updatedAt: Date.now(), sample: true, date: addDays(today, -3), kind: 'gratitude', prompt: 'Three good things that happened today, and why they happened.', text: '1. Intervals felt smooth — slept well. 2. Coffee with my sister. 3. Got outside at lunch.' },
    { id: `${SAMPLE_TAG}-j3`, updatedAt: Date.now(), sample: true, date: addDays(today, -6), kind: 'reflect', prompt: 'What was hard today, and how did you respond?', text: 'Stations felt heavy after a long work week. Used “strong and steady” on the wall balls and kept sets of 10.', program: 'discipline:3' },
    { id: `${SAMPLE_TAG}-j4`, updatedAt: Date.now(), sample: true, date: addDays(today, -11), kind: 'reflect', prompt: 'What’s on my mind right now?', text: 'Busy deadline week. Kept training short and easy, did the breathing at night.' },
  ];
  const ms = (off: number, kind: MindSession['kind'], ref: string, minutes: number, i: number): MindSession => ({ id: `${SAMPLE_TAG}-ms-${i}`, updatedAt: Date.now(), sample: true, date: addDays(today, off), kind, ref, minutes });
  const mindsessions: MindSession[] = [
    ms(-12, 'breathe', 'sigh', 5, 1), ms(-11, 'breathe', 'resonance', 10, 2), ms(-10, 'program', 'discipline:1', 6, 3), ms(-8, 'program', 'discipline:2', 6, 4), ms(-6, 'program', 'discipline:3', 5, 5),
    ms(-6, 'routine', 'post-run', 9, 6), ms(-4, 'breathe', 'sigh', 5, 7), ms(-2, 'routine', 'post-run', 9, 8), ms(-2, 'breathe', 'resonance', 10, 9), ms(-1, 'routine', 'upper', 8, 10),
  ];
  const screens: ScreenResult[] = [
    { id: `${SAMPLE_TAG}-scr-1`, updatedAt: Date.now(), sample: true, date: addDays(today, -17), v: 2, pulse: [2, 2, 3, 2, 3, 2], safety: 'no' },
    { id: `${SAMPLE_TAG}-scr-2`, updatedAt: Date.now(), sample: true, date: addDays(today, -10), v: 2, pulse: [3, 2, 3, 3, 3, 2], safety: 'no' },
    { id: `${SAMPLE_TAG}-scr-3`, updatedAt: Date.now(), sample: true, date: addDays(today, -3), v: 2, pulse: [3, 3, 3, 3, 4, 3], safety: 'no' },
  ];
  return { workouts, routes, foods, water, body, steps, burns, sleeps, checkins, journal, mindsessions, screens };
}
