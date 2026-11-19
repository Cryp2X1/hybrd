// Unit checks for Calls: who can call whom (requests, blocks, under-18, "Who can call me", Do not disturb), the call
// state machine, call cards + history, connection quality, ICE/TURN config, signal validation, permission help, the
// TURN-credentials function, docs/schema guards, and the demo backend end to end (SAMPLE people, simulated media).
// Real WebRTC (audio/video frames, voice→video, mesh of 3–4) is covered by tools/test-calls-webrtc.mjs in Chrome.
// Run: node --experimental-strip-types --import ./tools/ts-resolve.mjs tools/test-calls.ts
import { readFileSync } from 'node:fs';
import {
  canCall, pairCallCheck, ringDecision, reduceCall, idleCall, callSeconds, finalStatus, endedText, formatDuration, longDuration, callLine, callPreview, isCallEvent,
  missedSince, historyFilter, qualityOf, lossBetween, videoBitrateFor, iceServersFrom, hasTurn, parseSignal, isPolite, mediaErrorKind, mediaErrorHelp, platformOf,
  needsExplainer, snapCorner, tileLayout, friendlyCallError, normalizeCallWho, defaultCallWho, dndUntilFor, dndActive, dndLabel, DND_FOREVER, DEFAULT_STUN,
  MAX_CALL_PEOPLE, RING_TIMEOUT_MS, CALL_DENY_MSG, type CallState, type CallLog,
} from '../src/lib/calls.ts';
import { normalizeDmSettings, systemText } from '../src/lib/messages.ts';
import { dndFromDb, dndToDb } from '../src/lib/messagesSupabase.ts';
import type { Graph } from '../src/lib/social.ts';
import { DemoBackend, type DemoState } from '../src/lib/socialDemo.ts';
import { DemoDm, DM_ME, type DmDemoState } from '../src/lib/messagesDemo.ts';
import { DemoCalls, SAMPLE_PICKUP, type DemoMediaLike } from '../src/lib/callsDemo.ts';
import type { CallEvent } from '../src/lib/callsApi.ts';
import { FEATURES, can } from '../src/lib/entitlements.ts';
import { coturnCredential, handle } from '../supabase/functions/turn-credentials/index.ts';

let failed = 0; let passed = 0;
const check = (name: string, cond: boolean, detail?: unknown) => { if (!cond) { failed++; console.error('FAIL', name, detail ?? ''); } else { passed++; console.log('ok', name); } };
const rejects = async (name: string, p: () => Promise<unknown>, re?: RegExp) => { try { await p(); check(name, false, 'did not throw'); } catch (e) { const m = `${(e as { code?: string }).code || ''} ${(e as Error).message}`; check(name, !re || re.test(m), m); } };
const G = (friends: [string, string][] = [], blocks: [string, string][] = []): Graph => ({ requests: [], friends: friends.map(([a, b]) => (a < b ? [a, b] : [b, a]) as [string, string]), blocks });
const g = G([['a', 'b'], ['a', 't']]);
const base = { me: 'a', kind: 'direct' as const, myState: 'active' as const, request: null, graph: g, supported: true };

// ---------- who can call ----------
check('friends can call', canCall({ ...base, others: ['b'] }).ok);
check('accepted chat with an adult stranger: allowed by default', canCall({ ...base, others: ['z'] }).ok);
check('message request (incoming) can’t call', (() => { const r = canCall({ ...base, request: 'incoming', others: ['z'] }); return !r.ok && r.reason === 'request_in'; })());
check('message request (outgoing) can’t call', (() => { const r = canCall({ ...base, request: 'outgoing', others: ['z'] }); return !r.ok && r.reason === 'request_out'; })());
check('blocked (either way) can’t call, generic message', (() => { const r = canCall({ ...base, graph: G([['a', 'b']], [['b', 'a']]), others: ['b'] }); return !r.ok && r.reason === 'blocked' && !/block/i.test(r.msg); })());
check('under-18: friend can call', canCall({ ...base, others: ['t'], minors: new Set(['t']) }).ok);
check('under-18: adult stranger can’t call a teen', (() => { const r = canCall({ ...base, others: ['y'], minors: new Set(['y']) }); return !r.ok && r.reason === 'minor'; })());
check('under-18: a teen can’t call a non-friend (even another teen)', (() => { const r = pairCallCheck({ me: 't', other: 'u', graph: g, minors: new Set(['t', 'u']) }); return !r.ok && r.reason === 'minor'; })());
check('Who can call me: friends only', (() => { const r = canCall({ ...base, others: ['z'], theirWho: { z: 'friends' } }); return !r.ok && r.reason === 'friends_only'; })() && canCall({ ...base, others: ['b'], theirWho: { b: 'friends' } }).ok);
check('Who can call me: no one (even friends)', (() => { const r = canCall({ ...base, others: ['b'], theirWho: { b: 'none' } }); return !r.ok && r.reason === 'no_one'; })());
check('teens: "everyone" becomes friends only', normalizeCallWho('everyone', true) === 'friends' && defaultCallWho(true) === 'friends' && defaultCallWho(false) === 'everyone' && normalizeCallWho('junk') === 'everyone');
check('already on a call / offline / unsupported / not a member', !canCall({ ...base, others: ['b'], inCall: true }).ok && !canCall({ ...base, others: ['b'], online: false }).ok && !canCall({ ...base, others: ['b'], supported: false }).ok && !canCall({ ...base, myState: 'left', others: ['b'] }).ok);
check('group: ok if at least one member can take it', canCall({ ...base, kind: 'group', others: ['b', 'z'], theirWho: { z: 'none' } }).ok);
check('group: refused when no one can', (() => { const r = canCall({ ...base, kind: 'group', others: ['b', 'z'], theirWho: { b: 'none', z: 'friends' } }); return !r.ok; })());
check('empty chat', !canCall({ ...base, others: [] }).ok);
check('Do not disturb → unavailable; in a call → busy', ringDecision({ dndUntil: Date.now() + 1000 }) === 'unavailable' && ringDecision({ inCall: true }) === 'busy' && ringDecision({}) === 'ring');
const now0 = Date.parse('2026-11-19T22:30:00');
check('DND options', dndUntilFor('off') === null && dndUntilFor('1h', now0) === now0 + 3600_000 && dndUntilFor('always') === DND_FOREVER && new Date(dndUntilFor('morning', now0)!).getHours() === 8 && dndUntilFor('morning', now0)! > now0);
check('DND active/label', dndActive(now0 + 1, now0) && !dndActive(null) && !dndActive(now0 - 1, now0) && /until you turn it off/i.test(dndLabel(DND_FOREVER)) && dndLabel(null) === 'Off');
check('DND stored as a date Postgres can parse', dndToDb(DND_FOREVER) === '9999-12-31T00:00:00Z' && dndFromDb('9999-12-31T00:00:00+00:00') === DND_FOREVER && dndFromDb(dndToDb(now0)) === now0 && dndToDb(null) === null && dndFromDb(null) === null);
check('settings: calls + DND normalized', (() => { const s = normalizeDmSettings({ who: 'everyone', calls: 'none', dndUntil: -5 }); return s.calls === 'none' && s.dndUntil === null; })() && normalizeDmSettings({ calls: 'everyone' }, true).calls === 'friends');

// ---------- state machine ----------
let s: CallState = idleCall();
s = reduceCall(s, { t: 'dial', at: 1000 }); check('dial → outgoing', s.phase === 'outgoing' && s.role === 'caller');
check('can’t ring while dialing', reduceCall(s, { t: 'ring', at: 1 }).phase === 'outgoing');
s = reduceCall(s, { t: 'remote-accept', at: 2000 }); check('they answer → connecting', s.phase === 'connecting' && s.answered);
s = reduceCall(s, { t: 'connected', at: 3000 }); check('media up → active, timer starts', s.phase === 'active' && s.connectedAt === 3000);
s = reduceCall(s, { t: 'disconnected', at: 5000 }); check('network drop → reconnecting', s.phase === 'reconnecting');
s = reduceCall(s, { t: 'connected', at: 6000 }); check('back → active, timer keeps counting', s.phase === 'active' && s.connectedAt === 3000);
check('timer', callSeconds(s, 65_000) === 62 && formatDuration(62) === '1:02' && formatDuration(3725) === '1:02:05' && longDuration(62) === '1 min 2 sec' && longDuration(45) === '45 sec' && longDuration(3700) === '1 hr 1 min');
s = reduceCall(s, { t: 'end', at: 65_000, reason: 'hangup' }); check('end', s.phase === 'ended' && callSeconds(s, 999_999) === 62);
check('ended is final', reduceCall(s, { t: 'connected', at: 70_000 }).phase === 'ended');
const inc = reduceCall(idleCall(), { t: 'ring', at: 1 });
check('incoming → accept → connecting', inc.phase === 'incoming' && inc.role === 'callee' && reduceCall(inc, { t: 'accept', at: 2 }).phase === 'connecting');
check('final status for the server', finalStatus({ ...idleCall(), phase: 'outgoing' }, 'timeout') === 'missed' && finalStatus({ ...idleCall(), phase: 'outgoing' }, 'hangup') === 'canceled' && finalStatus({ ...s }, 'hangup') === 'ended');
check('ended screen text', endedText({ ...s, reason: 'declined', role: 'caller' }) === 'Declined' && endedText({ ...s, reason: 'unavailable' }) === 'Not available right now' && endedText({ ...s, reason: 'timeout', role: 'caller' }) === 'No answer');

// ---------- call cards + history ----------
const L = (status: CallLog['status'], o: Partial<CallLog> = {}): CallLog => ({ id: 'x', kind: 'voice', status, ...o });
check('card: my ended call shows duration', (() => { const l = callLine(L('ended', { durationSec: 125 }), 'me', 'me'); return l.title === 'Voice call' && l.sub === '2 min 5 sec' && l.outgoing && !l.missed; })());
check('card: their missed call is red + call back', (() => { const l = callLine(L('missed', { kind: 'video' }), 'b', 'me'); return l.missed && l.title === 'Missed video call' && /call back/i.test(l.sub); })());
check('card: caller never learns about Do not disturb', callLine(L('unavailable'), 'me', 'me').sub === 'No answer' && /do not disturb/i.test(callLine(L('unavailable'), 'b', 'me').sub));
check('card: declined / canceled / busy / failed', callLine(L('declined'), 'me', 'me').sub === 'Declined' && callLine(L('declined'), 'b', 'me').sub === 'You declined' && callLine(L('canceled'), 'b', 'me').missed && callLine(L('busy'), 'me', 'me').sub === 'On another call' && /connect/.test(callLine(L('failed'), 'me', 'me').sub));
check('card: group wording', callLine(L('ended', { durationSec: 60, people: 3 }), 'me', 'me', true).title === 'Group voice call');
check('inbox preview for a call', /📞 Voice call · 1 min/.test(callPreview({ actor: 'me', call: L('ended', { durationSec: 60 }) }, 'me')) && /🎥 Missed video call/.test(callPreview({ actor: 'b', call: L('missed', { kind: 'video' }) }, 'me')));
check('systemText delegates to the call preview', /Missed voice call/.test(systemText({ type: 'call', actor: 'b', call: L('missed') }, () => 'B', 'me')) && isCallEvent({ type: 'call', actor: 'b', call: L('missed') }) && !isCallEvent({ type: 'created', actor: 'b' }));
const hist = [{ status: 'missed' as const, callerId: 'b', at: 10 }, { status: 'ended' as const, callerId: 'b', at: 20 }, { status: 'missed' as const, callerId: 'me', at: 30 }, { status: 'unavailable' as const, callerId: 'c', at: 40 }];
check('missed badge counts calls I missed since I last looked', missedSince(hist, 'me', 0) === 2 && missedSince(hist, 'me', 15) === 1);
check('Missed filter', historyFilter(hist, 'me', 'missed').length === 2 && historyFilter(hist, 'me', 'all').length === 4);

// ---------- quality, layout, bitrate ----------
check('quality: good / fair / poor / unknown', qualityOf({ rttMs: 40, lossPct: 0, jitterMs: 5 }) === 'good' && qualityOf({ rttMs: 350 }) === 'fair' && qualityOf({ lossPct: 12 }) === 'poor' && qualityOf({ rttMs: 50, jitterMs: 130 }) === 'poor' && qualityOf(null) === 'unknown');
check('packet loss between samples', lossBetween({ lost: 0, received: 0 }, { lost: 5, received: 95 }) === 5 && lossBetween(null, { lost: 1, received: 1 }) === null);
check('video bitrate shrinks as the mesh grows', videoBitrateFor(1) > videoBitrateFor(2) && videoBitrateFor(2) > videoBitrateFor(3) && videoBitrateFor(3) <= 450_000);
check('tile layout', tileLayout(1) === 'one' && tileLayout(2) === 'two' && tileLayout(3) === 'grid' && MAX_CALL_PEOPLE === 4);
check('self view snaps to the nearest corner', (() => { const f = { w: 400, h: 800, top: 70, bottom: 150, side: 12 }; const a = snapCorner({ x: 10, y: 100, w: 100, h: 140 }, f); const b = snapCorner({ x: 300, y: 600, w: 100, h: 140 }, f); return a.corner === 'tl' && a.x === 12 && a.y === 70 && b.corner === 'br' && b.x === 288 && b.y === 510; })());

// ---------- ICE / TURN ----------
check('free public STUN by default (no TURN)', iceServersFrom(null).length === DEFAULT_STUN.length && !hasTurn(iceServersFrom(null)));
check('TURN from config (comma list), credentials kept', (() => { const i = iceServersFrom({ turnUrls: 'turn:t.example:3478, turns:t.example:5349', turnUsername: 'u', turnCredential: 'p' }); const t = i.find((x) => Array.isArray(x.urls) && x.urls.some((u) => u.startsWith('turn')))!; return hasTurn(i) && t.username === 'u' && t.credential === 'p' && (t.urls as string[]).length === 2; })());
check('junk TURN URLs ignored', !hasTurn(iceServersFrom({ turnUrls: 'http://evil, javascript:x' })));

// ---------- signaling ----------
const sig = (o: Record<string, unknown>) => ({ v: 1, call: 'c1', from: 'b', sid: 's', t: 'offer', sdp: 'v=0', ...o });
check('valid offer accepted', !!parseSignal(sig({}), { call: 'c1', me: 'a', allowed: new Set(['b']) }));
check('wrong call / from me / not a participant / addressed to someone else → dropped', !parseSignal(sig({ call: 'c2' }), { call: 'c1', me: 'a' }) && !parseSignal(sig({ from: 'a' }), { call: 'c1', me: 'a' }) && !parseSignal(sig({}), { call: 'c1', me: 'a', allowed: new Set(['z']) }) && !parseSignal(sig({ to: 'z' }), { call: 'c1', me: 'a' }));
check('junk / huge / unknown type dropped', !parseSignal('x', { call: 'c1', me: 'a' }) && !parseSignal(sig({ t: 'hack' }), { call: 'c1', me: 'a' }) && !parseSignal(sig({ sdp: 'x'.repeat(200_000) }), { call: 'c1', me: 'a' }) && !parseSignal(sig({ t: 'offer', sdp: undefined }), { call: 'c1', me: 'a' }));
check('perfect negotiation: exactly one side is polite', isPolite('a', 'b') !== isPolite('b', 'a'));

// ---------- permissions ----------
check('media errors classified', mediaErrorKind('NotAllowedError') === 'denied' && mediaErrorKind('NotFoundError') === 'notfound' && mediaErrorKind('NotReadableError') === 'inuse' && mediaErrorKind('SecurityError') === 'insecure' && mediaErrorKind('Weird') === 'other');
check('denied help has platform steps', (() => { const i = mediaErrorHelp('denied', { video: true, platform: 'ios' }); const a = mediaErrorHelp('denied', { video: false, platform: 'android' }); return /camera/i.test(i.title) && i.steps.length > 0 && /Safari|Settings/i.test(i.steps.join(' ')) && a.steps.length > 0 && !/camera/i.test(a.title); })());
check('platform detection', platformOf('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)') === 'ios' && platformOf('Mozilla/5.0 (Linux; Android 15)') === 'android' && platformOf('Mozilla/5.0 (Windows NT 10.0)') === 'desktop');
check('explainer shown before the first browser prompt only', needsExplainer({ video: true, mic: 'prompt', cam: 'prompt', seen: {} }) && !needsExplainer({ video: false, mic: 'granted', cam: 'prompt', seen: {} }) && !needsExplainer({ video: false, mic: 'unknown', cam: 'unknown', seen: { mic: true } }) && needsExplainer({ video: false, mic: 'denied', cam: 'prompt', seen: { mic: true } }) && needsExplainer({ video: true, mic: 'granted', cam: 'prompt', seen: { mic: true } }));
check('server errors → friendly text', friendlyCallError({ message: 'call_request_out: x' }) === CALL_DENY_MSG.request_out && friendlyCallError({ message: 'call_minor: x' }) === CALL_DENY_MSG.minor && /up to 4/.test(friendlyCallError({ message: 'call_full: x' })) && /SETUP\.md/.test(friendlyCallError({ message: 'Could not find the function public.call_start in the schema cache' })) && friendlyCallError({ message: 'call_busy: x' }) === CALL_DENY_MSG.busy);

// ---------- TURN credentials function ----------
(async () => {
  const cred = await coturnCredential('s3cret', 'user-1', 3600, 1_700_000_000);
  check('coturn REST credential: expiry:user + base64 HMAC-SHA1', cred.username === '1700003600:user-1' && /^[A-Za-z0-9+/]+=*$/.test(cred.credential) && cred.credential.length === 28);
  const envO: Record<string, string> = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon', TURN_URLS: 'turn:turn.example:3478?transport=udp,turns:turn.example:5349', TURN_SECRET: 's3cret', ALLOWED_ORIGINS: 'https://app.example' };
  const env = (k: string) => envO[k] ?? '';
  const UID = '0a0a0a0a-1111-2222-3333-444444444444'; const TOK = 'Bearer eyJhbGciOiJIUzI1NiJ9.e30.sig';
  const okUser = (async (u: string | URL | Request) => (String(u).includes('/auth/v1/user') ? new Response(JSON.stringify({ id: UID }), { status: 200 }) : new Response('nope', { status: 500 }))) as typeof fetch;
  const req = (h: Record<string, string> = {}) => new Request('https://fn/turn-credentials', { method: 'POST', headers: { origin: 'https://app.example', ...h } });
  const f1 = await handle(req(), env, okUser);
  check('TURN fn: no sign-in → 401', f1.status === 401);
  const f2 = await handle(req({ authorization: TOK }), env, okUser, 1_700_000_000);
  const fj2 = await f2.json() as { iceServers: { urls: string[]; username?: string }[]; ttl: number };
  check('TURN fn: signed in → short-lived TURN creds, no-store', f2.status === 200 && f2.headers.get('cache-control') === 'no-store' && fj2.iceServers.some((x) => x.username === `1700021600:${UID}`) && fj2.ttl > 0);
  const f3 = await handle(req({ authorization: TOK }), (k: string) => (k === 'TURN_URLS' || k === 'TURN_SECRET' ? '' : env(k)), okUser);
  check('TURN fn: no provider configured → clear error (the app falls back to free STUN)', f3.status === 500 && /SETUP\.md/.test(JSON.stringify(await f3.json())));
  const f4 = await handle(new Request('https://fn/turn-credentials', { method: 'POST', headers: { origin: 'https://evil.example', authorization: TOK } }), env, okUser);
  check('TURN fn: other websites get no CORS access', f4.headers.get('access-control-allow-origin') !== 'https://evil.example');

  // ---------- docs + schema guards ----------
  const notes = readFileSync(new URL('../APP-BUILDER-NOTES.md', import.meta.url), 'utf8');
  const setup = readFileSync(new URL('../SETUP.md', import.meta.url), 'utf8');
  const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
  const ui = readFileSync(new URL('../src/components/Call.tsx', import.meta.url), 'utf8') + readFileSync(new URL('../src/pages/Messages.tsx', import.meta.url), 'utf8');
  const src = ['calls.ts', 'callEngine.ts', 'callIce.ts', 'callsSupabase.ts', 'callsDemo.ts', 'callStore.tsx'].map((f) => readFileSync(new URL(`../src/lib/${f}`, import.meta.url), 'utf8')).join('\n');
  check('schema: RLS on calls tables, no client writes', /alter table public\.calls\s+enable row level security/.test(schema) && /alter table public\.call_participants enable row level security/.test(schema) && !/create policy "call[^"]*" on public\.call[^ ]* for (insert|update|delete)/.test(schema));
  check('schema: private call channel + DND flag hidden', /call_broadcast_read/.test(schema) && /call_topic_ok/.test(schema) && /grant select \(call_id, user_id, state, invited_at, joined_at, left_at\) on public\.call_participants/.test(schema));
  check('schema: max 4 per call, 30 calls an hour, under-18 friends only', /call_full/.test(schema) && /30, 'calls an hour'/.test(schema) && /call_minor/.test(schema));
  check('honest encryption wording (no "end-to-end" claim for calls)', /DTLS-SRTP/.test(ui) && /audit/i.test(ui) && !/end-to-end encrypted/i.test(ui.replace(/not end-to-end encrypted/gi, '')));
  check('UI says calls only ring while the app is open (no push)', /no push notifications for calls/i.test(ui) && /no push/i.test(setup));
  check('SETUP documents TURN options with env vars', /TURN_SECRET/.test(setup) && /CF_TURN_KEY_ID/.test(setup) && /METERED_API_KEY/.test(setup) && /coturn/i.test(setup) && /use-auth-secret/.test(setup));
  check('no TURN secrets in the app code', !/TURN_SECRET|CF_TURN_API_TOKEN|METERED_API_KEY/.test(src) && !/credential:\s*'[^']+'/.test(src));
  check('notes: Calls section', /## Calls/.test(notes) && /mesh/i.test(notes));
  check('entitlements: calls features all free', (() => { const k = Object.keys(FEATURES).filter((x) => x.startsWith('calls.')); return k.length === 4 && k.every((x) => FEATURES[x as keyof typeof FEATURES].free && can(x as keyof typeof FEATURES)); })());

  // ---------- demo backend end to end ----------
  let clock = Date.parse('2026-11-19T15:00:00Z');
  const q: { at: number; fn: () => void }[] = [];
  const schedule = (fn: () => void, ms: number) => { q.push({ at: clock + ms, fn }); };
  const tick = async (ms: number) => { const end = clock + ms; for (;;) { q.sort((a, b) => a.at - b.at); const n = q[0]; if (!n || n.at > end) break; q.shift(); clock = n.at; n.fn(); await new Promise((r) => setTimeout(r, 0)); } clock = end; await new Promise((r) => setTimeout(r, 0)); };
  let soc: DemoState | undefined; let dms: DmDemoState | undefined;
  const social = new DemoBackend({ load: async () => soc, save: async (x) => { soc = structuredClone(x); }, blobUrl: () => 'blob:test', now: () => clock });
  await social.saveProfile({ username: 'jose.cruz', displayName: 'José Cruz', dob: '1990-05-05', privacy: 'public', showStats: false, useAvatar: false });
  const dm = new DemoDm({ load: async () => dms, save: async (x) => { dms = structuredClone(x); }, world: () => social.peek(), act: (a) => social.act(a), searchPeople: (x) => social.search(x), blobUrl: () => 'blob:dm', now: () => clock });
  // fake "media": records peers so we can see who joined
  const added: string[] = [];
  const media = (): DemoMediaLike => ({ flags: { mic: true, cam: false }, start() {}, peerViews: () => [], setMic() {}, async setVideo() {}, hangup() {}, addPeer: (id) => { added.push(id); }, removePeer() {} });
  const calls = new DemoCalls({ dm, schedule, now: () => clock, media: () => media() });
  const ev: CallEvent[] = [];
  calls.subscribe((e) => ev.push(e));

  check('demo: friends can be called', (await calls.check('c-maya')).ok && (await calls.check('g-crew')).ok);
  check('demo: message requests can’t call', (await calls.check('r-jordan')).ok === false);
  check('demo: sample pickup behaviour labelled', SAMPLE_PICKUP.s1.answer && !SAMPLE_PICKUP.s3.answer);

  const r1 = await calls.start('c-maya', 'video');
  check('demo: start → ringing Maya', r1.status === 'ringing' && r1.ringing.join() === 's1');
  await calls.connect(r1.callId, { local: {} as MediaStream, onUpdate() {}, onPeerLeft() {} });
  await rejects('demo: one call at a time', () => calls.start('c-leo', 'voice'), /busy|already/i);
  await tick(SAMPLE_PICKUP.s1.after + 10);
  check('demo: Maya picks up', ev.some((e) => e.type === 'peer' && e.userId === 's1' && e.state === 'joined') && added.includes('s1') && calls.session(r1.callId)?.status === 'active');
  await tick(83_000);
  await calls.leave(r1.callId, 'hangup');
  const mayaMsgs = await dm.messages('c-maya');
  const card = mayaMsgs.find((m) => m.system?.type === 'call');
  check('demo: hang up → call card in the chat with the duration', !!card && card.system!.call!.status === 'ended' && card.system!.call!.durationSec === 83 && card.system!.actor === DM_ME);
  check('demo: status event sent', ev.some((e) => e.type === 'status' && e.callId === r1.callId && e.status === 'ended'));

  const r2 = await calls.start('c-ana', 'voice');
  await tick(SAMPLE_PICKUP.s3.after + 10);
  check('demo: Ana declines', calls.session(r2.callId)?.status === 'declined' && (await dm.messages('c-ana')).some((m) => m.system?.call?.status === 'declined'));

  const r3 = await calls.start('c-leo', 'voice');
  await calls.leave(r3.callId, 'hangup');
  check('demo: cancel before an answer → canceled', calls.session(r3.callId)?.status === 'canceled');
  await tick(10_000);
  check('demo: a canceled call doesn’t get picked up later', calls.session(r3.callId)?.status === 'canceled');

  // incoming (a sample person calls you)
  ev.length = 0;
  await calls.simulateIncoming('c-leo', 'video');
  const incE = ev.find((e) => e.type === 'incoming');
  check('demo: incoming call from Leo', !!incE && incE.type === 'incoming' && incE.invite.callerId === 's2' && incE.invite.kind === 'video');
  const incId = incE && incE.type === 'incoming' ? incE.invite.callId : '';
  await tick(RING_TIMEOUT_MS + 10);
  check('demo: not answered → missed call in the chat', calls.session(incId)?.status === 'missed' && (await dm.messages('c-leo')).some((m) => m.system?.call?.id === incId && m.system.call.status === 'missed' && m.system.actor === 's2'));
  ev.length = 0;
  await calls.simulateIncoming('c-maya', 'voice');
  const inc2 = ev.find((e) => e.type === 'incoming'); const id2 = inc2 && inc2.type === 'incoming' ? inc2.invite.callId : '';
  await calls.answer(id2); await calls.connect(id2, { local: {} as MediaStream, onUpdate() {}, onPeerLeft() {} });
  check('demo: answer → active, caller connected', calls.session(id2)?.status === 'active' && added.filter((x) => x === 's1').length >= 2);
  await tick(30_000); await calls.leave(id2, 'hangup');
  check('demo: answered incoming call logs duration', (await dm.messages('c-maya')).some((m) => m.system?.call?.id === id2 && m.system.call.status === 'ended' && m.system.call.durationSec === 30));
  ev.length = 0;
  await calls.simulateIncoming('c-ana', 'voice');
  const inc3 = ev.find((e) => e.type === 'incoming'); const id3 = inc3 && inc3.type === 'incoming' ? inc3.invite.callId : '';
  await calls.decline(id3);
  check('demo: decline an incoming call', calls.session(id3)?.status === 'declined');

  // group call
  added.length = 0;
  const rg = await calls.start('g-crew', 'video');
  await calls.connect(rg.callId, { local: {} as MediaStream, onUpdate() {}, onPeerLeft() {} });
  check('demo: group call rings the 3 sample members', rg.ringing.length === 3);
  await tick(8_000);
  check('demo: group call — Maya and Leo join, Ana declines, call stays up', added.includes('s1') && added.includes('s2') && !added.includes('s3') && calls.session(rg.callId)?.status === 'active');
  await tick(60_000); await calls.leave(rg.callId, 'hangup');
  check('demo: group call card counts people', (await dm.messages('g-crew')).some((m) => m.system?.call?.id === rg.callId && m.system.call.people === 3 && m.system.call.status === 'ended'));

  // Do not disturb (mine): incoming sample calls don't ring
  const st0 = await dm.getSettings();
  await dm.saveSettings({ ...st0, dndUntil: clock + 3600_000 });
  ev.length = 0;
  await calls.simulateIncoming('c-leo', 'voice');
  check('demo: my Do not disturb → no ring, logged for me', !ev.some((e) => e.type === 'incoming') && (await dm.messages('c-leo')).some((m) => m.system?.call?.status === 'unavailable'));
  await dm.saveSettings({ ...st0, dndUntil: null, calls: 'none' });
  ev.length = 0;
  await calls.simulateIncoming('c-maya', 'voice');
  check('demo: "No one can call me" → no ring', !ev.some((e) => e.type === 'incoming'));
  await dm.saveSettings({ ...st0, calls: 'everyone' });

  // their Do not disturb: rings out, I just see "No answer"
  const ds = await (dm as unknown as { st(): Promise<DmDemoState> }).st(); // a sample person turns on Do not disturb
  ds.settings.s2 = { ...ds.settings.s2, dndUntil: clock + 3600_000 };
  const rd = await calls.start('c-leo', 'voice');
  await tick(10_000);
  check('demo: their Do not disturb → keeps ringing, nobody picks up', calls.session(rd.callId)?.status === 'ringing');
  await calls.leave(rd.callId, 'timeout');
  check('demo: …then "No answer" (missed), DND not revealed', calls.session(rd.callId)?.status === 'missed');

  // history
  const h = await calls.history();
  check('demo: Calls tab history newest first', h.length >= 8 && h[0].at >= h[h.length - 1].at && h.some((x) => x.group));
  check('demo: missed badge', missedSince(h, DM_ME, 0) >= 2);
  await calls.hide(h[0].id);
  check('demo: remove from history', !(await calls.history()).some((x) => x.id === h[0].id));

  console.log(failed ? `\n${failed} FAILED, ${passed} passed` : `\nALL ${passed} CALLS CHECKS PASSED`);
  process.exit(failed ? 1 : 0);
})();
