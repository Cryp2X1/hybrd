// /mind/setup — 1-minute setup: health screen (decides which breathing / cold / heat tools are shown and how), goal, focus, journal privacy.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import { todayKey } from '../lib/calc';
import { MIND_REASON_SRC, MIND_REASON_TEXT, defaultMindQuiz, mindScreen, toolStatus, type MindFocus, type MindGoal, type MindPlan, type MindQuiz, type Tool } from '../lib/mind';
import { can } from '../lib/entitlements';
import { Page, Card } from '../components/ui';
import { SrcPills } from '../components/SrcPills';
import { CrisisCard, NotTherapy } from '../components/MindBits';
import { useToast } from '../lib/toast';

const STEPS = ['Health', 'Goal & focus', 'Privacy', 'Ready'];
const GOALS: { v: MindGoal; label: string; hint: string }[] = [
  { v: 'hybrid', label: 'Hybrid / HYROX', hint: 'Strength + engine' }, { v: 'endurance', label: 'Endurance', hint: 'Run, ride, tri' },
  { v: 'strength', label: 'Strength / calisthenics', hint: 'Muscle, skills' }, { v: 'general', label: 'General fitness', hint: 'Feel and move better' },
];
const FOCUS: { v: MindFocus; label: string }[] = [
  { v: 'stress', label: 'Stress' }, { v: 'recovery', label: 'Recovery' }, { v: 'sleep', label: 'Sleep' }, { v: 'confidence', label: 'Race confidence' }, { v: 'discipline', label: 'Discipline' }, { v: 'focus', label: 'Focus' },
];
const ST = { ok: 'Offered', care: 'Offered, adapted', doctor: 'Ask your doctor first', avoid: 'Not offered' } as const;
const TOOL_NAME: Partial<Record<Tool, string>> = { box: 'Box breathing (holds)', sigh: 'Cyclic sighing', resonance: 'Resonance breathing', cold: 'Cold-water immersion', sauna: 'Sauna / heat' };

export default function MindSetup() {
  const { profile, setProfile } = useStore();
  const nav = useNavigate();
  const toast = useToast();
  const existing = profile.mind;
  const [step, setStep] = useState(0);
  const [ack, setAck] = useState(!!existing?.ack);
  const [q, setQ] = useState<MindQuiz>(() => existing?.quiz ? { ...defaultMindQuiz(profile), ...existing.quiz } : defaultMindQuiz(profile));
  const up = (x: Partial<MindQuiz>) => setQ((c) => ({ ...c, ...x }));
  const sc = mindScreen(q);
  const needAck = sc.level === 'caution';
  const ageOk = q.age >= 10 && q.age <= 110;

  const save = () => {
    if (!can('mind.checkin')) return;
    const p: MindPlan = { quiz: q, createdAt: existing?.createdAt || todayKey(), level: sc.level, ack: needAck ? ack : undefined };
    setProfile({ mind: p, age: q.age });
    toast(existing ? 'Mind & Recovery updated' : 'You’re set up');
    nav('/mind');
  };
  const tog = (key: keyof MindQuiz, label: string, sub?: string) => <label className="toggle" style={{ cursor: 'pointer' }} key={key}><span><b>{label}</b>{sub && <div className="muted small">{sub}</div>}</span><input type="checkbox" data-testid={`mind-q-${key}`} checked={!!q[key]} onChange={(e) => { up({ [key]: e.target.checked } as Partial<MindQuiz>); setAck(false); }} style={{ width: 22, height: 22, accentColor: '#FFE600' }} /></label>;

  return <Page title={existing ? 'Edit Mind & Recovery' : 'Set up Mind & Recovery'} kicker={`Step ${step + 1} of ${STEPS.length} · ${STEPS[step]}`} back="/mind">
    <div className="wl-quiz sl-root mn-root" data-testid="mind-setup">
      <div className="onb-dots wl-dots">{STEPS.map((s, i) => <span key={s} className={i <= step ? 'on' : ''} />)}</div>

      {step === 0 && <Card>
        <h2 className="wl-q">Quick health check</h2>
        <p className="muted small" style={{ marginTop: -6 }}>A few breathing styles, ice baths and saunas aren’t right for everyone. Your answers only change what HYBRD shows you, and stay on your device unless you sign in to sync.</p>
        <label className="field" style={{ maxWidth: 200 }}><span>Age</span><input inputMode="numeric" data-testid="mind-age" value={q.age || ''} onChange={(e) => { up({ age: +e.target.value || 0 }); setAck(false); }} /></label>
        {!ageOk && q.age > 0 && <p className="small" style={{ color: '#f87171' }}>Enter an age between 10 and 110.</p>}
        {tog('heart', 'Heart condition, chest pain when exercising, fainting, or high blood pressure')}
        {tog('pregnant', 'Pregnant')}
        {tog('respiratory', 'Asthma or another lung condition')}
        {tog('epilepsy', 'Epilepsy or seizures')}
        {tog('panic', 'Panic attacks')}
        {tog('cold', 'Raynaud’s or another cold sensitivity')}
        {tog('mhCare', 'Currently getting mental-health care or medicine for mood / anxiety')}
      </Card>}

      {step === 1 && <Card>
        <h2 className="wl-q">What do you train for?</h2>
        <p className="muted small" style={{ marginTop: -6 }}>This changes recovery advice — e.g. ice baths after lifting can blunt strength gains, but not endurance gains.</p>
        <div className="chips">{GOALS.map((g) => <button key={g.v} className={`chip ${q.goal === g.v ? 'on' : ''}`} aria-pressed={q.goal === g.v} onClick={() => up({ goal: g.v })}>{g.label}<div className="small" style={{ fontWeight: 500, opacity: .75 }}>{g.hint}</div></button>)}</div>
        <div className="field" style={{ marginTop: 14 }}><span>What would help most? (pick any)</span>
          <div className="chips">{FOCUS.map((f) => { const on = q.focus.includes(f.v); return <button key={f.v} className={`chip ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => up({ focus: on ? q.focus.filter((x) => x !== f.v) : [...q.focus, f.v] })}>{f.label}</button>; })}</div>
        </div>
      </Card>}

      {step === 2 && <Card>
        <h2 className="wl-q">Your journal is private</h2>
        <ul className="cues">
          <li>No one else can see your check-ins, journal or check-ups — there’s no sharing, no coach view, no social posts.</li>
          <li>In local mode everything stays on this device. If you sign in, it syncs to your own account (owner-only access) so it’s backed up.</li>
        </ul>
        {tog('privateJournal', 'Keep my journal and check-ups on this device only', 'They will never sync — and won’t be backed up. Daily check-ins still sync so readiness works across devices.')}
      </Card>}

      {step === 3 && <div className="stack">
        {sc.level === 'minor' && <CrisisCard minor title="Written for you too" />}
        {sc.reasons.length > 0 && <Card>
          <h3>Adjusted for you</h3>
          {sc.reasons.map((r) => <div key={r} className="mn-reason" data-testid={`mind-reason-${r}`}><p>{MIND_REASON_TEXT[r]}</p><SrcPills ids={MIND_REASON_SRC[r]} /></div>)}
        </Card>}
        <Card>
          <h3>What you’ll see</h3>
          <div className="mn-tools">{(['sigh', 'resonance', 'box', 'cold', 'sauna'] as Tool[]).map((t) => { const s = toolStatus(t, q); return <div key={t} className="sl-supp"><span>{TOOL_NAME[t]}</span><span className={`sl-st ${s.status === 'care' ? 'doctor' : s.status === 'doctor' ? 'doctor' : s.status}`}>{ST[s.status]}</span></div>; })}</div>
          <p className="muted small" style={{ marginBottom: 0 }}>“Adapted” = breath-holds are removed (5 in · 5 out) or extra cautions are shown.</p>
        </Card>
        {needAck && <label className="toggle" style={{ cursor: 'pointer' }}><span><b>I understand HYBRD Mind is not medical care, and I’ll check with my doctor where it says so</b><div className="muted small">Required to continue</div></span><input type="checkbox" data-testid="mind-ack" checked={ack} onChange={(e) => setAck(e.target.checked)} style={{ width: 24, height: 24, accentColor: '#FFE600' }} /></label>}
        <NotTherapy />
      </div>}

      <div className="wl-foot">
        {step > 0 && <button className="btn" onClick={() => setStep(step - 1)}>Back</button>}
        {step < STEPS.length - 1
          ? <button className="btn y block" data-testid="mind-next" disabled={step === 0 && !ageOk} onClick={() => setStep(step + 1)}>Continue</button>
          : <button className="btn y block" data-testid="mind-save" disabled={needAck && !ack} onClick={save}>{existing ? 'Save changes' : 'Start'}</button>}
      </div>
    </div>
  </Page>;
}
