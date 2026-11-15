import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore, uid } from '../lib/store';
import { ACTIVITY_LEVELS, fromW, toW, todayKey, wUnit, wu } from '../lib/calc';
import { ALLERGENS, DIETS, PACES, REASON_TEXT, screen, type Allergen, type Pace } from '../lib/wl';
import {
  EQUIPMENT, FIVEK_BANDS, GOALS, INJURIES, MILE_BANDS, PREFS, PULL_BANDS, PUSH_BANDS, RACES, activeCoachPlan, defaultAnswers, detectLevel, generatePlan, goalLabel, quizOf, raceLabel,
  type CoachAnswers, type CoachPlan, type Equip, type Injury, type TrainPref,
} from '../lib/coach';
import { can } from '../lib/entitlements';
import { CATALOG } from '../data/planCatalog';
import { useEnergyInput } from './WeightLossSetup';
import { Page, Card, Banner } from '../components/ui';
import { Icon } from '../components/Icon';
import { useToast } from '../lib/toast';

type StepId = 'goal' | 'race' | 'experience' | 'push' | 'pull' | 'run' | 'days' | 'minutes' | 'prefs' | 'equipment' | 'injuries' | 'body' | 'health' | 'safety' | 'pace' | 'diet' | 'meals' | 'weeks';

/** One question per screen, coach-style. Not an AI chat: every answer feeds the rule-based generator in lib/coach.ts. */
export default function CoachSetup() {
  const { data, profile, upsert, setProfile } = useStore();
  const nav = useNavigate();
  const toast = useToast();
  const energy = useEnergyInput();
  const existing = activeCoachPlan(data.coachplans);
  const wU = wu(profile);
  const [a, setA] = useState<CoachAnswers>(() => existing && !existing.stopped
    ? { ...existing.answers, sex: profile.sex, age: profile.age, heightCm: profile.heightCm, weightKg: profile.weightKg }
    : defaultAnswers({ ...profile, weeklySessions: profile.weeklySessions }));
  const [i, setI] = useState(0);
  const [ack, setAck] = useState(false);
  const [building, setBuilding] = useState(false);
  const up = (x: Partial<CoachAnswers>) => setA((c) => ({ ...c, ...x }));
  const sc = screen(quizOf(a));
  const needSafety = a.parq || sc.level !== 'ok' || (a.sex === 'female' && !!a.health.pregnant);
  const steps = useMemo<StepId[]>(() => {
    const s: StepId[] = ['goal'];
    if (a.goal === 'race') s.push('race');
    s.push('experience', 'push', 'pull', 'run', 'days', 'minutes', 'prefs', 'equipment', 'injuries', 'body', 'health');
    if (needSafety) s.push('safety');
    if (!a.parq) { if (a.goal === 'fat-loss' && sc.level !== 'stop') s.push('pace'); if (sc.level !== 'stop') s.push('diet', 'meals'); s.push('weeks'); }
    return s;
  }, [a.goal, a.parq, needSafety, sc.level]);
  const step = steps[Math.min(i, steps.length - 1)];
  const last = i >= steps.length - 1;
  const next = () => setI((x) => Math.min(steps.length - 1, x + 1));
  const back = () => (i > 0 ? setI(i - 1) : nav('/coach'));
  const pick = (x: Partial<CoachAnswers>) => { up(x); window.setTimeout(next, 180); };
  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const lv = detectLevel(a);
  const ftIn = { ft: Math.floor(a.heightCm / 2.54 / 12), inch: Math.round((a.heightCm / 2.54) % 12) };

  const build = () => {
    if (!can('coach.plan')) return;
    setBuilding(true);
    const id = existing?.id || uid();
    const g = generatePlan(a, { today: todayKey(), id, seed: Math.floor(Math.random() * 1e6), catalog: CATALOG, energy });
    const plan: Omit<CoachPlan, 'updatedAt'> = existing ? { ...g, changelog: [...existing.changelog, { date: todayKey(), week: 0, decision: 'edit', title: 'Plan rebuilt from new answers', changes: [] }] } : g;
    window.setTimeout(() => {
      upsert<CoachPlan>('coachplans', plan);
      setProfile({ sex: a.sex, age: a.age, heightCm: a.heightCm, weightKg: a.weightKg, activity: a.activity, weeklySessions: a.days, coachDismissed: true });
      toast(existing ? 'Plan rebuilt' : 'Your plan is ready');
      nav('/coach', { replace: true });
    }, 900);
  };

  if (building) return (
    <div className="coach-building" data-testid="coach-building"><div className="coach-av big">H</div><h2>Building your plan…</h2>
      <ul className="cues"><li>Level: {lv.overall}</li><li>{a.days} days × {a.minutes} min</li><li>{goalLabel(a.goal)}{a.goal === 'race' ? ` · ${raceLabel(a.race)}` : ''}</li></ul></div>
  );

  const multiStep = ['prefs', 'equipment', 'injuries', 'body', 'health', 'safety', 'diet', 'meals', 'run', 'weeks', 'pull'].includes(step);
  const canNext = step === 'body' ? a.age > 0 && a.heightCm > 100 && a.weightKg > 30 : step === 'safety' ? !a.parq && (sc.level === 'ok' && !a.health.pregnant ? true : ack) : step === 'equipment' ? a.equipment.length > 0 : true;

  const body = (() => {
    switch (step) {
      case 'goal': return <Q q="What’s your main goal right now?" hint="Pick one — you can change it any time.">
        <div className="coach-opts">{GOALS.map((g) => <Opt key={g.v} testid={`goal-${g.v}`} on={a.goal === g.v} onClick={() => pick({ goal: g.v, race: g.v === 'race' ? a.race || '5k' : a.race })} title={g.label} sub={g.hint} />)}</div></Q>;
      case 'race': return <Q q="Which race are you preparing for?">
        <div className="coach-opts">{RACES.map((r) => <Opt key={r.v} on={a.race === r.v} onClick={() => pick({ race: r.v })} title={r.label} />)}</div></Q>;
      case 'experience': return <Q q="How long have you trained consistently?" hint="Two or more sessions a week, most weeks.">
        <div className="coach-opts one">{([['new', 'I’m new / starting again', 'Less than 3 months'], ['some', 'A while', '3–12 months'], ['year', 'More than a year', 'Training is a habit']] as const).map(([v, t, s2]) => <Opt key={v} on={a.experience === v} onClick={() => pick({ experience: v })} title={t} sub={s2} />)}</div></Q>;
      case 'push': return <Q q="Quick test: how many push-ups can you do in a row?" hint="Good form: body straight, chest close to the floor. Rough is fine.">
        <div className="coach-chips">{PUSH_BANDS.map((b) => <button key={b.v} data-testid={`push-${b.v}`} className={`chip big ${a.pushUps === b.v ? 'on' : ''}`} onClick={() => pick({ pushUps: b.v })}>{b.label}</button>)}</div></Q>;
      case 'pull': return <Q q="And pull-ups (from a dead hang)?" hint="No bar? Pick “No bar / not sure”.">
        <div className="coach-chips">{PULL_BANDS.map((b) => <button key={String(b.v)} className={`chip big ${a.pullUps === b.v ? 'on' : ''}`} onClick={() => pick({ pullUps: b.v })}>{b.label}</button>)}</div></Q>;
      case 'run': return <Q q="How far can you run without stopping?" hint="Walking breaks don’t count — just a rough idea.">
        <div className="coach-opts">{([['none', 'Not a mile yet'], ['mile', 'About 1 mile (1.6 km)'], ['5k', '5K (3.1 mi)'], ['10k', '10K or more']] as const).map(([v, t]) => <Opt key={v} on={a.run === v} onClick={() => up({ run: v })} title={t} />)}</div>
        {a.run === 'mile' && <div className="field" style={{ marginTop: 14 }}><span>Roughly how fast is your mile?</span><div className="chips">{MILE_BANDS.map((b) => <button key={b.v} className={`chip ${a.mileMin === b.v ? 'on' : ''}`} onClick={() => up({ mileMin: b.v })}>{b.label}</button>)}</div></div>}
        {(a.run === '5k' || a.run === '10k') && <div className="field" style={{ marginTop: 14 }}><span>Roughly how fast is your 5K?</span><div className="chips">{FIVEK_BANDS.map((b) => <button key={b.v} className={`chip ${a.fiveKMin === b.v ? 'on' : ''}`} onClick={() => up({ fiveKMin: b.v })}>{b.label}</button>)}</div></div>}
      </Q>;
      case 'days': return <Q q="How many days a week can you train?" hint="Be realistic — a plan you can keep beats a perfect one.">
        <div className="coach-chips">{[2, 3, 4, 5, 6].map((n) => <button key={n} data-testid={`days-${n}`} className={`chip big ${a.days === n ? 'on' : ''}`} onClick={() => pick({ days: n })}>{n}</button>)}</div>
        <p className="muted small">At least one full rest day is always kept.</p></Q>;
      case 'minutes': return <Q q="How long can each session be?" hint="Including warm-up.">
        <div className="coach-chips">{[20, 30, 45, 60, 75, 90].map((n) => <button key={n} className={`chip big ${a.minutes === n ? 'on' : ''}`} onClick={() => pick({ minutes: n })}>{n} min</button>)}</div></Q>;
      case 'prefs': return <Q q="What kind of training do you enjoy?" hint="Pick any. The plan leans toward these where it can.">
        <div className="coach-chips">{PREFS.map((p) => { const on = a.prefs.includes(p.v); return <button key={p.v} className={`chip big ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => up({ prefs: toggle<TrainPref>(a.prefs, p.v) })}>{p.label}</button>; })}</div>
        {!a.prefs.length && <p className="muted small">Not sure? Leave it empty and HYBRD picks a balanced mix.</p>}</Q>;
      case 'equipment': return <Q q="What equipment do you have?" hint="Exercises you can’t do are swapped automatically.">
        <div className="coach-opts">{EQUIPMENT.map((e) => { const on = a.equipment.includes(e.v); return <Opt key={e.v} on={on} title={e.label} sub={e.hint} onClick={() => up({ equipment: e.v === 'none' ? ['none'] : toggle<Equip>(a.equipment.filter((x) => x !== 'none'), e.v).length ? toggle<Equip>(a.equipment.filter((x) => x !== 'none'), e.v) : ['none'] })} />; })}</div></Q>;
      case 'injuries': return <Q q="Any injuries or areas to go easy on?" hint="Exercises that load these areas get swapped for friendlier ones.">
        <div className="coach-chips">
          <button className={`chip big ${!a.injuries.length ? 'on' : ''}`} onClick={() => up({ injuries: [] })}>None</button>
          {INJURIES.map((x) => { const on = a.injuries.includes(x.v); return <button key={x.v} className={`chip big ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => up({ injuries: toggle<Injury>(a.injuries, x.v) })}>{x.label}</button>; })}
        </div>
        {a.injuries.length > 0 && <Banner tone="warn">If it hurts now, or it’s a recent injury, get it checked by a physio or doctor first. HYBRD can avoid exercises, but it can’t diagnose.</Banner>}</Q>;
      case 'body': return <Q q="A few details about you" hint="Filled in from your profile. Used for calories and safety checks only.">
        <Card>
          <div className="field"><span>Sex (for the calorie equation)</span><div className="chips">{(['female', 'male'] as const).map((x) => <button key={x} className={`chip ${a.sex === x ? 'on' : ''}`} onClick={() => up({ sex: x })}>{x === 'male' ? 'Male' : 'Female'}</button>)}</div></div>
          <div className="grid2">
            <label className="field"><span>Age</span><input inputMode="numeric" value={a.age || ''} onChange={(e) => up({ age: +e.target.value || 0 })} /></label>
            <label className="field"><span>Weight ({wUnit(wU)})</span><input inputMode="decimal" value={a.weightKg ? Math.round(toW(a.weightKg, wU) * 10) / 10 : ''} onChange={(e) => up({ weightKg: fromW(+e.target.value || 0, wU) })} /></label>
          </div>
          {profile.units === 'imperial' ? <div className="grid2">
            <label className="field"><span>Height ft</span><input inputMode="numeric" value={ftIn.ft} onChange={(e) => up({ heightCm: ((+e.target.value || 0) * 12 + ftIn.inch) * 2.54 })} /></label>
            <label className="field"><span>in</span><input inputMode="numeric" value={ftIn.inch} onChange={(e) => up({ heightCm: (ftIn.ft * 12 + (+e.target.value || 0)) * 2.54 })} /></label>
          </div> : <label className="field"><span>Height (cm)</span><input inputMode="numeric" value={Math.round(a.heightCm)} onChange={(e) => up({ heightCm: +e.target.value || 0 })} /></label>}
          <div className="field"><span>Daily activity outside workouts</span><div className="stack">{ACTIVITY_LEVELS.slice(0, 4).map((x) => <button key={x.v} className={`chip ${a.activity === x.v ? 'on' : ''}`} style={{ width: '100%', textAlign: 'left' }} onClick={() => up({ activity: x.v })}><b>{x.label}</b> <span style={{ opacity: .7 }}>· {x.hint}</span></button>)}</div></div>
        </Card></Q>;
      case 'health': return <Q q="Health check" hint="Tick anything that applies. It keeps the plan safe and stays private.">
        <Card>
          <button className="toggle" style={{ width: '100%', textAlign: 'left' }} onClick={() => up({ parq: !a.parq })}><span><b>A doctor told me to avoid exercise, or I get chest pain, fainting or dizziness when active</b></span><span className={`switch ${a.parq ? 'on' : ''}`} /></button>
          {([
            ...(a.sex === 'female' ? [['pregnant', 'I’m pregnant'], ['breastfeeding', 'I’m breastfeeding']] : []),
            ['eatingDisorder', 'I have or had an eating disorder'],
            ['diabetes', 'I have diabetes (type 1 or 2)'],
            ['medical', 'Another medical condition or medicine that affects exercise, weight or diet'],
          ] as [keyof CoachAnswers['health'], string][]).map(([k, l]) => (
            <button key={k} className="toggle" style={{ width: '100%', textAlign: 'left' }} onClick={() => up({ health: { ...a.health, [k]: !a.health[k] } })}><span><b>{l}</b></span><span className={`switch ${a.health[k] ? 'on' : ''}`} /></button>
          ))}
        </Card></Q>;
      case 'safety': return a.parq ? (
        <div className="wl-safety" data-testid="coach-parq">
          <div className="wl-safety-ic"><Icon name="heart" size={30} /></div>
          <h2 style={{ textAlign: 'center' }}>Check with a doctor first</h2>
          <Card><p>You said a doctor advised against exercise, or that you get chest pain, fainting or dizziness when active. HYBRD Coach won’t build a training plan until a doctor or other qualified professional has cleared you.</p>
            <p className="muted small">If those symptoms happen right now, stop and seek urgent medical help. Once you’re cleared, come back and switch this answer off.</p></Card>
        </div>
      ) : (
        <Q q="A quick safety note" hint="Based on your answers.">
          <Card>
            {sc.reasons.map((r) => <p key={r} className="small">{REASON_TEXT[r] || r}</p>)}
            {a.sex === 'female' && a.health.pregnant && !sc.reasons.includes('pregnant') && <p className="small">{REASON_TEXT.pregnant}</p>}
            <p className="small">{sc.level === 'stop' ? 'Your plan will include training, but no calorie targets — you can still browse and log meals.' : 'Training is capped at a moderate level and the gentle calorie pace is used.'}</p>
            <button className="toggle" style={{ width: '100%', textAlign: 'left' }} onClick={() => setAck(!ack)} data-testid="coach-ack"><span><b>I understand, and I’ll check with my doctor where it applies</b></span><span className={`switch ${ack ? 'on' : ''}`} /></button>
          </Card>
        </Q>
      );
      case 'pace': return <Q q="How fast do you want to lose weight?" hint="Slower is easier to keep up and protects muscle.">
        <div className="stack">{(Object.keys(PACES) as Pace[]).map((p) => { const off = sc.level === 'gentle' && p !== 'gentle'; return <button key={p} disabled={off} className={`wl-pace ${a.pace === p ? 'on' : ''}`} onClick={() => pick({ pace: p })}><b>{PACES[p].label}</b><div className="small">{PACES[p].hint}</div></button>; })}</div></Q>;
      case 'diet': return <Q q="How do you like to eat?" hint="Meals that don’t fit are never suggested.">
        <div className="coach-opts">{DIETS.map((d) => <Opt key={d.v} on={a.diet === d.v} onClick={() => up({ diet: d.v })} title={d.label} sub={d.hint} />)}</div>
        <div className="field" style={{ marginTop: 14 }}><span>Allergies & foods to avoid</span><div className="chips">{ALLERGENS.map((x) => { const on = a.exclude.includes(x.v); return <button key={x.v} className={`chip ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => up({ exclude: toggle<Allergen>(a.exclude, x.v) })}>{x.label}</button>; })}</div></div>
        <div className="field"><span>Faith-based</span><div className="chips">{([['none', 'No preference'], ['halal', 'Halal-friendly'], ['kosher', 'Kosher-friendly']] as const).map(([v, l]) => <button key={v} className={`chip ${a.religious === v ? 'on' : ''}`} onClick={() => up({ religious: v })}>{l}</button>)}</div></div>
        {a.exclude.length > 0 && <p className="muted small">Always double-check labels — recipes are tagged, but brands and kitchens vary.</p>}
      </Q>;
      case 'meals': return <Q q="How should your meals fit your day?">
        <Card>
          <div className="field"><span>Meals per day</span><div className="chips">{([2, 3, 4, 5] as const).map((n) => <button key={n} className={`chip ${a.meals === n ? 'on' : ''}`} onClick={() => up({ meals: n })}>{n}{n === 4 ? ' (3 + snack)' : n === 5 ? ' (3 + 2 snacks)' : ''}</button>)}</div></div>
          <div className="field"><span>Cooking time per meal</span><div className="chips">{([[15, '≤ 15 min'], [30, '≤ 30 min'], [0, 'Any']] as const).map(([v, l]) => <button key={v} className={`chip ${a.cookTime === v ? 'on' : ''}`} onClick={() => up({ cookTime: v })}>{l}</button>)}</div></div>
          <button className="toggle" style={{ width: '100%', textAlign: 'left' }} onClick={() => up({ budget: !a.budget })}><span><b>Budget-friendly</b><div className="muted small">Prefer beans, lentils, eggs, oats, canned fish and frozen veg</div></span><span className={`switch ${a.budget ? 'on' : ''}`} /></button>
        </Card></Q>;
      case 'weeks': return <Q q="How long should the first block be?" hint="You’ll check in every week and the plan adjusts.">
        <div className="coach-opts one">{([[4, '4 weeks', '3 build weeks + 1 easier week'], [6, '6 weeks', 'Two build blocks'], [8, '8 weeks', 'Two full blocks with deloads']] as const).map(([v, t, s2]) => <Opt key={v} testid={`weeks-${v}`} on={a.weeks === v} onClick={() => up({ weeks: v })} title={t} sub={a.goal === 'race' && v >= 6 ? `${s2} · ends with a taper week` : s2} />)}</div>
        <Card className="coach-summary">
          <div className="kicker">Your answers</div>
          <ul className="cues">
            <li>{goalLabel(a.goal)}{a.goal === 'race' ? ` · ${raceLabel(a.race)}` : ''}</li>
            <li>Starting level: <b>{lv.overall}</b> (strength {lv.strength.toLowerCase()}, endurance {lv.endurance.toLowerCase()}){lv.capWhy.length ? ' · capped for safety' : ''}</li>
            <li>{a.days} days a week, up to {a.minutes} min</li>
            <li>{a.equipment.includes('none') && a.equipment.length === 1 ? 'Bodyweight only' : `Equipment: ${a.equipment.filter((e) => e !== 'none').map((e) => EQUIPMENT.find((x) => x.v === e)?.label).join(', ')}`}{a.injuries.length ? ` · going easy on ${a.injuries.map((x) => INJURIES.find((y) => y.v === x)?.label.toLowerCase()).join(', ')}` : ''}</li>
          </ul>
        </Card>
      </Q>;
    }
  })();

  const pct = Math.round(((i + 1) / steps.length) * 100);
  return (
    <Page title="HYBRD Coach" back="/coach">
      <div className="coach-quiz" data-testid={`coach-step-${step}`}>
        <div className="coach-progress"><div className="coach-bar"><i style={{ width: `${pct}%` }} /></div><span className="muted small">{i + 1} / {steps.length}</span></div>
        {body}
        <div className="wl-foot coach-foot">
          <button className="btn" onClick={back} aria-label="Back"><Icon name="back" size={18} /> Back</button>
          {step === 'safety' && a.parq
            ? <Link className="btn y block" to="/">Back to Home</Link>
            : last ? <button className="btn y block" data-testid="coach-build" onClick={build}>{existing ? 'Rebuild my plan' : 'Build my plan'}</button>
            : (multiStep || step === 'goal' || step === 'push' || step === 'days' || step === 'minutes' || step === 'experience' || step === 'race' || step === 'pace')
              ? <button className="btn y block" data-testid="coach-next" disabled={!canNext} onClick={next}>Continue</button> : null}
        </div>
        <p className="muted small coach-fine">HYBRD Coach is a rule-based planner built on HYBRD’s programs and published guidelines — not AI, and not medical advice.</p>
      </div>
    </Page>
  );
}

function Q({ q, hint, children }: { q: string; hint?: string; children: ReactNode }) {
  return (
    <div className="coach-q">
      <div className="coach-bubble"><span className="coach-av">H</span><div><h2>{q}</h2>{hint && <p className="muted small">{hint}</p>}</div></div>
      {children}
    </div>
  );
}
function Opt({ on, onClick, title, sub, testid }: { on: boolean; onClick: () => void; title: string; sub?: string; testid?: string }) {
  return <button className={`coach-opt ${on ? 'on' : ''}`} onClick={onClick} data-testid={testid} aria-pressed={on}><b>{title}</b>{sub && <span>{sub}</span>}</button>;
}
