// Checks for the Expert tier: VDOT paces, FTP targets, plan durations and program data. Run:
//   node --experimental-strip-types --import ./tools/ts-resolve.mjs tools/test-expert.ts
import { vdot, trainingPaces, fmtPaceKm, ftpText, stepSec, intensityText, predictSec } from '../src/lib/intensity.ts';

let failed = 0;
const check = (name: string, cond: boolean, detail?: string) => { if (!cond) { failed++; console.error('FAIL', name, detail || ''); } else console.log('ok', name); };
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

// Daniels' published table: VDOT 50 ≈ 5K 19:57; T ≈ 4:15/km, I ≈ 3:55/km, M ≈ 4:31/km
const v = vdot(5000, 19 * 60 + 57);
check('5K 19:57 → VDOT ≈ 50', near(v, 50, 0.3), v.toFixed(2));
const pp = trainingPaces(5000, 19 * 60 + 57)!;
check('T pace ≈ 4:15/km', near(pp.T, 255, 3), String(pp.T));
check('I pace ≈ 3:55/km', near(pp.I, 235, 3), String(pp.I));
check('M pace ≈ 4:31/km', near(pp.M, 271, 4), String(pp.M));
check('R = I − 15 s/km', near(pp.R, pp.I - 15, 0.01));
check('E range slower than M', pp.E[0] > pp.E[1] && pp.E[1] > pp.M);
check('order R < I < T < M', pp.R < pp.I && pp.I < pp.T && pp.T < pp.M);
check('mi formatting', fmtPaceKm(255, 'imperial') === '6:50 /mi', fmtPaceKm(255, 'imperial'));
check('km formatting', fmtPaceKm(255, 'metric') === '4:15 /km');
check('VDOT 50 marathon ≈ 3:10–3:11', near(predictSec(v, 42195), 3 * 3600 + 10 * 60 + 40, 90), String(predictSec(v, 42195)));
check('garbage race → null', trainingPaces(5000, 60) === null && trainingPaces(0, 1000) === null);

// Cycling
check('FTP 250 sweet spot → 220–235 W', ftpText([88, 94], 250) === '88–94% FTP · 220–235 W', ftpText([88, 94], 250));
check('no FTP → RPE', ftpText([106, 120]) === '106–120% FTP · RPE 8–9', ftpText([106, 120]));

// Plan step durations
const step = { label: 'Threshold', sec: 390, kind: 'work' as const, distM: 1600, pace: 'T' as const };
check('no race → default seconds', stepSec(step, {}) === 390);
check('with race → distance × T pace', stepSec(step, { runRef: { distM: 5000, sec: 1197 } }) === Math.round(1.6 * pp.T));
check('intensity text pace, no race', intensityText({ pace: 'I' }, { units: 'metric' }) === 'I pace · RPE 8–9');

// Program data
const { PROGRAMS, HYROX_STATIONS, HYROX_DIVISIONS } = await import('../src/data/programs.ts');
const { exById } = await import('../src/data/exercises.ts');
const experts = PROGRAMS.filter((p) => p.level === 'Expert');
check('5 expert programs', experts.length === 5, experts.map((p) => p.id).join(','));
for (const d of ['Calisthenics', 'Running', 'Cycling', 'HYROX', 'Hybrid']) check(`expert ${d} exists`, experts.some((p) => p.discipline === d));
check('base programs intact (10)', PROGRAMS.filter((p) => p.level !== 'Expert').length === 10);
for (const p of experts) {
  check(`${p.id} has prereqs + sources`, !!p.prereqs?.length && !!p.sources?.length);
  for (const s of p.sessions) {
    for (const b of s.blocks) if (!exById(b.exId)) check(`${p.id}/${s.id} exercise ${b.exId} exists`, false);
    if (s.plan) {
      check(`${p.id}/${s.id} plan valid`, s.plan.every((x) => x.sec > 0 && (x.kind === 'work' || x.kind === 'rest')) && s.plan.some((x) => x.kind === 'work'));
      const mins = s.plan.reduce((a, x) => a + x.sec, 0) / 60;
      check(`${p.id}/${s.id} plan ≈ session minutes (${mins.toFixed(0)} vs ${s.minutes})`, Math.abs(mins - s.minutes) <= s.minutes * 0.35);
    }
  }
}
// HYROX order + weights — 25/26 Singles rulebook
check('HYROX station order', HYROX_STATIONS.map((s) => s.exId).join(',') === 'skierg,sled-push,sled-pull,bbj,row,farmers,sb-lunge,wall-ball');
check('Men Pro loads', HYROX_DIVISIONS['men-pro'].sledPush === '202 kg' && HYROX_DIVISIONS['men-pro'].sledPull === '153 kg' && HYROX_DIVISIONS['men-pro'].farmers === '2 × 32 kg' && HYROX_DIVISIONS['men-pro'].lunges === '30 kg' && HYROX_DIVISIONS['men-pro'].wallBall.startsWith('9 kg'));
check('Women Open loads', HYROX_DIVISIONS['women-open'].sledPush === '102 kg' && HYROX_DIVISIONS['women-open'].sledPull === '78 kg' && HYROX_DIVISIONS['women-open'].farmers === '2 × 16 kg' && HYROX_DIVISIONS['women-open'].lunges === '10 kg' && HYROX_DIVISIONS['women-open'].wallBall.startsWith('4 kg'));
const sim = PROGRAMS.find((p) => p.id === 'hyrox-expert')!.sessions.find((s) => s.id === 'sim')!;
check('expert sim = 16 race blocks + HYROX timer', sim.blocks.length === 16 && sim.timer === 'hyrox');

if (failed) { console.error(`\n${failed} failed`); process.exit(1); }
console.log('\nall expert checks passed');
