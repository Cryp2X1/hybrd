import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import { fromW, toW, todayKey, wUnit, wu } from '../lib/calc';
import { fuelTargets } from '../lib/fuelTargets';
import {
  PROTOCOLS, REASON_SRC, activeFast, type FastLog, REASON_TEXT, LEVEL_LABEL, allowedProtocols, defaultLowDays, placeWindow, protocolById, proteinPlan, recommend, screen,
  type Diabetes, type FastPlan, type FastQuiz, type ProtocolId,
} from '../lib/fasting';
import { can } from '../lib/entitlements';
import { Page, Card, Banner, Disclaimer, Pill } from '../components/ui';
import { Icon } from '../components/Icon';
import { SrcPills } from '../components/SrcPills';
import { useToast } from '../lib/toast';

const STEPS = ['You', 'Health', 'Goal', 'Schedule', 'Your plan'];
const DIABETES: { v: Diabetes; label: string }[] = [
  { v: 'none', label: 'No' }, { v: 'prediabetes', label: 'Prediabetes' }, { v: 't2-diet', label: 'Type 2 — no medicine' },
  { v: 't2-meds', label: 'Type 2 — tablets (e.g. metformin)' }, { v: 't2-insulin-su', label: 'Type 2 — insulin or sulfonylurea' }, { v: 't1', label: 'Type 1' },
];
const GOALS: { v: FastQuiz['goal']; label: string; hint: string }[] = [
  { v: 'weight', label: 'Lose weight', hint: 'Make eating less easier' }, { v: 'health', label: 'Metabolic health', hint: 'Blood sugar, blood pressure' },
  { v: 'routine', label: 'Structure', hint: 'Stop late-night snacking' }, { v: 'performance', label: 'Fit it around training', hint: 'Without hurting performance' },
];
const EXP: { v: FastQuiz['experience']; label: string; hint: string }[] = [
  { v: 'none', label: 'Never fasted', hint: 'Or only overnight' }, { v: 'some', label: 'Tried it', hint: '14:10 or 16:8 a few times' }, { v: 'regular', label: 'Fast regularly', hint: '16:8+ for 4+ weeks' },
];
const TRAIN: { v: FastQuiz['train']; label: string }[] = [
  { v: 'morning', label: 'Morning' }, { v: 'midday', label: 'Midday' }, { v: 'evening', label: 'Evening' }, { v: 'varies', label: 'It varies' }, { v: 'none', label: 'I don’t train' },
];
const TRAIN_CLOCK: Record<string, string> = { morning: '06:30', midday: '12:00', evening: '18:00' };

export function defaultQuiz(p: { sex: FastQuiz['sex']; age: number; heightCm: number; weightKg: number; weeklySessions?: number }): FastQuiz {
  return {
    sex: p.sex, age: p.age, heightCm: p.heightCm, weightKg: p.weightKg, pregnant: false, breastfeeding: false, edHistory: false, diabetes: 'none',
    meds: false, heart: false, kidney: false, lowBP: false, fallsRisk: false, goal: 'weight', experience: 'none', prefer: 'daily',
    wake: '07:00', bed: '23:00', train: 'evening', trainClock: '18:00', sessionMin: 60, hard: false, trainDays: Math.min(7, p.weeklySessions || 3),
  };
}

export default function FastingSetup() {
  const { data, profile, setProfile, upsert } = useStore();
  const nav = useNavigate();
  const toast = useToast();
  const existing = profile.fasting;
  const wU = wu(profile);
  const [step, setStep] = useState(0);
  const [ack, setAck] = useState(false);
  const [q, setQ] = useState<FastQuiz>(() => existing?.quiz ? { ...existing.quiz, sex: profile.sex, age: profile.age, heightCm: profile.heightCm, weightKg: profile.weightKg } : defaultQuiz(profile));
  const up = (x: Partial<FastQuiz>) => setQ((c) => ({ ...c, ...x }));
  const sc = screen(q);
  const rec = useMemo(() => recommend(q), [q]);
  const allowed = useMemo(() => allowedProtocols(q, sc), [q, sc]);
  const [choice, setChoice] = useState<ProtocolId | null>(null);
  const chosen = (choice && allowed.includes(choice) ? choice : rec?.protocol) || null;
  const cp = protocolById(chosen || undefined);
  const win = cp && cp.kind === 'daily' ? (chosen === rec?.protocol ? { window: rec!.window!, notes: rec!.notes } : placeWindow(cp.eatH, q, chosen === 'etre')) : null;
  const t = fuelTargets(profile, data, todayKey());
  const pp = proteinPlan(t.protein, cp?.eatH || 0);
  const showSafety = step === 2 && sc.level !== 'ok' && !(sc.level === 'caution' && ack);
  const canNext = step !== 0 || (q.age > 0 && q.heightCm > 100 && q.weightKg > 30);
  const ftIn = { ft: Math.floor(q.heightCm / 2.54 / 12), inch: Math.round((q.heightCm / 2.54) % 12) };

  const save = () => {
    if (!chosen || !can('fasting.plan')) return;
    const plan: FastPlan = { protocol: chosen, quiz: q, window: win?.window || null, lowDays: existing?.protocol === chosen && existing.lowDays ? existing.lowDays : defaultLowDays(chosen), createdAt: existing?.createdAt || todayKey(), ack: sc.level === 'caution' ? ack : undefined, level: sc.level };
    setProfile({ fasting: plan, sex: q.sex, age: q.age, heightCm: q.heightCm, weightKg: q.weightKg });
    toast(existing ? 'Fasting plan updated' : 'Your fasting plan is ready');
    nav('/fuel/fasting');
  };

  // Safety first: if updated answers now rule fasting out, switch the saved plan off and end any running fast.
  useEffect(() => {
    if (!(showSafety && sc.level === 'stop' && existing && existing.level !== 'stop')) return;
    const running = activeFast(data.fasts);
    if (running) upsert<FastLog>('fasts', { ...running, end: Date.now(), note: 'ended by safety check' });
    setProfile({ fasting: { ...existing, quiz: q, level: 'stop' } });
  }, [showSafety, sc.level]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- safety screen (stop = no plan; caution = doctor check first) ----------
  if (showSafety) {
    const stop = sc.level === 'stop';
    const reasons = stop ? sc.stop : sc.caution;
    return (
      <Page title={stop ? 'Fasting isn’t recommended for you' : 'Check with your doctor first'} kicker="Fasting · Safety check" back="/fuel/fasting">
        <div className="wl-safety" data-testid={stop ? 'fast-safety' : 'fast-caution'}>
          <div className="wl-safety-ic"><Icon name="heart" size={30} /></div>
          {reasons.map((r) => <Card key={r}><p style={{ margin: 0 }}>{REASON_TEXT[r]}</p>{REASON_SRC[r] && <SrcPills ids={REASON_SRC[r]!} />}</Card>)}
          <Card>
            <h3 style={{ marginBottom: 8 }}>Who can help</h3>
            <ul className="cues">
              <li>Your doctor (GP / primary care) — they know your health history and medicines.</li>
              <li>A registered dietitian (RD / RDN) — they can plan meal timing around medical needs, pregnancy, teens and recovery.</li>
              {reasons.includes('eating-disorder') && <li>If food or weight feels hard to control right now, an eating-disorder specialist or therapist can help. In an emergency, call your local emergency number.</li>}
            </ul>
          </Card>
          {stop ? <Banner tone="warn">HYBRD won’t set a fasting plan or timer in this case{existing ? ' — your saved fasting plan has been switched off' : ''}. Regular meals, your Fuel log and training are all still here for you.</Banner>
            : <Banner tone="warn">HYBRD will only offer beginner patterns (12:12 or 14:10{q.heart ? '' : ' / similar'}){q.diabetes !== 'none' && q.diabetes !== 'prediabetes' ? ' and no low-calorie days' : ''}. Stop and eat if you feel dizzy, shaky or unwell.</Banner>}
          {!stop && <label className="toggle" style={{ cursor: 'pointer' }}><span><b>I’ll check with my doctor before I start</b><div className="muted small">Required to continue</div></span><input type="checkbox" data-testid="fast-ack" checked={ack} onChange={(e) => setAck(e.target.checked)} style={{ width: 24, height: 24, accentColor: '#FFE600' }} /></label>}
          <div className="wl-foot">
            <button className="btn" onClick={() => setStep(1)}>Back</button>
            {stop ? <Link className="btn y block" to="/fuel?tab=recipes">Browse meals instead</Link>
              : <button className="btn y block" disabled={!ack} onClick={() => setStep(2)}>Continue</button>}
          </div>
          <Disclaimer />
        </div>
      </Page>
    );
  }

  const chip = <T extends string>(cur: T, v: T, label: string, set: (v: T) => void, hint?: string) => <button key={v} className={`chip ${cur === v ? 'on' : ''}`} onClick={() => set(v)}>{label}{hint && <div className="small" style={{ fontWeight: 500, opacity: .75 }}>{hint}</div>}</button>;
  const tog = (key: keyof FastQuiz, label: string, sub?: string) => <label className="toggle" style={{ cursor: 'pointer' }} key={key}><span><b>{label}</b>{sub && <div className="muted small">{sub}</div>}</span><input type="checkbox" checked={!!q[key]} onChange={(e) => up({ [key]: e.target.checked } as Partial<FastQuiz>)} style={{ width: 22, height: 22, accentColor: '#FFE600' }} /></label>;

  return (
    <Page title="Your fasting plan" kicker={`Fasting · Step ${step + 1} of ${STEPS.length} · ${STEPS[step]}`} back="/fuel/fasting">
      <div className="wl-quiz" data-testid="fast-quiz">
        <div className="onb-dots wl-dots">{STEPS.map((s, i) => <span key={s} className={i <= step ? 'on' : ''} />)}</div>

        {step === 0 && <Card>
          <h2 className="wl-q">About you</h2>
          <div className="field"><span>Sex</span><div className="chips">{(['female', 'male'] as const).map((x) => chip(q.sex, x, x === 'male' ? 'Male' : 'Female', (v) => up({ sex: v, ...(v === 'male' ? { pregnant: false, breastfeeding: false } : {}) })))}</div></div>
          <div className="grid2">
            <label className="field"><span>Age</span><input inputMode="numeric" value={q.age || ''} onChange={(e) => up({ age: +e.target.value || 0 })} /></label>
            <label className="field"><span>Weight ({wUnit(wU)})</span><input inputMode="decimal" value={q.weightKg ? Math.round(toW(q.weightKg, wU) * 10) / 10 : ''} onChange={(e) => up({ weightKg: fromW(+e.target.value || 0, wU) })} /></label>
          </div>
          {profile.units === 'imperial' ? <div className="grid2">
            <label className="field"><span>Height ft</span><input inputMode="numeric" value={ftIn.ft} onChange={(e) => up({ heightCm: ((+e.target.value || 0) * 12 + ftIn.inch) * 2.54 })} /></label>
            <label className="field"><span>Height in</span><input inputMode="numeric" value={ftIn.inch} onChange={(e) => up({ heightCm: (ftIn.ft * 12 + (+e.target.value || 0)) * 2.54 })} /></label>
          </div> : <label className="field"><span>Height (cm)</span><input inputMode="numeric" value={Math.round(q.heightCm) || ''} onChange={(e) => up({ heightCm: +e.target.value || 0 })} /></label>}
          <p className="muted small" style={{ margin: 0 }}>Used for the safety check (age, BMI) and your protein target. Stays on your device unless you sign in to sync.</p>
        </Card>}

        {step === 1 && <Card>
          <h2 className="wl-q">Health check</h2>
          <p className="muted small" style={{ marginTop: -6 }}>Fasting isn’t safe for everyone. Answer honestly — this only decides what HYBRD offers you.</p>
          {q.sex === 'female' && tog('pregnant', 'Pregnant or trying to conceive')}
          {q.sex === 'female' && tog('breastfeeding', 'Breastfeeding')}
          {tog('edHistory', 'Past or current eating disorder', 'Anorexia, bulimia, binge eating, or very restrictive eating')}
          <div className="field" style={{ marginTop: 12 }}><span>Diabetes</span><div className="wl-opts">{DIABETES.map((d) => chip(q.diabetes, d.v, d.label, (v) => up({ diabetes: v })))}</div></div>
          {tog('meds', 'Regular medicine that needs food, or lowers blood sugar / blood pressure')}
          {tog('heart', 'Heart disease, heart attack or stroke')}
          {tog('kidney', 'Kidney disease')}
          {tog('lowBP', 'Low blood pressure or fainting')}
          {tog('fallsRisk', 'Osteoporosis or high risk of falls')}
        </Card>}

        {step === 2 && <Card>
          <h2 className="wl-q">Your goal</h2>
          <div className="wl-opts">{GOALS.map((g) => chip(q.goal, g.v, g.label, (v) => up({ goal: v }), g.hint))}</div>
          <div className="field" style={{ marginTop: 14 }}><span>Fasting experience</span><div className="wl-opts">{EXP.map((g) => chip(q.experience, g.v, g.label, (v) => up({ experience: v }), g.hint))}</div></div>
          <div className="field"><span>Style</span><div className="chips">{chip(q.prefer, 'daily', 'Daily eating window', (v) => up({ prefer: v }))}{chip(q.prefer, 'weekly', 'A few low-calorie days', (v) => up({ prefer: v }))}{chip(q.prefer, 'either', 'Either', (v) => up({ prefer: v }))}</div></div>
        </Card>}

        {step === 3 && <Card>
          <h2 className="wl-q">Your day</h2>
          <div className="grid2">
            <label className="field"><span>Wake up</span><input type="time" value={q.wake} onChange={(e) => up({ wake: e.target.value || '07:00' })} /></label>
            <label className="field"><span>Bedtime</span><input type="time" value={q.bed} onChange={(e) => up({ bed: e.target.value || '23:00' })} /></label>
          </div>
          <div className="field"><span>When do you usually train?</span><div className="chips">{TRAIN.map((x) => chip(q.train, x.v, x.label, (v) => up({ train: v, trainClock: TRAIN_CLOCK[v] || q.trainClock })))}</div></div>
          {q.train !== 'none' && q.train !== 'varies' && <div className="grid2">
            <label className="field"><span>Usual start</span><input type="time" value={q.trainClock} onChange={(e) => up({ trainClock: e.target.value || q.trainClock })} /></label>
            <label className="field"><span>Session length</span><select value={q.sessionMin} onChange={(e) => up({ sessionMin: +e.target.value })}>{[30, 45, 60, 75, 90, 120, 150].map((m) => <option key={m} value={m}>{m} min</option>)}</select></label>
          </div>}
          {q.train !== 'none' && <>
            <label className="field"><span>Training days a week</span><select value={q.trainDays} onChange={(e) => up({ trainDays: +e.target.value })}>{[1, 2, 3, 4, 5, 6, 7].map((m) => <option key={m} value={m}>{m}</option>)}</select></label>
            {tog('hard', 'Long (60+ min) or hard sessions are common', 'Intervals, HYROX sims, long runs or rides')}
          </>}
        </Card>}

        {step === 4 && rec && cp && <>
          <Card className="wl-hero">
            <div className="kicker">Recommended for you</div>
            <div className="row" style={{ alignItems: 'baseline', gap: 12 }}><div className="fast-tag" data-testid="fast-rec">{cp.tag}</div><div>{cp.name !== cp.tag && <b>{cp.name}</b>}<div className="muted small">{LEVEL_LABEL[cp.level]} · {cp.kind === 'daily' ? `${cp.fastH} h fast` : cp.kind === 'lowcal' ? `${cp.daysPerWeek} low-calorie days / week` : '1 × 24 h / week'}</div></div></div>
            {win && <div className="fast-win">
              <div><span className="muted small">Eat</span><b>{win.window.start}–{win.window.end}</b></div>
              <div><span className="muted small">Fast</span><b>{win.window.end}–{win.window.start}</b></div>
            </div>}
            {rec.startWith && chosen === rec.protocol && <Banner tone="yellow">Weeks 1–2: start with {protocolById(rec.startWith)!.tag} (eat {placeWindow(protocolById(rec.startWith)!.eatH, q).window.start}–{placeWindow(protocolById(rec.startWith)!.eatH, q).window.end}), then move to {cp.tag}.</Banner>}
            <ul className="cues" style={{ marginTop: 12 }}>{(chosen === rec.protocol ? rec.why : [cp.what]).map((w) => <li key={w}>{w}</li>)}</ul>
            {(win?.notes || (chosen === rec.protocol ? rec.notes : [])).map((n) => <Banner key={n} tone="warn">{n}</Banner>)}
          </Card>
          <Card>
            <h3 style={{ marginBottom: 8 }}>Inside your window</h3>
            <div className="grid3">
              <div className="stat accent"><div className="stat-v">{t.protein}<small> g</small></div><div className="stat-l">protein / day</div></div>
              <div className="stat"><div className="stat-v">{pp.meals}</div><div className="stat-l">meals</div></div>
              <div className="stat"><div className="stat-v">~{pp.perMeal}<small> g</small></div><div className="stat-l">protein / meal</div></div>
            </div>
            <p className="muted small" style={{ margin: '10px 0 0' }}>From your Fuel targets ({t.label.toLowerCase()}). Fasting doesn’t change how much protein you need — spread it every 3–4 h inside the window.</p>
          </Card>
          <Card>
            <h3 style={{ marginBottom: 8 }}>Or choose another</h3>
            <div className="wl-opts">{PROTOCOLS.filter((p) => allowed.includes(p.id)).map((p) => <button key={p.id} className={`chip ${chosen === p.id ? 'on' : ''}`} onClick={() => setChoice(p.id)}>{p.tag}{p.id === rec.protocol && ' ★'}<div className="small" style={{ fontWeight: 500, opacity: .75 }}>{LEVEL_LABEL[p.level]}</div></button>)}</div>
            {allowed.length < PROTOCOLS.length && <p className="muted small" style={{ margin: '10px 0 0' }}>{PROTOCOLS.length - allowed.length} more protocols unlock with experience{sc.level === 'caution' ? ' — and are off while a doctor check is pending' : ''}. Fasts over 24 h aren’t offered.</p>}
          </Card>
          {sc.level === 'caution' && <Banner tone="warn"><Pill tone="yellow">Doctor check</Pill> You said you’ll check with your doctor first. Beginner patterns only.</Banner>}
        </>}

        <div className="wl-foot">
          {step > 0 ? <button className="btn" onClick={() => setStep(step - 1)}>Back</button> : <Link className="btn" to="/fuel/fasting">Cancel</Link>}
          {step < STEPS.length - 1
            ? <button className="btn y block" disabled={!canNext} onClick={() => setStep(step + 1)}>Continue</button>
            : <button className="btn y block" data-testid="fast-save" disabled={!chosen} onClick={save}>{existing ? 'Update my plan' : 'Save my plan'}</button>}
        </div>
        <Disclaimer />
      </div>
    </Page>
  );
}
