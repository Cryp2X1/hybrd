// Messages (private DMs + group chats) — pure rules, no DOM and no network, so tools/test-messages.ts can run them in Node.
// The same rules are enforced server-side in supabase/schema.sql (RLS, triggers and dm_* RPCs); this file mirrors them for
// the demo backend and for instant UI feedback. See APP-BUILDER-NOTES.md › "Messages".
//
// PRIVACY: messages are stored in Supabase and protected by Row Level Security (only people in the chat can read them).
// They are NOT end-to-end encrypted. Never describe them as encrypted in the UI.
import { areFriends, cleanText, friendIds, isBlocked, maskProfanity, rateCheck, summarizeReactions, REACTION_TYPES, type Graph, type Limit, type PublicProfile, type ReactionSummary, type ReactionType, type WorkoutCard } from './social';
import { crisisInText } from './mind';

export { crisisInText };

// ---------- limits ----------
export const MSG_MAX = 2000;
/** Messages a non-friend can send before the other person accepts the request (Instagram allows one; we allow a short intro). */
export const REQUEST_MAX_MESSAGES = 3;
export const EDIT_WINDOW_MS = 15 * 60_000;
export const GROUP_MAX = 32;
export const GROUP_TITLE_MAX = 50;
export const MAX_PINS = 3;
export const MSG_IMG_MAX_BYTES = 8 * 1024 * 1024;
/** Same as the Supabase Free plan's global per-file cap and the message-media bucket limit. */
export const MSG_VIDEO_MAX_BYTES = 50 * 1024 * 1024;
export const MSG_VIDEO_MAX_SECONDS = 180;
export const MSG_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm'];
export const TYPING_TTL_MS = 6000;
export const MAX_AUTO_ATTEMPTS = 6;

export const DM_LIMITS = {
  messageMinute: { max: 30, windowMs: 60_000, label: 'messages a minute' },
  messageHour: { max: 400, windowMs: 3600_000, label: 'messages an hour' },
  newChatHour: { max: 20, windowMs: 3600_000, label: 'new chats an hour' },
  requestDay: { max: 30, windowMs: 86_400_000, label: 'message requests a day' },
  groupDay: { max: 20, windowMs: 86_400_000, label: 'new groups a day' },
  reactHour: { max: 300, windowMs: 3600_000, label: 'reactions an hour' },
  reportDay: { max: 30, windowMs: 86_400_000, label: 'reports a day' },
} satisfies Record<string, Limit>;

// ---------- types ----------
export type DmWho = 'everyone' | 'fof' | 'friends' | 'none';
export interface DmSettings { who: DmWho; readReceipts: boolean; activity: boolean }
export const DM_WHO: { v: DmWho; label: string; sub: string }[] = [
  { v: 'everyone', label: 'Everyone', sub: 'Friends chat with you. Anyone else lands in Requests.' },
  { v: 'fof', label: 'Friends of friends', sub: 'Friends, plus requests from people you share a friend with.' },
  { v: 'friends', label: 'Friends only', sub: 'Only your friends can start a chat with you.' },
  { v: 'none', label: 'No one', sub: 'No new chats. Chats you already have keep working.' },
];
export const defaultDmSettings = (isMinor = false): DmSettings => ({ who: isMinor ? 'friends' : 'everyone', readReceipts: true, activity: true });
export function normalizeDmSettings(s: Partial<DmSettings> | null | undefined, isMinor = false): DmSettings {
  const d = defaultDmSettings(isMinor);
  const who = s?.who && ['everyone', 'fof', 'friends', 'none'].includes(s.who) ? s.who : d.who;
  return { who, readReceipts: s?.readReceipts ?? d.readReceipts, activity: s?.activity ?? d.activity };
}

export type ConvKind = 'direct' | 'group';
export type MemberState = 'active' | 'request' | 'declined' | 'left' | 'removed';
export type MemberRole = 'admin' | 'member';
export interface Member {
  userId: string;
  role: MemberRole;
  state: MemberState;
  joinedAt: number;
  /** Private: when this person last opened the chat. Others only learn it through `seenAt` (read receipts on, both ways). */
  lastReadAt: number;
  deliveredAt: number;
  mutedUntil?: number;
  archived?: boolean;
  pinnedAt?: number;
  /** "Delete chat" for me: messages before this are hidden for this member only. */
  clearedAt?: number;
  addedBy?: string;
}
export interface Conversation { id: string; kind: ConvKind; title?: string; createdBy: string; createdAt: number; lastMessageAt: number; members: Member[] }
export type MsgKind = 'text' | 'image' | 'video' | 'workout' | 'system';
export interface MsgMedia { url: string; path?: string; w: number; h: number; mime: string; size?: number; duration?: number; poster?: string; posterPath?: string }
export type SystemType = 'created' | 'renamed' | 'added' | 'removed' | 'left' | 'admin' | 'accepted';
export interface SystemEvent { type: SystemType; actor: string; targets?: string[]; title?: string }
export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  kind: MsgKind;
  body: string;
  media?: MsgMedia;
  workout?: WorkoutCard;
  replyTo?: string;
  forwarded?: boolean;
  system?: SystemEvent;
  createdAt: number;
  editedAt?: number;
  /** Unsent for everyone: body/media are wiped, a "Message unsent" placeholder stays. */
  deletedAt?: number;
}
export interface MsgReaction { messageId: string; userId: string; type: ReactionType; createdAt: number }
export class DmError extends Error { code: string; constructor(code: string, msg: string) { super(msg); this.code = code; } }

// ---------- helpers ----------
export const directKey = (a: string, b: string) => (a < b ? `${a}:${b}` : `${b}:${a}`);
export const memberOf = (c: Pick<Conversation, 'members'>, u: string) => c.members.find((m) => m.userId === u);
export const activeMembers = (c: Pick<Conversation, 'members'>) => c.members.filter((m) => m.state === 'active' || m.state === 'request');
export const otherMembers = (c: Pick<Conversation, 'members'>, me: string) => c.members.filter((m) => m.userId !== me && (m.state === 'active' || m.state === 'request' || m.state === 'declined'));
export const isParticipant = (c: Pick<Conversation, 'members'>, me: string) => { const m = memberOf(c, me); return !!m && (m.state === 'active' || m.state === 'request'); };
export const isMuted = (m: Pick<Member, 'mutedUntil'> | undefined, now = Date.now()) => !!m?.mutedUntil && m.mutedUntil > now;
export const MUTE_FOREVER = 8_640_000_000_000_000; // max JS date
export function isFriendOfFriend(g: Graph, a: string, b: string): boolean {
  const fa = new Set(friendIds(g, a));
  return friendIds(g, b).some((x) => fa.has(x));
}

// ---------- who can message whom ----------
export type DenyReason = 'self' | 'unavailable' | 'no_one' | 'friends_only' | 'fof_only' | 'minor' | 'not_member';
export type Eligibility = { ok: true; request: boolean } | { ok: false; reason: DenyReason; msg: string };
const deny = (reason: DenyReason, msg: string): Eligibility => ({ ok: false, reason, msg });
export interface EligCtx {
  me: string;
  other: string;
  graph: Graph;
  meMinor?: boolean;
  otherMinor?: boolean;
  otherSettings: DmSettings;
  /** An existing direct chat in which the other person is already an active member. */
  existingActive?: boolean;
}
/** Can `me` start (or continue) a 1:1 chat with `other`? Blocks are never revealed (same generic text both ways). */
export function eligibility(c: EligCtx): Eligibility {
  if (c.me === c.other) return deny('self', 'That’s you.');
  if (isBlocked(c.graph, c.me, c.other)) return deny('unavailable', 'You can’t message this account.');
  const friends = areFriends(c.graph, c.me, c.other);
  // Under-18 safety: no chats between a minor and an adult unless they are friends (both directions, existing chats too).
  if (!friends && !!c.meMinor !== !!c.otherMinor) return deny('minor', c.otherMinor ? 'To keep teens safe, you can only message under-18 accounts you’re friends with.' : 'Under-18 accounts can only message adults they’re friends with.');
  if (c.existingActive) return { ok: true, request: false };
  switch (c.otherSettings.who) {
    case 'none': return deny('no_one', 'This person isn’t accepting new messages.');
    case 'friends': return friends ? { ok: true, request: false } : deny('friends_only', 'Only their friends can message them. Send a friend request first.');
    case 'fof': return friends ? { ok: true, request: false } : isFriendOfFriend(c.graph, c.me, c.other) ? { ok: true, request: true } : deny('fof_only', 'Only friends and friends of friends can message them.');
    default: return { ok: true, request: !friends };
  }
}

/** Groups: you can add your friends; nobody blocked (either way) with someone already in the chat; minor ↔ adult only between friends. */
export function canAddToGroup(c: { adder: string; user: string; graph: Graph; members: string[]; minors: Set<string>; settings?: DmSettings }): { ok: boolean; msg?: string } {
  if (c.user === c.adder) return { ok: false, msg: 'That’s you.' };
  if (c.members.includes(c.user)) return { ok: false, msg: 'Already in the group.' };
  if (!areFriends(c.graph, c.adder, c.user)) return { ok: false, msg: 'You can only add your friends to a group.' };
  if (c.settings?.who === 'none') return { ok: false, msg: 'This person isn’t accepting new chats.' };
  if (c.members.some((m) => isBlocked(c.graph, m, c.user))) return { ok: false, msg: 'This person can’t be added to this group.' };
  const userMinor = c.minors.has(c.user);
  for (const m of c.members) {
    if (c.minors.has(m) !== userMinor && !areFriends(c.graph, m, c.user)) return { ok: false, msg: 'To keep teens safe, under-18s and adults can only share a group when they’re friends.' };
  }
  return { ok: true };
}
export function validateGroupTitle(t: string): { ok: boolean; value: string; error?: string } {
  const value = maskProfanity((t || '').replace(/\s+/g, ' ').trim()).slice(0, GROUP_TITLE_MAX);
  if (!value) return { ok: false, value, error: 'Give the group a name.' };
  return { ok: true, value };
}
export type GroupAction = 'rename' | 'remove' | 'admin' | 'add' | 'leave';
export function canManage(conv: Pick<Conversation, 'kind' | 'members'>, me: string, action: GroupAction): boolean {
  if (conv.kind !== 'group') return false;
  const m = memberOf(conv, me);
  if (!m || m.state !== 'active') return false;
  if (action === 'add' || action === 'leave') return true;
  return m.role === 'admin';
}
/** After someone leaves: if no admin is left, the longest-standing active member becomes admin. */
export function promoteIfNoAdmin(members: Member[]): Member[] {
  const active = members.filter((m) => m.state === 'active');
  if (!active.length || active.some((m) => m.role === 'admin')) return members;
  const next = active.slice().sort((a, b) => a.joinedAt - b.joinedAt)[0].userId;
  return members.map((m) => (m.userId === next ? { ...m, role: 'admin' as const } : m));
}

// ---------- requests + sending ----------
/** Outgoing request: the other person hasn't accepted (still 'request', or quietly 'declined' — the sender is never told). */
export function outgoingRequest(conv: Pick<Conversation, 'kind' | 'members'>, me: string): boolean {
  if (conv.kind !== 'direct') return false;
  const o = conv.members.find((m) => m.userId !== me);
  return !!o && (o.state === 'request' || o.state === 'declined');
}
export const incomingRequest = (conv: Pick<Conversation, 'members'>, me: string) => memberOf(conv, me)?.state === 'request';
export function requestRemaining(conv: Pick<Conversation, 'kind' | 'members' | 'id'>, me: string, msgs: Pick<Message, 'conversationId' | 'senderId' | 'kind'>[]): number {
  if (!outgoingRequest(conv, me)) return Infinity;
  const sent = msgs.filter((m) => m.conversationId === conv.id && m.senderId === me && m.kind !== 'system').length;
  return Math.max(0, REQUEST_MAX_MESSAGES - sent);
}
export type SendCheck = { ok: true } | { ok: false; code: string; msg: string };
export function canSend(conv: Conversation, me: string, msgs: Pick<Message, 'conversationId' | 'senderId' | 'kind'>[], g: Graph): SendCheck {
  const m = memberOf(conv, me);
  if (!m || m.state === 'left' || m.state === 'removed' || m.state === 'declined') return { ok: false, code: 'dm_not_member', msg: 'You’re no longer in this chat.' };
  if (m.state === 'request') return { ok: false, code: 'dm_accept_first', msg: 'Accept the request to reply.' };
  if (conv.kind === 'direct') {
    const o = conv.members.find((x) => x.userId !== me);
    if (o && isBlocked(g, me, o.userId)) return { ok: false, code: 'dm_blocked', msg: 'You can’t message this account.' };
    if (requestRemaining(conv, me, msgs) <= 0) return { ok: false, code: 'dm_request_limit', msg: `You can send up to ${REQUEST_MAX_MESSAGES} messages until they accept your request.` };
  }
  return { ok: true };
}
export function checkRate(times: number[], lim: Limit, now = Date.now()) { const r = rateCheck(times, lim, now); if (r) throw new DmError('rate_limit', r.msg); }

// ---------- message text ----------
export const cleanMessage = (s: string) => cleanText(s, MSG_MAX);
export function validateDraft(d: { kind: MsgKind; body: string; hasMedia?: boolean; hasWorkout?: boolean }): string | null {
  if (d.kind === 'system') return 'Not allowed.';
  if ([...(d.body || '')].length > MSG_MAX) return `Messages are limited to ${MSG_MAX.toLocaleString()} characters.`;
  if (d.kind === 'text' && !d.body.trim()) return 'Write something first.';
  if ((d.kind === 'image' || d.kind === 'video') && !d.hasMedia) return 'Attach a photo or video.';
  if (d.kind === 'workout' && !d.hasWorkout) return 'Pick a workout to share.';
  return null;
}
export function checkMessageMedia(f: { type: string; size: number; duration?: number }): string | null {
  if (!MSG_MEDIA_TYPES.includes(f.type)) return 'Send photos (JPEG, PNG, WebP) or videos (MP4, MOV, WebM).';
  const video = f.type.startsWith('video/');
  if (!video && f.size > MSG_IMG_MAX_BYTES) return 'That photo is too large to send (8 MB max after compression).';
  if (video && f.size > MSG_VIDEO_MAX_BYTES) return 'Videos can be up to 50 MB in a message. Trim it in your Photos app first.';
  if (video && f.duration && f.duration > MSG_VIDEO_MAX_SECONDS + 0.5) return `Videos can be up to ${MSG_VIDEO_MAX_SECONDS / 60} minutes in a message.`;
  return null;
}

// ---------- edit / unsend / delete for me ----------
export const canEdit = (m: Pick<Message, 'senderId' | 'kind' | 'createdAt' | 'deletedAt'>, me: string, now = Date.now()) =>
  m.senderId === me && !m.deletedAt && m.kind !== 'system' && m.kind !== 'workout' && now - m.createdAt <= EDIT_WINDOW_MS;
export const canUnsend = (m: Pick<Message, 'senderId' | 'kind' | 'deletedAt'>, me: string) => m.senderId === me && !m.deletedAt && m.kind !== 'system';
export function applyEdit<M extends Message>(m: M, body: string, me: string, now = Date.now()): M {
  if (m.senderId !== me) throw new DmError('dm_not_sender', 'You can only edit your own messages.');
  if (m.deletedAt) throw new DmError('dm_deleted', 'This message was unsent.');
  if (now - m.createdAt > EDIT_WINDOW_MS) throw new DmError('dm_edit_window', 'Messages can only be edited for 15 minutes.');
  if (!canEdit(m, me, now)) throw new DmError('dm_not_editable', 'This message can’t be edited.');
  const b = cleanMessage(body);
  if (!b && m.kind === 'text') throw new DmError('dm_empty', 'Write something first.');
  if (b === m.body) return m;
  return { ...m, body: b, editedAt: now };
}
export function applyUnsend<M extends Message>(m: M, me: string, now = Date.now()): M {
  if (m.senderId !== me) throw new DmError('dm_not_sender', 'You can only unsend your own messages.');
  if (m.deletedAt) return m;
  return { ...m, body: '', media: undefined, workout: undefined, deletedAt: now };
}

// ---------- reactions (same 7 as posts and comments) ----------
export function applyMsgReaction(list: MsgReaction[], userId: string, messageId: string, type: ReactionType | null, now: number): { list: MsgReaction[]; prev: ReactionType | null; next: ReactionType | null } {
  const i = list.findIndex((r) => r.userId === userId && r.messageId === messageId);
  const prev = i >= 0 ? list[i].type : null;
  if (type === null || type === prev) return { list: i >= 0 ? list.filter((_, k) => k !== i) : list, prev, next: null };
  if (i >= 0) { const n = list.slice(); n[i] = { ...n[i], type, createdAt: now }; return { list: n, prev, next: type }; }
  return { list: [...list, { messageId, userId, type, createdAt: now }], prev, next: type };
}
export function messageReactions(list: MsgReaction[], messageId: string, me: string, g?: Graph): { summary: ReactionSummary; mine: ReactionType | null } {
  const rs = list.filter((r) => r.messageId === messageId && (!g || r.userId === me || !isBlocked(g, me, r.userId)));
  return { summary: summarizeReactions(rs), mine: rs.find((r) => r.userId === me)?.type ?? null };
}
export { REACTION_TYPES };

// ---------- visibility, unread, folders ----------
export function visibleMessages<M extends Pick<Message, 'conversationId' | 'createdAt' | 'id'>>(msgs: M[], conv: Pick<Conversation, 'id' | 'members'>, me: string, hidden: Set<string> = new Set()): M[] {
  const m = memberOf(conv, me);
  const from = m?.clearedAt || 0;
  return msgs.filter((x) => x.conversationId === conv.id && x.createdAt > from && !hidden.has(x.id)).sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1));
}
export function unreadCount(conv: Pick<Conversation, 'id' | 'members'>, me: string, msgs: Pick<Message, 'conversationId' | 'senderId' | 'createdAt' | 'kind' | 'deletedAt' | 'id'>[], hidden: Set<string> = new Set()): number {
  const m = memberOf(conv, me);
  if (!m) return 0;
  const from = Math.max(m.lastReadAt || 0, m.clearedAt || 0);
  return msgs.filter((x) => x.conversationId === conv.id && x.senderId !== me && x.kind !== 'system' && !x.deletedAt && x.createdAt > from && !hidden.has(x.id)).length;
}
export type Folder = 'chats' | 'requests' | 'archived';
export function folderOf(conv: Pick<Conversation, 'members' | 'lastMessageAt' | 'createdBy'>, me: string): Folder | null {
  const m = memberOf(conv, me);
  if (!m || m.state === 'declined' || m.state === 'left' || m.state === 'removed') return null;
  if (!conv.lastMessageAt) return null; // empty chats stay hidden until the first message
  if (m.clearedAt && m.clearedAt >= conv.lastMessageAt) return null; // deleted for me and nothing new since
  if (m.state === 'request') return 'requests';
  return m.archived ? 'archived' : 'chats';
}
export function sortInbox<C extends Pick<Conversation, 'members' | 'lastMessageAt'>>(convs: C[], me: string): C[] {
  return convs.slice().sort((a, b) => {
    const pa = memberOf(a, me)?.pinnedAt || 0, pb = memberOf(b, me)?.pinnedAt || 0;
    if (!!pa !== !!pb) return pa ? -1 : 1;
    if (pa && pb && pa !== pb) return pa - pb; // pinned: in the order they were pinned
    return b.lastMessageAt - a.lastMessageAt;
  });
}
/** Header badge: chats with unread messages (muted and archived don't count) + unread message requests. */
export function inboxBadge(items: { folder: Folder | null; unread: number; muted: boolean }[]): number {
  return items.filter((i) => i.unread > 0 && ((i.folder === 'chats' && !i.muted) || i.folder === 'requests')).length;
}

// ---------- status: sent / delivered / seen ----------
export type MsgStatus = 'sending' | 'failed' | 'sent' | 'delivered' | 'seen';
export interface StatusCtx {
  conv: Pick<Conversation, 'kind' | 'members'>;
  me: string;
  /** Viewer's own read-receipt setting (receipts are reciprocal: turn yours off and you don't see others'). */
  myReceipts: boolean;
  /** Per member: their read-receipt setting. Missing = on. */
  receipts?: Record<string, boolean>;
}
/** Status of MY message. Requests never show more than "Sent" until accepted. Seen needs read receipts on for both people. */
export function messageStatus(m: Pick<Message, 'senderId' | 'createdAt' | 'kind'>, c: StatusCtx): { status: MsgStatus; seenBy: string[] } | null {
  if (m.senderId !== c.me || m.kind === 'system') return null;
  const others = c.conv.members.filter((x) => x.userId !== c.me && (x.state === 'active' || x.state === 'request' || x.state === 'declined'));
  if (!others.length) return { status: 'sent', seenBy: [] };
  if (others.some((o) => o.state !== 'active')) return { status: 'sent', seenBy: [] };
  const seenBy = c.myReceipts ? others.filter((o) => (c.receipts?.[o.userId] ?? true) && o.lastReadAt >= m.createdAt).map((o) => o.userId) : [];
  if (seenBy.length && seenBy.length === others.length) return { status: 'seen', seenBy };
  if (others.every((o) => Math.max(o.deliveredAt || 0, o.lastReadAt || 0) >= m.createdAt)) return { status: 'delivered', seenBy };
  return { status: 'sent', seenBy };
}
export const STATUS_LABEL: Record<MsgStatus, string> = { sending: 'Sending…', failed: 'Not sent', sent: 'Sent', delivered: 'Delivered', seen: 'Seen' };

// ---------- presence + typing ----------
export function canSeePresence(viewer: Pick<DmSettings, 'activity'>, target: Pick<DmSettings, 'activity'>, blocked: boolean): boolean {
  return !blocked && viewer.activity && target.activity;
}
export function presenceText(lastActive: number | undefined | null, now = Date.now()): string | null {
  if (!lastActive) return null;
  const s = Math.max(0, (now - lastActive) / 1000);
  if (s < 180) return 'Active now';
  if (s < 3600) return `Active ${Math.round(s / 60)}m ago`;
  if (s < 86_400) return `Active ${Math.round(s / 3600)}h ago`;
  return null;
}
export function typingLabel(names: string[]): string {
  if (!names.length) return '';
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  return 'Several people are typing…';
}
export function liveTyping(m: Record<string, number>, now = Date.now()): string[] { return Object.entries(m).filter(([, t]) => now - t < TYPING_TTL_MS).map(([u]) => u); }

// ---------- links (no automatic previews: nothing is fetched from a URL someone sent) ----------
export interface Seg { t: 'text' | 'link'; v: string; href?: string; domain?: string; risky?: boolean }
const URL_RE = /\b((?:https?:\/\/|www\.)[^\s<>"'`]+)/gi;
/** Only http(s). "www." gets https://. javascript:, data:, file: and anything else is plain text. */
export function safeHref(raw: string): string | null {
  let s = raw.trim().replace(/[),.!?;:'"\]]+$/, '');
  if (/^www\./i.test(s)) s = 'https://' + s;
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    if (!u.hostname || !u.hostname.includes('.')) return null;
    return u.toString();
  } catch { return null; }
}
const SHORTENERS = ['bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'is.gd', 'buff.ly', 'cutt.ly', 'rb.gy', 'shorturl.at', 'tiny.cc', 'rebrand.ly', 't.ly', 'lnkd.in', 's.id'];
export function linkRisk(href: string): { risky: boolean; reasons: string[] } {
  const reasons: string[] = [];
  let u: URL;
  try { u = new URL(href); } catch { return { risky: true, reasons: ['Not a normal web address'] }; }
  const host = u.hostname.toLowerCase();
  if (u.protocol === 'http:') reasons.push('Not a secure (https) link');
  if (SHORTENERS.includes(host.replace(/^www\./, ''))) reasons.push('Shortened link hides where it goes');
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':')) reasons.push('Uses a raw IP address');
  if (host.split('.').some((p) => p.startsWith('xn--'))) reasons.push('Uses look-alike characters');
  if (u.username || u.password || /@/.test(u.href.split('?')[0].replace(/^https?:\/\//, '').split('/')[0])) reasons.push('Hides the real address');
  if (/hybrd/.test(host) && !/(^|\.)github\.io$/.test(host) && !/(^|\.)hybrd\.app$/.test(host)) reasons.push('Pretends to be HYBRD');
  if (host.split('.').length > 5) reasons.push('Unusually long address');
  return { risky: reasons.length > 0, reasons };
}
export function linkify(text: string): Seg[] {
  const out: Seg[] = [];
  let last = 0;
  for (const m of (text || '').matchAll(URL_RE)) {
    const raw = m[1].replace(/[),.!?;:'"\]]+$/, '');
    const href = safeHref(raw);
    const i = m.index!;
    if (i > last) out.push({ t: 'text', v: text.slice(last, i) });
    if (href) { const domain = new URL(href).hostname.replace(/^www\./, ''); out.push({ t: 'link', v: raw, href, domain, risky: linkRisk(href).risky }); }
    else out.push({ t: 'text', v: raw });
    last = i + raw.length;
  }
  if (last < (text || '').length) out.push({ t: 'text', v: text.slice(last) });
  return out;
}
export const hasLink = (text: string) => linkify(text).some((s) => s.t === 'link');
const SCAM = [
  /\bgift ?cards?\b/i, /\bwire (me|the money|transfer)\b/i, /\b(crypto|bitcoin|btc|usdt|forex)\b.*\b(invest|profit|return|double)/i, /\b(invest|profit)\b.*\b(crypto|bitcoin|forex)\b/i,
  /\bverify (your|ur) (account|identity|password)\b/i, /\b(password|passcode|login code|verification code|2fa code)\b/i, /\bcash ?app\b|\bzelle\b|\bvenmo me\b|\bpaypal me\b/i,
  /\b(whats ?app|telegram|signal)\b.*\b(me|chat|text|add)\b|\b(add|text|chat) me on (whats ?app|telegram|signal)\b/i, /\bgiveaway\b|\byou('ve| have)? won\b|\bclaim (your|ur) (prize|reward)\b/i,
  /\bsugar (daddy|mommy)\b/i, /\bsend (me )?(nudes|pics)\b/i, /\bguaranteed (results|returns|profit)\b/i,
];
export const scamSignals = (text: string) => SCAM.filter((r) => r.test(text || '')).length;
/** Banner for a first message from a stranger: any link, or common scam wording. */
export function strangerWarning(msgs: Pick<Message, 'body' | 'kind'>[]): string | null {
  const links = msgs.some((m) => hasLink(m.body));
  const scam = msgs.some((m) => scamSignals(m.body) > 0);
  if (scam) return 'This message has signs of a scam. HYBRD will never ask for your password, codes or money in a message. Don’t share personal details or send payment.';
  if (links) return 'This message has a link from someone you don’t know. Only open it if you trust them. Links can lead to scams or fake log-in pages.';
  return null;
}
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_RE = /(?:\+?\d[\s().-]*){7,}/;
export const hasContactInfo = (text: string) => EMAIL_RE.test(text || '') || PHONE_RE.test((text || '').replace(/\b\d{1,2}:\d{2}\b/g, ''));

// ---------- dates + grouping ----------
export const dayKey = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export function dayLabel(t: number, now = Date.now()): string {
  const d = new Date(t), n = new Date(now);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(n) - startOf(d)) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff > 1 && diff < 7) return d.toLocaleDateString('en-US', { weekday: 'long' });
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', ...(d.getFullYear() !== n.getFullYear() ? { year: 'numeric' } : {}) });
}
export const clockTime = (t: number) => new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
export function listTime(t: number, now = Date.now()): string {
  if (dayKey(t) === dayKey(now)) return clockTime(t);
  const l = dayLabel(t, now);
  return l === 'Yesterday' ? 'Yesterday' : new Date(t).toLocaleDateString('en-US', l.includes(',') || /\d/.test(l) ? { month: 'short', day: 'numeric' } : { weekday: 'short' });
}
export type ChatItem<M> = { t: 'day'; key: string; label: string } | { t: 'msg'; key: string; m: M; first: boolean; last: boolean };
const CLUSTER_MS = 5 * 60_000;
/** Date separators + bubble clusters (same sender, within 5 minutes, not across a system message). */
export function chatItems<M extends Pick<Message, 'id' | 'senderId' | 'createdAt' | 'kind'>>(msgs: M[], now = Date.now()): ChatItem<M>[] {
  const out: ChatItem<M>[] = [];
  let lastDay = '';
  msgs.forEach((m, i) => {
    const k = dayKey(m.createdAt);
    if (k !== lastDay) { out.push({ t: 'day', key: 'd' + k, label: dayLabel(m.createdAt, now) }); lastDay = k; }
    const prev = msgs[i - 1], next = msgs[i + 1];
    const joins = (a?: M, b?: M) => !!a && !!b && a.senderId === b.senderId && a.kind !== 'system' && b.kind !== 'system' && Math.abs(b.createdAt - a.createdAt) < CLUSTER_MS && dayKey(a.createdAt) === dayKey(b.createdAt);
    out.push({ t: 'msg', key: m.id, m, first: !joins(prev, m), last: !joins(m, next) });
  });
  return out;
}

// ---------- previews, names ----------
export function mediaLabel(m: Pick<Message, 'kind'>): string { return m.kind === 'image' ? '📷 Photo' : m.kind === 'video' ? '🎥 Video' : m.kind === 'workout' ? '🏋️ Workout' : ''; }
export function systemText(e: SystemEvent, name: (id: string) => string, me: string): string {
  const who = e.actor === me ? 'You' : name(e.actor);
  const list = (e.targets || []).map((t) => (t === me ? 'you' : name(t))).join(', ');
  switch (e.type) {
    case 'created': return `${who} created the group${e.title ? ` “${e.title}”` : ''}`;
    case 'renamed': return `${who} named the group “${e.title || ''}”`;
    case 'added': return `${who} added ${list}`;
    case 'removed': return `${who} removed ${list}`;
    case 'left': return `${who} left the group`;
    case 'admin': return `${who} made ${list} an admin`;
    case 'accepted': return `${who} accepted the message request`;
  }
}
export function previewText(m: Pick<Message, 'kind' | 'body' | 'senderId' | 'deletedAt' | 'system'> | null | undefined, me: string, name: (id: string) => string, group = false): string {
  if (!m) return '';
  if (m.kind === 'system' && m.system) return systemText(m.system, name, me);
  const who = m.senderId === me ? 'You: ' : group ? `${name(m.senderId).split(' ')[0]}: ` : '';
  if (m.deletedAt) return m.senderId === me ? 'You unsent a message' : 'Message unsent';
  const body = (m.body || '').replace(/\s+/g, ' ').trim();
  const media = mediaLabel(m);
  return who + (body ? (media && m.kind !== 'workout' ? `${media.split(' ')[0]} ${body}` : body) : media);
}
export function convTitle(c: Pick<Conversation, 'kind' | 'title' | 'members'>, me: string, profiles: Record<string, Pick<PublicProfile, 'displayName'> | undefined>): string {
  if (c.kind === 'group' && c.title) return c.title;
  const others = c.members.filter((m) => m.userId !== me && m.state !== 'left' && m.state !== 'removed').map((m) => profiles[m.userId]?.displayName || 'HYBRD user');
  if (c.kind === 'direct') return others[0] || 'HYBRD user';
  if (!others.length) return 'Just you';
  return others.length <= 3 ? others.map((n) => n.split(' ')[0]).join(', ') : `${others.slice(0, 2).map((n) => n.split(' ')[0]).join(', ')} +${others.length - 2}`;
}
export function copyText(m: Pick<Message, 'kind' | 'body' | 'workout'>): string {
  if (m.kind === 'workout' && m.workout) return `${m.workout.label}: ${m.workout.title}${m.body ? ` — ${m.body}` : ''}`;
  return m.body || '';
}

// ---------- search ----------
const fold = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
export interface SearchHit { conversationId: string; messageId: string; snippet: string; createdAt: number }
export function searchInbox<C extends { id: string; title: string; handles: string[] }>(convs: C[], msgs: Pick<Message, 'id' | 'conversationId' | 'body' | 'deletedAt' | 'createdAt' | 'kind'>[], q: string): { chats: C[]; hits: SearchHit[] } {
  const n = fold(q.trim().replace(/^@/, ''));
  if (n.length < 2) return { chats: [], hits: [] };
  const ids = new Set(convs.map((c) => c.id));
  const chats = convs.filter((c) => fold(c.title).includes(n) || c.handles.some((h) => fold(h).includes(n)));
  const hits = msgs.filter((m) => ids.has(m.conversationId) && !m.deletedAt && m.kind !== 'system' && fold(m.body).includes(n))
    .sort((a, b) => b.createdAt - a.createdAt).slice(0, 50)
    .map((m) => ({ conversationId: m.conversationId, messageId: m.id, snippet: snippet(m.body, n), createdAt: m.createdAt }));
  return { chats, hits };
}
export function snippet(body: string, foldedQ: string, span = 36): string {
  const i = fold(body).indexOf(foldedQ);
  if (i < 0) return body.slice(0, span * 2);
  const s = Math.max(0, i - span), e = Math.min(body.length, i + foldedQ.length + span);
  return (s > 0 ? '…' : '') + body.slice(s, e).replace(/\s+/g, ' ') + (e < body.length ? '…' : '');
}

// ---------- offline outbox (queue + retry with backoff) ----------
export type OutboxStatus = 'queued' | 'sending' | 'failed';
export interface OutboxItem<D = unknown> { id: string; conversationId: string; draft: D; createdAt: number; attempts: number; nextAt: number; status: OutboxStatus; error?: string }
export const backoffMs = (attempts: number) => Math.min(60_000, 2000 * 2 ** Math.max(0, attempts - 1));
export function enqueue<D>(q: OutboxItem<D>[], item: Omit<OutboxItem<D>, 'attempts' | 'nextAt' | 'status'>): OutboxItem<D>[] {
  if (q.some((x) => x.id === item.id)) return q;
  return [...q, { ...item, attempts: 0, nextAt: item.createdAt, status: 'queued' }];
}
export function dueItems<D>(q: OutboxItem<D>[], now: number, online: boolean): OutboxItem<D>[] {
  if (!online) return [];
  return q.filter((x) => x.status === 'queued' && x.nextAt <= now).sort((a, b) => a.createdAt - b.createdAt);
}
/** Network trouble → retry later (exponential backoff, up to MAX_AUTO_ATTEMPTS). A rule refusal (blocked, limit…) fails at once. */
export function afterAttempt<D>(q: OutboxItem<D>[], id: string, result: { ok: true } | { ok: false; retryable: boolean; error: string }, now: number): OutboxItem<D>[] {
  if (result.ok) return q.filter((x) => x.id !== id);
  return q.map((x) => {
    if (x.id !== id) return x;
    const attempts = x.attempts + 1;
    const give = !result.retryable || attempts >= MAX_AUTO_ATTEMPTS;
    return { ...x, attempts, status: give ? 'failed' : 'queued', nextAt: now + backoffMs(attempts), error: result.error };
  });
}
export const retryItem = <D>(q: OutboxItem<D>[], id: string, now: number) => q.map((x) => (x.id === id ? { ...x, status: 'queued' as const, attempts: 0, nextAt: now, error: undefined } : x));
export const markSending = <D>(q: OutboxItem<D>[], id: string) => q.map((x) => (x.id === id ? { ...x, status: 'sending' as const } : x));
/** After a reload, anything stuck in "sending" goes back to the queue. */
export const resumeOutbox = <D>(q: OutboxItem<D>[], now: number) => q.map((x) => (x.status === 'sending' ? { ...x, status: 'queued' as const, nextAt: now } : x));
export function isRetryable(e: unknown): boolean {
  const m = String((e as { message?: string })?.message || e || '');
  if (/^dm_|rate_limit|row-level security|violates|permission denied|not_member|blocked|too large|limited to|can only/i.test(m)) return false;
  return /fetch|network|timeout|timed out|offline|load failed|5\d\d|ECONN|socket|abort/i.test(m) || (typeof navigator !== 'undefined' && navigator.onLine === false);
}

// ---------- notifications (in-app now; the same payload is ready for Web Push / APNs / FCM later) ----------
export interface DmNotice { title: string; body: string; tag: string; url: string; conversationId: string; messageId: string }
export function notificationFor(c: {
  msg: Pick<Message, 'id' | 'conversationId' | 'senderId' | 'kind' | 'body' | 'deletedAt' | 'system'>;
  recipient: string;
  member?: Pick<Member, 'state' | 'mutedUntil' | 'archived'>;
  senderName: string;
  groupTitle?: string;
  blocked: boolean;
  activeConversation?: string | null;
  now?: number;
}): DmNotice | null {
  const { msg, member } = c;
  if (msg.senderId === c.recipient || msg.kind === 'system' || msg.deletedAt || c.blocked || !member) return null;
  if (member.state !== 'active' && member.state !== 'request') return null;
  if (isMuted(member, c.now)) return null;
  if (c.activeConversation === msg.conversationId) return null;
  const url = `/messages/chat?c=${encodeURIComponent(msg.conversationId)}`;
  const base = { tag: `dm:${msg.conversationId}`, url, conversationId: msg.conversationId, messageId: msg.id };
  // Requests never show the content in a notification (safety: unsolicited content stays inside the Requests folder).
  if (member.state === 'request') return { ...base, title: 'Message request', body: `${c.senderName} wants to send you a message` };
  const text = (msg.body || '').replace(/\s+/g, ' ').trim();
  const body = msg.kind === 'text' ? text : `${mediaLabel(msg)}${text && msg.kind !== 'workout' ? ` ${text}` : ''}`;
  const short = [...body].length > 90 ? [...body].slice(0, 89).join('') + '…' : body;
  return { ...base, title: c.groupTitle ? `${c.senderName} · ${c.groupTitle}` : c.senderName, body: short };
}

// ---------- reports ----------
export type DmReportTarget = 'message' | 'conversation';
export const isReactionKind = (s: string): s is ReactionType => (REACTION_TYPES as readonly string[]).includes(s);

/** Map backend error codes to something a person can act on. */
export function friendlyDmError(e: unknown): string {
  const m = (e as { message?: string })?.message || String(e);
  if (/dm_request_limit/.test(m)) return `You can send up to ${REQUEST_MAX_MESSAGES} messages until they accept your request.`;
  if (/dm_blocked|dm_unavailable|blocked/.test(m)) return 'You can’t message this account.';
  if (/dm_minor/.test(m)) return 'To keep teens safe, under-18s and adults can only message each other when they’re friends.';
  if (/dm_no_one/.test(m)) return 'This person isn’t accepting new messages.';
  if (/dm_friends_only/.test(m)) return 'Only their friends can message them.';
  if (/dm_fof_only/.test(m)) return 'Only friends and friends of friends can message them.';
  if (/dm_edit_window/.test(m)) return 'Messages can only be edited for 15 minutes.';
  if (/dm_not_sender/.test(m)) return 'You can only change your own messages.';
  if (/dm_group_full/.test(m)) return `Groups can have up to ${GROUP_MAX} people.`;
  if (/dm_not_admin/.test(m)) return 'Only group admins can do that.';
  if (/dm_accept_first/.test(m)) return 'Accept the request to reply.';
  if (/dm_not_member|not_member/.test(m)) return 'You’re no longer in this chat.';
  if (/rate_limit: max (\d+) (.+)/.test(m)) { const [, n, w] = /rate_limit: max (\d+) (.+)/.exec(m)!; return `Slow down: the limit is ${n} ${w.replace(/\s*\(.*$/, '')}. Try again later.`; }
  if (/fetch|network|offline/i.test(m)) return 'You’re offline. It’ll send when you’re back online.';
  return m.replace(/^[a-z_]+: /, '');
}
