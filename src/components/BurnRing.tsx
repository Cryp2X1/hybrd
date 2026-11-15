import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import { todayKey } from '../lib/calc';
import { burnGoalOf, burnStreak, dayBurn } from '../lib/burn';
import { Card } from './ui';
import { ScoreRing } from './charts';

export const BURN_COLORS = { resting: '#4a4a4a', workouts: '#FFE600', steps: '#60a5fa', manual: '#fb923c' } as const;

/** Home card: today's active burn vs. the daily goal, with the goal streak. Tap → Burn. */
export function BurnRingCard() {
  const { data, profile } = useStore();
  const nav = useNavigate();
  const today = todayKey();
  const db = useMemo(() => dayBurn(data, today, profile), [data, profile, today]);
  const st = useMemo(() => burnStreak(data, profile, today), [data, profile, today]);
  const goal = burnGoalOf(profile);
  const pct = Math.min(100, Math.round((db.active / goal) * 100));
  return (
    <Card className="click burn-card" onClick={() => nav('/burn')}>
      <div className="card-head"><h3>Calories burned</h3><span className="link">Details →</span></div>
      <div className="steps-top" data-testid="home-burn-ring">
        <ScoreRing score={pct} size={118} numSize={26} display={db.active.toLocaleString()} label="active kcal" sub={`${pct}% of ${goal}`} />
        <div className="steps-break">
          <div><span className="muted small"><i className="dot" style={{ background: BURN_COLORS.workouts }} />Workouts</span><b className="mono">{db.workouts}</b></div>
          <div><span className="muted small"><i className="dot" style={{ background: BURN_COLORS.steps }} />Steps</span><b className="mono">{db.steps}</b></div>
          {db.manual > 0 && <div><span className="muted small"><i className="dot" style={{ background: BURN_COLORS.manual }} />Added</span><b className="mono">{db.manual}</b></div>}
          <div><span className="muted small">Total so far</span><b className="mono">{db.total.toLocaleString()}</b></div>
          {st.hitToday ? <span className="pill yellow" style={{ alignSelf: 'flex-start' }}>Goal hit · {st.current}-day streak</span>
            : <span className="muted small">{(goal - db.active).toLocaleString()} kcal to goal{st.current ? ` · streak ${st.current}` : ''}</span>}
        </div>
      </div>
      <p className="muted small" style={{ margin: '10px 0 0' }}>Estimates. Active = workouts + steps outside them + anything you add. Total adds your resting burn so far today.</p>
    </Card>
  );
}
