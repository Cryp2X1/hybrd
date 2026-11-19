// Social: Friends & Stories — pure logic (no DOM, no network) so tools/test-social.ts can run it in Node.
// The same rules are enforced server-side in supabase/schema.sql (RLS + triggers); this file mirrors them for the
// demo backend and for instant UI feedback. See APP-BUILDER-NOTES.md › "Social: Friends & Stories".

// ---------- limits ----------
export const HANDLE_MIN = 3;
export const HANDLE_MAX = 20;
export const NAME_MAX = 40;
export const PUBLIC_BIO_MAX = 160;
export const POST_MAX = 2000;
export const COMMENT_MAX = 500;
export const STORY_TEXT_MAX = 200;
export const REPORT_DETAILS_MAX = 500;
export const MAX_POST_PHOTOS = 4;
export const STORY_HOURS = 24;
export const STORY_MS = STORY_HOURS * 3600_000;
export const MIN_SOCIAL_AGE = 13;
export const ADULT_AGE = 18;
/** Social images are re-encoded to ≤ 1440 px WebP/JPEG; the storage bucket refuses anything above 8 MB or not an image. */
export const SOCIAL_IMG_EDGE = 1440;
export const SOCIAL_IMG_MAX_BYTES = 8 * 1024 * 1024;
export const SOCIAL_IMG_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// ---------- types ----------
export type Privacy = 'public' | 'friends';
export type Audience = 'public' | 'friends';
export interface PublicProfile {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  publicBio?: string;
  privacy: Privacy;
  showStats: boolean;
  stats?: { workouts30d?: number; streak?: number; hybridScore?: number | null };
  friendCount: number;
  postCount: number;
  isMinor?: boolean;
  /** Demo / preview users only. Never set on real accounts. */
  sample?: boolean;
}
export type ReqStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';
export interface FriendRequest { id: string; from: string; to: string; status: ReqStatus; createdAt: number; respondedAt?: number }
export interface Graph {
  requests: FriendRequest[];
  /** Friend pairs, stored once with a < b (like the friendships table). */
  friends: [string, string][];
  /** [blocker, blocked] */
  blocks: [string, string][];
}
export type Relation = 'self' | 'none' | 'outgoing' | 'incoming' | 'friends' | 'blocked' | 'blocked_by';

export interface WorkoutCard {
  type: string; // WorkoutType
  label: string; // "Run", "Indoor bike", …
  title: string;
  date: string; // ISO
  durationSec: number;
  distanceM?: number;
  /** seconds per km (raw; viewers render in their own units) */
  paceSecPerKm?: number;
  kcal?: number;
  hybridScore?: number | null;
}
export interface Post {
  id: string;
  authorId: string;
  text: string;
  media: { url: string; w: number; h: number; path?: string }[];
  workout?: WorkoutCard;
  audience: Audience;
  reshareOf?: string;
  createdAt: number;
  editedAt?: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
}
export interface Story { id: string; authorId: string; text?: string; bg?: string; media?: { url: string; w: number; h: number; path?: string }; audience: Audience; createdAt: number; expiresAt: number }
export interface Comment { id: string; postId: string; authorId: string; text: string; createdAt: number }
export type NotifType = 'friend_request' | 'friend_accept' | 'like' | 'comment' | 'reshare';
export interface Notif { id: string; userId: string; actorId: string; type: NotifType; postId?: string; commentId?: string; reaction?: ReactionType; createdAt: number; read: boolean }

// ---------- reactions (posts + comments) ----------
export const REACTION_TYPES = ['like', 'love', 'haha', 'wow', 'sad', 'angry', 'dislike'] as const;
export type ReactionType = typeof REACTION_TYPES[number];
export type ReactionTarget = 'post' | 'comment';
export const isReactionType = (s: string): s is ReactionType => (REACTION_TYPES as readonly string[]).includes(s);
/** Label, system emoji and accent colour for each reaction. No Care/hug; Dislike is the seventh. Not Facebook artwork. */
export const REACTION_META: Record<ReactionType, { emoji: string; label: string; color: string }> = {
  like: { emoji: '👍', label: 'Like', color: '#60a5fa' },
  love: { emoji: '❤️', label: 'Love', color: '#ef4444' },
  haha: { emoji: '😆', label: 'Haha', color: '#facc15' },
  wow: { emoji: '😮', label: 'Wow', color: '#fbbf24' },
  sad: { emoji: '😢', label: 'Sad', color: '#38bdf8' },
  angry: { emoji: '😠', label: 'Angry', color: '#f97316' },
  dislike: { emoji: '👎', label: 'Dislike', color: '#94a3b8' },
};
export interface Reaction {
  id: string;
  userId: string;
  targetType: ReactionTarget;
  targetId: string;
  type: ReactionType;
  createdAt: number;
}
export interface ReactionSummary {
  total: number;
  counts: Record<ReactionType, number>;
  /** Up to three types, highest count first, then the standard order. */
  top: ReactionType[];
}
export const emptyReactionCounts = (): Record<ReactionType, number> => ({ like: 0, love: 0, haha: 0, wow: 0, sad: 0, angry: 0, dislike: 0 });
export function summarizeReactions(rs: Pick<Reaction, 'type'>[]): ReactionSummary {
  const counts = emptyReactionCounts();
  for (const r of rs) counts[r.type]++;
  const top = REACTION_TYPES.filter((t) => counts[t] > 0).sort((a, b) => counts[b] - counts[a] || REACTION_TYPES.indexOf(a) - REACTION_TYPES.indexOf(b)).slice(0, 3);
  return { total: rs.length, counts, top };
}
/** Same type again (or null) removes; a different type replaces. One reaction per user per target. */
export function applyReaction(
  list: Reaction[],
  userId: string,
  targetType: ReactionTarget,
  targetId: string,
  type: ReactionType | null,
  now: number,
  newId: () => string = () => 'rx' + now.toString(36),
): { list: Reaction[]; prev: ReactionType | null; next: ReactionType | null } {
  const idx = list.findIndex((r) => r.userId === userId && r.targetType === targetType && r.targetId === targetId);
  const prev = idx >= 0 ? list[idx].type : null;
  if (type === null || type === prev) {
    return { list: idx >= 0 ? list.filter((_, i) => i !== idx) : list, prev, next: null };
  }
  if (idx >= 0) {
    const next = list.slice();
    next[idx] = { ...next[idx], type, createdAt: now };
    return { list: next, prev, next: type };
  }
  return { list: [...list, { id: newId(), userId, targetType, targetId, type, createdAt: now }], prev, next: type };
}
/** Turn legacy per-post likes into Like reactions. Existing reactions for the same user+post are left alone. */
export function migrateLikesToReactions(likes: { userId: string; postId: string; createdAt?: number; id?: string }[], existing: Reaction[] = []): Reaction[] {
  const out = existing.slice();
  const have = new Set(out.filter((r) => r.targetType === 'post').map((r) => `${r.userId}:${r.targetId}`));
  for (const l of likes) {
    const k = `${l.userId}:${l.postId}`;
    if (have.has(k)) continue;
    have.add(k);
    out.push({ id: l.id || `mlike-${l.userId}-${l.postId}`, userId: l.userId, targetType: 'post', targetId: l.postId, type: 'like', createdAt: l.createdAt || 0 });
  }
  return out;
}
/** Hidden when the reactor is blocked either way (your own reaction always stays). */
export const visibleReactions = <R extends Pick<Reaction, 'userId'>>(rs: R[], v: Pick<ViewCtx, 'me' | 'graph'>) => rs.filter((r) => r.userId === v.me || !isBlocked(v.graph, v.me, r.userId));
export function canReactOn(visible: boolean, me: string, authorId: string, g: Graph): boolean {
  return visible && !isBlocked(g, me, authorId);
}
export type ReportTarget = 'post' | 'comment' | 'user' | 'story';
export type ReportReason = 'spam' | 'harassment' | 'hate' | 'nudity' | 'violence' | 'self_harm' | 'misinformation' | 'underage' | 'impersonation' | 'other';
export const REPORT_REASONS: { v: ReportReason; label: string; sub: string }[] = [
  { v: 'spam', label: 'Spam or scam', sub: 'Ads, fake offers, repeated junk' },
  { v: 'harassment', label: 'Harassment or bullying', sub: 'Targeting, insulting or threatening someone' },
  { v: 'hate', label: 'Hate speech', sub: 'Attacks on people for who they are' },
  { v: 'nudity', label: 'Nudity or sexual content', sub: 'Not allowed on HYBRD' },
  { v: 'violence', label: 'Violence or dangerous acts', sub: 'Threats, graphic content, dangerous challenges' },
  { v: 'self_harm', label: 'Self-harm or eating disorder content', sub: 'Promoting self-harm, extreme dieting or purging' },
  { v: 'misinformation', label: 'Harmful health misinformation', sub: 'Dangerous medical, drug or diet claims' },
  { v: 'underage', label: 'User may be under 13', sub: 'Friends & Stories is for ages 13+' },
  { v: 'impersonation', label: 'Impersonation', sub: 'Pretending to be someone else' },
  { v: 'other', label: 'Something else', sub: 'Tell us more below' },
];

// ---------- handles ----------
export const RESERVED_HANDLES = new Set([
  'admin', 'administrator', 'root', 'support', 'help', 'hybrd', 'hybrdapp', 'official', 'staff', 'team', 'moderator', 'mod', 'mods',
  'security', 'system', 'null', 'undefined', 'me', 'you', 'settings', 'invite', 'social', 'feed', 'friends', 'stories', 'story',
  'post', 'posts', 'api', 'www', 'about', 'privacy', 'terms', 'rules', 'report', 'coach', 'everyone', 'anonymous', 'sample',
]);
/** Lower-case, trim, drop a leading @. Does not validate. */
export const normalizeHandle = (h: string) => (h || '').trim().replace(/^@+/, '').toLowerCase();
/** 3–20 chars: a–z, 0–9, underscore and single dots (not first/last). Not reserved, not profane. Mirrors the SQL check. */
export function validateHandle(raw: string): { ok: boolean; handle: string; error?: string } {
  const handle = normalizeHandle(raw);
  const bad = (error: string) => ({ ok: false, handle, error });
  if (handle.length < HANDLE_MIN) return bad(`At least ${HANDLE_MIN} characters.`);
  if (handle.length > HANDLE_MAX) return bad(`At most ${HANDLE_MAX} characters.`);
  if (!/^[a-z0-9._]+$/.test(handle)) return bad('Only letters, numbers, underscores and dots.');
  if (handle.startsWith('.') || handle.endsWith('.')) return bad('Can’t start or end with a dot.');
  if (handle.includes('..')) return bad('No double dots.');
  if (!/[a-z]/.test(handle)) return bad('Include at least one letter.');
  if (RESERVED_HANDLES.has(handle) || RESERVED_HANDLES.has(handle.replace(/[._]/g, '')) || /^sample[._]/.test(handle)) return bad('That handle is reserved.');
  if (hasProfanity(handle.replace(/[._]/g, ' ')) || hasProfanity(handle.replace(/[._]/g, ''))) return bad('Pick a different handle.');
  return { ok: true, handle };
}
/** Suggest a handle from a display name ("José Cruz" → "jose.cruz"). */
export function suggestHandle(name: string): string {
  const base = (name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '').slice(0, HANDLE_MAX);
  const h = base.replace(/\.+$/, '');
  return validateHandle(h).ok ? h : validateHandle(h + '.fit').ok ? (h + '.fit').slice(0, HANDLE_MAX) : 'athlete' + Math.floor(Math.random() * 9000 + 1000);
}
export function validateDisplayName(n: string): { ok: boolean; value: string; error?: string } {
  const value = (n || '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
  if (!value) return { ok: false, value, error: 'Add a display name.' };
  if (hasProfanity(value)) return { ok: false, value, error: 'Pick a different name.' };
  if (/\bsample\b/i.test(value)) return { ok: false, value, error: '“Sample” is reserved for demo people.' };
  return { ok: true, value };
}

// ---------- profanity filter (basic) ----------
// Word-boundary matching after leet-speak folding, so "Scunthorpe", "class", "assess" or "hello" are never flagged.
// This is a first line of defence only; reports + moderation (SETUP.md §11) handle the rest.
const BAD = [
  'fuck', 'fucker', 'fucking', 'fucked', 'motherfucker', 'shit', 'shitty', 'bullshit', 'bitch', 'bitches', 'cunt', 'dick', 'dickhead', 'cock',
  'pussy', 'asshole', 'arsehole', 'bastard', 'slut', 'whore', 'wanker', 'twat', 'prick', 'jerkoff', 'dumbass', 'jackass',
  'nigger', 'nigga', 'faggot', 'fag', 'retard', 'retarded', 'spic', 'chink', 'kike', 'tranny', 'dyke', 'wetback', 'gook',
  'puta', 'puto', 'pendejo', 'pendeja', 'mierda', 'cabron', 'joder', 'maricon', 'maricón', 'chingar', 'chingada', 'verga', 'culero', 'zorra',
  'porn', 'porno', 'kys', 'killyourself',
];
const BAD_SET = new Set(BAD.map((w) => fold(w)));
function fold(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[@4]/g, 'a').replace(/3/g, 'e').replace(/[1!|]/g, 'i').replace(/0/g, 'o').replace(/[5$]/g, 's').replace(/7/g, 't');
}
/** Tokens = runs of letters/digits/leet symbols. Also checks the token with repeated letters squeezed ("fuuuck"). */
function tokens(s: string): { raw: string; start: number }[] {
  const out: { raw: string; start: number }[] = [];
  const re = /[\p{L}\p{N}@$!|]+/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    // "!" and "|" only count as leet letters inside a word ("sh!t"), not as trailing/leading punctuation ("shit!")
    const lead = /^[!|]*/.exec(m[0])![0].length;
    const raw = m[0].slice(lead).replace(/[!|]+$/, '');
    if (raw) out.push({ raw, start: m.index + lead });
  }
  return out;
}
const squeeze = (w: string) => w.replace(/(.)\1+/g, '$1');
function isBad(tok: string) {
  const f = fold(tok).replace(/[^a-z0-9ñ]/g, '');
  if (!f) return false;
  return BAD_SET.has(f) || BAD_SET.has(squeeze(f)) || (f.endsWith('s') && BAD_SET.has(f.slice(0, -1)));
}
export function hasProfanity(s: string): boolean { return tokens(s || '').some((t) => isBad(t.raw)); }
/** Replace each flagged word with its first letter + asterisks ("shit" → "s***"). Other text is untouched. */
export function maskProfanity(s: string): string {
  if (!s) return s;
  let out = '', last = 0;
  for (const t of tokens(s)) {
    if (!isBad(t.raw)) continue;
    out += s.slice(last, t.start) + t.raw[0] + '*'.repeat(Math.max(1, [...t.raw].length - 1));
    last = t.start + t.raw.length;
  }
  return out + s.slice(last);
}
/** Normalise user text for a post / comment / story: CRLF → LF, trim, collapse 3+ blank lines, cap length, mask profanity. */
export function cleanText(s: string, max: number): string {
  const t = (s || '').replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return maskProfanity([...t].slice(0, max).join(''));
}

// ---------- age gate ----------
/** Whole years between a YYYY-MM-DD birth date and `today` (local calendar). */
export function ageFromDob(dob: string, today = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob || '');
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1900) return null;
  let a = today.getFullYear() - y;
  if (today.getMonth() + 1 < mo || (today.getMonth() + 1 === mo && today.getDate() < d)) a--;
  return a < 0 || a > 120 ? null : a;
}
export type AgeGate = 'ok' | 'teen' | 'under13' | 'unknown';
/** DOB wins over the onboarding age. Under 13 → no social at all. 13–17 → friends-only (no public posts, private profile). */
export function ageGate(dob?: string, age?: number, today = new Date()): AgeGate {
  const a = dob ? ageFromDob(dob, today) : null;
  const v = a ?? (typeof age === 'number' && age > 0 ? age : null);
  if (v === null) return 'unknown';
  if (v < MIN_SOCIAL_AGE) return 'under13';
  if (v < ADULT_AGE) return 'teen';
  return 'ok';
}
export const socialAllowed = (g: AgeGate) => g === 'ok' || g === 'teen';

// ---------- friend graph state machine ----------
export const pairKey = (a: string, b: string): [string, string] => (a < b ? [a, b] : [b, a]);
export const isBlocked = (g: Graph, a: string, b: string) => g.blocks.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
export const areFriends = (g: Graph, a: string, b: string) => g.friends.some(([p, q]) => (p === a && q === b) || (p === b && q === a));
export const pendingBetween = (g: Graph, a: string, b: string) => g.requests.find((r) => r.status === 'pending' && ((r.from === a && r.to === b) || (r.from === b && r.to === a)));
export function relation(g: Graph, me: string, other: string): Relation {
  if (me === other) return 'self';
  if (g.blocks.some(([x, y]) => x === me && y === other)) return 'blocked';
  if (g.blocks.some(([x, y]) => x === other && y === me)) return 'blocked_by';
  if (areFriends(g, me, other)) return 'friends';
  const p = pendingBetween(g, me, other);
  if (p) return p.from === me ? 'outgoing' : 'incoming';
  return 'none';
}
export const friendIds = (g: Graph, me: string) => g.friends.filter(([a, b]) => a === me || b === me).map(([a, b]) => (a === me ? b : a));
export const incoming = (g: Graph, me: string) => g.requests.filter((r) => r.status === 'pending' && r.to === me);
export const outgoing = (g: Graph, me: string) => g.requests.filter((r) => r.status === 'pending' && r.from === me);

export type GraphAction =
  | { type: 'send'; to: string } | { type: 'cancel'; to: string } | { type: 'accept'; from: string } | { type: 'decline'; from: string }
  | { type: 'unfriend'; other: string } | { type: 'block'; other: string } | { type: 'unblock'; other: string };
export class SocialError extends Error {}
/** Pure reducer. Throws SocialError for an action that isn't allowed from the current state (same rules as the SQL functions). */
export function applyAction(g: Graph, me: string, a: GraphAction, now = Date.now(), newId = () => Math.random().toString(36).slice(2)): Graph {
  const other = 'to' in a ? a.to : 'from' in a ? a.from : a.other;
  if (other === me) throw new SocialError('That’s you.');
  const rel = relation(g, me, other);
  const setReq = (r: FriendRequest, status: ReqStatus): Graph => ({ ...g, requests: g.requests.map((x) => (x.id === r.id ? { ...x, status, respondedAt: now } : x)) });
  switch (a.type) {
    case 'send': {
      if (rel === 'blocked') throw new SocialError('Unblock them first.');
      if (rel === 'blocked_by') throw new SocialError('You can’t add this person.');
      if (rel === 'friends') throw new SocialError('You’re already friends.');
      if (rel === 'outgoing') throw new SocialError('Request already sent.');
      if (rel === 'incoming') return applyAction(g, me, { type: 'accept', from: other }, now, newId); // they asked first → accept
      return { ...g, requests: [...g.requests, { id: newId(), from: me, to: other, status: 'pending', createdAt: now }] };
    }
    case 'cancel': {
      const r = g.requests.find((x) => x.status === 'pending' && x.from === me && x.to === other);
      if (!r) throw new SocialError('No request to cancel.');
      return setReq(r, 'cancelled');
    }
    case 'accept': case 'decline': {
      const r = g.requests.find((x) => x.status === 'pending' && x.from === other && x.to === me);
      if (!r) throw new SocialError('No request from this person.');
      const g2 = setReq(r, a.type === 'accept' ? 'accepted' : 'declined');
      return a.type === 'accept' ? { ...g2, friends: [...g2.friends, pairKey(me, other)] } : g2;
    }
    case 'unfriend': {
      if (rel !== 'friends') throw new SocialError('You’re not friends.');
      return { ...g, friends: g.friends.filter(([p, q]) => !((p === me && q === other) || (p === other && q === me))) };
    }
    case 'block': {
      if (rel === 'blocked') return g;
      return {
        friends: g.friends.filter(([p, q]) => !((p === me && q === other) || (p === other && q === me))),
        requests: g.requests.map((r) => (r.status === 'pending' && ((r.from === me && r.to === other) || (r.from === other && r.to === me)) ? { ...r, status: 'cancelled' as const, respondedAt: now } : r)),
        blocks: [...g.blocks, [me, other]],
      };
    }
    case 'unblock': {
      if (rel !== 'blocked') throw new SocialError('Not blocked.');
      return { ...g, blocks: g.blocks.filter(([p, q]) => !(p === me && q === other)) }; // friendship is NOT restored
    }
  }
}

// ---------- rate limits (mirrored by SQL triggers) ----------
export interface Limit { max: number; windowMs: number; label: string }
export const LIMITS = {
  friendRequestHour: { max: 20, windowMs: 3600_000, label: 'friend requests an hour' },
  friendRequestDay: { max: 60, windowMs: 86_400_000, label: 'friend requests a day' },
  postDay: { max: 30, windowMs: 86_400_000, label: 'posts a day' },
  storyDay: { max: 30, windowMs: 86_400_000, label: 'stories a day' },
  commentHour: { max: 60, windowMs: 3600_000, label: 'comments an hour' },
  reactHour: { max: 120, windowMs: 3600_000, label: 'reactions an hour' },
  reportDay: { max: 30, windowMs: 86_400_000, label: 'reports a day' },
} satisfies Record<string, Limit>;
/** Returns null if allowed, or a friendly message + ms until the next slot frees up. */
export function rateCheck(times: number[], lim: Limit, now = Date.now()): { msg: string; retryInMs: number } | null {
  const recent = times.filter((t) => t > now - lim.windowMs).sort((a, b) => a - b);
  if (recent.length < lim.max) return null;
  const retryInMs = recent[recent.length - lim.max] + lim.windowMs - now;
  return { msg: `Slow down: the limit is ${lim.max} ${lim.label}. Try again in ${Math.max(1, Math.ceil(retryInMs / 60_000))} min.`, retryInMs };
}

// ---------- audience / visibility (mirrors social_can_view_post in SQL) ----------
export interface ViewCtx { me: string; graph: Graph; profiles: Record<string, Pick<PublicProfile, 'privacy' | 'isMinor'>>; hidden?: Set<string> }
/** Effective audience: friends-only profiles and under-18 authors can never publish to the public. */
export function effectiveAudience(a: Audience, author?: Pick<PublicProfile, 'privacy' | 'isMinor'>): Audience {
  return a === 'public' && author && author.privacy === 'public' && !author.isMinor ? 'public' : 'friends';
}
export function canSee(item: { authorId: string; audience: Audience }, v: ViewCtx): boolean {
  if (item.authorId === v.me) return true;
  if (isBlocked(v.graph, v.me, item.authorId)) return false;
  if (areFriends(v.graph, v.me, item.authorId)) return true;
  return effectiveAudience(item.audience, v.profiles[item.authorId]) === 'public';
}
/** Feed = my posts + friends' posts + public posts, minus blocked / hidden / not allowed; newest first. Reshares of a post I can't see are dropped. */
export function feedFor<P extends Pick<Post, 'id' | 'authorId' | 'audience' | 'createdAt' | 'reshareOf'>>(posts: P[], v: ViewCtx): P[] {
  const byId = new Map(posts.map((p) => [p.id, p]));
  return posts.filter((p) => {
    if (v.hidden?.has(p.id) || !canSee(p, v)) return false;
    if (p.reshareOf) { const o = byId.get(p.reshareOf); if (o && !canSee(o, v)) return false; }
    return true;
  }).sort((a, b) => b.createdAt - a.createdAt);
}
/** Comments from people blocked either way are hidden. */
export const visibleComments = <C extends Pick<Comment, 'authorId'>>(cs: C[], v: Pick<ViewCtx, 'me' | 'graph'>) => cs.filter((c) => c.authorId === v.me || !isBlocked(v.graph, v.me, c.authorId));
/** Can `me` delete this comment? Own comment, or a comment on my post. */
export const canDeleteComment = (c: Pick<Comment, 'authorId'>, post: Pick<Post, 'authorId'>, me: string) => c.authorId === me || post.authorId === me;

// ---------- stories ----------
export const storyExpiry = (createdAt: number) => createdAt + STORY_MS;
export const isStoryActive = (s: Pick<Story, 'expiresAt'>, now = Date.now()) => s.expiresAt > now;
export function storyTimeLeft(s: Pick<Story, 'expiresAt'>, now = Date.now()): string {
  const ms = s.expiresAt - now;
  if (ms <= 0) return 'expired';
  const h = Math.floor(ms / 3600_000);
  return h >= 1 ? `${h}h left` : `${Math.max(1, Math.ceil(ms / 60_000))}m left`;
}
export interface StoryGroup<S extends Story = Story> { authorId: string; stories: S[]; latest: number; seen: boolean }
/** Active, visible stories grouped by author: me first, then unseen (newest first), then seen. */
export function storyGroups<S extends Story>(stories: S[], v: ViewCtx, seen: Set<string> = new Set(), now = Date.now()): StoryGroup<S>[] {
  return groupStories(stories.filter((s) => canSee(s, v)), v.me, seen, now);
}
/** Group already-authorised stories (e.g. what the server returned) by author; drops expired ones. */
export function groupStories<S extends Story>(stories: S[], me: string, seen: Set<string> = new Set(), now = Date.now()): StoryGroup<S>[] {
  const m = new Map<string, S[]>();
  for (const s of stories) {
    if (!isStoryActive(s, now)) continue;
    m.set(s.authorId, [...(m.get(s.authorId) || []), s]);
  }
  const groups = [...m.entries()].map(([authorId, ss]) => {
    const sorted = ss.sort((a, b) => a.createdAt - b.createdAt);
    return { authorId, stories: sorted, latest: sorted[sorted.length - 1].createdAt, seen: sorted.every((s) => seen.has(s.id)) };
  });
  return groups.sort((a, b) => (a.authorId === me ? -1 : b.authorId === me ? 1 : a.seen !== b.seen ? (a.seen ? 1 : -1) : b.latest - a.latest));
}

// ---------- counts ----------
export function toggleCount(count: number, wasOn: boolean, on: boolean): number { return Math.max(0, count + (on === wasOn ? 0 : on ? 1 : -1)); }
export const compact = (n: number) => (n < 1000 ? String(n) : n < 10_000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K` : n < 1_000_000 ? `${Math.round(n / 1000)}K` : `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`);
export const plural = (n: number, one: string, many = one + 's') => `${compact(n)} ${n === 1 ? one : many}`;
/** Unread badge = pending incoming requests + unread notifications that aren't friend requests (those are already counted). */
export const badgeCount = (incomingCount: number, notifs: Pick<Notif, 'read' | 'type'>[]) => incomingCount + notifs.filter((n) => !n.read && n.type !== 'friend_request').length;

// ---------- notifications ----------
export function notifText(type: NotifType, ev?: { commentId?: string; reaction?: ReactionType }): string {
  switch (type) {
    case 'friend_request': return 'sent you a friend request';
    case 'friend_accept': return 'accepted your friend request';
    case 'like': {
      const onComment = !!ev?.commentId;
      const named = ev?.reaction && ev.reaction !== 'like';
      if (onComment) return named ? 'reacted to your comment' : 'liked your comment';
      return named ? 'reacted to your post' : 'liked your post';
    }
    case 'comment': return 'commented on your post';
    case 'reshare': return 'shared your post';
  }
}
/** Who gets a notification for an event (never yourself, never across a block). */
export function notifyTarget(ev: { type: NotifType; actor: string; owner: string }, g: Graph): string | null {
  if (ev.actor === ev.owner || isBlocked(g, ev.actor, ev.owner)) return null;
  return ev.owner;
}

// ---------- time ----------
export function timeAgo(t: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return 'now';
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m`;
  if (s < 86_400) return `${Math.round(s / 3600)}h`;
  if (s < 7 * 86_400) return `${Math.round(s / 86_400)}d`;
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ---------- links ----------
export const inviteUrl = (appBase: string, handle: string) => `${appBase.replace(/\/?$/, '/')}invite?u=${encodeURIComponent(handle)}`;
export const postUrl = (appBase: string, id: string) => `${appBase.replace(/\/?$/, '/')}social/post?id=${encodeURIComponent(id)}`;
export const profileUrl = (appBase: string, handle: string) => `${appBase.replace(/\/?$/, '/')}social/profile?u=${encodeURIComponent(handle)}`;

// ---------- workout summary card ----------
export function workoutCard(w: { type: string; title: string; date: string; durationSec: number; distanceM?: number; kcal?: number }, label: string, hybridScore?: number | null): WorkoutCard {
  const c: WorkoutCard = { type: w.type, label, title: (w.title || label).slice(0, 80), date: w.date, durationSec: Math.round(w.durationSec || 0) };
  if (w.distanceM && w.distanceM > 50) { c.distanceM = Math.round(w.distanceM); if (c.durationSec > 0 && ['run', 'walk', 'hyrox', 'hybrid'].includes(w.type)) c.paceSecPerKm = Math.round(c.durationSec / (w.distanceM / 1000)); }
  if (w.kcal) c.kcal = Math.round(w.kcal);
  if (typeof hybridScore === 'number') c.hybridScore = Math.round(hybridScore);
  return c;
}

// ---------- validation for a new post / story ----------
export function validatePost(p: { text: string; photos: number; workout?: boolean }): string | null {
  if (!p.text.trim() && !p.photos && !p.workout) return 'Add a photo, some text or a workout.';
  if ([...p.text].length > POST_MAX) return `Posts are limited to ${POST_MAX.toLocaleString()} characters.`;
  if (p.photos > MAX_POST_PHOTOS) return `Up to ${MAX_POST_PHOTOS} photos per post.`;
  return null;
}
export function checkSocialImage(f: { type: string; size: number }): string | null {
  if (!SOCIAL_IMG_TYPES.includes(f.type)) return 'Only JPEG, PNG or WebP images can be shared.';
  if (f.size > SOCIAL_IMG_MAX_BYTES) return 'That image is too large to share (8 MB max after compression).';
  return null;
}
