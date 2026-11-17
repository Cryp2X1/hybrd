// /mind/breathe/:id and /mind/routine/:id — guided breathing pacer and timed recovery routines.
// Respects prefers-reduced-motion (no scaling animation; a progress bar + text instead). Optional soft tone (Web Audio) and vibration.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useStore, uid } from '../lib/store';
import { todayKey } from '../lib/calc';
import { defaultMindQuiz, MIND_REASON_TEXT, patternById, phaseAt, sessionTimeline, toolStatus, totalSec, breathsPerMin, scaleAt, type BreathPhase, type MindSession } from '../lib/mind';
import { routineById, routineSteps, routineSec, TRANSITION_SEC } from '../data/mindContent';
import { Page, Card, Banner } from '../components/ui';
import { Icon } from '../components/Icon';
import { SrcPills } from '../components/SrcPills';
import { CrisisCard, MGrade, NotTherapy } from '../components/MindBits';
import { useToast } from '../lib/toast';

const mmss = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;
export function useReducedMotion() {
  const [r, setR] = useState(() => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => { if (!window.matchMedia) return; const m = window.matchMedia('(prefers-reduced-motion: reduce)'); const on = () => setR(m.matches); m.addEventListener?.('change', on); return () => m.removeEventListener?.('change', on); }, []);
  return r;
}
/** Elapsed seconds with pause/resume; ticks with rAF (smooth) or every 250 ms (reduced motion / routines). */
function useClock(running: boolean, smooth: boolean) {
  const [t, setT] = useState(0);
  const base = useRef(0), startAt = useRef<number | null>(null);
  useEffect(() => {
    if (!running) { if (startAt.current !== null) { base.current += (performance.now() - startAt.current) / 1000; startAt.current = null; } return; }
    startAt.current = performance.now();
    let raf = 0, iv = 0;
    const tick = () => setT(base.current + (performance.now() - (startAt.current ?? performance.now())) / 1000);
    if (smooth) { const loop = () => { tick(); raf = requestAnimationFrame(loop); }; raf = requestAnimationFrame(loop); } else iv = window.setInterval(tick, 250);
    return () => { cancelAnimationFrame(raf); clearInterval(iv); };
  }, [running, smooth]);
  const reset = () => { base.current = 0; startAt.current = running ? performance.now() : null; setT(0); };
  const jump = (to: number) => { base.current = to; startAt.current = running ? performance.now() : null; setT(to); };
  return { t, reset, jump };
}
function useWakeLock(on: boolean) {
  useEffect(() => {
    if (!on) return;
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request('screen').then((l) => { lock = l; }).catch(() => {});
    return () => { lock?.release().catch(() => {}); };
  }, [on]);
}
function useCue(sound: boolean, vibe: boolean) {
  const ctx = useRef<AudioContext | null>(null);
  return (kind: BreathPhase['kind'] | 'move' | 'done') => {
    if (vibe && 'vibrate' in navigator) { try { navigator.vibrate(kind === 'done' ? [80, 60, 80] : kind === 'in' || kind === 'move' ? 40 : 20); } catch { /* not supported */ } }
    if (!sound) return;
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext; if (!AC) return;
      ctx.current ||= new AC();
      const c = ctx.current, o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.value = kind === 'in' || kind === 'top' ? 528 : kind === 'out' ? 396 : kind === 'done' ? 660 : 440;
      g.gain.setValueAtTime(0.0001, c.currentTime); g.gain.exponentialRampToValueAtTime(0.12, c.currentTime + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.5);
      o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + 0.55);
    } catch { /* audio blocked */ }
  };
}
export default function MindPlayer({ kind }: { kind: 'breathe' | 'routine' }) {
  const { id = '' } = useParams();
  const [sp] = useSearchParams();
  const k = `${id}?${sp.toString()}`; // a new pattern / routine starts fresh
  return kind === 'breathe' ? <Breathe key={k} /> : <Routine key={k} />;
}

function Done({ title, minutes, again, back }: { title: string; minutes: number; again: () => void; back: string }) {
  return <Card className="mn-done" >
    <div className="mn-done-ic"><Icon name="check" size={30} /></div>
    <h2 className="fast-h" style={{ margin: '6px 0' }}>Nice work</h2>
    <p className="muted" style={{ marginTop: 0 }}>{title} · {minutes} min logged.</p>
    <div className="row wrap" style={{ justifyContent: 'center' }}><button className="btn" onClick={again}><Icon name="refresh" size={16} />Again</button><Link className="btn y" to={back}>Done</Link><Link className="btn ghost" to="/mind?tab=journal">Write a line</Link></div>
  </Card>;
}

function Breathe() {
  const { id = 'sigh' } = useParams();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const toast = useToast();
  const { profile, upsert } = useStore();
  const p = patternById(id);
  const q = profile.mind?.quiz || defaultMindQuiz(profile);
  const st = p ? toolStatus(p.tool, q) : { status: 'ok' as const, why: [] };
  const holdsOk = st.status === 'ok';
  const reduced = useReducedMotion();
  const back = sp.get('from') ? `/mind/program/${sp.get('from')}` : '/mind?tab=breathe';
  const [minutes, setMinutes] = useState(() => Math.max(1, Math.min(30, +(sp.get('min') || 0) || p?.minutes || 5)));
  const [bpm, setBpm] = useState<5 | 6 | 7>(6);
  const [sound, setSound] = useState(false);
  const [vibe, setVibe] = useState(true);
  const [phase, setPhase] = useState<'ready' | 'run' | 'paused' | 'done'>('ready');
  const tl = useMemo(() => (p ? sessionTimeline(p, minutes, holdsOk, bpm) : []), [p, minutes, holdsOk, bpm]);
  const total = totalSec(tl);
  const { t, reset } = useClock(phase === 'run', !reduced);
  useWakeLock(phase === 'run');
  const cue = useCue(sound, vibe);
  const at = tl.length ? phaseAt(tl, t) : null;
  const lastKey = useRef(''), saved = useRef(false);
  const key = at ? `${at.seg}:${at.idx}:${Math.round((t - (at.phase.sec - at.left)) * 4)}` : '';

  const finish = (secs: number) => {
    if (saved.current || !p) return;
    saved.current = true;
    const m = Math.round(secs / 60);
    if (m >= 1) upsert<MindSession>('mindsessions', { id: uid(), date: todayKey(), kind: 'breathe', ref: p.id, minutes: m });
  };
  useEffect(() => {
    if (phase !== 'run' || !at) return;
    if (at.done || t >= total) { setPhase('done'); cue('done'); finish(total); return; }
    if (key !== lastKey.current) { lastKey.current = key; cue(at.phase.kind); }
  });
  if (!p) return <Page title="Breathing" back="/mind?tab=breathe"><p>Pattern not found.</p></Page>;
  const start = () => { saved.current = false; lastKey.current = ''; reset(); setPhase('run'); };
  const stop = () => { if (t >= 60) { finish(t); toast(`${Math.round(t / 60)} min logged`); } nav(back); };
  const phases = tl[0]?.phases || [];

  return <Page title={p.name} kicker={`Breathe · ${p.segments ? `${p.minutes} min` : `${minutes} min`}${p.id === 'resonance' ? ` · ${bpm}/min` : ''}`} back={back}>
    <div className="stack sl-root mn-root" data-testid="mind-breathe">
      {phase === 'ready' && <>
        <Card>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}><MGrade g={p.grade} /><span className="muted small">{breathsPerMin(phases)} breaths/min</span></div>
          <p style={{ margin: '10px 0 6px' }}>{p.short}</p>
          <ol className="mn-steps">{p.how.map((h) => <li key={h}>{h}</li>)}</ol>
          <SrcPills ids={p.src} />
        </Card>
        {st.status !== 'ok' && <Banner tone="warn"><b>Adapted for you.</b> {p.holds ? 'Breath-holds removed: 5 s in, 5 s out. ' : ''}{st.why.map((r) => MIND_REASON_TEXT[r]).join(' ')}</Banner>}
        <Card>
          {!p.segments && <div className="field"><span>Length</span><div className="chips">{[2, 3, 5, 10, 15].map((m) => <button key={m} className={`chip ${minutes === m ? 'on' : ''}`} aria-pressed={minutes === m} onClick={() => setMinutes(m)}>{m} min</button>)}</div></div>}
          {p.id === 'resonance' && <div className="field"><span>Pace (breaths per minute)</span><div className="chips">{([5, 6, 7] as const).map((b) => <button key={b} className={`chip ${bpm === b ? 'on' : ''}`} aria-pressed={bpm === b} onClick={() => setBpm(b)}>{b}/min{b === 6 ? ' · typical' : ''}</button>)}</div><p className="muted small" style={{ margin: '4px 0 0' }}>Pick whichever feels smooth and unforced. Most adults resonate between about 4.5 and 7 breaths a minute.</p></div>}
          {p.segments && <ol className="mn-steps">{p.segments.map((s, i) => <li key={i}><b>{s.pattern === 'ready' ? 'Switch on' : patternById(s.pattern)?.name}</b> · {s.minutes} min — {s.cue}</li>)}</ol>}
          <div className="row wrap" style={{ gap: 8 }}>
            <label className="toggle mn-mini"><span>Soft tone</span><input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} /></label>
            {'vibrate' in navigator && <label className="toggle mn-mini"><span>Vibrate</span><input type="checkbox" checked={vibe} onChange={(e) => setVibe(e.target.checked)} /></label>}
          </div>
          <button className="btn y block" style={{ marginTop: 12 }} data-testid="mind-breathe-start" onClick={start}><Icon name="play" size={18} />Start · {mmss(total)}</button>
        </Card>
        <p className="muted small">Sit or lie comfortably. Breathe gently — never strain. Stop and breathe normally if you feel dizzy, tingly or more anxious.</p>
      </>}

      {(phase === 'run' || phase === 'paused') && at && <Card className="mn-pacer-card">
        {at.cue && <p className="mn-cue" aria-live="polite">{at.cue}</p>}
        <div className={`mn-pacer ${reduced ? 'reduced' : ''} ${at.phase.kind}`} data-testid="mind-pacer">
          {!reduced && <div className="mn-orb" style={{ transform: `scale(${scaleAt(tl[at.seg].phases, at.idx, at.progress).toFixed(3)})` }} />}
          <div className="mn-pacer-t"><b aria-live="assertive">{at.phase.label}</b><span>{Math.ceil(at.left)}</span></div>
        </div>
        {reduced && <div className="mn-bar" aria-hidden="true"><i style={{ width: `${Math.round(at.progress * 100)}%` }} /></div>}
        <div className="mn-run-meta"><span>{mmss(total - t)} left</span>{tl.length > 1 && <span>Part {at.seg + 1} of {tl.length}</span>}</div>
        <div className="row" style={{ justifyContent: 'center', gap: 10 }}>
          <button className="btn" onClick={() => setPhase(phase === 'run' ? 'paused' : 'run')} aria-label={phase === 'run' ? 'Pause' : 'Resume'}><Icon name={phase === 'run' ? 'pause' : 'play'} size={18} />{phase === 'run' ? 'Pause' : 'Resume'}</button>
          <button className="btn ghost" onClick={stop}><Icon name="stop" size={18} />End</button>
        </div>
      </Card>}

      {phase === 'done' && <Done title={p.name} minutes={Math.round(total / 60)} again={start} back={back} />}
      <CrisisCard compact />
      <NotTherapy />
    </div>
  </Page>;
}

function Routine() {
  const { id = 'post-run' } = useParams();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const toast = useToast();
  const { upsert } = useStore();
  const r = routineById(id);
  const back = sp.get('from') ? `/mind/program/${sp.get('from')}` : '/mind?tab=recover';
  const steps = useMemo(() => (r ? routineSteps(r) : []), [r]);
  const [phase, setPhase] = useState<'ready' | 'run' | 'paused' | 'done'>('ready');
  const [sound, setSound] = useState(false);
  const { t, reset, jump } = useClock(phase === 'run', false);
  useWakeLock(phase === 'run');
  const cue = useCue(sound, true);
  const saved = useRef(false), lastIdx = useRef(-1);
  // timeline: step i occupies [start_i, start_i + sec), followed by TRANSITION_SEC (except the last)
  const starts = useMemo(() => { let a = 0; return steps.map((s, i) => { const st = a; a += s.sec + (i < steps.length - 1 ? TRANSITION_SEC : 0); return st; }); }, [steps]);
  const total = r ? routineSec(r) : 0;
  let idx = starts.findIndex((s, i) => t >= s && (i === steps.length - 1 || t < starts[i + 1]));
  if (idx < 0) idx = 0;
  const inMove = steps[idx] ? t - starts[idx] < steps[idx].sec : false;
  const left = steps[idx] ? (inMove ? steps[idx].sec - (t - starts[idx]) : starts[idx + 1] - t) : 0;
  const finish = (secs: number) => { if (saved.current || !r) return; saved.current = true; const m = Math.round(secs / 60); if (m >= 1) upsert<MindSession>('mindsessions', { id: uid(), date: todayKey(), kind: 'routine', ref: r.id, minutes: m }); };
  useEffect(() => {
    if (phase !== 'run') return;
    if (t >= total) { setPhase('done'); cue('done'); finish(total); return; }
    const k = inMove ? idx : idx + 0.5;
    if (k !== lastIdx.current) { lastIdx.current = k; cue('move'); }
  });
  if (!r) return <Page title="Routine" back="/mind?tab=recover"><p>Routine not found.</p></Page>;
  const start = () => { saved.current = false; lastIdx.current = -1; reset(); setPhase('run'); };
  const cur = steps[idx], next = steps[idx + 1];
  const pct = cur ? (inMove ? (t - starts[idx]) / cur.sec : 1) : 0;

  return <Page title={r.name} kicker={`Recover · ${Math.round(total / 60)} min · ${steps.length} moves`} back={back}>
    <div className="stack sl-root mn-root" data-testid="mind-routine">
      {phase === 'ready' && <>
        <Card>
          <p style={{ marginTop: 0 }}>{r.short} <span className="muted">Best for: {r.for}.</span></p>
          <ol className="mn-moves">{r.moves.map((m) => <li key={m.name}><div><b>{m.name}</b><span>{m.cue}</span></div><span className="mono">{m.sides ? `${m.sec}s × 2` : `${m.sec}s`}</span></li>)}</ol>
          <Banner tone="info">{r.caution}</Banner>
          <SrcPills ids={r.src} />
        </Card>
        <label className="toggle mn-mini"><span>Soft tone between moves</span><input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} /></label>
        <button className="btn y block" data-testid="mind-routine-start" onClick={start}><Icon name="play" size={18} />Start · {mmss(total)}</button>
      </>}
      {(phase === 'run' || phase === 'paused') && cur && <Card className="mn-pacer-card">
        <div className="kicker">{inMove ? `Move ${idx + 1} of ${steps.length}` : 'Get ready'}</div>
        <h2 className="mn-move-name" aria-live="polite">{inMove ? cur.name : `Next: ${next?.name || ''}`}</h2>
        <p className="muted" style={{ marginTop: 0 }}>{inMove ? cur.cue : next?.cue}</p>
        <div className="mn-big-t mono">{Math.ceil(left)}</div>
        <div className="mn-bar" aria-hidden="true"><i style={{ width: `${Math.round(pct * 100)}%` }} /></div>
        <div className="mn-run-meta"><span>{mmss(total - t)} left</span>{inMove && next && <span>Next: {next.name}</span>}</div>
        <div className="row wrap" style={{ justifyContent: 'center', gap: 8 }}>
          <button className="btn" aria-label="Previous move" disabled={idx === 0} onClick={() => jump(starts[Math.max(0, idx - (inMove ? 1 : 0))])}><Icon name="prev" size={16} /></button>
          <button className="btn" onClick={() => setPhase(phase === 'run' ? 'paused' : 'run')}><Icon name={phase === 'run' ? 'pause' : 'play'} size={18} />{phase === 'run' ? 'Pause' : 'Resume'}</button>
          <button className="btn" aria-label="Next move" onClick={() => jump(idx + 1 < steps.length ? starts[idx + 1] : total)}><Icon name="next" size={16} /></button>
          <button className="btn ghost" onClick={() => { if (t >= 60) { finish(t); toast(`${Math.round(t / 60)} min logged`); } nav(back); }}><Icon name="stop" size={16} />End</button>
        </div>
      </Card>}
      {phase === 'done' && <Done title={r.name} minutes={Math.round(total / 60)} again={start} back={back} />}
      <p className="muted small">Sharp pain, numbness or a joint that gives way is not normal stretching discomfort — stop and see a clinician.</p>
      <NotTherapy />
    </div>
  </Page>;
}
