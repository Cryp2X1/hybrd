import { Link, useParams } from 'react-router-dom';
import { programById, HYROX_DIVISIONS, HYROX_STATIONS, type Session } from '../data/programs';
import { exById } from '../data/exercises';
import { sourceById } from '../data/sources';
import { Page, Card, Pill, Empty } from '../components/ui';
import { useStore } from '../lib/store';
import { fmtDist, fmtOfficial, fmtShort, fmtTime, localizeOfficial, officialWork, typeLabel, wu } from '../lib/calc';
import { intensityText } from '../lib/intensity';
import { DistToggle } from '../components/UnitToggle';
import { ExpertNote, TargetsCard } from '../components/Expert';

/** Where a session's "start" buttons go. */
export function sessionTimerLink(pid: string, s: Session) {
  if (s.plan) return { to: `/timers?t=plan&program=${pid}&session=${s.id}`, label: 'Open session timer' };
  if (s.pieces) return { to: `/timers?t=stopwatch&program=${pid}&session=${s.id}`, label: 'Open guided stopwatch' };
  if (s.timer) { const id = s.timer.split('&')[0]; return { to: `/timers?t=${s.timer}`, label: id === 'hyrox' ? 'Open HYROX Sim' : id === 'interval' ? 'Open interval timer' : `Open ${id.toUpperCase()} timer` }; }
  return null;
}

export default function ProgramDetail() {
  const { id = '' } = useParams();
  const p = programById(id);
  const { profile, data } = useStore();
  if (!p) return <Page title="Not found" back="/train"><Empty title="Program not found" /></Page>;
  const expert = p.level === 'Expert';
  const done = data.workouts.filter((w) => w.source?.startsWith(`program:${p.id}:`)).length;
  const div = HYROX_DIVISIONS[profile.hyroxDivision || 'men-open'];
  const target = (b: { sets: number; reps?: number; timeSec?: number; distanceM?: number }) =>
    `${b.sets > 1 ? `${b.sets} × ` : ''}${b.reps ? `${b.reps} reps` : b.timeSec ? fmtTime(b.timeSec) : b.distanceM ? (b.distanceM >= 400 ? fmtDist(b.distanceM, profile.units, b.distanceM % 1000 === 0 || profile.units === 'imperial' ? 2 : 1) : fmtShort(b.distanceM, profile.units)) : ''}`;
  const usesPace = p.sessions.some((s) => s.blocks.some((b) => b.pace));
  const usesFtp = p.sessions.some((s) => s.blocks.some((b) => b.ftp));
  return (
    <Page title={p.name} kicker={`${p.discipline} · ${p.level}`} back={`/train?tab=programs${expert ? '&level=Expert' : ''}`}>
      <Card className="hero">
        <p>{p.summary}</p>
        <div className="row wrap">{expert && <Pill tone="expert">Expert</Pill>}<Pill tone="yellow">{p.weeks} weeks</Pill><Pill>{p.perWeek} sessions / week</Pill><Pill>{done} logged</Pill></div>
      </Card>
      {expert && <ExpertNote />}
      {p.prereqs && <Card><h3 style={{ marginBottom: 10 }}>Before you start</h3><ul className="cues prereq" data-testid="prereqs">{p.prereqs.map((x) => <li key={x}>{x}</li>)}</ul>
        <p className="muted small" style={{ marginBottom: 0 }}>Not there yet? Start with the {p.discipline} Intermediate program, or scale each session (easier progression, fewer reps, lighter load).</p></Card>}
      {(usesPace || usesFtp) && <TargetsCard show={usesPace && usesFtp ? 'both' : usesFtp ? 'ride' : 'run'} />}
      {p.discipline === 'HYROX' && <Card>
        <div className="card-head"><h3>Race format · {div.label}</h3><div className="row" style={{ gap: 10 }}><DistToggle /><Link to="/settings/profile">Division</Link></div></div>
        <div className="seg-list">{HYROX_STATIONS.map((s, i) => <div key={s.exId} className="seg-item"><span className="n">{i + 1}</span><span>{fmtOfficial(1000, profile.units)} run → <b>{s.name}</b> {officialWork(s.work, 'distanceM' in s ? s.distanceM : undefined, profile.units)}</span><span className="t muted small">{localizeOfficial(s.exId === 'sled-push' ? div.sledPush : s.exId === 'sled-pull' ? div.sledPull : s.exId === 'farmers' ? div.farmers : s.exId === 'sb-lunge' ? div.lunges : s.exId === 'wall-ball' ? div.wallBall : '', profile.units, wu(profile))}</span></div>)}</div>
        <p className="muted small" style={{ marginTop: 10 }}>From the HYROX 25/26 Singles rulebook (official distances and loads are metric{profile.units === 'imperial' ? '; imperial values in brackets are conversions' : ''}); sled weights include the sled. Always check the current season’s rulebook before you race.</p>
      </Card>}
      {p.week && <Card><h3 style={{ marginBottom: 10 }}>Sample week</h3><ul className="cues">{p.week.map((x) => <li key={x}>{x}</li>)}</ul></Card>}
      <Card><h3 style={{ marginBottom: 10 }}>How to progress</h3><ul className="cues">{p.progression.map((x) => <li key={x}>{x}</li>)}</ul></Card>
      {p.sessions.map((s) => {
        const tl = sessionTimerLink(p.id, s);
        return (
          <Card key={s.id}>
            <div className="card-head"><div><div className="kicker">{s.anyBike ? 'Bike · indoor or outdoor' : typeLabel(s.type)} · ~{s.minutes} min</div><h3>{s.name}</h3><div className="muted small">{s.focus}</div></div></div>
            {s.blocks.map((b, i) => { const e = exById(b.exId); const it = intensityText(b, profile); return <div key={i} className="food-row"><div className="fr-main"><Link to={`/train/exercise/${b.exId}`} className="fr-name">{e?.name || b.exId}</Link>{b.note && <div className="fr-sub">{b.note}</div>}</div><div className="fr-k">{target(b)}{it && <span className="fr-int">{it}</span>}</div></div>; })}
            <div className="row wrap" style={{ marginTop: 12 }}>
              {tl && <Link className="btn sm y" to={tl.to} data-testid={`timer-${s.id}`}>{tl.label}</Link>}
              {['run', 'walk', 'cycle'].includes(s.type) && !s.timer && !s.plan ? <Link className="btn sm y" to={`/record?type=${s.type}`}>Start with GPS</Link> : null}
              {(s.type === 'indoor-cycle' || s.anyBike) ? <Link className="btn sm" to="/record?type=indoor-cycle&kind=indoor">Start indoor session</Link> : null}
              {s.anyBike ? <Link className="btn sm" to="/record?type=cycle">Ride outdoors (GPS)</Link> : null}
              {s.plan && s.type === 'run' ? <Link className="btn sm" to="/record?type=run">Record with GPS</Link> : null}
              <Link className="btn sm" to={`/train/log?program=${p.id}&session=${s.id}`}>Log this session</Link>
            </div>
          </Card>
        );
      })}
      {p.sources && <Card><h3 style={{ marginBottom: 10 }}>Sources</h3><ol className="src-list" data-testid="program-sources">{p.sources.map((sid) => { const src = sourceById(sid); return src ? <li key={sid}><b>{src.cite}</b><br /><span className="muted">Used for: {src.used}</span><br /><a href={src.url} target="_blank" rel="noopener">{src.url}</a></li> : null; })}</ol></Card>}
    </Page>
  );
}
