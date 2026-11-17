// Mind & Recovery entry points: Home card and the readiness chip on Coach › Today. Reads the stored check-in only
// (no import of lib/mind.ts, so Home and Coach stay light).
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import { todayKey } from '../lib/calc';
import { Card } from './ui';
import { Icon } from './Icon';

type R = 'go' | 'easy' | 'recover' | 'stop';
const LABEL: Record<R, string> = { go: 'Train as planned', easy: 'Go easier', recover: 'Recovery day', stop: 'Stop — get checked' };
const HINT: Record<R, string> = { go: 'Good recovery — do the planned session.', easy: 'Keep it easy or cut the hard part by about a third.', recover: 'Rest, walk, mobility or breathing today.', stop: 'Don’t train today — see the steps in Mind.' };

function useToday() {
  const { data } = useStore();
  const t = todayKey();
  return (data.checkins || []).find((c) => !c.deleted && c.date === t) || null;
}

export function MindCard() {
  const nav = useNavigate();
  const c = useToday();
  return <Card className="wl-entry mn-home">
    <div className="card-head click" onClick={() => nav('/mind')} role="link" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') nav('/mind'); }}>
      <div><div className="kicker">Mind & Recovery{c ? ' · today' : ''}</div><h3>{c ? LABEL[c.rec as R] : 'How ready are you today?'}</h3></div>
      {c ? <span className={`mn-chip ${c.rec}`} data-testid="home-readiness">{c.score}</span> : <Icon name="mind" className="y" />}
    </div>
    <p className="muted small" style={{ margin: '0 0 12px' }}>{c ? HINT[c.rec as R] : 'A 20-second check-in turns sleep, soreness, stress and mood into a readiness score with a clear recommendation.'}</p>
    <div className="row wrap" style={{ gap: 8 }}>
      {!c && <Link className="btn sm y" to="/mind" data-testid="home-mind-checkin">Check in · 20 s</Link>}
      <Link className="btn sm" to="/mind/breathe/sigh"><Icon name="mind" size={14} />Breathe 5 min</Link>
      <Link className="btn sm ghost" to="/mind/help">Get help</Link>
    </div>
  </Card>;
}

/** Small readiness line for Coach › Today. */
export function ReadinessChip() {
  const c = useToday();
  if (!c) return <Link to="/mind" className="mn-coach" data-testid="coach-readiness"><Icon name="mind" size={16} /><span><b>How ready are you?</b> <span className="muted small">20-second check-in</span></span><Icon name="chevron" size={16} /></Link>;
  return <Link to="/mind" className={`mn-coach ${c.rec}`} data-testid="coach-readiness"><span className={`mn-chip ${c.rec}`}>{c.score}</span><span><b>{LABEL[c.rec as R]}</b> <span className="muted small">{c.rec === 'go' ? 'Readiness is good.' : c.rec === 'easy' ? 'Swap the hard part for easy work, or trim it by a third.' : c.rec === 'recover' ? 'Consider swapping today for recovery.' : 'Skip training today.'}</span></span><Icon name="chevron" size={16} /></Link>;
}
