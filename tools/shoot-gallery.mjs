// Screenshots + checks for Me › Profile photo & Gallery (phone + desktop). Uses generated sample images (abstract
// illustrations, no real people), one with real EXIF GPS + capture date to prove location stripping.
// Needs `node tools/serve.mjs` running on :4173.
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, utimesSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { withExif, buildExifApp1 } from './exif-fixture.mjs';
const BASE = 'http://localhost:4173/hybrd/';
const OUT = new URL('../screenshots/', import.meta.url).pathname;
const SAMPLES = '/tmp/hybrd-samples/';
const DL = '/tmp/hybrd-downloads/';
const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- sample images (drawn in Chrome, saved as JPEG/PNG) ----------
const SPECS = [
  { f: 'progress-1-gps.jpg', kind: 'progress', w: 1800, h: 2400, hue: 48, label: 'WEEK 1', exif: { date: '2026:09:01 07:12:00', lat: 40.7128, lng: -74.006 } },
  { f: 'progress-2.jpg', kind: 'progress', w: 1800, h: 2400, hue: 52, label: 'WEEK 6', exif: { date: '2026:10:13 07:05:00', lat: 40.71, lng: -74.0 } },
  { f: 'progress-3.jpg', kind: 'progress', w: 1800, h: 2400, hue: 56, label: 'WEEK 11', mtime: '2026-11-15T08:00:00' },
  { f: 'training-barbell.jpg', kind: 'barbell', w: 2400, h: 1800, hue: 210, label: 'SQUAT DAY', mtime: '2026-11-10T18:30:00' },
  { f: 'training-kettlebell.jpg', kind: 'kettlebell', w: 2000, h: 2000, hue: 15, label: 'KB EMOM', mtime: '2026-11-12T06:40:00' },
  { f: 'training-run.jpg', kind: 'run', w: 2400, h: 1600, hue: 28, label: '10K TEMPO', mtime: '2026-11-08T07:00:00' },
  { f: 'training-bike.png', kind: 'bike', w: 1600, h: 1200, hue: 190, label: 'FTP TEST', mtime: '2026-10-28T19:00:00' },
  { f: 'other-meal.jpg', kind: 'meal', w: 2000, h: 1500, hue: 120, label: 'MEAL PREP', mtime: '2026-11-02T12:00:00' },
  { f: 'avatar-source.jpg', kind: 'avatar', w: 1600, h: 1200, hue: 48, label: '' },
];
async function makeSamples(browser) {
  rmSync(SAMPLES, { recursive: true, force: true }); mkdirSync(SAMPLES, { recursive: true });
  const page = await browser.newPage();
  await page.goto('about:blank');
  for (const s of SPECS) {
    const url = await page.evaluate((s) => {
      const c = document.createElement('canvas'); c.width = s.w; c.height = s.h; const x = c.getContext('2d');
      const g = x.createLinearGradient(0, 0, s.w, s.h); g.addColorStop(0, `hsl(${s.hue} 30% 18%)`); g.addColorStop(1, '#0b0b0b');
      x.fillStyle = g; x.fillRect(0, 0, s.w, s.h);
      const m = Math.min(s.w, s.h), cx = s.w / 2, cy = s.h / 2;
      x.fillStyle = `hsl(${s.hue} 95% 55%)`; x.strokeStyle = `hsl(${s.hue} 95% 55%)`; x.lineCap = 'round'; x.lineWidth = m * 0.06;
      const rr = (X, Y, W, H, R) => { x.beginPath(); x.roundRect(X, Y, W, H, R); x.fill(); };
      if (s.kind === 'progress' || s.kind === 'avatar') {
        // a flat, faceless mannequin silhouette (illustration, not a person)
        const k = s.kind === 'avatar' ? 0.75 : 1, t = s.kind === 'progress' ? ({ 'WEEK 1': 1.18, 'WEEK 6': 1.07, 'WEEK 11': 0.96 })[s.label] || 1 : 1;
        x.beginPath(); x.arc(cx, cy - m * 0.30 * k, m * 0.10 * k, 0, Math.PI * 2); x.fill();
        rr(cx - m * 0.17 * k * t, cy - m * 0.17 * k, m * 0.34 * k * t, m * 0.40 * k, m * 0.08 * k);
        if (s.kind === 'progress') { x.lineWidth = m * 0.07; x.beginPath(); x.moveTo(cx - m * 0.08, cy + m * 0.2); x.lineTo(cx - m * 0.1, cy + m * 0.45); x.moveTo(cx + m * 0.08, cy + m * 0.2); x.lineTo(cx + m * 0.1, cy + m * 0.45); x.stroke();
          x.beginPath(); x.moveTo(cx - m * 0.17 * t, cy - m * 0.12); x.lineTo(cx - m * 0.28, cy + m * 0.1); x.moveTo(cx + m * 0.17 * t, cy - m * 0.12); x.lineTo(cx + m * 0.28, cy + m * 0.1); x.stroke(); }
      } else if (s.kind === 'barbell') {
        x.fillRect(cx - m * 0.55, cy - m * 0.02, m * 1.1, m * 0.04);
        for (const d of [-1, 1]) { rr(cx + d * m * 0.42 - m * 0.04, cy - m * 0.22, m * 0.08, m * 0.44, 12); rr(cx + d * m * 0.32 - m * 0.04, cy - m * 0.17, m * 0.08, m * 0.34, 12); }
      } else if (s.kind === 'kettlebell') {
        x.beginPath(); x.arc(cx, cy + m * 0.08, m * 0.24, 0, Math.PI * 2); x.fill();
        x.lineWidth = m * 0.07; x.beginPath(); x.arc(cx, cy - m * 0.16, m * 0.15, Math.PI, 0); x.stroke();
      } else if (s.kind === 'run') {
        x.fillStyle = '#c2410c'; x.beginPath(); x.ellipse(cx, cy + m * 0.1, s.w * 0.42, m * 0.32, 0, 0, Math.PI * 2); x.fill();
        x.fillStyle = `hsl(${s.hue} 30% 14%)`; x.beginPath(); x.ellipse(cx, cy + m * 0.1, s.w * 0.30, m * 0.18, 0, 0, Math.PI * 2); x.fill();
        x.strokeStyle = '#fff'; x.lineWidth = 6; for (const r of [0.34, 0.38]) { x.beginPath(); x.ellipse(cx, cy + m * 0.1, s.w * r, m * (r - 0.1) , 0, 0, Math.PI * 2); x.stroke(); }
      } else if (s.kind === 'bike') {
        x.lineWidth = m * 0.035; for (const d of [-1, 1]) { x.beginPath(); x.arc(cx + d * m * 0.3, cy + m * 0.12, m * 0.2, 0, Math.PI * 2); x.stroke(); }
        x.beginPath(); x.moveTo(cx - m * 0.3, cy + m * 0.12); x.lineTo(cx - m * 0.05, cy - m * 0.15); x.lineTo(cx + m * 0.2, cy - m * 0.15); x.lineTo(cx + m * 0.3, cy + m * 0.12); x.moveTo(cx - m * 0.05, cy - m * 0.15); x.lineTo(cx + m * 0.02, cy + m * 0.12); x.lineTo(cx + m * 0.2, cy - m * 0.15); x.stroke();
      } else if (s.kind === 'meal') {
        for (let i = 0; i < 3; i++) { const X = s.w * (0.2 + i * 0.3); x.fillStyle = '#1f1f1f'; rr(X - m * 0.13, cy - m * 0.2, m * 0.26, m * 0.4, 30); x.fillStyle = ['#22c55e', '#f59e0b', `hsl(${s.hue} 70% 55%)`][i]; x.beginPath(); x.arc(X, cy - m * 0.05, m * 0.07, 0, Math.PI * 2); x.fill(); x.fillStyle = '#e5e5e5'; rr(X - m * 0.09, cy + m * 0.06, m * 0.18, m * 0.08, 20); }
      }
      if (s.label) { x.fillStyle = '#fff'; x.font = `700 ${Math.round(m * 0.07)}px Impact, Arial Narrow, sans-serif`; x.textAlign = 'left'; x.fillText(s.label, m * 0.06, s.h - m * 0.07); }
      x.fillStyle = 'rgba(255,255,255,.35)'; x.font = `600 ${Math.round(m * 0.03)}px sans-serif`; x.textAlign = 'right'; x.fillText('SAMPLE IMAGE', s.w - m * 0.05, m * 0.07);
      return c.toDataURL(s.f.endsWith('.png') ? 'image/png' : 'image/jpeg', 0.9);
    }, s);
    let buf = new Uint8Array(Buffer.from(url.split(',')[1], 'base64'));
    if (s.exif) buf = withExif(buf, buildExifApp1(s.exif));
    writeFileSync(SAMPLES + s.f, buf);
    if (s.mtime) { const t = new Date(s.mtime); utimesSync(SAMPLES + s.f, t, t); }
  }
  writeFileSync(SAMPLES + 'IMG_0420.heic', Buffer.from('not really a heic file — tests the friendly error'));
  writeFileSync(SAMPLES + 'notes.pdf', Buffer.from('%PDF-1.4 fake'));
  await page.close();
  console.log('samples in', SAMPLES);
}

async function run(kind, browser) {
  const phone = kind === 'phone';
  const page = await browser.newPage();
  await page.emulateTimezone('America/New_York');
  await page.setViewport(phone ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width: 1440, height: 900, deviceScaleFactor: 1 });
  if (phone) await page.setUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36');
  const dl = DL + kind + '/';
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${kind}] console.error: ${m.text()} @ ${page.url()}`); });
  page.on('pageerror', (e) => errors.push(`[${kind}] pageerror: ${e.message}`));
  page.on('response', (r) => { if (r.status() >= 400 && r.url().startsWith('http://localhost')) errors.push(`[${kind}] HTTP ${r.status()}: ${r.url()}`); });
  const shot = async (name, full = false) => {
    await sleep(700);
    await page.evaluate((f) => { let st = document.getElementById('shot-css'); if (!st) { st = document.createElement('style'); st.id = 'shot-css'; document.head.appendChild(st); } st.textContent = `.toast{display:none!important}${f ? '.bottom-nav{display:none!important}' : ''}`; }, full);
    await page.screenshot({ path: `${OUT}${name}.png`, fullPage: full });
    await page.evaluate(() => { const st = document.getElementById('shot-css'); if (st) st.textContent = ''; });
    console.log('shot', name);
  };
  const go = async (path, wait = 900) => { await page.evaluate((p) => { history.pushState({}, '', p); dispatchEvent(new PopStateEvent('popstate')); }, '/hybrd' + path); await sleep(wait); };
  const clickText = async (txt, sel = 'button, a') => {
    const ok = await page.evaluate((t, s) => { const el = [...document.querySelectorAll(s)].find((e) => e.textContent.trim().includes(t)); if (el) { el.click(); return true; } return false; }, txt, sel);
    if (!ok) throw new Error(`no element with text ${txt}`); await sleep(350);
  };
  const text = () => page.evaluate(() => document.body.innerText);
  const check = (cond, msg) => { if (!cond) errors.push(`[${kind}] ${msg}`); else console.log('ok', kind, msg); };
  const waitFor = async (fn, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await sleep(250); } return false; };
  const downloads = () => readdirSync(dl).filter((f) => !f.endsWith('.crdownload'));
  const idbBlobs = () => page.evaluate(() => new Promise((res) => {
    const r = indexedDB.open('hybrd-media'); r.onsuccess = () => {
      const tx = r.result.transaction('blobs'); const st = tx.objectStore('blobs'); const out = []; const cur = st.openCursor();
      cur.onsuccess = async () => { const c = cur.result; if (c) { out.push([c.key, c.value]); c.continue(); } else {
        const find = (u, str) => { const n = [...str].map((ch) => ch.charCodeAt(0)); outer: for (let i = 0; i + n.length <= u.length; i++) { for (let j = 0; j < n.length; j++) if (u[i + j] !== n[j]) continue outer; return true; } return false; };
        const info = []; for (const [k, b] of out) { const u = new Uint8Array(await b.arrayBuffer()); info.push({ k, type: b.type, size: b.size, exif: find(u, 'Exif'), gps: find(u, 'GPS') }); } res(info); } };
    };
  }));
  const tiles = () => page.$$eval('[data-testid="g-tile"]', (e) => e.length);

  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await clickText('Get started');
  await page.type('input[autocomplete="given-name"]', 'José Cruz');
  await clickText('Continue'); await clickText('Continue'); await clickText('Continue');
  await clickText('HYROX'); await clickText('Running');
  await clickText('Continue');
  await clickText('Explore with sample data first');
  await sleep(1500);

  // ----- initials fallback -----
  check(!!(await page.$('[data-testid="home-avatar"] [data-testid="avatar-initials"]')), 'Home greeting shows initials avatar before a photo');
  await go('/me');
  check((await page.$eval('[data-testid="avatar-button"]', (e) => e.textContent)).includes('JC'), 'Me: initials “JC” fallback');

  // ----- profile photo: pick → crop → save -----
  await page.click('[data-testid="avatar-button"]'); await sleep(400);
  check(/Choose a photo/.test(await text()) && /Take a selfie/.test(await text()), 'Avatar menu: choose / selfie');
  const camInput = await page.$('input[capture="user"]');
  check(!!camInput, 'Selfie input uses capture="user"');
  await (await page.$('[data-testid="avatar-input"]')).uploadFile(SAMPLES + 'avatar-source.jpg');
  check(await waitFor(() => page.$('.crop-stage img')), 'Crop editor opens with the photo');
  await page.evaluate(() => { const i = document.querySelector('.crop-zoom input'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, '1.35'); i.dispatchEvent(new Event('input', { bubbles: true })); });
  await sleep(200);
  const st = await page.$('.crop-stage'); const bb = await st.boundingBox();
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await page.mouse.down(); await page.mouse.move(bb.x + bb.width / 2 + 30, bb.y + bb.height / 2 + 10, { steps: 6 }); await page.mouse.up();
  if (phone) await shot('phone-avatar-crop');
  await page.click('[data-testid="avatar-save"]');
  check(await waitFor(() => page.$('.me-head [data-testid="avatar-img"]')), 'Avatar saved and shown in Me header');
  const av = (await idbBlobs()).find((b) => String(b.k).startsWith('avatar:'));
  check(av && av.size < 200 * 1024 && /webp|jpeg/.test(av.type), `Avatar stored in IndexedDB as ${av?.type} ${Math.round((av?.size || 0) / 1024)} KB`);
  const avDims = await page.$eval('.me-head img', (i) => [i.naturalWidth, i.naturalHeight]);
  check(avDims[0] === 512 && avDims[1] === 512, `Avatar is 512×512 (got ${avDims})`);
  if (phone) check(!!(await page.$('.bottom-nav .bn-me [data-testid="avatar-img"]')) && !!(await page.$('.topbar .top-av [data-testid="avatar-img"]')), 'Avatar in bottom nav + top bar');
  else check(!!(await page.$('.side-nav .side-me [data-testid="avatar-img"]')), 'Avatar in desktop sidebar');

  // ----- gallery: empty → bad files → upload many -----
  await page.click('[data-testid="open-gallery"]'); await sleep(900);
  check(page.url().endsWith('/me/gallery') && /Your photo gallery/i.test(await text()), 'Gallery empty state');
  const gin = await page.$('[data-testid="g-input"]');
  check(await gin.evaluate((i) => i.multiple && /image\/jpeg/.test(i.accept)), 'Gallery input: multiple, images only');
  await gin.uploadFile(SAMPLES + 'IMG_0420.heic', SAMPLES + 'notes.pdf');
  await waitFor(async () => /only photos can be added/i.test(await text()) && /HEIC/.test(await text()));
  const bt = await text();
  check(/notes\.pdf: only photos can be added/.test(bt), 'PDF refused with a friendly message');
  check(/can’t open HEIC/.test(bt), 'Undecodable HEIC → friendly HEIC message');
  await clickText('Cancel', '.sheet button');
  const files = SPECS.filter((s) => s.kind !== 'avatar').map((s) => SAMPLES + s.f);
  await gin.uploadFile(...files);
  check(await waitFor(async () => (await page.$$('.up-row')).length === files.length, 30000), `Upload sheet lists ${files.length} photos`);
  const ut = await text();
  check(/Location data \(GPS\) found in 2 photos/.test(ut), 'GPS found in 2 photos → removal banner');
  check(/date from photo/.test(ut) && /date from file/.test(ut), 'Dates picked from EXIF and file dates');
  // tag + caption: first three progress, last "other"
  await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.up-row')];
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    rows.forEach((r, i) => {
      const tag = i < 3 ? 'Progress' : i === 7 ? 'Other' : 'Training';
      [...r.querySelectorAll('.chip')].find((c) => c.textContent === tag).click();
      const cap = ['Start of the cut', 'Halfway', 'Week 11 — leaner', 'Back squat 5×5', '', 'Tempo run, felt strong', 'FTP test 248 W', 'Sunday meal prep'][i];
      if (cap) { const inp = r.querySelector('input[aria-label="Caption"]'); set.call(inp, cap); inp.dispatchEvent(new Event('input', { bubbles: true })); }
    });
  });
  await sleep(400);
  await page.evaluate(() => document.querySelector('.sheet-body').scrollTo(0, 0));
  if (phone) await shot('phone-gallery-upload');
  await page.click('[data-testid="g-save"]');
  check(await waitFor(async () => (await tiles()) === files.length), `Grid shows ${files.length} photos`);
  await sleep(800);
  const gt = await text();
  check(/November 2026/i.test(gt) && /October 2026/i.test(gt) && /September 2026/i.test(gt), 'Grid grouped by month');
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(phone ? 'phone-gallery-grid' : 'desktop-gallery');

  // ----- privacy: stored blobs carry no EXIF / GPS -----
  const blobs = await idbBlobs();
  const g = blobs.filter((b) => String(b.k).startsWith('g:'));
  check(g.length === files.length * 3, `3 blobs per photo in IndexedDB (orig/disp/thumb) = ${g.length}`);
  check(g.every((b) => !b.exif && !b.gps), 'No stored image contains Exif/GPS metadata');
  check(g.filter((b) => b.k.endsWith(':disp')).every((b) => b.type === 'image/webp'), 'View copies are WebP');
  check(g.some((b) => b.k.endsWith(':orig') && b.type === 'image/png'), 'PNG original stays PNG');
  const u = await page.$eval('[data-testid="g-usage"]', (e) => e.textContent);
  check(/8 photos · [\d.]+ (MB|KB)/.test(u), `Storage used shown (${u})`);
  check(/GPS location and other hidden metadata are removed/.test(gt) && /No sharing, no public feed/.test(gt), 'Privacy note shown');

  // ----- filter -----
  await clickText('Progress', '.g-filters .chip'); await sleep(500);
  check((await tiles()) === 3 && page.url().includes('tag=progress'), 'Filter Progress → 3');
  await clickText('Other', '.g-filters .chip'); await sleep(400);
  check((await tiles()) === 1, 'Filter Other → 1');
  await clickText('All', '.g-filters .chip'); await sleep(400);

  // ----- viewer -----
  await page.click('[data-testid="g-tile"]'); await sleep(900);
  check(!!(await page.$('[data-testid="g-viewer"] .gv-stage img')), 'Viewer opens');
  const c1 = await page.$eval('.gv-top .mono', (e) => e.textContent);
  if (phone) {
    // swipe left → next
    await page.evaluate(() => { const v = document.querySelector('.gv'); const t = (x) => new Touch({ identifier: 1, target: v, clientX: x, clientY: 400 }); v.dispatchEvent(new TouchEvent('touchstart', { touches: [t(300)], bubbles: true })); v.dispatchEvent(new TouchEvent('touchend', { changedTouches: [t(120)], bubbles: true })); });
  } else await page.keyboard.press('ArrowRight');
  await sleep(700);
  const c2 = await page.$eval('.gv-top .mono', (e) => e.textContent);
  check(c1 === '1 / 8' && c2 === '2 / 8', `Viewer ${phone ? 'swipe' : 'arrow key'} → next (${c1} → ${c2})`);
  if (!phone) { await page.click('.gv-nav.next'); await sleep(500); check((await page.$eval('.gv-top .mono', (e) => e.textContent)) === '3 / 8', 'Viewer next arrow button'); await page.click('.gv-nav.prev'); await sleep(500); }
  await sleep(600);
  if (phone) await shot('phone-gallery-viewer');
  else await shot('desktop-gallery-viewer');
  // download single original
  await page.click('[data-testid="gv-download"]');
  check(await waitFor(() => downloads().length === 1), 'Single download saved');
  const one = downloads()[0];
  const ob = readFileSync(dl + one);
  check(/^hybrd-2026-\d\d-\d\d-(progress|training|other)-[\w-]+\.(jpg|png)$/.test(one), `Download name ${one}`);
  check(!ob.includes(Buffer.from('Exif')) && ob.length > 50 * 1024, `Downloaded original is full quality (${Math.round(ob.length / 1024)} KB) with no Exif`);
  await page.keyboard.press('Escape'); await sleep(400);
  check(!(await page.$('[data-testid="g-viewer"]')), 'Esc closes viewer');

  // ----- select, compare, zip, delete -----
  await clickText('Progress', '.g-filters .chip'); await sleep(500);
  await page.click('[data-testid="g-select"]'); await sleep(300);
  const t = await page.$$('[data-testid="g-tile"]');
  await t[0].click(); await t[2].click(); await sleep(300);
  check((await page.$eval('[data-testid="g-selbar"]', (e) => e.textContent)).includes('2 selected'), 'Multi-select: 2 selected');
  check(await page.$eval('[data-testid="g-compare-btn"]', (b) => !b.disabled), 'Compare enabled with exactly 2');
  if (phone) await shot('phone-gallery-select');
  else await shot('desktop-gallery-select');
  await page.click('[data-testid="g-compare-btn"]'); await sleep(900);
  const ct = await text();
  check(!!(await page.$('[data-testid="g-compare"]')) && /75 days apart/i.test(ct) && /Before/.test(ct) && /After/.test(ct), 'Compare: before/after, 75 days apart (Sep 1 → Nov 15)');
  await shot(phone ? 'phone-gallery-compare' : 'desktop-gallery-compare');
  await page.click('[data-testid="g-compare"] .gv-top .icon-btn'); await sleep(400);
  await clickText('All', '.g-selbar .link');
  await page.click('[data-testid="g-dl-sel"]');
  check(await waitFor(() => downloads().some((f) => f.endsWith('.zip')), 20000), 'ZIP download of selected');
  const zipf = dl + downloads().find((f) => f.endsWith('.zip'));
  const py = execFileSync('python3', ['-c', `import zipfile; z=zipfile.ZipFile('${zipf}'); print(z.testzip()); print(len(z.namelist())); print(any(b'Exif' in z.read(n) for n in z.namelist()))`]).toString().trim().split('\n');
  check(py[0] === 'None' && py[1] === '3' && py[2] === 'False', `ZIP valid, 3 photos, no Exif (${py.join(' ')})`);
  // delete one with confirm
  await clickText('None', '.g-selbar .link'); const t2 = await page.$$('[data-testid="g-tile"]'); await t2[1].click(); await sleep(200);
  await page.click('[aria-label="Delete selected"]'); await sleep(400);
  check(/Delete photo\?/i.test(await text()) && /can’t be undone/.test(await text()), 'Delete asks to confirm');
  await page.click('[data-testid="g-confirm-delete"]'); await sleep(900);
  check((await tiles()) === 2, 'Deleted → 2 progress photos left');
  check((await idbBlobs()).filter((b) => String(b.k).startsWith('g:')).length === (files.length - 1) * 3, 'Deleted photo’s blobs removed from IndexedDB');

  // ----- persistence after reload (offline storage) -----
  await page.reload({ waitUntil: 'networkidle0' }); await sleep(1500);
  await go('/me/gallery');
  check(await waitFor(async () => (await tiles()) === files.length - 1), 'After reload: 7 photos still there (IndexedDB)');
  await go('/me'); await sleep(800);
  check(!!(await page.$('.me-head [data-testid="avatar-img"]')), 'After reload: avatar still there');
  await page.evaluate(() => window.scrollTo(0, 0));
  if (phone) await shot('phone-me-avatar');
  else await shot('desktop-me-avatar');
  await go('/'); await sleep(800);
  check(!!(await page.$('[data-testid="home-avatar"] [data-testid="avatar-img"]')), 'Home greeting shows the photo');
  if (phone) await shot('phone-home-avatar');
  await page.close();
}

const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
await makeSamples(browser);
for (const k of ['phone', 'desktop']) {
  const dl = DL + k + '/'; rmSync(dl, { recursive: true, force: true }); mkdirSync(dl, { recursive: true });
  const ctx = await browser.createBrowserContext({ downloadBehavior: { policy: 'allow', downloadPath: dl } });
  const b2 = { newPage: () => ctx.newPage() };
  try { await run(k, b2); } catch (e) { errors.push(`[${k}] crashed: ${e.message}`); console.error(errors.join('\n')); throw e; }
  await ctx.close();
}
await browser.close();
if (errors.length) { console.error('\nERRORS:\n' + errors.join('\n')); process.exit(1); }
console.log('\nall gallery screenshot checks passed');
