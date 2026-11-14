// Headless checks for Devices & sync: fake Web Bluetooth HR strap, watch-file import (GPX/TCX/FIT samples),
// and Strava with the token function + API mocked in-page (no real Strava calls, no keys).
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const BASE = 'http://127.0.0.1:4173/hybrd/';
const OUT = new URL('../screenshots/', import.meta.url).pathname;
const FN = 'https://fn.test/functions/v1/strava-token';
const errors = [];
const thirdParty = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const HOME = [30.2672, -97.7431];
const check = (kind, cond, msg) => { if (!cond) errors.push(`[${kind}] FAIL ${msg}`); else console.log(kind, 'ok:', msg); };

function encPoly(pts) { let out = '', pl = 0, pg = 0; const e = (v) => { v = v < 0 ? ~(v << 1) : v << 1; let s = ''; while (v >= 0x20) { s += String.fromCharCode((0x20 | (v & 0x1f)) + 63); v >>= 5; } return s + String.fromCharCode(v + 63); }; for (const [a, b] of pts) { const la = Math.round(a * 1e5), lo = Math.round(b * 1e5); out += e(la - pl) + e(lo - pg); pl = la; pg = lo; } return out; }

function stravaMock() {
  const now = Date.now();
  const ride = Array.from({ length: 60 }, (_, i) => [HOME[0] + 0.0004 * i, HOME[1] - 0.0003 * i]);
  const iso = (ms) => new Date(ms).toISOString().replace(/\.\d+Z$/, 'Z');
  const m = {
    calls: [], exchanged: 0, revoked: 0, refreshes: 0,
    acts: [
      // same start + duration as public/samples/hybrd-sample-run.gpx → must be hidden as a duplicate once that file is imported
      { id: 9001, name: 'Zilker Loop (Strava copy)', sport_type: 'Run', type: 'Run', start_date: '2026-11-07T13:10:00Z', moving_time: 1650, elapsed_time: 1650, distance: 5000, total_elevation_gain: 12, average_heartrate: 143, max_heartrate: 157, has_heartrate: true, map: { summary_polyline: encPoly(ride.slice(0, 20)) } },
      { id: 9002, name: 'Sunday Ride', sport_type: 'Ride', type: 'Ride', start_date: iso(now - 2 * 86400e3), moving_time: 3600, elapsed_time: 3800, distance: 28500, total_elevation_gain: 140, average_heartrate: 138, max_heartrate: 171, has_heartrate: true, average_cadence: 86, device_name: 'Garmin Edge 840', map: { summary_polyline: encPoly(ride) } },
      { id: 9003, name: 'Gym strength', sport_type: 'WeightTraining', type: 'WeightTraining', start_date: iso(now - 3 * 86400e3), moving_time: 2700, elapsed_time: 2700, distance: 0, map: { summary_polyline: '' } },
    ],
    fn(body, origin) {
      const b = JSON.parse(body || '{}'); this.calls.push(`fn ${b.action}`);
      if (b.action === 'exchange') { if (b.code !== 'STRAVACODE') return [400, { error: 'invalid code' }]; this.exchanged++; return [200, { access_token: 'SAT1', refresh_token: 'SRT1', expires_at: Math.floor(Date.now() / 1000) + 21600, scope: 'read,activity:read_all', athlete: { id: 4242, firstname: 'José' } }]; }
      if (b.action === 'refresh') { this.refreshes++; return [200, { access_token: 'SAT1', refresh_token: 'SRT2', expires_at: Math.floor(Date.now() / 1000) + 21600 }]; }
      if (b.action === 'revoke') { this.revoked++; return [200, { revoked: true }]; }
      return [400, { error: 'bad action' }];
    },
    api(url, auth) {
      const u = new URL(url); const p = u.pathname.replace('/api/v3', ''); this.calls.push(`GET ${p}${u.search}`);
      if (auth !== 'Bearer SAT1') return [401, { message: 'Authorization Error' }];
      if (p === '/athlete/activities') return [200, u.searchParams.get('page') === '1' ? this.acts.filter((a) => Date.parse(a.start_date) / 1000 > +u.searchParams.get('after')) : []];
      const mm = p.match(/^\/activities\/(\d+)(\/streams)?$/);
      const a = mm && this.acts.find((x) => x.id === +mm[1]);
      if (!a) return [404, { message: 'Record Not Found' }];
      if (!mm[2]) return [200, { ...a, calories: a.id === 9002 ? 742 : undefined }];
      const n = 120, t = Array.from({ length: n }, (_, i) => i * 30);
      return [200, { time: { data: t }, latlng: { data: t.map((_, i) => [HOME[0] + 0.0002 * i, HOME[1] - 0.00015 * i]) }, altitude: { data: t.map((_, i) => 150 + 10 * Math.sin(i / 10)) }, heartrate: { data: t.map((_, i) => 120 + Math.round(40 * Math.sin(i / 30) ** 2)) }, distance: { data: t.map((_, i) => i * 237.5) }, moving: { data: t.map(() => true) } }];
    },
  };
  return m;
}

async function run(kind) {
  const phone = kind === 'phone';
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  const ctx = await browser.createBrowserContext();
  await ctx.overridePermissions('http://127.0.0.1:4173', ['geolocation']);
  const page = await ctx.newPage();
  await page.emulateTimezone('America/Chicago');
  await page.setGeolocation({ latitude: HOME[0], longitude: HOME[1], accuracy: 10 });
  await page.setViewport(phone ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width: 1440, height: 900, deviceScaleFactor: 1 });
  if (phone) await page.setUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36');
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${kind}] console.${m.type()}: ${m.text()} @ ${page.url()}`); });
  page.on('pageerror', (e) => errors.push(`[${kind}] pageerror: ${e.message} @ ${page.url()}`));
  page.on('response', (r) => { const u = r.url(); if (r.status() >= 400 && u.startsWith('http://127.0.0.1')) errors.push(`[${kind}] HTTP ${r.status()}: ${u}`); });
  page.on('requestfailed', (r) => { const u = r.url(); if (u.includes('openstreetmap')) return; if (r.frame() && r.frame() !== page.mainFrame() && !u.startsWith('http://127.0.0.1')) { thirdParty.push(`[${kind}] inside third-party iframe: ${u} ${r.failure()?.errorText}`); return; } errors.push(`[${kind}] requestfailed: ${u} ${r.failure()?.errorText}`); });
  page.on('dialog', (d) => d.accept());
  const mock = stravaMock();
  await page.exposeFunction('__stFn', (body, origin) => mock.fn(body, origin));
  await page.exposeFunction('__stApi', (url, auth) => mock.api(url, auth));
  await page.evaluateOnNewDocument((FN) => {
    // ---- fake Web Bluetooth heart-rate strap (0x180D / 0x2A37) ----
    const bt = { connects: 0, bpm: 118 };
    window.__bt = bt;
    const mkVal = (bpm, u16) => { const b = new DataView(new ArrayBuffer(u16 ? 7 : 6)); if (u16) { b.setUint8(0, 0x17); b.setUint16(1, bpm, true); b.setUint16(3, 820, true); b.setUint16(5, 830, true); } else { b.setUint8(0, 0x16); b.setUint8(1, bpm); b.setUint16(2, 820, true); b.setUint16(4, 830, true); } return b; };
    class Char extends EventTarget { constructor() { super(); this.value = null; } async startNotifications() { clearInterval(bt.timer); let i = 0; bt.timer = setInterval(() => { if (!dev.gatt.connected) return; i++; bt.bpm = Math.min(168, bt.bpm + (i % 3 === 0 ? 2 : 1)); this.value = mkVal(bt.bpm, i % 5 === 0); this.dispatchEvent(new Event('characteristicvaluechanged')); }, 1000); return this; } async readValue() { const v = new DataView(new ArrayBuffer(1)); v.setUint8(0, 87); return v; } }
    const ch = new Char();
    const server = { async getPrimaryService(s) { if (s === 'heart_rate') return { async getCharacteristic() { return ch; } }; if (s === 'battery_service') return { async getCharacteristic() { return ch; } }; throw new DOMException('no service', 'NotFoundError'); } };
    const dev = Object.assign(new EventTarget(), { name: 'Polar H10 TEST', gatt: { connected: false, async connect() { bt.connects++; if (bt.failNext) { bt.failNext--; throw new DOMException('fail', 'NetworkError'); } this.connected = true; return server; }, disconnect() { this.connected = false; dev.dispatchEvent(new Event('gattserverdisconnected')); } } });
    bt.drop = () => { dev.gatt.connected = false; dev.dispatchEvent(new Event('gattserverdisconnected')); };
    if (!window.__noBt) Object.defineProperty(Navigator.prototype, 'bluetooth', { configurable: true, get: () => ({ async requestDevice(o) { bt.req = o; return dev; } }) });
    // ---- Strava token function + API (mocked) ----
    const of = window.fetch.bind(window);
    window.fetch = async (input, init = {}) => {
      const url = typeof input === 'string' ? input : input.url;
      const J = ([s, b]) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json', 'X-ReadRateLimit-Usage': '3,12', 'X-ReadRateLimit-Limit': '100,1000' } });
      if (url === FN) return J(await window.__stFn(String(init.body || ''), location.origin));
      if (url.startsWith('https://www.strava.com/api/v3/')) return J(await window.__stApi(url, (init.headers && init.headers.Authorization) || ''));
      if (url.startsWith('https://www.strava.com/oauth/deauthorize')) return J([200, {}]);
      return of(input, init);
    };
  }, FN);
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const u = req.url();
    if (u.startsWith('https://www.strava.com/oauth/authorize')) {
      const q = new URL(u).searchParams;
      const ok = q.get('client_id') === '123456' && q.get('response_type') === 'code' && q.get('redirect_uri') === BASE && q.get('scope') === 'read,activity:read_all' && q.get('state')?.length === 32;
      check(kind, ok, `Strava authorize params (${u.slice(0, 140)}…)`);
      const back = `${BASE}?state=${q.get('state')}&code=STRAVACODE&scope=read,activity:read_all`;
      return req.respond({ status: 200, contentType: 'text/html', body: `<!doctype html><title>Strava (mock)</title><script>location.replace(${JSON.stringify(back)})</script>` });
    }
    req.continue();
  });
  const clickText = async (txt, sel = 'button, a, summary, label') => {
    const ok = await page.evaluate((t, s) => { const el = [...document.querySelectorAll(s)].find((e) => e.textContent.trim().includes(t) && e.offsetParent !== null); if (el) { el.click(); return true; } return false; }, txt, sel);
    if (!ok) throw new Error(`[${kind}] no element with text ${txt} @ ${page.url()}`);
    await sleep(400);
  };
  const go = async (p, w = 900) => { await page.evaluate((x) => { history.pushState({}, '', x); dispatchEvent(new PopStateEvent('popstate')); }, '/hybrd' + p); await sleep(w); };
  const text = (sel) => page.evaluate((s) => document.querySelector(s)?.textContent || '', sel);
  const all = (sel) => page.evaluate((s) => [...document.querySelectorAll(s)].map((e) => e.textContent), sel);
  const has = (t) => page.evaluate((t) => document.body.textContent.includes(t), t);
  const shot = async (name) => { await sleep(600); await page.screenshot({ path: `${OUT}${kind}-${name}.png` }); console.log('shot', kind, name); };
  const scrollTo = (sel) => page.evaluate((s) => { const el = document.querySelector(s); if (el) { el.scrollIntoView({ block: 'start' }); window.scrollBy(0, -12); } return !!el; }, sel);

  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await clickText('Get started'); for (let i = 0; i < 4; i++) await clickText('Continue');
  await clickText('Start training'); await sleep(600);

  // ---------- Me: Devices link + Max HR ----------
  await go('/me');
  check(kind, await has('Devices & sync'), 'Me has “Devices & sync” row');
  check(kind, !!(await page.$('input[aria-label="Max heart rate"]')), 'Me has Max HR field');

  // ---------- Devices: HR strap ----------
  await go('/me/devices');
  check(kind, !!(await page.$('[data-testid="strava-setup-needed"]')), 'Strava shows “setup needed” when not configured');
  await clickText('Connect heart-rate sensor');
  await sleep(3500);
  const req = await page.evaluate(() => window.__bt.req);
  check(kind, JSON.stringify(req) === JSON.stringify({ filters: [{ services: ['heart_rate'] }], optionalServices: ['battery_service'] }), `requestDevice filters ${JSON.stringify(req)}`);
  const bpm1 = parseInt(await text('[data-testid="hr-bpm"]'), 10);
  check(kind, bpm1 >= 118 && bpm1 <= 130, `live BPM shown (${bpm1})`);
  check(kind, /battery 87%/.test(await text('[data-testid="hr-status"]')), 'battery level read (87%)');
  check(kind, await has('Zone '), 'zone shown');
  // drop the connection: auto-reconnect (first retry fails, second succeeds)
  await page.evaluate(() => { window.__bt.failNext = 1; window.__bt.drop(); });
  await sleep(300);
  const st1 = await text('[data-testid="hr-status"]');
  check(kind, /reconnect/i.test(st1), `shows reconnecting after drop (“${st1}”)`);
  await sleep(4500);
  const st2 = await text('[data-testid="hr-status"]'); const conns = await page.evaluate(() => window.__bt.connects);
  check(kind, !/reconnect/i.test(st2) && conns >= 3 && parseInt(await text('[data-testid="hr-bpm"]'), 10) > 0, `auto-reconnected after a failed retry (connects=${conns}, “${st2}”)`);
  if (phone) { await page.evaluate(() => window.scrollTo(0, 0)); await shot('devices'); }

  // ---------- HR on Timers + Logger ----------
  for (const p of ['/timers', '/train/log']) {
    await go(p, 1200);
    const b = await text('[data-testid="hr-btn"]');
    check(kind, /\d{2,3}/.test(b), `HR button with live BPM on ${p} (“${b}”)`);
    check(kind, !!(await page.$('[data-testid="hr-live"]')), `live HR tile on ${p}`);
  }
  await page.evaluate(() => localStorage.removeItem('hybrd:draft'));

  // ---------- Record with HR → saved with chart, avg/max, HR calories ----------
  await go('/record', 1000);
  check(kind, !!(await page.$('[data-testid="hr-panel"]')), 'Record idle shows heart-rate card');
  const cdp = await page.createCDPSession();
  let lat = HOME[0] + 0.004, lng = HOME[1] - 0.003;
  await cdp.send('Emulation.setGeolocationOverride', { latitude: lat, longitude: lng, accuracy: 6 });
  await clickText('Start Run');
  for (let i = 0; i < 44; i++) { lat += 0.00003; lng += 0.000015; await cdp.send('Emulation.setGeolocationOverride', { latitude: lat, longitude: lng, accuracy: 6 }); await sleep(500); }
  check(kind, !!(await page.$('[data-testid="hr-live"]')), 'Record live shows HR tile');
  check(kind, await has('kcal est. · HR'), 'live kcal uses HR');
  const lk = await page.evaluate(() => [...document.querySelectorAll('.stat')].find((e) => /kcal/.test(e.textContent))?.querySelector('.stat-v')?.textContent || '');
  check(kind, /^~\d+$/.test(lk) && parseInt(lk.slice(1), 10) > 0, `live HR kcal positive (${lk})`);
  const el = await page.evaluate(() => document.body.innerText.match(/\d+:\d\d/)?.[0]);
  check(kind, el && el !== '0:00', `run clock moving (${el})`);
  if (phone) await shot('record-hr');
  await page.$eval('button[aria-label="Hold to finish"]', (b) => b.scrollIntoView({ block: 'center' })); await sleep(300);
  const box = await (await page.$('button[aria-label="Hold to finish"]')).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await sleep(1300); await page.mouse.up(); await sleep(500);
  await clickText('Save activity'); await sleep(1500);
  check(kind, !!(await page.$('[data-testid="hr-summary"]')), 'saved run shows HR summary + chart');
  const sum = await text('[data-testid="hr-summary"]');
  console.log(kind, 'HR summary:', sum.slice(0, 120));
  check(kind, await has('Calories estimated from heart rate'), 'saved run uses HR (Keytel) calories');
  check(kind, !!(await page.$('[data-testid="hr-summary"] svg')), 'HR chart rendered');
  await go('/me/devices'); await clickText('Disconnect'); await sleep(300);

  // ---------- Watch-file import ----------
  await go('/me/import', 900);
  await clickText('GPX · 5 km run'); await sleep(1500);
  // FIT via the file input
  const input = await page.$('[data-testid="file-input"]');
  await input.uploadFile(new URL('../public/samples/hybrd-sample-ride.fit', import.meta.url).pathname); await sleep(2500);
  // TCX via drag & drop
  await page.evaluate(async () => { const b = await (await fetch('/hybrd/samples/hybrd-sample-intervals.tcx')).blob(); const dt = new DataTransfer(); dt.items.add(new File([b], 'hybrd-sample-intervals.tcx')); window.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, cancelable: true })); window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, cancelable: true })); });
  await sleep(1500);
  // same file again → ignored; a broken file → error card
  await clickText('GPX · 5 km run'); await sleep(1000);
  await page.evaluate(() => { const dt = new DataTransfer(); dt.items.add(new File(['hello, not a track'], 'notes.gpx')); window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, cancelable: true })); });
  await sleep(800);
  const cards = await all('[data-testid="imp-card"]');
  check(kind, cards.length === 3, `3 previews, same file not added twice (${cards.length})`);
  check(kind, (await all('[data-testid="imp-error"]')).length === 1, 'broken file shows an error card');
  for (const c of cards) console.log(kind, 'preview:', c.replace(/\s+/g, ' ').slice(0, 220));
  const gpx = cards.find((c) => c.includes('GPX')) || '', fit = cards.find((c) => c.includes('FIT')) || '', tcx = cards.find((c) => c.includes('TCX')) || '';
  check(kind, /27:30/.test(gpx) && /(3\.1\d mi|5\.0\d km)/.test(gpx) && /\d{3} \/ \d{3}/.test(gpx), 'GPX parsed: 27:30, 5 km, HR avg/max');
  check(kind, /612/.test(fit) && /(12\.\d+ mi|20\.\d+ km)/.test(fit) && /HYBRD sample generator/.test(fit), 'FIT parsed: 612 kcal, ~20 km, device name');
  check(kind, /10 laps/.test(tcx) && /37:00/.test(tcx) && /\d{3}kcal \(device\)/.test(tcx), 'TCX parsed: 10 laps, 37:00, device kcal');
  // expand the GPX card (map + HR chart) for the screenshot
  await page.evaluate(() => { const c = [...document.querySelectorAll('[data-testid="imp-card"]')].find((x) => x.textContent.includes('GPX')); const b = [...c.querySelectorAll('button')].find((x) => /Details|Hide/.test(x.textContent)); if (!/Hide/.test(b.textContent)) b.click(); c.scrollIntoView({ block: 'start' }); window.scrollBy(0, -70); });
  await sleep(2500);
  check(kind, await page.evaluate(() => !!document.querySelector('[data-testid="imp-card"] .leaflet-container') && !!document.querySelector('[data-testid="imp-card"] .hr-chart, [data-testid="imp-card"] svg')), 'expanded preview shows map + HR chart');
  if (phone) await shot('import-preview');
  await clickText('Save 3', 'button'); await sleep(1500);
  const hist = await all('a.row-link');
  check(kind, hist.filter((h) => h.includes('Imported')).length === 3, `history shows 3 “Imported” badges`);
  // dedupe on re-import
  await go('/me/import'); await clickText('FIT · 20 km ride'); await sleep(2500);
  check(kind, !!(await page.$('[data-testid="imp-dup"]')) && !(await page.$eval('[data-testid="imp-card"] input[type=checkbox]', (e) => e.checked)), 're-import flagged as duplicate and unticked');
  await page.evaluate(async () => { const b = await (await fetch('/hybrd/samples/hybrd-sample-ride.fit')).arrayBuffer(); const dt = new DataTransfer(); dt.items.add(new File([b.slice(0, Math.floor(b.byteLength * 0.6))], 'cut-short.fit')); window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, cancelable: true })); });
  await sleep(2500);
  const cut = await page.evaluate(() => [...document.querySelectorAll('[data-testid="imp-card"], [data-testid="imp-error"]')].map((e) => e.textContent).find((t) => t.includes('cut-short') || /checksum|Couldn’t read/.test(t)) || '');
  console.log(kind, 'truncated FIT:', cut.replace(/\s+/g, ' ').slice(0, 200));
  check(kind, /checksum|Couldn’t read/.test(cut), 'truncated FIT handled (warning or clear error)');
  await clickText('Clear');
  // detail page of the imported FIT
  await go('/train?tab=history'); await page.evaluate(() => [...document.querySelectorAll('a.row-link')].find((a) => a.textContent.includes('Imported') && /ride|Ride|Cycl/.test(a.textContent))?.click()); await sleep(1500);
  check(kind, !!(await page.$('[data-testid="hr-summary"]')) && !!(await page.$('[data-testid="laps"]')) && await has('Calories as reported by'), 'imported FIT detail: HR summary, laps, device calories');

  // ---------- Strava ----------
  await go('/me/devices');
  await clickText('Enter Client ID & function URL');
  await page.type('input[aria-label="Strava Client ID"]', '123456');
  await page.type('input[aria-label="Token function URL"]', FN);
  await clickText('Save', '.strava-card button'); await sleep(400);
  check(kind, !(await page.$('[data-testid="strava-setup-needed"]')), 'setup-needed cleared after config');
  await page.click('.strava-connect-btn'); await sleep(600);
  check(kind, !!(await page.$('[data-testid="strava-consent"]')), 'consent sheet before connecting');
  const href = await page.$eval('[data-testid="strava-authorize"]', (a) => a.href);
  check(kind, href.startsWith('https://www.strava.com/oauth/authorize?'), 'official button links to strava.com/oauth/authorize');
  const btnSrc = await page.$eval('[data-testid="strava-authorize"] img', (i) => [i.getAttribute('src'), i.naturalHeight, i.getBoundingClientRect().height]);
  check(kind, btnSrc[0].endsWith('brand/strava/btn_strava_connect_with_orange.svg') && Math.round(btnSrc[2]) === 48, `official Connect button asset at 48 px (${btnSrc})`);
  if (phone) await shot('strava-connect');
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.click('[data-testid="strava-authorize"]')]);
  await page.waitForFunction(() => location.search === '' || !location.search.includes('code='), { timeout: 5000 }).catch(() => {});
  await sleep(3000);
  check(kind, page.url() === BASE + 'me/devices', `returned to Devices with code removed from URL (${page.url()})`);
  check(kind, mock.exchanged === 1, 'code exchanged via token function');
  const summ = await text('[data-testid="strava-summary"]');
  console.log(kind, 'strava summary:', summ, '| calls:', mock.calls.join(' ; '));
  check(kind, /3 Strava activities/.test(summ) && /1 hidden as duplicate/.test(summ), 'synced 3, 1 hidden as duplicate of imported GPX');
  check(kind, !mock.calls.some((c) => c.includes('client_secret')), 'no secret in browser calls');
  await go('/train?tab=history');
  const sHist = await all('a.row-link');
  check(kind, sHist.filter((h) => h.includes('from Strava')).length === 2, `history shows 2 “from Strava” (${sHist.filter((h) => h.includes('from Strava')).length})`);
  await page.evaluate(() => [...document.querySelectorAll('a.row-link')].find((a) => a.textContent.includes('Sunday Ride'))?.click()); await sleep(2500);
  const vos = await page.$eval('a.view-on-strava', (a) => [a.textContent, a.href, getComputedStyle(a).color, getComputedStyle(a).fontWeight]).catch(() => null);
  check(kind, vos && vos[0] === 'View on Strava' && vos[1] === 'https://www.strava.com/activities/9002' && vos[2] === 'rgb(252, 82, 0)' && +vos[3] >= 700, `“View on Strava” link ${JSON.stringify(vos)}`);
  check(kind, mock.calls.some((c) => c.includes('/activities/9002/streams')) && !!(await page.$('[data-testid="hr-summary"] svg')), 'streams loaded: HR chart on Strava activity');
  check(kind, await has('Calories as reported by Strava') && await has('742'), 'Strava calories used (742)');
  check(kind, !!(await page.$('img.pwrd-strava')), 'Powered by Strava on activity');
  // not in HYBRD's own data / export
  const exp = await page.evaluate(async () => { const r = indexedDB.open('keyval-store'); const db = await new Promise((res) => { r.onsuccess = () => res(r.result); }); const tx = db.transaction('keyval'); const st = tx.objectStore('keyval'); const keys = await new Promise((res) => { const q = st.getAllKeys(); q.onsuccess = () => res(q.result); }); const out = {}; for (const k of keys) out[k] = await new Promise((res) => { const q = st.get(k); q.onsuccess = () => res(q.result); }); return out; });
  const own = Object.entries(exp).filter(([k]) => !String(k).startsWith('hybrd:strava-cache')).map(([, v]) => JSON.stringify(v)).join('');
  check(kind, !own.includes('Sunday Ride') && !!exp['hybrd:strava-cache:4242'], 'Strava data only in its own device cache, not in HYBRD data');
  // 7-day cache purge: age one entry to 8 days, reload
  await page.evaluate(async () => { const r = indexedDB.open('keyval-store'); const db = await new Promise((res) => { r.onsuccess = () => res(r.result); }); const tx = db.transaction('keyval', 'readwrite'); const st = tx.objectStore('keyval'); const c = await new Promise((res) => { const q = st.get('hybrd:strava-cache:4242'); q.onsuccess = () => res(q.result); }); c['strava-9003'].cachedAt = Date.now() - 8 * 86400e3; st.put(c, 'hybrd:strava-cache:4242'); await new Promise((res) => { tx.oncomplete = res; }); });
  await page.goto(BASE + 'me/devices', { waitUntil: 'networkidle0' }); await sleep(1500);
  check(kind, /2 Strava activities/.test(await text('[data-testid="strava-summary"]')), 'entry older than 7 days purged on load');
  // deleted on Strava → removed at next sync
  mock.acts = mock.acts.filter((a) => a.id !== 9002);
  await clickText('Sync now'); await sleep(2000);
  const info = await text('[data-testid="strava-info"]');
  check(kind, /removed 1 no longer on Strava/.test(info), `sync drops activities deleted on Strava (“${info}”)`);
  // disconnect & delete
  await clickText('Disconnect & delete'); await sleep(1500);
  const conf = await text('[data-testid="strava-info"]');
  console.log(kind, 'disconnect confirmation:', conf);
  check(kind, mock.revoked === 1 && /delet/i.test(conf), 'revoked via function + written confirmation');
  const left = await page.evaluate(async () => { const ls = Object.keys(localStorage).filter((k) => k.startsWith('hybrd:strava') && !['hybrd:strava-cid', 'hybrd:strava-url'].includes(k)); const r = indexedDB.open('keyval-store'); const db = await new Promise((res) => { r.onsuccess = () => res(r.result); }); const keys = await new Promise((res) => { const q = db.transaction('keyval').objectStore('keyval').getAllKeys(); q.onsuccess = () => res(q.result); }); return [...ls, ...keys.filter((k) => String(k).startsWith('hybrd:strava'))]; });
  check(kind, left.length === 0, `no Strava data left on device (${left})`);
  await go('/train?tab=history');
  check(kind, !(await has('from Strava')), 'history has no Strava items after disconnect');
  await browser.close();
}

async function ios() {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1');
  page.on('pageerror', (e) => errors.push(`[ios] pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[ios] console.error: ${m.text()}`); });
  await page.evaluateOnNewDocument(() => { delete Navigator.prototype.bluetooth; });
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  const ct = async (t) => { await page.evaluate((t) => [...document.querySelectorAll('button')].find((b) => b.textContent.includes(t))?.click(), t); await sleep(400); };
  await ct('Get started'); for (let i = 0; i < 4; i++) await ct('Continue'); await ct('Start training'); await sleep(600);
  await page.evaluate(() => { history.pushState({}, '', '/hybrd/me/devices'); dispatchEvent(new PopStateEvent('popstate')); }); await sleep(1000);
  const t = await page.$eval('[data-testid="hr-panel"]', (e) => e.textContent);
  check('ios', /iPhone and iPad browsers/.test(t) && /import/.test(t), 'iOS: explains no Web Bluetooth + alternatives');
  await page.screenshot({ path: `${OUT}phone-devices-ios.png` }); console.log('shot ios devices');
  await browser.close();
}

for (const k of ['phone', 'desktop']) { try { await run(k); } catch (e) { errors.push(`[${k}] crashed: ${e.stack}`); } }
try { await ios(); } catch (e) { errors.push(`[ios] crashed: ${e.stack}`); }
if (thirdParty.length) console.log(`\nthird-party iframe requests (not HYBRD code, not counted):\n${thirdParty.join('\n')}`);
console.log(errors.length ? `\n${errors.length} ERRORS:\n${errors.join('\n')}` : '\nDEVICES CHECKS: 0 errors');
process.exit(errors.length ? 1 : 0);
