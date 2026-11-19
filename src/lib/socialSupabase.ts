// Friends & Stories LIVE backend (Supabase). Tables, RLS, triggers and RPCs are in supabase/schema.sql (SETUP.md §11).
// Every rule that matters (who sees what, blocks, age gate, counters, rate limits) is enforced by the database;
// this client only asks for data and shows what RLS returns.
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  cleanText, isReactionType, normalizeHandle, summarizeReactions, validateDisplayName, validateHandle, COMMENT_MAX, POST_MAX, PUBLIC_BIO_MAX, STORY_TEXT_MAX, REPORT_DETAILS_MAX,
  type Audience, type GraphAction, type PublicProfile, type ReactionType, type ReactionTarget, type Relation, type WorkoutCard,
} from './social';
import type { CommentView, GraphView, NewPost, NewReport, NewStory, NotifView, PostView, ProfileInput, ReactorView, SocialBackend, StoryView } from './socialApi';

export const SOCIAL_BUCKET = 'social-media';
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const PROFILE_COLS = 'id, username, display_name, avatar_path, public_bio, privacy, show_stats, stats, is_minor, friend_count, post_count';
const POST_COLS = `id, author_id, body, workout, audience, reshare_of, like_count, comment_count, share_count, created_at, edited_at,
  author:social_profiles!posts_author_id_fkey(${PROFILE_COLS}), post_media(path, w, h, position)`;
const ts = (s?: string | null) => (s ? Date.parse(s) : 0);
const ext = (b: Blob) => (b.type === 'image/png' ? 'png' : b.type === 'image/webp' ? 'webp' : 'jpg');
const rid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => ((Math.random() * 16) | 0).toString(16)));

export class SupabaseSocial implements SocialBackend {
  readonly kind = 'live' as const;
  private signed = new Map<string, { url: string; exp: number }>();
  private sb: SupabaseClient;
  readonly myId: string;
  constructor(sb: SupabaseClient, myId: string) { this.sb = sb; this.myId = myId; }

  private async q<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
    const { data, error } = await p;
    if (error) throw new Error(error.message);
    return data;
  }
  /** Short-lived signed URLs (the bucket is private; RLS decides who can sign). Cached ~50 min. */
  private async sign(paths: (string | null | undefined)[]): Promise<Map<string, string>> {
    const out = new Map<string, string>(); const need: string[] = []; const now = Date.now();
    for (const p of new Set(paths.filter(Boolean) as string[])) { const c = this.signed.get(p); if (c && c.exp > now) out.set(p, c.url); else need.push(p); }
    if (need.length) {
      const { data } = await this.sb.storage.from(SOCIAL_BUCKET).createSignedUrls(need, 3600);
      for (const d of data || []) if (d.signedUrl && d.path) { out.set(d.path, d.signedUrl); this.signed.set(d.path, { url: d.signedUrl, exp: now + 50 * 60_000 }); }
    }
    return out;
  }
  private profile(r: Row, urls: Map<string, string>): PublicProfile {
    return {
      id: r.id, username: r.username, displayName: r.display_name, avatarUrl: r.avatar_path ? urls.get(r.avatar_path) : undefined,
      publicBio: r.public_bio || undefined, privacy: r.privacy, showStats: !!r.show_stats, stats: r.show_stats ? r.stats || undefined : undefined,
      isMinor: !!r.is_minor, friendCount: r.friend_count || 0, postCount: r.post_count || 0,
    };
  }
  private async profiles(rows: Row[]): Promise<PublicProfile[]> { const urls = await this.sign(rows.map((r) => r.avatar_path)); return rows.map((r) => this.profile(r, urls)); }
  async profilesById(ids: string[]): Promise<Map<string, PublicProfile>> {
    if (!ids.length) return new Map();
    const rows = await this.q(this.sb.from('social_profiles').select(PROFILE_COLS).in('id', [...new Set(ids)]));
    return new Map((await this.profiles(rows as Row[])).map((p) => [p.id, p]));
  }
  private async posts(rows: Row[]): Promise<PostView[]> {
    rows = rows.filter((r) => r.author);
    const ids = rows.map((r) => r.id);
    const origIds = rows.map((r) => r.reshare_of).filter(Boolean) as string[];
    const origRows = origIds.length ? ((await this.q(this.sb.from('posts').select(POST_COLS).in('id', origIds))) as Row[]).filter((r) => r.author) : [];
    const all = [...rows, ...origRows];
    const allIds = [...ids, ...origRows.map((r) => r.id)];
    const [rxRows, saves, urls] = await Promise.all([
      allIds.length ? this.q(this.sb.from('reactions').select('target_id, kind, user_id').eq('target_type', 'post').in('target_id', allIds)) : [],
      allIds.length ? this.q(this.sb.from('saves').select('post_id').eq('user_id', this.myId).in('post_id', allIds)) : [],
      this.sign(all.flatMap((r) => [r.author?.avatar_path, ...(r.post_media || []).map((m: Row) => m.path)])),
    ]);
    const byPost = new Map<string, { type: ReactionType; userId: string }[]>();
    for (const x of rxRows as Row[]) {
      if (!isReactionType(x.kind)) continue;
      const list = byPost.get(x.target_id) || []; list.push({ type: x.kind, userId: x.user_id }); byPost.set(x.target_id, list);
    }
    const saved = new Set((saves as Row[]).map((x) => x.post_id));
    const one = (r: Row): PostView => {
      const rx = byPost.get(r.id) || [];
      const mine = rx.find((x) => x.userId === this.myId)?.type ?? null;
      const summary = summarizeReactions(rx);
      return {
        id: r.id, authorId: r.author_id, text: r.body || '', workout: (r.workout as WorkoutCard) || undefined, audience: r.audience, reshareOf: r.reshare_of || undefined,
        media: [...(r.post_media || [])].sort((a: Row, b: Row) => a.position - b.position).map((m: Row) => ({ url: urls.get(m.path) || '', w: m.w || 1, h: m.h || 1, path: m.path })),
        createdAt: ts(r.created_at), editedAt: r.edited_at ? ts(r.edited_at) : undefined,
        likeCount: summary.total, commentCount: r.comment_count, shareCount: r.share_count,
        author: this.profile(r.author, urls), liked: mine === 'like', myReaction: mine, reactionSummary: summary, saved: saved.has(r.id), mine: r.author_id === this.myId,
      };
    };
    const origMap = new Map(origRows.map((r) => [r.id, one(r)]));
    return rows.map((r) => ({ ...one(r), original: r.reshare_of ? origMap.get(r.reshare_of) ?? null : undefined })).filter((p) => p.original !== null);
  }
  private async upload(path: string, b: Blob) {
    const { error } = await this.sb.storage.from(SOCIAL_BUCKET).upload(path, b, { contentType: b.type || 'image/jpeg', upsert: true, cacheControl: '3600' });
    if (error) throw new Error(error.message);
  }

  async me() {
    const rows = await this.q(this.sb.from('social_profiles').select(PROFILE_COLS).eq('id', this.myId).limit(1));
    return (rows as Row[]).length ? (await this.profiles(rows as Row[]))[0] : null;
  }
  async saveProfile(p: ProfileInput) {
    const h = validateHandle(p.username); if (!h.ok) throw new Error(h.error);
    const n = validateDisplayName(p.displayName); if (!n.ok) throw new Error(n.error);
    const bio = cleanText(p.publicBio || '', PUBLIC_BIO_MAX) || null;
    const { error } = await this.sb.rpc('social_create_profile', { p_username: h.handle, p_display_name: n.value, p_birth_date: p.dob, p_privacy: p.privacy, p_public_bio: bio });
    if (error) throw new Error(error.message);
    let avatar_path: string | null = null;
    if (p.useAvatar && p.avatar) { avatar_path = `${this.myId}/avatar.${ext(p.avatar)}`; await this.upload(avatar_path, p.avatar); this.signed.delete(avatar_path); }
    else if (p.useAvatar) avatar_path = ((await this.q(this.sb.from('social_profiles').select('avatar_path').eq('id', this.myId).single())) as Row)?.avatar_path ?? null;
    await this.q(this.sb.from('social_profiles').update({ show_stats: p.showStats, stats: p.showStats ? p.stats ?? null : null, avatar_path }).eq('id', this.myId));
    if (!p.useAvatar) await this.sb.storage.from(SOCIAL_BUCKET).remove([`${this.myId}/avatar.webp`, `${this.myId}/avatar.jpg`, `${this.myId}/avatar.png`]);
    return (await this.me())!;
  }
  async deleteProfile() {
    for (const dir of ['posts', 'stories']) {
      const { data } = await this.sb.storage.from(SOCIAL_BUCKET).list(`${this.myId}/${dir}`, { limit: 1000 });
      if (dir === 'posts') for (const f of data || []) { const { data: inner } = await this.sb.storage.from(SOCIAL_BUCKET).list(`${this.myId}/posts/${f.name}`); if (inner?.length) await this.sb.storage.from(SOCIAL_BUCKET).remove(inner.map((x) => `${this.myId}/posts/${f.name}/${x.name}`)); }
      else if (data?.length) await this.sb.storage.from(SOCIAL_BUCKET).remove(data.map((x) => `${this.myId}/stories/${x.name}`));
    }
    await this.sb.storage.from(SOCIAL_BUCKET).remove([`${this.myId}/avatar.webp`, `${this.myId}/avatar.jpg`, `${this.myId}/avatar.png`]);
    await this.q(this.sb.from('social_profiles').delete().eq('id', this.myId));
  }
  async handleAvailable(h: string) { const { data, error } = await this.sb.rpc('social_handle_available', { p_username: normalizeHandle(h) }); if (error) throw new Error(error.message); return !!data; }
  async search(q: string) {
    const n = normalizeHandle(q).replace(/[^\p{L}\p{N}._ -]/gu, '').replace(/[_]/g, '\\_').slice(0, 30);
    if (n.length < 2) return [];
    const rows = await this.q(this.sb.from('social_profiles').select(PROFILE_COLS).or(`username.ilike."${n}%",display_name.ilike."%${n}%"`).neq('id', this.myId).limit(20));
    return this.profiles(rows as Row[]);
  }
  async suggestions() {
    // People your friends interact with isn't exposed by RLS (by design); suggest recently active public profiles instead.
    const rows = await this.q(this.sb.from('social_profiles').select(PROFILE_COLS).eq('privacy', 'public').neq('id', this.myId).order('post_count', { ascending: false }).limit(12));
    const g = await this.graph();
    const skip = new Set([...g.friends.map((f) => f.id), ...g.incoming.map((r) => r.user.id), ...g.outgoing.map((r) => r.user.id)]);
    return (await this.profiles(rows as Row[])).filter((p) => !skip.has(p.id));
  }
  async profileByHandle(h: string) {
    const rows = await this.q(this.sb.from('social_profiles').select(PROFILE_COLS).eq('username', normalizeHandle(h)).limit(1));
    return (rows as Row[]).length ? (await this.profiles(rows as Row[]))[0] : null;
  }
  async relationTo(id: string): Promise<Relation> {
    if (id === this.myId) return 'self';
    const [b, f, r] = await Promise.all([
      this.q(this.sb.from('blocks').select('blocked_id').eq('blocker_id', this.myId).eq('blocked_id', id)),
      this.q(this.sb.from('friendships').select('user_a').eq('user_a', this.myId < id ? this.myId : id).eq('user_b', this.myId < id ? id : this.myId)),
      this.q(this.sb.from('friend_requests').select('sender_id').eq('status', 'pending').or(`and(sender_id.eq.${this.myId},receiver_id.eq.${id}),and(sender_id.eq.${id},receiver_id.eq.${this.myId})`)),
    ]);
    if ((b as Row[]).length) return 'blocked';
    if ((f as Row[]).length) return 'friends';
    if ((r as Row[]).length) return (r as Row[])[0].sender_id === this.myId ? 'outgoing' : 'incoming';
    return 'none';
  }
  async graph(): Promise<GraphView> {
    const [fr, rq, bl] = await Promise.all([
      this.q(this.sb.from('friendships').select('user_a, user_b').or(`user_a.eq.${this.myId},user_b.eq.${this.myId}`)),
      this.q(this.sb.from('friend_requests').select('id, sender_id, receiver_id, created_at').eq('status', 'pending')),
      this.sb.rpc('social_my_blocks'),
    ]);
    const friendIds = (fr as Row[]).map((r) => (r.user_a === this.myId ? r.user_b : r.user_a));
    const reqs = rq as Row[];
    const map = await this.profilesById([...friendIds, ...reqs.map((r) => (r.sender_id === this.myId ? r.receiver_id : r.sender_id))]);
    return {
      friends: friendIds.map((id) => map.get(id)).filter((p): p is PublicProfile => !!p).sort((a, b) => a.displayName.localeCompare(b.displayName)),
      incoming: reqs.filter((r) => r.receiver_id === this.myId && map.get(r.sender_id)).map((r) => ({ id: r.id, user: map.get(r.sender_id)!, createdAt: ts(r.created_at), direction: 'in' as const })),
      outgoing: reqs.filter((r) => r.sender_id === this.myId && map.get(r.receiver_id)).map((r) => ({ id: r.id, user: map.get(r.receiver_id)!, createdAt: ts(r.created_at), direction: 'out' as const })),
      blocked: ((bl.data || []) as Row[]).map((r) => ({ id: r.id, username: r.username, displayName: r.display_name, privacy: 'friends' as const, showStats: false, friendCount: 0, postCount: 0 })),
    };
  }
  async act(a: GraphAction) {
    const call = async (fn: string, args: Row) => { const { data, error } = await this.sb.rpc(fn, args); if (error) throw new Error(error.message); return (data as string) || 'ok'; };
    switch (a.type) {
      case 'send': return call('social_send_request', { p_to: a.to });
      case 'cancel': return call('social_cancel_request', { p_to: a.to });
      case 'accept': return call('social_respond_request', { p_from: a.from, p_accept: true });
      case 'decline': return call('social_respond_request', { p_from: a.from, p_accept: false });
      case 'unfriend': return call('social_unfriend', { p_other: a.other });
      case 'block': return call('social_block', { p_other: a.other });
      case 'unblock': return call('social_unblock', { p_other: a.other });
    }
  }
  async feed() { return this.posts((await this.q(this.sb.from('posts').select(POST_COLS).order('created_at', { ascending: false }).limit(40))) as Row[]); }
  async userPosts(id: string) { return this.posts((await this.q(this.sb.from('posts').select(POST_COLS).eq('author_id', id).order('created_at', { ascending: false }).limit(40))) as Row[]); }
  async post(id: string) { const rows = (await this.q(this.sb.from('posts').select(POST_COLS).eq('id', id).limit(1))) as Row[]; return (await this.posts(rows))[0] || null; }
  async createPost(np: NewPost) {
    const id = rid();
    const body = cleanText(np.text, POST_MAX);
    await this.q(this.sb.from('posts').insert({ id, author_id: this.myId, body, workout: np.workout ?? null, audience: np.audience, reshare_of: np.reshareOf ?? null }));
    const paths: string[] = [];
    try {
      for (const [i, im] of np.images.slice(0, 4).entries()) {
        const path = `${this.myId}/posts/${id}/${i}.${ext(im.blob)}`;
        await this.upload(path, im.blob); paths.push(path);
        await this.q(this.sb.from('post_media').insert({ post_id: id, author_id: this.myId, path, w: im.w, h: im.h, position: i }));
      }
    } catch (e) {
      if (paths.length) await this.sb.storage.from(SOCIAL_BUCKET).remove(paths);
      await this.sb.from('posts').delete().eq('id', id);
      throw e;
    }
    return id;
  }
  async editPost(id: string, text: string, audience: Audience) { await this.q(this.sb.from('posts').update({ body: cleanText(text, POST_MAX), audience }).eq('id', id).eq('author_id', this.myId)); }
  async deletePost(id: string) {
    const media = (await this.q(this.sb.from('post_media').select('path').eq('post_id', id))) as Row[];
    await this.q(this.sb.from('posts').delete().eq('id', id).eq('author_id', this.myId));
    if (media.length) await this.sb.storage.from(SOCIAL_BUCKET).remove(media.map((m) => m.path));
  }
  async setLike(id: string, on: boolean) { return this.setReaction('post', id, on ? 'like' : null); }
  async setReaction(targetType: ReactionTarget, targetId: string, type: ReactionType | null) {
    if (!type) {
      await this.q(this.sb.from('reactions').delete().eq('user_id', this.myId).eq('target_type', targetType).eq('target_id', targetId));
      return;
    }
    const row = { user_id: this.myId, target_type: targetType, target_id: targetId, kind: type };
    const { error } = await this.sb.from('reactions').upsert(row, { onConflict: 'user_id,target_type,target_id' });
    if (error) throw new Error(error.message);
  }
  async listReactions(targetType: ReactionTarget, targetId: string): Promise<ReactorView[]> {
    const rows = (await this.q(this.sb.from('reactions').select(`kind, created_at, user_id, user:social_profiles!reactions_user_id_fkey(${PROFILE_COLS})`)
      .eq('target_type', targetType).eq('target_id', targetId).order('created_at', { ascending: false }))) as Row[];
    const urls = await this.sign(rows.map((r) => r.user?.avatar_path));
    return rows.filter((r) => r.user && isReactionType(r.kind)).map((r) => ({ user: this.profile(r.user, urls), type: r.kind as ReactionType, createdAt: ts(r.created_at) }));
  }
  async setSave(id: string, on: boolean) {
    if (on) { const { error } = await this.sb.from('saves').insert({ post_id: id, user_id: this.myId }); if (error && !/duplicate/.test(error.message)) throw new Error(error.message); }
    else await this.q(this.sb.from('saves').delete().eq('post_id', id).eq('user_id', this.myId));
  }
  async hidePost(id: string) { const { error } = await this.sb.from('hidden_posts').insert({ post_id: id, user_id: this.myId }); if (error && !/duplicate/.test(error.message)) throw new Error(error.message); }
  async saved() {
    const s = (await this.q(this.sb.from('saves').select('post_id, created_at').eq('user_id', this.myId).order('created_at', { ascending: false }).limit(60))) as Row[];
    if (!s.length) return [];
    const rows = (await this.q(this.sb.from('posts').select(POST_COLS).in('id', s.map((x) => x.post_id)))) as Row[];
    const order = new Map(s.map((x, i) => [x.post_id, i]));
    return (await this.posts(rows)).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  }
  async comments(postId: string): Promise<CommentView[]> {
    const rows = (await this.q(this.sb.from('comments').select(`id, post_id, author_id, body, created_at, author:social_profiles!comments_author_id_fkey(${PROFILE_COLS})`).eq('post_id', postId).order('created_at').limit(200))) as Row[];
    const ids = rows.map((r) => r.id);
    const [urls, rxRows] = await Promise.all([
      this.sign(rows.map((r) => r.author?.avatar_path)),
      ids.length ? this.q(this.sb.from('reactions').select('target_id, kind, user_id').eq('target_type', 'comment').in('target_id', ids)) : [],
    ]);
    const byC = new Map<string, { type: ReactionType; userId: string }[]>();
    for (const x of rxRows as Row[]) {
      if (!isReactionType(x.kind)) continue;
      const list = byC.get(x.target_id) || []; list.push({ type: x.kind, userId: x.user_id }); byC.set(x.target_id, list);
    }
    return rows.filter((r) => r.author).map((r) => {
      const rx = byC.get(r.id) || [];
      const mine = rx.find((x) => x.userId === this.myId)?.type ?? null;
      return { id: r.id, postId: r.post_id, authorId: r.author_id, text: r.body, createdAt: ts(r.created_at), author: this.profile(r.author, urls), myReaction: mine, reactionSummary: summarizeReactions(rx) };
    });
  }
  async addComment(postId: string, text: string) {
    const body = cleanText(text, COMMENT_MAX); if (!body) throw new Error('Write something first.');
    await this.q(this.sb.from('comments').insert({ post_id: postId, author_id: this.myId, body }));
  }
  async deleteComment(id: string) { await this.q(this.sb.from('comments').delete().eq('id', id)); }
  async stories(): Promise<StoryView[]> {
    const rows = (await this.q(this.sb.from('stories').select(`id, author_id, body, bg, media_path, w, h, audience, created_at, expires_at, author:social_profiles!stories_author_id_fkey(${PROFILE_COLS})`)
      .gt('expires_at', new Date().toISOString()).order('created_at').limit(200))) as Row[];
    const urls = await this.sign(rows.flatMap((r) => [r.media_path, r.author?.avatar_path]));
    return rows.filter((r) => r.author).map((r) => ({
      id: r.id, authorId: r.author_id, text: r.body || undefined, bg: r.bg || undefined, audience: r.audience, createdAt: ts(r.created_at), expiresAt: ts(r.expires_at),
      media: r.media_path ? { url: urls.get(r.media_path) || '', w: r.w || 1, h: r.h || 1, path: r.media_path } : undefined, author: this.profile(r.author, urls),
    }));
  }
  async createStory(ns: NewStory) {
    const id = rid(); let media_path: string | null = null;
    if (ns.image) { media_path = `${this.myId}/stories/${id}.${ext(ns.image.blob)}`; await this.upload(media_path, ns.image.blob); }
    const body = cleanText(ns.text || '', STORY_TEXT_MAX) || null;
    const { error } = await this.sb.from('stories').insert({ id, author_id: this.myId, body, bg: ns.bg ?? null, media_path, w: ns.image?.w ?? null, h: ns.image?.h ?? null, audience: ns.audience });
    if (error) { if (media_path) await this.sb.storage.from(SOCIAL_BUCKET).remove([media_path]); throw new Error(error.message); }
  }
  async deleteStory(id: string) {
    const rows = (await this.q(this.sb.from('stories').select('media_path').eq('id', id).eq('author_id', this.myId))) as Row[];
    await this.q(this.sb.from('stories').delete().eq('id', id).eq('author_id', this.myId));
    const p = rows[0]?.media_path; if (p) await this.sb.storage.from(SOCIAL_BUCKET).remove([p]);
  }
  async notifications(): Promise<NotifView[]> {
    const rows = (await this.q(this.sb.from('notifications').select(`id, user_id, actor_id, type, post_id, comment_id, reaction, read_at, created_at, actor:social_profiles!notifications_actor_id_fkey(${PROFILE_COLS}), post:posts(body)`)
      .eq('user_id', this.myId).order('created_at', { ascending: false }).limit(80))) as Row[];
    const urls = await this.sign(rows.map((r) => r.actor?.avatar_path));
    return rows.filter((r) => r.actor).map((r) => ({
      id: r.id, userId: r.user_id, actorId: r.actor_id, type: r.type, postId: r.post_id || undefined, commentId: r.comment_id || undefined, reaction: isReactionType(r.reaction || '') ? r.reaction : undefined, read: !!r.read_at, createdAt: ts(r.created_at),
      actor: this.profile(r.actor, urls), postPreview: r.post?.body ? String(r.post.body).slice(0, 60) : undefined,
    }));
  }
  async markAllRead() { await this.q(this.sb.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', this.myId).is('read_at', null).neq('type', 'friend_request')); }
  async report(r: NewReport) {
    await this.q(this.sb.from('reports').insert({ target_type: r.targetType, target_id: r.targetId, reason: r.reason, details: r.details ? cleanText(r.details, REPORT_DETAILS_MAX) : null }));
  }
  /** Live badge: new notifications arrive over Supabase Realtime (RLS applies). Returns an unsubscribe function. */
  subscribe(onChange: () => void): () => void {
    const ch = this.sb.channel(`notif:${this.myId}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${this.myId}` }, onChange).subscribe();
    return () => { this.sb.removeChannel(ch); };
  }
}
