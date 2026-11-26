import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ShareSheet } from '../components/ShareSheet';
import { SaveActivityForm, type SaveFields } from '../components/SaveActivity';
import { Sheet, Segmented } from '../components/ui';
import { useMedia, useGalleryUrl, saveBlob } from '../lib/gallery';
import { useActivityPublisher } from '../lib/useShare';
import { prefsOf, mapPrivacyFor, privacySummary, publicRoute } from '../lib/privacy';
import { originalGpx, shareFileName, visibilityLabel } from '../lib/share';
import { useToast } from '../lib/toast';
import { uid } from '../lib/store';
import type { GalleryItem } from '../lib/media';
import type { Workout, WorkoutType } from '../lib/types';
import { useStore } from '../lib/store';
import { Page, Card, Stat, Empty, Pill } from '../components/ui';
import { activityLabel, fmtDist, fmtPace, fmtTime, fmtW, isBikeType, isGpsType, paceSec, distUnit, fmtSpeed, fmtShort, splitsFromTrack, splitUnitM, toElev, elevUnit, wu, KM_PER_MI } from '../lib/calc';
import { DistToggle } from '../components/UnitToggle';
import { ByuUnitToggle } from '../components/ByuUnits';
import { YARD_EXPLAIN, fmtByuDist, fmtByuEquals, fmtByuPace, fmtByuWorkoutDist, isByuWorkout, resolveByuUnit, yardsFromDistanceM } from '../lib/ultra';
import { Icon } from '../components/Icon';
import { HrSummary } from '../components/HeartRate';
import { SourceBadge, ViewOnStrava, PoweredByStrava } from '../components/Strava';
import { loadStreams, useStrava } from '../lib/strava';
const MapView = lazy(() => import('../components/MapView').then((m) => ({ default: m.MapView })));

export default function WorkoutDetail() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const { data, profile, remove, upsert } = useStore();
  const [sp, setSp] = useSearchParams();
  const [shareOpen, setShareOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [view, setView] = useState<'you' | 'others'>('you');
  const media = useMedia();
  const pub = useActivityPublisher();
  const toast = useToast();
  const u = profile.units;
  const w = data.workouts.find((x) => x.id === id);
  const strava = useStrava();
  const isStrava = w?.source === 'strava';
  useEffect(() => { if (isStrava) loadStreams(id, profile); }, [id, isStrava]); // eslint-disable-line react-hooks/exhaustive-deps
  const route0 = w?.routeId ? data.routes.find((r) => r.id === w.routeId) : undefined;
  const others = useMemo(() => (w && route0 ? publicRoute(w, route0.segments, profile) : null), [w, route0, profile]);
  if (!w) return <Page title="Not found" back="/train?tab=history"><Empty title="Workout not found" /></Page>;
  const prefs = prefsOf(profile);
  const mp = mapPrivacyFor(w, prefs);
  const saved = sp.get('saved') === '1';
  const gearName = w.gearId ? profile.gear?.find((g) => g.id === w.gearId)?.name : undefined;
  const photoItems = (w.photos || []).map((pid) => media.items.find((i) => i.id === pid)).filter(Boolean) as GalleryItem[];
  const editSave = (fx: SaveFields) => {
    const nw: Workout = { ...w, title: fx.title, description: fx.description || undefined, type: fx.type, rpe: fx.rpe, visibility: fx.visibility, mapPrivacy: fx.mapPrivacy ?? w.mapPrivacy, gearId: fx.gearId, updatedAt: Date.now() };
    if (fx.newPhotos.length) {
      const ids = fx.newPhotos.map(() => uid());
      nw.photos = [...(w.photos || []), ...ids].slice(0, 12);
      media.addPhotos(fx.newPhotos.map((p, i) => ({ ...p, id: ids[i], tag: 'training' as const, caption: nw.title }))).catch(() => toast('Couldn’t save the photos'));
    }
    upsert<Workout>('workouts', nw);
    if (nw.shareId || nw.visibility !== 'only-me') { (nw.visibility === 'only-me' ? pub.unpublish(nw) : pub.publish(nw, route0, null)).catch(() => {}); }
    setEditOpen(false); toast('Saved');
  };
  const typeOptsFor = (t: WorkoutType): { v: WorkoutType; label: string }[] | undefined => (t === 'run' || t === 'walk' ? [{ v: 'run', label: 'Run' }, { v: 'walk', label: 'Walk' }] : undefined);
  const byu = isByuWorkout(w);
  const byuU = resolveByuUnit(profile);
  const route = w.routeId ? data.routes.find((r) => r.id === w.routeId) : undefined;
  const isGps = !!w.distanceM && isGpsType(w.type);
  const isIndoorBike = w.type === 'indoor-cycle';
  const movingSec = byu && w.laps?.length ? w.laps.reduce((a, l) => a + l.sec, 0) : w.durationSec;
  const pace = w.distanceM ? (byu ? movingSec / (w.distanceM / 1000) : paceSec(w.durationSec, w.distanceM, u)) : 0;
  const distStr = w.distanceM ? (byu ? fmtByuWorkoutDist(w.distanceM, byuU) : fmtDist(w.distanceM, u)) : '';
  const paceStr = w.distanceM ? (byu ? fmtByuPace(pace, byuU) : fmtPace(pace, u)) : '';
  const prevSim = w.source === 'hyrox-sim' ? data.workouts.filter((x) => x.source === 'hyrox-sim' && x.id !== w.id && x.date < w.date).sort((a, b) => b.date.localeCompare(a.date))[0] : undefined;
  const isSim = w.source === 'hyrox-sim';
  // Distance splits follow the current mi/km setting: rebuilt from the raw GPS points when a route exists.
  const fromRoute = !isSim && route ? splitsFromTrack(route.segments, splitUnitM(u)) : null;
  const storedUnit = (sp?: { distanceM?: number }) => (sp?.distanceM && Math.abs(sp.distanceM - KM_PER_MI * 1000) < 5 ? 'mi' : 'km');
  const splits = fromRoute && fromRoute.length ? fromRoute : w.splits;
  const splitLabel = (s: { label: string; distanceM?: number }) => (isSim ? s.label : `${fromRoute?.length ? distUnit(u) : storedUnit(s)} ${s.label}`);
  const maxSplit = Math.max(1, ...(splits || []).map((s) => s.sec));
  const slowStation = isSim && w.splits ? w.splits.filter((_, i) => i % 2 === 1).reduce((a, b) => (b.sec > a.sec ? b : a), w.splits[1]) : null;
  const del = () => { if (confirm(isStrava ? 'Remove this activity from HYBRD? (It stays on Strava.)' : 'Delete this workout?')) { if (w.shareId || (w.visibility && w.visibility !== 'only-me')) pub.unpublish(w).catch(() => {}); remove('workouts', w.id); if (route) remove('routes', route.id); nav('/train?tab=history', { replace: true }); } };

  return (
    <Page title={w.title} kicker={`${activityLabel(w)} · ${new Date(w.date).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`} back actions={<>{!isStrava && <button className="icon-btn" aria-label="Edit activity" onClick={() => setEditOpen(true)} data-testid="act-edit"><Icon name="edit" size={18} /></button>}<button className="icon-btn" aria-label={isStrava ? 'Remove from HYBRD' : 'Delete'} onClick={del}><Icon name="trash" size={18} /></button></>}>
      {saved && !isStrava && <div className="card act-saved" data-testid="act-saved"><div className="act-saved-t"><Icon name="check" size={20} /><div><b>Activity saved</b><div className="muted small">Share it with friends, post it to your feed, or send it to other apps.</div></div></div><div className="row gap8"><button className="btn y" onClick={() => setShareOpen(true)} data-testid="act-share-cta"><Icon name="share" size={18} />Share</button><button className="btn ghost" onClick={() => setSp({}, { replace: true })}>Done</button></div></div>}
      <div className="act-meta" data-testid="act-meta">
        <span className={`pill ${w.visibility && w.visibility !== 'only-me' ? 'yellow' : ''}`}><Icon name={w.visibility === 'public' ? 'globe' : w.visibility === 'friends' ? 'users' : 'lock'} size={13} />{visibilityLabel(w.visibility)}</span>
        {route && !isStrava && <span className="pill"><Icon name={mp.hideMap ? 'eyeoff' : 'shield'} size={13} />{mp.hideMap ? 'Map hidden' : mp.hideEnds ? 'Start & end hidden' : 'Full route shown'}</span>}
        {gearName && <span className="pill"><Icon name={isBikeType(w.type) ? 'bike' : 'run'} size={13} />{gearName}</span>}
        {!isStrava && <button className="btn sm y act-share" onClick={() => setShareOpen(true)} data-testid="act-share"><Icon name="share" size={16} />Share</button>}
      </div>
      {w.description && <p className="act-desc" data-testid="act-desc">{w.description}</p>}
      {photoItems.length > 0 && <div className="act-photos" data-testid="act-photos">{photoItems.map((it) => <ActPhoto key={it.id} it={it} />)}</div>}
      {(w.source === 'strava' || w.source === 'file') && <div className="row gap8 wrap" style={{ marginBottom: 12, alignItems: 'center' }} data-testid="source-row"><SourceBadge w={w} />{isStrava && <ViewOnStrava w={w} />}{isStrava && strava.busy === 'streams' && <span className="muted small">loading route & heart rate…</span>}</div>}
      <div className="grid3" style={{ marginBottom: 14 }}>
        <Stat label={w.elapsedSec && w.elapsedSec > w.durationSec + 5 ? 'Moving time' : 'Time'} value={fmtTime(w.durationSec)} accent />
        {w.elapsedSec && w.elapsedSec > w.durationSec + 5 ? <Stat label="Elapsed time" value={fmtTime(w.elapsedSec)} /> : null}
        {w.distanceM ? <Stat label="Distance" value={distStr} /> : <Stat label="RPE" value={w.rpe ?? '—'} />}
        <Stat label="kcal (est.)" value={w.kcal ?? '—'} />
        {(isGps || (isIndoorBike && w.distanceM) || (byu && !!w.distanceM)) && <Stat label={isBikeType(w.type) ? 'Avg speed' : 'Avg pace'} value={isBikeType(w.type) ? fmtSpeed(w.distanceM! / w.durationSec, u) : paceStr} />}
        {isGps && <Stat label="Elev. gain" value={w.elevGainM != null ? `${Math.round(toElev(w.elevGainM, u))}` : '—'} unit={elevUnit(u)} />}
        {(isGps || isIndoorBike) && <Stat label="RPE" value={w.rpe ?? '—'} />}
        {!!w.steps && <Stat label={w.stepsSource === 'est' ? 'Steps (est.)' : 'Steps · sensor'} value={w.steps.toLocaleString()} />}
        {!!w.cadence && <Stat label={w.stepsSource === 'est' ? 'Avg cadence (est.)' : 'Avg cadence'} value={w.cadence} unit={isBikeType(w.type) ? 'rpm' : 'spm'} />}
        {w.avgWatts ? <Stat label="Avg power" value={Math.round(w.avgWatts)} unit="W" /> : null}
        {w.maxWatts ? <Stat label="Max power" value={Math.round(w.maxWatts)} unit="W" /> : null}
        {w.resistance != null ? <Stat label="Resistance" value={w.resistance} /> : null}
        {!!w.steps && <Stat label="Step length" value={w.distanceM ? `${Math.round((w.distanceM / w.steps) * (u === 'imperial' ? 39.37 : 100))}` : '—'} unit={u === 'imperial' ? 'in' : 'cm'} />}
      </div>
      {byu && w.distanceM ? <div className="byu-head-units" style={{ margin: '-4px 0 14px' }} data-testid="byu-history-units">
        <p className="muted small" style={{ margin: 0 }}>{YARD_EXPLAIN}. {fmtByuEquals(yardsFromDistanceM(w.distanceM))}.</p>
        <ByuUnitToggle />
      </div> : null}
      {route && !isStrava && <div className="act-mapbar"><Segmented small value={view} onChange={setView} options={[{ v: 'you', label: 'Your route' }, { v: 'others', label: 'What others see' }]} /></div>}
      {route && (view === 'you' || isStrava ? <Suspense fallback={<div className="map" style={{ height: 300 }} />}><div style={{ marginBottom: 8 }}><MapView routes={[{ id: route.id, segments: route.segments, highlight: true }]} height={300} /></div></Suspense>
        : others && !others.hiddenAll ? <Suspense fallback={<div className="map" style={{ height: 300 }} />}><div style={{ marginBottom: 8 }} data-testid="act-others-map"><MapView routes={[{ id: `${route.id}-pub`, segments: others.segments.map((sg) => sg.map((p) => ({ ...p, t: 0 }))), highlight: true }]} height={300} /></div></Suspense>
        : <div className="act-nomap" data-testid="act-others-map"><Icon name="eyeoff" size={28} /><b>Map hidden</b><span className="muted small">Others see this activity’s stats only.</span></div>)}
      {route && !isStrava && <p className="muted small act-priv" data-testid="act-privacy"><Icon name="shield" size={13} /> {privacySummary(mp, mp.useZones ? prefs.zones.length : 0, u)} <button className="link" onClick={() => setEditOpen(true)}>Change</button></p>}
      {w.hr && <HrSummary hr={w.hr} durationSec={w.durationSec} />}
      {route && route.segments.length > 1 && !isStrava && w.source !== 'file' && <p className="muted small">GPS paused {route.segments.length - 1} time{route.segments.length > 2 ? 's' : ''} (screen off or signal lost) — those gaps aren’t counted in the distance.</p>}

      {splits && splits.length > 0 && <Card>
        <div className="card-head"><h3>{isSim ? 'Split board' : `Splits per ${fromRoute?.length ? distUnit(u) : storedUnit(splits[0])}`}</h3>{prevSim && <Pill>vs last sim</Pill>}{!isSim && fromRoute?.length ? <DistToggle /> : null}</div>
        {splits.map((s, i) => {
          const prev = prevSim?.splits?.[i]?.sec;
          const delta = prev != null ? s.sec - prev : null;
          const isSlow = slowStation && s === slowStation;
          return (
            <div key={i} className="food-row" style={isSlow ? { background: 'rgba(255,230,0,.08)', borderRadius: 10, padding: '11px 8px' } : undefined}>
              <span className="mono muted" style={{ width: 70 }}>{splitLabel(s)}</span>
              <div className="fr-main"><div className="pillar-track"><div className="pillar-fill" style={{ width: `${(s.sec / maxSplit) * 100}%`, background: isSlow ? 'var(--y)' : '#f4f4f4' }} /></div></div>
              <span className="fr-k">{fmtTime(s.sec)}</span>
              {delta != null && <span className={`mono small delta ${delta > 0 ? 'up' : 'down'}`} style={{ width: 52, textAlign: 'right' }}>{delta > 0 ? '+' : '−'}{fmtTime(Math.abs(delta))}</span>}
            </div>);
        })}
        {slowStation && <p className="muted small" style={{ marginTop: 10, marginBottom: 0 }}>Longest station: <b className="y">{slowStation.label}</b> ({fmtTime(slowStation.sec)}). Station times vary a lot by station — compare each one with your own previous sims.</p>}
      </Card>}

      {w.laps && (w.laps.length > 1 || byu) && <Card data-testid={byu ? 'byu-history-laps' : undefined}>
        <h3 style={{ marginBottom: 6 }}>Laps</h3>
        <table className="laps-table" data-testid="laps"><thead><tr><th>Lap</th><th>Time</th><th>Distance</th><th>Avg HR</th><th>Max HR</th></tr></thead>
          <tbody>{w.laps.map((l, i) => <tr key={i}><td>{byu ? `Yard ${i + 1}` : i + 1}</td><td>{fmtTime(l.sec)}</td><td>{l.distanceM ? (byu ? fmtByuDist(i + 1, byuU) : fmtDist(l.distanceM, u)) : '—'}</td><td>{l.avgHr ?? '—'}</td><td>{l.maxHr ?? '—'}</td></tr>)}</tbody></table>
      </Card>}
      {w.exercises && w.exercises.length > 0 && <Card>
        <h3 style={{ marginBottom: 8 }}>Exercises</h3>
        {w.exercises.map((e, i) => <div key={i} className="food-row"><div className="fr-main"><div className="fr-name">{e.name}</div><div className="fr-sub">{e.sets.length} sets</div></div><div className="fr-k small" style={{ textAlign: 'right' }}>{e.sets.map((s) => s.weightKg && s.reps ? `${fmtW(s.weightKg, wu(profile))}×${s.reps}` : s.reps ? `${s.reps}` : s.distanceM ? `${fmtShort(s.distanceM, u)}${s.timeSec ? ` ${fmtTime(s.timeSec)}` : ''}` : s.timeSec ? fmtTime(s.timeSec) : '').join(' · ')}</div></div>)}
      </Card>}
      {w.notes && <Card><h3 style={{ marginBottom: 8 }}>Notes</h3><p style={{ margin: 0 }}>{w.notes}</p></Card>}
      <p className="muted small">{w.kcalMethod === 'device' ? `Calories as reported by ${isStrava ? 'Strava' : w.device || 'the device file'}.` : w.kcalMethod === 'power' ? 'Calories estimated from average watts (mechanical work ÷ a 24% efficiency assumption). It’s an estimate — cycling efficiency varies.' : w.kcalMethod === 'hr' ? 'Calories estimated from heart rate, weight, age and sex (Keytel et al. 2005). It’s more personal than a MET estimate but still only an estimate.' : 'Calories are a MET-based estimate (Compendium of Physical Activities) and can be off by a lot for any one person.'}{w.device && w.source !== 'file' ? ` Recorded with ${w.device}.` : ''}</p>
      {route && !isStrava && <p className="muted small"><button className="link" onClick={() => saveBlob(new Blob([originalGpx(w, route)], { type: 'application/gpx+xml' }), shareFileName({ title: w.title, date: w.date }, 'gpx', 'original'))} data-testid="act-orig-gpx">Download original GPX</button> — your full route including start & end, for your own use. To share a GPX, use Share (start & end hidden). <Link className="link" to="/settings/privacy">Privacy settings</Link></p>}
      <ShareSheet open={shareOpen} onClose={() => setShareOpen(false)} w={w} route={route} />
      <Sheet open={editOpen} onClose={() => setEditOpen(false)} title="Edit activity">
        {editOpen && <SaveActivityForm id={w.id} initial={w} typeOptions={typeOptsFor(w.type)} segments={route?.segments} onSave={editSave} saveLabel="Save changes" existingPhotos={photoItems.map((it) => <ActPhoto key={it.id} it={it} small />)} />}
      </Sheet>
      {isStrava && <div style={{ marginTop: 8 }}><PoweredByStrava /><p className="muted small">Strava data is shown only to you and kept on this device for up to 7 days.</p></div>}
    </Page>
  );
}

function ActPhoto({ it, small }: { it: GalleryItem; small?: boolean }) {
  const url = useGalleryUrl(it, small ? 'thumb' : 'disp');
  return <div className={small ? 'sa-ph' : 'act-ph'}>{url ? <img src={url} alt={it.caption || 'Activity photo'} /> : <Icon name="image" />}</div>;
}
