// Safety — the backend contract shared by the live (Supabase RPCs in supabase/schema.sql, SETUP §15) and the on-device
// demo/local backend. Pure rules live in ./safety; every rule that matters is enforced again by the database.
import {
  normalizeReason, priorityOf,
  type AccountState, type Appeal, type AppealStatus, type ContentType, type Decision, type DecisionKind, type GuidelineId,
  type QueueAppeal, type QueueReport, type ReportReason, type ReportStatus, type ReportTargetType,
} from './safety';

export interface SafetyStatus { account: AccountState; decisions: Decision[]; isModerator: boolean; serverNow: number }
export interface MyReport { id: string; store: 'social' | 'messages'; targetType: ReportTargetType; targetId: string; targetName?: string; reason: ReportReason; details?: string; status: ReportStatus; createdAt: number; reviewedAt?: number }
export interface LoggedReport { targetType: ReportTargetType; targetId: string; targetName?: string; reason: ReportReason; details?: string }
export type ModAction = 'review' | 'dismiss' | 'remove_content' | 'restrict_messaging' | 'suspend';
export interface ModActInput { store: 'social' | 'messages'; reportId: string; action: ModAction; guideline?: GuidelineId; note?: string; days?: number; internal?: string }
export interface ModQueue { reports: QueueReport[]; appeals: QueueAppeal[] }

export interface SafetyBackend {
  readonly kind: 'demo' | 'live';
  status(): Promise<SafetyStatus>;
  myReports(): Promise<MyReport[]>;
  /** Demo/local only: remember a report sent through a demo backend so "My reports" can show it. Live: the server keeps it. */
  logReport(r: LoggedReport): Promise<void>;
  pause(until: number | null): Promise<void>;
  resume(): Promise<void>;
  /** Live: re-checks the password first (fresh sign-in required by the server). Returns the permanent deletion date. */
  requestDeletion(o: { password?: string; reason?: string }): Promise<number>;
  reopen(): Promise<void>;
  appeal(decisionId: string, text: string): Promise<void>;
  modQueue(): Promise<ModQueue>;
  modAct(a: ModActInput): Promise<void>;
  modDecideAppeal(appealId: string, status: Exclude<AppealStatus, 'submitted'>, note?: string): Promise<void>;
  /** Demo only (clearly labelled in the UI): pretend a moderator acted on your account so the notices and appeals can be tried. */
  simulateDecision?(d: SimulatedDecision): Promise<void>;
  /** Demo only: forget simulated decisions, reports and account changes. */
  resetDemo?(): Promise<void>;
}
export interface SimulatedDecision { kind: DecisionKind; guideline: GuidelineId; note?: string; contentType?: ContentType; contentId?: string; contentPreview?: string; days?: number }

// ---------- mapping server JSON (snake_case) → app types; shared so tests can check it ----------
type J = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const ts = (s?: string | null) => (s ? Date.parse(s) : undefined);
export function mapAppeal(a: J | null | undefined, decisionId: string): Appeal | null {
  if (!a) return null;
  return { id: a.id, decisionId, text: a.body || '', status: a.status as AppealStatus, createdAt: ts(a.created_at) || 0, decidedAt: ts(a.decided_at), note: a.note || undefined };
}
export function mapDecision(d: J): Decision {
  return {
    id: d.id, kind: d.kind as DecisionKind, guideline: (d.guideline || 'respect') as GuidelineId, note: d.note || undefined,
    contentType: (d.content_type || undefined) as ContentType | undefined, contentId: d.content_id || undefined, contentPreview: d.content_preview || undefined,
    createdAt: ts(d.created_at) || 0, endsAt: ts(d.ends_at), reversedAt: ts(d.reversed_at), appeal: mapAppeal(d.appeal, d.id),
  };
}
export function mapStatus(j: J): SafetyStatus {
  return {
    account: { pausedAt: ts(j.paused_at) ?? null, pauseUntil: ts(j.pause_until) ?? null, deletionRequestedAt: ts(j.deletion_requested_at) ?? null, purgeAt: ts(j.purge_after) ?? null },
    decisions: ((j.decisions || []) as J[]).map(mapDecision), isModerator: !!j.is_moderator, serverNow: ts(j.now) || Date.now(),
  };
}
export function mapMyReport(r: J): MyReport {
  return { id: r.id, store: r.store, targetType: r.target_type, targetId: r.target_id, targetName: r.target_name || undefined, reason: normalizeReason(r.reason), details: r.details || undefined, status: r.status, createdAt: ts(r.created_at) || 0, reviewedAt: ts(r.reviewed_at) };
}
export function mapQueue(j: J): ModQueue {
  const reports: QueueReport[] = ((j.reports || []) as J[]).map((r) => ({
    kind: 'report', id: r.id, store: r.store, targetType: r.target_type, targetId: r.target_id, conversationId: r.conversation_id || undefined,
    targetUserId: r.target_user_id || undefined, targetName: r.target_name || undefined, reason: normalizeReason(r.reason), details: r.details || undefined,
    snapshot: r.snapshot, status: r.status, priority: (r.priority ?? priorityOf(r.reason)) as 0 | 1 | 2, createdAt: ts(r.created_at) || 0, reportCount: Number(r.report_count) || 1,
  }));
  const appeals: QueueAppeal[] = ((j.appeals || []) as J[]).map((a) => {
    const decision = mapDecision(a.decision || {});
    return { kind: 'appeal', id: a.id, decision, userId: a.user_id, userName: a.user_name || undefined, text: a.body || '', status: a.status, createdAt: ts(a.created_at) || 0, priority: decision.kind === 'suspend' ? 1 : 2 };
  });
  return { reports, appeals };
}

/** Server error codes → words a person can act on. */
export function friendlySafetyError(e: unknown): string {
  const m = (e as { message?: string })?.message || String(e);
  if (/reauth_required/.test(m)) return 'For your security, enter your password again.';
  if (/invalid login|incorrect/i.test(m)) return 'That password doesn’t match this account.';
  if (/report_duplicate/.test(m)) return 'You already reported this. We’ll review it.';
  if (/rate_limit/.test(m)) return 'You’ve sent a lot of reports in a short time. Please try again later.';
  if (/appeal_once/.test(m)) return 'You’ve already appealed this decision.';
  if (/appeal_window/.test(m)) return 'The 30 days to appeal this decision have passed.';
  if (/appeal_text/.test(m)) return 'Tell us a bit more (at least 10 characters).';
  if (/appeal_reversed/.test(m)) return 'This decision was already reversed.';
  if (/pause_date/.test(m)) return 'Pick a date within the next year.';
  if (/deletion_pending/.test(m)) return 'Your account is scheduled for deletion. Reopen it first.';
  if (/not_moderator/.test(m)) return 'Only moderators can open the review queue.';
  if (/mod_self/.test(m)) return 'You can’t act on reports about yourself.';
  if (/mod_guideline/.test(m)) return 'Choose the guideline that was broken.';
  if (/fetch|network|offline/i.test(m)) return 'You’re offline. Try again when you’re connected.';
  return m.replace(/^[a-z_]+: /, '');
}
