// Messages DEMO backend: runs on this device with the same clearly-labelled SAMPLE people as the Friends & Stories demo
// (handles "sample.*", SAMPLE badge). Nothing is sent anywhere. It uses the same pure rules as the server
// (src/lib/messages.ts), and sample friends "read" and answer your messages so receipts and typing can be tried.
// Persistence, the friend graph, timers and blob URLs are injected so tools/test-messages.ts can run it in Node.
import {
  activeMembers, applyEdit, applyMsgReaction, applyUnsend, canAddToGroup, canManage, canSeePresence, canSend, checkRate, cleanMessage,
  convTitle, defaultDmSettings, DmError, DM_LIMITS, eligibility, folderOf, GROUP_MAX, isMuted, isParticipant, MAX_PINS, memberOf, messageReactions, messageStatus,
  normalizeDmSettings, outgoingRequest, presenceText, previewText, promoteIfNoAdmin, requestRemaining, searchInbox, sortInbox, unreadCount, validateDraft,
  validateGroupTitle, visibleMessages, MUTE_FOREVER,
  type Conversation, type DmSettings, type Member, type Message, type MsgReaction, type SystemEvent,
} from './messages';
import { isBlocked, areFriends, friendIds, cleanText, REPORT_DETAILS_MAX, type Graph, type GraphAction, type PublicProfile, type ReactionType, type ReportReason } from './social';
import type { ReactorView } from './socialApi';
import { UNKNOWN_PROFILE, type ConvView, type DmBackend, type DmEvent, type Draft, type EligibilityView, type MemberView, type MessageView, type NewDmReport, type SearchResult } from './messagesApi';
import { artUrl } from './socialArt';
import type { CallHistoryItem, CallLog } from './calls';

export const DM_ME = 'me';
export interface DmDemoState {
  v: 1;
  seededAt: number;
  convs: Conversation[];
  messages: Message[];
  reactions: MsgReaction[];
  hidden: string[];
  reports: (NewDmReport & { id: string; createdAt: number; snapshot: unknown; targetUserId?: string })[];
  settings: Record<string, DmSettings>;
  active: Record<string, number>;
  times: Record<'msg' | 'chat' | 'req' | 'group' | 'report' | 'react', number[]>;
  blobs: Record<string, Blob>;
  /** people I restricted */
  restricted?: string[];
}
export interface DmDemoDeps {
  load(): Promise<DmDemoState | undefined>;
  save(s: DmDemoState): Promise<void>;
  world(): Promise<{ graph: Graph; profiles: Record<string, PublicProfile> }>;
  act(a: GraphAction): Promise<unknown>;
  searchPeople(q: string): Promise<PublicProfile[]>;
  blobUrl(b: Blob): string;
  now?: () => number;
  /** Sample friends answer after a few seconds. Off in unit tests unless a scheduler is passed. */
  schedule?: (fn: () => void, ms: number) => void;
}

const H = 3600_000;
// How long ago each sample person was "active" (relative to now, so the demo never looks stale). Ana hides her activity.
const SAMPLE_ACTIVE: Record<string, number> = { s1: 60_000, s2: 40 * 60_000, s6: 3 * H, s7: 26 * H, s4: 2 * H, s5: 5 * H };
const SAMPLE_SETTINGS: Record<string, DmSettings> = {
  s1: { who: 'everyone', readReceipts: true, activity: true, calls: 'everyone', dndUntil: null },
  s2: { who: 'everyone', readReceipts: true, activity: true, calls: 'everyone', dndUntil: null },
  s3: { who: 'friends', readReceipts: false, activity: false, calls: 'friends', dndUntil: null },
  s4: { who: 'fof', readReceipts: true, activity: true, calls: 'everyone', dndUntil: null },
  s5: { who: 'everyone', readReceipts: true, activity: true, calls: 'everyone', dndUntil: null },
  s6: { who: 'everyone', readReceipts: true, activity: true, calls: 'everyone', dndUntil: null },
  s7: { who: 'everyone', readReceipts: true, activity: true, calls: 'everyone', dndUntil: null },
  s8: { who: 'none', readReceipts: true, activity: false, calls: 'none', dndUntil: null },
};
const REPLIES: Record<string, string[]> = {
  s1: ['Love it! 🙌', 'Same pace as last week? Let’s go.', 'Saturday can’t come soon enough 🏔️', 'Bring water, it’s going to be warm.', 'Haha deal 😆'],
  s2: ['Let’s gooo 💪', 'Wall balls first, then we run.', 'Sounds like a plan.', 'I’ll bring the timer.', '🔥🔥'],
  s3: ['Nice! 🚴', 'Thanks, saving that.', 'Good one.'],
  default: ['Nice! 💪', 'Love this.', 'Let’s go!'],
};

const mem = (userId: string, o: Partial<Member> = {}): Member => ({ userId, role: 'member', state: 'active', joinedAt: 0, lastReadAt: 0, deliveredAt: 0, ...o });
/** Fresh demo inbox, timestamps relative to `now`. */
export function seedDm(now: number): DmDemoState {
  const t = (hAgo: number) => now - hAgo * H;
  const msgs: Message[] = [];
  const m = (id: string, conv: string, sender: string, hAgo: number, body: string, x: Partial<Message> = {}) => { msgs.push({ id, conversationId: conv, senderId: sender, kind: 'text', body, createdAt: t(hAgo), ...x }); };
  const sys = (id: string, conv: string, hAgo: number, e: SystemEvent) => m(id, conv, e.actor, hAgo, '', { kind: 'system', system: e });

  // 1 · Maya (friend) — photo, reply, shared workout, reactions, edited, seen
  m('m1', 'c-maya', 's1', 26, 'How did the tempo run feel? 🏃‍♀️');
  m('m2', 'c-maya', DM_ME, 25.8, 'Tough but good. Held 4:45/km for the middle 5K.');
  m('m3', 'c-maya', DM_ME, 25.7, '', { kind: 'workout', workout: { type: 'run', label: 'Run', title: 'Tempo run · 5K at threshold', date: new Date(t(27)).toISOString(), durationSec: 2460, distanceM: 8200, paceSecPerKm: 300, kcal: 610 } });
  m('m4', 'c-maya', 's1', 25.5, 'That’s a big jump from last month! 🔥');
  m('m5', 'c-maya', 's1', 1.2, 'Hill loop this morning. Joining next week?', { kind: 'image', media: { url: 'art:trail', w: 800, h: 1000, mime: 'image/svg+xml' } });
  m('m6', 'c-maya', DM_ME, 1.0, 'I’m in. Saturday 7 AM?', { replyTo: 'm5' });
  m('m7', 'c-maya', 's1', 0.8, 'Saturday works. Bring gels 😆', { editedAt: t(0.78) });
  m('m8', 'c-maya', DM_ME, 0.5, 'Deal. See you there 💪');
  // 2 · Leo (friend) — two unread
  m('l1', 'c-leo', DM_ME, 21, 'Wall balls tonight?');
  m('l2', 'c-leo', 's2', 19, 'Can’t tonight, coaching.');
  m('l3', 'c-leo', 's2', 2.5, 'Tomorrow 6 PM? 1 km run after every set of 20.');
  m('l4', 'c-leo', 's2', 2.4, 'Bring your own ball, the gym only has two 9 kg ones 😅');
  // 3 · Group
  sys('g0', 'g-crew', 72, { type: 'created', actor: DM_ME, title: 'HYROX Doubles Crew' });
  sys('g0b', 'g-crew', 71.99, { type: 'added', actor: DM_ME, targets: ['s1', 's2', 's3'] });
  m('g1', 'g-crew', 's2', 50, 'Race plan: I take the sled push, you take the sled pull?');
  m('g2', 'g-crew', 's1', 49.8, 'Leo, you’re on wall balls too 😆');
  m('g3', 'g-crew', 's3', 30, '', { kind: 'workout', workout: { type: 'indoor-cycle', label: 'Indoor bike', title: 'Steady ride', date: new Date(t(31)).toISOString(), durationSec: 2700, kcal: 540 } });
  m('g4', 'g-crew', DM_ME, 29, 'Deal. I’ll take the burpee broad jumps as well.', { replyTo: 'g1' });
  m('g5', 'g-crew', 's2', 3, 'Team call Sunday 8 PM? 📞');
  // 4 · Ana (friend, muted by me, her read receipts are off → "Delivered")
  m('a1', 'c-ana', 's3', 74, 'Thanks for the bike playlist! 🎧');
  m('a2', 'c-ana', DM_ME, 73, 'Anytime. The second half is all tempo.');
  // 5 · Requests from non-friends
  m('j1', 'r-jordan', 's6', 5, 'Hey José! Saw your HYROX sim post. Do you train at a gym in the city?');
  m('j2', 'r-jordan', 's6', 4.9, 'This is my setup', { kind: 'image', media: { url: 'art:kettlebell', w: 800, h: 1000, mime: 'image/svg+xml' } });
  m('v1', 'r-rivera', 's7', 9, 'Hi! I coach hybrid athletes. Free form-check guide for wall balls here: https://example.com/form-check');

  const last = (c: string) => Math.max(...msgs.filter((x) => x.conversationId === c).map((x) => x.createdAt));
  const convs: Conversation[] = [
    { id: 'c-maya', kind: 'direct', createdBy: 's1', createdAt: t(200), lastMessageAt: last('c-maya'), members: [mem(DM_ME, { joinedAt: t(200), lastReadAt: now - 60_000, deliveredAt: now - 60_000, pinnedAt: t(120) }), mem('s1', { joinedAt: t(200), lastReadAt: t(0.45), deliveredAt: t(0.45) })] },
    { id: 'c-leo', kind: 'direct', createdBy: DM_ME, createdAt: t(300), lastMessageAt: last('c-leo'), members: [mem(DM_ME, { joinedAt: t(300), lastReadAt: t(18), deliveredAt: now - 60_000 }), mem('s2', { joinedAt: t(300), lastReadAt: t(19), deliveredAt: t(19) })] },
    { id: 'g-crew', kind: 'group', title: 'HYROX Doubles Crew', createdBy: DM_ME, createdAt: t(72), lastMessageAt: last('g-crew'), members: [mem(DM_ME, { role: 'admin', joinedAt: t(72), lastReadAt: t(28), deliveredAt: now - 60_000 }), mem('s1', { joinedAt: t(72), lastReadAt: t(20), deliveredAt: t(20), addedBy: DM_ME }), mem('s2', { joinedAt: t(72), lastReadAt: t(3), deliveredAt: t(3), addedBy: DM_ME }), mem('s3', { joinedAt: t(72), lastReadAt: t(25), deliveredAt: t(25), addedBy: DM_ME })] },
    { id: 'c-ana', kind: 'direct', createdBy: 's3', createdAt: t(400), lastMessageAt: last('c-ana'), members: [mem(DM_ME, { joinedAt: t(400), lastReadAt: t(73), deliveredAt: t(73), mutedUntil: MUTE_FOREVER }), mem('s3', { joinedAt: t(400), lastReadAt: t(70), deliveredAt: t(72) })] },
    { id: 'r-jordan', kind: 'direct', createdBy: 's6', createdAt: t(5), lastMessageAt: last('r-jordan'), members: [mem(DM_ME, { state: 'request', joinedAt: t(5) }), mem('s6', { joinedAt: t(5), lastReadAt: t(4.9), deliveredAt: t(4.9) })] },
    { id: 'r-rivera', kind: 'direct', createdBy: 's7', createdAt: t(9), lastMessageAt: last('r-rivera'), members: [mem(DM_ME, { state: 'request', joinedAt: t(9) }), mem('s7', { joinedAt: t(9), lastReadAt: t(9), deliveredAt: t(9) })] },
  ];
  const rx = (messageId: string, userId: string, type: ReactionType, hAgo: number): MsgReaction => ({ messageId, userId, type, createdAt: t(hAgo) });
  const reactions = [rx('m4', DM_ME, 'love', 25.4), rx('m6', 's1', 'like', 0.9), rx('m5', DM_ME, 'wow', 1.1), rx('g2', DM_ME, 'haha', 49), rx('g2', 's3', 'haha', 48), rx('g1', 's1', 'like', 49.9)];
  return { v: 1, seededAt: now, convs, messages: msgs, reactions, hidden: [], reports: [], settings: { ...SAMPLE_SETTINGS }, active: {}, times: { msg: [], chat: [], req: [], group: [], report: [], react: [] }, blobs: {} };
}

let seq = 0;
const nid = (p: string, now: number) => `${p}${now.toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export class DemoDm implements DmBackend {
  readonly kind = 'demo' as const;
  readonly myId = DM_ME;
  private s?: DmDemoState;
  private deps: DmDemoDeps;
  private urls = new Map<string, string>();
  private subs = new Set<(e: DmEvent) => void>();
  private replying = new Set<string>();
  constructor(deps: DmDemoDeps) { this.deps = deps; }
  private now() { return this.deps.now ? this.deps.now() : Date.now(); }
  private async st(): Promise<DmDemoState> {
    if (!this.s) {
      const l = await this.deps.load();
      this.s = l && l.v === 1 ? l : seedDm(this.now());
      for (const [k, v] of Object.entries(SAMPLE_SETTINGS)) this.s.settings[k] ||= v;
      if (!l) {
        // Under-18 demo: no sample requests from adults who aren't friends (the same rule the server enforces).
        const w = await this.deps.world();
        if (w.profiles[DM_ME]?.isMinor) {
          const drop = new Set(this.s.convs.filter((c) => c.kind === 'direct' && c.members.some((m) => m.userId !== DM_ME && !w.profiles[m.userId]?.isMinor && !areFriends(w.graph, DM_ME, m.userId))).map((c) => c.id));
          this.s.convs = this.s.convs.filter((c) => !drop.has(c.id));
          this.s.messages = this.s.messages.filter((m) => !drop.has(m.conversationId));
        }
      }
    }
    return this.s;
  }
  private async commit() { if (this.s) await this.deps.save(this.s); }
  private emit(e: DmEvent) { for (const f of this.subs) { try { f(e); } catch { /* ignore */ } } }
  private url(u: string | undefined): string {
    if (!u) return '';
    if (u.startsWith('art:')) return artUrl(u.slice(4));
    if (u.startsWith('idb:')) {
      const hit = this.urls.get(u); if (hit) return hit;
      const b = this.s?.blobs[u.slice(4)]; if (!b) return '';
      const x = this.deps.blobUrl(b); this.urls.set(u, x); return x;
    }
    return u;
  }
  private settingsOf(s: DmDemoState, id: string, minor = false) { return normalizeDmSettings(s.settings[id], minor) ?? defaultDmSettings(minor); }
  private lastActive(s: DmDemoState, id: string): number | undefined {
    const off = SAMPLE_ACTIVE[id];
    const a = Math.max(s.active[id] || 0, off !== undefined ? this.now() - off : 0);
    return a || undefined;
  }
  private conv(s: DmDemoState, id: string): Conversation {
    const c = s.convs.find((x) => x.id === id);
    if (!c || !isParticipant(c, DM_ME)) throw new DmError('dm_not_member', 'This chat isn’t available.');
    return c;
  }
  private msg(s: DmDemoState, id: string): { m: Message; c: Conversation } {
    const m = s.messages.find((x) => x.id === id);
    if (!m) throw new DmError('dm_not_found', 'That message is no longer available.');
    return { m, c: this.conv(s, m.conversationId) };
  }
  private limit(s: DmDemoState, k: keyof DmDemoState['times'], lim: { max: number; windowMs: number; label: string }) {
    checkRate(s.times[k], lim, this.now());
    s.times[k] = [...s.times[k].filter((x) => x > this.now() - 86_400_000), this.now()];
  }
  private hiddenSet(s: DmDemoState) { return new Set(s.hidden); }
  private sysMsg(s: DmDemoState, c: Conversation, e: SystemEvent) {
    const now = this.now();
    s.messages.push({ id: nid('sy', now), conversationId: c.id, senderId: e.actor, kind: 'system', body: '', system: e, createdAt: now });
    c.lastMessageAt = now;
  }

  // ---------- calls (demo): the call log lives in the chat thread as a system card ----------
  /** Add a call card ("Missed voice call", "Video call · 3 min") to a chat. `actor` = who placed the call. */
  async logCall(conversationId: string, actor: string, call: CallLog) {
    const s = await this.st();
    const c = s.convs.find((x) => x.id === conversationId); if (!c) return;
    if (s.messages.some((m) => m.system?.type === 'call' && m.system.call?.id === call.id)) return;
    this.sysMsg(s, c, { type: 'call', actor, call });
    await this.commit();
    this.emit({ type: 'update', conversationId }); this.emit({ type: 'inbox' });
  }
  /** What the call rules need to know about a chat (sample people's call settings are known on this device). */
  async callContext(conversationId: string) {
    const s = await this.st(); const w = await this.deps.world();
    const c = s.convs.find((x) => x.id === conversationId);
    if (!c) return null;
    const minors = new Set(Object.values(w.profiles).filter((p) => p.isMinor).map((p) => p.id));
    const others = c.members.filter((m) => m.userId !== DM_ME && m.state === 'active').map((m) => m.userId);
    const theirWho = Object.fromEntries(others.map((o) => [o, this.settingsOf(s, o, minors.has(o)).calls]));
    const dnd = Object.fromEntries(others.map((o) => [o, this.settingsOf(s, o, minors.has(o)).dndUntil]));
    return { conv: c, view: this.viewConv(s, w, c), graph: w.graph, minors, others, theirWho, dnd, profiles: w.profiles, mySettings: this.settingsOf(s, DM_ME, minors.has(DM_ME)) };
  }
  /** Calls tab: every call card in chats I can still see, newest first. */
  async callHistory(): Promise<CallHistoryItem[]> {
    const s = await this.st();
    const out: CallHistoryItem[] = [];
    for (const c of s.convs) {
      if (!isParticipant(c, DM_ME)) continue;
      for (const m of visibleMessages(s.messages, c, DM_ME, this.hiddenSet(s))) {
        const e = m.system; if (!e || e.type !== 'call' || !e.call) continue;
        out.push({ id: e.call.id, conversationId: c.id, kind: e.call.kind, status: e.call.status, callerId: e.actor, at: m.createdAt, durationSec: e.call.durationSec || 0, group: c.kind === 'group', title: c.title, peers: c.members.filter((x) => x.userId !== DM_ME && x.state === 'active').map((x) => x.userId) });
      }
    }
    return out.sort((a, b) => b.at - a.at);
  }
  /** Remove a call from my Calls tab (the card in the chat goes too, for me only). */
  async hideCall(callId: string) {
    const s = await this.st();
    const m = s.messages.find((x) => x.system?.type === 'call' && x.system.call?.id === callId);
    if (m && !s.hidden.includes(m.id)) { s.hidden.push(m.id); await this.commit(); this.emit({ type: 'inbox' }); }
  }

  // ---------- views ----------
  private prof(w: { profiles: Record<string, PublicProfile> }, id: string): PublicProfile { return w.profiles[id] || UNKNOWN_PROFILE(id); }
  private viewConv(s: DmDemoState, w: { graph: Graph; profiles: Record<string, PublicProfile> }, c: Conversation): ConvView {
    const me = memberOf(c, DM_ME)!;
    const myS = this.settingsOf(s, DM_ME, !!w.profiles[DM_ME]?.isMinor);
    const visible = visibleMessages(s.messages, c, DM_ME, this.hiddenSet(s));
    const members: MemberView[] = c.members.filter((x) => x.state !== 'left' && x.state !== 'removed' && x.state !== 'declined').map((x) => {
      const theirs = this.settingsOf(s, x.userId, !!w.profiles[x.userId]?.isMinor);
      const showRead = x.userId !== DM_ME && x.state === 'active' && myS.readReceipts && theirs.readReceipts;
      return { userId: x.userId, role: x.role, state: x.state, joinedAt: x.joinedAt, profile: this.prof(w, x.userId), seenAt: showRead ? x.lastReadAt : undefined, deliveredAt: x.state === 'active' ? x.deliveredAt : undefined };
    });
    const others = members.filter((x) => x.userId !== DM_ME);
    const direct = c.kind === 'direct' ? c.members.find((x) => x.userId !== DM_ME) : undefined;
    const blockedByMe = !!direct && w.graph.blocks.some(([a, b]) => a === DM_ME && b === direct.userId);
    const blockedEither = !!direct && isBlocked(w.graph, DM_ME, direct.userId);
    const restricted = !!direct && (s.restricted || []).includes(direct.userId);
    const last = visible.length ? this.viewMsg(s, w, c, visible[visible.length - 1], visible) : null;
    const presence = direct && canSeePresence(myS, this.settingsOf(s, direct.userId), blockedEither) && direct.state === 'active' ? presenceText(this.lastActive(s, direct.userId), this.now()) : null;
    return {
      id: c.id, kind: c.kind, customTitle: c.title, title: convTitle(c, DM_ME, w.profiles), createdBy: c.createdBy, createdAt: c.createdAt, lastMessageAt: c.lastMessageAt,
      me, members, others, folder: folderOf(c, DM_ME, restricted), unread: unreadCount(c, DM_ME, visible, this.hiddenSet(s)), last,
      muted: isMuted(me, this.now()), pinned: !!me.pinnedAt, archived: !!me.archived,
      request: me.state === 'request' ? 'incoming' : outgoingRequest(c, DM_ME) ? 'outgoing' : null,
      requestRemaining: requestRemaining(c, DM_ME, s.messages), blocked: blockedByMe ? 'byMe' : blockedEither ? 'unavailable' : null,
      presence, isAdmin: me.role === 'admin' && me.state === 'active', restricted,
    };
  }
  private viewMsg(s: DmDemoState, w: { graph: Graph; profiles: Record<string, PublicProfile> }, c: Conversation, m: Message, all?: Message[]): MessageView {
    const r = messageReactions(s.reactions, m.id, DM_ME, w.graph);
    const receipts = Object.fromEntries(c.members.map((x) => [x.userId, this.settingsOf(s, x.userId).readReceipts]));
    const st = messageStatus(m, { conv: c, me: DM_ME, myReceipts: this.settingsOf(s, DM_ME).readReceipts, receipts });
    let reply: MessageView['reply'] = null;
    if (m.replyTo) {
      const o = (all || s.messages).find((x) => x.id === m.replyTo) || s.messages.find((x) => x.id === m.replyTo);
      reply = o ? { id: o.id, senderName: o.senderId === DM_ME ? 'You' : this.prof(w, o.senderId).displayName, mine: o.senderId === DM_ME, preview: previewText({ ...o, senderId: '_' }, DM_ME, (id) => this.prof(w, id).displayName), deleted: !!o.deletedAt, kind: o.kind, thumb: o.kind === 'image' ? this.url(o.media?.url) : o.kind === 'video' ? this.url(o.media?.poster) : undefined }
        : { id: m.replyTo, senderName: '', mine: false, preview: 'Original message not available', deleted: true, kind: 'text' };
    }
    return {
      ...m, media: m.media ? { ...m.media, url: this.url(m.media.url), poster: m.media.poster ? this.url(m.media.poster) : undefined } : undefined,
      mine: m.senderId === DM_ME, sender: this.prof(w, m.senderId), reactions: r.summary, myReaction: r.mine, status: st?.status, seenBy: st?.seenBy, reply,
    };
  }

  // ---------- settings ----------
  async getSettings() { const s = await this.st(); const w = await this.deps.world(); return this.settingsOf(s, DM_ME, !!w.profiles[DM_ME]?.isMinor); }
  async saveSettings(v: DmSettings) { const s = await this.st(); const w = await this.deps.world(); s.settings[DM_ME] = normalizeDmSettings(v, !!w.profiles[DM_ME]?.isMinor); await this.commit(); this.emit({ type: 'inbox' }); return s.settings[DM_ME]; }

  // ---------- reading ----------
  async inbox(): Promise<ConvView[]> {
    const s = await this.st(); const w = await this.deps.world();
    return sortInbox(s.convs.filter((c) => isParticipant(c, DM_ME)), DM_ME).map((c) => this.viewConv(s, w, c)).filter((v) => v.folder);
  }
  async conversation(id: string) {
    const s = await this.st(); const w = await this.deps.world();
    const c = s.convs.find((x) => x.id === id);
    return c && isParticipant(c, DM_ME) ? this.viewConv(s, w, c) : null;
  }
  async messages(id: string): Promise<MessageView[]> {
    const s = await this.st(); const w = await this.deps.world();
    const c = s.convs.find((x) => x.id === id);
    if (!c || !isParticipant(c, DM_ME)) return [];
    const vis = visibleMessages(s.messages, c, DM_ME, this.hiddenSet(s));
    return vis.map((m) => this.viewMsg(s, w, c, m, vis));
  }
  private findDirect(s: DmDemoState, other: string) { return s.convs.find((c) => c.kind === 'direct' && c.members.some((m) => m.userId === DM_ME) && c.members.some((m) => m.userId === other)); }
  async eligibility(userId: string): Promise<EligibilityView> {
    const s = await this.st(); const w = await this.deps.world();
    const ex = this.findDirect(s, userId);
    const o = ex && memberOf(ex, userId);
    const e = eligibility({ me: DM_ME, other: userId, graph: w.graph, meMinor: !!w.profiles[DM_ME]?.isMinor, otherMinor: !!w.profiles[userId]?.isMinor, otherSettings: this.settingsOf(s, userId, !!w.profiles[userId]?.isMinor), existingActive: !!o && o.state === 'active' && !!ex?.lastMessageAt });
    return { ...e, existing: ex?.id };
  }
  async openDirect(userId: string): Promise<string> {
    const s = await this.st(); const w = await this.deps.world();
    if (!w.profiles[userId]) throw new DmError('dm_unavailable', 'You can’t message this account.');
    const e = await this.eligibility(userId);
    if (!e.ok) throw new DmError('dm_' + e.reason, e.msg);
    const ex = e.existing ? s.convs.find((c) => c.id === e.existing) : undefined;
    if (ex) {
      const me = memberOf(ex, DM_ME)!;
      if (me.state !== 'active') { me.state = 'active'; await this.commit(); }
      return ex.id;
    }
    this.limit(s, 'chat', DM_LIMITS.newChatHour);
    if (e.request) this.limit(s, 'req', DM_LIMITS.requestDay);
    const now = this.now();
    const c: Conversation = { id: nid('dm', now), kind: 'direct', createdBy: DM_ME, createdAt: now, lastMessageAt: 0, members: [mem(DM_ME, { joinedAt: now, lastReadAt: now }), mem(userId, { joinedAt: now, state: e.request ? 'request' : 'active' })] };
    s.convs.push(c);
    await this.commit();
    return c.id;
  }
  async createGroup(title: string, ids: string[]): Promise<string> {
    const s = await this.st(); const w = await this.deps.world();
    const t = validateGroupTitle(title); if (!t.ok) throw new DmError('dm_title', t.error!);
    const uniq = [...new Set(ids)].filter((x) => x !== DM_ME);
    if (!uniq.length) throw new DmError('dm_empty', 'Add at least one friend.');
    if (uniq.length + 1 > GROUP_MAX) throw new DmError('dm_group_full', `Groups can have up to ${GROUP_MAX} people.`);
    const minors = new Set(Object.values(w.profiles).filter((p) => p.isMinor).map((p) => p.id));
    const members = [DM_ME];
    for (const u of uniq) {
      const ok = canAddToGroup({ adder: DM_ME, user: u, graph: w.graph, members, minors, settings: this.settingsOf(s, u) });
      if (!ok.ok) throw new DmError('dm_cant_add', `${this.prof(w, u).displayName}: ${ok.msg}`);
      members.push(u);
    }
    this.limit(s, 'group', DM_LIMITS.groupDay);
    const now = this.now();
    const c: Conversation = { id: nid('g', now), kind: 'group', title: t.value, createdBy: DM_ME, createdAt: now, lastMessageAt: now, members: members.map((u) => mem(u, { role: u === DM_ME ? 'admin' : 'member', joinedAt: now, lastReadAt: u === DM_ME ? now : 0, addedBy: u === DM_ME ? undefined : DM_ME })) };
    s.convs.push(c);
    this.sysMsg(s, c, { type: 'created', actor: DM_ME, title: t.value });
    this.sysMsg(s, c, { type: 'added', actor: DM_ME, targets: uniq });
    memberOf(c, DM_ME)!.lastReadAt = this.now();
    await this.commit();
    this.emit({ type: 'inbox' });
    return c.id;
  }

  // ---------- sending ----------
  async send(id: string, d: Draft): Promise<Message> {
    const s = await this.st(); const w = await this.deps.world();
    const dup = s.messages.find((m) => m.id === d.clientId);
    if (dup) return dup;
    const c = this.conv(s, id);
    const ok = canSend(c, DM_ME, s.messages, w.graph);
    if (!ok.ok) throw new DmError(ok.code, ok.msg);
    const other = c.kind === 'direct' ? c.members.find((x) => x.userId !== DM_ME)?.userId : undefined;
    if (other && !!w.profiles[DM_ME]?.isMinor !== !!w.profiles[other]?.isMinor && !areFriends(w.graph, DM_ME, other)) throw new DmError('dm_minor', 'To keep teens safe, under-18s and adults can only message each other when they’re friends.');
    const body = cleanMessage(d.body || '');
    let src: Message | undefined;
    if (d.forwardOf) { src = s.messages.find((m) => m.id === d.forwardOf); if (!src || src.deletedAt) throw new DmError('dm_not_found', 'That message is no longer available.'); }
    const err = validateDraft({ kind: d.kind, body, hasMedia: !!d.media || !!src?.media, hasWorkout: !!d.workout });
    if (err) throw new DmError('dm_invalid', err);
    this.limit(s, 'msg', DM_LIMITS.messageMinute);
    const now = this.now();
    const m: Message = { id: d.clientId, conversationId: c.id, senderId: DM_ME, kind: d.kind, body, createdAt: now, replyTo: d.replyTo && s.messages.some((x) => x.id === d.replyTo && x.conversationId === c.id) ? d.replyTo : undefined, forwarded: d.forwarded || undefined, workout: d.workout };
    if (d.media) {
      s.blobs[m.id] = d.media.blob;
      if (d.media.poster) s.blobs[m.id + '-p'] = d.media.poster;
      m.media = { url: `idb:${m.id}`, w: d.media.w, h: d.media.h, mime: d.media.mime, size: d.media.blob.size, duration: d.media.duration, poster: d.media.poster ? `idb:${m.id}-p` : undefined };
    } else if (src?.media) m.media = { ...src.media };
    s.messages.push(m);
    c.lastMessageAt = now;
    const me = memberOf(c, DM_ME)!;
    me.lastReadAt = now; me.deliveredAt = now;
    if (me.archived) me.archived = false;
    if (me.clearedAt && me.clearedAt >= now) me.clearedAt = now - 1;
    await this.commit();
    this.simulate(c.id, m);
    return m;
  }
  async edit(id: string, body: string) {
    const s = await this.st(); const { m } = this.msg(s, id);
    const n = applyEdit(m, body, DM_ME, this.now());
    Object.assign(m, n); await this.commit(); this.emit({ type: 'update', conversationId: m.conversationId });
  }
  async unsend(id: string) {
    const s = await this.st(); const { m } = this.msg(s, id);
    const n = applyUnsend(m, DM_ME, this.now());
    Object.assign(m, n); delete m.media; delete m.workout;
    delete s.blobs[id]; delete s.blobs[id + '-p'];
    s.reactions = s.reactions.filter((r) => r.messageId !== id);
    await this.commit(); this.emit({ type: 'update', conversationId: m.conversationId });
  }
  async deleteForMe(id: string) { const s = await this.st(); const { m } = this.msg(s, id); s.hidden = [...new Set([...s.hidden, id])]; await this.commit(); this.emit({ type: 'update', conversationId: m.conversationId }); }
  async react(id: string, type: ReactionType | null) {
    const s = await this.st(); const w = await this.deps.world(); const { m, c } = this.msg(s, id);
    if (memberOf(c, DM_ME)!.state !== 'active') throw new DmError('dm_accept_first', 'Accept the request to react.');
    if (m.deletedAt || m.kind === 'system') throw new DmError('dm_not_found', 'You can’t react to this.');
    if (m.senderId !== DM_ME && isBlocked(w.graph, DM_ME, m.senderId)) throw new DmError('dm_blocked', 'You can’t react to this.');
    const prev = s.reactions.find((r) => r.userId === DM_ME && r.messageId === id)?.type ?? null;
    if (type && type !== prev) this.limit(s, 'react', DM_LIMITS.reactHour);
    s.reactions = applyMsgReaction(s.reactions, DM_ME, id, type, this.now()).list;
    await this.commit(); this.emit({ type: 'update', conversationId: c.id });
  }
  async reactors(id: string): Promise<ReactorView[]> {
    const s = await this.st(); const w = await this.deps.world(); this.msg(s, id);
    return s.reactions.filter((r) => r.messageId === id && (r.userId === DM_ME || !isBlocked(w.graph, DM_ME, r.userId))).sort((a, b) => b.createdAt - a.createdAt).map((r) => ({ user: this.prof(w, r.userId), type: r.type, createdAt: r.createdAt }));
  }
  async forward(id: string, convIds: string[]) {
    const s = await this.st(); const { m } = this.msg(s, id);
    if (m.deletedAt || m.kind === 'system') throw new DmError('dm_not_found', 'That message can’t be forwarded.');
    for (const cid of convIds) await this.send(cid, { clientId: nid('fw', this.now()), kind: m.kind as 'text', body: m.body, workout: m.workout, forwarded: true, forwardOf: m.media ? m.id : undefined });
  }

  // ---------- membership ----------
  async markRead(id: string) {
    const s = await this.st(); const c = s.convs.find((x) => x.id === id); if (!c) return;
    const me = memberOf(c, DM_ME); if (!me || (me.state !== 'active' && me.state !== 'request')) return;
    // Opening a request does not tell the sender you've seen it (read state is kept but hidden until you accept).
    me.lastReadAt = this.now(); me.deliveredAt = this.now();
    await this.commit();
  }
  async accept(id: string) { const s = await this.st(); const c = this.conv(s, id); const me = memberOf(c, DM_ME)!; if (me.state === 'request') { me.state = 'active'; me.lastReadAt = this.now(); await this.commit(); this.emit({ type: 'inbox' }); } }
  async decline(id: string) { const s = await this.st(); const c = this.conv(s, id); const me = memberOf(c, DM_ME)!; if (me.state === 'request') { me.state = 'declined'; await this.commit(); this.emit({ type: 'inbox' }); } }
  async setPrefs(id: string, p: { mutedUntil?: number | null; archived?: boolean; pinned?: boolean }) {
    const s = await this.st(); const c = this.conv(s, id); const me = memberOf(c, DM_ME)!;
    if (p.mutedUntil !== undefined) me.mutedUntil = p.mutedUntil || undefined;
    if (p.archived !== undefined) { me.archived = p.archived; if (p.archived) me.pinnedAt = undefined; }
    if (p.pinned !== undefined) {
      if (p.pinned && !me.pinnedAt) {
        const pins = s.convs.filter((x) => memberOf(x, DM_ME)?.pinnedAt && isParticipant(x, DM_ME)).length;
        if (pins >= MAX_PINS) throw new DmError('dm_pins', `You can pin up to ${MAX_PINS} chats.`);
        me.pinnedAt = this.now(); me.archived = false;
      } else if (!p.pinned) me.pinnedAt = undefined;
    }
    await this.commit(); this.emit({ type: 'inbox' });
  }
  async clearChat(id: string) { const s = await this.st(); const c = this.conv(s, id); const me = memberOf(c, DM_ME)!; me.clearedAt = this.now(); me.pinnedAt = undefined; me.archived = false; await this.commit(); this.emit({ type: 'inbox' }); }
  async renameGroup(id: string, title: string) {
    const s = await this.st(); const c = this.conv(s, id);
    if (!canManage(c, DM_ME, 'rename')) throw new DmError('dm_not_admin', 'Only group admins can rename the group.');
    const t = validateGroupTitle(title); if (!t.ok) throw new DmError('dm_title', t.error!);
    c.title = t.value; this.sysMsg(s, c, { type: 'renamed', actor: DM_ME, title: t.value }); memberOf(c, DM_ME)!.lastReadAt = this.now();
    await this.commit(); this.emit({ type: 'update', conversationId: id });
  }
  async addMembers(id: string, ids: string[]) {
    const s = await this.st(); const w = await this.deps.world(); const c = this.conv(s, id);
    if (!canManage(c, DM_ME, 'add')) throw new DmError('dm_not_member', 'You’re no longer in this chat.');
    const minors = new Set(Object.values(w.profiles).filter((p) => p.isMinor).map((p) => p.id));
    const current = c.members.filter((m) => m.state === 'active').map((m) => m.userId);
    const add = [...new Set(ids)].filter((u) => !current.includes(u));
    if (current.length + add.length > GROUP_MAX) throw new DmError('dm_group_full', `Groups can have up to ${GROUP_MAX} people.`);
    const now = this.now();
    for (const u of add) {
      const ok = canAddToGroup({ adder: DM_ME, user: u, graph: w.graph, members: [...current], minors, settings: this.settingsOf(s, u) });
      if (!ok.ok) throw new DmError('dm_cant_add', `${this.prof(w, u).displayName}: ${ok.msg}`);
      current.push(u);
      const ex = memberOf(c, u);
      // New members see the chat from the moment they join, not the history before.
      if (ex) Object.assign(ex, { state: 'active', role: 'member', joinedAt: now, clearedAt: now - 1, addedBy: DM_ME });
      else c.members.push(mem(u, { joinedAt: now, clearedAt: now - 1, addedBy: DM_ME }));
    }
    if (add.length) { this.sysMsg(s, c, { type: 'added', actor: DM_ME, targets: add }); memberOf(c, DM_ME)!.lastReadAt = this.now(); }
    await this.commit(); this.emit({ type: 'update', conversationId: id });
  }
  async removeMember(id: string, userId: string) {
    const s = await this.st(); const c = this.conv(s, id);
    if (!canManage(c, DM_ME, 'remove')) throw new DmError('dm_not_admin', 'Only group admins can remove people.');
    if (userId === DM_ME) throw new DmError('dm_self', 'Use Leave group instead.');
    const m = memberOf(c, userId); if (!m || m.state !== 'active') return;
    m.state = 'removed'; m.role = 'member';
    this.sysMsg(s, c, { type: 'removed', actor: DM_ME, targets: [userId] }); memberOf(c, DM_ME)!.lastReadAt = this.now();
    await this.commit(); this.emit({ type: 'update', conversationId: id });
  }
  async setAdmin(id: string, userId: string) {
    const s = await this.st(); const c = this.conv(s, id);
    if (!canManage(c, DM_ME, 'admin')) throw new DmError('dm_not_admin', 'Only group admins can do that.');
    const m = memberOf(c, userId); if (!m || m.state !== 'active' || m.role === 'admin') return;
    m.role = 'admin'; this.sysMsg(s, c, { type: 'admin', actor: DM_ME, targets: [userId] }); memberOf(c, DM_ME)!.lastReadAt = this.now();
    await this.commit(); this.emit({ type: 'update', conversationId: id });
  }
  async leaveGroup(id: string) {
    const s = await this.st(); const c = this.conv(s, id);
    if (c.kind !== 'group') throw new DmError('dm_not_group', 'Only group chats can be left.');
    const me = memberOf(c, DM_ME)!; me.state = 'left'; me.role = 'member'; me.pinnedAt = undefined;
    c.members = promoteIfNoAdmin(c.members);
    this.sysMsg(s, c, { type: 'left', actor: DM_ME });
    await this.commit(); this.emit({ type: 'inbox' });
  }

  // ---------- safety ----------
  async report(r: NewDmReport) {
    const s = await this.st(); const c = this.conv(s, r.conversationId);
    let snapshot: unknown; let targetUserId: string | undefined;
    if (r.targetType === 'message') {
      const m = s.messages.find((x) => x.id === r.targetId && x.conversationId === c.id);
      if (!m) throw new DmError('dm_not_found', 'That message is no longer available.');
      const extra = (r.messageIds || []).filter((id) => id !== m.id).map((id) => s.messages.find((x) => x.id === id && x.conversationId === c.id)).filter((x): x is Message => !!x).slice(0, 9);
      const snap = (x: Message) => ({ id: x.id, body: x.body, kind: x.kind, media: x.media?.url, sender: x.senderId, created_at: x.createdAt });
      snapshot = { ...snap(m), messages: [m, ...extra].map(snap) }; targetUserId = m.senderId;
    } else {
      snapshot = { recent: s.messages.filter((x) => x.conversationId === c.id && x.kind !== 'system').slice(-20).map((x) => ({ sender: x.senderId, body: x.body, kind: x.kind, created_at: x.createdAt })) };
      targetUserId = c.kind === 'direct' ? c.members.find((m) => m.userId !== DM_ME)?.userId : undefined;
    }
    this.limit(s, 'report', DM_LIMITS.reportDay);
    s.reports.push({ ...r, reason: r.reason as ReportReason, details: r.details ? cleanText(r.details, REPORT_DETAILS_MAX) : undefined, id: nid('rp', this.now()), createdAt: this.now(), snapshot, targetUserId });
    await this.commit();
  }
  async block(userId: string) {
    const s = await this.st();
    await this.deps.act({ type: 'block', other: userId });
    // A request from someone you block disappears from Requests.
    for (const c of s.convs) if (c.kind === 'direct' && memberOf(c, userId) && memberOf(c, DM_ME)?.state === 'request') memberOf(c, DM_ME)!.state = 'declined';
    await this.commit(); this.emit({ type: 'inbox' });
  }
  async unblock(userId: string) { await this.deps.act({ type: 'unblock', other: userId }); this.emit({ type: 'inbox' }); }
  async restrict(userId: string) {
    if (userId === DM_ME) throw new DmError('dm_self', 'You can’t restrict yourself.');
    const s = await this.st(); s.restricted = [...new Set([...(s.restricted || []), userId])]; await this.commit(); this.emit({ type: 'inbox' });
  }
  async unrestrict(userId: string) { const s = await this.st(); s.restricted = (s.restricted || []).filter((x) => x !== userId); await this.commit(); this.emit({ type: 'inbox' }); }
  async restrictedIds() { return [...((await this.st()).restricted || [])]; }
  setTyping() { /* sample people don't watch you type */ }
  async heartbeat() { /* demo: nothing to send */ }

  // ---------- search + people ----------
  async search(q: string): Promise<SearchResult> {
    const s = await this.st(); const w = await this.deps.world();
    const convs = await this.inbox();
    const by = new Map(convs.map((c) => [c.id, c]));
    const hidden = this.hiddenSet(s);
    const visible = s.convs.filter((c) => by.has(c.id)).flatMap((c) => visibleMessages(s.messages, c, DM_ME, hidden));
    const r = searchInbox(convs.map((c) => ({ id: c.id, title: c.title, handles: c.others.map((o) => o.profile.username) })), visible, q);
    return {
      chats: r.chats.map((x) => by.get(x.id)!),
      hits: r.hits.map((h) => { const m = s.messages.find((x) => x.id === h.messageId)!; return { ...h, conv: by.get(h.conversationId)!, senderName: m.senderId === DM_ME ? 'You' : this.prof(w, m.senderId).displayName }; }),
    };
  }
  async people(q: string) {
    const w = await this.deps.world();
    const fr = friendIds(w.graph, DM_ME).filter((id) => !isBlocked(w.graph, DM_ME, id)).map((id) => this.prof(w, id)).sort((a, b) => a.displayName.localeCompare(b.displayName));
    const n = q.trim().toLowerCase().replace(/^@/, '');
    const friends = n ? fr.filter((p) => p.displayName.toLowerCase().includes(n) || p.username.includes(n)) : fr;
    const others = n.length >= 2 ? (await this.deps.searchPeople(n)).filter((p) => p.id !== DM_ME && !areFriends(w.graph, DM_ME, p.id) && !isBlocked(w.graph, DM_ME, p.id)) : [];
    return { friends, others };
  }
  subscribe(cb: (e: DmEvent) => void) { this.subs.add(cb); return () => { this.subs.delete(cb); }; }

  // ---------- demo life: sample friends read and reply ----------
  private simulate(convId: string, mine: Message) {
    const sch = this.deps.schedule; if (!sch || !this.s) return;
    const s = this.s; const c = s.convs.find((x) => x.id === convId); if (!c) return;
    const others = activeMembers(c).filter((m) => m.userId !== DM_ME);
    if (!others.length || others.some((m) => m.state !== 'active') || !others.every((m) => m.userId.startsWith('s'))) return; // requests: nobody answers
    sch(() => { for (const o of others) o.deliveredAt = this.now(); this.commit(); this.emit({ type: 'update', conversationId: convId }); }, 700);
    sch(() => { for (const o of others) { o.lastReadAt = this.now(); s.active[o.userId] = this.now(); } this.commit(); this.emit({ type: 'read', conversationId: convId, userId: others[0].userId }); }, 1600);
    if (this.replying.has(convId)) return;
    this.replying.add(convId);
    const n = s.messages.filter((x) => x.conversationId === convId).length;
    const who = others[n % others.length].userId;
    sch(() => this.emit({ type: 'typing', conversationId: convId, userId: who, on: true }), 2300);
    sch(() => {
      this.replying.delete(convId);
      const cc = s.convs.find((x) => x.id === convId);
      if (!cc || !isParticipant(cc, DM_ME) || memberOf(cc, who)?.state !== 'active') return;
      const pool = REPLIES[who] || REPLIES.default;
      const body = mine.kind === 'workout' ? 'Strong session! 💪' : mine.kind === 'image' ? 'Looks great 🔥' : mine.kind === 'video' ? 'Great form! 🔥' : /\?\s*$/.test(mine.body) ? 'Good question. Let me check my plan and get back to you 👍' : pool[n % pool.length];
      const now = this.now();
      const m: Message = { id: nid('sr', now), conversationId: convId, senderId: who, kind: 'text', body, createdAt: now };
      s.messages.push(m); cc.lastMessageAt = now; s.active[who] = now;
      const me = memberOf(cc, DM_ME)!;
      me.deliveredAt = now;
      this.commit();
      this.emit({ type: 'typing', conversationId: convId, userId: who, on: false });
      this.emit({ type: 'message', conversationId: convId, message: m, senderId: who });
    }, 4300);
  }
}
