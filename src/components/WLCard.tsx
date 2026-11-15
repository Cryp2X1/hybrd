import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import { todayKey, toW, wUnit, wu } from '../lib/calc';
import { activePlan, planTargetsFor, weekdayOf, weightTrend } from '../lib/wl';
import { recipeById } from '../data/recipes';
import { Card } from './ui';
import { Icon } from './Icon';

/** Entry point to Weight-loss programs, shown on Home and in Fuel. */
export function WLCard({ compact }: { compact?: boolean }) {
  const { data, profile } = useStore();
  const nav = useNavigate();
  const plan = activePlan(data.wlplans);
  const today = todayKey();
  if (!plan) return (
    <Card className="wl-entry click" onClick={() => nav('/fuel/weight-loss')}>
      <div className="card-head"><div><div className="kicker">Fuel · New</div><h3>Weight-loss programs</h3></div><Icon name="fire" className="y" /></div>
      <p className="muted small" style={{ margin: '0 0 12px' }}>A plan built around you: safe calorie target, protein first, carbs matched to your training, and 7 days of meals that fit your diet, allergies, budget and cooking time.</p>
      <span className="btn sm y" data-testid="wl-entry">Build my plan · 2 min</span>
    </Card>
  );
  if (plan.targets.level === 'stop') return null;
  const t = planTargetsFor(plan, today);
  const day = plan.week.find((d) => d.weekday === weekdayOf(today));
  const now = new Date(); const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const next = day?.meals.find((m) => m.time >= hm) || null;
  const tr = weightTrend(data.body.filter((b) => b.date >= plan.startDate));
  const wU = wu(profile);
  const change = tr.length >= 2 ? tr[tr.length - 1].avg - tr[0].avg : null;
  return (
    <Card className="wl-entry click" onClick={() => nav('/fuel/weight-loss')}>
      <div className="card-head"><div><div className="kicker">{t.onBreak ? 'Diet break · maintenance' : plan.targets.periodized ? (t.kind === 'train' ? 'Training day' : 'Rest day') : 'Weight-loss plan'}</div><h3>Today’s plan</h3></div><span className="link">Open →</span></div>
      <div className="grid3">
        <div className="stat accent"><div className="stat-v">{t.kcal.toLocaleString()}</div><div className="stat-l">kcal target</div></div>
        <div className="stat"><div className="stat-v">{t.protein}<small> g</small></div><div className="stat-l">protein</div></div>
        <div className="stat"><div className="stat-v">{change == null ? '—' : `${change > 0 ? '+' : ''}${toW(change, wU).toFixed(1)}`}<small>{change == null ? '' : ` ${wUnit(wU)}`}</small></div><div className="stat-l">trend</div></div>
      </div>
      {!compact && next && <p className="muted small" style={{ margin: '10px 0 0' }}>Next: <b style={{ color: 'var(--fg, #fff)' }}>{next.time} · {recipeById(next.recipeId)?.name}</b> ({next.factor} serving{next.factor === 1 ? '' : 's'})</p>}
      {compact && <p className="muted small" style={{ margin: '10px 0 0' }}><Link className="link" to="/fuel/weight-loss?tab=week" onClick={(e) => e.stopPropagation()}>This week’s meals</Link> · <Link className="link" to="/fuel/weight-loss?tab=progress" onClick={(e) => e.stopPropagation()}>Weigh in</Link></p>}
    </Card>
  );
}
