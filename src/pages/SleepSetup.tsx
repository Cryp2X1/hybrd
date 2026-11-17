import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import { todayKey } from '../lib/calc';
import {
  DRINKS, GOALS, REASON_SRC, REASON_TEXT, buildPlan, cutoffHours, defaultQuiz, drinkById, quizHalfLife, screen, trainDefault,
  type Diet, type DrinkId, type Sensitivity, type SleepPlan, type SleepQuiz, type Train,
} from '../lib/sleep';
import { can } from '../lib/entitlements';
import { Page, Card, Banner, Disclaimer, Pill } from '../components/ui';
import { Icon } from '../components/Icon';
import { SrcPills } from '../components/SrcPills';
import { useToast } from '../lib/toast';

const STEPS = ['Health', 'Your night', 'Caffeine', 'Goal', 'Your plan'];
const TRAIN: { v: Train; label: string }[] = [{ v: 'morning', label: 'Morning' }, { v: 'midday', label: 'Midday' }, { v: 'evening', label: 'Evening' }, { v: 'varies', label: 'It varies' }, { v: 'none', label: 'I don’t train' }];
const SENS: { v: Sensitivity; label: string; hint: string }[] = [
  { v: 'fast', label: 'Barely affects me', hint: 'Coffee after dinner, sleep fine' }, { v: 'unknown', label: 'Not sure', hint: 'Uses the average' },
  { v: 'typical', label: 'Average', hint: 'Afternoon coffee is OK' }, { v: 'slow', label: 'Very sensitive', hint: 'Lunchtime coffee keeps me up' },
];
const DIETS: { v: Diet; label: string }[] = [{ v: 'any', label: 'Anything' }, { v: 'vegetarian', label: 'Vegetarian' }, { v: 'vegan', label: 'Vegan' }, { v: 'dairy-free', label: 'Dairy-free' }];

export default function SleepSetup() {
  const { profile, setProfile } = useStore();
  const nav = useNavigate();
  const toast = useToast();
  const existing = profile.sleep;
  const [step, setStep] = useState(0);
  const [ack, setAck] = useState(!!existing?.ack);
  const [q, setQ] = useState<SleepQuiz>(() => existing?.quiz ? { ...defaultQuiz(profile), ...existing.quiz } : { ...defaultQuiz(profile), age: profile.age || 30, sex: profile.sex || 'male' });
  const up = (x: Partial<SleepQuiz>) => setQ((c) => ({ ...c, ...x }));
  const sc = screen(q);
  const showSafety = step === 1 && sc.level !== 'ok' && !ack;
  const canNext = step !== 0 || (q.age >= 10 && q.age <= 110);
  const plan = step === 4 ? buildPlan(q) : null;

  const save = () => {
    if (!can('sleep.plan')) return;
    const p: SleepPlan = { quiz: q, createdAt: existing?.createdAt || todayKey(), level: sc.level, ack: sc.level !== 'ok' ? ack : undefined };
    setProfile({ sleep: p, age: q.age, sex: q.sex });
    toast(existing ? 'Sleep plan updated' : 'Your evening plan is ready');
    nav('/fuel/sleep');
  };

  // ---------- safety screen ----------
  if (showSafety) {
    const minor = sc.level === 'minor';
    return (
      <Page title={minor ? 'Food & drink only for you' : 'Talk to your doctor first'} kicker="Sleep · Safety check" back="/fuel/sleep">
        <div className="wl-safety sl-root" data-testid={minor ? 'sleep-minor' : 'sleep-caution'}>
          <div className="wl-safety-ic"><Icon name="heart" size={30} /></div>
          {sc.reasons.map((r) => <Card key={r}><p style={{ margin: 0 }}>{REASON_TEXT[r]}</p>{REASON_SRC[r] && <SrcPills ids={REASON_SRC[r]!} />}</Card>)}
          <Card>
            <h3 style={{ marginBottom: 8 }}>What HYBRD will do</h3>
            <ul className="cues">
              <li>Still build your evening food, drink and caffeine timeline — those are everyday choices.</li>
              <li>{minor ? 'Show no supplements at all.' : 'Never suggest a supplement. Each one is marked “ask your doctor” or “avoid” for you, with the reason.'}</li>
              {sc.clinician && <li>Remind you that persistent insomnia has a proven first-line treatment: CBT-I with a clinician.</li>}
            </ul>
          </Card>
          {!minor && <label className="toggle" style={{ cursor: 'pointer' }}><span><b>I’ll talk to my doctor before trying any supplement</b><div className="muted small">Required to continue</div></span><input type="checkbox" data-testid="sleep-ack" checked={ack} onChange={(e) => setAck(e.target.checked)} style={{ width: 24, height: 24, accentColor: '#FFE600' }} /></label>}
          <div className="wl-foot">
            <button className="btn" onClick={() => setStep(0)}>Back</button>
            <button className="btn y block" data-testid="sleep-safety-continue" disabled={!minor && !ack} onClick={() => { if (minor) setAck(true); }}>Continue</button>
          </div>
          <Disclaimer />
        </div>
      </Page>
    );
  }

  const chip = <T extends string>(cur: T, v: T, label: string, set: (v: T) => void, hint?: string) => <button key={v} className={`chip ${cur === v ? 'on' : ''}`} aria-pressed={cur === v} onClick={() => set(v)}>{label}{hint && <div className="small" style={{ fontWeight: 500, opacity: .75 }}>{hint}</div>}</button>;
  const tog = (key: keyof SleepQuiz, label: string, sub?: string) => <label className="toggle" style={{ cursor: 'pointer' }} key={key}><span><b>{label}</b>{sub && <div className="muted small">{sub}</div>}</span><input type="checkbox" checked={!!q[key]} onChange={(e) => { up({ [key]: e.target.checked } as Partial<SleepQuiz>); setAck(false); }} style={{ width: 22, height: 22, accentColor: '#FFE600' }} /></label>;
  const hl = quizHalfLife(q);
  const usual = drinkById(q.drink);

  return (
    <Page title="Your evening plan" kicker={`Sleep · Step ${step + 1} of ${STEPS.length} · ${STEPS[step]}`} back="/fuel/sleep">
      <div className="wl-quiz sl-root" data-testid="sleep-quiz">
        <div className="onb-dots wl-dots">{STEPS.map((s, i) => <span key={s} className={i <= step ? 'on' : ''} />)}</div>

        {step === 0 && <Card>
          <h2 className="wl-q">Health check</h2>
          <p className="muted small" style={{ marginTop: -6 }}>Some sleep supplements aren’t safe for everyone. Your answers only decide what HYBRD shows you and stay on your device unless you sign in to sync.</p>
          <div className="grid2">
            <label className="field"><span>Age</span><input inputMode="numeric" data-testid="sleep-age" value={q.age || ''} onChange={(e) => { up({ age: +e.target.value || 0 }); setAck(false); }} /></label>
            <div className="field"><span>Sex</span><div className="chips">{(['female', 'male'] as const).map((x) => chip(q.sex, x, x === 'male' ? 'Male' : 'Female', (v) => { up({ sex: v, ...(v === 'male' ? { pregnant: false, breastfeeding: false, oralContraceptive: false } : {}) }); setAck(false); }))}</div></div>
          </div>
          {q.sex === 'female' && tog('pregnant', 'Pregnant or trying to conceive')}
          {q.sex === 'female' && tog('breastfeeding', 'Breastfeeding')}
          <div className="kicker" style={{ margin: '14px 0 4px' }}>Medicines</div>
          {tog('sedatives', 'Sleeping pills or sedatives', 'e.g. zolpidem, benzodiazepines, sedating antihistamines')}
          {tog('antidepressants', 'Antidepressants or other mental-health medicine')}
          {tog('bloodThinners', 'Blood thinners', 'e.g. warfarin, apixaban, clopidogrel')}
          {tog('bpMeds', 'Blood-pressure medicine')}
          {tog('otherMeds', 'Other regular prescription medicine')}
          <div className="kicker" style={{ margin: '14px 0 4px' }}>Conditions</div>
          {tog('insomnia3mo', 'Trouble sleeping most nights for 3+ months')}
          {tog('sleepDisorder', 'A diagnosed sleep disorder', 'e.g. sleep apnoea, restless legs, narcolepsy')}
          {tog('kidney', 'Kidney disease')}
          {tog('gerd', 'Reflux / heartburn (GERD)')}
          {tog('liver', 'Liver disease')}
          {tog('epilepsy', 'Epilepsy or seizures')}
          {tog('thyroid', 'Thyroid or autoimmune condition')}
          <div className="kicker" style={{ margin: '14px 0 4px' }}>Changes how fast caffeine clears</div>
          {tog('smoker', 'I smoke or vape nicotine')}
          {q.sex === 'female' && tog('oralContraceptive', 'I take a hormonal (oral) contraceptive', 'Can roughly double how long caffeine lasts')}
        </Card>}

        {step === 1 && <Card>
          <h2 className="wl-q">Your night</h2>
          <div className="grid2">
            <label className="field"><span>{q.goal === 'shift' ? 'Go to sleep' : 'Bedtime'}</span><input type="time" data-testid="sleep-bed" value={q.bed} onChange={(e) => up({ bed: e.target.value || '23:00' })} /></label>
            <label className="field"><span>Wake up</span><input type="time" data-testid="sleep-wake" value={q.wake} onChange={(e) => up({ wake: e.target.value || '07:00' })} /></label>
          </div>
          <div className="field"><span>When do you usually train?</span><div className="chips">{TRAIN.map((x) => chip(q.train, x.v, x.label, (v) => up({ train: v, trainClock: v === 'none' || v === 'varies' ? q.trainClock : trainDefault(v) })))}</div></div>
          {q.train !== 'none' && q.train !== 'varies' && <div className="grid2">
            <label className="field"><span>Usual start</span><input type="time" data-testid="sleep-train" value={q.trainClock} onChange={(e) => up({ trainClock: e.target.value || q.trainClock })} /></label>
            <label className="field"><span>Session length</span><select value={q.sessionMin} onChange={(e) => up({ sessionMin: +e.target.value })}>{[30, 45, 60, 75, 90, 120].map((m) => <option key={m} value={m}>{m} min</option>)}</select></label>
          </div>}
          {q.train !== 'none' && tog('hard', 'Sessions are often hard', 'Intervals, HYROX sims, tempo, heavy lifting')}
          <div className="field" style={{ marginTop: 12 }}><span>Alcohol in the evening</span><div className="chips">{chip(q.alcohol, 'none', 'Rarely / never', (v) => up({ alcohol: v }))}{chip(q.alcohol, 'some', '1–2 nights a week', (v) => up({ alcohol: v }))}{chip(q.alcohol, 'often', '3+ nights a week', (v) => up({ alcohol: v }))}</div></div>
          {tog('wakesToPee', 'I often wake up to pee')}
        </Card>}

        {step === 2 && <Card>
          <h2 className="wl-q">Caffeine</h2>
          <div className="field"><span>Your usual drink</span><div className="wl-opts">{chip<DrinkId>(q.drink, 'none', 'No caffeine', (v) => up({ drink: v }))}{DRINKS.filter((d) => d.id !== 'decaf' && d.id !== 'dark-choc').map((d) => chip<DrinkId>(q.drink, d.id, d.label, (v) => up({ drink: v }), `~${d.mg} mg · ${d.serving.split(' · ')[0]}`))}</div></div>
          {q.drink !== 'none' && <label className="field"><span>How many a day?</span><select value={q.cupsPerDay} onChange={(e) => up({ cupsPerDay: +e.target.value })}>{[1, 2, 3, 4, 5, 6].map((m) => <option key={m} value={m}>{m}</option>)}</select></label>}
          {q.train !== 'none' && tog('preWorkout', 'I use a caffeinated pre-workout')}
          <div className="field" style={{ marginTop: 12 }}><span>How does caffeine affect your sleep?</span><div className="wl-opts">{SENS.map((s) => chip(q.sensitivity, s.v, s.label, (v) => up({ sensitivity: v }), s.hint))}</div></div>
          <Banner>Your estimated half-life: <b>{hl} h</b>{q.sensitivity === 'unknown' || q.sensitivity === 'typical' ? ' (the adult average)' : ''}{q.smoker ? ' · faster because you smoke' : ''}{q.oralContraceptive && q.sex === 'female' ? ' · slower on oral contraceptives' : ''}{q.pregnant && q.sex === 'female' ? ' · slower in pregnancy' : ''}. {usual ? `One ${usual.label.toLowerCase()} → last one about ${cutoffHours(usual.mg, hl).toFixed(1)} h before bed.` : ''} It’s an estimate — people vary from 1.5 to 9.5 h.</Banner>
          <SrcPills ids={['sleep-iom-caffeine', 'sleep-gardiner-caffeine', 'sleep-nehlig']} />
        </Card>}

        {step === 3 && <Card>
          <h2 className="wl-q">Your goal</h2>
          <div className="wl-opts">{GOALS.map((g) => chip(q.goal, g.v, g.label, (v) => up({ goal: v }), g.hint))}</div>
          {q.goal === 'race' && tog('timeZones', 'I’m flying across 5+ time zones')}
          {q.goal === 'shift' && <p className="muted small">Shift work: set “Go to sleep” and “Wake up” on the previous step to your daytime sleep (e.g. 08:30 → 15:30).</p>}
          <div className="field" style={{ marginTop: 12 }}><span>How you eat</span><div className="chips">{DIETS.map((d) => chip(q.diet, d.v, d.label, (v) => up({ diet: v })))}</div></div>
          {sc.level !== 'minor' && tog('supplements', 'Show me supplement options too', 'Food first. HYBRD only lists ones that pass your safety check.')}
          {sc.level !== 'minor' && q.supplements && tog('tested', 'I’m a drug-tested athlete')}
        </Card>}

        {step === 4 && plan && <>
          <Card className="wl-hero">
            <div className="kicker">Tonight, for {GOALS.find((g) => g.v === q.goal)!.label.toLowerCase()}</div>
            <div className="fast-win" data-testid="sleep-preview">
              <div><span className="muted small">Last caffeine</span><b>{plan.noCaffeine ? 'skip' : plan.cutoffClock || (plan.usualMg ? 'any time' : '—')}</b></div>
              <div><span className="muted small">{plan.items.some((i) => i.kind === 'recovery') ? 'Recovery meal' : 'Last big meal'}</span><b>{plan.items.find((i) => i.kind === 'meal' && i.id === 'meal' || i.kind === 'recovery')?.clock || '—'}</b></div>
              <div><span className="muted small">Fluids taper</span><b>{plan.items.find((i) => i.kind === 'fluid' && i.id === 'fluid')?.clock || plan.items.find((i) => i.id === 'rehydrate')?.clock || '—'}</b></div>
              <div><span className="muted small">{q.goal === 'shift' ? 'Sleep' : 'Lights out'}</span><b>{q.bed}</b></div>
            </div>
            <ul className="cues" style={{ marginTop: 12 }}>{plan.items.filter((i) => i.warn).map((i) => <li key={i.id}><b>{i.title}.</b> {i.detail}</li>)}</ul>
            {plan.items.every((i) => !i.warn) && <p className="muted small" style={{ margin: '10px 0 0' }}>No red flags in your schedule. Save to see the full timeline with snack, drink and research.</p>}
          </Card>
          {sc.level !== 'ok' && <Banner tone="warn"><Pill tone="yellow">{sc.level === 'minor' ? 'Under 18' : 'Doctor check'}</Pill> {sc.level === 'minor' ? 'Food, drink and caffeine guidance only.' : 'Supplements are marked “ask your doctor” or “avoid” for you.'}</Banner>}
        </>}

        <div className="wl-foot">
          {step > 0 ? <button className="btn" onClick={() => setStep(step - 1)}>Back</button> : <Link className="btn" to="/fuel/sleep">Cancel</Link>}
          {step < STEPS.length - 1
            ? <button className="btn y block" disabled={!canNext} onClick={() => setStep(step + 1)}>Continue</button>
            : <button className="btn y block" data-testid="sleep-save" onClick={save}>{existing ? 'Update my plan' : 'Save my plan'}</button>}
        </div>
        <p className="muted small">Not medical advice. If you have trouble sleeping on most nights for 3 months or more, see a clinician — CBT for insomnia (CBT-I) is the first-line treatment.</p>
      </div>
    </Page>
  );
}
