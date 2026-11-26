// Screenshots + checks for the Burn (calories burned) tracker: phone Day / Week / Home ring / Add sheet, and desktop.
// Needs `node tools/serve.mjs` running on :4173.
import puppeteer from 'puppeteer-core';
const BASE = 'http://localhost:4173/hybrd/';
const OUT = new URL('../screenshots/', import.meta.url).pathname;
const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run(kind) {
  const phone = kind === 'phone';
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  const ctx = await browser.createBrowserContext();
  await ctx.overridePermissions('http://localhost:4173', ['geolocation']);
  const page = await ctx.newPage();
  await page.emulateTimezone('America/New_York');
  await page.setGeolocation({ latitude: 40.7128, longitude: -74.006, accuracy: 15 });
  await page.setViewport(phone ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width: 1440, height: 900, deviceScaleFactor: 1 });
  if (phone) await page.setUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36');
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${kind}] console.${m.type()}: ${m.text()} @ ${page.url()}`); });
  page.on('pageerror', (e) => errors.push(`[${kind}] pageerror: ${e.message}`));
  page.on('response', (r) => { if (r.status() >= 400 && r.url().startsWith('http://localhost')) errors.push(`[${kind}] HTTP ${r.status()}: ${r.url()}`); });
  const shot = async (name, full = false) => { await sleep(700); await page.screenshot({ path: `${OUT}${name}.png`, fullPage: full }); console.log('shot', name); };
  const go = async (path, wait = 900) => { await page.evaluate((p) => { history.pushState({}, '', p); dispatchEvent(new PopStateEvent('popstate')); }, '/hybrd' + path); await sleep(wait); };
  const clickText = async (txt, sel = 'button, a') => {
    const ok = await page.evaluate((t, s) => { const el = [...document.querySelectorAll(s)].find((e) => e.textContent.trim().includes(t)); if (el) { el.click(); return true; } return false; }, txt, sel);
    if (!ok) throw new Error(`no element with text ${txt}`); await sleep(400);
  };
  const text = () => page.evaluate(() => document.body.innerText);
  const check = (cond, msg) => { if (!cond) errors.push(`[${kind}] ${msg}`); else console.log('ok', kind, msg); };

  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.evaluate((() => ['agree-terms', 'consent-location', 'consent-health'].forEach((t) => { const el = document.querySelector(`[data-testid="${t}"]`); if (el && !el.checked) el.click(); }))); await clickText('Get started');
  await page.type('input[autocomplete="given-name"]', 'José');
  await clickText('Continue'); await clickText('Continue'); await clickText('Continue');
  await clickText('HYROX'); await clickText('Running');
  await clickText('Continue');
  await clickText('Explore with sample data first');
  await sleep(1500);

  if (phone) {
    // Home ring
    const has = await page.evaluate(() => { const el = document.querySelector('[data-testid="home-burn-ring"]'); if (el) el.closest('.card').scrollIntoView({ block: 'start' }); window.scrollBy(0, -70); return !!el; });
    check(has, 'Home burn ring present');
    const t = await text(); check(/Calories burned/i.test(t) && /active kcal/i.test(t), 'Home ring labels');
    await shot('phone-home-burn-ring');

    await go('/burn');
    const d = await text();
    check(/Active/i.test(d) && /Resting/i.test(d) && /Total/i.test(d) && /Steps · daily movement/i.test(d), 'Burn day: active / resting / total / steps');
    check(/Net balance/i.test(d), 'Burn day: net balance card');
    check(!!(await page.$('[data-testid="burn-today"]')), 'Burn day hero');
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot('phone-burn-today');

    await go('/burn?view=week');
    const w = await text();
    check(/Last 7 days/i.test(w) && /By activity/i.test(w) && /Top burning sessions/i.test(w), 'Burn week: chart, breakdown, top sessions');
    await shot('phone-burn-week');
    await shot('phone-burn-week-full', true);
    await clickText('Total', '.burn-mode button'); await sleep(300);
    check(/total burn/i.test(await text()), 'Total toggle switches the chart');
    await clickText('Month'); await sleep(300);
    check(/Last 30 days/i.test(await text()), 'Month view');
    await shot('phone-burn-month');

    // Add sheet: pick rowing, 40 min → MET estimate shows; then save and confirm it appears and can be edited/deleted
    await go('/burn');
    await clickText('Add activity');
    await page.select('[data-testid="burn-form"] select', 'row');
    await page.evaluate(() => { const i = [...document.querySelectorAll('[data-testid="burn-form"] input')].find((x) => x.closest('label')?.textContent.includes('Minutes')); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, '40'); i.dispatchEvent(new Event('input', { bubbles: true })); });
    await sleep(300);
    const f = await text();
    check(/7 MET × 75 kg × 0\.67 h/.test(f) && /350/.test(f), `Add sheet: MET estimate 7 × 75 × 0.67 h = 350 kcal`);
    await shot('phone-burn-add');
    await clickText('Add 350 kcal');
    await sleep(500);
    check(/Rowing/.test(await text()), 'Added entry appears in the day list');
    await clickText('Rowing', 'button.burn-row');
    check(/Edit burned calories/i.test(await text()), 'Edit sheet opens');
    await clickText('Delete');
    await sleep(400);
    check(!/Rowing/.test(await page.evaluate(() => document.querySelector('.desk-grid')?.innerText || '')), 'Entry deleted');

    // Info sheet
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.click('button[aria-label="How burn is estimated"]'); await sleep(400);
    const inf = await text();
    check(/Keytel/.test(inf) && /Mifflin/.test(inf) && /Compendium/.test(inf) && /ACSM/.test(inf), 'Info sheet cites Keytel, Mifflin-St Jeor, Compendium, ACSM');
    check(!/\d+\s?%\s*(accura|error)/i.test(inf), 'Info sheet has no accuracy percentages');
    await shot('phone-burn-info');
  } else {
    await go('/burn');
    check(/Burn/.test(await page.evaluate(() => document.querySelector('.side-nav')?.innerText || '')), 'Desktop side-nav has Burn');
    await shot('desktop-burn');
    await go('/burn?view=week'); await shot('desktop-burn-week');
    await go('/'); await shot('desktop-home-burn');
  }
  await browser.close();
}

(async () => {
  for (const k of ['phone', 'desktop']) await run(k);
  const noise = errors.filter((e) => !/Failed to load resource|tile\.openstreetmap/.test(e));
  if (noise.length) { console.error('\nISSUES'); for (const e of noise) console.error(' -', e); process.exit(2); }
  console.log('\nburn screenshots ok');
})().catch((e) => { console.error(e); process.exit(1); });
