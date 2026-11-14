import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { MusicButton } from '../components/Music';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useRecorder, elapsedMs, type RecType } from '../lib/recorder';
import { useStore, uid } from '../lib/store';
import { distUnit, elevUnit, estKcal, fmtPace, fmtTime, fromDist, paceSec, speedUnit, splitsFromTrack, splitUnitM, strideM, toDist, toElev, toSpeed } from '../lib/calc';
import { motionNeedsPermission, motionSupported, requestMotionPermission } from '../lib/pedometer';
import { DistToggle } from '../components/UnitToggle';
import { Page, Banner, Segmented, Card, HoldButton, Sheet, Pill } from '../components/ui';
import { Icon } from '../components/Icon';
import { isIOS, isStandalone, onWakeLock, unlockAudio, wakeLockSupported } from '../lib/cues';
import type { GpsRoute, Workout } from '../lib/types';
import { useToast } from '../lib/toast';
const MapView = lazy(() => import('../components/MapView').then((m) => ({ default: m.MapView })));

const LABEL: Record<RecType, string> = { run: 'Run', walk: 'Walk', cycle: 'Ride' };

export default function Record() {
  const r = useRecorder();
  const { s } = r;
  const { profile, upsert } = useStore();
  const u = profile.units;
  const nav = useNavigate();
  const toast = useToast();
  const [sp] = useSearchParams();
  const [showMap, setShowMap] = useState(false);
  const [primary, setPrimary] = useState<'time' | 'dist'>('time');
  const [finishing, setFinishing] = useState(false);
  const [rpe, setRpe] = useState(5);
  const [title, setTitle] = useState('');
  const [indoorDist, setIndoorDist] = useState('');
  const [wake, setWake] = useState(false);
  useEffect(() => onWakeLock(setWake), []);
  useEffect(() => {
    const t = sp.get('type') as RecType | null;
    if (s.status === 'idle' && t && ['run', 'walk', 'cycle'].includes(t)) r.setup({ type: t });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Keep the recorder's split length in step with mi/km — also mid-session (splits are rebuilt from raw points).
  useEffect(() => { if (Math.abs(s.splitUnitM - splitUnitM(u)) > 1) r.setup({ splitUnitM: splitUnitM(u) }); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [u, s.status]);
  const splits = useMemo(() => splitsFromTrack(s.segments, splitUnitM(u)), [s.segments, u]);

  const el = elapsedMs(s) / 1000;
  const avgPace = paceSec(el, s.distanceM, u);
  const curPace = r.currentPaceSec();
  const cur = curPace ? curPace * splitUnitM(u) : 0;
  const lastSeg = s.segments[s.segments.length - 1] || [];
  const live = lastSeg[lastSeg.length - 1] || null;
  const stale = s.status === 'recording' && !s.indoor && s.lastFixAt > 0 && Date.now() - s.lastFixAt > 15000;

  // Steps: accelerometer when available, else GPS distance ÷ step length (labelled est.)
  const onFoot = s.type !== 'cycle';
  const stride = strideM(profile, s.type);
  const sensor = onFoot && (s.motion === 'granted' || (s.motion === 'waiting' && s.steps > 0));
  const estSteps = s.indoor ? 0 : Math.round(s.distanceM / stride);
  const steps = sensor ? s.steps : estSteps;
  const cadNow = !onFoot || s.status !== 'recording' || s.autoPaused ? 0 : sensor ? r.sensorCadence() : (() => { const c = curPace ? Math.round(60 / (curPace * stride)) : 0; return c >= 40 && c <= 230 ? c : 0; })();
  const avgCad = steps && el > 30 ? Math.round(steps / (el / 60)) : 0;
  const motionNote = s.motion === 'denied' ? 'Motion access was denied — steps are estimated from GPS distance. Allow motion sensors for this site in your browser settings (iPhone: close and reopen HYBRD, then tap Allow when asked).'
    : s.motion === 'unsupported' || s.motion === 'no-data' ? 'No motion sensor available in this browser — steps are estimated from GPS distance ÷ your step length.'
    : s.motion === 'waiting' && !s.steps ? 'Starting the motion sensor…' : '';
  const askMotion = () => { if (s.type !== 'cycle') requestMotionPermission().then(r.setMotion); };
  const begin = () => { unlockAudio(); r.start(); askMotion(); };
  const resume = () => { unlockAudio(); r.resume(); askMotion(); };
  const askFinish = () => { if (s.status === 'recording') r.pause(); setTitle(`${new Date().getHours() < 12 ? 'Morning' : new Date().getHours() < 18 ? 'Afternoon' : 'Evening'} ${LABEL[s.type]}`); setFinishing(true); };
  const save = () => {
    const f = r.finish();
    const dur = Math.round(elapsedMs(f) / 1000);
    const dist = f.indoor ? fromDist(parseFloat(indoorDist) || 0, u) : f.distanceM;
    const id = uid();
    const segs = f.segments.filter((x) => x.length > 1);
    let routeId: string | undefined;
    if (segs.length) { routeId = `${id}-r`; upsert<GpsRoute>('routes', { id: routeId, workoutId: id, segments: segs }); }
    const w: Workout = { id, updatedAt: Date.now(), date: new Date(f.startedAt).toISOString(), type: f.type, title: title || LABEL[f.type], durationSec: dur, distanceM: dist || undefined, elevGainM: f.indoor ? undefined : Math.round(f.elevGainM), rpe, splits: f.indoor ? undefined : splitsFromTrack(f.segments, splitUnitM(u)), routeId, source: f.indoor ? 'indoor' : 'gps' };
    if (f.type !== 'cycle') {
      const fSensor = f.motion === 'granted' && f.steps > 0;
      const st = fSensor ? f.steps : Math.round((dist || 0) / strideM(profile, f.type));
      if (st > 0) { w.steps = st; w.stepsSource = fSensor ? 'sensor' : 'est'; w.cadence = dur > 30 ? Math.round(st / (dur / 60)) : undefined; }
    }
    w.kcal = estKcal(w, profile.weightKg);
    upsert<Workout>('workouts', w);
    setFinishing(false); toast('Activity saved');
    nav(`/train/workout/${id}`);
  };

  if (s.status === 'idle') return (
    <Page title="Record" kicker="GPS · Run · Walk · Ride" actions={<><MusicButton /><Link className="btn sm" to="/routes"><Icon name="map" size={18} />Routes</Link></>}>
      <div className="row" style={{ alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}><Segmented value={s.type} onChange={(v) => r.setup({ type: v })} options={[{ v: 'run', label: 'Run' }, { v: 'walk', label: 'Walk' }, { v: 'cycle', label: 'Ride' }]} /></div>
        <div style={{ paddingTop: 4 }}><DistToggle /></div>
      </div>
      <Card className="hero">
        <div className="big-num" style={{ fontSize: 96 }}>0:00</div>
        <div className="big-sub">{LABEL[s.type]} · {s.indoor ? 'Indoor / treadmill (no GPS)' : 'Outdoor GPS'}</div>
      </Card>
      <Card>
        <button className="toggle" style={{ width: '100%' }} onClick={() => r.setup({ indoor: !s.indoor })}><span><b>Indoor / treadmill</b><div className="muted small">Timer only, enter the distance at the end</div></span><span className={`switch ${s.indoor ? 'on' : ''}`} /></button>
        <button className="toggle" style={{ width: '100%' }} onClick={() => r.setup({ autoPause: !s.autoPause })}><span><b>Auto-pause</b><div className="muted small">Pauses when you stop for ~10 s (lights, traffic)</div></span><span className={`switch ${s.autoPause ? 'on' : ''}`} /></button>
      </Card>
      {!s.indoor && <button className="btn sm block" style={{ marginBottom: 12 }} onClick={() => setShowMap(!showMap)}><Icon name="map" size={16} />{showMap ? 'Hide map' : 'Show map · where am I?'}</button>}
      {showMap && !s.indoor && <div style={{ marginBottom: 12 }}><Suspense fallback={<div className="map" style={{ height: 240 }} />}><MapView routes={[]} height={240} locateOnOpen /></Suspense></div>}
      {!s.indoor && <Banner>We use GPS only while you record, and the route stays on this device{profile.name ? '' : ''} unless you sign in to sync. Your browser will ask for location permission when you tap Start.</Banner>}
      {!s.indoor && isIOS() && <Banner tone="warn"><b>iPhone: keep the screen on.</b> iOS stops web GPS when the screen locks or you switch apps. HYBRD keeps the screen awake while recording {isStandalone() ? '(works in the Home Screen app on iOS 18.4+)' : '— for this to work reliably, add HYBRD to your Home Screen (iOS 18.4+)'}. Use an armband or bike mount.</Banner>}
      {s.type !== 'cycle' && <p className="muted small" style={{ margin: '0 0 10px' }}><b>Steps & cadence:</b> {!motionSupported() ? 'this browser has no motion sensor, so steps will be estimated from distance.' : motionNeedsPermission() ? 'counted with the phone’s motion sensor while the screen is on — if your phone asks, tap Allow motion access after Start. No sensor or denied → estimated from distance.' : 'counted with the phone’s motion sensor while the screen is on; estimated from distance if no sensor is found.'}</p>}
      <button className="btn y big block" onClick={begin}><Icon name="play" fill />Start {LABEL[s.type]}</button>
      <p className="muted small center" style={{ marginTop: 10 }}>Splits every {distUnit(u)} · {speedUnit(u)} · elevation in {elevUnit(u)} · switch mi | km any time, even mid-run</p>
    </Page>
  );

  return (
    <div className="page session">
      <div className="row" style={{ flexWrap: 'wrap', rowGap: 8 }}><span className="pill yellow">{s.status === 'recording' ? <><span className="live-dot" />Recording</> : 'Paused'}</span><Pill>{LABEL[s.type]}</Pill>
        <DistToggle />
        <MusicButton />
        <span className="spacer" />
        {!s.indoor && <Pill tone={s.lastAcc != null && s.lastAcc <= 20 ? 'yellow' : 'dim'}>GPS {s.lastAcc != null ? `±${Math.round(toElev(s.lastAcc, u))} ${elevUnit(u)}` : '…'}</Pill>}
        {wakeLockSupported() && <Pill tone={wake ? 'yellow' : 'dim'}>{wake ? 'Screen on' : 'Screen can sleep'}</Pill>}
      </div>
      {s.restored && <Banner tone="warn">Session restored after the app closed. GPS was off in between — tap Resume to continue or Hold to finish.</Banner>}
      {s.error && <Banner tone="warn">{s.error}</Banner>}
      {stale && <Banner tone="warn">No GPS fix for {Math.round((Date.now() - s.lastFixAt) / 1000)} s — distance resumes when the signal returns.</Banner>}
      {s.autoPaused && <div className="auto-paused">Auto-paused</div>}
      {isIOS() && !wake && s.status === 'recording' && !s.indoor && <Banner tone="warn">Keep this screen on — iPhone can’t track GPS with the screen locked.</Banner>}

      <button onClick={() => setPrimary(primary === 'time' ? 'dist' : 'time')} aria-label="Switch main number">
        <div className={`big-num ${s.status === 'recording' && !s.autoPaused ? '' : 'y'}`}>{primary === 'time' ? fmtTime(el) : toDist(s.distanceM, u).toFixed(2)}</div>
        <div className="big-sub">{primary === 'time' ? 'Elapsed · tap for distance' : `${distUnit(u)} · tap for time`}</div>
      </button>
      <div className="grid3">
        <div className="stat"><div className="stat-v">{primary === 'time' ? toDist(s.distanceM, u).toFixed(2) : fmtTime(el)}</div><div className="stat-l">{primary === 'time' ? distUnit(u) : 'time'}</div></div>
        {s.type === 'cycle'
          ? <div className="stat"><div className="stat-v">{el > 0 && s.distanceM ? toSpeed(s.distanceM / el, u).toFixed(1) : '—'}</div><div className="stat-l">avg {speedUnit(u)}</div></div>
          : <div className="stat"><div className="stat-v">{cur ? fmtTime(cur) : '—'}</div><div className="stat-l">pace now /{distUnit(u)}</div></div>}
        <div className="stat"><div className="stat-v">{avgPace ? fmtPace(avgPace, u).split(' ')[0] : '—'}</div><div className="stat-l">avg pace /{distUnit(u)}</div></div>
      </div>
      <div className="grid3">
        <div className="stat"><div className="stat-v">{Math.round(toElev(s.elevGainM, u))}<small> {elevUnit(u)}</small></div><div className="stat-l">elev. gain</div></div>
        <div className="stat"><div className="stat-v">{splits.length}</div><div className="stat-l">{distUnit(u)} splits</div></div>
        <div className="stat"><div className="stat-v">~{estKcal({ type: s.type, durationSec: el, distanceM: s.distanceM }, profile.weightKg)}</div><div className="stat-l">kcal est.</div></div>
      </div>
      {onFoot && <div className="grid3" data-testid="steps">
        <div className="stat accent"><div className="stat-v">{steps.toLocaleString()}{!sensor && <small> est.</small>}</div><div className="stat-l">steps{sensor ? ' · sensor' : ''}</div></div>
        <div className="stat"><div className="stat-v">{cadNow || '—'}{!sensor && cadNow ? <small> est.</small> : null}</div><div className="stat-l">cadence spm</div></div>
        <div className="stat"><div className="stat-v">{avgCad || '—'}</div><div className="stat-l">avg spm</div></div>
      </div>}
      {onFoot && motionNote && <p className="muted small" style={{ margin: '-4px 0 8px' }}>{motionNote}</p>}
      {splits.length > 0 && <div className="lap-list" data-testid="live-splits">{splits.slice(-3).reverse().map((sp2) => <div key={sp2.label}><span>{distUnit(u)} {sp2.label}</span><span>{fmtTime(sp2.sec)}</span></div>)}</div>}

      {!s.indoor && <button className="btn sm" onClick={() => setShowMap(!showMap)}><Icon name="map" size={16} />{showMap ? 'Hide map' : 'Show map'}</button>}
      {showMap && !s.indoor && <Suspense fallback={<div className="map" style={{ height: 260 }} />}><MapView routes={[{ id: 'live', segments: s.segments, highlight: true }]} live={live} follow height={260} /></Suspense>}

      <div className="controls" style={{ marginTop: 10, marginBottom: 30 }}>
        <div>{s.status === 'recording'
          ? <button className="ctrl y" aria-label="Pause" onClick={r.pause}><Icon name="pause" size={30} fill /></button>
          : <button className="ctrl y" aria-label="Resume" onClick={resume}><Icon name="play" size={30} fill /></button>}
          <div className="ctrl-l">{s.status === 'recording' ? 'Pause' : 'Resume'}</div></div>
        <div style={{ width: 24 }} />
        <HoldButton onHold={askFinish} label="Hold to finish" />
      </div>

      <Sheet open={finishing} onClose={() => setFinishing(false)} title="Finish activity">
        <div className="grid3" style={{ marginBottom: 12 }}>
          <div className="stat accent"><div className="stat-v">{fmtTime(el)}</div><div className="stat-l">time</div></div>
          <div className="stat"><div className="stat-v">{s.indoor ? '—' : toDist(s.distanceM, u).toFixed(2)}</div><div className="stat-l">{distUnit(u)}</div></div>
          <div className="stat"><div className="stat-v">{avgPace ? fmtTime(avgPace) : '—'}</div><div className="stat-l">avg /{distUnit(u)}</div></div>
        </div>
        {onFoot && (steps > 0 || s.indoor) && <p className="muted small" style={{ marginTop: 0 }}>{sensor ? `${s.steps.toLocaleString()} steps counted by the motion sensor` : s.indoor ? 'Steps will be estimated from the distance you enter' : `≈ ${steps.toLocaleString()} steps (est. from distance ÷ ${Math.round(stride * 100)} cm step)`}{avgCad ? ` · ${avgCad} spm avg` : ''}. They’re added to today’s step total.</p>}
        <label className="field"><span>Title</span><input value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        {s.indoor && <label className="field"><span>Distance ({distUnit(u)})</span><input inputMode="decimal" value={indoorDist} onChange={(e) => setIndoorDist(e.target.value)} placeholder="From the treadmill display" /></label>}
        <div className="field"><span>Effort (RPE)</span><div className="rpe">{Array.from({ length: 10 }, (_, k) => k + 1).map((n) => <button key={n} className={rpe === n ? 'on' : ''} onClick={() => setRpe(n)}>{n}</button>)}</div></div>
        {s.gaps.length > 0 && <p className="muted small">Tracking paused {s.gaps.length}× for {fmtTime(s.gaps.reduce((a, g) => a + g.sec, 0))} total (screen off / no signal). Those gaps aren’t counted.</p>}
        <div className="row wrap"><button className="btn y" onClick={save}>Save activity</button><button className="btn" onClick={() => { setFinishing(false); resume(); }}>Resume</button><button className="btn danger" onClick={() => { if (confirm('Discard this activity?')) { r.discard(); setFinishing(false); } }}>Discard</button></div>
      </Sheet>
    </div>
  );
}
