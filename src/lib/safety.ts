// Safety: reporting, moderation decisions, appeals, taking time off and deleting an account. Pure rules + copy shared
// by the UI, the on-device demo backend and (mirrored in SQL) supabase/schema.sql. Tested in tools/test-safety.ts.

// ---------------------------------------------------------------- report reasons
export type ReportReason = 'spam' | 'harassment' | 'hate' | 'sexual' | 'minor' | 'self_harm' | 'impersonation' | 'scam' | 'violence' | 'other';
export interface ReasonInfo { v: ReportReason; label: string; sub: string; guideline: GuidelineId }
export const REPORT_REASONS: ReasonInfo[] = [
  { v: 'spam', label: 'Spam', sub: 'Ads, repeated junk, fake engagement', guideline: 'spam' },
  { v: 'harassment', label: 'Harassment or bullying', sub: 'Targeting, insulting, threatening or shaming someone', guideline: 'respect' },
  { v: 'hate', label: 'Hate', sub: 'Attacks on people for who they are', guideline: 'hate' },
  { v: 'sexual', label: 'Sexual content', sub: 'Nudity, sexual images or sexual messages', guideline: 'sexual' },
  { v: 'minor', label: 'Involves a minor', sub: 'A child at risk, an adult targeting a minor, or someone under 13', guideline: 'minors' },
  { v: 'self_harm', label: 'Self-harm or suicide', sub: 'Someone may be at risk, or content promotes self-harm or disordered eating', guideline: 'self_harm' },
  { v: 'impersonation', label: 'Impersonation', sub: 'Pretending to be someone else or a brand', guideline: 'authentic' },
  { v: 'scam', label: 'Scam or fraud', sub: 'Fake offers, phishing, asking for money or passwords', guideline: 'spam' },
  { v: 'violence', label: 'Violence or threats', sub: 'Threats, graphic violence, dangerous acts', guideline: 'violence' },
  { v: 'other', label: 'Something else', sub: 'Tell us more in the details', guideline: 'respect' },
];
export const REASON_KEYS = REPORT_REASONS.map((r) => r.v);
export const reasonInfo = (r: string): ReasonInfo => REPORT_REASONS.find((x) => x.v === r) || REPORT_REASONS[REPORT_REASONS.length - 1];
/** Older reason keys stored before v1.6 → today's list. */
export const LEGACY_REASON: Record<string, ReportReason> = { nudity: 'sexual', underage: 'minor', misinformation: 'other' };
export const normalizeReason = (r: string): ReportReason => (REASON_KEYS as string[]).includes(r) ? (r as ReportReason) : LEGACY_REASON[r] || 'other';

/** 0 = urgent (child safety, self-harm), 1 = high (violence, sexual content, harassment), 2 = normal. Mirrors report_priority() in SQL. */
export function priorityOf(r: string): 0 | 1 | 2 {
  const k = normalizeReason(r);
  if (k === 'minor' || k === 'self_harm') return 0;
  if (k === 'violence' || k === 'sexual' || k === 'harassment') return 1;
  return 2;
}
export const PRIORITY_LABEL = ['Urgent', 'High', 'Normal'] as const;
/** Should the reporter see crisis resources after reporting? */
export const showCrisisHelp = (r: string) => normalizeReason(r) === 'self_harm';
export const showChildSafetyHelp = (r: string) => normalizeReason(r) === 'minor';

// ---------------------------------------------------------------- report targets
export type ReportTargetType = 'user' | 'post' | 'story' | 'comment' | 'activity' | 'message' | 'conversation' | 'call' | 'media';
export const TARGET_LABEL: Record<ReportTargetType, string> = {
  user: 'account', post: 'post', story: 'story', comment: 'comment', activity: 'shared activity', message: 'message', conversation: 'conversation', call: 'call', media: 'photo or video',
};
/** Which store a target lives in: the Friends & Stories `reports` table or the Messages `message_reports` table. */
export const targetStore = (t: ReportTargetType): 'social' | 'messages' => (t === 'message' || t === 'conversation' || t === 'call' ? 'messages' : 'social');

// ---------------------------------------------------------------- report status (what the reporter sees)
export type ReportStatus = 'open' | 'reviewing' | 'actioned' | 'dismissed';
export const REPORT_STATUS: Record<ReportStatus, { label: string; sub: string; tone: 'info' | 'warn' | 'ok' | 'mut' }> = {
  open: { label: 'Received', sub: 'Waiting for review', tone: 'info' },
  reviewing: { label: 'In review', sub: 'Someone on the HYBRD team is looking at it', tone: 'warn' },
  actioned: { label: 'Action taken', sub: 'It broke our guidelines, so we took action', tone: 'ok' },
  dismissed: { label: 'No violation found', sub: 'We reviewed it and it doesn’t break our guidelines. You can still block or restrict them.', tone: 'mut' },
};
export const MAX_MESSAGES_PER_REPORT = 10;

// ---------------------------------------------------------------- rate limits (also enforced by SQL triggers)
export const REPORT_LIMITS = { perHour: 10, perDay: 30, detailsMax: 500, duplicateWindowMs: 24 * 3600_000 } as const;
export function reportRateCheck(times: number[], now = Date.now()): { ok: true } | { ok: false; message: string } {
  const hour = times.filter((t) => now - t < 3600_000).length;
  const day = times.filter((t) => now - t < 86_400_000).length;
  if (day >= REPORT_LIMITS.perDay) return { ok: false, message: `You’ve sent ${REPORT_LIMITS.perDay} reports today. Try again tomorrow, or block the account now.` };
  if (hour >= REPORT_LIMITS.perHour) return { ok: false, message: `Slow down: up to ${REPORT_LIMITS.perHour} reports an hour. Try again later, or block the account now.` };
  return { ok: true };
}
export const isDuplicateReport = (mine: { targetType: string; targetId: string; createdAt: number }[], t: { targetType: string; targetId: string }, now = Date.now()) =>
  mine.some((r) => r.targetType === t.targetType && r.targetId === t.targetId && now - r.createdAt < REPORT_LIMITS.duplicateWindowMs);

// ---------------------------------------------------------------- community guidelines (original text)
export type GuidelineId = 'respect' | 'hate' | 'sexual' | 'minors' | 'self_harm' | 'violence' | 'spam' | 'authentic' | 'privacy';
export interface Guideline { id: GuidelineId; title: string; short: string; points: string[] }
export const GUIDELINES: Guideline[] = [
  { id: 'respect', title: 'Respect people', short: 'No harassment or bullying',
    points: ['Disagree about training, not about people.', 'No insults, threats, shaming bodies or performance, or piling on someone.', 'No unwanted repeated contact after someone has said no or blocked you.'] },
  { id: 'hate', title: 'No hate', short: 'No attacks on who people are',
    points: ['No content that attacks or dehumanises people because of race, ethnicity, nationality, religion, disability, sex, gender identity, sexual orientation or serious illness.', 'No hateful symbols, slurs or praise for hate groups.'] },
  { id: 'sexual', title: 'No sexual content', short: 'No nudity or sexual content',
    points: ['No nudity, sexual images or sexual messages, including in chats.', 'Progress photos are fine when you’re dressed the way you would be at a gym, a pool or a race.'] },
  { id: 'minors', title: 'Protect young people', short: 'Zero tolerance for harm to minors',
    points: ['Nothing that sexualises, exploits or endangers anyone under 18 — ever. We remove it and may report it to the authorities.', 'Adults may not seek private contact with minors they don’t know. Under-18 accounts are friends-only and can only chat or call with friends.', 'You must be 13 or older to use Friends & Stories.'] },
  { id: 'self_harm', title: 'No dangerous health content', short: 'No promoting self-harm or disordered eating',
    points: ['Don’t promote or give instructions for self-harm, suicide, purging, extreme fasting or dangerous drug use.', 'Talking about your own struggles or recovery is allowed — reach out to someone, and see Mind › Get help now for crisis lines.', 'Don’t make medical claims that could hurt someone. HYBRD isn’t medical advice, and posts aren’t either.'] },
  { id: 'violence', title: 'No violence or threats', short: 'No threats or graphic violence',
    points: ['No threats, encouraging violence, or graphic violent content.', 'No dangerous challenges that could get someone hurt.'] },
  { id: 'spam', title: 'No spam or scams', short: 'No spam, scams or fake engagement',
    points: ['No ads, repeated self-promotion, chain messages or fake engagement.', 'No scams, phishing, or asking people for money, passwords or codes.'] },
  { id: 'authentic', title: 'Be real', short: 'No impersonation or faked results',
    points: ['Don’t pretend to be another person, coach or brand.', 'Don’t post someone else’s workouts or results as your own.'] },
  { id: 'privacy', title: 'Protect privacy', short: 'No sharing others’ private details',
    points: ['Don’t post other people’s photos, location or personal details without their permission.', 'Don’t share screenshots of private chats to embarrass someone.'] },
];
export const guidelineById = (id: string): Guideline => GUIDELINES.find((g) => g.id === id) || GUIDELINES[0];
export const guidelineForReason = (r: string): Guideline => guidelineById(reasonInfo(normalizeReason(r)).guideline);

// ---------------------------------------------------------------- moderator decisions + appeals
export type DecisionKind = 'remove_content' | 'restrict_messaging' | 'suspend';
export type ModActionType = DecisionKind | 'dismiss' | 'review' | 'restore_content' | 'appeal_reviewing' | 'appeal_upheld' | 'appeal_reversed';
export type ContentType = 'post' | 'story' | 'comment' | 'activity' | 'message';
export const DECISION_LABEL: Record<DecisionKind, string> = { remove_content: 'Content removed', restrict_messaging: 'Messaging restricted', suspend: 'Account suspended' };
export const SUSPEND_DAY_OPTIONS = [1, 3, 7, 30] as const;
export const MAX_SUSPEND_DAYS = 365;
export type AppealStatus = 'submitted' | 'under_review' | 'upheld' | 'reversed';
export const APPEAL_STATUS: Record<AppealStatus, { label: string; sub: string; tone: 'info' | 'warn' | 'ok' | 'mut' }> = {
  submitted: { label: 'Submitted', sub: 'We got your appeal. We’ll look at the decision again and show the result here.', tone: 'info' },
  under_review: { label: 'Under review', sub: 'Someone is looking at your appeal now.', tone: 'warn' },
  upheld: { label: 'Decision upheld', sub: 'We looked again and the decision stays.', tone: 'mut' },
  reversed: { label: 'Decision reversed', sub: 'We got it wrong. It’s been undone and restored.', tone: 'ok' },
};
export const APPEAL_WINDOW_DAYS = 30;
export const APPEAL_TEXT = { min: 10, max: 1000 } as const;
export interface Appeal { id: string; decisionId: string; text: string; status: AppealStatus; createdAt: number; decidedAt?: number; note?: string }
export interface Decision {
  id: string;
  kind: DecisionKind;
  guideline: GuidelineId;
  /** Short explanation for the person (never names the reporter). */
  note?: string;
  contentType?: ContentType;
  contentId?: string;
  contentPreview?: string;
  createdAt: number;
  /** Suspensions and messaging restrictions end here; content removals have no end. */
  endsAt?: number;
  reversedAt?: number;
  appeal?: Appeal | null;
  sample?: boolean;
}
export const decisionActive = (d: Pick<Decision, 'kind' | 'endsAt' | 'reversedAt'>, now = Date.now()) =>
  !d.reversedAt && (d.kind === 'remove_content' || (d.endsAt != null && d.endsAt > now));
export function canAppeal(d: Pick<Decision, 'createdAt' | 'reversedAt' | 'appeal'>, now = Date.now()): { ok: true; daysLeft: number } | { ok: false; why: string } {
  if (d.reversedAt) return { ok: false, why: 'This decision was already reversed.' };
  if (d.appeal) return { ok: false, why: 'You’ve already appealed this decision. Each decision can be appealed once.' };
  const left = d.createdAt + APPEAL_WINDOW_DAYS * 86_400_000 - now;
  if (left <= 0) return { ok: false, why: `Appeals must be sent within ${APPEAL_WINDOW_DAYS} days of the decision.` };
  return { ok: true, daysLeft: Math.ceil(left / 86_400_000) };
}
export function validateAppeal(text: string): string | null {
  const t = text.trim();
  if (t.length < APPEAL_TEXT.min) return `Tell us a bit more (at least ${APPEAL_TEXT.min} characters).`;
  if (t.length > APPEAL_TEXT.max) return `Keep it under ${APPEAL_TEXT.max} characters.`;
  return null;
}
export const appealDeadline = (d: Pick<Decision, 'createdAt'>) => d.createdAt + APPEAL_WINDOW_DAYS * 86_400_000;

// ---------------------------------------------------------------- account: time off + deletion
export type PauseOption = 'open' | 'week' | 'month' | 'custom';
export const PAUSE_OPTIONS: { v: PauseOption; label: string; sub: string }[] = [
  { v: 'open', label: 'Until I come back', sub: 'Stays paused until you log in and tap Resume' },
  { v: 'week', label: '1 week', sub: 'Comes back on its own after 7 days' },
  { v: 'month', label: '1 month', sub: 'Comes back on its own after 30 days' },
  { v: 'custom', label: 'Pick a date', sub: 'Comes back on its own that morning' },
];
export const MAX_PAUSE_DAYS = 365;
const DAY = 86_400_000;
const startOfLocalDay = (ms: number) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
/** End of a pause: null = until I come back. Custom dates resume at the start of that (local) day. Throws on a bad date. */
export function pauseUntilFor(opt: PauseOption, now = Date.now(), custom?: string): number | null {
  if (opt === 'open') return null;
  if (opt === 'week') return now + 7 * DAY;
  if (opt === 'month') return now + 30 * DAY;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(custom || '');
  if (!m) throw new Error('Pick the day you want to come back.');
  const t = new Date(+m[1], +m[2] - 1, +m[3]).getTime();
  if (!(t > startOfLocalDay(now))) throw new Error('Pick a day after today.');
  if (t - now > MAX_PAUSE_DAYS * DAY) throw new Error(`You can pause for up to ${MAX_PAUSE_DAYS} days. For longer, choose “Until I come back”.`);
  return t;
}
export const DELETION_GRACE_DAYS = 30;
export const deletionDateOf = (requestedAt: number) => requestedAt + DELETION_GRACE_DAYS * DAY;
export const DELETE_REASONS = ['Taking a break from social apps', 'Privacy concerns', 'Too many notifications', 'I made another account', 'I don’t find it useful', 'Something else'] as const;

export interface AccountState { pausedAt?: number | null; pauseUntil?: number | null; deletionRequestedAt?: number | null; purgeAt?: number | null; deletionReason?: string | null }
export type StatusKind = 'active' | 'paused' | 'deletion_pending' | 'suspended';
export interface EffectiveStatus { kind: StatusKind; until?: number | null; purgeAt?: number; decision?: Decision }
/** What the account looks like right now. Deletion wins over a suspension, which wins over a pause. Expired pauses resume by themselves. */
export function effectiveStatus(a: AccountState | null | undefined, decisions: Decision[] = [], now = Date.now()): EffectiveStatus {
  if (a?.deletionRequestedAt) return { kind: 'deletion_pending', purgeAt: a.purgeAt || deletionDateOf(a.deletionRequestedAt) };
  const sus = decisions.filter((d) => d.kind === 'suspend' && decisionActive(d, now)).sort((x, y) => (y.endsAt || 0) - (x.endsAt || 0))[0];
  if (sus) return { kind: 'suspended', until: sus.endsAt, decision: sus };
  if (a?.pausedAt && (a.pauseUntil == null || a.pauseUntil > now)) return { kind: 'paused', until: a.pauseUntil ?? null };
  return { kind: 'active' };
}
export const pauseExpired = (a: AccountState | null | undefined, now = Date.now()) => !!a?.pausedAt && a.pauseUntil != null && a.pauseUntil <= now;
/** Is the person hidden from everyone else (profile, posts, activities, messages, calls)? */
export const hiddenFromOthers = (s: EffectiveStatus) => s.kind !== 'active';
export const messagingRestricted = (decisions: Decision[], now = Date.now()) => decisions.find((d) => d.kind === 'restrict_messaging' && decisionActive(d, now)) || null;

// ---------------------------------------------------------------- messages: unsend window
export const UNSEND_WINDOW_MS = 24 * 3600_000;
export const UNSEND_WINDOW_LABEL = '24 hours';

// ---------------------------------------------------------------- moderation queue
export interface QueueReport {
  kind: 'report'; id: string; store: 'social' | 'messages'; targetType: ReportTargetType; targetId: string; conversationId?: string;
  targetUserId?: string; targetName?: string; reason: ReportReason; details?: string; snapshot?: unknown; status: ReportStatus;
  priority: 0 | 1 | 2; createdAt: number; reportCount?: number; sample?: boolean;
}
export interface QueueAppeal { kind: 'appeal'; id: string; decision: Decision; userId: string; userName?: string; text: string; status: AppealStatus; createdAt: number; priority: 0 | 1 | 2; sample?: boolean }
export type QueueItem = QueueReport | QueueAppeal;
/** Urgent first, then oldest first (so nothing waits forever). Appeals of suspensions count as high priority. */
export function sortQueue<T extends Pick<QueueItem, 'priority' | 'createdAt'>>(items: T[]): T[] {
  return items.slice().sort((a, b) => a.priority - b.priority || a.createdAt - b.createdAt);
}
export const appealPriority = (d: Pick<Decision, 'kind'>): 0 | 1 | 2 => (d.kind === 'suspend' ? 1 : 2);
export const openQueue = (items: QueueItem[]) => sortQueue(items.filter((i) => (i.kind === 'report' ? i.status === 'open' || i.status === 'reviewing' : i.status === 'submitted' || i.status === 'under_review')));

// ---------------------------------------------------------------- help lines (US; see Mind › Get help now for more)
export const CRISIS_LINES = {
  call988: 'tel:988', text988: 'sms:988', chat988: 'https://988lifeline.org/chat/', findHelpline: 'https://findahelpline.com',
  cyberTipline: 'https://report.cybertip.org', cyberTiplinePhone: 'tel:18008435678',
} as const;

// ---------------------------------------------------------------- dates
export const fmtDate = (ms: number) => new Date(ms).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
export const fmtShortDate = (ms: number) => new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
export const daysUntil = (ms: number, now = Date.now()) => Math.max(0, Math.ceil((ms - now) / DAY));
