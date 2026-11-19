// Calls — the backend contract shared by the live (Supabase) and demo (SAMPLE people, on-device) backends.
import type { CallCheck, CallHistoryItem, CallKind, CallStatus, MediaFlags } from './calls';
import type { PeerView } from './callEngine';

export type PeerCallState = 'ringing' | 'joined' | 'declined' | 'left' | 'missed' | 'busy' | 'unavailable';
export interface CallInvite { callId: string; conversationId: string; kind: CallKind; callerId: string; at: number; group: boolean }
export interface StartResult { callId: string; status: 'ringing' | 'unavailable' | 'busy' | 'join'; ringing: string[] }
export type CallEvent =
  | { type: 'incoming'; invite: CallInvite }
  /** the call as a whole changed (declined, ended, missed, canceled…) */
  | { type: 'status'; callId: string; status: CallStatus }
  /** one person in the call changed state */
  | { type: 'peer'; callId: string; userId: string; state: PeerCallState }
  | { type: 'history' };
/** What the call screen drives: the WebRTC mesh live, a simulated remote in the demo. */
export interface CallMedia {
  readonly flags: MediaFlags;
  start(): void;
  peerViews(): PeerView[];
  setMic(on: boolean): void;
  setVideo(track: MediaStreamTrack | null): Promise<void>;
  hangup(): void;
}
export interface ConnectOpts { local: MediaStream; onUpdate(peers: PeerView[]): void; onPeerLeft(id: string): void; relayOnly?: boolean }
export interface CallBackend {
  readonly kind: 'demo' | 'live';
  readonly myId: string;
  /** Pre-check for the call buttons (the server re-checks everything on start). */
  check(conversationId: string): Promise<CallCheck>;
  start(conversationId: string, kind: CallKind): Promise<StartResult>;
  answer(callId: string): Promise<void>;
  decline(callId: string, busy?: boolean): Promise<void>;
  /** Leave / end. `reason` tells the server how to record a call nobody answered. */
  leave(callId: string, reason: 'hangup' | 'timeout' | 'failed'): Promise<void>;
  /** Keep-alive while in a call; returns the call's status so a missed realtime event can't strand you. */
  heartbeat(callId: string): Promise<CallStatus | null>;
  connect(callId: string, o: ConnectOpts): Promise<CallMedia>;
  subscribe(cb: (e: CallEvent) => void): () => void;
  history(): Promise<CallHistoryItem[]>;
  hide(callId: string): Promise<void>;
  /** Whether a TURN relay is configured (needed for "Protect my IP address"). */
  hasRelay(): Promise<boolean>;
  /** Demo only: a sample person calls you. */
  simulateIncoming?(fromConversationId: string, kind: CallKind): Promise<void>;
}
