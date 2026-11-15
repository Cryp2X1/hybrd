import { useMemo, useState } from 'react';
import { CoachCard } from '../components/CoachCard';
import { Link, useSearchParams } from 'react-router-dom';
import { PROGRAMS, LEVELS, type Program } from '../data/programs';
import { ExpertNote } from '../components/Expert';
import { EXERCISES, CATS, type ExCat } from '../data/exercises';
import { useStore } from '../lib/store';
import { Page, Segmented, Card, RowLink, Empty, Pill } from '../components/ui';
import { Icon } from '../components/Icon';
import { activityLabel, fmtDist, fmtTime, isBikeType, isGpsType, typeLabel, WORKOUT_TYPES } from '../lib/calc';
import { SourceBadge } from '../components/Strava';

type Tab = 'programs' | 'library' | 'templates' | 'history';
export default function Train() {
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get('tab') as Tab) || 'programs';
  const level = (sp.get('level') || 'all') as 'all' | (typeof LEVELS)[number];
  const inLevel = (p: Program) => level === 'all' || p.level === level || (p.level === 'All levels' && level !== 'Expert');
  const progs = PROGRAMS.filter(inLevel);
  const mainProgs = level === 'all' ? progs.filter((p) => p.level !== 'Expert') : progs;
  const expertProgs = level === 'all' ? progs.filter((p) => p.level === 'Expert') : [];
  const { data, profile, remove } = useStore();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<ExCat | 'all'>('all');
  const [ftype, setFtype] = useState('all');
  const ex = useMemo(() => EXERCISES.filter((e) => (cat === 'all' || e.cat === cat) && (!q || `${e.name} ${e.muscles} ${e.equipment}`.toLowerCase().includes(q.toLowerCase()))), [q, cat]);
  const hist = [...data.workouts].filter((w) => ftype === 'all' || w.type === ftype).sort((a, b) => b.date.localeCompare(a.date));

  return (
    <Page title="Train" kicker="Programs · Library · Log" wide actions={<Link className="btn sm y" to="/train/log"><Icon name="plus" size={18} />Log</Link>}>
      <Segmented value={tab} onChange={(v) => setSp({ tab: v })} options={[{ v: 'programs', label: 'Programs' }, { v: 'library', label: 'Exercises' }, { v: 'templates', label: 'My workouts' }, { v: 'history', label: 'History' }]} />

      {tab === 'programs' && <>
        <CoachCard where="train" />
        <div data-testid="level-filter"><Segmented small value={level} onChange={(v) => setSp(v === 'all' ? { tab: 'programs' } : { tab: 'programs', level: v })} options={[{ v: 'all', label: 'All levels' }, ...LEVELS.map((l) => ({ v: l, label: l }))]} /></div>
        {level === 'Expert' && <>
          <ExpertNote compact />
          <p className="muted small" style={{ marginTop: -4 }}>Advanced programs for athletes who already train consistently: calisthenics skills, Daniels-style running, power-based cycling, HYROX race sharpening and concurrent hybrid weeks. Each lists its prerequisites and sources.</p>
        </>}
        {level !== 'Expert' && <>
          <div className="tile-grid" data-testid="train-indoor-bikes" style={{ marginBottom: 14 }}>
            <Link to="/record?type=indoor-cycle&kind=indoor" className="tile feature">
              <div className="kicker">New · No GPS</div>
              <h3>Indoor Bike</h3>
              <div className="muted small">Smart trainer or spin bike. Time-based session — enter distance, cadence and watts from the console when you finish.</div>
              <div className="meta"><Pill>Timer</Pill><Pill>Optional watts</Pill></div>
            </Link>
            <Link to="/record?type=indoor-cycle&kind=stationary" className="tile">
              <div className="kicker">New · No GPS</div>
              <h3>Stationary Bike</h3>
              <div className="muted small">Upright or recumbent gym bike. Same timer, plus optional resistance level and cadence (rpm).</div>
              <div className="meta"><Pill>Timer</Pill><Pill>Resistance</Pill></div>
            </Link>
          </div>
          <Link to="/timers?t=hyrox" className="card hero click" style={{ display: 'block' }}>
            <div className="row"><div style={{ flex: 1 }}><div className="kicker">New · HYROX</div><h2>Race Simulator</h2><p className="muted small" style={{ margin: '6px 0 0' }}>8 × 1 km runs + 8 stations in the official order. Tap through splits, compare to your last sim.</p></div><Icon name="flag" size={36} className="y" /></div>
          </Link>
        </>}
        <div className="tile-grid" data-testid="program-grid">{mainProgs.map((p) => <ProgramTile key={p.id} p={p} />)}</div>
        {expertProgs.length > 0 && <>
          <div className="tier-head"><h2>Expert tier</h2><button className="link" onClick={() => setSp({ tab: 'programs', level: 'Expert' })}>Only Expert →</button></div>
          <div className="tile-grid">{expertProgs.map((p) => <ProgramTile key={p.id} p={p} />)}</div>
        </>}
      </>}

      {tab === 'library' && <>
        <div className="search field"><Icon name="search" size={18} /><input placeholder="Search 50+ exercises, muscles, equipment" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Segmented small value={cat} onChange={setCat} options={[{ v: 'all', label: 'All' }, ...CATS]} />
        <Card>{ex.map((e) => <RowLink key={e.id} to={`/train/exercise/${e.id}`} icon={e.cat === 'cardio' ? 'record' : e.cat === 'hyrox' ? 'flag' : 'train'} title={e.name} sub={`${e.muscles} · ${e.equipment}`} right={<Pill tone={e.level === 'Beginner' ? undefined : e.level === 'Expert' ? 'expert' : 'yellow'}>{e.level}</Pill>} />)}
          {!ex.length && <Empty title="No matches" icon="search">Try another word.</Empty>}</Card>
      </>}

      {tab === 'templates' && <>
        <p className="muted small">Build any session — a calisthenics circuit, a run + burpee brick, a HYROX station day — in the logger and tap “Save as template”.</p>
        <Card>
          {data.templates.length ? data.templates.map((t) => (
            <div key={t.id} className="row" style={{ borderBottom: '1px solid var(--line)', padding: '10px 0' }}>
              <Link to={`/train/log?template=${t.id}`} className="row-main" style={{ flex: 1 }}><span className="row-title">{t.name}</span><span className="row-sub">{typeLabel(t.type)} · {t.exercises.length} exercises</span></Link>
              <Link className="btn sm y" to={`/train/log?template=${t.id}`}>Start</Link>
              <button className="icon-btn" aria-label="Delete template" onClick={() => confirm(`Delete “${t.name}”?`) && remove('templates', t.id)}><Icon name="trash" size={18} /></button>
            </div>)) : <Empty title="No saved workouts yet" icon="layers"><Link className="link" to="/train/log">Open the workout builder →</Link></Empty>}
        </Card>
      </>}

      {tab === 'history' && <>
        <Segmented small value={ftype} onChange={setFtype} options={[{ v: 'all', label: 'All' }, ...WORKOUT_TYPES.filter((w) => w.v !== 'rest').map((w) => ({ v: w.v as string, label: w.label }))]} />
        <Card>
          {hist.length ? hist.map((w) => <RowLink key={w.id} to={`/train/workout/${w.id}`} icon={isBikeType(w.type) ? 'bike' : isGpsType(w.type) ? 'record' : w.type === 'rest' ? 'sun' : 'train'} title={<>{w.title}<SourceBadge w={w} /></>} sub={`${new Date(w.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · ${activityLabel(w)}${w.kcal ? ` · ~${w.kcal} kcal est.` : ''}`} right={w.distanceM ? fmtDist(w.distanceM, profile.units) : w.durationSec ? fmtTime(w.durationSec) : ''} />)
            : <Empty title="No workouts yet" icon="train">Your history shows up here.</Empty>}
        </Card>
        <div className="row gap8 wrap" style={{ justifyContent: 'space-between' }}><Link className="link" to="/routes">Route map of all GPS activities →</Link><Link className="link" to="/me/import" data-testid="history-import">Import watch files · Strava →</Link></div>
      </>}
    </Page>
  );
}

function ProgramTile({ p }: { p: Program }) {
  const expert = p.level === 'Expert';
  return (
    <Link to={`/train/program/${p.id}`} className={`tile ${expert ? 'expert' : p.discipline === 'HYROX' || p.discipline === 'Hybrid' ? 'feature' : ''}`}>
      <div className="kicker">{expert ? `Expert · ${p.discipline}` : p.discipline}</div>
      <h3>{p.name}</h3>
      <div className="muted small">{p.summary}</div>
      <div className="meta"><Pill tone={expert ? 'expert' : undefined}>{p.level}</Pill><Pill>{p.weeks} wk</Pill><Pill>{p.perWeek}×/wk</Pill></div>
    </Link>
  );
}
