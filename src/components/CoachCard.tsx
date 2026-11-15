import { Link } from 'react-router-dom';
import { useStore } from '../lib/store';
import { todayKey } from '../lib/calc';
import { WEEKDAYS, weekdayOf } from '../lib/wl';
import { activeCoachPlan, coachTargetsFor, isDone, roleLabel, startLinks, weekIndexOf, weekProgress, weekSessions } from '../lib/coach';
import { Icon } from './Icon';

/**
 * HYBRD Coach entry point. No plan → "Not sure where to start?" prompt (prominent on Home unless dismissed).
 * With a plan → today's session highlighted + the week strip (Home/Train), or today's food target (Fuel).
 */
export function CoachCard({ where }: { where: 'home' | 'train' | 'fuel' }) {
  const { data, profile, setProfile } = useStore();
  const plan = activeCoachPlan(data.coachplans);
  const today = todayKey();
  if (!plan || plan.stopped) {
    if (plan?.stopped && where !== 'home') return null;
    const big = where === 'home' && !profile.coachDismissed;
    return (
      <div className={`coach-entry ${big ? 'big' : ''}`} data-testid="coach-entry">
        <span className="coach-av">H</span>
        <div className="coach-entry-t">
          <div className="kicker">HYBRD Coach</div>
          <b>Not sure where to start?</b>
          <span className="muted small">{where === 'fuel' ? 'Get calorie, macro and water targets plus a 7-day meal plan that fits your training.' : where === 'train' ? 'Answer a few questions and get a week-by-week schedule from these programs, matched to you.' : 'Answer a few quick questions and get a training schedule and food plan made for you.'}</span>
        </div>
        <div className="coach-entry-a">
          <Link className="btn y sm" to="/coach/start">Build my plan</Link>
          {big && <button className="btn ghost sm" onClick={() => setProfile({ coachDismissed: true })}>Not now</button>}
        </div>
      </div>
    );
  }
  const n = plan.weeks.length;
  const raw = weekIndexOf(plan, today);
  if (raw > n - 1) return (
    <Link to="/coach" className="coach-entry" data-testid="coach-entry"><span className="coach-av">H</span><div className="coach-entry-t"><div className="kicker">HYBRD Coach</div><b>Block complete — build your next one</b></div><Icon name="chevron" /></Link>
  );
  const w = Math.max(0, raw);
  const wd = weekdayOf(today);
  const items = weekSessions(plan, w);
  const t = items[wd];
  const prog = weekProgress(plan, w, data.workouts, today);
  if (where === 'fuel') {
    const tg = coachTargetsFor(plan, today);
    return (
      <Link to="/coach?tab=food" className="coach-entry" data-testid="coach-entry"><span className="coach-av">H</span>
        <div className="coach-entry-t"><div className="kicker">HYBRD Coach · {tg ? (tg.kind === 'train' ? 'training day' : 'rest day') : 'meal plan'}</div>
          <b>{tg ? `${tg.kcal.toLocaleString()} kcal · ${tg.protein} g protein today` : 'Your 7-day meal plan'}</b>
          <span className="muted small">{plan.applyToFuel ? 'Used as your Fuel target · ' : ''}Open today’s meals</span></div><Icon name="chevron" /></Link>
    );
  }
  const done = t.s ? isDone(plan, w, wd, t.date, t.s, data.workouts) : false;
  const go = t.s && !done ? startLinks(plan, w, wd, t.s).find((l) => l.primary) : null;
  const needCi = w > 0 && !plan.checkins.some((c) => c.week === w - 1);
  return (
    <div className="card coach-today-card" data-testid="coach-home">
      <div className="card-head"><div><div className="kicker">HYBRD Coach · week {w + 1} of {n}</div><h3>{t.s ? (done ? `Done: ${t.s.name}` : `Today: ${t.s.name}`) : 'Today: rest day'}</h3></div><Link to="/coach" className="btn sm ghost">Plan</Link></div>
      {t.s && <div className="coach-day-meta"><span className={`coach-role r-${t.s.role}`}>{roleLabel(t.s.role)}</span><span>{t.s.minutes} min</span><span>{t.s.focus}</span></div>}
      {!t.s && <p className="muted small" style={{ margin: '4px 0 0' }}>Recover — {(() => { const nx = items.slice(wd + 1).find((x) => x.s); return nx ? `next up ${WEEKDAYS[nx.wd]}: ${nx.s!.name}` : 'next session is next week'; })()}.</p>}
      <div className="coach-strip mini">{items.map(({ wd: d, date, s }) => {
        const dn = s ? isDone(plan, w, d, date, s, data.workouts) : false;
        return <Link key={d} to={`/coach?tab=week`} className={`coach-strip-d ${date === today ? 'today' : ''} ${s ? 'on' : 'rest'} ${dn ? 'done' : ''}`}><b>{WEEKDAYS[d].slice(0, 1)}</b><i>{dn ? <Icon name="check" size={12} /> : s ? roleLabel(s.role).slice(0, 4) : '—'}</i></Link>;
      })}</div>
      <div className="row wrap" style={{ gap: 8, marginTop: 10 }}>
        {go && <Link to={go.to} className="btn y sm" data-testid="coach-go"><Icon name="play" size={14} /> {go.label}</Link>}
        {needCi && <Link to="/coach?tab=checkin" className="btn sm">Week {w} check-in</Link>}
        <span className="muted small" style={{ alignSelf: 'center' }}>{prog.done}/{prog.planned} this week</span>
      </div>
    </div>
  );
}
