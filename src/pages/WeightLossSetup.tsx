import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore, uid } from '../lib/store';
import { ACTIVITY_LEVELS, fromW, toW, todayKey, addDays, wUnit, wu } from '../lib/calc';
import { rangeBurn } from '../lib/burn';
import {
  ALLERGENS, DIETS, PACES, REASON_TEXT, activePlan, buildWeek, computeWL, defaultTrainDays, energyOf, screen, windowEnd, bmiOf,
  type Pace, type WLPlan, type WLQuiz, type TrainType, type Allergen, type EnergyInput,
} from '../lib/wl';
import { CATALOG } from '../data/planCatalog';
import { Page, Card, Banner, Disclaimer } from '../components/ui';
import { Icon } from '../components/Icon';
import { useToast } from '../lib/toast';

const TRAIN: { v: TrainType; label: string; hint: string }[] = [
  { v: 'none', label: 'Not training yet', hint: 'Walking, general activity' },
  { v: 'strength', label: 'Strength / calisthenics', hint: 'Lifting, bodyweight skills' },
  { v: 'endurance', label: 'Running / cycling', hint: 'Endurance focus' },
  { v: 'hybrid', label: 'HYROX / hybrid', hint: 'Strength + engine' },
];
const STEPS = ['You', 'Health', 'Goal', 'Training', 'Food', 'Review'];

export function trainOfProfile(d: string[]): TrainType {
  if (d.some((x) => x === 'hyrox' || x === 'hybrid')) return 'hybrid';
  const s = d.some((x) => x === 'strength' || x === 'calisthenics'), e = d.some((x) => x === 'running' || x === 'cycling');
  return s && e ? 'hybrid' : s ? 'strength' : e ? 'endurance' : 'none';
}

/** Burn tracker input: average ACTIVE kcal over the last 14 complete days, and how many of them had activity logged. */
export function useEnergyInput(): EnergyInput {
  const { data, profile } = useStore();
  return useMemo(() => {
    const r = rangeBurn(data, profile, addDays(todayKey(), -1), 14);
    return { trackedActive: Math.round(r.active / 14), trackedDays: r.days.filter((d) => d.active > 0).length };
  }, [data, profile]);
}

export default function WeightLossSetup() {
  const { data, profile, upsert, setProfile } = useStore();
  const nav = useNavigate();
  const toast = useToast();
  const existing = activePlan(data.wlplans);
  const wU = wu(profile);
  const energyIn = useEnergyInput();
  const [step, setStep] = useState(0);
  const [ack, setAck] = useState(false);
  const [q, setQ] = useState<WLQuiz>(() => existing?.quiz ? { ...existing.quiz, sex: profile.sex, age: profile.age, heightCm: profile.heightCm, weightKg: profile.weightKg } : {
    sex: profile.sex, age: profile.age, heightCm: profile.heightCm, weightKg: profile.weightKg, goalWeightKg: undefined, pace: 'moderate', health: {},
    activity: profile.activity, training: trainOfProfile(profile.disciplines || []), trainingDays: Math.min(7, profile.weeklySessions || 3),
    energy: 'auto', diet: 'omnivore', religious: 'none', exclude: [], meals: 4, window: null, budget: false, cookTime: 0,
  });
  const up = (x: Partial<WLQuiz>) => setQ((c) => ({ ...c, ...x }));
  const sc = screen(q);
  const en = energyOf(q, energyIn);
  const t = useMemo(() => computeWL(q, energyIn), [q, energyIn]);
  const ftIn = { ft: Math.floor(q.heightCm / 2.54 / 12), inch: Math.round((q.heightCm / 2.54) % 12) };
  const showSafety = step === 2 && sc.level !== 'ok';
  const canNext = step !== 0 || (q.age > 0 && q.heightCm > 100 && q.weightKg > 30);

  const build = () => {
    const trainDays = defaultTrainDays(q.trainingDays);
    const seed = Math.floor(Math.random() * 1e9);
    const quiz = { ...q, pace: (sc.paces.includes(q.pace) ? q.pace : sc.paces[0] || 'gentle') as Pace };
    const targets = computeWL(quiz, energyIn);
    const week = buildWeek(CATALOG, quiz, targets, seed, trainDays);
    const plan: Omit<WLPlan, 'updatedAt'> = {
      id: existing?.id || uid(), startDate: existing?.startDate || todayKey(), quiz, energy: energyIn, seed, trainDays,
      adjustKcal: 0, adjustments: [], breaks: existing?.breaks || [], targets, week, checked: [], applyToFuel: true, logged: existing?.logged || {},
    };
    upsert<WLPlan>('wlplans', plan);
    setProfile({ sex: q.sex, age: q.age, heightCm: q.heightCm, weightKg: q.weightKg, activity: q.activity, goal: targets.atMaintenance ? 'maintain' : 'lose' });
    toast(existing ? 'Plan updated' : 'Your plan is ready');
    nav('/fuel/weight-loss');
  };

  // ---------- safety screen ----------
  if (showSafety) {
    const stop = sc.level === 'stop';
    return (
      <Page title={stop ? 'Let’s pause here' : sc.level === 'maintain' ? 'No weight loss for now' : 'Check with your doctor'} kicker="Weight loss · Safety check" back="/fuel">
        <div className="wl-safety" data-testid="wl-safety">
          <div className="wl-safety-ic"><Icon name="heart" size={30} /></div>
          {sc.reasons.map((r) => <Card key={r}><p style={{ margin: 0 }}>{REASON_TEXT[r]}</p></Card>)}
          <Card>
            <h3 style={{ marginBottom: 8 }}>Who can help</h3>
            <ul className="cues">
              <li>Your doctor (GP / primary care) — they know your health history and medicines.</li>
              <li>A registered dietitian (RD / RDN) — they build eating plans for medical needs, pregnancy, teens and recovery.</li>
              {sc.reasons.includes('eating-disorder') && <li>If food or weight feels hard to control right now, an eating-disorder specialist or therapist can help. In an emergency, call your local emergency number.</li>}
            </ul>
          </Card>
          {stop && <Banner tone="warn">HYBRD won’t set a calorie-cutting target in this case. You can still browse the researched meals, log food without targets, and keep training.</Banner>}
          {sc.level === 'maintain' && <Banner tone="warn">Faster and moderate paces are off. HYBRD can build a balanced plan at maintenance calories instead.</Banner>}
          {sc.level === 'gentle' && <Banner tone="warn">Faster and moderate paces are turned off. Only the gentle pace (≈0.5% of body weight a week) is available.</Banner>}
          {!stop && <label className="toggle" style={{ cursor: 'pointer' }}><span><b>I’ll check with my doctor or dietitian</b><div className="muted small">Required to continue</div></span><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} style={{ width: 24, height: 24, accentColor: '#FFE600' }} /></label>}
          <div className="wl-foot">
            <button className="btn" onClick={() => setStep(1)}>Back</button>
            {stop ? <Link className="btn y block" to="/fuel?tab=recipes">Browse meals instead</Link>
              : <button className="btn y block" disabled={!ack} onClick={() => { if (!sc.paces.includes(q.pace)) up({ pace: sc.paces[0] || 'gentle' }); setStep(3); }}>{sc.level === 'maintain' ? 'Continue with a maintenance plan' : 'Continue with the gentle pace'}</button>}
          </div>
          <Disclaimer />
        </div>
      </Page>
    );
  }

  return (
    <Page title="Build your plan" kicker={`Weight loss · Step ${step + 1} of ${STEPS.length} · ${STEPS[step]}`} back="/fuel/weight-loss">
      <div className="wl-quiz" data-testid="wl-quiz">
        <div className="onb-dots wl-dots">{STEPS.map((s, i) => <span key={s} className={i <= step ? 'on' : ''} />)}</div>

        {step === 0 && <Card>
          <h2 className="wl-q">About you</h2>
          <div className="field"><span>Sex (for the calorie equation)</span><div className="chips">{(['female', 'male'] as const).map((x) => <button key={x} className={`chip ${q.sex === x ? 'on' : ''}`} onClick={() => up({ sex: x })}>{x === 'male' ? 'Male' : 'Female'}</button>)}</div></div>
          <div className="grid2">
            <label className="field"><span>Age</span><input inputMode="numeric" value={q.age || ''} onChange={(e) => up({ age: +e.target.value || 0 })} /></label>
            <label className="field"><span>Weight ({wUnit(wU)})</span><input inputMode="decimal" value={q.weightKg ? Math.round(toW(q.weightKg, wU) * 10) / 10 : ''} onChange={(e) => up({ weightKg: fromW(+e.target.value || 0, wU) })} /></label>
          </div>
          {profile.units === 'imperial' ? <div className="grid2">
            <label className="field"><span>Height ft</span><input inputMode="numeric" value={ftIn.ft} onChange={(e) => up({ heightCm: ((+e.target.value || 0) * 12 + ftIn.inch) * 2.54 })} /></label>
            <label className="field"><span>in</span><input inputMode="numeric" value={ftIn.inch} onChange={(e) => up({ heightCm: (ftIn.ft * 12 + (+e.target.value || 0)) * 2.54 })} /></label>
          </div> : <label className="field"><span>Height (cm)</span><input inputMode="numeric" value={Math.round(q.heightCm)} onChange={(e) => up({ heightCm: +e.target.value || 0 })} /></label>}
          <label className="field"><span>Goal weight ({wUnit(wU)}) · optional</span><input inputMode="decimal" placeholder="Leave empty to just set a pace" value={q.goalWeightKg ? Math.round(toW(q.goalWeightKg, wU) * 10) / 10 : ''} onChange={(e) => up({ goalWeightKg: +e.target.value ? fromW(+e.target.value, wU) : undefined })} /></label>
          <p className="muted small" style={{ margin: 0 }}>BMI {bmiOf(q.weightKg, q.heightCm).toFixed(1)} · the lowest goal HYBRD accepts is a BMI of 18.5 ({toW(sc.minGoalKg, wU).toFixed(1)} {wUnit(wU)}). BMI is a rough screen, not a verdict on your health.</p>
        </Card>}

        {step === 1 && <Card>
          <h2 className="wl-q">Health check</h2>
          <p className="muted small">Tick anything that applies. This keeps the plan safe — it stays on your device{data ? '' : ''}.</p>
          {([
            ...(q.sex === 'female' ? [['pregnant', 'I’m pregnant'], ['breastfeeding', 'I’m breastfeeding']] : []),
            ['eatingDisorder', 'I have or had an eating disorder'],
            ['diabetes', 'I have diabetes (type 1 or 2)'],
            ['medical', 'Another medical condition or medicine that affects weight or diet (e.g. heart, kidney, thyroid)'],
          ] as [keyof WLQuiz['health'], string][]).map(([k, l]) => (
            <button key={k} className="toggle" style={{ width: '100%', textAlign: 'left' }} onClick={() => up({ health: { ...q.health, [k]: !q.health[k] } })}><span><b>{l}</b></span><span className={`switch ${q.health[k] ? 'on' : ''}`} /></button>
          ))}
          {q.age > 0 && q.age < 18 && <Banner tone="warn">You entered an age under 18.</Banner>}
        </Card>}

        {step === 2 && <Card>
          <h2 className="wl-q">Pick your pace</h2>
          <div className="stack">{(Object.keys(PACES) as Pace[]).map((p) => {
            const ok = sc.paces.includes(p);
            const tp = computeWL({ ...q, pace: p }, energyIn);
            return <button key={p} disabled={!ok} className={`wl-pace ${q.pace === p ? 'on' : ''}`} onClick={() => up({ pace: p })}>
              <div className="row"><b>{PACES[p].label}</b><span className="spacer" /><span className="mono">{ok ? `${tp.kcal.toLocaleString()} kcal` : 'off'}</span></div>
              <div className="small">{PACES[p].hint}{ok ? ` · ≈ ${toW(tp.weeklyLossKg, wU).toFixed(1)} ${wUnit(wU)}/week (estimate)` : ''}</div>
            </button>;
          })}</div>
          <p className="muted small" style={{ marginBottom: 0 }}>Every pace stays at or below 1% of your body weight a week and never goes under {t.floor.toLocaleString()} kcal/day — the minimum without medical supervision. Slower loss keeps more muscle in people who train (Garthe 2011, Helms 2014).</p>
        </Card>}

        {step === 3 && <Card>
          <h2 className="wl-q">Activity & training</h2>
          <div className="field"><span>Daily activity (outside planned workouts too)</span><div className="stack">{ACTIVITY_LEVELS.map((a) => <button key={a.v} className={`chip ${q.activity === a.v ? 'on' : ''}`} style={{ width: '100%', textAlign: 'left' }} onClick={() => up({ activity: a.v })}><b>{a.label}</b> <span style={{ opacity: .7 }}>· {a.hint}</span></button>)}</div></div>
          <div className="field"><span>What do you train?</span><div className="wl-opts">{TRAIN.map((x) => <button key={x.v} className={`chip ${q.training === x.v ? 'on' : ''}`} onClick={() => up({ training: x.v })}><b>{x.label}</b><br /><span className="small" style={{ opacity: .75 }}>{x.hint}</span></button>)}</div></div>
          <div className="field"><span>Training days per week</span><div className="chips">{[0, 1, 2, 3, 4, 5, 6, 7].map((n) => <button key={n} className={`chip ${q.trainingDays === n ? 'on' : ''}`} onClick={() => up({ trainingDays: n })}>{n}</button>)}</div></div>
          <div className="field"><span>Estimate maintenance from</span>
            <div className="stack">
              <button className={`wl-pace ${q.energy === 'auto' && en.trackedTdee != null ? 'on' : ''}`} disabled={en.trackedTdee == null} onClick={() => up({ energy: 'auto' })}>
                <div className="row"><b>My tracked burn</b><span className="spacer" /><span className="mono">{en.trackedTdee != null ? `${en.trackedTdee.toLocaleString()} kcal` : 'not enough data'}</span></div>
                <div className="small">{en.trackedTdee != null ? `BMR × 1.2 + your average ${energyIn.trackedActive} active kcal/day from the Burn tracker (${energyIn.trackedDays}/14 days logged)` : `Needs activity logged on 7 of the last 14 days (you have ${energyIn.trackedDays || 0}).`}</div>
              </button>
              <button className={`wl-pace ${q.energy === 'questionnaire' || en.trackedTdee == null ? 'on' : ''}`} onClick={() => up({ energy: 'questionnaire' })}>
                <div className="row"><b>My activity level</b><span className="spacer" /><span className="mono">{en.factorTdee.toLocaleString()} kcal</span></div>
                <div className="small">Mifflin-St Jeor BMR {en.bmr.toLocaleString()} × {q.activity}</div>
              </button>
            </div>
          </div>
        </Card>}

        {step === 4 && <Card>
          <h2 className="wl-q">Food you like</h2>
          <div className="field"><span>Eating style</span><div className="wl-opts">{DIETS.map((d) => <button key={d.v} className={`chip ${q.diet === d.v ? 'on' : ''}`} onClick={() => up({ diet: d.v })}><b>{d.label}</b><br /><span className="small" style={{ opacity: .75 }}>{d.hint}</span></button>)}</div></div>
          <div className="field"><span>Allergies & foods to avoid</span><div className="chips">{ALLERGENS.map((a) => { const on = q.exclude.includes(a.v); return <button key={a.v} className={`chip ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => up({ exclude: on ? q.exclude.filter((x) => x !== a.v) : [...q.exclude, a.v] as Allergen[] })}>{on ? '✕ ' : ''}{a.label}</button>; })}</div></div>
          <div className="field"><span>Faith-based</span><div className="chips">{([['none', 'No preference'], ['halal', 'Halal-friendly'], ['kosher', 'Kosher-friendly']] as const).map(([v, l]) => <button key={v} className={`chip ${q.religious === v ? 'on' : ''}`} onClick={() => up({ religious: v })}>{l}</button>)}</div></div>
          <div className="field"><span>Meals per day</span><div className="chips">{([2, 3, 4, 5] as const).map((n) => <button key={n} className={`chip ${q.meals === n ? 'on' : ''}`} onClick={() => up({ meals: n })}>{n}{n === 4 ? ' (3 + snack)' : n === 5 ? ' (3 + 2 snacks)' : ''}</button>)}</div></div>
          <div className="field"><span>Eating window (optional)</span><div className="chips">{([null, 12, 10, 8] as const).map((h) => <button key={String(h)} className={`chip ${(q.window?.hours ?? null) === h ? 'on' : ''}`} onClick={() => up({ window: h ? { start: q.window?.start || '09:00', hours: h } : null })}>{h ? `${h} h` : 'Off'}</button>)}</div>
            {q.window && <div className="row" style={{ marginTop: 10 }}><span className="small muted">From</span><select className="input" style={{ width: 120 }} value={q.window.start} onChange={(e) => up({ window: { ...q.window!, start: e.target.value } })}>{['07:00', '08:00', '09:00', '10:00', '11:00', '12:00'].map((x) => <option key={x}>{x}</option>)}</select><span className="small muted">to {windowEnd(q.window)}</span></div>}
            <div className="muted small" style={{ marginTop: 6 }}>Time-restricted eating can help some people structure their day, but with the same calories it didn’t add weight loss in trials (TREAT 2020, NEJM 2022).</div></div>
          <div className="field"><span>Cooking time per meal</span><div className="chips">{([[15, '≤ 15 min'], [30, '≤ 30 min'], [0, 'Any']] as const).map(([v, l]) => <button key={v} className={`chip ${q.cookTime === v ? 'on' : ''}`} onClick={() => up({ cookTime: v })}>{l}</button>)}</div></div>
          <button className="toggle" style={{ width: '100%', textAlign: 'left' }} onClick={() => up({ budget: !q.budget })}><span><b>Budget-friendly</b><div className="muted small">Prefer beans, lentils, eggs, oats, canned fish and frozen veg</div></span><span className={`switch ${q.budget ? 'on' : ''}`} /></button>
        </Card>}

        {step === 5 && <Card>
          <h2 className="wl-q">Your starting point</h2>
          <div className="grid2" style={{ marginBottom: 12 }}>
            <div className="stat accent"><div className="stat-v">{t.kcal.toLocaleString()}</div><div className="stat-l">kcal / day (avg, est.)</div></div>
            <div className="stat"><div className="stat-v">{t.protein}<small> g</small></div><div className="stat-l">protein ({t.proteinPerKg} g/kg)</div></div>
            <div className="stat"><div className="stat-v">{t.tdee.toLocaleString()}</div><div className="stat-l">maintenance ({t.method === 'tracked' ? 'tracked' : 'activity level'})</div></div>
            <div className="stat"><div className="stat-v">{t.atMaintenance ? '—' : `−${t.deficit}`}</div><div className="stat-l">deficit / day</div></div>
          </div>
          {t.notes.map((n) => <Banner key={n} tone="warn">{n}</Banner>)}
          <ul className="cues">
            <li>{DIETS.find((d) => d.v === q.diet)?.label}{q.exclude.length ? `, no ${q.exclude.map((x) => ALLERGENS.find((a) => a.v === x)?.label.toLowerCase()).join(', ')}` : ''}{q.religious !== 'none' ? `, ${q.religious}-friendly` : ''}</li>
            <li>{q.meals} meals a day{q.window ? ` within ${q.window.start}–${windowEnd(q.window)}` : ''}{q.cookTime ? `, ≤ ${q.cookTime} min cooking` : ''}{q.budget ? ', budget-friendly' : ''}</li>
            <li>{t.periodized ? `More carbs on your ${q.trainingDays} training days, fewer on rest days — same weekly total.` : 'Same targets every day.'}</li>
          </ul>
          <p className="muted small" style={{ marginBottom: 0 }}>Estimates, not promises. Mifflin-St Jeor can be off by 10% or more for some people, so the plan checks your weigh-in trend and suggests small changes.</p>
        </Card>}

        <div className="wl-foot">
          {step > 0 ? <button className="btn" onClick={() => setStep(step === 3 && sc.level !== 'ok' ? 2 : step - 1)}>Back</button> : <Link className="btn" to="/fuel/weight-loss">Cancel</Link>}
          {step < STEPS.length - 1
            ? <button className="btn y block" disabled={!canNext} onClick={() => setStep(step === 1 && sc.level !== 'ok' ? 2 : step + 1)}>Continue</button>
            : <button className="btn y block" data-testid="wl-build" onClick={build}>{existing ? 'Update my plan' : 'Build my plan'}</button>}
        </div>
        <Disclaimer />
      </div>
    </Page>
  );
}
