import { useMemo, useState } from 'react';
import { useStore, uid } from '../lib/store';
import { addDays, computeTargets, dayKeyOf, dayTotals, fmtDist, fromW, hybridScore, personalRecords, toDist, toW, todayKey, wUnit, distUnit, wu, daySteps, stepGoalOf, stepStats } from '../lib/calc';
import { Page, Card, Segmented, Empty } from '../components/ui';
import { BarChart, LineChart } from '../components/charts';
import { Icon } from '../components/Icon';
import type { BodyLog } from '../lib/types';
import { Link } from 'react-router-dom';
import { burnGoalOf, rangeBurn } from '../lib/burn';

export default function Progress() {
  const { data, profile, upsert, setProfile } = useStore();
  const u = profile.units;
  const wU = wu(profile);
  const today = todayKey();
  const [prRange, setPrRange] = useState<'all' | '8w'>('all');
  const [wt, setWt] = useState('');
  const [stepRange, setStepRange] = useState<'7' | '30'>('7');
  const goal = stepGoalOf(profile);
  const stepN = +stepRange;
  const stepSeries = Array.from({ length: stepN }, (_, i) => { const d = addDays(today, i - (stepN - 1)); return { label: stepN === 7 ? new Date(d + 'T12:00').toLocaleDateString(undefined, { weekday: 'narrow' }) : (stepN - 1 - i) % 5 === 0 ? String(new Date(d + 'T12:00').getDate()) : '', value: daySteps(data, d).total }; });
  const logged = stepSeries.filter((x) => x.value > 0);
  const stepAvg = logged.length ? Math.round(logged.reduce((a, x) => a + x.value, 0) / logged.length) : 0;
  const hitN = stepSeries.filter((x) => x.value >= goal).length;
  const sst = stepStats(data, goal, today);
  const weeks = useMemo(() => Array.from({ length: 8 }, (_, i) => { const end = addDays(today, -7 * (7 - i)); return { start: addDays(end, -6), end }; }), [today]);
  const wk = weeks.map(({ start, end }) => {
    const ws = data.workouts.filter((w) => { const k = dayKeyOf(w.date); return k >= start && k <= end; });
    return { label: new Date(end + 'T12:00').toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' }), min: ws.reduce((a, w) => a + w.durationSec / 60, 0), dist: ws.reduce((a, w) => a + (w.distanceM || 0), 0), n: ws.filter((w) => w.type !== 'rest').length };
  });
  const scoreTrend = useMemo(() => Array.from({ length: 28 }, (_, i) => { const d = addDays(today, i - 27); return { label: new Date(d + 'T12:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), value: hybridScore(data, profile, d).score }; }), [data, profile, today]);
  const t = computeTargets(profile);
  const kcal14 = Array.from({ length: 14 }, (_, i) => { const d = addDays(today, i - 13); return { label: new Date(d + 'T12:00').toLocaleDateString(undefined, { weekday: 'narrow' }), value: Math.round(dayTotals(data.foods, d).kcal) }; });
  const burnGoal = burnGoalOf(profile);
  const burn14 = useMemo(() => rangeBurn(data, profile, today, 14), [data, profile, today]);
  const body = [...data.body].sort((a, b) => a.date.localeCompare(b.date)).slice(-20);
  const prs = personalRecords(prRange === '8w' ? { ...data, workouts: data.workouts.filter((w) => dayKeyOf(w.date) >= addDays(today, -56)) } : data, u, wU);
  const total = data.workouts.filter((w) => w.type !== 'rest');
  const logWeight = () => { const v = parseFloat(wt); if (!v) return; const kg = fromW(v, wU); upsert<BodyLog>('body', { id: uid(), date: today, weightKg: kg }); setProfile({ weightKg: kg }); setWt(''); };

  return (
    <Page title="Progress" kicker="Trends · PRs · Body" wide>
      <div className="grid4" style={{ marginBottom: 14 }}>
        <div className="stat accent"><div className="stat-v">{total.length}</div><div className="stat-l">workouts</div></div>
        <div className="stat"><div className="stat-v">{Math.round(total.reduce((a, w) => a + w.durationSec, 0) / 3600)}<small> h</small></div><div className="stat-l">trained</div></div>
        <div className="stat"><div className="stat-v">{toDist(total.reduce((a, w) => a + (w.distanceM || 0), 0), u).toFixed(0)}<small> {distUnit(u)}</small></div><div className="stat-l">covered</div></div>
        <div className="stat"><div className="stat-v">{prs.length}</div><div className="stat-l">records</div></div>
      </div>
      <div className="desk-grid">
        <div>
          <Card><div className="card-head"><h3>Hybrid Score · 28 days</h3></div><LineChart data={scoreTrend} min={0} max={100} /></Card>
          <Card className="steps-progress">
            <div className="card-head"><h3>Steps · {stepN} days</h3><Segmented small value={stepRange} onChange={setStepRange} options={[{ v: '7', label: '7 days' }, { v: '30', label: '30 days' }]} /></div>
            <BarChart data={stepSeries} goal={goal} fmt={(v) => `${Math.round(v / 1000)}k`} />
            <div className="grid2" style={{ marginTop: 12 }}>
              <div className="stat"><div className="stat-v">{stepAvg ? stepAvg.toLocaleString() : '—'}</div><div className="stat-l">daily avg</div></div>
              <div className="stat"><div className="stat-v">{hitN}<small>/{stepN}</small></div><div className="stat-l">goal days</div></div>
              <div className="stat accent"><div className="stat-v">{sst.current}</div><div className="stat-l">goal streak</div></div>
              <div className="stat"><div className="stat-v">{sst.best ? sst.best.steps.toLocaleString() : '—'}</div><div className="stat-l">best day{sst.best ? ` · ${new Date(sst.best.date + 'T12:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : ''}</div></div>
            </div>
            <p className="muted small" style={{ margin: '10px 0 0' }}>Yellow bars hit your {goal.toLocaleString()}-step goal (dashed line). Days with nothing logged show empty.</p>
          </Card>
          <Card><div className="card-head"><h3>Training minutes / week</h3></div><BarChart data={wk.map((w) => ({ label: w.label, value: Math.round(w.min) }))} unit=" min" /></Card>
          <Card><div className="card-head"><h3>Distance / week</h3></div><BarChart data={wk.map((w) => ({ label: w.label, value: +toDist(w.dist, u).toFixed(1) }))} unit={` ${distUnit(u)}`} /></Card>
          <Card>
            <div className="card-head"><h3>Active calories burned · 14 days</h3><Link className="link" to="/burn?view=week">Burn →</Link></div>
            <BarChart data={burn14.days.map((x) => ({ label: new Date(x.date + 'T12:00').toLocaleDateString(undefined, { weekday: 'narrow' }), value: x.active }))} goal={burnGoal} unit=" kcal" />
            <p className="muted small" style={{ margin: '10px 0 0' }}>Estimates · avg {burn14.avgActive.toLocaleString()} active kcal/day · {burn14.goalDays}/14 days hit your {burnGoal}-kcal goal (dashed line).</p>
          </Card>
          <Card><div className="card-head"><h3>Calories eaten · 14 days</h3><span className="muted small">target {t.kcal}</span></div><BarChart data={kcal14} /></Card>
        </div>
        <div>
          <Card>
            <div className="card-head"><h3>Personal records</h3><Segmented small value={prRange} onChange={setPrRange} options={[{ v: 'all', label: 'All time' }, { v: '8w', label: '8 weeks' }]} /></div>
            {prs.length ? prs.map((p) => <div className="food-row" key={p.key}><Icon name="trophy" size={18} className="y" /><div className="fr-main"><div className="fr-name">{p.label}</div><div className="fr-sub">{new Date(p.date).toLocaleDateString()}</div></div><div className="fr-k">{p.value}</div></div>)
              : <Empty title="No records yet" icon="trophy">Log sets, runs or a HYROX sim to start your PR board.</Empty>}
          </Card>
          <Card>
            <div className="card-head"><h3>Body weight</h3><span className="muted small">{body.length ? `${(toW(body[body.length - 1].weightKg, wU)).toFixed(1)} ${wUnit(wU)}` : ''}</span></div>
            <LineChart data={body.map((b) => ({ label: new Date(b.date + 'T12:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), value: +toW(b.weightKg, wU).toFixed(1) }))} fmt={(v) => v.toFixed(1)} />
            <div className="row" style={{ marginTop: 12 }}><input className="input" inputMode="decimal" placeholder={`Today’s weight (${wUnit(wU)})`} value={wt} onChange={(e) => setWt(e.target.value)} /><button className="btn y" onClick={logWeight}>Log</button></div>
            <p className="muted small" style={{ marginTop: 8, marginBottom: 0 }}>Logging updates your profile weight, which keeps calorie estimates current.</p>
          </Card>
          <Card><div className="card-head"><h3>Totals by week</h3></div>{wk.slice().reverse().map((w) => <div key={w.label} className="food-row"><div className="fr-main"><div className="fr-name">Week ending {w.label}</div><div className="fr-sub">{w.n} sessions</div></div><span className="fr-k">{Math.round(w.min)} min · {fmtDist(w.dist, u, 1)}</span></div>)}</Card>
        </div>
      </div>
    </Page>
  );
}
