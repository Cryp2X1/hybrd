// Safety pages: Settings › Safety (account status, my reports, who can message/call, restricted and blocked people),
// Take time off, Delete account (30 days to reopen), Community Guidelines, How reporting works and the moderator
// queue (/moderation — moderators only; the database checks profiles.is_moderator on every call).
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Page, Card, Banner, Empty } from '../components/ui';
import { Icon } from '../components/Icon';
import { AppealSheet, AppealStatusChip, CrisisHelp, ChildSafetyHelp, ReportStatusChip, RESTRICT_EXPLAIN, StatusChip, useRestricted } from '../components/Safety';
import { SAvatar, SampleTag } from '../components/Social';
import { useSafety } from '../lib/safetyStore';
import { useSocial } from '../lib/socialStore';
import { useMessages } from '../lib/messagesStore';
import { useAuth } from '../lib/auth';
import { useStore } from '../lib/store';
import { useToast } from '../lib/toast';
import { DM_WHO, friendlyDmError } from '../lib/messages';
import { CALL_WHO } from '../lib/calls';
import {
  APPEAL_STATUS, canAppeal, DECISION_LABEL, DELETE_REASONS, DELETION_GRACE_DAYS, GUIDELINES, guidelineById, guidelineForReason, MAX_SUSPEND_DAYS, PAUSE_OPTIONS, pauseUntilFor,
  PRIORITY_LABEL, reasonInfo, REPORT_STATUS, SUSPEND_DAY_OPTIONS, TARGET_LABEL, decisionActive, fmtDate, fmtShortDate, daysUntil, deletionDateOf, UNSEND_WINDOW_LABEL,
  type Decision, type GuidelineId, type PauseOption, type QueueAppeal, type QueueReport,
} from '../lib/safety';
import { friendlySafetyError, type ModAction, type ModQueue, type MyReport } from '../lib/safetyApi';
import type { PublicProfile } from '../lib/social';

const DemoNote = ({ children }: { children: ReactNode }) => <p className="sf-demo-note" role="note"><Icon name="info" size={14} /><span>{children}</span></p>;
const ago = (ms: number) => { const d = Math.floor((Date.now() - ms) / 60_000); return d < 1 ? 'just now' : d < 60 ? `${d} min ago` : d < 1440 ? `${Math.floor(d / 60)} h ago` : fmtShortDate(ms); };

// ======================================================================= Settings › Safety
export function SafetySettings() {
  const sf = useSafety();
  const social = useSocial();
  const { effective, status, mode } = sf;
  const decisions = status?.decisions || [];
  const [reports, setReports] = useState<MyReport[] | null>(null);
  useEffect(() => { let on = true; sf.backend?.myReports().then((r) => on && setReports(r)).catch(() => on && setReports([])); return () => { on = false; }; }, [sf.backend, status]);
  useEffect(() => { const h = window.location.hash.slice(1); if (h) window.setTimeout(() => document.getElementById(h)?.scrollIntoView({ block: 'start' }), 120); }, []);
  return (
    <Page title="Safety" kicker="Settings" back="/settings">
      <div className="sf-page" data-testid="safety-settings">
        {mode !== 'live' && <DemoNote>{social.mode === 'demo' ? 'Demo: reports, decisions and appeals here stay on this device. No real moderator is involved.' : 'Local mode: nothing here leaves this device. With an account, reports go to the HYBRD team.'}</DemoNote>}
        {sf.setupNeeded && <Banner tone="warn">The safety features need the latest database setup. Ask the app owner to run <b>supabase/schema.sql</b> (SETUP §15).</Banner>}

        <Card>
          <div className="card-head" id="status"><h3>Account status</h3>
            {effective.kind === 'active' && !sf.msgRestricted ? <StatusChip tone="ok">Active</StatusChip> : effective.kind === 'paused' ? <StatusChip tone="warn">On a break</StatusChip> : effective.kind === 'deletion_pending' ? <StatusChip tone="bad">Deleting</StatusChip> : effective.kind === 'suspended' ? <StatusChip tone="bad">Suspended</StatusChip> : <StatusChip tone="warn">Limited</StatusChip>}
          </div>
          <p className="muted small">Decisions the HYBRD team made about your account or content, and your appeals. You can appeal each decision once, within 30 days.</p>
          {effective.kind === 'paused' && <div className="sf-line"><Icon name="moon" size={16} /><span>You’re taking time off{effective.until ? ` until ${fmtShortDate(effective.until)}` : ''}. <Link className="link" to="/safety/time-off">Resume</Link></span></div>}
          {effective.kind === 'deletion_pending' && <div className="sf-line"><Icon name="trash" size={16} /><span>Scheduled for deletion on {fmtShortDate(effective.purgeAt!)}. <Link className="link" to="/safety/delete">Reopen</Link></span></div>}
          {decisions.length ? <div className="sf-decisions">{decisions.map((d) => <DecisionRow key={d.id} d={d} />)}</div>
            : <div className="sf-allclear" data-testid="status-clear"><Icon name="check" size={18} /><span>No actions on your account. Thanks for helping keep HYBRD a good place to train.</span></div>}
        </Card>

        <Card>
          <div className="card-head" id="reports"><h3>My reports</h3>{reports && reports.length > 0 && <span className="muted small">{reports.length}</span>}</div>
          <p className="muted small">The people you report aren’t told who reported them.</p>
          {reports === null ? <p className="muted small">Loading…</p> : reports.length ? (
            <div className="sf-reports" data-testid="my-reports">{reports.slice(0, 30).map((r) => (
              <div key={r.id} className="sf-report-row">
                <span className="set-ic dim"><Icon name="flag" size={16} /></span>
                <span className="sf-rr-t"><b>{reasonInfo(r.reason).label}</b><span className="muted small">{TARGET_LABEL[r.targetType]}{r.targetName ? ` · ${r.targetName}` : ''} · {ago(r.createdAt)}</span><span className="muted small">{REPORT_STATUS[r.status].sub}</span></span>
                <ReportStatusChip s={r.status} />
              </div>
            ))}</div>
          ) : <p className="muted small" data-testid="my-reports-empty">You haven’t reported anything. To report, open the ⋯ menu on a profile, post, story, comment, message or call.</p>}
        </Card>

        <MessagingCard />
        <RestrictedCard />

        <Card>
          <div className="card-head" id="blocked"><h3>Blocked accounts</h3></div>
          <Link className="srow plain" to="/social/friends?tab=blocked"><span className="set-ic dim"><Icon name="ban" size={18} /></span><span className="set-t"><b>Manage blocked accounts</b><span>Blocked people can’t find you, see your profile or posts, message or call you.</span></span><Icon name="chevron" size={16} /></Link>
        </Card>

        <Card>
          <div className="card-head"><h3>Rules & help</h3></div>
          <Link className="srow plain" to="/safety/guidelines"><span className="set-ic dim"><Icon name="book" size={18} /></span><span className="set-t"><b>Community Guidelines</b><span>What’s allowed on HYBRD</span></span><Icon name="chevron" size={16} /></Link>
          <Link className="srow plain" to="/safety/reporting"><span className="set-ic dim"><Icon name="flag" size={18} /></span><span className="set-t"><b>How reporting works</b><span>What happens after you report, appeals, restrict vs block</span></span><Icon name="chevron" size={16} /></Link>
          <Link className="srow plain" to="/mind/help"><span className="set-ic dim"><Icon name="heart" size={18} /></span><span className="set-t"><b>Get help now</b><span>Crisis lines, including 988 in the US</span></span><Icon name="chevron" size={16} /></Link>
          {sf.isModerator && <Link className="srow plain" to="/moderation" data-testid="mod-link"><span className="set-ic"><Icon name="shield" size={18} /></span><span className="set-t"><b>Moderation queue</b><span>Moderators only</span></span><Icon name="chevron" size={16} /></Link>}
        </Card>

        {mode !== 'live' && <DemoTools />}
      </div>
    </Page>
  );
}

function DecisionRow({ d }: { d: Decision }) {
  const [appeal, setAppeal] = useState(false);
  const g = guidelineById(d.guideline);
  const can = canAppeal(d);
  const active = decisionActive(d);
  return (
    <div className={`sf-dec ${active ? '' : 'past'}`} data-testid="decision-row">
      <div className="sf-dec-h">
        <span className={`sf-dec-ic ${d.kind}`}><Icon name={d.kind === 'remove_content' ? 'eyeoff' : d.kind === 'suspend' ? 'lock' : 'chat'} size={16} /></span>
        <span className="sf-dec-t"><b>{DECISION_LABEL[d.kind]}{d.sample && <span className="sample-tag" title="Simulated on this device">Demo</span>}</b>
          <span className="muted small">{fmtShortDate(d.createdAt)} · <Link className="link" to={`/safety/guidelines#${g.id}`}>{g.title}</Link>{d.endsAt ? ` · ${d.endsAt > Date.now() ? 'until' : 'ended'} ${fmtShortDate(d.endsAt)}` : ''}</span></span>
        {d.reversedAt ? <StatusChip tone="ok">Reversed</StatusChip> : active ? <StatusChip tone="warn">Active</StatusChip> : <StatusChip tone="mut">Ended</StatusChip>}
      </div>
      {d.note && <p className="small sf-dec-note">{d.note}</p>}
      {d.contentPreview && <blockquote className="dm-report-q">{d.contentPreview}</blockquote>}
      <div className="sf-dec-a">
        {d.appeal ? <div className="sf-appeal-st" data-testid="appeal-status"><span className="muted small">Your appeal · {fmtShortDate(d.appeal.createdAt)}</span><AppealStatusChip s={d.appeal.status} /><span className="muted small sf-full">{APPEAL_STATUS[d.appeal.status].sub}{d.appeal.note ? ` “${d.appeal.note}”` : ''}</span></div>
          : can.ok ? <><button className="btn sm ghost" onClick={() => setAppeal(true)} data-testid="decision-appeal">Appeal</button><span className="muted small">{can.daysLeft} day{can.daysLeft === 1 ? '' : 's'} left to appeal</span></>
          : <span className="muted small">{can.why}</span>}
      </div>
      {appeal && <AppealSheet d={d} onClose={() => setAppeal(false)} />}
    </div>
  );
}

function MessagingCard() {
  const { backend, settings, saveSettings } = useMessages();
  const { me } = useSocial();
  const toast = useToast();
  const save = async (p: Partial<typeof settings>) => { try { await saveSettings({ ...settings, ...p }); toast('Saved'); } catch (e) { toast(friendlyDmError(e)); } };
  return (
    <Card>
      <div className="card-head" id="messaging"><h3>Who can message & call you</h3></div>
      {!backend ? <p className="muted small">Set up your public profile in <Link className="link" to="/social">Social</Link> to choose who can message or call you.</p> : <>
        {me?.isMinor && <p className="muted small"><Icon name="lock" size={13} /> You’re under 18: adults you’re not friends with can never message or call you, whatever you choose.</p>}
        <div className="sf-sub">Messages</div>
        <div className="sf-seg" role="radiogroup" aria-label="Who can message you" data-testid="safety-dm-who">
          {DM_WHO.map((w) => <button key={w.v} role="radio" aria-checked={settings.who === w.v} className={settings.who === w.v ? 'on' : ''} onClick={() => save({ who: w.v })} data-testid={`sf-who-${w.v}`}>{w.label}</button>)}
        </div>
        <p className="muted small">{DM_WHO.find((w) => w.v === settings.who)?.sub} People who can’t message you directly can’t send requests either.</p>
        <div className="sf-sub">Calls</div>
        <div className="sf-seg" role="radiogroup" aria-label="Who can call you" data-testid="safety-call-who">
          {CALL_WHO.map((w) => { const off = !!me?.isMinor && w.v === 'everyone'; return <button key={w.v} role="radio" disabled={off} aria-checked={settings.calls === w.v} className={settings.calls === w.v ? 'on' : ''} onClick={() => save({ calls: w.v })} data-testid={`sf-call-${w.v}`}>{w.label}</button>; })}
        </div>
        <p className="muted small">Message requests and blocked or restricted people can never call you. “Unsend for everyone” works for {UNSEND_WINDOW_LABEL}; after that you can still delete a message for you.</p>
        <Link className="link small" to="/settings/messages">Read receipts, activity status, Do not disturb →</Link>
      </>}
    </Card>
  );
}

function RestrictedCard() {
  const r = useRestricted();
  const { inbox } = useMessages();
  const { graph } = useSocial();
  const people = useMemo(() => {
    const m = new Map<string, PublicProfile>();
    for (const c of inbox) for (const o of c.others) m.set(o.userId, o.profile);
    for (const f of graph?.friends || []) m.set(f.id, f);
    return m;
  }, [inbox, graph]);
  return (
    <Card>
      <div className="card-head" id="restricted"><h3>Restricted accounts</h3>{r.ids.length > 0 && <span className="muted small">{r.ids.length}</span>}</div>
      <p className="muted small">Softer than blocking. {RESTRICT_EXPLAIN} Restrict someone from their profile or a chat’s details.</p>
      {r.ids.length ? <div data-testid="restricted-list">{r.ids.map((id) => { const p = people.get(id); return (
        <div key={id} className="sf-person"><SAvatar p={p} size={36} /><span className="sf-rr-t"><b>{p?.displayName || 'HYBRD user'}{p?.sample && <SampleTag />}</b><span className="muted small">@{p?.username || 'hybrd.user'}</span></span>
          <button className="btn sm ghost" onClick={() => r.toggle({ id, username: p?.username || 'hybrd.user' })} data-testid="unrestrict">Unrestrict</button></div>
      ); })}</div> : <p className="muted small" data-testid="restricted-empty">You haven’t restricted anyone.</p>}
    </Card>
  );
}

function DemoTools() {
  const sf = useSafety();
  const social = useSocial();
  const toast = useToast();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>, ok: string) => { setBusy(true); try { await fn(); await sf.refresh(); toast(ok); } catch (e) { toast(friendlySafetyError(e)); } finally { setBusy(false); } };
  const removeLatest = () => run(async () => {
    if (!social.backend || !social.me) throw new Error('Try the Social demo first (Social › Explore the demo), then come back.');
    let p = (await social.backend.userPosts(social.me.id))[0];
    if (!p) { await social.backend.createPost({ text: 'Demo post: 10 × 400 m on the track 🏃', images: [], audience: 'friends' }); p = (await social.backend.userPosts(social.me.id))[0]; }
    await sf.backend!.simulateDecision!({ kind: 'remove_content', guideline: 'spam', contentType: 'post', contentId: p.id, contentPreview: p.text, note: 'Demo: pretend this post broke the spam rule.' });
  }, 'Simulated: your latest post was removed. Open your profile to see the notice.');
  return (
    <Card>
      <div className="card-head"><h3>Try it (demo)</h3><span className="sample-tag">Demo</span></div>
      <p className="muted small">See how notices, appeals and the moderator side work. These are simulations on this device; nothing is sent.</p>
      <div className="sf-demo-btns">
        <button className="btn sm" disabled={busy || !sf.backend?.simulateDecision} onClick={removeLatest} data-testid="sim-remove">Simulate a moderator removing my latest post</button>
        <button className="btn sm" disabled={busy} onClick={() => run(() => sf.backend!.simulateDecision!({ kind: 'restrict_messaging', guideline: 'respect', days: 7, note: 'Demo: pretend some messages broke the respect rule.' }), 'Simulated: messaging restricted for 7 days')} data-testid="sim-restrict">Simulate a 7-day messaging restriction</button>
        <button className="btn sm" disabled={busy} onClick={() => sf.previewLogin()} data-testid="sim-login">Preview logging back in</button>
        <button className="btn sm" onClick={() => nav('/moderation')} data-testid="sim-queue">Open the demo moderation queue</button>
        <button className="btn sm ghost" disabled={busy} onClick={() => { if (confirm('Reset the safety demo? Simulated decisions, appeals, reports and account changes on this device are cleared.')) run(() => sf.backend!.resetDemo!(), 'Safety demo reset'); }}>Reset safety demo</button>
      </div>
    </Card>
  );
}

// ======================================================================= Settings › Account cards
export function AccountSafetyCards() {
  const { effective, mode } = useSafety();
  return (
    <div className="sf-acct" data-testid="account-safety">
      <Card>
        <div className="card-head" id="time-off"><h3>Take time off</h3>{effective.kind === 'paused' && <StatusChip tone="warn">On a break</StatusChip>}</div>
        <p className="muted small">Pause your account: your profile, posts and activities are hidden, nobody can message or call you, and notifications stop. Everything is kept. Your training log keeps working.</p>
        <Link className="btn" to="/safety/time-off" data-testid="open-time-off"><Icon name="moon" size={17} />{effective.kind === 'paused' ? 'Manage time off' : 'I need time off'}</Link>
      </Card>
      <Card>
        <div className="card-head" id="delete"><h3>Delete account</h3>{effective.kind === 'deletion_pending' && <StatusChip tone="bad">{daysUntil(effective.purgeAt!)} days left</StatusChip>}</div>
        <p className="muted small">Deactivates your account right away and deletes it permanently after {DELETION_GRACE_DAYS} days. Change your mind? Sign in within {DELETION_GRACE_DAYS} days and reopen it.{mode !== 'live' ? ' (Without an account this is a preview; to erase this device’s data use Data & storage › Delete everything.)' : ''}</p>
        <Link className="btn danger-ghost" to="/safety/delete" data-testid="open-delete"><Icon name="trash" size={17} />{effective.kind === 'deletion_pending' ? 'Reopen or review' : 'Delete account'}</Link>
      </Card>
    </div>
  );
}

// ======================================================================= Take time off
export function TimeOffPage() {
  const { backend, effective, refresh, closeGate, mode } = useSafety();
  const toast = useToast();
  const nav = useNavigate();
  const [opt, setOpt] = useState<PauseOption>('week');
  const [day, setDay] = useState('');
  const [busy, setBusy] = useState(false);
  const minDay = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const go = async () => {
    if (!backend) return;
    let until: number | null;
    try { until = pauseUntilFor(opt, Date.now(), day); } catch (e) { toast((e as Error).message); return; }
    setBusy(true);
    try { await backend.pause(until); await refresh(); closeGate('paused'); toast(until ? `Paused until ${fmtShortDate(until)}` : 'Paused until you come back'); nav('/settings/account#time-off'); }
    catch (e) { toast(friendlySafetyError(e)); } finally { setBusy(false); }
  };
  const resume = async () => { if (!backend) return; setBusy(true); try { await backend.resume(); await refresh(); closeGate('active'); toast('Welcome back. Your profile is visible again.'); } catch (e) { toast(friendlySafetyError(e)); } finally { setBusy(false); } };
  return (
    <Page title="Take time off" kicker="Account" back="/settings/account">
      <div className="sf-page sf-narrow" data-testid="time-off">
        {mode !== 'live' && <DemoNote>Preview on this device. With an account, your profile is hidden from everyone until you come back.</DemoNote>}
        {effective.kind === 'deletion_pending' ? <Banner tone="warn">Your account is scheduled for deletion. <Link to="/safety/delete">Reopen it</Link> first.</Banner>
        : effective.kind === 'paused' ? (
          <Card>
            <div className="sf-hero"><span className="sf-hero-ic"><Icon name="moon" size={26} /></span><h2>You’re taking time off</h2><p className="muted">{effective.until ? <>Your account comes back on its own on <b>{fmtDate(effective.until)}</b>.</> : 'Your account stays paused until you resume it.'}</p></div>
            <button className="btn y block" disabled={busy} onClick={resume} data-testid="resume-now">Resume now</button>
          </Card>
        ) : <>
          <Card>
            <h3>How long?</h3>
            <div className="s-reasons" role="radiogroup" aria-label="How long">
              {PAUSE_OPTIONS.map((o) => (
                <button key={o.v} role="radio" aria-checked={opt === o.v} className={opt === o.v ? 'on' : ''} onClick={() => setOpt(o.v)} data-testid={`pause-${o.v}`}>
                  <span className="s-radio" /><span><b>{o.label}</b><span className="muted small">{o.sub}</span></span>
                </button>
              ))}
            </div>
            {opt === 'custom' && <label className="field" style={{ marginTop: 10 }}><span>Come back on</span><input type="date" min={minDay} value={day} onChange={(e) => setDay(e.target.value)} data-testid="pause-date" /></label>}
          </Card>
          <Card>
            <h3>While you’re away</h3>
            <ul className="sf-list">
              <li><Icon name="eyeoff" size={16} /><span>Your profile, posts, stories, comments and shared activities are hidden.</span></li>
              <li><Icon name="chat" size={16} /><span>Nobody can message or call you, and you won’t show as online.</span></li>
              <li><Icon name="bell" size={16} /><span>Notifications stop.</span></li>
              <li><Icon name="lock" size={16} /><span>Nothing is deleted. Friends, chats and posts are all there when you’re back.</span></li>
              <li><Icon name="train" size={16} /><span>Your own training log, plans and recording keep working.</span></li>
            </ul>
          </Card>
          <button className="btn y block big" disabled={busy || (opt === 'custom' && !day)} onClick={go} data-testid="pause-start">{busy ? 'Pausing…' : 'Pause my account'}</button>
          <p className="muted small" style={{ textAlign: 'center' }}>When you open HYBRD again you’ll be asked if you want to resume.</p>
        </>}
      </div>
    </Page>
  );
}

// ======================================================================= Delete account
export function DeleteAccountPage() {
  const { backend, effective, refresh, closeGate, mode } = useSafety();
  const auth = useAuth();
  const st = useStore();
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [pw, setPw] = useState('');
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const live = mode === 'live';
  const purgeOn = deletionDateOf(Date.now());
  const download = () => {
    const blob = new Blob([JSON.stringify(st.exportJson(), null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `hybrd-export-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    toast('Download started');
  };
  const del = async () => {
    if (!backend) return;
    setErr(''); setBusy(true);
    try { const at = await backend.requestDeletion({ password: live ? pw : undefined, reason: reason || undefined }); await refresh(); closeGate('deletion_pending'); setPw(''); toast(`Scheduled for deletion on ${fmtShortDate(at)}`); }
    catch (e) { setErr(friendlySafetyError(e)); } finally { setBusy(false); }
  };
  const reopen = async () => { if (!backend) return; setBusy(true); try { await backend.reopen(); await refresh(); closeGate('active'); toast('Your account is open again.'); } catch (e) { toast(friendlySafetyError(e)); } finally { setBusy(false); } };
  return (
    <Page title="Delete account" kicker="Account" back="/settings/account">
      <div className="sf-page sf-narrow" data-testid="delete-account">
        {!live && <DemoNote>Preview on this device: nothing is deleted. {auth.configured ? 'Sign in to delete a real account.' : 'To erase this device’s data, use Settings › Data & storage › Delete everything.'}</DemoNote>}
        {effective.kind === 'deletion_pending' ? (
          <Card>
            <div className="sf-hero"><span className="sf-hero-ic bad"><Icon name="trash" size={26} /></span><h2>Scheduled for deletion</h2>
              <p>Your account will be deleted permanently on <b data-testid="delete-date">{fmtDate(effective.purgeAt!)}</b> ({daysUntil(effective.purgeAt!)} days).</p>
              <p className="muted small">It’s already hidden from everyone. Reopen before then and everything comes back as it was.</p></div>
            <button className="btn y block" disabled={busy} onClick={reopen} data-testid="reopen-now">Reopen account</button>
          </Card>
        ) : <>
          <Card>
            <h3>What happens</h3>
            <ul className="sf-list">
              <li><Icon name="eyeoff" size={16} /><span><b>Right away:</b> your account is deactivated. Your profile, posts, stories, comments, shared activities and messages are hidden.</span></li>
              <li><Icon name="calendar" size={16} /><span><b>For {DELETION_GRACE_DAYS} days:</b> sign in and tap Reopen to get everything back.</span></li>
              <li><Icon name="trash" size={16} /><span><b>On {fmtShortDate(purgeOn)}:</b> your account, training data, posts, messages you sent and uploaded photos and videos are deleted permanently. This can’t be undone.</span></li>
            </ul>
            <p className="muted small">Want a break instead? <Link className="link" to="/safety/time-off">Take time off</Link> hides your account without deleting anything.</p>
          </Card>
          <Card>
            <h3>Download your data first</h3>
            <p className="muted small">A JSON copy of your workouts, meals, plans and settings on this device.</p>
            <button className="btn" onClick={download} data-testid="delete-download"><Icon name="download" size={17} />Download my data</button>
          </Card>
          <Card>
            <h3>Why are you leaving? <span className="muted small">(optional)</span></h3>
            <div className="sf-chips">{DELETE_REASONS.map((r) => <button key={r} className={`chip ${reason === r ? 'on' : ''}`} aria-pressed={reason === r} onClick={() => setReason(reason === r ? '' : r)}>{r}</button>)}</div>
          </Card>
          <Card>
            <h3>Confirm</h3>
            {live ? <label className="field"><span>Enter your password</span><input type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} data-testid="delete-password" /></label>
              : <label className="field"><span>Type DELETE to confirm</span><input value={typed} onChange={(e) => setTyped(e.target.value)} autoCapitalize="characters" data-testid="delete-type" /></label>}
            {err && <div className="form-err" role="alert">{err}</div>}
            <button className="btn danger block" disabled={busy || (live ? pw.length < 6 : typed.trim().toUpperCase() !== 'DELETE')} onClick={del} data-testid="delete-confirm">{busy ? 'Working…' : 'Delete my account'}</button>
            <p className="muted small" style={{ marginTop: 8 }}>You’ll be able to reopen it until {fmtDate(purgeOn)}.</p>
          </Card>
        </>}
      </div>
    </Page>
  );
}

// ======================================================================= Community Guidelines
export function GuidelinesPage() {
  useEffect(() => { const h = window.location.hash.slice(1); if (h) window.setTimeout(() => document.getElementById(`g-${h}`)?.scrollIntoView({ block: 'start' }), 120); }, []);
  return (
    <Page title="Community Guidelines" kicker="Safety" back wide>
      <div className="s-narrow s-rules sf-guides" data-testid="guidelines">
        <Card>
          <p>HYBRD is for training, sharing progress and pushing each other. These guidelines cover everything people can see or receive on HYBRD: profiles, posts, stories, comments, shared activities, messages and calls.</p>
          <p className="muted small">You must be 13 or older to use Friends & Stories. Under-18 accounts are friends-only and can’t be messaged or called by adults they’re not friends with.</p>
        </Card>
        {GUIDELINES.map((g, i) => (
          <Card key={g.id}>
            <h3 id={`g-${g.id}`}>{i + 1}. {g.title}</h3>
            <p>{g.short}</p>
            <ul className="sf-points">{g.points.map((pt) => <li key={pt}>{pt}</li>)}</ul>
          </Card>
        ))}
        <Card>
          <h3>When something breaks these guidelines</h3>
          <p>Depending on how serious it is and whether it’s happened before, the HYBRD team may remove the content, restrict messaging for a while, or suspend the account. You’ll see what we did and which guideline it was about in Settings › Safety › Account status, and you can appeal once within 30 days.</p>
          <p className="muted small">If someone is in immediate danger, call 911 or your local emergency number. <Link className="link" to="/safety/reporting">How reporting works</Link></p>
        </Card>
      </div>
    </Page>
  );
}

// ======================================================================= How reporting works
export function ReportingPage() {
  return (
    <Page title="How reporting works" kicker="Safety" back wide>
      <div className="s-narrow s-rules sf-guides" data-testid="how-reporting">
        <Card>
          <h3>What you can report</h3>
          <p>Accounts, posts, photos and videos, stories, comments, shared activities, messages, chats and calls. Open the ⋯ menu (or the info button in a call) and choose Report.</p>
          <h3>What we ask</h3>
          <p>Pick the closest reason and add details if you like. When you report a message you can attach up to 10 messages from that person so the context is clear.</p>
          <h3>It’s anonymous</h3>
          <p>The person you report isn’t told who reported them. You can also block them in the same step.</p>
        </Card>
        <Card>
          <h3>What happens next</h3>
          <ul className="sf-points">
            <li><b>{REPORT_STATUS.open.label}</b>: your report is in the queue.</li>
            <li><b>{REPORT_STATUS.reviewing.label}</b>: someone on the HYBRD team is looking at it.</li>
            <li><b>{REPORT_STATUS.actioned.label}</b>: it broke our guidelines and we acted (for example removed the content or limited the account).</li>
            <li><b>{REPORT_STATUS.dismissed.label}</b>: we didn’t find a violation. You can still block or restrict them.</li>
          </ul>
          <p className="muted small">Follow your reports in Settings › Safety › My reports. Reports about a child’s safety or self-harm are put at the top of the queue. We can’t promise a review time.</p>
        </Card>
        <Card>
          <h3>Block, restrict or report?</h3>
          <ul className="sf-points">
            <li><b>Restrict</b>: quiet and reversible. Their messages wait in Requests without a notification; they can’t see when you’ve read them or when you’re online, and can’t call you.</li>
            <li><b>Block</b>: you won’t see each other anywhere on HYBRD and they can’t contact you.</li>
            <li><b>Report</b>: tells the HYBRD team so we can check it against the guidelines. Reporting doesn’t block anyone by itself.</li>
          </ul>
        </Card>
        <Card>
          <h3>If a decision is about you</h3>
          <p>You’ll see what was removed or limited, which guideline it was about, and when a limit ends, in Settings › Safety › Account status. You can appeal each decision once, within 30 days. If we reverse it, the content or account is restored.</p>
        </Card>
        <Card>
          <h3>Urgent help</h3>
          <p className="small">Reports aren’t monitored around the clock. If someone is in immediate danger, call 911 or your local emergency number.</p>
          <CrisisHelp compact />
          <ChildSafetyHelp />
        </Card>
      </div>
    </Page>
  );
}

// ======================================================================= Moderation queue
export function ModerationPage() {
  const sf = useSafety();
  const toast = useToast();
  const [q, setQ] = useState<ModQueue | null>(null);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState<'reports' | 'appeals'>('reports');
  const demo = sf.mode !== 'live';
  const allowed = demo || sf.isModerator;
  const load = async () => {
    if (!sf.backend || !allowed) return;
    try { setQ(await sf.backend.modQueue()); setErr(''); } catch (e) { setErr(friendlySafetyError(e)); }
  };
  useEffect(() => { load(); }, [sf.backend, allowed]); // eslint-disable-line react-hooks/exhaustive-deps
  if (sf.mode === 'loading' || (!demo && !sf.status)) return <Page title="Moderation" back="/settings/safety"><p className="muted">Loading…</p></Page>;
  if (!allowed) return (
    <Page title="Moderation" back="/settings/safety">
      <Card><Empty icon="lock" title="Moderators only">This page is for the HYBRD moderation team. Access is checked by the server.</Empty></Card>
    </Page>
  );
  const act = async (fn: () => Promise<void>, ok: string) => { try { await fn(); toast(ok); await load(); await sf.refresh(); } catch (e) { toast(friendlySafetyError(e)); } };
  const reports = q?.reports || [];
  const appeals = q?.appeals || [];
  return (
    <Page title="Moderation queue" kicker={demo ? 'Demo' : 'Moderators'} back="/settings/safety" wide>
      <div className="sf-mod" data-testid="mod-queue">
        {demo && <DemoNote>Demo queue on this device: SAMPLE reports about made-up accounts, plus the reports and appeals you made in the demo. Live, this page needs <b>is_moderator</b> on your profile and every action is logged.</DemoNote>}
        {err && <Banner tone="warn">{err}</Banner>}
        <div className="sf-tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'reports'} className={tab === 'reports' ? 'on' : ''} onClick={() => setTab('reports')} data-testid="mod-tab-reports">Reports <span className="sf-count">{reports.length}</span></button>
          <button role="tab" aria-selected={tab === 'appeals'} className={tab === 'appeals' ? 'on' : ''} onClick={() => setTab('appeals')} data-testid="mod-tab-appeals">Appeals <span className="sf-count">{appeals.length}</span></button>
        </div>
        {!q ? <p className="muted">Loading…</p> : tab === 'reports'
          ? (reports.length ? reports.slice().sort((a, b) => a.priority - b.priority || a.createdAt - b.createdAt).map((r) => <ReportItem key={`${r.store}:${r.id}`} r={r} onAct={(a, ok) => act(() => sf.backend!.modAct(a), ok)} />) : <Card><Empty icon="check" title="Queue is clear">No open reports.</Empty></Card>)
          : (appeals.length ? appeals.map((a) => <AppealItem key={a.id} a={a} onDecide={(s, note) => act(() => sf.backend!.modDecideAppeal(a.id, s, note), s === 'reversed' ? 'Reversed and restored' : s === 'upheld' ? 'Upheld' : 'Marked under review')} />) : <Card><Empty icon="check" title="No open appeals" /></Card>)}
      </div>
    </Page>
  );
}

function snapText(s: unknown): string | null {
  if (!s || typeof s !== 'object') return null;
  const o = s as Record<string, unknown>;
  if (Array.isArray(o.messages)) return (o.messages as { body?: string }[]).map((m) => m.body || '[media]').join('\n');
  if (typeof o.body === 'string') return o.body;
  if (typeof o.text === 'string') return o.text;
  if (typeof o.title === 'string') return o.title;
  return null;
}
function ReportItem({ r, onAct }: { r: QueueReport; onAct: (a: { store: 'social' | 'messages'; reportId: string; action: ModAction; guideline?: GuidelineId; note?: string; days?: number }, ok: string) => void }) {
  const [g, setG] = useState<GuidelineId>(guidelineForReason(r.reason).id);
  const [note, setNote] = useState('');
  const [days, setDays] = useState<number>(7);
  const content = r.targetType !== 'user' && r.targetType !== 'conversation' && r.targetType !== 'call';
  const text = snapText(r.snapshot);
  const base = { store: r.store, reportId: r.id, guideline: g, note: note.trim() || undefined };
  return (
    <Card className={`sf-qi p${r.priority}`}>
      <div data-testid="mod-report">
        <div className="sf-qi-h">
          <StatusChip tone={r.priority === 0 ? 'bad' : r.priority === 1 ? 'warn' : 'mut'}>{PRIORITY_LABEL[r.priority]}</StatusChip>
          <b>{reasonInfo(r.reason).label}</b>
          <span className="muted small">{TARGET_LABEL[r.targetType]} · {ago(r.createdAt)}{r.reportCount && r.reportCount > 1 ? ` · ${r.reportCount} reports` : ''}</span>
          {r.sample && <SampleTag />}{r.status === 'reviewing' && <StatusChip tone="warn">In review</StatusChip>}
        </div>
        {r.targetName && <div className="small">About <b>{r.targetName}</b></div>}
        {text && <blockquote className="dm-report-q sf-snap">{text}</blockquote>}
        {r.details && <p className="small"><span className="muted">Reporter’s note:</span> {r.details}</p>}
        {r.reason === 'self_harm' && <p className="small sf-inline-help">Possible risk to someone’s safety. If there’s an imminent threat, follow the emergency escalation in SETUP §15.</p>}
        {r.reason === 'minor' && <p className="small sf-inline-help">Child-safety report: handle first. Sexual content involving a minor must be preserved and reported to NCMEC (see SETUP §15), not just removed.</p>}
        <div className="sf-qi-f">
          <label className="field"><span>Guideline</span><select value={g} onChange={(e) => setG(e.target.value as GuidelineId)}>{GUIDELINES.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</select></label>
          <label className="field"><span>Days (restrict / suspend)</span><select value={days} onChange={(e) => setDays(+e.target.value)}>{[...SUSPEND_DAY_OPTIONS, 90, MAX_SUSPEND_DAYS].map((d) => <option key={d} value={d}>{d} day{d === 1 ? '' : 's'}</option>)}</select></label>
        </div>
        <label className="field"><span>Note to the person (shown with the decision)</span><input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="Short, factual, no reporter details" /></label>
        <div className="sf-qi-a">
          {r.status === 'open' && <button className="btn sm ghost" onClick={() => onAct({ ...base, action: 'review' }, 'Marked in review')} data-testid="mod-review">Review</button>}
          <button className="btn sm ghost" onClick={() => onAct({ ...base, action: 'dismiss' }, 'Dismissed')} data-testid="mod-dismiss">Dismiss</button>
          {content && <button className="btn sm" onClick={() => onAct({ ...base, action: 'remove_content' }, 'Content removed')} data-testid="mod-remove">Remove content</button>}
          <button className="btn sm" onClick={() => onAct({ ...base, action: 'restrict_messaging', days }, `Messaging restricted for ${days} days`)} data-testid="mod-restrict">Restrict messaging</button>
          <button className="btn sm danger" onClick={() => { if (confirm(`Suspend this account for ${days} days?`)) onAct({ ...base, action: 'suspend', days }, `Suspended for ${days} days`); }} data-testid="mod-suspend">Suspend {days} d</button>
        </div>
      </div>
    </Card>
  );
}
function AppealItem({ a, onDecide }: { a: QueueAppeal; onDecide: (s: 'under_review' | 'upheld' | 'reversed', note?: string) => void }) {
  const [note, setNote] = useState('');
  const d = a.decision;
  return (
    <Card className="sf-qi">
      <div data-testid="mod-appeal">
        <div className="sf-qi-h"><StatusChip tone={a.priority === 1 ? 'warn' : 'mut'}>{a.priority === 1 ? 'High' : 'Normal'}</StatusChip><b>Appeal · {DECISION_LABEL[d.kind]}</b><span className="muted small">{a.userName || 'User'} · {ago(a.createdAt)}</span>{a.sample && <span className="sample-tag">Demo</span>}<AppealStatusChip s={a.status} /></div>
        <div className="small muted">Decision {fmtShortDate(d.createdAt)} · {guidelineById(d.guideline).title}{d.endsAt ? ` · until ${fmtShortDate(d.endsAt)}` : ''}</div>
        {d.contentPreview && <blockquote className="dm-report-q">{d.contentPreview}</blockquote>}
        <p className="sf-appeal-text">“{a.text}”</p>
        <label className="field"><span>Note to the person (optional)</span><input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} /></label>
        <div className="sf-qi-a">
          {a.status === 'submitted' && <button className="btn sm ghost" onClick={() => onDecide('under_review')} data-testid="mod-appeal-review">Under review</button>}
          <button className="btn sm" onClick={() => onDecide('upheld', note.trim() || undefined)} data-testid="mod-appeal-uphold">Uphold</button>
          <button className="btn sm y" onClick={() => onDecide('reversed', note.trim() || undefined)} data-testid="mod-appeal-reverse">Reverse & restore</button>
        </div>
      </div>
    </Card>
  );
}
