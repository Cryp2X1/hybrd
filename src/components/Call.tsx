// Calls UI: the full-screen incoming call, the ringing / in-call screen (voice + video, group tiles, draggable
// self view), the minimized call bar, the camera/mic explainer + "access blocked" help, the call buttons in a chat
// header, the call card in a chat thread, and the Calls tab list. State lives in lib/callStore.tsx.
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Icon } from './Icon';
import { Sheet } from './ui';
import { SAvatar, SampleTag } from './Social';
import { ConvAvatar, DmReportSheet, timeLabel } from './Messages';
import { useCalls, type ActiveCall } from '../lib/callStore';
import { useMessages } from '../lib/messagesStore';
import { avatarHue, callLine, callSeconds, endedText, formatDuration, historyFilter, QUALITY_TEXT, snapCorner, tileLayout, type CallHistoryItem, type CallKind, type CallLog, type Quality } from '../lib/calls';
import type { PeerView } from '../lib/callEngine';
import type { ConvView } from '../lib/messagesApi';
import type { PublicProfile } from '../lib/social';

const useNow = (on: boolean, ms = 1000) => {
  const [n, setN] = useState(Date.now());
  useEffect(() => { if (!on) return; const t = window.setInterval(() => setN(Date.now()), ms); return () => window.clearInterval(t); }, [on, ms]);
  return n;
};
const profileOf = (c: ActiveCall, id: string): PublicProfile | undefined => c.conv?.members.find((m) => m.userId === id)?.profile;
const titleOf = (c: ActiveCall) => c.conv?.title || 'Call';
const isSampleCall = (c: ActiveCall) => !!c.conv?.others.some((o) => o.profile.sample);
const worst = (peers: PeerView[]): Quality => {
  const order: Quality[] = ['poor', 'fair', 'good'];
  for (const q of order) if (peers.some((p) => p.quality === q)) return q;
  return 'unknown';
};

function StreamVideo({ stream, track, muted = true, mirror, className, label }: { stream?: MediaStream | null; track?: MediaStreamTrack | null; muted?: boolean; mirror?: boolean; className?: string; label?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const src = useMemo(() => (track ? new MediaStream([track]) : stream || null), [stream, track]);
  useEffect(() => { const v = ref.current; if (!v) return; if (v.srcObject !== src) v.srcObject = src; v.play().catch(() => undefined); }, [src]);
  return <video ref={ref} className={`${className || ''} ${mirror ? 'mirror' : ''}`} autoPlay playsInline muted={muted} aria-label={label} />;
}
/** Remote audio: one element per person, so audio keeps playing whatever the layout does. */
function PeerAudio({ stream, sinkId }: { stream: MediaStream; sinkId: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => { const a = ref.current; if (!a) return; if (a.srcObject !== stream) a.srcObject = stream; a.play().catch(() => undefined); }, [stream]);
  useEffect(() => { const a = ref.current as (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }) | null; if (a?.setSinkId && sinkId) a.setSinkId(sinkId).catch(() => undefined); }, [sinkId]);
  return <audio ref={ref} autoPlay />;
}
function QualityBars({ q, relayed }: { q: Quality; relayed?: boolean }) {
  const lit = q === 'good' ? 3 : q === 'fair' ? 2 : q === 'poor' ? 1 : 0;
  return (
    <span className={`call-q ${q}`} role="img" aria-label={`${QUALITY_TEXT[q]}${relayed ? ', via relay server' : ''}`} title={`${QUALITY_TEXT[q]}${relayed ? ' · via relay' : ''}`} data-testid="call-quality">
      {[1, 2, 3].map((i) => <i key={i} className={i <= lit ? 'on' : ''} style={{ height: 4 + i * 3 }} />)}
    </span>
  );
}
function CallBtn({ icon, label, on, danger, onClick, testid, disabled, className }: { icon: string; label: string; on?: boolean; danger?: boolean; onClick: () => void; testid?: string; disabled?: boolean; className?: string }) {
  return (
    <button className={`call-btn ${on ? 'on' : ''} ${danger ? 'danger' : ''} ${className || ''}`} onClick={onClick} aria-label={label} aria-pressed={on === undefined ? undefined : on} data-testid={testid} disabled={disabled}>
      <span className="call-btn-i"><Icon name={icon} size={26} className={icon === 'call' && danger ? 'rot135' : undefined} /></span>
      <span className="call-btn-l">{label}</span>
    </button>
  );
}

// ---------- draggable self view ----------
function SelfView({ c }: { c: ActiveCall }) {
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<{ dx: number; dy: number; id: number; moved: boolean } | null>(null);
  const frame = () => ({ w: window.innerWidth, h: window.innerHeight, top: 76, bottom: 150, side: 12 });
  const place = (x: number, y: number) => { const el = box.current; if (!el) return; const s = snapCorner({ x, y, w: el.offsetWidth, h: el.offsetHeight }, frame()); setPos({ x: s.x, y: s.y }); };
  useEffect(() => { const r = () => { const el = box.current; if (el) place(el.offsetLeft, el.offsetTop); }; window.addEventListener('resize', r); return () => window.removeEventListener('resize', r); }, []);
  const down = (e: RPointerEvent) => { const el = box.current; if (!el) return; el.setPointerCapture(e.pointerId); const r = el.getBoundingClientRect(); drag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top, id: e.pointerId, moved: false }; };
  const move = (e: RPointerEvent) => { const d = drag.current; if (!d || d.id !== e.pointerId) return; d.moved = true; setPos({ x: e.clientX - d.dx, y: e.clientY - d.dy }); };
  const up = (e: RPointerEvent) => { const d = drag.current; drag.current = null; if (!d || !d.moved) return; place(e.clientX - d.dx, e.clientY - d.dy); };
  const track = c.local?.getVideoTracks()[0] || null;
  return (
    <div ref={box} className="call-self" style={pos ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' } : undefined} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} data-testid="call-self" aria-label="Your camera. Drag to move.">
      {c.cam && track ? <StreamVideo track={track} mirror={c.facing === 'user'} className="call-self-v" /> : <div className="call-self-off"><Icon name="videooff" size={20} /><span>Camera off</span></div>}
      {!c.mic && <span className="call-self-mute"><Icon name="micoff" size={14} /></span>}
    </div>
  );
}
function Tile({ c, p, solo }: { c: ActiveCall; p: PeerView; solo: boolean }) {
  const prof = profileOf(c, p.id);
  const name = prof?.displayName || 'Someone';
  const live = p.cam && p.stream.getVideoTracks().length > 0;
  return (
    <div className={`call-tile ${solo ? 'solo' : ''} ${p.conn !== 'connected' ? 'weak' : ''}`} data-testid="call-tile">
      {live ? <StreamVideo stream={p.stream} className="call-tile-v" label={`${name}’s video`} /> : <div className="call-tile-av"><SAvatar p={prof} size={solo ? 132 : 84} /></div>}
      <div className="call-tile-name">
        {!p.mic && <Icon name="micoff" size={14} />}<span>{solo ? '' : name.split(' ')[0]}</span>
        {p.conn === 'reconnecting' && <span className="muted"> · Reconnecting…</span>}
        {!solo && <QualityBars q={p.quality} relayed={p.relayed} />}
      </div>
    </div>
  );
}

// ---------- the call screen ----------
function statusText(c: ActiveCall, now: number): string {
  const ringing = Object.values(c.peerStatus).some((s) => s === 'ringing');
  switch (c.state.phase) {
    case 'outgoing': return c.callId ? (ringing ? 'Ringing…' : 'Calling…') : 'Calling…';
    case 'incoming': return c.kind === 'video' ? 'HYBRD video call' : 'HYBRD voice call';
    case 'connecting': return 'Connecting…';
    case 'reconnecting': return 'Reconnecting…';
    case 'active': return formatDuration(callSeconds(c.state, now));
    case 'ended': return endedText(c.state, now);
    default: return '';
  }
}
function InfoSheet({ c, onClose, onReport }: { c: ActiveCall; onClose: () => void; onReport: () => void }) {
  const { relay, backend } = useCalls();
  const relayed = c.peers.some((p) => p.relayed);
  return (
    <Sheet open onClose={onClose} title="About this call">
      <div className="call-info" data-testid="call-info">
        {backend?.kind === 'demo' && <p className="call-note"><b>Sample call.</b> This is a simulated call with a SAMPLE person, on this device only. Nothing is sent anywhere.</p>}
        <p><Icon name="lock" size={16} /> <b>Encrypted in transit, peer to peer.</b> Audio and video go directly between devices (or through a relay server when a network needs one) and are encrypted by WebRTC (DTLS-SRTP), so relay servers can’t see or hear them.</p>
        <p className="muted small">Honest note: HYBRD’s calling feature hasn’t had an independent security audit, and with peer-to-peer calls the people you call can see your network (IP) address{relay.available ? ' unless you turn on “Protect my IP address” in Message settings' : ''}.</p>
        {c.state.phase === 'active' && <p className="muted small">Connection: {QUALITY_TEXT[worst(c.peers)]}{relayed ? ' · via relay server' : ' · direct'}</p>}
        <button className="btn ghost block" onClick={onReport} data-testid="call-report"><Icon name="flag" size={16} /> Report {c.conv?.kind === 'group' ? 'this group' : c.conv?.others[0]?.profile.displayName.split(' ')[0] || 'this person'}</button>
      </div>
    </Sheet>
  );
}
function CallScreen({ c }: { c: ActiveCall }) {
  const calls = useCalls();
  const nav = useNavigate();
  const now = useNow(c.state.phase === 'active');
  const [info, setInfo] = useState(false);
  const [report, setReport] = useState(false);
  const [chrome, setChrome] = useState(true);
  const phase = c.state.phase;
  const group = c.conv?.kind === 'group';
  const anyVideo = c.cam || c.peers.some((p) => p.cam && p.stream.getVideoTracks().length > 0);
  const videoMode = c.kind === 'video' || anyVideo;
  const connected = c.peers.filter((p) => p.conn !== 'failed');
  const ringing = phase === 'outgoing' || phase === 'connecting' || (phase === 'ended' && !c.state.connectedAt);
  const q = worst(c.peers);
  const sample = isSampleCall(c);
  const live = phase === 'active' || phase === 'reconnecting';
  // tap the video to hide/show the controls (after a while they hide by themselves)
  useEffect(() => { if (!videoMode || !live || !chrome) return; const t = window.setTimeout(() => setChrome(false), 6000); return () => window.clearTimeout(t); }, [videoMode, live, chrome]);
  const ringingPeople = Object.entries(c.peerStatus).filter(([u]) => u !== calls.backend?.myId);
  const showTiles = videoMode && live && connected.length > 0;
  const layout = tileLayout(connected.length);
  return (
    <div className={`call-screen ${videoMode ? 'video' : 'voice'} ${chrome ? '' : 'bare'} ${phase}`} role="dialog" aria-modal="true" aria-label={`Call with ${titleOf(c)}`} data-testid="call-screen" data-phase={phase} data-mode={videoMode ? 'video' : 'voice'}>
      {c.peers.map((p) => <PeerAudio key={p.id} stream={p.stream} sinkId={c.sinkId} />)}
      {/* background: my camera while ringing a video call; the remote tiles once connected */}
      {videoMode && !showTiles && c.cam && c.local && <StreamVideo track={c.local.getVideoTracks()[0]} mirror={c.facing === 'user'} className="call-bg-v" />}
      {!videoMode || !c.cam ? <div className="call-bg" style={{ ['--hue' as string]: String(avatarHue(c.conv?.others[0]?.profile.avatarUrl)) }} /> : null}
      {showTiles && (
        <div className={`call-tiles ${layout}`} onClick={() => setChrome((x) => !x)}>
          {connected.map((p) => <Tile key={p.id} c={c} p={p} solo={layout === 'one'} />)}
        </div>
      )}
      <header className="call-top">
        <button className="call-icon" onClick={() => calls.setMinimized(true)} aria-label="Minimize call" data-testid="call-minimize" disabled={phase === 'ended'}><Icon name="minimize" size={20} /></button>
        <div className="call-top-mid">
          {(showTiles || !ringing) && videoMode ? <><b>{titleOf(c)}</b>{sample && <SampleTag />}<span className="call-top-s" data-testid="call-status">{statusText(c, now)}</span></> : <span className="call-enc"><Icon name="lock" size={12} /> Encrypted · peer to peer</span>}
        </div>
        <div className="call-top-r">
          {live && <QualityBars q={q} relayed={c.peers.some((p) => p.relayed)} />}
          <button className="call-icon" onClick={() => setInfo(true)} aria-label="Call info and report" data-testid="call-more"><Icon name="info" size={20} /></button>
        </div>
      </header>
      {calls.backend?.kind === 'demo' && <div className="call-sample" data-testid="call-sample">SAMPLE · simulated call, nothing is sent</div>}
      {!showTiles && (
        <div className="call-hero">
          <div className={`call-av ${ringing && phase !== 'ended' ? 'pulse' : ''} ${live ? 'talk' : ''}`}>{c.conv ? <ConvAvatar c={c.conv} size={128} /> : <SAvatar p={null} size={128} />}</div>
          <h2 className="call-name">{titleOf(c)}{sample && <SampleTag />}</h2>
          <p className="call-st" data-testid="call-status" aria-live="polite">{statusText(c, now)}</p>
          {live && !videoMode && <p className="call-qt"><QualityBars q={q} /> {QUALITY_TEXT[q]}</p>}
          {group && ringingPeople.length > 0 && phase !== 'ended' && (
            <ul className="call-people" aria-label="People in this call">
              {ringingPeople.map(([u, s]) => <li key={u} className={s}><SAvatar p={profileOf(c, u)} size={22} /> {profileOf(c, u)?.displayName.split(' ')[0] || 'Member'} <span className="muted">{s === 'joined' ? (c.peers.some((p) => p.id === u && p.conn === 'connected') ? 'In call' : 'Joining…') : s === 'ringing' ? 'Ringing' : s === 'left' ? 'Left' : s === 'declined' ? 'Declined' : 'Not available'}</span></li>)}
            </ul>
          )}
        </div>
      )}
      {(videoMode && (live || c.cam)) && phase !== 'ended' && showTiles && <SelfView c={c} />}
      {phase !== 'ended' && (
        <footer className="call-ctrl" data-testid="call-controls">
          {c.outputs.length > 1 && <CallBtn icon={c.sinkId && c.outputs[0]?.deviceId !== c.sinkId ? 'volume' : 'speaker'} label="Audio" onClick={calls.cycleSpeaker} testid="call-speaker" />}
          <CallBtn icon={c.cam ? 'video' : 'videooff'} label="Camera" on={c.cam} onClick={() => void calls.toggleCam()} testid="call-cam" disabled={c.busy || !live && phase !== 'outgoing' && phase !== 'connecting'} />
          {c.cam && c.canFlip && <CallBtn icon="flipcam" label="Flip" onClick={() => void calls.flip()} testid="call-flip" disabled={c.busy} />}
          <CallBtn icon={c.mic ? 'mic' : 'micoff'} label={c.mic ? 'Mute' : 'Unmute'} on={!c.mic} onClick={calls.toggleMic} testid="call-mic" className="mic" />
          <CallBtn icon="call" danger label={phase === 'outgoing' ? 'Cancel' : 'End'} onClick={calls.hangup} testid="call-end" />
        </footer>
      )}
      {phase === 'ended' && (
        <footer className="call-ctrl ended">
          <button className="btn ghost" onClick={() => { calls.setMinimized(true); nav(`/messages/${c.conversationId}`); }}>Open chat</button>
          {c.state.reason !== 'unavailable' && c.state.reason !== 'busy' && c.state.role === 'caller' && !c.state.connectedAt && <button className="btn y" onClick={() => void calls.place(c.conversationId, c.kind)} data-testid="call-again">Call again</button>}
        </footer>
      )}
      {info && <InfoSheet c={c} onClose={() => setInfo(false)} onReport={() => { setInfo(false); setReport(true); }} />}
      {report && c.conv && <DmReportSheet target={{ type: 'conversation', id: c.conversationId, conversationId: c.conversationId, who: c.conv.kind === 'direct' ? c.conv.others[0]?.profile : undefined, groupTitle: c.conv.kind === 'group' ? c.conv.title : undefined, preview: `Reported during a ${c.kind} call` }} onClose={() => setReport(false)} onBlocked={() => calls.hangup()} />}
    </div>
  );
}

function IncomingScreen({ c }: { c: ActiveCall }) {
  const calls = useCalls();
  const inv = c.invite!;
  const caller = profileOf(c, inv.callerId);
  const group = c.conv?.kind === 'group';
  const sample = isSampleCall(c);
  return (
    <div className="call-screen incoming" role="alertdialog" aria-modal="true" aria-label={`Incoming ${c.kind} call from ${caller?.displayName || titleOf(c)}`} data-testid="call-incoming">
      <div className="call-bg" style={{ ['--hue' as string]: String(avatarHue(caller?.avatarUrl)) }} />
      <header className="call-top"><span /><div className="call-top-mid"><span className="call-enc"><Icon name="lock" size={12} /> Encrypted · peer to peer</span></div><span /></header>
      {calls.backend?.kind === 'demo' && <div className="call-sample">SAMPLE · simulated call, nothing is sent</div>}
      <div className="call-hero">
        <div className="call-av pulse">{group && c.conv ? <ConvAvatar c={c.conv} size={128} /> : <SAvatar p={caller} size={128} />}</div>
        <h2 className="call-name">{group ? titleOf(c) : caller?.displayName || titleOf(c)}{sample && <SampleTag />}</h2>
        <p className="call-st">{group ? `${caller?.displayName.split(' ')[0] || 'Someone'} is calling the group · ${c.kind}` : c.kind === 'video' ? 'Incoming video call…' : 'Incoming voice call…'}</p>
      </div>
      <footer className="call-ctrl incoming">
        <CallBtn icon="call" danger label="Decline" onClick={() => void calls.decline()} testid="call-decline" />
        {c.kind === 'video' && <CallBtn icon="call" label="Voice only" onClick={() => void calls.accept(false)} testid="call-accept-voice" className="soft" disabled={c.busy} />}
        <CallBtn icon={c.kind === 'video' ? 'video' : 'call'} label={c.busy ? 'Starting…' : 'Accept'} onClick={() => void calls.accept()} testid="call-accept" className="accept" disabled={c.busy} />
      </footer>
    </div>
  );
}

function CallBar({ c }: { c: ActiveCall }) {
  const calls = useCalls();
  const now = useNow(c.state.phase === 'active');
  return (
    <div className={`call-bar ${c.state.phase}`} role="region" aria-label="Ongoing call" data-testid="call-bar">
      {c.peers.map((p) => <PeerAudio key={p.id} stream={p.stream} sinkId={c.sinkId} />)}
      <button className="call-bar-main" onClick={() => calls.setMinimized(false)} data-testid="call-bar-open">
        <Icon name={c.cam ? 'video' : 'call'} size={16} />
        <b>{titleOf(c)}</b>
        <span>{statusText(c, now)}</span>
        <span className="call-bar-tap">Tap to return</span>
      </button>
      {c.state.phase !== 'ended' && <>
        <button className="call-bar-btn" onClick={calls.toggleMic} aria-label={c.mic ? 'Mute' : 'Unmute'} aria-pressed={!c.mic}><Icon name={c.mic ? 'mic' : 'micoff'} size={18} /></button>
        <button className="call-bar-btn end" onClick={calls.hangup} aria-label="End call" data-testid="call-bar-end"><Icon name="call" size={18} className="rot135" /></button>
      </>}
    </div>
  );
}

function ExplainSheet() {
  const { explain } = useCalls();
  if (!explain) return null;
  return (
    <Sheet open onClose={explain.cancel} title={explain.video ? 'Allow camera and microphone' : 'Allow microphone'}>
      <div className="call-explain" data-testid="call-explain">
        <div className="call-explain-i"><Icon name="mic" size={30} />{explain.video && <Icon name="video" size={30} />}</div>
        <p>To {explain.video ? 'video' : 'voice'} call, HYBRD needs your {explain.video ? 'camera and microphone' : 'microphone'}. Your browser will ask next — tap <b>Allow</b>.</p>
        <ul className="muted small">
          <li>Only used while you’re in a call. Nothing is recorded or saved.</li>
          <li>You can mute or turn your camera off any time during a call.</li>
          <li>You can change this later in your browser or phone settings.</li>
        </ul>
        <button className="btn y block" onClick={explain.go} data-testid="call-explain-go">Continue</button>
        <button className="btn ghost block" onClick={explain.cancel} style={{ marginTop: 8 }}>Not now</button>
      </div>
    </Sheet>
  );
}
function HelpSheet() {
  const { help, dismissHelp } = useCalls();
  if (!help) return null;
  return (
    <Sheet open onClose={dismissHelp} title={help.title}>
      <div className="call-explain" data-testid="call-help">
        <p>{help.body}</p>
        {help.steps.length > 0 && <ol className="call-steps">{help.steps.map((s) => <li key={s}>{s}</li>)}</ol>}
        {help.voice && <button className="btn y block" onClick={help.voice} data-testid="call-help-voice">Use voice only</button>}
        <button className="btn ghost block" onClick={dismissHelp} style={{ marginTop: 8 }}>Close</button>
      </div>
    </Sheet>
  );
}

/** Mounted once (App): whatever call UI is needed right now. */
export function CallLayer() {
  const { call } = useCalls();
  let body = null;
  if (call) {
    if (call.state.phase === 'incoming') body = <IncomingScreen c={call} />;
    else if (call.minimized) body = <CallBar c={call} />;
    else body = <CallScreen c={call} />;
  }
  // stop the page behind a full-screen call from scrolling
  const full = !!call && (call.state.phase === 'incoming' || !call.minimized);
  useEffect(() => { document.body.classList.toggle('in-call', full); return () => document.body.classList.remove('in-call'); }, [full]);
  return createPortal(<>{body}<ExplainSheet /><HelpSheet /></>, document.body);
}

// ---------- chat header buttons ----------
export function CallButtons({ c }: { c: ConvView }) {
  const calls = useCalls();
  if (!calls.backend) return null;
  const blocked = !!c.blocked || !!c.request || c.me.state !== 'active';
  const why = c.request ? 'Calls open once the message request is accepted' : c.blocked ? 'You can’t call this person' : '';
  const go = (k: CallKind) => { if (blocked) return; void calls.place(c.id, k); };
  return (
    <>
      <button className="dm-hbtn" onClick={() => go('voice')} aria-label={blocked ? `Voice call unavailable. ${why}` : `Voice call ${c.title}`} title={why || 'Voice call'} disabled={blocked} data-testid="dm-call-voice"><Icon name="call" size={20} /></button>
      <button className="dm-hbtn" onClick={() => go('video')} aria-label={blocked ? `Video call unavailable. ${why}` : `Video call ${c.title}`} title={why || 'Video call'} disabled={blocked} data-testid="dm-call-video"><Icon name="video" size={22} /></button>
    </>
  );
}

// ---------- the call card in a chat thread ----------
export function CallLogCard({ call, actor, me, group, conversationId, at }: { call: CallLog; actor: string; me: string; group: boolean; conversationId: string; at: number }) {
  const calls = useCalls();
  const l = callLine(call, actor, me, group);
  return (
    <div className="dm-callrow" data-testid="dm-call-log">
      <button className={`dm-call ${l.missed ? 'missed' : ''}`} onClick={() => void calls.place(conversationId, call.kind)} aria-label={`${l.title}, ${l.sub}. Call back`}>
        <span className="dm-call-i"><Icon name={l.missed ? 'callmissed' : call.kind === 'video' ? 'video' : l.outgoing ? 'callout' : 'callin'} size={18} /></span>
        <span className="dm-call-t"><b>{l.title}</b><span>{l.sub}</span></span>
        <span className="dm-call-cb">{call.kind === 'video' ? 'Call back' : 'Call back'}</span>
      </button>
      <span className="dm-call-at">{timeLabel(at)}</span>
    </div>
  );
}

// ---------- Calls tab ----------
export function CallsList() {
  const calls = useCalls();
  const { inbox } = useMessages();
  const nav = useNavigate();
  const [f, setF] = useState<'all' | 'missed'>('all');
  const me = calls.backend?.myId || '';
  useEffect(() => { calls.markCallsSeen(); void calls.refreshHistory(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const items = historyFilter(calls.history, me, f);
  const conv = (i: CallHistoryItem) => inbox.find((c) => c.id === i.conversationId);
  const demo = calls.backend?.kind === 'demo';
  const demoTargets = inbox.filter((c) => !c.request && (c.kind === 'group' || c.others[0]?.profile.sample)).slice(0, 4);
  return (
    <div className="calls-tab" data-testid="calls-tab">
      <div className="calls-filter" role="tablist" aria-label="Filter calls">
        <button role="tab" aria-selected={f === 'all'} className={f === 'all' ? 'on' : ''} onClick={() => setF('all')}>All</button>
        <button role="tab" aria-selected={f === 'missed'} className={f === 'missed' ? 'on' : ''} onClick={() => setF('missed')} data-testid="calls-missed">Missed</button>
      </div>
      {items.length === 0 ? (
        <div className="calls-empty"><Icon name="call" size={30} /><p><b>{f === 'missed' ? 'No missed calls' : 'No calls yet'}</b></p><p className="muted small">Start a voice or video call from any chat with the buttons at the top.</p></div>
      ) : (
        <ul className="calls-list">
          {items.map((i) => {
            const cv = conv(i);
            const l = callLine({ id: i.id, kind: i.kind, status: i.status, durationSec: i.durationSec, people: i.peers.length + 1 }, i.callerId, me, i.group);
            const title = cv?.title || i.title || 'Call';
            const sample = cv?.others.some((o) => o.profile.sample);
            return (
              <li key={i.id} className={l.missed ? 'missed' : ''} data-testid="calls-row">
                <button className="calls-row-main" onClick={() => nav(`/messages/${i.conversationId}`)}>
                  {cv ? <ConvAvatar c={cv} size={46} /> : <SAvatar p={{ displayName: title }} size={46} />}
                  <span className="calls-row-t"><b>{title}{sample && <SampleTag />}</b><span><Icon name={l.missed ? 'callmissed' : l.outgoing ? 'callout' : 'callin'} size={13} /> {l.missed ? l.title : l.sub} · {timeLabel(i.at)}</span></span>
                </button>
                <button className="dm-hbtn" onClick={() => void calls.place(i.conversationId, i.kind)} aria-label={`${i.kind === 'video' ? 'Video' : 'Voice'} call ${title}`}><Icon name={i.kind === 'video' ? 'video' : 'call'} size={20} /></button>
                <button className="dm-hbtn" onClick={() => void calls.hideCall(i.id)} aria-label="Remove from call history"><Icon name="x" size={16} /></button>
              </li>
            );
          })}
        </ul>
      )}
      {demo && demoTargets.length > 0 && (
        <div className="calls-demo" data-testid="calls-demo">
          <p><b>Try it with a SAMPLE person</b></p>
          <p className="muted small">In the demo a sample person can call you. It’s simulated on this device — nothing is sent. Maya and Leo pick up when you call them; Ana declines.</p>
          <div className="calls-demo-b">
            {demoTargets.map((c) => (
              <span key={c.id}>
                <button className="chip" onClick={() => void calls.simulateIncoming(c.id, 'voice')} data-testid={`calls-sim-voice-${c.id}`}><Icon name="callin" size={14} /> {c.kind === 'group' ? c.title : c.others[0].profile.displayName.split(' ')[0]} calls you</button>
                <button className="chip" onClick={() => void calls.simulateIncoming(c.id, 'video')} data-testid={`calls-sim-video-${c.id}`}><Icon name="video" size={14} /> video</button>
              </span>
            ))}
          </div>
        </div>
      )}
      <p className="muted small calls-foot">Calls ring only while HYBRD is open in your browser or installed app — there are no push notifications for calls yet. Missed calls show up here and in the chat.</p>
    </div>
  );
}
