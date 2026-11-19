// Calls: picks the backend (demo with SAMPLE people, or live Supabase — same switch as Messages), runs one call at
// a time through the state machine in calls.ts, owns the microphone / camera, rings (Web Audio), and keeps the
// Calls tab history. The UI lives in components/Call.tsx (full-screen call, incoming screen, minimized bar).
// Incoming calls only ring while HYBRD is open (no push notifications yet).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useMessages } from './messagesStore';
import { useAuth } from './auth';
import { getSupabase } from './supabase';
import { useToast } from './toast';
import {
  CALL_HEARTBEAT_MS, dndActive, finalStatus, friendlyCallError, idleCall, INCOMING_STALE_MS, mediaErrorHelp, missedSince, needsExplainer, platformOf, reduceCall,
  RECONNECT_GRACE_MS, RING_TIMEOUT_MS, type CallEvt, type CallHistoryItem, type CallKind, type CallState, type CallStatus, type EndReason,
} from './calls';
import type { PeerView } from './callEngine';
import type { CallBackend, CallEvent, CallInvite, CallMedia, PeerCallState } from './callsApi';
import type { ConvView } from './messagesApi';
import { DemoDm } from './messagesDemo';
import { SupabaseDm } from './messagesSupabase';
import { DemoCalls, DemoMedia } from './callsDemo';
import { SupabaseCalls } from './callsSupabase';
import { audioOutputs, callsSupported, canFlip, explainedBefore, getCallMedia, getCamera, markExplained, MediaError, permissionState, relayPreferred, setRelayPreferred, stopStream } from './callMedia';
import { endTone, startRing, stopRing, unlockAudio } from './ringtone';

export interface ActiveCall {
  callId: string | null;
  conversationId: string;
  kind: CallKind;
  conv: ConvView | null;
  state: CallState;
  peers: PeerView[];
  peerStatus: Record<string, PeerCallState>;
  local: MediaStream | null;
  mic: boolean;
  cam: boolean;
  facing: 'user' | 'environment';
  canFlip: boolean;
  outputs: MediaDeviceInfo[];
  sinkId: string;
  minimized: boolean;
  invite?: CallInvite;
  busy?: boolean; // an action (accept / camera) is in progress
}
export interface CallHelp { title: string; body: string; steps: string[]; voice?: () => void }
interface Ctx {
  backend: CallBackend | null;
  supported: boolean;
  call: ActiveCall | null;
  history: CallHistoryItem[];
  missed: number;
  explain: { video: boolean; go: () => void; cancel: () => void } | null;
  help: CallHelp | null;
  relay: { available: boolean; on: boolean };
  place(conversationId: string, kind: CallKind): Promise<void>;
  accept(video?: boolean): Promise<void>;
  decline(): Promise<void>;
  hangup(): void;
  toggleMic(): void;
  toggleCam(): Promise<void>;
  flip(): Promise<void>;
  cycleSpeaker(): void;
  setMinimized(on: boolean): void;
  dismissHelp(): void;
  markCallsSeen(): void;
  refreshHistory(): Promise<void>;
  hideCall(id: string): Promise<void>;
  setRelay(on: boolean): void;
  simulateIncoming(conversationId: string, kind: CallKind): Promise<void>;
}
const C = createContext<Ctx>(null as unknown as Ctx);
export const useCalls = () => useContext(C);
const SEEN_KEY = 'hybrd:calls-seen';

const statusToReason = (s: CallStatus, role: 'caller' | 'callee'): EndReason | null => {
  switch (s) {
    case 'declined': return 'declined';
    case 'missed': return role === 'caller' ? 'timeout' : 'missed';
    case 'canceled': return 'canceled';
    case 'ended': return 'remote-hangup';
    case 'busy': return 'busy';
    case 'unavailable': return 'unavailable';
    case 'failed': return 'failed';
    default: return null;
  }
};

export function CallProvider({ children }: { children: ReactNode }) {
  const msgs = useMessages();
  const { user } = useAuth();
  const toast = useToast();
  const dm = msgs.backend;
  const [backend, setBackend] = useState<CallBackend | null>(null);
  const [call, setCall] = useState<ActiveCall | null>(null);
  const [history, setHistory] = useState<CallHistoryItem[]>([]);
  const [seen, setSeen] = useState(() => { try { return Number(localStorage.getItem(SEEN_KEY)) || 0; } catch { return 0; } });
  const [explain, setExplain] = useState<Ctx['explain']>(null);
  const [help, setHelp] = useState<CallHelp | null>(null);
  const [relay, setRelayState] = useState({ available: false, on: relayPreferred() });
  const ref = useRef<ActiveCall | null>(null);
  const media = useRef<CallMedia | null>(null);
  const timers = useRef<number[]>([]);
  const endTimer = useRef(0);
  const wake = useRef<{ release(): Promise<void> } | null>(null);
  const supported = useMemo(() => callsSupported(), []);
  const settingsRef = useRef(msgs.settings); settingsRef.current = msgs.settings;

  // ---------- backend ----------
  useEffect(() => {
    let alive = true;
    if (!dm) { setBackend(null); return; }
    if (dm instanceof DemoDm) {
      setBackend(new DemoCalls({ dm, schedule: (fn, ms) => { window.setTimeout(fn, ms); }, media: (_s, o, prof) => new DemoMedia(o, prof) }));
    } else if (dm instanceof SupabaseDm && user) {
      getSupabase().then((c) => { if (alive) setBackend(c ? new SupabaseCalls(c, user.id, dm) : null); });
    } else setBackend(null);
    return () => { alive = false; };
  }, [dm, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!backend) return; backend.hasRelay().then((a) => setRelayState((r) => ({ ...r, available: a }))).catch(() => undefined); }, [backend]);

  const refreshHistory = useCallback(async () => { if (!backend) return; try { setHistory(await backend.history()); } catch { /* ignore */ } }, [backend]);
  useEffect(() => { void refreshHistory(); }, [refreshHistory, msgs.version]);

  // ---------- state helpers ----------
  const publish = useCallback((next: ActiveCall | null) => { ref.current = next; setCall(next ? { ...next } : null); }, []);
  const patch = useCallback((p: Partial<ActiveCall>) => { if (ref.current) publish({ ...ref.current, ...p }); }, [publish]);
  const step = useCallback((e: CallEvt) => { const c = ref.current; if (!c) return; const s = reduceCall(c.state, e); if (s !== c.state) publish({ ...c, state: s }); }, [publish]);
  const clearTimers = () => { for (const t of timers.current) window.clearTimeout(t), window.clearInterval(t); timers.current = []; };

  const cleanupMedia = () => {
    stopRing();
    try { media.current?.hangup(); } catch { /* ignore */ }
    media.current = null;
    stopStream(ref.current?.local);
    wake.current?.release().catch(() => undefined); wake.current = null;
    clearTimers();
  };
  /** End the call on this device. `tell` = also tell the server (leave). */
  const finish = useCallback((reason: EndReason, tell = true, quiet = false) => {
    const c = ref.current; if (!c || c.state.phase === 'ended') return;
    const wasIncoming = c.state.phase === 'incoming';
    cleanupMedia();
    if (tell && c.callId && backend && !wasIncoming) {
      const r = reason === 'timeout' ? 'timeout' : reason === 'failed' ? 'failed' : 'hangup';
      backend.leave(c.callId, r).catch(() => undefined);
    }
    void finalStatus;
    const ended = { ...c, state: reduceCall(c.state, { t: 'end', at: Date.now(), reason }), peers: [], local: null };
    if (quiet || (wasIncoming && reason !== 'answered-elsewhere')) { publish(null); return; }
    publish(ended);
    endTone();
    window.clearTimeout(endTimer.current);
    endTimer.current = window.setTimeout(() => { if (ref.current?.state.phase === 'ended') publish(null); }, ended.minimized ? 1500 : 2600);
    window.setTimeout(() => void refreshHistory(), 600);
  }, [backend, publish, refreshHistory]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- media callbacks ----------
  const onUpdate = useCallback((peers: PeerView[]) => {
    const c = ref.current; if (!c || c.state.phase === 'ended') return;
    const anyConnected = peers.some((p) => p.conn === 'connected');
    let s = c.state;
    if (anyConnected) { if (s.phase !== 'active') { stopRing(); s = reduceCall(s, { t: 'connected', at: Date.now() }); } }
    else if (s.phase === 'active' && peers.length && peers.every((p) => p.conn === 'reconnecting' || p.conn === 'failed')) s = reduceCall(s, { t: 'disconnected', at: Date.now() });
    publish({ ...c, peers, state: s });
    if (peers.length && peers.every((p) => p.conn === 'failed')) finish('failed');
  }, [publish, finish]);
  const onPeerLeft = useCallback((id: string) => {
    const c = ref.current; if (!c) return;
    const peerStatus = { ...c.peerStatus, [id]: 'left' as PeerCallState };
    publish({ ...c, peerStatus });
    const stillRinging = Object.values(peerStatus).some((x) => x === 'ringing');
    const others = (media.current?.peerViews() || []).filter((p) => p.id !== id);
    if (!others.length && !stillRinging) finish('remote-hangup');
  }, [publish, finish]);

  const startHeartbeat = (callId: string) => {
    const beat = async () => {
      const c = ref.current; if (!c || c.callId !== callId || !backend) return;
      const st = await backend.heartbeat(callId);
      const cur = ref.current; if (!cur || cur.callId !== callId || !st) return;
      const reason = statusToReason(st, cur.state.role);
      if (reason && cur.state.phase !== 'ended') finish(reason, false);
    };
    timers.current.push(window.setInterval(() => { const ph = ref.current?.state.phase; if (ph === 'outgoing' || ph === 'incoming' || ph === 'connecting') void beat(); }, 3000));
    timers.current.push(window.setInterval(() => { const ph = ref.current?.state.phase; if (ph === 'active' || ph === 'reconnecting') void beat(); }, CALL_HEARTBEAT_MS));
  };
  const keepAwake = async () => { try { wake.current = await (navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } }).wakeLock?.request('screen') || null; } catch { /* ignore */ } };
  const deviceInfo = async () => { const [flip, outputs] = await Promise.all([canFlip(), audioOutputs()]); patch({ canFlip: flip, outputs }); };

  const mediaFail = (e: unknown, video: boolean, voice?: () => void) => {
    const kind = e instanceof MediaError ? e.kind : 'other';
    const h = mediaErrorHelp(kind, { video, platform: platformOf(navigator.userAgent) });
    setHelp({ ...h, voice: video && kind !== 'insecure' && kind !== 'unsupported' ? voice : undefined });
  };
  const needExplain = async (video: boolean) => needsExplainer({ video, mic: await permissionState('microphone'), cam: video ? await permissionState('camera') : 'granted', seen: explainedBefore() });

  // ---------- outgoing ----------
  const dial = useCallback(async (conversationId: string, kind: CallKind) => {
    if (!backend || !dm) return;
    let local: MediaStream;
    try { local = await getCallMedia(kind === 'video'); markExplained(kind === 'video'); }
    catch (e) { mediaFail(e, kind === 'video', kind === 'video' ? () => { setHelp(null); void dial(conversationId, 'voice'); } : undefined); return; }
    const conv = await dm.conversation(conversationId).catch(() => null);
    const base: ActiveCall = { callId: null, conversationId, kind, conv, state: reduceCall(idleCall(), { t: 'dial', at: Date.now() }), peers: [], peerStatus: {}, local, mic: true, cam: kind === 'video', facing: 'user', canFlip: false, outputs: [], sinkId: '', minimized: false };
    publish(base);
    startRing('outgoing');
    void keepAwake(); void deviceInfo();
    let res;
    try { res = await backend.start(conversationId, kind); }
    catch (e) { cleanupMedia(); publish(null); toast((e as { friendly?: string }).friendly || friendlyCallError(e)); return; }
    if (!ref.current) { backend.leave(res.callId, 'hangup').catch(() => undefined); return; } // hung up while starting
    patch({ callId: res.callId, peerStatus: Object.fromEntries(res.ringing.map((u) => [u, 'ringing' as PeerCallState])) });
    if (res.status === 'unavailable' || res.status === 'busy') { finish(res.status, false); return; }
    try {
      const m = await backend.connect(res.callId, { local, onUpdate, onPeerLeft, relayOnly: relay.on });
      media.current = m; m.start();
    } catch (e) { toast(friendlyCallError(e)); finish('failed'); return; }
    if (res.status === 'join') step({ t: 'remote-accept', at: Date.now() });
    startHeartbeat(res.callId);
    timers.current.push(window.setTimeout(() => { const c = ref.current; if (c && c.callId === res.callId && (c.state.phase === 'outgoing')) finish('timeout'); }, RING_TIMEOUT_MS));
  }, [backend, dm, publish, patch, step, finish, onUpdate, onPeerLeft, relay.on, toast]); // eslint-disable-line react-hooks/exhaustive-deps

  const place = useCallback(async (conversationId: string, kind: CallKind) => {
    unlockAudio();
    if (!backend) return;
    if (ref.current && ref.current.state.phase !== 'ended') { toast('You’re already on a call.'); return; }
    if (!supported) { setHelp({ ...mediaErrorHelp('unsupported', { video: kind === 'video', platform: platformOf(navigator.userAgent) }) }); return; }
    const chk = await backend.check(conversationId);
    if (!chk.ok) { toast(chk.msg); return; }
    if (await needExplain(kind === 'video')) setExplain({ video: kind === 'video', go: () => { setExplain(null); void dial(conversationId, kind); }, cancel: () => setExplain(null) });
    else void dial(conversationId, kind);
  }, [backend, supported, dial, toast]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- incoming ----------
  const onIncoming = useCallback(async (inv: CallInvite) => {
    if (!backend || !dm) return;
    if (Date.now() - inv.at > INCOMING_STALE_MS) return;
    const cur = ref.current;
    if (cur && cur.state.phase !== 'ended') { if (cur.callId !== inv.callId) backend.decline(inv.callId, true).catch(() => undefined); return; }
    if (dndActive(settingsRef.current.dndUntil)) return; // the server already marks it; never ring
    const conv = await dm.conversation(inv.conversationId).catch(() => null);
    publish({ callId: inv.callId, conversationId: inv.conversationId, kind: inv.kind, conv, invite: inv, state: reduceCall(idleCall(), { t: 'ring', at: Date.now() }), peers: [], peerStatus: { [inv.callerId]: 'joined' }, local: null, mic: true, cam: inv.kind === 'video', facing: 'user', canFlip: false, outputs: [], sinkId: '', minimized: false });
    startRing('incoming');
    startHeartbeat(inv.callId);
    timers.current.push(window.setTimeout(() => { const c = ref.current; if (c?.callId === inv.callId && c.state.phase === 'incoming') finish('missed', false); }, RING_TIMEOUT_MS + 5000));
  }, [backend, dm, publish, finish]); // eslint-disable-line react-hooks/exhaustive-deps

  const accept = useCallback(async (video?: boolean) => {
    unlockAudio();
    const c = ref.current; if (!c || !backend || !c.callId || c.state.phase !== 'incoming') return;
    const withVideo = c.kind === 'video' && video !== false;
    stopRing();
    patch({ busy: true });
    let local: MediaStream;
    try { local = await getCallMedia(withVideo); markExplained(withVideo); }
    catch (e) {
      patch({ busy: false });
      if (withVideo) { mediaFail(e, true, () => { setHelp(null); void accept(false); }); return; }
      mediaFail(e, false); return;
    }
    if (!ref.current || ref.current.callId !== c.callId || ref.current.state.phase !== 'incoming') { stopStream(local); return; }
    try { await backend.answer(c.callId); }
    catch (e) { stopStream(local); toast((e as { friendly?: string }).friendly || friendlyCallError(e)); finish('canceled', false, true); return; }
    publish({ ...ref.current, local, cam: withVideo, busy: false, state: reduceCall(ref.current.state, { t: 'accept', at: Date.now() }) });
    void keepAwake(); void deviceInfo();
    try { const m = await backend.connect(c.callId, { local, onUpdate, onPeerLeft, relayOnly: relay.on }); media.current = m; m.start(); }
    catch (e) { toast(friendlyCallError(e)); finish('failed'); }
    timers.current.push(window.setTimeout(() => { const x = ref.current; if (x?.callId === c.callId && x.state.phase === 'connecting') finish('failed'); }, RECONNECT_GRACE_MS + 10_000));
  }, [backend, patch, publish, finish, onUpdate, onPeerLeft, relay.on, toast]); // eslint-disable-line react-hooks/exhaustive-deps

  const decline = useCallback(async () => {
    const c = ref.current; if (!c || !c.callId || !backend) return;
    backend.decline(c.callId).catch(() => undefined);
    finish('declined', false, true);
    window.setTimeout(() => void refreshHistory(), 500);
  }, [backend, finish, refreshHistory]);

  // ---------- events from the backend ----------
  useEffect(() => {
    if (!backend) return;
    const off = backend.subscribe((e: CallEvent) => {
      if (e.type === 'history') { void refreshHistory(); return; }
      if (e.type === 'incoming') { void onIncoming(e.invite); return; }
      const c = ref.current; if (!c || c.callId !== e.callId || c.state.phase === 'ended') return;
      if (e.type === 'status') {
        const reason = statusToReason(e.status, c.state.role);
        if (reason) finish(reason, false);
        return;
      }
      if (e.type === 'peer') {
        const peerStatus = { ...c.peerStatus, [e.userId]: e.state };
        publish({ ...c, peerStatus });
        if (e.state === 'joined' && c.state.phase === 'outgoing') step({ t: 'remote-accept', at: Date.now() });
        const vals = Object.entries(peerStatus).filter(([u]) => u !== backend.myId).map(([, v]) => v);
        if (c.state.phase === 'outgoing' && vals.length && vals.every((v) => v === 'declined' || v === 'missed' || v === 'busy' || v === 'unavailable')) finish(vals.includes('declined') ? 'declined' : 'timeout');
      }
    });
    return off;
  }, [backend, onIncoming, finish, publish, step, refreshHistory]);

  // leaving the page = hang up (best effort) so the other side isn't left ringing
  useEffect(() => {
    const bye = () => { const c = ref.current; if (c && c.callId && c.state.phase !== 'ended' && backend) { if (c.state.phase === 'incoming') backend.decline(c.callId).catch(() => undefined); else backend.leave(c.callId, 'hangup').catch(() => undefined); media.current?.hangup(); } };
    window.addEventListener('pagehide', bye);
    return () => window.removeEventListener('pagehide', bye);
  }, [backend]);
  // first tap anywhere unlocks Web Audio so an incoming call can ring
  useEffect(() => { const u = () => unlockAudio(); window.addEventListener('pointerdown', u, { once: true }); return () => window.removeEventListener('pointerdown', u); }, []);

  // ---------- in-call controls ----------
  const toggleMic = useCallback(() => { const c = ref.current; if (!c || !media.current) return; const on = !c.mic; media.current.setMic(on); patch({ mic: on }); }, [patch]);
  const camOn = useCallback(async () => {
    const c = ref.current; if (!c || !media.current) return;
    patch({ busy: true });
    try { const t = await getCamera(c.facing); markExplained(true); await media.current.setVideo(t); patch({ cam: true, busy: false }); void deviceInfo(); }
    catch (e) { patch({ busy: false }); mediaFail(e, true); }
  }, [patch]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggleCam = useCallback(async () => {
    const c = ref.current; if (!c || !media.current) return;
    if (c.cam) { await media.current.setVideo(null); patch({ cam: false }); return; }
    if (!explainedBefore().cam && (await permissionState('camera')) !== 'granted') { setExplain({ video: true, go: () => { setExplain(null); void camOn(); }, cancel: () => setExplain(null) }); return; }
    await camOn();
  }, [patch, camOn]);
  const flip = useCallback(async () => {
    const c = ref.current; if (!c || !media.current || !c.cam) return;
    const next = c.facing === 'user' ? 'environment' : 'user';
    patch({ busy: true });
    // phones can't open both cameras at once: release the current one first
    c.local?.getVideoTracks().forEach((t) => t.stop());
    try { const t = await getCamera(next); await media.current.setVideo(t); patch({ facing: next, busy: false }); }
    catch { try { const t = await getCamera(c.facing); await media.current.setVideo(t); } catch { await media.current.setVideo(null); patch({ cam: false }); } patch({ busy: false }); toast('Couldn’t switch cameras.'); }
  }, [patch, toast]);
  const cycleSpeaker = useCallback(() => {
    const c = ref.current; if (!c || c.outputs.length < 2) return;
    const i = c.outputs.findIndex((o) => o.deviceId === c.sinkId);
    const next = c.outputs[(i + 1) % c.outputs.length];
    patch({ sinkId: next.deviceId });
    toast(next.label ? `Audio: ${next.label}` : 'Audio output switched');
  }, [patch, toast]);
  const hangup = useCallback(() => {
    const c = ref.current; if (!c) return;
    if (c.state.phase === 'incoming') { void decline(); return; }
    finish(c.state.phase === 'outgoing' ? 'canceled' : 'hangup');
  }, [finish, decline]);

  const missed = useMemo(() => missedSince(history, backend?.myId || '', seen), [history, backend, seen]);
  const value = useMemo<Ctx>(() => ({
    backend, supported, call, history, missed, explain, help, relay,
    place, accept, decline, hangup, toggleMic, toggleCam, flip, cycleSpeaker,
    setMinimized: (on) => patch({ minimized: on }),
    dismissHelp: () => setHelp(null),
    markCallsSeen: () => { const n = Date.now(); setSeen(n); try { localStorage.setItem(SEEN_KEY, String(n)); } catch { /* ignore */ } },
    refreshHistory,
    hideCall: async (id) => { if (!backend) return; await backend.hide(id); await refreshHistory(); },
    setRelay: (on) => { setRelayPreferred(on); setRelayState((r) => ({ ...r, on })); },
    simulateIncoming: async (cid, kind) => { if (!backend?.simulateIncoming) return; unlockAudio(); try { await backend.simulateIncoming(cid, kind); } catch (e) { toast(friendlyCallError(e)); } },
  }), [backend, supported, call, history, missed, explain, help, relay, place, accept, decline, hangup, toggleMic, toggleCam, flip, cycleSpeaker, patch, refreshHistory, toast]);
  return <C.Provider value={value}>{children}</C.Provider>;
}
