import { lazy, Suspense, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../lib/store';
import { Page, Card, Empty, Segmented, Banner } from '../components/ui';
import { fmtDist, fmtTime, haversine } from '../lib/calc';
import { getLastPos } from '../lib/location';
import { SAMPLE_TAG } from '../lib/sample';
const MapView = lazy(() => import('../components/MapView').then((m) => ({ default: m.MapView })));

export default function RoutesPage() {
  const { data, profile } = useStore();
  const [sel, setSel] = useState<string | null>(null);
  const [type, setType] = useState('all');
  const ws = data.workouts.filter((w) => w.routeId && (type === 'all' || w.type === type)).sort((a, b) => b.date.localeCompare(a.date));
  const routes = ws.map((w) => data.routes.find((r) => r.id === w.routeId)).filter(Boolean).map((r) => ({ id: r!.workoutId, segments: r!.segments, highlight: sel ? r!.workoutId === sel : false }));
  const total = ws.reduce((a, w) => a + (w.distanceM || 0), 0);
  // Demo routes far from where the user actually is? Say so (the map still fits the routes; ◎ jumps to the user).
  const me = getLastPos();
  const firstDemo = ws.find((w) => w.id.startsWith(SAMPLE_TAG)) && routes[0]?.segments.find((s) => s.length)?.[0];
  const demoFar = !!(me && firstDemo && haversine(me, firstDemo) > 50000);
  return (
    <Page title="Route history" kicker={`${ws.length} GPS activities · ${fmtDist(total, profile.units, 1)}`} back wide>
      <Segmented small value={type} onChange={setType} options={[{ v: 'all', label: 'All' }, { v: 'run', label: 'Runs' }, { v: 'walk', label: 'Walks' }, { v: 'cycle', label: 'Rides' }]} />
      {demoFar && <Banner>These demo routes were drawn somewhere else. Tap <b>◎</b> on the map to jump to where you are, or remove demo data in <Link to="/me/data">Me › Your data</Link>.</Banner>}
      <Suspense fallback={<div className="map" style={{ height: routes.length ? 420 : 320 }} />}><MapView routes={routes.map((r) => ({ ...r, highlight: sel ? r.highlight : true }))} height={routes.length ? 420 : 320} onSelect={setSel} /></Suspense>
      {!routes.length && <Card><Empty title="No GPS routes yet" icon="map">The map is centered on you. <Link className="link" to="/record">Record your first run →</Link></Empty></Card>}
      {ws.length > 0 && <Card className="" >
        {ws.map((w) => <div key={w.id} className="food-row" style={sel === w.id ? { background: 'rgba(255,230,0,.08)', borderRadius: 10, padding: '11px 8px' } : undefined}>
          <button className="fr-main" style={{ textAlign: 'left' }} onClick={() => setSel(sel === w.id ? null : w.id)}><div className="fr-name">{w.title}</div><div className="fr-sub">{new Date(w.date).toLocaleDateString()} · {fmtTime(w.durationSec)}</div></button>
          <span className="fr-k">{fmtDist(w.distanceM || 0, profile.units)}</span><Link className="link" to={`/train/workout/${w.id}`}>Open</Link></div>)}
      </Card>}
      <p className="muted small">Map tiles © OpenStreetMap contributors. Tiles load only for the area you’re viewing.</p>
    </Page>
  );
}
