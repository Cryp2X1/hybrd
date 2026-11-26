// Screenshots + browser checks for: hide start/end (privacy), Save activity, activity detail, share sheet + share images,
// the public link page (local mode), and Settings (phone + desktop). Records a simulated run along real Manhattan
// streets (tools/fixtures/record-map-routes.json, OSM-derived) with a mocked GPS. Needs `node tools/serve.mjs` on :4173.
// Output: screenshots/phone-privacy-*.png, phone-save-activity.png, phone-activity-detail*.png, phone-share-sheet*.png,
//         share-image-*.png, phone-settings-*.png, desktop-settings*.png
import puppeteer from 'puppeteer-core';
import { readFileSync, writeFileSync } from 'node:fs';
const BASE = 'http://localhost:4173/hybrd/';
const OUT = new URL('../screenshots/', import.meta.url).pathname;
const FIX = JSON.parse(readFileSync(new URL('./fixtures/record-map-routes.json', import.meta.url))).routes;
const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rad = Math.PI / 180;
const hav = (a, b) => { const dLat = (b[1] - a[1]) * rad, dLng = (b[0] - a[0]) * rad; const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLng / 2) ** 2; return 2 * 6371000 * Math.asin(Math.sqrt(h)); };
const L = FIX.live.coords; const START = L[0];
const PTS = []; for (let i = 1; i < L.length; i++) { const d = hav(L[i - 1], L[i]); const n = Math.max(1, Math.round(d / 7.5)); for (let k = 0; k < n; k++) PTS.push([L[i - 1][0] + (L[i][0] - L[i - 1][0]) * (k / n), L[i - 1][1] + (L[i][1] - L[i - 1][1]) * (k / n)]); }
PTS.push(L[L.length - 1]);
const END = PTS[PTS.length - 1];

const GEO_MOCK = (start) => {
  let off = 0; const realNow = Date.now.bind(Date); Date.now = () => realNow() + off;
  const watchers = new Map(); let id = 1;
  const mk = (lat, lng, acc, heading, speed) => ({ coords: { latitude: lat, longitude: lng, accuracy: acc, altitude: 12, altitudeAccuracy: 5, heading, speed }, timestamp: Date.now() });
  let cur = mk(start[1], start[0], 6, null, null);
  window.__geo = { set(lat, lng, acc = 5, heading = null, speed = null) { cur = mk(lat, lng, acc, heading, speed); for (const w of watchers.values()) w.ok(cur); }, advance(ms) { off += ms; } };
  const geo = { getCurrentPosition(ok) { setTimeout(() => ok(cur), 30); }, watchPosition(ok, err) { const i = id++; watchers.set(i, { ok, err }); setTimeout(() => ok(cur), 30); return i; }, clearWatch(i) { watchers.delete(i); } };
  Object.defineProperty(Navigator.prototype, 'geolocation', { get: () => geo, configurable: true });
  const q = navigator.permissions?.query?.bind(navigator.permissions);
  if (q) navigator.permissions.query = (d) => (d && d.name === 'geolocation' ? Promise.resolve({ state: 'granted', onchange: null }) : q(d));
};
const ARGS = ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

async function setup(browser, kind) {
  const phone = kind === 'phone';
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.emulateTimezone('America/New_York');
  await page.setViewport(phone ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width: 1440, height: 900, deviceScaleFactor: 1 });
  if (phone) await page.setUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36');
  await page.evaluateOnNewDocument(GEO_MOCK, START);
  page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/WebGL|GPU stall|GL Driver|swiftshader/i.test(t)) errors.push(`[${kind}] console.error: ${t} @ ${page.url()}`); });
  page.on('pageerror', (e) => errors.push(`[${kind}] pageerror: ${e.message}`));
  page.on('response', (r) => { if (r.status() >= 400 && r.url().startsWith('http://localhost')) errors.push(`[${kind}] HTTP ${r.status()}: ${r.url()}`); });
  const check = (cond, msg, detail = '') => { if (!cond) errors.push(`[${kind}] ${msg} ${detail}`); else console.log('ok', kind, msg); };
  const overflow = () => page.evaluate(() => {
    const W = document.documentElement.clientWidth; const bad = [];
    if (document.documentElement.scrollWidth > W + 1) bad.push('document:' + document.documentElement.scrollWidth);
    for (const e of document.querySelectorAll('body *')) {
      const r = e.getBoundingClientRect(); if (!r.width || r.right <= W + 1) continue;
      if (e.closest('.seg, .chips, .leaflet-container, .maplibregl-map, [aria-hidden="true"]')) continue;
      let p = e.parentElement, clipped = false; while (p) { const cs = getComputedStyle(p); if (/(auto|scroll|hidden|clip)/.test(cs.overflowX) && p.getBoundingClientRect().right <= W + 1) { clipped = true; break; } p = p.parentElement; }
      if (!clipped) bad.push(e.tagName + '.' + [...e.classList].join('.') + ':' + Math.round(r.right));
      if (bad.length > 5) break;
    }
    return bad.join(' ');
  });
  const shot = async (name, wait = 700, opts = {}) => {
    await sleep(wait);
    await page.evaluate(() => { let st = document.getElementById('shot-css'); if (!st) { st = document.createElement('style'); st.id = 'shot-css'; document.head.appendChild(st); } st.textContent = '.toast{display:none!important}'; });
    const ov = await overflow();
    check(!ov, `${name}: no sideways overflow`, ov);
    await page.screenshot({ path: `${OUT}${name}.png`, ...opts });
    console.log('shot', name);
  };
  const go = async (path, wait = 1200) => { await page.evaluate((p) => { history.pushState({}, '', p); dispatchEvent(new PopStateEvent('popstate')); }, '/hybrd' + path); await sleep(wait); };
  const click = async (sel, wait = 450) => { const ok = await page.evaluate((s) => { const el = document.querySelector(s); if (el) { el.click(); return true; } return false; }, sel); if (!ok) throw new Error(`no ${sel}`); await sleep(wait); };
  const clickText = async (txt, sel = 'button, a') => {
    const ok = await page.evaluate((t, s) => { const el = [...document.querySelectorAll(s)].find((e) => e.textContent.trim().includes(t) && e.offsetParent !== null); if (el) { el.click(); return true; } return false; }, txt, sel);
    if (!ok) throw new Error(`no element with text ${txt}`); await sleep(400);
  };
  const setVal = async (sel, v) => {
    const ok = await page.evaluate((s, v) => { const i = document.querySelector(s); if (!i) return false; const proto = i.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })); return true; }, sel, v);
    if (!ok) throw new Error(`no ${sel}`); await sleep(250);
  };
  const scrollTo = (sel, block = 'start') => page.evaluate((s, b) => { document.querySelector(s)?.scrollIntoView({ block: b }); }, sel, block);
  const text = () => page.evaluate(() => document.body.innerText);
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await clickText('Get started');
  await page.type('input[autocomplete="given-name"]', 'José Cruz');
  await clickText('Continue'); await clickText('Continue'); await clickText('Continue');
  await clickText('Running'); await clickText('Continue');
  await clickText('Start training');
  await page.waitForFunction(() => !document.body.innerText.includes('Your daily targets'), { timeout: 15000 });
  await sleep(600);
  return { page, check, shot, go, click, clickText, setVal, scrollTo, text, overflow };
}

async function recordRun(S) {
  const { page } = S;
  await page.evaluate(() => localStorage.removeItem('hybrd:planned-active'));
  await S.go('/record', 2500);
  await S.click('[data-testid="record-start"]', 600);
  for (let i = 0; i < PTS.length; i++) {
    await page.evaluate(() => window.__geo.advance(2500));
    await page.evaluate((lng, lat) => window.__geo.set(lat, lng, 5, null, 3.0), PTS[i][0], PTS[i][1]);
    await sleep(25);
  }
  await sleep(800);
  await S.click('[data-testid="record-pause"]');
  const fb = await page.$('.rm-finish'); const bb = await fb.boundingBox();
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await page.mouse.down(); await sleep(1200); await page.mouse.up(); await sleep(800);
}

const saveImg = async (page, name) => {
  const b64 = await page.evaluate(async () => { const img = document.querySelector('[data-testid="share-preview"] img'); const b = await (await fetch(img.src)).blob(); return await new Promise((r) => { const f = new FileReader(); f.onload = () => r(String(f.result).split(',')[1]); f.readAsDataURL(b); }); });
  writeFileSync(`${OUT}${name}.png`, Buffer.from(b64, 'base64'));
  console.log('saved', name);
};
const waitImg = (page, ratio, style) => page.waitForFunction((r, s) => { const x = window.__hybrdLastShare; return x && x.ratio === r && x.style === s && !document.querySelector('.share-prev-busy'); }, { timeout: 30000, polling: 200 }, ratio, style);

async function phone(browser) {
  const S = await setup(browser, 'phone');
  const { page, check } = S;

  // ---------- Settings (home, search) ----------
  check(!!(await page.$('[data-testid="top-settings"]')), 'gear icon in the top bar');
  await S.click('[data-testid="top-settings"]', 1200);
  check(!!(await page.$('[data-testid="settings-home"]')), '/settings opens from the gear icon');
  const groups = await page.evaluate(() => [...document.querySelectorAll('.set-gl')].map((e) => e.textContent));
  check(groups.join() === 'You,Training & recording,Connections,App', 'settings grouped', groups.join());
  await S.shot('phone-settings-main');
  await page.evaluate(() => window.scrollTo(0, 99999)); await S.shot('phone-settings-main-2');
  await page.evaluate(() => window.scrollTo(0, 0));
  await S.setVal('[data-testid="set-search"]', 'zones');
  check(/Privacy zones/.test(await page.evaluate(() => document.querySelector('[data-testid="set-results"]')?.innerText || '')), 'search “zones” finds Privacy zones');
  await S.shot('phone-settings-search');
  await S.setVal('[data-testid="set-search"]', '');

  // old routes redirect
  await S.go('/me/devices#music', 1500);
  check(await page.evaluate(() => location.pathname.endsWith('/settings/devices') && location.hash === '#music'), '/me/devices#music → /settings/devices#music');
  await S.go('/messages/settings', 1200);
  check(await page.evaluate(() => location.pathname.endsWith('/settings/messages')), '/messages/settings → /settings/messages');
  await S.go('/me', 1200);
  check(!(await page.$('input[aria-label="Max heart rate"]')) && !!(await page.$('[data-testid="me-settings"]')), 'Me: settings moved out, Settings button shown');
  await S.shot('phone-me');

  // subpages
  for (const id of ['account', 'profile', 'units', 'recording', 'notifications', 'goals', 'devices', 'messages', 'data', 'help', 'about']) {
    await S.go(`/settings/${id}`, 1300);
    check(!!(await page.$(`[data-testid="settings-${id}"]`)), `/settings/${id} renders`);
    await S.shot(`phone-settings-${id}`, 500);
  }
  // auto-pause: same setting on Record and in Settings
  await S.go('/settings/recording', 1000);
  await S.click('[data-testid="set-autopause"]');
  const apOff = await page.evaluate(() => document.querySelector('[data-testid="set-autopause"]').getAttribute('aria-pressed'));
  await S.go('/record', 2500);
  await S.click('.rm-handle', 700);
  check(!!(await page.$('[data-testid="rm-all-settings"]')), 'Record options link to Settings › Recording');
  await S.shot('phone-record-options', 500);
  const recAp = await page.evaluate(() => [...document.querySelectorAll('button.toggle')].find((b) => /Auto-pause/.test(b.textContent))?.querySelector('.switch')?.classList.contains('on'));
  check(apOff === 'false' && recAp === false, 'Auto-pause off in Settings → off on Record');
  await page.evaluate(() => [...document.querySelectorAll('button.toggle')].find((b) => /Auto-pause/.test(b.textContent))?.click()); await sleep(400);
  await page.keyboard.press('Escape'); await sleep(400);
  await S.go('/settings/recording', 1000);
  check((await page.evaluate(() => document.querySelector('[data-testid="set-autopause"]').getAttribute('aria-pressed'))) === 'true', 'Auto-pause on at Record → on in Settings');

  // ---------- record → Save activity ----------
  await recordRun(S);
  check(!!(await page.$('[data-testid="save-activity"]')), 'hold to finish → Save activity page');
  const title0 = await page.evaluate(() => document.querySelector('[data-testid="sa-title"]').value);
  check(/^(Morning|Lunch|Afternoon|Evening|Night) Run$/.test(title0), 'auto title', title0);
  await S.setVal('[data-testid="sa-title"]', 'Fifth Avenue tempo');
  await S.setVal('[data-testid="sa-desc"]', 'Steady effort up Fifth. Legs felt good after Sunday’s long run.');
  await page.evaluate(() => window.scrollTo(0, 0));
  await S.shot('phone-save-activity');
  await S.scrollTo('[data-testid="sa-photos"], .sa-photos'); await S.shot('phone-save-activity-2');
  await S.scrollTo('[data-testid="sa-map-privacy"]');
  await S.shot('phone-privacy-save-others');
  await page.evaluate(() => [...document.querySelectorAll('[data-testid="sa-map-privacy"] .seg button')].find((b) => /What you see/.test(b.textContent))?.click());
  await S.scrollTo('[data-testid="sa-map-privacy"]');
  await S.shot('phone-privacy-save-you');
  await S.click('[data-testid="sa-save"]', 1800);
  check(await page.evaluate(() => /\/train\/workout\//.test(location.pathname)), 'saved → activity page');
  check(!!(await page.$('[data-testid="act-saved"]')), 'saved banner with Share');
  await page.evaluate(() => window.scrollTo(0, 0));
  await S.shot('phone-activity-detail', 1500);
  await page.evaluate(() => [...document.querySelectorAll('.act-mapbar .seg button')].find((b) => /What others see/.test(b.textContent))?.click());
  await sleep(1500);
  await S.scrollTo('.act-mapbar');
  await S.shot('phone-activity-detail-others', 1500);
  await page.evaluate(() => window.scrollTo(0, 99999)); await S.shot('phone-activity-detail-bottom');

  // ---------- share sheet + images ----------
  await page.evaluate(() => window.scrollTo(0, 0));
  await S.click('[data-testid="act-share-cta"]', 600);
  await waitImg(page, 'square', 'map');
  const last = await page.evaluate(() => window.__hybrdLastShare);
  // distance ALONG the recorded route from the real start / to the real end, for every point in the image
  const cum = [0]; for (let i = 1; i < PTS.length; i++) cum.push(cum[i - 1] + hav(PTS[i - 1], PTS[i]));
  const along = (p) => { let bi = 0, bd = Infinity; PTS.forEach((q, i) => { const d = hav([p.lng, p.lat], q); if (d < bd) { bd = d; bi = i; } }); return cum[bi]; };
  const alongs = last.points.map(along), total = cum[cum.length - 1];
  const fromStart = Math.min(...alongs), toEnd = total - Math.max(...alongs);
  const crowStart = Math.min(...last.points.map((p) => hav([p.lng, p.lat], START))), crowEnd = Math.min(...last.points.map((p) => hav([p.lng, p.lat], END)));
  check(last.points.length > 10 && fromStart >= 390 && toEnd >= 390 && crowStart >= 250 && crowEnd >= 250, `share image route: first ${Math.round(fromStart)} m and last ${Math.round(toEnd)} m of the run removed (≥ 400 m trim + random extra; nearest point ${Math.round(crowStart)} m / ${Math.round(crowEnd)} m from the real start / end)`);
  check(last.points.every((p) => !('t' in p)), 'share image route carries no timestamps');
  await S.shot('phone-share-sheet', 1000);
  await saveImg(page, 'share-image-square-map');
  await page.evaluate(() => document.querySelector('.sheet')?.scrollTo?.(0, 99999)); await sleep(300);
  await S.shot('phone-share-sheet-2');
  const ratio = async (idx, r, s) => { await page.evaluate((i) => document.querySelectorAll('.share-opts .seg button')[i].click(), idx); await waitImg(page, r, s); };
  await ratio(2, 'story', 'map'); await saveImg(page, 'share-image-story-map');
  await ratio(1, 'portrait', 'map'); await saveImg(page, 'share-image-portrait-map');
  await S.click('[data-testid="style-route"]'); await waitImg(page, 'portrait', 'route'); await saveImg(page, 'share-image-portrait-route');
  await ratio(2, 'story', 'route');
  await S.click('[data-testid="style-transparent"]'); await waitImg(page, 'story', 'transparent'); await saveImg(page, 'share-image-story-transparent');
  await page.evaluate(() => document.querySelector('.sheet')?.scrollTo?.(0, 0));
  await S.shot('phone-share-sheet-transparent', 600);
  await ratio(0, 'square', 'transparent');
  await S.click('[data-testid="style-stats"]'); await waitImg(page, 'square', 'stats'); await saveImg(page, 'share-image-square-stats');
  const shareTxt = await page.evaluate(() => document.querySelector('[data-testid="share-link-note"]')?.textContent || '');
  check(/accounts are switched on/.test(shareTxt), 'local mode: link note explains links', shareTxt);
  const xHref = await page.evaluate(() => { let u = ''; const o = window.open; window.open = (x) => { u = String(x); return null; }; document.querySelector('[data-testid="share-x"]').click(); window.open = o; return u; });
  check(/^https:\/\/x\.com\/intent\/post\?text=/.test(xHref), 'X opens the post composer (intent URL), posts nothing', xHref.slice(0, 80));
  await page.keyboard.press('Escape'); await sleep(500);

  // public link page in local mode
  await S.go('/a?id=8d3c1a52-2f4e-4c36-9a77-0b1e5c2d9f10', 1500);
  check(!!(await page.$('[data-testid="pub-local"]')), '/a explains links work once accounts are on (local mode)');
  await S.shot('phone-shared-link-local');

  // ---------- Settings › Privacy, with a Home zone at the start ----------
  await S.go('/settings/privacy', 1500);
  check(!!(await page.$('[data-testid="privacy-preview"]')), 'privacy settings preview the latest route');
  await S.shot('phone-privacy-settings');
  await S.scrollTo('#map'); await S.shot('phone-privacy-map-visibility', 900);
  await S.click('[data-testid="zone-add"]', 1800);
  await S.scrollTo('[data-testid="zone-editor"]');
  const zm = await page.$('.zone-map'); const zb = await zm.boundingBox();
  await page.mouse.click(zb.x + zb.width / 2, zb.y + zb.height / 2); await sleep(500);
  await S.click('[data-testid="zone-r-400"]');
  await S.shot('phone-privacy-zone-editor', 1500);
  await S.click('[data-testid="zone-save"]', 800);
  check((await page.$$('[data-testid="zone-row"]')).length === 1, 'zone saved');
  await S.scrollTo('#zones'); await S.shot('phone-privacy-zones', 800);
  await page.close();
}

async function desktop(browser) {
  const S = await setup(browser, 'desktop');
  const { page, check } = S;
  check(!!(await page.$('[data-testid="side-settings"]')), 'Settings in the sidebar');
  await S.click('[data-testid="side-settings"]', 1300);
  await S.shot('desktop-settings');
  await S.go('/settings/privacy', 1500); await S.shot('desktop-settings-privacy');
  check(await page.evaluate(() => getComputedStyle(document.querySelector('.set-side')).display !== 'none'), 'desktop: side list stays visible on a section');
  await S.go('/settings/units', 1200); await S.shot('desktop-settings-units');
  await S.go('/settings/devices', 1200); await S.shot('desktop-settings-devices');
  await recordRun(S);
  await S.click('[data-testid="sa-save"]', 1800);
  await S.shot('desktop-activity-detail', 1500);
  await S.click('[data-testid="act-share-cta"]', 600); await waitImg(page, 'square', 'map');
  await S.shot('desktop-share-sheet', 1000);
  await page.close();
}

const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ARGS });
try { await phone(browser); await desktop(browser); }
catch (e) { errors.push('CRASH ' + (e.stack || e.message)); }
finally { await browser.close(); }
if (errors.length) { console.error('\nPROBLEMS:\n' + errors.join('\n')); process.exit(1); }
console.log('\nall record/share/settings browser checks passed');
