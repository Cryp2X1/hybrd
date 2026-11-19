// Ringtones made on the fly with Web Audio (no audio files, nothing copyrighted):
// - incoming: a soft two-note chime, repeating (plus vibration where the phone supports it)
// - outgoing: the standard North American ringback cadence (440 + 480 Hz, 2 s on / 4 s off), quieter
// Browsers only allow sound after the person has touched the page once, so unlockAudio() runs on the first tap.
let ctx: AudioContext | null = null;
let timer = 0;
let nodes: AudioNode[] = [];
let mode: 'incoming' | 'outgoing' | null = null;
const AC = () => (typeof window === 'undefined' ? null : (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext || null));
function audio(): AudioContext | null {
  const A = AC(); if (!A) return null;
  if (!ctx) { try { ctx = new A(); } catch { return null; } }
  return ctx;
}
export function unlockAudio() { const c = audio(); if (c && c.state === 'suspended') c.resume().catch(() => undefined); }
const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
function tone(c: AudioContext, freq: number, at: number, dur: number, vol: number, type: OscillatorType = 'sine') {
  const o = c.createOscillator(); const g = c.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(c.destination); o.start(at); o.stop(at + dur + 0.05);
  nodes.push(o, g);
}
function incomingOnce() {
  const c = audio(); if (!c) return;
  const t = c.currentTime + 0.02;
  // C6 → G5 → E6 chime, twice
  for (const [i, off] of [0, 0.9].entries()) {
    void i;
    tone(c, 1046.5, t + off, 0.5, 0.18); tone(c, 783.99, t + off + 0.18, 0.5, 0.16); tone(c, 1318.5, t + off + 0.36, 0.7, 0.14);
  }
  if (!reduced() && 'vibrate' in navigator) { try { navigator.vibrate([400, 200, 400]); } catch { /* ignore */ } }
}
function outgoingOnce() {
  const c = audio(); if (!c) return;
  const t = c.currentTime + 0.02;
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.05); g.gain.setValueAtTime(0.05, t + 1.9); g.gain.exponentialRampToValueAtTime(0.0001, t + 2);
  g.connect(c.destination);
  for (const f of [440, 480]) { const o = c.createOscillator(); o.frequency.value = f; o.connect(g); o.start(t); o.stop(t + 2.05); nodes.push(o); }
  nodes.push(g);
}
export function startRing(m: 'incoming' | 'outgoing') {
  if (mode === m) return;
  stopRing(); mode = m;
  unlockAudio();
  const once = m === 'incoming' ? incomingOnce : outgoingOnce;
  once();
  timer = window.setInterval(once, m === 'incoming' ? 3000 : 6000);
}
export function stopRing() {
  mode = null;
  if (timer) { window.clearInterval(timer); timer = 0; }
  for (const n of nodes) { try { (n as OscillatorNode).stop?.(); } catch { /* already stopped */ } try { n.disconnect(); } catch { /* ignore */ } }
  nodes = [];
  if ('vibrate' in navigator) { try { navigator.vibrate(0); } catch { /* ignore */ } }
}
/** Short "call ended" blip. */
export function endTone() {
  const c = audio(); if (!c || c.state !== 'running') return;
  const t = c.currentTime + 0.01; tone(c, 480, t, 0.18, 0.08, 'sine'); tone(c, 360, t + 0.2, 0.25, 0.07, 'sine');
}
export const ringing = () => mode;
