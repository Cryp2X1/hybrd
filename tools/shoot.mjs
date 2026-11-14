import puppeteer from 'puppeteer-core';
const BASE = 'http://localhost:4173/hybrd/';
const OUT = new URL('../screenshots/', import.meta.url).pathname;
const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run(kind) {
  const phone = kind === 'phone';
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-gpu', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.createBrowserContext();
  // phone: motion sensors allowed (sensor path); desktop: motion denied (tests the GPS-estimate fallback)
  await ctx.overridePermissions('http://localhost:4173', phone ? ['geolocation', 'accelerometer', 'gyroscope'] : ['geolocation']);
  const page = await ctx.newPage();
  await page.setViewport(phone ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width: 1440, height: 900, deviceScaleFactor: 1 });
  if (phone) await page.setUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36');
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${kind}] console.${m.type()}: ${m.text()} @ ${page.url()}`); });
  page.on('pageerror', (e) => errors.push(`[${kind}] pageerror: ${e.message} @ ${page.url()}`));
  page.on('requestfailed', (r) => { const u = r.url(); if (!u.includes('tile.openstreetmap.org')) errors.push(`[${kind}] requestfailed: ${u} ${r.failure()?.errorText}`); });
  page.on('response', (r) => { if (r.status() >= 400 && !r.url().includes('openstreetmap')) errors.push(`[${kind}] HTTP ${r.status()}: ${r.url()}`); });
  const shot = async (name, full = false) => { await sleep(700); await page.screenshot({ path: `${OUT}${kind}-${name}.png`, fullPage: full }); console.log('shot', kind, name); };
  const go = async (path, wait = 900) => {
    // in-app navigation (like tapping a link) so the SPA router handles it
    await page.evaluate((p) => { history.pushState({}, '', p); dispatchEvent(new PopStateEvent('popstate')); }, '/hybrd' + path);
    await sleep(wait);
  };
  const clickText = async (txt, sel = 'button, a') => {
    const ok = await page.evaluate((t, s) => { const el = [...document.querySelectorAll(s)].find((e) => e.textContent.trim().includes(t)); if (el) { el.click(); return true; } return false; }, txt, sel);
    if (!ok) throw new Error(`no element with text ${txt}`);
    await sleep(350);
  };

  // synthetic accelerometer: ~2.75 steps/s (165 spm) walking/running signal, like a phone in hand
  const startMotion = () => page.evaluate(() => { clearInterval(window.__mot); window.__mot = setInterval(() => { const t = performance.now(); const z = 9.81 + 3.2 * Math.sin(2 * Math.PI * 2.75 * t / 1000) + (Math.random() - 0.5) * 0.6; window.dispatchEvent(new DeviceMotionEvent('devicemotion', { accelerationIncludingGravity: { x: 0.4, y: 0.3, z }, interval: 16 })); }, 16); });
  const stopMotion = () => page.evaluate(() => clearInterval(window.__mot));
  const readSteps = () => page.evaluate(() => { const st = document.querySelector('[data-testid="steps"] .stat-v'); return st ? st.textContent : null; });
  const scrollTo = (sel) => page.evaluate((s) => { const el = document.querySelector(s); if (el) { el.scrollIntoView({ block: 'start' }); window.scrollBy(0, -70); } return !!el; }, sel);

  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await shot('01-onboarding-welcome');
  await clickText('Get started');
  await page.type('input[autocomplete="given-name"]', 'José');
  await shot('02-onboarding-about');
  await clickText('Continue'); await clickText('Continue'); await clickText('Continue');
  await clickText('HYROX'); await clickText('Running'); await clickText('Calisthenics');
  await clickText('Continue');
  await shot('03-onboarding-targets');
  await clickText('Explore with sample data first');
  await sleep(1200);
  await shot('04-home');
  if (phone) await shot('04b-home-full', true);
  await go('/score'); await shot('05-hybrid-score', !phone);
  await go('/train'); await shot('06-train-programs');
  await go('/train/program/hyrox-prep'); await shot('07-program-hyrox', true);
  await go('/train?tab=library'); await shot('08-exercise-library');
  await go('/train/exercise/pull-up'); await shot('09-exercise-detail');
  await go('/train/log?program=cali-foundations&session=a'); await shot('10-workout-logger');
  await page.evaluate(() => localStorage.removeItem('hybrd:draft'));
  await go('/train?tab=history'); await shot('11-history');
  // find a run with a route
  await page.evaluate(() => { const a = [...document.querySelectorAll('a.row-link')].find((x) => x.textContent.includes('Long Run')); a && a.click(); });
  await sleep(2500); await shot('12-workout-run-map', phone);
  await page.evaluate(() => history.back()); await sleep(500);
  await page.evaluate(() => { const a = [...document.querySelectorAll('a.row-link')].find((x) => x.textContent.includes('HYROX Simulation')); a && a.click(); });
  await sleep(1000); await shot('13-hyrox-split-board', true);
  await go('/routes', 2500); await shot('14-route-history');
  await go('/record'); await shot('15-record-idle');
  // live GPS: emulate movement
  const cdp = await page.createCDPSession();
  let lat = 40.7812, lng = -73.9665;
  await cdp.send('Emulation.setGeolocationOverride', { latitude: lat, longitude: lng, accuracy: 6 });
  if (phone) await startMotion();
  await clickText('Start Run');
  for (let i = 0; i < 40; i++) { lat += 0.00003; lng += 0.000015; await cdp.send('Emulation.setGeolocationOverride', { latitude: lat, longitude: lng, accuracy: 6 }); await sleep(500); }
  await shot('16-record-live');
  const liveSteps = await readSteps();
  console.log(kind, 'live steps', liveSteps);
  if (phone) { const n = parseInt((liveSteps || '').replace(/\D/g, ''), 10); if (!(n >= 40 && n <= 70) || /est/.test(liveSteps)) errors.push(`[${kind}] steps: sensor count off (${liveSteps}, expected ~55)`); await shot('record-steps'); }
  else if (!/est/.test(liveSteps || '')) errors.push(`[${kind}] steps: desktop should fall back to "est." (${liveSteps})`);
  await clickText('Show map'); await sleep(2500); await shot('17-record-live-map', phone);
  // --- units: one-tap mi | km on the live screen converts the display instantly ---
  const readStat = () => page.evaluate(() => { const st = [...document.querySelectorAll('.stat')].find((e) => /^(mi|km)$/i.test(e.querySelector('.stat-l')?.textContent.trim() || '')); return st ? { v: parseFloat(st.querySelector('.stat-v').textContent), u: st.querySelector('.stat-l').textContent.trim().toLowerCase() } : null; });
  const before = await readStat();
  await page.click('.unit-tog button[data-unit="km"]'); await sleep(400);
  const after = await readStat();
  console.log(kind, 'live distance', before, '->', after);
  if (!before || !after || before.u !== 'mi' || after.u !== 'km' || Math.abs(after.v - before.v * 1.609344) > 0.02) errors.push(`[${kind}] units: live mi->km conversion wrong ${JSON.stringify({ before, after })}`);
  // pause, then load a longer (3.4 km) session so splits are visible, and resume it
  await page.evaluate(() => document.querySelector('button[aria-label="Pause"]')?.click()); await sleep(300);
  const endPt = await page.evaluate(() => {
    const hav = (a, b) => { const R = 6371008.8, r = Math.PI / 180, dLa = (b.lat - a.lat) * r, dLo = (b.lng - a.lng) * r; const h = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
    const now = Date.now(), pts = []; let lat = 40.7680, lng = -73.9710, d = 0, e = 0;
    const t0 = now - 1300 * 1000;
    for (let i = 0; d < 3400; i++) {
      const v = 3.0 + 0.25 * Math.sin(i / 40); // ~5:20–5:50 /km
      if (i) { lat += (v * 3 * 0.86) / 111195; lng += (v * 3 * 0.5) / (111195 * Math.cos(lat * Math.PI / 180)); }
      const p = { lat, lng, alt: 30 + 8 * Math.sin(i / 60), t: t0 + e, acc: 5 };
      if (pts.length) d += hav(pts[pts.length - 1], p);
      p.e = e; p.d = Math.round(d * 10) / 10; pts.push(p); e += 3000;
    }
    const E = pts[pts.length - 1].e, pausedAt = now - 2000;
    const st = { steps: 4380, motion: 'granted', status: 'paused', type: 'run', indoor: false, autoPause: true, startedAt: pausedAt - E, pausedAt, autoPaused: false, accPauseMs: 0, segments: [pts], distanceM: d, elevGainM: 24, splits: [], splitUnitM: 1000, lastAcc: 5, lastFixAt: pausedAt, gaps: [], error: '', dropped: 0 };
    localStorage.setItem('hybrd:rec', JSON.stringify(st));
    return pts[pts.length - 1];
  });
  await cdp.send('Emulation.setGeolocationOverride', { latitude: endPt.lat, longitude: endPt.lng, accuracy: 6 });
  await page.goto(BASE + 'record', { waitUntil: 'networkidle0' }); await sleep(800);
  if (phone) await startMotion();
  await page.click('button[aria-label="Resume"]'); await sleep(1200);
  const splitsOf = () => page.evaluate(() => [...document.querySelectorAll('[data-testid="live-splits"] > div')].map((d) => d.textContent));
  const kmSplits = await splitsOf();
  await shot('record-units-km');
  await page.click('.unit-tog button[data-unit="mi"]'); await sleep(500);
  const miSplits = await splitsOf();
  const miDist = await readStat();
  await shot('record-units-mi');
  console.log(kind, 'splits km', kmSplits, 'mi', miSplits, 'dist', miDist);
  if (!kmSplits.length || !kmSplits[0].startsWith('km 3') || !miSplits[0]?.startsWith('mi 2') || !miDist || miDist.u !== 'mi' || Math.abs(miDist.v - 2.11) > 0.03) errors.push(`[${kind}] units: mid-session split recompute wrong ${JSON.stringify({ kmSplits, miSplits, miDist })}`);
  // back to km and check another screen follows instantly, then reset to mi
  await page.evaluate(() => document.querySelector('button[aria-label="Pause"]')?.click()); await sleep(300);
  await stopMotion();
  await page.evaluate(() => localStorage.removeItem('hybrd:rec'));
  await page.goto(BASE + 'train?tab=history', { waitUntil: 'networkidle0' }); await sleep(600);
  const histMi = await page.evaluate(() => /\d+\.\d+ mi/.test(document.body.innerText) && !/\d+\.\d+ km/.test(document.body.innerText));
  await go('/me'); await page.click('.unit-tog button[data-unit="km"]'); await go('/train?tab=history');
  const histKm = await page.evaluate(() => /\d+\.\d+ km/.test(document.body.innerText));
  if (!histMi || !histKm) errors.push(`[${kind}] units: history did not follow the setting ${JSON.stringify({ histMi, histKm })}`);
  await go('/me'); await page.click('.unit-tog button[data-unit="mi"]'); await sleep(300);
  await shot('me-units');
  await go('/timers'); await page.click('button[aria-label="Start"]'); await sleep(2300); await page.click('button[aria-label="Lap"]'); await sleep(1800); await page.click('button[aria-label="Lap"]'); await sleep(1500); await shot('18-timer-stopwatch');
  await go('/timers?t=tabata'); await clickText('Start'); await sleep(6500); await shot('19-timer-tabata');
  await go('/timers?t=emom'); await shot('20-timer-emom-setup');
  await go('/timers?t=hyrox'); await shot('21-hyrox-sim-start');
  await clickText('Start simulation'); await sleep(1200); await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Next →'))?.click()); await sleep(1200); await shot('22-hyrox-sim-live');
  await page.evaluate(() => localStorage.removeItem('hybrd:t:hyrox'));
  await go('/fuel'); await shot('23-fuel-log', phone ? false : true);
  if (phone) await shot('23b-fuel-log-full', true);
  await go('/fuel/add?meal=lunch', 1800); await page.type('input[placeholder^="Search 7,283"]', 'chicken breast'); await sleep(800); await shot('24-food-search');
  await page.evaluate(() => document.querySelector('.food-row')?.click()); await sleep(600); await shot('25-food-add-sheet');
  await page.keyboard.press('Escape');
  await go('/fuel?tab=recipes'); await shot('26-recipes');
  await go('/fuel/recipe/drink-diy-electrolyte'); await shot('27-recipe-detail', true);
  await go('/fuel?tab=guide'); await shot('28-nutrition-guide');
  await go('/fuel?tab=sources'); await shot('29-sources', true);
  await go('/fuel/calculator'); await shot('30-tdee-calculator');
  await go('/progress', 1200); await shot('31-progress', !phone);
  await go('/me'); await shot('32-me');
  await go('/me/account'); await shot('33-account-local-mode');
  await go('/sign-in'); await shot('34-sign-in');
  await go('/me/data'); await shot('35-data');
  await go('/me/help'); await shot('36-help', true);
  // steps screens
  await go('/', 1200); await scrollTo('.steps-card'); await shot('home-steps');
  await go('/progress', 1200); await scrollTo('.steps-progress'); await shot('progress-steps');
  // manual entry: add, then set a full-day total (recorded steps must not be double counted)
  await go('/', 1000);
  const ringTotal = () => page.evaluate(() => parseInt(document.querySelector('.steps-card .sr-num').textContent.replace(/\D/g, ''), 10));
  const t0 = await ringTotal();
  await clickText('Enter steps', '.steps-card button');
  await page.type('.steps-card input[aria-label="Steps"]', '2000'); await clickText('Add', '.steps-card button.btn.y'); await sleep(400);
  const t1 = await ringTotal();
  await page.evaluate(() => [...document.querySelectorAll('.steps-card .seg button')].find((b) => b.textContent.includes('Set day total'))?.click()); await sleep(200);
  await page.type('.steps-card input[aria-label="Steps"]', '12000'); await clickText('Set', '.steps-card button.btn.y'); await sleep(400);
  const t2 = await ringTotal();
  console.log(kind, 'steps manual', t0, '->', t1, '->', t2);
  if (t1 !== t0 + 2000 || t2 !== 12000) errors.push(`[${kind}] steps: manual entry wrong ${t0} -> ${t1} -> ${t2}`);
  // direct deep-link load (GitHub Pages copies)
  await page.goto(BASE + 'fuel', { waitUntil: 'networkidle0' });
  await sleep(500);
  const sw = await page.evaluate(async () => !!(await navigator.serviceWorker?.getRegistration()));
  console.log(kind, 'service worker registered:', sw);
  await browser.close();
}
await run('phone');
await run('desktop');
console.log('\nERRORS:', errors.length); errors.forEach((e) => console.log(e));
