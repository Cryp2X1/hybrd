// Headless checks for the Spotify features, with Spotify's accounts + Web API mocked in-page (no real calls).
// Uses http://127.0.0.1 because Spotify rejects "localhost" redirect URIs.
import puppeteer from 'puppeteer-core';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
const BASE = 'http://127.0.0.1:4173/hybrd/';
const OUT = new URL('../screenshots/', import.meta.url).pathname;
const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CID = '0123456789abcdef0123456789abcdef';
const ART = readFileSync(new URL('../public/icons/apple-touch-icon.png', import.meta.url));
const b64url = (b) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function makeMock() {
  const TR = (n, i) => ({ name: n, uri: `spotify:track:t${i}`, duration_ms: 200000 + i * 1000, artists: [{ name: ['Kendrick Lamar', 'Dua Lipa', 'The Prodigy'][i % 3] }], album: { name: `Album ${i}`, images: [{ url: 'https://i.scdn.co/image/test640', width: 640 }, { url: 'https://i.scdn.co/image/test300', width: 300 }] } });
  const tracks = [TR('Not Like Us', 0), TR('Training Season', 1), TR('Firestarter', 2)];
  const m = {
    challenge: '', scope: '', authorized: 0, tokenOk: false, refreshes: 0, premium: true, allowlisted: true, volumes: [], calls: [],
    devices: [], active: null, playing: false, idx: 0, context: null,
    phoneOpens() { this.devices = [{ id: 'dev-phone', name: 'José’s iPhone', type: 'Smartphone', is_active: false, is_restricted: false, supports_volume: false, volume_percent: null }, { id: 'dev-mac', name: 'MacBook Pro', type: 'Computer', is_active: false, is_restricted: false, supports_volume: true, volume_percent: 70 }]; },
    dev(id) { return this.devices.find((d) => d.id === id); },
    handle(method, url, auth, body) {
      const u = new URL(url); const p = u.pathname.replace(/^\/v1/, ''); this.calls.push(`${method} ${p}${u.search}`);
      const J = (status, obj) => ({ status, body: obj == null ? '' : JSON.stringify(obj) });
      if (u.host === 'accounts.spotify.com' && p === '/api/token') {
        const q = new URLSearchParams(body);
        if (q.get('client_id') !== CID) return J(400, { error: 'invalid_client' });
        if (q.get('grant_type') === 'authorization_code') {
          const ok = q.get('code') === 'TESTCODE' && q.get('redirect_uri') === BASE && b64url(createHash('sha256').update(q.get('code_verifier') || '').digest()) === this.challenge;
          if (!ok) return J(400, { error: 'invalid_grant', error_description: 'code_verifier mismatch' });
          this.tokenOk = true;
          return J(200, { access_token: 'AT1', token_type: 'Bearer', expires_in: 3600, refresh_token: 'RT1', scope: this.scope });
        }
        if (q.get('grant_type') === 'refresh_token' && q.get('refresh_token') === 'RT1') { this.refreshes++; return J(200, { access_token: 'AT1', token_type: 'Bearer', expires_in: 3600, scope: this.scope }); }
        return J(400, { error: 'invalid_grant' });
      }
      if (auth !== 'Bearer AT1') return J(401, { error: { status: 401, message: 'Invalid access token' } });
      if (!this.allowlisted) return J(403, { error: { status: 403, message: 'Check settings on developer.spotify.com/dashboard, the user may not be registered.' } });
      const a = this.active && this.dev(this.active);
      const state = () => ({ is_playing: this.playing, progress_ms: 42000, item: tracks[this.idx], device: { ...a, is_active: true }, context: this.context ? { uri: this.context } : null, shuffle_state: false, repeat_state: 'off' });
      if (method === 'GET' && p === '/me') return J(200, { id: 'jose', display_name: 'José' });
      if (method === 'GET' && p === '/me/playlists') return J(200, { items: [{ id: 'pl1', name: 'HYROX Race Day', uri: 'spotify:playlist:pl1', images: [{ url: 'https://i.scdn.co/image/test300' }], owner: { display_name: 'José' }, items: { total: 42 } }, { id: 'pl2', name: 'Long Run Sunday', uri: 'spotify:playlist:pl2', images: [], owner: { display_name: 'José' }, items: { total: 88 } }], total: 2 });
      if (method === 'GET' && p === '/me/player') return a ? J(200, state()) : J(204);
      if (method === 'GET' && p === '/me/player/devices') return J(200, { devices: this.devices.map((d) => ({ ...d, is_active: d.id === this.active })) });
      if (p.startsWith('/me/player') && !this.premium) return J(403, { error: { status: 403, message: 'Player command failed: Premium required', reason: 'PREMIUM_REQUIRED' } });
      const did = u.searchParams.get('device_id');
      if (method === 'PUT' && p === '/me/player') { const b = JSON.parse(body || '{}'); if (!this.dev(b.device_ids?.[0])) return J(404, { error: { status: 404, message: 'Device not found' } }); this.active = b.device_ids[0]; if (b.play) this.playing = true; return J(204); }
      if (method === 'PUT' && p === '/me/player/volume') { if (!a) return J(404, { error: { status: 404, message: 'No active device found', reason: 'NO_ACTIVE_DEVICE' } }); const v = +u.searchParams.get('volume_percent'); this.volumes.push(v); a.volume_percent = v; return J(204); }
      if (did) { if (!this.dev(did)) return J(404, { error: { status: 404, message: 'Device not found' } }); this.active = did; }
      if (!this.active) return J(404, { error: { status: 404, message: 'Player command failed: No active device found', reason: 'NO_ACTIVE_DEVICE' } });
      if (method === 'PUT' && p === '/me/player/play') { const b = body ? JSON.parse(body) : {}; if (b.context_uri) { this.context = b.context_uri; this.idx = 0; } this.playing = true; return J(204); }
      if (method === 'PUT' && p === '/me/player/pause') { this.playing = false; return J(204); }
      if (method === 'POST' && p === '/me/player/next') { this.idx = (this.idx + 1) % tracks.length; return J(204); }
      if (method === 'POST' && p === '/me/player/previous') { this.idx = (this.idx + tracks.length - 1) % tracks.length; return J(204); }
      return J(404, { error: { status: 404, message: `mock: no route ${method} ${p}` } });
    },
  };
  return m;
}

async function session(browser, kind, mock, { clientIdInConfig = false } = {}) {
  const phone = kind === 'phone';
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport(phone ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width: 1440, height: 900, deviceScaleFactor: 1 });
  if (phone) await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1');
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${kind}] console.${m.type()}: ${m.text()} @ ${page.url()}`); });
  page.on('pageerror', (e) => errors.push(`[${kind}] pageerror: ${e.message} @ ${page.url()}`));
  page.on('response', (r) => { const u = r.url(); if (r.status() >= 400 && u.startsWith('http://127.0.0.1')) errors.push(`[${kind}] HTTP ${r.status()}: ${u}`); });
  await page.exposeFunction('__spMock', (method, url, auth, body) => mock.handle(method, url, auth, body));
  await page.evaluateOnNewDocument((cfgCid) => {
    if (cfgCid) { Object.defineProperty(window, 'HYBRD_CONFIG', { configurable: true, set(v) { this.__c = { ...v, spotifyClientId: cfgCid }; }, get() { return this.__c; } }); }
    const of = window.fetch.bind(window);
    window.fetch = async (input, init = {}) => {
      const url = typeof input === 'string' ? input : input.url;
      if (/^https:\/\/(api|accounts)\.spotify\.com\//.test(url)) {
        const r = await window.__spMock(init.method || 'GET', url, (init.headers && init.headers.Authorization) || '', init.body ? String(init.body) : '');
        return new Response(r.status === 204 ? null : r.body, { status: r.status, headers: { 'Content-Type': 'application/json' } });
      }
      return of(input, init);
    };
  }, clientIdInConfig ? CID : '');
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const u = req.url();
    if (u.startsWith('https://accounts.spotify.com/authorize')) {
      const q = new URL(u).searchParams;
      const ok = q.get('client_id') === CID && q.get('response_type') === 'code' && q.get('code_challenge_method') === 'S256' && q.get('redirect_uri') === BASE && q.get('code_challenge')?.length === 43;
      if (!ok) errors.push(`[${kind}] spotify: bad authorize params ${u}`);
      mock.challenge = q.get('code_challenge'); mock.scope = q.get('scope'); mock.authorized++;
      const back = `${q.get('redirect_uri')}?code=TESTCODE&state=${encodeURIComponent(q.get('state'))}`;
      return req.respond({ status: 200, contentType: 'text/html', body: `<!doctype html><title>Spotify (mock)</title><script>location.replace(${JSON.stringify(back)})</script>` });
    }
    if (u.startsWith('https://i.scdn.co/image/')) return req.respond({ status: 200, contentType: 'image/png', body: ART });
    req.continue();
  });
  const clickText = async (txt, sel = 'button, a, summary') => {
    const ok = await page.evaluate((t, s) => { const el = [...document.querySelectorAll(s)].find((e) => e.textContent.trim().includes(t) && e.offsetParent !== null); if (el) { el.click(); return true; } return false; }, txt, sel);
    if (!ok) throw new Error(`[${kind}] no element with text ${txt} @ ${page.url()}`);
    await sleep(400);
  };
  const go = async (p, w = 900) => { await page.evaluate((x) => { history.pushState({}, '', x); dispatchEvent(new PopStateEvent('popstate')); }, '/hybrd' + p); await sleep(w); };
  const text = (sel) => page.evaluate((s) => document.querySelector(s)?.textContent || '', sel);
  const has = (t) => page.evaluate((t) => document.body.textContent.includes(t), t);
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.evaluate((() => ['agree-terms', 'consent-location', 'consent-health'].forEach((t) => { const el = document.querySelector(`[data-testid="${t}"]`); if (el && !el.checked) el.click(); }))); await clickText('Get started'); for (let i = 0; i < 4; i++) await clickText('Continue');
  await clickText('Start training'); await sleep(600);
  return { ctx, page, clickText, go, text, has, phone };
}
const check = (kind, cond, msg) => { if (!cond) errors.push(`[${kind}] ${msg}`); else console.log(kind, 'ok:', msg); };
const scrollTo = (page, sel) => page.evaluate((s) => { const el = document.querySelector(s); if (el) { el.scrollIntoView({ block: 'start' }); window.scrollBy(0, -12); } return !!el; }, sel);

async function run(kind) {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-gpu', '--autoplay-policy=no-user-gesture-required'] });
  // ---------- 1. Not connected: public workout playlists (real Spotify embeds) ----------
  {
    const mock = makeMock();
    const s = await session(browser, kind, mock);
    await s.go('/me', 1200);
    check(kind, await s.has('Spotify not set up yet'), 'Me shows “not set up” with no Client ID');
    await scrollTo(s.page, '.sp-cta');
    await s.page.waitForSelector('iframe.sp-embed'); await sleep(5000);
    const src = await s.page.$eval('iframe.sp-embed', (f) => f.src);
    check(kind, src.startsWith('https://open.spotify.com/embed/playlist/37i9dQZF1DX35oM5SPECmN'), `embed iframe src ${src}`);
    const fr = s.page.frames().find((f) => f.url().includes('open.spotify.com/embed'));
    const title = fr ? await fr.evaluate(() => document.body.innerText.slice(0, 200)).catch(() => '') : '';
    check(kind, /Run Wild/.test(title), `embed rendered (“${title.split('\n').slice(0, 2).join(' | ')}”)`);
    await s.clickText('Lifting', '.sp-workout button'); await sleep(3500);
    check(kind, (await s.page.$eval('iframe.sp-embed', (f) => f.src)).includes('37i9dQZF1DX76Wlfdnj7AP'), 'Lifting → Beast Mode embed');
    await s.clickText('Running', '.sp-workout button'); await sleep(4000);
    if (kind === 'phone') { await s.page.screenshot({ path: `${OUT}${kind}-workout-playlists.png` }); console.log('shot', kind, 'workout-playlists'); }
    // Music button on Record / Timers / Logger opens the same panel
    for (const p of ['/record', '/timers', '/train/log']) {
      await s.go(p, 900);
      const btn = await s.page.$('[data-testid="music-btn"]');
      check(kind, !!btn, `Music button on ${p}`);
      if (btn) { await btn.click(); await sleep(500); check(kind, !!(await s.page.$('.sheet [data-testid="music-panel"]')), `Music sheet opens on ${p}`); await s.page.keyboard.press('Escape'); await sleep(200); }
    }
    await s.ctx.close();
  }
  // ---------- 2. Connect via PKCE (Client ID typed in Me), Connect device flow, controls, playlists, ducking ----------
  {
    const mock = makeMock();
    const s = await session(browser, kind, mock);
    await s.go('/me#music', 1200);
    check(kind, (await s.text('[data-testid="sp-redirect"]')) === BASE, `redirect URI shown = ${BASE}`);
    await s.page.type('input[aria-label="Spotify Client ID"]', 'not-an-id'); await s.clickText('Save', '.sp-settings button');
    check(kind, await s.has('32 letters/numbers'), 'invalid Client ID rejected');
    await s.page.$eval('input[aria-label="Spotify Client ID"]', (i) => { i.value = ''; });
    await s.page.click('input[aria-label="Spotify Client ID"]', { clickCount: 3 }); await s.page.keyboard.press('Backspace');
    await s.page.type('input[aria-label="Spotify Client ID"]', CID); await s.clickText('Save', '.sp-settings button');
    await Promise.all([s.page.waitForNavigation({ waitUntil: 'networkidle0' }).then(() => s.page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {})), s.clickText('Connect Spotify', '.sp-settings button')]);
    await sleep(1500);
    const url = s.page.url();
    check(kind, mock.authorized === 1 && mock.tokenOk, 'PKCE: code exchanged with a verifier matching the S256 challenge');
    check(kind, mock.scope === 'user-read-playback-state user-modify-playback-state user-read-currently-playing playlist-read-private', `minimal scopes (${mock.scope})`);
    check(kind, !url.includes('code=') && !url.includes('state=') && url.includes('/hybrd/me'), `callback cleaned and returned to Me (${url})`);
    const tok = await s.page.evaluate(() => JSON.parse(localStorage.getItem('hybrd:sp-tok') || 'null'));
    check(kind, tok?.access === 'AT1' && tok?.refresh === 'RT1', 'tokens stored in localStorage');
    check(kind, await s.has('Spotify connected · José'), 'shows connected as José');
    // play with no device → clear "open Spotify on this phone first"
    await s.clickText('', '[data-testid="sp-player"] .sp-pp'); await sleep(900);
    const noDev = s.phone ? 'Open Spotify on this phone first' : 'No Spotify device is open';
    check(kind, await s.has(noDev), `no device → “${noDev}”`);
    // user opens Spotify on the phone, refreshes devices, plays → HYBRD wakes the phone (Spotify Connect)
    mock.phoneOpens();
    await s.clickText('Refresh devices', '.banner button'); await sleep(700);
    check(kind, await s.has('José’s iPhone'), 'device list shows the phone');
    await s.clickText('', '[data-testid="sp-player"] .sp-pp'); await sleep(1400);
    check(kind, mock.active === (s.phone ? 'dev-phone' : 'dev-mac') && mock.playing, `play woke ${mock.active}`);
    check(kind, (await s.text('[data-testid="sp-title"]')) === 'Not Like Us', 'mini player shows the current track');
    await s.clickText('', 'button[aria-label="Next track"]'); await sleep(1100);
    check(kind, (await s.text('[data-testid="sp-title"]')) === 'Training Season', 'next track');
    await s.clickText('', 'button[aria-label="Previous track"]'); await sleep(1100);
    check(kind, (await s.text('[data-testid="sp-title"]')) === 'Not Like Us', 'previous track');
    await s.clickText('', 'button[aria-label="Pause"]'); await sleep(1100);
    check(kind, !mock.playing && !!(await s.page.$('button[aria-label="Play"]')), 'pause');
    await s.clickText('Your playlists'); await sleep(800);
    check(kind, await s.has('HYROX Race Day') && await s.has('42 tracks'), 'your playlists listed (new “items” field)');
    await s.clickText('', 'button[aria-label="Play HYROX Race Day"]'); await sleep(1100);
    check(kind, mock.context === 'spotify:playlist:pl1' && mock.playing, 'start a playlist');
    // switch device to the Mac (supports remote volume) for the ducking test
    await s.clickText('MacBook Pro', '.sp-dev-row'); await sleep(1600);
    check(kind, mock.active === 'dev-mac', 'transfer playback to another device');
    if (kind === 'phone') { await scrollTo(s.page, '.music-card'); await sleep(600); await s.page.screenshot({ path: `${OUT}${kind}-music-connect.png` }); console.log('shot', kind, 'music-connect'); }
    // voice cue → Spotify ducked to 30 % and restored
    await s.page.evaluate(() => [...document.querySelectorAll('button.toggle')].find((b) => b.textContent.includes('Voice cues'))?.click()); await sleep(300);
    await s.go('/timers', 900);
    await s.clickText('Intervals', '[role="tab"]');
    await s.clickText('Start', 'button'); await sleep(1500);
    for (let i = 0; i < 30 && mock.volumes.length < 2; i++) await sleep(500);
    check(kind, mock.volumes[0] === 21 && mock.volumes[1] === 70, `voice cue ducks Spotify (volumes ${JSON.stringify(mock.volumes)})`);
    await s.clickText('', 'button[aria-label="Pause"], .timer-ctrls button').catch(() => {});
    // Record screen with the music sheet
    await s.go('/record', 1000);
    await s.page.click('[data-testid="music-btn"]'); await sleep(1500);
    check(kind, (await s.text('.sheet [data-testid="sp-title"]')) !== '', 'Record › Music shows the player');
    if (kind === 'phone') { await s.page.screenshot({ path: `${OUT}${kind}-record-music.png` }); console.log('shot', kind, 'record-music'); }
    await s.page.keyboard.press('Escape');
    // token refresh: expire the token and make a call
    await s.page.evaluate(() => { const t = JSON.parse(localStorage.getItem('hybrd:sp-tok')); t.exp = 0; localStorage.setItem('hybrd:sp-tok', JSON.stringify(t)); });
    await s.page.reload({ waitUntil: 'networkidle0' }); await s.go('/me#music', 1800);
    check(kind, mock.refreshes >= 1 && await s.has('Spotify connected'), `expired token refreshed (${mock.refreshes})`);
    // desktop: "Play in this browser" asks for the SDK scopes once (re-consent)
    if (!s.phone) {
      await Promise.all([s.page.waitForNavigation({ waitUntil: 'networkidle0' }).then(() => s.page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {})), s.clickText('Play in this browser')]);
      await sleep(1200);
      check(kind, mock.authorized === 2 && /streaming user-read-email user-read-private/.test(mock.scope), `browser player asks for SDK scopes (${mock.scope})`);
    } else check(kind, !(await s.has('Play in this browser')), 'phone: no in-browser player offered (controls the Spotify app)');
    await s.clickText('Disconnect Spotify'); await sleep(300);
    check(kind, !(await s.page.evaluate(() => localStorage.getItem('hybrd:sp-tok'))) && await s.has('Spotify not connected'), 'disconnect deletes tokens');
    await s.ctx.close();
  }
  // ---------- 3. Free account (no Premium) and a user not on the allowlist ----------
  {
    const mock = makeMock(); mock.premium = false; mock.phoneOpens(); mock.active = 'dev-phone';
    const s = await session(browser, kind, mock, { clientIdInConfig: true });
    await s.go('/me#music', 900);
    check(kind, await s.has('Client ID is set in config.js'), 'Client ID from config.js');
    await Promise.all([s.page.waitForNavigation({ waitUntil: 'networkidle0' }).then(() => s.page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {})), s.clickText('Connect Spotify', '.sp-settings button')]);
    await sleep(1200);
    await s.clickText('', '[data-testid="sp-player"] .sp-pp'); await sleep(900);
    check(kind, await s.has('Spotify Premium needed'), 'free account → “Spotify Premium needed”');
    mock.allowlisted = false;
    await s.page.reload({ waitUntil: 'networkidle0' }); await s.go('/me#music', 1500);
    check(kind, await s.has('Not on the app’s user list'), 'not allow-listed → explains User Management');
    await s.ctx.close();
  }
  await browser.close();
}
await run('phone');
await run('desktop');
console.log('\nERRORS:', errors.length); errors.forEach((e) => console.log(e));
