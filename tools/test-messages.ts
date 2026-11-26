// Unit checks for Messages (DMs + groups): who-can-message rules, requests + the 3-message limit, privacy settings,
// under-18 rules, blocks, edit window, unsend, reactions, unread + badge, read receipts, search, links/scam warnings,
// notifications, the offline outbox, and the demo backend end to end (sample people, on-device).
// Run: node --experimental-strip-types --import ./tools/ts-resolve.mjs tools/test-messages.ts
import { readFileSync } from 'node:fs';
import {
  eligibility, canAddToGroup, canManage, promoteIfNoAdmin, validateGroupTitle, outgoingRequest, requestRemaining, canSend, canEdit, canUnsend, applyEdit, applyUnsend,
  applyMsgReaction, messageReactions, visibleMessages, unreadCount, folderOf, sortInbox, inboxBadge, messageStatus, canSeePresence, presenceText, typingLabel, liveTyping,
  safeHref, linkRisk, linkify, strangerWarning, scamSignals, hasContactInfo, chatItems, dayLabel, previewText, systemText, convTitle, copyText, searchInbox, snippet,
  enqueue, dueItems, afterAttempt, retryItem, markSending, resumeOutbox, isRetryable, backoffMs, notificationFor, friendlyDmError, checkMessageMedia, validateDraft,
  normalizeDmSettings, defaultDmSettings, isFriendOfFriend, crisisInText, cleanMessage, DmError, REQUEST_MAX_MESSAGES, EDIT_WINDOW_MS, GROUP_MAX, MSG_MAX, MAX_AUTO_ATTEMPTS, MUTE_FOREVER,
  type Conversation, type Member, type Message, type MsgReaction, type OutboxItem,
} from '../src/lib/messages.ts';
import type { Graph } from '../src/lib/social.ts';
import { DemoBackend, type DemoState } from '../src/lib/socialDemo.ts';
import { DemoDm, seedDm, DM_ME, type DmDemoState } from '../src/lib/messagesDemo.ts';
import { FEATURES, can } from '../src/lib/entitlements.ts';

let failed = 0;
const check = (name: string, cond: boolean, detail?: unknown) => { if (!cond) { failed++; console.error('FAIL', name, detail ?? ''); } else console.log('ok', name); };
const rejects = async (name: string, p: () => Promise<unknown>, re?: RegExp) => { try { await p(); check(name, false, 'did not throw'); } catch (e) { const m = `${(e as DmError).code || ''} ${(e as Error).message}`; check(name, !re || re.test(m), m); } };
const throws = (name: string, fn: () => unknown, re?: RegExp) => { try { fn(); check(name, false, 'did not throw'); } catch (e) { const m = `${(e as DmError).code || ''} ${(e as Error).message}`; check(name, !re || re.test(m), m); } };

const G = (friends: [string, string][] = [], blocks: [string, string][] = []): Graph => ({ requests: [], friends: friends.map(([a, b]) => (a < b ? [a, b] : [b, a]) as [string, string]), blocks });
const mem = (userId: string, o: Partial<Member> = {}): Member => ({ userId, role: 'member', state: 'active', joinedAt: 0, lastReadAt: 0, deliveredAt: 0, ...o });
const msg = (id: string, senderId: string, createdAt: number, o: Partial<Message> = {}): Message => ({ id, conversationId: 'c', senderId, kind: 'text', body: 'hi', createdAt, ...o });
const EVERY = defaultDmSettings(false);
const S = (who: 'everyone' | 'fof' | 'friends' | 'none') => ({ ...EVERY, who });

// ---------- who can message whom ----------
const g = G([['a', 'b'], ['b', 'c']]);
check('friends: direct chat, no request', JSON.stringify(eligibility({ me: 'a', other: 'b', graph: g, otherSettings: S('friends') })) === JSON.stringify({ ok: true, request: false }));
check('everyone: stranger → request', JSON.stringify(eligibility({ me: 'a', other: 'z', graph: g, otherSettings: EVERY })) === JSON.stringify({ ok: true, request: true }));
check('friends only: stranger refused', (() => { const e = eligibility({ me: 'a', other: 'z', graph: g, otherSettings: S('friends') }); return !e.ok && e.reason === 'friends_only'; })());
check('friends of friends: mutual friend → request; none → refused', (() => { const y = eligibility({ me: 'a', other: 'c', graph: g, otherSettings: S('fof') }); const n = eligibility({ me: 'a', other: 'z', graph: g, otherSettings: S('fof') }); return y.ok && y.request && !n.ok && n.reason === 'fof_only'; })());
check('isFriendOfFriend', isFriendOfFriend(g, 'a', 'c') && !isFriendOfFriend(g, 'a', 'z'));
check('no one: even friends cannot start a new chat', (() => { const e = eligibility({ me: 'a', other: 'b', graph: g, otherSettings: S('none') }); return !e.ok && e.reason === 'no_one'; })());
check('no one: an existing active chat keeps working', eligibility({ me: 'a', other: 'b', graph: g, otherSettings: S('none'), existingActive: true }).ok);
check('self refused', !eligibility({ me: 'a', other: 'a', graph: g, otherSettings: EVERY }).ok);
check('blocked (either way) → generic "unavailable", even with an existing chat', (() => {
  const gb = G([['a', 'b']], [['b', 'a']]);
  const e1 = eligibility({ me: 'a', other: 'b', graph: gb, otherSettings: EVERY, existingActive: true });
  const e2 = eligibility({ me: 'b', other: 'a', graph: gb, otherSettings: EVERY });
  return !e1.ok && e1.reason === 'unavailable' && !e2.ok && e2.reason === 'unavailable' && !/block/i.test(e1.msg);
})());
// ---------- under 18 ----------
check('teens default to Friends only, adults to Everyone', defaultDmSettings(true).who === 'friends' && defaultDmSettings(false).who === 'everyone');
check('adult stranger → teen refused (even if teen allows everyone)', (() => { const e = eligibility({ me: 'a', other: 't', graph: g, otherMinor: true, otherSettings: EVERY }); return !e.ok && e.reason === 'minor'; })());
check('teen → adult stranger refused', (() => { const e = eligibility({ me: 't', other: 'z', graph: g, meMinor: true, otherSettings: EVERY }); return !e.ok && e.reason === 'minor'; })());
check('teen ↔ adult friend allowed', eligibility({ me: 'a', other: 't', graph: G([['a', 't']]), otherMinor: true, otherSettings: defaultDmSettings(true) }).ok);
check('teen ↔ teen stranger follows settings (default friends only → refused)', !eligibility({ me: 't1', other: 't2', graph: g, meMinor: true, otherMinor: true, otherSettings: defaultDmSettings(true) }).ok
  && eligibility({ me: 't1', other: 't2', graph: g, meMinor: true, otherMinor: true, otherSettings: EVERY }).ok);
check('normalizeDmSettings: junk → defaults; keeps valid values', normalizeDmSettings({ who: 'pirates' as 'none' }, true).who === 'friends' && normalizeDmSettings({ who: 'fof', readReceipts: false }).readReceipts === false);

// ---------- groups ----------
check('groups: add friends only', !canAddToGroup({ adder: 'a', user: 'z', graph: g, members: ['a'], minors: new Set() }).ok && canAddToGroup({ adder: 'a', user: 'b', graph: g, members: ['a'], minors: new Set() }).ok);
check('groups: teen needs to be friends with every adult in it', !canAddToGroup({ adder: 'a', user: 't', graph: G([['a', 't']]), members: ['a', 'z'], minors: new Set(['t']) }).ok
  && canAddToGroup({ adder: 'a', user: 't', graph: G([['a', 't'], ['z', 't']]), members: ['a', 'z'], minors: new Set(['t']) }).ok);
check('groups: someone blocked by a member can’t be added', !canAddToGroup({ adder: 'a', user: 'b', graph: G([['a', 'b']], [['z', 'b']]), members: ['a', 'z'], minors: new Set() }).ok);
check('groups: "no one" setting respected', !canAddToGroup({ adder: 'a', user: 'b', graph: g, members: ['a'], minors: new Set(), settings: S('none') }).ok);
const grp: Conversation = { id: 'g', kind: 'group', createdBy: 'a', createdAt: 0, lastMessageAt: 1, members: [mem('a', { role: 'admin' }), mem('b'), mem('c', { state: 'left' })] };
check('groups: admins rename/remove; members add/leave', canManage(grp, 'a', 'rename') && canManage(grp, 'a', 'remove') && !canManage(grp, 'b', 'rename') && !canManage(grp, 'b', 'remove') && canManage(grp, 'b', 'add') && canManage(grp, 'b', 'leave') && !canManage(grp, 'c', 'add'));
check('groups: last admin leaves → longest member promoted', promoteIfNoAdmin([mem('a', { state: 'left', role: 'admin' }), mem('c', { joinedAt: 5 }), mem('b', { joinedAt: 2 })]).find((m) => m.userId === 'b')?.role === 'admin');
check('group title: required, trimmed, capped at 50, profanity masked', !validateGroupTitle('   ').ok && validateGroupTitle('  Crew  ').value === 'Crew' && validateGroupTitle('x'.repeat(80)).value.length === 50 && validateGroupTitle('shit crew').value === 's*** crew');
check('GROUP_MAX is 32', GROUP_MAX === 32);

// ---------- requests: 3-message limit ----------
const req: Conversation = { id: 'c', kind: 'direct', createdBy: 'a', createdAt: 0, lastMessageAt: 3, members: [mem('a'), mem('z', { state: 'request' })] };
const sent = [msg('1', 'a', 1), msg('2', 'a', 2)];
check('outgoing request detected (also when quietly declined)', outgoingRequest(req, 'a') && outgoingRequest({ ...req, members: [mem('a'), mem('z', { state: 'declined' })] }, 'a') && !outgoingRequest(req, 'z'));
check('request: 1 message left after 2', requestRemaining(req, 'a', sent) === 1 && canSend(req, 'a', sent, g).ok);
check('request: 4th message refused', (() => { const r = canSend(req, 'a', [...sent, msg('3', 'a', 3)], g); return !r.ok && r.code === 'dm_request_limit'; })());
check('request: recipient must accept before replying', (() => { const r = canSend(req, 'z', sent, g); return !r.ok && r.code === 'dm_accept_first'; })());
check('request: system messages don’t count', requestRemaining(req, 'a', [msg('s', 'a', 1, { kind: 'system' })]) === REQUEST_MAX_MESSAGES);
check('accepted → no limit', requestRemaining({ ...req, members: [mem('a'), mem('z')] }, 'a', [...sent, msg('3', 'a', 3)]) === Infinity);
check('blocked → can’t send', (() => { const r = canSend({ ...req, members: [mem('a'), mem('z')] }, 'a', [], G([], [['z', 'a']])); return !r.ok && r.code === 'dm_blocked'; })());
check('left / removed → can’t send', !canSend({ ...grp }, 'c', [], g).ok);

// ---------- status: sent / delivered / seen (requests show Sent only; receipts reciprocal) ----------
const dc: Conversation = { id: 'c', kind: 'direct', createdBy: 'a', createdAt: 0, lastMessageAt: 10, members: [mem('a'), mem('b', { deliveredAt: 0, lastReadAt: 0 })] };
const st = (c: Conversation, mine = true, receipts?: Record<string, boolean>) => messageStatus(msg('m', 'a', 5), { conv: c, me: 'a', myReceipts: mine, receipts })?.status;
check('status: sent', st(dc) === 'sent');
check('status: delivered', st({ ...dc, members: [mem('a'), mem('b', { deliveredAt: 6 })] }) === 'delivered');
check('status: seen', st({ ...dc, members: [mem('a'), mem('b', { deliveredAt: 6, lastReadAt: 7 })] }) === 'seen');
check('status: their receipts off → delivered, not seen', st({ ...dc, members: [mem('a'), mem('b', { deliveredAt: 6, lastReadAt: 7 })] }, true, { b: false }) === 'delivered');
check('status: my receipts off → I don’t see theirs (reciprocal)', st({ ...dc, members: [mem('a'), mem('b', { deliveredAt: 6, lastReadAt: 7 })] }, false) === 'delivered');
check('status: request never shows more than Sent', st({ ...dc, members: [mem('a'), mem('b', { state: 'request', deliveredAt: 6, lastReadAt: 7 })] }) === 'sent');
check('status: only for my own messages', messageStatus(msg('m', 'b', 5), { conv: dc, me: 'a', myReceipts: true }) === null);
check('status: group seen by all vs some', (() => {
  const c: Conversation = { ...grp, members: [mem('a', { role: 'admin' }), mem('b', { lastReadAt: 9 }), mem('d', { lastReadAt: 1, deliveredAt: 9 })] };
  const r = messageStatus(msg('m', 'a', 5), { conv: c, me: 'a', myReceipts: true });
  return r?.status === 'delivered' && r.seenBy.join() === 'b';
})());

// ---------- presence + typing ----------
check('presence: both must have activity on, never across a block', canSeePresence({ activity: true }, { activity: true }, false) && !canSeePresence({ activity: false }, { activity: true }, false) && !canSeePresence({ activity: true }, { activity: true }, true));
check('presence text', presenceText(Date.now() - 60_000) === 'Active now' && presenceText(Date.now() - 20 * 60_000) === 'Active 20m ago' && presenceText(Date.now() - 3 * 86_400_000) === null);
check('typing label + expiry', typingLabel(['Maya']) === 'Maya is typing…' && typingLabel(['Maya', 'Leo']) === 'Maya and Leo are typing…' && liveTyping({ a: Date.now(), b: Date.now() - 60_000 }).join() === 'a');

// ---------- edit window + unsend ----------
const now = 1_000_000_000_000;
const mine = msg('m', 'a', now - 60_000);
check('edit: sender within 15 min', canEdit(mine, 'a', now) && applyEdit(mine, 'hello!', 'a', now).editedAt === now);
check('edit: not after 15 min', !canEdit(mine, 'a', now + EDIT_WINDOW_MS));
throws('edit: after window throws dm_edit_window', () => applyEdit(mine, 'x', 'a', now + EDIT_WINDOW_MS), /dm_edit_window/);
throws('edit: only the sender', () => applyEdit(mine, 'x', 'b', now), /dm_not_sender/);
check('edit: profanity masked, empty refused', applyEdit(mine, 'oh shit', 'a', now).body === 'oh s***' && (() => { try { applyEdit(mine, '  ', 'a', now); return false; } catch { return true; } })());
check('edit: workout cards can’t be edited', !canEdit({ ...mine, kind: 'workout' }, 'a', now));
check('unsend: only the sender; wipes body + media', canUnsend(mine, 'a', now) && !canUnsend(mine, 'b', now) && (() => { const u = applyUnsend({ ...mine, media: { url: 'x', w: 1, h: 1, mime: 'image/webp' } }, 'a', now); return u.body === '' && !u.media && u.deletedAt === now; })());
throws('unsend: someone else’s message throws', () => applyUnsend(mine, 'b', now), /dm_not_sender/);
check('unsent: no editing afterwards', !canEdit({ ...mine, deletedAt: now }, 'a', now));

// ---------- reactions ----------
let rl: MsgReaction[] = [];
rl = applyMsgReaction(rl, 'a', 'm', 'love', 1).list;
rl = applyMsgReaction(rl, 'b', 'm', 'haha', 2).list;
check('reactions: one per person, summary', messageReactions(rl, 'm', 'a').summary.total === 2 && messageReactions(rl, 'm', 'a').mine === 'love');
rl = applyMsgReaction(rl, 'a', 'm', 'wow', 3).list;
check('reactions: switching replaces', rl.filter((r) => r.userId === 'a').length === 1 && messageReactions(rl, 'm', 'a').mine === 'wow');
check('reactions: same type again removes', applyMsgReaction(rl, 'a', 'm', 'wow', 4).list.filter((r) => r.userId === 'a').length === 0);
check('reactions: blocked people’s reactions hidden', messageReactions(rl, 'm', 'a', G([], [['a', 'b']])).summary.total === 1);

// ---------- unread, folders, badge, sort ----------
const uc: Conversation = { id: 'c', kind: 'direct', createdBy: 'b', createdAt: 0, lastMessageAt: 30, members: [mem('a', { lastReadAt: 10 }), mem('b')] };
const um = [msg('1', 'b', 5), msg('2', 'b', 15), msg('3', 'b', 20, { deletedAt: 21 }), msg('4', 'a', 25), msg('5', 'b', 30, { kind: 'system' }), msg('6', 'b', 29)];
check('unread: only others’ visible messages after my read marker', unreadCount(uc, 'a', um) === 2);
check('unread: hidden ("delete for me") don’t count', unreadCount(uc, 'a', um, new Set(['6'])) === 1);
check('clear chat hides earlier messages for me only', visibleMessages(um, { ...uc, members: [mem('a', { clearedAt: 16 }), mem('b')] }, 'a').map((m) => m.id).join() === '3,4,6,5' && visibleMessages(um, uc, 'b').length === 6);
check('folders: chats / requests / archived / hidden', folderOf(uc, 'a') === 'chats' && folderOf({ ...uc, members: [mem('a', { state: 'request' }), mem('b')] }, 'a') === 'requests'
  && folderOf({ ...uc, members: [mem('a', { archived: true }), mem('b')] }, 'a') === 'archived' && folderOf({ ...uc, lastMessageAt: 0 }, 'a') === null
  && folderOf({ ...uc, members: [mem('a', { state: 'declined' }), mem('b')] }, 'a') === null);
check('badge: unread chats + unread requests; muted and archived excluded', inboxBadge([{ folder: 'chats', unread: 2, muted: false }, { folder: 'chats', unread: 5, muted: true }, { folder: 'archived', unread: 1, muted: false }, { folder: 'requests', unread: 1, muted: false }, { folder: 'chats', unread: 0, muted: false }]) === 2);
check('sort: pinned first (in pin order), then newest', sortInbox([
  { id: 'x', members: [mem('a')], lastMessageAt: 50 }, { id: 'p2', members: [mem('a', { pinnedAt: 2 })], lastMessageAt: 1 }, { id: 'p1', members: [mem('a', { pinnedAt: 1 })], lastMessageAt: 0 }, { id: 'y', members: [mem('a')], lastMessageAt: 60 },
] as (Pick<Conversation, 'members' | 'lastMessageAt'> & { id: string })[], 'a').map((c) => c.id).join() === 'p1,p2,y,x');

// ---------- links, scams, contact info ----------
check('safeHref: http(s) only; javascript:/data: refused; www gets https', safeHref('javascript:alert(1)') === null && safeHref('data:text/html,x') === null && safeHref('www.hybrd.app') === 'https://www.hybrd.app/' && safeHref('https://example.com/a).') === 'https://example.com/a');
check('linkify: text + link segments, no previews fetched', (() => { const s = linkify('see https://example.com/x, ok'); return s.length === 3 && s[1].t === 'link' && s[1].domain === 'example.com' && s[2].v === ', ok'; })());
check('link risk: shorteners, http, IPs, look-alikes, fake HYBRD', linkRisk('https://bit.ly/x').risky && linkRisk('http://example.com').risky && linkRisk('https://192.168.0.1/x').risky && linkRisk('https://xn--hybrd-abc.com').risky && linkRisk('https://hybrd-login.com').risky && !linkRisk('https://example.com/form-check').risky);
check('stranger warning: links and scam wording', !!strangerWarning([{ body: 'free guide https://example.com', kind: 'text' }]) && /scam/.test(strangerWarning([{ body: 'Send me a gift card and I’ll double your bitcoin investment profit', kind: 'text' }]) || '') && strangerWarning([{ body: 'Nice run!', kind: 'text' }]) === null);
check('scam signals', scamSignals('verify your account password') > 0 && scamSignals('Great 10K today') === 0);
check('contact info detection (email/phone, not times)', hasContactInfo('mail me jose@example.com') && hasContactInfo('call 555 123 4567') && !hasContactInfo('see you at 7:30 for 5 km'));
check('crisis text detected (reuses Mind), never blocks', crisisInText('I want to kill myself') && !crisisInText('this workout killed me'));

// ---------- text, media, drafts ----------
check('cleanMessage: masks profanity, caps length', cleanMessage('what the fuck') === 'what the f***' && [...cleanMessage('x'.repeat(MSG_MAX + 50))].length === MSG_MAX);
check('validateDraft: empty text refused; photo/workout ok without text', validateDraft({ kind: 'text', body: '' }) !== null && validateDraft({ kind: 'image', body: '', hasMedia: true }) === null && validateDraft({ kind: 'workout', body: '', hasWorkout: true }) === null);
check('media caps: type, 8 MB photo, 50 MB / 3 min video', checkMessageMedia({ type: 'image/gif', size: 10 }) !== null && checkMessageMedia({ type: 'image/webp', size: 9e6 }) !== null && checkMessageMedia({ type: 'video/mp4', size: 60e6 }) !== null && checkMessageMedia({ type: 'video/mp4', size: 10e6, duration: 200 }) !== null && checkMessageMedia({ type: 'video/mp4', size: 10e6, duration: 60 }) === null);

// ---------- grouping, previews, titles ----------
const day = new Date(2026, 10, 19, 12).getTime();
const items = chatItems([msg('1', 'a', day - 86_400_000), msg('2', 'a', day), msg('3', 'a', day + 60_000), msg('4', 'b', day + 120_000)], day + 200_000);
check('chatItems: date separators + bubble clusters', items.filter((i) => i.t === 'day').length === 2 && (items[3] as { first: boolean }).first === true && (items[4] as { first: boolean }).first === false && (items[5] as { first: boolean }).first === true);
check('dayLabel: Today / Yesterday', dayLabel(day, day) === 'Today' && dayLabel(day - 86_400_000, day) === 'Yesterday');
check('preview: you / unsent / media / group sender', previewText(msg('1', 'a', 1), 'a', () => 'X') === 'You: hi' && /unsent/i.test(previewText(msg('1', 'b', 1, { deletedAt: 2 }), 'a', () => 'Maya')) && /Photo/.test(previewText(msg('1', 'b', 1, { kind: 'image', body: '' }), 'a', () => 'Maya')) && previewText(msg('1', 'b', 1), 'a', () => 'Maya Lopez', true).startsWith('Maya'));
check('system text', systemText({ type: 'added', actor: 'a', targets: ['b', 'me'] }, (id) => (id === 'b' ? 'Leo' : 'Ana'), 'me') === 'Ana added Leo, you');
check('convTitle: group name or names', convTitle({ kind: 'group', title: 'Crew', members: [] }, 'a', {}) === 'Crew' && convTitle({ kind: 'direct', members: [mem('a'), mem('b')] }, 'a', { b: { displayName: 'Leo' } }) === 'Leo');
check('copyText: workout card', copyText({ kind: 'workout', body: '', workout: { type: 'run', label: 'Run', title: 'Tempo', date: '', durationSec: 1 } }) === 'Run: Tempo');

// ---------- search ----------
const sr = searchInbox([{ id: 'c1', title: 'Maya Lopez', handles: ['sample.maya'] }, { id: 'c2', title: 'Crew', handles: [] }], [msg('1', 'b', 1, { conversationId: 'c2', body: 'Sled push at the gym' }), msg('2', 'b', 2, { conversationId: 'c2', body: 'Sled pull', deletedAt: 3 }), msg('3', 'b', 3, { conversationId: 'zz', body: 'sled' })], 'sled');
check('search: messages across my chats only, unsent excluded', sr.hits.length === 1 && sr.hits[0].messageId === '1');
check('search: chats by name / handle, accent-insensitive', searchInbox([{ id: 'c1', title: 'José', handles: ['sample.maya'] }], [], 'jose').chats.length === 1 && searchInbox([{ id: 'c1', title: 'x', handles: ['sample.maya'] }], [], '@maya').chats.length === 1 && searchInbox([], [], 'a').chats.length === 0);
check('snippet', snippet('a long message about sled pushes and more', 'sled').includes('sled'));

// ---------- offline outbox ----------
let q: OutboxItem<string>[] = [];
q = enqueue(q, { id: 'x1', conversationId: 'c', draft: 'hi', createdAt: 100 });
q = enqueue(q, { id: 'x1', conversationId: 'c', draft: 'hi', createdAt: 100 });
q = enqueue(q, { id: 'x2', conversationId: 'c', draft: 'yo', createdAt: 101 });
check('outbox: queue is idempotent by client id', q.length === 2);
check('outbox: nothing sends while offline', dueItems(q, 200, false).length === 0 && dueItems(q, 200, true).map((x) => x.id).join() === 'x1,x2');
q = markSending(q, 'x1');
check('outbox: a reload puts "sending" back in the queue', resumeOutbox(q, 300).find((x) => x.id === 'x1')?.status === 'queued');
q = afterAttempt(q, 'x1', { ok: false, retryable: true, error: 'offline' }, 1000);
check('outbox: network error → retry later with backoff', q[0].status === 'queued' && q[0].attempts === 1 && q[0].nextAt === 1000 + backoffMs(1) && dueItems(q, 1001, true).every((x) => x.id !== 'x1'));
for (let i = 0; i < MAX_AUTO_ATTEMPTS; i++) q = afterAttempt(q, 'x1', { ok: false, retryable: true, error: 'offline' }, 2000);
check('outbox: gives up after max attempts (shows Retry)', q[0].status === 'failed');
q = retryItem(q, 'x1', 5000);
check('outbox: manual retry re-queues now', q[0].status === 'queued' && q[0].attempts === 0 && dueItems(q, 5000, true).some((x) => x.id === 'x1'));
q = afterAttempt(q, 'x2', { ok: false, retryable: false, error: 'blocked' }, 6000);
check('outbox: rule refusal fails at once (no retry storm)', q.find((x) => x.id === 'x2')?.status === 'failed');
check('outbox: success removes', afterAttempt(q, 'x1', { ok: true }, 7000).every((x) => x.id !== 'x1'));
check('isRetryable: network yes, rules no', isRetryable(new Error('Failed to fetch')) && isRetryable(new Error('NetworkError when attempting')) && !isRetryable(new Error('dm_blocked: no')) && !isRetryable(new Error('dm_request_limit: wait')) && !isRetryable(new Error('new row violates row-level security policy')));
check('backoff grows, capped at 60 s', backoffMs(1) === 2000 && backoffMs(2) === 4000 && backoffMs(20) === 60_000);

// ---------- notifications (in-app now, push-ready payload) ----------
const nm = msg('n1', 'b', 10, { body: 'Saturday 7 AM?' });
check('notify: normal message', notificationFor({ msg: nm, recipient: 'a', member: { state: 'active' }, senderName: 'Leo', blocked: false })?.body === 'Saturday 7 AM?');
check('notify: request hides the content', /wants to send you a message/.test(notificationFor({ msg: nm, recipient: 'a', member: { state: 'request' }, senderName: 'Jordan', blocked: false })?.body || ''));
check('notify: muted, blocked, own, open chat → none', notificationFor({ msg: nm, recipient: 'a', member: { state: 'active', mutedUntil: MUTE_FOREVER }, senderName: 'L', blocked: false }) === null
  && notificationFor({ msg: nm, recipient: 'a', member: { state: 'active' }, senderName: 'L', blocked: true }) === null
  && notificationFor({ msg: nm, recipient: 'b', member: { state: 'active' }, senderName: 'L', blocked: false }) === null
  && notificationFor({ msg: nm, recipient: 'a', member: { state: 'active' }, senderName: 'L', blocked: false, activeConversation: 'c' }) === null);
check('notify: url deep-links to the chat; group title in heading', (() => { const n = notificationFor({ msg: nm, recipient: 'a', member: { state: 'active' }, senderName: 'Leo', groupTitle: 'Crew', blocked: false }); return n?.url === '/messages/chat?c=c' && n.title === 'Leo · Crew'; })());
check('friendly errors', /up to 3/.test(friendlyDmError(new Error('dm_request_limit: x'))) && /can’t message/.test(friendlyDmError(new Error('dm_blocked: x'))) && /teens/.test(friendlyDmError(new Error('dm_minor: x'))) && /15 minutes/.test(friendlyDmError(new Error('dm_edit_window: x'))));

// ---------- privacy note + schema guardrails ----------
const notes = readFileSync(new URL('../APP-BUILDER-NOTES.md', import.meta.url), 'utf8');
const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../src/pages/Messages.tsx', import.meta.url), 'utf8');
check('docs: says RLS, NOT end-to-end encrypted', /not end-to-end encrypted/i.test(notes) && /not end-to-end encrypted/i.test(ui) && !/end-to-end encrypted\b(?! ?\.|,)/i.test(ui.replace(/not end-to-end encrypted/gi, '')));
check('schema: RLS on every Messages table', ['dm_settings', 'conversations', 'conversation_members', 'messages', 'message_reactions', 'message_hidden', 'message_reports', 'push_subscriptions'].every((t) => new RegExp(`alter table public\\.${t}\\s+enable row level security`).test(schema)));
check('schema: request limit, edit window, private bucket', /n >= 3/.test(schema) && /interval '15 minutes'/.test(schema) && /'message-media', 'message-media', false/.test(schema));
check('entitlements: messages features all free', (() => { const k = Object.keys(FEATURES).filter((x) => x.startsWith('messages.')); return k.length === 7 && k.every((x) => FEATURES[x as keyof typeof FEATURES].free && can(x as keyof typeof FEATURES)); })());

// ---------- demo backend end to end ----------
(async () => {
  let clock = Date.parse('2026-11-19T15:00:00Z');
  let soc: DemoState | undefined; let dms: DmDemoState | undefined;
  const social = new DemoBackend({ load: async () => soc, save: async (s) => { soc = structuredClone(s); }, blobUrl: () => 'blob:test', now: () => clock });
  await social.saveProfile({ username: 'jose.cruz', displayName: 'José Cruz', dob: '1990-05-05', privacy: 'public', showStats: false, useAvatar: false });
  const dm = new DemoDm({ load: async () => dms, save: async (s) => { dms = structuredClone(s); }, world: () => social.peek(), act: (a) => social.act(a), searchPeople: (x) => social.search(x), blobUrl: () => 'blob:dm', now: () => clock });
  const inbox = await dm.inbox();
  const by = (id: string) => inbox.find((c) => c.id === id)!;
  check('demo: seeded Chats + Requests', inbox.filter((c) => c.folder === 'chats').length === 4 && inbox.filter((c) => c.folder === 'requests').length === 2);
  check('demo: sample people only, clearly labelled', inbox.every((c) => c.others.every((o) => o.profile.sample && o.profile.username.startsWith('sample.'))));
  check('demo: pinned chat first; group with 4 members', inbox[0].id === 'c-maya' && by('g-crew').members.length === 4 && by('g-crew').isAdmin);
  check('demo: unread counts + badge', by('c-leo').unread === 2 && by('g-crew').unread === 1 && inboxBadge(inbox) === 4);
  check('demo: muted chat excluded from badge', by('c-ana').muted);
  const maya = await dm.messages('c-maya');
  check('demo: reply, photo, workout, reaction, edited, seen', maya.some((m) => m.reply?.id === 'm5') && maya.some((m) => m.kind === 'image' && !!m.media?.url) && maya.some((m) => m.kind === 'workout') && maya.some((m) => m.reactions.total > 0) && maya.some((m) => !!m.editedAt) && maya.find((m) => m.id === 'm8')?.status === 'seen');
  check('demo: Ana has receipts off → my message shows Delivered', (await dm.messages('c-ana')).find((m) => m.id === 'a2')?.status === 'delivered');

  // requests
  const jr = by('r-jordan');
  check('demo: incoming request flagged', jr.request === 'incoming' && jr.folder === 'requests');
  await rejects('demo: can’t reply before accepting', () => dm.send('r-jordan', { clientId: 'x0', kind: 'text', body: 'hi' }), /dm_accept_first/);
  await rejects('demo: can’t react before accepting', () => dm.react('j1', 'like'), /dm_accept_first/);
  await dm.markRead('r-jordan');
  const fromJordan = await dm.messages('r-jordan');
  check('demo: request read is private', fromJordan.every((m) => !m.mine));
  await dm.accept('r-jordan');
  check('demo: accept moves it to Chats', (await dm.conversation('r-jordan'))?.folder === 'chats');
  await dm.send('r-jordan', { clientId: 'acc1', kind: 'text', body: 'Hey Jordan! Yes, downtown.' });
  check('demo: reply after accepting', (await dm.messages('r-jordan')).some((m) => m.id === 'acc1' && m.mine));
  await dm.block('s7');
  check('demo: blocking a requester removes the request', !(await dm.inbox()).some((c) => c.id === 'r-rivera'));
  await dm.unblock('s7');

  // outgoing request to a non-friend (Priya: friends of friends, shares Maya? Sam: everyone)
  const elSam = await dm.eligibility('s5');
  check('demo: non-friend who allows everyone → request', elSam.ok && elSam.request);
  const elKai = await dm.eligibility('s8');
  check('demo: Kai accepts no one → refused', !elKai.ok);
  const sam = await dm.openDirect('s5');
  for (let i = 1; i <= REQUEST_MAX_MESSAGES; i++) { clock += 1000; await dm.send(sam, { clientId: `sam${i}`, kind: 'text', body: `hi ${i}` }); }
  const samC = await dm.conversation(sam);
  check('demo: outgoing request shows 0 left after 3', samC?.request === 'outgoing' && samC.requestRemaining === 0);
  await rejects('demo: 4th request message refused', () => dm.send(sam, { clientId: 'sam4', kind: 'text', body: 'hello??' }), /dm_request_limit/);
  check('demo: request shows "Sent" only', (await dm.messages(sam)).every((m) => m.status === 'sent'));
  check('demo: idempotent send by client id', (await dm.send(sam, { clientId: 'sam1', kind: 'text', body: 'dup' })).body === 'hi 1');

  // privacy settings
  await dm.saveSettings({ who: 'none', readReceipts: false, activity: false });
  check('demo: settings saved', (await dm.getSettings()).who === 'none' && !(await dm.getSettings()).readReceipts);
  check('demo: my receipts off → I don’t see “Seen” either', (await dm.messages('c-maya')).find((m) => m.id === 'm8')?.status === 'delivered');
  check('demo: activity off → no presence for me', (await dm.conversation('c-maya'))?.presence === null);
  await dm.saveSettings({ who: 'everyone', readReceipts: true, activity: true });

  // edit window, unsend, delete for me
  clock += 1000;
  const sentMsg = await dm.send('c-leo', { clientId: 'e1', kind: 'text', body: 'See you at 6' });
  await dm.edit(sentMsg.id, 'See you at 6:15');
  check('demo: edit within 15 min marks edited', (await dm.messages('c-leo')).find((m) => m.id === 'e1')?.editedAt !== undefined);
  await rejects('demo: can’t edit someone else’s message', () => dm.edit('l3', 'hacked'), /dm_not_sender/);
  clock += EDIT_WINDOW_MS + 1000;
  await rejects('demo: edit after 15 min refused', () => dm.edit('e1', 'later'), /dm_edit_window/);
  await dm.react('e1', 'like');
  await dm.unsend('e1');
  const unsent = (await dm.messages('c-leo')).find((m) => m.id === 'e1')!;
  check('demo: unsend → placeholder, no text, no reactions', !!unsent.deletedAt && unsent.body === '' && unsent.reactions.total === 0);
  await rejects('demo: can’t unsend someone else’s message', () => dm.unsend('l3'), /dm_not_sender/);
  await dm.deleteForMe('l2');
  check('demo: delete for me hides it', !(await dm.messages('c-leo')).some((m) => m.id === 'l2'));

  // reactions
  await dm.react('l3', 'haha'); await dm.react('l3', 'love');
  const l3 = (await dm.messages('c-leo')).find((m) => m.id === 'l3')!;
  check('demo: reaction switch keeps one per person', l3.myReaction === 'love' && l3.reactions.total === 1 && (await dm.reactors('l3')).length === 1);
  await dm.react('l3', null);
  check('demo: reaction removed', (await dm.messages('c-leo')).find((m) => m.id === 'l3')!.reactions.total === 0);

  // unread + read
  await dm.markRead('c-leo');
  check('demo: mark read clears unread', (await dm.conversation('c-leo'))?.unread === 0);
  await dm.setPrefs('c-leo', { mutedUntil: MUTE_FOREVER, pinned: true });
  check('demo: mute + pin', (await dm.conversation('c-leo'))?.muted === true && (await dm.conversation('c-leo'))?.pinned === true);
  await dm.setPrefs('c-leo', { archived: true });
  check('demo: archive moves to Archived', (await dm.conversation('c-leo'))?.folder === 'archived');
  await dm.setPrefs('c-leo', { archived: false, mutedUntil: null, pinned: false });

  // groups
  await rejects('demo: group with a non-friend refused', () => dm.createGroup('Run club', ['s1', 's6']), /friends/);
  const gid = await dm.createGroup('Run club', ['s1', 's2']);
  const gc = await dm.conversation(gid);
  check('demo: group created, me admin, system messages', gc?.isAdmin === true && gc.members.length === 3 && (await dm.messages(gid)).filter((m) => m.kind === 'system').length === 2);
  clock += 1000;
  await dm.send(gid, { clientId: 'g-hello', kind: 'text', body: 'Sunday long run?' });
  await dm.addMembers(gid, ['s3']);
  await dm.renameGroup(gid, 'Sunday run club');
  check('demo: rename + add', (await dm.conversation(gid))?.title === 'Sunday run club' && (await dm.conversation(gid))?.members.length === 4);
  await dm.removeMember(gid, 's3');
  check('demo: admin removes a member', (await dm.conversation(gid))?.members.length === 3);
  await dm.leaveGroup(gid);
  check('demo: leaving removes the chat from my inbox', !(await dm.inbox()).some((c) => c.id === gid));

  // forward, search, report, under-18 profile
  await dm.forward('m5', ['c-leo']);
  check('demo: forward a photo (marked Forwarded)', (await dm.messages('c-leo')).some((m) => m.forwarded && m.kind === 'image'));
  const found = await dm.search('saturday');
  check('demo: search finds messages across chats', found.hits.length >= 1 && found.hits.every((h) => h.conv.folder !== null));
  check('demo: search finds chats by name/handle', (await dm.search('maya')).chats.some((c) => c.id === 'c-maya'));
  await dm.report({ targetType: 'message', targetId: 'j2', conversationId: 'r-jordan', reason: 'spam', details: 'test' });
  check('demo: report creates a moderation record with a snapshot', dms!.reports.length === 1 && dms!.reports[0].targetUserId === 's6' && !!dms!.reports[0].snapshot);
  const people = await dm.people('');
  check('demo: people picker lists friends (no blocked)', people.friends.length === 3 && people.friends.every((p) => p.sample));

  // under-18: a teen profile in the same world can't be reached by adult non-friends
  let soc2: DemoState | undefined; let dms2: DmDemoState | undefined;
  const teenSocial = new DemoBackend({ load: async () => soc2, save: async (s) => { soc2 = structuredClone(s); }, blobUrl: () => '', now: () => clock });
  await teenSocial.saveProfile({ username: 'teen.runner', displayName: 'Teen Runner', dob: new Date(clock - 15 * 365.25 * 86_400_000).toISOString().slice(0, 10), privacy: 'friends', showStats: false, useAvatar: false });
  const teen = new DemoDm({ load: async () => dms2, save: async (s) => { dms2 = structuredClone(s); }, world: () => teenSocial.peek(), act: (a) => teenSocial.act(a), searchPeople: (x) => teenSocial.search(x), blobUrl: () => '', now: () => clock });
  check('demo: teen defaults to Friends only', (await teen.getSettings()).who === 'friends');
  const tj = await teen.eligibility('s6');
  check('demo: teen can’t message an adult who isn’t a friend', !tj.ok && tj.reason === 'minor');
  await rejects('demo: teen openDirect to adult stranger refused', () => teen.openDirect('s6'), /dm_minor/);

  const seed = seedDm(clock);
  check('seed: sample-only ids, no real contact info anywhere', seed.messages.every((m) => !hasContactInfo(m.body)) && seed.convs.every((c) => c.members.every((m) => m.userId === DM_ME || /^s\d$/.test(m.userId))));

  console.log(failed ? `\n${failed} FAILED` : '\nALL MESSAGES TESTS PASSED');
  process.exit(failed ? 1 : 0);
})();
