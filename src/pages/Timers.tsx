import { useEffect, useMemo } from 'react';
import { attachHr } from '../lib/hr';
import { HrButton, HrLive } from '../components/HeartRate';
import { MusicButton } from '../components/Music';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Page, Segmented, Card, HoldButton, NumberStepper, Banner } from '../components/ui';
import { Icon } from '../components/Icon';
import { useClock, useSequence, usePersisted, type Phase } from '../lib/timer';
import { fmtMs, fmtTime } from '../lib/calc';
import { useStore, uid } from '../lib/store';
import type { Workout, WorkoutType } from '../lib/types';
import { useToast } from '../lib/toast';
import HyroxSim from './HyroxSim';
import { isIOS, isStandalone } from '../lib/cues';
import { programById, type Program, type Session } from '../data/programs';
import { intensityText, stepSec } from '../lib/intensity';
import { fmtDist, fmtShort } from '../lib/calc';
import { ExpertNote } from '../components/Expert';
import { Link } from 'react-router-dom';

type T = 'stopwatch' | 'countdown' | 'interval' | 'tabata' | 'emom' | 'amrap' | 'hyrox' | 'plan';

function useSaveTimed() {
  const { upsert, profile } = useStore();
  const toast = useToast();
  const nav = useNavigate();
  return (title: string, type: WorkoutType, sec: number, notes?: string, extra?: Partial<Workout>) => {
    const w: Workout = { id: uid(), updatedAt: Date.now(), date: new Date(Date.now() - sec * 1000).toISOString(), type, title, durationSec: Math.round(sec), rpe: 8, notes, source: 'timer', ...(type === 'indoor-cycle' ? { bikeKind: 'indoor' as const } : {}), ...extra };
    attachHr(w, profile, Date.now() - sec * 1000);
    upsert<Workout>('workouts', w); toast('Saved to history'); nav(`/train/workout/${w.id}`);
  };
}

export interface Guide { pid: string; sid: string; title: string; type: WorkoutType; pieces: string[] }
function Stopwatch({ guide }: { guide?: Guide }) {
  const c = useClock(guide ? `hybrd:t:sw:${guide.pid}:${guide.sid}` : 'hybrd:t:stopwatch');
  const save = useSaveTimed();
  const laps = c.c.laps;
  const pieces = guide?.pieces || [];
  const cur = pieces[laps.length], allDone = !!guide && laps.length >= pieces.length;
  const lapName = (i: number) => pieces[i] || `Lap ${i + 1}`;
  return (
    <div className="session">
      <Card className="hero"><div className="big-num" style={{ fontSize: 'clamp(56px, 17vw, 120px)' }}>{fmtMs(c.ms)}</div><div className="big-sub">{c.active ? 'Running' : c.c.startedAt ? 'Paused' : guide ? `${guide.title} · for time` : 'Stopwatch'}</div>
        {guide && <><div className="piece-now" data-testid="piece-now">{allDone ? 'All pieces done' : cur}</div><div className="next-up">{allDone ? 'Stop the clock and save' : pieces[laps.length + 1] ? <>Next: <b>{pieces[laps.length + 1]}</b> · tap Lap when this piece is done</> : 'Last piece — tap Lap to finish'}</div></>}
      </Card>
      <div className="controls">
        {!c.c.startedAt ? <div><button className="ctrl y" onClick={c.start} aria-label="Start"><Icon name="play" size={30} fill /></button><div className="ctrl-l">Start</div></div> : <>
          <div><button className="ctrl" onClick={c.lap} disabled={!c.active} aria-label="Lap"><Icon name="lap" size={26} /></button><div className="ctrl-l">Lap</div></div>
          <div>{c.active ? <button className="ctrl y" onClick={c.pause} aria-label="Pause"><Icon name="pause" size={30} fill /></button> : <button className="ctrl y" onClick={c.resume} aria-label="Resume"><Icon name="play" size={30} fill /></button>}<div className="ctrl-l">{c.active ? 'Pause' : 'Resume'}</div></div>
          <HoldButton onHold={c.reset} label="Hold to reset" icon="undo" />
        </>}
      </div>
      {laps.length > 0 && <Card><div className="lap-list">{laps.map((l, i) => ({ i, l, d: l - (laps[i - 1] || 0) })).reverse().map(({ i, l, d }) => <div key={i}><span>{lapName(i)}</span><span className="muted">{fmtMs(d)}</span><span>{fmtMs(l)}</span></div>)}</div></Card>}
      {c.c.startedAt > 0 && !c.active && c.ms > 30000 && <button className="btn block y" onClick={() => {
        const splits = laps.map((l, i) => ({ label: lapName(i), sec: Math.round((l - (laps[i - 1] || 0)) / 1000) }));
        const notes = laps.length ? `${guide ? 'Splits' : 'Laps'}: ${splits.map((x) => `${guide ? `${x.label} ` : ''}${fmtTime(x.sec)}`).join(', ')}` : undefined;
        if (guide) save(guide.title, guide.type, c.ms / 1000, notes, { source: `program:${guide.pid}:${guide.sid}`, splits });
        else save('Stopwatch session', 'cardio', c.ms / 1000, notes);
        c.reset();
      }}>Save as workout</button>}
    </div>
  );
}

function SequenceView({ id, phases, title, type, countRounds, source }: { id: string; phases: Phase[]; title: string; type: WorkoutType; countRounds?: boolean; source?: string }) {
  const s = useSequence(`hybrd:t:${id}`, phases);
  const save = useSaveTimed();
  const nextPhase = s.seq[s.idx + 1];
  const pct = s.total ? (s.ms / s.total) * 100 : 0;
  const workSec = phases.filter((p) => p.kind === 'work').reduce((a, p) => a + p.sec, 0) + phases.filter((p) => p.kind === 'rest').reduce((a, p) => a + p.sec, 0);
  if (!s.started) return (
    <div className="session">
      <Card className="hero"><div className="big-num" style={{ fontSize: 'clamp(64px,20vw,130px)' }}>{fmtTime(workSec)}</div><div className="big-sub">{title} · {phases.length} phase{phases.length > 1 ? 's' : ''}</div></Card>
      <button className="btn y big block" onClick={s.start}><Icon name="play" fill />Start</button>
    </div>
  );
  return (
    <div className="session">
      <div className={`phase-label ${s.done ? 'work' : s.phase.kind}`}>{s.done ? 'Done' : s.phase.label}</div>
      {s.phase.note && !s.done && <div className="phase-note" data-testid="phase-note">{s.phase.note}</div>}
      {s.phase.round && !s.done && <div className="big-sub">Round {s.phase.round} / {s.phase.of}</div>}
      <div className={`big-num ${s.phase.kind === 'work' && !s.done ? 'y' : ''}`}>{fmtTime(Math.ceil(s.remain / 1000))}</div>
      <div className="progress-line"><div style={{ width: `${pct}%` }} /></div>
      <div className="next-up">{s.done ? `Total ${fmtTime(s.total / 1000)}` : nextPhase ? <>Next: <b>{nextPhase.label}</b> · {fmtTime(nextPhase.sec)}{nextPhase.note ? <span className="muted"> · {nextPhase.note}</span> : null}</> : 'Last one — finish strong'}</div>
      {countRounds && !s.done && <div className="row" style={{ justifyContent: 'center' }}><button className="btn" onClick={() => s.addRound(-1)}>−</button><div className="center"><div className="big-num" style={{ fontSize: 64 }}>{s.rounds}</div><div className="big-sub">rounds</div></div><button className="btn y" style={{ height: 64, width: 96, fontSize: 18 }} onClick={() => s.addRound(1)}>+1 round</button></div>}
      <div className="controls">
        {!s.done && <div>{s.running ? <button className="ctrl y" aria-label="Pause" onClick={s.pause}><Icon name="pause" size={30} fill /></button> : <button className="ctrl y" aria-label="Resume" onClick={s.resume}><Icon name="play" size={30} fill /></button>}<div className="ctrl-l">{s.running ? 'Pause' : 'Resume'}</div></div>}
        <HoldButton onHold={s.reset} label={s.done ? 'Hold to reset' : 'Hold to stop'} icon={s.done ? 'undo' : 'stop'} />
      </div>
      {s.done && <button className="btn y block" onClick={() => { save(title, type, s.total / 1000 - 5, countRounds ? `${s.rounds} rounds` : undefined, source ? { source } : undefined); s.reset(); }}>Save to history</button>}
    </div>
  );
}

export default function Timers() {
  const [sp, setSp] = useSearchParams();
  const t = (sp.get('t') as T) || 'stopwatch';
  const [cfg, setCfg] = usePersisted('hybrd:t:cfg', () => ({ cdMin: 5, cdSec: 0, work: 40, rest: 20, rounds: 8, emomEvery: 60, emomRounds: 12, amrapMin: 15, tabataBlocks: 1 }));
  const up = (x: Partial<typeof cfg>) => setCfg((c) => ({ ...c, ...x }));
  const { profile } = useStore();
  const prog = programById(sp.get('program') || '');
  const sess = prog?.sessions.find((x) => x.id === sp.get('session'));
  const [bikeAs, setBikeAs] = usePersisted<{ v: 'indoor-cycle' | 'cycle' }>('hybrd:t:bikeAs', () => ({ v: 'indoor-cycle' }));
  const planPhases = useMemo<Phase[]>(() => (sess?.plan || []).map((st) => {
    const dist = st.distM ? (st.distM >= 1000 ? fmtDist(st.distM, profile.units, profile.units === 'imperial' ? 2 : st.distM % 1000 ? 1 : 0) : fmtShort(st.distM, profile.units)) : '';
    const est = st.distM && st.pace && !profile.runRef ? '≈ time' : '';
    return { label: st.label, sec: stepSec(st, profile), kind: st.kind, round: st.round, of: st.of, note: [dist, intensityText(st, profile), st.note, est].filter(Boolean).join(' · ') || undefined };
  }), [sess, profile]);
  const planType: WorkoutType = sess?.anyBike ? bikeAs.v : (sess?.type || 'cardio');
  const work = +(sp.get('work') || 0) || cfg.work;
  const rest = sp.has('rest') ? Math.max(0, +(sp.get('rest') || 0)) : cfg.rest;
  const rounds = +(sp.get('rounds') || 0) || cfg.rounds;
  const wu = Math.max(0, +(sp.get('wu') || 0));
  const cd = Math.max(0, +(sp.get('cd') || 0));
  const saveType = (['strength', 'calisthenics', 'run', 'walk', 'cycle', 'indoor-cycle', 'cardio', 'hyrox', 'hybrid'].includes(sp.get('type') || '') ? sp.get('type') : 'cardio') as WorkoutType;
  const saveTitle = sp.get('title') || (t === 'interval' ? `Intervals ${work}/${rest} × ${rounds}` : undefined);
  useEffect(() => {
    const patch: Partial<typeof cfg> = {};
    if (+(sp.get('work') || 0) > 0) patch.work = +(sp.get('work') || 0);
    if (sp.has('rest') && +sp.get('rest')! >= 0) patch.rest = +sp.get('rest')!;
    if (+(sp.get('rounds') || 0) > 0) patch.rounds = +(sp.get('rounds') || 0);
    if (Object.keys(patch).length) setCfg((c) => ({ ...c, ...patch }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp]);
  const phases = useMemo<Record<string, Phase[]>>(() => {
    const intervals = (wsec: number, rsec: number, n: number): Phase[] => Array.from({ length: n }).flatMap((_, i) => [{ label: 'Work', sec: wsec, kind: 'work' as const, round: i + 1, of: n }, ...(rsec && i < n - 1 ? [{ label: 'Rest', sec: rsec, kind: 'rest' as const, round: i + 1, of: n }] : [])]);
    const tab: Phase[] = [];
    for (let b = 0; b < cfg.tabataBlocks; b++) { tab.push(...intervals(20, 10, 8).map((p) => ({ ...p, label: p.kind === 'work' ? `Block ${b + 1} · Work` : 'Rest' }))); if (b < cfg.tabataBlocks - 1) tab.push({ label: 'Block rest', sec: 60, kind: 'rest' }); }
    return {
      countdown: [{ label: 'Countdown', sec: cfg.cdMin * 60 + cfg.cdSec, kind: 'work' }],
      interval: [...(wu ? [{ label: 'Warm-up', sec: wu, kind: 'rest' as const }] : []), ...intervals(work, rest, rounds), ...(cd ? [{ label: 'Cool-down', sec: cd, kind: 'rest' as const }] : [])],
      tabata: tab,
      emom: Array.from({ length: cfg.emomRounds }, (_, i) => ({ label: `Minute ${i + 1}`, sec: cfg.emomEvery, kind: 'work' as const, round: i + 1, of: cfg.emomRounds })),
      amrap: [{ label: 'AMRAP', sec: cfg.amrapMin * 60, kind: 'work' }],
    };
  }, [cfg, work, rest, rounds, wu, cd]);

  return (
    <Page title="Timers" kicker="Chronometer · Intervals · HYROX" wide actions={<><HrButton /><MusicButton /></>}>
      <Segmented value={t} onChange={(v) => setSp({ t: v })} options={[...(t === 'plan' && sess?.plan ? [{ v: 'plan' as T, label: 'Session' }] : []), { v: 'stopwatch', label: 'Stopwatch' }, { v: 'countdown', label: 'Countdown' }, { v: 'interval', label: 'Intervals' }, { v: 'tabata', label: 'Tabata' }, { v: 'emom', label: 'EMOM' }, { v: 'amrap', label: 'AMRAP' }, { v: 'hyrox', label: 'HYROX Sim' }]} />
      {isIOS() && !isStandalone() && <Banner tone="warn">iPhone: sounds work after you tap Start; there’s no vibration on iOS. Add HYBRD to your Home Screen to keep the screen awake (iOS 18.4+).</Banner>}
      <HrLive />
      <div className="desk-grid">
        <div>
          {t === 'stopwatch' && (prog && sess?.pieces ? <Stopwatch guide={{ pid: prog.id, sid: sess.id, title: sess.name, type: sess.type, pieces: sess.pieces }} /> : <Stopwatch />)}
          {t === 'plan' && (prog && sess?.plan ? <SequenceView id={`plan-${prog.id}-${sess.id}`} phases={planPhases} title={sess.name} type={planType} source={`program:${prog.id}:${sess.id}`} /> : <Card><p className="muted" style={{ margin: 0 }}>This session isn’t available. <Link className="link" to="/train?tab=programs">Back to programs</Link></p></Card>)}
          {t === 'countdown' && <SequenceView key={`cd${cfg.cdMin}${cfg.cdSec}`} id="countdown" phases={phases.countdown} title="Countdown" type="cardio" />}
          {t === 'interval' && <SequenceView id={`interval-${work}-${rest}-${rounds}-${wu}-${cd}`} phases={phases.interval} title={saveTitle || `Intervals ${work}/${rest} × ${rounds}`} type={saveType} />}
          {t === 'tabata' && <SequenceView id="tabata" phases={phases.tabata} title={`Tabata × ${cfg.tabataBlocks}`} type="cardio" />}
          {t === 'emom' && <SequenceView id="emom" phases={phases.emom} title={`EMOM ${Math.round((cfg.emomEvery * cfg.emomRounds) / 60)}`} type="cardio" />}
          {t === 'amrap' && <SequenceView id="amrap" phases={phases.amrap} title={`AMRAP ${cfg.amrapMin}`} type="cardio" countRounds />}
          {t === 'hyrox' && <HyroxSim />}
        </div>
        <div>
          {prog && sess && (t === 'plan' || (t === 'stopwatch' && sess.pieces)) && <SessionCard p={prog} s={sess} phases={t === 'plan' ? planPhases : undefined} bikeAs={sess.anyBike ? bikeAs.v : undefined} setBikeAs={(v) => setBikeAs({ v })} />}
          {t !== 'hyrox' && t !== 'stopwatch' && t !== 'plan' && <Card>
            <h3 style={{ marginBottom: 12 }}>Set up</h3>
            {t === 'countdown' && <><div className="chips" style={{ marginBottom: 12 }}>{[1, 3, 5, 10, 20, 30].map((m) => <button key={m} className={`chip ${cfg.cdMin === m && !cfg.cdSec ? 'on' : ''}`} onClick={() => up({ cdMin: m, cdSec: 0 })}>{m} min</button>)}</div>
              <div className="row wrap"><NumberStepper label="Min" value={cfg.cdMin} onChange={(v) => up({ cdMin: v })} max={180} /><NumberStepper label="Sec" value={cfg.cdSec} onChange={(v) => up({ cdSec: v })} step={5} max={55} /></div></>}
            {t === 'interval' && <><div className="chips" style={{ marginBottom: 12 }}>{[[40, 20, 10, 'HIIT 40/20'], [30, 30, 10, '30/30'], [60, 60, 8, '1:1 min'], [90, 30, 6, '90/30'], [240, 180, 4, '4×4 min'], [30, 90, 8, 'Sprint 30/90']].map(([w, r, n, l]) => <button key={String(l)} className={`chip ${work === w && rest === r && rounds === n ? 'on' : ''}`} onClick={() => { setSp({ t: 'interval' }); up({ work: w as number, rest: r as number, rounds: n as number }); }}>{l}</button>)}</div>
              <div className="stack"><NumberStepper label="Work" unit="s" value={work} onChange={(v) => { setSp({ t: 'interval' }); up({ work: v }); }} step={5} min={5} max={3600} /><NumberStepper label="Rest" unit="s" value={rest} onChange={(v) => { setSp({ t: 'interval' }); up({ rest: v }); }} step={5} max={3600} /><NumberStepper label="Rounds" value={rounds} onChange={(v) => { setSp({ t: 'interval' }); up({ rounds: v }); }} min={1} max={99} /></div>
              {(wu || cd) && <p className="muted small">This session includes a {wu ? `${Math.round(wu / 60)} min warm-up` : ''}{wu && cd ? ' and ' : ''}{cd ? `${Math.round(cd / 60)} min cool-down` : ''}.</p>}</>}
            {t === 'tabata' && <><p className="muted small">Classic Tabata: 20 s all-out, 10 s rest, × 8 (4 min). Stack blocks with 1 min between.</p><NumberStepper label="Blocks" value={cfg.tabataBlocks} onChange={(v) => up({ tabataBlocks: v })} min={1} max={8} /></>}
            {t === 'emom' && <><p className="muted small">Every minute on the minute: do the work, rest for what’s left of the minute.</p><div className="stack"><NumberStepper label="Every" unit="s" value={cfg.emomEvery} onChange={(v) => up({ emomEvery: v })} step={15} min={15} max={600} /><NumberStepper label="Rounds" value={cfg.emomRounds} onChange={(v) => up({ emomRounds: v })} min={1} max={90} /></div></>}
            {t === 'amrap' && <><p className="muted small">As many rounds as possible — tap +1 after every round.</p><div className="chips" style={{ marginBottom: 12 }}>{[10, 12, 15, 20, 30].map((m) => <button key={m} className={`chip ${cfg.amrapMin === m ? 'on' : ''}`} onClick={() => up({ amrapMin: m })}>{m} min</button>)}</div><NumberStepper label="Min" value={cfg.amrapMin} onChange={(v) => up({ amrapMin: v })} min={1} max={120} /></>}
            <p className="muted small" style={{ marginTop: 12, marginBottom: 0 }}>Changing settings while a timer runs restarts it.</p>
          </Card>}
          <Card>
            <h3 style={{ marginBottom: 8 }}>Cues</h3>
            <p className="muted small" style={{ margin: 0 }}>5-second get-ready, beeps on the last 3 seconds, a high tone for work, a low tone for rest, vibration on Android, optional voice (Me › Settings). The timer runs on timestamps, so it stays correct if you lock the phone, switch apps or even reload — the clock keeps counting, though sounds can’t play while the screen is off.</p>
          </Card>
        </div>
      </div>
    </Page>
  );
}

function SessionCard({ p, s, phases, bikeAs, setBikeAs }: { p: Program; s: Session; phases?: Phase[]; bikeAs?: 'indoor-cycle' | 'cycle'; setBikeAs: (v: 'indoor-cycle' | 'cycle') => void }) {
  const total = phases?.reduce((a, x) => a + x.sec, 0) || 0;
  return (
    <>
      {p.level === 'Expert' && <ExpertNote compact />}
      <Card>
        <div className="card-head"><div><div className="kicker">{p.name}</div><h3>{s.name}</h3><div className="muted small">{s.focus}{total ? ` · ${fmtTime(total)} total` : ''}</div></div></div>
        {bikeAs && <div style={{ margin: '10px 0' }}><Segmented small value={bikeAs} onChange={setBikeAs} options={[{ v: 'indoor-cycle', label: 'Save as indoor' }, { v: 'cycle', label: 'Save as outdoor' }]} /></div>}
        {phases ? <div className="plan-list" data-testid="plan-list">{phases.map((x, i) => <div key={i} className="plan-row"><span>{x.round && x.of ? `${x.label} ${x.round}/${x.of}` : x.label}</span><span className="t">{fmtTime(x.sec)}</span>{x.note && <span className="n">{x.note}</span>}</div>)}</div>
          : <div className="plan-list">{(s.pieces || []).map((x, i) => <div key={i} className="plan-row"><span>{x}</span><span className="t">{i + 1}</span></div>)}</div>}
        <p className="muted small" style={{ marginBottom: 0, marginTop: 10 }}>{phases ? 'Saved to history with this program, with calories estimated from time and effort (or heart rate if a strap is connected).' : 'For time: start the clock, tap Lap as each piece is done, then stop and save — each piece becomes a split.'} <Link className="link" to={`/train/program/${p.id}`}>Program, paces & FTP →</Link></p>
      </Card>
    </>
  );
}
