import { Link, useParams } from 'react-router-dom';
import { programById, HYROX_DIVISIONS, HYROX_STATIONS } from '../data/programs';
import { exById } from '../data/exercises';
import { Page, Card, Pill, Empty } from '../components/ui';
import { useStore } from '../lib/store';
import { fmtDist, fmtOfficial, fmtShort, fmtTime, localizeOfficial, officialWork, typeLabel, wu } from '../lib/calc';
import { DistToggle } from '../components/UnitToggle';

export default function ProgramDetail() {
  const { id = '' } = useParams();
  const p = programById(id);
  const { profile, data } = useStore();
  if (!p) return <Page title="Not found" back="/train"><Empty title="Program not found" /></Page>;
  const done = data.workouts.filter((w) => w.source?.startsWith(`program:${p.id}:`)).length;
  const div = HYROX_DIVISIONS[profile.hyroxDivision || 'men-open'];
  const target = (b: { sets: number; reps?: number; timeSec?: number; distanceM?: number }) =>
    `${b.sets > 1 ? `${b.sets} × ` : ''}${b.reps ? `${b.reps} reps` : b.timeSec ? fmtTime(b.timeSec) : b.distanceM ? (b.distanceM >= 400 ? fmtDist(b.distanceM, profile.units, b.distanceM % 1000 === 0 || profile.units === 'imperial' ? 2 : 1) : fmtShort(b.distanceM, profile.units)) : ''}`;
  return (
    <Page title={p.name} kicker={`${p.discipline} · ${p.level}`} back="/train?tab=programs">
      <Card className="hero">
        <p>{p.summary}</p>
        <div className="row wrap"><Pill tone="yellow">{p.weeks} weeks</Pill><Pill>{p.perWeek} sessions / week</Pill><Pill>{done} logged</Pill></div>
      </Card>
      {p.discipline === 'HYROX' && <Card>
        <div className="card-head"><h3>Race format · {div.label}</h3><div className="row" style={{ gap: 10 }}><DistToggle /><Link to="/me">Division</Link></div></div>
        <div className="seg-list">{HYROX_STATIONS.map((s, i) => <div key={s.exId} className="seg-item"><span className="n">{i + 1}</span><span>{fmtOfficial(1000, profile.units)} run → <b>{s.name}</b> {officialWork(s.work, 'distanceM' in s ? s.distanceM : undefined, profile.units)}</span><span className="t muted small">{localizeOfficial(s.exId === 'sled-push' ? div.sledPush : s.exId === 'sled-pull' ? div.sledPull : s.exId === 'farmers' ? div.farmers : s.exId === 'sb-lunge' ? div.lunges : s.exId === 'wall-ball' ? div.wallBall : '', profile.units, wu(profile))}</span></div>)}</div>
        <p className="muted small" style={{ marginTop: 10 }}>From the HYROX rulebook (official distances and loads are metric{profile.units === 'imperial' ? '; imperial values in brackets are conversions' : ''}); sled weights include the sled. Always check the current season’s rulebook before you race.</p>
      </Card>}
      <Card><h3 style={{ marginBottom: 10 }}>How to progress</h3><ul className="cues">{p.progression.map((x) => <li key={x}>{x}</li>)}</ul></Card>
      {p.sessions.map((s) => (
        <Card key={s.id}>
          <div className="card-head"><div><div className="kicker">{typeLabel(s.type)} · ~{s.minutes} min</div><h3>{s.name}</h3><div className="muted small">{s.focus}</div></div></div>
          {s.blocks.map((b, i) => { const e = exById(b.exId); return <div key={i} className="food-row"><div className="fr-main"><Link to={`/train/exercise/${b.exId}`} className="fr-name">{e?.name || b.exId}</Link>{b.note && <div className="fr-sub">{b.note}</div>}</div><div className="fr-k">{target(b)}</div></div>; })}
          <div className="row wrap" style={{ marginTop: 12 }}>
            {['run', 'walk', 'cycle'].includes(s.type) && !s.timer ? <Link className="btn sm y" to={`/record?type=${s.type}`}>Start with GPS</Link> : null}
            {s.type === 'indoor-cycle' ? <Link className="btn sm y" to="/record?type=indoor-cycle&kind=indoor">Start indoor session</Link> : null}
            {s.timer && <Link className="btn sm y" to={`/timers?t=${s.timer}`}>{(() => { const id = s.timer!.split('&')[0]; return id === 'hyrox' ? 'Open HYROX Sim' : id === 'interval' ? 'Open interval timer' : `Open ${id.toUpperCase()} timer`; })()}</Link>}
            <Link className="btn sm" to={`/train/log?program=${p.id}&session=${s.id}`}>Log this session</Link>
          </div>
        </Card>
      ))}
    </Page>
  );
}
