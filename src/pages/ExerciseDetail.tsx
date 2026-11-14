import { Link, useParams } from 'react-router-dom';
import { exById } from '../data/exercises';
import { Page, Card, Pill, Empty } from '../components/ui';
import { useStore } from '../lib/store';
import { fmtW, fmtTime, wu, fmtShort } from '../lib/calc';

export default function ExerciseDetail() {
  const { id = '' } = useParams();
  const e = exById(id);
  const { data, profile } = useStore();
  if (!e) return <Page title="Not found" back="/train?tab=library"><Empty title="Exercise not found" /></Page>;
  const hist = data.workouts.flatMap((w) => (w.exercises || []).filter((x) => x.exId === id).map((x) => ({ w, x }))).sort((a, b) => b.w.date.localeCompare(a.w.date)).slice(0, 8);
  return (
    <Page title={e.name} kicker={`${e.cat} · ${e.level}`} back>
      <Card className="hero">
        <div className="row wrap" style={{ marginBottom: 10 }}><Pill tone="yellow">{e.muscles}</Pill><Pill>{e.equipment}</Pill></div>
        <h3 style={{ marginBottom: 10 }}>Coaching cues</h3>
        <ol className="cues">{e.cues.map((c) => <li key={c}>{c}</li>)}</ol>
      </Card>
      {(e.easier || e.harder) && <div className="grid2">
        {e.easier && <div className="stat"><div className="stat-l">Easier</div><div style={{ marginTop: 6, fontWeight: 700 }}>{e.easier}</div></div>}
        {e.harder && <div className="stat"><div className="stat-l">Harder</div><div style={{ marginTop: 6, fontWeight: 700 }}>{e.harder}</div></div>}
      </div>}
      <Card className="" >
        <div className="card-head"><h3>Your history</h3><Link to={`/train/log?ex=${e.id}`}>Log it →</Link></div>
        {hist.length ? hist.map(({ w, x }, i) => <div key={i} className="food-row"><div className="fr-main"><div className="fr-name">{new Date(w.date).toLocaleDateString()}</div><div className="fr-sub">{w.title}</div></div><div className="fr-k">{x.sets.map((s) => s.weightKg ? `${fmtW(s.weightKg, wu(profile))}×${s.reps}` : s.reps ? `${s.reps}` : s.timeSec ? fmtTime(s.timeSec) : s.distanceM ? fmtShort(s.distanceM, profile.units) : '').join(' · ')}</div></div>)
          : <p className="muted small">Not logged yet.</p>}
      </Card>
      <p className="muted small">Stop if you feel sharp pain. These cues are general guidance, not individual coaching.</p>
    </Page>
  );
}
