// Friends & Stories UI pieces shared by the Social pages: avatars with SAMPLE badges, the demo banner and the
// connect / sign-in / age gates, post cards, workout cards, the stories ring + viewer, share and report sheets.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Icon } from './Icon';
import { Card, Sheet } from './ui';
import { useSocial } from '../lib/socialStore';
import { useStore } from '../lib/store';
import { useToast } from '../lib/toast';
import { appUrl } from '../lib/config';
import { fmtTime, KM_PER_MI } from '../lib/calc';
import {
  compact, emptyReactionCounts, postUrl, REPORT_REASONS, groupStories, storyTimeLeft, timeAgo, REPORT_DETAILS_MAX, REACTION_META, REACTION_TYPES,
  type PublicProfile, type ReactionType, type ReportReason, type ReportTarget, type WorkoutCard,
} from '../lib/social';
import { friendlyError, type PostView, type StoryView } from '../lib/socialApi';
import { ReactionBar, ReactionSummaryBtn, ReactorsSheet, usePressToReact } from './Reactions';

// ---------- identity ----------
export function SAvatar({ p, size = 40, ring }: { p?: Pick<PublicProfile, 'avatarUrl' | 'displayName'> | null; size?: number; ring?: 'new' | 'seen' }) {
  const ini = (p?.displayName || '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <span className={`s-av ${ring ? `ring-${ring}` : ''}`} style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}>
      {p?.avatarUrl ? <img src={p.avatarUrl} alt="" draggable={false} /> : <span>{ini}</span>}
    </span>
  );
}
export const SampleTag = () => <span className="sample-tag" title="Sample person for the demo, not a real user">Sample</span>;
export function Who({ p, sub, to = true }: { p: PublicProfile; sub?: ReactNode; to?: boolean }) {
  const name = <><b className="s-name">{p.displayName}</b>{p.sample && <SampleTag />}</>;
  return (
    <span className="s-who">
      {to ? <Link to={`/social/profile?u=${encodeURIComponent(p.username)}`} className="s-who-n">{name}</Link> : <span className="s-who-n">{name}</span>}
      <span className="s-handle">@{p.username}{sub && <> · {sub}</>}</span>
    </span>
  );
}

// ---------- gates / banners ----------
export function DemoBanner() {
  const { mode, exitDemo, resetDemo } = useSocial();
  const nav = useNavigate();
  if (mode !== 'demo') return null;
  return (
    <div className="demo-banner" role="note" data-testid="demo-banner">
      <Icon name="info" size={18} />
      <div><b>Demo mode: sample people, not real users.</b> Everything stays on this device and nothing is shared. Sample friends react to your posts automatically so you can try notifications.
        <div className="demo-actions"><button onClick={() => { resetDemo(); }}>Reset demo</button><button onClick={() => { exitDemo(); nav('/social'); }}>Exit demo</button></div>
      </div>
    </div>
  );
}

/** Shows the right gate (age / connect / sign in / profile setup) or the children. */
export function SocialGate({ children, needProfile = true }: { children: ReactNode; needProfile?: boolean }) {
  const { mode, me, meReady, enterDemo } = useSocial();
  const nav = useNavigate();
  useEffect(() => {
    if (!(mode === 'demo' || mode === 'live') || !meReady) return;
    if (needProfile && !me) { nav('/social/setup', { replace: true }); return; }
    const inv = me && sessionStorage.getItem('hybrd:pending-invite'); // came in through /invite?u=… → land on that profile once ready
    if (inv) { sessionStorage.removeItem('hybrd:pending-invite'); if (inv !== me!.username) nav(`/social/profile?u=${encodeURIComponent(inv)}&invite=1`, { replace: true }); }
  }, [needProfile, mode, meReady, me, nav]);
  if (mode === 'loading' || ((mode === 'demo' || mode === 'live') && !meReady)) return <div className="muted" style={{ padding: 30 }}>Loading…</div>;
  if (mode === 'underage') return (
    <Card className="s-gate" ><Icon name="lock" size={30} /><h2>Friends & Stories is for ages 13+</h2>
      <p className="muted">Based on your date of birth, friends, posts and stories are turned off. Everything else in HYBRD works as usual, and your training stays private on this device.</p></Card>
  );
  if (mode === 'connect' || mode === 'signin') return (
    <div data-testid="social-gate">
      <Card className="s-gate hero">
        <Icon name="users" size={34} />
        <h2>{mode === 'connect' ? 'Connect accounts to use Friends & Stories' : 'Sign in to use Friends & Stories'}</h2>
        <p className="muted">{mode === 'connect'
          ? 'Friends, stories, likes and comments need HYBRD accounts so people can find each other. This copy of HYBRD is in Local mode, so nothing can be shared yet. Your workouts and photos stay private on this device.'
          : 'Create a free account or sign in to add friends, share workouts and stories, and see your friends’ posts.'}</p>
        <ul className="s-gate-list">
          <li><Icon name="useradd" size={18} />Friend requests, invite links, unfriend and block</li>
          <li><Icon name="image" size={18} />Posts with photos or a workout card, 24-hour stories</li>
          <li><Icon name="heart" size={18} />Likes, comments, shares, saves and notifications</li>
          <li><Icon name="lock" size={18} />Friends-only or public, report and block, 13+ only</li>
        </ul>
        <div className="row wrap" style={{ marginTop: 14 }}>
          {mode === 'signin' ? <Link className="btn y" to="/sign-in">Sign in</Link> : <Link className="btn" to="/me/account">How accounts turn on</Link>}
          <button className="btn y" onClick={enterDemo} data-testid="enter-demo"><Icon name="play" size={18} />Explore the demo</button>
        </div>
        <p className="muted small" style={{ marginTop: 12 }}>The demo uses clearly labelled sample people (handles start with “sample.”). They aren’t real users, and nothing you post in the demo leaves this device.</p>
      </Card>
    </div>
  );
  if (needProfile && !me) return <div className="muted" style={{ padding: 30 }}>Loading…</div>;
  return <>{children}</>;
}

export function SocialTabs() {
  const { graph, notifs } = useSocial();
  const req = graph?.incoming.length || 0;
  const unread = notifs.filter((n) => !n.read && n.type !== 'friend_request').length;
  return (
    <nav className="s-tabs" aria-label="Social">
      <NavLink to="/social" end>Feed</NavLink>
      <NavLink to="/social/friends">Friends{req > 0 && <span className="s-badge" data-testid="req-badge">{req}</span>}</NavLink>
      <NavLink to="/social/notifications">Alerts{unread > 0 && <span className="s-badge">{unread}</span>}</NavLink>
      <NavLink to="/social/saved">Saved</NavLink>
      <NavLink to="/social/profile">Profile</NavLink>
    </nav>
  );
}

// ---------- workout card ----------
export function WorkoutCardView({ w, compactView }: { w: WorkoutCard; compactView?: boolean }) {
  const { profile } = useStore();
  const imp = profile.units === 'imperial';
  const dist = w.distanceM ? `${(w.distanceM / 1000 / (imp ? KM_PER_MI : 1)).toFixed(2)} ${imp ? 'mi' : 'km'}` : null;
  const pace = w.paceSecPerKm ? `${fmtTime(Math.round(w.paceSecPerKm * (imp ? KM_PER_MI : 1)))} /${imp ? 'mi' : 'km'}` : null;
  const cells: [string, string][] = [];
  if (dist) cells.push(['Distance', dist]);
  cells.push(['Time', fmtTime(w.durationSec)]);
  if (pace) cells.push(['Pace', pace]);
  else if (w.kcal) cells.push(['Calories', `${w.kcal} kcal (est.)`]);
  if (typeof w.hybridScore === 'number') cells.push(['Hybrid Score', String(w.hybridScore)]);
  return (
    <div className={`s-wcard ${compactView ? 'sm' : ''}`} data-testid="workout-card">
      <div className="s-wcard-h"><span className="pill yellow">{w.label}</span><b>{w.title}</b><span className="muted small">{new Date(w.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span></div>
      <div className="s-wcard-g">{cells.map(([l, v]) => <div key={l}><div className="s-wv mono">{v}</div><div className="s-wl">{l}</div></div>)}</div>
    </div>
  );
}

// ---------- post card ----------
export function MediaGrid({ media }: { media: PostView['media'] }) {
  if (!media.length) return null;
  return (
    <div className={`s-media n${Math.min(media.length, 4)}`}>
      {media.slice(0, 4).map((m, i) => <img key={i} src={m.url} alt={`Photo ${i + 1} of ${media.length}`} loading="lazy" style={media.length === 1 ? { aspectRatio: `${m.w} / ${m.h}` } : undefined} />)}
    </div>
  );
}
const audIcon = (a: string) => <span className="s-aud" title={a === 'public' ? 'Public' : 'Friends'}><Icon name={a === 'public' ? 'globe' : 'users'} size={13} /></span>;

export function PostCard({ post, onChange, onRemoved, detail }: { post: PostView; onChange?: (p: PostView) => void; onRemoved?: (id: string) => void; detail?: boolean }) {
  const { backend, mode } = useSocial();
  const toast = useToast();
  const nav = useNavigate();
  const [p, setP] = useState(post);
  const [menu, setMenu] = useState(false);
  const [share, setShare] = useState(false);
  const [report, setReport] = useState<{ type: ReportTarget; id: string; who: PublicProfile } | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(post.text);
  const [bar, setBar] = useState<{ anchor: DOMRect; pointerId: number | null } | null>(null);
  const [who, setWho] = useState(false);
  useEffect(() => { setP(post); setDraft(post.text); }, [post]);
  const upd = (n: PostView) => { setP(n); onChange?.(n); };
  const applyReact = async (next: ReactionType | null) => {
    if (!backend) return;
    const prev = p.myReaction;
    const counts = { ...emptyReactionCounts(), ...p.reactionSummary.counts };
    let total = p.reactionSummary.total;
    if (prev) { counts[prev] = Math.max(0, counts[prev] - 1); total = Math.max(0, total - 1); }
    if (next) { counts[next] += 1; total += 1; }
    const top = REACTION_TYPES.filter((t) => counts[t] > 0).sort((a, b) => counts[b] - counts[a] || REACTION_TYPES.indexOf(a) - REACTION_TYPES.indexOf(b)).slice(0, 3);
    upd({ ...p, myReaction: next, liked: next === 'like', likeCount: total, reactionSummary: { total, counts, top } });
    setBar(null);
    try { await backend.setReaction('post', p.id, next); } catch (e) { toast(friendlyError(e)); upd(p); }
  };
  const tapLike = () => applyReact(p.myReaction ? null : 'like');
  const likeBind = usePressToReact({ onOpen: (anchor, pointerId) => setBar({ anchor, pointerId }), onTap: tapLike });
  const save = async () => {
    if (!backend) return;
    const on = !p.saved; upd({ ...p, saved: on });
    try { await backend.setSave(p.id, on); toast(on ? 'Saved' : 'Removed from Saved'); } catch (e) { toast(friendlyError(e)); upd(p); }
  };
  const run = async (fn: () => Promise<unknown>, ok: string, remove = false) => {
    setMenu(false);
    try { await fn(); toast(ok); if (remove) onRemoved?.(p.id); } catch (e) { toast(friendlyError(e)); }
  };
  return (
    <article className="card s-post" data-testid="post-card">
      <header className="s-post-h">
        <Link to={`/social/profile?u=${encodeURIComponent(p.author.username)}`}><SAvatar p={p.author} size={42} /></Link>
        <Who p={p.author} sub={<>{timeAgo(p.createdAt)}{p.editedAt ? ' · edited' : ''} {audIcon(p.audience)}</>} />
        <button className="icon-btn" aria-label="Post options" onClick={() => setMenu(true)} data-testid="post-menu"><Icon name="more" stroke={3.2} /></button>
      </header>
      {p.original !== undefined && <div className="s-reshared muted small"><Icon name="repost" size={14} />Shared a post</div>}
      {editing ? (
        <div className="s-edit">
          <textarea className="input" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={2000} rows={4} aria-label="Edit post" />
          <div className="row" style={{ marginTop: 8 }}><button className="btn sm y" onClick={async () => { try { await backend!.editPost(p.id, draft, p.audience); upd({ ...p, text: draft.trim(), editedAt: Date.now() }); setEditing(false); toast('Post updated'); } catch (e) { toast(friendlyError(e)); } }}>Save</button><button className="btn sm ghost" onClick={() => { setEditing(false); setDraft(p.text); }}>Cancel</button></div>
        </div>
      ) : p.text && <div className={`s-text ${detail ? '' : 'clamp'}`}>{p.text}</div>}
      <MediaGrid media={p.media} />
      {p.workout && <WorkoutCardView w={p.workout} />}
      {p.original && (
        <Link to={`/social/post?id=${p.original.id}`} className="s-quote">
          <div className="row"><SAvatar p={p.original.author} size={24} /><Who p={p.original.author} sub={timeAgo(p.original.createdAt)} to={false} /></div>
          {p.original.text && <div className="s-text clamp small">{p.original.text}</div>}
          <MediaGrid media={p.original.media.slice(0, 1)} />
          {p.original.workout && <WorkoutCardView w={p.original.workout} compactView />}
        </Link>
      )}
      <footer className="s-actions">
        <ReactionSummaryBtn summary={p.reactionSummary} onClick={() => setWho(true)} />
        <button
          className={`s-act ${p.myReaction ? 'on' : ''}`}
          style={p.myReaction ? { color: REACTION_META[p.myReaction].color } : undefined}
          aria-pressed={!!p.myReaction}
          aria-label={p.myReaction ? REACTION_META[p.myReaction].label : 'Like'}
          data-testid="like-btn"
          {...likeBind}
        >
          {p.myReaction ? <span className="react-emoji" aria-hidden="true">{REACTION_META[p.myReaction].emoji}</span> : <Icon name="heart" fill={p.liked} />}
          <span data-testid="like-count">{compact(p.reactionSummary.total)}</span>
        </button>
        <button className="s-act" onClick={() => nav(`/social/post?id=${p.id}`)} aria-label="Comments" data-testid="comment-btn"><Icon name="comment" />{compact(p.commentCount)}</button>
        <button className="s-act" onClick={() => setShare(true)} aria-label="Share" data-testid="share-btn"><Icon name="repost" />{compact(p.shareCount)}</button>
        <span className="spacer" />
        <button className={`s-act ${p.saved ? 'on' : ''}`} onClick={save} aria-pressed={p.saved} aria-label={p.saved ? 'Remove from Saved' : 'Save'} data-testid="save-btn"><Icon name="bookmark" fill={p.saved} /></button>
      </footer>
      <ReactionBar
        open={!!bar}
        anchor={bar?.anchor ?? null}
        current={p.myReaction}
        pointerId={bar?.pointerId}
        onPick={(t) => applyReact(p.myReaction === t ? null : t)}
        onClose={() => setBar(null)}
      />
      <ReactorsSheet open={who} onClose={() => setWho(false)} load={() => backend ? backend.listReactions('post', p.id) : Promise.resolve([])} />
      <Sheet open={menu} onClose={() => setMenu(false)} title="Post">
        <div className="s-menu">
          {p.mine ? <>
            <button onClick={() => { setMenu(false); setEditing(true); }}><Icon name="edit" />Edit post</button>
            <button className="bad" onClick={() => { if (confirm('Delete this post? This can’t be undone.')) run(() => backend!.deletePost(p.id), 'Post deleted', true); else setMenu(false); }}><Icon name="trash" />Delete post</button>
          </> : <>
            <button onClick={() => run(() => backend!.hidePost(p.id), 'Post hidden from your feed', true)}><Icon name="eyeoff" />Hide this post</button>
            <button onClick={() => { setMenu(false); setReport({ type: 'post', id: p.id, who: p.author }); }} data-testid="report-post"><Icon name="flag" />Report post</button>
            <button className="bad" onClick={() => { if (confirm(`Block @${p.author.username}? You won’t see each other anywhere on HYBRD, and you’ll stop being friends.`)) run(() => backend!.act({ type: 'block', other: p.author.id }), `Blocked @${p.author.username}`, true); else setMenu(false); }}><Icon name="ban" />Block @{p.author.username}</button>
          </>}
        </div>
      </Sheet>
      <ShareSheet open={share} onClose={() => setShare(false)} post={p} demo={mode === 'demo'} />
      {report && <ReportSheet target={report} onClose={() => setReport(null)} onBlocked={() => onRemoved?.(p.id)} />}
    </article>
  );
}

export function ShareSheet({ open, onClose, post, demo }: { open: boolean; onClose: () => void; post: PostView; demo: boolean }) {
  const nav = useNavigate();
  const toast = useToast();
  const url = postUrl(appUrl(), post.id);
  const target = post.original || post;
  const copy = async () => { try { await navigator.clipboard.writeText(url); toast('Link copied'); } catch { toast(url); } onClose(); };
  const native = async () => { try { await navigator.share({ title: `${post.author.displayName} on HYBRD`, text: post.text.slice(0, 100), url }); } catch { /* cancelled */ } onClose(); };
  return (
    <Sheet open={open} onClose={onClose} title="Share">
      <div className="s-menu">
        <button onClick={() => { onClose(); nav(`/social/new?reshare=${target.id}`); }} data-testid="reshare"><Icon name="repost" />Share to your feed</button>
        <button onClick={copy}><Icon name="link" />Copy link</button>
        {typeof navigator !== 'undefined' && 'share' in navigator && <button onClick={native}><Icon name="share" />Share via…</button>}
      </div>
      <p className="muted small" style={{ marginTop: 10 }}>{demo ? 'Demo posts live only on this device, so links won’t open for anyone else.' : post.audience === 'friends' ? 'Friends-only: the link only opens for your friends.' : 'Public: anyone with a HYBRD account can open the link.'}</p>
    </Sheet>
  );
}

export function ReportSheet({ target, onClose, onBlocked }: { target: { type: ReportTarget; id: string; who: PublicProfile }; onClose: () => void; onBlocked?: () => void }) {
  const { backend, refresh } = useSocial();
  const toast = useToast();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [block, setBlock] = useState(false);
  const [busy, setBusy] = useState(false);
  const what = target.type === 'user' ? 'account' : target.type;
  const send = async () => {
    if (!backend || !reason) return;
    setBusy(true);
    try {
      await backend.report({ targetType: target.type, targetId: target.id, reason, details: details.trim() || undefined });
      if (block) { await backend.act({ type: 'block', other: target.who.id }); await refresh(); onBlocked?.(); }
      toast(block ? `Report sent and @${target.who.username} blocked` : 'Thanks. Your report was sent to the HYBRD team.');
      onClose();
    } catch (e) { toast(friendlyError(e)); } finally { setBusy(false); }
  };
  return (
    <Sheet open onClose={onClose} title={`Report ${what}`}>
      <div data-testid="report-sheet">
        <p className="muted small">Why are you reporting this {what}? @{target.who.username} won’t know who reported it.</p>
        <div className="s-reasons" role="radiogroup">
          {REPORT_REASONS.map((r) => (
            <button key={r.v} role="radio" aria-checked={reason === r.v} className={reason === r.v ? 'on' : ''} onClick={() => setReason(r.v)}>
              <span className="s-radio" /><span><b>{r.label}</b><span className="muted small">{r.sub}</span></span>
            </button>
          ))}
        </div>
        <label className="field" style={{ marginTop: 12 }}><span>Details (optional)</span><textarea value={details} maxLength={REPORT_DETAILS_MAX} onChange={(e) => setDetails(e.target.value)} placeholder="Anything that helps the review" /></label>
        <button className="toggle" style={{ width: '100%', textAlign: 'left' }} onClick={() => setBlock((b) => !b)}><span><b>Also block @{target.who.username}</b><div className="muted small">You won’t see each other anywhere on HYBRD.</div></span><span className={`switch ${block ? 'on' : ''}`} /></button>
        <button className="btn y block" style={{ marginTop: 12 }} disabled={!reason || busy} onClick={send} data-testid="send-report">{busy ? 'Sending…' : 'Send report'}</button>
        <p className="muted small" style={{ marginTop: 10 }}>If someone is in immediate danger, contact local emergency services. <Link className="link" to="/social/rules">Community rules</Link></p>
      </div>
    </Sheet>
  );
}

// ---------- stories ----------
export function StoriesRing({ stories, onOpen }: { stories: StoryView[]; onOpen: (authorId: string) => void }) {
  const { me, seen } = useSocial();
  const nav = useNavigate();
  if (!me) return null;
  const profiles = Object.fromEntries(stories.map((s) => [s.authorId, s.author]));
  const groups = groupStories(stories, me.id, seen); // stories() already returns only what the server / demo rules allow
  const mine = groups.find((g) => g.authorId === me.id);
  const rest = groups.filter((g) => g.authorId !== me.id);
  return (
    <div className="s-ring" data-testid="stories-ring">
      <button className="s-ring-i" onClick={() => (mine ? onOpen(me.id) : nav('/social/new?story=1'))}>
        <span className="s-ring-av"><SAvatar p={me} size={62} ring={mine ? 'seen' : undefined} />{!mine && <span className="s-ring-plus"><Icon name="plus" size={14} stroke={3} /></span>}</span>
        <span className="s-ring-n">{mine ? 'Your story' : 'Add story'}</span>
      </button>
      {rest.map((g) => (
        <button key={g.authorId} className="s-ring-i" onClick={() => onOpen(g.authorId)} data-testid="story-bubble">
          <span className="s-ring-av"><SAvatar p={profiles[g.authorId]} size={62} ring={g.seen ? 'seen' : 'new'} /></span>
          <span className="s-ring-n">{profiles[g.authorId]?.displayName.split(' ')[0]}</span>
        </button>
      ))}
    </div>
  );
}

export function StoryViewer({ stories, startAuthor, onClose, onDeleted }: { stories: StoryView[]; startAuthor: string; onClose: () => void; onDeleted: () => void }) {
  const { me, seen, markSeen, backend } = useSocial();
  const toast = useToast();
  const [groups] = useState(() => groupStories(stories, me!.id, seen)); // freeze order while viewing
  const [gi, setGi] = useState(Math.max(0, groups.findIndex((g) => g.authorId === startAuthor)));
  const [si, setSi] = useState(() => { const g = groups[Math.max(0, groups.findIndex((x) => x.authorId === startAuthor))]; const i = g ? g.stories.findIndex((s) => !seen.has(s.id)) : 0; return i < 0 ? 0 : i; });
  const [paused, setPaused] = useState(false);
  const [prog, setProg] = useState(0);
  const [report, setReport] = useState(false);
  const g = groups[gi];
  const s = g?.stories[si];
  const next = useCallback(() => {
    if (!g) return onClose();
    if (si < g.stories.length - 1) { setSi(si + 1); setProg(0); }
    else if (gi < groups.length - 1) { setGi(gi + 1); setSi(0); setProg(0); }
    else onClose();
  }, [g, gi, si, groups.length, onClose]);
  const prev = () => { if (si > 0) setSi(si - 1); else if (gi > 0) { setGi(gi - 1); setSi(0); } setProg(0); };
  useEffect(() => { if (s) markSeen([s.id]); }, [s?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const tick = useRef<number>();
  useEffect(() => {
    if (paused || report) return;
    tick.current = window.setInterval(() => setProg((p) => { if (p >= 1) { return 1; } return p + 0.02; }), 100);
    return () => window.clearInterval(tick.current);
  }, [paused, report, s?.id]);
  useEffect(() => { if (prog >= 1) next(); }, [prog, next]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowRight') next(); if (e.key === 'ArrowLeft') prev(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); });
  if (!g || !s) return null;
  const mine = s.authorId === me!.id;
  return (
    <div className="s-story" role="dialog" aria-label={`${s.author.displayName}'s story`} data-testid="story-viewer"
      onPointerDown={() => setPaused(true)} onPointerUp={() => setPaused(false)}>
      <div className="s-story-bars">{g.stories.map((x, i) => <span key={x.id}><i style={{ width: `${i < si ? 100 : i === si ? Math.min(100, prog * 100) : 0}%` }} /></span>)}</div>
      <div className="s-story-top">
        <SAvatar p={s.author} size={34} />
        <Who p={s.author} sub={<>{timeAgo(s.createdAt)} · {storyTimeLeft(s)} {audIcon(s.audience)}</>} to={false} />
        <span className="spacer" />
        {mine ? <button className="icon-btn" aria-label="Delete story" onClick={async (e) => { e.stopPropagation(); if (!confirm('Delete this story?')) return; try { await backend!.deleteStory(s.id); toast('Story deleted'); onDeleted(); onClose(); } catch (er) { toast(friendlyError(er)); } }}><Icon name="trash" /></button>
          : <button className="icon-btn" aria-label="Report story" onClick={(e) => { e.stopPropagation(); setReport(true); }}><Icon name="flag" /></button>}
        <button className="icon-btn" aria-label="Close" onClick={(e) => { e.stopPropagation(); onClose(); }}><Icon name="x" /></button>
      </div>
      <div className="s-story-stage" style={!s.media ? { background: s.bg || '#141414' } : undefined}>
        {s.media && <img src={s.media.url} alt="" />}
        {s.text && <div className={`s-story-text ${s.media ? 'over' : ''} ${!s.media && (s.bg || '').toUpperCase() === '#FFE600' ? 'dark' : ''}`}>{s.text}</div>}
      </div>
      <button className="s-story-tap l" aria-label="Previous" onClick={prev} />
      <button className="s-story-tap r" aria-label="Next" onClick={next} />
      {report && <ReportSheet target={{ type: 'story', id: s.id, who: s.author }} onClose={() => setReport(false)} onBlocked={() => { onDeleted(); onClose(); }} />}
    </div>
  );
}

// ---------- people ----------
export function RelButton({ p, rel, onDone }: { p: PublicProfile; rel: string; onDone?: () => void }) {
  const { backend, refresh } = useSocial();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const go = async (a: Parameters<NonNullable<typeof backend>['act']>[0], ok: string) => {
    if (!backend) return; setBusy(true);
    try { const r = await backend.act(a); toast(r === 'accepted' ? `You and ${p.displayName} are now friends` : ok); await refresh(); onDone?.(); } catch (e) { toast(friendlyError(e)); } finally { setBusy(false); }
  };
  if (rel === 'self') return <Link className="btn sm" to="/social/setup">Edit profile</Link>;
  if (rel === 'friends') return <button className="btn sm" disabled={busy} onClick={() => { if (confirm(`Unfriend ${p.displayName}? They won’t be notified.`)) go({ type: 'unfriend', other: p.id }, 'Unfriended'); }} data-testid="rel-friends"><Icon name="usercheck" size={16} />Friends</button>;
  if (rel === 'outgoing') return <button className="btn sm" disabled={busy} onClick={() => go({ type: 'cancel', to: p.id }, 'Request cancelled')} data-testid="rel-cancel">Requested · Cancel</button>;
  if (rel === 'incoming') return <span className="row"><button className="btn sm y" disabled={busy} onClick={() => go({ type: 'accept', from: p.id }, 'Friend added')}>Accept</button><button className="btn sm ghost" disabled={busy} onClick={() => go({ type: 'decline', from: p.id }, 'Request declined')}>Decline</button></span>;
  if (rel === 'blocked') return <button className="btn sm" disabled={busy} onClick={() => go({ type: 'unblock', other: p.id }, 'Unblocked')}>Unblock</button>;
  if (rel === 'blocked_by') return null;
  return <button className="btn sm y" disabled={busy} onClick={() => go({ type: 'send', to: p.id }, 'Friend request sent')} data-testid="add-friend"><Icon name="useradd" size={16} />Add friend</button>;
}
export function UserRow({ p, right, sub }: { p: PublicProfile; right?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="s-user" data-testid="user-row">
      <Link to={`/social/profile?u=${encodeURIComponent(p.username)}`}><SAvatar p={p} size={44} /></Link>
      <span className="s-user-m"><Who p={p} />{(sub || p.publicBio) && <span className="muted small s-user-sub">{sub || p.publicBio}</span>}</span>
      {right}
    </div>
  );
}
