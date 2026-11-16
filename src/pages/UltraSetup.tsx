import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import { fromW, toW, todayKey, wUnit, wu, KM_PER_MI } from '../lib/calc';
import { profilePaces } from '../lib/intensity';
import {
  BYU_YARD_OPTIONS, FIN_LABEL, PHASE_LABEL, REASON_SRC, REASON_TEXT, WEEKDAYS, YARD_EXPLAIN, addDaysK, buildPlan, canPlan, fmtByuDist, fmtByuEquals, fmtByuPace, lapPaceSec,
  loopDist, mondayOf, raceLabel, readiness, screen, type Finished, type RaceId, type UltraQuiz, type UltraSaved,
} from '../lib/ultra';
import { can } from '../lib/entitlements';
import { Page, Card, Banner, Disclaimer, Pill } from '../components/ui';
import { Icon } from '../components/Icon';
import { SrcPills } from '../components/SrcPills';
import { ByuUnitToggle, ByuYardTable, useByuUnit } from '../components/ByuUnits';
import { useToast } from '../lib/toast';
import type { Profile, Workout } from '../lib/types';

const STEPS = ['You & health', 'Running', 'Race', 'Your week', 'Readiness'];
const RACE_OPTS: { v: RaceId; label: string; hint: string }[] = [
  { v: 'byu', label: 'Backyard / last one standing', hint: '6.7 km every hour, on the hour' },
  { v: '50k', label: '50K', hint: '31 mi' }, { v: '50mi', label: '50 miles', hint: '80 km' },
  { v: '100k', label: '100K', hint: '62 mi' }, { v: '100mi', label: '100 miles', hint: '161 km' },
];
const FIN: Finished[] = ['none', '10k', 'half', 'marathon', '50k', '50mi', '100k', '100mi'];

/** Weekly km and longest run (last 28/30 days) from logged runs. */
export function recentRunning(ws: Workout[], today = todayKey()) {
  const from = addDaysK(today, -28);
  const runs = ws.filter((w) => !w.deleted && (w.type === 'run') && w.distanceM && w.date.slice(0, 10) >= from);
  const km = runs.reduce((a, w) => a + (w.distanceM || 0) / 1000, 0);
  const longest = runs.reduce((a, w) => Math.max(a, (w.distanceM || 0) / 1000), 0);
  return runs.length ? { weeklyKm: Math.round(km / 4), longestKm: Math.round(longest) } : null;
}
export function defaultUltraQuiz(p: Profile, ws: Workout[]): UltraQuiz {
  const pp = profilePaces(p);
  const rr = recentRunning(ws);
  const t = todayKey();
  const sat = addDaysK(mondayOf(t), 7 * 19 + 5);
  return {
    sex: p.sex, age: p.age, weightKg: p.weightKg, chestPain: false, heart: false, pregnant: false, injury: false, kidney: false, diabetesMeds: false, pastEmergency: false, edHistory: false, cleared: false,
    years: 2, weeklyKm: rr?.weeklyKm ?? 40, longestKm: rr?.longestKm ?? 20, finished: 'marathon', easyPaceSec: pp ? Math.round((pp.E[0] + pp.E[1]) / 2) : 390,
    race: 'byu', yards: 12, raceDate: sat, terrain: 'trail', vertM: 0, climate: 'mild', altitude: false, days: 5, longDay: 5, gut: 'none', lapMin: 50,
  };
}

export default function UltraSetup() {
  const { data, profile, setProfile } = useStore();
  const nav = useNavigate();
  const toast = useToast();
  const existing = profile.ultra;
  const imp = profile.units === 'imperial';
  const [byuU] = useByuUnit();
  const dU = imp ? 'mi' : 'km';
  const toU = (km: number) => (imp ? km / KM_PER_MI : km);
  const fromU = (v: number) => (imp ? v * KM_PER_MI : v);
  const eU = imp ? 'ft' : 'm';
  const wU = wu(profile);
  const [step, setStep] = useState(0);
  const [q, setQ] = useState<UltraQuiz>(() => existing?.quiz ? { ...existing.quiz, sex: profile.sex, age: profile.age, weightKg: profile.weightKg } : defaultUltraQuiz(profile, data.workouts));
  const up = (x: Partial<UltraQuiz>) => setQ((c) => ({ ...c, ...x }));
  const sc = screen(q);
  const today = todayKey();
  const rd = useMemo(() => readiness(q, today), [q, today]);
  const [pick, setPick] = useState<{ race: RaceId; yards?: number } | null>(null);
  const target = pick || (rd.status === 'bridge' && rd.recommend ? { race: rd.recommend, yards: rd.recommendYards } : { race: q.race, yards: q.yards });
  const offerable = rd.status !== 'too-soon' || (pick && pick.race === 'base');
  const plan = useMemo(() => (offerable && canPlan(q) ? buildPlan(q, today, target.race, target.yards ?? q.yards) : null), [q, today, target.race, target.yards, offerable]);
  const showSafety = step === 1 && sc.level !== 'ok';
  const canNext = step !== 0 || (q.age > 0 && q.weightKg > 30);
  const si = step === 0 ? 0 : step - 1; // step 1 is the safety interstitial
  const needsSafety = sc.level === 'stop' || (sc.level === 'doctor' && !q.cleared);
  // Safety first: if new answers rule a plan out, pause the saved plan.
  useEffect(() => {
    if (showSafety && sc.level === 'stop' && existing && existing.level !== 'stop') setProfile({ ultra: { ...existing, quiz: q, level: 'stop' } });
  }, [showSafety, sc.level]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = () => {
    if (!plan || !can('ultra.plan')) return;
    const s: UltraSaved = { version: 1, quiz: q, createdAt: today, target: target.race, yards: target.race === 'byu' ? target.yards ?? q.yards : undefined, level: sc.level, applyToFuel: existing?.applyToFuel ?? false, checks: existing?.checks || {}, fuel: existing?.fuel };
    setProfile({ ultra: s, sex: q.sex, age: q.age, weightKg: q.weightKg });
    toast(existing ? 'Ultra plan updated' : 'Your ultra plan is ready');
    nav('/train/ultra');
  };

  if (showSafety) {
    const stop = sc.level === 'stop';
    const reasons = stop ? sc.stop : sc.doctor;
    return (
      <Page title={stop ? 'Let’s not build an ultra plan yet' : 'Get your doctor’s OK first'} kicker="Ultra · Safety check" back="/train/ultra">
        <div className="wl-safety" data-testid={stop ? 'ultra-safety' : 'ultra-doctor'}>
          <div className="wl-safety-ic"><Icon name="heart" size={30} /></div>
          {reasons.map((r) => <Card key={r}><p style={{ margin: 0 }}>{REASON_TEXT[r]}</p>{REASON_SRC[r] && <SrcPills ids={REASON_SRC[r]!} />}</Card>)}
          <Card>
            <h3 style={{ marginBottom: 8 }}>Who can help</h3>
            <ul className="cues">
              <li>Your doctor (GP / primary care) or a sports-medicine doctor: they can check your heart, kidneys and medicines and clear you for long-distance training.</li>
              <li>A physio for injuries, a sports dietitian for fuelling and REDs, and your obstetric provider in pregnancy.</li>
              <li>Chest pain, fainting or a racing heartbeat right now? Stop and call your local emergency number.</li>
            </ul>
          </Card>
          {stop ? <Banner tone="warn">HYBRD won’t build an ultra or backyard plan in this case{existing ? ', and your saved ultra plan has been paused' : ''}. You can still use HYBRD’s other running programs, the timers and Fuel as normal.</Banner>
            : <label className="toggle" style={{ cursor: 'pointer' }}><span><b>My doctor has cleared me for ultra-distance training</b><div className="muted small">Required to continue</div></span><input type="checkbox" data-testid="ultra-cleared" checked={q.cleared} onChange={(e) => up({ cleared: e.target.checked })} style={{ width: 24, height: 24, accentColor: '#FFE600' }} /></label>}
          <div className="wl-foot">
            <button className="btn" onClick={() => setStep(0)}>Back</button>
            {stop ? <Link className="btn y block" to="/train?tab=programs">Browse programs</Link>
              : <button className="btn y block" disabled={!q.cleared} onClick={() => setStep(2)}>Continue</button>}
          </div>
          <Disclaimer />
        </div>
      </Page>
    );
  }

  const chip = <T extends string | number>(cur: T, v: T, label: string, set: (v: T) => void, hint?: string, tid?: string) => <button key={String(v)} data-testid={tid} className={`chip ${cur === v ? 'on' : ''}`} onClick={() => set(v)}>{label}{hint && <div className="small" style={{ fontWeight: 500, opacity: .75 }}>{hint}</div>}</button>;
  const tog = (key: keyof UltraQuiz, label: string, sub?: string) => <label className="toggle" style={{ cursor: 'pointer' }} key={key}><span><b>{label}</b>{sub && <div className="muted small">{sub}</div>}</span><input type="checkbox" checked={!!q[key]} onChange={(e) => up({ [key]: e.target.checked } as Partial<UltraQuiz>)} style={{ width: 22, height: 22, accentColor: '#FFE600' }} /></label>;
  const num = (label: string, value: number, set: (v: number) => void, unit?: string, tid?: string) => <label className="field"><span>{label}{unit ? ` (${unit})` : ''}</span><input inputMode="decimal" data-testid={tid} value={Number.isFinite(value) ? Math.round(value * 10) / 10 : ''} onChange={(e) => set(+e.target.value || 0)} /></label>;
  const paceMin = Math.floor((imp ? q.easyPaceSec * KM_PER_MI : q.easyPaceSec) / 60), paceS = Math.round((imp ? q.easyPaceSec * KM_PER_MI : q.easyPaceSec) % 60);
  const setPace = (m: number, s: number) => up({ easyPaceSec: (m * 60 + s) / (imp ? KM_PER_MI : 1) });
  const statusTone = rd.status === 'ready' ? 'ok' : rd.status === 'stretch' ? 'yellow' : 'warn';
  const statusText = { ready: 'Ready to train for it', stretch: 'Doable, with care', bridge: 'Build a bridge first', 'too-soon': 'Too soon' }[rd.status];

  return (
    <Page title="Your ultra plan" kicker={`Ultra · Step ${si + 1} of ${STEPS.length} · ${STEPS[si]}`} back="/train/ultra">
      <div className="wl-quiz" data-testid="ultra-quiz">
        <div className="onb-dots wl-dots">{STEPS.map((s, i) => <span key={s} className={i <= si ? 'on' : ''} />)}</div>

        {step === 0 && <Card>
          <h2 className="wl-q">About you</h2>
          <div className="field"><span>Sex</span><div className="chips">{(['female', 'male'] as const).map((x) => chip(q.sex, x, x === 'male' ? 'Male' : 'Female', (v) => up({ sex: v, ...(v === 'male' ? { pregnant: false } : {}) })))}</div></div>
          <div className="grid2">
            {num('Age', q.age, (v) => up({ age: Math.round(v) }), undefined, 'ultra-age')}
            <label className="field"><span>Weight ({wUnit(wU)})</span><input inputMode="decimal" value={q.weightKg ? Math.round(toW(q.weightKg, wU) * 10) / 10 : ''} onChange={(e) => up({ weightKg: fromW(+e.target.value || 0, wU) })} /></label>
          </div>
          <h3 style={{ margin: '14px 0 4px' }}>Health check</h3>
          <p className="muted small" style={{ marginTop: 0 }}>Ultras are hard on the heart, kidneys and muscles. Answer honestly. This only decides what HYBRD offers you.</p>
          {tog('chestPain', 'Chest pain, fainting, a racing heartbeat or unusual breathlessness when you exercise')}
          {tog('heart', 'Diagnosed heart condition')}
          {q.sex === 'female' && tog('pregnant', 'Pregnant')}
          {tog('injury', 'A current injury or pain that changes how you run')}
          {tog('kidney', 'Kidney disease')}
          {tog('diabetesMeds', 'Diabetes treated with insulin or sulfonylureas')}
          {tog('pastEmergency', 'Past heat stroke, hyponatremia, rhabdomyolysis or kidney injury')}
          {tog('edHistory', 'Past or current eating disorder')}
        </Card>}

        {step === 2 && <Card>
          <h2 className="wl-q">Your running</h2>
          <div className="field"><span>Years of regular running</span><div className="chips">{[0.5, 1, 2, 3, 5].map((y) => chip(q.years, y, y < 1 ? '< 1' : y === 5 ? '5+' : String(y), (v) => up({ years: v })))}</div></div>
          <div className="grid2">
            {num('Weekly distance, last 4 weeks', toU(q.weeklyKm), (v) => up({ weeklyKm: fromU(v) }), dU, 'ultra-weekly')}
            {num('Longest run, last 30 days', toU(q.longestKm), (v) => up({ longestKm: fromU(v) }), dU, 'ultra-longest')}
          </div>
          {recentRunning(data.workouts) && <p className="muted small" style={{ marginTop: -4 }}>Pre-filled from your logged runs. Change them if they’re off.</p>}
          <div className="field"><span>Longest race you’ve finished</span><select value={q.finished} onChange={(e) => up({ finished: e.target.value as Finished })}>{FIN.map((f) => <option key={f} value={f}>{FIN_LABEL[f]}</option>)}</select></div>
          <div className="field"><span>Easy pace (per {dU})</span><div className="grid2">
            <input inputMode="numeric" aria-label="Easy pace minutes" value={paceMin} onChange={(e) => setPace(+e.target.value || 0, paceS)} />
            <input inputMode="numeric" aria-label="Easy pace seconds" value={paceS} onChange={(e) => setPace(paceMin, Math.min(59, +e.target.value || 0))} />
          </div><div className="muted small" style={{ marginTop: 4 }}>min : sec · {profile.runRef ? 'from your race paces (Expert targets)' : 'conversation pace'} · used to estimate time on feet</div></div>
        </Card>}

        {step === 3 && <Card>
          <h2 className="wl-q">Your race</h2>
          <div className="wl-opts">{RACE_OPTS.map((r) => chip(q.race, r.v, r.label, (v) => { setPick(null); up({ race: v }); }, r.hint, `ultra-race-${r.v}`))}</div>
          {q.race === 'byu' && <>
            <div className="byu-head-units" style={{ marginTop: 12 }}><span className="muted small">{YARD_EXPLAIN} of {loopDist(byuU)}.</span><ByuUnitToggle /></div>
            <div className="field" style={{ marginTop: 12 }}><span>Target yards (hours)</span><div className="chips">{BYU_YARD_OPTIONS.map((y) => chip(q.yards, y, `${y}`, (v) => up({ yards: v }), fmtByuDist(y, byuU), `ultra-yards-${y}`))}</div></div>
            <div className="field"><span>Target yard time</span><div className="chips">{[45, 48, 50, 52, 55].map((m) => chip(q.lapMin, m, `${m} min`, (v) => up({ lapMin: v }), fmtByuPace(lapPaceSec(m), byuU)))}</div></div>
            <p className="muted small" style={{ margin: 0 }} data-testid="byu-setup-equals">{fmtByuEquals(q.yards)}. Each yard starts on the hour. Most runners plan 45–55 min yards. Beating the bell means at least {fmtByuPace(lapPaceSec(60), byuU)}.</p>
            <div style={{ marginTop: 12 }}><ByuYardTable highlight={q.yards} /></div>
          </>}
          <div className="grid2" style={{ marginTop: 12 }}>
            <label className="field"><span>Race date</span><input type="date" data-testid="ultra-date" value={q.raceDate} onChange={(e) => e.target.value && up({ raceDate: e.target.value })} /></label>
            {num(q.race === 'byu' ? 'Climb for the whole race' : 'Total elevation gain', imp ? q.vertM * 3.28084 : q.vertM, (v) => up({ vertM: imp ? v / 3.28084 : v }), eU)}
          </div>
          <div className="field"><span>Terrain</span><div className="chips">{chip(q.terrain, 'road', 'Road / track', (v) => up({ terrain: v }))}{chip(q.terrain, 'trail', 'Trail', (v) => up({ terrain: v }))}{chip(q.terrain, 'mountain', 'Mountain', (v) => up({ terrain: v }))}</div></div>
          <div className="field"><span>Expected weather</span><div className="chips">{chip(q.climate, 'cool', 'Cool', (v) => up({ climate: v }))}{chip(q.climate, 'mild', 'Mild', (v) => up({ climate: v }))}{chip(q.climate, 'hot', 'Hot (> 25 °C / 77 °F)', (v) => up({ climate: v }))}</div></div>
          {tog('altitude', 'Race goes above ~2,500 m (8,200 ft)')}
        </Card>}

        {step === 4 && <Card>
          <h2 className="wl-q">Your week</h2>
          <div className="field"><span>Days you can run</span><div className="chips">{[4, 5, 6, 7].map((d) => chip(q.days, d, `${d} days`, (v) => up({ days: v })))}</div></div>
          <div className="field"><span>Long-run day</span><div className="chips">{WEEKDAYS.map((d, i) => chip(q.longDay, i, d, (v) => up({ longDay: v })))}</div></div>
          <div className="field"><span>Eating on the run today</span><div className="wl-opts">{chip(q.gut, 'none', 'Rarely or never', (v) => up({ gut: v }), 'Gut training starts at 30 g/h')}{chip(q.gut, 'some', 'Gels or food on long runs', (v) => up({ gut: v }), 'About 30–50 g/h')}{chip(q.gut, 'trained', 'Practised 60+ g/h', (v) => up({ gut: v }), 'Gut-trained')}</div></div>
          <p className="muted small" style={{ margin: 0 }}>The long run and back-to-back go on your long-run day and the day after. The quality session is mid-week, and strength never comes the day before a long run.</p>
        </Card>}

        {step === 5 && <>
          <Card className="wl-hero">
            <div className="kicker">Readiness</div>
            <div className="row wrap" style={{ gap: 8, alignItems: 'center' }}><h2 className="fast-h" style={{ margin: 0 }} data-testid="ultra-status">{statusText}</h2><Pill tone={statusTone === 'ok' ? undefined : 'yellow'}>{raceLabel(q.race, q.yards)} · {rd.weeks > 0 ? `${rd.weeks} wk` : 'past date'}</Pill></div>
            {rd.missing.length > 0 && <><p className="small" style={{ margin: '10px 0 4px' }}><b>Prerequisites still missing</b> (HYBRD coaching guideline, not an official standard):</p><ul className="cues tight">{rd.missing.map((m) => <li key={m.key}>{m.text}</li>)}</ul></>}
            {rd.notes.map((n) => <Banner key={n} tone={statusTone === 'ok' ? 'info' : 'warn'}>{n}</Banner>)}
            {(rd.status === 'bridge' || rd.status === 'too-soon') && <div className="field" style={{ marginTop: 10 }}><span>Plan to build</span><div className="wl-opts">
              {rd.recommend && chip(`${target.race}${target.yards ?? ''}`, `${rd.recommend}${rd.recommendYards ?? ''}`, `${raceLabel(rd.recommend, rd.recommendYards)} ★`, () => setPick({ race: rd.recommend!, yards: rd.recommendYards }), rd.recommend === 'base' ? '8–12 weeks of base' : 'Recommended bridge', 'ultra-pick-rec')}
              {rd.recommend !== 'base' && chip(`${target.race}${target.yards ?? ''}`, 'base', 'Ultra Base Builder', () => setPick({ race: 'base' }), 'Volume + long runs first')}
            </div>{rd.status === 'too-soon' && rd.earliestDate && <p className="muted small" style={{ margin: '8px 0 0' }}>Or go back and pick a race on or after {rd.earliestDate}.</p>}</div>}
          </Card>
          {plan && <Card>
            <div className="card-head"><div><div className="kicker">Your plan</div><h3 data-testid="ultra-plan-name">{plan.spec.name} · {plan.weeks.length} weeks</h3></div></div>
            <div className="ultra-phasebar">{plan.weeks.map((w) => <span key={w.i} className={`p-${w.phase} ${w.cut ? 'cut' : ''}`} title={`Week ${w.i + 1}: ${PHASE_LABEL[w.phase]}`} />)}</div>
            <div className="grid3" style={{ marginTop: 12 }}>
              <div className="stat accent"><div className="stat-v">{Math.round(toU(plan.weeks[0].km))}<small> {dU}</small></div><div className="stat-l">week 1</div></div>
              <div className="stat"><div className="stat-v">{Math.round(toU(plan.peakKm))}<small> {dU}</small></div><div className="stat-l">peak week</div></div>
              <div className="stat"><div className="stat-v">{Math.round(toU(Math.max(...plan.weeks.map((w) => w.longKm))))}<small> {dU}</small></div><div className="stat-l">longest run</div></div>
            </div>
            <ul className="cues" style={{ marginTop: 12 }}>
              <li>Starts {plan.startDate} from what you run now. Each week rises at most +10%, and every long run is at most +10% on your longest of the last 30 days.</li>
              <li>A cut-back week every {plan.cycle === 3 ? '3rd' : '4th'} week{plan.cycle === 3 ? ' (newer runners and 50+ recover better with more frequent breaks)' : ''}{plan.spec.taperWeeks ? `, and a ${plan.weeks.filter((w) => w.phase === 'taper').length}-week taper` : ''}.</li>
              <li>About 80% easy running, one quality session, 1–2 strength sessions{plan.spec.b2b ? ', and back-to-back long days' : ''}{target.race === 'byu' ? ', on-the-hour backyard simulations and night yards' : ''}.</li>
            </ul>
          </Card>}
          {!plan && rd.status === 'too-soon' && <Banner tone="warn">Pick the Ultra Base Builder above, or a later race date, to get a plan.</Banner>}
          {sc.level === 'doctor' && <Banner tone="warn"><Pill tone="yellow">Doctor-cleared</Pill> You’ve said your doctor cleared you. Stop and get checked if anything in Prep › Warning signs shows up.</Banner>}
        </>}

        <div className="wl-foot">
          {step > 0 ? <button className="btn" onClick={() => setStep(step === 2 ? 0 : step - 1)}>Back</button> : <Link className="btn" to="/train/ultra">Cancel</Link>}
          {step < 5
            ? <button className="btn y block" data-testid="ultra-next" disabled={!canNext} onClick={() => setStep(step === 0 ? (needsSafety ? 1 : 2) : step + 1)}>Continue</button>
            : <button className="btn y block" data-testid="ultra-save" disabled={!plan} onClick={save}>{existing ? 'Update my plan' : 'Save my plan'}</button>}
        </div>
        <Disclaimer />
      </div>
    </Page>
  );
}
