// Calls (voice + video inside Messages): pure, unit-tested rules shared by the demo, the live backend and the UI.
// Media is peer-to-peer WebRTC (encrypted in transit with DTLS-SRTP). Call setup (signaling) goes through Supabase
// Realtime; call history lives in the `calls` table (supabase/schema.sql › CALLS). HYBRD's calling code has not been
// independently audited, so the app never calls this "end-to-end encrypted".
// Node-safe: no DOM / WebRTC here (see callEngine.ts for the browser part).
import { areFriends, isBlocked, type Graph } from './social';
import type { SystemEvent } from './messages';

// ---------- limits ----------
export const RING_TIMEOUT_MS = 40_000;           // outgoing ring → "No answer" / missed
export const INCOMING_STALE_MS = 60_000;          // a ring older than this is never shown
export const MAX_CALL_PEOPLE = 4;                 // mesh: everyone sends to everyone, so keep groups small
export const CALL_HEARTBEAT_MS = 10_000;
export const CALL_STALE_MS = 90_000;              // no heartbeat for this long → the server ends the call
export const RECONNECT_GRACE_MS = 20_000;         // "Reconnecting…" this long before giving up
export const CALL_RATE = { max: 30, windowMs: 3600_000, label: 'calls an hour' };
export const DEFAULT_STUN: RTCIceServerLike[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }, { urls: 'stun:stun.cloudflare.com:3478' }];

export type CallKind = 'voice' | 'video';
export type CallWho = 'everyone' | 'friends' | 'none';
export const CALL_WHO: { v: CallWho; label: string; sub: string }[] = [
  { v: 'everyone', label: 'People you chat with', sub: 'Anyone in an accepted chat with you. Message requests can’t call.' },
  { v: 'friends', label: 'Friends only', sub: 'Only your HYBRD friends can call you.' },
  { v: 'none', label: 'No one', sub: 'Nobody can call you. You can still call others.' },
];
export const defaultCallWho = (isMinor = false): CallWho => (isMinor ? 'friends' : 'everyone');
export const normalizeCallWho = (v: unknown, isMinor = false): CallWho => (v === 'everyone' || v === 'friends' || v === 'none' ? (isMinor && v === 'everyone' ? 'friends' : v) : defaultCallWho(isMinor));

/** What happened to a call, from the call's point of view (stored on the server and in the chat log). */
export type CallStatus = 'ringing' | 'active' | 'ended' | 'missed' | 'declined' | 'canceled' | 'busy' | 'unavailable' | 'failed';
export const FINAL_STATUSES: CallStatus[] = ['ended', 'missed', 'declined', 'canceled', 'busy', 'unavailable', 'failed'];
export interface CallLog { id: string; kind: CallKind; status: CallStatus; durationSec?: number; people?: number }

// ---------- do not disturb ----------
export type DndOption = 'off' | '1h' | '8h' | 'morning' | 'always';
export const DND_OPTIONS: { v: DndOption; label: string }[] = [
  { v: 'off', label: 'Off' }, { v: '1h', label: 'For 1 hour' }, { v: '8h', label: 'For 8 hours' }, { v: 'morning', label: 'Until 8 AM' }, { v: 'always', label: 'Until I turn it off' },
];
export const DND_FOREVER = 8_640_000_000_000_000;
export function dndUntilFor(o: DndOption, now = Date.now()): number | null {
  switch (o) {
    case 'off': return null;
    case '1h': return now + 3600_000;
    case '8h': return now + 8 * 3600_000;
    case 'always': return DND_FOREVER;
    case 'morning': { const d = new Date(now); d.setHours(8, 0, 0, 0); if (d.getTime() <= now) d.setDate(d.getDate() + 1); return d.getTime(); }
  }
}
export const dndActive = (until: number | null | undefined, now = Date.now()) => !!until && until > now;
export function dndLabel(until: number | null | undefined, now = Date.now()): string {
  if (!dndActive(until, now)) return 'Off';
  if (until! >= DND_FOREVER / 2) return 'On until you turn it off';
  const d = new Date(until!); const t = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return new Date(now).toDateString() === d.toDateString() ? `On until ${t}` : `On until ${d.toLocaleDateString([], { weekday: 'short' })} ${t}`;
}

// ---------- who can call whom ----------
export type CallDeny = 'self' | 'unsupported' | 'offline' | 'busy' | 'not_member' | 'request_in' | 'request_out' | 'blocked' | 'minor' | 'no_one' | 'friends_only' | 'empty' | 'full' | 'banned';
export type CallCheck = { ok: true } | { ok: false; reason: CallDeny; msg: string };
const no = (reason: CallDeny, msg: string): CallCheck => ({ ok: false, reason, msg });
export const CALL_DENY_MSG: Record<CallDeny, string> = {
  self: 'That’s you.',
  unsupported: 'This browser can’t make calls. Try the latest Safari, Chrome, Edge or Firefox.',
  offline: 'You’re offline. Connect to the internet to call.',
  busy: 'You’re already on a call.',
  not_member: 'You’re no longer in this chat.',
  request_in: 'Accept the message request before calling.',
  request_out: 'You can call once they accept your message request.',
  blocked: 'You can’t call this account.',
  minor: 'To keep teens safe, under-18s can only call friends.',
  no_one: 'This person isn’t taking calls.',
  friends_only: 'Only their friends can call them.',
  empty: 'There’s no one else in this chat.',
  full: `Calls can have up to ${MAX_CALL_PEOPLE} people.`,
  banned: 'Your account can’t make calls right now.',
};
export interface CallCtx {
  me: string;
  kind: 'direct' | 'group';
  /** my membership state in the chat */
  myState: 'active' | 'request' | 'declined' | 'left' | 'removed';
  /** incoming: I haven't accepted their request · outgoing: they haven't accepted mine */
  request: 'incoming' | 'outgoing' | null;
  /** other active members (direct: exactly the other person) */
  others: string[];
  graph: Graph;
  minors?: Set<string>;
  /** Their call settings, when the client knows them (demo). Live: the server decides. */
  theirWho?: Record<string, CallWho | undefined>;
  inCall?: boolean;
  online?: boolean;
  supported?: boolean;
}
/** Can I call this person / place a call in this group? Pairwise rule = `pairCallCheck`. */
export function canCall(c: CallCtx): CallCheck {
  if (c.supported === false) return no('unsupported', CALL_DENY_MSG.unsupported);
  if (c.myState !== 'active' && c.myState !== 'request') return no('not_member', CALL_DENY_MSG.not_member);
  if (c.request === 'incoming' || c.myState === 'request') return no('request_in', CALL_DENY_MSG.request_in);
  if (c.request === 'outgoing') return no('request_out', CALL_DENY_MSG.request_out);
  if (c.inCall) return no('busy', CALL_DENY_MSG.busy);
  if (c.online === false) return no('offline', CALL_DENY_MSG.offline);
  if (!c.others.length) return no('empty', CALL_DENY_MSG.empty);
  if (c.kind === 'direct') return pairCallCheck({ me: c.me, other: c.others[0], graph: c.graph, minors: c.minors, theirWho: c.theirWho?.[c.others[0]] });
  // groups: at least one member must be reachable (the server only rings the ones who are)
  const ok = c.others.filter((o) => pairCallCheck({ me: c.me, other: o, graph: c.graph, minors: c.minors, theirWho: c.theirWho?.[o] }).ok);
  return ok.length ? { ok: true } : no('no_one', 'No one in this group can take a call from you right now.');
}
/** The rule the server applies to each person a call would ring (mirrors call_check() in schema.sql). Blocks are never revealed. */
export function pairCallCheck(c: { me: string; other: string; graph: Graph; minors?: Set<string>; theirWho?: CallWho }): CallCheck {
  if (c.me === c.other) return no('self', CALL_DENY_MSG.self);
  if (isBlocked(c.graph, c.me, c.other)) return no('blocked', CALL_DENY_MSG.blocked);
  const friends = areFriends(c.graph, c.me, c.other);
  const meMinor = !!c.minors?.has(c.me), otherMinor = !!c.minors?.has(c.other);
  if ((meMinor || otherMinor) && !friends) return no('minor', meMinor ? 'Under-18 accounts can only call friends.' : 'To keep teens safe, you can only call under-18 accounts you’re friends with.');
  const who = normalizeCallWho(c.theirWho, otherMinor);
  if (who === 'none') return no('no_one', CALL_DENY_MSG.no_one);
  if (who === 'friends' && !friends) return no('friends_only', CALL_DENY_MSG.friends_only);
  return { ok: true };
}
/** What an incoming ring does on the callee's side. */
export function ringDecision(c: { dndUntil?: number | null; inCall?: boolean; now?: number }): 'ring' | 'unavailable' | 'busy' {
  if (dndActive(c.dndUntil, c.now ?? Date.now())) return 'unavailable';
  if (c.inCall) return 'busy';
  return 'ring';
}

// ---------- call state machine (client) ----------
export type CallPhase = 'idle' | 'outgoing' | 'incoming' | 'connecting' | 'active' | 'reconnecting' | 'ended';
export type EndReason = 'hangup' | 'remote-hangup' | 'declined' | 'timeout' | 'missed' | 'busy' | 'unavailable' | 'failed' | 'canceled' | 'answered-elsewhere' | 'denied' | 'blocked';
export interface CallState { phase: CallPhase; startedAt: number; connectedAt?: number; endedAt?: number; reason?: EndReason; role: 'caller' | 'callee'; answered: boolean }
export type CallEvt =
  | { t: 'dial'; at: number } | { t: 'ring'; at: number } | { t: 'accept'; at: number } | { t: 'remote-accept'; at: number }
  | { t: 'connected'; at: number } | { t: 'disconnected'; at: number } | { t: 'end'; at: number; reason: EndReason } | { t: 'reset' };
export const idleCall = (): CallState => ({ phase: 'idle', startedAt: 0, role: 'caller', answered: false });
export function reduceCall(s: CallState, e: CallEvt): CallState {
  if (e.t === 'reset') return idleCall();
  if (s.phase === 'ended' && e.t !== 'dial' && e.t !== 'ring') return s;
  switch (e.t) {
    case 'dial': return s.phase === 'idle' || s.phase === 'ended' ? { phase: 'outgoing', startedAt: e.at, role: 'caller', answered: false } : s;
    case 'ring': return s.phase === 'idle' || s.phase === 'ended' ? { phase: 'incoming', startedAt: e.at, role: 'callee', answered: false } : s;
    case 'accept': return s.phase === 'incoming' ? { ...s, phase: 'connecting', answered: true } : s;
    case 'remote-accept': return s.phase === 'outgoing' ? { ...s, phase: 'connecting', answered: true } : s;
    case 'connected':
      if (s.phase === 'outgoing') return { ...s, phase: 'active', answered: true, connectedAt: s.connectedAt ?? e.at };
      return s.phase === 'connecting' || s.phase === 'reconnecting' || s.phase === 'active' ? { ...s, phase: 'active', connectedAt: s.connectedAt ?? e.at } : s;
    case 'disconnected': return s.phase === 'active' ? { ...s, phase: 'reconnecting' } : s;
    case 'end': return s.phase === 'idle' ? s : { ...s, phase: 'ended', endedAt: e.at, reason: e.reason };
  }
}
export const callSeconds = (s: Pick<CallState, 'connectedAt' | 'endedAt'>, now = Date.now()) => (s.connectedAt ? Math.max(0, Math.round(((s.endedAt ?? now) - s.connectedAt) / 1000)) : 0);
/** What the server should record when I end the call. */
export function finalStatus(s: CallState, reason: EndReason): CallStatus {
  if (s.connectedAt || s.answered) return reason === 'failed' && !s.connectedAt ? 'failed' : 'ended';
  switch (reason) {
    case 'timeout': case 'missed': return 'missed';
    case 'declined': return 'declined';
    case 'busy': return 'busy';
    case 'unavailable': return 'unavailable';
    case 'failed': case 'denied': return 'failed';
    default: return 'canceled';
  }
}
/** The line under the name on the ended screen. */
export function endedText(s: CallState, now = Date.now()): string {
  const d = callSeconds(s, now);
  switch (s.reason) {
    case 'declined': return s.role === 'caller' ? 'Declined' : 'You declined';
    case 'timeout': case 'missed': return s.role === 'caller' ? 'No answer' : 'Missed call';
    case 'busy': return 'On another call';
    case 'unavailable': return 'Not available right now';
    case 'failed': return 'Call failed. Check your connection.';
    case 'denied': return 'Microphone or camera access was blocked';
    case 'blocked': return 'Call ended';
    case 'answered-elsewhere': return 'Answered on another device';
    case 'canceled': return s.role === 'caller' ? 'Canceled' : 'Missed call';
    default: return d ? `Call ended · ${formatDuration(d)}` : 'Call ended';
  }
}

// ---------- durations, log lines ----------
export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec)); const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}
export function longDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec)); const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const r = s % 60;
  if (h) return `${h} hr ${m} min`; if (m) return r && m < 10 ? `${m} min ${r} sec` : `${m} min`; return `${r} sec`;
}
export interface CallLine { title: string; sub: string; missed: boolean; outgoing: boolean; icon: 'phone' | 'video' }
/** The call card in a chat thread and the row in the Calls tab. `actor` = who placed the call. */
export function callLine(call: CallLog, actor: string, me: string, group = false): CallLine {
  const out = actor === me;
  const kindWord = call.kind === 'video' ? 'video call' : 'voice call';
  const Kind = (group ? 'Group ' : '') + (group ? kindWord : kindWord[0].toUpperCase() + kindWord.slice(1));
  const icon = call.kind === 'video' ? 'video' : 'phone';
  const base = { outgoing: out, icon } as const;
  switch (call.status) {
    case 'ended': case 'active': return { ...base, title: Kind, sub: call.durationSec ? longDuration(call.durationSec) : out ? 'Outgoing' : 'Incoming', missed: false };
    case 'missed': return out ? { ...base, title: Kind, sub: 'No answer', missed: false } : { ...base, title: `Missed ${kindWord}`, sub: 'Tap to call back', missed: true };
    case 'declined': return out ? { ...base, title: Kind, sub: 'Declined', missed: false } : { ...base, title: Kind, sub: 'You declined', missed: false };
    case 'canceled': return out ? { ...base, title: Kind, sub: 'Canceled', missed: false } : { ...base, title: `Missed ${kindWord}`, sub: 'Tap to call back', missed: true };
    case 'busy': return out ? { ...base, title: Kind, sub: 'On another call', missed: false } : { ...base, title: `Missed ${kindWord}`, sub: 'You were on another call', missed: true };
    // never tell the caller *why* (Do not disturb / "No one" stay private)
    case 'unavailable': return out ? { ...base, title: Kind, sub: 'No answer', missed: false } : { ...base, title: `Missed ${kindWord}`, sub: 'Do not disturb was on', missed: true };
    case 'failed': return { ...base, title: Kind, sub: 'Couldn’t connect', missed: false };
    case 'ringing': return { ...base, title: Kind, sub: 'Ringing…', missed: false };
  }
}
/** Preview text for the inbox (systemText in messages.ts delegates here). */
export function callPreview(e: Pick<SystemEvent, 'actor'> & { call?: CallLog }, me: string): string {
  if (!e.call) return '📞 Call';
  const l = callLine(e.call, e.actor, me);
  return `${e.call.kind === 'video' ? '🎥' : '📞'} ${l.missed ? l.title : `${l.title} · ${l.sub}`}`;
}
export const isCallEvent = (e: SystemEvent | undefined): e is SystemEvent & { call: CallLog } => !!e && e.type === 'call' && !!e.call;

// ---------- Calls tab ----------
export interface CallHistoryItem {
  id: string; conversationId: string; kind: CallKind; status: CallStatus; callerId: string; at: number; durationSec: number;
  /** the other people in the call (or invited to it) */
  peers: string[]; group: boolean; title?: string;
}
export function missedSince(items: Pick<CallHistoryItem, 'status' | 'callerId' | 'at'>[], me: string, since: number): number {
  return items.filter((i) => i.at > since && i.callerId !== me && ['missed', 'canceled', 'busy', 'unavailable'].includes(i.status)).length;
}
export function historyFilter<T extends Pick<CallHistoryItem, 'status' | 'callerId'>>(items: T[], me: string, f: 'all' | 'missed'): T[] {
  return f === 'all' ? items : items.filter((i) => i.callerId !== me && ['missed', 'canceled', 'busy', 'unavailable'].includes(i.status));
}

// ---------- connection quality ----------
export type Quality = 'good' | 'fair' | 'poor' | 'unknown';
export interface QualitySample { rttMs?: number | null; lossPct?: number | null; jitterMs?: number | null; fps?: number | null; relayed?: boolean }
export function qualityOf(s: QualitySample | null | undefined): Quality {
  if (!s || (s.rttMs == null && s.lossPct == null)) return 'unknown';
  const rtt = s.rttMs ?? 0, loss = s.lossPct ?? 0, jit = s.jitterMs ?? 0;
  if (rtt > 600 || loss > 10 || jit > 120) return 'poor';
  if (rtt > 300 || loss > 3 || jit > 50) return 'fair';
  return 'good';
}
export const QUALITY_TEXT: Record<Quality, string> = { good: 'Good connection', fair: 'Weak connection', poor: 'Poor connection', unknown: 'Checking connection…' };
/** Packet loss % between two cumulative stat readings. */
export function lossBetween(prev: { lost: number; received: number } | null, cur: { lost: number; received: number }): number | null {
  if (!prev) return null;
  const lost = Math.max(0, cur.lost - prev.lost), got = Math.max(0, cur.received - prev.received);
  return lost + got > 0 ? (lost / (lost + got)) * 100 : null;
}
/** Mesh: each person sends a copy to every other person, so share the upload. */
export function videoBitrateFor(peers: number): number { return peers <= 1 ? 1_200_000 : peers === 2 ? 650_000 : 420_000; }

// ---------- ICE (STUN / TURN) ----------
export interface RTCIceServerLike { urls: string | string[]; username?: string; credential?: string }
export interface TurnConfig { turnUrls?: string; turnUsername?: string; turnCredential?: string }
const ICE_URL = /^(stun|stuns|turn|turns):[^\s,]{3,200}$/i;
/** STUN defaults + optional static TURN (from config.js / VITE_TURN_*). Bad entries are dropped, never thrown. */
export function iceServersFrom(cfg: TurnConfig | null | undefined, extra: RTCIceServerLike[] = []): RTCIceServerLike[] {
  const out: RTCIceServerLike[] = [...DEFAULT_STUN];
  const urls = (cfg?.turnUrls || '').split(/[\s,]+/).map((u) => u.trim()).filter((u) => ICE_URL.test(u) && /^turns?:/i.test(u));
  if (urls.length && cfg?.turnUsername && cfg?.turnCredential) out.push({ urls, username: cfg.turnUsername, credential: cfg.turnCredential });
  for (const s of extra) {
    const u = (Array.isArray(s?.urls) ? s.urls : [s?.urls]).filter((x): x is string => typeof x === 'string' && ICE_URL.test(x) && !/:53(\?|$)/.test(x));
    if (u.length) out.push({ urls: u, ...(s.username ? { username: s.username } : {}), ...(s.credential ? { credential: s.credential } : {}) });
  }
  return out;
}
export const hasTurn = (servers: RTCIceServerLike[]) => servers.some((s) => (Array.isArray(s.urls) ? s.urls : [s.urls]).some((u) => /^turns?:/i.test(u)));

// ---------- signaling messages ----------
export type SignalType = 'hello' | 'offer' | 'answer' | 'ice' | 'bye' | 'state' | 'decline' | 'cancel';
export interface MediaFlags { mic: boolean; cam: boolean }
export interface Signal { v: 1; call: string; from: string; to?: string; sid: string; t: SignalType; sdp?: string; cand?: { candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null } | null; state?: MediaFlags }
const SIGNAL_TYPES: SignalType[] = ['hello', 'offer', 'answer', 'ice', 'bye', 'state', 'decline', 'cancel'];
/** Validate an incoming signaling payload. Anything odd is dropped (never trust the other side). */
export function parseSignal(raw: unknown, c: { call: string; me: string; allowed?: Set<string> }): Signal | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  if (m.v !== 1 || m.call !== c.call || typeof m.from !== 'string' || m.from === c.me || !SIGNAL_TYPES.includes(m.t as SignalType)) return null;
  if (c.allowed && !c.allowed.has(m.from)) return null;
  if (m.to !== undefined && m.to !== c.me) return null;
  if (typeof m.sid !== 'string' || m.sid.length > 64) return null;
  const s: Signal = { v: 1, call: c.call, from: m.from, sid: m.sid, t: m.t as SignalType };
  if (m.to !== undefined) s.to = m.to as string;
  if (s.t === 'offer' || s.t === 'answer') { if (typeof m.sdp !== 'string' || m.sdp.length > 30_000 || !m.sdp.startsWith('v=0')) return null; s.sdp = m.sdp; }
  if (s.t === 'ice') {
    if (m.cand === null) s.cand = null;
    else { const k = m.cand as Record<string, unknown>; if (!k || typeof k.candidate !== 'string' || k.candidate.length > 1000) return null; s.cand = { candidate: k.candidate, sdpMid: typeof k.sdpMid === 'string' ? k.sdpMid : null, sdpMLineIndex: typeof k.sdpMLineIndex === 'number' ? k.sdpMLineIndex : null }; }
  }
  if (m.state && typeof m.state === 'object') { const st = m.state as Record<string, unknown>; s.state = { mic: st.mic !== false, cam: st.cam === true }; }
  return s;
}
/** Perfect negotiation: the "polite" peer yields on offer collisions. Deterministic on both sides. */
export const isPolite = (me: string, other: string) => me > other;

// ---------- camera / microphone ----------
export type MediaErr = 'denied' | 'notfound' | 'inuse' | 'insecure' | 'unsupported' | 'other';
export function mediaErrorKind(name: string | undefined): MediaErr {
  switch (name) {
    case 'NotAllowedError': case 'PermissionDeniedError': return 'denied';
    case 'NotFoundError': case 'DevicesNotFoundError': case 'OverconstrainedError': return 'notfound';
    case 'NotReadableError': case 'TrackStartError': case 'AbortError': return 'inuse';
    case 'SecurityError': return 'insecure';
    case 'TypeError': case 'NotSupportedError': return 'unsupported';
    default: return 'other';
  }
}
export function mediaErrorHelp(kind: MediaErr, opts: { video: boolean; platform: 'ios' | 'android' | 'desktop' }): { title: string; body: string; steps: string[] } {
  const what = opts.video ? 'camera and microphone' : 'microphone';
  switch (kind) {
    case 'denied': return {
      title: `${opts.video ? 'Camera or microphone' : 'Microphone'} blocked`,
      body: `HYBRD needs your ${what} for calls. Your browser is blocking it, so nothing was sent.`,
      steps: opts.platform === 'ios'
        ? ['iPhone: open Settings › Apps › Safari › Camera / Microphone and choose Ask or Allow.', 'In Safari, tap the aA (page settings) button › Website Settings and allow them for this site.', 'Home Screen app: Settings › HYBRD (or Safari) › allow Camera and Microphone, then reopen HYBRD.']
        : opts.platform === 'android'
          ? ['Tap the lock or tune icon left of the address bar › Permissions.', `Allow ${what}, then try the call again.`, 'Still blocked? Android Settings › Apps › Chrome › Permissions.']
          : ['Click the lock or tune icon left of the address bar.', `Set ${what} to Allow, then try again.`, 'On a Mac, also check System Settings › Privacy & Security › Camera / Microphone for your browser.'],
    };
    case 'notfound': return { title: `No ${opts.video ? 'camera or microphone' : 'microphone'} found`, body: `Connect a ${what} (or check it isn’t switched off) and try again.`, steps: [] };
    case 'inuse': return { title: `${opts.video ? 'Camera or microphone' : 'Microphone'} is busy`, body: 'Another app or browser tab is using it. Close that app (a video call, the camera app…) and try again.', steps: [] };
    case 'insecure': return { title: 'Calls need a secure page', body: 'Open HYBRD over https:// (or the installed app). Browsers only allow the camera and microphone on secure pages.', steps: [] };
    case 'unsupported': return { title: 'Calls aren’t supported here', body: 'This browser can’t make calls. Try the latest Safari, Chrome, Edge or Firefox.', steps: [] };
    default: return { title: 'Couldn’t start your microphone', body: 'Something went wrong opening your microphone or camera. Try again.', steps: [] };
  }
}
export const platformOf = (ua: string): 'ios' | 'android' | 'desktop' => (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && /Mobile/.test(ua)) ? 'ios' : /Android/i.test(ua) ? 'android' : 'desktop');
/** Show the "why we need your mic/camera" explainer before the browser's own prompt (once, unless permission is still unknown). */
export function needsExplainer(c: { video: boolean; mic: PermissionStateLike; cam: PermissionStateLike; seen: { mic?: boolean; cam?: boolean } }): boolean {
  if (c.mic === 'denied' || (c.video && c.cam === 'denied')) return true; // show the fix-it help instead of a silent failure
  const micOk = c.mic === 'granted' || (c.mic === 'unknown' && c.seen.mic);
  const camOk = !c.video || c.cam === 'granted' || (c.cam === 'unknown' && c.seen.cam);
  return !(micOk && camOk);
}
export type PermissionStateLike = 'granted' | 'denied' | 'prompt' | 'unknown';

// ---------- small UI helpers ----------
/** Snap a dragged self-view to the nearest corner, inside the safe frame. */
export function snapCorner(p: { x: number; y: number; w: number; h: number }, frame: { w: number; h: number; top: number; bottom: number; side: number }): { x: number; y: number; corner: 'tl' | 'tr' | 'bl' | 'br' } {
  const left = p.x + p.w / 2 < frame.w / 2, top = p.y + p.h / 2 < frame.h / 2;
  return { x: left ? frame.side : frame.w - p.w - frame.side, y: top ? frame.top : frame.h - p.h - frame.bottom, corner: `${top ? 't' : 'b'}${left ? 'l' : 'r'}` as 'tl' | 'tr' | 'bl' | 'br' };
}
/** Grid layout for remote tiles. */
/** The colour of a generated avatar (sample people / initials art), so call backgrounds match it. Default blue. */
export function avatarHue(url: string | null | undefined, fallback = 200): number {
  if (!url) return fallback;
  const a = /^art:av:[^:]*:(\d+)/.exec(url); if (a) return Number(a[1]);
  if (url.startsWith('data:image/svg')) { let d = url; try { d = decodeURIComponent(url); } catch { /* keep */ } const m = /hsl\((\d+)/.exec(d); if (m) return Number(m[1]); }
  return fallback;
}
export const tileLayout = (n: number): 'one' | 'two' | 'grid' => (n <= 1 ? 'one' : n === 2 ? 'two' : 'grid');
/** Friendly text for errors from the call_* RPCs (mirrors CALL_DENY_MSG). */
export function friendlyCallError(e: unknown): string {
  const m = (e as { message?: string })?.message || String(e);
  if (/call_request_out/.test(m)) return CALL_DENY_MSG.request_out;
  if (/call_request/.test(m)) return CALL_DENY_MSG.request_in;
  if (/call_unavailable|blocked/.test(m)) return CALL_DENY_MSG.blocked;
  if (/call_minor/.test(m)) return CALL_DENY_MSG.minor;
  if (/call_no_one/.test(m)) return CALL_DENY_MSG.no_one;
  if (/call_friends_only/.test(m)) return CALL_DENY_MSG.friends_only;
  if (/call_full/.test(m)) return CALL_DENY_MSG.full;
  if (/call_busy/.test(m)) return CALL_DENY_MSG.busy;
  if (/call_empty/.test(m)) return CALL_DENY_MSG.empty;
  if (/call_not_member|not_member/.test(m)) return CALL_DENY_MSG.not_member;
  if (/call_in_progress/.test(m)) return 'There’s already a call in this chat.';
  if (/call_ended|call_not_found/.test(m)) return 'This call has ended.';
  if (/banned/.test(m)) return CALL_DENY_MSG.banned;
  if (/rate_limit/.test(m)) return `Slow down: the limit is ${CALL_RATE.max} ${CALL_RATE.label}. Try again later.`;
  if (/function public\.call_|does not exist|schema cache/.test(m)) return 'Calls aren’t set up on this server yet (SETUP.md §13).';
  if (/fetch|network|offline/i.test(m)) return CALL_DENY_MSG.offline;
  return m.replace(/^[a-z_]+: /, '');
}
