// HYBRD Pulse UI bits (used by /mind). Colours come only from CSS variables (src/pulse.css) so light/dark themes work.
import { Link } from 'react-router-dom';
import { prettyDay } from '../lib/calc';
import { PULSE_BAND, PULSE_DISCLAIMER, PULSE_ITEMS, PULSE_SCALE, pulseSupportLine, pulseTalk, type PulseBand, type PulseResult } from '../lib/mind';
import { Icon } from './Icon';
import '../pulse.css';

export function PulseDial({ score, band, size = 116 }: { score: number; band: PulseBand; size?: number }) {
  const r = 44, c = 2 * Math.PI * r, pct = Math.max(0, Math.min(100, score)) / 100;
  return <div className={`pl-dial ${band}`} style={{ width: size, height: size }} role="img" aria-label={`Pulse ${score} out of 100, ${PULSE_BAND[band].label}`}>
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
      <circle cx="50" cy="50" r={r} className="bg" />
      <circle cx="50" cy="50" r={r} className="fg" strokeDasharray={`${c * pct} ${c}`} transform="rotate(-90 50 50)" />
    </svg>
    <div className="v"><b>{score}</b><span>/100</span></div>
  </div>;
}

/** One question: emoji scale 0–4 with end labels. */
export function PulseQuestion({ i, value, onChange }: { i: number; value: number | undefined; onChange: (v: number) => void }) {
  const it = PULSE_ITEMS[i];
  return <div className="pl-q" data-testid={`pulse-q-${it.k}`}>
    <div className="pl-qh"><span className="pl-k">{it.label}</span><p id={`pl-lbl-${it.k}`}>{it.q}</p></div>
    <div className="pl-scale" role="radiogroup" aria-labelledby={`pl-lbl-${it.k}`}>
      {PULSE_SCALE.map((o) => <button key={o.v} type="button" role="radio" aria-checked={value === o.v} aria-label={`${o.label}${o.v === 0 ? ` — ${it.lo}` : o.v === 4 ? ` — ${it.hi}` : ''}`}
        className={value === o.v ? 'on' : ''} data-testid={`pulse-${it.k}-${o.v}`} onClick={() => onChange(o.v)}><span className="e" aria-hidden="true">{o.emoji}</span><span className="l">{o.label}</span></button>)}
    </div>
    <div className="pl-ends"><span>{it.lo}</span><span>{it.hi}</span></div>
  </div>;
}

export function PulseBreakdown({ r }: { r: PulseResult }) {
  return <ul className="pl-bars" aria-label="Your Pulse by area">{r.items.map((x) => <li key={x.k}>
    <span>{x.label}</span><div className="pl-bar" aria-hidden="true"><i className={x.v <= 1 ? 'lo' : x.v === 2 ? 'mid' : 'hi'} style={{ width: `${Math.max(4, x.pct)}%` }} /></div>
    <b aria-label={`${PULSE_SCALE[x.v].label}`}>{PULSE_SCALE[x.v].emoji}</b></li>)}</ul>;
}

export function PulseFocus({ r }: { r: PulseResult }) {
  if (!r.focus.length) return <p className="small pl-focus-none">No weak spots this week. Nice work.</p>;
  return <ul className="pl-focus">{r.focus.map((k) => { const it = PULSE_ITEMS.find((x) => x.k === k)!; return <li key={k}><b>{it.label}</b><span className="small">{it.tip}</span><Link className="rl small" to={it.link}>{it.linkLabel} →</Link></li>; })}</ul>;
}

/** Gentle, non-alarming support line (988) for low Pulses. Not the full crisis card. */
export function PulseSupport({ minor }: { minor: boolean }) {
  return <div className="pl-support" data-testid="pulse-support" role="note">
    <Icon name="heart" size={16} />
    <div><p className="small">{pulseSupportLine(minor)}</p>
      <div className="row wrap" style={{ gap: 8 }}><a className="btn sm" href="tel:988" data-testid="pulse-call-988"><Icon name="phone" size={14} />Call 988</a><a className="btn sm ghost" href="sms:988"><Icon name="comment" size={14} />Text 988</a><Link className="btn sm ghost" to="/mind/help">More support</Link></div>
      <p className="muted small" style={{ marginTop: 6 }}>In immediate danger? Call 911. Outside the US, contact your local emergency services.</p></div>
  </div>;
}

export function PulseDisclaimer({ minor, compact }: { minor: boolean; compact?: boolean }) {
  return <div className={`pl-disc${compact ? ' compact' : ''}`} data-testid="pulse-disclaimer" role="note">
    <Icon name="info" size={14} />
    <p className="small">{compact ? 'For general wellness only — not medical advice, a test or a diagnosis.' : <>{PULSE_DISCLAIMER} If you’re worried about how you feel, talk with {pulseTalk(minor)}.</>}</p>
  </div>;
}

/** Bars of recent Pulse scores, oldest → newest. */
export function PulseTrendChart({ pts }: { pts: { id: string; date: string; score: number; band: PulseBand }[] }) {
  return <div className="pl-trend" data-testid="pulse-trend" role="img" aria-label={`Pulse trend: ${pts.map((p) => `${prettyDay(p.date)} ${p.score}`).join(', ')}`}>
    {pts.map((p) => <div key={p.id} className="c"><span className="s">{p.score}</span><div className="bar"><i className={p.band} style={{ height: `${Math.max(3, p.score)}%` }} /></div><span className="d">{new Date(p.date + 'T12:00:00').toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' })}</span></div>)}
  </div>;
}
