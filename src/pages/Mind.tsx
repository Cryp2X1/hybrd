// /mind — Mind & Recovery hub. Tabs: Today (check-in → readiness), Breathe, Skills (programs + HYBRD Pulse), Recover, Journal, Trends, Evidence.
// Logic lives in src/lib/mind.ts (tested by tools/test-mind.ts); content + sources in src/data/mindContent.ts.
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useStore, uid } from '../lib/store';
import { prettyDay, todayKey } from '../lib/calc';
import {
  BAND_TEXT, COLD_HEAT_SAFETY, DELOAD_HOW, GRADES, GRADE_HINT, GRADE_LABEL, JOURNAL_MAX, PATTERNS, PHQ4_ITEMS, PHQ4_SCALE, RED_FLAGS, REC_LABEL, REC_TEXT,
  SAFETY_Q, PULSE_BAND, PULSE_ITEMS, baselines, coldHeatAdvice, crisisInText, defaultMindQuiz, deloadSignal, hardYesterday, isLegacyScreen, loadSummary, mindScreen, mindStats,
  moodWatch, patterns, programProgress, pulseScore, pulseTrend, readiness, recoveryPlan, screenOutcome, toolStatus, trend, validCheckIn,
  type CheckIn, type JournalEntry, type JournalKind, type MindSession, type Pain, type RedFlag, type SafetyAnswer, type ScreenResult, type WLike,
} from '../lib/mind';
import { MIND_EVIDENCE, MIND_EV_CATS, MIND_SOURCE_IDS, MIND_TIPS, PROGRAMS, ROUTINES, routineSec, type MindEvCat } from '../data/mindContent';
import { sourceById } from '../data/sources';
import { can } from '../lib/entitlements';
import { Page, Card, Banner, Segmented, Sheet, Pill } from '../components/ui';
import { SrcPills } from '../components/SrcPills';
import { Icon } from '../components/Icon';
import { CrisisCard, MGrade, NotTherapy, Ring } from '../components/MindBits';
import { PulseBreakdown, PulseDial, PulseDisclaimer, PulseFocus, PulseQuestion, PulseSupport, PulseTrendChart } from '../components/Pulse';
import { useToast } from '../lib/toast';

type Tab = 'today' | 'breathe' | 'skills' | 'recover' | 'journal' | 'trends' | 'evidence';
const TABS: { v: Tab; label: string }[] = [{ v: 'today', label: 'Today' }, { v: 'breathe', label: 'Breathe' }, { v: 'skills', label: 'Skills' }, { v: 'recover', label: 'Recover' }, { v: 'journal', label: 'Journal' }, { v: 'trends', label: 'Trends' }, { v: 'evidence', label: 'Evidence' }];
type Item = 'mood' | 'stress' | 'energy' | 'motivation' | 'soreness' | 'sleepQ';
const ITEMS: { k: Item; q: string; lo: string; hi: string }[] = [
  { k: 'sleepQ', q: 'Sleep quality', lo: 'Awful', hi: 'Great' }, { k: 'energy', q: 'Energy', lo: 'Drained', hi: 'Fresh' }, { k: 'soreness', q: 'Muscle soreness', lo: 'None', hi: 'Very sore' },
  { k: 'stress', q: 'Stress', lo: 'Relaxed', hi: 'Very stressed' }, { k: 'mood', q: 'Mood', lo: 'Low', hi: 'Great' }, { k: 'motivation', q: 'Motivation to train', lo: 'None', hi: 'Fired up' },
];
const J_KINDS: { v: JournalKind; label: string }[] = [{ v: 'win', label: 'Win' }, { v: 'gratitude', label: 'Gratitude' }, { v: 'reflect', label: 'Reflect' }, { v: 'free', label: 'Free' }];
const PROMPTS: Record<JournalKind, string[]> = {
  win: ['What went well in training today?', 'One thing you did today that your future self will thank you for?', 'Where did you show discipline today, even in a small way?'],
  gratitude: ['Three good things that happened today, and why they happened.', 'Who helped you this week, and how?', 'What about your body are you grateful for today?'],
  reflect: ['What was hard today, and how did you respond?', 'What would you do differently next session?', 'What’s on your mind right now?'],
  free: ['Anything on your mind.'],
};
type Form = Partial<Pick<CheckIn, Item>> & { sleepH?: number; hrv?: number; rhr?: number; pain: Pain; ill: boolean; flags: RedFlag[]; note: string; sleepFrom?: 'log' | 'manual' };
const ST_LABEL = { ok: 'No safety flag', care: 'Adapted for you', doctor: 'Ask your doctor first', avoid: 'Skip it' } as const;
const st2cls = (s: keyof typeof ST_LABEL) => (s === 'ok' ? 'ok' : s === 'avoid' ? 'avoid' : 'doctor');

export default function Mind() {
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get('tab') as Tab) || 'today';
  const setTab = (v: Tab) => setSp(v === 'today' ? {} : { tab: v });
  const { data, profile, upsert, remove } = useStore();
  const toast = useToast();
  const today = todayKey();
  const plan = profile.mind || null;
  const q = plan?.quiz || defaultMindQuiz(profile);
  const minor = q.age < 18;
  const priv = !!q.privateJournal;
  const cis = useMemo(() => (data.checkins as CheckIn[]).filter((c) => !c.deleted).sort((a, b) => b.date.localeCompare(a.date)), [data.checkins]);
  const sessions = (data.mindsessions as MindSession[]).filter((s) => !s.deleted);
  const journal = useMemo(() => (data.journal as JournalEntry[]).filter((j) => !j.deleted).sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt), [data.journal]);
  const screens = (data.screens as ScreenResult[]).filter((s) => !s.deleted).sort((a, b) => b.date.localeCompare(a.date));
  const ws = useMemo(() => data.workouts.filter((w) => !w.deleted).map((w) => ({ id: w.id, date: w.date, type: w.type, durationSec: w.durationSec, rpe: w.rpe, title: w.title })) as (WLike & { id: string; title: string })[], [data.workouts]);
  const todayCi = cis.find((c) => c.date === today) || null;
  const logSleep = data.sleeps.find((s) => !s.deleted && s.date === today);
  const load = useMemo(() => loadSummary(ws, today), [ws, today]);
  const stats = mindStats(cis, sessions, journal, today);
  const watch = moodWatch(cis, today);

  // ---------------- check-in form ----------------
  const blank = (): Form => ({ pain: 'none', ill: false, flags: [], note: '', sleepH: logSleep?.hours, sleepFrom: logSleep ? 'log' : undefined });
  const [form, setForm] = useState<Form | null>(null);
  const [more, setMore] = useState(false);
  const f = form || blank();
  const setF = (x: Partial<Form>) => setForm({ ...f, ...x });
  const ready = ITEMS.every((i) => typeof f[i.k] === 'number');
  const preview = ready ? readiness({ ...(f as Required<Pick<CheckIn, Item>>), sleepH: f.sleepH, hrv: f.hrv, rhr: f.rhr, pain: f.pain, ill: f.ill, flags: f.flags, age: q.age }, baselines(cis, today), { hardYesterday: hardYesterday(ws, today) }) : null;
  const saveCheckIn = () => {
    if (!preview || !can('mind.checkin')) return;
    const c: Omit<CheckIn, 'updatedAt'> = {
      id: todayCi?.id || `ci-${today}`, date: today, mood: f.mood!, stress: f.stress!, energy: f.energy!, motivation: f.motivation!, soreness: f.soreness!, sleepQ: f.sleepQ!,
      ...(typeof f.sleepH === 'number' ? { sleepH: f.sleepH, sleepFrom: f.sleepFrom || 'manual' } : {}), ...(f.hrv ? { hrv: f.hrv } : {}), ...(f.rhr ? { rhr: f.rhr } : {}),
      pain: f.pain, ill: f.ill, flags: f.flags, ...(f.note.trim() ? { note: f.note.trim().slice(0, 500) } : {}), score: preview.score, rec: preview.rec, v: 1,
    };
    if (!validCheckIn(c)) { toast('Check the numbers — HRV 5–300 ms, resting HR 25–130, sleep 0–16 h'); return; }
    upsert('checkins', c as CheckIn); setForm(null); setMore(false);
    toast('Checked in');
  };
  const edit = () => { if (!todayCi) return; setForm({ mood: todayCi.mood, stress: todayCi.stress, energy: todayCi.energy, motivation: todayCi.motivation, soreness: todayCi.soreness, sleepQ: todayCi.sleepQ, sleepH: todayCi.sleepH, sleepFrom: todayCi.sleepFrom, hrv: todayCi.hrv, rhr: todayCi.rhr, pain: todayCi.pain || 'none', ill: !!todayCi.ill, flags: todayCi.flags || [], note: todayCi.note || '' }); setMore(!!(todayCi.hrv || todayCi.rhr || todayCi.pain !== 'none' || todayCi.ill || todayCi.flags?.length || todayCi.note)); };

  const CheckInForm = () => <Card className="mn-ci" >
    <div className="card-head"><div><div className="kicker">Daily check-in · ~20 seconds</div><h3>How are you today?</h3></div>{todayCi && <button className="btn sm ghost" onClick={() => setForm(null)}>Cancel</button>}</div>
    <div className="mn-items">{ITEMS.map((it) => <div key={it.k} className="field mn-item"><span id={`lbl-${it.k}`}>{it.q}</span>
      <div className="sl-q" role="radiogroup" aria-labelledby={`lbl-${it.k}`}>{[1, 2, 3, 4, 5].map((n) => <button key={n} role="radio" aria-checked={f[it.k] === n} aria-label={`${n} of 5${n === 1 ? `, ${it.lo}` : n === 5 ? `, ${it.hi}` : ''}`} className={f[it.k] === n ? 'on' : ''} data-testid={`ci-${it.k}-${n}`} onClick={() => setF({ [it.k]: n } as Partial<Form>)}>{n}</button>)}</div>
      <div className="mn-ends"><span>{it.lo}</span><span>{it.hi}</span></div></div>)}</div>
    <div className="mn-sleeprow">
      <label className="field"><span>Sleep last night (h)</span><input inputMode="decimal" data-testid="ci-sleepH" value={f.sleepH ?? ''} placeholder="e.g. 7.5" onChange={(e) => { const v = parseFloat(e.target.value.replace(',', '.')); setF({ sleepH: Number.isFinite(v) ? v : undefined, sleepFrom: 'manual' }); }} /></label>
      <span className="muted small">{f.sleepFrom === 'log' ? <><Icon name="moon" size={12} /> From your Sleep log</> : <Link to="/fuel/sleep?tab=log">Log sleep in Fuel › Sleep</Link>}</span>
    </div>
    <button className="btn ghost sm" aria-expanded={more} onClick={() => setMore(!more)}><Icon name={more ? 'minus' : 'plus'} size={14} />HRV, resting HR, pain, illness</button>
    {more && <div className="mn-more">
      <div className="grid2">
        <label className="field"><span>Morning HRV (rMSSD, ms) — optional</span><input inputMode="numeric" value={f.hrv ?? ''} onChange={(e) => setF({ hrv: +e.target.value || undefined })} /></label>
        <label className="field"><span>Resting heart rate — optional</span><input inputMode="numeric" value={f.rhr ?? ''} onChange={(e) => setF({ rhr: +e.target.value || undefined })} /></label>
      </div>
      <p className="muted small" style={{ margin: '0 0 10px' }}>HRV and resting HR only count once you have 5 readings in a week, compared with your own average.</p>
      <div className="field"><span>Pain or injury</span><div className="chips">{([['none', 'None'], ['niggle', 'A niggle'], ['sharp', 'Sharp / getting worse']] as [Pain, string][]).map(([v, l]) => <button key={v} className={`chip ${f.pain === v ? 'on' : ''}`} aria-pressed={f.pain === v} onClick={() => setF({ pain: v })}>{l}</button>)}</div></div>
      <label className="toggle"><span><b>Feeling ill</b><div className="muted small">Cold, flu, stomach bug</div></span><input type="checkbox" checked={f.ill} onChange={(e) => setF({ ill: e.target.checked })} style={{ width: 22, height: 22, accentColor: '#FFE600' }} /></label>
      <div className="field"><span>Any of these? (stop and get checked)</span>{RED_FLAGS.map((r) => <label key={r.v} className="mn-flag"><input type="checkbox" checked={f.flags.includes(r.v)} onChange={(e) => setF({ flags: e.target.checked ? [...f.flags, r.v] : f.flags.filter((x) => x !== r.v) })} />{r.label}</label>)}</div>
      <label className="field"><span>Note (optional)</span><input maxLength={500} value={f.note} onChange={(e) => setF({ note: e.target.value })} placeholder="Anything worth remembering" /></label>
    </div>}
    <div className="mn-save">
      {preview && <span className="muted small">Readiness {preview.score} · {REC_LABEL[preview.rec]}</span>}
      <button className="btn y" disabled={!ready} data-testid="ci-save" onClick={saveCheckIn}>{ready ? 'Save check-in' : `Answer ${ITEMS.filter((i) => typeof f[i.k] !== 'number').length} more`}</button>
    </div>
  </Card>;

  const ReadinessCard = ({ c }: { c: CheckIn }) => {
    const r = readiness({ ...c, age: q.age }, baselines(cis, c.date), { hardYesterday: hardYesterday(ws, c.date) });
    const flagged = RED_FLAGS.filter((x) => c.flags?.includes(x.v));
    return <Card className="wl-hero mn-ready" >
      <div className="mn-ready-top" data-testid="mind-readiness">
        <Ring score={r.score} rec={r.rec} />
        <div style={{ minWidth: 0 }}>
          <div className="kicker">Readiness · today</div>
          <h2 className={`mn-rec ${r.rec}`}>{REC_LABEL[r.rec]}</h2>
          <p className="small" style={{ margin: 0, lineHeight: 1.5 }}>{REC_TEXT[r.rec]}</p>
        </div>
      </div>
      {flagged.length > 0 && <div className="mn-flags-out">{flagged.map((x) => <Banner key={x.v} tone="warn"><b>{x.label}.</b> {x.action}{x.emergency && <> <a href="tel:911">Call 911</a></>} <SrcPills ids={x.src} /></Banner>)}</div>}
      {c.pain === 'sharp' && !flagged.length && <Banner tone="warn">Sharp or worsening pain: don’t train through it. Rest the area and see a clinician (physio, sports doctor) if it isn’t clearly improving in a few days. <SrcPills ids={['mind-aaos-sprain', 'mind-cheung']} /></Banner>}
      {r.overrides.length > 0 && <p className="small" style={{ margin: '10px 0 0' }}><b>Why the override:</b> {r.overrides.join(' · ')}</p>}
      {r.notes.map((n) => <p key={n} className="small" style={{ margin: '8px 0 0' }}>{n} <Link to="/mind/breathe/sigh">Breathe 5 min →</Link></p>)}
      {crisisInText(c.note) && <CrisisCard minor={minor} />}
      <details className="mn-why">
        <summary>What moved your score</summary>
        {r.factors.length ? <ul className="mn-factors">{r.factors.map((x) => <li key={x.label}><span>{x.label}</span><b>{x.points}</b><small>{x.why}</small></li>)}</ul> : <p className="small">Nothing pulled your score down today.</p>}
        <p className="muted small">Score = your six 1–5 answers (sleep, soreness, energy 20% each; stress, mood 15%; motivation 10%), then −5 to −15 for short sleep, −10 if HRV is well below your week, −5 for a high resting HR and −5 after a hard session yesterday. ≥ 70 train as planned · 50–69 go easier · under 50 recover.</p>
        <SrcPills ids={r.src} />
      </details>
      <p className="muted small mn-heur"><Pill tone="dim">Heuristic</Pill> A HYBRD rule of thumb built from validated wellness questions — not a medical measure or a prediction of injury. How you feel on the day wins.</p>
      <div className="row wrap" style={{ gap: 8 }}><button className="btn sm" onClick={edit}><Icon name="edit" size={14} />Edit check-in</button><Link className="btn sm ghost" to="/coach">Today’s plan</Link></div>
    </Card>;
  };

  // ---------------- HYBRD Pulse cards ----------------
  const pulsePts = pulseTrend(screens, 8);
  const lastPulse = pulsePts[pulsePts.length - 1];
  const HistoryList = (n: number) => <ul className="mn-hist" data-testid="pulse-history">{screens.slice(0, n).map((s) => { const o = screenOutcome(s, minor); const pr = pulseScore(s.pulse); return <li key={s.id}>
    <span>{prettyDay(s.date)}</span>{pr ? <span className="mono">Pulse {pr.score}</span> : isLegacyScreen(s) ? <span className="muted">Older format (retired)</span> : null}
    <span className={`mn-lvl ${o.level}`}>{o.title}</span>{s.localOnly && <Icon name="lock" size={12} />}
    <button className="icon-btn" aria-label="Delete check-in" onClick={() => remove('screens', s.id)}><Icon name="trash" size={14} /></button></li>; })}</ul>;
  const PulseCard = (onToday: boolean) => <Card>
    <div className="kicker">Weekly · ~1 minute · optional</div>
    <h3>HYBRD Pulse</h3>
    <p className="muted small" style={{ margin: '2px 0 8px' }}>Six questions in HYBRD’s own words about your energy, sleep, mood, stress, drive and recovery over the past week. A trend to reflect on — not a test or a diagnosis.</p>
    {lastPulse && <div className="pl-lastrow"><PulseDial score={lastPulse.score} band={lastPulse.band} size={64} /><span className="small">Last Pulse <b>{lastPulse.score}</b> · {PULSE_BAND[lastPulse.band].label}<br /><span className="muted">{prettyDay(lastPulse.date)}</span></span></div>}
    <div className="row wrap" style={{ gap: 8 }}><button className="btn sm" data-testid={onToday ? 'mind-checkup-open' : 'mind-pulse-open'} onClick={openScreen}>{lastPulse ? 'Take this week’s Pulse' : 'Take your first Pulse'}</button>{pulsePts.length > 1 && <Link className="btn sm ghost" to="/mind?tab=trends">Trend</Link>}</div>
    {!onToday && screens.length > 0 && HistoryList(5)}
  </Card>;

  // ---------------- Today ----------------
  const nextProg = PROGRAMS.map((p) => ({ p, pr: programProgress(sessions, p.id, p.days.length) })).find((x) => x.pr.done.size > 0 && x.pr.next !== null);
  const deload = deloadSignal(ws, cis, today);
  const TodayTab = () => <div className="sl-grid">
    <div className="stack">
      {!plan && <Card className="mn-setup">
        <div className="kicker">Mind & Recovery</div>
        <h3>Train your head like you train your body</h3>
        <p className="muted small" style={{ margin: '4px 0 10px' }}>A 1-minute setup tailors breathing, recovery and cold/heat advice to your health and goal. You can check in right away.</p>
        <Link className="btn y sm" to="/mind/setup" data-testid="mind-setup-start">Set up · 1 min</Link>
      </Card>}
      {watch === 'professional' && <Banner tone="warn"><b>Your mood has been low on most days for two weeks.</b> That’s worth talking about with {minor ? 'a parent, school counselor or your doctor' : 'your doctor or a mental-health professional'} — support works. If you’re struggling right now, call or text 988. <SrcPills ids={['mind-nimh-caring', 'mind-988']} /></Banner>}
      {watch === 'notice' && <Banner tone="info">Low mood a few days running. Be kind to yourself: sleep, an easy session outdoors, time with people. If it lasts two weeks or more, talk to someone. <SrcPills ids={['mind-nimh-caring', 'mind-noetel']} /></Banner>}
      {(form || !todayCi) ? CheckInForm() : ReadinessCard({ c: todayCi })}
      <Card>
        <div className="card-head"><h3>Quick reset</h3><button className="btn sm ghost" onClick={() => setTab('breathe')}>All</button></div>
        <div className="mn-quick">{PATTERNS.map((p) => <Link key={p.id} to={`/mind/breathe/${p.id}`} className="mn-qt"><b>{p.name}</b><span>{p.minutes} min</span></Link>)}</div>
      </Card>
    </div>
    <div className="stack">
      <Card>
        <div className="card-head"><div><div className="kicker">From your workouts</div><h3>Training load · 7 days</h3></div><Link className="btn sm ghost" to="/mind?tab=recover">Recover</Link></div>
        <div className="grid4 mn-stats">
          <div className="stat"><div className="stat-v">{load.acute7}</div><div className="stat-l">load (RPE×min)</div></div>
          <div className="stat"><div className="stat-v">{load.sessions7}</div><div className="stat-l">sessions</div></div>
          <div className="stat"><div className="stat-v">{load.ratio ?? '—'}</div><div className="stat-l">vs recent normal</div></div>
          <div className="stat"><div className="stat-v">{load.monotony ?? '—'}</div><div className="stat-l">monotony</div></div>
        </div>
        <p className="small" style={{ margin: '8px 0 0' }}>{load.band ? BAND_TEXT[load.band] : load.historyDays < 28 ? `Comparison to your normal unlocks after 4 weeks of logging (${load.historyDays} days so far).` : 'Log a few sessions to compare.'}</p>
        {load.estimated > 0 && <p className="muted small" style={{ margin: '4px 0 0' }}>{load.estimated} session{load.estimated > 1 ? 's' : ''} without an RPE used a typical value — add RPE when you log for a better number.</p>}
        <p className="muted small" style={{ margin: '4px 0 0' }}>The ratio is context, not an injury predictor <MGrade g="weak" /></p>
        <SrcPills ids={['foster', 'mind-haddad', 'mind-impellizzeri']} />
      </Card>
      {deload.suggest && <Banner tone="yellow"><b>Time for a lighter week?</b> {deload.reasons.join(', ')}. <Link to="/mind?tab=recover">How to deload →</Link></Banner>}
      {nextProg && <Card><div className="kicker">Continue</div><h3>{nextProg.p.name}</h3><p className="muted small" style={{ margin: '2px 0 10px' }}>Day {nextProg.pr.next} · {nextProg.p.days[(nextProg.pr.next || 1) - 1].title}</p><div className="mn-prog-bar"><i style={{ width: `${nextProg.pr.pct}%` }} /></div><Link className="btn sm y" style={{ marginTop: 10 }} to={`/mind/program/${nextProg.p.id}`}>Open day {nextProg.pr.next}</Link></Card>}
      <Card>
        <div className="card-head"><h3>Your streak</h3><Link className="btn sm ghost" to="/mind?tab=trends">Trends</Link></div>
        <div className="grid4 mn-stats">
          <div className="stat"><div className="stat-v">{stats.streak}</div><div className="stat-l">day check-in streak</div></div>
          <div className="stat"><div className="stat-v">{stats.best}</div><div className="stat-l">best</div></div>
          <div className="stat"><div className="stat-v">{stats.minutes7}</div><div className="stat-l">mind min · 7 d</div></div>
          <div className="stat"><div className="stat-v">{stats.journal7}</div><div className="stat-l">journal · 7 d</div></div>
        </div>
      </Card>
      {PulseCard(true)}
      <p className="muted small">{MIND_TIPS[new Date().getDate() % MIND_TIPS.length].text} <SrcPills ids={MIND_TIPS[new Date().getDate() % MIND_TIPS.length].src} /></p>
    </div>
  </div>;

  // ---------------- Breathe ----------------
  const BreatheTab = () => <div className="stack">
    <div className="mn-tiles">{PATTERNS.map((p) => { const s = toolStatus(p.tool, q); return <Link key={p.id} to={`/mind/breathe/${p.id}`} className="tile mn-tile" data-testid={`mind-pattern-${p.id}`}>
      <div className="row" style={{ justifyContent: 'space-between', gap: 6 }}><MGrade g={p.grade} />{s.status !== 'ok' && <span className={`sl-st ${st2cls(s.status)}`}>{ST_LABEL[s.status]}</span>}</div>
      <h3>{p.name}</h3><p className="muted small" style={{ margin: 0 }}>{p.short}</p>
      <div className="meta"><Pill>{p.segments ? `${p.minutes} min routine` : `${p.minutes} min`}</Pill>{p.holds && <Pill tone="dim">breath-holds</Pill>}</div>
    </Link>; })}</div>
    <Card>
      <h3>Which one when?</h3>
      <ul className="cues">
        <li><b>Stressed or wired after work:</b> cyclic sighing, 5 min. <MGrade g="moderate" /></li>
        <li><b>Winding down / evening:</b> resonance breathing, 10 min. <MGrade g="moderate" /></li>
        <li><b>Before a race or test:</b> pre-race calm, 10–20 min before the start. <MGrade g="limited" /></li>
        <li><b>Quick reset between sets:</b> box breathing, a minute or two. <MGrade g="limited" /></li>
      </ul>
      <p className="muted small" style={{ marginBottom: 0 }}>Breathwork lowers stress a little on average; it’s a tool, not a cure. Stop if you feel dizzy, tingly or more anxious.</p>
      <SrcPills ids={['mind-fincham', 'mind-balban', 'mind-laborde', 'mind-rottger', 'mind-bentley']} />
    </Card>
  </div>;

  // ---------------- Skills ----------------
  const SkillsTab = () => <div className="stack">
    <div className="mn-tiles">{PROGRAMS.map((p) => { const pr = programProgress(sessions, p.id, p.days.length); return <Link key={p.id} to={`/mind/program/${p.id}`} className="tile mn-tile" data-testid={`mind-program-${p.id}`}>
      <div className="row" style={{ justifyContent: 'space-between' }}><span className="mn-ic"><Icon name={p.icon} size={18} /></span><span className="muted small">{p.days.length} days · {pr.done.size}/{p.days.length}</span></div>
      <h3>{p.name}</h3><p className="muted small" style={{ margin: 0 }}>{p.short}</p>
      <div className="mn-prog-bar"><i style={{ width: `${pr.pct}%` }} /></div>
      <div className="meta"><Pill>{p.for}</Pill></div>
    </Link>; })}</div>
    {PulseCard(false)}
  </div>;

  // ---------------- Recover ----------------
  const [competing, setCompeting] = useState(false);
  const RecoverTab = () => {
    const rp = recoveryPlan(ws, Date.now(), q, profile.weightKg || 75, competing);
    const ch = coldHeatAdvice(q.goal, rp.session?.type || null, q, competing);
    return <div className="sl-grid">
      <div className="stack">
        <Card className="wl-hero">
          <div className="kicker">Recovery planner</div>
          <h3>{rp.session ? `After: ${rp.session.title || rp.session.type}` : 'No hard session in the last 48 h'}</h3>
          {rp.session && <p className="muted small" style={{ margin: '2px 0 0' }}>{rp.hoursAgo < 1 ? 'Just finished' : `${rp.hoursAgo} h ago`} · {Math.round(rp.session.durationSec / 60)} min{rp.session.rpe ? ` · RPE ${rp.session.rpe}` : ''}{rp.backToBack ? ' · back-to-back hard days' : ''}</p>}
          <label className="toggle mn-mini" style={{ marginTop: 8 }}><span>Racing or another hard session within 24 h</span><input type="checkbox" checked={competing} onChange={(e) => setCompeting(e.target.checked)} /></label>
          <ol className="sl-tl mn-tl" data-testid="mind-recovery-plan">{rp.steps.map((s) => <li key={s.id}><span className="t">{s.when}</span><span className="dot" aria-hidden="true" /><div><b>{s.title}{s.practical && <> <Pill tone="dim">HYBRD default</Pill></>}</b><p>{s.detail}</p>{s.link && <Link className="rl" to={s.link}>Open →</Link>}<SrcPills ids={s.src} /></div></li>)}</ol>
        </Card>
        <Card>
          <h3>Recovery routines</h3>
          <div className="mn-routines">{ROUTINES.map((r) => <Link key={r.id} to={`/mind/routine/${r.id}`} className="mn-rt" data-testid={`mind-routine-${r.id}`}><div><b>{r.name}</b><span>{r.for}</span></div><span className="mono">{Math.round(routineSec(r) / 60)} min</span></Link>)}</div>
        </Card>
        <Card>
          <h3>Soreness or injury?</h3>
          <ul className="cues"><li><b>Normal soreness (DOMS):</b> dull, both sides, worst 24–72 h after new or hard work, eases as you warm up.</li><li><b>Get it checked:</b> sharp or one-sided pain, a pop, fast swelling, can’t bear weight, pain that builds in one bony spot, or pain that changes how you move.</li></ul>
          <SrcPills ids={['mind-cheung', 'mind-aaos-sprain', 'mind-aaos-stress']} />
        </Card>
      </div>
      <div className="stack">
        <Card>
          <h3>Cold & heat guide</h3>
          <div className="mn-ch"><div className="row" style={{ justifyContent: 'space-between', gap: 8 }}><b>Cold water</b><span className={`sl-st ${st2cls(ch.cold.status)}`}>{ST_LABEL[ch.cold.status]}</span></div><p className="verdict">{ch.cold.verdict}</p><p className="small">{ch.cold.detail}</p><SrcPills ids={ch.cold.src} /></div>
          <div className="mn-ch"><div className="row" style={{ justifyContent: 'space-between', gap: 8 }}><b>Sauna / heat</b><span className={`sl-st ${st2cls(ch.heat.status)}`}>{ST_LABEL[ch.heat.status]}</span></div><p className="verdict">{ch.heat.verdict}</p><p className="small">{ch.heat.detail}</p><SrcPills ids={ch.heat.src} /></div>
          <ul className="cues small">{COLD_HEAT_SAFETY.map((s) => <li key={s}>{s}</li>)}</ul>
          <SrcPills ids={['mind-tipton', 'mind-laukkanen']} />
        </Card>
        <Card>
          <div className="card-head"><h3>Deload</h3>{deload.suggest ? <Pill tone="yellow">Suggested</Pill> : <Pill tone="dim">Not needed yet</Pill>}</div>
          <p className="small" style={{ marginTop: 0 }}>{deload.reasons.length ? `Signals: ${deload.reasons.join(', ')}.` : 'No signals right now.'} {deload.weeksSinceLight !== null && `Weeks since a lighter week: ${deload.weeksSinceLight >= 8 ? '8+' : deload.weeksSinceLight}.`}</p>
          <ul className="cues">{DELOAD_HOW.map((s) => <li key={s}>{s}</li>)}</ul>
          <p className="muted small" style={{ margin: 0 }}>Suggested when it’s been 4+ weeks since a lighter week and another signal shows up (low readiness, high soreness or low motivation). A practice-based default, not a tested rule <MGrade g="limited" /></p>
          <SrcPills ids={deload.src} />
        </Card>
        <Card>
          <h3>Load this week</h3>
          <div className="mn-load" aria-label="Daily training load, last 14 days">{load.daily.slice(14).map((v, i) => { const max = Math.max(1, ...load.daily.slice(14)); return <div key={i} className="c"><div className="bar"><div style={{ height: `${(v / max) * 100}%` }} /></div></div>; })}</div>
          <p className="muted small" style={{ margin: '6px 0 0' }}>Last 14 days of session RPE × minutes. Strain {load.strain ?? '—'} · monotony {load.monotony ?? '—'} (above ~2 means few easy days).</p>
          <SrcPills ids={['foster', 'mind-foster1998']} />
        </Card>
      </div>
    </div>;
  };

  // ---------------- Journal ----------------
  const [jKind, setJKind] = useState<JournalKind>('win');
  const [jText, setJText] = useState('');
  const [jEdit, setJEdit] = useState<JournalEntry | null>(null);
  const [jCrisis, setJCrisis] = useState(false);
  const [pIdx, setPIdx] = useState(0);
  const prompt = PROMPTS[jKind][pIdx % PROMPTS[jKind].length];
  const saveJournal = () => {
    const t = jText.trim(); if (!t || !can('mind.journal')) return;
    const e: Omit<JournalEntry, 'updatedAt'> = jEdit ? { ...jEdit, kind: jKind, text: t.slice(0, JOURNAL_MAX) } : { id: uid(), date: today, kind: jKind, text: t.slice(0, JOURNAL_MAX), prompt, ...(priv ? { localOnly: true } : {}) };
    upsert('journal', e as JournalEntry);
    setJCrisis(crisisInText(t)); setJText(''); setJEdit(null); toast('Saved to your journal');
  };
  const JournalTab = () => <div className="sl-grid">
    <div className="stack">
      {jCrisis && <CrisisCard title="Thank you for writing that down. Please reach out now." minor={minor} />}
      <Card>
        <div className="card-head"><h3>{jEdit ? 'Edit entry' : 'New entry'}</h3><span className="muted small"><Icon name="lock" size={12} /> {priv ? 'This device only' : 'Private · owner-only sync'}</span></div>
        <Segmented small value={jKind} onChange={(v) => { setJKind(v); setPIdx(0); }} options={J_KINDS} />
        <div className="mn-prompt"><span>{prompt}</span>{PROMPTS[jKind].length > 1 && <button className="icon-btn" aria-label="Another prompt" onClick={() => setPIdx(pIdx + 1)}><Icon name="refresh" size={14} /></button>}</div>
        <textarea className="mn-text" rows={5} maxLength={JOURNAL_MAX} value={jText} onChange={(e) => setJText(e.target.value)} placeholder="Write freely…" aria-label="Journal entry" data-testid="mind-journal-text" />
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}><span className="muted small">{jText.length}/{JOURNAL_MAX}</span><div className="row" style={{ gap: 8 }}>{jEdit && <button className="btn sm ghost" onClick={() => { setJEdit(null); setJText(''); }}>Cancel</button>}<button className="btn y sm" disabled={!jText.trim()} data-testid="mind-journal-save" onClick={saveJournal}>Save</button></div></div>
      </Card>
      <Card>
        <h3>Why write?</h3>
        <ul className="cues small"><li>Logging wins and progress helps you reach goals. <MGrade g="strong" /></li><li>“Three good things” and gratitude give a small well-being lift. <MGrade g="limited" /></li><li>Writing through a bad race or week has a small average benefit. <MGrade g="limited" /></li></ul>
        <SrcPills ids={['mind-harkin', 'mind-seligman', 'mind-davis-grat', 'mind-frattaroli']} />
      </Card>
    </div>
    <div className="stack">
      <Card>
        <div className="card-head"><h3>Entries</h3><span className="muted small">{journal.length}</span></div>
        {!journal.length && <p className="muted small" style={{ margin: 0 }}>Nothing yet. One line a day is plenty.</p>}
        <div className="mn-entries" data-testid="mind-journal-list">{journal.slice(0, 40).map((j) => <div key={j.id} className="mn-entry">
          <div className="mn-entry-h"><span className="kicker">{prettyDay(j.date)} · {J_KINDS.find((k) => k.v === j.kind)?.label}{j.program ? ` · ${PROGRAMS.find((p) => j.program!.startsWith(p.id))?.name || 'Program'}` : ''}</span>{j.localOnly && <Icon name="lock" size={12} />}
            <button className="icon-btn" aria-label="Edit entry" onClick={() => { setJEdit(j); setJKind(j.kind); setJText(j.text); }}><Icon name="edit" size={14} /></button>
            <button className="icon-btn" aria-label="Delete entry" onClick={() => { remove('journal', j.id); toast('Entry deleted'); }}><Icon name="trash" size={14} /></button></div>
          {j.prompt && <div className="muted small">{j.prompt}</div>}
          <p>{j.text}</p>
        </div>)}</div>
      </Card>
    </div>
  </div>;

  // ---------------- Trends ----------------
  const [span, setSpan] = useState<'14' | '30'>('14');
  const TrendsTab = () => {
    const n = +span, tr = trend(cis, today, n), logged = tr.filter((d) => d.score !== null).length;
    const pats = patterns(cis.filter((c) => c.date > addDaysLocal(today, -90)), ws);
    return <div className="sl-grid">
      <div className="stack">
        <Card>
          <div className="card-head"><h3>Readiness</h3><Segmented small value={span} onChange={setSpan} options={[{ v: '14', label: '14 days' }, { v: '30', label: '30 days' }]} /></div>
          {logged < 3 ? <p className="muted small">Check in on a few more days to see your trend ({logged} so far).</p> : <>
            <div className={`mn-trend n${n}`} data-testid="mind-trend">{tr.map((d) => <div key={d.day} className="c" title={`${prettyDay(d.day)}: ${d.score ?? '—'}`}>
              <div className="bar"><em style={{ bottom: '70%' }} /><em className="lo" style={{ bottom: '50%' }} />{d.score !== null && <div className={d.rec || ''} style={{ height: `${d.score}%` }} />}</div>
              {n === 14 && <span>{new Date(d.day + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'narrow' })}</span>}</div>)}</div>
            <p className="muted small" style={{ margin: '8px 0 0' }}>Lines at 70 (train as planned) and 50 (recover below). Yellow = go, orange = easier, grey = recovery, red = stop.</p>
          </>}
        </Card>
        <Card>
          <h3>Mood & stress</h3>
          {logged < 3 ? <p className="muted small">Not enough data yet.</p> : <div className="mn-ms" aria-label="Mood and stress by day">{tr.slice(-14).map((d) => <div key={d.day} className="c"><i className="m" style={{ opacity: d.mood ? 0.25 + d.mood * 0.15 : 0.08 }} title={`Mood ${d.mood ?? '—'}`} /><i className="s" style={{ opacity: d.stress ? 0.25 + d.stress * 0.15 : 0.08 }} title={`Stress ${d.stress ?? '—'}`} /></div>)}</div>}
          <p className="muted small" style={{ margin: '8px 0 0' }}>Top row mood, bottom row stress (last 14 days) — brighter = higher. 7-day average: mood {stats.avgMood7 ?? '—'}, stress {stats.avgStress7 ?? '—'}.</p>
        </Card>
      </div>
      <div className="stack">
        <Card>
          <h3>Streaks</h3>
          <div className="grid4 mn-stats">
            <div className="stat"><div className="stat-v">{stats.streak}</div><div className="stat-l">check-in streak</div></div>
            <div className="stat"><div className="stat-v">{stats.best}</div><div className="stat-l">best streak</div></div>
            <div className="stat"><div className="stat-v">{stats.last14}<small>/14</small></div><div className="stat-l">days logged</div></div>
            <div className="stat"><div className="stat-v">{stats.avgScore7 ?? '—'}</div><div className="stat-l">avg readiness · 7 d</div></div>
            <div className="stat"><div className="stat-v">{stats.sessions7}</div><div className="stat-l">mind sessions · 7 d</div></div>
            <div className="stat"><div className="stat-v">{stats.minutes7}</div><div className="stat-l">minutes · 7 d</div></div>
          </div>
        </Card>
        <Card>
          <h3>Your patterns</h3>
          {!pats.length ? <p className="muted small" style={{ margin: 0 }}>Patterns appear once there are at least 3 check-ins on each side of a comparison (e.g. 3 nights under 7 h and 3 nights over).</p>
            : <ul className="mn-pats" data-testid="mind-patterns">{pats.map((p) => <li key={p.id}><b>{p.label}</b><div><span>{p.aLabel}: <b>{p.a}</b> <small>({p.na} days)</small></span><span>{p.bLabel}: <b>{p.b}</b> <small>({p.nb} days)</small></span></div></li>)}</ul>}
          <p className="muted small" style={{ margin: '8px 0 0' }}>Average readiness on each kind of day, from your own check-ins (last 90 days). A pattern, not proof — lots of things change at once.</p>
        </Card>
        <Card>
          <div className="card-head"><div><div className="kicker">Weekly · your own words, your own trend</div><h3>HYBRD Pulse</h3></div><button className="btn sm" onClick={openScreen}>New Pulse</button></div>
          {pulsePts.length < 2 ? <p className="muted small">{pulsePts.length ? 'One Pulse so far — your trend appears after the next one.' : 'Take a Pulse once a week to see your trend here.'}</p> : <>
            <PulseTrendChart pts={pulsePts} />
            <div className="pl-legend">{(Object.keys(PULSE_BAND) as (keyof typeof PULSE_BAND)[]).map((b) => <span key={b}><i className={b} />{PULSE_BAND[b].label}</span>)}</div>
            <p className="muted small" style={{ margin: '8px 0 0' }}>Average of your last {pulsePts.length}: <b>{Math.round(pulsePts.reduce((a, p) => a + p.score, 0) / pulsePts.length)}</b>. A trend for you to reflect on — not a clinical measure.</p>
          </>}
          {screens.length > 0 && HistoryList(8)}
          <PulseDisclaimer minor={minor} compact />
        </Card>
      </div>
    </div>;
  };

  // ---------------- Evidence ----------------
  const [cat, setCat] = useState<MindEvCat>('breath');
  const EvidenceTab = () => <div className="stack" data-testid="mind-evidence">
    <Card>
      <h3 style={{ marginBottom: 6 }}>How we grade</h3>
      <div className="row wrap" style={{ gap: 8 }}>{GRADES.map((g) => <MGrade key={g} g={g} />)}</div>
      <ul className="cues" style={{ marginTop: 10 }}>{GRADES.map((g) => <li key={g}><b>{GRADE_LABEL[g]}:</b> {GRADE_HINT[g]}</li>)}</ul>
    </Card>
    <div className="wl-tabs"><Segmented small value={cat} onChange={setCat} options={MIND_EV_CATS} /></div>
    <div className="sl-ev">{MIND_EVIDENCE.filter((e) => e.cat === cat).map((e) => <Card key={e.id}>
      <MGrade g={e.grade} /><h3>{e.title}</h3><p className="verdict">{e.verdict}</p>
      <p className="small" style={{ margin: 0, lineHeight: 1.55 }}>{e.detail}</p>
      {e.howTo && <p className="small" style={{ margin: '8px 0 0' }}><b>How:</b> {e.howTo}</p>}
      {e.caution && <p className="small" style={{ margin: '8px 0 0' }}><b>Caution:</b> {e.caution}</p>}
      <SrcPills ids={e.src} />
    </Card>)}</div>
    {cat === 'safety' && <Card><h3>Check-in tools & licences</h3><ul className="cues small">
      <li><b>HYBRD Pulse:</b> an original HYBRD tool — questions, emoji scale, scoring and bands written by HYBRD. No third-party licence. It’s for general wellness and self-reflection only: not validated, not a screening test and not a diagnosis.</li>
      <li><b>Optional PHQ-2 / GAD-2:</b> Developed by Drs. Robert L. Spitzer, Janet B.W. Williams, Kurt Kroenke and colleagues, with an educational grant from Pfizer Inc. No permission required to reproduce, translate, display or distribute.</li>
      <li>HYBRD never diagnoses. Low scores only suggest being kind to yourself and, if it lasts, talking to someone.</li></ul><SrcPills ids={['mind-fda-wellness', 'mind-phq']} /></Card>}
    <Card><h3>All sources ({MIND_SOURCE_IDS.length})</h3><ol className="wl-src" data-testid="mind-sources">{MIND_SOURCE_IDS.map((id) => { const s = sourceById(id); return s ? <li key={id}><a href={s.url} target="_blank" rel="noopener">{s.cite}</a></li> : null; })}</ol></Card>
  </div>;

  // ---------------- HYBRD Pulse sheet ----------------
  const [scrOpen, setScrOpen] = useState(false);
  const [pulse, setPulse] = useState<(number | undefined)[]>([]);
  const [addPhq, setAddPhq] = useState(false);
  const [phq, setPhq] = useState<(number | undefined)[]>([]);
  const [safety, setSafety] = useState<SafetyAnswer | undefined>();
  const [scrDone, setScrDone] = useState<ScreenResult | null>(null);
  function openScreen() { setPulse([]); setAddPhq(false); setPhq([]); setSafety(undefined); setScrDone(null); setScrOpen(true); }
  const pulseLeft = PULSE_ITEMS.filter((_, i) => typeof pulse[i] !== 'number').length;
  const scrReady = pulseLeft === 0 && (!addPhq || PHQ4_ITEMS.every((_, i) => typeof phq[i] === 'number')) && !!safety;
  const saveScreen = () => {
    if (!scrReady || !can('mind.screening')) return;
    const s: Omit<ScreenResult, 'updatedAt'> = { id: uid(), date: today, v: 2, pulse: pulse as number[], ...(addPhq ? { phq4: phq as number[] } : {}), safety, ...(priv ? { localOnly: true } : {}) };
    upsert('screens', s as ScreenResult); setScrDone(s as ScreenResult);
  };
  const outcome = scrDone ? screenOutcome(scrDone, minor) : null;
  const prevPulse = scrDone ? pulsePts.filter((p) => p.id !== scrDone.id).slice(-1)[0] : undefined;
  const ScreenSheet = <Sheet open={scrOpen} onClose={() => setScrOpen(false)} title="HYBRD Pulse">
    <div className="pl-sheet sl-root" data-testid="mind-checkup">
      {!scrDone ? <>
        <p className="muted small">Six quick questions about <b>the past 7 days</b> — about a minute. Tap the face that fits best. Answers are private{priv ? ' and stay on this device' : ''}.</p>
        <PulseDisclaimer minor={minor} compact />
        {PULSE_ITEMS.map((_, i) => <PulseQuestion key={i} i={i} value={pulse[i]} onChange={(v) => setPulse((cur) => { const n = [...cur]; n[i] = v; return n; })} />)}
        <div className="mn-sq"><p><b>{SAFETY_Q}</b></p><div className="chips">{([['no', 'No'], ['yes', 'Yes'], ['skip', 'Prefer not to say']] as [SafetyAnswer, string][]).map(([v, l]) => <button key={v} className={`chip ${safety === v ? 'on' : ''}`} aria-pressed={safety === v} data-testid={`scr-safety-${v}`} onClick={() => setSafety(v)}>{l}</button>)}</div>
          <p className="muted small" style={{ margin: '4px 0 0' }}>We ask because asking is safe and helps people get support. <SrcPills ids={['mind-dazzi']} /></p></div>
        {safety === 'yes' && <CrisisCard minor={minor} />}
        <details className="pl-opt" open={addPhq} onToggle={(e) => setAddPhq((e.currentTarget as HTMLDetailsElement).open)}>
          <summary data-testid="pulse-add-phq">Optional: add 4 standard mood & worry questions <span>(PHQ-2 / GAD-2)</span></summary>
          <div className="kicker" style={{ marginTop: 10 }}>Over the last 2 weeks, how often have you been bothered by…</div>
          {PHQ4_ITEMS.map((it, i) => <div key={it} className="mn-sq"><p>{it}</p><div className="chips">{PHQ4_SCALE.map((o) => <button key={o.v} className={`chip ${phq[i] === o.v ? 'on' : ''}`} aria-pressed={phq[i] === o.v} onClick={() => setPhq((cur) => { const n = [...cur]; n[i] = o.v; return n; })}>{o.label}</button>)}</div></div>)}
          <p className="muted small">PHQ-2/GAD-2 developed by Drs. Robert L. Spitzer, Janet B.W. Williams, Kurt Kroenke and colleagues, with an educational grant from Pfizer Inc. A screen, never a diagnosis.</p>
        </details>
        <button className="btn y block" disabled={!scrReady} data-testid="scr-save" onClick={saveScreen}>{scrReady ? 'See my Pulse' : pulseLeft ? `Answer ${pulseLeft} more` : 'Answer the last question'}</button>
      </> : outcome && <div className={`mn-out ${outcome.level}`} data-testid={`scr-out-${outcome.level}`}>
        {outcome.pulse && <div className="pl-hero" data-testid="pulse-result">
          <PulseDial score={outcome.pulse.score} band={outcome.pulse.band} />
          <div style={{ minWidth: 0 }}>
            <div className="kicker">Your Pulse · past 7 days</div>
            <h3>{PULSE_BAND[outcome.pulse.band].label}</h3>
            <p className="small">{PULSE_BAND[outcome.pulse.band].text}</p>
            {prevPulse && <span className={`pl-delta ${outcome.pulse.score >= prevPulse.score ? 'up' : ''}`}>{outcome.pulse.score - prevPulse.score >= 0 ? '+' : ''}{outcome.pulse.score - prevPulse.score} since {prettyDay(prevPulse.date)}</span>}
          </div>
        </div>}
        {outcome.level !== 'ok' && <h3 className={outcome.level === 'crisis' ? '' : 'pl-title'}>{outcome.title}</h3>}
        {outcome.pulse && outcome.level !== 'crisis' && <><PulseBreakdown r={outcome.pulse} /><div className="kicker" style={{ marginTop: 8 }}>Focus this week</div><PulseFocus r={outcome.pulse} /></>}
        {outcome.lines.filter((l) => !/^Pulse \d/.test(l)).map((l) => <p key={l} className="small">{l}</p>)}
        <SrcPills ids={outcome.src} />
        {outcome.level === 'crisis' && <CrisisCard minor={minor} title="Reach out now" />}
        {outcome.level === 'professional' && <CrisisCard minor={minor} title="Support is available any time" />}
        {outcome.level === 'watch' && outcome.support && <PulseSupport minor={minor} />}
        <PulseDisclaimer minor={minor} />
        <div className="row wrap" style={{ gap: 8 }}><button className="btn" onClick={() => setScrOpen(false)}>Close</button><button className="btn ghost" onClick={() => { setScrOpen(false); setTab('trends'); }}>See my trend</button></div>
      </div>}
    </div>
  </Sheet>;

  const sc = mindScreen(q);
  return <Page title="Mind & Recovery" kicker={plan ? `Readiness · Breathe · Recover${sc.level === 'minor' ? ' · Under 18' : ''}` : 'Check in · Breathe · Recover · Journal'} wide
    actions={<div className="row" style={{ gap: 6 }}><Link className="btn sm danger" to="/mind/help" data-testid="mind-help-btn"><Icon name="phone" size={14} />Help</Link>{plan && <Link className="btn sm ghost" to="/mind/setup" aria-label="Edit setup"><Icon name="gear" size={14} /></Link>}</div>}>
    <div className="wl-tabs"><Segmented value={tab} options={TABS} onChange={setTab} small /></div>
    <div className="sl-root mn-root" data-testid={`mind-${tab}`}>
      {tab === 'today' && TodayTab()}
      {tab === 'breathe' && BreatheTab()}
      {tab === 'skills' && SkillsTab()}
      {tab === 'recover' && RecoverTab()}
      {tab === 'journal' && JournalTab()}
      {tab === 'trends' && TrendsTab()}
      {tab === 'evidence' && EvidenceTab()}
      <div className="mn-foot"><CrisisCard compact minor={minor} /><NotTherapy /></div>
    </div>
    {ScreenSheet}
  </Page>;
}
const addDaysLocal = (k: string, n: number) => { const d = new Date(k + 'T12:00:00'); d.setDate(d.getDate() + n); return todayKey(d); };
