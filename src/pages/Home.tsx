import { Link, useNavigate } from 'react-router-dom';
import { useMemo } from 'react';
import { useStore, uid } from '../lib/store';
import { addDays, dayKeyOf, dayTotals, activityLabel, fmtDist, fmtTime, hybridScore, isBikeType, isGpsType, personalRecords, streak, todayKey, wu } from '../lib/calc';
import { dayBurn } from '../lib/burn';
import { BurnRingCard } from '../components/BurnRing';
import { WLCard } from '../components/WLCard';
import { FastingCard } from '../components/FastingCard';
import { CoachCard } from '../components/CoachCard';
import { activeCoachPlan } from '../lib/coach';
import { fuelTargets } from '../lib/fuelTargets';
import { PillarBar, ScoreRing, MacroBar } from '../components/charts';
import { StepsCard } from '../components/StepsCard';
import { Card, RowLink, Banner } from '../components/ui';
import { Icon } from '../components/Icon';
import { useRecorder, elapsedMs } from '../lib/recorder';
import { isIOS, isStandalone } from '../lib/cues';
import { useToast } from '../lib/toast';
import type { Workout } from '../lib/types';

export function suggestions(score: ReturnType<typeof hybridScore>) {
  const out: { title: string; why: string; to: string }[] = [];
  const by = Object.fromEntries(score.pillars.map((p) => [p.key, p.score]));
  if (by.engine == null) out.push({ title: 'Baseline: easy 20–30 min run or ride', why: 'No cardio logged yet — a baseline lets the Engine pillar start counting.', to: '/record' });
  else if (by.engine < 60) out.push({ title: 'Time-on-feet session at easy effort', why: `Engine is at ${by.engine}. Easy aerobic minutes are the cheapest way to raise it.`, to: '/record' });
  if (by.strength == null) out.push({ title: 'Baseline: Calisthenics Foundations · Session A', why: 'No strength work yet — log one session to rate Strength.', to: '/train/program/cali-foundations' });
  else if (by.strength < 60) out.push({ title: 'Calisthenics density: AMRAP 15', why: `Strength is at ${by.strength}. A short, dense bodyweight session fits any day.`, to: '/timers?t=amrap' });
  if (by.engine != null && by.strength != null && by.engine >= 60 && by.strength >= 60) out.push({ title: 'HYROX brick: 1 km run + 25 wall balls × 4', why: 'Both engines are running — mixed work is where hybrids are made.', to: '/train/program/hyrox-prep' });
  if (by.nutrition == null) out.push({ title: 'Log today’s food', why: 'Fuel needs 3 logged days this week before it gets a score.', to: '/fuel' });
  return out.slice(0, 3);
}

export default function Home() {
  const { data, profile, upsert } = useStore();
  const { s: rec } = useRecorder();
  const nav = useNavigate();
  const toast = useToast();
  const today = todayKey();
  const score = useMemo(() => hybridScore(data, profile), [data, profile]);
  const st = useMemo(() => streak(data), [data]);
  const t = fuelTargets(profile, data, today);
  const tot = dayTotals(data.foods, today);
  const water = data.water.find((w) => w.date === today)?.ml || 0;
  const burned = dayBurn(data, today, profile).active;
  const recent = [...data.workouts].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);
  const prs = personalRecords(data, profile.units, wu(profile)).slice(0, 3);
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const typesByDay = new Map<string, string>();
  for (const w of data.workouts) { const k = dayKeyOf(w.date); if (typesByDay.get(k) !== 'on') typesByDay.set(k, w.type === 'rest' ? 'rest' : 'on'); }
  const hello = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening';
  const showInstall = !isStandalone();

  const logRest = () => {
    const w: Omit<Workout, 'updatedAt'> = { id: uid(), date: new Date().toISOString(), type: 'rest', title: 'Rest day', durationSec: 0, source: 'rest' };
    upsert<Workout>('workouts', w); toast('Rest day logged — recovery counts.');
  };

  return (
    <div className="page wide">
      <header className="page-head"><div className="page-title"><div className="kicker">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</div><h1>{hello}{profile.name ? `, ${profile.name.split(' ')[0]}` : ''}</h1></div></header>

      {rec.status !== 'idle' && <Banner tone="yellow"><b>{rec.status === 'recording' ? 'Recording' : 'Paused'} {activityLabel(rec)}</b> · {fmtTime(elapsedMs(rec) / 1000)} · {fmtDist(rec.distanceM, profile.units)} — <Link to="/record">open</Link></Banner>}

      {(!!activeCoachPlan(data.coachplans) || !profile.coachDismissed) && <CoachCard where="home" />}

      <div className="desk-grid">
        <div>
          <Card className="hero click" onClick={() => nav('/score')}>
            <div className="card-head"><div><div className="kicker">Hybrid Score · last 7 days</div><div className="tier">{score.tier}</div></div><span className="link">How it works →</span></div>
            <div className="hero-score">
              <ScoreRing score={score.score} label="Hybrid" sub={score.score == null ? 'Log 2 pillars' : score.balancePenalty ? `−${score.balancePenalty} balance` : 'Balanced'} size={188} />
              <div className="pillars">{score.pillars.map((p) => <PillarBar key={p.key} label={p.label} score={p.score} detail={p.detail} />)}</div>
            </div>
          </Card>

          <div className="quick">
            <Link to="/record"><Icon name="record" />GPS</Link>
            <Link to="/train/log"><Icon name="plus" />Workout</Link>
            <Link to="/timers"><Icon name="timer" />Timers</Link>
            <Link to="/fuel/add"><Icon name="fuel" />Food</Link>
          </div>

          <Card>
            <div className="card-head"><h3>Streak · {st.current} day{st.current === 1 ? '' : 's'}</h3><span className="muted small">Best {st.best}</span></div>
            <div className="week-strip">{days.map((d) => <div key={d}><i className={`${typesByDay.get(d) || ''} ${d === today ? 'today' : ''}`} />{new Date(d + 'T12:00').toLocaleDateString(undefined, { weekday: 'narrow' })}</div>)}</div>
            {!st.doneToday && <div className="row" style={{ marginTop: 12 }}><button className="btn sm y" onClick={() => nav('/train/log')}>Train today</button><button className="btn sm" onClick={logRest}>Log a rest day</button><span className="muted small">Rest days keep the streak.</span></div>}
            {st.doneToday && <p className="muted small" style={{ marginTop: 10, marginBottom: 0 }}>Today’s done. Missed days don’t erase the work — just start again tomorrow.</p>}
          </Card>
          {!activeCoachPlan(data.coachplans) && profile.coachDismissed && <CoachCard where="home" />}
        </div>

        <div>
          <Card className="click" onClick={() => nav('/fuel')}>
            <div className="card-head"><h3>Today’s fuel</h3><span className="link">Log →</span></div>
            <div className="grid3" style={{ marginBottom: 12 }}>
              <div className="stat accent"><div className="stat-v">{Math.max(0, Math.round(t.kcal - tot.kcal + (t.addBurn ? burned : 0)))}</div><div className="stat-l">kcal left (est.)</div></div>
              <div className="stat"><div className="stat-v">{Math.round(tot.kcal)}</div><div className="stat-l">eaten</div></div>
              <div className="stat"><div className="stat-v">{burned}</div><div className="stat-l">active burn est.</div></div>
            </div>
            <MacroBar label="Protein" value={tot.protein} target={t.protein} />
            <MacroBar label="Carbs" value={tot.carbs} target={t.carbs} color="#f4f4f4" />
            <MacroBar label="Water" value={water / 1000} target={t.waterMl / 1000} unit=" L" color="#60a5fa" />
          </Card>

          <WLCard />

          <FastingCard />

          <BurnRingCard />

          <StepsCard compact />

          {suggestions(score).length > 0 && <Card>
            <div className="card-head"><h3>Suggested next</h3><span className="muted small">Training ideas, not coaching</span></div>
            {suggestions(score).map((s) => <RowLink key={s.title} to={s.to} icon="bolt" title={s.title} sub={s.why} />)}
          </Card>}

          <Card>
            <div className="card-head"><h3>Recent</h3><Link to="/train?tab=history">History →</Link></div>
            {recent.length ? recent.map((w) => <RowLink key={w.id} to={`/train/workout/${w.id}`} icon={isBikeType(w.type) ? 'bike' : isGpsType(w.type) ? 'record' : w.type === 'rest' ? 'sun' : 'train'} title={w.title} sub={`${new Date(w.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · ${activityLabel(w)}${w.rpe ? ` · RPE ${w.rpe}` : ''}`} right={w.distanceM ? fmtDist(w.distanceM, profile.units) : w.durationSec ? fmtTime(w.durationSec) : ''} />)
              : <p className="muted">Nothing yet. Start with a GPS run, a program session, or a timer workout.</p>}
          </Card>

          {prs.length > 0 && <Card className="click" onClick={() => nav('/progress')}>
            <div className="card-head"><h3>Latest PRs</h3><span className="link">All →</span></div>
            {prs.map((p) => <div className="food-row" key={p.key}><Icon name="trophy" size={18} className="y" /><div className="fr-main"><div className="fr-name">{p.label}</div><div className="fr-sub">{new Date(p.date).toLocaleDateString()}</div></div><div className="fr-k">{p.value}</div></div>)}
          </Card>}

          {showInstall && <Card>
            <div className="card-head"><h3>Install HYBRD</h3><Icon name="download" className="y" /></div>
            <p className="muted small">{isIOS() ? 'On iPhone/iPad: tap Share → Add to Home Screen. The Home Screen app keeps your data safer (Safari can clear site data after 7 days without a visit) and can keep the screen awake during workouts (iOS 18.4+).' : 'Use your browser menu → Install app / Add to Home screen for a full-screen app that works offline.'}</p>
            <Link className="link" to="/me/help">Phone tips & limits →</Link>
          </Card>}
        </div>
      </div>
    </div>
  );
}
