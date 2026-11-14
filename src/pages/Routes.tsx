import { lazy, Suspense, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../lib/store';
import { Page, Card, Empty, Segmented } from '../components/ui';
import { fmtDist, fmtTime } from '../lib/calc';
const MapView = lazy(() => import('../components/MapView').then((m) => ({ default: m.MapView })));

export default function RoutesPage() {
  const { data, profile } = useStore();
  const [sel, setSel] = useState<string | null>(null);
  const [type, setType] = useState('all');
  const ws = data.workouts.filter((w) => w.routeId && (type === 'all' || w.type === type)).sort((a, b) => b.date.localeCompare(a.date));
  const routes = ws.map((w) => data.routes.find((r) => r.id === w.routeId)).filter(Boolean).map((r) => ({ id: r!.workoutId, segments: r!.segments, highlight: sel ? r!.workoutId === sel : false }));
  const total = ws.reduce((a, w) => a + (w.distanceM || 0), 0);
  return (
    <Page title="Route history" kicker={`${ws.length} GPS activities · ${fmtDist(total, profile.units, 1)}`} back wide>
      <Segmented small value={type} onChange={setType} options={[{ v: 'all', label: 'All' }, { v: 'run', label: 'Runs' }, { v: 'walk', label: 'Walks' }, { v: 'cycle', label: 'Rides' }]} />
      {routes.length ? <Suspense fallback={<div className="map" style={{ height: 420 }} />}><MapView routes={routes.map((r) => ({ ...r, highlight: sel ? r.highlight : true }))} height={420} onSelect={setSel} /></Suspense>
        : <Card><Empty title="No GPS routes yet" icon="map"><Link className="link" to="/record">Record your first run →</Link></Empty></Card>}
      <Card className="" >
        {ws.map((w) => <div key={w.id} className="food-row" style={sel === w.id ? { background: 'rgba(255,230,0,.08)', borderRadius: 10, padding: '11px 8px' } : undefined}>
          <button className="fr-main" style={{ textAlign: 'left' }} onClick={() => setSel(sel === w.id ? null : w.id)}><div className="fr-name">{w.title}</div><div className="fr-sub">{new Date(w.date).toLocaleDateString()} · {fmtTime(w.durationSec)}</div></button>
          <span className="fr-k">{fmtDist(w.distanceM || 0, profile.units)}</span><Link className="link" to={`/train/workout/${w.id}`}>Open</Link></div>)}
      </Card>
      <p className="muted small">Map tiles © OpenStreetMap contributors. Tiles load only for the area you’re viewing.</p>
    </Page>
  );
}
