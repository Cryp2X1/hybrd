import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from './Icon';

export function Page({ title, kicker, back, actions, children, wide }: { title: string; kicker?: string; back?: string | boolean; actions?: ReactNode; children: ReactNode; wide?: boolean }) {
  const nav = useNavigate();
  return (
    <div className={`page ${wide ? 'wide' : ''}`}>
      <header className="page-head">
        {back && <button className="icon-btn" aria-label="Back" onClick={() => (typeof back === 'string' ? nav(back) : nav(-1))}><Icon name="back" /></button>}
        <div className="page-title">
          {kicker && <div className="kicker">{kicker}</div>}
          <h1>{title}</h1>
        </div>
        {actions && <div className="page-actions">{actions}</div>}
      </header>
      {children}
    </div>
  );
}
export const Card = ({ children, className = '', onClick }: { children: ReactNode; className?: string; onClick?: () => void }) => (
  <section className={`card ${className}`} onClick={onClick}>{children}</section>
);
export const Stat = ({ label, value, unit, accent }: { label: string; value: ReactNode; unit?: string; accent?: boolean }) => (
  <div className={`stat ${accent ? 'accent' : ''}`}><div className="stat-v">{value}{unit && <small> {unit}</small>}</div><div className="stat-l">{label}</div></div>
);
export function Segmented<T extends string>({ value, options, onChange, small }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void; small?: boolean }) {
  return (
    <div className={`seg ${small ? 'small' : ''}`} role="tablist">
      {options.map((o) => <button key={o.v} role="tab" aria-selected={value === o.v} className={value === o.v ? 'on' : ''} onClick={() => onChange(o.v)}>{o.label}</button>)}
    </div>
  );
}
export const Empty = ({ icon = 'bolt', title, children }: { icon?: string; title: string; children?: ReactNode }) => (
  <div className="empty"><Icon name={icon} size={30} /><h3>{title}</h3>{children && <div className="muted">{children}</div>}</div>
);
export const Banner = ({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'ok' | 'yellow'; children: ReactNode }) => (
  <div className={`banner ${tone}`}><Icon name={tone === 'warn' ? 'info' : tone === 'ok' ? 'check' : 'bolt'} size={18} /><div>{children}</div></div>
);
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-wrap" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head"><h2>{title}</h2><button className="icon-btn" aria-label="Close" onClick={onClose}><Icon name="x" /></button></div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}
export const RowLink = ({ to, title, sub, right, icon }: { to: string; title: ReactNode; sub?: ReactNode; right?: ReactNode; icon?: string }) => (
  <Link to={to} className="row-link">
    {icon && <span className="row-ic"><Icon name={icon} size={20} /></span>}
    <span className="row-main"><span className="row-title">{title}</span>{sub && <span className="row-sub">{sub}</span>}</span>
    {right && <span className="row-right">{right}</span>}
    <Icon name="chevron" size={18} className="muted" />
  </Link>
);

/** Press-and-hold to confirm (e.g. stop a run). A single tap never fires. */
export function HoldButton({ onHold, label = 'Hold to stop', ms = 900, className = '', icon = 'stop' }: { onHold: () => void; label?: string; ms?: number; className?: string; icon?: string }) {
  const [p, setP] = useState(0);
  const raf = useRef(0), start = useRef(0);
  const end = () => { cancelAnimationFrame(raf.current); start.current = 0; setP(0); };
  const step = () => {
    const v = Math.min(1, (performance.now() - start.current) / ms);
    setP(v);
    if (v >= 1) { end(); onHold(); return; }
    raf.current = requestAnimationFrame(step);
  };
  const down = (e: React.PointerEvent) => { e.preventDefault(); start.current = performance.now(); raf.current = requestAnimationFrame(step); };
  const C = 2 * Math.PI * 30;
  return (
    <button className={`hold-btn ${className}`} onPointerDown={down} onPointerUp={end} onPointerLeave={end} onPointerCancel={end} onContextMenu={(e) => e.preventDefault()} aria-label={label}>
      <svg viewBox="0 0 68 68" className="hold-ring"><circle cx="34" cy="34" r="30" className="hr-bg" /><circle cx="34" cy="34" r="30" className="hr-fg" strokeDasharray={C} strokeDashoffset={C * (1 - p)} /></svg>
      <Icon name={icon} size={24} fill />
      <span className="hold-label">{p > 0 ? 'Keep holding…' : label}</span>
    </button>
  );
}

export function NumberStepper({ value, onChange, step = 1, min = 0, max = 9999, label, unit, decimals = 0 }: { value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; label?: string; unit?: string; decimals?: number }) {
  const set = (v: number) => onChange(Math.max(min, Math.min(max, +v.toFixed(decimals))));
  return (
    <div className="stepper">
      {label && <span className="stepper-l">{label}</span>}
      <button type="button" aria-label={`Decrease ${label || ''}`} onClick={() => set(value - step)}><Icon name="minus" size={18} /></button>
      <input inputMode="decimal" value={Number.isFinite(value) ? value : ''} onChange={(e) => { const v = parseFloat(e.target.value); onChange(Number.isFinite(v) ? v : 0); }} aria-label={label} />
      {unit && <span className="stepper-u">{unit}</span>}
      <button type="button" aria-label={`Increase ${label || ''}`} onClick={() => set(value + step)}><Icon name="plus" size={18} /></button>
    </div>
  );
}
export const Pill = ({ children, tone }: { children: ReactNode; tone?: 'yellow' | 'dim' | 'expert' }) => <span className={`pill ${tone || ''}`}>{children}</span>;
export const Disclaimer = () => <p className="muted small">Not medical advice. Numbers are estimates from public datasets and position stands; individual needs vary. For a personal plan, see a registered dietitian (look for the CSSD sports credential).</p>;
