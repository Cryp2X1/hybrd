// Facebook-style press-and-hold emoji reactions for posts and comments.
// HYBRD styling + system emoji (not Facebook artwork). Set: Like, Love, Haha, Wow, Sad, Angry, Dislike.
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Sheet } from './ui';
import { REACTION_META, REACTION_TYPES, compact, type PublicProfile, type ReactionType } from '../lib/social';
import type { ReactorView, ReactionSummary } from '../lib/socialApi';

function MiniAv({ p, size = 40 }: { p: PublicProfile; size?: number }) {
  const ini = p.displayName.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <span className="s-av" style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}>
      {p.avatarUrl ? <img src={p.avatarUrl} alt="" draggable={false} /> : <span>{ini}</span>}
    </span>
  );
}

export const REACT_HOLD_MS = 400;
const MOVE_CANCEL_PX = 12;
const haptic = (ms = 12) => { try { navigator.vibrate?.(ms); } catch { /* ignore */ } };

export function ReactionBar({
  open, anchor, current, onPick, onClose, pointerId,
}: {
  open: boolean;
  anchor: { left: number; top: number; width: number; height: number } | null;
  current: ReactionType | null;
  onPick: (t: ReactionType) => void;
  onClose: () => void;
  pointerId?: number | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [hot, setHot] = useState<ReactionType | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 });
  const labelId = useId();

  const place = useCallback(() => {
    const el = ref.current; if (!el || !anchor) return;
    const pad = 8;
    const w = el.offsetWidth || 336;
    const h = el.offsetHeight || 56;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = anchor.left + anchor.width / 2 - w / 2;
    left = Math.max(pad, Math.min(left, vw - w - pad));
    let top = anchor.top - h - 10;
    if (top < pad) top = Math.min(vh - h - pad, anchor.top + anchor.height + 10);
    setPos({ left, top });
  }, [anchor]);

  useEffect(() => { if (open) { setHot(null); requestAnimationFrame(place); } }, [open, place]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const i = Math.max(0, REACTION_TYPES.indexOf((hot || current || REACTION_TYPES[0])));
        const d = e.key === 'ArrowRight' ? 1 : -1;
        const n = REACTION_TYPES[(i + d + REACTION_TYPES.length) % REACTION_TYPES.length];
        setHot(n);
        const btn = ref.current?.querySelector(`[data-reaction="${n}"]`) as HTMLButtonElement | null;
        btn?.focus();
      }
      if ((e.key === 'Enter' || e.key === ' ') && (hot || current)) { e.preventDefault(); onPick((hot || current)!); }
    };
    const onDown = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('resize', place);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('pointerdown', onDown); window.removeEventListener('resize', place); };
  }, [open, onClose, onPick, hot, current, place]);

  // Slide-to-choose: follow the same pointer after a long-press opens the bar.
  useEffect(() => {
    if (!open || pointerId == null) return;
    const hit = (x: number, y: number): ReactionType | null => {
      const el = document.elementFromPoint(x, y) as HTMLElement | null;
      const btn = el?.closest?.('[data-reaction]') as HTMLElement | null;
      const v = btn?.getAttribute('data-reaction');
      return v && (REACTION_TYPES as readonly string[]).includes(v) ? v as ReactionType : null;
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      const t = hit(e.clientX, e.clientY);
      setHot((h) => { if (t && t !== h) haptic(8); return t; });
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      const t = hit(e.clientX, e.clientY);
      if (t) onPick(t);
      // releasing off the pills leaves the bar open so the person can tap
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
  }, [open, pointerId, onPick]);

  useEffect(() => {
    if (!open) return;
    const first = ref.current?.querySelector('[data-reaction]') as HTMLButtonElement | null;
    const cur = (current && ref.current?.querySelector(`[data-reaction="${current}"]`) as HTMLButtonElement | null) || first;
    cur?.focus();
  }, [open, current]);

  if (!open || !anchor) return null;
  const shown = hot;
  return createPortal(
    <div
      ref={ref}
      className="react-bar"
      style={{ left: pos.left, top: pos.top }}
      role="listbox"
      aria-label="Choose a reaction"
      aria-activedescendant={shown ? `${labelId}-${shown}` : undefined}
      data-testid="reaction-bar"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {REACTION_TYPES.map((t) => {
        const m = REACTION_META[t];
        const on = current === t;
        const isHot = shown === t;
        return (
          <button
            key={t}
            id={`${labelId}-${t}`}
            type="button"
            role="option"
            aria-selected={on}
            aria-label={on ? `Remove ${m.label}` : m.label}
            data-reaction={t}
            data-testid={`reaction-${t}`}
            className={`react-pill${on ? ' on' : ''}${isHot ? ' hot' : ''}`}
            onClick={() => onPick(t)}
            onPointerEnter={() => setHot(t)}
            onPointerLeave={() => setHot((h) => (h === t ? null : h))}
            onFocus={() => setHot(t)}
          >
            <span className="react-emoji" aria-hidden="true">{m.emoji}</span>
            {isHot && <span className="react-tip">{m.label}</span>}
          </button>
        );
      })}
    </div>,
    document.body,
  );
}

/** Long-press (touch + mouse), context-menu key, and optional short-tap. Cancels if the pointer moves (so scrolling still works). */
export function usePressToReact(opts: {
  onOpen: (anchor: DOMRect, pointerId: number | null) => void;
  onTap?: () => void;
  disabled?: boolean;
}) {
  const timer = useRef<number>(0);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const opened = useRef(false);
  const ignoreClick = useRef(false);
  const clear = () => { if (timer.current) { window.clearTimeout(timer.current); timer.current = 0; } };

  const bind = {
    onPointerDown: (e: React.PointerEvent) => {
      if (opts.disabled || e.button === 2) return;
      opened.current = false;
      start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
      const target = e.currentTarget as HTMLElement;
      clear();
      timer.current = window.setTimeout(() => {
        const s = start.current; if (!s) return;
        opened.current = true;
        haptic(15);
        opts.onOpen(target.getBoundingClientRect(), s.id);
      }, REACT_HOLD_MS);
    },
    onPointerMove: (e: React.PointerEvent) => {
      const s = start.current; if (!s || opened.current) return;
      if (Math.hypot(e.clientX - s.x, e.clientY - s.y) > MOVE_CANCEL_PX) { clear(); start.current = null; }
    },
    onPointerUp: () => {
      // Short tap is handled in onClick so keyboard and el.click() work too.
      // After a long-press we swallow the following click so it doesn't also toggle Like.
      if (opened.current) ignoreClick.current = true;
      clear(); start.current = null; opened.current = false;
    },
    onClick: (e: React.MouseEvent) => {
      if (ignoreClick.current) { ignoreClick.current = false; e.preventDefault(); e.stopPropagation(); return; }
      if (opts.disabled) return;
      opts.onTap?.();
    },
    onPointerCancel: () => { clear(); start.current = null; opened.current = false; },
    onPointerLeave: (e: React.PointerEvent) => {
      // leaving during a hold should cancel only before the bar opens (mouse hover-out)
      if (!opened.current && e.pointerType === 'mouse') { clear(); start.current = null; }
    },
    onContextMenu: (e: React.MouseEvent) => {
      // long-press or the context-menu key should open the bar, not the OS menu
      e.preventDefault();
      if (opts.disabled) return;
      clear();
      haptic(15);
      opts.onOpen((e.currentTarget as HTMLElement).getBoundingClientRect(), null);
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (opts.disabled) return;
      if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
        e.preventDefault();
        opts.onOpen((e.currentTarget as HTMLElement).getBoundingClientRect(), null);
      }
    },
  };
  return bind;
}

export function ReactionSummaryBtn({ summary, onClick, className = '' }: { summary: ReactionSummary; onClick: () => void; className?: string }) {
  if (!summary.total) return null;
  return (
    <button type="button" className={`react-sum ${className}`} onClick={onClick} data-testid="reaction-summary" aria-label={`${compact(summary.total)} ${summary.total === 1 ? 'reaction' : 'reactions'}. View who reacted.`}>
      <span className="react-sum-icons">
        {summary.top.map((t) => <span key={t} className="react-sum-ic" aria-hidden="true">{REACTION_META[t].emoji}</span>)}
      </span>
      <span className="react-sum-n">{compact(summary.total)}</span>
    </button>
  );
}

export function ReactorsSheet({ open, onClose, load }: { open: boolean; onClose: () => void; load: () => Promise<ReactorView[]> }) {
  const [rows, setRows] = useState<ReactorView[] | null>(null);
  const [tab, setTab] = useState<'all' | ReactionType>('all');
  useEffect(() => {
    if (!open) { setRows(null); setTab('all'); return; }
    let live = true;
    load().then((r) => { if (live) setRows(r); }).catch(() => { if (live) setRows([]); });
    return () => { live = false; };
  }, [open, load]);
  const counts = (rows || []).reduce((m, r) => { m[r.type] = (m[r.type] || 0) + 1; return m; }, {} as Partial<Record<ReactionType, number>>);
  const list = tab === 'all' ? (rows || []) : (rows || []).filter((r) => r.type === tab);
  return (
    <Sheet open={open} onClose={onClose} title="Reactions">
      <div className="react-sheet" data-testid="reactors-sheet">
        <div className="react-tabs" role="tablist" aria-label="Filter by reaction">
          <button type="button" role="tab" aria-selected={tab === 'all'} className={tab === 'all' ? 'on' : ''} onClick={() => setTab('all')}>All{rows ? ` ${rows.length}` : ''}</button>
          {REACTION_TYPES.filter((t) => counts[t]).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)} aria-label={`${REACTION_META[t].label}, ${counts[t]}`}>
              <span aria-hidden="true">{REACTION_META[t].emoji}</span> {counts[t]}
            </button>
          ))}
        </div>
        {!rows && <p className="muted small">Loading…</p>}
        {rows && !list.length && <p className="muted small">No reactions in this tab.</p>}
        {list.map((r) => (
          <Link key={r.user.id + r.type} to={`/social/profile?u=${encodeURIComponent(r.user.username)}`} className="react-who" onClick={onClose}>
            <MiniAv p={r.user} size={40} />
            <span className="react-who-n"><span className="react-who-name"><b>{r.user.displayName}</b>{r.user.sample && <span className="sample-tag" title="Sample person for the demo, not a real user">Sample</span>}</span><span className="muted small">@{r.user.username}</span></span>
            <span className="react-who-e" title={REACTION_META[r.type].label} aria-label={REACTION_META[r.type].label}>{REACTION_META[r.type].emoji}</span>
          </Link>
        ))}
      </div>
    </Sheet>
  );
}

export function ReactLabel({ type, onPress, onTap, children }: { type: ReactionType | null; onPress: (r: DOMRect, pointerId: number | null) => void; onTap: () => void; children?: ReactNode }) {
  const bind = usePressToReact({ onOpen: onPress, onTap });
  const m = type ? REACTION_META[type] : null;
  return (
    <button
      type="button"
      className={`react-action${type ? ' on' : ''}`}
      style={m ? { color: m.color } : undefined}
      aria-pressed={!!type}
      aria-label={m ? m.label : 'React'}
      data-testid="comment-react"
      {...bind}
    >
      {m ? <><span aria-hidden="true">{m.emoji}</span> {m.label}</> : (children ?? 'React')}
    </button>
  );
}
