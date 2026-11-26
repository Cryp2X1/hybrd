// Messages: inbox (Chats / Requests / Archived + search), 1:1 and group chats, new message / new group, chat info,
// and privacy settings. Phone: one screen at a time (the open chat hides the app bars). Desktop (≥960px): two panes.
// Messages are private to the people in a chat and protected by Row Level Security. They are NOT end-to-end encrypted.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Card, Empty, Sheet } from '../components/ui';
import { SAvatar, SampleTag, SocialGate } from '../components/Social';
import { ReactionBar, ReactorsSheet } from '../components/Reactions';
import { CrisisCard } from '../components/MindBits';
import { SafetyBanner, useCanInteract, useRestricted } from '../components/Safety';
import { Bubble, ConvAvatar, DmReportSheet, ForwardSheet, isSampleConv, MsgMenu, timeLabel, WorkoutSheet, type MenuAction } from '../components/Messages';
import { useMessages } from '../lib/messagesStore';
import { CallButtons, CallsList } from '../components/Call';
import { useCalls } from '../lib/callStore';
import { CALL_WHO, DND_OPTIONS, dndActive, dndLabel, dndUntilFor } from '../lib/calls';
import { useSocial } from '../lib/socialStore';
import { useToast } from '../lib/toast';
import { prepareSocialImage } from '../lib/socialImage';
import { prepareVideo } from '../lib/gallery';
import {
  canEdit, canUnsend, chatItems, checkMessageMedia, copyText, crisisInText, DM_WHO, friendlyDmError, GROUP_MAX, GROUP_TITLE_MAX, hasContactInfo, liveTyping, MAX_PINS,
  MSG_MAX, MUTE_FOREVER, previewText, REQUEST_MAX_MESSAGES, strangerWarning, typingLabel, type Folder,
} from '../lib/messages';
import type { ConvView, DraftMedia, EligibilityView, MessageView, SearchResult } from '../lib/messagesApi';
import type { PublicProfile, ReactionType, WorkoutCard } from '../lib/social';

const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => ((Math.random() * 16) | 0).toString(16)));
const EMOJI = ['😀', '😂', '😍', '🔥', '💪', '👏', '🙌', '🏃', '🏋️', '🚴', '🏊', '😅', '🙏', '❤️', '👍', '🎉', '😮', '😢'];
const PRIVACY_NOTE = 'Messages are private to the people in each chat and protected by HYBRD’s database access rules. They are not end-to-end encrypted.';

// =====================================================================================================
// Inbox + chat layout
// =====================================================================================================
export default function Messages() {
  return <SocialGate><Layout /></SocialGate>;
}
function Layout() {
  const loc = useLocation();
  const [sp] = useSearchParams();
  const chatOpen = loc.pathname === '/messages/chat';
  const cid = sp.get('c'); const to = sp.get('to');
  return (
    <div className={`dm-layout ${chatOpen ? 'chat-open' : ''}`} data-testid="dm-layout">
      <section className="dm-list-pane" aria-label="Chats"><Inbox activeId={cid} /></section>
      <section className="dm-chat-pane" aria-label="Conversation">
        {chatOpen && (cid || to) ? <Chat key={cid || `to:${to}`} cid={cid} to={to} />
          : <div className="dm-empty-pane"><Empty icon="chat" title="Your messages">Choose a chat, or start a new one with a friend or anyone who accepts messages.</Empty><Link className="btn y" to="/messages/new"><Icon name="edit" size={18} />New message</Link></div>}
      </section>
    </div>
  );
}

function Inbox({ activeId }: { activeId: string | null }) {
  const { inbox, ready, backend, typing, refresh } = useMessages();
  const { mode, me } = useSocial();
  const [sp, setSp] = useSearchParams();
  const loc = useLocation();
  const callsTab = loc.pathname === '/messages' && sp.get('folder') === 'calls';
  const folder: Folder = (loc.pathname === '/messages' && !callsTab && (sp.get('folder') as Folder)) || 'chats';
  const calls = useCalls();
  const [q, setQ] = useState('');
  const [res, setRes] = useState<SearchResult | null>(null);
  const [menu, setMenu] = useState<ConvView | null>(null);
  useEffect(() => {
    if (!backend || q.trim().length < 2) { setRes(null); return; }
    let live = true;
    const t = window.setTimeout(() => backend.search(q).then((r) => { if (live) setRes(r); }).catch(() => undefined), 220);
    return () => { live = false; window.clearTimeout(t); };
  }, [q, backend]);
  const list = inbox.filter((c) => c.folder === folder);
  const reqs = inbox.filter((c) => c.folder === 'requests');
  const reqUnread = reqs.filter((c) => c.unread > 0).length;
  const archived = inbox.filter((c) => c.folder === 'archived').length;
  const setFolder = (f: Folder | 'calls') => setSp(f === 'chats' ? {} : { folder: f });
  return (
    <div className="dm-inbox" data-testid="dm-inbox">
      <header className="dm-head">
        <div><div className="kicker">Social</div><h1>Messages</h1></div>
        <div className="row">
          <Link className="icon-btn" to="/settings/messages" aria-label="Message privacy settings" data-testid="dm-settings-link"><Icon name="gear" size={20} /></Link>
          <Link className="icon-btn dm-new" to="/messages/new" aria-label="New message" data-testid="dm-new"><Icon name="edit" size={20} /></Link>
        </div>
      </header>
      <SafetyBanner />
      {mode === 'demo' && <p className="dm-demo-note" role="note"><Icon name="info" size={14} /> Demo: sample people, not real users. Messages stay on this device.</p>}
      <label className="dm-search"><Icon name="search" size={18} /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search chats and messages" aria-label="Search chats and messages" data-testid="dm-search" />{q && <button aria-label="Clear search" onClick={() => setQ('')}><Icon name="x" size={16} /></button>}</label>
      {res ? <SearchResults res={res} onPick={() => setQ('')} /> : (
        <>
          {folder !== 'archived' ? (
            <div className="dm-folders" role="tablist" aria-label="Folders">
              <button role="tab" aria-selected={!callsTab && folder === 'chats'} className={!callsTab && folder === 'chats' ? 'on' : ''} onClick={() => setFolder('chats')} data-testid="dm-tab-chats">Chats</button>
              <button role="tab" aria-selected={!callsTab && folder === 'requests'} className={!callsTab && folder === 'requests' ? 'on' : ''} onClick={() => setFolder('requests')} data-testid="dm-tab-requests">Requests{reqs.length > 0 && <span className={`dm-fcount ${reqUnread ? 'hot' : ''}`}>{reqs.length}</span>}</button>
              {calls.backend && <button role="tab" aria-selected={callsTab} className={callsTab ? 'on' : ''} onClick={() => setFolder('calls')} data-testid="dm-tab-calls">Calls{calls.missed > 0 && !callsTab && <span className="dm-fcount hot" aria-label={`${calls.missed} missed`}>{calls.missed}</span>}</button>}
            </div>
          ) : <button className="dm-back-folder" onClick={() => setFolder('chats')}><Icon name="back" size={16} /> Archived chats</button>}
          {callsTab ? <CallsList /> : <>
          {folder === 'requests' && <p className="dm-req-note muted small" data-testid="dm-req-note"><Icon name="lock" size={14} /> Messages from people you’re not friends with. They won’t see that you’ve read them unless you accept. Photos and videos stay blurred until you tap.</p>}
          {!ready && <div className="dm-skel" aria-hidden="true">{[0, 1, 2, 3].map((i) => <div key={i} />)}</div>}
          {ready && !list.length && (folder === 'requests'
            ? <Empty icon="lock" title="No message requests">When someone you’re not friends with messages you, it shows up here first.</Empty>
            : folder === 'archived' ? <Empty icon="archive" title="Nothing archived" />
            : <Empty icon="chat" title="No messages yet">Say hi to a friend or share a workout. <Link className="link" to="/messages/new">New message →</Link></Empty>)}
          <ul className="dm-convs" role="list">
            {list.map((c) => <ConvRow key={c.id} c={c} active={c.id === activeId} meId={me?.id || ''} typing={liveTyping(typing[c.id] || {}).filter((u) => u !== me?.id)} onMenu={() => setMenu(c)} />)}
          </ul>
          {folder === 'chats' && archived > 0 && <button className="dm-archived-link" onClick={() => setFolder('archived')}><Icon name="archive" size={16} /> Archived ({archived})</button>}
          </>}
          <p className="dm-privacy muted small"><Icon name="lock" size={13} /> {PRIVACY_NOTE}</p>
        </>
      )}
      {menu && <ConvMenu c={menu} onClose={() => { setMenu(null); refresh(); }} />}
    </div>
  );
}

function ConvRow({ c, active, meId, typing, onMenu }: { c: ConvView; active: boolean; meId: string; typing: string[]; onMenu: () => void }) {
  const name = (id: string) => c.members.find((m) => m.userId === id)?.profile.displayName || 'Someone';
  const prev = typing.length ? typingLabel(typing.map((u) => name(u).split(' ')[0])) : c.request === 'incoming' && c.last && (c.last.kind === 'image' || c.last.kind === 'video') ? `${c.last.kind === 'image' ? 'Sent a photo' : 'Sent a video'}` : previewText(c.last, meId, name, c.kind === 'group');
  return (
    <li className={`dm-conv ${active ? 'on' : ''} ${c.unread > 0 ? 'unread' : ''}`}>
      <Link to={`/messages/chat?c=${encodeURIComponent(c.id)}`} className="dm-conv-main" data-testid="dm-conv" aria-label={`${c.title}${c.unread ? `, ${c.unread} unread` : ''}`}>
        <ConvAvatar c={c} />
        <span className="dm-conv-m">
          <span className="dm-conv-top"><b className="dm-conv-n">{c.title}</b>{isSampleConv(c) && <SampleTag />}{c.kind === 'group' && c.others.some((o) => o.profile.sample) && <SampleTag />}
            {c.pinned && <Icon name="pin" size={13} className="dm-ic-dim" />}{c.muted && <Icon name="mute" size={13} className="dm-ic-dim" />}
            <span className="dm-conv-t">{timeLabel(c.lastMessageAt)}</span></span>
          <span className={`dm-conv-prev ${typing.length ? 'typing' : ''}`}>{prev || (c.request === 'outgoing' ? 'Request sent' : '')}</span>
        </span>
        {c.unread > 0 && <span className={`dm-unread ${c.muted ? 'muted' : ''}`} aria-hidden="true">{c.unread > 9 ? '9+' : c.unread}</span>}
      </Link>
      <button className="dm-conv-more" aria-label={`Options for ${c.title}`} onClick={onMenu} data-testid="dm-conv-more"><Icon name="more" size={18} /></button>
    </li>
  );
}

function SearchResults({ res, onPick }: { res: SearchResult; onPick: () => void }) {
  if (!res.chats.length && !res.hits.length) return <Empty icon="search" title="No results">Try a name, @handle or a word from a message.</Empty>;
  return (
    <div className="dm-results" data-testid="dm-results">
      {res.chats.length > 0 && <><div className="dm-sec">Chats</div><ul className="dm-convs">{res.chats.map((c) => <li key={c.id} className="dm-conv"><Link className="dm-conv-main" to={`/messages/chat?c=${c.id}`} onClick={onPick}><ConvAvatar c={c} size={40} /><span className="dm-conv-m"><b className="dm-conv-n">{c.title}{isSampleConv(c) && <SampleTag />}</b></span></Link></li>)}</ul></>}
      {res.hits.length > 0 && <><div className="dm-sec">Messages</div><ul className="dm-convs">{res.hits.map((h) => <li key={h.messageId} className="dm-conv"><Link className="dm-conv-main" to={`/messages/chat?c=${h.conversationId}&m=${h.messageId}`} onClick={onPick}><ConvAvatar c={h.conv} size={40} /><span className="dm-conv-m"><span className="dm-conv-top"><b className="dm-conv-n">{h.conv.title}</b><span className="dm-conv-t">{timeLabel(h.createdAt)}</span></span><span className="dm-conv-prev">{h.senderName}: {h.snippet}</span></span></Link></li>)}</ul></>}
    </div>
  );
}

const MUTES: { label: string; ms: number }[] = [{ label: '1 hour', ms: 3600_000 }, { label: '8 hours', ms: 8 * 3600_000 }, { label: '1 week', ms: 7 * 86_400_000 }, { label: 'Until I turn it back on', ms: Infinity }];
function ConvMenu({ c, onClose, onLeft }: { c: ConvView; onClose: () => void; onLeft?: () => void }) {
  const { backend, inbox, refresh } = useMessages();
  const toast = useToast();
  const [muteOpen, setMuteOpen] = useState(false);
  const run = async (f: () => Promise<unknown>, ok: string) => { try { await f(); await refresh(); toast(ok); onClose(); } catch (e) { toast(friendlyDmError(e)); } };
  if (!backend) return null;
  const pins = inbox.filter((x) => x.pinned).length;
  return (
    <Sheet open onClose={onClose} title={c.title}>
      <div className="dm-actions" data-testid="dm-conv-menu">
        {c.folder !== 'requests' && <>
          <button onClick={() => (c.pinned || pins < MAX_PINS ? run(() => backend.setPrefs(c.id, { pinned: !c.pinned }), c.pinned ? 'Unpinned' : 'Pinned to the top') : toast(`You can pin up to ${MAX_PINS} chats.`))}><Icon name="pin" size={18} />{c.pinned ? 'Unpin' : 'Pin to top'}</button>
          {c.muted ? <button onClick={() => run(() => backend.setPrefs(c.id, { mutedUntil: null }), 'Unmuted')}><Icon name="volume" size={18} />Unmute</button>
            : <button onClick={() => setMuteOpen((o) => !o)} aria-expanded={muteOpen}><Icon name="mute" size={18} />Mute notifications</button>}
          {muteOpen && <div className="dm-mutes">{MUTES.map((m) => <button key={m.label} onClick={() => run(() => backend.setPrefs(c.id, { mutedUntil: m.ms === Infinity ? MUTE_FOREVER : Date.now() + m.ms }), `Muted ${m.ms === Infinity ? 'until you unmute' : `for ${m.label}`}`)}>{m.label}</button>)}</div>}
          <button onClick={() => run(() => backend.setPrefs(c.id, { archived: !c.archived }), c.archived ? 'Moved to Chats' : 'Archived')}><Icon name="archive" size={18} />{c.archived ? 'Unarchive' : 'Archive'}</button>
          {c.unread > 0 && <button onClick={() => run(() => backend.markRead(c.id), 'Marked as read')}><Icon name="check" size={18} />Mark as read</button>}
        </>}
        <button className="danger" onClick={() => { if (confirm('Delete this chat for you? Messages are removed from your inbox only; others in the chat keep their copy.')) run(() => backend.clearChat(c.id), 'Chat deleted'); }} data-testid="dm-delete-chat"><Icon name="trash" size={18} />Delete chat</button>
        {c.kind === 'group' && <button className="danger" onClick={() => { if (confirm(`Leave “${c.title}”? You’ll stop getting its messages.`)) run(async () => { await backend.leaveGroup(c.id); onLeft?.(); }, 'You left the group'); }}><Icon name="back" size={18} />Leave group</button>}
      </div>
    </Sheet>
  );
}

// =====================================================================================================
// Chat
// =====================================================================================================
interface Attach { kind: 'image' | 'video'; media: DraftMedia }
function Chat({ cid, to }: { cid: string | null; to: string | null }) {
  const { backend, version, typing, send, retry, discard, setActive, pendingFor, refresh, online, inbox } = useMessages();
  const { me, backend: social, graph } = useSocial();
  const nav = useNavigate();
  const toast = useToast();
  const [sp] = useSearchParams();
  const jump = sp.get('m');
  const [conv, setConv] = useState<ConvView | null | undefined>(undefined);
  const [msgs, setMsgs] = useState<MessageView[]>([]);
  const [target, setTarget] = useState<{ p: PublicProfile; elig: EligibilityView } | null | undefined>(undefined);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<MessageView | null>(null);
  const [editing, setEditing] = useState<MessageView | null>(null);
  const [att, setAtt] = useState<Attach | null>(null);
  const [workout, setWorkout] = useState<WorkoutCard | null>(null);
  const [emoji, setEmoji] = useState(false);
  const [pickW, setPickW] = useState(false);
  const [prep, setPrep] = useState(false);
  const [menu, setMenu] = useState<{ m: MessageView; rect: DOMRect; pointerId: number | null } | null>(null);
  const [reactors, setReactors] = useState<MessageView | null>(null);
  const [fwd, setFwd] = useState<MessageView | null>(null);
  const [report, setReport] = useState<{ type: 'message' | 'conversation'; m?: MessageView } | null>(null);
  const [info, setInfo] = useState(false);
  const [viewer, setViewer] = useState<MessageView | null>(null);
  const [warnClosed, setWarnClosed] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const stick = useRef(true);
  const typingSent = useRef(0);
  const meId = me?.id || '';
  const can = useCanInteract('message');
  const restrict = useRestricted();

  // ?to=<handle>: resolve the person, reuse an existing chat, or show a new-chat composer (the chat is created on first send)
  useEffect(() => {
    if (cid || !to || !social || !backend) return;
    let live = true;
    (async () => {
      const p = await social.profileByHandle(to).catch(() => null);
      if (!live) return;
      if (!p) { setTarget(null); setConv(null); return; }
      const ex = inbox.find((c) => c.kind === 'direct' && c.others[0]?.userId === p.id);
      const e: EligibilityView = await backend.eligibility(p.id).catch((err) => ({ ok: false as const, reason: 'unavailable' as const, msg: friendlyDmError(err) }));
      if (!live) return;
      const existing = ex?.id || e.existing;
      if (existing) { nav(`/messages/chat?c=${encodeURIComponent(existing)}`, { replace: true }); return; }
      setTarget({ p, elig: e }); setConv(null);
    })();
    return () => { live = false; };
  }, [cid, to, social, backend]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async () => {
    if (!backend || !cid) return;
    try {
      const [c, ms] = await Promise.all([backend.conversation(cid), backend.messages(cid)]);
      setConv(c); setMsgs(ms);
    } catch (e) { console.warn(e); setConv(null); }
  }, [backend, cid]);
  useEffect(() => { load(); }, [load, version]);
  useEffect(() => { if (!cid) return; setActive(cid); return () => setActive(null); }, [cid, setActive]);
  useEffect(() => {
    const b = backend as unknown as { watch?: (id: string) => () => void } | null;
    return b?.watch && cid ? b.watch(cid) : undefined;
  }, [backend, cid]);
  // opening the chat marks it read (requests too, but the sender can't see that until you accept)
  useEffect(() => {
    if (!backend || !cid || !conv || conv.unread <= 0 || document.visibilityState !== 'visible') return;
    backend.markRead(cid).then(() => refresh()).catch(() => undefined);
  }, [backend, cid, conv?.unread, conv?.lastMessageAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const pending = useMemo(() => (cid && me ? pendingFor(cid, me) : []), [cid, me, pendingFor]);
  const all = useMemo(() => { const ids = new Set(msgs.map((m) => m.id)); return [...msgs, ...pending.filter((p) => !ids.has(p.id))].sort((a, b) => a.createdAt - b.createdAt); }, [msgs, pending]);
  const items = useMemo(() => chatItems(all), [all]);
  const lastMine = useMemo(() => [...all].reverse().find((m) => m.mine && m.kind !== 'system' && !m.pending && !m.deletedAt)?.id, [all]);
  const typers = liveTyping((cid && typing[cid]) || {}).filter((u) => u !== meId);
  const nameOf = useCallback((id: string) => (id === meId ? 'You' : conv?.members.find((m) => m.userId === id)?.profile.displayName || 'Someone'), [conv, meId]);

  // keep pinned to the bottom like every chat app, unless the person scrolled up to read
  useLayoutEffect(() => {
    const el = scroller.current; if (!el) return;
    if (jump) { const t = document.getElementById(`m-${jump}`); if (t) { t.scrollIntoView({ block: 'center' }); t.classList.add('dm-flash'); return; } }
    if (stick.current) el.scrollTop = el.scrollHeight;
  }, [items.length, typers.length, jump]);
  const onScroll = () => { const el = scroller.current; if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; };

  const other = conv?.kind === 'direct' ? conv.others[0] : undefined;
  const otherP = other?.profile || target?.p;
  const friends = useMemo(() => new Set((graph?.friends || []).map((f) => f.id)), [graph]);
  const stranger = !!otherP && !friends.has(otherP.id) && conv?.kind !== 'group';
  const incoming = conv?.request === 'incoming';
  const outgoing = conv?.request === 'outgoing' || (!!target && target.elig.ok && target.elig.request);
  const remaining = conv ? conv.requestRemaining : REQUEST_MAX_MESSAGES;
  const theirMsgs = all.filter((m) => !m.mine);
  const warn = stranger && !warnClosed ? strangerWarning(theirMsgs) : null;
  const left = conv && conv.me.state !== 'active' && conv.me.state !== 'request';
  const blockedMsg = !can.ok ? can.why! : conv?.blocked === 'byMe' ? 'You blocked this account.' : conv?.blocked === 'unavailable' ? 'You can’t message this account.' : null;
  const denied = target && !target.elig.ok ? target.elig.msg : null;
  const limitHit = outgoing && remaining <= 0;
  const disabledMsg = left ? 'You’re no longer in this group.' : blockedMsg || denied || (limitHit ? `You’ve sent ${REQUEST_MAX_MESSAGES} messages. You can send more once ${otherP?.displayName.split(' ')[0] || 'they'} accept${otherP ? 's' : ''} your request.` : null);

  // ---------- composer ----------
  const onType = (v: string) => {
    setText(v.slice(0, MSG_MAX));
    if (cid && backend && Date.now() - typingSent.current > 2500 && v.trim()) { typingSent.current = Date.now(); backend.setTyping(cid, true); }
  };
  useLayoutEffect(() => { const t = ta.current; if (!t) return; t.style.height = 'auto'; t.style.height = `${Math.min(140, t.scrollHeight)}px`; }, [text]);
  const clearComposer = () => { setText(''); setReplyTo(null); setEditing(null); setAtt(null); setWorkout(null); setEmoji(false); };
  const doSend = async () => {
    if (!backend || disabledMsg) return;
    const body = text.trim();
    if (editing) {
      if (!body) return;
      try { await backend.edit(editing.id, body); clearComposer(); await load(); toast('Message edited'); } catch (e) { toast(friendlyDmError(e)); }
      return;
    }
    if (!body && !att && !workout) return;
    let id = cid;
    if (!id && target?.p) {
      try { id = await backend.openDirect(target.p.id); } catch (e) { toast(friendlyDmError(e)); return; }
    }
    if (!id) return;
    send(id, { clientId: uuid(), kind: att ? att.kind : workout ? 'workout' : 'text', body, replyTo: replyTo?.id, workout: workout || undefined, media: att?.media });
    backend.setTyping(id, false); typingSent.current = 0;
    stick.current = true;
    clearComposer();
    if (!cid) nav(`/messages/chat?c=${encodeURIComponent(id)}`, { replace: true });
    else ta.current?.focus();
  };
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setPrep(true);
    try {
      if (f.type.startsWith('video/')) {
        const v = await prepareVideo(f);
        const err = checkMessageMedia({ type: v.mime, size: v.orig.size, duration: v.duration }); if (err) throw new Error(err);
        setAtt({ kind: 'video', media: { blob: v.orig, poster: v.disp, w: v.w, h: v.h, mime: v.mime, duration: v.duration, preview: URL.createObjectURL(v.disp) } });
      } else {
        const p = await prepareSocialImage(f);
        const err = checkMessageMedia({ type: p.blob.type, size: p.blob.size }); if (err) throw new Error(err);
        setAtt({ kind: 'image', media: { blob: p.blob, w: p.w, h: p.h, mime: p.blob.type, preview: p.preview } });
      }
      setWorkout(null);
    } catch (e) { toast((e as Error).message || 'Couldn’t add that file.'); } finally { setPrep(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  // ---------- long-press menu ----------
  const react = async (m: MessageView, t: ReactionType | null) => {
    if (!backend) return;
    try { await backend.react(m.id, t); await load(); } catch (e) { toast(friendlyDmError(e)); }
  };
  const actions = (m: MessageView): MenuAction[] => {
    const a: MenuAction[] = [];
    const active = conv?.me.state === 'active' && !disabledMsg;
    if (m.deletedAt) return m.mine ? [] : [{ k: 'delete', label: 'Delete for me', icon: 'trash', danger: true, run: () => delForMe(m) }];
    if (active) a.push({ k: 'reply', label: 'Reply', icon: 'reply', run: () => { setEditing(null); setReplyTo(m); ta.current?.focus(); } });
    if (copyText(m)) a.push({ k: 'copy', label: 'Copy', icon: 'copy', run: () => { navigator.clipboard?.writeText(copyText(m)).then(() => toast('Copied'), () => toast('Couldn’t copy')); } });
    if (canEdit(m, meId) && m.kind !== 'workout' && active) a.push({ k: 'edit', label: 'Edit', icon: 'edit', run: () => { setReplyTo(null); setAtt(null); setWorkout(null); setEditing(m); setText(m.body); ta.current?.focus(); } });
    if (!incoming) a.push({ k: 'forward', label: 'Forward', icon: 'forward', run: () => setFwd(m) });
    if (canUnsend(m, meId)) a.push({ k: 'unsend', label: 'Unsend for everyone', icon: 'undo', danger: true, run: () => unsend(m) });
    a.push({ k: 'delete', label: 'Delete for me', icon: 'trash', danger: true, run: () => delForMe(m) });
    if (!m.mine) a.push({ k: 'report', label: 'Report', icon: 'flag', danger: true, run: () => setReport({ type: 'message', m }) });
    return a;
  };
  const unsend = async (m: MessageView) => {
    if (!backend || !confirm('Unsend this message for everyone? People may have already seen it.')) return;
    try { await backend.unsend(m.id); await load(); refresh(); toast('Message unsent'); } catch (e) { toast(friendlyDmError(e)); }
  };
  const delForMe = async (m: MessageView) => {
    if (!backend) return;
    try { await backend.deleteForMe(m.id); await load(); refresh(); toast('Deleted for you'); } catch (e) { toast(friendlyDmError(e)); }
  };
  const onMenu = useCallback((m: MessageView, rect: DOMRect, pointerId: number | null) => setMenu({ m, rect, pointerId }), []);
  const onReactors = useCallback((m: MessageView) => setReactors(m), []);
  const onReplyJump = useCallback((id: string) => { const t = document.getElementById(`m-${id}`); if (t) { t.scrollIntoView({ block: 'center', behavior: 'smooth' }); t.classList.remove('dm-flash'); void t.offsetWidth; t.classList.add('dm-flash'); } }, []);
  const onRetry = useCallback((m: MessageView) => retry(m.id), [retry]);
  const onDiscard = useCallback((m: MessageView) => discard(m.id), [discard]);
  const onOpenMedia = useCallback((m: MessageView) => setViewer(m), []);
  const onLove = useCallback((m: MessageView) => { if (conv?.me.state === 'active' && !conv.blocked) react(m, m.myReaction === 'love' ? null : 'love'); }, [conv]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- request actions ----------
  const accept = async () => { if (!backend || !cid) return; try { await backend.accept(cid); await refresh(); await load(); toast('Request accepted'); } catch (e) { toast(friendlyDmError(e)); } };
  const decline = async () => { if (!backend || !cid) return; if (!confirm('Delete this request? They won’t be told.')) return; try { await backend.decline(cid); await refresh(); nav('/messages?folder=requests', { replace: true }); toast('Request deleted'); } catch (e) { toast(friendlyDmError(e)); } };
  const block = async () => {
    if (!backend || !otherP) return;
    if (!confirm(`Block @${otherP.username}? They won’t be able to message you or see you anywhere on HYBRD. They won’t be told.`)) return;
    try { await backend.block(otherP.id); await refresh(); toast(`@${otherP.username} blocked`); if (incoming) nav('/messages?folder=requests', { replace: true }); else await load(); } catch (e) { toast(friendlyDmError(e)); }
  };

  if (conv === undefined && (cid || target === undefined)) return <div className="dm-chat"><div className="dm-loading muted">Loading…</div></div>;
  if (!conv && !target) return <div className="dm-chat"><div className="dm-chat-h"><Link to="/messages" className="icon-btn dm-back" aria-label="Back to messages"><Icon name="back" /></Link></div><Empty icon="chat" title="Chat not available">It may have been deleted, or you’re no longer in it.</Empty></div>;

  const title = conv?.title || target?.p.displayName || '';
  const typingText = typers.length ? typingLabel(typers.map((u) => nameOf(u).split(' ')[0])) : '';
  const sub = typingText || (conv?.kind === 'group' ? `${conv.members.length} members` : conv?.presence) || (otherP ? `@${otherP.username}` : '');
  const crisis = crisisInText(text);
  const contact = stranger && hasContactInfo(text);
  const canCompose = !incoming && !disabledMsg;

  return (
    <div className="dm-chat" data-testid="dm-chat">
      <header className="dm-chat-h">
        <Link to={`/messages${incoming ? '?folder=requests' : ''}`} className="icon-btn dm-back" aria-label="Back to messages"><Icon name="back" /></Link>
        <button className="dm-chat-who" onClick={() => setInfo(true)} aria-label={`${title}. Chat details`} data-testid="dm-chat-title">
          {conv ? <ConvAvatar c={conv} size={38} /> : <SAvatar p={otherP} size={38} />}
          <span className="dm-chat-tt"><b>{title}{otherP?.sample && <SampleTag />}{conv?.kind === 'group' && conv.others.some((o) => o.profile.sample) && <SampleTag />}</b><span className={`dm-chat-sub ${typingText ? 'typing' : ''}`}>{sub}</span></span>
        </button>
        {conv && <span className="dm-callbtns"><CallButtons c={conv} /></span>}
        {conv && <button className="icon-btn" aria-label="Chat details" onClick={() => setInfo(true)} data-testid="dm-info"><Icon name="info" size={20} /></button>}
      </header>
      {!online && <div className="dm-offline" role="status"><Icon name="cloud" size={14} /> You’re offline. Messages will send when you’re back online.</div>}

      <div className="dm-scroll" ref={scroller} onScroll={onScroll} data-testid="dm-scroll">
        {(incoming || outgoing || (!conv && target)) && otherP && (
          <div className="dm-intro" data-testid="dm-intro">
            <SAvatar p={otherP} size={72} />
            <b className="dm-intro-n">{otherP.displayName}{otherP.sample && <SampleTag />}</b>
            <span className="muted small">@{otherP.username}{otherP.friendCount ? ` · ${otherP.friendCount} friends` : ''}</span>
            <span className="muted small">{friends.has(otherP.id) ? 'You’re friends on HYBRD' : 'You’re not friends on HYBRD'}</span>
            <Link className="btn sm" to={`/social/profile?u=${encodeURIComponent(otherP.username)}`}>View profile</Link>
          </div>
        )}
        {warn && (
          <div className="dm-warn" role="alert" data-testid="dm-stranger-warning">
            <Icon name="info" size={18} /><div><b>Be careful</b><p>{warn}</p></div>
            <button className="icon-btn sm" aria-label="Dismiss warning" onClick={() => setWarnClosed(true)}><Icon name="x" size={14} /></button>
          </div>
        )}
        {items.map((it) => it.t === 'day'
          ? <div key={it.key} className="dm-day" role="separator"><span>{it.label}</span></div>
          : <Bubble key={it.key} m={it.m} group={conv?.kind === 'group'} first={it.first} last={it.last} showStatus={it.m.id === lastMine} blurMedia={incoming} careful={stranger}
              nameOf={nameOf} meId={meId} onMenu={onMenu} onReactors={onReactors} onReplyJump={onReplyJump} onRetry={onRetry} onDiscard={onDiscard} onOpenMedia={onOpenMedia} onLove={onLove} />)}
        {typers.length > 0 && <div className="dm-row theirs first last" aria-live="polite"><div className="dm-col"><div className="dm-bubble dm-typing" aria-label={typingText}><i /><i /><i /></div></div></div>}
      </div>

      {incoming ? (
        <div className="dm-req-bar" data-testid="dm-request-actions">
          <p><b>Accept message request from {otherP?.displayName || 'this person'}?</b> If you accept, they can message you freely and see when you’ve read their messages. Until then they can send up to {REQUEST_MAX_MESSAGES}.</p>
          <div className="dm-req-btns">
            <button className="btn sm danger" onClick={block} data-testid="dm-req-block"><Icon name="ban" size={16} />Block</button>
            <button className="btn sm" onClick={() => setReport({ type: 'conversation' })} data-testid="dm-req-report"><Icon name="flag" size={16} />Report</button>
            <button className="btn sm" onClick={decline} data-testid="dm-req-delete"><Icon name="trash" size={16} />Delete</button>
            <button className="btn sm y" onClick={accept} data-testid="dm-req-accept"><Icon name="check" size={16} />Accept</button>
          </div>
        </div>
      ) : (
        <div className="dm-compose-wrap">
          {outgoing && !disabledMsg && <p className="dm-req-left small" data-testid="dm-req-left"><Icon name="lock" size={13} /> {conv?.request === 'outgoing' ? 'Request sent. ' : 'This will be a message request. '}You can send {remaining} more message{remaining === 1 ? '' : 's'} until {otherP?.displayName.split(' ')[0] || 'they'} accept{otherP ? 's' : ''}.</p>}
          {conv?.restricted && otherP && <div className="dm-restricted-note" data-testid="dm-restricted-note"><Icon name="eyeoff" size={15} /><span>You restricted @{otherP.username}. They can’t see when you’ve read their messages or when you’re online.</span><button className="link" onClick={() => restrict.toggle(otherP, false).then(load)}>Unrestrict</button></div>}
          {disabledMsg ? (
            <div className="dm-disabled" data-testid="dm-disabled"><Icon name="ban" size={16} /> {disabledMsg}{conv?.blocked === 'byMe' && otherP && <button className="link" onClick={async () => { await backend?.unblock(otherP.id); await refresh(); await load(); toast('Unblocked'); }}>Unblock</button>}</div>
          ) : canCompose && (
            <>
              {crisis && <div className="dm-crisis" data-testid="dm-crisis"><CrisisCard compact /></div>}
              {contact && <p className="dm-caution small" data-testid="dm-contact-caution"><Icon name="info" size={13} /> Think twice before sharing your phone number, email or address with someone you don’t know.</p>}
              {(replyTo || editing) && (
                <div className="dm-strip" data-testid={editing ? 'dm-edit-strip' : 'dm-reply-strip'}>
                  <Icon name={editing ? 'edit' : 'reply'} size={16} />
                  <span className="dm-strip-t"><b>{editing ? 'Editing message' : `Replying to ${replyTo!.mine ? 'yourself' : replyTo!.sender.displayName}`}</b><span>{editing ? 'Edits are visible to everyone and marked “Edited”.' : previewText({ ...replyTo!, senderId: '_' }, meId, nameOf)}</span></span>
                  <button className="icon-btn sm" aria-label="Cancel" onClick={() => { if (editing) setText(''); setReplyTo(null); setEditing(null); }}><Icon name="x" size={14} /></button>
                </div>
              )}
              {(att || workout) && (
                <div className="dm-att" data-testid="dm-attachment">
                  {att && <span className="dm-att-th">{att.media.preview && <img src={att.media.preview} alt="" />}{att.kind === 'video' && <Icon name="play" size={16} />}</span>}
                  {workout && <span className="dm-att-w"><span className="pill yellow">{workout.label}</span> {workout.title}</span>}
                  <span className="muted small">{att ? (att.kind === 'video' ? 'Video · location data removed' : 'Photo · location data removed') : 'Workout card'}</span>
                  <button className="icon-btn sm" aria-label="Remove attachment" onClick={() => { setAtt(null); setWorkout(null); }}><Icon name="x" size={14} /></button>
                </div>
              )}
              {emoji && <div className="dm-emoji" role="group" aria-label="Insert emoji">{EMOJI.map((e) => <button key={e} onClick={() => { const t = ta.current; const s = t?.selectionStart ?? text.length; const n = text.slice(0, s) + e + text.slice(t?.selectionEnd ?? s); onType(n); requestAnimationFrame(() => { t?.focus(); t?.setSelectionRange(s + e.length, s + e.length); }); }} aria-label={`Insert ${e}`}>{e}</button>)}</div>}
              <div className="dm-compose">
                {!editing && <>
                  <button className="dm-cbtn" aria-label="Add photo or video" onClick={() => fileRef.current?.click()} disabled={prep} data-testid="dm-attach"><Icon name={prep ? 'refresh' : 'image'} size={21} /></button>
                  <button className="dm-cbtn" aria-label="Share a workout" onClick={() => setPickW(true)} data-testid="dm-workout"><Icon name="bolt" size={21} /></button>
                </>}
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,video/mp4,video/quicktime,video/webm" hidden onChange={(e) => onFile(e.target.files?.[0])} />
                <div className="dm-input">
                  <textarea ref={ta} rows={1} value={text} onChange={(e) => onType(e.target.value)} placeholder={att || workout ? 'Add a caption…' : 'Message…'} aria-label="Message" maxLength={MSG_MAX} data-testid="dm-input"
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia('(pointer: fine)').matches) { e.preventDefault(); doSend(); } }}
                    onBlur={() => { if (cid && typingSent.current) { backend?.setTyping(cid, false); typingSent.current = 0; } }} />
                  <button className={`dm-cbtn sm ${emoji ? 'on' : ''}`} aria-label="Emoji" aria-pressed={emoji} onClick={() => setEmoji((x) => !x)}><Icon name="smile" size={20} /></button>
                </div>
                <button className="dm-send" aria-label={editing ? 'Save edit' : 'Send'} onClick={doSend} disabled={!(text.trim() || att || workout)} data-testid="dm-send"><Icon name={editing ? 'check' : 'send'} size={20} /></button>
              </div>
            </>
          )}
        </div>
      )}

      {menu && <>
        <ReactionBar open anchor={menu.rect} current={menu.m.myReaction} pointerId={menu.pointerId} onClose={() => setMenu(null)}
          onPick={(t) => { const m = menu.m; setMenu(null); if (conv?.me.state !== 'active' || conv.blocked || m.deletedAt) { toast(incoming ? 'Accept the request to react.' : 'You can’t react to this.'); return; } react(m, m.myReaction === t ? null : t); }} />
        <MsgMenu anchor={menu.rect} actions={actions(menu.m)} onClose={() => setMenu(null)} />
      </>}
      {reactors && backend && <ReactorsSheet open onClose={() => setReactors(null)} load={() => backend.reactors(reactors.id)} />}
      {fwd && <ForwardSheet m={fwd} onClose={() => setFwd(null)} />}
      {report && cid && <DmReportSheet target={{ type: report.type, id: report.m?.id || cid, conversationId: cid, who: report.m ? report.m.sender : otherP, groupTitle: conv?.kind === 'group' ? conv.title : undefined, preview: report.m ? previewText({ ...report.m, senderId: '_' }, meId, nameOf) : undefined,
        messages: report.m ? reportable(all, report.m).map((x) => ({ id: x.id, preview: previewText({ ...x, senderId: '_' }, meId, nameOf), who: x.sender.displayName.split(' ')[0] })) : undefined }} onClose={() => setReport(null)} onBlocked={() => { if (incoming) nav('/messages?folder=requests', { replace: true }); else load(); }} />}
      <WorkoutSheet open={pickW} onClose={() => setPickW(false)} onPick={(w) => { setWorkout(w); setAtt(null); setPickW(false); ta.current?.focus(); }} />
      {info && conv && <ChatInfo c={conv} onClose={() => setInfo(false)} onReport={() => { setInfo(false); setReport({ type: 'conversation' }); }} onBlock={() => { setInfo(false); block(); }} onChanged={load} />}
      {viewer?.media && <div className="dm-viewer" role="dialog" aria-label="Photo" onClick={() => setViewer(null)}><img src={viewer.media.url} alt="" /><button className="icon-btn" aria-label="Close"><Icon name="x" /></button></div>}
    </div>
  );
}

// ---------- chat details (people, mute, pin, group admin) ----------
/** The reported message plus up to 9 earlier ones from the same person, newest last. */
function reportable(all: MessageView[], m: MessageView): MessageView[] {
  const theirs = all.filter((x) => x.senderId === m.senderId && !x.mine && !x.deletedAt && x.kind !== 'system' && !x.pending && x.createdAt <= m.createdAt);
  return theirs.slice(-10);
}
function ChatInfo({ c, onClose, onReport, onBlock, onChanged }: { c: ConvView; onClose: () => void; onReport: () => void; onBlock: () => void; onChanged: () => void }) {
  const { backend, refresh } = useMessages();
  const { graph, me } = useSocial();
  const toast = useToast();
  const nav = useNavigate();
  const [rename, setRename] = useState(c.customTitle || '');
  const [adding, setAdding] = useState(false);
  const [sel, setSel] = useState<string[]>([]);
  const [prefs, setPrefs] = useState(false);
  const restrict = useRestricted();
  const run = async (f: () => Promise<unknown>, ok: string) => { try { await f(); await refresh(); onChanged(); toast(ok); } catch (e) { toast(friendlyDmError(e)); } };
  if (!backend) return null;
  const other = c.kind === 'direct' ? c.others[0] : undefined;
  const memberIds = new Set(c.members.map((m) => m.userId));
  const addable = (graph?.friends || []).filter((f) => !memberIds.has(f.id));
  return (
    <Sheet open onClose={onClose} title={c.kind === 'group' ? 'Group details' : 'Chat details'}>
      <div className="dm-info" data-testid="dm-chat-info">
        {other && (
          <div className="dm-info-h">
            <SAvatar p={other.profile} size={64} />
            <b>{other.profile.displayName}{other.profile.sample && <SampleTag />}</b>
            <span className="muted small">@{other.profile.username}</span>
            <Link className="btn sm" to={`/social/profile?u=${encodeURIComponent(other.profile.username)}`} onClick={onClose}>View profile</Link>
          </div>
        )}
        {c.kind === 'group' && (
          <>
            {c.isAdmin ? (
              <div className="dm-rename"><label className="field"><span>Group name</span><input value={rename} maxLength={GROUP_TITLE_MAX} onChange={(e) => setRename(e.target.value)} placeholder="Name this group" data-testid="dm-group-name" /></label>
                <button className="btn sm" disabled={!rename.trim() || rename.trim() === c.customTitle} onClick={() => run(() => backend.renameGroup(c.id, rename), 'Group renamed')}>Save</button></div>
            ) : <p className="muted small">Only admins can rename the group or remove people.</p>}
            <div className="dm-sec">{c.members.length} of {GROUP_MAX} people</div>
            <ul className="dm-members" data-testid="dm-members">
              {c.members.map((m) => (
                <li key={m.userId}>
                  <SAvatar p={m.profile} size={40} />
                  <span className="dm-mem-n"><b>{m.userId === me?.id ? 'You' : m.profile.displayName}{m.profile.sample && <SampleTag />}</b><span className="muted small">@{m.profile.username}{m.role === 'admin' ? ' · Admin' : ''}</span></span>
                  {c.isAdmin && m.userId !== me?.id && <span className="row">
                    {m.role !== 'admin' && <button className="btn sm ghost" onClick={() => run(() => backend.setAdmin(c.id, m.userId), `${m.profile.displayName} is now an admin`)}>Make admin</button>}
                    <button className="btn sm ghost danger" onClick={() => { if (confirm(`Remove ${m.profile.displayName} from the group?`)) run(() => backend.removeMember(c.id, m.userId), 'Removed'); }} aria-label={`Remove ${m.profile.displayName}`}>Remove</button>
                  </span>}
                </li>
              ))}
            </ul>
            {c.members.length < GROUP_MAX && (adding ? (
              <div className="dm-pick" data-testid="dm-add-people">
                {!addable.length && <p className="muted small">All your friends are already here. You can add friends only.</p>}
                {addable.map((f) => { const on = sel.includes(f.id); return <button key={f.id} className={`dm-pick-row ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => setSel((s) => (on ? s.filter((x) => x !== f.id) : [...s, f.id]))}><SAvatar p={f} size={36} /><span className="dm-pick-n"><b>{f.displayName}</b>{f.sample && <SampleTag />}</span><span className={`dm-check ${on ? 'on' : ''}`}>{on && <Icon name="check" size={14} />}</span></button>; })}
                <div className="row" style={{ marginTop: 10 }}><button className="btn sm ghost" onClick={() => { setAdding(false); setSel([]); }}>Cancel</button><button className="btn sm y" disabled={!sel.length || c.members.length + sel.length > GROUP_MAX} onClick={() => run(async () => { await backend.addMembers(c.id, sel); setAdding(false); setSel([]); }, 'Added to the group')}>Add {sel.length || ''}</button></div>
                <p className="muted small">New people don’t see messages sent before they joined.</p>
              </div>
            ) : <button className="btn sm" onClick={() => setAdding(true)} data-testid="dm-add-btn"><Icon name="useradd" size={16} />Add people</button>)}
          </>
        )}
        <div className="dm-actions">
          <button onClick={() => setPrefs(true)}><Icon name={c.muted ? 'mute' : 'bell'} size={18} />{c.muted ? 'Muted' : 'Notifications'} · pin · archive</button>
          {other && (c.blocked === 'byMe'
            ? <button onClick={() => run(() => backend.unblock(other.userId), 'Unblocked')}><Icon name="ban" size={18} />Unblock</button>
            : <button className="danger" onClick={onBlock} data-testid="dm-info-block"><Icon name="ban" size={18} />Block @{other.profile.username}</button>)}
          {other && c.blocked !== 'byMe' && <button onClick={() => restrict.toggle(other.profile).then(onChanged)} data-testid="dm-info-restrict"><Icon name="eyeoff" size={18} />{c.restricted ? `Unrestrict @${other.profile.username}` : `Restrict @${other.profile.username}`}</button>}
          <button className="danger" onClick={onReport} data-testid="dm-info-report"><Icon name="flag" size={18} />Report {c.kind === 'group' ? 'group' : 'conversation'}</button>
        </div>
        <p className="dm-privacy muted small"><Icon name="lock" size={13} /> {PRIVACY_NOTE}</p>
      </div>
      {prefs && <ConvMenu c={c} onClose={() => { setPrefs(false); onChanged(); }} onLeft={() => { onClose(); nav('/messages', { replace: true }); }} />}
    </Sheet>
  );
}

// =====================================================================================================
// New message / new group
// =====================================================================================================
export function NewMessage() { return <SocialGate><NewMessageInner /></SocialGate>; }
function NewMessageInner() {
  const { backend } = useMessages();
  const nav = useNavigate();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [group, setGroup] = useState(false);
  const [sel, setSel] = useState<PublicProfile[]>([]);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [people, setPeople] = useState<{ friends: PublicProfile[]; others: PublicProfile[] } | null>(null);
  useEffect(() => {
    if (!backend) return;
    let live = true;
    const t = window.setTimeout(() => backend.people(q).then((r) => { if (live) setPeople(r); }).catch(() => undefined), q ? 200 : 0);
    return () => { live = false; window.clearTimeout(t); };
  }, [q, backend]);
  const toggle = (p: PublicProfile) => setSel((s) => (s.some((x) => x.id === p.id) ? s.filter((x) => x.id !== p.id) : s.length + 1 >= GROUP_MAX ? s : [...s, p]));
  const create = async () => {
    if (!backend || !sel.length) return;
    setBusy(true);
    try { const id = await backend.createGroup(title || sel.map((p) => p.displayName.split(' ')[0]).join(', ').slice(0, GROUP_TITLE_MAX), sel.map((p) => p.id)); nav(`/messages/chat?c=${encodeURIComponent(id)}`, { replace: true }); }
    catch (e) { toast(friendlyDmError(e)); } finally { setBusy(false); }
  };
  const row = (p: PublicProfile, friend: boolean) => {
    const on = sel.some((x) => x.id === p.id);
    return (
      <button key={p.id} className={`dm-pick-row ${on ? 'on' : ''}`} disabled={group && !friend} aria-pressed={group ? on : undefined}
        onClick={() => (group ? toggle(p) : nav(`/messages/chat?to=${encodeURIComponent(p.username)}`))} data-testid="dm-person">
        <SAvatar p={p} size={44} />
        <span className="dm-pick-n"><b>{p.displayName}{p.sample && <SampleTag />}</b><span className="muted small">@{p.username}{!friend ? (group ? ' · only friends can be added to groups' : ' · message request') : ''}</span></span>
        {group ? <span className={`dm-check ${on ? 'on' : ''}`}>{on && <Icon name="check" size={14} />}</span> : <Icon name="chevron" size={18} />}
      </button>
    );
  };
  return (
    <div className="page dm-new-page" data-testid="dm-new-page">
      <header className="page-head"><button className="icon-btn" aria-label="Back" onClick={() => nav('/messages')}><Icon name="back" /></button><div className="page-title"><div className="kicker">Messages</div><h1>{group ? 'New group' : 'New message'}</h1></div></header>
      <div className="dm-folders" role="tablist">
        <button role="tab" aria-selected={!group} className={!group ? 'on' : ''} onClick={() => { setGroup(false); setSel([]); }}>Message</button>
        <button role="tab" aria-selected={group} className={group ? 'on' : ''} onClick={() => setGroup(true)} data-testid="dm-new-group">Group</button>
      </div>
      {group && <Card className="dm-group-form">
        <label className="field"><span>Group name (optional)</span><input value={title} maxLength={GROUP_TITLE_MAX} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. HYROX Doubles Crew" data-testid="dm-group-title" /></label>
        {sel.length > 0 && <div className="dm-chips">{sel.map((p) => <button key={p.id} className="dm-chip" onClick={() => toggle(p)} aria-label={`Remove ${p.displayName}`}>{p.displayName.split(' ')[0]} <Icon name="x" size={12} /></button>)}</div>}
        <button className="btn y block" disabled={!sel.length || busy} onClick={create} data-testid="dm-create-group">{busy ? 'Creating…' : `Create group${sel.length ? ` (${sel.length + 1})` : ''}`}</button>
        <p className="muted small">Up to {GROUP_MAX} people. You can add friends; anyone can leave at any time. Admins can rename the group and remove people.</p>
      </Card>}
      <label className="dm-search"><Icon name="search" size={18} /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={group ? 'Search friends' : 'Search name or @handle'} aria-label="Search people" autoFocus data-testid="dm-people-search" /></label>
      {!people ? <p className="muted">Loading…</p> : (
        <div className="dm-pick">
          {people.friends.length > 0 && <div className="dm-sec">Friends</div>}
          {people.friends.map((p) => row(p, true))}
          {people.others.length > 0 && <div className="dm-sec">Others on HYBRD</div>}
          {people.others.map((p) => row(p, false))}
          {!people.friends.length && !people.others.length && <Empty icon="users" title={q ? 'No one found' : 'No friends yet'}>{q ? 'Check the spelling or search by @handle.' : <>Find people on <Link className="link" to="/social/friends?tab=find">Friends</Link>, or search by @handle.</>}</Empty>}
        </div>
      )}
      <p className="muted small" style={{ marginTop: 14 }}>People you’re not friends with get a message request. They decide whether to accept, and you can send up to {REQUEST_MAX_MESSAGES} messages until they do. Some people only accept messages from friends.</p>
    </div>
  );
}

// =====================================================================================================
// Privacy settings
// =====================================================================================================
export function MessageSettings() { return <SocialGate><MessageSettingsInner /></SocialGate>; }
function MessageSettingsInner() {
  const { settings, saveSettings } = useMessages();
  const { me } = useSocial();
  const calls = useCalls();
  const toast = useToast();
  const nav = useNavigate();
  const dndOn = dndActive(settings.dndUntil);
  const save = async (p: Partial<typeof settings>) => { try { await saveSettings({ ...settings, ...p }); toast('Saved'); } catch (e) { toast(friendlyDmError(e)); } };
  return (
    <div className="page dm-settings" data-testid="dm-settings">
      <header className="page-head"><button className="icon-btn" aria-label="Back" onClick={() => nav('/settings')}><Icon name="back" /></button><div className="page-title"><div className="kicker">Settings</div><h1>Messages & calls</h1></div></header>
      <Card>
        <h3>Who can message you</h3>
        {me?.isMinor && <p className="muted small" data-testid="dm-minor-note"><Icon name="lock" size={13} /> You’re under 18, so adults you’re not friends with can never message you, whatever you choose here.</p>}
        <div className="s-reasons" role="radiogroup" aria-label="Who can message you">
          {DM_WHO.map((w) => (
            <button key={w.v} role="radio" aria-checked={settings.who === w.v} className={settings.who === w.v ? 'on' : ''} onClick={() => save({ who: w.v })} data-testid={`dm-who-${w.v}`}>
              <span className="s-radio" /><span><b>{w.label}</b><span className="muted small">{w.sub}</span></span>
            </button>
          ))}
        </div>
      </Card>
      <Card>
        <button className="toggle" style={{ width: '100%', textAlign: 'left' }} onClick={() => save({ readReceipts: !settings.readReceipts })} aria-pressed={settings.readReceipts} data-testid="dm-receipts">
          <span><b>Read receipts</b><div className="muted small">Show “Seen” when you’ve read a message. Turn it off and you won’t see others’ either.</div></span><span className={`switch ${settings.readReceipts ? 'on' : ''}`} />
        </button>
        <button className="toggle" style={{ width: '100%', textAlign: 'left' }} onClick={() => save({ activity: !settings.activity })} aria-pressed={settings.activity} data-testid="dm-activity">
          <span><b>Activity status and typing</b><div className="muted small">Show “Active now” and when you’re typing to people you chat with. Turn it off and you won’t see theirs.</div></span><span className={`switch ${settings.activity ? 'on' : ''}`} />
        </button>
      </Card>
      {calls.backend && <Card>
        <h3 id="calls">Calls</h3>
        <div data-testid="dm-calls-settings">
          <div className="dm-set-l">Who can call you</div>
          {me?.isMinor && <p className="muted small" data-testid="dm-calls-minor"><Icon name="lock" size={13} /> You’re under 18, so only your friends can call you, and you can only call friends.</p>}
          <div className="s-reasons" role="radiogroup" aria-label="Who can call you">
            {CALL_WHO.map((w) => {
              const off = !!me?.isMinor && w.v === 'everyone';
              return (
                <button key={w.v} role="radio" aria-checked={settings.calls === w.v} disabled={off} className={settings.calls === w.v ? 'on' : ''} onClick={() => save({ calls: w.v })} data-testid={`dm-callwho-${w.v}`}>
                  <span className="s-radio" /><span><b>{w.label}</b><span className="muted small">{off ? 'Not available for under-18 accounts.' : w.sub}</span></span>
                </button>
              );
            })}
          </div>
          <p className="muted small">Message requests and blocked accounts can never call you.</p>
          <div className="dm-set-l" style={{ marginTop: 14 }}>Do not disturb {dndOn && <span className="dm-dnd-on" data-testid="dm-dnd-status">{dndLabel(settings.dndUntil)}</span>}</div>
          <p className="muted small">Calls won’t ring. Callers just see “No answer” — they aren’t told you turned this on. Missed calls still show in Calls.</p>
          <div className="dm-dnd" role="radiogroup" aria-label="Do not disturb">
            {DND_OPTIONS.map((o) => {
              const on = o.v === 'off' ? !dndOn : false;
              return <button key={o.v} role="radio" aria-checked={on} className={`chip ${on ? 'on' : ''}`} onClick={() => save({ dndUntil: dndUntilFor(o.v) })} data-testid={`dm-dnd-${o.v}`}>{o.label}</button>;
            })}
          </div>
          {calls.relay.available ? (
            <button className="toggle" style={{ width: '100%', textAlign: 'left', marginTop: 12 }} onClick={() => calls.setRelay(!calls.relay.on)} aria-pressed={calls.relay.on} data-testid="dm-call-relay">
              <span><b>Protect my IP address in calls</b><div className="muted small">Send calls through HYBRD’s relay server so the people you call can’t see your network address. Can add a little delay.</div></span><span className={`switch ${calls.relay.on ? 'on' : ''}`} />
            </button>
          ) : <p className="muted small" style={{ marginTop: 12 }}><Icon name="info" size={13} /> Calls connect peer to peer, so the people you call can see your network (IP) address, like most calling apps.{calls.backend.kind === 'live' ? ' (A relay option appears here once the server has one set up.)' : ''}</p>}
          <ul className="dm-safety" style={{ marginTop: 10 }}>
            <li><Icon name="lock" size={16} /><span>Call audio and video are encrypted in transit by WebRTC (DTLS-SRTP) and go peer to peer. Honest note: HYBRD’s calling hasn’t had an independent security audit.</span></li>
            <li><Icon name="bell" size={16} /><span>Calls ring only while HYBRD is open (browser tab or installed app). There are no push notifications for calls yet, so you’ll see missed calls next time you open the app.</span></li>
            <li><Icon name="flag" size={16} /><span>Report someone from the call screen (ⓘ) or chat details.</span></li>
          </ul>
        </div>
      </Card>}
      <Card>
        <h3>Safety</h3>
        <ul className="dm-safety">
          <li><Icon name="lock" size={16} /><span>Requests from people you’re not friends with wait in <b>Requests</b>. They can send up to {REQUEST_MAX_MESSAGES} messages, can’t see if you’ve read them, and photos stay blurred until you tap.</span></li>
          <li><Icon name="ban" size={16} /><span>Blocking stops someone messaging you and hides you from each other. They aren’t told. <Link className="link" to="/social/friends?tab=blocked">Blocked accounts</Link></span></li>
          <li><Icon name="flag" size={16} /><span>Report a message or a chat from the long-press menu or chat details. The HYBRD team reviews reports.</span></li>
          <li><Icon name="info" size={16} /><span>Links aren’t previewed or opened automatically, and HYBRD warns you about links and scam wording from people you don’t know.</span></li>
          <li><Icon name="mind" size={16} /><span>Going through something hard? Call or text <a className="link" href="tel:988">988</a> (US, 24/7). In danger now, call 911.</span></li>
        </ul>
        <p className="dm-privacy muted small" data-testid="dm-not-e2e"><Icon name="lock" size={13} /> {PRIVACY_NOTE} Your email and phone number are never shown to people you message.</p>
      </Card>
    </div>
  );
}
