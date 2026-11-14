// Shared audio / vibration / voice / wake-lock helpers.
let ctx: AudioContext | null = null;
let soundOn = true, voiceOn = false;
export function setCuePrefs(sound: boolean, voice: boolean) { soundOn = sound; voiceOn = voice; }

/** Call inside a tap handler (Start) — iOS only allows audio unlocked by a user gesture. */
export function unlockAudio() {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    if (!ctx) ctx = new AC();
    if (ctx.state === 'suspended') ctx.resume();
    const o = ctx.createOscillator(), g = ctx.createGain();
    g.gain.value = 0.0001; o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.01);
  } catch { /* ignore */ }
  try { if (voiceOn && 'speechSynthesis' in window) speechSynthesis.speak(new SpeechSynthesisUtterance('')); } catch { /* ignore */ }
}

function tone(freq: number, dur: number, when = 0, vol = 0.25) {
  if (!ctx || !soundOn) return;
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'square'; o.frequency.value = freq;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur + 0.02);
}
export type Cue = 'tick' | 'go' | 'rest' | 'done' | 'warn';
export function cue(c: Cue) {
  switch (c) {
    case 'tick': tone(880, 0.09); vibrate(40); break;
    case 'go': tone(1320, 0.35); vibrate([120]); break;
    case 'rest': tone(520, 0.35); vibrate([60, 60, 60]); break;
    case 'done': tone(1320, 0.18); tone(1320, 0.18, 0.25); tone(1760, 0.5, 0.5); vibrate([200, 100, 200, 100, 400]); break;
    case 'warn': tone(300, 0.4); vibrate([300]); break;
  }
}
/** Vibration API: Android only (iOS Safari has none) — a bonus, never the only cue. */
export function vibrate(p: number | number[]) { try { if (soundOn && 'vibrate' in navigator) navigator.vibrate(p); } catch { /* ignore */ } }
export function say(text: string) {
  try { if (!voiceOn || !('speechSynthesis' in window)) return; speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.rate = 1.05; speechSynthesis.speak(u); } catch { /* ignore */ }
}

// ---------- Screen Wake Lock ----------
let sentinel: WakeLockSentinel | null = null;
let wanted = 0;
const listeners = new Set<(on: boolean) => void>();
const emit = () => listeners.forEach((l) => l(!!sentinel));
async function arm() {
  if (!('wakeLock' in navigator) || sentinel || document.visibilityState !== 'visible') return;
  try {
    sentinel = await navigator.wakeLock.request('screen');
    sentinel.addEventListener('release', () => { sentinel = null; emit(); });
    emit();
  } catch { sentinel = null; emit(); }
}
document.addEventListener('visibilitychange', () => { if (wanted > 0 && document.visibilityState === 'visible') arm(); });
export const wakeLockSupported = () => 'wakeLock' in navigator;
export function acquireWakeLock() { wanted++; arm(); return () => { wanted = Math.max(0, wanted - 1); if (!wanted && sentinel) { sentinel.release().catch(() => {}); sentinel = null; emit(); } }; }
export function onWakeLock(fn: (on: boolean) => void) { listeners.add(fn); fn(!!sentinel); return () => { listeners.delete(fn); }; }

export const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
export const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
