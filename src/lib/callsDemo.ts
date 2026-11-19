// Calls DEMO backend: lets you try voice + video calls with the clearly-labelled SAMPLE people, on this device.
// Nothing is sent anywhere and no WebRTC connection is made: a sample person's "video" is an animated avatar drawn on
// a canvas, labelled "SAMPLE · simulated video". The same rules as the server decide who can call whom
// (src/lib/calls.ts), and the call log goes into the chat thread exactly like the live version.
// Sample behaviour: Maya and Leo pick up after a few seconds; Ana declines; Kai takes no calls; requests can't call.
import { avatarHue, canCall, pairCallCheck, RING_TIMEOUT_MS, MAX_CALL_PEOPLE, type CallCheck, type CallHistoryItem, type CallKind, type CallStatus, type MediaFlags } from './calls';
import { DmError } from './messages';
import type { PublicProfile } from './social';
import type { CallBackend, CallEvent, CallInvite, CallMedia, ConnectOpts, PeerCallState, StartResult } from './callsApi';
import type { PeerView } from './callEngine';
import { DM_ME, type DemoDm } from './messagesDemo';

export interface DemoCallDeps {
  dm: DemoDm;
  schedule(fn: () => void, ms: number): void;
  now?: () => number;
  /** Browser: build the simulated media. Unit tests leave it out. */
  media?: (s: DemoSession, o: ConnectOpts, profile: (id: string) => PublicProfile | undefined) => DemoMediaLike;
}
export interface DemoMediaLike extends CallMedia { addPeer(id: string, cam: boolean, connected?: boolean): void; removePeer(id: string): void }
export interface DemoSession {
  id: string; conversationId: string; kind: CallKind; callerId: string; group: boolean;
  states: Record<string, PeerCallState>; status: CallStatus; startedAt: number; answeredAt?: number; logged: boolean;
  media?: DemoMediaLike;
}
/** How each sample person answers (ms after the ring starts). */
export const SAMPLE_PICKUP: Record<string, { after: number; answer: boolean }> = {
  s1: { after: 3000, answer: true }, s2: { after: 4200, answer: true }, s3: { after: 4500, answer: false },
};
let seq = 0;

export class DemoCalls implements CallBackend {
  readonly kind = 'demo' as const;
  readonly myId = DM_ME;
  private d: DemoCallDeps;
  private subs = new Set<(e: CallEvent) => void>();
  private sessions = new Map<string, DemoSession>();
  private profiles: Record<string, PublicProfile> = {};
  constructor(d: DemoCallDeps) { this.d = d; }
  private now() { return this.d.now ? this.d.now() : Date.now(); }
  private emit(e: CallEvent) { for (const f of this.subs) { try { f(e); } catch { /* ignore */ } } }
  private live() { return [...this.sessions.values()].find((s) => s.status === 'ringing' || s.status === 'active'); }
  session(id: string) { return this.sessions.get(id); }

  async check(conversationId: string): Promise<CallCheck> {
    const c = await this.d.dm.callContext(conversationId);
    if (!c) return { ok: false, reason: 'not_member', msg: 'This chat isn’t available.' };
    this.profiles = c.profiles;
    return canCall({ me: DM_ME, kind: c.conv.kind, myState: c.view.me.state, request: c.view.request, others: c.others, graph: c.graph, minors: c.minors, theirWho: c.theirWho, inCall: !!this.live(), supported: true });
  }
  async start(conversationId: string, kind: CallKind): Promise<StartResult> {
    const chk = await this.check(conversationId);
    if (!chk.ok) throw new DmError(`call_${chk.reason}`, chk.msg);
    const c = (await this.d.dm.callContext(conversationId))!;
    const id = `call-${this.now().toString(36)}-${(seq++).toString(36)}`;
    const ringing = c.others.filter((o) => pairCallCheck({ me: DM_ME, other: o, graph: c.graph, minors: c.minors, theirWho: c.theirWho[o] }).ok).slice(0, 12);
    const s: DemoSession = { id, conversationId, kind, callerId: DM_ME, group: c.conv.kind === 'group', states: { [DM_ME]: 'joined' }, status: 'ringing', startedAt: this.now(), logged: false };
    // Do not disturb: it just rings out on the caller's side ("No answer"), exactly like the server does
    const quiet = new Set(ringing.filter((o) => !!c.dnd[o] && c.dnd[o]! > this.now()));
    for (const o of ringing) s.states[o] = 'ringing';
    this.sessions.set(id, s);
    for (const [i, o] of ringing.entries()) {
      if (quiet.has(o)) continue;
      const p = SAMPLE_PICKUP[o] || { after: 3500 + i * 900, answer: true };
      this.d.schedule(() => { void this.samplePick(s, o, p.answer); }, s.group ? p.after + i * 600 : p.after);
    }
    return { callId: id, status: 'ringing', ringing: ringing.filter((o) => s.states[o] === 'ringing') };
  }
  private joinedCount(s: DemoSession) { return Object.values(s.states).filter((x) => x === 'joined').length; }
  private async samplePick(s: DemoSession, who: string, answer: boolean) {
    if (s.status !== 'ringing' && s.status !== 'active') return;
    if (s.states[who] !== 'ringing') return;
    if (answer && this.joinedCount(s) >= MAX_CALL_PEOPLE) answer = false;
    s.states[who] = answer ? 'joined' : 'declined';
    this.emit({ type: 'peer', callId: s.id, userId: who, state: s.states[who] });
    if (answer) {
      if (s.status === 'ringing') { s.status = 'active'; s.answeredAt = this.now(); }
      s.media?.addPeer(who, s.kind === 'video');
    } else if (!s.group) {
      await this.finish(s, 'declined');
    }
  }
  /** Write the call card into the chat (once) and tell listeners. */
  private async finish(s: DemoSession, status: CallStatus) {
    if (s.logged) return;
    s.logged = true; s.status = status;
    for (const [u, st] of Object.entries(s.states)) if (st === 'ringing') { s.states[u] = 'missed'; }
    const durationSec = status === 'ended' && s.answeredAt ? Math.max(1, Math.round((this.now() - s.answeredAt) / 1000)) : undefined;
    const people = Object.values(s.states).filter((x) => x === 'joined' || x === 'left').length;
    await this.d.dm.logCall(s.conversationId, s.callerId, { id: s.id, kind: s.kind, status, durationSec, people: s.group ? people : undefined });
    this.emit({ type: 'status', callId: s.id, status });
    this.emit({ type: 'history' });
  }
  async answer(callId: string) {
    const s = this.sessions.get(callId);
    if (!s || (s.status !== 'ringing' && s.status !== 'active')) throw new DmError('call_ended', 'This call has ended.');
    s.states[DM_ME] = 'joined'; s.status = 'active'; s.answeredAt ||= this.now();
    // in a group call, the other sample members who were "already on" join too
    if (s.group) for (const [u, st] of Object.entries(s.states)) if (u !== DM_ME && u !== s.callerId && st === 'ringing') this.d.schedule(() => { void this.samplePick(s, u, SAMPLE_PICKUP[u]?.answer ?? true); }, 1200);
  }
  async decline(callId: string, busy = false) {
    const s = this.sessions.get(callId); if (!s || s.status !== 'ringing') return;
    s.states[DM_ME] = busy ? 'busy' : 'declined';
    if (!s.group) await this.finish(s, busy ? 'busy' : 'declined');
  }
  async leave(callId: string, reason: 'hangup' | 'timeout' | 'failed') {
    const s = this.sessions.get(callId); if (!s || s.logged) return;
    if (s.states[DM_ME] === 'joined') s.states[DM_ME] = 'left';
    const status: CallStatus = s.answeredAt ? 'ended' : reason === 'timeout' ? 'missed' : reason === 'failed' ? 'failed' : 'canceled';
    s.media?.hangup();
    await this.finish(s, status);
  }
  async heartbeat(callId: string) { return this.sessions.get(callId)?.status ?? null; }
  async connect(callId: string, o: ConnectOpts): Promise<CallMedia> {
    const s = this.sessions.get(callId);
    if (!s || !this.d.media) throw new DmError('call_ended', 'This call has ended.');
    const ctx = await this.d.dm.callContext(s.conversationId); if (ctx) this.profiles = ctx.profiles;
    const m = this.d.media(s, o, (id) => this.profiles[id]);
    s.media = m;
    for (const [u, st] of Object.entries(s.states)) if (u !== DM_ME && st === 'joined') m.addPeer(u, s.kind === 'video');
    return m;
  }
  subscribe(cb: (e: CallEvent) => void) { this.subs.add(cb); return () => { this.subs.delete(cb); }; }
  history(): Promise<CallHistoryItem[]> { return this.d.dm.callHistory(); }
  hide(callId: string) { return this.d.dm.hideCall(callId); }
  async hasRelay() { return false; }
  /** A sample person calls you (the demo's "Try an incoming call" buttons). */
  async simulateIncoming(conversationId: string, kind: CallKind) {
    const c = await this.d.dm.callContext(conversationId);
    if (!c || !c.others.length) throw new DmError('call_not_member', 'This chat isn’t available.');
    if (this.live()) throw new DmError('call_busy', 'You’re already on a call.');
    const caller = c.others[0];
    const id = `call-${this.now().toString(36)}-${(seq++).toString(36)}`;
    const s: DemoSession = { id, conversationId, kind, callerId: caller, group: c.conv.kind === 'group', states: { [caller]: 'joined', [DM_ME]: 'ringing' }, status: 'ringing', startedAt: this.now(), logged: false };
    for (const o of c.others) if (o !== caller) s.states[o] = 'ringing';
    this.sessions.set(id, s);
    const mine = c.mySettings;
    if (mine.dndUntil && mine.dndUntil > this.now()) { s.states[DM_ME] = 'unavailable'; await this.finish(s, 'unavailable'); return; }
    const chk = pairCallCheck({ me: caller, other: DM_ME, graph: c.graph, minors: c.minors, theirWho: mine.calls });
    if (!chk.ok) { await this.finish(s, 'unavailable'); return; }
    const invite: CallInvite = { callId: id, conversationId, kind, callerId: caller, at: this.now(), group: s.group };
    this.emit({ type: 'incoming', invite });
    this.d.schedule(() => { if (s.status === 'ringing' && s.states[DM_ME] === 'ringing') void this.finish(s, 'missed'); }, RING_TIMEOUT_MS);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Simulated media for the demo (browser only): animated avatars on a canvas, clearly labelled as simulated.
// ---------------------------------------------------------------------------------------------------------------
const hueOf = (p?: PublicProfile) => avatarHue(p?.avatarUrl);
const initialsOf = (p?: PublicProfile) => (p?.displayName || '?').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
export class DemoMedia implements DemoMediaLike {
  private o: ConnectOpts;
  private peers = new Map<string, PeerView & { canvas?: HTMLCanvasElement; raf?: number }>();
  private mic = true;
  private cam: MediaStreamTrack | null;
  private profile: (id: string) => PublicProfile | undefined;
  private timers: number[] = [];
  constructor(o: ConnectOpts, profile: (id: string) => PublicProfile | undefined) { this.o = o; this.profile = profile; this.cam = o.local.getVideoTracks()[0] || null; }
  get flags(): MediaFlags { return { mic: this.mic, cam: !!this.cam }; }
  start() { /* peers are added as sample people "answer" */ }
  peerViews(): PeerView[] { return [...this.peers.values()].map(({ canvas: _c, raf: _r, ...v }) => v); }
  private emit() { this.o.onUpdate(this.peerViews()); }
  addPeer(id: string, cam: boolean, connected = false) {
    if (this.peers.has(id)) return;
    const stream = new MediaStream();
    let canvas: HTMLCanvasElement | undefined;
    if (cam) {
      canvas = document.createElement('canvas'); canvas.width = 480; canvas.height = 640;
      const cs = (canvas as HTMLCanvasElement & { captureStream?: (fps?: number) => MediaStream }).captureStream?.(24);
      cs?.getVideoTracks().forEach((t) => stream.addTrack(t));
    }
    const v: PeerView & { canvas?: HTMLCanvasElement } = connected
      ? { id, stream, conn: 'connected', mic: true, cam, quality: 'good', sample: { rttMs: 42, lossPct: 0, jitterMs: 4, fps: 24 }, relayed: false, canvas }
      : { id, stream, conn: 'connecting', mic: true, cam, quality: 'unknown', sample: null, relayed: false, canvas };
    this.peers.set(id, v);
    if (canvas) this.animate(id, canvas);
    this.emit();
    if (!connected) this.timers.push(window.setTimeout(() => { const p = this.peers.get(id); if (!p) return; p.conn = 'connected'; p.quality = 'good'; p.sample = { rttMs: 42, lossPct: 0, jitterMs: 4, fps: 24 }; this.emit(); }, 700));
  }
  removePeer(id: string) {
    const p = this.peers.get(id); if (!p) return;
    if (p.raf) cancelAnimationFrame(p.raf);
    p.stream.getTracks().forEach((t) => t.stop());
    this.peers.delete(id); this.o.onPeerLeft(id); this.emit();
  }
  private animate(id: string, c: HTMLCanvasElement) {
    const x = c.getContext('2d')!; const p = this.profile(id); const hue = hueOf(p); const ini = initialsOf(p); const name = p?.displayName || 'Sample';
    const t0 = performance.now();
    const frame = () => {
      const peer = this.peers.get(id); if (!peer) return;
      const t = (performance.now() - t0) / 1000;
      const g = x.createLinearGradient(0, 0, c.width, c.height);
      g.addColorStop(0, `hsl(${hue} 45% ${22 + 4 * Math.sin(t / 2)}%)`); g.addColorStop(1, `hsl(${(hue + 40) % 360} 40% 8%)`);
      x.fillStyle = g; x.fillRect(0, 0, c.width, c.height);
      // soft "room" shapes
      x.fillStyle = 'rgba(255,255,255,.05)'; x.fillRect(40, 70, 150, 210); x.fillRect(300, 120, 120, 90);
      // shoulders + head, gently bobbing like someone talking
      const bob = Math.sin(t * 2.1) * 6, cx = c.width / 2, cy = c.height * 0.4 + bob;
      x.fillStyle = `hsl(${hue} 55% 45%)`; x.beginPath(); x.ellipse(cx, c.height * 0.98 + bob, 190, 150, 0, Math.PI, 0); x.fill();
      x.fillStyle = `hsl(${hue} 60% 62%)`; x.beginPath(); x.arc(cx, cy, 92, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#0b0b0b'; x.font = '700 64px Inter, system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(ini, cx, cy + 4);
      // talking ring
      const lvl = 0.5 + 0.5 * Math.abs(Math.sin(t * 5.3) * Math.sin(t * 1.7));
      x.strokeStyle = `rgba(255,230,0,${0.25 + 0.5 * lvl})`; x.lineWidth = 6; x.beginPath(); x.arc(cx, cy, 104 + lvl * 10, 0, Math.PI * 2); x.stroke();
      // clear label just under the face (stays visible however the video is cropped)
      const ly = c.height * 0.4 + 150;
      x.fillStyle = 'rgba(0,0,0,.55)'; x.beginPath(); x.roundRect?.(cx - 150, ly - 40, 300, 72, 14); x.fill();
      x.fillStyle = '#fff'; x.font = '600 22px Inter, system-ui, sans-serif'; x.fillText(name, cx, ly - 16);
      x.fillStyle = '#FFE600'; x.font = '700 15px "JetBrains Mono", monospace'; x.fillText('SAMPLE · SIMULATED VIDEO', cx, ly + 14);
      peer.raf = requestAnimationFrame(frame);
    };
    frame();
  }
  setMic(on: boolean) { this.mic = on; for (const t of this.o.local.getAudioTracks()) t.enabled = on; }
  async setVideo(track: MediaStreamTrack | null) {
    const prev = this.cam; this.cam = track;
    for (const t of this.o.local.getVideoTracks()) if (t !== track) this.o.local.removeTrack(t);
    if (track && !this.o.local.getVideoTracks().includes(track)) this.o.local.addTrack(track);
    if (prev && prev !== track) prev.stop();
    // the sample turns their camera on too when you switch to video
    if (track) for (const [id, p] of this.peers) if (!p.cam) { this.removeQuiet(id); this.addPeer(id, true, true); }
    this.emit();
  }
  private removeQuiet(id: string) { const p = this.peers.get(id); if (!p) return; if (p.raf) cancelAnimationFrame(p.raf); p.stream.getTracks().forEach((t) => t.stop()); this.peers.delete(id); }
  hangup() { for (const id of [...this.peers.keys()]) this.removeQuiet(id); for (const t of this.timers) window.clearTimeout(t); this.emit(); }
}
