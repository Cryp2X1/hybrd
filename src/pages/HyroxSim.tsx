import { useNavigate } from 'react-router-dom';
import { HYROX_DIVISIONS, HYROX_STATIONS } from '../data/programs';
import { usePersisted, useTick } from '../lib/timer';
import { Card, HoldButton, Pill } from '../components/ui';
import { Icon } from '../components/Icon';
import { fmtTime, estKcal, fmtOfficial, localizeOfficial, officialWork, wu } from '../lib/calc';
import { acquireWakeLock, cue, say, unlockAudio } from '../lib/cues';
import { useStore, uid } from '../lib/store';
import type { Workout } from '../lib/types';
import { useEffect } from 'react';
import { useToast } from '../lib/toast';

export const SIM_SEGMENTS = HYROX_STATIONS.flatMap((s, i) => [{ label: `Run ${i + 1}`, sub: '1 km', run: true, distanceM: 1000 as number | undefined }, { label: s.name, sub: s.work as string, run: false, distanceM: ('distanceM' in s ? s.distanceM : undefined) as number | undefined }]);
interface Sim { startedAt: number; pausedAt: number | null; acc: number; marks: number[]; targetMin: number }
const fresh = (targetMin = 0): Sim => ({ startedAt: 0, pausedAt: null, acc: 0, marks: [], targetMin });

export default function HyroxSim() {
  const [s, setS] = usePersisted<Sim>('hybrd:t:hyrox', () => fresh(90));
  const { data, profile, upsert } = useStore();
  const toast = useToast();
  const nav = useNavigate();
  const running = !!s.startedAt && !s.pausedAt && s.marks.length < 16;
  useTick(running, 200);
  useEffect(() => (running ? acquireWakeLock() : undefined), [running]);
  const el = s.startedAt ? (s.pausedAt ?? Date.now()) - s.startedAt - s.acc : 0;
  const idx = s.marks.length;
  const done = idx >= 16;
  const segStart = idx ? s.marks[idx - 1] : 0;
  const last = data.workouts.filter((w) => w.source === 'hyrox-sim' && (w.splits?.length || 0) === 16).sort((a, b) => b.date.localeCompare(a.date))[0];
  const lastCum = last?.splits ? last.splits.reduce<number[]>((a, sp) => [...a, (a[a.length - 1] || 0) + sp.sec * 1000], []) : null;
  // target band: scale the last sim's shape to the target, else spread evenly
  const targetCum = (i: number) => {
    if (!s.targetMin) return null;
    const T = s.targetMin * 60000;
    if (lastCum) return (lastCum[i] / lastCum[15]) * T;
    return ((i + 1) / 16) * T;
  };
  const div = HYROX_DIVISIONS[profile.hyroxDivision || 'men-open'];
  const loadFor = (name: string) => localizeOfficial(name === 'Sled Push' ? div.sledPush : name === 'Sled Pull' ? div.sledPull : name === 'Farmers Carry' ? div.farmers : name === 'Sandbag Lunges' ? div.lunges : name === 'Wall Balls' ? div.wallBall : '', profile.units, wu(profile));
  const subOf = (g: (typeof SIM_SEGMENTS)[number]) => (g.run ? fmtOfficial(1000, profile.units) : officialWork(g.sub, g.distanceM, profile.units));

  const start = () => { unlockAudio(); setS({ ...fresh(s.targetMin), startedAt: Date.now() }); cue('go'); say('Run one'); };
  const next = () => {
    if (!running) return;
    const m = el;
    setS((p) => ({ ...p, marks: [...p.marks, m] }));
    const n = SIM_SEGMENTS[idx + 1];
    if (n) { cue('go'); say(n.label); } else { cue('done'); say('Finished!'); }
  };
  const undo = () => setS((p) => ({ ...p, marks: p.marks.slice(0, -1) }));
  const pause = () => setS((p) => ({ ...p, pausedAt: Date.now() }));
  const resume = () => { unlockAudio(); setS((p) => ({ ...p, acc: p.acc + (p.pausedAt ? Date.now() - p.pausedAt : 0), pausedAt: null })); };
  const save = () => {
    const splits = s.marks.map((m, i) => ({ label: SIM_SEGMENTS[i].label, sec: Math.round((m - (s.marks[i - 1] || 0)) / 1000) }));
    const w: Workout = { id: uid(), updatedAt: Date.now(), date: new Date(s.startedAt).toISOString(), type: 'hyrox', title: done ? 'HYROX Simulation' : `HYROX Sim (partial, ${s.marks.length}/16)`, durationSec: Math.round((s.marks[s.marks.length - 1] || el) / 1000), rpe: 9, splits, source: 'hyrox-sim', notes: `Division: ${div.label}` };
    w.kcal = estKcal(w, profile.weightKg);
    upsert<Workout>('workouts', w); setS(fresh(s.targetMin)); toast('Simulation saved'); nav(`/train/workout/${w.id}`);
  };

  if (!s.startedAt) return (
    <div className="session">
      <Card className="hero">
        <div className="kicker">HYROX Race Simulator · {div.label}</div>
        <h2 style={{ marginBottom: 8 }}>8 × 1 km + 8 stations</h2>{profile.units === 'imperial' && <p className="muted small" style={{ marginTop: -4 }}>8 km ≈ 4.97 mi of running. Official race distances are metric.</p>}
        <p className="muted small">Tap <b>NEXT</b> as you finish each run and station to record splits. Works indoors (no GPS). Uses your own last sim for comparisons — no invented cutoffs.</p>
        <label className="field"><span>Target finish (minutes, optional)</span><input inputMode="numeric" value={s.targetMin || ''} onChange={(e) => setS({ ...s, targetMin: +e.target.value || 0 })} placeholder="e.g. 90" /></label>
        {last && <p className="muted small">Last sim: <b className="y">{fmtTime(last.durationSec)}</b> on {new Date(last.date).toLocaleDateString()}</p>}
      </Card>
      <div className="seg-list">{SIM_SEGMENTS.map((g, i) => <div key={i} className={`seg-item ${g.run ? 'run' : ''}`}><span className="n">{i + 1}</span><span className="nm">{g.label}</span><span className="muted small">{subOf(g)}{!g.run && loadFor(g.label) ? ` · ${loadFor(g.label)}` : ''}</span><span className="t muted">{last?.splits ? fmtTime(last.splits[i].sec) : ''}</span></div>)}</div>
      <button className="btn y big block" onClick={start}><Icon name="flag" />Start simulation</button>
    </div>
  );

  const cur = SIM_SEGMENTS[Math.min(idx, 15)];
  const tc = !done ? targetCum(idx) : null;
  const band = tc != null ? el - tc : null;
  const vsLast = lastCum && idx > 0 ? s.marks[idx - 1] - lastCum[idx - 1] : null;
  return (
    <div className="session">
      <div className="row"><Pill tone="yellow">{done ? 'Finished' : s.pausedAt ? 'Paused' : <><span className="live-dot" />Race clock</>}</Pill><span className="spacer" /><span className="mono">{idx}/16</span></div>
      <div className="big-num">{fmtTime(el / 1000)}</div>
      {!done && <>
        <div className={`phase-label ${cur.run ? 'rest' : 'work'}`}>{cur.label}</div>
        <div className="big-sub">{subOf(cur)}{!cur.run && loadFor(cur.label) ? ` · ${loadFor(cur.label)}` : ''} · segment {fmtTime((el - segStart) / 1000)}</div>
        <div className="status-strip">
          {band != null && <Pill tone={band <= 0 ? 'yellow' : 'dim'}>{band <= 0 ? 'Ahead of' : 'Behind'} target {fmtTime(Math.abs(band) / 1000)}</Pill>}
          {vsLast != null && <Pill>{vsLast <= 0 ? '−' : '+'}{fmtTime(Math.abs(vsLast) / 1000)} vs last sim</Pill>}
        </div>
        <button className="btn y big block" style={{ height: 84, fontSize: 30 }} onClick={next} disabled={!running}>Next → {SIM_SEGMENTS[idx + 1]?.label || 'Finish'}</button>
      </>}
      {done && <button className="btn y big block" onClick={save}><Icon name="check" />Save simulation</button>}
      <div className="controls">
        {idx > 0 && <div><button className="ctrl" aria-label="Undo last split" onClick={undo}><Icon name="undo" size={24} /></button><div className="ctrl-l">Undo</div></div>}
        {!done && <div>{s.pausedAt ? <button className="ctrl y" aria-label="Resume" onClick={resume}><Icon name="play" size={30} fill /></button> : <button className="ctrl y" aria-label="Pause" onClick={pause}><Icon name="pause" size={30} fill /></button>}<div className="ctrl-l">{s.pausedAt ? 'Resume' : 'Pause'}</div></div>}
        <HoldButton onHold={() => { if (idx > 0) save(); else setS(fresh(s.targetMin)); }} label={done ? 'Hold to save' : idx > 0 ? 'Hold: save partial' : 'Hold to cancel'} icon={done ? 'check' : 'stop'} />
      </div>
      <div className="seg-list">{SIM_SEGMENTS.map((g, i) => {
        const sec = i < idx ? (s.marks[i] - (s.marks[i - 1] || 0)) / 1000 : null;
        const prev = last?.splits?.[i]?.sec;
        return <div key={i} className={`seg-item ${g.run ? 'run' : ''} ${i === idx ? 'cur' : ''} ${i < idx ? 'done' : ''}`}><span className="n">{i + 1}</span><span className="nm">{g.label}</span>
          <span className="t">{sec != null ? fmtTime(sec) : ''}{sec != null && prev != null && <small className={`delta ${sec > prev ? 'up' : 'down'}`}> {sec > prev ? '+' : '−'}{fmtTime(Math.abs(sec - prev))}</small>}</span></div>;
      })}</div>
    </div>
  );
}
