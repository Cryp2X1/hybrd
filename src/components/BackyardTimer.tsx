import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, HoldButton, NumberStepper, Banner } from './ui';
import { Icon } from './Icon';
import { usePersisted, useTick } from '../lib/timer';
import { acquireWakeLock, cue, say, unlockAudio, vibrate } from '../lib/cues';
import { fmtTime } from '../lib/calc';
import { useStore, uid } from '../lib/store';
import { useToast } from '../lib/toast';
import type { Workout } from '../lib/types';
import {
  HOUR_MS, YARD_EXPLAIN, YARD_M, byuStatus, fmtByuDist, fmtByuEquals, fmtByuPace, fmtByuSpeed,
  lapPaceSec, loopDist, type ByuTimer,
} from '../lib/ultra';
import { SrcPills } from './SrcPills';
import { ByuEquals, ByuUnitToggle, ByuYardTable, useByuUnit } from './ByuUnits';

const ROUTINE = ['Drink to thirst + eat this yard’s fuel', 'Salt / electrolyte', 'Toilet if needed', 'Feet, chafing, clothes and headlamp check', 'Tell crew what you need next yard', 'In the corral at −1 min'];
const mmss = (ms: number) => fmtTime(Math.max(0, Math.ceil(ms / 1000)));

export function BackyardTimer({ goal: goal0 = 12, lap: lap0 = 50 }: { goal?: number; lap?: number }) {
  const [t, setT] = usePersisted<ByuTimer>('hybrd:t:byu', () => ({ start: null, finishes: [], stopped: null, lapMin: lap0, goal: goal0 }));
  const [startAt, setStartAt] = useState('');
  const [routine, setRoutine] = useState<Record<number, boolean>>({});
  const { upsert } = useStore();
  const [unit] = useByuUnit();
  const toast = useToast();
  const nav = useNavigate();
  const now = Date.now();
  const running = !!t.start && !t.stopped;
  useTick(running, 250);
  useEffect(() => (running ? acquireWakeLock() : undefined), [running]);
  const pending = !!t.start && now < t.start;
  const s = byuStatus(t, now);
  // Audio cues: 3/2/1-minute warnings + the bell. Track the last cue so each fires once.
  const last = useRef('');
  useEffect(() => {
    if (!running || pending) return;
    const key = `${s.yard}:${s.warn}`;
    if (s.warn && key !== last.current) { last.current = key; cue(s.warn === 1 ? 'warn' : 'tick'); vibrate(s.warn === 1 ? [200, 100, 200] : 120); if (s.warn === 1) say('One minute'); else say(`${s.warn} minutes`); }
    const bellKey = `bell:${s.yard}`;
    if (now - s.yardStart < 1500 && last.current !== bellKey) { last.current = bellKey; cue('go'); vibrate([300, 100, 300]); say(`Yard ${s.yard}. Go`); setRoutine({}); }
  });
  const begin = () => {
    unlockAudio();
    let st = Date.now();
    if (startAt) { const [h, m] = startAt.split(':').map(Number); const d = new Date(); d.setHours(h, m, 0, 0); if (d.getTime() < Date.now() - 60_000) d.setDate(d.getDate() + 1); st = d.getTime(); }
    setT({ ...t, start: st, finishes: [], stopped: null }); if (!startAt) cue('go');
  };
  const finishYard = () => { if (!s.onLap) return; setT((p) => ({ ...p, finishes: [...p.finishes.slice(0, s.yard - 1), Date.now()] })); cue('done'); vibrate(80); };
  const undo = () => setT((p) => ({ ...p, finishes: p.finishes.slice(0, -1) }));
  const stop = () => setT((p) => ({ ...p, stopped: Date.now() }));
  const reset = () => { setT((p) => ({ ...p, start: null, finishes: [], stopped: null })); setRoutine({}); };
  const save = () => {
    if (!t.start) return;
    const sec = Math.round(((t.stopped ?? Date.now()) - t.start) / 1000);
    const w: Workout = {
      id: uid(), updatedAt: Date.now(), date: new Date(t.start).toISOString(), type: 'run',
      title: `Backyard · ${s.completed} yard${s.completed === 1 ? '' : 's'}`, durationSec: sec,
      distanceM: Math.round(s.completed * YARD_M), rpe: 7,
      notes: s.laps.map((l, i) => `Y${i + 1} ${fmtTime(Math.round((l) / 1000))}`).join(' · '),
      source: 'byu',
      laps: s.laps.map((l) => ({ sec: Math.round(l / 1000), distanceM: Math.round(YARD_M) })),
    };
    upsert<Workout>('workouts', w); toast('Saved to history'); reset(); nav(`/train/workout/${w.id}`);
  };
  const avg = s.laps.length ? s.laps.reduce((a, b) => a + b, 0) / s.laps.length : 0;
  const dist = (y: number) => fmtByuDist(y, unit);
  const paceOf = (lapMs: number) => fmtByuPace(Math.round(lapMs / 1000 / (YARD_M / 1000)), unit);
  const loop = loopDist(unit);
  const paceLine = `${fmtByuPace(lapPaceSec(t.lapMin), unit)}${unit === 'm' || unit === 'ft' ? ` · ${fmtByuSpeed(t.lapMin, unit)}` : ''}`;

  if (!t.start) return <div className="session byu" data-testid="byu-timer">
    <Card className="hero">
      <div className="byu-head-units">
        <div className="kicker">Backyard ultra · last one standing</div>
        <ByuUnitToggle />
      </div>
      <div className="big-num" style={{ fontSize: 'clamp(54px, 16vw, 110px)' }}>{t.lapMin}:00</div>
      <div className="big-sub">target lap · {loop} every hour · {paceLine}</div>
      <p className="muted small" style={{ margin: '8px 0 0' }} data-testid="byu-explain">{YARD_EXPLAIN} of {loop}.</p>
    </Card>
    <Card>
      <div className="stack">
        <NumberStepper label="Target lap" unit="min" value={t.lapMin} onChange={(v) => setT({ ...t, lapMin: v })} min={35} max={59} />
        <NumberStepper label="Goal" unit="yards" value={t.goal} onChange={(v) => setT({ ...t, goal: v })} min={1} max={100} />
        <label className="field"><span>Start at (optional, e.g. 07:00)</span><input type="time" value={startAt} onChange={(e) => setStartAt(e.target.value)} data-testid="byu-start-at" /></label>
      </div>
      <ByuEquals yards={t.goal} />
      <p className="muted small" style={{ margin: '6px 0 0' }}>Each yard starts on the hour, so a {t.lapMin}-min lap leaves {60 - t.lapMin} min for your routine. Tap <b>Finished yard</b> as you cross the line. Keep the screen on (it stays awake while running) and your phone volume up.</p>
    </Card>
    <Card><ByuYardTable highlight={t.goal} /></Card>
    <button className="btn y big block" onClick={begin} data-testid="byu-start"><Icon name="play" fill />{startAt ? `Start at ${startAt}` : 'Start yard 1 now'}</button>
  </div>;

  if (pending) return <div className="session byu" data-testid="byu-timer">
    <div className="phase-label prep">Starts at {new Date(t.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
    <div className="big-num">{fmtTime(Math.ceil((t.start - now) / 1000))}</div>
    <div className="next-up">Yard 1 · {t.goal} yard goal · {dist(t.goal)} · {t.lapMin}-min laps</div>
    <div className="controls"><HoldButton onHold={reset} label="Hold to cancel" icon="stop" /></div>
  </div>;

  const over = !!t.stopped;
  const lapBehind = s.onLap && s.lapMs > t.lapMin * 60_000;
  return <div className="session byu" data-testid="byu-timer">
    <div className="byu-head-units" style={{ marginBottom: 6 }}><ByuUnitToggle /></div>
    <div className={`phase-label ${over ? 'work' : s.onLap ? 'work' : s.missed ? 'prep' : 'rest'}`} data-testid="byu-phase">{over ? 'Finished' : s.missed ? 'Yard missed: you are out (DNF)' : s.onLap ? `Yard ${s.yard} · on the loop` : `Yard ${s.yard} done · rest`}</div>
    <div className={`big-num ${s.onLap && !over ? 'y' : ''}`} data-testid="byu-bell">{over ? `${s.completed}` : mmss(s.bellInMs)}</div>
    <div className="big-sub">{over ? `yard${s.completed === 1 ? '' : 's'} · ${dist(s.completed)}` : s.onLap ? 'until the bell: finish the loop before it rings' : 'until the next bell'}</div>
    {!over && s.warn > 0 && <Banner tone="warn"><b>{s.warn} min</b> to the bell{s.onLap ? ': keep moving!' : ': into the corral.'}</Banner>}
    <div className="byu-stats">
      <div><b data-testid="byu-lap">{s.onLap ? mmss(s.lapMs) : s.lapMs ? fmtTime(Math.round((s.lapMs) / 1000)) : '–'}</b><span>{s.onLap ? `lap so far${lapBehind ? ' · behind plan' : ''}` : 'last lap'}</span></div>
      <div><b data-testid="byu-rest">{s.onLap ? '–' : mmss(s.restLeftMs)}</b><span>rest left</span></div>
      <div><b data-testid="byu-yards">{s.completed}<small>/{t.goal}</small></b><span>yards</span></div>
      <div><b data-testid="byu-dist">{dist(s.completed)}</b><span>distance</span></div>
      <div><b>{fmtTime(Math.round((s.elapsedMs) / 1000))}</b><span>elapsed</span></div>
      <div><b data-testid="byu-avg-pace">{avg ? `${fmtTime(Math.round((avg) / 1000))} · ${paceOf(avg)}` : '–'}</b><span>avg lap / pace</span></div>
    </div>
    {!over && <div className="progress-line"><div style={{ width: `${Math.min(100, ((HOUR_MS - s.bellInMs) / HOUR_MS) * 100)}%` }} /></div>}
    {!over && !s.missed && (s.onLap
      ? <button className="btn y big block" onClick={finishYard} data-testid="byu-finish"><Icon name="check" />Finished yard {s.yard}</button>
      : <Card><div className="card-head"><h3>Between-yards routine</h3><button className="link" onClick={undo}>Undo finish</button></div><div className="ultra-checks">{ROUTINE.map((r, i) => <label key={r}><input type="checkbox" checked={!!routine[i]} onChange={() => setRoutine((x) => ({ ...x, [i]: !x[i] }))} /><span>{r}</span></label>)}</div></Card>)}
    <div className="controls">
      {!over ? <HoldButton onHold={stop} label="Hold to stop" icon="stop" /> : <HoldButton onHold={reset} label="Hold to reset" icon="undo" />}
    </div>
    {(over || s.missed) && <button className="btn y block" onClick={save} data-testid="byu-save" disabled={!s.completed}>Save to history</button>}
    {s.laps.length > 0 && <Card><h3 style={{ marginBottom: 8 }}>Yards</h3><div className="plan-list">{s.laps.map((l, i) => <div key={i} className="plan-row"><span>Yard {i + 1}</span><span className="t">{fmtTime(Math.round((l) / 1000))}</span><span className="n">{paceOf(l)} · {fmtByuDist(i + 1, unit)} · rest {fmtTime(Math.round((HOUR_MS - l) / 1000))}</span></div>)}</div></Card>}
    {(over || s.missed) && s.completed > 0 && <p className="muted small center">{fmtByuEquals(s.completed)}</p>}
    <div className="muted small center">Race rules vary. Your race director’s bell is the official time.<SrcPills ids={["ultra-bigs-rules"]} /></div>
  </div>;
}
