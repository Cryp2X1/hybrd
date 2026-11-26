// Safety UI shared by every surface: one report sheet (profiles, posts, stories, comments, activities, media, chats,
// messages and calls), the confirmation with help resources, the "removed for violating guidelines" notice, appeals,
// and the screen shown after logging back in (time off, scheduled deletion, suspension).
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from './Icon';
import { Sheet } from './ui';
import { useSafety } from '../lib/safetyStore';
import { useMessages } from '../lib/messagesStore';
import { friendlyDmError } from '../lib/messages';
import { useToast } from '../lib/toast';
import {
  APPEAL_STATUS, APPEAL_TEXT, canAppeal, CRISIS_LINES, DECISION_LABEL, fmtDate, fmtShortDate, guidelineById, MAX_MESSAGES_PER_REPORT, REPORT_LIMITS, REPORT_REASONS,
  REPORT_STATUS, showChildSafetyHelp, showCrisisHelp, TARGET_LABEL, validateAppeal, daysUntil,
  type Decision, type ReportReason, type ReportStatus, type AppealStatus, type ReportTargetType,
} from '../lib/safety';
import { friendlySafetyError } from '../lib/safetyApi';

// ---------- report ----------
export interface ReportMsg { id: string; preview: string; who?: string }
export interface ReportSheetProps {
  targetType: ReportTargetType;
  targetId: string;
  /** "account", "post", … (defaults from the target type) */
  what?: string;
  /** @handle of the person being reported (never told who reported them) */
  handle?: string;
  preview?: string;
  /** Message reports: other recent messages the reporter can attach (the reported one is always included). */
  messages?: ReportMsg[];
  submit(r: { reason: ReportReason; details?: string; messageIds?: string[] }): Promise<void>;
  /** Offer "Also block" when set. */
  block?: () => Promise<void>;
  onClose(): void;
  onBlocked?(): void;
  testids?: { sheet?: string; send?: string; reason?: (v: string) => string };
}
export function SafetyReportSheet(p: ReportSheetProps) {
  const { backend, mode } = useSafety();
  const toast = useToast();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [block, setBlock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<string[]>([p.targetId]);
  const [done, setDone] = useState<{ reason: ReportReason; blocked: boolean } | null>(null);
  const what = p.what || TARGET_LABEL[p.targetType];
  const send = async () => {
    if (!reason) return;
    setBusy(true);
    try {
      const d = details.trim() || undefined;
      // Demo/local backends keep "My reports" on this device (and apply the same duplicate / rate limits as the
      // server, so they run first); live reports are stored and limited by the server.
      if (mode !== 'live') await backend?.logReport({ targetType: p.targetType, targetId: p.targetId, targetName: p.handle ? `@${p.handle}` : undefined, reason, details: d });
      await p.submit({ reason, details: d, messageIds: p.messages ? picked : undefined });
      let blocked = false;
      if (block && p.block) { await p.block(); blocked = true; p.onBlocked?.(); }
      setDone({ reason, blocked });
    } catch (e) { toast(friendlySafetyError(e)); } finally { setBusy(false); }
  };
  if (done) {
    return (
      <Sheet open onClose={p.onClose} title="Report sent">
        <div className="sf-done" data-testid="report-done">
          <div className="sf-done-ic"><Icon name="check" size={26} stroke={3} /></div>
          <h3>Thanks for letting us know</h3>
          <p className="muted">We’ll review this {what} against our <Link className="link" to="/safety/guidelines" onClick={p.onClose}>Community Guidelines</Link>.{p.handle ? ` @${p.handle} won’t be told who reported it.` : ''}{done.blocked && p.handle ? ` You blocked @${p.handle}.` : ''}</p>
          <div className="sf-status-row"><StatusChip tone="info">{REPORT_STATUS.open.label}</StatusChip><span className="muted small">Follow it in Settings › Safety › My reports</span></div>
          {showCrisisHelp(done.reason) && <CrisisHelp />}
          {showChildSafetyHelp(done.reason) && <ChildSafetyHelp />}
          <div className="sf-done-acts">
            <Link className="btn ghost" to="/settings/safety#reports" onClick={p.onClose} data-testid="report-done-status">See my reports</Link>
            <button className="btn y" onClick={p.onClose} data-testid="report-done-close">Done</button>
          </div>
        </div>
      </Sheet>
    );
  }
  const togglePick = (id: string) => setPicked((x) => (x.includes(id) ? (id === p.targetId ? x : x.filter((y) => y !== id)) : x.length >= MAX_MESSAGES_PER_REPORT ? x : [...x, id]));
  return (
    <Sheet open onClose={p.onClose} title={`Report ${what}`}>
      <div data-testid={p.testids?.sheet || 'report-sheet'} className="sf-report">
        {p.preview && <blockquote className="dm-report-q">{p.preview}</blockquote>}
        <p className="muted small">Why are you reporting this {what}?{p.handle ? ` @${p.handle} won’t know who reported it.` : ' Reports are anonymous.'}</p>
        <div className="s-reasons" role="radiogroup" aria-label="Reason">
          {REPORT_REASONS.map((r) => (
            <button key={r.v} role="radio" aria-checked={reason === r.v} className={reason === r.v ? 'on' : ''} onClick={() => setReason(r.v)} data-testid={p.testids?.reason ? p.testids.reason(r.v) : `reason-${r.v}`}>
              <span className="s-radio" /><span><b>{r.label}</b><span className="muted small">{r.sub}</span></span>
            </button>
          ))}
        </div>
        {reason === 'self_harm' && <p className="sf-inline-help small">If someone may be in danger right now, call or text <a className="link" href={CRISIS_LINES.call988}>988</a> (US) or your local emergency number.</p>}
        {p.messages && p.messages.length > 1 && (
          <div className="sf-pick" data-testid="report-pick">
            <div className="sf-sub">Messages to include <span className="muted small">({picked.length}/{MAX_MESSAGES_PER_REPORT})</span></div>
            {p.messages.map((m) => (
              <button key={m.id} className={`sf-pick-i ${picked.includes(m.id) ? 'on' : ''}`} aria-pressed={picked.includes(m.id)} onClick={() => togglePick(m.id)} disabled={m.id === p.targetId}>
                <span className="sf-check">{picked.includes(m.id) && <Icon name="check" size={14} stroke={3} />}</span>
                <span className="sf-pick-t">{m.who && <b>{m.who}: </b>}{m.preview}</span>
              </button>
            ))}
          </div>
        )}
        <label className="field" style={{ marginTop: 12 }}><span>Details (optional)</span><textarea value={details} maxLength={REPORT_LIMITS.detailsMax} onChange={(e) => setDetails(e.target.value)} placeholder="Anything that helps the review" /></label>
        {p.block && p.handle && <button className="toggle" style={{ width: '100%', textAlign: 'left' }} onClick={() => setBlock((b) => !b)} aria-pressed={block} data-testid="report-also-block"><span><b>Also block @{p.handle}</b><div className="muted small">You won’t see each other or be able to message anywhere on HYBRD.</div></span><span className={`switch ${block ? 'on' : ''}`} /></button>}
        <button className="btn y block" style={{ marginTop: 12 }} disabled={!reason || busy} onClick={send} data-testid={p.testids?.send || 'send-report'}>{busy ? 'Sending…' : 'Send report'}</button>
        <p className="muted small" style={{ marginTop: 10 }}>If someone is in immediate danger, call 911 or your local emergency services. <Link className="link" to="/safety/reporting" onClick={p.onClose}>How reporting works</Link></p>
      </div>
    </Sheet>
  );
}

export function CrisisHelp({ compact }: { compact?: boolean }) {
  return (
    <div className="sf-help" data-testid="crisis-help">
      <b>Worried about someone?</b>
      {!compact && <p className="small">If they might act on it soon, contact emergency services. In the US you can call or text 988 (Suicide &amp; Crisis Lifeline), free and 24/7, for yourself or to get advice about helping someone else.</p>}
      <div className="sf-help-btns">
        <a className="btn sm y" href={CRISIS_LINES.call988}>Call 988</a>
        <a className="btn sm ghost" href={CRISIS_LINES.text988}>Text 988</a>
        <a className="btn sm ghost" href={CRISIS_LINES.chat988} target="_blank" rel="noreferrer">Chat</a>
      </div>
      <p className="small muted">Outside the US: <a className="link" href={CRISIS_LINES.findHelpline} target="_blank" rel="noreferrer">findahelpline.com</a> · More in <Link className="link" to="/mind/help">Mind › Get help now</Link></p>
    </div>
  );
}
export function ChildSafetyHelp() {
  return (
    <div className="sf-help" data-testid="child-help">
      <b>If a child is in danger</b>
      <p className="small">Call 911 or local emergency services. In the US you can also report child sexual exploitation to NCMEC’s CyberTipline.</p>
      <div className="sf-help-btns">
        <a className="btn sm ghost" href={CRISIS_LINES.cyberTipline} target="_blank" rel="noreferrer">CyberTipline</a>
        <a className="btn sm ghost" href={CRISIS_LINES.cyberTiplinePhone}>1-800-843-5678</a>
      </div>
    </div>
  );
}

// ---------- chips ----------
export const StatusChip = ({ tone, children }: { tone: 'info' | 'warn' | 'ok' | 'mut' | 'bad'; children: ReactNode }) => <span className={`sf-chip ${tone}`}>{children}</span>;
export const ReportStatusChip = ({ s }: { s: ReportStatus }) => <StatusChip tone={REPORT_STATUS[s].tone}>{REPORT_STATUS[s].label}</StatusChip>;
export const AppealStatusChip = ({ s }: { s: AppealStatus }) => <StatusChip tone={APPEAL_STATUS[s].tone}>{APPEAL_STATUS[s].label}</StatusChip>;

// ---------- removed content (only the owner sees this) ----------
export function RemovedNotice({ d, what = 'post' }: { d: Decision; what?: string }) {
  const g = guidelineById(d.guideline);
  const [appeal, setAppeal] = useState(false);
  const can = canAppeal(d);
  return (
    <div className="sf-removed" data-testid="removed-notice" role="status">
      <div className="sf-removed-h"><Icon name="eyeoff" size={18} /><b>Your {what} was removed for violating our Community Guidelines</b></div>
      <p className="small">Guideline: <Link className="link" to={`/safety/guidelines#${g.id}`}>{g.title}</Link>. Only you can see it. {d.note ? <span>“{d.note}”</span> : null}</p>
      {d.sample && <p className="small muted">Demo: simulated on this device, no real moderator was involved.</p>}
      <div className="sf-removed-a">
        {d.appeal ? <AppealStatusChip s={d.appeal.status} /> : can.ok ? <button className="btn sm ghost" onClick={() => setAppeal(true)} data-testid="removed-appeal">Appeal</button> : <span className="muted small">{can.why}</span>}
        <Link className="link small" to="/settings/safety#status">Account status</Link>
      </div>
      {appeal && <AppealSheet d={d} onClose={() => setAppeal(false)} />}
    </div>
  );
}

// ---------- appeals ----------
export function AppealSheet({ d, onClose }: { d: Decision; onClose: () => void }) {
  const { backend, refresh } = useSafety();
  const toast = useToast();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const g = guidelineById(d.guideline);
  const can = canAppeal(d);
  const send = async () => {
    const bad = validateAppeal(text); if (bad) { toast(bad); return; }
    if (!backend) return;
    setBusy(true);
    try { await backend.appeal(d.id, text); await refresh(); toast('Appeal sent. We’ll show the result in Account status.'); onClose(); }
    catch (e) { toast(friendlySafetyError(e)); } finally { setBusy(false); }
  };
  return (
    <Sheet open onClose={onClose} title="Appeal this decision">
      <div data-testid="appeal-sheet">
        <div className="sf-dec-sum"><b>{DECISION_LABEL[d.kind]}</b><span className="muted small">{fmtShortDate(d.createdAt)} · {g.title}</span>{d.contentPreview && <blockquote className="dm-report-q">{d.contentPreview}</blockquote>}</div>
        <p className="muted small">Tell us why you think we got this wrong. You can appeal each decision once, within 30 days{can.ok ? ` (${can.daysLeft} day${can.daysLeft === 1 ? '' : 's'} left)` : ''}.</p>
        <label className="field"><span>Your appeal</span><textarea value={text} maxLength={APPEAL_TEXT.max} rows={5} onChange={(e) => setText(e.target.value)} placeholder="Add any context that helps us look again" data-testid="appeal-text" /></label>
        <div className="muted small" style={{ textAlign: 'right' }}>{text.trim().length}/{APPEAL_TEXT.max}</div>
        <button className="btn y block" style={{ marginTop: 10 }} disabled={busy || !can.ok || text.trim().length < APPEAL_TEXT.min} onClick={send} data-testid="appeal-send">{busy ? 'Sending…' : 'Send appeal'}</button>
      </div>
    </Sheet>
  );
}

// ---------- after logging back in ----------
export function AccountGate() {
  const { gateOpen, closeGate, effective, backend, refresh, mode } = useSafety();
  const toast = useToast();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (gateOpen) document.body.classList.add('sf-gate-on'); return () => document.body.classList.remove('sf-gate-on'); }, [gateOpen]);
  if (!gateOpen || !backend) return null;
  const k = effective.kind;
  const act = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true);
    try { await fn(); await refresh(); closeGate('active'); toast(ok); } catch (e) { toast(friendlySafetyError(e)); } finally { setBusy(false); }
  };
  const demoNote = mode !== 'live' && <p className="muted small sf-gate-demo">Preview on this device. With an account, this is what you see after signing in.</p>;
  let body: ReactNode;
  if (k === 'deletion_pending') {
    body = <>
      <div className="sf-gate-ic bad"><Icon name="trash" size={28} /></div>
      <h2>Your account is scheduled for deletion</h2>
      <p>Your account is scheduled for deletion on <b data-testid="gate-purge-date">{fmtDate(effective.purgeAt!)}</b>. Reopen account?</p>
      <p className="muted small">Until then nothing is gone. Reopen now and everything comes back as it was. After that date it’s deleted permanently and can’t be recovered.</p>
      <button className="btn y block" disabled={busy} onClick={() => act(() => backend.reopen(), 'Welcome back. Your account is open again.')} data-testid="gate-reopen">Reopen account</button>
      <button className="btn ghost block" onClick={() => closeGate()} data-testid="gate-keep">Keep it scheduled</button>
    </>;
  } else if (k === 'suspended') {
    const d = effective.decision!;
    body = <>
      <div className="sf-gate-ic bad"><Icon name="lock" size={28} /></div>
      <h2>Your account is suspended</h2>
      <p>{d.note || `It went against our guideline on ${guidelineById(d.guideline).title.toLowerCase()}.`}</p>
      <p className="muted small">Suspended until <b>{fmtDate(d.endsAt!)}</b>. Your data is kept, and your workouts on this device still work.</p>
      <button className="btn y block" onClick={() => { closeGate(); nav('/settings/safety#status'); }} data-testid="gate-appeal">{d.appeal ? 'See appeal status' : 'Appeal'}</button>
      <button className="btn ghost block" onClick={() => closeGate()}>Close</button>
    </>;
  } else {
    body = <>
      <div className="sf-gate-ic"><Icon name="sun" size={28} /></div>
      <h2>Welcome back, resume your account?</h2>
      <p>Your account is on a break{effective.until ? <> until <b>{fmtDate(effective.until)}</b></> : ''}. Your profile, posts and activities are hidden and people can’t message or call you.</p>
      <button className="btn y block" disabled={busy} onClick={() => act(() => backend.resume(), 'You’re back. Your profile is visible again.')} data-testid="gate-resume">Resume</button>
      <button className="btn ghost block" onClick={() => closeGate()} data-testid="gate-stay">Stay on a break</button>
    </>;
  }
  return (
    <div className="sf-gate" role="dialog" aria-modal="true" aria-label="Account status" data-testid="account-gate">
      <div className="sf-gate-card">{body}{demoNote}</div>
    </div>
  );
}

/** Small banner for Social / Messages while your account is away or limited. */
export function SafetyBanner() {
  const { effective, msgRestricted } = useSafety();
  if (effective.kind === 'paused') return <div className="banner warn sf-banner" data-testid="paused-banner"><Icon name="moon" size={18} /><div><b>You’re taking time off.</b> Your profile is hidden{effective.until ? ` until ${fmtShortDate(effective.until)}` : ''}. <Link to="/settings/account#time-off">Resume</Link></div></div>;
  if (effective.kind === 'deletion_pending') return <div className="banner warn sf-banner" data-testid="deletion-banner"><Icon name="trash" size={18} /><div><b>Scheduled for deletion on {fmtShortDate(effective.purgeAt!)}</b> ({daysUntil(effective.purgeAt!)} days). <Link to="/settings/account#delete">Reopen</Link></div></div>;
  if (effective.kind === 'suspended') return <div className="banner warn sf-banner" data-testid="suspended-banner"><Icon name="lock" size={18} /><div><b>Your account is suspended until {fmtShortDate(effective.until!)}.</b> <Link to="/settings/safety#status">Details and appeal</Link></div></div>;
  if (msgRestricted) return <div className="banner warn sf-banner" data-testid="restricted-banner"><Icon name="lock" size={18} /><div><b>Messaging is restricted until {fmtShortDate(msgRestricted.endsAt!)}.</b> <Link to="/settings/safety#status">Details and appeal</Link></div></div>;
  return null;
}
/** Can I post, comment, message or call right now? (The server checks too.) */
export function useCanInteract(kind: 'post' | 'message' = 'post'): { ok: boolean; why?: string } {
  const { effective, msgRestricted } = useSafety();
  if (effective.kind === 'paused') return { ok: false, why: 'Resume your account to do this.' };
  if (effective.kind === 'deletion_pending') return { ok: false, why: 'Reopen your account to do this.' };
  if (effective.kind === 'suspended') return { ok: false, why: 'Your account is suspended.' };
  if (kind === 'message' && msgRestricted) return { ok: false, why: 'Your messaging is restricted for now.' };
  return { ok: true };
}

// ---------- restrict (softer than block) ----------
export const RESTRICT_EXPLAIN = 'Their messages go to your Requests without a notification. They won’t see when you’ve read their messages or when you’re online, and they can’t call you. They aren’t told.';
export function useRestricted() {
  const { backend, refresh } = useMessages();
  const toast = useToast();
  const [ids, setIds] = useState<string[] | null>(null);
  const load = useCallback(async () => { if (!backend) { setIds([]); return; } try { setIds(await backend.restrictedIds()); } catch { setIds([]); } }, [backend]);
  useEffect(() => { load(); }, [load]);
  const toggle = async (p: { id: string; username: string }, confirmFirst = true) => {
    if (!backend) { toast('Set up Messages first.'); return; }
    const on = !(ids || []).includes(p.id);
    if (on && confirmFirst && !confirm(`Restrict @${p.username}?\n\n${RESTRICT_EXPLAIN}`)) return;
    try {
      if (on) await backend.restrict(p.id); else await backend.unrestrict(p.id);
      await load(); await refresh();
      toast(on ? `Restricted @${p.username}` : `Unrestricted @${p.username}`);
    } catch (e) { toast(friendlyDmError(e)); }
  };
  return { ids: ids || [], ready: ids !== null, isRestricted: (id: string) => (ids || []).includes(id), toggle, reload: load };
}
