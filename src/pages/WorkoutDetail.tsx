import { lazy, Suspense } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../lib/store';
import { Page, Card, Stat, Empty, Pill } from '../components/ui';
import { fmtDist, fmtPace, fmtTime, fmtW, paceSec, typeLabel, distUnit, fmtSpeed, fmtShort, splitsFromTrack, splitUnitM, toElev, elevUnit, wu, KM_PER_MI } from '../lib/calc';
import { DistToggle } from '../components/UnitToggle';
import { Icon } from '../components/Icon';
const MapView = lazy(() => import('../components/MapView').then((m) => ({ default: m.MapView })));

export default function WorkoutDetail() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const { data, profile, remove } = useStore();
  const u = profile.units;
  const w = data.workouts.find((x) => x.id === id);
  if (!w) return <Page title="Not found" back="/train?tab=history"><Empty title="Workout not found" /></Page>;
  const route = w.routeId ? data.routes.find((r) => r.id === w.routeId) : undefined;
  const isGps = !!w.distanceM && ['run', 'walk', 'cycle'].includes(w.type);
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
  const del = () => { if (confirm('Delete this workout?')) { remove('workouts', w.id); if (route) remove('routes', route.id); nav('/train?tab=history', { replace: true }); } };

  return (
    <Page title={w.title} kicker={`${typeLabel(w.type)} · ${new Date(w.date).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`} back actions={<button className="icon-btn" aria-label="Delete" onClick={del}><Icon name="trash" size={18} /></button>}>
      <div className="grid3" style={{ marginBottom: 14 }}>
        <Stat label="Time" value={fmtTime(w.durationSec)} accent />
        {w.distanceM ? <Stat label="Distance" value={fmtDist(w.distanceM, u)} /> : <Stat label="RPE" value={w.rpe ?? '—'} />}
        <Stat label="kcal (est.)" value={w.kcal ?? '—'} />
        {isGps && <Stat label={w.type === 'cycle' ? 'Avg speed' : 'Avg pace'} value={w.type === 'cycle' ? fmtSpeed(w.distanceM! / w.durationSec, u) : fmtPace(pace, u)} />}
        {isGps && <Stat label="Elev. gain" value={w.elevGainM != null ? `${Math.round(toElev(w.elevGainM, u))}` : '—'} unit={elevUnit(u)} />}
        {isGps && <Stat label="RPE" value={w.rpe ?? '—'} />}
        {!!w.steps && <Stat label={w.stepsSource === 'est' ? 'Steps (est.)' : 'Steps · sensor'} value={w.steps.toLocaleString()} />}
        {!!w.cadence && <Stat label={w.stepsSource === 'est' ? 'Avg cadence (est.)' : 'Avg cadence'} value={w.cadence} unit="spm" />}
        {!!w.steps && <Stat label="Step length" value={w.distanceM ? `${Math.round((w.distanceM / w.steps) * (u === 'imperial' ? 39.37 : 100))}` : '—'} unit={u === 'imperial' ? 'in' : 'cm'} />}
      </div>
      {route && <Suspense fallback={<div className="map" style={{ height: 300 }} />}><div style={{ marginBottom: 14 }}><MapView routes={[{ id: route.id, segments: route.segments, highlight: true }]} height={300} /></div></Suspense>}
      {route && route.segments.length > 1 && <p className="muted small">GPS paused {route.segments.length - 1} time{route.segments.length > 2 ? 's' : ''} (screen off or signal lost) — those gaps aren’t counted in the distance.</p>}

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

      {w.exercises && w.exercises.length > 0 && <Card>
        <h3 style={{ marginBottom: 8 }}>Exercises</h3>
        {w.exercises.map((e, i) => <div key={i} className="food-row"><div className="fr-main"><div className="fr-name">{e.name}</div><div className="fr-sub">{e.sets.length} sets</div></div><div className="fr-k small" style={{ textAlign: 'right' }}>{e.sets.map((s) => s.weightKg && s.reps ? `${fmtW(s.weightKg, wu(profile))}×${s.reps}` : s.reps ? `${s.reps}` : s.distanceM ? `${fmtShort(s.distanceM, u)}${s.timeSec ? ` ${fmtTime(s.timeSec)}` : ''}` : s.timeSec ? fmtTime(s.timeSec) : '').join(' · ')}</div></div>)}
      </Card>}
      {w.notes && <Card><h3 style={{ marginBottom: 8 }}>Notes</h3><p style={{ margin: 0 }}>{w.notes}</p></Card>}
      <p className="muted small">Calories are a MET-based estimate (Compendium of Physical Activities) and can be off by a lot for any one person.</p>
    </Page>
  );
}
