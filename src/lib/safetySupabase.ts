// Safety LIVE backend (Supabase). Everything goes through security-definer RPCs in supabase/schema.sql (SETUP §15):
// the database decides who is a moderator, what can be appealed, and what is hidden while an account is paused,
// suspended or scheduled for deletion. This client only asks and shows what comes back.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppealStatus } from './safety';
import { mapMyReport, mapQueue, mapStatus, type LoggedReport, type ModActInput, type ModQueue, type MyReport, type SafetyBackend, type SafetyStatus } from './safetyApi';

export class SupabaseSafety implements SafetyBackend {
  readonly kind = 'live' as const;
  private sb: SupabaseClient;
  private email: string | null;
  constructor(sb: SupabaseClient, email: string | null) { this.sb = sb; this.email = email; }
  private async rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.sb.rpc(fn, args);
    if (error) throw new Error(error.message);
    return data as T;
  }
  async status(): Promise<SafetyStatus> { return mapStatus(await this.rpc('account_status')); }
  async myReports(): Promise<MyReport[]> { return ((await this.rpc<unknown[]>('safety_my_reports')) || []).map((r) => mapMyReport(r as Record<string, unknown>)); }
  async logReport(_r: LoggedReport) { /* live reports are stored by the server when they're sent */ }
  async pause(until: number | null) { await this.rpc('account_pause', { p_until: until ? new Date(until).toISOString() : null }); }
  async resume() { await this.rpc('account_resume'); }
  async requestDeletion(o: { password?: string; reason?: string }) {
    if (!this.email) throw new Error('reauth_required: sign in again');
    if (!o.password) throw new Error('reauth_required: enter your password');
    // Fresh sign-in: the server only accepts deletion within 10 minutes of a password sign-in.
    const { error } = await this.sb.auth.signInWithPassword({ email: this.email, password: o.password });
    if (error) throw new Error(/invalid/i.test(error.message) ? 'That password doesn’t match this account.' : error.message);
    const at = await this.rpc<string>('account_request_deletion', { p_reason: o.reason || null });
    return Date.parse(at);
  }
  async reopen() { await this.rpc('account_reopen'); }
  async appeal(decisionId: string, text: string) { await this.rpc('appeal_submit', { p_decision: decisionId, p_body: text }); }
  async modQueue(): Promise<ModQueue> { return mapQueue((await this.rpc('mod_queue')) || {}); }
  async modAct(a: ModActInput) {
    await this.rpc('mod_act', { p_store: a.store, p_report: a.reportId, p_action: a.action, p_guideline: a.guideline || null, p_note: a.note || null, p_days: a.days || null, p_internal: a.internal || null });
  }
  async modDecideAppeal(appealId: string, status: Exclude<AppealStatus, 'submitted'>, note?: string) { await this.rpc('mod_decide_appeal', { p_appeal: appealId, p_status: status, p_note: note || null }); }
}
