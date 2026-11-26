// Safety (v1.6): pure rules (src/lib/safety.ts), message unsend window + restrict folders, the on-device demo backend,
// the server-JSON mapping, the purge Edge Function (with a fake Storage/REST), and schema/UI wiring checks.
// Run: node --experimental-strip-types --import ./tools/ts-resolve.mjs tools/test-safety.ts
import { readFileSync, readdirSync } from 'node:fs';
import {
  REPORT_REASONS, REASON_KEYS, normalizeReason, priorityOf, showCrisisHelp, showChildSafetyHelp, reportRateCheck, isDuplicateReport, REPORT_LIMITS, guidelineForReason, GUIDELINES,
  pauseUntilFor, deletionDateOf, effectiveStatus, pauseExpired, canAppeal, validateAppeal, decisionActive, sortQueue, messagingRestricted, UNSEND_WINDOW_MS, MAX_MESSAGES_PER_REPORT,
  type Decision,
} from '../src/lib/safety.ts';
import { canUnsend, applyUnsend, folderOf, inboxBadge, friendlyDmError, type Conversation, type Message } from '../src/lib/messages.ts';
import { SafetyDemoBackend, sampleQueue, type SafetyDemoState } from '../src/lib/safetyDemo.ts';
import { mapStatus, mapQueue, mapMyReport, friendlySafetyError } from '../src/lib/safetyApi.ts';
import { DemoBackend, type DemoState } from '../src/lib/socialDemo.ts';
import { DemoDm, type DmDemoState } from '../src/lib/messagesDemo.ts';
import { handle as purgeHandle, safeEqual, listAll } from '../supabase/functions/purge-accounts/index.ts';

let n = 0, failed = 0;
const check = (name: string, cond: boolean, detail?: unknown) => { n++; if (!cond) { failed++; console.error('FAIL', name, detail ?? ''); } else console.log('ok', name); };
const errText = (e: unknown) => `${(e as { code?: string }).code || ''} ${(e as Error).message}`;
const throws = (name: string, fn: () => unknown, re: RegExp) => { try { fn(); check(name, false, 'no error'); } catch (e) { check(name, re.test(errText(e)), errText(e)); } };
const rejects = async (name: string, fn: () => Promise<unknown>, re: RegExp) => { try { await fn(); check(name, false, 'no error'); } catch (e) { check(name, re.test(errText(e)), errText(e)); } };
const src = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const DAY = 86_400_000;

// ---------- reasons ----------
const want = ['spam', 'harassment', 'hate', 'sexual', 'minor', 'self_harm', 'impersonation', 'scam', 'violence', 'other'];
check('10 report reasons in the requested order', JSON.stringify(REASON_KEYS) === JSON.stringify(want));
check('every reason has a label, a description and a real guideline', REPORT_REASONS.every((r) => r.label && r.sub && GUIDELINES.some((g) => g.id === r.guideline)));
check('legacy reasons map: nudity→sexual, underage→minor, misinformation→other', normalizeReason('nudity') === 'sexual' && normalizeReason('underage') === 'minor' && normalizeReason('misinformation') === 'other' && normalizeReason('???') === 'other');
check('priority: minor + self-harm urgent, violence/sexual/harassment high, rest normal', priorityOf('minor') === 0 && priorityOf('self_harm') === 0 && priorityOf('violence') === 1 && priorityOf('sexual') === 1 && priorityOf('harassment') === 1 && priorityOf('spam') === 2 && priorityOf('underage') === 0);
check('988 shown for self-harm reports, CyberTipline for minor reports', showCrisisHelp('self_harm') && !showCrisisHelp('spam') && showChildSafetyHelp('minor') && !showChildSafetyHelp('self_harm'));
check('guideline for a reason', guidelineForReason('scam').id === 'spam' && guidelineForReason('minor').id === 'minors');
const now = Date.parse('2026-11-19T15:00:00Z');
check('rate limit: 10/hour', reportRateCheck(Array(9).fill(now - 60_000), now).ok && !reportRateCheck(Array(10).fill(now - 60_000), now).ok);
check('rate limit: 30/day', !reportRateCheck(Array(30).fill(now - 5 * 3600_000), now).ok && reportRateCheck(Array(30).fill(now - 25 * 3600_000), now).ok);
check('duplicate: same target within 24 h', isDuplicateReport([{ targetType: 'post', targetId: 'p1', createdAt: now - 3600_000 }], { targetType: 'post', targetId: 'p1' }, now) && !isDuplicateReport([{ targetType: 'post', targetId: 'p1', createdAt: now - 2 * DAY }], { targetType: 'post', targetId: 'p1' }, now));
check('report details max 500, up to 10 messages per report', REPORT_LIMITS.detailsMax === 500 && MAX_MESSAGES_PER_REPORT === 10);

// ---------- time off + deletion ----------
check('pause: until I come back = no end', pauseUntilFor('open', now) === null);
check('pause: 1 week / 1 month', pauseUntilFor('week', now) === now + 7 * DAY && pauseUntilFor('month', now) === now + 30 * DAY);
const tomorrow = new Date(now + DAY); const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
check('pause: custom date → that local morning', pauseUntilFor('custom', now, ymd(tomorrow)) === new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate()).getTime());
throws('pause: custom date must be after today', () => pauseUntilFor('custom', now, ymd(new Date(now))), /after today/);
throws('pause: custom date at most a year away', () => pauseUntilFor('custom', now, ymd(new Date(now + 400 * DAY))), /365/);
throws('pause: custom needs a date', () => pauseUntilFor('custom', now, ''), /Pick/);
check('deletion date = exactly 30 days later', deletionDateOf(now) === now + 30 * DAY);
const dec = (o: Partial<Decision>): Decision => ({ id: 'd', kind: 'suspend', guideline: 'respect', createdAt: now - DAY, endsAt: now + 2 * DAY, appeal: null, ...o });
check('status: active by default', effectiveStatus({}, [], now).kind === 'active');
check('status: paused with end date', effectiveStatus({ pausedAt: now - DAY, pauseUntil: now + DAY }, [], now).kind === 'paused');
check('status: expired pause = active again (auto-resume)', effectiveStatus({ pausedAt: now - 8 * DAY, pauseUntil: now - 1 }, [], now).kind === 'active' && pauseExpired({ pausedAt: 1, pauseUntil: now - 1 }, now));
check('status: suspension beats pause; deletion beats both', effectiveStatus({ pausedAt: now - DAY }, [dec({})], now).kind === 'suspended' && effectiveStatus({ deletionRequestedAt: now, purgeAt: now + 30 * DAY }, [dec({})], now).kind === 'deletion_pending');
check('status: reversed or ended suspension doesn’t count', effectiveStatus({}, [dec({ reversedAt: now })], now).kind === 'active' && effectiveStatus({}, [dec({ endsAt: now - 1 })], now).kind === 'active');
check('messaging restriction is separate from suspension', !!messagingRestricted([dec({ kind: 'restrict_messaging' })], now) && !messagingRestricted([dec({})], now));
check('content removal stays active until reversed', decisionActive(dec({ kind: 'remove_content', endsAt: undefined }), now) && !decisionActive(dec({ kind: 'remove_content', endsAt: undefined, reversedAt: now }), now));

// ---------- appeals ----------
check('appeal: allowed within 30 days, shows days left', (() => { const r = canAppeal(dec({ createdAt: now - 10 * DAY }), now); return r.ok && r.daysLeft === 20; })());
check('appeal: not after 30 days', !canAppeal(dec({ createdAt: now - 31 * DAY }), now).ok);
check('appeal: only once', !canAppeal(dec({ appeal: { id: 'a', decisionId: 'd', text: 'x', status: 'submitted', createdAt: now } }), now).ok);
check('appeal: not when already reversed', !canAppeal(dec({ reversedAt: now }), now).ok);
check('appeal text 10–1000 chars', validateAppeal('too short') !== null && validateAppeal('This is long enough.') === null && validateAppeal('x'.repeat(1001)) !== null);
check('queue: urgent first, then oldest', JSON.stringify(sortQueue([{ priority: 2, createdAt: 1 }, { priority: 0, createdAt: 5 }, { priority: 0, createdAt: 3 }]).map((x) => x.createdAt)) === '[3,5,1]');

// ---------- messages: unsend window + restrict ----------
const msg: Message = { id: 'm', conversationId: 'c', senderId: 'a', kind: 'text', body: 'hi', createdAt: now };
check('unsend for everyone within 24 h', canUnsend(msg, 'a', now + UNSEND_WINDOW_MS - 1) && !canUnsend(msg, 'a', now + UNSEND_WINDOW_MS + 1));
throws('unsend after 24 h → dm_unsend_window', () => applyUnsend(msg, 'a', now + UNSEND_WINDOW_MS + 1), /dm_unsend_window/);
check('friendly text for the unsend window + account limits', /24 hours/.test(friendlyDmError(new Error('dm_unsend_window'))) && /suspended/.test(friendlyDmError(new Error('acct_suspended'))) && /restricted/.test(friendlyDmError(new Error('acct_msg_restricted'))));
const conv: Pick<Conversation, 'members' | 'lastMessageAt' | 'createdBy'> = { createdBy: 'b', lastMessageAt: now, members: [{ userId: 'a', role: 'member', state: 'active', joinedAt: 0, lastReadAt: 0, deliveredAt: 0 }, { userId: 'b', role: 'member', state: 'active', joinedAt: 0, lastReadAt: 0, deliveredAt: 0 }] };
check('restricted chat → Requests folder', folderOf(conv, 'a', true) === 'requests' && folderOf(conv, 'a') === 'chats');
check('restricted chats never light the badge (silent)', inboxBadge([{ folder: 'requests', unread: 3, muted: false, restricted: true }]) === 0 && inboxBadge([{ folder: 'requests', unread: 3, muted: false }]) === 1);

// ---------- server JSON mapping ----------
const st = mapStatus({ paused_at: null, pause_until: null, deletion_requested_at: '2026-11-19T15:00:00Z', purge_after: '2026-12-19T15:00:00Z', is_moderator: false, now: '2026-11-19T15:00:00Z',
  decisions: [{ id: 'x', kind: 'remove_content', guideline: 'spam', content_type: 'post', content_id: 'p', created_at: '2026-11-18T00:00:00Z', appeal: { id: 'ap', body: 'please look again', status: 'under_review', created_at: '2026-11-18T01:00:00Z' } }] });
check('mapStatus: deletion date and decision with appeal', st.account.purgeAt === Date.parse('2026-12-19T15:00:00Z') && st.decisions[0].contentId === 'p' && st.decisions[0].appeal?.status === 'under_review' && effectiveStatus(st.account, st.decisions, now).kind === 'deletion_pending');
const mq = mapQueue({ reports: [{ id: 'r', store: 'messages', target_type: 'message', target_id: 'm', reason: 'underage', status: 'open', priority: 0, created_at: '2026-11-19T00:00:00Z', snapshot: { messages: [] } }], appeals: [] });
check('mapQueue: legacy reason normalised, priority kept', mq.reports[0].reason === 'minor' && mq.reports[0].priority === 0);
check('mapMyReport: no reporter field exposed', !('reporterId' in mapMyReport({ id: 'r', store: 'social', target_type: 'post', target_id: 'p', reason: 'spam', status: 'actioned', created_at: '2026-11-19T00:00:00Z' })));
check('friendly safety errors', /password/.test(friendlySafetyError(new Error('reauth_required: x'))) && /already appealed/.test(friendlySafetyError(new Error('appeal_once: x'))) && /30 days/.test(friendlySafetyError(new Error('appeal_window: x'))));

// ---------- schema + wiring (static) ----------
const schema = src('supabase/schema.sql');
const newTables = ['account_state', 'moderation_actions', 'appeals', 'dm_restricts'];
check('schema: RLS on every new safety table', newTables.every((t) => new RegExp(`alter table public\\.${t}\\s+enable row level security`).test(schema)));
check('schema: moderator flag protected by trigger, queue gated by is_moderator', /profiles_protect_moderator/.test(schema) && /mod_require\(\)/.test(schema) && /not_moderator/.test(schema));
check('schema: unsend window 24 h, deletion grace 30 days, appeal window 30 days', /dm_unsend_window/.test(schema) && /interval '30 days'/.test(schema) && /appeal_window/.test(schema));
check('schema: purge functions only for service_role', /grant execute on function public\.account_housekeeping\(\), public\.account_purge_candidates\(integer\), public\.account_purge_message_media\(uuid\), public\.account_purge_finish\(uuid\) to service_role/.test(schema));
const setup = src('SETUP.md');
check('SETUP §15 documents moderators, pg_cron + Vault purge, Edge Function', /## 15\. Safety/.test(setup) && /is_moderator = true/.test(setup) && /cron\.schedule/.test(setup) && /vault\.create_secret/.test(setup) && /purge-accounts/.test(setup));
const app = src('src/App.tsx'), post = src('tools/postbuild.mjs');
check('routes: guidelines, reporting, time off, delete, moderation', ['/safety/guidelines', '/safety/reporting', '/safety/time-off', '/safety/delete', '/moderation'].every((r) => app.includes(`path="${r}"`) && post.includes(`'${r.slice(1)}'`)) && post.includes("'settings/safety'"));
check('/social/rules shows the new guidelines', /path="\/social\/rules" element=\{<GuidelinesPage \/>\}/.test(app));
const allSrc = (readdirSync(new URL('../src', import.meta.url), { recursive: true }) as string[]).filter((f) => /\.tsx?$/.test(f)).map((f) => src(`src/${f}`)).join('\n');
check('report entry points: profile, post, media, story, comment, chat, message, call, activity', ['report-user', 'report-post', 'report-media', "type: 'story'", "type: 'comment'", 'dm-info-report', "setReport({ type: 'message', m })", "type: 'call'", 'activity-report'].every((k) => allSrc.includes(k)));
check('restrict entry points: profile, friends menu, chat info', ['profile-restrict', 'friend-restrict', 'dm-info-restrict'].every((k) => allSrc.includes(k)));
check('no hard-coded secrets in the purge function', !/eyJ[a-zA-Z0-9]{20,}|sk_live|service_role_key\s*=\s*['"]/i.test(src('supabase/functions/purge-accounts/index.ts')));
const css = src('src/styles.css'); const sfCss = css.slice(css.indexOf('v1.6 Safety'));
check('safety CSS uses theme tokens (no hard-coded hex colours)', sfCss.length > 100 && !/#[0-9a-fA-F]{3,6}\b/.test(sfCss));

(async () => {
  // ---------- demo safety backend ----------
  let clock = now; let saved: SafetyDemoState | undefined;
  const sb = new SafetyDemoBackend({ load: async () => saved, save: async (s) => { saved = structuredClone(s); }, now: () => clock });
  check('demo: starts active, no decisions', effectiveStatus((await sb.status()).account, [], clock).kind === 'active' && (await sb.status()).decisions.length === 0);
  await sb.logReport({ targetType: 'post', targetId: 'p1', reason: 'spam', targetName: '@sample.x' });
  await rejects('demo: duplicate report refused', () => sb.logReport({ targetType: 'post', targetId: 'p1', reason: 'hate' }), /report_duplicate/);
  for (let i = 0; i < 9; i++) await sb.logReport({ targetType: 'user', targetId: `u${i}`, reason: 'spam' });
  await rejects('demo: 11th report in an hour rate-limited', () => sb.logReport({ targetType: 'user', targetId: 'u99', reason: 'spam' }), /rate_limit/);
  check('demo: My reports lists them, status Received', (await sb.myReports()).length === 10 && (await sb.myReports()).every((r) => r.status === 'open'));
  // time off
  await sb.pause(clock + 7 * DAY);
  check('demo: paused for a week', effectiveStatus((await sb.status()).account, [], clock).kind === 'paused');
  clock += 8 * DAY;
  check('demo: auto-resumes after the end date', !(await sb.status()).account.pausedAt);
  await rejects('demo: pause > 1 year refused', () => sb.pause(clock + 400 * DAY), /pause_date/);
  await sb.pause(null); await sb.resume();
  check('demo: resume clears the pause', !(await sb.status()).account.pausedAt);
  // deletion
  const purge = await sb.requestDeletion({ reason: 'Privacy concerns' });
  check('demo: deletion scheduled 30 days out', purge === clock + 30 * DAY && effectiveStatus((await sb.status()).account, [], clock).kind === 'deletion_pending');
  await rejects('demo: can’t pause while deletion is pending', () => sb.pause(null), /deletion_pending/);
  await sb.reopen();
  check('demo: reopen restores the account', effectiveStatus((await sb.status()).account, [], clock).kind === 'active');
  // decisions + appeals
  await sb.simulateDecision({ kind: 'remove_content', guideline: 'spam', contentType: 'post', contentId: 'mine1', contentPreview: 'demo post' });
  let s1 = await sb.status();
  const d1 = s1.decisions[0];
  check('demo: simulated removal is labelled (sample) and active', d1.sample === true && decisionActive(d1, clock) && d1.contentId === 'mine1');
  await rejects('demo: appeal needs 10+ chars', () => sb.appeal(d1.id, 'short'), /appeal_text/);
  await sb.appeal(d1.id, 'It was a training log, not spam.');
  await rejects('demo: one appeal per decision', () => sb.appeal(d1.id, 'Second try at an appeal.'), /appeal_once/);
  const q = await sb.modQueue();
  check('demo queue: SAMPLE reports + my reports + my appeal', q.reports.some((r) => r.sample) && q.reports.some((r) => !r.sample) && q.appeals.length === 1 && sampleQueue(clock).every((r) => r.sample && r.targetName?.startsWith('sample.')));
  check('demo queue: urgent sample reports exist (minor, self-harm)', q.reports.filter((r) => r.priority === 0).length >= 2);
  await sb.modDecideAppeal(q.appeals[0].id, 'reversed', 'Our mistake.');
  s1 = await sb.status();
  check('demo: reversal restores (decision reversed, appeal shows Reversed)', !!s1.decisions[0].reversedAt && s1.decisions[0].appeal?.status === 'reversed' && !decisionActive(s1.decisions[0], clock));
  const mine = (await sb.myReports())[0];
  await rejects('demo: removing content needs a guideline', () => sb.modAct({ store: 'social', reportId: mine.id, action: 'remove_content' }), /mod_guideline/);
  await sb.modAct({ store: 'social', reportId: mine.id, action: 'remove_content', guideline: 'spam' });
  check('demo: reporter sees “Action taken”', (await sb.myReports()).find((r) => r.id === mine.id)?.status === 'actioned');
  check('demo: every moderator action logged', (await sb.modLog()).some((l) => l.action === 'restore_content') && (await sb.modLog()).some((l) => l.action === 'remove_content' && l.reportId === mine.id));
  await sb.simulateDecision({ kind: 'suspend', guideline: 'respect', days: 3 });
  const d2 = (await sb.status()).decisions[0];
  check('demo: suspension shows an end date and blocks via effectiveStatus', d2.endsAt === clock + 3 * DAY && effectiveStatus({}, (await sb.status()).decisions, clock).kind === 'suspended');
  clock += 31 * DAY;
  await rejects('demo: appeal after 30 days refused', () => sb.appeal(d2.id, 'Please look at this again.'), /appeal_window/);
  await sb.resetDemo();
  check('demo: reset clears everything', (await sb.status()).decisions.length === 0 && (await sb.myReports()).length === 0);

  // ---------- messages demo: restrict + multi-message report ----------
  let soc: DemoState | undefined; let dms: DmDemoState | undefined; const c2 = Date.parse('2026-11-19T15:00:00Z');
  const social = new DemoBackend({ load: async () => soc, save: async (s) => { soc = structuredClone(s); }, blobUrl: () => 'blob:t', now: () => c2 });
  await social.saveProfile({ username: 'safety.tester', displayName: 'Safety Tester', dob: '1990-05-05', privacy: 'public', showStats: false, useAvatar: false });
  const dm = new DemoDm({ load: async () => dms, save: async (s) => { dms = structuredClone(s); }, world: () => social.peek(), act: (a) => social.act(a), searchPeople: (x) => social.search(x), blobUrl: () => 'blob:dm', now: () => c2 });
  const before = (await dm.inbox()).find((c) => c.id === 'c-leo')!;
  check('restrict demo: Leo’s chat starts in Chats', before.folder === 'chats' && !before.restricted);
  await dm.restrict('s2');
  const after = (await dm.inbox()).find((c) => c.id === 'c-leo')!;
  check('restrict demo: moved to Requests, marked restricted, no badge', after.folder === 'requests' && after.restricted === true && inboxBadge([after]) === 0);
  check('restrict demo: listed', JSON.stringify(await dm.restrictedIds()) === '["s2"]');
  await dm.unrestrict('s2');
  check('restrict demo: unrestrict puts it back', (await dm.inbox()).find((c) => c.id === 'c-leo')!.folder === 'chats');
  await rejects('restrict demo: can’t restrict yourself', () => dm.restrict('me'), /dm_self/);
  await dm.report({ targetType: 'message', targetId: 'l4', conversationId: 'c-leo', reason: 'harassment', messageIds: ['l3', 'l4', 'm1'] });
  const rep = (dms as DmDemoState).reports.at(-1)!;
  check('message report attaches the selected messages (same chat only)', (rep.snapshot as { messages: { id: string }[] }).messages.map((m) => m.id).sort().join() === 'l3,l4');

  // ---------- purge Edge Function (fake Supabase) ----------
  const files: Record<string, string[]> = { 'user-media': ['u1/avatar.jpg', 'u1/gallery/a.jpg', 'u2/keep.jpg'], 'social-media': ['u1/posts/p1/0.jpg', 'u1/stories/s.jpg'], 'activity-images': ['u1/x.png'], 'message-media': ['c1/u1/m.jpg', 'c1/u2/n.jpg'] };
  const calls: string[] = [];
  const fake = (async (url: string, init?: RequestInit) => {
    const u = String(url); const body = init?.body ? JSON.parse(String(init.body)) : {};
    calls.push(`${init?.method} ${u.replace('https://x.supabase.co', '')}`);
    if (u.endsWith('/rpc/account_housekeeping')) return new Response('1');
    if (u.endsWith('/rpc/account_purge_candidates')) return new Response(JSON.stringify([{ user_id: 'u1' }]));
    if (u.endsWith('/rpc/account_purge_message_media')) return new Response(JSON.stringify(['c1/u1/m.jpg']));
    if (u.endsWith('/rpc/account_purge_finish')) return new Response('true');
    const lm = /\/storage\/v1\/object\/list\/(.+)$/.exec(u);
    if (lm) {
      const pre = `${body.prefix}/`;
      const under = files[lm[1]].filter((f) => f.startsWith(pre)).map((f) => f.slice(pre.length));
      const names = [...new Set(under.map((f) => f.split('/')[0]))];
      return new Response(JSON.stringify(names.map((nm) => ({ name: nm, id: under.includes(nm) ? 'file' : null }))));
    }
    const dm2 = /\/storage\/v1\/object\/([^/]+)$/.exec(u);
    if (dm2 && init?.method === 'DELETE') { files[dm2[1]] = files[dm2[1]].filter((f) => !body.prefixes.includes(f)); return new Response('[]'); }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
  const env = (k: string) => ({ PURGE_SECRET: 's3cret-value', SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-service-key' } as Record<string, string>)[k] || '';
  const bad = await purgeHandle(new Request('https://f/purge', { method: 'POST', headers: { 'x-purge-secret': 'nope' } }), env, fake);
  check('purge fn: wrong secret → 401, nothing touched', bad.status === 401 && calls.length === 0);
  const res = await purgeHandle(new Request('https://f/purge', { method: 'POST', headers: { 'x-purge-secret': 's3cret-value' } }), env, fake);
  const out = await res.json() as { purged: number; results: { files: number }[] };
  check('purge fn: deletes every file of the user in all buckets (nested folders too)', res.status === 200 && out.purged === 1 && out.results[0].files === 6 && files['user-media'].join() === 'u2/keep.jpg' && files['social-media'].length === 0 && files['activity-images'].length === 0 && files['message-media'].join() === 'c1/u2/n.jpg');
  check('purge fn: files first, then account_purge_finish', calls.findIndex((c) => c.includes('account_purge_finish')) > calls.findLastIndex((c) => c.startsWith('DELETE')));
  check('purge fn: constant-time compare', safeEqual('abc', 'abc') && !safeEqual('abc', 'abd') && !safeEqual('', ''));
  check('purge fn: listAll recurses', (await listAll({ url: 'https://x.supabase.co', key: 'k', fetch: fake }, 'user-media', 'u2')).join() === 'u2/keep.jpg');
  const noSecret = await purgeHandle(new Request('https://f/purge', { method: 'POST' }), () => '', fake);
  check('purge fn: refuses to run without PURGE_SECRET configured', noSecret.status === 500);

  console.log(failed ? `\n${failed} FAILED` : `\nALL ${n} SAFETY CHECKS PASSED`);
  if (failed) process.exit(1);
})();
