// Camera + microphone for calls: one place for constraints, permission checks, flip, and speaker selection.
import { mediaErrorKind, type MediaErr, type PermissionStateLike } from './calls';

export const callsSupported = () => typeof window !== 'undefined' && !!window.RTCPeerConnection && !!navigator.mediaDevices?.getUserMedia;
export const AUDIO: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
const VIDEO = (facing: 'user' | 'environment'): MediaTrackConstraints => ({ facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } });

export class MediaError extends Error { kind: MediaErr; video: boolean; constructor(kind: MediaErr, video: boolean, msg: string) { super(msg); this.kind = kind; this.video = video; } }
const wrap = (e: unknown, video: boolean) => new MediaError(mediaErrorKind((e as DOMException)?.name), video, (e as Error)?.message || String(e));

export async function getCallMedia(video: boolean, facing: 'user' | 'environment' = 'user'): Promise<MediaStream> {
  if (!window.isSecureContext) throw new MediaError('insecure', video, 'insecure context');
  if (!callsSupported()) throw new MediaError('unsupported', video, 'no getUserMedia');
  try { return await navigator.mediaDevices.getUserMedia({ audio: AUDIO, video: video ? VIDEO(facing) : false }); }
  catch (e) {
    if ((e as DOMException)?.name === 'OverconstrainedError' && video) {
      try { return await navigator.mediaDevices.getUserMedia({ audio: AUDIO, video: true }); } catch (e2) { throw wrap(e2, video); }
    }
    throw wrap(e, video);
  }
}
export async function getCamera(facing: 'user' | 'environment'): Promise<MediaStreamTrack> {
  try { const s = await navigator.mediaDevices.getUserMedia({ video: VIDEO(facing) }); return s.getVideoTracks()[0]; }
  catch (e) {
    if ((e as DOMException)?.name === 'OverconstrainedError') { try { const s = await navigator.mediaDevices.getUserMedia({ video: true }); return s.getVideoTracks()[0]; } catch (e2) { throw wrap(e2, true); } }
    throw wrap(e, true);
  }
}
export async function permissionState(name: 'microphone' | 'camera'): Promise<PermissionStateLike> {
  try { const r = await navigator.permissions?.query({ name: name as PermissionName }); return (r?.state as PermissionStateLike) || 'unknown'; } catch { return 'unknown'; }
}
export async function videoInputs(): Promise<number> {
  try { return (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput').length; } catch { return 0; }
}
/** Phones have front + back cameras; on desktop, flipping only makes sense with 2+ cameras. */
export async function canFlip(): Promise<boolean> { return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (await videoInputs()) > 1; }
/** Speaker choice works only where the browser can route audio (setSinkId) and there's more than one output. */
export async function audioOutputs(): Promise<MediaDeviceInfo[]> {
  if (typeof HTMLMediaElement === 'undefined' || !('setSinkId' in HTMLMediaElement.prototype)) return [];
  try { return (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audiooutput'); } catch { return []; }
}
export const stopStream = (s: MediaStream | null | undefined) => s?.getTracks().forEach((t) => t.stop());

const SEEN_KEY = 'hybrd:call-explained:v1';
export function explainedBefore(): { mic?: boolean; cam?: boolean } { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}'); } catch { return {}; } }
export function markExplained(video: boolean) { try { const s = explainedBefore(); s.mic = true; if (video) s.cam = true; localStorage.setItem(SEEN_KEY, JSON.stringify(s)); } catch { /* ignore */ } }
const RELAY_KEY = 'hybrd:call-relay';
export const relayPreferred = () => { try { return localStorage.getItem(RELAY_KEY) === '1'; } catch { return false; } };
export const setRelayPreferred = (on: boolean) => { try { localStorage.setItem(RELAY_KEY, on ? '1' : '0'); } catch { /* ignore */ } };
