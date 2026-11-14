// Quick checks for indoor-bike calorie math and labels. Run:
//   node --experimental-strip-types tools/test-indoor-bike.ts
import { indoorCycleMet, wattsKcal, estKcal, applyKcal, activityLabel, typeLabel, HR_KCAL_TYPES } from '../src/lib/calc.ts';
import type { Profile, Workout } from '../src/lib/types.ts';

let failed = 0;
const check = (name: string, cond: boolean, detail?: string) => {
  if (!cond) { failed++; console.error('FAIL', name, detail || ''); }
  else console.log('ok', name);
};

// METs from 2011 Compendium codes 02011, 02017, 02012, 02013, 02014
check('MET very light (RPE 2) = 3.5', indoorCycleMet(2) === 3.5);
check('MET light (RPE 4) = 4.8', indoorCycleMet(4) === 4.8);
check('MET moderate (RPE 5) = 6.8', indoorCycleMet(5) === 6.8);
check('MET vigorous (RPE 8) = 8.8', indoorCycleMet(8) === 8.8);
check('MET very vigorous (RPE 9) = 11', indoorCycleMet(9) === 11);
check('MET default (no RPE) = 6.8', indoorCycleMet() === 6.8);

// Watts: 150 W × 60 min. J = 150*3600 = 540000; mech kcal = 540000/4184 ≈ 129.06; /0.24 ≈ 537.76 → 538
check('150 W × 60 min ≈ 538 kcal', wattsKcal(150, 3600) === 538, String(wattsKcal(150, 3600)));
check('0 W or 0 s → 0', wattsKcal(0, 3600) === 0 && wattsKcal(200, 0) === 0);

const profile: Profile = {
  name: 'Test', sex: 'male', age: 30, heightCm: 178, weightKg: 80, activity: 1.55, goal: 'maintain',
  units: 'imperial', disciplines: ['cycling'], weeklySessions: 4, onboarded: true,
};
const w = (patch: Partial<Workout>): Workout => ({
  id: '1', updatedAt: 1, date: '2026-11-14T12:00:00', type: 'indoor-cycle', title: 'Indoor Bike',
  durationSec: 1800, rpe: 5, ...patch,
});

const met = applyKcal(w({}), profile);
check('no watts no HR → met', met.kcalMethod === 'met' && met.kcal === estKcal(w({}), 80), `${met.kcalMethod} ${met.kcal}`);
// 6.8 MET * 80 kg * 0.5 h = 272
check('moderate 30 min @ 80 kg = 272', met.kcal === 272, String(met.kcal));

const pwr = applyKcal(w({ avgWatts: 180 }), profile);
check('watts beat MET', pwr.kcalMethod === 'power' && pwr.kcal === wattsKcal(180, 1800), `${pwr.kcalMethod} ${pwr.kcal}`);

const dev = applyKcal(w({ avgWatts: 180 }), profile, 400);
check('device kcal beats watts', dev.kcalMethod === 'device' && dev.kcal === 400);

check('label indoor', activityLabel({ type: 'indoor-cycle', bikeKind: 'indoor' }) === 'Indoor Bike');
check('label stationary', activityLabel({ type: 'indoor-cycle', bikeKind: 'stationary' }) === 'Stationary Bike');
check('typeLabel indoor-cycle', typeLabel('indoor-cycle') === 'Indoor Bike');
check('typeLabel cycle still Ride', typeLabel('cycle') === 'Ride');
check('HR formula applies to indoor-cycle', HR_KCAL_TYPES.includes('indoor-cycle'));

if (failed) { console.error(`\n${failed} failed`); process.exit(1); }
console.log('\nAll indoor-bike calc checks passed.');
