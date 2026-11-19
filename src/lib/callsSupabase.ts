// Calls LIVE backend (Supabase). The database decides who may call whom (call_* functions in supabase/schema.sql ›
// CALLS) and keeps the call log; Realtime delivers rings and state changes; WebRTC signaling (offers / answers / ICE)
// goes over Realtime Broadcast on a private channel "call:<call id>" that only the call's participants may join.
// Media itself is peer-to-peer (DTLS-SRTP), or through your TURN relay when one is configured.
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { canCall, friendlyCallError, hasTurn, type CallCheck, type CallHistoryItem, type CallKind, type CallStatus, type Signal } from './calls';
import { CallEngine, type SignalTransport } from './callEngine';
import { getIceServers } from './callIce';
import type { CallBackend, CallEvent, CallMedia, ConnectOpts, PeerCallState, StartResult } from './callsApi';
import type { SupabaseDm } from './messagesSupabase';
import { MAX_CALL_PEOPLE } from './calls';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const ts = (s?: string | null) => (s ? Date.parse(s) : 0);

/** Realtime Broadcast transport for one call (private channel; RLS on realtime.messages lets only participants in). */
export class SupabaseSignal implements SignalTransport {
  private ch: RealtimeChannel;
  private cbs = new Set<(m: unknown) => void>();
  private queue: Signal[] = [];
  private ready = false;
  private sb: SupabaseClient;
  constructor(sb: SupabaseClient, callId: string) {
    this.sb = sb;
    this.ch = sb.channel(`call:${callId}`, { config: { private: true, broadcast: { self: false, ack: false } } })
      .on('broadcast', { event: 'sig' }, ({ payload }) => { for (const f of this.cbs) f(payload); })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') { this.ready = true; for (const m of this.queue.splice(0)) void this.send(m); }
      });
  }
  async send(m: Signal) {
    if (!this.ready) { if (this.queue.length < 200) this.queue.push(m); return; }
    await this.ch.send({ type: 'broadcast', event: 'sig', payload: m }).catch(() => undefined);
  }
  on(cb: (m: unknown) => void) { this.cbs.add(cb); return () => { this.cbs.delete(cb); }; }
  close() { this.cbs.clear(); this.sb.removeChannel(this.ch).catch(() => undefined); }
}

export class SupabaseCalls implements CallBackend {
  readonly kind = 'live' as const;
  readonly myId: string;
  private sb: SupabaseClient;
  private dm: SupabaseDm;
  private subs = new Set<(e: CallEvent) => void>();
  private participants = new Map<string, Set<string>>();
  constructor(sb: SupabaseClient, myId: string, dm: SupabaseDm) { this.sb = sb; this.myId = myId; this.dm = dm; }
  private async rpc<T = unknown>(fn: string, args?: Row): Promise<T> {
    const { data, error } = await this.sb.rpc(fn, args);
    if (error) { const e = new Error(error.message); (e as Error & { friendly?: string }).friendly = friendlyCallError(error); throw e; }
    return data as T;
  }
  private emit(e: CallEvent) { for (const f of this.subs) { try { f(e); } catch { /* ignore */ } } }

  async check(conversationId: string): Promise<CallCheck> {
    const c = await this.dm.conversation(conversationId);
    if (!c) return { ok: false, reason: 'not_member', msg: 'This chat isn’t available.' };
    if (c.blocked) return { ok: false, reason: 'blocked', msg: 'You can’t call this account.' };
    // Everything else (their settings, under-18, Do not disturb) is decided by the server when the call starts.
    return canCall({ me: this.myId, kind: c.kind, myState: c.me.state, request: c.request, others: c.others.filter((o) => o.state === 'active').map((o) => o.userId), graph: { requests: [], friends: [], blocks: [] }, theirWho: Object.fromEntries(c.others.map((o) => [o.userId, 'everyone' as const])), online: navigator.onLine });
  }
  async start(conversationId: string, kind: CallKind): Promise<StartResult> {
    const r = await this.rpc<Row>('call_start', { p_conv: conversationId, p_kind: kind });
    return { callId: r.id, status: r.status, ringing: r.ringing || [] };
  }
  async answer(callId: string) { await this.rpc('call_answer', { p_call: callId }); }
  async decline(callId: string, busy = false) { await this.rpc('call_decline', { p_call: callId, p_busy: busy }); }
  async leave(callId: string, reason: 'hangup' | 'timeout' | 'failed') { await this.rpc('call_leave', { p_call: callId, p_reason: reason }); }
  async heartbeat(callId: string) { return (await this.rpc<string | null>('call_heartbeat', { p_call: callId }).catch(() => null)) as CallStatus | null; }
  private async loadParticipants(callId: string) {
    const { data } = await this.sb.from('call_participants').select('user_id, state').eq('call_id', callId);
    const set = new Set<string>((data || []).map((r: Row) => r.user_id as string));
    this.participants.set(callId, set);
    return set;
  }
  async connect(callId: string, o: ConnectOpts): Promise<CallMedia> {
    await this.loadParticipants(callId);
    const ice = await getIceServers(this.sb);
    const e = new CallEngine({
      callId, me: this.myId, transport: new SupabaseSignal(this.sb, callId), iceServers: ice, relayOnly: !!o.relayOnly && hasTurn(ice), local: o.local, maxPeople: MAX_CALL_PEOPLE,
      allowed: () => this.participants.get(callId), onUpdate: o.onUpdate, onPeerLeft: o.onPeerLeft,
      log: (...a) => console.debug('[call]', ...a),
    });
    return e;
  }
  subscribe(cb: (e: CallEvent) => void): () => void {
    this.subs.add(cb);
    const seen = new Set<string>();
    const incoming = async () => {
      const rows = (await this.rpc<Row[]>('call_incoming').catch(() => [])) || [];
      for (const r of rows) {
        if (seen.has(r.call_id)) continue; seen.add(r.call_id);
        this.emit({ type: 'incoming', invite: { callId: r.call_id, conversationId: r.conversation_id, kind: r.kind, callerId: r.caller_id, at: ts(r.created_at), group: !!r.is_group } });
      }
    };
    const ch = this.sb.channel(`calls:${this.myId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'call_participants' }, (p) => {
        const r = (p.new || {}) as Row;
        if (!r.call_id) return;
        if (r.user_id === this.myId && r.state === 'ringing') { void incoming(); return; }
        if (r.user_id !== this.myId) {
          this.participants.get(r.call_id)?.add(r.user_id);
          this.emit({ type: 'peer', callId: r.call_id, userId: r.user_id, state: r.state as PeerCallState });
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'calls' }, (p) => {
        const r = p.new as Row; if (!r?.id) return;
        this.emit({ type: 'status', callId: r.id, status: r.status });
        if (r.status !== 'ringing' && r.status !== 'active') this.emit({ type: 'history' });
      })
      .subscribe();
    // fallback when Realtime isn't enabled yet (or the socket dropped): look for rings every 12 s while the app is open
    void incoming();
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') void incoming(); }, 12_000);
    const vis = () => { if (document.visibilityState === 'visible') void incoming(); };
    document.addEventListener('visibilitychange', vis);
    return () => { this.subs.delete(cb); window.clearInterval(t); document.removeEventListener('visibilitychange', vis); this.sb.removeChannel(ch).catch(() => undefined); };
  }
  async history(): Promise<CallHistoryItem[]> {
    const rows = (await this.rpc<Row[]>('call_history', { p_limit: 60 }).catch(() => [])) || [];
    return rows.map((r) => ({
      id: r.call_id, conversationId: r.conversation_id, kind: r.kind, status: r.status, callerId: r.caller_id || '', at: ts(r.created_at),
      durationSec: r.answered_at && r.ended_at ? Math.max(0, Math.round((ts(r.ended_at) - ts(r.answered_at)) / 1000)) : 0,
      peers: r.peers || [], group: !!r.is_group, title: r.title || undefined,
    }));
  }
  async hide(callId: string) { await this.rpc('call_hide', { p_call: callId }); this.emit({ type: 'history' }); }
  async hasRelay() { return hasTurn(await getIceServers(this.sb)); }
}
