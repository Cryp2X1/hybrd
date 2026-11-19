// Real-WebRTC checks for the call engine (src/lib/callEngine.ts) in headless Chrome with fake camera/mic:
// 1:1 connect + media both ways, mute/camera state signaling, voice → video upgrade without renegotiation,
// camera flip (replaceTrack), a 3- and 4-person mesh, the 4-person cap, leave/bye, rejoin, junk signals.
// Media goes through a local coturn TURN relay (TCP) using credentials minted by the real turn-credentials Edge
// Function, which also proves the "networks that need TURN" path (this test machine's browser blocks direct UDP).
// Needs `turnserver` (apt install coturn). Builds a tiny harness with Vite and drives it with puppeteer-core.
// Run: node tools/test-calls-webrtc.mjs
import { build } from 'vite';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import puppeteer from 'puppeteer-core';
import { spawn, execSync } from 'node:child_process';
import { networkInterfaces } from 'node:os';
import crypto from 'node:crypto';
import { handle as turnFn, coturnCredential } from '../supabase/functions/turn-credentials/index.ts';

const root = new URL('./calls-harness/', import.meta.url).pathname;
const out = '/tmp/hybrd-calls-harness';
await build({ root, base: './', logLevel: 'error', configFile: false, build: { outDir: out, emptyOutDir: true, minify: false } });
const types = { '.html': 'text/html', '.js': 'text/javascript' };
const srv = createServer(async (req, res) => {
  try { const u = (req.url || '/').split('?')[0]; const p = join(out, u === '/' ? 'index.html' : u.replace(/\.\./g, '')); const body = await readFile(p); res.writeHead(200, { 'Content-Type': types[extname(p)] || 'application/octet-stream' }); res.end(body); }
  catch { res.writeHead(404); res.end(); }
}).listen(0, '127.0.0.1');
await new Promise((r) => srv.once('listening', r));
const url = `http://127.0.0.1:${srv.address().port}/`;

let failed = 0;
const check = (name, cond, detail) => { if (!cond) { failed++; console.error('FAIL', name, detail ?? ''); } else console.log('ok', name); };

// ---------- turn-credentials Edge Function (providers mocked, no network) ----------
const UID = '11111111-2222-3333-4444-555555555555';
const ENV = { ALLOWED_ORIGINS: 'https://cryp2x1.github.io', SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_ANON_KEY: 'anon', TURN_URLS: 'turn:turn.example.com:3478?transport=udp,turns:turn.example.com:5349?transport=tcp,http://bad', TURN_SECRET: 's3cret', TURN_TTL: '3600' };
const envOf = (o) => (k) => o[k] ?? '';
const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.signature-part';
const fakeFetch = (calls = []) => async (url, init = {}) => {
  calls.push(url);
  if (url.endsWith('/auth/v1/user')) return init.headers?.Authorization === `Bearer ${TOKEN}` ? new Response(JSON.stringify({ id: UID })) : new Response('{}', { status: 401 });
  if (url.startsWith('https://rtc.live.cloudflare.com/')) return init.headers?.Authorization === 'Bearer cf-token' ? new Response(JSON.stringify({ iceServers: [{ urls: ['stun:stun.cloudflare.com:3478', 'turn:turn.cloudflare.com:3478?transport=udp', 'turn:turn.cloudflare.com:53?transport=udp'], username: 'u', credential: 'c' }] }), { status: 201 }) : new Response('', { status: 401 });
  if (url.startsWith('https://myapp.metered.live/')) return new Response(JSON.stringify([{ urls: 'turn:global.relay.metered.ca:80', username: 'm', credential: 'k' }]));
  return new Response('', { status: 404 });
};
const rq = (o = {}) => new Request('https://fn.example/turn-credentials', { method: o.method || 'POST', headers: { Origin: o.origin || 'https://cryp2x1.github.io', ...(o.auth === false ? {} : { Authorization: `Bearer ${o.token || TOKEN}` }) } });
{
  let r = await turnFn(rq({ method: 'OPTIONS' }), envOf(ENV), fakeFetch());
  check('turn fn: CORS preflight for the app origin', r.status === 204 && r.headers.get('access-control-allow-origin') === 'https://cryp2x1.github.io');
  const calls = [];
  r = await turnFn(rq({ origin: 'https://evil.example' }), envOf(ENV), fakeFetch(calls));
  check('turn fn: other origins refused (no calls made)', r.status === 403 && calls.length === 0);
  r = await turnFn(rq({ auth: false }), envOf(ENV), fakeFetch());
  check('turn fn: signed-out → 401', r.status === 401);
  r = await turnFn(rq({ token: 'eyJhbGciOiJIUzI1NiJ9.forged-token-value-123' }), envOf(ENV), fakeFetch());
  check('turn fn: a token the auth server rejects → 401', r.status === 401);
  r = await turnFn(rq(), envOf(ENV), fakeFetch(), 1_800_000_000);
  const b = await r.json();
  const exp = crypto.createHmac('sha1', 's3cret').update(`1800003600:${UID}`).digest('base64');
  check('turn fn (coturn): REST credentials = HMAC-SHA1(secret, "expiry:uid")', r.status === 200 && b.iceServers[0].username === `1800003600:${UID}` && b.iceServers[0].credential === exp, b);
  check('turn fn (coturn): only turn:/turns: URLs, never the secret', b.iceServers[0].urls.length === 2 && !JSON.stringify(b).includes('s3cret'));
  check('turn fn: no-store (credentials never cached)', r.headers.get('cache-control') === 'no-store');
  r = await turnFn(rq(), envOf({ ...ENV, TURN_SECRET: '', TURN_URLS: '', CF_TURN_KEY_ID: 'kid', CF_TURN_API_TOKEN: 'cf-token' }), fakeFetch());
  const cf = await r.json();
  check('turn fn (Cloudflare): ICE servers passed through, port 53 dropped', r.status === 200 && cf.iceServers[0].urls.length === 2 && !cf.iceServers[0].urls.some((u) => u.includes(':53')), cf);
  r = await turnFn(rq(), envOf({ ...ENV, TURN_SECRET: '', TURN_URLS: '', METERED_DOMAIN: 'myapp.metered.live', METERED_API_KEY: 'k' }), fakeFetch());
  check('turn fn (Metered): ICE servers passed through', r.status === 200 && (await r.json()).iceServers[0].username === 'm');
  r = await turnFn(rq(), envOf({ ...ENV, TURN_SECRET: '', TURN_URLS: '' }), fakeFetch());
  check('turn fn: no provider configured → clear 500', r.status === 500 && /no TURN provider/.test((await r.json()).error));
}

// ---------- local TURN relay (coturn) ----------
const ip = Object.values(networkInterfaces()).flat().find((a) => a && a.family === 'IPv4' && !a.internal)?.address;
let turn = null; const TPORT = 34000 + Math.floor(Math.random() * 1000);
try { execSync('command -v turnserver', { stdio: 'ignore' }); } catch { console.error('turnserver (coturn) not installed: apt install coturn'); process.exit(1); }
turn = spawn('turnserver', ['-n', `--listening-ip=${ip}`, `--relay-ip=${ip}`, `--listening-port=${TPORT}`, '--use-auth-secret', '--static-auth-secret=hybrd-local-test', '--realm=hybrd.test', '--no-tls', '--no-dtls', '--fingerprint', '--no-cli', '--log-file=stdout', '--simple-log', `--min-port=${TPORT + 1}`, `--max-port=${TPORT + 400}`], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
const cred = await coturnCredential('hybrd-local-test', 'tester', 3600);
const ICE = [{ urls: `turn:${ip}:${TPORT}?transport=tcp`, username: cred.username, credential: cred.credential }];
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => { failed++; console.error('pageerror', e.message); });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.H);
  await page.evaluate((ice) => { window.ICE = ice; }, ICE);

  // a tiny world: N engines on one MemoryBus, each with its own fake mic (+ optional camera)
  await page.evaluate(() => {
    window.W = {
      bus: null, engines: {}, views: {}, left: {},
      async setup(ids, video) {
        this.bus = new H.MemoryBus(); this.engines = {}; this.views = {}; this.left = {};
        for (const id of ids) await this.join(id, video);
      },
      async join(id, video) {
        const local = await navigator.mediaDevices.getUserMedia({ audio: true, video: !!video });
        const e = new H.CallEngine({ callId: 'call-1', me: id, transport: this.bus.transport(), iceServers: window.ICE, relayOnly: true, local, maxPeople: H.MAX_CALL_PEOPLE,
          onUpdate: (v) => { this.views[id] = v; }, onPeerLeft: (p) => { (this.left[id] ||= []).push(p); }, statsMs: 700 });
        e.local = local; this.engines[id] = e; e.start();
      },
      connected(id) { return (this.views[id] || []).filter((p) => p.conn === 'connected').map((p) => p.id).sort(); },
      peer(id, other) { return (this.views[id] || []).find((p) => p.id === other); },
      tracks(id, other) { const p = this.peer(id, other); return p ? p.stream.getTracks().map((t) => `${t.kind}:${t.readyState}:${t.muted ? 'muted' : 'live'}`) : []; },
      dbg(id, other) { const pc = this.engines[id].peers.get(other)?.pc; return pc ? pc.getTransceivers().map((t) => [t.mid, t.currentDirection, t.receiver.track.kind, t.receiver.track.muted, this.peer(id, other).stream.getTracks().includes(t.receiver.track)]) : null; },
      // real frames: play the remote stream in a <video> and wait for a decoded picture
      async frames(id, other) {
        const p = this.peer(id, other); if (!p) return 0;
        const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.srcObject = new MediaStream(p.stream.getVideoTracks());
        document.body.appendChild(v); await v.play().catch(() => undefined);
        await new Promise((r) => setTimeout(r, 1500));
        const w = v.videoWidth; v.remove(); return w;
      },
      async inbound(id, other, kind) {
        const pc = this.engines[id].peers.get(other)?.pc; if (!pc) return 0;
        let n = 0; (await pc.getStats()).forEach((s) => { if (s.type === 'inbound-rtp' && s.kind === kind) n += s.packetsReceived || 0; }); return n;
      },
      hangAll() { for (const e of Object.values(this.engines)) { e.hangup(); e.local.getTracks().forEach((t) => t.stop()); } },
    };
  });
  const waitFor = async (fn, args, ms = 15000) => { try { await page.waitForFunction(fn, { timeout: ms, polling: 200 }, ...args); return true; } catch { return false; } };

  // ---------- 1:1 voice ----------
  await page.evaluate(() => W.setup(['alice', 'bob'], false));
  check('1:1 voice: both sides connect', await waitFor((a, b) => W.connected(a).includes(b) && W.connected(b).includes(a), ['alice', 'bob']));
  check('1:1 voice: remote audio track arrives', await waitFor(() => W.tracks('alice', 'bob').some((t) => t.startsWith('audio:live')) && W.tracks('bob', 'alice').some((t) => t.startsWith('audio:live')), []));
  await new Promise((r) => setTimeout(r, 1500));
  check('1:1 voice: audio packets flow both ways', (await page.evaluate(() => W.inbound('alice', 'bob', 'audio'))) > 20 && (await page.evaluate(() => W.inbound('bob', 'alice', 'audio'))) > 20);
  check('1:1 voice: camera flag is off on both sides', await page.evaluate(() => W.peer('alice', 'bob').cam === false && W.peer('bob', 'alice').cam === false));
  const sigBefore = await page.evaluate(() => W.engines.alice.peers.get('bob').pc.localDescription.sdp.split('m=').length);
  check('1:1 voice: one audio + one video m-line (video kept for later upgrade)', sigBefore === 3, sigBefore);
  // mute
  await page.evaluate(() => W.engines.alice.setMic(false));
  check('mute is signaled to the other side', await waitFor(() => W.peer('bob', 'alice')?.mic === false, []));
  check('mute disables the local mic track', await page.evaluate(() => W.engines.alice.local.getAudioTracks()[0].enabled === false));
  await page.evaluate(() => W.engines.alice.setMic(true));
  check('unmute is signaled', await waitFor(() => W.peer('bob', 'alice')?.mic === true, []));
  // voice → video (no renegotiation: same pc, same m-lines)
  const pcBefore = await page.evaluate(() => { const pc = W.engines.alice.peers.get('bob').pc; window.__pc = pc; return pc.signalingState; });
  await page.evaluate(async () => { const s = await navigator.mediaDevices.getUserMedia({ video: true }); await W.engines.alice.setVideo(s.getVideoTracks()[0]); });
  check('voice → video: camera flag reaches the other side', await waitFor(() => W.peer('bob', 'alice')?.cam === true, []));
  check('voice → video: real video frames arrive on the other side', (await page.evaluate(() => W.frames('bob', 'alice'))) > 0);
  check('voice → video: same connection, no renegotiation', await page.evaluate(() => W.engines.alice.peers.get('bob').pc === window.__pc && W.engines.alice.peers.get('bob').pc.localDescription.sdp.split('m=').length === 3) && pcBefore === 'stable');
  // flip (new track replaces the old one, old one stopped)
  const flipped = await page.evaluate(async () => {
    const old = W.engines.alice.local.getVideoTracks()[0];
    const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    await W.engines.alice.setVideo(s.getVideoTracks()[0]);
    const sender = W.engines.alice.peers.get('bob').video;
    return { oldEnded: old.readyState === 'ended', senderTrack: sender.track === s.getVideoTracks()[0], localCount: W.engines.alice.local.getVideoTracks().length };
  });
  check('flip camera: replaceTrack on the sender, old camera released', flipped.oldEnded && flipped.senderTrack && flipped.localCount === 1, flipped);
  // camera off
  await page.evaluate(() => W.engines.alice.setVideo(null));
  check('camera off: flag reaches the other side, camera released', await waitFor(() => W.peer('bob', 'alice')?.cam === false && W.engines.alice.local.getVideoTracks().length === 0, []));
  check('quality is measured from getStats', await waitFor(() => ['good', 'fair', 'poor'].includes(W.peer('alice', 'bob')?.quality) && W.peer('alice', 'bob').sample?.rttMs != null, [], 12000), await page.evaluate(() => W.peer('alice', 'bob')?.sample));
  check('stats see the TURN relay in use', await page.evaluate(() => W.peer('alice', 'bob')?.relayed === true));
  // bye
  await page.evaluate(() => W.engines.bob.hangup());
  check('hang up: the other side drops the connection and is told', await waitFor(() => !W.peer('alice', 'bob') && (W.left.alice || []).includes('bob'), []));
  await page.evaluate(() => W.hangAll());

  // ---------- 1:1 video from the start, then rejoin ----------
  await page.evaluate(() => W.setup(['carol', 'dave'], true));
  check('1:1 video: connected', await waitFor(() => W.connected('carol').includes('dave') && W.connected('dave').includes('carol'), [], 20000));
  check('1:1 video: real video frames both ways', (await page.evaluate(() => W.frames('carol', 'dave'))) > 0 && (await page.evaluate(() => W.frames('dave', 'carol'))) > 0);
  check('1:1 video: camera flags on', await page.evaluate(() => W.peer('carol', 'dave').cam && W.peer('dave', 'carol').cam));
  await page.evaluate(async () => { W.engines.dave.hangup(); W.engines.dave.local.getTracks().forEach((t) => t.stop()); delete W.views.carol; await new Promise((r) => setTimeout(r, 400)); await W.join('dave', true); });
  check('rejoin after dropping: reconnects with a fresh session', await waitFor(() => W.connected('carol').includes('dave') && W.connected('dave').includes('carol'), [], 20000));
  await page.evaluate(() => W.hangAll());

  // ---------- group mesh: 3 then 4 people, 5th refused ----------
  await page.evaluate(() => W.setup(['p1', 'p2', 'p3'], true));
  check('mesh of 3: everyone connected to everyone', await waitFor(() => ['p1', 'p2', 'p3'].every((id) => W.connected(id).length === 2), [], 25000), await page.evaluate(() => ({ p1: W.connected('p1'), p2: W.connected('p2'), p3: W.connected('p3') })));
  await page.evaluate(() => W.join('p4', false));
  check('mesh of 3: video frames from both others', (await page.evaluate(() => W.frames('p1', 'p2'))) > 0 && (await page.evaluate(() => W.frames('p1', 'p3'))) > 0);
  check('mesh of 4: a late joiner connects to all three', await waitFor(() => ['p1', 'p2', 'p3', 'p4'].every((id) => W.connected(id).length === 3), [], 25000), await page.evaluate(() => ['p1', 'p2', 'p3', 'p4'].map((id) => W.connected(id))));
  check('mesh of 4: video bitrate capped for the mesh', await page.evaluate(async () => { const s = W.engines.p1.peers.get('p2').video.getParameters(); return s.encodings?.[0]?.maxBitrate <= 420000; }));
  await page.evaluate(() => W.join('p5', false));
  await new Promise((r) => setTimeout(r, 4000));
  check(`cap: a 5th person is not connected (max ${4})`, await page.evaluate(() => W.connected('p5').length === 0 && ['p1', 'p2', 'p3', 'p4'].every((id) => !W.connected(id).includes('p5'))));
  await page.evaluate(() => { W.engines.p5.hangup(); W.engines.p3.hangup(); });
  check('mesh: someone leaves, the rest stay connected', await waitFor(() => ['p1', 'p2', 'p4'].every((id) => W.connected(id).length === 2 && !W.connected(id).includes('p3')), [], 15000));
  await page.evaluate(() => W.hangAll());

  // ---------- signaling hygiene ----------
  const junk = await page.evaluate(async () => {
    W.bus = new H.MemoryBus();
    const local = await navigator.mediaDevices.getUserMedia({ audio: true });
    let views = [];
    const allowed = new Set(['friend']);
    const e = new H.CallEngine({ callId: 'c2', me: 'me', transport: W.bus.transport(), iceServers: [], local, maxPeople: 4, allowed: () => allowed, onUpdate: (v) => { views = v; } });
    e.start();
    const t = W.bus.transport();
    t.send({ v: 1, call: 'c2', from: 'stranger', sid: 'x', t: 'hello' });            // not a participant
    t.send({ v: 1, call: 'other-call', from: 'friend', sid: 'x', t: 'hello' });      // wrong call
    t.send({ v: 1, call: 'c2', from: 'friend', sid: 'x', t: 'offer', sdp: 'nope' }); // malformed SDP
    await new Promise((r) => setTimeout(r, 600));
    const n = views.length;
    e.hangup(); local.getTracks().forEach((x) => x.stop());
    return n;
  });
  check('signals from non-participants, other calls or with bad SDP are ignored', junk === 0, junk);
} finally {
  await browser.close(); srv.close(); turn?.kill();
}
if (failed) { console.error(`\n${failed} FAILED`); process.exit(1); }
console.log('\nALL CALL ENGINE (WEBRTC) CHECKS PASSED');
