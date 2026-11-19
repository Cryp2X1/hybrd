// Friends & Stories DEMO backend: everything runs on this device with clearly-labelled SAMPLE people (handles "sample.*",
// a SAMPLE badge on every one of them, drawn avatars/illustrations, no real photos). Nothing is sent anywhere.
// Uses the same pure rules as the server (src/lib/social.ts), so the demo behaves like the real thing.
// Persistence and blob URLs are injected so tools/test-social.ts can run this in Node.
import {
  applyAction, applyReaction, canDeleteComment, canReactOn, canSee, cleanText, effectiveAudience, feedFor, friendIds, incoming, isBlocked, isStoryActive, LIMITS,
  migrateLikesToReactions, normalizeHandle, notifyTarget, outgoing, rateCheck, relation, SocialError, storyExpiry, summarizeReactions, validateDisplayName, validateHandle,
  visibleComments, visibleReactions, ageGate, socialAllowed, COMMENT_MAX, POST_MAX, PUBLIC_BIO_MAX, STORY_TEXT_MAX, REPORT_DETAILS_MAX,
  type Comment, type Graph, type GraphAction, type Notif, type Post, type PublicProfile, type Reaction, type ReactionTarget, type ReactionType, type Story, type ViewCtx, type WorkoutCard,
} from './social';
import type { CommentView, GraphView, NewPost, NewReport, NewStory, NotifView, PostView, ProfileInput, ReactorView, SocialBackend, StoryView } from './socialApi';
import { artUrl } from './socialArt';

export const DEMO_ME = 'me';
type Media = { url: string; w: number; h: number };
export interface DemoState {
  v: 1 | 2;
  profiles: Record<string, PublicProfile>;
  graph: Graph;
  posts: Post[];
  stories: Story[];
  comments: Comment[];
  /** @deprecated v1 only; migrated to reactions on load */
  myLikes?: string[];
  reactions: Reaction[];
  saves: string[];
  hidden: string[];
  notifs: Notif[];
  reports: (NewReport & { id: string; createdAt: number })[];
  times: Record<'req' | 'post' | 'story' | 'comment' | 'report' | 'react', number[]>;
  blobs: Record<string, Blob>;
  dob?: string;
  seededAt: number;
}
export interface DemoDeps { load(): Promise<DemoState | undefined>; save(s: DemoState): Promise<void>; blobUrl(b: Blob): string; now?: () => number }

const H = 3600_000;
const sp = (id: string, username: string, displayName: string, hue: number, extra: Partial<PublicProfile> = {}): PublicProfile => ({
  id, username, displayName, avatarUrl: `art:av:${displayName.split(' ').map((w) => w[0]).join('').slice(0, 2)}:${hue}`,
  privacy: 'public', showStats: false, friendCount: 0, postCount: 0, sample: true, ...extra,
});
const wc = (w: Partial<WorkoutCard> & Pick<WorkoutCard, 'type' | 'label' | 'title' | 'durationSec'>, ago: number, now: number): WorkoutCard => ({ date: new Date(now - ago).toISOString(), ...w });

/** Fresh demo world, timestamps relative to `now`. */
export function seedDemo(now: number): DemoState {
  const P: PublicProfile[] = [
    sp('s1', 'sample.maya', 'Maya R.', 12, { publicBio: 'Trail runner. Training for a spring 50K.', showStats: true, stats: { workouts30d: 18, streak: 6, hybridScore: 71 } }),
    sp('s2', 'sample.leo', 'Leo K.', 200, { publicBio: 'HYROX doubles. Wall balls are my nemesis.', showStats: true, stats: { workouts30d: 22, streak: 4, hybridScore: 78 } }),
    sp('s3', 'sample.ana', 'Ana P.', 300, { publicBio: 'Indoor bike + calisthenics.' }),
    sp('s4', 'sample.priya', 'Priya N.', 150, { publicBio: 'New to running. Couch to 5K!' }),
    sp('s5', 'sample.sam', 'Sam T.', 40, { publicBio: 'Lifting and long walks.' }),
    sp('s6', 'sample.jordan', 'Jordan B.', 260, { publicBio: 'Hybrid athlete. Public training log.' }),
    sp('s7', 'sample.rivera', 'Coach Rivera', 90, { publicBio: 'Strength coach. Form tips every week.' }),
    sp('s8', 'sample.kai', 'Kai W.', 330, { privacy: 'friends', publicBio: 'Friends-only profile.' }),
  ];
  const profiles: Record<string, PublicProfile> = Object.fromEntries(P.map((p) => [p.id, p]));
  const graph: Graph = {
    friends: [[DEMO_ME, 's1'], [DEMO_ME, 's2'], [DEMO_ME, 's3'], ['s1', 's2'], ['s2', 's3']].map(([a, b]) => (a < b ? [a, b] : [b, a]) as [string, string]),
    requests: [
      { id: 'r1', from: 's4', to: DEMO_ME, status: 'pending', createdAt: now - 3 * H },
      { id: 'r2', from: 's5', to: DEMO_ME, status: 'pending', createdAt: now - 26 * H },
    ],
    blocks: [],
  };
  const post = (id: string, authorId: string, ago: number, text: string, extra: Partial<Post> = {}): Post => ({
    id, authorId, text, media: [], audience: 'friends', createdAt: now - ago, likeCount: 0, commentCount: 0, shareCount: 0, ...extra,
  });
  const posts: Post[] = [
    post('p1', 's1', 2 * H, 'Sunday long run in the hills. Legs are cooked but the views were worth it. 🏔️', {
      audience: 'public', media: [{ url: 'art:trail', w: 800, h: 1000 }], likeCount: 14, shareCount: 1,
      workout: wc({ type: 'run', label: 'Run', title: 'Long run · hills', durationSec: 6760, distanceM: 18200, paceSecPerKm: 371, kcal: 1240, hybridScore: 71 }, 2 * H, now),
    }),
    post('p2', 's2', 5 * H, 'Full HYROX sim today. 8 stations, 8 km. Wall balls are still my weak spot, so that’s the focus this block.', {
      likeCount: 9, workout: wc({ type: 'hyrox', label: 'HYROX', title: 'HYROX simulation', durationSec: 4325, distanceM: 8000, paceSecPerKm: 541, hybridScore: 78 }, 5 * H, now),
    }),
    post('p3', 's6', 8 * H, '5 things that made my training consistent this year:\n1. Same start time every day\n2. Easy days actually easy\n3. Sleep before extra sessions\n4. Log everything\n5. Train with friends', { audience: 'public', likeCount: 31 }),
    post('p4', 's3', 20 * H, '45 minutes on the indoor bike. Kept it steady at about 210 W.', {
      media: [{ url: 'art:bike', w: 800, h: 1000 }], likeCount: 6,
      workout: wc({ type: 'indoor-cycle', label: 'Indoor bike', title: 'Steady ride', durationSec: 2700, kcal: 540 }, 20 * H, now),
    }),
    post('p5', 's7', 28 * H, 'Form check: on kettlebell swings, the power comes from the hips, not the arms. Hinge, snap, float.', { audience: 'public', media: [{ url: 'art:kettlebell', w: 800, h: 1000 }], likeCount: 22, shareCount: 1 }),
    post('p6', 's1', 30 * H, 'Saving this for my next gym day 👇', { reshareOf: 'p5', audience: 'public', likeCount: 3 }),
    post('p7', 's8', 6 * H, 'Friends-only post. You won’t see this unless you’re friends with Kai.', { likeCount: 2 }),
    post('p8', 's2', 50 * H, 'Track Tuesday: 8 × 400 m with 90 s rest.', { media: [{ url: 'art:track', w: 800, h: 1000 }], likeCount: 11 }),
  ];
  const comments: Comment[] = [
    { id: 'c1', postId: 'p1', authorId: 's2', text: 'Those hills! 🔥', createdAt: now - 1.5 * H },
    { id: 'c2', postId: 'p1', authorId: 's3', text: 'What did you eat during it?', createdAt: now - 1.2 * H },
    { id: 'c3', postId: 'p1', authorId: 's1', text: 'Two gels and a banana. Practising race fuel!', createdAt: now - 1 * H },
    { id: 'c4', postId: 'p2', authorId: 's1', text: 'Wall balls get everyone. You’ve got this.', createdAt: now - 4 * H },
    { id: 'c5', postId: 'p5', authorId: 's6', text: 'Great cue.', createdAt: now - 20 * H },
  ];
  for (const p of posts) p.commentCount = comments.filter((c) => c.postId === p.id).length;
  const rx = (id: string, userId: string, targetType: Reaction['targetType'], targetId: string, type: ReactionType, ago: number): Reaction => ({ id, userId, targetType, targetId, type, createdAt: now - ago });
  const reactions: Reaction[] = [
    rx('rp1a', 's2', 'post', 'p1', 'like', 1.8 * H), rx('rp1b', 's3', 'post', 'p1', 'love', 1.6 * H), rx('rp1c', 's6', 'post', 'p1', 'haha', 1.4 * H),
    rx('rp1d', 's7', 'post', 'p1', 'wow', 1.3 * H), rx('rp1e', 's5', 'post', 'p1', 'like', 1.1 * H), rx('rp1f', 's4', 'post', 'p1', 'love', 0.9 * H),
    rx('rp2a', 's1', 'post', 'p2', 'love', 4.5 * H), rx('rp2b', 's3', 'post', 'p2', 'like', 4.2 * H), rx('rp2c', 's6', 'post', 'p2', 'wow', 3.8 * H),
    rx('rp3a', 's1', 'post', 'p3', 'like', 7 * H), rx('rp3b', 's2', 'post', 'p3', 'like', 6.5 * H), rx('rp3c', 's7', 'post', 'p3', 'love', 6 * H),
    rx('rp3d', 's6', 'post', 'p3', 'haha', 5.5 * H), rx('rp3e', 's3', 'post', 'p3', 'wow', 5 * H), rx('rp3f', 's5', 'post', 'p3', 'like', 4.5 * H),
    rx('rp4a', 's1', 'post', 'p4', 'like', 18 * H), rx('rp4b', 's2', 'post', 'p4', 'haha', 16 * H),
    rx('rp5a', 's1', 'post', 'p5', 'like', 24 * H), rx('rp5b', 's2', 'post', 'p5', 'love', 22 * H), rx('rp5c', 's6', 'post', 'p5', 'like', 21 * H),
    rx('rp5d', 's3', 'post', 'p5', 'wow', 20 * H), rx('rp5e', 's4', 'post', 'p5', 'like', 19 * H),
    rx('rp6a', 's2', 'post', 'p6', 'like', 28 * H), rx('rp6b', 's3', 'post', 'p6', 'like', 27 * H),
    rx('rp8a', 's1', 'post', 'p8', 'like', 48 * H), rx('rp8b', 's3', 'post', 'p8', 'love', 46 * H), rx('rp8c', 's6', 'post', 'p8', 'like', 44 * H),
    rx('rc1a', 's1', 'comment', 'c1', 'love', 1.4 * H), rx('rc1b', 's3', 'comment', 'c1', 'haha', 1.3 * H), rx('rc1c', 's6', 'comment', 'c1', 'like', 1.1 * H),
    rx('rc2a', 's1', 'comment', 'c2', 'like', 1.0 * H), rx('rc2b', 's2', 'comment', 'c2', 'wow', 0.9 * H),
    rx('rc3a', 's2', 'comment', 'c3', 'like', 0.8 * H), rx('rc3b', 's3', 'comment', 'c3', 'like', 0.7 * H),
    rx('rc4a', 's2', 'comment', 'c4', 'love', 3.5 * H),
    rx('rc5a', 's7', 'comment', 'c5', 'like', 18 * H), rx('rc5b', 's1', 'comment', 'c5', 'haha', 16 * H),
  ];
  const stories: Story[] = [
    { id: 'st1', authorId: 's1', text: '5:30 AM club', media: { url: 'art:sunrise', w: 800, h: 1000 }, audience: 'friends', createdAt: now - 1 * H, expiresAt: storyExpiry(now - 1 * H) },
    { id: 'st2', authorId: 's2', text: 'HYROX in 6 weeks. No days off from the plan.', bg: '#FFE600', audience: 'friends', createdAt: now - 3 * H, expiresAt: storyExpiry(now - 3 * H) },
    { id: 'st3', authorId: 's3', media: { url: 'art:bike', w: 800, h: 1000 }, text: 'Ride done ✅', audience: 'friends', createdAt: now - 7 * H, expiresAt: storyExpiry(now - 7 * H) },
    { id: 'st4', authorId: 's6', text: 'Rest day = growth day', bg: '#4f7cff', audience: 'public', createdAt: now - 10 * H, expiresAt: storyExpiry(now - 10 * H) },
    { id: 'st5', authorId: 's7', media: { url: 'art:sled', w: 800, h: 1000 }, text: 'Sled push technique: low hips, short steps', audience: 'public', createdAt: now - 12 * H, expiresAt: storyExpiry(now - 12 * H) },
  ];
  const notifs: Notif[] = [
    { id: 'n1', userId: DEMO_ME, actorId: 's4', type: 'friend_request', createdAt: now - 3 * H, read: false },
    { id: 'n2', userId: DEMO_ME, actorId: 's5', type: 'friend_request', createdAt: now - 26 * H, read: false },
    { id: 'n3', userId: DEMO_ME, actorId: 's3', type: 'friend_accept', createdAt: now - 72 * H, read: true },
  ];
  const s: DemoState = { v: 2, profiles, graph, posts, stories, comments, reactions, saves: [], hidden: [], notifs, reports: [], times: { req: [], post: [], story: [], comment: [], report: [], react: [] }, blobs: {}, seededAt: now };
  recount(s);
  return s;
}
function recount(s: DemoState) {
  for (const p of Object.values(s.profiles)) {
    p.friendCount = friendIds(s.graph, p.id).length;
    p.postCount = s.posts.filter((x) => x.authorId === p.id).length;
  }
  for (const p of s.posts) p.likeCount = s.reactions.filter((r) => r.targetType === 'post' && r.targetId === p.id).length;
}

/** Upgrade a persisted v1 demo (plain likes) to v2 reactions. Safe to run on v2. */
export function migrateDemoState(s: DemoState): DemoState {
  const likes = (s.myLikes || []).map((postId) => ({ userId: DEMO_ME, postId, createdAt: s.seededAt }));
  s.reactions = migrateLikesToReactions(likes, s.reactions || []);
  s.times = { req: s.times?.req || [], post: s.times?.post || [], story: s.times?.story || [], comment: s.times?.comment || [], report: s.times?.report || [], react: s.times?.react || [] };
  s.v = 2;
  delete s.myLikes;
  recount(s);
  return s;
}

export class DemoBackend implements SocialBackend {
  readonly kind = 'demo' as const;
  readonly myId = DEMO_ME;
  private s?: DemoState;
  private urls = new Map<string, string>();
  private deps: DemoDeps;
  constructor(deps: DemoDeps) { this.deps = deps; }
  private now() { return this.deps.now ? this.deps.now() : Date.now(); }
  private async st(): Promise<DemoState> {
    if (!this.s) {
      const loaded = await this.deps.load();
      this.s = loaded && (loaded.v === 1 || loaded.v === 2) ? migrateDemoState(loaded) : seedDemo(this.now());
      // keep the sample stories alive: if they've all expired, refresh their timestamps
      const samples = this.s.stories.filter((x) => x.authorId !== DEMO_ME);
      if (samples.length && samples.every((x) => !isStoryActive(x, this.now()))) {
        const fresh = seedDemo(this.now()).stories;
        this.s.stories = [...this.s.stories.filter((x) => x.authorId === DEMO_ME), ...fresh];
      }
    }
    return this.s;
  }
  private async commit() { if (this.s) { recount(this.s); await this.deps.save(this.s); } }
  private ctx(s: DemoState): ViewCtx { return { me: DEMO_ME, graph: s.graph, profiles: s.profiles, hidden: new Set(s.hidden) }; }
  private url(u: string): string {
    if (u.startsWith('art:')) return artUrl(u.slice(4));
    if (u.startsWith('idb:')) {
      const hit = this.urls.get(u); if (hit) return hit;
      const b = this.s?.blobs[u.slice(4)]; if (!b) return '';
      const x = this.deps.blobUrl(b); this.urls.set(u, x); return x;
    }
    return u;
  }
  private prof(s: DemoState, id: string): PublicProfile {
    const p = s.profiles[id] || { id, username: 'unknown', displayName: 'Unknown', privacy: 'friends', showStats: false, friendCount: 0, postCount: 0 };
    return { ...p, avatarUrl: p.avatarUrl ? this.url(p.avatarUrl) : undefined, stats: p.showStats ? p.stats : undefined };
  }
  private view(s: DemoState, p: Post, depth = 0): PostView {
    const orig = p.reshareOf ? s.posts.find((x) => x.id === p.reshareOf) : undefined;
    const mine = s.reactions.find((r) => r.userId === DEMO_ME && r.targetType === 'post' && r.targetId === p.id);
    const summary = summarizeReactions(visibleReactions(s.reactions.filter((r) => r.targetType === 'post' && r.targetId === p.id), this.ctx(s)));
    return {
      ...p, media: p.media.map((m) => ({ ...m, url: this.url(m.url) })), author: this.prof(s, p.authorId),
      likeCount: summary.total, liked: mine?.type === 'like', myReaction: mine?.type ?? null, reactionSummary: summary,
      saved: s.saves.includes(p.id), mine: p.authorId === DEMO_ME,
      original: p.reshareOf ? (orig && depth === 0 && canSee(orig, this.ctx(s)) ? this.view(s, orig, 1) : null) : undefined,
    };
  }
  private requireMe(s: DemoState) { if (!s.profiles[DEMO_ME]) throw new SocialError('Set up your public profile first.'); }
  private limit(s: DemoState, k: keyof DemoState['times'], lim: { max: number; windowMs: number; label: string }) {
    const r = rateCheck(s.times[k], lim, this.now()); if (r) throw new SocialError(r.msg);
    s.times[k] = [...s.times[k].filter((t) => t > this.now() - 86_400_000), this.now()];
  }
  private visibleProfile(s: DemoState, id: string) { return !!s.profiles[id] && !isBlocked(s.graph, DEMO_ME, id); }

  async me() { const s = await this.st(); return s.profiles[DEMO_ME] ? this.prof(s, DEMO_ME) : null; }
  async saveProfile(p: ProfileInput) {
    const s = await this.st();
    const g = ageGate(s.dob || p.dob);
    if (!socialAllowed(g)) throw new SocialError(g === 'unknown' ? 'Add your date of birth.' : 'Friends & Stories is for ages 13 and up.');
    const h = validateHandle(p.username); if (!h.ok) throw new SocialError(h.error);
    if (Object.values(s.profiles).some((x) => x.id !== DEMO_ME && x.username === h.handle)) throw new SocialError('That handle is taken. Try another.');
    const n = validateDisplayName(p.displayName); if (!n.ok) throw new SocialError(n.error);
    s.dob ||= p.dob;
    const minor = ageGate(s.dob) === 'teen';
    let avatarUrl = s.profiles[DEMO_ME]?.avatarUrl;
    if (p.useAvatar && p.avatar) { s.blobs.avatar = p.avatar; this.urls.delete('idb:avatar'); avatarUrl = 'idb:avatar'; }
    if (!p.useAvatar) avatarUrl = undefined;
    s.profiles[DEMO_ME] = {
      id: DEMO_ME, username: h.handle, displayName: n.value, avatarUrl, publicBio: cleanText(p.publicBio || '', PUBLIC_BIO_MAX) || undefined,
      privacy: minor ? 'friends' : p.privacy, showStats: p.showStats, stats: p.showStats ? p.stats : undefined, isMinor: minor,
      friendCount: 0, postCount: 0,
    };
    await this.commit();
    return this.prof(s, DEMO_ME);
  }
  async deleteProfile() { this.s = seedDemo(this.now()); this.urls.clear(); await this.commit(); }
  async handleAvailable(h: string) { const s = await this.st(); const n = normalizeHandle(h); return !Object.values(s.profiles).some((x) => x.id !== DEMO_ME && x.username === n); }
  async search(q: string) {
    const s = await this.st(); const n = normalizeHandle(q);
    if (!n) return [];
    return Object.values(s.profiles).filter((p) => p.id !== DEMO_ME && this.visibleProfile(s, p.id) && (p.username.includes(n) || p.displayName.toLowerCase().includes(n))).slice(0, 20).map((p) => this.prof(s, p.id));
  }
  async suggestions() {
    const s = await this.st();
    return Object.values(s.profiles).filter((p) => p.id !== DEMO_ME && this.visibleProfile(s, p.id) && relation(s.graph, DEMO_ME, p.id) === 'none').map((p) => this.prof(s, p.id));
  }
  async profileByHandle(h: string) {
    const s = await this.st(); const n = normalizeHandle(h);
    const p = Object.values(s.profiles).find((x) => x.username === n);
    return p && (p.id === DEMO_ME || this.visibleProfile(s, p.id)) ? this.prof(s, p.id) : null;
  }
  async relationTo(id: string) { const s = await this.st(); return relation(s.graph, DEMO_ME, id); }
  async graph(): Promise<GraphView> {
    const s = await this.st();
    return {
      friends: friendIds(s.graph, DEMO_ME).map((id) => this.prof(s, id)).sort((a, b) => a.displayName.localeCompare(b.displayName)),
      incoming: incoming(s.graph, DEMO_ME).map((r) => ({ id: r.id, user: this.prof(s, r.from), createdAt: r.createdAt, direction: 'in' as const })).sort((a, b) => b.createdAt - a.createdAt),
      outgoing: outgoing(s.graph, DEMO_ME).map((r) => ({ id: r.id, user: this.prof(s, r.to), createdAt: r.createdAt, direction: 'out' as const })),
      blocked: s.graph.blocks.filter(([a]) => a === DEMO_ME).map(([, b]) => this.prof(s, b)),
    };
  }
  async act(a: GraphAction) {
    const s = await this.st(); this.requireMe(s);
    const before = relation(s.graph, DEMO_ME, 'to' in a ? a.to : 'from' in a ? a.from : a.other);
    if (a.type === 'send' && before === 'none') this.limit(s, 'req', LIMITS.friendRequestHour);
    s.graph = applyAction(s.graph, DEMO_ME, a, this.now(), () => 'r' + this.now().toString(36) + Math.random().toString(36).slice(2, 6));
    if (a.type === 'accept' || (a.type === 'send' && before === 'incoming') || a.type === 'decline') {
      const other = 'from' in a ? a.from : a.to;
      s.notifs = s.notifs.map((n) => (n.type === 'friend_request' && n.actorId === other ? { ...n, read: true } : n)).filter((n) => !(n.type === 'friend_request' && n.actorId === other));
    }
    if (a.type === 'block') { s.notifs = s.notifs.filter((n) => n.actorId !== a.other); }
    await this.commit();
    return a.type === 'send' ? (before === 'incoming' ? 'accepted' : 'sent') : 'ok';
  }
  async feed() { const s = await this.st(); return feedFor(s.posts, this.ctx(s)).filter((p) => !p.reshareOf || this.view(s, p).original).map((p) => this.view(s, p)); }
  async userPosts(id: string) { const s = await this.st(); return feedFor(s.posts.filter((p) => p.authorId === id), this.ctx(s)).map((p) => this.view(s, p)); }
  async post(id: string) { const s = await this.st(); const p = s.posts.find((x) => x.id === id); return p && canSee(p, this.ctx(s)) && !isBlocked(s.graph, DEMO_ME, p.authorId) ? this.view(s, p) : null; }
  async createPost(np: NewPost) {
    const s = await this.st(); this.requireMe(s);
    const text = cleanText(np.text, POST_MAX);
    if (!text && !np.images.length && !np.workout && !np.reshareOf) throw new SocialError('Add a photo, some text or a workout.');
    if (np.reshareOf) { const o = s.posts.find((x) => x.id === np.reshareOf); if (!o || !canSee(o, this.ctx(s))) throw new SocialError('That post is no longer available.'); }
    this.limit(s, 'post', LIMITS.postDay);
    const id = 'mp' + this.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const media: Media[] = np.images.slice(0, 4).map((im, i) => { const k = `${id}-${i}`; s.blobs[k] = im.blob; return { url: `idb:${k}`, w: im.w, h: im.h }; });
    const me = s.profiles[DEMO_ME];
    s.posts.unshift({ id, authorId: DEMO_ME, text, media, workout: np.workout, audience: effectiveAudience(np.audience, me), reshareOf: np.reshareOf, createdAt: this.now(), likeCount: 0, commentCount: 0, shareCount: 0 });
    if (np.reshareOf) { const o = s.posts.find((x) => x.id === np.reshareOf)!; o.shareCount++; }
    this.sampleReactions(s, id);
    await this.commit();
    return id;
  }
  /** Demo only: two sample friends react to the new post and one comments, so notifications can be explored. */
  private sampleReactions(s: DemoState, postId: string) {
    const p = s.posts.find((x) => x.id === postId)!;
    const fr = friendIds(s.graph, DEMO_ME).filter((id) => s.profiles[id]?.sample);
    const t = this.now();
    const kinds: ReactionType[] = ['like', 'love'];
    fr.slice(0, 2).forEach((id, i) => {
      const type = kinds[i] || 'like';
      s.reactions.push({ id: `rx${t}${i}`, userId: id, targetType: 'post', targetId: postId, type, createdAt: t + i });
      if (notifyTarget({ type: 'like', actor: id, owner: DEMO_ME }, s.graph)) s.notifs.unshift({ id: `n${t}${i}`, userId: DEMO_ME, actorId: id, type: 'like', postId, reaction: type, createdAt: t + i, read: false });
    });
    if (fr[2] || fr[0]) {
      const by = fr[2] || fr[0];
      const c: Comment = { id: `c${t}`, postId, authorId: by, text: p.workout ? 'Strong session! 💪' : 'Love this. Keep it up!', createdAt: t + 5 };
      s.comments.push(c); p.commentCount++;
      s.notifs.unshift({ id: `n${t}c`, userId: DEMO_ME, actorId: by, type: 'comment', postId, commentId: c.id, createdAt: t + 5, read: false });
    }
  }
  async editPost(id: string, text: string, audience: Post['audience']) {
    const s = await this.st(); const p = s.posts.find((x) => x.id === id && x.authorId === DEMO_ME);
    if (!p) throw new SocialError('Only your own posts can be edited.');
    p.text = cleanText(text, POST_MAX); p.audience = effectiveAudience(audience, s.profiles[DEMO_ME]); p.editedAt = this.now();
    await this.commit();
  }
  async deletePost(id: string) {
    const s = await this.st(); const p = s.posts.find((x) => x.id === id && x.authorId === DEMO_ME);
    if (!p) throw new SocialError('Only your own posts can be deleted.');
    const gone = new Set([id, ...s.posts.filter((x) => x.reshareOf === id).map((x) => x.id)]);
    if (p.reshareOf) { const o = s.posts.find((x) => x.id === p.reshareOf); if (o) o.shareCount = Math.max(0, o.shareCount - 1); }
    s.posts = s.posts.filter((x) => !gone.has(x.id));
    s.comments = s.comments.filter((c) => !gone.has(c.postId));
    s.notifs = s.notifs.filter((n) => !n.postId || !gone.has(n.postId));
    s.saves = s.saves.filter((x) => !gone.has(x));
    const commentIds = new Set(s.comments.filter((c) => gone.has(c.postId)).map((c) => c.id));
    s.reactions = s.reactions.filter((r) => !(r.targetType === 'post' && gone.has(r.targetId)) && !(r.targetType === 'comment' && commentIds.has(r.targetId)));
    for (const m of p.media) if (m.url.startsWith('idb:')) delete s.blobs[m.url.slice(4)];
    await this.commit();
  }
  async setLike(id: string, on: boolean) { return this.setReaction('post', id, on ? 'like' : null); }
  async setReaction(targetType: ReactionTarget, targetId: string, type: ReactionType | null) {
    const s = await this.st(); this.requireMe(s);
    const ctx = this.ctx(s);
    let authorId: string | undefined;
    let postId: string | undefined;
    if (targetType === 'post') {
      const p = s.posts.find((x) => x.id === targetId);
      if (!p || !canSee(p, ctx)) throw new SocialError('That post is no longer available.');
      if (!canReactOn(true, DEMO_ME, p.authorId, s.graph)) throw new SocialError('You can’t react to this.');
      authorId = p.authorId; postId = p.id;
    } else {
      const c = s.comments.find((x) => x.id === targetId);
      const p = c && s.posts.find((x) => x.id === c.postId);
      if (!c || !p || !canSee(p, ctx) || !visibleComments([c], ctx).length) throw new SocialError('That comment is no longer available.');
      if (!canReactOn(true, DEMO_ME, c.authorId, s.graph)) throw new SocialError('You can’t react to this.');
      authorId = c.authorId; postId = p.id;
    }
    const prev = s.reactions.find((r) => r.userId === DEMO_ME && r.targetType === targetType && r.targetId === targetId)?.type ?? null;
    // rate-limit new or changed reactions, not removals
    if (type && type !== prev) this.limit(s, 'react', LIMITS.reactHour);
    const next = applyReaction(s.reactions, DEMO_ME, targetType, targetId, type, this.now(), () => 'rx' + this.now().toString(36) + Math.random().toString(36).slice(2, 6));
    s.reactions = next.list;
    if (next.next && authorId) {
      const to = notifyTarget({ type: 'like', actor: DEMO_ME, owner: authorId }, s.graph);
      if (to) {
        s.notifs = s.notifs.filter((n) => !(n.type === 'like' && n.actorId === DEMO_ME && (targetType === 'comment' ? n.commentId === targetId : n.postId === postId && !n.commentId)));
        s.notifs.unshift({ id: 'n' + this.now().toString(36), userId: to, actorId: DEMO_ME, type: 'like', postId, commentId: targetType === 'comment' ? targetId : undefined, reaction: next.next, createdAt: this.now(), read: false });
      }
    }
    await this.commit();
  }
  async listReactions(targetType: ReactionTarget, targetId: string): Promise<ReactorView[]> {
    const s = await this.st();
    if (targetType === 'post') {
      const p = s.posts.find((x) => x.id === targetId);
      if (!p || !canSee(p, this.ctx(s))) return [];
    } else {
      const c = s.comments.find((x) => x.id === targetId);
      const p = c && s.posts.find((x) => x.id === c.postId);
      if (!c || !p || !canSee(p, this.ctx(s))) return [];
    }
    return visibleReactions(s.reactions.filter((r) => r.targetType === targetType && r.targetId === targetId), this.ctx(s))
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((r) => ({ user: this.prof(s, r.userId), type: r.type, createdAt: r.createdAt }));
  }
  async setSave(id: string, on: boolean) { const s = await this.st(); this.requireMe(s); s.saves = on ? [id, ...s.saves.filter((x) => x !== id)] : s.saves.filter((x) => x !== id); await this.commit(); }
  async hidePost(id: string) { const s = await this.st(); s.hidden = [...new Set([...s.hidden, id])]; await this.commit(); }
  async saved() { const s = await this.st(); const ctx = this.ctx(s); return s.saves.map((id) => s.posts.find((p) => p.id === id)).filter((p): p is Post => !!p && canSee(p, ctx)).map((p) => this.view(s, p)); }
  async comments(postId: string): Promise<CommentView[]> {
    const s = await this.st(); const p = s.posts.find((x) => x.id === postId);
    if (!p || !canSee(p, this.ctx(s))) return [];
    const ctx = { me: DEMO_ME, graph: s.graph };
    return visibleComments(s.comments.filter((c) => c.postId === postId), ctx).sort((a, b) => a.createdAt - b.createdAt).map((c) => {
      const mine = s.reactions.find((r) => r.userId === DEMO_ME && r.targetType === 'comment' && r.targetId === c.id);
      const summary = summarizeReactions(visibleReactions(s.reactions.filter((r) => r.targetType === 'comment' && r.targetId === c.id), ctx));
      return { ...c, author: this.prof(s, c.authorId), myReaction: mine?.type ?? null, reactionSummary: summary };
    });
  }
  async addComment(postId: string, text: string) {
    const s = await this.st(); this.requireMe(s); const p = s.posts.find((x) => x.id === postId);
    if (!p || !canSee(p, this.ctx(s)) || isBlocked(s.graph, DEMO_ME, p.authorId)) throw new SocialError('You can’t comment on this post.');
    const t = cleanText(text, COMMENT_MAX); if (!t) throw new SocialError('Write something first.');
    this.limit(s, 'comment', LIMITS.commentHour);
    s.comments.push({ id: 'mc' + this.now().toString(36) + Math.random().toString(36).slice(2, 5), postId, authorId: DEMO_ME, text: t, createdAt: this.now() });
    p.commentCount++;
    await this.commit();
  }
  async deleteComment(id: string) {
    const s = await this.st(); const c = s.comments.find((x) => x.id === id); const p = c && s.posts.find((x) => x.id === c.postId);
    if (!c || !p || !canDeleteComment(c, p, DEMO_ME)) throw new SocialError('You can only delete your own comments or comments on your posts.');
    s.comments = s.comments.filter((x) => x.id !== id); p.commentCount = Math.max(0, p.commentCount - 1);
    s.reactions = s.reactions.filter((r) => !(r.targetType === 'comment' && r.targetId === id));
    await this.commit();
  }
  async stories(): Promise<StoryView[]> {
    const s = await this.st(); const ctx = this.ctx(s);
    return s.stories.filter((x) => isStoryActive(x, this.now()) && canSee(x, ctx)).map((x) => ({ ...x, media: x.media ? { ...x.media, url: this.url(x.media.url) } : undefined, author: this.prof(s, x.authorId) }));
  }
  async createStory(ns: NewStory) {
    const s = await this.st(); this.requireMe(s);
    const text = cleanText(ns.text || '', STORY_TEXT_MAX);
    if (!text && !ns.image) throw new SocialError('Add a photo or some text.');
    this.limit(s, 'story', LIMITS.storyDay);
    const id = 'ms' + this.now().toString(36); let media: Media | undefined;
    if (ns.image) { s.blobs[id] = ns.image.blob; media = { url: `idb:${id}`, w: ns.image.w, h: ns.image.h }; }
    s.stories.push({ id, authorId: DEMO_ME, text: text || undefined, bg: ns.bg, media, audience: effectiveAudience(ns.audience, s.profiles[DEMO_ME]), createdAt: this.now(), expiresAt: storyExpiry(this.now()) });
    await this.commit();
  }
  async deleteStory(id: string) { const s = await this.st(); s.stories = s.stories.filter((x) => !(x.id === id && x.authorId === DEMO_ME)); delete s.blobs[id]; await this.commit(); }
  async notifications(): Promise<NotifView[]> {
    const s = await this.st();
    return s.notifs.filter((n) => !isBlocked(s.graph, DEMO_ME, n.actorId)).sort((a, b) => b.createdAt - a.createdAt).map((n) => ({ ...n, actor: this.prof(s, n.actorId), postPreview: n.postId ? s.posts.find((p) => p.id === n.postId)?.text.slice(0, 60) : undefined }));
  }
  async markAllRead() { const s = await this.st(); s.notifs = s.notifs.map((n) => (n.type === 'friend_request' ? n : { ...n, read: true })); await this.commit(); }
  async report(r: NewReport) {
    const s = await this.st(); this.limit(s, 'report', LIMITS.reportDay);
    s.reports.push({ ...r, details: r.details ? cleanText(r.details, REPORT_DETAILS_MAX) : undefined, id: 'rp' + this.now().toString(36), createdAt: this.now() });
    await this.commit();
  }
}
