import { useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import { activeFast, eatingWindow, fmtDur, goalAt, progress, protocolById, stageAt, fastHours, type FastLog } from '../lib/fasting';
import { useNow } from '../lib/useNow';
import { Card } from './ui';
import { Icon } from './Icon';
import { ScoreRing } from './charts';

const hm = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** Entry point to Fuel › Fasting on Home and Fuel: setup prompt, live fast, or eating-window status. */
export function FastingCard({ compact }: { compact?: boolean }) {
  const { data, profile } = useStore();
  const nav = useNavigate();
  const plan = profile.fasting && profile.fasting.level !== 'stop' ? profile.fasting : null;
  const active = activeFast(data.fasts);
  const now = useNow(30_000, !!plan);
  if (!plan) return (
    <Card className="wl-entry click" onClick={() => nav('/fuel/fasting')}>
      <div className="card-head"><div><div className="kicker">Fuel · New</div><h3>Fasting plans</h3></div><Icon name="timer" className="y" /></div>
      <p className="muted small" style={{ margin: '0 0 12px' }}>Researched protocols from 12:12 to 5:2, a safety check first, an eating window that fits your training, and a live timer with streaks.</p>
      <span className="btn sm y" data-testid="fast-entry">Find my fasting plan · 2 min</span>
    </Card>
  );
  const proto = protocolById(plan.protocol);
  if (active) {
    const pct = Math.round(progress(active.start, active.targetH, now) * 100);
    const done = now >= goalAt(active.start, active.targetH);
    return (
      <Card className="wl-entry click" onClick={() => nav('/fuel/fasting')}>
        <div className="card-head"><div><div className="kicker">Fasting · {proto?.tag || 'custom'}</div><h3>{done ? 'Goal reached' : 'Fast in progress'}</h3></div><span className="link">Open →</span></div>
        <div className="steps-top" data-testid="fast-card-live">
          <ScoreRing score={pct} size={compact ? 104 : 118} numSize={22} display={fmtDur(now - active.start)} label="fasted" sub={`goal ${active.targetH} h`} />
          <div className="steps-break">
            <div><span className="muted small">Goal at</span><b className="mono">{hm(goalAt(active.start, active.targetH))}</b></div>
            <div><span className="muted small">Stage</span><b className="small" style={{ textAlign: 'right' }}>{stageAt(fastHours(active as FastLog, now)).title}</b></div>
          </div>
        </div>
      </Card>
    );
  }
  const last = data.fasts.filter((l) => l.kind === 'timed' && l.end).sort((a, b) => b.end! - a.end!)[0];
  const eat = last && proto?.kind === 'daily' ? eatingWindow(last.end!, proto.eatH, now) : null;
  return (
    <Card className="wl-entry click" onClick={() => nav('/fuel/fasting')}>
      <div className="card-head"><div><div className="kicker">Fasting · {proto?.tag}</div><h3>{eat?.open ? 'Eating window open' : proto?.kind === 'daily' ? 'Fasting plan' : proto?.name}</h3></div><span className="link">Open →</span></div>
      {plan.window && <div className="fast-win sm"><div><span className="muted small">Eat</span><b>{plan.window.start}–{plan.window.end}</b></div><div><span className="muted small">Fast</span><b>{plan.window.end}–{plan.window.start}</b></div></div>}
      <p className="muted small" style={{ margin: '10px 0 0' }}>{eat?.open ? `Closes ${hm(eat.closes)} · ${fmtDur(eat.leftMs)} left` : 'Tap to start your next fast.'}</p>
    </Card>
  );
}
