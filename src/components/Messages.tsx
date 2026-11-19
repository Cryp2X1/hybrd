// Messages UI pieces: chat avatars, message bubbles (reactions, replies, media, workout cards, safe links), the report,
// forward and workout sheets, and the in-app notification banner. Pages live in src/pages/Messages.tsx.
import { memo, useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from './Icon';
import { Empty, Sheet } from './ui';
import { SAvatar, SampleTag, WorkoutCardView } from './Social';
import { ReactionSummaryBtn, usePressToReact } from './Reactions';
import { useMessages } from '../lib/messagesStore';
import { useStore } from '../lib/store';
import { useToast } from '../lib/toast';
import { activityLabel, fmtTime, hybridScore } from '../lib/calc';
import { REPORT_REASONS, REPORT_DETAILS_MAX, workoutCard, type PublicProfile, type ReportReason, type WorkoutCard } from '../lib/social';
import { clockTime, friendlyDmError, linkify, linkRisk, listTime, STATUS_LABEL, systemText, type Seg } from '../lib/messages';
import type { ConvView, MessageView } from '../lib/messagesApi';

// ---------- avatars ----------
export function ConvAvatar({ c, size = 52 }: { c: ConvView; size?: number }) {
  if (c.kind === 'group') {
    const two = c.others.slice(0, 2);
    return (
      <span className="dm-gav" style={{ width: size, height: size }} aria-hidden="true">
        {two.length === 0 ? <SAvatar p={{ displayName: c.title }} size={size} /> : two.map((m, i) => <span key={m.userId} className={`dm-gav-${i}`}><SAvatar p={m.profile} size={Math.round(size * 0.68)} /></span>)}
      </span>
    );
  }
  const o = c.others[0];
  return <span className="dm-av-wrap"><SAvatar p={o?.profile} size={size} />{c.presence === 'Active now' && <i className="dm-online" aria-label="Active now" />}</span>;
}
export const isSampleConv = (c: ConvView) => c.kind === 'direct' && !!c.others[0]?.profile.sample;

// ---------- safe links (no auto-fetched previews; risky links + stranger links ask first) ----------
export function LinkText({ text, careful }: { text: string; careful: boolean }) {
  const [ask, setAsk] = useState<Seg | null>(null);
  const segs = linkify(text);
  return (
    <>
      {segs.map((s, i) => s.t === 'text' ? <span key={i}>{s.v}</span> : (
        <a key={i} href={s.href} target="_blank" rel="noopener noreferrer nofollow ugc" className={`dm-link ${s.risky ? 'risky' : ''}`}
          onClick={(e) => { if (careful || s.risky) { e.preventDefault(); setAsk(s); } }} data-testid="dm-link">
          {s.risky && <span aria-label="Warning">⚠️ </span>}{s.v}
        </a>
      ))}
      {ask && <Sheet open onClose={() => setAsk(null)} title="Leaving HYBRD">
        <div data-testid="link-warning">
          <p>This link opens <b className="mono">{ask.domain}</b> outside HYBRD.</p>
          {(() => { const r = linkRisk(ask.href!); return r.risky ? <ul className="dm-risks">{r.reasons.map((x) => <li key={x}>⚠️ {x}</li>)}</ul> : null; })()}
          <p className="muted small">Only open links from people you trust. HYBRD will never ask for your password, a login code or money in a message.</p>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn ghost" onClick={() => setAsk(null)}>Cancel</button>
            <a className="btn y" href={ask.href} target="_blank" rel="noopener noreferrer nofollow ugc" onClick={() => setAsk(null)}>Open link</a>
          </div>
        </div>
      </Sheet>}
    </>
  );
}

// ---------- message bubble ----------
export interface BubbleProps {
  m: MessageView;
  group: boolean;
  first: boolean;
  last: boolean;
  showStatus: boolean;
  blurMedia: boolean;
  careful: boolean;
  nameOf: (id: string) => string;
  meId: string;
  onMenu: (m: MessageView, rect: DOMRect, pointerId: number | null) => void;
  onReactors: (m: MessageView) => void;
  onReplyJump: (id: string) => void;
  onRetry?: (m: MessageView) => void;
  onDiscard?: (m: MessageView) => void;
  onOpenMedia: (m: MessageView) => void;
  onLove?: (m: MessageView) => void;
}
function BubbleImpl(p: BubbleProps) {
  const { m } = p;
  const [reveal, setReveal] = useState(false);
  const bind = usePressToReact({ onOpen: (r, id) => p.onMenu(m, r, id), disabled: m.kind === 'system' || !!m.pending });
  if (m.kind === 'system') return <div className="dm-sys" data-testid="dm-system">{m.system ? systemText(m.system, p.nameOf, p.meId) : ''}</div>;
  const unsent = !!m.deletedAt;
  const blurred = p.blurMedia && !reveal && (m.kind === 'image' || m.kind === 'video');
  const media = !unsent && m.media && (m.kind === 'image' || m.kind === 'video');
  const onlyMedia = media && !m.body;
  return (
    <div className={`dm-row ${m.mine ? 'mine' : 'theirs'} ${p.first ? 'first' : ''} ${p.last ? 'last' : ''}`} id={`m-${m.id}`} data-testid="dm-msg">
      {!m.mine && p.group && <span className="dm-row-av">{p.last ? <SAvatar p={m.sender} size={28} /> : null}</span>}
      <div className="dm-col">
        {!m.mine && p.group && p.first && <div className="dm-sender">{m.sender.displayName}{m.sender.sample && <SampleTag />}</div>}
        {m.forwarded && !unsent && <div className="dm-fwd"><Icon name="forward" size={12} /> Forwarded</div>}
        {m.reply && !unsent && (
          <button className={`dm-quote ${m.mine ? 'mine' : ''}`} onClick={() => p.onReplyJump(m.reply!.id)} aria-label={`Reply to ${m.reply.senderName || 'message'}: ${m.reply.preview}`}>
            <span className="dm-quote-who">{m.mine ? (m.reply.mine ? 'You replied to yourself' : `You replied to ${m.reply.senderName}`) : `Replied to ${m.reply.mine ? 'you' : m.reply.senderName}`}</span>
            <span className="dm-quote-t">{m.reply.thumb && !p.blurMedia && <img src={m.reply.thumb} alt="" />}{m.reply.preview}</span>
          </button>
        )}
        <div
          className={`dm-bubble ${unsent ? 'unsent' : ''} ${onlyMedia ? 'media-only' : ''} ${m.kind === 'workout' ? 'workout' : ''} ${m.pending ? `pending ${m.pending}` : ''}`}
          tabIndex={0}
          role="group"
          aria-label={`${m.mine ? 'You' : m.sender.displayName}, ${clockTime(m.createdAt)}${m.editedAt ? ', edited' : ''}. Press and hold for reactions and options.`}
          onDoubleClick={() => !unsent && !m.pending && p.onLove?.(m)}
          {...bind}
        >
          {unsent ? <span className="dm-unsent"><Icon name="ban" size={14} /> {m.mine ? 'You unsent a message' : 'Message unsent'}</span> : (
            <>
              {media && (
                <div className={`dm-media ${blurred ? 'blur' : ''}`} style={{ aspectRatio: `${m.media!.w || 4} / ${m.media!.h || 5}` }}>
                  {m.kind === 'image' ? <img src={m.media!.url} alt="Photo" draggable={false} loading="lazy" onClick={() => !blurred && p.onOpenMedia(m)} />
                    : blurred ? <img src={m.media!.poster || ''} alt="" /> : <video src={m.media!.url} poster={m.media!.poster} controls playsInline preload="metadata" />}
                  {blurred && <button className="dm-reveal" onClick={(e) => { e.stopPropagation(); setReveal(true); }} data-testid="dm-reveal"><Icon name="eyeoff" size={18} /><span>Tap to view {m.kind === 'video' ? 'video' : 'photo'}</span></button>}
                </div>
              )}
              {m.kind === 'workout' && m.workout && <WorkoutCardView w={m.workout} compactView />}
              {m.body && <div className="dm-text"><LinkText text={m.body} careful={p.careful} /></div>}
            </>
          )}
        </div>
        {m.reactions.total > 0 && <ReactionSummaryBtn summary={m.reactions} onClick={() => p.onReactors(m)} className={`dm-rsum ${m.mine ? 'mine' : ''}`} />}
        {(p.last || m.editedAt || m.pending) && (
          <div className="dm-meta">
            {m.pending === 'failed' ? <span className="dm-failed" role="alert"><Icon name="info" size={12} /> {m.error || 'Not sent'} · <button onClick={() => p.onRetry?.(m)} data-testid="dm-retry">Retry</button> · <button onClick={() => p.onDiscard?.(m)}>Delete</button></span>
              : m.pending === 'sending' ? <span>Sending…</span>
              : <>{p.last && <span>{clockTime(m.createdAt)}</span>}{m.editedAt && !unsent && <span>Edited</span>}</>}
            {p.showStatus && m.status && !m.pending && <span className={`dm-status ${m.status}`} data-testid="dm-status">{m.status === 'seen' && p.group && m.seenBy?.length ? `Seen by ${m.seenBy.map(p.nameOf).map((n) => n.split(' ')[0]).join(', ')}` : STATUS_LABEL[m.status]}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
export const Bubble = memo(BubbleImpl);

// ---------- long-press menu (shown with the reaction bar) ----------
export interface MenuAction { k: string; label: string; icon: string; danger?: boolean; run: () => void }
export function MsgMenu({ anchor, actions, onClose }: { anchor: DOMRect; actions: MenuAction[]; onClose: () => void }) {
  const below = anchor.bottom + 8 + actions.length * 46 < window.innerHeight;
  const top = below ? Math.min(anchor.bottom + 8, window.innerHeight - 20) : Math.max(70, anchor.top - 8 - actions.length * 46 - 70);
  const left = Math.max(8, Math.min(anchor.left, window.innerWidth - 228));
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return createPortal(
    <div className="dm-menu" style={{ top: below ? top : undefined, bottom: below ? undefined : window.innerHeight - anchor.top + 72, left }} role="menu" aria-label="Message options" data-testid="dm-menu" onPointerDown={(e) => e.stopPropagation()}>
      {actions.map((a) => <button key={a.k} role="menuitem" className={a.danger ? 'danger' : ''} onClick={() => { a.run(); onClose(); }} data-testid={`dm-act-${a.k}`}><span>{a.label}</span><Icon name={a.icon} size={18} /></button>)}
    </div>,
    document.body,
  );
}

// ---------- report ----------
export function DmReportSheet({ target, onClose, onBlocked }: { target: { type: 'message' | 'conversation'; id: string; conversationId: string; who?: PublicProfile; groupTitle?: string; preview?: string }; onClose: () => void; onBlocked?: () => void }) {
  const { backend, refresh } = useMessages();
  const toast = useToast();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [block, setBlock] = useState(false);
  const [busy, setBusy] = useState(false);
  const what = target.type === 'message' ? 'message' : target.groupTitle ? 'group chat' : 'conversation';
  const send = async () => {
    if (!backend || !reason) return;
    setBusy(true);
    try {
      await backend.report({ targetType: target.type, targetId: target.id, conversationId: target.conversationId, reason, details: details.trim() || undefined });
      if (block && target.who) { await backend.block(target.who.id); onBlocked?.(); }
      await refresh();
      toast(block && target.who ? `Report sent and @${target.who.username} blocked` : 'Thanks. Your report was sent to the HYBRD team.');
      onClose();
    } catch (e) { toast(friendlyDmError(e)); } finally { setBusy(false); }
  };
  return (
    <Sheet open onClose={onClose} title={`Report ${what}`}>
      <div data-testid="dm-report-sheet">
        {target.preview && <blockquote className="dm-report-q">{target.preview}</blockquote>}
        <p className="muted small">Why are you reporting this {what}? {target.who ? `@${target.who.username} won’t know who reported it. ` : ''}The HYBRD team sees the reported {target.type === 'message' ? 'message' : 'recent messages'} so they can review it.</p>
        <div className="s-reasons" role="radiogroup" aria-label="Reason">
          {REPORT_REASONS.map((r) => (
            <button key={r.v} role="radio" aria-checked={reason === r.v} className={reason === r.v ? 'on' : ''} onClick={() => setReason(r.v)} data-testid={`dm-reason-${r.v}`}>
              <span className="s-radio" /><span><b>{r.label}</b><span className="muted small">{r.sub}</span></span>
            </button>
          ))}
        </div>
        <label className="field" style={{ marginTop: 12 }}><span>Details (optional)</span><textarea value={details} maxLength={REPORT_DETAILS_MAX} onChange={(e) => setDetails(e.target.value)} placeholder="Anything that helps the review" /></label>
        {target.who && <button className="toggle" style={{ width: '100%', textAlign: 'left' }} onClick={() => setBlock((b) => !b)} aria-pressed={block}><span><b>Also block @{target.who.username}</b><div className="muted small">They can’t message you or see you anywhere on HYBRD.</div></span><span className={`switch ${block ? 'on' : ''}`} /></button>}
        <button className="btn y block" style={{ marginTop: 12 }} disabled={!reason || busy} onClick={send} data-testid="dm-send-report">{busy ? 'Sending…' : 'Send report'}</button>
        <p className="muted small" style={{ marginTop: 10 }}>If someone is in immediate danger, call 911 or your local emergency services. <Link className="link" to="/social/rules">Community rules</Link></p>
      </div>
    </Sheet>
  );
}

// ---------- forward ----------
export function ForwardSheet({ m, onClose }: { m: MessageView; onClose: () => void }) {
  const { backend, inbox, refresh } = useMessages();
  const toast = useToast();
  const [sel, setSel] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const list = inbox.filter((c) => c.folder === 'chats' && !c.request && !c.blocked).slice(0, 30);
  const go = async () => {
    if (!backend || !sel.length) return;
    setBusy(true);
    try { await backend.forward(m.id, sel); await refresh(); toast(sel.length === 1 ? 'Forwarded' : `Forwarded to ${sel.length} chats`); onClose(); }
    catch (e) { toast(friendlyDmError(e)); } finally { setBusy(false); }
  };
  return (
    <Sheet open onClose={onClose} title="Forward to">
      <div className="dm-pick" data-testid="dm-forward-sheet">
        {!list.length && <Empty icon="chat" title="No chats yet">Start a conversation first.</Empty>}
        {list.map((c) => {
          const on = sel.includes(c.id);
          return <button key={c.id} className={`dm-pick-row ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => setSel((s) => (on ? s.filter((x) => x !== c.id) : [...s, c.id]))}>
            <ConvAvatar c={c} size={40} /><span className="dm-pick-n"><b>{c.title}</b>{isSampleConv(c) && <SampleTag />}</span><span className={`dm-check ${on ? 'on' : ''}`}>{on && <Icon name="check" size={14} />}</span>
          </button>;
        })}
        <button className="btn y block" disabled={!sel.length || busy} onClick={go} style={{ marginTop: 12 }} data-testid="dm-forward-send">{busy ? 'Sending…' : sel.length ? `Send to ${sel.length}` : 'Choose chats'}</button>
      </div>
    </Sheet>
  );
}

// ---------- share a workout ----------
export function WorkoutSheet({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (w: WorkoutCard) => void }) {
  const { data, profile } = useStore();
  const score = open ? hybridScore(data, profile).score : null;
  const list = data.workouts.filter((w) => !w.deleted && w.type !== 'rest').sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 25);
  return (
    <Sheet open={open} onClose={onClose} title="Share a workout">
      {!list.length ? <Empty icon="bolt" title="No workouts yet">Log or record a workout first. <Link className="link" to="/train/log">Log a workout →</Link></Empty> : (
        <div className="s-wpick">{list.map((w) => (
          <button key={w.id} onClick={() => onPick(workoutCard(w, activityLabel(w), score))} data-testid="dm-pick-workout">
            <span className="pill">{activityLabel(w)}</span><span className="s-wpick-t"><b>{w.title}</b><span className="muted small">{new Date(w.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · {fmtTime(w.durationSec)}{w.distanceM ? ` · ${(w.distanceM / 1000).toFixed(1)} km` : ''}</span></span><Icon name="plus" size={18} />
          </button>
        ))}</div>
      )}
    </Sheet>
  );
}

// ---------- in-app notification banner (push can be added later as another sink) ----------
export function DmBanner() {
  const { notice, dismissNotice } = useMessages();
  const nav = useNavigate();
  if (!notice) return null;
  return (
    <div className="dm-banner" role="status" aria-live="polite" data-testid="dm-banner">
      <button className="dm-banner-b" onClick={() => { dismissNotice(); nav(notice.url); }}>
        <span className="dm-banner-ic"><Icon name="chat" size={18} /></span>
        <span className="dm-banner-t"><b>{notice.title}</b><span>{notice.body}</span></span>
      </button>
      <button className="icon-btn sm" aria-label="Dismiss" onClick={dismissNotice}><Icon name="x" size={16} /></button>
    </div>
  );
}

/** Header link to the inbox with the unread badge. */
export function MessagesLink({ className = 'top-social top-dm', size = 20, children }: { className?: string; size?: number; children?: ReactNode }) {
  const { badge } = useMessages();
  return (
    <Link to="/messages" className={className} aria-label={`Messages${badge ? `, ${badge} unread` : ''}`} data-testid="top-messages">
      <Icon name="chat" size={size} />{children}{badge > 0 && <span className="s-badge" data-testid="dm-badge">{badge > 9 ? '9+' : badge}</span>}
    </Link>
  );
}
export const timeLabel = (t: number) => (t ? listTime(t) : '');
