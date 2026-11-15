import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import { ACTIVITY_LEVELS, computeTargets, fromW, toW, wu, wUnit, localeUnits } from '../lib/calc';
import type { Discipline, Goal, Profile, Sex, Units } from '../lib/types';
import { Icon } from '../components/Icon';
import { useAuth } from '../lib/auth';
import { buildSample } from '../lib/sample';
import { demoCenter } from '../lib/location';

const DISC: { v: Discipline; label: string }[] = [
  { v: 'calisthenics', label: 'Calisthenics' }, { v: 'strength', label: 'Strength' }, { v: 'running', label: 'Running' }, { v: 'walking', label: 'Walking' },
  { v: 'cycling', label: 'Cycling' }, { v: 'cardio', label: 'Cardio / HIIT' }, { v: 'hyrox', label: 'HYROX' }, { v: 'hybrid', label: 'Hybrid' },
];

export default function Onboarding() {
  const { profile, setProfile, importJson } = useStore();
  const { configured } = useAuth();
  const [step, setStep] = useState(0);
  const [p, setP] = useState<Profile>(profile);
  const u = p.units;
  const up = (x: Partial<Profile>) => setP((c) => ({ ...c, ...x }));
  const t = computeTargets(p);
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const finish = async (sample = false) => {
    if (sample) {
      // Demo routes are drawn around the user's own area (quick location check, else last known / time-zone guess)
      setBusy(true);
      const c = await demoCenter();
      importJson({ app: 'HYBRD', data: buildSample(p.weightKg, c) }, 'merge');
    }
    setProfile({ ...p, onboarded: true });
    // First run with no plan: offer HYBRD Coach (skippable). Sample-data explorers land on Home.
    if (!sample) nav('/coach?welcome=1', { replace: true });
  };
  const ftIn = { ft: Math.floor(p.heightCm / 2.54 / 12), inch: Math.round((p.heightCm / 2.54) % 12) };
  const steps = 5;

  if (step === 0) return (
    <div className="onb">
      <div className="brand"><span className="brand-mark">H</span>HYBRD</div>
      <div className="onb-hero">
        <div className="kicker">Train · Track · Fuel</div>
        <h1>Built for<span className="y">hybrid</span>athletes.</h1>
        <div className="feature-list">
          <div><Icon name="bolt" />Hybrid Score — strength, engine, consistency, fuel</div>
          <div><Icon name="record" />GPS runs, walks & rides with splits and maps</div>
          <div><Icon name="flag" />HYROX race sim, programs & a 50-move library</div>
          <div><Icon name="timer" />Stopwatch, intervals, Tabata, EMOM & AMRAP</div>
          <div><Icon name="fuel" />Calorie counting with 7,283 USDA foods offline</div>
        </div>
        <p className="muted small">{configured ? 'Your data stays on this device until you sign in — then it syncs to your account.' : 'Local mode: everything is saved on this device. No account needed.'}</p>
      </div>
      <div className="stack">
        <button className="btn y big block" onClick={() => setStep(1)}>Get started</button>
        {configured && <Link className="btn block" to="/sign-in">I already have an account</Link>}
      </div>
    </div>
  );

  return (
    <div className="onb">
      <div className="onb-dots">{Array.from({ length: steps }, (_, i) => <span key={i} className={i < step ? 'on' : ''} />)}</div>
      <div style={{ flex: 1 }}>
        {step === 1 && <>
          <div className="kicker">Step 1 of {steps}</div><h1 style={{ marginBottom: 18 }}>Units & you</h1>
          <div className="field"><span>Distance units</span>
            <div className="unit-pick" role="radiogroup" aria-label="Distance units">{(['imperial', 'metric'] as Units[]).map((x) => <button key={x} role="radio" aria-checked={u === x} className={u === x ? 'on' : ''} onClick={() => up({ units: x, weightUnit: undefined })}><b>{x === 'imperial' ? 'Miles' : 'Kilometres'}</b><span>{x === 'imperial' ? 'mi · ft · mph · lb' : 'km · m · km/h · kg'}</span></button>)}</div>
            <div className="muted small" style={{ marginTop: 6 }}>{localeUnits() === u ? 'Picked from your device’s region. ' : ''}Change any time with the mi | km switch on Record or in Me › Units.</div>
          </div>
          <div className="field"><span>Weight units</span><div className="chips">{(['lb', 'kg'] as const).map((x) => <button key={x} className={`chip ${wUnit(wu(p)) === x ? 'on' : ''}`} onClick={() => up({ weightUnit: x })}>{x === 'lb' ? 'Pounds (lb)' : 'Kilograms (kg)'}</button>)}</div></div>
          <label className="field"><span>First name</span><input value={p.name} onChange={(e) => up({ name: e.target.value })} placeholder="José" autoComplete="given-name" /></label>
          <div className="field"><span>Sex (for the calorie formula)</span><div className="chips">{(['male', 'female'] as Sex[]).map((x) => <button key={x} className={`chip ${p.sex === x ? 'on' : ''}`} onClick={() => up({ sex: x })}>{x === 'male' ? 'Male' : 'Female'}</button>)}</div></div>
        </>}
        {step === 2 && <>
          <div className="kicker">Step 2 of {steps}</div><h1 style={{ marginBottom: 18 }}>Body</h1>
          <label className="field"><span>Age</span><input inputMode="numeric" value={p.age || ''} onChange={(e) => up({ age: +e.target.value || 0 })} /></label>
          {u === 'imperial' ? (
            <div className="grid2">
              <label className="field"><span>Height ft</span><input inputMode="numeric" value={ftIn.ft} onChange={(e) => up({ heightCm: ((+e.target.value || 0) * 12 + ftIn.inch) * 2.54 })} /></label>
              <label className="field"><span>in</span><input inputMode="numeric" value={ftIn.inch} onChange={(e) => up({ heightCm: (ftIn.ft * 12 + (+e.target.value || 0)) * 2.54 })} /></label>
            </div>
          ) : <label className="field"><span>Height (cm)</span><input inputMode="numeric" value={Math.round(p.heightCm)} onChange={(e) => up({ heightCm: +e.target.value || 0 })} /></label>}
          <label className="field"><span>Weight ({wUnit(wu(p))})</span><input inputMode="decimal" value={Math.round(toW(p.weightKg, wu(p)))} onChange={(e) => up({ weightKg: fromW(+e.target.value || 0, wu(p)) })} /></label>
          <p className="muted small">Used only for estimates (calorie targets, calories burned). Stored on this device{configured ? ' and in your account when signed in' : ''}.</p>
        </>}
        {step === 3 && <>
          <div className="kicker">Step 3 of {steps}</div><h1 style={{ marginBottom: 18 }}>Activity & goal</h1>
          <div className="field"><span>Activity level</span><div className="stack">{ACTIVITY_LEVELS.map((a) => <button key={a.v} className={`chip ${p.activity === a.v ? 'on' : ''}`} style={{ width: '100%', textAlign: 'left' }} onClick={() => up({ activity: a.v })}><b>{a.label}</b> <span style={{ opacity: .7 }}>· {a.hint}</span></button>)}</div></div>
          <div className="field"><span>Goal</span><div className="chips">{([['lose', 'Lose fat'], ['maintain', 'Maintain / perform'], ['gain', 'Build muscle']] as [Goal, string][]).map(([v, l]) => <button key={v} className={`chip ${p.goal === v ? 'on' : ''}`} onClick={() => up({ goal: v })}>{l}</button>)}</div></div>
          <div className="field"><span>Training days per week</span><div className="chips">{[2, 3, 4, 5, 6, 7].map((n) => <button key={n} className={`chip ${p.weeklySessions === n ? 'on' : ''}`} onClick={() => up({ weeklySessions: n })}>{n}</button>)}</div></div>
        </>}
        {step === 4 && <>
          <div className="kicker">Step 4 of {steps}</div><h1 style={{ marginBottom: 18 }}>What do you train?</h1>
          <div className="chips">{DISC.map((d) => { const on = p.disciplines.includes(d.v); return <button key={d.v} className={`chip ${on ? 'on' : ''}`} onClick={() => up({ disciplines: on ? p.disciplines.filter((x) => x !== d.v) : [...p.disciplines, d.v] })}>{d.label}</button>; })}</div>
          {p.disciplines.includes('hyrox') && <div className="field" style={{ marginTop: 18 }}><span>HYROX division</span><div className="chips">{([['women-open', 'Women Open'], ['men-open', 'Men Open'], ['women-pro', 'Women Pro'], ['men-pro', 'Men Pro']] as const).map(([v, l]) => <button key={v} className={`chip ${p.hyroxDivision === v ? 'on' : ''}`} onClick={() => up({ hyroxDivision: v })}>{l}</button>)}</div></div>}
        </>}
        {step === 5 && <>
          <div className="kicker">Step 5 of {steps}</div><h1 style={{ marginBottom: 8 }}>Your daily targets</h1>
          <p className="muted small">Estimates from the Mifflin-St Jeor equation × your activity level, with protein from the ISSN range (1.4–2.0 g/kg). Adjust any time in Fuel › Calculator.</p>
          <div className="grid2" style={{ margin: '16px 0' }}>
            <div className="stat accent"><div className="stat-v">{t.kcal}</div><div className="stat-l">kcal / day (est.)</div></div>
            <div className="stat"><div className="stat-v">{t.protein}<small> g</small></div><div className="stat-l">protein</div></div>
            <div className="stat"><div className="stat-v">{t.carbs}<small> g</small></div><div className="stat-l">carbs</div></div>
            <div className="stat"><div className="stat-v">{t.fat}<small> g</small></div><div className="stat-l">fat</div></div>
            <div className="stat"><div className="stat-v">{(t.waterMl / 1000).toFixed(1)}<small> L</small></div><div className="stat-l">water from drinks</div></div>
            <div className="stat"><div className="stat-v">{t.tdee}</div><div className="stat-l">maintenance (TDEE)</div></div>
          </div>
          <p className="muted small">Not medical advice. If you have a health condition, are pregnant, or have a history of disordered eating, talk to a doctor or registered dietitian before changing how you eat.</p>
          <button className="btn block" disabled={busy} onClick={() => finish(true)}>{busy ? 'Building demo near you…' : 'Explore with sample data first'}</button>
          <p className="muted small" style={{ marginTop: 6 }}>Adds 4 weeks of clearly-marked demo workouts and meals, with demo routes drawn around your area (we may ask for location once). Remove them in Me › Data.</p>
        </>}
      </div>
      <div className="onb-foot">
        <button className="btn" onClick={() => setStep(step - 1)}>Back</button>
        {step < steps ? <button className="btn y block" onClick={() => setStep(step + 1)}>Continue</button> : <button className="btn y block" onClick={() => finish(false)}>Start training</button>}
      </div>
    </div>
  );
}
