// Screenshots + checks for Train › Ultra & Backyard: entry cards, landing, screening + safety block, readiness, plan week,
// session sheet + session timer, backyard lap timer, fuelling, prep, research (phone + desktop). Needs `node tools/serve.mjs` on :4173.
import puppeteer from 'puppeteer-core';
const BASE = 'http://localhost:4173/hybrd/';
const OUT = new URL('../screenshots/', import.meta.url).pathname;
const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
    // hide toasts, and the fixed bottom nav on full-page captures (it would be painted mid-page)
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
  const setInput = async (sel, value) => {
    const ok = await page.evaluate((s, v) => { const i = document.querySelector(s); if (!i) return false; const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })); return true; }, sel, value);
    if (!ok) throw new Error(`no input ${sel}`); await sleep(250);
  };
  const setField = async (label, value) => {
    const ok = await page.evaluate((l, v) => { const i = [...document.querySelectorAll('label.field')].find((x) => x.textContent.includes(l))?.querySelector('input'); if (!i) return false; const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })); return true; }, label, value);
    if (!ok) throw new Error(`no field ${label}`); await sleep(250);
  };
  const text = () => page.evaluate(() => document.body.innerText);
  const check = (cond, msg) => { if (!cond) errors.push(`[${kind}] ${msg}`); else console.log('ok', kind, msg); };
  const top = () => page.evaluate(() => window.scrollTo(0, 0));
  const tab = async (label) => { await page.evaluate((l) => { const b = [...document.querySelectorAll('.wl-tabs button')].find((x) => x.textContent.trim() === l); b?.click(); }, label); await sleep(700); await top(); };

  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await clickText('Get started');
  await page.type('input[autocomplete="given-name"]', 'José');
  await clickText('Continue'); await clickText('Continue'); await clickText('Continue');
  await clickText('HYROX'); await clickText('Running');
  await clickText('Continue');
  await clickText('Explore with sample data first');
  await sleep(1500);


  const P = (n) => `${phone ? 'phone' : 'desktop'}-ultra-${n}`;
  await go('/train?tab=programs');
  check(!!(await page.$('[data-testid="ultra-entry"]')), 'Train: Ultra entry card (all levels)');
  await go('/train?tab=programs&level=Expert');
  check(!!(await page.$('[data-testid="ultra-entry-expert"]')), 'Train: Ultra entry card in Expert filter');
  if (phone) { await top(); await shot('phone-ultra-train-entry'); }
  await page.click('[data-testid="ultra-entry-expert"]'); await sleep(1000);
  check(page.url().endsWith('/train/ultra') && !!(await page.$('[data-testid="ultra-landing"]')), 'Entry opens /train/ultra landing');
  await top(); await shot(phone ? 'phone-ultra-landing' : 'desktop-ultra-landing', phone);

  // research + prep reachable without a plan
  await tab('Research');
  const nSrc = await page.$$eval('[data-testid="ultra-sources"] li', (l) => l.length);
  check(nSrc >= 50, `Research: ${nSrc} sources listed`);
  await top(); await shot(phone ? 'phone-ultra-research' : 'desktop-ultra-research', true);
  await tab('Plan');

  // setup: screening → safety block
  await page.click('[data-testid="ultra-start"]'); await sleep(900);
  check(/About you/i.test(await text()) && /Health check/i.test(await text()), 'Setup step 1: about you + health screening');
  await setInput('[data-testid="ultra-age"]', '34');
  await top(); await shot(P('screening'), phone);
  await clickText('Chest pain', 'label.toggle');
  await page.click('[data-testid="ultra-next"]'); await sleep(700);
  check(!!(await page.$('[data-testid="ultra-safety"]')) && /won’t build/.test(await text()), 'Chest pain → safety block, no plan');
  await top(); await shot(P('safety'), phone);
  await clickText('Back'); await clickText('Chest pain', 'label.toggle');
  // doctor gate
  await clickText('Diagnosed heart condition', 'label.toggle');
  await page.click('[data-testid="ultra-next"]'); await sleep(600);
  check(!!(await page.$('[data-testid="ultra-doctor"]')), 'Heart condition → doctor gate');
  const dis = await page.evaluate(() => [...document.querySelectorAll('.wl-foot button')].find((b) => b.textContent.includes('Continue'))?.disabled);
  check(dis === true, 'Doctor gate: Continue disabled until cleared');
  await clickText('Back'); await clickText('Diagnosed heart condition', 'label.toggle');
  await page.click('[data-testid="ultra-next"]'); await sleep(600);

  check(/Your running/i.test(await text()), 'Setup step 2: running');
  await clickText('3', '.chip');
  await setInput('[data-testid="ultra-weekly"]', '60');
  await setInput('[data-testid="ultra-longest"]', '30');
  await page.select('select', 'marathon'); await sleep(200);
  await page.click('[data-testid="ultra-next"]'); await sleep(600);
  check(/Your race/i.test(await text()), 'Setup step 3: race');
  await page.click('[data-testid="ultra-race-byu"]'); await sleep(300);
  await page.click('[data-testid="ultra-yards-24"]'); await sleep(300);
  await setInput('[data-testid="ultra-date"]', '2027-05-01');
  await clickText('Trail', '.chip');
  await page.click('[data-testid="ultra-next"]'); await sleep(600);
  check(/Your week/i.test(await text()), 'Setup step 4: week');
  await clickText('6 days', '.chip');
  await page.click('[data-testid="ultra-next"]'); await sleep(800);
  const status = await page.$eval('[data-testid="ultra-status"]', (e) => e.textContent).catch(() => '');
  const pname = await page.$eval('[data-testid="ultra-plan-name"]', (e) => e.textContent).catch(() => '');
  check(!!status && !!pname, `Readiness: "${status}" · plan "${pname}"`);
  await top(); await shot(P('readiness'), phone);
  await page.click('[data-testid="ultra-save"]'); await sleep(1300);

  // plan
  check(page.url().endsWith('/train/ultra') && !!(await page.$('[data-testid="ultra-week"]')), 'Saved → plan view with this week');
  check(!!(await page.$('[data-testid="ultra-phasebar"]')) && !!(await page.$('[data-testid="ultra-zones"]')), 'Plan: phase bar + zones');
  check(!!(await page.$('[data-testid="ultra-byu-card"]')), 'Plan: backyard timer card for a backyard target');
  await top(); await shot(P('plan-week'), phone);
  // session sheet
  await page.evaluate(() => (document.querySelector('[data-testid="ultra-week"] .k-long') || document.querySelector('[data-testid="ultra-week"] button:not(.rest)')).click()); await sleep(800);
  check(!!(await page.$('[data-testid="ultra-session"]')) && !!(await page.$('[data-testid="ultra-steps"]')), 'Session sheet with steps (fuel blocks)');
  await shot(P('session'));
  await page.click('[data-testid="ultra-open-timer"]'); await sleep(1100);
  check(page.url().includes('t=ultra') && !!(await page.$('[data-testid="ultra-timer-card"]')), 'Open session timer → ultra session in Timers');
  await top(); await shot(P('session-timer'));

  // weeks tab: a backyard simulation week
  await go('/train/ultra?tab=weeks'); await sleep(400);
  check(!!(await page.$('[data-testid="ultra-bars"]')), 'Weeks: volume bars');
  await page.evaluate(() => { const b = [...document.querySelectorAll('.coach-wtabs button')].find((x) => x.textContent.includes('SP') && !x.className.includes('lite')); b?.click(); }); await sleep(600);
  const sim = await page.$('.k-sim');
  check(!!sim, 'Specific week has a backyard simulation');
  await top(); await shot(P('weeks'), phone);
  if (sim) { await page.evaluate(() => document.querySelector('.k-sim').click()); await sleep(800); check(!!(await page.$('[data-testid="ultra-open-byu"]')), 'Simulation → backyard lap timer link'); await shot(P('session-sim')); await page.keyboard.press('Escape'); await sleep(400); }

  // backyard timer (seed a mid-race state: 3 yards done, resting before the 4th bell)
  await go('/timers?t=backyard&yards=24&lap=50');
  check(!!(await page.$('[data-testid="byu-start"]')), 'Backyard timer setup');
  if (phone) { await top(); await shot('phone-ultra-backyard-setup'); }
  await page.evaluate(() => { const m = 60000, now = Date.now(), st = now - (3 * 60 + 54) * m; localStorage.setItem('hybrd:t:byu', JSON.stringify({ start: st, finishes: [st + 48 * m, st + 60 * m + 51 * m, st + 120 * m + 49 * m], stopped: null, lapMin: 50, goal: 24 })); });
  await page.reload({ waitUntil: 'networkidle0' }); await sleep(1200);
  const yards = await page.$eval('[data-testid="byu-yards"]', (e) => e.textContent).catch(() => '');
  const dist = await page.$eval('[data-testid="byu-dist"]', (e) => e.textContent).catch(() => '');
  check(yards.startsWith('3') && /20\.117 km|12\.5 mi|20,117 m|66,000 ft/.test(dist), `Backyard: ${yards} yards · ${dist} (3 yards in the chosen unit)`);
  await page.evaluate(() => { const m = 60000, now = Date.now(), st = now - (3 * 60 + 20) * m; localStorage.setItem('hybrd:t:byu', JSON.stringify({ start: st, finishes: [st + 48 * m, st + 60 * m + 51 * m, st + 120 * m + 49 * m], stopped: null, lapMin: 50, goal: 24 })); });
  await page.reload({ waitUntil: 'networkidle0' }); await sleep(1200);
  check(!!(await page.$('[data-testid="byu-finish"]')), 'Backyard: on yard 4 → Finished yard button');
  await top(); await shot(P('backyard-timer'), phone);
  await page.click('[data-testid="byu-finish"]'); await sleep(600);
  const y2 = await page.$eval('[data-testid="byu-yards"]', (e) => e.textContent).catch(() => '');
  check(y2.startsWith('4') && /rest/i.test(await page.$eval('[data-testid="byu-phase"]', (e) => e.textContent)), 'Backyard: finish yard 4 → rest + routine');
  await top(); await shot(P('backyard-rest'), phone);
  await page.evaluate(() => localStorage.removeItem('hybrd:t:byu'));

  // fuel
  await go('/train/ultra?tab=fuel'); await sleep(500);
  check(!!(await page.$('[data-testid="fuel-schedule"]')) && !!(await page.$('[data-testid="ultra-daily"]')), 'Fuel: per-yard schedule + daily targets');
  const carbs = await page.$eval('[data-testid="fuel-carbs"]', (e) => e.textContent);
  check(/\d+–\d+/.test(carbs) && +carbs.split('–')[1].replace(/\D/g, '') <= 90, `Fuel: carbs ${carbs}/h ≤ 90`);
  const lb = /lb/.test(await page.evaluate(() => document.querySelector('[data-testid="sw-pre"]').closest('label').textContent));
  // 0.8 kg lost + 0.4 L drunk in 60 min → 1.20 L/h
  await setInput('[data-testid="sw-pre"]', lb ? String(72 * 2.20462) : '72'); await setInput('[data-testid="sw-post"]', lb ? String(71.2 * 2.20462) : '71.2'); await setInput('[data-testid="sw-drank"]', lb ? String(0.4 * 33.814) : '0.4'); await setInput('[data-testid="sw-min"]', '60');
  const sr = await page.$eval('[data-testid="sw-result"]', (e) => e.textContent);
  check(sr === '1.20 L/h', `Sweat test (${lb ? 'lb/fl oz' : 'kg/L'}) → ${sr}`);
  await page.click('[data-testid="sw-save"]'); await sleep(500);
  const fl = await page.$eval('[data-testid="fuel-fluid"]', (e) => e.textContent);
  check(+fl.split('–')[1].replace(/\D/g, '') <= 1000, `Fluid capped: ${fl}`);
  await page.click('[data-testid="ultra-apply-fuel"]'); await sleep(500);
  await top(); await shot(P('fuel'), phone);
  await go('/fuel'); await sleep(600);
  check(/Ultra plan/.test(await text()), 'Fuel page uses the ultra plan targets');
  if (phone) await shot('phone-ultra-fuel-targets');

  // prep
  await go('/train/ultra?tab=prep'); await sleep(500);
  check(!!(await page.$('[data-testid="ultra-warnings"]')) && !!(await page.$('[data-testid="ultra-taper"]')), 'Prep: warning signs + taper');
  const firstChk = await page.$('.ultra-checks input');
  await firstChk.click(); await sleep(400);
  check(await page.evaluate(() => document.querySelector('.ultra-checks input').checked), 'Prep: checklist ticks persist');
  await top(); await shot(P('prep'), true);
  await go('/train/ultra?tab=research'); await sleep(400);
  if (!phone) await shot('desktop-ultra-research-plan', false);
  await go('/train/ultra'); await sleep(400);
  if (!phone) await shot('desktop-ultra', false);
  await browser.close();
}
await run('phone');
await run('desktop');
if (errors.length) { console.error('\nERRORS:\n' + errors.join('\n')); process.exit(1); }
console.log('\nall ultra screenshots done, no console errors');
