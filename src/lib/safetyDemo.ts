// Safety DEMO / local backend: runs on this device only. Nothing is sent anywhere and no real moderator is involved.
// It follows the same rules as the server (./safety) so the flows — report, time off, delete with 30 days to reopen,
// appeals and the moderator queue — can be tried without an account. SAMPLE queue items are clearly labelled.
// Persistence and the clock are injected so tools/test-safety.ts can run it in Node.
import {
  canAppeal, deletionDateOf, isDuplicateReport, pauseUntilFor, pauseExpired, priorityOf, reportRateCheck, validateAppeal, MAX_PAUSE_DAYS, MAX_SUSPEND_DAYS, REPORT_LIMITS,
  type AccountState, type AppealStatus, type Decision, type QueueAppeal, type QueueReport, type ReportStatus,
} from './safety';
import type { LoggedReport, ModActInput, ModQueue, MyReport, SafetyBackend, SafetyStatus, SimulatedDecision } from './safetyApi';

const DAY = 86_400_000;
export interface ModLogEntry { id: string; action: string; reportId?: string; appealId?: string; decisionId?: string; guideline?: string; note?: string; at: number }
export interface SafetyDemoState {
  v: 1;
  account: AccountState;
  decisions: Decision[];
  reports: (MyReport & { log?: true })[];
  reportTimes: number[];
  sample: QueueReport[];
  log: ModLogEntry[];
}
export interface SafetyDemoDeps { load(): Promise<SafetyDemoState | undefined>; save(s: SafetyDemoState): Promise<void>; now?: () => number }

/** SAMPLE reports for the demo moderator queue. Made-up accounts, labelled SAMPLE everywhere they appear. */
export function sampleQueue(now: number): QueueReport[] {
  const r = (id: string, o: Partial<QueueReport> & Pick<QueueReport, 'reason' | 'targetType'>, minsAgo: number): QueueReport => ({
    kind: 'report', id, store: o.targetType === 'message' ? 'messages' : 'social', targetId: `sample-${id}`, status: 'open', priority: priorityOf(o.reason), createdAt: now - minsAgo * 60_000, sample: true, reportCount: 1, ...o,
  });
  return [
    r('q1', { targetType: 'post', reason: 'spam', targetName: 'sample.fastgains', details: 'Same supplement link posted on every workout.', snapshot: { body: 'Get shredded in 7 days 💊 link in bio', sample: true }, reportCount: 3 }, 50),
    r('q2', { targetType: 'message', reason: 'harassment', targetName: 'sample.rival', snapshot: { messages: [{ body: 'You’ll never finish a HYROX, quit now', sample: true }] } }, 95),
    r('q3', { targetType: 'comment', reason: 'self_harm', targetName: 'sample.quietrunner', snapshot: { body: 'Sometimes I don’t see the point of any of this', sample: true }, details: 'I’m worried about them.' }, 20),
    r('q4', { targetType: 'user', reason: 'impersonation', targetName: 'sample.coach.k', details: 'Pretending to be a well-known coach.' }, 400),
    r('q5', { targetType: 'user', reason: 'minor', targetName: 'sample.newbie', details: 'Says they are 12 in their bio.' }, 10),
  ];
}
export const seedSafety = (now: number): SafetyDemoState => ({ v: 1, account: {}, decisions: [], reports: [], reportTimes: [], sample: sampleQueue(now), log: [] });
const nid = (p: string, n: number) => `${p}-${n.toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const err = (code: string, msg: string) => new Error(`${code}: ${msg}`);

export class SafetyDemoBackend implements SafetyBackend {
  readonly kind = 'demo' as const;
  private s: SafetyDemoState | null = null;
  private deps: SafetyDemoDeps;
  constructor(deps: SafetyDemoDeps) { this.deps = deps; }
  private now() { return this.deps.now ? this.deps.now() : Date.now(); }
  private async st(): Promise<SafetyDemoState> {
    if (!this.s) this.s = (await this.deps.load()) || seedSafety(this.now());
    return this.s;
  }
  private async commit() { if (this.s) await this.deps.save(this.s); }
  private logAct(s: SafetyDemoState, e: Omit<ModLogEntry, 'id' | 'at'>) { s.log.push({ ...e, id: nid('ma', this.now()), at: this.now() }); }

  async status(): Promise<SafetyStatus> {
    const s = await this.st();
    if (pauseExpired(s.account, this.now())) { s.account = { ...s.account, pausedAt: null, pauseUntil: null }; await this.commit(); } // auto-resume
    return { account: { ...s.account }, decisions: s.decisions.map((d) => ({ ...d, appeal: d.appeal ? { ...d.appeal } : null })), isModerator: false, serverNow: this.now() };
  }
  async myReports(): Promise<MyReport[]> { return (await this.st()).reports.slice().sort((a, b) => b.createdAt - a.createdAt); }
  async logReport(r: LoggedReport) {
    const s = await this.st(); const now = this.now();
    const rate = reportRateCheck(s.reportTimes, now);
    if (!rate.ok) throw err('rate_limit', rate.message);
    if (isDuplicateReport(s.reports, r, now)) throw err('report_duplicate', 'you already reported this');
    s.reportTimes = [...s.reportTimes.filter((t) => now - t < DAY), now];
    const store = r.targetType === 'message' || r.targetType === 'conversation' || r.targetType === 'call' ? 'messages' : 'social';
    s.reports.push({ id: nid('rp', now), store, targetType: r.targetType, targetId: r.targetId, targetName: r.targetName, reason: r.reason, details: r.details?.slice(0, REPORT_LIMITS.detailsMax), status: 'open', createdAt: now });
    await this.commit();
  }
  async pause(until: number | null) {
    const s = await this.st(); const now = this.now();
    if (until != null && (until <= now || until > now + (MAX_PAUSE_DAYS + 1) * DAY)) throw err('pause_date', 'pick a date within the next year');
    if (s.account.deletionRequestedAt) throw err('deletion_pending', 'reopen your account first');
    s.account = { ...s.account, pausedAt: now, pauseUntil: until }; await this.commit();
  }
  async resume() { const s = await this.st(); s.account = { ...s.account, pausedAt: null, pauseUntil: null }; await this.commit(); }
  async requestDeletion(o: { password?: string; reason?: string }) {
    const s = await this.st(); const now = this.now();
    const purgeAt = deletionDateOf(now);
    s.account = { pausedAt: null, pauseUntil: null, deletionRequestedAt: now, purgeAt, deletionReason: o.reason?.slice(0, 200) || null };
    await this.commit(); return purgeAt;
  }
  async reopen() { const s = await this.st(); s.account = { ...s.account, deletionRequestedAt: null, purgeAt: null, deletionReason: null }; await this.commit(); }
  async appeal(decisionId: string, text: string) {
    const s = await this.st(); const d = s.decisions.find((x) => x.id === decisionId);
    if (!d) throw err('appeal_not_found', 'decision not found');
    const ok = canAppeal(d, this.now()); if (!ok.ok) throw err(d.appeal ? 'appeal_once' : d.reversedAt ? 'appeal_reversed' : 'appeal_window', ok.why);
    const bad = validateAppeal(text); if (bad) throw err('appeal_text', bad);
    d.appeal = { id: nid('ap', this.now()), decisionId, text: text.trim(), status: 'submitted', createdAt: this.now() };
    await this.commit();
  }
  async simulateDecision(x: SimulatedDecision) {
    const s = await this.st(); const now = this.now();
    const days = Math.min(MAX_SUSPEND_DAYS, Math.max(1, Math.round(x.days || 3)));
    const d: Decision = { id: nid('dc', now), kind: x.kind, guideline: x.guideline, note: x.note, contentType: x.contentType, contentId: x.contentId, contentPreview: x.contentPreview?.slice(0, 140), createdAt: now, endsAt: x.kind === 'remove_content' ? undefined : now + days * DAY, appeal: null, sample: true };
    s.decisions.unshift(d); this.logAct(s, { action: x.kind, decisionId: d.id, guideline: x.guideline, note: 'demo simulation' }); await this.commit();
  }
  async resetDemo() { this.s = seedSafety(this.now()); await this.commit(); }

  // ---------- demo moderator queue: SAMPLE reports + your own reports and appeals, all on this device ----------
  async modQueue(): Promise<ModQueue> {
    const s = await this.st();
    const mine: QueueReport[] = s.reports.filter((r) => r.status === 'open' || r.status === 'reviewing').map((r) => ({
      kind: 'report', id: r.id, store: r.store, targetType: r.targetType, targetId: r.targetId, targetName: r.targetName, reason: r.reason, details: r.details, status: r.status, priority: priorityOf(r.reason), createdAt: r.createdAt, reportCount: 1,
    }));
    const reports = [...s.sample.filter((r) => r.status === 'open' || r.status === 'reviewing'), ...mine];
    const appeals: QueueAppeal[] = s.decisions.filter((d) => d.appeal && (d.appeal.status === 'submitted' || d.appeal.status === 'under_review')).map((d) => ({
      kind: 'appeal', id: d.appeal!.id, decision: { ...d, appeal: null }, userId: 'me', userName: 'You (demo)', text: d.appeal!.text, status: d.appeal!.status, createdAt: d.appeal!.createdAt, priority: d.kind === 'suspend' ? 1 : 2, sample: true,
    }));
    return { reports, appeals };
  }
  async modAct(a: ModActInput) {
    const s = await this.st();
    if ((a.action === 'remove_content' || a.action === 'restrict_messaging' || a.action === 'suspend') && !a.guideline) throw err('mod_guideline', 'choose the guideline that was broken');
    if ((a.action === 'restrict_messaging' || a.action === 'suspend') && !(a.days && a.days >= 1 && a.days <= MAX_SUSPEND_DAYS)) throw err('mod_days', 'choose 1–365 days');
    const status: ReportStatus = a.action === 'review' ? 'reviewing' : a.action === 'dismiss' ? 'dismissed' : 'actioned';
    const item = s.sample.find((r) => r.id === a.reportId) || s.reports.find((r) => r.id === a.reportId);
    if (!item) throw err('mod_not_found', 'report not found');
    item.status = status;
    this.logAct(s, { action: a.action, reportId: a.reportId, guideline: a.guideline, note: a.note });
    await this.commit();
  }
  async modDecideAppeal(appealId: string, status: Exclude<AppealStatus, 'submitted'>, note?: string) {
    const s = await this.st(); const now = this.now();
    const d = s.decisions.find((x) => x.appeal?.id === appealId);
    if (!d || !d.appeal) throw err('mod_not_found', 'appeal not found');
    if (d.appeal.status === 'upheld' || d.appeal.status === 'reversed') throw err('appeal_decided', 'already decided');
    d.appeal = { ...d.appeal, status, decidedAt: status === 'under_review' ? undefined : now, note: note || undefined };
    if (status === 'reversed') d.reversedAt = now;
    this.logAct(s, { action: `appeal_${status === 'under_review' ? 'reviewing' : status}`, appealId, decisionId: d.id, note });
    if (status === 'reversed' && d.kind === 'remove_content') this.logAct(s, { action: 'restore_content', decisionId: d.id });
    await this.commit();
  }
  /** for tests and the demo queue's "history" line */
  async modLog() { return (await this.st()).log.slice(); }
}
export { pauseUntilFor };
