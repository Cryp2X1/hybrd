// Messages LIVE backend (Supabase). Tables, RLS, triggers and dm_* RPCs live in supabase/schema.sql (SETUP.md §12).
// The database enforces every rule (who can message whom, request limit, blocks, under-18, edit window, rate limits);
// this client only reads what RLS returns and maps it to views. Messages are protected by RLS, NOT end-to-end encrypted.
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import {
  cleanMessage, convTitle, DmError, folderOf, isMuted, MUTE_FOREVER, messageStatus, normalizeDmSettings, presenceText, REQUEST_MAX_MESSAGES, searchInbox, previewText, sortInbox,
  canSeePresence, validateDraft, validateGroupTitle,
  type Conversation, type DmSettings, type Member, type MemberRole, type MemberState, type Message, type MsgKind, type SystemEvent,
} from './messages';
import { cleanText, isReactionType, summarizeReactions, REPORT_DETAILS_MAX, type PublicProfile, type ReactionType } from './social';
import type { ReactorView } from './socialApi';
import type { SupabaseSocial } from './socialSupabase';
import { UNKNOWN_PROFILE, type ConvView, type DmBackend, type DmEvent, type Draft, type EligibilityView, type MemberView, type MessageView, type NewDmReport, type SearchResult } from './messagesApi';
import { DND_FOREVER } from './calls';

export const DM_BUCKET = 'message-media';
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const MSG_COLS = 'id, conversation_id, sender_id, kind, body, media, workout, meta, reply_to, forwarded, created_at, edited_at, deleted_at';
const ts = (s?: string | null) => (s ? Date.parse(s) : 0);
const iso = (n: number) => new Date(n).toISOString();
const ext = (mime: string) => ({ 'image/png': 'png', 'image/webp': 'webp', 'image/jpeg': 'jpg', 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm' } as Record<string, string>)[mime] || 'bin';
const rid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => ((Math.random() * 16) | 0).toString(16)));
const DENY_MSG: Record<string, string> = {
  dm_self: 'That’s you.', dm_unavailable: 'You can’t message this account.', dm_no_one: 'This person isn’t accepting new messages.',
  dm_friends_only: 'Only their friends can message them. Send a friend request first.', dm_fof_only: 'Only friends and friends of friends can message them.',
  dm_minor: 'To keep teens safe, under-18s and adults can only message each other when they’re friends.',
};

export class SupabaseDm implements DmBackend {
  readonly kind = 'live' as const;
  readonly myId: string;
  private sb: SupabaseClient;
  private social: SupabaseSocial;
  private signed = new Map<string, { url: string; exp: number }>();
  private profCache = new Map<string, PublicProfile>();
  private convCache = new Map<string, ConvView>();
  private mySettings: DmSettings | null = null;
  private subs = new Set<(e: DmEvent) => void>();
  private typingCh = new Map<string, RealtimeChannel>();
  constructor(sb: SupabaseClient, myId: string, social: SupabaseSocial) { this.sb = sb; this.myId = myId; this.social = social; }

  private async q<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
    const { data, error } = await p;
    if (error) throw new Error(error.message);
    return data;
  }
  private async rpc<T = unknown>(fn: string, args?: Row): Promise<T> { const { data, error } = await this.sb.rpc(fn, args); if (error) throw new Error(error.message); return data as T; }
  private emit(e: DmEvent) { for (const f of this.subs) { try { f(e); } catch { /* ignore */ } } }
  private async sign(paths: (string | undefined)[]): Promise<Map<string, string>> {
    const out = new Map<string, string>(); const need: string[] = []; const now = Date.now();
    for (const p of new Set(paths.filter(Boolean) as string[])) { const c = this.signed.get(p); if (c && c.exp > now) out.set(p, c.url); else need.push(p); }
    if (need.length) {
      const { data } = await this.sb.storage.from(DM_BUCKET).createSignedUrls(need, 3600);
      for (const d of data || []) if (d.signedUrl && d.path) { out.set(d.path, d.signedUrl); this.signed.set(d.path, { url: d.signedUrl, exp: now + 50 * 60_000 }); }
    }
    return out;
  }
  private async profiles(ids: string[]): Promise<Map<string, PublicProfile>> {
    const need = [...new Set(ids.filter((x) => x && !this.profCache.has(x)))];
    if (need.length) for (const [k, v] of await this.social.profilesById(need)) this.profCache.set(k, v);
    return new Map([...new Set(ids)].map((id) => [id, this.profCache.get(id) || UNKNOWN_PROFILE(id)]));
  }
  private toMsg(r: Row): Message {
    return {
      id: r.id, conversationId: r.conversation_id, senderId: r.sender_id || '', kind: r.kind as MsgKind, body: r.body || '',
      media: r.media ? { url: '', path: r.media.path, w: r.media.w || 1, h: r.media.h || 1, mime: r.media.mime || '', size: r.media.size, duration: r.media.duration, posterPath: r.media.poster_path } : undefined,
      workout: r.workout || undefined, replyTo: r.reply_to || undefined, forwarded: r.forwarded || undefined,
      system: r.kind === 'system' && r.meta ? (r.meta as SystemEvent) : undefined,
      createdAt: ts(r.created_at), editedAt: r.edited_at ? ts(r.edited_at) : undefined, deletedAt: r.deleted_at ? ts(r.deleted_at) : undefined,
    };
  }
  private async withUrls(ms: Message[]): Promise<Message[]> {
    const urls = await this.sign(ms.flatMap((m) => (m.media && !m.deletedAt ? [m.media.path, m.media.posterPath] : [])));
    return ms.map((m) => (m.media ? { ...m, media: { ...m.media, url: (m.media.path && urls.get(m.media.path)) || '', poster: m.media.posterPath ? urls.get(m.media.posterPath) : undefined } } : m));
  }

  // ---------- settings ----------
  async getSettings(): Promise<DmSettings> {
    // who_can_call / dnd_until come with the Calls SQL (SETUP.md §13); older databases fall back to the Messages columns.
    let rows: Row[];
    try { rows = (await this.q(this.sb.from('dm_settings').select('who_can_message, read_receipts, show_activity, who_can_call, dnd_until').eq('user_id', this.myId))) as Row[]; this.callCols = true; }
    catch { rows = (await this.q(this.sb.from('dm_settings').select('who_can_message, read_receipts, show_activity').eq('user_id', this.myId))) as Row[]; this.callCols = false; }
    const me = (await this.profiles([this.myId])).get(this.myId);
    const r = rows[0];
    this.mySettings = normalizeDmSettings(r ? { who: r.who_can_message, readReceipts: r.read_receipts, activity: r.show_activity, calls: r.who_can_call, dndUntil: dndFromDb(r.dnd_until) } : null, !!me?.isMinor);
    return this.mySettings;
  }
  async saveSettings(s: DmSettings): Promise<DmSettings> {
    const v = normalizeDmSettings(s);
    const row: Record<string, unknown> = { user_id: this.myId, who_can_message: v.who, read_receipts: v.readReceipts, show_activity: v.activity };
    if (this.callCols !== false) { row.who_can_call = v.calls; row.dnd_until = dndToDb(v.dndUntil); }
    try { await this.q(this.sb.from('dm_settings').upsert(row, { onConflict: 'user_id' })); }
    catch (e) {
      if (this.callCols === false || !('who_can_call' in row)) throw e;
      // the Calls SQL isn't installed yet: save the message settings and say so
      delete row.who_can_call; delete row.dnd_until; this.callCols = false;
      await this.q(this.sb.from('dm_settings').upsert(row, { onConflict: 'user_id' }));
    }
    this.mySettings = v; this.emit({ type: 'inbox' });
    return v;
  }
  /** false = the database doesn't have the call columns yet */
  callCols: boolean | null = null;
  private async settings() { return this.mySettings || this.getSettings(); }

  // ---------- views ----------
  private async buildConvs(rows: Row[]): Promise<ConvView[]> {
    const myS = await this.settings();
    const ids = rows.flatMap((r) => [...(r.members as Row[]).map((m) => m.user_id as string), r.last_message?.sender_id as string]);
    const prof = await this.profiles(ids.filter(Boolean));
    const directOthers = rows.filter((r) => r.kind === 'direct').flatMap((r) => (r.members as Row[]).filter((m) => m.user_id !== this.myId).map((m) => m.user_id as string));
    const restrictedSet = new Set(await this.restrictedIds().catch(() => [] as string[]));
    const [pres, blocks] = await Promise.all([
      directOthers.length && myS.activity ? this.rpc<Row[]>('dm_presence', { p_users: [...new Set(directOthers)] }).catch(() => [] as Row[]) : Promise.resolve([] as Row[]),
      directOthers.length ? this.q(this.sb.from('blocks').select('blocked_id').eq('blocker_id', this.myId).in('blocked_id', [...new Set(directOthers)])).catch(() => [] as Row[]) : Promise.resolve([] as Row[]),
    ]);
    const lastActive = new Map((pres || []).map((p) => [p.user_id as string, ts(p.last_active_at)]));
    const blockedByMe = new Set(((blocks || []) as Row[]).map((b) => b.blocked_id as string));
    const lasts = await this.withUrls(rows.filter((r) => r.last_message).map((r) => this.toMsg({ ...r.last_message, conversation_id: r.conversation_id })));
    const lastBy = new Map(lasts.map((m) => [m.conversationId, m]));
    return rows.map((r) => {
      const memRows = r.members as Row[];
      const members: Member[] = memRows.map((m) => ({
        userId: m.user_id, role: m.role as MemberRole, state: m.state as MemberState, joinedAt: ts(m.joined_at),
        lastReadAt: ts(m.seen_at), deliveredAt: ts(m.delivered_at),
      }));
      const meM: Member = {
        userId: this.myId, role: r.role, state: r.state, joinedAt: ts(r.created_at), lastReadAt: ts(r.last_read_at), deliveredAt: ts(r.last_read_at),
        mutedUntil: r.muted_until ? Math.min(ts(r.muted_until), MUTE_FOREVER) : undefined, archived: !!r.archived, pinnedAt: r.pinned_at ? ts(r.pinned_at) : undefined, clearedAt: r.cleared_at ? ts(r.cleared_at) : undefined,
      };
      const conv: Conversation = { id: r.conversation_id, kind: r.kind, title: r.title || undefined, createdBy: r.created_by || '', createdAt: ts(r.created_at), lastMessageAt: ts(r.last_message_at), members: [meM, ...members.filter((m) => m.userId !== this.myId)] };
      const views: MemberView[] = conv.members.map((m) => ({ userId: m.userId, role: m.role, state: m.state, joinedAt: m.joinedAt, profile: prof.get(m.userId) || UNKNOWN_PROFILE(m.userId), seenAt: m.userId !== this.myId && m.lastReadAt ? m.lastReadAt : undefined, deliveredAt: m.deliveredAt || undefined }));
      const others = views.filter((m) => m.userId !== this.myId);
      const direct = conv.kind === 'direct' ? others[0] : undefined;
      const outgoing = conv.kind === 'direct' && !!direct && direct.state !== 'active' && r.state === 'active';
      const lastM = lastBy.get(conv.id);
      const last: MessageView | null = lastM ? this.viewOne(lastM, conv, prof, myS, new Map()) : null;
      const la = direct ? lastActive.get(direct.userId) : undefined;
      const restricted = !!direct && restrictedSet.has(direct.userId);
      const v: ConvView = {
        id: conv.id, kind: conv.kind, customTitle: conv.title, title: convTitle(conv, this.myId, Object.fromEntries(prof)), createdBy: conv.createdBy, createdAt: conv.createdAt, lastMessageAt: conv.lastMessageAt,
        me: meM, members: views, others, folder: folderOf(conv, this.myId, restricted), unread: Number(r.unread) || 0, last,
        muted: isMuted(meM), pinned: !!meM.pinnedAt, archived: !!meM.archived,
        request: r.state === 'request' ? 'incoming' : outgoing ? 'outgoing' : null,
        requestRemaining: outgoing ? Math.max(0, REQUEST_MAX_MESSAGES - (Number(r.requests_sent) || 0)) : Infinity,
        blocked: direct && blockedByMe.has(direct.userId) ? 'byMe' : direct && !this.profCache.has(direct.userId) ? 'unavailable' : null,
        presence: direct && direct.state === 'active' && la && canSeePresence(myS, { activity: true }, false) ? presenceText(la) : null,
        isAdmin: r.role === 'admin' && r.state === 'active', restricted,
      };
      this.convCache.set(v.id, v);
      return v;
    });
  }
  private viewOne(m: Message, conv: Conversation, prof: Map<string, PublicProfile>, myS: DmSettings, byId: Map<string, Message>, rx: Row[] = []): MessageView {
    const mine = m.senderId === this.myId;
    const st = messageStatus(m, { conv, me: this.myId, myReceipts: myS.readReceipts });
    const my = rx.find((x) => x.user_id === this.myId)?.kind;
    let reply: MessageView['reply'] = null;
    if (m.replyTo) {
      const o = byId.get(m.replyTo);
      reply = o ? { id: o.id, senderName: o.senderId === this.myId ? 'You' : (prof.get(o.senderId) || UNKNOWN_PROFILE(o.senderId)).displayName, mine: o.senderId === this.myId, preview: previewText({ ...o, senderId: '_' }, this.myId, (id) => (prof.get(id) || UNKNOWN_PROFILE(id)).displayName), deleted: !!o.deletedAt, kind: o.kind, thumb: o.kind === 'image' ? o.media?.url : o.kind === 'video' ? o.media?.poster : undefined }
        : { id: m.replyTo, senderName: '', mine: false, preview: 'Original message not available', deleted: true, kind: 'text' };
    }
    return {
      ...m, mine, sender: prof.get(m.senderId) || UNKNOWN_PROFILE(m.senderId),
      reactions: summarizeReactions(rx.filter((x) => isReactionType(x.kind)).map((x) => ({ type: x.kind as ReactionType }))), myReaction: my && isReactionType(my) ? my : null,
      status: st?.status, seenBy: st?.seenBy, reply,
    };
  }

  // ---------- reading ----------
  async inbox(): Promise<ConvView[]> {
    const rows = (await this.rpc<Row[]>('dm_inbox')) || [];
    const views = await this.buildConvs(rows);
    return sortInbox(views.map((v) => ({ members: [v.me], lastMessageAt: v.lastMessageAt, v })), this.myId).map((x) => x.v).filter((v) => v.folder);
  }
  async conversation(id: string): Promise<ConvView | null> {
    const rows = ((await this.rpc<Row[]>('dm_inbox')) || []).filter((r) => r.conversation_id === id);
    return rows.length ? (await this.buildConvs(rows))[0] : null;
  }
  async messages(id: string): Promise<MessageView[]> {
    const conv = this.convCache.get(id) || (await this.conversation(id));
    if (!conv) return [];
    const [rows, hidden] = await Promise.all([
      this.q(this.sb.from('messages').select(MSG_COLS).eq('conversation_id', id).order('created_at', { ascending: false }).limit(300)) as Promise<Row[]>,
      this.q(this.sb.from('message_hidden').select('message_id').eq('user_id', this.myId)) as Promise<Row[]>,
    ]);
    const hid = new Set(hidden.map((h) => h.message_id as string));
    const ms = await this.withUrls(rows.reverse().filter((r) => !hid.has(r.id)).map((r) => this.toMsg(r)));
    const rx = ms.length ? ((await this.q(this.sb.from('message_reactions').select('message_id, user_id, kind').in('message_id', ms.map((m) => m.id)))) as Row[]) : [];
    const prof = await this.profiles([...ms.map((m) => m.senderId), ...conv.members.map((m) => m.userId)]);
    const myS = await this.settings();
    const c: Conversation = { id, kind: conv.kind, title: conv.customTitle, createdBy: conv.createdBy, createdAt: conv.createdAt, lastMessageAt: conv.lastMessageAt,
      members: conv.members.map((m) => ({ userId: m.userId, role: m.role, state: m.state, joinedAt: m.joinedAt, lastReadAt: m.userId === this.myId ? conv.me.lastReadAt : m.seenAt || 0, deliveredAt: m.deliveredAt || 0 })) };
    const byId = new Map(ms.map((m) => [m.id, m]));
    return ms.map((m) => this.viewOne(m, c, prof, myS, byId, rx.filter((x) => x.message_id === m.id)));
  }
  async eligibility(userId: string): Promise<EligibilityView> {
    const code = await this.rpc<string>('dm_can_message', { p_other: userId });
    if (code === 'ok' || code === 'request') return { ok: true, request: code === 'request' };
    const reason = code.replace(/^dm_/, '') as 'unavailable';
    return { ok: false, reason, msg: DENY_MSG[code] || 'You can’t message this account.' };
  }
  async openDirect(userId: string) { return this.rpc<string>('dm_open_direct', { p_other: userId }); }
  private async named<T>(p: Promise<T>): Promise<T> {
    try { return await p; } catch (e) {
      const m = (e as Error).message || '';
      const id = /([0-9a-f-]{36}) can't be added/.exec(m)?.[1];
      if (!id) throw e;
      const who = (await this.profiles([id])).get(id)?.displayName || 'Someone';
      throw new DmError(m.split(':')[0], `${who} can’t be added: ${/dm_minor/.test(m) ? 'under-18s and adults can only chat when they’re friends.' : /dm_no_one/.test(m) ? 'they aren’t accepting new chats.' : /dm_unavailable/.test(m) ? 'not available.' : 'you can only add your friends.'}`);
    }
  }
  async createGroup(title: string, userIds: string[]) {
    const t = validateGroupTitle(title); if (!t.ok) throw new DmError('dm_title', t.error!);
    return this.named(this.rpc<string>('dm_create_group', { p_title: t.value, p_members: [...new Set(userIds)] }));
  }

  // ---------- sending ----------
  private async upload(convId: string, blob: Blob, mime: string): Promise<string> {
    const path = `${convId}/${this.myId}/${rid()}.${ext(mime)}`;
    const { error } = await this.sb.storage.from(DM_BUCKET).upload(path, blob, { contentType: mime, upsert: false, cacheControl: '3600' });
    if (error) throw new Error(error.message);
    return path;
  }
  async send(conversationId: string, d: Draft): Promise<Message> {
    const body = cleanMessage(d.body || '');
    let media: Row | null = null;
    if (d.forwardOf) {
      const src = ((await this.q(this.sb.from('messages').select(MSG_COLS).eq('id', d.forwardOf).limit(1))) as Row[])[0];
      if (!src || src.deleted_at || !src.media) throw new DmError('dm_not_found', 'That message is no longer available.');
      // Media is re-uploaded into the destination chat's folder so access follows that chat's membership.
      const copy = async (p: string, mime: string) => { const { data, error } = await this.sb.storage.from(DM_BUCKET).download(p); if (error || !data) throw new Error(error?.message || 'download failed'); return this.upload(conversationId, data, mime); };
      const fm: Row = { ...src.media, path: await copy(src.media.path, src.media.mime) };
      if (src.media.poster_path) fm.poster_path = await copy(src.media.poster_path, 'image/webp');
      media = fm;
    }
    const err = validateDraft({ kind: d.kind, body, hasMedia: !!d.media || !!media, hasWorkout: !!d.workout });
    if (err) throw new DmError('dm_invalid', err);
    if (d.media) {
      media = { path: await this.upload(conversationId, d.media.blob, d.media.mime), w: d.media.w, h: d.media.h, mime: d.media.mime, size: d.media.blob.size };
      if (d.media.duration) media.duration = Math.round(d.media.duration);
      if (d.media.poster) media!.poster_path = await this.upload(conversationId, d.media.poster, d.media.poster.type || 'image/webp');
    }
    const row = { id: d.clientId, conversation_id: conversationId, kind: d.kind, body, media, workout: d.workout || null, reply_to: d.replyTo || null, forwarded: !!d.forwarded };
    const { data, error } = await this.sb.from('messages').insert(row).select(MSG_COLS).single();
    if (error) {
      // Retried after a timeout that actually reached the server: the client UUID makes it idempotent.
      if (/duplicate key|messages_pkey/.test(error.message)) { const ex = ((await this.q(this.sb.from('messages').select(MSG_COLS).eq('id', d.clientId).limit(1))) as Row[])[0]; if (ex) return this.toMsg(ex); }
      throw new Error(error.message);
    }
    return this.toMsg(data as Row);
  }
  async edit(messageId: string, body: string) {
    const b = cleanMessage(body); if (!b) throw new DmError('dm_empty', 'Write something first.');
    const rows = (await this.q(this.sb.from('messages').update({ body: b }).eq('id', messageId).eq('sender_id', this.myId).select('id'))) as Row[];
    if (!rows.length) throw new DmError('dm_not_sender', 'You can only change your own messages.');
  }
  async unsend(messageId: string) {
    const rows = (await this.q(this.sb.from('messages').update({ deleted_at: iso(Date.now()) }).eq('id', messageId).eq('sender_id', this.myId).select('id, media'))) as Row[];
    if (!rows.length) throw new DmError('dm_not_sender', 'You can only unsend your own messages.');
  }
  async deleteForMe(messageId: string) { const { error } = await this.sb.from('message_hidden').insert({ message_id: messageId }); if (error && !/duplicate/.test(error.message)) throw new Error(error.message); }
  async react(messageId: string, type: ReactionType | null) {
    if (!type) { await this.q(this.sb.from('message_reactions').delete().eq('message_id', messageId).eq('user_id', this.myId)); return; }
    await this.q(this.sb.from('message_reactions').upsert({ message_id: messageId, user_id: this.myId, kind: type }, { onConflict: 'message_id,user_id' }));
  }
  async reactors(messageId: string): Promise<ReactorView[]> {
    const rows = (await this.q(this.sb.from('message_reactions').select('user_id, kind, created_at').eq('message_id', messageId).order('created_at', { ascending: false }))) as Row[];
    const prof = await this.profiles(rows.map((r) => r.user_id));
    return rows.filter((r) => isReactionType(r.kind)).map((r) => ({ user: prof.get(r.user_id)!, type: r.kind as ReactionType, createdAt: ts(r.created_at) }));
  }
  async forward(messageId: string, conversationIds: string[]) {
    const src = ((await this.q(this.sb.from('messages').select(MSG_COLS).eq('id', messageId).limit(1))) as Row[])[0];
    if (!src || src.deleted_at || src.kind === 'system') throw new DmError('dm_not_found', 'That message can’t be forwarded.');
    for (const cid of conversationIds) await this.send(cid, { clientId: rid(), kind: src.kind, body: src.body, workout: src.workout || undefined, forwarded: true, forwardOf: src.media ? src.id : undefined });
  }

  // ---------- membership ----------
  async markRead(conversationId: string) { await this.rpc('dm_mark_read', { p_conv: conversationId }); if (!this.isRestrictedChat(conversationId)) this.broadcast(conversationId, 'read', {}); }
  async accept(conversationId: string) { await this.rpc('dm_accept', { p_conv: conversationId }); this.emit({ type: 'inbox' }); }
  async decline(conversationId: string) { await this.rpc('dm_decline', { p_conv: conversationId }); this.emit({ type: 'inbox' }); }
  async setPrefs(conversationId: string, p: { mutedUntil?: number | null; archived?: boolean; pinned?: boolean }) {
    const u: Row = {};
    if (p.mutedUntil !== undefined) u.muted_until = p.mutedUntil ? iso(Math.min(p.mutedUntil, Date.parse('9999-12-31'))) : null;
    if (p.archived !== undefined) u.archived = p.archived;
    if (p.pinned !== undefined) u.pinned_at = p.pinned ? iso(Date.now()) : null;
    await this.q(this.sb.from('conversation_members').update(u).eq('conversation_id', conversationId).eq('user_id', this.myId));
    this.emit({ type: 'inbox' });
  }
  async clearChat(conversationId: string) { await this.q(this.sb.from('conversation_members').update({ cleared_at: iso(Date.now()), pinned_at: null, archived: false }).eq('conversation_id', conversationId).eq('user_id', this.myId)); this.emit({ type: 'inbox' }); }
  async renameGroup(conversationId: string, title: string) { const t = validateGroupTitle(title); if (!t.ok) throw new DmError('dm_title', t.error!); await this.rpc('dm_rename_group', { p_conv: conversationId, p_title: t.value }); }
  async addMembers(conversationId: string, userIds: string[]) { await this.named(this.rpc('dm_add_members', { p_conv: conversationId, p_members: userIds })); }
  async removeMember(conversationId: string, userId: string) { await this.rpc('dm_remove_member', { p_conv: conversationId, p_user: userId }); }
  async setAdmin(conversationId: string, userId: string) { await this.rpc('dm_set_admin', { p_conv: conversationId, p_user: userId }); }
  async leaveGroup(conversationId: string) { await this.rpc('dm_leave', { p_conv: conversationId }); this.emit({ type: 'inbox' }); }
  async report(r: NewDmReport) {
    await this.q(this.sb.from('message_reports').insert({
      target_type: r.targetType, conversation_id: r.conversationId, message_id: r.targetType === 'message' ? r.targetId : null,
      reason: r.reason, details: r.details ? cleanText(r.details, REPORT_DETAILS_MAX) : null,
      ...(r.messageIds?.length ? { message_ids: r.messageIds.slice(0, 10) } : {}),
    }));
  }
  async block(userId: string) { await this.social.act({ type: 'block', other: userId }); this.emit({ type: 'inbox' }); }
  async unblock(userId: string) { await this.social.act({ type: 'unblock', other: userId }); this.emit({ type: 'inbox' }); }
  // Restrict lives in dm_restricts (only I can see my rows). The server hides my receipts/online status from them and refuses their calls.
  private restrictedCache: { at: number; ids: string[] } | null = null;
  async restrict(userId: string) {
    await this.q(this.sb.from('dm_restricts').upsert({ user_id: this.myId, restricted_id: userId }, { onConflict: 'user_id,restricted_id', ignoreDuplicates: true }));
    this.restrictedCache = null; this.emit({ type: 'inbox' });
  }
  async unrestrict(userId: string) { await this.q(this.sb.from('dm_restricts').delete().eq('user_id', this.myId).eq('restricted_id', userId)); this.restrictedCache = null; this.emit({ type: 'inbox' }); }
  async restrictedIds(): Promise<string[]> {
    if (this.restrictedCache && Date.now() - this.restrictedCache.at < 30_000) return this.restrictedCache.ids;
    const rows = ((await this.q(this.sb.from('dm_restricts').select('restricted_id').eq('user_id', this.myId)).catch(() => [])) || []) as Row[];
    const ids = rows.map((r) => r.restricted_id as string);
    this.restrictedCache = { at: Date.now(), ids };
    return ids;
  }
  private isRestrictedChat(conversationId: string) {
    const c = this.convCache.get(conversationId);
    return !!c?.restricted;
  }

  // ---------- realtime: typing + seen over Broadcast (private channel dm:<id>, RLS on realtime.messages) ----------
  private channel(conversationId: string): RealtimeChannel {
    let ch = this.typingCh.get(conversationId);
    if (ch) return ch;
    ch = this.sb.channel(`dm:${conversationId}`, { config: { private: true, broadcast: { self: false } } })
      .on('broadcast', { event: 'typing' }, ({ payload }) => { if (payload?.u && payload.u !== this.myId) this.emit({ type: 'typing', conversationId, userId: payload.u, on: !!payload.on }); })
      .on('broadcast', { event: 'read' }, ({ payload }) => { if (payload?.u && payload.u !== this.myId) this.emit({ type: 'read', conversationId, userId: payload.u }); })
      .subscribe();
    this.typingCh.set(conversationId, ch);
    return ch;
  }
  /** Join the chat's live channel while it's open (typing + seen); call `leave` when closing it. */
  watch(conversationId: string): () => void {
    this.channel(conversationId);
    return () => { const ch = this.typingCh.get(conversationId); if (ch) { this.sb.removeChannel(ch); this.typingCh.delete(conversationId); } };
  }
  private broadcast(conversationId: string, event: string, payload: Row) {
    const ch = this.typingCh.get(conversationId); if (!ch) return;
    ch.send({ type: 'broadcast', event, payload: { ...payload, u: this.myId } }).catch(() => undefined);
  }
  setTyping(conversationId: string, on: boolean) {
    if (this.mySettings && !this.mySettings.activity) return; // activity status off → never broadcast typing (reciprocal)
    if (this.isRestrictedChat(conversationId)) return; // restricted people don't see me typing
    this.broadcast(conversationId, 'typing', { on });
  }
  async heartbeat() { await this.rpc('dm_heartbeat').catch(() => undefined); await this.rpc('dm_mark_delivered').catch(() => undefined); }

  // ---------- search + people ----------
  async search(q: string): Promise<SearchResult> {
    const convs = await this.inbox();
    const n = q.trim().replace(/^@/, '').replace(/[%_\\]/g, (c) => `\\${c}`).slice(0, 60);
    if (n.length < 2) return { chats: [], hits: [] };
    const rows = (await this.q(this.sb.from('messages').select('id, conversation_id, sender_id, body, kind, created_at, deleted_at').ilike('body', `%${n}%`).is('deleted_at', null).neq('kind', 'system').order('created_at', { ascending: false }).limit(50))) as Row[];
    const res = searchInbox(convs.map((c) => ({ ...c, handles: c.others.map((o) => o.profile.username) })), rows.map((r) => this.toMsg(r)), q);
    const byId = new Map(convs.map((c) => [c.id, c]));
    const sender = new Map(rows.map((r) => [r.id as string, r.sender_id as string]));
    const prof = await this.profiles([...sender.values()]);
    return {
      chats: res.chats.map((c) => byId.get(c.id)!).filter(Boolean),
      hits: res.hits.filter((h) => byId.has(h.conversationId)).map((h) => { const s = sender.get(h.messageId) || ''; return { ...h, conv: byId.get(h.conversationId)!, senderName: s === this.myId ? 'You' : (prof.get(s) || UNKNOWN_PROFILE(s)).displayName }; }),
    };
  }
  async people(q: string) {
    const g = await this.social.graph();
    const n = q.trim().toLowerCase().replace(/^@/, '');
    const match = (p: PublicProfile) => !n || p.username.includes(n) || p.displayName.toLowerCase().includes(n);
    const friends = g.friends.filter(match);
    const blocked = new Set(g.blocked.map((b) => b.id));
    const others = n.length >= 2 ? (await this.social.search(n)).filter((p) => !blocked.has(p.id) && !friends.some((f) => f.id === p.id)) : [];
    for (const p of [...friends, ...others]) this.profCache.set(p.id, p);
    return { friends, others };
  }

  // ---------- live updates: postgres_changes (RLS-filtered) ----------
  subscribe(cb: (e: DmEvent) => void): () => void {
    this.subs.add(cb);
    const ch = this.sb.channel(`dm-inbox:${this.myId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (p) => {
        const r = p.new as Row; const m = this.toMsg(r);
        this.emit({ type: 'message', conversationId: m.conversationId, message: m, senderId: m.senderId });
        this.emit({ type: 'inbox' });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, (p) => this.emit({ type: 'update', conversationId: (p.new as Row).conversation_id }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, () => this.emit({ type: 'update', conversationId: '*' }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversation_members', filter: `user_id=eq.${this.myId}` }, () => this.emit({ type: 'inbox' }))
      .subscribe();
    return () => { this.subs.delete(cb); this.sb.removeChannel(ch); };
  }
}

// Do not disturb "until I turn it off" is stored as a far-future date Postgres can parse.
const DB_FOREVER = '9999-12-31T00:00:00Z';
export function dndToDb(v: number | null): string | null { if (!v) return null; return v >= DND_FOREVER ? DB_FOREVER : new Date(v).toISOString(); }
export function dndFromDb(v: unknown): number | null {
  if (typeof v !== 'string' || !v) return null;
  const t = Date.parse(v); if (!Number.isFinite(t)) return null;
  return new Date(t).getUTCFullYear() >= 9999 ? DND_FOREVER : t;
}
