// Phone screenshots for Indoor / Stationary Bike: Train tiles, live record (no map), and a program workout.
import puppeteer from 'puppeteer-core';
const BASE = 'http://localhost:4173/hybrd/';
const OUT = new URL('../screenshots/', import.meta.url).pathname;
const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  const ctx = await browser.createBrowserContext();
  await ctx.overridePermissions('http://localhost:4173', ['geolocation']);
  const page = await ctx.newPage();
  await page.emulateTimezone('America/New_York');
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.setUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36');
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`console.${m.type()}: ${m.text()} @ ${page.url()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('response', (r) => { if (r.status() >= 400 && r.url().startsWith('http://localhost') && !r.url().includes('openstreetmap')) errors.push(`HTTP ${r.status()}: ${r.url()}`); });

  const shot = async (name, full = false) => { await sleep(600); await page.screenshot({ path: `${OUT}${name}.png`, fullPage: full }); console.log('shot', name); };
  const clickText = async (txt, sel = 'button, a') => {
    const ok = await page.evaluate((t, s) => { const el = [...document.querySelectorAll(s)].find((e) => e.textContent.trim().includes(t)); if (el) { el.click(); return true; } return false; }, txt, sel);
    if (!ok) throw new Error(`no element with text ${txt}`);
    await sleep(400);
  };
  const go = async (path, wait = 900) => {
    await page.evaluate((p) => { history.pushState({}, '', p); dispatchEvent(new PopStateEvent('popstate')); }, '/hybrd' + path);
    await sleep(wait);
  };

  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.evaluate((() => ['agree-terms', 'consent-location', 'consent-health'].forEach((t) => { const el = document.querySelector(`[data-testid="${t}"]`); if (el && !el.checked) el.click(); }))); await clickText('Get started');
  await page.type('input[autocomplete="given-name"]', 'José');
  await clickText('Continue'); await clickText('Continue'); await clickText('Continue');
  await clickText('Cycling'); await clickText('Continue');
  await clickText('Start training');
  await page.waitForFunction(() => !document.body.innerText.includes('Your daily targets'), { timeout: 15000 });
  await sleep(600);

  // Train: Indoor Bike + Stationary Bike tiles should be at the top
  await go('/train');
  const tiles = await page.evaluate(() => {
    const root = document.querySelector('[data-testid="train-indoor-bikes"]');
    if (!root) return { ok: false, text: '' };
    return { ok: true, text: root.textContent, hasMap: !!root.querySelector('.map, .leaflet-container') };
  });
  if (!tiles.ok) errors.push('Train indoor tiles missing');
  if (!/Indoor Bike/.test(tiles.text) || !/Stationary Bike/.test(tiles.text)) errors.push(`Train tiles text unexpected: ${tiles.text.slice(0, 200)}`);
  if (tiles.hasMap) errors.push('Train indoor tiles unexpectedly contain a map');
  await shot('phone-train-indoor-bike');

  // Live indoor bike session — no map
  await go('/record?type=indoor-cycle&kind=indoor', 800);
  const idle = await page.evaluate(() => ({
    title: document.body.innerText,
    hasMap: !!document.querySelector('.map, .leaflet-container'),
  }));
  if (!/Indoor Bike/.test(idle.title)) errors.push('Record idle missing Indoor Bike');
  if (!/no GPS|timer only/i.test(idle.title)) errors.push('Record idle should say no GPS / timer only');
  if (idle.hasMap) errors.push('Record idle for indoor bike showed a map');
  await clickText('Start Indoor Bike');
  await sleep(25000);
  const live = await page.evaluate(() => ({
    text: document.body.innerText,
    hasMap: !!document.querySelector('.map, .leaflet-container'),
    hasGpsPill: /GPS\s*±/.test(document.body.innerText),
    hasLive: !!document.querySelector('[data-testid="record-live"]'),
  }));
  if (!live.hasLive) errors.push('Live session root missing');
  if (live.hasMap) errors.push('FAIL live indoor session showed a map');
  if (live.hasGpsPill) errors.push('FAIL live indoor session showed a GPS accuracy pill');
  if (!/Recording|Indoor Bike/.test(live.text)) errors.push('Live session missing Recording / Indoor Bike label');
  await shot('phone-record-indoor-bike');

  // Stop the live session so the Record tab is not "LIVE" over the program page
  await page.evaluate(() => localStorage.removeItem('hybrd:rec'));
  await page.goto(BASE + 'train/program/indoor-bike', { waitUntil: 'networkidle0' });
  await sleep(800);
  const prog = await page.evaluate(() => document.body.innerText);
  if (!/Recovery Spin/.test(prog) || !/4 × 4 min Intervals/.test(prog) || !/HIIT Sprints/.test(prog) || !/Endurance Ride/.test(prog)) {
    errors.push('Program missing expected sessions');
  }
  if (!/Open interval timer/.test(prog) || !/Start indoor session/.test(prog)) {
    errors.push('Program missing start / timer buttons');
  }
  await shot('phone-indoor-bike-workout', true);

  // Also a tighter crop of the intervals card: scroll to 4x4 and shoot the viewport
  await page.evaluate(() => {
    const h = [...document.querySelectorAll('h3')].find((e) => e.textContent.includes('4 × 4 min Intervals'));
    if (h) h.scrollIntoView({ block: 'center' });
  });
  await shot('phone-indoor-bike-intervals');

  await browser.close();
  const noise = errors.filter((e) => !/Failed to load resource/.test(e));
  if (noise.length) { console.error('\nISSUES'); for (const e of noise) console.error(' -', e); process.exit(2); }
  console.log('indoor-bike screenshots ok');
}

run().catch((e) => { console.error(e); process.exit(1); });
