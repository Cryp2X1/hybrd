// Messages — the backend contract shared by the live (Supabase) and demo (sample people, on-device) backends.
import type { PublicProfile, ReactionSummary, ReactionType, ReportReason, WorkoutCard } from './social';
import type { ReactorView } from './socialApi';
import type { ConvKind, DmReportTarget, DmSettings, Eligibility, Folder, Member, MemberRole, MemberState, Message, MsgStatus, SearchHit } from './messages';

export interface MemberView { userId: string; role: MemberRole; state: MemberState; profile: PublicProfile; /** only when read receipts allow it */ seenAt?: number; deliveredAt?: number; joinedAt: number }
export interface ConvView {
  id: string;
  kind: ConvKind;
  /** Display title (group name, or the other person's name). */
  title: string;
  customTitle?: string;
  createdBy: string;
  createdAt: number;
  lastMessageAt: number;
  me: Member;
  members: MemberView[];
  others: MemberView[];
  folder: Folder | null;
  unread: number;
  last: MessageView | null;
  muted: boolean;
  pinned: boolean;
  archived: boolean;
  /** incoming: I haven't accepted yet · outgoing: they haven't accepted my request */
  request: 'incoming' | 'outgoing' | null;
  requestRemaining: number;
  /** Direct chats: I blocked them / I can't message them (never says they blocked me). */
  blocked: 'byMe' | 'unavailable' | null;
  presence: string | null;
  isAdmin: boolean;
  /** Direct chats: I restricted this person (their messages wait quietly in Requests). */
  restricted?: boolean;
}
export interface ReplyRef { id: string; senderName: string; mine: boolean; preview: string; deleted: boolean; kind: Message['kind']; thumb?: string }
export interface MessageView extends Message {
  mine: boolean;
  sender: PublicProfile;
  reactions: ReactionSummary;
  myReaction: ReactionType | null;
  status?: MsgStatus;
  seenBy?: string[];
  reply?: ReplyRef | null;
  /** Local outbox state for messages that haven't reached the server yet. */
  pending?: 'sending' | 'failed';
  error?: string;
}
export interface DraftMedia { blob: Blob; poster?: Blob; w: number; h: number; mime: string; duration?: number; preview?: string }
export interface Draft {
  clientId: string;
  kind: 'text' | 'image' | 'video' | 'workout';
  body: string;
  replyTo?: string;
  workout?: WorkoutCard;
  forwarded?: boolean;
  media?: DraftMedia;
  /** Forwarding existing media: the backend copies the file instead of re-uploading a blob. */
  forwardOf?: string;
}
export type DmEvent =
  | { type: 'message'; conversationId: string; message: Message; senderId: string }
  | { type: 'update'; conversationId: string }
  | { type: 'typing'; conversationId: string; userId: string; on: boolean }
  | { type: 'read'; conversationId: string; userId: string }
  | { type: 'inbox' };
export interface NewDmReport { targetType: DmReportTarget; targetId: string; conversationId: string; reason: ReportReason; details?: string; /** extra messages attached to a message report (up to 10 in total) */ messageIds?: string[] }
export interface SearchResult { chats: ConvView[]; hits: (SearchHit & { conv: ConvView; senderName: string })[] }
export type EligibilityView = Eligibility & { existing?: string };

export interface DmBackend {
  readonly kind: 'demo' | 'live';
  readonly myId: string;
  getSettings(): Promise<DmSettings>;
  saveSettings(s: DmSettings): Promise<DmSettings>;
  inbox(): Promise<ConvView[]>;
  conversation(id: string): Promise<ConvView | null>;
  messages(conversationId: string): Promise<MessageView[]>;
  eligibility(userId: string): Promise<EligibilityView>;
  /** Existing 1:1 chat with this person, or a new one (a request if you're not friends). */
  openDirect(userId: string): Promise<string>;
  createGroup(title: string, userIds: string[]): Promise<string>;
  send(conversationId: string, d: Draft): Promise<Message>;
  edit(messageId: string, body: string): Promise<void>;
  unsend(messageId: string): Promise<void>;
  deleteForMe(messageId: string): Promise<void>;
  react(messageId: string, type: ReactionType | null): Promise<void>;
  reactors(messageId: string): Promise<ReactorView[]>;
  forward(messageId: string, conversationIds: string[]): Promise<void>;
  markRead(conversationId: string): Promise<void>;
  accept(conversationId: string): Promise<void>;
  decline(conversationId: string): Promise<void>;
  setPrefs(conversationId: string, p: { mutedUntil?: number | null; archived?: boolean; pinned?: boolean }): Promise<void>;
  /** Delete the chat for me (history hidden for me only; the other person keeps theirs). */
  clearChat(conversationId: string): Promise<void>;
  renameGroup(conversationId: string, title: string): Promise<void>;
  addMembers(conversationId: string, userIds: string[]): Promise<void>;
  removeMember(conversationId: string, userId: string): Promise<void>;
  setAdmin(conversationId: string, userId: string): Promise<void>;
  leaveGroup(conversationId: string): Promise<void>;
  report(r: NewDmReport): Promise<void>;
  block(userId: string): Promise<void>;
  unblock(userId: string): Promise<void>;
  /** Restrict (softer than block): their messages go quietly to Requests; they can't see my read receipts or when I'm online, or call me. */
  restrict(userId: string): Promise<void>;
  unrestrict(userId: string): Promise<void>;
  restrictedIds(): Promise<string[]>;
  setTyping(conversationId: string, on: boolean): void;
  heartbeat(): Promise<void>;
  search(q: string): Promise<SearchResult>;
  /** People you could message: friends first, then search results (blocked never appear). */
  people(q: string): Promise<{ friends: PublicProfile[]; others: PublicProfile[] }>;
  subscribe(cb: (e: DmEvent) => void): () => void;
}
export const UNKNOWN_PROFILE = (id: string): PublicProfile => ({ id, username: 'hybrd.user', displayName: 'HYBRD user', privacy: 'friends', showStats: false, friendCount: 0, postCount: 0 });
