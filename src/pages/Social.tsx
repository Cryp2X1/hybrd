// Friends & Stories pages: feed (+ stories ring), create post / story, post + comments, friends (list, requests, find,
// invite, blocked), notifications, saved, public profiles, profile setup, community rules and the /invite landing.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Page, Card, Empty, Sheet, Segmented } from '../components/ui';
import { Icon } from '../components/Icon';
import {
  DemoBanner, SocialGate, SocialTabs, PostCard, StoriesRing, StoryViewer, SAvatar, Who, UserRow, RelButton, ReportSheet, WorkoutCardView, SampleTag,
} from '../components/Social';
import { useSocial } from '../lib/socialStore';
import { useStore } from '../lib/store';
import { useMedia, useGalleryUrl } from '../lib/gallery';
import { useToast } from '../lib/toast';
import { appUrl } from '../lib/config';
import { activityLabel, hybridScore, streak, fmtTime, todayKey } from '../lib/calc';
import { filterItems, type GalleryItem } from '../lib/media';
import {
  ageFromDob, ageGate, cleanText, COMMENT_MAX, inviteUrl, MAX_POST_PHOTOS, notifText, POST_MAX, PUBLIC_BIO_MAX, STORY_TEXT_MAX,
  suggestHandle, timeAgo, validateDisplayName, validateHandle, validatePost, workoutCard, canDeleteComment, compact,
  type Audience, type Privacy, type PublicProfile, type Relation, type WorkoutCard,
} from '../lib/social';
import { friendlyError, type CommentView, type PostView, type StoryView, type NotifView } from '../lib/socialApi';
import { prepareSocialImage, type PreparedImg } from '../lib/socialImage';
import { STORY_BGS } from '../lib/socialArt';
import type { Workout } from '../lib/types';

function Shell({ title, kicker = 'Friends & Stories', back, children, tabs = true, needProfile = true }: { title: string; kicker?: string; back?: string | boolean; children: React.ReactNode; tabs?: boolean; needProfile?: boolean }) {
  const { me } = useSocial();
  return (
    <Page title={title} kicker={kicker} back={back} wide>
      <DemoBanner />
      <SocialGate needProfile={needProfile}>
        {tabs && me && <SocialTabs />}
        {children}
      </SocialGate>
    </Page>
  );
}

// ======================================================================= Feed
export function SocialFeed() {
  return <Shell title="Social"><FeedInner /></Shell>;
}
function FeedInner() {
  const { backend, me, graph } = useSocial();
  const [posts, setPosts] = useState<PostView[] | null>(null);
  const [stories, setStories] = useState<StoryView[]>([]);
  const [viewer, setViewer] = useState<string | null>(null);
  const [sp, setSp] = useSearchParams();
  const load = useCallback(async () => {
    if (!backend) return;
    const [f, s] = await Promise.all([backend.feed(), backend.stories()]);
    setPosts(f); setStories(s);
  }, [backend]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const a = sp.get('story'); if (a && stories.length) { setViewer(a === 'me' ? me!.id : a); sp.delete('story'); setSp(sp, { replace: true }); } }, [sp, stories.length]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="s-layout">
      <div>
        <StoriesRing stories={stories} onOpen={setViewer} />
        <Card className="s-compose-cta">
          <Link to="/social/new" className="row" data-testid="compose"><SAvatar p={me} size={40} /><span className="s-compose-ph">Share a workout, photo or thought…</span></Link>
          <div className="s-compose-q">
            <Link to="/social/new?photo=1"><Icon name="image" size={18} />Photo</Link>
            <Link to="/social/new?workout=1"><Icon name="bolt" size={18} />Workout</Link>
            <Link to="/social/new?story=1"><Icon name="plus" size={18} />Story</Link>
          </div>
        </Card>
        {posts === null ? <div className="muted" style={{ padding: 20 }}>Loading feed…</div>
          : posts.length ? posts.map((p) => <PostCard key={p.id} post={p} onRemoved={(id) => setPosts((x) => (x || []).filter((q) => q.id !== id && q.original?.id !== id))} />)
          : <Card><Empty icon="users" title="Your feed is quiet">Add friends or follow public athletes to see their training here. <Link className="link" to="/social/friends?tab=find">Find people →</Link></Empty></Card>}
      </div>
      <aside className="s-side">
        {!!graph?.incoming.length && (
          <Card><div className="card-head"><h3>Friend requests</h3><Link to="/social/friends?tab=requests">See all →</Link></div>
            {graph.incoming.slice(0, 3).map((r) => <UserRow key={r.id} p={r.user} sub={timeAgo(r.createdAt)} right={<RelButton p={r.user} rel="incoming" />} />)}</Card>
        )}
        <InviteCard />
        <Card><div className="card-head"><h3>Your circle</h3><Link to="/social/friends">Friends →</Link></div>
          <div className="s-counts"><div><b>{compact(graph?.friends.length || 0)}</b><span>Friends</span></div><div><b>{compact(me?.postCount || 0)}</b><span>Posts</span></div><div><b>{compact(graph?.outgoing.length || 0)}</b><span>Sent</span></div></div>
          <Link className="link small" to="/social/rules">Community rules</Link>
        </Card>
      </aside>
      {viewer && <StoryViewer stories={stories} startAuthor={viewer} onClose={() => setViewer(null)} onDeleted={load} />}
    </div>
  );
}

export function InviteCard() {
  const { me, mode } = useSocial();
  const toast = useToast();
  if (!me) return null;
  const url = inviteUrl(appUrl(), me.username);
  return (
    <Card className="s-invite" >
      <div className="card-head"><h3>Invite friends</h3><Icon name="send" size={18} /></div>
      <p className="muted small">Send your link. It opens your HYBRD profile with an <b>Add friend</b> button after they sign in.</p>
      <div className="s-link mono" data-testid="invite-link">{url.replace(/^https?:\/\//, '')}</div>
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn sm" onClick={async () => { try { await navigator.clipboard.writeText(url); toast('Invite link copied'); } catch { toast(url); } }}><Icon name="link" size={16} />Copy link</button>
        {'share' in navigator && <button className="btn sm y" onClick={() => navigator.share({ title: 'Train with me on HYBRD', text: `Add me on HYBRD: @${me.username}`, url }).catch(() => {})}><Icon name="share" size={16} />Share</button>}
      </div>
      {mode === 'demo' && <p className="muted small" style={{ marginTop: 8 }}>Demo: invite links start working once accounts are turned on.</p>}
    </Card>
  );
}

// ======================================================================= Create
export function SocialCreate() {
  return <Shell title="Create" back="/social" tabs={false}><CreateInner /></Shell>;
}
function CreateInner() {
  const { backend, me, refresh } = useSocial();
  const { data, profile } = useStore();
  const toast = useToast();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const [kind, setKind] = useState<'post' | 'story'>(sp.get('story') ? 'story' : 'post');
  const [text, setText] = useState('');
  const [imgs, setImgs] = useState<PreparedImg[]>([]);
  const [workout, setWorkout] = useState<WorkoutCard | undefined>();
  const locked = !!me && (me.privacy === 'friends' || !!me.isMinor);
  const [audience, setAudience] = useState<Audience>(locked ? 'friends' : 'friends');
  const [bg, setBg] = useState(STORY_BGS[0]);
  const [pickW, setPickW] = useState(!!sp.get('workout'));
  const [pickG, setPickG] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [reshare, setReshare] = useState<PostView | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const reshareId = sp.get('reshare');
  useEffect(() => { if (reshareId && backend) backend.post(reshareId).then(setReshare); }, [reshareId, backend]);
  useEffect(() => { if (sp.get('photo')) window.setTimeout(() => file.current?.click(), 300); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const max = kind === 'story' ? 1 : MAX_POST_PHOTOS;
  const add = async (files: (Blob & { name?: string })[]) => {
    setErr('');
    const room = max - imgs.length;
    if (files.length > room) setErr(kind === 'story' ? 'A story has one photo.' : `Up to ${MAX_POST_PHOTOS} photos per post.`);
    const out: PreparedImg[] = [];
    for (const f of files.slice(0, Math.max(0, room))) { try { out.push(await prepareSocialImage(f)); } catch (e) { setErr((e as Error).message); } }
    if (out.some((x) => x.hadGps)) toast('Location data removed from your photo');
    setImgs((x) => (kind === 'story' ? out.slice(0, 1) : [...x, ...out]));
  };
  const score = useMemo(() => hybridScore(data, profile).score, [data, profile]);
  const submit = async () => {
    if (!backend) return;
    setErr('');
    if (kind === 'post') {
      const v = reshare ? null : validatePost({ text, photos: imgs.length, workout: !!workout });
      if (v) return setErr(v);
    } else if (!text.trim() && !imgs.length) return setErr('Add a photo or some text.');
    setBusy(true);
    try {
      if (kind === 'post') await backend.createPost({ text, images: imgs, workout, audience, reshareOf: reshare?.id });
      else await backend.createStory({ text, bg: imgs.length ? undefined : bg, image: imgs[0], audience });
      await refresh();
      toast(kind === 'post' ? 'Posted' : 'Story shared for 24 hours');
      nav(kind === 'story' ? '/social?story=me' : '/social');
    } catch (e) { setErr(friendlyError(e)); } finally { setBusy(false); }
  };
  const cleaned = cleanText(text, kind === 'post' ? POST_MAX : STORY_TEXT_MAX);
  const masked = text.trim() && cleaned !== text.trim().slice(0, kind === 'post' ? POST_MAX : STORY_TEXT_MAX) && /\*/.test(cleaned);
  return (
    <div className="s-create" data-testid="create">
      {!reshare && <Segmented value={kind} onChange={(v) => { setKind(v); setImgs((x) => (v === 'story' ? x.slice(0, 1) : x)); }} options={[{ v: 'post', label: 'Post' }, { v: 'story', label: 'Story · 24h' }]} />}
      <Card>
        <div className="row" style={{ marginBottom: 10 }}><SAvatar p={me} size={40} /><Who p={me!} to={false} /></div>
        {kind === 'story' && !imgs.length ? (
          <div className="s-story-edit" style={{ background: bg }}>
            <textarea value={text} maxLength={STORY_TEXT_MAX} onChange={(e) => setText(e.target.value)} placeholder="Type your story…" aria-label="Story text" className={bg === '#FFE600' ? 'dark' : ''} />
          </div>
        ) : (
          <textarea className="input s-ta" value={text} maxLength={kind === 'post' ? POST_MAX : STORY_TEXT_MAX} onChange={(e) => setText(e.target.value)}
            placeholder={reshare ? 'Add a thought (optional)…' : kind === 'post' ? 'How did training go?' : 'Add a caption…'} aria-label="Post text" rows={4} data-testid="post-text" />
        )}
        <div className="muted small s-count">{[...text].length}/{kind === 'post' ? POST_MAX.toLocaleString() : STORY_TEXT_MAX}{masked && <span> · Some words will be hidden by the profanity filter</span>}</div>
        {kind === 'story' && !imgs.length && <div className="s-bgs">{STORY_BGS.map((c) => <button key={c} aria-label={`Background ${c}`} className={bg === c ? 'on' : ''} style={{ background: c }} onClick={() => setBg(c)} />)}</div>}
        {!!imgs.length && (
          <div className={`s-previews n${imgs.length}`}>
            {imgs.map((im, i) => <div key={i} className="s-prev"><img src={im.preview} alt={`Selected photo ${i + 1}`} /><button className="icon-btn" aria-label="Remove photo" onClick={() => setImgs((x) => x.filter((_, j) => j !== i))}><Icon name="x" size={16} /></button></div>)}
          </div>
        )}
        {workout && kind === 'post' && <div className="s-attached"><WorkoutCardView w={workout} /><button className="link" onClick={() => setWorkout(undefined)}>Remove workout</button></div>}
        {reshare && <div className="s-quote"><div className="row"><SAvatar p={reshare.author} size={24} /><Who p={reshare.author} sub={timeAgo(reshare.createdAt)} to={false} /></div>{reshare.text && <div className="s-text clamp small">{reshare.text}</div>}{reshare.workout && <WorkoutCardView w={reshare.workout} compactView />}</div>}
        {!reshare && (
          <div className="s-tools">
            <button className="chip" onClick={() => file.current?.click()} disabled={imgs.length >= max}><Icon name="camera" size={16} />Photo</button>
            <button className="chip" onClick={() => setPickG(true)} disabled={imgs.length >= max}><Icon name="image" size={16} />From Gallery</button>
            {kind === 'post' && <button className="chip" onClick={() => setPickW(true)} data-testid="attach-workout"><Icon name="bolt" size={16} />{workout ? 'Change workout' : 'Workout'}</button>}
            <input ref={file} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple={kind === 'post'} hidden onChange={(e) => { add([...(e.target.files || [])]); e.target.value = ''; }} data-testid="photo-input" />
          </div>
        )}
        <div className="s-aud-pick">
          <span className="muted small">Who can see this</span>
          <Segmented small value={audience} onChange={(v) => !locked && setAudience(v)} options={[{ v: 'friends', label: 'Friends' }, { v: 'public', label: 'Public' }]} />
        </div>
        {locked && <p className="muted small">{me?.isMinor ? 'Under 18: posts are shared with friends only.' : 'Your profile is friends-only, so everything you share goes to friends.'}</p>}
        <p className="muted small">Photos are re-saved without location or camera data. {kind === 'story' ? 'Stories disappear after 24 hours.' : ''}</p>
        {err && <div className="s-err" role="alert">{err}</div>}
        <button className="btn y block big" disabled={busy} onClick={submit} data-testid="publish">{busy ? 'Sharing…' : kind === 'story' ? 'Share story' : reshare ? 'Share to feed' : 'Post'}</button>
      </Card>
      <Sheet open={pickW} onClose={() => setPickW(false)} title="Attach a workout">
        <WorkoutPicker workouts={data.workouts} onPick={(w) => { setWorkout(workoutCard(w, activityLabel(w), score)); setPickW(false); }} />
        {score !== null && <p className="muted small">Your current Hybrid Score ({score}) is added to the card.</p>}
      </Sheet>
      <Sheet open={pickG} onClose={() => setPickG(false)} title="From your Gallery">
        <GalleryPicker onPick={async (b) => { setPickG(false); await add([b]); }} />
      </Sheet>
    </div>
  );
}
function WorkoutPicker({ workouts, onPick }: { workouts: Workout[]; onPick: (w: Workout) => void }) {
  const list = workouts.filter((w) => !w.deleted && w.type !== 'rest').sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 25);
  if (!list.length) return <Empty icon="bolt" title="No workouts yet">Log or record a workout first. <Link className="link" to="/train/log">Log a workout →</Link></Empty>;
  return (
    <div className="s-wpick">{list.map((w) => (
      <button key={w.id} onClick={() => onPick(w)} data-testid="pick-workout">
        <span className="pill">{activityLabel(w)}</span><span className="s-wpick-t"><b>{w.title}</b><span className="muted small">{new Date(w.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · {fmtTime(w.durationSec)}{w.distanceM ? ` · ${(w.distanceM / 1000).toFixed(1)} km` : ''}</span></span><Icon name="plus" size={18} />
      </button>
    ))}</div>
  );
}
function GThumb({ it, onPick }: { it: GalleryItem; onPick: (b: Blob) => void }) {
  const u = useGalleryUrl(it, 'thumb');
  const { getBlob } = useMedia();
  return <button className="g-tile" onClick={async () => { const b = await getBlob(it, 'disp'); if (b) onPick(b); }}>{u ? <img src={u} alt="" /> : <Icon name="image" />}</button>;
}
function GalleryPicker({ onPick }: { onPick: (b: Blob) => void }) {
  const { items } = useMedia();
  const list = filterItems(items, 'all');
  if (!list.length) return <Empty icon="image" title="Your Gallery is empty">Add photos in <Link className="link" to="/me/gallery">Me › Gallery</Link> first.</Empty>;
  return <><p className="muted small">Only the photo you pick is shared. The rest of your Gallery stays private.</p><div className="s-gpick">{list.slice(0, 60).map((it) => <GThumb key={it.id} it={it} onPick={onPick} />)}</div></>;
}

// ======================================================================= Post + comments
export function SocialPostPage() {
  return <Shell title="Post" back tabs={false}><PostInner /></Shell>;
}
function PostInner() {
  const { backend, me } = useSocial();
  const [sp] = useSearchParams();
  const id = sp.get('id') || '';
  const toast = useToast();
  const nav = useNavigate();
  const [post, setPost] = useState<PostView | null | undefined>();
  const [comments, setComments] = useState<CommentView[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<CommentView | null>(null);
  const load = useCallback(async () => {
    if (!backend) return;
    const [p, c] = await Promise.all([backend.post(id), backend.comments(id)]);
    setPost(p); setComments(c);
  }, [backend, id]);
  useEffect(() => { load(); }, [load]);
  if (post === undefined) return <div className="muted" style={{ padding: 20 }}>Loading…</div>;
  if (post === null) return <Card><Empty icon="lock" title="Post not available">It may have been deleted, or it’s shared with friends only.</Empty></Card>;
  const send = async () => {
    if (!backend || !text.trim()) return;
    setBusy(true);
    try { await backend.addComment(post.id, text); setText(''); await load(); } catch (e) { toast(friendlyError(e)); } finally { setBusy(false); }
  };
  return (
    <div className="s-detail">
      <PostCard post={post} detail onRemoved={() => nav('/social')} onChange={setPost} />
      <Card className="s-comments" >
        <h3 style={{ marginBottom: 10 }}>Comments · {comments.length}</h3>
        {!comments.length && <p className="muted small">No comments yet. Say something encouraging.</p>}
        {comments.map((c) => (
          <div key={c.id} className="s-comment" data-testid="comment">
            <Link to={`/social/profile?u=${encodeURIComponent(c.author.username)}`}><SAvatar p={c.author} size={34} /></Link>
            <div className="s-comment-b">
              <div className="s-comment-h"><b>{c.author.displayName}</b>{c.author.sample && <SampleTag />}<span className="muted small">@{c.author.username} · {timeAgo(c.createdAt)}</span></div>
              <div className="s-text">{c.text}</div>
              <div className="s-comment-a">
                {canDeleteComment(c, post, me!.id) && <button onClick={async () => { if (!confirm('Delete this comment?')) return; try { await backend!.deleteComment(c.id); await load(); toast('Comment deleted'); } catch (e) { toast(friendlyError(e)); } }}>Delete</button>}
                {c.authorId !== me!.id && <button onClick={() => setReport(c)}>Report</button>}
              </div>
            </div>
          </div>
        ))}
        <div className="s-reply">
          <SAvatar p={me} size={34} />
          <textarea className="input" value={text} maxLength={COMMENT_MAX} onChange={(e) => setText(e.target.value)} placeholder="Add a comment…" aria-label="Add a comment" rows={1} data-testid="comment-input"
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
          <button className="icon-btn y" aria-label="Send comment" disabled={busy || !text.trim()} onClick={send} data-testid="comment-send"><Icon name="send" size={18} /></button>
        </div>
      </Card>
      {report && <ReportSheet target={{ type: 'comment', id: report.id, who: report.author }} onClose={() => setReport(null)} onBlocked={load} />}
    </div>
  );
}

// ======================================================================= Friends
export function SocialFriends() {
  return <Shell title="Friends"><FriendsInner /></Shell>;
}
function FriendsInner() {
  const { graph, backend, refresh } = useSocial();
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get('tab') as 'friends' | 'requests' | 'find' | 'blocked') || 'friends';
  const setTab = (t: string) => setSp({ tab: t }, { replace: true });
  const [q, setQ] = useState('');
  const [results, setResults] = useState<PublicProfile[] | null>(null);
  const [sugg, setSugg] = useState<PublicProfile[]>([]);
  const [rels, setRels] = useState<Record<string, Relation>>({});
  const [menu, setMenu] = useState<PublicProfile | null>(null);
  const [report, setReport] = useState<PublicProfile | null>(null);
  const toast = useToast();
  useEffect(() => { refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (tab === 'find' && backend) backend.suggestions().then(setSugg); }, [tab, backend, graph]);
  useEffect(() => {
    if (!backend) return;
    if (q.trim().length < 2) { setResults(null); return; }
    const t = window.setTimeout(async () => { setResults(await backend.search(q)); }, 250);
    return () => window.clearTimeout(t);
  }, [q, backend, graph]);
  useEffect(() => {
    const ppl = [...(results || []), ...sugg];
    if (!backend || !ppl.length) return;
    Promise.all(ppl.map(async (p) => [p.id, await backend.relationTo(p.id)] as const)).then((x) => setRels(Object.fromEntries(x)));
  }, [results, sugg, backend, graph]);
  if (!graph) return null;
  const act = async (a: Parameters<NonNullable<typeof backend>['act']>[0], ok: string) => { setMenu(null); try { await backend!.act(a); toast(ok); await refresh(); } catch (e) { toast(friendlyError(e)); } };
  return (
    <div className="s-layout">
      <div>
        <Segmented value={tab} onChange={setTab} options={[
          { v: 'friends', label: `Friends · ${graph.friends.length}` },
          { v: 'requests', label: `Requests${graph.incoming.length ? ` · ${graph.incoming.length}` : ''}` },
          { v: 'find', label: 'Find' },
          { v: 'blocked', label: 'Blocked' },
        ]} />
        {tab === 'friends' && (
          <Card>
            {graph.friends.length ? graph.friends.map((p) => <UserRow key={p.id} p={p} right={<button className="icon-btn" aria-label={`Options for ${p.displayName}`} onClick={() => setMenu(p)}><Icon name="more" stroke={3.2} /></button>} />)
              : <Empty icon="users" title="No friends yet">Find people or share your invite link. <button className="link" onClick={() => setTab('find')}>Find people →</button></Empty>}
          </Card>
        )}
        {tab === 'requests' && (
          <>
            <Card><h3 style={{ marginBottom: 8 }}>Received · {graph.incoming.length}</h3>
              {graph.incoming.length ? graph.incoming.map((r) => <UserRow key={r.id} p={r.user} sub={`Sent ${timeAgo(r.createdAt)}`} right={<RelButton p={r.user} rel="incoming" />} />) : <p className="muted small">No pending requests.</p>}
            </Card>
            <Card><h3 style={{ marginBottom: 8 }}>Sent · {graph.outgoing.length}</h3>
              {graph.outgoing.length ? graph.outgoing.map((r) => <UserRow key={r.id} p={r.user} sub={`Sent ${timeAgo(r.createdAt)}`} right={<RelButton p={r.user} rel="outgoing" />} />) : <p className="muted small">You haven’t sent any requests.</p>}
            </Card>
          </>
        )}
        {tab === 'find' && (
          <>
            <div className="s-search"><Icon name="search" size={18} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by @handle or name" aria-label="Search people" autoCapitalize="none" autoCorrect="off" spellCheck={false} data-testid="people-search" /></div>
            {results && <Card>{results.length ? results.map((p) => <UserRow key={p.id} p={p} right={<RelButton p={p} rel={rels[p.id] || 'none'} />} />) : <p className="muted small">No one matches “{q}”.</p>}</Card>}
            {!results && !!sugg.length && <Card><h3 style={{ marginBottom: 8 }}>Suggested</h3>{sugg.map((p) => <UserRow key={p.id} p={p} right={<RelButton p={p} rel={rels[p.id] || 'none'} />} />)}</Card>}
          </>
        )}
        {tab === 'blocked' && (
          <Card>
            <p className="muted small">Blocked people can’t find you, see your profile, posts or stories, or contact you, and you won’t see theirs. Unblocking doesn’t restore the friendship.</p>
            {graph.blocked.length ? graph.blocked.map((p) => <UserRow key={p.id} p={p} right={<RelButton p={p} rel="blocked" />} />) : <p className="muted small">You haven’t blocked anyone.</p>}
          </Card>
        )}
      </div>
      <aside className="s-side"><InviteCard /></aside>
      <Sheet open={!!menu} onClose={() => setMenu(null)} title={menu?.displayName || ''}>
        {menu && <div className="s-menu">
          <Link to={`/social/profile?u=${encodeURIComponent(menu.username)}`}><Icon name="me" />View profile</Link>
          <button onClick={() => { if (confirm(`Unfriend ${menu.displayName}? They won’t be notified.`)) act({ type: 'unfriend', other: menu.id }, 'Unfriended'); }} data-testid="unfriend"><Icon name="minus" />Unfriend</button>
          <button onClick={() => { setReport(menu); setMenu(null); }}><Icon name="flag" />Report</button>
          <button className="bad" onClick={() => { if (confirm(`Block @${menu.username}? You won’t see each other anywhere on HYBRD.`)) act({ type: 'block', other: menu.id }, `Blocked @${menu.username}`); }}><Icon name="ban" />Block</button>
        </div>}
      </Sheet>
      {report && <ReportSheet target={{ type: 'user', id: report.id, who: report }} onClose={() => setReport(null)} />}
    </div>
  );
}

// ======================================================================= Notifications
export function SocialNotifications() {
  return <Shell title="Notifications"><NotifInner /></Shell>;
}
function NotifInner() {
  const { notifs, backend, refresh } = useSocial();
  useEffect(() => { refresh(); return () => { backend?.markAllRead().then(refresh); }; }, [backend]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!notifs.length) return <Card><Empty icon="bell" title="No notifications yet">Friend requests, likes and comments show up here.</Empty></Card>;
  const groups: [string, NotifView[]][] = [['New', notifs.filter((n) => !n.read)], ['Earlier', notifs.filter((n) => n.read)]];
  return (
    <div className="s-notifs">
      {groups.filter(([, l]) => l.length).map(([h, l]) => (
        <Card key={h}><h3 style={{ marginBottom: 6 }}>{h}</h3>
          {l.map((n) => (
            <div key={n.id} className={`s-notif ${n.read ? '' : 'unread'}`} data-testid="notif">
              <Link to={`/social/profile?u=${encodeURIComponent(n.actor.username)}`} className="s-notif-av"><SAvatar p={n.actor} size={42} /><span className={`s-notif-ic t-${n.type}`}><Icon name={n.type === 'like' ? 'heart' : n.type === 'comment' ? 'comment' : n.type === 'reshare' ? 'repost' : 'useradd'} size={12} fill={n.type === 'like'} /></span></Link>
              <Link to={n.postId ? `/social/post?id=${n.postId}` : `/social/profile?u=${encodeURIComponent(n.actor.username)}`} className="s-notif-t">
                <span><b>{n.actor.displayName}</b>{n.actor.sample && <SampleTag />} {notifText(n.type)}{n.postPreview ? <span className="muted">: “{n.postPreview}”</span> : ''}</span>
                <span className="muted small">{timeAgo(n.createdAt)}</span>
              </Link>
              {n.type === 'friend_request' && <RelButton p={n.actor} rel="incoming" />}
            </div>
          ))}
        </Card>
      ))}
    </div>
  );
}

// ======================================================================= Saved
export function SocialSaved() {
  return <Shell title="Saved"><SavedInner /></Shell>;
}
function SavedInner() {
  const { backend } = useSocial();
  const [posts, setPosts] = useState<PostView[] | null>(null);
  useEffect(() => { backend?.saved().then(setPosts); }, [backend]);
  if (!posts) return <div className="muted" style={{ padding: 20 }}>Loading…</div>;
  return (
    <div className="s-narrow">
      <p className="muted small" style={{ margin: '0 0 12px' }}>Only you can see what you save.</p>
      {posts.length ? posts.map((p) => <PostCard key={p.id} post={p} onChange={(n) => { if (!n.saved) setPosts((x) => (x || []).filter((q) => q.id !== n.id)); }} onRemoved={(id) => setPosts((x) => (x || []).filter((q) => q.id !== id))} />)
        : <Card><Empty icon="bookmark" title="Nothing saved yet">Tap the bookmark on any post to keep it here: workouts to try, tips, routes.</Empty></Card>}
    </div>
  );
}

// ======================================================================= Profile
export function SocialProfile() {
  return <Shell title="Profile"><ProfileInner /></Shell>;
}
function ProfileInner() {
  const { backend, me, graph } = useSocial();
  const [sp] = useSearchParams();
  const handle = sp.get('u') || me?.username || '';
  const invited = sp.get('invite') === '1';
  const [p, setP] = useState<PublicProfile | null | undefined>();
  const [rel, setRel] = useState<Relation>('none');
  const [posts, setPosts] = useState<PostView[]>([]);
  const [menu, setMenu] = useState(false);
  const [report, setReport] = useState(false);
  const toast = useToast();
  const load = useCallback(async () => {
    if (!backend) return;
    const x = await backend.profileByHandle(handle);
    setP(x);
    if (x) { const [r, ps] = await Promise.all([backend.relationTo(x.id), backend.userPosts(x.id)]); setRel(r); setPosts(ps); }
  }, [backend, handle]);
  useEffect(() => { load(); }, [load, graph]);
  if (p === undefined) return <div className="muted" style={{ padding: 20 }}>Loading…</div>;
  if (p === null) return <Card><Empty icon="me" title="Profile not found">@{handle} doesn’t exist, or isn’t available to you.</Empty></Card>;
  const self = rel === 'self';
  const hiddenPosts = !self && rel !== 'friends' && (p.privacy === 'friends' || p.isMinor);
  return (
    <div className="s-layout">
      <div>
        {invited && !self && <div className="banner yellow"><Icon name="send" size={18} /><div><b>{p.displayName} invited you to HYBRD.</b> Add them as a friend to see each other’s training.</div></div>}
        <Card className="s-prof hero" >
          <div className="s-prof-top">
            <SAvatar p={p} size={84} />
            <div className="s-prof-id">
              <h2>{p.displayName} {p.sample && <SampleTag />}</h2>
              <div className="muted">@{p.username} · {p.privacy === 'friends' ? <><Icon name="users" size={13} /> Friends-only</> : <><Icon name="globe" size={13} /> Public</>}</div>
            </div>
            {!self && <button className="icon-btn" aria-label="Profile options" onClick={() => setMenu(true)}><Icon name="more" stroke={3.2} /></button>}
          </div>
          {p.publicBio && <p className="s-bio">{p.publicBio}</p>}
          <div className="s-counts"><div><b>{compact(p.friendCount)}</b><span>Friends</span></div><div><b>{compact(p.postCount)}</b><span>Posts</span></div>
            {p.showStats && p.stats && <>{p.stats.workouts30d !== undefined && <div><b>{p.stats.workouts30d}</b><span>Workouts · 30d</span></div>}{typeof p.stats.hybridScore === 'number' && <div><b className="y">{p.stats.hybridScore}</b><span>Hybrid Score</span></div>}{!!p.stats.streak && <div><b>{p.stats.streak}</b><span>Day streak</span></div>}</>}
          </div>
          <div className="row wrap" style={{ marginTop: 12 }}><RelButton p={p} rel={rel} onDone={load} />{self && <Link className="btn sm" to="/social/friends?tab=find"><Icon name="useradd" size={16} />Find friends</Link>}</div>
        </Card>
        {hiddenPosts ? <Card><Empty icon="lock" title="Friends-only profile">Add {p.displayName.split(' ')[0]} as a friend to see their posts and stories.</Empty></Card>
          : posts.length ? posts.map((x) => <PostCard key={x.id} post={x} onRemoved={(id) => setPosts((l) => l.filter((q) => q.id !== id))} />)
          : <Card><Empty icon="image" title={self ? 'You haven’t posted yet' : 'No posts yet'}>{self && <Link className="link" to="/social/new">Share your first workout →</Link>}</Empty></Card>}
      </div>
      <aside className="s-side">{self && <InviteCard />}</aside>
      <Sheet open={menu} onClose={() => setMenu(false)} title={`@${p.username}`}>
        <div className="s-menu">
          <button onClick={async () => { const u = `${appUrl()}social/profile?u=${encodeURIComponent(p.username)}`; try { await navigator.clipboard.writeText(u); toast('Profile link copied'); } catch { toast(u); } setMenu(false); }}><Icon name="link" />Copy profile link</button>
          <button onClick={() => { setMenu(false); setReport(true); }} data-testid="report-user"><Icon name="flag" />Report @{p.username}</button>
          {rel !== 'blocked' && <button className="bad" onClick={async () => { setMenu(false); if (!confirm(`Block @${p.username}? You won’t see each other anywhere on HYBRD.`)) return; try { await backend!.act({ type: 'block', other: p.id }); toast(`Blocked @${p.username}`); load(); } catch (e) { toast(friendlyError(e)); } }}><Icon name="ban" />Block</button>}
        </div>
      </Sheet>
      {report && <ReportSheet target={{ type: 'user', id: p.id, who: p }} onClose={() => setReport(false)} onBlocked={load} />}
    </div>
  );
}

// ======================================================================= Setup / edit public profile
export function SocialSetup() {
  return <Shell title="Public profile" back="/social" tabs={false} needProfile={false}><SetupInner /></Shell>;
}
function SetupInner() {
  const { backend, me, setMe, refresh, mode } = useSocial();
  const { profile, setProfile, data } = useStore();
  const { avatarUrl } = useMedia();
  const toast = useToast();
  const nav = useNavigate();
  const [name, setName] = useState(me?.displayName || profile.name || '');
  const [handle, setHandle] = useState(me?.username || suggestHandle(profile.name || ''));
  const [avail, setAvail] = useState<boolean | null>(null);
  const [dob, setDob] = useState(profile.dob || '');
  const [bio, setBio] = useState(me?.publicBio || '');
  const [privacy, setPrivacy] = useState<Privacy>(me?.privacy || 'public');
  const [stats, setStats] = useState(me?.showStats ?? false);
  const [useAv, setUseAv] = useState(me ? !!me.avatarUrl : !!avatarUrl);
  const [agree, setAgree] = useState(!!me);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const hv = validateHandle(handle);
  const nv = validateDisplayName(name);
  const gate = ageGate(dob || undefined);
  const age = dob ? ageFromDob(dob) : null;
  useEffect(() => {
    if (!backend || !hv.ok || hv.handle === me?.username) { setAvail(null); return; }
    const t = window.setTimeout(() => backend.handleAvailable(hv.handle).then(setAvail).catch(() => setAvail(null)), 300);
    return () => window.clearTimeout(t);
  }, [hv.handle, hv.ok, backend, me?.username]);
  const myStats = () => {
    const since = Date.now() - 30 * 86_400_000;
    return { workouts30d: data.workouts.filter((w) => !w.deleted && Date.parse(w.date) >= since).length, streak: streak(data, todayKey()).current, hybridScore: hybridScore(data, profile).score };
  };
  const save = async () => {
    if (!backend) return;
    setErr('');
    if (!nv.ok) return setErr(nv.error!);
    if (!hv.ok) return setErr(hv.error!);
    if (avail === false) return setErr('That handle is taken. Try another.');
    if (gate === 'unknown') return setErr('Add your date of birth.');
    if (gate === 'under13') { setProfile({ dob }); return setErr('Friends & Stories is for ages 13 and up.'); }
    if (!agree) return setErr('Please agree to the community rules.');
    setBusy(true);
    try {
      let avatar: Blob | null = null;
      if (useAv && avatarUrl) avatar = await (await fetch(avatarUrl)).blob();
      const p = await backend.saveProfile({ username: hv.handle, displayName: nv.value, publicBio: bio, privacy, showStats: stats, stats: stats ? myStats() : undefined, dob, avatar, useAvatar: useAv && !!avatarUrl });
      setProfile({ dob, ...(age !== null ? { age } : {}) });
      setMe(p); await refresh();
      toast(me ? 'Profile updated' : 'Welcome to Friends & Stories');
      nav(me ? '/social/profile' : '/social');
    } catch (e) { setErr(friendlyError(e)); } finally { setBusy(false); }
  };
  const teen = gate === 'teen';
  return (
    <div className="s-narrow" data-testid="setup">
      {!me && <p className="muted" style={{ marginTop: 0 }}>Create your public profile. It’s separate from your private Me page: your Bio, body stats and Gallery stay private unless you share something on purpose.</p>}
      <Card>
        <div className="row" style={{ marginBottom: 14 }}>
          <SAvatar p={{ displayName: name || 'You', avatarUrl: useAv ? avatarUrl : undefined }} size={64} />
          <div style={{ flex: 1 }}>
            {avatarUrl ? <button className="toggle" style={{ width: '100%', textAlign: 'left', padding: '6px 0', borderBottom: 0 }} onClick={() => setUseAv((v) => !v)}><span><b>Use my profile photo</b><div className="muted small">Shown to people who can see your profile</div></span><span className={`switch ${useAv ? 'on' : ''}`} /></button>
              : <span className="muted small">No profile photo. <Link className="link" to="/me">Add one in Me</Link> to show it here.</span>}
          </div>
        </div>
        <label className="field"><span>Display name</span><input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} data-testid="setup-name" /></label>
        <label className="field"><span>Handle</span>
          <div className="s-handle-in"><span>@</span><input value={handle} maxLength={20} autoCapitalize="none" autoCorrect="off" spellCheck={false} onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/\s/g, ''))} data-testid="setup-handle" /></div>
        </label>
        <div className={`small s-hint ${hv.ok ? (avail === false ? 'bad' : 'ok') : 'bad'}`}>{!hv.ok ? hv.error : avail === false ? 'Taken' : avail ? 'Available' : hv.handle === me?.username ? 'Your current handle' : '3–20 letters, numbers, _ or .'}</div>
        <label className="field"><span>Date of birth <span className="muted">(private)</span></span><input type="date" value={dob} max={todayKey()} onChange={(e) => setDob(e.target.value)} disabled={!!me && !!profile.dob && mode === 'live'} data-testid="setup-dob" /></label>
        <div className="small s-hint">{gate === 'under13' ? <span className="bad">Friends & Stories is for ages 13 and up.</span> : teen ? 'Under 18: your profile and posts are friends-only.' : 'Never shown to anyone. Used only to check you’re 13 or older.'}</div>
        <label className="field"><span>Public bio <span className="muted">(optional)</span></span><textarea value={bio} maxLength={PUBLIC_BIO_MAX} onChange={(e) => setBio(e.target.value)} placeholder="e.g. Training for my first HYROX" /></label>
        <div className="muted small" style={{ marginTop: -8, marginBottom: 12, textAlign: 'right' }}>{[...bio].length}/{PUBLIC_BIO_MAX}</div>
        <div className="field"><span>Who can see your profile and posts</span>
          <Segmented value={teen ? 'friends' : privacy} onChange={(v) => !teen && setPrivacy(v)} options={[{ v: 'public', label: 'Public' }, { v: 'friends', label: 'Friends only' }]} />
          <div className="muted small">{teen || privacy === 'friends' ? 'Only friends see your posts and stories. People can still find your handle to send a request.' : 'You choose per post: friends or public. Public posts can be seen by anyone with a HYBRD account.'}</div>
        </div>
        <button className="toggle" style={{ width: '100%', textAlign: 'left' }} onClick={() => setStats((v) => !v)} data-testid="setup-stats"><span><b>Show my training stats</b><div className="muted small">Workouts in the last 30 days, streak and Hybrid Score on your profile</div></span><span className={`switch ${stats ? 'on' : ''}`} /></button>
        <button className="toggle" style={{ width: '100%', textAlign: 'left' }} onClick={() => setAgree((v) => !v)}><span><b>I agree to the community rules</b><div className="muted small">Be kind, keep it about training, no nudity, hate or harassment. <Link className="link" to="/social/rules" onClick={(e) => e.stopPropagation()}>Read the rules</Link></div></span><span className={`switch ${agree ? 'on' : ''}`} /></button>
        {err && <div className="s-err" role="alert">{err}</div>}
        <button className="btn y block big" style={{ marginTop: 14 }} disabled={busy} onClick={save} data-testid="setup-save">{busy ? 'Saving…' : me ? 'Save profile' : 'Create profile'}</button>
      </Card>
      {me && <Card><h3>Leave Friends & Stories</h3><p className="muted small">Deletes your public profile, posts, stories, comments, likes and friends. Your private training data isn’t touched.</p>
        <button className="btn danger" onClick={async () => { if (!confirm('Delete your public profile and everything you shared? This can’t be undone.')) return; try { await backend!.deleteProfile(); setMe(null); await refresh(); toast('Public profile deleted'); nav('/social'); } catch (e) { toast(friendlyError(e)); } }}>Delete public profile</button></Card>}
    </div>
  );
}

// ======================================================================= Rules
export function SocialRules() {
  return (
    <Page title="Community rules" kicker="Friends & Stories" back wide>
      <div className="s-narrow s-rules">
        <Card>
          <p>HYBRD is a place to train, share progress and push each other. These rules apply to profiles, posts, stories and comments.</p>
          <h3>1. Respect people</h3><p>No harassment, bullying, threats, or hate based on who someone is. Disagree about training, not about people.</p>
          <h3>2. Keep it safe</h3><p>No nudity or sexual content. Progress photos are fine when they’re clothed the way you’d be at a gym or a race. Nothing involving minors that is sexual or exploitative, ever.</p>
          <h3>3. No dangerous health content</h3><p>Don’t promote self-harm, eating disorders, purging, extreme fasting, steroids or other unsafe drugs, or medical claims that could hurt someone. HYBRD isn’t medical advice, and neither are posts.</p>
          <h3>4. Be real</h3><p>Don’t impersonate people, fake results, spam, or sell scams. Ads and repeated self-promotion aren’t allowed.</p>
          <h3>5. Protect privacy</h3><p>Don’t post other people’s photos or personal details without their permission. Photos are re-saved without location data, but think before showing your home or routine routes publicly.</p>
          <h3>6. Age</h3><p>You must be 13 or older. Accounts aged 13 to 17 are friends-only.</p>
          <h3>What happens when rules are broken</h3><p>Anyone can report a post, story, comment or account. The HYBRD team reviews reports and may remove content or ban accounts. You can always block someone: you won’t see each other anywhere, and the friendship ends.</p>
          <p className="muted small">If someone is in immediate danger, contact local emergency services.</p>
        </Card>
      </div>
    </Page>
  );
}

// ======================================================================= Invite landing (/invite?u=handle)
export function InvitePage() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const { mode, me, meReady } = useSocial();
  const h = (sp.get('u') || '').toLowerCase().replace(/[^a-z0-9._]/g, '').slice(0, 20);
  useEffect(() => { if (h) sessionStorage.setItem('hybrd:pending-invite', h); }, [h]);
  useEffect(() => { if ((mode === 'live' || mode === 'demo') && meReady && me && h) nav(`/social/profile?u=${encodeURIComponent(h)}&invite=1`, { replace: true }); }, [mode, me, meReady, h, nav]);
  return (
    <Page title="You’re invited" kicker="HYBRD · Friends & Stories" wide>
      {h && <div className="banner yellow"><Icon name="send" size={18} /><div><b>@{h} invited you to train together on HYBRD.</b> {mode === 'live' ? 'Set up your public profile, then add them as a friend.' : 'Sign in, then you’ll land on their profile with an Add friend button.'}</div></div>}
      <SocialGate><div className="muted">Opening @{h}’s profile…</div></SocialGate>
    </Page>
  );
}
export default SocialFeed;
