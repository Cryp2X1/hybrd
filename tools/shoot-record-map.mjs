// Screenshots + checks for the map-first Record screen (GPS run / walk / ride).
// Geolocation is MOCKED (a fake navigator.geolocation driven from here) and the page clock is shifted so a simulated
// run along real Manhattan streets (tools/fixtures/record-map-routes.json) records at a realistic pace in seconds.
// Needs: npm run build && node tools/serve.mjs (port 4173). Map tiles come from the live OpenFreeMap servers.
// Run: node tools/shoot-record-map.mjs
import puppeteer from 'puppeteer-core';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
const BASE = 'http://localhost:4173/hybrd/';
const OUT = new URL('../screenshots/', import.meta.url).pathname;
const FIX = JSON.parse(readFileSync(new URL('./fixtures/record-map-routes.json', import.meta.url))).routes;
const TMP = '/tmp/hybrd-record-map'; mkdirSync(TMP, { recursive: true });
const errors = [], notes = [];
let checks = 0;
const check = (name, ok, detail = '') => { checks++; if (!ok) errors.push(`FAIL ${name} ${detail}`); else console.log('ok', name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const START = FIX.live.coords[0]; // [lng, lat] — Washington Square Arch

// ---- GPX history (imported through Me › Import, so "Your streets" is built from real saved activities)
const R = 6371000, rad = Math.PI / 180;
const hav = (a, b) => { const dφ = (b[1] - a[1]) * rad, dλ = (b[0] - a[0]) * rad; const h = Math.sin(dφ / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dλ / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
function gpx(name, coords, start, mps, type) {
  let t = start; const pts = [];
  coords.forEach((c, i) => { if (i) t += (hav(coords[i - 1], c) / mps) * 1000; pts.push(`<trkpt lat="${c[1]}" lon="${c[0]}"><time>${new Date(t).toISOString()}</time></trkpt>`); });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="HYBRD test" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>${name.replace(/&/g, '&amp;')}</name><type>${type}</type><trkseg>${pts.join('')}</trkseg></trk></gpx>`;
}
const day = 86400000, now = Date.now();
const HISTORY = [
  ['Hudson Greenway Easy', 'greenway', 3, 'running'], ['Greenway Long Run', 'greenway', 6, 'running'], ['Greenway Tempo', 'greenway', 9, 'running'],
  ['Fifth Avenue Loop', 'fifth', 4, 'running'], ['Fifth Ave Strides', 'fifth', 11, 'running'],
  ['Village Loop', 'village', 5, 'running'], ['Village Recovery', 'village', 12, 'running'], ['Broadway Shakeout', 'broadway', 8, 'running'],
  ['Greenway Spin', 'greenway', 7, 'cycling'],
];
const histFiles = HISTORY.map(([name, key, ago, type], i) => {
  const f = `${TMP}/h${i}.gpx`;
  writeFileSync(f, gpx(name, FIX[key].coords, now - ago * day - 3600000 * (i % 4), type === 'cycling' ? 6.5 : 3.1, type));
  return f;
});
const planFile = `${TMP}/Village-Chelsea-10K.gpx`;
// a planned route as most route planners export it: <rte> points, no timestamps
writeFileSync(planFile, `<?xml version="1.0"?>\n<gpx version="1.1" creator="route planner" xmlns="http://www.topografix.com/GPX/1/1"><rte><name>Village &amp; Chelsea Loop</name>${FIX.plan.coords.map((c) => `<rtept lat="${c[1]}" lon="${c[0]}"/>`).join('')}</rte></gpx>`);

// ---- fake geolocation + shiftable clock, injected before the app loads
const GEO_MOCK = (mode, start) => {
  let off = 0; const realNow = Date.now.bind(Date); Date.now = () => realNow() + off;
  const watchers = new Map(); let id = 1;
  const mk = (lat, lng, acc, heading, speed) => ({ coords: { latitude: lat, longitude: lng, accuracy: acc, altitude: 12, altitudeAccuracy: 5, heading, speed }, timestamp: Date.now() });
  let cur = mk(start[1], start[0], 6, null, null);
  const fail = (cb) => cb && cb({ code: 1, message: 'User denied Geolocation', PERMISSION_DENIED: 1 });
  window.__geo = {
    set(lat, lng, acc = 5, heading = null, speed = null) { cur = mk(lat, lng, acc, heading, speed); for (const w of watchers.values()) mode === 'deny' ? fail(w.err) : w.ok(cur); },
    advance(ms) { off += ms; },
  };
  const geo = {
    getCurrentPosition(ok, err) { setTimeout(() => (mode === 'deny' ? fail(err) : cur ? ok(cur) : err && err({ code: 3, message: 'timeout' })), 30); },
    watchPosition(ok, err) { const i = id++; watchers.set(i, { ok, err }); setTimeout(() => (mode === 'deny' ? fail(err) : cur && ok(cur)), 30); return i; },
    clearWatch(i) { watchers.delete(i); },
  };
  Object.defineProperty(Navigator.prototype, 'geolocation', { get: () => geo, configurable: true });
  const q = navigator.permissions?.query?.bind(navigator.permissions);
  if (q) navigator.permissions.query = (d) => (d && d.name === 'geolocation' ? Promise.resolve({ state: mode === 'deny' ? 'denied' : 'granted', onchange: null }) : q(d));
};

const ARGS = ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'];

async function setup(kind, { mode = 'ok', noWebgl = false, blockTiles = false, reduced = false } = {}) {
  const phone = kind === 'phone';
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ARGS });
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.emulateTimezone('America/New_York');
  await page.setViewport(phone ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width: 1440, height: 900, deviceScaleFactor: 1 });
  if (phone) await page.setUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36');
  if (reduced) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.evaluateOnNewDocument(GEO_MOCK, mode, START);
  if (noWebgl) await page.evaluateOnNewDocument(() => { const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...a) { return /webgl/.test(t) ? null : g.call(this, t, ...a); }; });
  if (blockTiles) { await page.setRequestInterception(true); page.on('request', (r) => (/openfreemap|eox\.at|nationalmap/.test(r.url()) ? r.abort('internetdisconnected') : r.continue())); }
  const tag = `[${kind}${mode === 'deny' ? '/denied' : ''}${noWebgl ? '/no-webgl' : ''}${blockTiles ? '/offline' : ''}]`;
  page.on('console', (m) => { const t = m.text(); if ((m.type() === 'error' || m.type() === 'warning') && !(blockTiles && /Failed to fetch|ERR_INTERNET_DISCONNECTED|AJAXError/.test(t)) && !/WebGL|GPU stall|GL Driver|swiftshader/i.test(t)) errors.push(`${tag} console.${m.type()}: ${t}`); });
  page.on('pageerror', (e) => errors.push(`${tag} pageerror: ${e.message}`));
  page.on('response', (r) => { if (r.status() >= 400 && r.url().startsWith('http://localhost')) errors.push(`${tag} HTTP ${r.status()}: ${r.url()}`); if (r.status() >= 400 && /openfreemap/.test(r.url())) notes.push(`${tag} tile ${r.status()} ${r.url()}`); });
  const S = {
    page, browser, phone, tag,
    shot: async (name) => { await sleep(500); const p = `${OUT}${kind}-record-map-${name}.png`; await page.screenshot({ path: p }); console.log('shot', p); },
    go: async (path, wait = 900) => { await page.evaluate((p) => { history.pushState({}, '', p); dispatchEvent(new PopStateEvent('popstate')); }, '/hybrd' + path); await sleep(wait); },
    click: async (sel) => { const ok = await page.evaluate((s) => { const el = document.querySelector(s); if (el) { el.click(); return true; } return false; }, sel); if (!ok) throw new Error(`no ${sel}`); await sleep(400); },
    clickText: async (txt, sel = 'button, a') => {
      const ok = await page.evaluate((t, s) => { const el = [...document.querySelectorAll(s)].find((e) => e.textContent.trim().includes(t)); if (el) { el.click(); return true; } return false; }, txt, sel);
      if (!ok) throw new Error(`no element with text ${txt}`); await sleep(400);
    },
    setPos: (lng, lat, acc = 5, heading = null, speed = null) => page.evaluate((a, b, c, h, s) => window.__geo.set(b, a, c, h, s), lng, lat, acc, heading, speed),
    mapIdle: async (timeout = 30000) => {
      try { await page.waitForFunction(() => { const m = window.__hybrdMap; return m && m.isStyleLoaded() && m.areTilesLoaded() && !m.isMoving(); }, { timeout, polling: 250 }); }
      catch { notes.push(`${tag} map not idle after ${timeout} ms`); }
      await sleep(900);
    },
    noOverflow: async (where) => { const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth, wide: [...document.querySelectorAll('.recmap *, .sheet *')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > window.innerWidth + 1 && getComputedStyle(e).position !== 'fixed' && !e.closest('.rm-canvas'); }).slice(0, 3).map((e) => e.className + ':' + Math.round(e.getBoundingClientRect().right)) })); check(`${tag} no sideways overflow · ${where}`, o.sw <= o.w && !o.wide.length, JSON.stringify(o)); },
  };
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await S.clickText('Get started');
  await page.type('input[autocomplete="given-name"]', 'José');
  await S.clickText('Continue'); await S.clickText('Continue'); await S.clickText('Continue');
  await S.clickText('Running'); await S.clickText('Continue');
  await S.clickText('Start training');
  await page.waitForFunction(() => !document.body.innerText.includes('Your daily targets'), { timeout: 15000 });
  await sleep(500);
  return S;
}

async function importHistory(S) {
  await S.go('/me/import');
  const input = await S.page.$('[data-testid="file-input"]');
  await input.uploadFile(...histFiles);
  await S.page.waitForFunction((n) => document.querySelectorAll('[data-testid="imp-card"]').length >= n, { timeout: 20000 }, histFiles.length);
  await S.click('[data-testid="import-save"]');
  await sleep(800);
  const n = await S.page.evaluate(() => document.body.innerText.match(/Greenway|Village|Fifth|Broadway/g)?.length || 0);
  check(`${S.tag} imported ${histFiles.length} history GPX files`, n >= 3, String(n));
}

// ======================= PHONE =======================
async function phoneRun() {
  const S = await setup('phone');
  const { page } = S;
  await importHistory(S);
  await page.evaluate(() => localStorage.removeItem('hybrd:planned-active'));
  await S.go('/record', 1200);
  check('map screen shown for Run', !!(await page.$('[data-testid="record-map-screen"]')));
  await S.mapIdle();
  const st0 = await page.evaluate(() => ({ status: document.querySelector('.recmap')?.getAttribute('data-map'), h2: document.querySelector('.rm-card h2')?.textContent, start: document.querySelector('[data-testid="record-start"]')?.textContent, labels: [...document.querySelectorAll('.rm-stats span')].map((e) => e.textContent), vals: [...document.querySelectorAll('.rm-stats b')].map((e) => e.textContent), attr: document.querySelector('.rm-attr')?.textContent, layers: !!document.querySelector('[data-testid="rm-layers"]'), d3: !!document.querySelector('[data-testid="rm-3d"]'), rc: !!document.querySelector('[data-testid="rm-recenter"]'), back: !!document.querySelector('.rm-top [aria-label="Back"]'), dot: !!document.querySelector('.rm-me'), canvas: !!document.querySelector('.maplibregl-canvas') }));
  console.log('idle state', JSON.stringify(st0));
  check('map ready (tiles loaded)', st0.status === 'ready', st0.status);
  check('WebGL map canvas rendered', st0.canvas);
  check('stats card title Run', st0.h2 === 'Run', st0.h2);
  check('stats labels Time / Avg. pace / Distance', JSON.stringify(st0.labels) === JSON.stringify(['Time', 'Avg. pace', 'Distance']), JSON.stringify(st0.labels));
  check('idle values 0:00 / --:-- / 0.00', st0.vals[0] === '0:00' && st0.vals[1].startsWith('--:--') && st0.vals[2].startsWith('0.00'), JSON.stringify(st0.vals));
  check('Start button', /Start/.test(st0.start || ''));
  check('attribution visible (OpenFreeMap / OpenMapTiles / OpenStreetMap)', /OpenFreeMap/.test(st0.attr) && /OpenMapTiles/.test(st0.attr) && /OpenStreetMap/.test(st0.attr), st0.attr);
  check('right stack: layers, 3D, recenter; back button; position dot', st0.layers && st0.d3 && st0.rc && st0.back && st0.dot);
  const vis = await page.evaluate(() => { const r = document.querySelector('.rm-attr').getBoundingClientRect(); return r.bottom <= innerHeight && r.height > 0; });
  check('attribution inside the viewport', vis);
  // heading cone: give the dot a compass heading
  await S.setPos(START[0], START[1], 5, 28, 1.2); await sleep(400);
  check('heading cone shown when heading known', await page.evaluate(() => !!document.querySelector('.rm-me.has-heading')));
  await S.noOverflow('idle');
  await S.shot('01-idle');

  // a11y basics: every button has a name
  const unnamed = await page.evaluate(() => [...document.querySelectorAll('.recmap button')].filter((b) => !(b.getAttribute('aria-label') || b.textContent.trim())).length);
  check('all map-screen buttons have accessible names', unnamed === 0, String(unnamed));

  // ---- activity picker
  await S.click('[data-testid="rm-sport"]');
  const pick = await page.evaluate(() => [...document.querySelectorAll('[data-testid="rm-sport-sheet"] [role="radio"]')].map((b) => `${b.textContent.trim().slice(0, 4)}:${b.getAttribute('aria-checked')}`));
  check('picker lists Run / Walk / Ride with Run checked', pick.length === 3 && pick[0].endsWith('true'), JSON.stringify(pick));
  check('picker offers Treadmill, Indoor bike, Stationary bike, Strength, Timers', await page.evaluate(() => ['Treadmill', 'Indoor bike', 'Stationary bike', 'Strength', 'Interval timers'].every((t) => document.querySelector('.sheet').textContent.includes(t))));
  await S.noOverflow('picker');
  await S.shot('02-activity-picker');
  // switch to Ride → speed, then back to Run
  await S.clickText('Ride', '[data-testid="rm-sport-sheet"] button');
  const ride = await page.evaluate(() => ({ h2: document.querySelector('.rm-card h2')?.textContent, l: [...document.querySelectorAll('.rm-stats span')].map((e) => e.textContent)[1], u: document.querySelectorAll('.rm-stats b small')[0]?.textContent }));
  check('Ride shows Avg. speed in mph/km/h', ride.h2 === 'Ride' && ride.l === 'Avg. speed' && /mph|km\/h/.test(ride.u), JSON.stringify(ride));
  // Treadmill switches to the classic (no-map) screen; back to outdoor via the toggle
  await S.click('[data-testid="rm-sport"]'); await S.clickText('Treadmill', '.sheet button');
  check('Treadmill uses the classic screen (no map)', await page.evaluate(() => !document.querySelector('[data-testid="record-map-screen"]') && /Indoor \/ treadmill/.test(document.body.innerText)));
  await S.clickText('Indoor / treadmill', 'button.toggle'); await sleep(600);
  check('back on the map after turning treadmill off', !!(await page.$('[data-testid="record-map-screen"]')));
  await S.click('[data-testid="rm-sport"]'); await S.clickText('Run', '[data-testid="rm-sport-sheet"] button');
  await S.mapIdle(15000);

  // ---- layers sheet + Your streets heat
  await S.click('[data-testid="rm-heat"]');
  await sleep(600);
  const heat = await page.evaluate(() => { const m = window.__hybrdMap; const f = m.getSource('hybrd-heat')?._data; return { n: (f?.features || f?.geojson?.features || []).length, promo: document.querySelector('[data-testid="rm-heat"]').textContent }; });
  console.log('heat', JSON.stringify(heat));
  check('Your streets pill shows saved run count', /Your streets · 8 runs/.test(heat.promo), heat.promo);
  await S.click('[data-testid="rm-layers"]');
  const lay = await page.evaluate(() => ({ styles: [...document.querySelectorAll('[data-testid="rm-layers-sheet"] [role="radio"]')].map((b) => b.querySelector('b').textContent), badge: document.querySelector('.rm-badge')?.textContent }));
  check('layers sheet: Dark / Standard / Satellite', JSON.stringify(lay.styles) === '["Dark","Standard","Satellite"]', JSON.stringify(lay.styles));
  check('layers badge counts active overlays', lay.badge === '1', lay.badge);
  await S.noOverflow('layers');
  await S.shot('03-layers');
  // try Standard and Satellite quickly, then back to Dark
  await S.clickText('Standard', '[data-testid="rm-layers-sheet"] button'); await S.page.keyboard.press('Escape'); await S.mapIdle(20000);
  check('Standard style loaded', await page.evaluate(() => !!window.__hybrdMap.getLayer('hybrd-3d-buildings') && !!window.__hybrdMap.getLayer('hybrd-track')));
  await S.shot('03b-standard');
  await S.click('[data-testid="rm-layers"]'); await S.clickText('Satellite', '[data-testid="rm-layers-sheet"] button'); await S.page.keyboard.press('Escape'); await S.mapIdle(25000);
  check('Satellite style loaded with overlays', await page.evaluate(() => !!window.__hybrdMap.getSource('eox') && !!window.__hybrdMap.getLayer('hybrd-heat')));
  await S.shot('03c-satellite');
  await S.click('[data-testid="rm-layers"]'); await S.clickText('Dark', '[data-testid="rm-layers-sheet"] button'); await S.page.keyboard.press('Escape'); await S.mapIdle(20000);
  await page.evaluate(() => window.__hybrdMap.jumpTo({ center: [-74.0003, 40.7372], zoom: 13.55 })); await S.mapIdle(15000);
  await S.shot('04-your-streets');
  await S.click('[data-testid="rm-heat"]');

  // ---- 3D
  await S.click('[data-testid="rm-recenter"]'); await sleep(700);
  await S.click('[data-testid="rm-3d"]'); await sleep(1200); await S.mapIdle(20000);
  const p3 = await page.evaluate(() => ({ pitch: window.__hybrdMap.getPitch(), vis: window.__hybrdMap.getLayoutProperty('hybrd-3d-buildings', 'visibility') }));
  check('3D: pitched map with buildings visible', p3.pitch > 45 && p3.vis === 'visible', JSON.stringify(p3));
  await S.shot('05-3d');
  await S.click('[data-testid="rm-3d"]'); await sleep(900);

  // ---- Add Route: import a GPX through the route sheet
  await S.click('[data-testid="rm-add-route"]');
  check('route sheet: draw, import, saved activities', await page.evaluate(() => ['Draw a route', 'Import GPX', 'Repeat one of your activities'].every((t) => document.querySelector('.sheet').textContent.includes(t))));
  await S.shot('06-add-route-sheet');
  const fin = await page.$('[data-testid="rm-route-file"]');
  await fin.uploadFile(planFile);
  await page.waitForFunction(() => !!document.querySelector('[data-testid="rm-route-row"]'), { timeout: 15000 });
  await sleep(1200); await S.mapIdle(15000);
  const rr = await page.evaluate(() => document.querySelector('[data-testid="rm-route-row"]').textContent);
  check('route row shows name + distance', /Village & Chelsea Loop/.test(rr) && /mi|km/.test(rr), rr);
  await S.noOverflow('route');
  await S.shot('07-route-shown');

  // ---- draw a route (taps on the map)
  await S.click('[data-testid="rm-add-route"]'); await S.click('[data-testid="rm-draw-start"]');
  const box = await page.evaluate(() => { const r = document.querySelector('.rm-canvas').getBoundingClientRect(); return { w: r.width, h: r.height }; });
  for (const [fx, fy] of [[0.3, 0.55], [0.45, 0.45], [0.62, 0.42], [0.7, 0.3]]) { await page.mouse.click(box.w * fx, box.h * fy); await sleep(250); }
  const dtxt = await page.evaluate(() => document.querySelector('[data-testid="rm-draw"]').textContent);
  check('draw mode adds distance as you tap', /Tap the map to add points · (\d+ ft|[\d.]+ mi|\d+ m|[\d.]+ km)/.test(dtxt) && !/· 0 ft/.test(dtxt), dtxt);
  await S.shot('08-draw-route');
  await page.type('.rm-draw-bar input', 'Arch to Union Sq');
  await S.click('[data-testid="rm-draw-save"]'); await sleep(600);
  check('drawn route saved and active', /Arch to Union Sq/.test(await page.evaluate(() => document.querySelector('[data-testid="rm-route-row"]')?.textContent || '')));
  // switch back to the imported loop from Saved routes
  await S.click('[data-testid="rm-add-route"]'); await S.clickText('Village & Chelsea Loop', '.rm-li button'); await sleep(800);

  // ---- record a simulated run along 5th Avenue (live route)
  await S.click('[data-testid="rm-recenter"]'); await sleep(500);
  await S.click('[data-testid="record-start"]'); await sleep(500);
  check('Start → Pause button while recording', !!(await page.$('[data-testid="record-pause"]')));
  const pts = []; const L = FIX.live.coords;
  // resample the street geometry every ~7.5 m (3.0 m/s × 2.5 s)
  for (let i = 1; i < L.length; i++) { const d = hav(L[i - 1], L[i]); const n = Math.max(1, Math.round(d / 7.5)); for (let k = 0; k < n; k++) pts.push([L[i - 1][0] + (L[i][0] - L[i - 1][0]) * (k / n), L[i - 1][1] + (L[i][1] - L[i - 1][1]) * (k / n)]); }
  const steps = Math.min(pts.length, 150);
  for (let i = 0; i < steps; i++) {
    await page.evaluate(() => window.__geo.advance(2500));
    const hd = i ? (Math.atan2((pts[i][0] - pts[i - 1][0]) * Math.cos(pts[i][1] * rad), pts[i][1] - pts[i - 1][1]) / rad + 360) % 360 : null;
    await S.setPos(pts[i][0], pts[i][1], 4 + (i % 3), hd, 3.0);
    await sleep(35);
  }
  await sleep(1200); await S.mapIdle(15000);
  const live = await page.evaluate(() => ({ t: document.querySelector('[data-testid="rm-time"]').textContent, d: document.querySelector('[data-testid="rm-dist"]').textContent, pace: document.querySelectorAll('.rm-stats b')[1].textContent, route: document.querySelector('[data-testid="rm-route-row"]')?.textContent, state: document.querySelector('.rm-state')?.textContent, track: (() => { const s = window.__hybrdMap.getSource('hybrd-track'); const d = s?._data?.geojson || s?._data; return d?.features?.[0]?.geometry?.coordinates?.length || 0; })(), phase: document.querySelector('.recmap').dataset.phase }));
  console.log('live', JSON.stringify(live));
  check('recording: phase + state chip', live.phase === 'recording' && /Recording/.test(live.state), JSON.stringify(live));
  check('recording: time advanced (mocked clock)', /^[5-7]:\d\d$/.test(live.t), live.t);
  check('recording: distance > 0.6 mi', parseFloat(live.d) > 0.6, live.d);
  check('recording: realistic pace (7–10 min/mi)', /^([789]):\d\d/.test(live.pace), live.pace);
  check('recording: track drawn on the map', live.track > 50, String(live.track));
  check('recording: route distance to go shown', /to go/.test(live.route || ''), live.route);
  await S.noOverflow('recording');
  await S.shot('09-recording');

  // ---- expanded stats
  await S.click('[data-testid="rm-expand"]');
  const ex = await page.evaluate(() => ({ txt: document.querySelector('[data-testid="rm-expanded"]')?.textContent || '', steps: !!document.querySelector('[data-testid="rm-expanded"] [data-testid="steps"]') }));
  check('expanded stats: big time, distance, pace, kcal, route to go, steps', /Time/.test(ex.txt) && /Distance/.test(ex.txt) && /Avg\. pace/.test(ex.txt) && /kcal/.test(ex.txt) && /Route to go/.test(ex.txt) && ex.steps, ex.txt.slice(0, 200));
  await S.noOverflow('expanded');
  await S.shot('10-expanded-stats');
  await S.click('[aria-label="Back to map"]');

  // ---- pause → resume/finish
  await S.click('[data-testid="record-pause"]');
  const ps = await page.evaluate(() => ({ phase: document.querySelector('.recmap').dataset.phase, resume: !!document.querySelector('[data-testid="record-resume"]'), finish: !!document.querySelector('.rm-finish') }));
  check('paused: Resume + hold-to-finish', ps.phase === 'paused' && ps.resume && ps.finish, JSON.stringify(ps));
  await S.shot('11-paused');
  // off-route warning: jump 150 m east of the route while recording
  await S.click('[data-testid="record-resume"]');
  await page.evaluate(() => window.__geo.advance(20000)); await S.setPos(pts[steps - 1][0] + 0.0012, pts[steps - 1][1] - 0.0002, 5);
  await page.evaluate(() => window.__geo.advance(15000)); await S.setPos(pts[steps - 1][0] + 0.0018, pts[steps - 1][1] - 0.0003, 5);
  await sleep(600);
  check('off-route banner appears', /Off route/.test(await page.evaluate(() => document.querySelector('[data-testid="rm-offroute"]')?.textContent || '')));
  await S.click('[data-testid="record-pause"]');
  // finish with the hold button (pointer down for 1.1 s)
  const fb = await page.$('.rm-finish'); const bb = await fb.boundingBox();
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await page.mouse.down(); await sleep(1200); await page.mouse.up(); await sleep(500);
  check('finish sheet opens', /Save activity/.test(await page.evaluate(() => document.querySelector('.sheet')?.textContent || '')));
  await S.clickText('Save activity', '.sheet button'); await sleep(1200);
  const saved = await page.evaluate(() => ({ url: location.pathname, txt: document.body.innerText.slice(0, 400) }));
  check('saved → workout detail', /\/train\/workout\//.test(saved.url), saved.url);
  await S.go('/record', 1200);
  check('back to idle map after save', await page.evaluate(() => document.querySelector('.recmap')?.dataset.phase === 'idle'));
  await S.browser.close();
}

// ======================= DESKTOP =======================
async function desktopRun() {
  const S = await setup('desktop');
  const { page } = S;
  await importHistory(S);
  await S.go('/record', 1200);
  await S.mapIdle();
  // route + heat on, then a short recording so the desktop shot shows the full layout
  await S.click('[data-testid="rm-add-route"]'); const fin = await page.$('[data-testid="rm-route-file"]'); await fin.uploadFile(planFile);
  await page.waitForFunction(() => !!document.querySelector('[data-testid="rm-route-row"]'), { timeout: 15000 });
  await S.click('[data-testid="rm-heat"]'); await sleep(500);
  await S.click('[data-testid="rm-recenter"]'); await sleep(400);
  await S.click('[data-testid="record-start"]');
  const L = FIX.live.coords;
  for (let i = 0; i < Math.min(L.length, 60); i++) { await page.evaluate(() => window.__geo.advance(6500)); await S.setPos(L[i][0], L[i][1], 5); await sleep(30); }
  await sleep(800); await page.evaluate(() => window.__hybrdMap.jumpTo({ zoom: 14.6 })); await S.mapIdle();
  const lay = await page.evaluate(() => { const b = document.querySelector('.rm-bottom').getBoundingClientRect(), side = document.querySelector('.side-nav').getBoundingClientRect(), map = document.querySelector('.recmap').getBoundingClientRect(); return { panelW: Math.round(b.width), left: Math.round(map.left), sideW: Math.round(side.width), sideVisible: side.width > 0 }; });
  check('desktop: side nav visible, map beside it, floating 420px panel', lay.sideVisible && lay.left >= lay.sideW - 1 && lay.panelW === 420, JSON.stringify(lay));
  await S.noOverflow('desktop');
  await S.shot('12-desktop');
  await S.click('[data-testid="record-pause"]');
  await S.browser.close();
}

// ======================= EDGE CASES =======================
async function edgeRuns() {
  // permission denied
  let S = await setup('phone', { mode: 'deny' });
  await S.go('/record', 1500);
  const d = await S.page.evaluate(() => ({ banner: document.querySelector('.rm-banners')?.textContent || '', gps: document.querySelector('.rm-gps')?.textContent }));
  check('denied: explains how to allow location', /Location is off/.test(d.banner), d.banner.slice(0, 120));
  check('denied: GPS chip says Location off', /Location off/.test(d.gps || ''), d.gps);
  await S.shot('13-location-denied');
  await S.browser.close();
  // tiles blocked (offline) — map falls back to blank style; recording still draws the track
  S = await setup('phone', { blockTiles: true });
  await S.go('/record', 1200);
  await S.page.waitForFunction(() => document.querySelector('.recmap')?.dataset.map === 'offline', { timeout: 20000 }).catch(() => {});
  const off = await S.page.evaluate(() => ({ st: document.querySelector('.recmap')?.dataset.map, b: document.querySelector('.rm-banners')?.textContent || '' }));
  check('offline: status + banner', off.st === 'offline' && /track still records/.test(off.b), JSON.stringify(off));
  await S.click('[data-testid="record-start"]');
  const L = FIX.live.coords;
  for (let i = 0; i < 40; i++) { await S.page.evaluate(() => window.__geo.advance(4000)); await S.setPos(L[i][0], L[i][1], 5); await sleep(25); }
  await sleep(800);
  const tr = await S.page.evaluate(() => { const s = window.__hybrdMap.getSource('hybrd-track'); const g = s?._data?.geojson || s?._data; return { n: g?.features?.[0]?.geometry?.coordinates?.length || 0, d: document.querySelector('[data-testid="rm-dist"]').textContent }; });
  check('offline: track still drawn + distance counts', tr.n > 20 && parseFloat(tr.d) > 0.1, JSON.stringify(tr));
  await S.shot('14-offline-track');
  await S.click('[data-testid="record-pause"]');
  await S.browser.close();
  // no WebGL — SVG fallback, reduced motion
  S = await setup('phone', { noWebgl: true, reduced: true });
  await S.go('/record', 1500);
  const ng = await S.page.evaluate(() => ({ svg: !!document.querySelector('[data-testid="record-map-fallback"]'), st: document.querySelector('.recmap')?.dataset.map, pulse: getComputedStyle(document.querySelector('.rm-pulse') || document.body).animationName }));
  check('no WebGL: SVG track fallback', ng.svg, JSON.stringify(ng));
  await S.click('[data-testid="record-start"]');
  const L2 = FIX.live.coords;
  for (let i = 0; i < 40; i++) { await S.page.evaluate(() => window.__geo.advance(4000)); await S.setPos(L2[i][0], L2[i][1], 5); await sleep(25); }
  await sleep(600);
  check('no WebGL: track path drawn', await S.page.evaluate(() => (document.querySelector('[data-testid="record-map-fallback"] path[stroke="#FFE600"]')?.getAttribute('d') || '').length > 100));
  await S.shot('15-no-webgl-fallback');
  await S.click('[data-testid="record-pause"]');
  await S.browser.close();
  // indoor bike keeps its classic screen
  S = await setup('phone');
  await S.go('/record?type=indoor-cycle&kind=indoor', 800);
  check('indoor bike keeps the classic screen (no map)', await S.page.evaluate(() => !document.querySelector('[data-testid="record-map-screen"]') && /Indoor Bike/.test(document.body.innerText)));
  await S.browser.close();
}

const only = process.argv[2];
try {
  if (!only || only === 'phone') await phoneRun();
  if (!only || only === 'desktop') await desktopRun();
  if (!only || only === 'edge') await edgeRuns();
} catch (e) { errors.push(`crash: ${e.stack || e}`); }
if (notes.length) console.log('NOTES\n' + [...new Set(notes)].slice(0, 20).join('\n'));
console.log(`\n${checks} checks, ${errors.length} problems`);
if (errors.length) { console.log(errors.join('\n')); process.exit(1); }
