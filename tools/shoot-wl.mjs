// Screenshots + checks for Fuel › Weight-loss programs: quiz, plan, week, grocery, progress, safety screen (phone) and desktop plan.
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
  const page = await ctx.newPage();
  await page.emulateTimezone('America/New_York');
  await page.setViewport(phone ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width: 1440, height: 900, deviceScaleFactor: 1 });
  if (phone) await page.setUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36');
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${kind}] console.error: ${m.text()} @ ${page.url()}`); });
  page.on('pageerror', (e) => errors.push(`[${kind}] pageerror: ${e.message}`));
  page.on('response', (r) => { if (r.status() >= 400 && r.url().startsWith('http://localhost')) errors.push(`[${kind}] HTTP ${r.status()}: ${r.url()}`); });
  const shot = async (name, full = false) => { await sleep(700); await page.screenshot({ path: `${OUT}${name}.png`, fullPage: full }); console.log('shot', name); };
  const go = async (path, wait = 900) => { await page.evaluate((p) => { history.pushState({}, '', p); dispatchEvent(new PopStateEvent('popstate')); }, '/hybrd' + path); await sleep(wait); };
  const clickText = async (txt, sel = 'button, a') => {
    const ok = await page.evaluate((t, s) => { const el = [...document.querySelectorAll(s)].find((e) => e.textContent.trim().includes(t)); if (el) { el.click(); return true; } return false; }, txt, sel);
    if (!ok) throw new Error(`no element with text ${txt}`); await sleep(350);
  };
  const setField = async (label, value) => {
    const ok = await page.evaluate((l, v) => { const i = [...document.querySelectorAll('label.field')].find((x) => x.textContent.includes(l))?.querySelector('input'); if (!i) return false; const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })); return true; }, label, value);
    if (!ok) throw new Error(`no field ${label}`); await sleep(250);
  };
  const text = () => page.evaluate(() => document.body.innerText);
  const check = (cond, msg) => { if (!cond) errors.push(`[${kind}] ${msg}`); else console.log('ok', kind, msg); };
  const top = () => page.evaluate(() => window.scrollTo(0, 0));

  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await clickText('Get started');
  await page.type('input[autocomplete="given-name"]', 'José');
  await clickText('Continue'); await clickText('Continue'); await clickText('Continue');
  await clickText('HYROX'); await clickText('Running');
  await clickText('Continue');
  await clickText('Explore with sample data first');
  await sleep(1500);

  check(!!(await page.$('[data-testid="wl-entry"]')), 'Home: weight-loss entry card');
  await page.click('[data-testid="wl-entry"]'); await sleep(900);
  check(/Lose fat, keep your training/i.test(await text()), 'Landing page opens from Home');
  await go('/fuel'); check(/Weight loss/i.test(await text()) && !!(await page.$('[data-testid="wl-entry"]')), 'Fuel: tab + entry card');
  await go('/fuel/weight-loss');
  await page.click('[data-testid="wl-start"]'); await sleep(800);

  // Step 1: about you
  check(/About you/i.test(await text()), 'Quiz step 1');
  const imperial = /Weight \(lb\)/i.test(await text());
  await setField('Goal weight', imperial ? '160' : '72');
  await clickText('Continue');
  check(/Health check/i.test(await text()), 'Quiz step 2 health');
  await clickText('Continue');
  check(/Pick your pace/i.test(await text()), 'Quiz step 3 pace');
  await clickText('Moderate', 'button.wl-pace');
  await clickText('Continue');
  check(/Activity & training/i.test(await text()), 'Quiz step 4 training');
  await clickText('Continue');
  check(/Food you like/i.test(await text()), 'Quiz step 5 food');
  await clickText('Mediterranean'); await clickText('Tree nuts', 'button.chip').catch(() => clickText('Nuts', 'button.chip'));
  await clickText('Halal-friendly');
  if (phone) { await top(); await shot('phone-wl-quiz'); }
  await clickText('Continue');
  const rv = await text();
  check(/Your starting point/i.test(rv) && /kcal \/ day/i.test(rv), 'Review step');
  await page.click('[data-testid="wl-build"]'); await sleep(1500);
  const pl = await text();
  check(/kcal today/i.test(pl) && /Today’s meals/i.test(pl) && /How we got this/i.test(pl), 'Plan page built');
  const names = await page.$$eval('.wl-meal .muted, .wl-meal-name', (els) => els.map((e) => e.textContent).join(' | '));
  check(!/almond|walnut|peanut|cashew|pistachio/i.test(names), 'No nut meals or sides shown today');
  if (!phone) { await sleep(2600); await top(); await shot('desktop-wl-plan'); await browser.close(); return; }
  await sleep(2600); await top(); await shot('phone-wl-plan');
  // one-tap log
  await clickText('Log', '.wl-meal-act button'); await sleep(500);
  check(/Logged/i.test(await text()), 'One-tap log marks the meal');

  await go('/fuel/weight-loss?tab=week');
  check(!!(await page.$('[data-testid="wl-week"]')), 'Week tab');
  await clickText('Thu', 'button.wl-day');
  await top(); await shot('phone-wl-week');
  await clickText('Swap', '.wl-meal-act button'); await sleep(500);
  check(/fits your diet and exclusions/i.test(await text()), 'Swap sheet');
  await page.keyboard.press('Escape'); await sleep(300);

  await go('/fuel/weight-loss?tab=grocery');
  const g = await text();
  check(/Grocery list/i.test(g) && /Produce|Protein|Pantry|Dairy/i.test(g), 'Grocery list with aisles');
  await top(); await shot('phone-wl-grocery');

  await go('/fuel/weight-loss?tab=progress');
  await setField('Weight', imperial ? '167.6' : '76.0');
  await clickText('Save weigh-in'); await sleep(500);
  const p = await text();
  check(/Weight trend/i.test(p) && /Suggestion/i.test(p), 'Progress: trend + suggestion');
  await sleep(2600); await top(); await shot('phone-wl-progress');

  await go('/fuel/weight-loss?tab=research');
  check(/All sources/i.test(await text()), 'Research tab');

  // Fuel uses the plan target
  await go('/fuel');
  check(/Weight-loss plan|weight-loss plan|plan target/i.test(await text()), 'Fuel mentions the plan target');

  // Safety screen
  await go('/fuel/weight-loss/setup');
  await clickText('Continue');
  await clickText('I have or had an eating disorder');
  await clickText('Continue');
  const s = await text();
  check(!!(await page.$('[data-testid="wl-safety"]')) && /won’t set a calorie-cutting target/i.test(s), 'Safety: eating-disorder history stops the plan');
  await top(); await shot('phone-wl-safety');
  await browser.close();
}

await run('phone');
await run('desktop');
if (errors.length) { console.log('\nPROBLEMS:\n' + errors.join('\n')); process.exitCode = 1; } else console.log('\nall checks passed');
