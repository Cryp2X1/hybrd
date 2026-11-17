// Shared Mind & Recovery UI: crisis card (988 / 911 / local emergency services), "not therapy" note, grade tag, readiness ring.
import { Link } from 'react-router-dom';
import { CRISIS, NOT_THERAPY, GRADE_HINT, GRADE_LABEL, type Grade, type Rec4 } from '../lib/mind';
import { Icon } from './Icon';
import { SrcPills } from './SrcPills';

export const MGrade = ({ g }: { g: Grade }) => <span className={`sl-grade ${g}`} title={GRADE_HINT[g]}><i aria-hidden="true" />{GRADE_LABEL[g]}</span>;

/** Always-visible crisis support. `compact` = one line with buttons (bottom of every Mind screen). */
export function CrisisCard({ compact, minor, title }: { compact?: boolean; minor?: boolean; title?: string }) {
  if (compact) return <div className="mn-crisis compact" role="note" aria-label="Crisis support" data-testid="mind-crisis">
    <div className="mn-crisis-t"><b>Struggling or in crisis?</b> <span>Call or text <a href={CRISIS.us.call}>988</a> (US, 24/7). In danger now: <a href={CRISIS.emergency.call}>911</a>. Elsewhere: your local emergency services · <a href={CRISIS.intlUrl} target="_blank" rel="noopener">findahelpline.com</a></span></div>
    <Link className="btn sm ghost" to="/mind/help">Get help</Link>
  </div>;
  return <div className="mn-crisis" role="region" aria-label="Crisis support" data-testid="mind-crisis-full">
    <h3>{title || 'You don’t have to handle this alone'}</h3>
    <p>{CRISIS.us.who}. Talk or text with a trained counselor now.</p>
    <div className="mn-crisis-btns">
      <a className="btn y" href={CRISIS.us.call} data-testid="mind-call-988"><Icon name="phone" size={18} />Call 988</a>
      <a className="btn" href={CRISIS.us.text} data-testid="mind-text-988"><Icon name="comment" size={18} />Text 988</a>
      <a className="btn danger" href={CRISIS.emergency.call} data-testid="mind-call-911"><Icon name="phone" size={18} />911</a>
    </div>
    <p className="small">{CRISIS.emergency.who}.</p>
    <p className="small">{CRISIS.intl} <a href={CRISIS.intlUrl} target="_blank" rel="noopener">Find a helpline →</a></p>
    {minor && <p className="small"><b>Under 18?</b> Please also tell a parent, guardian, school counselor or another adult you trust.</p>}
    <SrcPills ids={[...CRISIS.src]} />
  </div>;
}
export const NotTherapy = () => <p className="muted small mn-note" data-testid="mind-not-therapy"><Icon name="info" size={14} /> {NOT_THERAPY} If you’re struggling, call or text 988 (US) or contact your local emergency services.</p>;

export const REC_TONE: Record<Rec4, string> = { go: 'go', easy: 'easy', recover: 'recover', stop: 'stop' };
export function Ring({ score, rec, size = 112 }: { score: number; rec: Rec4; size?: number }) {
  const r = 44, c = 2 * Math.PI * r, pct = Math.max(0, Math.min(100, score)) / 100;
  return <div className={`mn-ring ${REC_TONE[rec]}`} style={{ width: size, height: size }} role="img" aria-label={`Readiness ${score} out of 100`}>
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
      <circle cx="50" cy="50" r={r} className="bg" />
      <circle cx="50" cy="50" r={r} className="fg" strokeDasharray={`${c * pct} ${c}`} transform="rotate(-90 50 50)" />
    </svg>
    <div className="v"><b>{score}</b><span>/100</span></div>
  </div>;
}
