// Map-first Record screen for GPS run / walk / ride: full-screen map, floating live stats, bottom sheet with
// sport · Start · Add Route. Indoor / treadmill / bike-trainer sessions keep the classic Record screen.
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { HoldButton, Sheet } from '../components/ui';
import { useStore } from '../lib/store';
import { useToast } from '../lib/toast';
import { useRecorder, elapsedMs, type RecType } from '../lib/recorder';
import { cue } from '../lib/cues';
import { distUnit, haversine } from '../lib/calc';
import { saveLastPos, getLastPos } from '../lib/location';
import type { BikeKind } from '../lib/types';
import {
  SPORT_LABEL, buildHeat, cardStats, controlsFor, currentRate, flatten, fmtShortDist, followStep, cumulative, gpsQuality, isGpsSport,
  layerCount, loadActive, parseRouteText, loadPrefs, loadRoutes, makeRoute, pathLength, phaseOf, saveActive, savePrefs, saveRoutes, trackHeading,
  type FollowState, type GpsSport, type LatLng, type MapPrefs, type PlannedRoute,
} from '../lib/recordMap';
import { ATTR_OFM, ATTR_SAT, MAP_STYLES } from '../lib/mapStyles';
import type { Me, MapStatus } from '../components/RecordMap';
const RecordMap = lazy(() => import('../components/RecordMap'));

const SPORT_ICON: Record<GpsSport, string> = { run: 'run', walk: 'walk', cycle: 'bike' };
const plural = (t: string) => ({ run: 'runs', walk: 'walks', cycle: 'rides' } as Record<string, string>)[t] || 'activities';

/** Own position watch for the blue dot + heading cone (separate from the recorder's track watch). */
function useGeo() {
  const [pos, setPos] = useState<Me | null>(() => { const p = getLastPos(); return p && p.t ? { lat: p.lat, lng: p.lng, acc: Math.max(p.acc || 50, 50), heading: null } : null; });
  const [status, setStatus] = useState<'idle' | 'locating' | 'ok' | 'denied' | 'unavailable'>('idle');
  const id = useRef<number | null>(null);
  const compass = useRef<number | null>(null);
  const start = () => {
    if (!('geolocation' in navigator)) { setStatus('unavailable'); return; }
    if (id.current != null) navigator.geolocation.clearWatch(id.current);
    setStatus((s) => (s === 'ok' ? s : 'locating'));
    id.current = navigator.geolocation.watchPosition((p) => {
      const c = p.coords;
      const h = c.heading != null && !isNaN(c.heading) && (c.speed ?? 0) > 0.6 ? c.heading : compass.current;
      setPos({ lat: c.latitude, lng: c.longitude, acc: c.accuracy, heading: h ?? null });
      setStatus('ok'); saveLastPos({ lat: c.latitude, lng: c.longitude, acc: c.accuracy });
    }, (e) => setStatus(e.code === 1 ? 'denied' : 'unavailable'), { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 });
  };
  useEffect(() => {
    start();
    // Android Chrome gives an absolute compass heading without a permission prompt
    const o = (e: DeviceOrientationEvent) => { const a = (e as DeviceOrientationEvent & { webkitCompassHeading?: number }).webkitCompassHeading ?? (e.absolute && e.alpha != null ? 360 - e.alpha : null); if (a != null) compass.current = a; };
    window.addEventListener('deviceorientationabsolute', o as EventListener);
    return () => { if (id.current != null) navigator.geolocation.clearWatch(id.current); window.removeEventListener('deviceorientationabsolute', o as EventListener); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { pos, status, retry: start };
}
const useReducedMotion = () => {
  const [r, setR] = useState(() => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => { const m = window.matchMedia?.('(prefers-reduced-motion: reduce)'); if (!m) return; const f = () => setR(m.matches); m.addEventListener?.('change', f); return () => m.removeEventListener?.('change', f); }, []);
  return r;
};
const useDesktop = () => {
  const [d, setD] = useState(() => !!window.matchMedia?.('(min-width: 960px)').matches);
  useEffect(() => { const m = window.matchMedia?.('(min-width: 960px)'); if (!m) return; const f = () => setD(m.matches); m.addEventListener?.('change', f); return () => m.removeEventListener?.('change', f); }, []);
  return d;
};

export interface MapScreenProps {
  label: string;
  onStart: () => void;
  onResume: () => void;
  onAskFinish: () => void;
  /** HR, elevation, calories, steps, splits — shown in the expanded stats view. */
  expandedExtra: ReactNode;
  /** Units, auto-pause, treadmill, heart-rate strap, music, tips — the "More" sheet. */
  more: ReactNode;
  /** Live banners from the recorder (restored session, GPS error, no fix). */
  banners: ReactNode;
  liveKcal: number;
}

export default function RecordMapScreen({ label, onStart, onResume, onAskFinish, expandedExtra, more, banners, liveKcal }: MapScreenProps) {
  const r = useRecorder(); const { s } = r;
  const { data, profile } = useStore();
  const u = profile.units;
  const nav = useNavigate();
  const toast = useToast();
  const geo = useGeo();
  const reduced = useReducedMotion();
  const desktop = useDesktop();
  const [prefs, setPrefsState] = useState<MapPrefs>(() => loadPrefs());
  const setPrefs = (p: Partial<MapPrefs>) => setPrefsState((x) => { const n = { ...x, ...p }; savePrefs(n); return n; });
  const [sheet, setSheet] = useState<null | 'sport' | 'layers' | 'route' | 'more'>(null);
  const [expanded, setExpanded] = useState(false);
  const [follow, setFollow] = useState(true);
  const [recenterKey, setRecenterKey] = useState(0);
  const [mapStatus, setMapStatus] = useState<MapStatus>('loading');
  const [plan, setPlanState] = useState<PlannedRoute | null>(() => loadActive());
  const [saved, setSaved] = useState<PlannedRoute[]>(() => loadRoutes());
  const [draft, setDraft] = useState<LatLng[] | null>(null);
  const [draftName, setDraftName] = useState('');
  const [fit, setFit] = useState<{ key: string; pts: LatLng[] } | null>(() => { const a = loadActive(); return a ? { key: `init-${a.id}`, pts: a.points } : null; });
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const phase = phaseOf(s.status, s.autoPaused, false);
  const ctl = controlsFor(phase);
  const sport: GpsSport = isGpsSport(s.type) ? s.type : 'run';
  const el = elapsedMs(s) / 1000;
  const st = cardStats(s.type, el, s.distanceM, u);
  const cur = currentRate(s.type, r.currentPaceSec(), u);
  const live = s.segments[s.segments.length - 1]?.slice(-1)[0] || null;
  const recording = s.status !== 'idle';

  // Position: our own watch, else the recorder's last fix. Heading: GPS course → track direction → compass.
  const me: Me | null = useMemo(() => {
    const th = recording ? trackHeading(s.segments) : null;
    if (geo.pos && (geo.status === 'ok' || !live)) return { ...geo.pos, heading: geo.pos.heading ?? th };
    if (live) return { lat: live.lat, lng: live.lng, acc: live.acc ?? s.lastAcc ?? 20, heading: th };
    return geo.pos;
  }, [geo.pos, geo.status, live, recording, s.segments, s.lastAcc]);
  const acc = geo.status === 'ok' && geo.pos ? geo.pos.acc : s.lastAcc;
  const q = gpsQuality(geo.status === 'ok' || recording ? acc : null, geo.status === 'denied');
  const gpsText = q === 'off' ? 'Location off' : q === 'searching' ? 'Finding GPS…' : `GPS ±${Math.round(u === 'imperial' ? (acc || 0) * 3.28084 : acc || 0)} ${u === 'imperial' ? 'ft' : 'm'}`;

  // Follow the athlete while recording
  useEffect(() => { if (s.status === 'recording') setFollow(true); }, [s.status]);

  // Personal heat from saved GPS activities
  const heat = useMemo(() => {
    if (!prefs.heat) return null;
    const ws = data.workouts.filter((w) => w.routeId && (prefs.heatAll || w.type === sport));
    const rs = ws.map((w) => data.routes.find((x) => x.id === w.routeId)).filter(Boolean).map((x) => ({ id: x!.id, segments: x!.segments }));
    return buildHeat(rs);
  }, [prefs.heat, prefs.heatAll, data.workouts, data.routes, sport]);
  const heatCount = useMemo(() => data.workouts.filter((w) => w.routeId && (prefs.heatAll || w.type === sport)).length, [data.workouts, prefs.heatAll, sport]);

  // Route following (incremental: only new points are processed)
  const fol = useRef<{ id: string; n: number; st: FollowState | null; cum: number[] }>({ id: '', n: 0, st: null, cum: [] });
  const pts = useMemo(() => s.segments.flat(), [s.segments]);
  let follow$: FollowState | null = null;
  if (plan) {
    if (fol.current.id !== plan.id || pts.length < fol.current.n) fol.current = { id: plan.id, n: 0, st: null, cum: cumulative(plan.points) };
    for (let i = fol.current.n; i < pts.length; i++) fol.current.st = followStep({ points: plan.points, cum: fol.current.cum }, pts[i], fol.current.st?.alongM ?? 0);
    fol.current.n = pts.length;
    follow$ = fol.current.st;
  }
  const offRoute = !!(plan && follow$ && s.status === 'recording' && !follow$.onRoute && isFinite(follow$.offM));
  const wasOff = useRef(false);
  useEffect(() => { if (offRoute && !wasOff.current) cue('warn'); wasOff.current = offRoute; }, [offRoute]);
  const toStart = plan && me && !recording ? haversine(me, plan.points[0]) : null;

  const usePlan = (p: PlannedRoute | null, msg?: string) => {
    setPlanState(p); saveActive(p);
    if (p) { setPrefs({ showPlan: true }); setFit({ key: `${p.id}-${Date.now()}`, pts: p.points }); setFollow(false); }
    setSheet(null); if (msg) toast(msg);
  };
  const keepRoute = (p: PlannedRoute) => { const next = saveRoutes([p, ...saved.filter((x) => x.id !== p.id)]); setSaved(next); };
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setImporting(true);
    try {
      let p: PlannedRoute;
      if (/\.fit$/i.test(f.name)) {
        const { parseFile } = await import('../lib/import');
        const a = (await parseFile(f)).find((x) => x.segments.some((sg) => sg.length > 1));
        if (!a) throw new Error('No GPS track in that file.');
        p = makeRoute(a.name || f.name.replace(/\.[^.]+$/, ''), flatten(a.segments), 'file', undefined, isGpsSport(a.type) ? a.type : undefined);
      } else {
        if (f.size > 40 * 1024 * 1024) throw new Error('File is larger than 40 MB.');
        const rt = parseRouteText(await f.text(), f.name);
        p = makeRoute(rt.name, rt.points, 'file');
      }
      keepRoute(p); usePlan(p, `Route added · ${fmtShortDist(p.distanceM, u)}`);
    } catch (e) { toast((e as Error).message || 'Could not read that file'); }
    finally { setImporting(false); if (fileRef.current) fileRef.current.value = ''; }
  };
  const fromActivity = (wid: string) => {
    const w = data.workouts.find((x) => x.id === wid); const rt = w && data.routes.find((x) => x.id === w.routeId);
    if (!w || !rt) return;
    const p = makeRoute(w.title, flatten(rt.segments), 'activity', `act-${w.id}`, isGpsSport(w.type) ? w.type : undefined);
    usePlan(p, `Following “${p.name}”`);
  };
  const pastActs = useMemo(() => data.workouts.filter((w) => w.routeId && data.routes.some((x) => x.id === w.routeId)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 15), [data.workouts, data.routes]);

  const startDraw = () => { setDraft([]); setDraftName(''); setSheet(null); setFollow(false); };
  const saveDraft = () => {
    if (!draft || draft.length < 2) { toast('Tap at least two points on the map'); return; }
    const p = makeRoute(draftName || `My ${SPORT_LABEL[sport].toLowerCase()} route`, draft, 'drawn', undefined, sport);
    keepRoute(p); setDraft(null); usePlan(p, `Route saved · ${fmtShortDist(p.distanceM, u)}`);
  };

  const setType = (t: RecType, extra?: { indoor?: boolean; bikeKind?: BikeKind }) => { r.setup({ type: t, indoor: extra?.indoor ?? t === 'indoor-cycle', ...(extra?.bikeKind ? { bikeKind: extra.bikeKind } : {}) }); setSheet(null); };
  const recenter = () => {
    if (geo.status === 'denied' || geo.status === 'unavailable' || geo.status === 'idle') geo.retry();
    setFollow(true); setRecenterKey((k) => k + 1);
  };
  const toggleHeat = () => {
    if (!prefs.heat && !heatCount) { toast(`Record a few ${plural(prefs.heatAll ? 'x' : sport)} and the streets you use most will glow here`); }
    setPrefs({ heat: !prefs.heat });
    if (!prefs.heat && heatCount) {
      const h = buildHeat(data.workouts.filter((w) => w.routeId && (prefs.heatAll || w.type === sport)).map((w) => data.routes.find((x) => x.id === w.routeId)).filter(Boolean).map((x) => ({ id: x!.id, segments: x!.segments })));
      const pts2 = h.features.flatMap((f) => f.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })));
      if (pts2.length && (!me || pts2.every((p) => haversine(p, me) > 3000))) { setFit({ key: `heat-${Date.now()}`, pts: pts2 }); setFollow(false); }
    }
  };
  const count = layerCount(prefs, !!plan);
  const pad = desktop ? { top: 80, bottom: 40, left: 460, right: 80 } : { top: 90, bottom: 330, left: 20, right: 70 };
  const attr = prefs.style === 'satellite' ? ATTR_SAT + ' · ' + ATTR_OFM : ATTR_OFM;

  const primary = ctl.primary === 'start'
    ? <button className="rm-go" onClick={onStart} data-testid="record-start" aria-label={`Start ${label}`}><span>Start</span></button>
    : ctl.primary === 'pause'
      ? <button className="rm-go" onClick={r.pause} data-testid="record-pause" aria-label="Pause"><Icon name="pause" size={30} fill /><span className="sr">Pause</span></button>
      : <button className="rm-go" onClick={onResume} data-testid="record-resume" aria-label="Resume"><Icon name="play" size={30} fill /><span className="rm-go-l">Resume</span></button>;
  const controls = (
    <div className={`rm-actions ${ctl.showFinish ? 'paused' : ''}`}>
      {ctl.side && (ctl.canChangeSport
        ? <button className="rm-side" onClick={() => setSheet('sport')} aria-label={`Activity type: ${label}. Change`} data-testid="rm-sport"><span className="rm-sport-ic"><Icon name={SPORT_ICON[sport]} size={26} /><i className="rm-check"><Icon name="check" size={11} stroke={3.4} /></i></span><span>{label}</span></button>
        : <button className="rm-side" onClick={() => setSheet('more')} aria-label="Heart rate, units and settings"><span className="rm-sport-ic"><Icon name="heart" size={24} /></span><span>Sensors</span></button>)}
      {ctl.showFinish ? <>{primary}<HoldButton className="rm-finish" onHold={onAskFinish} label="Hold to finish" icon="stop" /></> : primary}
      {ctl.side && <button className="rm-side" onClick={() => setSheet('route')} data-testid="rm-add-route" aria-label={plan ? `Route: ${plan.name}. Change` : 'Add route'}><span className={`rm-sport-ic ${plan ? 'on' : ''}`}><Icon name="route" size={24} /></span><span>{plan ? 'Route' : 'Add Route'}</span></button>}
    </div>
  );

  return (
    <div className={`recmap ${expanded ? 'is-expanded' : ''} ${draft ? 'is-drawing' : ''}`} data-testid="record-map-screen" data-phase={phase} data-map={mapStatus}>
      <Suspense fallback={<div className="rm-canvas rm-loading" />}>
        <RecordMap prefs={prefs} track={s.segments} me={me} follow={follow && !draft} onUserPan={() => setFollow(false)} plan={draft ? null : plan} draft={draft}
          onMapTap={draft ? (p) => setDraft((d) => [...(d || []), p]) : undefined} heat={heat} recenterKey={recenterKey}
          fitKey={fit?.key || ''} fitTo={fit?.pts || null} reducedMotion={reduced} onStatus={setMapStatus} padding={pad} />
      </Suspense>

      {!draft && <div className="rm-top">
        <button className="rm-round" onClick={() => (history.length > 1 ? nav(-1) : nav('/'))} aria-label="Back"><Icon name="back" /></button>
        <button className={`rm-promo ${prefs.heat ? 'on' : ''}`} onClick={toggleHeat} aria-pressed={prefs.heat} data-testid="rm-heat">
          <Icon name="fire" size={16} fill={prefs.heat} />{prefs.heat ? `Your streets · ${heatCount} ${plural(prefs.heatAll ? 'x' : sport)}` : `See your most-used streets`}
        </button>
        <span className="rm-top-sp" />
      </div>}

      {!draft && <div className="rm-stack" role="toolbar" aria-label="Map controls">
        <button className="rm-round" onClick={() => setSheet('layers')} aria-label={`Map layers${count ? `, ${count} on` : ''}`} data-testid="rm-layers"><Icon name="layers" />{count > 0 && <span className="rm-badge">{count}</span>}</button>
        <button className={`rm-round ${prefs.threeD ? 'on' : ''}`} onClick={() => setPrefs({ threeD: !prefs.threeD })} aria-pressed={prefs.threeD} aria-label="3D view" data-testid="rm-3d"><b className="rm-3d">3D</b></button>
        <button className={`rm-round ${follow ? 'on' : ''}`} onClick={recenter} aria-pressed={follow} aria-label="Centre on my location and follow" data-testid="rm-recenter"><Icon name="locate" size={20} fill={follow} /></button>
      </div>}

      {!draft && <div className="rm-banners" aria-live="polite">
        {geo.status === 'denied' && !recording && <div className="rm-banner warn"><b>Location is off.</b> Allow location for this site in your browser settings (iPhone: Settings › Privacy &amp; Security › Location Services). You can still start — the timer runs, distance needs GPS. <button className="link" onClick={geo.retry}>Try again</button></div>}
        {mapStatus === 'offline' && <div className="rm-banner">Map tiles can’t load right now — your track still records and draws here.</div>}
        {mapStatus === 'nogl' && <div className="rm-banner">This browser can’t draw the full map, so you’ll see a simple track view. Recording works the same.</div>}
        {banners}
        {s.autoPaused && <div className="rm-banner y">Auto-paused</div>}
        {offRoute && follow$ && <div className="rm-banner warn" data-testid="rm-offroute">Off route · {fmtShortDist(follow$.offM, u)} away</div>}
        {!recording && q === 'weak' && <div className="rm-banner">Weak GPS (±{Math.round(acc || 0)} m). Distance is more accurate once the signal settles — step outside with a clear view of the sky.</div>}
      </div>}

      {draft && <div className="rm-draw" data-testid="rm-draw">
        <div className="rm-draw-top"><b>Draw a route</b><span>Tap the map to add points · {fmtShortDist(pathLength(draft), u)}</span></div>
        <div className="rm-draw-bar">
          <input className="input" value={draftName} onChange={(e) => setDraftName(e.target.value)} placeholder="Route name" aria-label="Route name" maxLength={60} />
          <div className="row gap8">
            <button className="btn sm" onClick={() => setDraft((d) => (d || []).slice(0, -1))} disabled={!draft.length}><Icon name="undo" size={16} />Undo</button>
            <button className="btn sm" onClick={() => setDraft([])} disabled={!draft.length}>Clear</button>
            <button className="btn sm" onClick={() => setDraft(null)}>Cancel</button>
            <button className="btn sm y" onClick={saveDraft} disabled={draft.length < 2} data-testid="rm-draw-save">Save</button>
          </div>
          <p className="muted small" style={{ margin: 0 }}>Straight lines between taps — follow streets by adding a point at each turn.</p>
          <p className="rm-attr" dangerouslySetInnerHTML={{ __html: attr }} />
        </div>
      </div>}

      {!draft && <div className="rm-bottom">
        <section className="rm-card" aria-label="Live stats" data-testid="rm-stats">
          <div className="rm-card-h">
            <h2>{label}</h2>
            {recording && <span className={`rm-state ${s.status}`}>{s.status === 'recording' ? (s.autoPaused ? 'Auto-paused' : <><i className="live-dot" />Recording</>) : 'Paused'}</span>}
            <span className={`rm-gps q-${q}`} title="GPS accuracy"><i />{gpsText}</span>
            <button className="rm-x" onClick={() => setExpanded(true)} aria-label="Expand stats" data-testid="rm-expand"><Icon name="expand" size={18} /></button>
          </div>
          <div className="rm-stats">
            <div><b className="mono" data-testid="rm-time">{st.time}</b><span>Time</span></div>
            <div><b className="mono">{st.rate}<small>{st.rateUnit}</small></b><span>{st.rateLabel}</span></div>
            <div><b className="mono" data-testid="rm-dist">{st.distance}<small>{st.distUnit}</small></b><span>Distance</span></div>
          </div>
          {plan && <div className="rm-route" data-testid="rm-route-row">
            <Icon name="route" size={16} /><span className="rm-route-n">{plan.name}</span>
            <span className="rm-route-v">{follow$ ? <><b>{fmtShortDist(follow$.remainingM, u)}</b> to go{follow$.done ? ' · done!' : ''}</> : toStart != null && toStart > 60 ? <>{fmtShortDist(plan.distanceM, u)} · start {fmtShortDist(toStart, u)} away</> : <>{fmtShortDist(plan.distanceM, u)}</>}</span>
            {follow$ && <i className="rm-route-bar" style={{ width: `${Math.round(follow$.pct * 100)}%` }} />}
          </div>}
        </section>
        <section className="rm-sheet" aria-label="Recording controls">
          <button className="rm-handle" onClick={() => setSheet('more')} aria-label="More options: units, auto-pause, heart rate, music"><i /></button>
          {controls}
          <p className="rm-attr" dangerouslySetInnerHTML={{ __html: attr }} />
        </section>
      </div>}

      {expanded && <div className="rm-expanded" role="dialog" aria-label="Live stats" data-testid="rm-expanded">
        <div className="rm-exp-h"><span className="kicker">{label}{recording ? ` · ${s.status === 'recording' ? (s.autoPaused ? 'auto-paused' : 'recording') : 'paused'}` : ''}</span><button className="rm-round" onClick={() => setExpanded(false)} aria-label="Back to map"><Icon name="collapse" size={20} /></button></div>
        <div className="rm-exp-body">
          <div className="rm-exp-big"><b className="mono">{st.time}</b><span>Time</span></div>
          <div className="rm-exp-big"><b className="mono">{st.distance}</b><span>Distance ({distUnit(u)})</span></div>
          <div className="rm-exp-row">
            <div><b className="mono">{st.rate}</b><span>{st.rateLabel} {st.rateUnit}</span></div>
            <div><b className="mono">{cur}</b><span>{sport === 'cycle' ? `Speed now ${st.rateUnit}` : `Pace now ${st.rateUnit}`}</span></div>
          </div>
          <div className="rm-exp-row">
            <div><b className="mono">~{liveKcal}</b><span>kcal (est.)</span></div>
            {plan && follow$ ? <div><b className="mono">{fmtShortDist(follow$.remainingM, u)}</b><span>Route to go</span></div> : <div><b className="mono">{s.splits.length}</b><span>{distUnit(u)} splits</span></div>}
          </div>
          <div className="rm-exp-extra">{expandedExtra}</div>
        </div>
        <div className="rm-exp-ctl">{controls}</div>
      </div>}

      <Sheet open={sheet === 'sport'} onClose={() => setSheet(null)} title="Choose activity">
        <div className="rm-pick" role="radiogroup" aria-label="GPS activities" data-testid="rm-sport-sheet">
          {(['run', 'walk', 'cycle'] as GpsSport[]).map((t) => (
            <button key={t} role="radio" aria-checked={sport === t} className={`rm-pick-i ${sport === t ? 'on' : ''}`} onClick={() => setType(t, { indoor: false })}>
              <span className="rm-sport-ic"><Icon name={SPORT_ICON[t]} size={26} />{sport === t && <i className="rm-check"><Icon name="check" size={11} stroke={3.4} /></i>}</span>
              <b>{SPORT_LABEL[t]}</b><span className="muted small">{t === 'cycle' ? 'GPS · speed in ' + (u === 'imperial' ? 'mph' : 'km/h') : 'GPS · pace /' + distUnit(u)}</span>
            </button>))}
        </div>
        <div className="sr-label" style={{ marginTop: 14 }}>Indoor · no GPS</div>
        <div className="rm-list">
          <button onClick={() => setType('run', { indoor: true })}><Icon name="run" /><span><b>Treadmill</b><small>Timer only — enter the distance at the end</small></span><Icon name="chevron" size={16} /></button>
          <button onClick={() => setType('indoor-cycle', { bikeKind: 'indoor' })}><Icon name="bike" /><span><b>Indoor bike</b><small>Spin bike or smart trainer</small></span><Icon name="chevron" size={16} /></button>
          <button onClick={() => setType('indoor-cycle', { bikeKind: 'stationary' })}><Icon name="bike" /><span><b>Stationary bike</b><small>Gym bike — watts and rpm at the end</small></span><Icon name="chevron" size={16} /></button>
        </div>
        <div className="sr-label" style={{ marginTop: 14 }}>Other workouts</div>
        <div className="rm-list">
          <Link to="/train/log" onClick={() => setSheet(null)}><Icon name="train" /><span><b>Strength &amp; gym</b><small>Log sets, reps and weights</small></span><Icon name="chevron" size={16} /></Link>
          <Link to="/timers" onClick={() => setSheet(null)}><Icon name="timer" /><span><b>Interval timers</b><small>Tabata, EMOM, AMRAP, rounds</small></span><Icon name="chevron" size={16} /></Link>
          <Link to="/train/ultra" onClick={() => setSheet(null)}><Icon name="trophy" /><span><b>Ultra &amp; Backyard</b><small>Plans and the backyard lap timer</small></span><Icon name="chevron" size={16} /></Link>
        </div>
      </Sheet>

      <Sheet open={sheet === 'layers'} onClose={() => setSheet(null)} title="Map layers">
        <div className="rm-styles" role="radiogroup" aria-label="Map style" data-testid="rm-layers-sheet">
          {MAP_STYLES.map((m) => (
            <button key={m.id} role="radio" aria-checked={prefs.style === m.id} className={`rm-style ${m.id} ${prefs.style === m.id ? 'on' : ''}`} onClick={() => setPrefs({ style: m.id })}>
              <i className="rm-style-sw" /><b>{m.label}</b><small>{m.note}</small>
            </button>))}
        </div>
        <div className="sr-label" style={{ marginTop: 14 }}>Overlays</div>
        <button className="toggle" style={{ width: '100%' }} onClick={toggleHeat}><span><b>Your streets</b><div className="muted small">Glows where you’ve {sport === 'cycle' && !prefs.heatAll ? 'ridden' : 'gone'} most — built only from your saved HYBRD activities ({heatCount})</div></span><span className={`switch ${prefs.heat ? 'on' : ''}`} /></button>
        {prefs.heat && <div className="seg small" style={{ margin: '0 0 8px' }}><button className={!prefs.heatAll ? 'on' : ''} onClick={() => setPrefs({ heatAll: false })}>Only {plural(sport)}</button><button className={prefs.heatAll ? 'on' : ''} onClick={() => setPrefs({ heatAll: true })}>All activities</button></div>}
        <button className="toggle" style={{ width: '100%' }} onClick={() => plan ? setPrefs({ showPlan: !prefs.showPlan }) : setSheet('route')}><span><b>Planned route</b><div className="muted small">{plan ? `${plan.name} · ${fmtShortDist(plan.distanceM, u)}` : 'None yet — tap to add one'}</div></span><span className={`switch ${plan && prefs.showPlan ? 'on' : ''}`} /></button>
        <button className="toggle" style={{ width: '100%' }} onClick={() => setPrefs({ threeD: !prefs.threeD })}><span><b>3D view</b><div className="muted small">Tilts the map; buildings rise on Dark and Standard</div></span><span className={`switch ${prefs.threeD ? 'on' : ''}`} /></button>
        <p className="muted small" style={{ marginTop: 10 }}>Map tiles load only for the area you’re viewing. If they can’t load, your track still records. <span dangerouslySetInnerHTML={{ __html: attr }} /></p>
      </Sheet>

      <Sheet open={sheet === 'route'} onClose={() => setSheet(null)} title={plan ? 'Your route' : 'Add a route'}>
        {plan && <div className="card" style={{ marginBottom: 12 }} data-testid="rm-active-route">
          <div className="row"><Icon name="route" /><div style={{ flex: 1, minWidth: 0 }}><b>{plan.name}</b><div className="muted small">{fmtShortDist(plan.distanceM, u)} · {plan.source === 'drawn' ? 'drawn on the map' : plan.source === 'file' ? 'from a file' : 'from an activity'}</div></div></div>
          <div className="row gap8" style={{ marginTop: 10 }}><button className="btn sm" onClick={() => { setFit({ key: `show-${Date.now()}`, pts: plan.points }); setFollow(false); setSheet(null); }}>Show whole route</button><button className="btn sm" onClick={() => usePlan(null, 'Route removed')}>Remove</button></div>
        </div>}
        <div className="rm-list">
          <button onClick={startDraw} data-testid="rm-draw-start"><Icon name="edit" /><span><b>Draw a route</b><small>Tap points on the map — distance adds up as you go</small></span><Icon name="chevron" size={16} /></button>
          <button onClick={() => fileRef.current?.click()} disabled={importing}><Icon name="upload" /><span><b>{importing ? 'Reading file…' : 'Import GPX, TCX or FIT'}</b><small>From Strava, Garmin, Komoot or any route planner — read on this device</small></span><Icon name="chevron" size={16} /></button>
          <input ref={fileRef} type="file" accept=".gpx,.tcx,.fit,application/gpx+xml" hidden onChange={(e) => onFile(e.target.files?.[0])} data-testid="rm-route-file" />
        </div>
        {saved.length > 0 && <><div className="sr-label" style={{ marginTop: 14 }}>Saved routes</div>
          <div className="rm-list">{saved.map((p) => <div key={p.id} className="rm-li">
            <button onClick={() => usePlan(p, `Following “${p.name}”`)}><Icon name="route" /><span><b>{p.name}</b><small>{fmtShortDist(p.distanceM, u)} · {p.source === 'drawn' ? 'drawn' : 'imported'}</small></span></button>
            <button className="rm-del" aria-label={`Delete ${p.name}`} onClick={() => { const n = saveRoutes(saved.filter((x) => x.id !== p.id)); setSaved(n); if (plan?.id === p.id) usePlan(null); }}><Icon name="trash" size={16} /></button>
          </div>)}</div></>}
        {pastActs.length > 0 && <><div className="sr-label" style={{ marginTop: 14 }}>Repeat one of your activities</div>
          <div className="rm-list">{pastActs.map((w) => <button key={w.id} onClick={() => fromActivity(w.id)}><Icon name={w.type === 'cycle' ? 'bike' : w.type === 'walk' ? 'walk' : 'run'} /><span><b>{w.title}</b><small>{new Date(w.date).toLocaleDateString()} · {fmtShortDist(w.distanceM || 0, u)}</small></span><Icon name="chevron" size={16} /></button>)}</div></>}
        <p className="muted small" style={{ marginTop: 12 }}>Saved routes stay on this device. While you record, HYBRD shows the distance left and warns you if you go more than {u === 'imperial' ? '130 ft' : '40 m'} off the route.</p>
      </Sheet>

      <Sheet open={sheet === 'more'} onClose={() => setSheet(null)} title="Recording options">{more}</Sheet>
    </div>
  );
}
