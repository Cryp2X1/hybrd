// Unit checks for Social: Friends & Stories — handle validation, friend-request state machine, block effects, audience
// filtering, story expiry, profanity filter, age gate, counts, rate limits, links, and the demo backend end to end.
// Run: node --experimental-strip-types --import ./tools/ts-resolve.mjs tools/test-social.ts
import { readFileSync } from 'node:fs';
import {
  validateHandle, normalizeHandle, suggestHandle, validateDisplayName, hasProfanity, maskProfanity, cleanText, ageFromDob, ageGate, socialAllowed,
  applyAction, relation, friendIds, incoming, outgoing, isBlocked, areFriends, SocialError, rateCheck, LIMITS, canSee, effectiveAudience, feedFor,
  visibleComments, canDeleteComment, storyExpiry, isStoryActive, storyTimeLeft, storyGroups, groupStories, toggleCount, compact, plural, badgeCount,
  notifyTarget, notifText, inviteUrl, postUrl, profileUrl, workoutCard, validatePost, checkSocialImage, timeAgo,
  applyReaction, summarizeReactions, migrateLikesToReactions, visibleReactions, canReactOn, REACTION_TYPES, REACTION_META,
  STORY_MS, POST_MAX, COMMENT_MAX, MIN_SOCIAL_AGE,
  type Graph, type Post, type Reaction, type Story, type ViewCtx,
} from '../src/lib/social.ts';
import { DemoBackend, seedDemo, migrateDemoState, DEMO_ME, type DemoState } from '../src/lib/socialDemo.ts';
import { friendlyError } from '../src/lib/socialApi.ts';
import { FEATURES, can } from '../src/lib/entitlements.ts';

let failed = 0;
const check = (name: string, cond: boolean, detail?: unknown) => { if (!cond) { failed++; console.error('FAIL', name, detail ?? ''); } else console.log('ok', name); };
const throws = (name: string, fn: () => unknown, re?: RegExp) => { try { fn(); check(name, false, 'did not throw'); } catch (e) { check(name, !re || re.test((e as Error).message), (e as Error).message); } };

// ---------- handles ----------
check('valid handle', validateHandle('jose.cruz').ok && validateHandle('hybrid_athlete_2026').ok);
check('normalises @, case and spaces', validateHandle('  @Jose_Cruz ').handle === 'jose_cruz' && normalizeHandle('@@ABC') === 'abc');
check('too short', !validateHandle('ab').ok);
check('too long (21)', !validateHandle('a'.repeat(21)).ok && validateHandle('a'.repeat(20)).ok);
check('bad characters', !validateHandle('jose-cruz').ok && !validateHandle('josé').ok && !validateHandle('jo se').ok);
check('dots rules', !validateHandle('.jose').ok && !validateHandle('jose.').ok && !validateHandle('jo..se').ok && validateHandle('j.o.s.e').ok);
check('needs a letter', !validateHandle('12345').ok && validateHandle('runner42').ok);
check('reserved', !validateHandle('admin').ok && !validateHandle('hybrd').ok && !validateHandle('h.y.b.r.d').ok && !validateHandle('support').ok);
check('sample.* reserved for demo people', !validateHandle('sample.maya').ok && !validateHandle('sample_x').ok && validateHandle('samplerunner').ok);
check('profane handle rejected', !validateHandle('fuck.you').ok && !validateHandle('sh1t_runner').ok);
check('suggestHandle from name', suggestHandle('José Manuel Cruz') === 'jose.manuel.cruz' && validateHandle(suggestHandle('Al')).ok);
check('display name: trims, caps 40, rejects profanity and "sample"', validateDisplayName('  Jose   Cruz ').value === 'Jose Cruz' && validateDisplayName('x'.repeat(50)).value.length === 40 && !validateDisplayName('Bitch').ok && !validateDisplayName('Sample Maya').ok && !validateDisplayName('  ').ok);

// ---------- profanity ----------
check('detects plain profanity', hasProfanity('this is shit') && hasProfanity('FUCK yeah'));
check('detects leet and stretched', hasProfanity('sh1t') && hasProfanity('fuuuuck') && hasProfanity('$hit') && hasProfanity('a$$hole') === false || hasProfanity('assh0le'));
check('Spanish words', hasProfanity('pinche pendejo') && hasProfanity('mierda'));
check('no Scunthorpe false positives', !hasProfanity('Scunthorpe classic assessment of the cocktail hour, Dickens, shiitake, hello, therapist, assassin, cockpit'));
check('mask keeps first letter', maskProfanity('this is shit!') === 'this is s***!' && maskProfanity('Fuck it') === 'F*** it');
check('mask leaves clean text alone', maskProfanity('Great run today 💪') === 'Great run today 💪');
check('cleanText trims, collapses blank lines, caps length, masks', cleanText('  hi\r\n\n\n\nthere shit  ', 100) === 'hi\n\nthere s***' && [...cleanText('x'.repeat(POST_MAX + 50), POST_MAX)].length === POST_MAX);
check('cleanText caps by code points (emoji safe)', [...cleanText('💪'.repeat(600), COMMENT_MAX)].length === COMMENT_MAX);

// ---------- age gate ----------
const today = new Date(2026, 10, 16);
check('ageFromDob birthday today', ageFromDob('2013-11-16', today) === 13);
check('ageFromDob day before birthday', ageFromDob('2013-11-17', today) === 12);
check('ageFromDob invalid', ageFromDob('2013-13-01', today) === null && ageFromDob('nope', today) === null && ageFromDob('2030-01-01', today) === null);
check('under 13 blocked', ageGate('2014-01-01', undefined, today) === 'under13' && !socialAllowed('under13'));
check('13 allowed as teen', ageGate('2013-11-16', undefined, today) === 'teen' && socialAllowed('teen'));
check('18 is adult', ageGate('2008-11-16', undefined, today) === 'ok');
check('DOB beats onboarding age', ageGate('2015-01-01', 30, today) === 'under13');
check('age fallback when no DOB', ageGate(undefined, 12, today) === 'under13' && ageGate(undefined, 16, today) === 'teen' && ageGate(undefined, undefined, today) === 'unknown');
check('MIN_SOCIAL_AGE is 13', MIN_SOCIAL_AGE === 13);

// ---------- request state machine ----------
let g: Graph = { requests: [], friends: [], blocks: [] };
let n = 0; const id = () => `r${++n}`;
g = applyAction(g, 'a', { type: 'send', to: 'b' }, 1, id);
check('send → outgoing / incoming', relation(g, 'a', 'b') === 'outgoing' && relation(g, 'b', 'a') === 'incoming' && outgoing(g, 'a').length === 1 && incoming(g, 'b').length === 1);
throws('duplicate send rejected', () => applyAction(g, 'a', { type: 'send', to: 'b' }, 2, id), /already sent/);
throws('self request rejected', () => applyAction(g, 'a', { type: 'send', to: 'a' }, 2, id));
const gc = applyAction(g, 'a', { type: 'cancel', to: 'b' }, 3, id);
check('cancel → none', relation(gc, 'a', 'b') === 'none' && gc.requests[0].status === 'cancelled');
throws('cancel twice rejected', () => applyAction(gc, 'a', { type: 'cancel', to: 'b' }, 4, id));
const gd = applyAction(g, 'b', { type: 'decline', from: 'a' }, 3, id);
check('decline → none, no friendship', relation(gd, 'a', 'b') === 'none' && !areFriends(gd, 'a', 'b') && gd.requests[0].status === 'declined');
throws('cannot accept your own request', () => applyAction(g, 'a', { type: 'accept', from: 'b' }, 3, id));
g = applyAction(g, 'b', { type: 'accept', from: 'a' }, 3, id);
check('accept → friends both ways', relation(g, 'a', 'b') === 'friends' && relation(g, 'b', 'a') === 'friends' && friendIds(g, 'a')[0] === 'b');
throws('send to a friend rejected', () => applyAction(g, 'a', { type: 'send', to: 'b' }, 4, id), /already friends/);
let g2 = applyAction({ requests: [], friends: [], blocks: [] }, 'c', { type: 'send', to: 'a' }, 1, id);
g2 = applyAction(g2, 'a', { type: 'send', to: 'c' }, 2, id);
check('sending to someone who asked first = accept', areFriends(g2, 'a', 'c') && incoming(g2, 'a').length === 0);
g = applyAction(g, 'a', { type: 'unfriend', other: 'b' }, 5, id);
check('unfriend', relation(g, 'a', 'b') === 'none' && friendIds(g, 'a').length === 0);
throws('unfriend when not friends', () => applyAction(g, 'a', { type: 'unfriend', other: 'b' }, 6, id));

// ---------- block effects ----------
let gb: Graph = { requests: [], friends: [['a', 'b']], blocks: [] };
gb = applyAction(gb, 'a', { type: 'send', to: 'x' }, 1, id);
gb = applyAction(gb, 'x', { type: 'send', to: 'z' }, 1, id);
gb = applyAction(gb, 'b', { type: 'send', to: 'z' }, 1, id);
gb = applyAction(gb, 'a', { type: 'block', other: 'b' }, 2, id);
check('block removes friendship', !areFriends(gb, 'a', 'b'));
check('block relation both sides', relation(gb, 'a', 'b') === 'blocked' && relation(gb, 'b', 'a') === 'blocked_by' && isBlocked(gb, 'b', 'a'));
throws('blocked person cannot send request', () => applyAction(gb, 'b', { type: 'send', to: 'a' }, 3, id), /can’t add/);
throws('blocker must unblock before sending', () => applyAction(gb, 'a', { type: 'send', to: 'b' }, 3, id), /Unblock/);
let gp: Graph = applyAction({ requests: [], friends: [], blocks: [] }, 'p', { type: 'send', to: 'q' }, 1, id);
gp = applyAction(gp, 'q', { type: 'block', other: 'p' }, 2, id);
check('block cancels pending requests both ways', incoming(gp, 'q').length === 0 && outgoing(gp, 'p').length === 0);
const gu = applyAction(gb, 'a', { type: 'unblock', other: 'b' }, 4, id);
check('unblock does not restore friendship', relation(gu, 'a', 'b') === 'none');
throws('blocked_by cannot unblock', () => applyAction(gb, 'b', { type: 'unblock', other: 'a' }, 4, id));

// ---------- audience filtering ----------
const G: Graph = { requests: [], friends: [['me', 'fr']], blocks: [['me', 'bl'], ['bb', 'me']] };
const profiles: ViewCtx['profiles'] = { me: { privacy: 'public' }, fr: { privacy: 'public' }, st: { privacy: 'public' }, fo: { privacy: 'friends' }, teen: { privacy: 'public', isMinor: true }, bl: { privacy: 'public' }, bb: { privacy: 'public' } };
const V: ViewCtx = { me: 'me', graph: G, profiles, hidden: new Set(['hid']) };
const P = (pid: string, authorId: string, audience: 'friends' | 'public', t: number, reshareOf?: string): Post => ({ id: pid, authorId, audience, createdAt: t, text: '', media: [], likeCount: 0, commentCount: 0, shareCount: 0, reshareOf });
check('own friends-only post visible', canSee(P('1', 'me', 'friends', 1), V));
check('friend friends-only post visible', canSee(P('2', 'fr', 'friends', 1), V));
check('stranger friends-only post hidden', !canSee(P('3', 'st', 'friends', 1), V));
check('stranger public post visible', canSee(P('4', 'st', 'public', 1), V));
check('friends-only profile public post treated as friends', !canSee(P('5', 'fo', 'public', 1), V) && effectiveAudience('public', profiles.fo) === 'friends');
check('minor public post treated as friends', !canSee(P('6', 'teen', 'public', 1), V) && effectiveAudience('public', profiles.teen) === 'friends');
check('blocked (by me) public post hidden', !canSee(P('7', 'bl', 'public', 1), V));
check('blocked (blocked me) public post hidden', !canSee(P('8', 'bb', 'public', 1), V));
const feed = feedFor([P('a', 'st', 'public', 5), P('b', 'fr', 'friends', 9), P('c', 'st', 'friends', 7), P('hid', 'fr', 'public', 8), P('d', 'me', 'friends', 1), P('e', 'fr', 'public', 6, 'c'), P('f', 'fr', 'public', 4, 'a')], V);
check('feed: allowed only, newest first, hidden + reshares of invisible posts dropped', feed.map((p) => p.id).join(',') === 'b,a,f,d', feed.map((p) => p.id));
const cs = [{ authorId: 'fr' }, { authorId: 'bl' }, { authorId: 'bb' }, { authorId: 'me' }];
check('comments from blocked people hidden', visibleComments(cs, V).length === 2);
check('comment delete rights', canDeleteComment({ authorId: 'me' }, { authorId: 'x' }, 'me') && canDeleteComment({ authorId: 'x' }, { authorId: 'me' }, 'me') && !canDeleteComment({ authorId: 'x' }, { authorId: 'y' }, 'me'));

// ---------- stories ----------
const t0 = Date.UTC(2026, 10, 16, 12);
check('story expires after exactly 24 h', storyExpiry(t0) - t0 === STORY_MS && STORY_MS === 86_400_000);
const s1: Story = { id: 's1', authorId: 'fr', audience: 'friends', createdAt: t0, expiresAt: storyExpiry(t0), text: 'x' };
check('active before expiry, gone at expiry', isStoryActive(s1, t0 + STORY_MS - 1) && !isStoryActive(s1, t0 + STORY_MS));
check('time left label', storyTimeLeft(s1, t0 + 3600_000) === '23h left' && storyTimeLeft(s1, t0 + STORY_MS - 120_000) === '2m left' && storyTimeLeft(s1, t0 + STORY_MS) === 'expired');
const stories: Story[] = [s1, { ...s1, id: 's2', createdAt: t0 + 10 }, { ...s1, id: 's3', authorId: 'st', audience: 'friends' }, { ...s1, id: 's4', authorId: 'st', audience: 'public', createdAt: t0 + 5 },
  { ...s1, id: 's5', authorId: 'me', createdAt: t0 - 5 }, { ...s1, id: 'old', authorId: 'fr', createdAt: t0 - STORY_MS - 1, expiresAt: t0 - 1 }, { ...s1, id: 's6', authorId: 'bl', audience: 'public' }];
const gs = storyGroups(stories, V, new Set(['s4']), t0 + 100);
check('story groups: me first, unseen before seen, friends-only of strangers + blocked + expired dropped', gs.map((x) => x.authorId).join(',') === 'me,fr,st' && gs[1].stories.map((x) => x.id).join(',') === 's1,s2' && gs[2].seen, gs.map((x) => [x.authorId, x.stories.map((s) => s.id)]));
check('groupStories drops expired only', groupStories(stories, 'me', new Set(), t0 + 100).length === 4);

// ---------- counts / badges / notifications ----------
check('toggleCount', toggleCount(5, false, true) === 6 && toggleCount(5, true, false) === 4 && toggleCount(5, true, true) === 5 && toggleCount(0, true, false) === 0);
check('compact numbers', compact(999) === '999' && compact(1200) === '1.2K' && compact(15400) === '15K' && compact(2_500_000) === '2.5M' && compact(1000) === '1K');
check('plural', plural(1, 'like') === '1 like' && plural(3, 'like') === '3 likes' && plural(1500, 'friend') === '1.5K friends');
check('badge = requests + unread non-request notifications', badgeCount(2, [{ read: false, type: 'like' }, { read: true, type: 'comment' }, { read: false, type: 'friend_request' }]) === 3);
check('no self notifications, none across blocks', notifyTarget({ type: 'like', actor: 'a', owner: 'a' }, G) === null && notifyTarget({ type: 'like', actor: 'bl', owner: 'me' }, G) === null && notifyTarget({ type: 'comment', actor: 'fr', owner: 'me' }, G) === 'me');
check('notification text', notifText('friend_request') === 'sent you a friend request' && notifText('like') === 'liked your post');
check('notification text: comment like / other reaction', notifText('like', { commentId: 'c1' }) === 'liked your comment' && notifText('like', { commentId: 'c1', reaction: 'love' }) === 'reacted to your comment' && notifText('like', { reaction: 'wow' }) === 'reacted to your post');

// ---------- reactions ----------
const idFn = (() => { let n = 0; return () => 'r' + (++n); })();
let rx: Reaction[] = [];
const go = (user: string, target: 'post' | 'comment', id: string, type: Parameters<typeof applyReaction>[4], now = 1) => {
  const r = applyReaction(rx, user, target, id, type, now, idFn); rx = r.list; return r;
};
let r1 = go('a', 'post', 'p', 'like');
check('reaction: add Like', r1.next === 'like' && rx.length === 1 && summarizeReactions(rx).total === 1 && summarizeReactions(rx).counts.like === 1);
const r2 = go('a', 'post', 'p', 'love');
check('reaction: change Like to Love (still one row)', r2.prev === 'like' && r2.next === 'love' && rx.length === 1 && rx[0].type === 'love');
const r3 = go('a', 'post', 'p', 'love');
check('reaction: picking the same type again removes it', r3.prev === 'love' && r3.next === null && rx.length === 0);
go('a', 'comment', 'c', 'haha'); go('b', 'comment', 'c', 'wow'); go('d', 'comment', 'c', 'wow'); go('e', 'comment', 'c', 'like'); go('f', 'comment', 'c', 'sad');
const sum = summarizeReactions(rx);
check('reaction: counts and top-3 (ties broken by standard order)', sum.total === 5 && sum.counts.wow === 2 && sum.top.join() === 'wow,like,haha', sum);
const migrated = migrateLikesToReactions([{ userId: 'a', postId: 'p9', createdAt: 5 }, { userId: 'b', postId: 'p9', createdAt: 6 }], [{ id: 'x', userId: 'a', targetType: 'post', targetId: 'p9', type: 'love', createdAt: 1 }]);
check('reaction: migrate likes, keep an existing reaction on the same post', migrated.length === 2 && migrated.find((x) => x.userId === 'a')!.type === 'love' && migrated.find((x) => x.userId === 'b')!.type === 'like');
check('reaction set: 7 types, no Care/hug, includes Dislike', REACTION_TYPES.join() === 'like,love,haha,wow,sad,angry,dislike' && REACTION_META.dislike.emoji === '👎' && !Object.values(REACTION_META).some((m) => /care|hug/i.test(m.label)));
const gBlock: Graph = { requests: [], friends: [], blocks: [['me', 'bl']] };
check('reaction: blocked users hidden from the summary, own reaction kept', visibleReactions([{ userId: 'me', type: 'like' } as Reaction, { userId: 'bl', type: 'love' } as Reaction], { me: 'me', graph: gBlock }).map((x) => x.userId).join() === 'me');
check('reaction: cannot react when blocked or the post is hidden', !canReactOn(true, 'me', 'bl', gBlock) && !canReactOn(false, 'me', 'fr', G));


// ---------- rate limits ----------
const now = 10_000_000;
check('under the limit passes', rateCheck(Array.from({ length: 19 }, (_, i) => now - i * 1000), LIMITS.friendRequestHour, now) === null);
const rl = rateCheck(Array.from({ length: 20 }, (_, i) => now - i * 60_000), LIMITS.friendRequestHour, now);
check('20 requests in an hour → blocked with a retry time', !!rl && /20 friend requests an hour/.test(rl.msg) && rl.retryInMs > 0 && rl.retryInMs <= 3600_000, rl);
check('old timestamps fall out of the window', rateCheck(Array.from({ length: 30 }, () => now - 2 * 3600_000), LIMITS.friendRequestHour, now) === null);
check('limits match the SQL triggers', LIMITS.friendRequestHour.max === 20 && LIMITS.friendRequestDay.max === 60 && LIMITS.postDay.max === 30 && LIMITS.storyDay.max === 30 && LIMITS.commentHour.max === 60 && LIMITS.reportDay.max === 30);

// ---------- links / cards / validation ----------
check('invite link', inviteUrl('https://cryp2x1.github.io/hybrd/', 'jose.cruz') === 'https://cryp2x1.github.io/hybrd/invite?u=jose.cruz' && inviteUrl('https://x.io/hybrd', 'a_b') === 'https://x.io/hybrd/invite?u=a_b');
check('post + profile links', postUrl('https://x.io/hybrd/', 'abc') === 'https://x.io/hybrd/social/post?id=abc' && profileUrl('https://x.io/hybrd/', 'j') === 'https://x.io/hybrd/social/profile?u=j');
const wcd = workoutCard({ type: 'run', title: 'Tempo', date: '2026-11-15T07:00:00Z', durationSec: 1500, distanceM: 5000, kcal: 350.4 }, 'Run', 72.6);
check('workout card: pace per km, rounding, score', wcd.paceSecPerKm === 300 && wcd.kcal === 350 && wcd.hybridScore === 73 && wcd.distanceM === 5000);
check('workout card: no pace for strength, no tiny distances', workoutCard({ type: 'strength', title: '', date: 'x', durationSec: 2400, distanceM: 10 }, 'Strength').paceSecPerKm === undefined && workoutCard({ type: 'strength', title: '', date: 'x', durationSec: 2400 }, 'Strength').title === 'Strength');
check('post validation', validatePost({ text: '', photos: 0 }) !== null && validatePost({ text: '', photos: 1 }) === null && validatePost({ text: '', photos: 0, workout: true }) === null && validatePost({ text: 'x', photos: 5 }) !== null);
check('image type/size limits', checkSocialImage({ type: 'image/webp', size: 1000 }) === null && checkSocialImage({ type: 'image/gif', size: 10 }) !== null && checkSocialImage({ type: 'image/jpeg', size: 9 * 1024 * 1024 }) !== null);
check('timeAgo', timeAgo(now - 10_000, now) === 'now' && timeAgo(now - 5 * 60_000, now) === '5m' && timeAgo(now - 3 * 3600_000, now) === '3h' && timeAgo(now - 2 * 86_400_000, now) === '2d');
check('friendly errors', /handle is taken/.test(friendlyError(new Error('username_taken'))) && /13 and up/.test(friendlyError(new Error('under_13: x'))) && /limit is 30 posts per day/.test(friendlyError(new Error('rate_limit: max 30 posts per day'))) && /don’t have access/.test(friendlyError(new Error('new row violates row-level security policy'))));

// ---------- demo backend end to end ----------
const seed = seedDemo(t0);
check('every demo person is a labelled sample with a sample.* handle', Object.values(seed.profiles).every((p) => p.sample === true && p.username.startsWith('sample.')));
check('demo avatars/images are drawings (art:), never real photos', Object.values(seed.profiles).every((p) => !p.avatarUrl || p.avatarUrl.startsWith('art:')) && seed.posts.every((p) => p.media.every((m) => m.url.startsWith('art:'))));
let saved: DemoState | undefined;
let clock = t0;
const demo = new DemoBackend({ load: async () => saved, save: async (s) => { saved = structuredClone(s); }, blobUrl: () => 'blob:test', now: () => clock });
(async () => {
  check('demo: no profile until setup', (await demo.me()) === null);
  let err = '';
  try { await demo.createPost({ text: 'hi', images: [], audience: 'friends' }); } catch (e) { err = (e as Error).message; }
  check('demo: posting needs a profile', /public profile/.test(err));
  try { await demo.saveProfile({ username: 'kid', displayName: 'Kid', dob: '2016-01-01', privacy: 'public', showStats: false, useAvatar: false }); err = ''; } catch (e) { err = (e as Error).message; }
  check('demo: under-13 refused', /13 and up/.test(err));
  try { await demo.saveProfile({ username: 'sample.maya', displayName: 'X', dob: '1990-01-01', privacy: 'public', showStats: false, useAvatar: false }); err = ''; } catch (e) { err = (e as Error).message; }
  check('demo: sample handles not claimable', /reserved/.test(err));
  const me = await demo.saveProfile({ username: 'Jose.Cruz', displayName: 'José Cruz', dob: '1990-05-05', privacy: 'public', showStats: true, stats: { workouts30d: 12 }, useAvatar: false, publicBio: 'Hybrid athlete. shit happens' });
  check('demo: profile created, handle normalised, bio filtered', me.username === 'jose.cruz' && me.publicBio === 'Hybrid athlete. s*** happens' && me.stats?.workouts30d === 12);
  const gv = await demo.graph();
  check('demo: seeded friends + 2 incoming requests', gv.friends.length === 3 && gv.incoming.length === 2 && gv.incoming.every((r) => r.user.sample));
  const f0 = await demo.feed();
  check('demo: feed hides friends-only post of a non-friend (Kai)', !f0.some((p) => p.authorId === 's8') && f0.some((p) => p.authorId === 's6'));
  check('demo: feed includes reshare with original attached', f0.some((p) => p.reshareOf === 'p5' && p.original?.id === 'p5'));
  const p1before = await demo.post('p1');
  const p1count = p1before!.likeCount;
  check('demo: seed post has mixed reactions and a top-3 summary', p1count >= 3 && p1before!.reactionSummary.top.length >= 2 && p1before!.myReaction === null);
  await demo.setLike('p1', true);
  const p1 = await demo.post('p1');
  check('demo: like increments count and marks liked', p1!.liked && p1!.myReaction === 'like' && p1!.likeCount === p1count + 1);
  await demo.setReaction('post', 'p1', 'love');
  check('demo: change Like to Love keeps the count', (await demo.post('p1'))!.myReaction === 'love' && (await demo.post('p1'))!.likeCount === p1count + 1 && !(await demo.post('p1'))!.liked);
  await demo.setReaction('post', 'p1', 'love');
  check('demo: picking Love again removes it', (await demo.post('p1'))!.myReaction === null && (await demo.post('p1'))!.likeCount === p1count);
  await demo.setLike('p1', true);
  await demo.setLike('p1', false);
  check('demo: unlike decrements', (await demo.post('p1'))!.likeCount === p1count);
  const c0 = await demo.comments('p1');
  const c1 = c0.find((x) => x.id === 'c1')!;
  const c1n = c1.reactionSummary.total;
  await demo.setReaction('comment', 'c1', 'dislike');
  const c1b = (await demo.comments('p1')).find((x) => x.id === 'c1')!;
  check('demo: comment reaction toggles, counts and appears in the list', c1b.myReaction === 'dislike' && c1b.reactionSummary.total === c1n + 1 && (await demo.listReactions('comment', 'c1')).some((x) => x.user.id === DEMO_ME && x.type === 'dislike'));
  await demo.setReaction('comment', 'c1', null);
  check('demo: comment reaction removed', (await demo.comments('p1')).find((x) => x.id === 'c1')!.myReaction === null);
  await demo.setSave('p2', true);
  check('demo: saved tab', (await demo.saved()).map((p) => p.id).join() === 'p2');
  await demo.addComment('p1', 'Great run, sh!t!');
  const c = await demo.comments('p1');
  check('demo: comment added + count + profanity masked', c.length === 4 && c[3].authorId === DEMO_ME && c[3].text === 'Great run, s***!' && (await demo.post('p1'))!.commentCount === 4);
  try { await demo.deleteComment('c1'); err = ''; } catch (e) { err = (e as Error).message; }
  check('demo: cannot delete someone else’s comment on someone else’s post', /only delete/.test(err));
  await demo.deleteComment(c[3].id);
  check('demo: delete own comment', (await demo.comments('p1')).length === 3);
  clock += 1000;
  const pid = await demo.createPost({ text: 'First HYBRD post', images: [], workout: wcd, audience: 'public' });
  const mine = await demo.post(pid);
  check('demo: own post with workout card, public audience kept', !!mine && mine.mine && mine.workout?.paceSecPerKm === 300 && mine.audience === 'public');
  check('demo: sample friends react → notifications', (await demo.notifications()).filter((x) => x.postId === pid).length === 3 && mine!.likeCount === 2 && mine!.commentCount === 1);
  await demo.deleteComment((await demo.comments(pid))[0].id);
  check('demo: post owner can delete a comment on their post', (await demo.comments(pid)).length === 0);
  await demo.editPost(pid, 'Edited post', 'friends');
  check('demo: edit own post', (await demo.post(pid))!.text === 'Edited post' && !!(await demo.post(pid))!.editedAt);
  const rid = await demo.createPost({ text: '', images: [], audience: 'friends', reshareOf: 'p1' });
  check('demo: reshare counts + links original', (await demo.post('p1'))!.shareCount === 2 && (await demo.post(rid))!.original?.id === 'p1');
  await demo.act({ type: 'accept', from: 's4' });
  check('demo: accept request → friend, request notification gone', (await demo.graph()).friends.some((p) => p.id === 's4') && !(await demo.notifications()).some((x) => x.type === 'friend_request' && x.actorId === 's4'));
  await demo.act({ type: 'decline', from: 's5' });
  check('demo: decline', (await demo.graph()).incoming.length === 0);
  check('demo: Kai (friends-only, not a friend) relation none → send request', (await demo.act({ type: 'send', to: 's8' })) === 'sent' && (await demo.relationTo('s8')) === 'outgoing');
  await demo.act({ type: 'cancel', to: 's8' });
  check('demo: cancel request', (await demo.relationTo('s8')) === 'none');
  const p2beforeBlock = await demo.post('p2');
  await demo.act({ type: 'block', other: 's1' });
  const gv2 = await demo.graph();
  check('demo: block removes friend and hides everywhere', !gv2.friends.some((p) => p.id === 's1') && gv2.blocked[0].id === 's1'
    && !(await demo.feed()).some((p) => p.authorId === 's1') && (await demo.post('p1')) === null && !(await demo.stories()).some((s) => s.authorId === 's1')
    && (await demo.search('maya')).length === 0 && (await demo.profileByHandle('sample.maya')) === null && !(await demo.comments('p2')).some((x) => x.authorId === 's1'));
  check('demo: blocked person\'s reactions hidden from counts and lists', (await demo.post('p2'))!.likeCount === p2beforeBlock!.likeCount - 1
    && !(await demo.listReactions('post', 'p2')).some((x) => x.user.id === 's1'));
  let reactErr = '';
  try { await demo.setReaction('comment', 'c4', 'like'); } catch (e) { reactErr = (e as Error).message; }
  // c4 is Maya (s1) on p2; p2 is still visible (Leo) but the comment author is blocked, so the comment is hidden and reacting should fail
  check('demo: cannot react to a blocked person\'s comment', /can’t react|no longer available/.test(reactErr), reactErr);
  await demo.act({ type: 'unblock', other: 's1' });
  check('demo: unblock → visible again but not friends', (await demo.relationTo('s1')) === 'none' && (await demo.profileByHandle('sample.maya')) !== null);
  await demo.hidePost('p3');
  check('demo: hide post', !(await demo.feed()).some((p) => p.id === 'p3'));
  await demo.createStory({ text: 'Leg day', bg: '#FFE600', audience: 'friends' });
  const myStory = (await demo.stories()).find((s) => s.authorId === DEMO_ME);
  check('demo: story created with 24 h expiry', !!myStory && myStory.expiresAt - myStory.createdAt === STORY_MS);
  clock += STORY_MS + 1;
  check('demo: story gone after 24 h', !(await demo.stories()).some((s) => s.authorId === DEMO_ME));
  check('demo: sample stories refresh after reload when all expired', await (async () => { const d2 = new DemoBackend({ load: async () => saved, save: async () => {}, blobUrl: () => '', now: () => clock }); return (await d2.stories()).length > 0; })());
  await demo.report({ targetType: 'post', targetId: 'p3', reason: 'spam', details: 'test' });
  check('demo: report stored', saved!.reports.length === 1 && saved!.reports[0].reason === 'spam');
  let rateErr = '';
  try { for (let i = 0; i < 40; i++) await demo.createPost({ text: 'spam ' + i, images: [], audience: 'friends' }); } catch (e) { rateErr = (e as Error).message; }
  check('demo: post rate limit', /limit is 30 posts a day/.test(rateErr), rateErr);
  await demo.deletePost(pid);
  check('demo: delete own post removes it and its reshares’ comments', (await demo.post(pid)) === null);
  check('demo: persists via injected store', !!saved && saved.profiles[DEMO_ME].username === 'jose.cruz');
  const v1 = { ...structuredClone(saved!), v: 1 as const, myLikes: ['p3'], reactions: [] as DemoState['reactions'] };
  const v2 = migrateDemoState(v1);
  check('demo: v1 likes migrate to Like reactions', v2.v === 2 && v2.reactions.some((r) => r.userId === DEMO_ME && r.targetType === 'post' && r.targetId === 'p3' && r.type === 'like') && !v2.myLikes);

  // ---------- schema + wiring ----------
  const sql = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
  const tables = ['social_profiles', 'social_private', 'social_bans', 'friend_requests', 'friendships', 'blocks', 'posts', 'post_media', 'stories', 'likes', 'reactions', 'comments', 'saves', 'hidden_posts', 'reports', 'notifications'];
  check('schema: every social table created idempotently with RLS', tables.every((t) => sql.includes(`create table if not exists public.${t} (`) && sql.includes(`alter table public.${t}`) && new RegExp(`alter table public\\.${t}\\s+enable row level security`).test(sql)), tables.filter((t) => !new RegExp(`alter table public\\.${t}\\s+enable row level security`).test(sql)));
  check('schema: social-media bucket private, 8 MB, images only', /'social-media', 'social-media', false, 8388608, array\['image\/jpeg', 'image\/png', 'image\/webp'\]/.test(sql));
  check('schema: RPCs + triggers present', ['social_create_profile', 'social_send_request', 'social_respond_request', 'social_block', 'social_unblock', 'social_unfriend', 'social_cancel_request', 'social_my_blocks', 'likes_after', 'reactions_after', 'comments_after', 'friendships_after', 'posts_before_insert', 'stories_before_insert', 'reports_before_insert'].every((f) => sql.includes(`function public.${f}(`)));
  check('schema: under-13 + rate limits server-side', sql.includes("interval '13 years'") && sql.includes("20, 'friend requests per hour'") && sql.includes("30, 'posts per day'") && sql.includes("60, 'comments per hour'") && sql.includes("120, 'reactions per hour'"));
  check('schema: anon gets nothing', /revoke all on public\.social_profiles[\s\S]*from anon;/.test(sql));
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const pb = readFileSync(new URL('./postbuild.mjs', import.meta.url), 'utf8');
  check('routes wired + static copies for GitHub Pages', ['/social', '/social/new', '/social/post', '/social/friends', '/social/notifications', '/social/saved', '/social/profile', '/social/setup', '/social/rules', '/invite'].every((r) => app.includes(`path="${r}"`) && pb.includes(`'${r.slice(1)}'`)));
  const social = Object.keys(FEATURES).filter((k) => k.startsWith('social.'));
  check('entitlements: social features all free', social.length === 9 && social.every((k) => FEATURES[k as keyof typeof FEATURES].free && can(k as keyof typeof FEATURES)));

  console.log(failed ? `\n${failed} FAILED` : '\nALL SOCIAL TESTS PASSED');
  process.exit(failed ? 1 : 0);
})();
