// Screenshots + checks for Me › Gallery videos (phone + desktop). Sample videos are generated with ffmpeg (abstract
// motion graphics + text, no people); one iPhone-style MOV carries a real location tag + recording date to prove the
// location is removed without changing the video data. Needs `node tools/serve.mjs` running on :4173 and ffmpeg.
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, utimesSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const BASE = 'http://localhost:4173/hybrd/';
const OUT = new URL('../screenshots/', import.meta.url).pathname;
const S = '/tmp/hybrd-video-samples/';
const DL = '/tmp/hybrd-video-downloads/';
const FONT = '/usr/share/fonts/truetype/sand-box/google/Oswald/Oswald-VariableFont_wght.ttf';
const LOC = '+40.7128-074.0060+010.000/';
const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ff = (args) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: ['ignore', 'pipe', 'inherit'] });

function makeSamples() {
  rmSync(S, { recursive: true, force: true }); mkdirSync(S, { recursive: true });
  const txt = (t, size, x, y, color = 'white') => `drawtext=fontfile=${FONT}:text='${t}':fontcolor=${color}:fontsize=${size}:x=${x}:y=${y}`;
  const clip = ({ out, w, h, d, c1, title, sub, args = [], vcodec = ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac'] }) => ff([
    '-f', 'lavfi', '-i', `gradients=s=${w}x${h}:c0=0x101010:c1=${c1}:d=${d}:r=30:speed=0.012`,
    '-f', 'lavfi', '-i', `color=c=0xFFE600:s=${Math.round(w * 0.26)}x${Math.round(h * 0.09)}:d=${d}:r=30`,
    '-f', 'lavfi', '-i', `sine=f=196:d=${d}`,
    '-filter_complex', `[0][1]overlay=x='${Math.round(w * 0.06)}+(t/${d})*(W-w-${Math.round(w * 0.12)})':y=H*0.62-h,drawbox=x=iw*0.06:y=ih*0.62:w=iw*0.88:h=6:color=0x666666:t=fill,${txt(title, Math.round(w * 0.13), 'w*0.06', 'h*0.2')},${txt(sub, Math.round(w * 0.06), 'w*0.065', 'h*0.2+' + Math.round(w * 0.17), '0xFFE600')},${txt('SAMPLE VIDEO', Math.round(w * 0.04), 'w-tw-24', '30', 'white@0.45')}[v]`,
    '-map', '[v]', '-map', '2:a', '-shortest', ...vcodec, ...args, S + out]);
  // iPhone-style MOV: location in meta/keys (com.apple.quicktime.location.ISO6709) + recording date
  clip({ out: 'IMG_0412.MOV', w: 720, h: 1280, d: 12, c1: '0x3a3200', title: 'SLED PUSH', sub: '25 m · 4 rounds', args: ['-movflags', 'use_metadata_tags', '-metadata', `com.apple.quicktime.location.ISO6709=${LOC}`, '-metadata', 'com.apple.quicktime.make=Apple', '-metadata', 'creation_time=2026-11-12T18:30:00Z'] });
  clip({ out: 'rower-500m.mp4', w: 1280, h: 720, d: 8, c1: '0x0a2a3a', title: 'ROWER 500 M', sub: 'Avg split 1m52s per 500 m', args: ['-metadata', 'creation_time=2026-11-08T07:10:00Z'] });
  clip({ out: 'box-jumps.webm', w: 640, h: 640, d: 6, c1: '0x3a1a0a', title: 'BOX JUMPS', sub: '3 × 10 @ 24 in', vcodec: ['-c:v', 'libvpx-vp9', '-b:v', '600k', '-deadline', 'realtime', '-cpu-used', '8', '-c:a', 'libopus'] });
  utimesSync(S + 'box-jumps.webm', new Date('2026-10-30T18:00:00'), new Date('2026-10-30T18:00:00'));
  // too long (6:10) — tiny and cheap
  ff(['-f', 'lavfi', '-i', 'color=c=0x222222:s=160x90:d=370:r=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', S + 'long-run.mp4']);
  writeFileSync(S + 'clip.avi', Buffer.from('RIFF....AVI fake'));
  // two photos (abstract, labelled)
  for (const [f, label, c, date] of [['progress-week6.jpg', 'WEEK 6', '0x3a3200', '2026-10-13T07:05:00'], ['progress-week11.jpg', 'WEEK 11', '0x3a3200', '2026-11-15T08:00:00'], ['kb-emom.jpg', 'KB EMOM', '0x3a1a0a', '2026-11-10T06:40:00']]) {
    ff(['-f', 'lavfi', '-i', `gradients=s=1500x2000:c0=0x101010:c1=${c}:d=1`, '-frames:v', '1', '-vf', `drawbox=x=iw*0.34:y=ih*0.3:w=iw*0.32:h=ih*0.42:color=0xFFE600:t=fill,drawbox=x=iw*0.42:y=ih*0.16:w=iw*0.16:h=ih*0.12:color=0xFFE600:t=fill,${txt(label, 130, 'w*0.06', 'h-200')},${txt('SAMPLE IMAGE', 48, 'w-tw-60', '60', 'white@0.4')}`, '-q:v', '3', S + f]);
    utimesSync(S + f, new Date(date), new Date(date));
  }
  console.log('samples in', S);
}

async function run(kind, browser) {
  const phone = kind === 'phone';
  const page = await browser.newPage();
  await page.emulateTimezone('America/New_York');
  await page.setViewport(phone ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width: 1440, height: 900, deviceScaleFactor: 1 });
  if (phone) await page.setUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36');
  const dl = DL + kind + '/';
  let last = 'start';
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${kind}] console.error: ${m.text()} @ ${page.url()} (after: ${last})`); });
  page.on('pageerror', (e) => errors.push(`[${kind}] pageerror: ${e.message}`));
  page.on('response', (r) => { if (r.status() >= 400 && r.url().startsWith('http://localhost')) errors.push(`[${kind}] HTTP ${r.status()}: ${r.url()}`); });
  const shot = async (name) => {
    await sleep(700);
    await page.evaluate(() => { let st = document.getElementById('shot-css'); if (!st) { st = document.createElement('style'); st.id = 'shot-css'; document.head.appendChild(st); } st.textContent = '.toast{display:none!important}'; });
    await page.screenshot({ path: `${OUT}${name}.png` });
    await page.evaluate(() => { const st = document.getElementById('shot-css'); if (st) st.textContent = ''; });
    console.log('shot', name);
  };
  const go = async (path, wait = 900) => { await page.evaluate((p) => { history.pushState({}, '', p); dispatchEvent(new PopStateEvent('popstate')); }, '/hybrd' + path); await sleep(wait); };
  const clickText = async (txt, sel = 'button, a') => {
    const ok = await page.evaluate((t, s) => { const el = [...document.querySelectorAll(s)].find((e) => e.textContent.trim().includes(t)); if (el) { el.click(); return true; } return false; }, txt, sel);
    if (!ok) throw new Error(`no element with text ${txt}`); await sleep(350);
  };
  const text = () => page.evaluate(() => document.body.innerText);
  const check = (cond, msg) => { last = msg; if (!cond) errors.push(`[${kind}] ${msg}`); else console.log('ok', kind, msg); };
  const waitFor = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await sleep(250); } return false; };
  const downloads = () => readdirSync(dl).filter((f) => !f.endsWith('.crdownload'));
  const tiles = (k) => page.$$eval(`[data-testid="g-tile"]${k ? `[data-kind="${k}"]` : ''}`, (e) => e.length);
  const idb = () => page.evaluate(() => new Promise((res) => {
    const r = indexedDB.open('hybrd-media'); r.onsuccess = () => {
      const st = r.result.transaction('blobs').objectStore('blobs'); const out = []; const cur = st.openCursor();
      cur.onsuccess = async () => { const c = cur.result; if (c) { out.push([c.key, c.value]); c.continue(); } else {
        const info = []; for (const [k, b] of out) { const u = new Uint8Array(await b.arrayBuffer()); const s = new TextDecoder('latin1').decode(u); info.push({ k, type: b.type, size: b.size, loc: s.includes('+40.7128'), make: s.includes('com.apple.quicktime.make') }); } res(info); } };
    };
  }));
  const noOverflow = async (where) => check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `no horizontal overflow (${where})`);

  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.evaluate((() => ['agree-terms', 'consent-location', 'consent-health'].forEach((t) => { const el = document.querySelector(`[data-testid="${t}"]`); if (el && !el.checked) el.click(); }))); await clickText('Get started');
  await page.type('input[autocomplete="given-name"]', 'José Cruz');
  await clickText('Continue'); await clickText('Continue'); await clickText('Continue');
  await clickText('HYROX'); await clickText('Running');
  await clickText('Continue');
  await clickText('Explore with sample data first');
  await sleep(1500);

  await go('/me/gallery');
  const t0 = await text();
  check(/photo & video gallery/i.test(t0) && /5:00/.test(t0) && /200 MB/.test(t0), 'Empty state mentions videos + caps (5:00, 200 MB)');
  check(!!(await page.$('[data-testid="g-types"]')), 'Type filter (All / Photos / Videos) is shown');
  check(phone === !!(await page.$('[data-testid="g-record"]')), phone ? 'Phone: Record video button' : 'Desktop: no Record button');
  const recAccept = await page.$eval('[data-testid="g-rec-input"]', (e) => [e.accept, e.getAttribute('capture')].join('|'));
  check(recAccept === 'video/*|environment', 'Record input = video/* + capture=environment');
  check(/video\/mp4/.test(await page.$eval('[data-testid="g-input"]', (e) => e.accept)), 'Library input accepts videos');

  // refused files: too long + AVI
  const gin = await page.$('[data-testid="g-input"]');
  await gin.uploadFile(S + 'long-run.mp4', S + 'clip.avi');
  await waitFor(async () => /limit is 5:00/.test(await text()), 20000);
  const tr = await text();
  check(/long-run\.mp4 is 6:10 long — the limit is 5:00/.test(tr), '6:10 video refused with the 5:00 limit');
  check(/clip\.avi: (only photos .* and videos \(MP4, MOV, WebM\)|this video type isn’t supported\. Use MP4, MOV or WebM)/.test(tr), 'AVI refused with a friendly message');
  await clickText('Cancel', '[data-testid="g-upload"] button'); await sleep(400);

  // upload 3 videos + 3 photos together
  const files = ['IMG_0412.MOV', 'rower-500m.mp4', 'box-jumps.webm', 'progress-week6.jpg', 'progress-week11.jpg', 'kb-emom.jpg'];
  await gin.uploadFile(...files.map((f) => S + f));
  check(await waitFor(async () => (await page.$$('[data-testid="g-upload"] .up-row')).length === 6), 'Upload sheet shows 6 drafts');
  const ut = await text();
  check(/Add 3 photos & 3 videos/i.test(ut), 'Sheet title: Add 3 photos & 3 videos');
  check(/Location tags found in 1 video — removed/.test(ut), 'Location found in the iPhone MOV → removed banner');
  check(/Video · 0:12 · 720×1280/.test(ut) && /date from video/.test(ut), 'MOV draft: 0:12, 720×1280, date from video');
  check(/Video · 0:08 · 1280×720/.test(ut), 'MP4 draft: 0:08, 1280×720');
  check(/Video · 0:06 · 640×640/.test(ut), 'WebM draft: 0:06 (MediaRecorder-style duration read), 640×640');
  check(/HYBRD removes the location tags iPhone and Android cameras write/.test(ut), 'Privacy note about video location shown');
  const dates = await page.$$eval('[data-testid="g-upload"] input[type="date"]', (e) => e.map((x) => x.value));
  check(dates[0] === '2026-11-12', `MOV date from its recording time (${dates[0]})`);
  // tag the sled video Training, the progress photos Progress
  await page.evaluate(() => { const rows = [...document.querySelectorAll('[data-testid="g-upload"] .up-row')]; const tagRow = (i, label) => [...rows[i].querySelectorAll('button.chip')].find((b) => b.textContent === label).click(); tagRow(2, 'Other'); tagRow(3, 'Progress'); tagRow(4, 'Progress'); });
  await page.type('[data-testid="g-upload"] .up-row:nth-child(1) input[aria-label="Caption"]', 'Sled push 4 × 25 m — felt strong');
  await page.$eval('[data-testid="g-upload"]', (e) => e.closest('.sheet, [role="dialog"]')?.scrollTo?.(0, 0));
  if (phone) await shot('phone-gallery-video-upload');
  await page.click('[data-testid="g-save"]');
  check(await waitFor(async () => (await tiles()) === 6), 'Saved: 6 tiles');
  check((await tiles('video')) === 3, '3 video tiles');
  const durs = await page.$$eval('[data-testid="g-dur"]', (e) => e.map((x) => x.textContent));
  check(durs.includes('0:12') && durs.includes('0:08') && durs.includes('0:06'), `Duration badges ${durs.join(',')}`);
  check((await page.$$('.g-tile.vid .g-play')).length === 3, 'Play icon on video tiles');

  // IndexedDB: original bytes kept (same size), location gone, other tags kept
  const blobs = await idb();
  const mov = blobs.find((b) => b.type === 'video/quicktime');
  check(!!mov && mov.size === statSync(S + 'IMG_0412.MOV').size, `MOV stored at original size (${mov?.size})`);
  check(mov && !mov.loc && mov.make, 'Stored MOV: location gone, make tag kept');
  check(blobs.filter((b) => b.type.startsWith('video/')).length === 3 && blobs.filter((b) => String(b.k).startsWith('g:')).length === 18, '3 video originals + posters/thumbs in IndexedDB (18 blobs)');
  check(blobs.some((b) => b.type === 'video/webm') && blobs.some((b) => b.type === 'video/mp4'), 'WebM + MP4 kept in their containers');

  const ust = await page.$eval('[data-testid="g-usage"]', (e) => e.textContent);
  check(/3 photos · 3 videos/.test(ust), `Usage line: ${ust}`);
  check(!!(await page.$('[data-testid="g-quota"]')), 'Browser storage bar shown');

  // filters
  await page.click('[data-testid="g-type-video"]'); await sleep(500);
  check((await tiles()) === 3 && (await tiles('photo')) === 0 && page.url().includes('type=video'), 'Videos filter: only the 3 videos (?type=video)');
  await clickText('Training', '.g-filters button'); await sleep(400);
  check((await tiles()) === 2 && page.url().includes('tag=training') && page.url().includes('type=video'), 'Videos + Training: 2 (filters combine)');
  await clickText('All tags', '.g-filters button'); await sleep(400);
  if (phone) await shot('phone-gallery-videos');
  await page.click('[data-testid="g-type-photo"]'); await sleep(400);
  check((await tiles()) === 3 && (await tiles('video')) === 0, 'Photos filter: only photos');
  await page.click('[data-testid="g-type-all"]'); await sleep(400);
  await noOverflow('gallery');
  if (!phone) { await page.evaluate(() => window.scrollTo(0, 0)); await shot('desktop-gallery-videos'); }

  // viewer: open the sled push video
  await page.evaluate(() => [...document.querySelectorAll('[data-testid="g-tile"]')].find((t) => /0:12/.test(t.textContent)).click());
  check(await waitFor(async () => page.$eval('[data-testid="gv-video"]', (v) => v.readyState >= 2).catch(() => false)), 'Video loads in the viewer');
  const vs = await page.$eval('[data-testid="gv-video"]', (v) => ({ muted: v.muted, controls: v.controls, inline: v.playsInline, loop: v.loop, poster: !!v.poster }));
  check(vs.muted && vs.controls && vs.inline && !vs.loop && vs.poster, `Inline, native controls, muted by default, poster (${JSON.stringify(vs)})`);
  check(await waitFor(async () => page.$eval('[data-testid="gv-video"]', (v) => !v.paused && v.currentTime > 0.3)), 'Autoplays muted');
  await page.click('[data-testid="gv-loop"]'); await sleep(200);
  check(await page.$eval('[data-testid="gv-video"]', (v) => v.loop), 'Loop toggle turns loop on');
  await page.keyboard.press('m'); await sleep(200);
  check(await page.$eval('[data-testid="gv-video"]', (v) => !v.muted), '"M" unmutes');
  await page.keyboard.press('m'); await sleep(200);
  const vt = await text();
  check(/Location data was removed from this video/.test(vt) && /Sled push 4 × 25 m/.test(vt) && /0:12 · 720×1280/.test(vt), 'Viewer info: location removed, caption, 0:12 · 720×1280');
  await sleep(1500);
  await page.$eval('[data-testid="gv-video"]', (v) => { v.pause(); v.currentTime = 6; });
  await sleep(900);
  if (phone) await shot('phone-gallery-video-player');
  // single download: original size, no location
  const before = downloads().length;
  await page.click('[data-testid="gv-download"]');
  check(await waitFor(async () => downloads().length === before + 1), 'Video downloaded');
  const vf = downloads().find((f) => f.endsWith('.mov'));
  const vb = vf ? readFileSync(dl + vf) : Buffer.alloc(0);
  check(!!vf && vb.length === statSync(S + 'IMG_0412.MOV').size && !vb.includes(Buffer.from('+40.7128')), `Download ${vf}: original size, no location`);
  if (vf) {
    const probe = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:format_tags', '-of', 'json', dl + vf]).toString();
    check(!/40\.7128/.test(probe) && /"duration": "12/.test(probe), 'ffprobe on the download: 12 s, no location tag');
    let ok = true; try { ff(['-xerror', '-i', dl + vf, '-f', 'null', '-']); } catch { ok = false; }
    check(ok, 'Downloaded video decodes cleanly');
    check(execFileSync('ffmpeg', ['-v', 'error', '-i', dl + vf, '-map', '0:v', '-f', 'md5', '-']).toString() === execFileSync('ffmpeg', ['-v', 'error', '-i', S + 'IMG_0412.MOV', '-map', '0:v', '-f', 'md5', '-']).toString(), 'Downloaded video frames identical to the original (no re-encode)');
  }
  // swipe / keys between videos and photos
  const idx0 = await page.$eval('.gv-top .mono', (e) => e.textContent);
  await page.keyboard.press('ArrowRight'); await sleep(500);
  const idx1 = await page.$eval('.gv-top .mono', (e) => e.textContent);
  check(idx0 !== idx1, `ArrowRight moves on (${idx0} → ${idx1})`);
  if (phone) {
    const box = await page.$eval('.gv-stage', (e) => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height * 0.3 }; });
    await page.touchscreen.touchStart(box.x + 120, box.y); await page.touchscreen.touchMove(box.x - 80, box.y); await page.touchscreen.touchEnd(); await sleep(500);
    const idx2 = await page.$eval('.gv-top .mono', (e) => e.textContent);
    check(idx2 !== idx1, `Swipe left moves on (${idx1} → ${idx2})`);
  }
  await page.keyboard.press('Escape'); await sleep(400);
  check(!(await page.$('[data-testid="g-viewer"]')), 'Esc closes the viewer');

  // select: video + photo → compare disabled; zip both
  await page.click('[data-testid="g-select"]'); await sleep(300);
  await page.evaluate(() => { const t = [...document.querySelectorAll('[data-testid="g-tile"]')]; t.find((x) => x.dataset.kind === 'video' && /0:08/.test(x.textContent)).click(); t.find((x) => x.dataset.kind === 'photo').click(); });
  await sleep(300);
  check(await page.$eval('[data-testid="g-compare-btn"]', (b) => b.disabled), 'Compare disabled for photo + video');
  const zb = downloads().length;
  await page.click('[data-testid="g-dl-sel"]');
  check(await waitFor(async () => downloads().length === zb + 1 && downloads().some((f) => f.endsWith('.zip'))), 'ZIP of a video + a photo downloaded');
  const zf = downloads().find((f) => f.endsWith('.zip'));
  if (zf) {
    const py = execFileSync('python3', ['-c', `import zipfile; z=zipfile.ZipFile('${dl + zf}'); print(z.testzip()); print(sorted(i.filename.rsplit('.',1)[1]+':'+str(i.file_size) for i in z.infolist()))`]).toString().trim().split('\n');
    check(py[0] === 'None' && py[1].includes(`mp4:${statSync(S + 'rower-500m.mp4').size}`) && py[1].includes('jpg:'), `ZIP valid, MP4 at original size ${py[1]}`);
  }
  // two photos → compare enabled
  await page.evaluate(() => { const t = [...document.querySelectorAll('[data-testid="g-tile"]')]; t.filter((x) => x.classList.contains('sel') && x.dataset.kind === 'video').forEach((x) => x.click()); t.filter((x) => x.dataset.kind === 'photo' && !x.classList.contains('sel'))[0].click(); });
  await sleep(300);
  check(!(await page.$eval('[data-testid="g-compare-btn"]', (b) => b.disabled)), 'Compare enabled for two photos');
  await page.click('[data-testid="g-select"]'); await sleep(300);

  // Me preview + Social picker stays photos-only
  await go('/me'); await sleep(600);
  check(/3 videos/.test(await page.$eval('.gallery-preview', (e) => e.textContent)), 'Me › Gallery preview counts videos');
  check((await page.$$('.gallery-preview .gp-thumb')).length === 4, 'Me preview shows 4 latest');

  // persistence + delete a video
  await page.reload({ waitUntil: 'networkidle0' }); await sleep(1500);
  await go('/me/gallery');
  check(await waitFor(async () => (await tiles()) === 6 && (await tiles('video')) === 3), 'After reload: 6 items, 3 videos (IndexedDB)');
  await page.evaluate(() => [...document.querySelectorAll('[data-testid="g-tile"]')].find((t) => /0:06/.test(t.textContent)).click());
  await sleep(600);
  await page.click('[aria-label="Delete video"]'); await sleep(300);
  check(/Delete video\?/i.test(await text()), 'Delete sheet says "video"');
  await page.click('[data-testid="g-confirm-delete"]'); await sleep(700);
  await page.keyboard.press('Escape'); await sleep(300);
  check((await tiles('video')) === 2 && !(await idb()).some((b) => b.type === 'video/webm'), 'Deleted video + its blobs removed');
  await page.close();
}

makeSamples();
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-gpu', '--autoplay-policy=no-user-gesture-required'] });
for (const k of ['phone', 'desktop']) {
  const dl = DL + k + '/'; rmSync(dl, { recursive: true, force: true }); mkdirSync(dl, { recursive: true });
  const ctx = await browser.createBrowserContext({ downloadBehavior: { policy: 'allow', downloadPath: dl } });
  try { await run(k, { newPage: () => ctx.newPage() }); } catch (e) { errors.push(`[${k}] crashed: ${e.stack}`); }
  await ctx.close();
}
await browser.close();
if (errors.length) { console.error('\nERRORS:\n' + errors.join('\n')); process.exit(1); }
console.log('\nall gallery video screenshot checks passed');
