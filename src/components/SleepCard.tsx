import { useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import { todayKey } from '../lib/calc';
import { buildPlan, caffeineAt, dosesFor, bedtimeMs, quizHalfLife, stats, band } from '../lib/sleep';
import { useNow } from '../lib/useNow';
import { Card } from './ui';
import { Icon } from './Icon';

/** Entry point to Fuel › Sleep on the Fuel page: setup prompt, or tonight's key times + last-night summary. */
export function SleepCard({ compact }: { compact?: boolean }) {
  const { data, profile } = useStore();
  const nav = useNavigate();
  const plan = profile.sleep;
  const now = useNow(60_000, !!plan);
  const today = todayKey();
  if (!plan) return (
    <Card className="wl-entry click" onClick={() => nav('/fuel/sleep')}>
      <div className="card-head"><div><div className="kicker">Fuel · New</div><h3>Sleep nutrition</h3></div><Icon name="moon" className="y" /></div>
      <p className="muted small" style={{ margin: '0 0 12px' }}>Your caffeine cutoff, last big meal, bedtime snack and drink — built around your training, with a safety check and graded research.</p>
      <span className="btn sm y" data-testid="sleep-entry">Build my evening plan · 2 min</span>
    </Card>
  );
  const p = buildPlan(plan.quiz);
  const meal = p.items.find((i) => i.kind === 'meal' || i.kind === 'recovery');
  const left = caffeineAt(dosesFor(data.caffeine, today), bedtimeMs(today, plan.quiz.bed, plan.quiz.wake), quizHalfLife(plan.quiz));
  const s = stats(data.sleeps, today);
  void now;
  return (
    <Card className="wl-entry click" onClick={() => nav('/fuel/sleep')}>
      <div className="card-head"><div><div className="kicker">Sleep · Tonight</div><h3>Evening plan</h3></div><span className="link">Open →</span></div>
      <div className="fast-win sm" data-testid="sleep-card-times">
        <div><span className="muted small">Last caffeine</span><b>{p.noCaffeine ? 'skip' : p.cutoffClock || '—'}</b></div>
        <div><span className="muted small">{meal?.kind === 'recovery' ? 'Recovery meal' : 'Last big meal'}</span><b>{meal?.clock || '—'}</b></div>
      </div>
      <p className="muted small" style={{ margin: '10px 0 0' }}>
        {left > 1 ? `≈ ${Math.round(left)} mg caffeine left at bedtime (estimate${band(left) === 'low' ? ', fine' : ''}). ` : ''}
        {s.n7 ? `${s.avgHours7.toFixed(1)} h average over ${s.n7} night${s.n7 === 1 ? '' : 's'}${s.goodStreak > 1 && !compact ? ` · ${s.goodStreak}-night 7 h+ streak` : ''}.` : 'Log last night’s sleep to see trends.'}
      </p>
    </Card>
  );
}
