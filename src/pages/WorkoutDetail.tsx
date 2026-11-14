import { lazy, Suspense, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../lib/store';
import { Page, Card, Stat, Empty, Pill } from '../components/ui';
import { activityLabel, fmtDist, fmtPace, fmtTime, fmtW, isBikeType, isGpsType, paceSec, distUnit, fmtSpeed, fmtShort, splitsFromTrack, splitUnitM, toElev, elevUnit, wu, KM_PER_MI } from '../lib/calc';
import { DistToggle } from '../components/UnitToggle';
import { Icon } from '../components/Icon';
import { HrSummary } from '../components/HeartRate';
import { SourceBadge, ViewOnStrava, PoweredByStrava } from '../components/Strava';
import { loadStreams, useStrava } from '../lib/strava';
const MapView = lazy(() => import('../components/MapView').then((m) => ({ default: m.MapView })));

export default function WorkoutDetail() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const { data, profile, remove } = useStore();
  const u = profile.units;
  const w = data.workouts.find((x) => x.id === id);
  const strava = useStrava();
  const isStrava = w?.source === 'strava';
  useEffect(() => { if (isStrava) loadStreams(id, profile); }, [id, isStrava]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!w) return <Page title="Not found" back="/train?tab=history"><Empty title="Workout not found" /></Page>;
  const route = w.routeId ? data.routes.find((r) => r.id === w.routeId) : undefined;
  const isGps = !!w.distanceM && isGpsType(w.type);
  const isIndoorBike = w.type === 'indoor-cycle';
  const pace = w.distanceM ? paceSec(w.durationSec, w.distanceM, u) : 0;
  const prevSim = w.source === 'hyrox-sim' ? data.workouts.filter((x) => x.source === 'hyrox-sim' && x.id !== w.id && x.date < w.date).sort((a, b) => b.date.localeCompare(a.date))[0] : undefined;
  const isSim = w.source === 'hyrox-sim';
  // Distance splits follow the current mi/km setting: rebuilt from the raw GPS points when a route exists.
  const fromRoute = !isSim && route ? splitsFromTrack(route.segments, splitUnitM(u)) : null;
  const storedUnit = (sp?: { distanceM?: number }) => (sp?.distanceM && Math.abs(sp.distanceM - KM_PER_MI * 1000) < 5 ? 'mi' : 'km');
  const splits = fromRoute && fromRoute.length ? fromRoute : w.splits;
  const splitLabel = (s: { label: string; distanceM?: number }) => (isSim ? s.label : `${fromRoute?.length ? distUnit(u) : storedUnit(s)} ${s.label}`);
  const maxSplit = Math.max(1, ...(splits || []).map((s) => s.sec));
  const slowStation = isSim && w.splits ? w.splits.filter((_, i) => i % 2 === 1).reduce((a, b) => (b.sec > a.sec ? b : a), w.splits[1]) : null;
  const del = () => { if (confirm(isStrava ? 'Remove this activity from HYBRD? (It stays on Strava.)' : 'Delete this workout?')) { remove('workouts', w.id); if (route) remove('routes', route.id); nav('/train?tab=history', { replace: true }); } };

  return (
    <Page title={w.title} kicker={`${activityLabel(w)} · ${new Date(w.date).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`} back actions={<button className="icon-btn" aria-label={isStrava ? 'Remove from HYBRD' : 'Delete'} onClick={del}><Icon name="trash" size={18} /></button>}>
      {(w.source === 'strava' || w.source === 'file') && <div className="row gap8 wrap" style={{ marginBottom: 12, alignItems: 'center' }} data-testid="source-row"><SourceBadge w={w} />{isStrava && <ViewOnStrava w={w} />}{isStrava && strava.busy === 'streams' && <span className="muted small">loading route & heart rate…</span>}</div>}
      <div className="grid3" style={{ marginBottom: 14 }}>
        <Stat label="Time" value={fmtTime(w.durationSec)} accent />
        {w.distanceM ? <Stat label="Distance" value={fmtDist(w.distanceM, u)} /> : <Stat label="RPE" value={w.rpe ?? '—'} />}
        <Stat label="kcal (est.)" value={w.kcal ?? '—'} />
        {(isGps || (isIndoorBike && w.distanceM)) && <Stat label={isBikeType(w.type) ? 'Avg speed' : 'Avg pace'} value={isBikeType(w.type) ? fmtSpeed(w.distanceM! / w.durationSec, u) : fmtPace(pace, u)} />}
        {isGps && <Stat label="Elev. gain" value={w.elevGainM != null ? `${Math.round(toElev(w.elevGainM, u))}` : '—'} unit={elevUnit(u)} />}
        {(isGps || isIndoorBike) && <Stat label="RPE" value={w.rpe ?? '—'} />}
        {!!w.steps && <Stat label={w.stepsSource === 'est' ? 'Steps (est.)' : 'Steps · sensor'} value={w.steps.toLocaleString()} />}
        {!!w.cadence && <Stat label={w.stepsSource === 'est' ? 'Avg cadence (est.)' : 'Avg cadence'} value={w.cadence} unit={isBikeType(w.type) ? 'rpm' : 'spm'} />}
        {w.avgWatts ? <Stat label="Avg power" value={Math.round(w.avgWatts)} unit="W" /> : null}
        {w.maxWatts ? <Stat label="Max power" value={Math.round(w.maxWatts)} unit="W" /> : null}
        {w.resistance != null ? <Stat label="Resistance" value={w.resistance} /> : null}
        {!!w.steps && <Stat label="Step length" value={w.distanceM ? `${Math.round((w.distanceM / w.steps) * (u === 'imperial' ? 39.37 : 100))}` : '—'} unit={u === 'imperial' ? 'in' : 'cm'} />}
      </div>
      {route && <Suspense fallback={<div className="map" style={{ height: 300 }} />}><div style={{ marginBottom: 14 }}><MapView routes={[{ id: route.id, segments: route.segments, highlight: true }]} height={300} /></div></Suspense>}
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

      {w.laps && w.laps.length > 1 && <Card>
        <h3 style={{ marginBottom: 6 }}>Laps</h3>
        <table className="laps-table" data-testid="laps"><thead><tr><th>Lap</th><th>Time</th><th>Distance</th><th>Avg HR</th><th>Max HR</th></tr></thead>
          <tbody>{w.laps.map((l, i) => <tr key={i}><td>{i + 1}</td><td>{fmtTime(l.sec)}</td><td>{l.distanceM ? fmtDist(l.distanceM, u) : '—'}</td><td>{l.avgHr ?? '—'}</td><td>{l.maxHr ?? '—'}</td></tr>)}</tbody></table>
      </Card>}
      {w.exercises && w.exercises.length > 0 && <Card>
        <h3 style={{ marginBottom: 8 }}>Exercises</h3>
        {w.exercises.map((e, i) => <div key={i} className="food-row"><div className="fr-main"><div className="fr-name">{e.name}</div><div className="fr-sub">{e.sets.length} sets</div></div><div className="fr-k small" style={{ textAlign: 'right' }}>{e.sets.map((s) => s.weightKg && s.reps ? `${fmtW(s.weightKg, wu(profile))}×${s.reps}` : s.reps ? `${s.reps}` : s.distanceM ? `${fmtShort(s.distanceM, u)}${s.timeSec ? ` ${fmtTime(s.timeSec)}` : ''}` : s.timeSec ? fmtTime(s.timeSec) : '').join(' · ')}</div></div>)}
      </Card>}
      {w.notes && <Card><h3 style={{ marginBottom: 8 }}>Notes</h3><p style={{ margin: 0 }}>{w.notes}</p></Card>}
      <p className="muted small">{w.kcalMethod === 'device' ? `Calories as reported by ${isStrava ? 'Strava' : w.device || 'the device file'}.` : w.kcalMethod === 'power' ? 'Calories estimated from average watts (mechanical work ÷ a 24% efficiency assumption). It’s an estimate — cycling efficiency varies.' : w.kcalMethod === 'hr' ? 'Calories estimated from heart rate, weight, age and sex (Keytel et al. 2005). It’s more personal than a MET estimate but still only an estimate.' : 'Calories are a MET-based estimate (Compendium of Physical Activities) and can be off by a lot for any one person.'}{w.device && w.source !== 'file' ? ` Recorded with ${w.device}.` : ''}</p>
      {isStrava && <div style={{ marginTop: 8 }}><PoweredByStrava /><p className="muted small">Strava data is shown only to you and kept on this device for up to 7 days.</p></div>}
    </Page>
  );
}
