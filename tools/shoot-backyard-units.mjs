// Screenshots + checks for backyard distance units (mi / km / m / ft).
// Needs `node tools/serve.mjs` on :4173 after a production build.
import puppeteer from 'puppeteer-core';
const BASE = 'http://localhost:4173/hybrd/';
const OUT = new URL('../screenshots/', import.meta.url).pathname;
const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function onboard(page) {
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  const clickText = async (txt, sel = 'button, a') => {
    const ok = await page.evaluate((t, s) => { const el = [...document.querySelectorAll(s)].find((e) => e.textContent.trim().includes(t)); if (el) { el.click(); return true; } return false; }, txt, sel);
    if (!ok) throw new Error(`no element with text ${txt}`); await sleep(350);
  };
  await clickText('Get started');
  await page.type('input[autocomplete="given-name"]', 'José');
  await clickText('Continue'); await clickText('Continue'); await clickText('Continue');
  await clickText('HYROX'); await clickText('Running');
  await clickText('Continue');
  await clickText('Explore with sample data first');
  await sleep(1500);
}

async function run(kind) {
  const phone = kind === 'phone';
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.emulateTimezone('America/New_York');
  await page.setViewport(phone ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width: 1440, height: 900, deviceScaleFactor: 1 });
  if (phone) await page.setUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36');
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
  const check = (cond, msg) => { if (!cond) errors.push(`[${kind}] ${msg}`); else console.log('ok', kind, msg); };
  const top = () => page.evaluate(() => window.scrollTo(0, 0));
  const text = () => page.evaluate(() => document.body.innerText);
  const clickUnit = async (u) => {
    const ok = await page.evaluate((v) => { const b = document.querySelector(`[data-testid="byu-unit-${v}"]`); if (!b) return false; b.click(); return true; }, u);
    if (!ok) throw new Error(`no unit button ${u}`);
    await sleep(400);
  };
  const seedRace = async () => {
    await page.evaluate(() => {
      const m = 60000, now = Date.now(), st = now - (3 * 60 + 20) * m;
      localStorage.setItem('hybrd:t:byu', JSON.stringify({ start: st, finishes: [st + 48 * m, st + 60 * m + 51 * m, st + 120 * m + 49 * m], stopped: null, lapMin: 50, goal: 24 }));
    });
    await page.reload({ waitUntil: 'networkidle0' });
    await sleep(1200);
  };

  await onboard(page);
  await go('/timers?t=backyard&yards=24&lap=50');
  check(!!(await page.$('[data-testid="byu-start"]')), 'Backyard timer setup');
  check(!!(await page.$('[data-testid="byu-unit-tog"]')), 'Unit toggle on setup');
  check(!!(await page.$('[data-testid="byu-yard-table"]')), 'Yards-to-distance table on setup');
  const explain = await page.$eval('[data-testid="byu-explain"]', (e) => e.textContent).catch(() => '');
  check(/A yard = one loop/.test(explain), `Explainer: ${explain}`);
  const equals = await page.$eval('[data-testid="byu-equals"]', (e) => e.textContent).catch(() => '');
  check(/24 yards = 100 mi = 160\.9 km = 160,934 m = 528,000 ft/.test(equals), `Equals line: ${equals}`);
  const unitsBefore = await page.evaluate(() => {
    // global units live on the profile in the React store; read the Me toggle later. Snapshot body + any mi/km toggle.
    return document.body.innerText;
  });
  const defaultOn = await page.$eval('[data-testid="byu-unit-tog"] button.on', (e) => e.getAttribute('data-unit')).catch(() => '');
  check(defaultOn === 'mi' || defaultOn === 'km', `Default unit follows global mi/km: ${defaultOn}`);

  await top();
  if (phone) await shot('phone-backyard-units-picker', true);

  const globalBefore = await page.evaluate(() => {
    const b = document.querySelector('.unit-tog:not(.byu-unit-tog) button.on');
    return b ? b.getAttribute('data-unit') : null;
  });

  await clickUnit('m');
  const onM = await page.$eval('[data-testid="byu-unit-m"]', (e) => e.getAttribute('aria-checked') === 'true');
  check(onM, 'Clicked metres');
  const bodyM = await text();
  check(/6,706 m/.test(bodyM) && /160,934 m/.test(bodyM), 'Setup in metres shows 6,706 m loop and 160,934 m for 24 yards');

  if (!phone) {
    await top();
    await shot('desktop-backyard-units', true);
  }

  await seedRace();
  const yards = await page.$eval('[data-testid="byu-yards"]', (e) => e.textContent).catch(() => '');
  const distM = await page.$eval('[data-testid="byu-dist"]', (e) => e.textContent).catch(() => '');
  check(yards.startsWith('3') && distM === '20,117 m', `Running timer in m: ${yards} · ${distM}`);
  check(!!(await page.$('[data-testid="byu-unit-tog"]')), 'Toggle stays on the running timer');
  const laps = await text();
  check(/20,117 m/.test(laps) && /\/km/.test(laps) && /Yard 3/.test(laps), `Yard history + pace per km in metres mode: has /km=${/\/km/.test(laps)} yard3=${/Yard 3/.test(laps)}`);
  if (phone) { await top(); await shot('phone-backyard-units-m'); }

  await clickUnit('ft');
  const distFt = await page.$eval('[data-testid="byu-dist"]', (e) => e.textContent).catch(() => '');
  check(distFt === '66,000 ft', `Running timer in ft: ${distFt}`);
  const bodyFt = await text();
  check(/\/mi/.test(bodyFt) && /66,000 ft/.test(bodyFt), `Feet mode shows pace per mile and 66,000 ft: has /mi=${/\/mi/.test(bodyFt)}`);
  if (phone) { await top(); await shot('phone-backyard-units-ft'); }

  // Global units must be unchanged (no mi/km DistToggle was used). Confirm on Me.
  await page.evaluate(() => localStorage.removeItem('hybrd:t:byu'));
  await go('/me');
  const globalAfter = await page.$eval('.unit-tog button.on[data-unit="mi"], .unit-tog button.on[data-unit="km"]', (e) => e.getAttribute('data-unit')).catch(() => '');
  if (globalBefore) check(globalAfter === globalBefore, `Global units unchanged: ${globalBefore} → ${globalAfter}`);
  else check(globalAfter === 'mi' || globalAfter === 'km', `Global units still mi or km (not m/ft): ${globalAfter}`);
  check(!['m', 'ft'].includes(globalAfter), 'Global toggle is still only mi/km');

  // History of a saved backyard workout renders in the chosen unit (ft still selected)
  await page.evaluate(() => {
    // no direct store access; we'll open a workout by injecting via idb after save path is hard.
  });
  void unitsBefore;
  await browser.close();
}

await run('phone');
await run('desktop');
if (errors.length) { console.error('\nERRORS:\n' + errors.join('\n')); process.exit(1); }
console.log('\nall backyard-units screenshots done, no console errors');
