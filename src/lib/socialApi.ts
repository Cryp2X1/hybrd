// Social: Friends & Stories — the backend contract shared by the live (Supabase) and demo (sample people, on-device) backends.
import type { Audience, Comment, GraphAction, Notif, Post, Privacy, PublicProfile, Relation, ReportReason, ReportTarget, Story, WorkoutCard } from './social';

export interface PostView extends Post { author: PublicProfile; liked: boolean; saved: boolean; mine: boolean; original?: PostView | null }
export interface StoryView extends Story { author: PublicProfile }
export interface CommentView extends Comment { author: PublicProfile }
export interface NotifView extends Notif { actor: PublicProfile; postPreview?: string }
export interface RequestView { id: string; user: PublicProfile; createdAt: number; direction: 'in' | 'out' }
export interface GraphView { friends: PublicProfile[]; incoming: RequestView[]; outgoing: RequestView[]; blocked: PublicProfile[] }
export interface ProfileInput { username: string; displayName: string; publicBio?: string; privacy: Privacy; showStats: boolean; stats?: PublicProfile['stats']; dob: string; avatar?: Blob | null; useAvatar: boolean }
export interface Img { blob: Blob; w: number; h: number }
export interface NewPost { text: string; images: Img[]; workout?: WorkoutCard; audience: Audience; reshareOf?: string }
export interface NewStory { text?: string; bg?: string; image?: Img; audience: Audience }
export interface NewReport { targetType: ReportTarget; targetId: string; reason: ReportReason; details?: string }

export interface SocialBackend {
  readonly kind: 'demo' | 'live';
  readonly myId: string;
  me(): Promise<PublicProfile | null>;
  saveProfile(p: ProfileInput): Promise<PublicProfile>;
  deleteProfile(): Promise<void>;
  handleAvailable(h: string): Promise<boolean>;
  search(q: string): Promise<PublicProfile[]>;
  suggestions(): Promise<PublicProfile[]>;
  profileByHandle(h: string): Promise<PublicProfile | null>;
  relationTo(userId: string): Promise<Relation>;
  graph(): Promise<GraphView>;
  act(a: GraphAction): Promise<string>;
  feed(): Promise<PostView[]>;
  userPosts(userId: string): Promise<PostView[]>;
  post(id: string): Promise<PostView | null>;
  createPost(p: NewPost): Promise<string>;
  editPost(id: string, text: string, audience: Audience): Promise<void>;
  deletePost(id: string): Promise<void>;
  setLike(id: string, on: boolean): Promise<void>;
  setSave(id: string, on: boolean): Promise<void>;
  hidePost(id: string): Promise<void>;
  saved(): Promise<PostView[]>;
  comments(postId: string): Promise<CommentView[]>;
  addComment(postId: string, text: string): Promise<void>;
  deleteComment(id: string): Promise<void>;
  stories(): Promise<StoryView[]>;
  createStory(s: NewStory): Promise<void>;
  deleteStory(id: string): Promise<void>;
  notifications(): Promise<NotifView[]>;
  markAllRead(): Promise<void>;
  report(r: NewReport): Promise<void>;
}

/** Turn server / reducer errors into something a person can act on. */
export function friendlyError(e: unknown): string {
  const m = (e as { message?: string })?.message || String(e);
  if (/rate_limit: max (\d+) (.+)/.test(m)) { const [, n, w] = /rate_limit: max (\d+) (.+)/.exec(m)!; return `Slow down: the limit is ${n} ${w.replace(/\s*\(.*$/, '')}. Try again later.`; }
  if (/username_taken|social_profiles_username_key|duplicate key/.test(m)) return 'That handle is taken. Try another.';
  if (/username_format/.test(m)) return 'Handles use 3–20 letters, numbers, underscores or single dots.';
  if (/under_13/.test(m)) return 'Friends & Stories is for ages 13 and up.';
  if (/banned/.test(m)) return 'This account can’t use Friends & Stories.';
  if (/not_allowed/.test(m)) return 'You can’t add this person.';
  if (/not_member/.test(m)) return 'Set up your public profile first.';
  if (/no_request/.test(m)) return 'That request is no longer pending.';
  if (/row-level security|permission denied/.test(m)) return 'You don’t have access to that.';
  if (/Failed to fetch|NetworkError|network/i.test(m)) return 'You’re offline. Try again when you have a connection.';
  return m.replace(/^SocialError:\s*/, '');
}
export type { Relation };
