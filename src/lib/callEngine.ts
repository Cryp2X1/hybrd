// WebRTC mesh engine for HYBRD calls (1:1 and small groups, up to MAX_CALL_PEOPLE).
// - One RTCPeerConnection per other person ("mesh"). Media goes peer-to-peer, encrypted by WebRTC (DTLS-SRTP).
// - Signaling (offers / answers / ICE) travels over a SignalTransport: Supabase Realtime Broadcast when live,
//   an in-memory bus in the demo and in tools/test-calls-webrtc.mjs.
// - "Perfect negotiation" (isPolite) resolves offer collisions, so both sides can just add tracks and go.
// - Every connection always carries an audio and a video sender. A voice call sends a blank (no-frames) video
//   track, so turning the camera on later (voice → video), flipping cameras or turning it off is a replaceTrack()
//   with no renegotiation. Mic / camera on-off is also announced in a small "state" signal for the UI.
// - ICE restarts on failure; "Reconnecting…" while a link is down; quality from getStats() every 2 s.
import { isPolite, lossBetween, parseSignal, qualityOf, RECONNECT_GRACE_MS, videoBitrateFor, type MediaFlags, type Quality, type QualitySample, type RTCIceServerLike, type Signal } from './calls';

export interface SignalTransport {
  send(m: Signal): void | Promise<void>;
  on(cb: (m: unknown) => void): () => void;
  close(): void;
}
export type PeerConn = 'connecting' | 'connected' | 'reconnecting' | 'failed' | 'closed';
export interface PeerView { id: string; stream: MediaStream; conn: PeerConn; mic: boolean; cam: boolean; quality: Quality; sample: QualitySample | null; relayed: boolean }
interface Peer {
  id: string; sid: string; pc: RTCPeerConnection; stream: MediaStream; polite: boolean;
  makingOffer: boolean; ignoreOffer: boolean; pendingIce: RTCIceCandidateInit[];
  conn: PeerConn; mic: boolean; cam: boolean; quality: Quality; sample: QualitySample | null; relayed: boolean;
  lastLoss: { lost: number; received: number } | null; downSince: number; restarts: number;
  audio?: RTCRtpSender; video?: RTCRtpSender;
}
export interface EngineOpts {
  callId: string;
  me: string;
  transport: SignalTransport;
  iceServers: RTCIceServerLike[];
  /** 'relay' hides your IP address from the other side (needs a TURN server). */
  relayOnly?: boolean;
  local: MediaStream;
  maxPeople: number;
  /** only these user ids may connect (the call's participants) */
  allowed?: () => Set<string> | undefined;
  onUpdate(peers: PeerView[]): void;
  onPeerLeft?(id: string): void;
  log?: (...a: unknown[]) => void;
  statsMs?: number;
  RTC?: typeof RTCPeerConnection;
}
const rid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

/** A video track that never paints a frame: lets a voice call keep a video sender without using the camera. */
export function blankVideoTrack(): MediaStreamTrack | null {
  try {
    const c = document.createElement('canvas'); c.width = 16; c.height = 16;
    const s = (c as HTMLCanvasElement & { captureStream?: (fps?: number) => MediaStream }).captureStream?.(0);
    const t = s?.getVideoTracks()[0] || null;
    if (t) (t as MediaStreamTrack & { __blank?: boolean }).__blank = true;
    return t;
  } catch { return null; }
}
export const isBlank = (t: MediaStreamTrack | null | undefined) => !t || !!(t as MediaStreamTrack & { __blank?: boolean }).__blank;

export class CallEngine {
  readonly sid = rid();
  private o: EngineOpts;
  private peers = new Map<string, Peer>();
  private off: (() => void) | null = null;
  private mic = true;
  private videoTrack: MediaStreamTrack | null;
  private blank: MediaStreamTrack | null = null;
  private timers: number[] = [];
  private closed = false;
  private helloCount = 0;
  constructor(o: EngineOpts) {
    this.o = o;
    const v = o.local.getVideoTracks()[0] || null;
    this.videoTrack = v && !isBlank(v) ? v : null;
  }
  get flags(): MediaFlags { return { mic: this.mic, cam: !!this.videoTrack }; }
  get size() { return this.peers.size; }
  peerViews(): PeerView[] { return [...this.peers.values()].map((p) => ({ id: p.id, stream: p.stream, conn: p.conn, mic: p.mic, cam: p.cam, quality: p.quality, sample: p.sample, relayed: p.relayed })); }
  private emit() { if (!this.closed) this.o.onUpdate(this.peerViews()); }
  private send(m: Omit<Signal, 'v' | 'call' | 'from' | 'sid'>) {
    if (this.closed && m.t !== 'bye') return;
    try { void this.o.transport.send({ v: 1, call: this.o.callId, from: this.o.me, sid: this.sid, ...m }); } catch (e) { this.o.log?.('send failed', e); }
  }

  start() {
    this.off = this.o.transport.on((raw) => { void this.handle(raw); });
    this.hello();
    // say hello a few times: the other side may join the channel a moment later
    const t = window.setInterval(() => { if (this.closed) return; if ([...this.peers.values()].some((p) => p.conn === 'connected') || this.helloCount > 20) return; this.hello(); }, 1500);
    const s = window.setInterval(() => { void this.stats(); }, this.o.statsMs ?? 2000);
    const w = window.setInterval(() => this.watchdog(), 1000);
    this.timers.push(t, s, w);
  }
  private hello(to?: string) { this.helloCount++; this.send({ t: 'hello', to, state: this.flags }); }

  private async handle(raw: unknown) {
    if (this.closed) return;
    const m = parseSignal(raw, { call: this.o.callId, me: this.o.me, allowed: this.o.allowed?.() });
    if (!m) return;
    let p = this.peers.get(m.from);
    if (p && p.sid !== m.sid && (m.t === 'hello' || m.t === 'offer')) { this.drop(p.id, false); p = undefined; } // they rejoined (new session)
    if (m.t === 'bye') { if (p && p.sid === m.sid) { this.drop(p.id, true); } return; }
    if (m.t === 'decline' || m.t === 'cancel') return; // handled by the call store
    if (!p) {
      if (m.t !== 'hello' && m.t !== 'offer') return;
      if (this.peers.size >= this.o.maxPeople - 1) { this.o.log?.('call full, ignoring', m.from); return; }
      p = this.create(m.from, m.sid);
      if (m.t === 'hello') this.hello(m.from);
    }
    if (m.state) { p.mic = m.state.mic; p.cam = m.state.cam; this.emit(); }
    try {
      if (m.t === 'offer' || m.t === 'answer') {
        const desc = { type: m.t, sdp: m.sdp! } as RTCSessionDescriptionInit;
        const collision = desc.type === 'offer' && (p.makingOffer || p.pc.signalingState !== 'stable');
        p.ignoreOffer = !p.polite && collision;
        if (p.ignoreOffer) return;
        await p.pc.setRemoteDescription(desc);
        for (const c of p.pendingIce.splice(0)) await p.pc.addIceCandidate(c).catch(() => undefined);
        if (desc.type === 'offer') {
          await p.pc.setLocalDescription();
          this.send({ t: 'answer', to: p.id, sdp: p.pc.localDescription!.sdp });
        }
      } else if (m.t === 'ice') {
        const c = (m.cand ?? null) as RTCIceCandidateInit | null;
        if (!c) return;
        if (!p.pc.remoteDescription) { p.pendingIce.push(c); return; }
        try { await p.pc.addIceCandidate(c); } catch (e) { if (!p.ignoreOffer) this.o.log?.('ice failed', e); }
      }
    } catch (e) { this.o.log?.('negotiation error', e); }
  }

  private create(id: string, sid: string): Peer {
    const RTC = this.o.RTC || RTCPeerConnection;
    const pc = new RTC({ iceServers: this.o.iceServers as RTCIceServer[], iceTransportPolicy: this.o.relayOnly ? 'relay' : 'all', bundlePolicy: 'max-bundle' });
    const p: Peer = { id, sid, pc, stream: new MediaStream(), polite: isPolite(this.o.me, id), makingOffer: false, ignoreOffer: false, pendingIce: [], conn: 'connecting', mic: true, cam: false, quality: 'unknown', sample: null, relayed: false, lastLoss: null, downSince: 0, restarts: 0 };
    this.peers.set(id, p);
    const a = this.o.local.getAudioTracks()[0];
    if (a) p.audio = pc.addTrack(a, this.o.local);
    const v = this.videoTrack || (this.blank ||= blankVideoTrack());
    if (v) p.video = pc.addTrack(v, this.o.local);
    else p.video = pc.addTransceiver('video', { direction: 'sendrecv' }).sender;
    pc.ontrack = (e) => { e.track.onunmute = () => this.emit(); this.syncStream(p); };
    pc.onsignalingstatechange = () => { if (pc.signalingState === 'stable') this.syncStream(p); };
    pc.onicecandidate = (e) => { if (e.candidate) this.send({ t: 'ice', to: id, cand: e.candidate.toJSON() as Signal['cand'] }); };
    pc.onnegotiationneeded = async () => {
      try {
        p.makingOffer = true;
        await pc.setLocalDescription();
        this.send({ t: 'offer', to: id, sdp: pc.localDescription!.sdp, state: this.flags });
      } catch (e) { this.o.log?.('offer failed', e); } finally { p.makingOffer = false; }
    };
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (s === 'connected') { p.conn = 'connected'; p.downSince = 0; void this.tuneBitrate(); }
      else if (s === 'disconnected') { if (p.conn === 'connected') { p.conn = 'reconnecting'; p.downSince = Date.now(); } }
      else if (s === 'failed') { p.conn = 'reconnecting'; p.downSince ||= Date.now(); this.restart(p); }
      else if (s === 'closed') p.conn = 'closed';
      this.emit();
    };
    this.emit();
    return p;
  }
  /** The remote stream = the tracks of the receivers that are actually receiving (glare rollbacks leave stale ones). */
  private syncStream(p: Peer) {
    const live = p.pc.getTransceivers().filter((t) => t.currentDirection !== 'stopped' && t.receiver.track && (t.currentDirection === 'sendrecv' || t.currentDirection === 'recvonly' || t.currentDirection == null))
      // prefer negotiated transceivers; one per kind
      .sort((a, b) => Number(b.currentDirection != null) - Number(a.currentDirection != null));
    const want = new Map<string, MediaStreamTrack>();
    for (const t of live) if (!want.has(t.receiver.track.kind)) want.set(t.receiver.track.kind, t.receiver.track);
    let changed = false;
    for (const t of p.stream.getTracks()) if (want.get(t.kind) !== t) { p.stream.removeTrack(t); changed = true; }
    for (const t of want.values()) if (!p.stream.getTracks().includes(t)) { p.stream.addTrack(t); t.onunmute = () => this.emit(); changed = true; }
    if (changed) this.emit();
  }
  private restart(p: Peer) {
    if (p.restarts > 4) return;
    p.restarts++;
    try { p.pc.restartIce(); } catch (e) { this.o.log?.('restartIce failed', e); }
  }
  private watchdog() {
    const now = Date.now();
    for (const p of this.peers.values()) {
      if (p.conn !== 'reconnecting' || !p.downSince) continue;
      if (now - p.downSince > 5000 && p.restarts === 0) this.restart(p);
      if (now - p.downSince > RECONNECT_GRACE_MS) { p.conn = 'failed'; this.emit(); }
    }
  }
  private drop(id: string, notify: boolean) {
    const p = this.peers.get(id); if (!p) return;
    this.peers.delete(id);
    try { p.pc.close(); } catch { /* ignore */ }
    for (const t of p.stream.getTracks()) p.stream.removeTrack(t);
    if (notify) this.o.onPeerLeft?.(id);
    void this.tuneBitrate();
    this.emit();
  }

  // ---------- local controls ----------
  setMic(on: boolean) {
    this.mic = on;
    for (const t of this.o.local.getAudioTracks()) t.enabled = on;
    this.send({ t: 'state', state: this.flags });
  }
  /** Camera on (track), off (null), flip (a new track). No renegotiation: replaceTrack on every connection. */
  async setVideo(track: MediaStreamTrack | null) {
    const prev = this.videoTrack;
    this.videoTrack = track;
    const send = track || (this.blank ||= blankVideoTrack());
    await Promise.all([...this.peers.values()].map((p) => p.video?.replaceTrack(send).catch((e) => this.o.log?.('replaceTrack', e))));
    for (const t of this.o.local.getVideoTracks()) if (t !== track) this.o.local.removeTrack(t);
    if (track && !this.o.local.getVideoTracks().includes(track)) this.o.local.addTrack(track);
    if (prev && prev !== track) prev.stop();
    this.send({ t: 'state', state: this.flags });
    void this.tuneBitrate();
    this.emit();
  }
  private async tuneBitrate() {
    const n = this.peers.size; const max = videoBitrateFor(n);
    for (const p of this.peers.values()) {
      const s = p.video; if (!s) continue;
      try {
        const prm = s.getParameters();
        if (!prm.encodings || !prm.encodings.length) continue;
        prm.encodings[0].maxBitrate = max;
        await s.setParameters(prm);
      } catch { /* not supported everywhere */ }
    }
  }

  // ---------- quality ----------
  private async stats() {
    for (const p of this.peers.values()) {
      if (p.conn === 'closed') continue;
      try {
        const r = await p.pc.getStats();
        let rtt: number | null = null, jitter: number | null = null, lost = 0, received = 0, fps: number | null = null, relayed = false;
        const byId = new Map<string, Record<string, unknown>>();
        r.forEach((s) => byId.set(s.id, s as Record<string, unknown>));
        r.forEach((s: Record<string, unknown>) => {
          if (s.type === 'candidate-pair' && (s.nominated || s.selected) && s.state === 'succeeded') {
            if (typeof s.currentRoundTripTime === 'number') rtt = s.currentRoundTripTime * 1000;
            const lc = byId.get(s.localCandidateId as string); const rc = byId.get(s.remoteCandidateId as string);
            relayed = lc?.candidateType === 'relay' || rc?.candidateType === 'relay';
          }
          if (s.type === 'inbound-rtp') {
            lost += Number(s.packetsLost || 0); received += Number(s.packetsReceived || 0);
            if (s.kind === 'audio' && typeof s.jitter === 'number') jitter = s.jitter * 1000;
            if (s.kind === 'video' && typeof s.framesPerSecond === 'number') fps = s.framesPerSecond;
          }
          if (s.type === 'remote-inbound-rtp' && rtt == null && typeof s.roundTripTime === 'number') rtt = s.roundTripTime * 1000;
        });
        const cur = { lost, received };
        const loss = lossBetween(p.lastLoss, cur); p.lastLoss = cur;
        p.sample = { rttMs: rtt, lossPct: loss, jitterMs: jitter, fps, relayed };
        p.relayed = relayed;
        p.quality = p.conn === 'connected' ? qualityOf(p.sample) : p.conn === 'reconnecting' ? 'poor' : 'unknown';
      } catch { /* closed */ }
    }
    this.emit();
  }

  /** Leave: tell everyone, close every connection. Local tracks are stopped by the caller (they own the stream). */
  hangup() {
    if (this.closed) return;
    this.send({ t: 'bye' });
    this.closed = true;
    for (const t of this.timers) window.clearInterval(t);
    for (const id of [...this.peers.keys()]) this.drop(id, false);
    this.off?.(); this.off = null;
    this.blank?.stop();
    window.setTimeout(() => { try { this.o.transport.close(); } catch { /* ignore */ } }, 300);
  }
}

/** In-memory signaling bus (demo + browser tests): every transport on the same bus sees every message. */
export class MemoryBus {
  private subs = new Set<(m: unknown) => void>();
  latencyMs = 30;
  transport(): SignalTransport {
    const mine = new Set<(m: unknown) => void>();
    return {
      send: (m) => { const copy = JSON.parse(JSON.stringify(m)); window.setTimeout(() => { for (const f of this.subs) if (!mine.has(f)) f(copy); }, this.latencyMs); },
      on: (cb) => { mine.add(cb); this.subs.add(cb); return () => { mine.delete(cb); this.subs.delete(cb); }; },
      close: () => { for (const f of mine) this.subs.delete(f); mine.clear(); },
    };
  }
}
