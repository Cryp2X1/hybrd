// Screenshots + checks for Fuel › Sleep: Fuel tab + entry card, landing, setup (health → night → caffeine → goal → plan),
// evening timeline, caffeine tracker, sleep log with trends, foods & drinks, evidence + sources, recipe detail,
// and the safety screens (under 18 → food only; kidney disease → doctor acknowledgement). Needs `node tools/serve.mjs` on :4173.
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
    await page.evaluate((f) => { let st = document.getElementById('shot-css'); if (!st) { st = document.createElement('style'); st.id = 'shot-css'; document.head.appendChild(st); } st.textContent = `.toast{display:none!important}${f ? '.bottom-nav{display:none!important}' : ''}`; }, full);
    const over = await page.evaluate(() => Math.max(document.documentElement.scrollWidth - window.innerWidth, ...[...document.querySelectorAll('.sl-root *, .wl-tabs')].filter((e) => !e.closest('.seg')).map((e) => Math.round(e.getBoundingClientRect().right - window.innerWidth))));
    check(over <= 1, `${name}: no horizontal overflow (${over}px)`);
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

  await go('/fuel');
  check(!!(await page.$('[data-testid="sleep-entry"]')), 'Fuel: sleep entry card');
  await clickText('Sleep', '.seg button'); await sleep(900);
  check(page.url().endsWith('/fuel/sleep') && !!(await page.$('[data-testid="sleep-landing"]')), 'Fuel “Sleep” tab opens /fuel/sleep landing');
  check(/CBT-I/.test(await text()), 'Landing: CBT-I / not-medical-advice banner');
  await shot(phone ? 'phone-sleep-landing' : 'desktop-sleep-landing');

  // Setup
  await page.click('[data-testid="sleep-start"]'); await sleep(800);
  check(/Health check/i.test(await text()), 'Setup step 1: health check');
  if (phone) { await top(); await shot('phone-sleep-setup-health'); }
  await clickText('Continue');
  check(/Your night/i.test(await text()), 'Setup step 2: night (healthy adult skips the safety screen)');
  await setInput('[data-testid="sleep-bed"]', '22:45');
  await setInput('[data-testid="sleep-wake"]', '06:30');
  await clickText('Evening', '.chip');
  await setInput('[data-testid="sleep-train"]', '19:00');
  await clickText('Sessions are often hard', 'label');
  await clickText('1–2 nights a week', '.chip');
  await clickText('Continue');
  check(/Caffeine/i.test(await text()) && /half-life: 5 h/i.test(await text()), 'Setup step 3: caffeine, 5 h default half-life');
  await clickText('I use a caffeinated pre-workout', 'label');
  if (phone) { await top(); await shot('phone-sleep-setup-caffeine'); }
  await clickText('Continue');
  await clickText('Recover after training', '.chip');
  await clickText('Show me supplement options too', 'label');
  await clickText('Continue');
  const pv = await text();
  check(!!(await page.$('[data-testid="sleep-preview"]')) && /14:\d\d/.test(pv), 'Plan preview with caffeine cutoff (coffee ~7.9 h before 22:45)');
  check(/Pre-workout: go caffeine-free/i.test(pv), 'Preview flags the evening pre-workout');
  if (phone) { await top(); await shot('phone-sleep-setup-preview'); }
  await page.click('[data-testid="sleep-save"]'); await sleep(1200);
  const pt = await text();
  check(page.url().endsWith('/fuel/sleep') && !!(await page.$('[data-testid="sleep-timeline"]')), 'Saved → evening timeline');
  check(/Last caffeine by 14:\d\d/.test(pt) && /Recovery dinner|Recovery snack/.test(pt) && /Taper fluids|Rehydrate/.test(pt) && /Lights out/.test(pt), 'Timeline: caffeine, recovery meal, fluids, bed');
  check(/Casein|casein/.test(pt) && /Glycine|Magnesium/.test(pt), 'Bedtime protein + supplement safety list');
  await top(); await shot(phone ? 'phone-sleep-plan' : 'desktop-sleep-plan', phone);

  // Caffeine tracker
  await tab('Caffeine');
  await setInput('[data-testid="caf-time"]', '08:00');
  await page.$eval('[data-testid="caf-add-coffee"]', (b) => b.click()); await sleep(400);
  await setInput('[data-testid="caf-time"]', '15:30');
  await page.$eval('[data-testid="caf-add-coffee"]', (b) => b.click()); await sleep(600);
  const cb = await page.$eval('[data-testid="caf-bed"]', (e) => e.textContent).catch(() => '');
  const mg = parseInt(cb, 10);
  check(mg >= 45 && mg <= 49, `Bedtime estimate for 95 mg 08:00 + 95 mg 15:30 (bed 22:45, 5 h) ≈ 47 mg (got ${cb})`);
  check(/Estimate only/i.test(await text()), 'Caffeine estimate labelled as an estimate');
  await top(); await shot(phone ? 'phone-sleep-caffeine' : 'desktop-sleep-caffeine', phone);

  // Log
  await tab('Log');
  const lt = await text();
  check(!!(await page.$('[data-testid="sleep-trend"]')) && /avg sleep, 7 nights/i.test(lt) && /7 h\+ streak/i.test(lt), 'Log: stats, streaks, 14-night trend (sample nights)');
  check(/Your patterns/i.test(lt), 'Log: own-pattern comparison shown with enough nights');
  await page.$eval('[data-testid="log-save"]', (b) => b.click()); await sleep(700);
  await top(); await shot(phone ? 'phone-sleep-log' : 'desktop-sleep-log', phone);

  // Foods & drinks
  await tab('Foods & drinks');
  check(!!(await page.$('[data-testid="sleep-foods"]')) && (await page.$$('[data-testid="sleep-foods"] .tile')).length === 19, 'Foods: 19 recipes');
  await clickText('Bedtime snacks', '.seg button');
  check((await page.$$('[data-testid="sleep-foods"] .tile')).length === 8, 'Foods: snack filter → 8');
  await clickText('vegan', '.chip');
  check((await page.$$('[data-testid="sleep-foods"] .tile')).length === 3, 'Foods: vegan snacks → 3');
  await clickText('vegan', '.chip'); await clickText('All', '.seg button');
  await top(); await shot(phone ? 'phone-sleep-foods' : 'desktop-sleep-foods');
  if (phone) {
    await go('/fuel/recipe/sleep-kiwi-yogurt');
    check(/Two Kiwis/i.test(await text()) && /Sleep evidence: limited/i.test(await text()), 'Recipe detail with timing + evidence grade');
    await shot('phone-sleep-recipe');
    await go('/fuel/sleep?tab=foods');
  }

  // Evidence
  await go('/fuel/sleep?tab=evidence');
  const et = await text();
  const n = +(et.match(/All sources \((\d+)\)/i)?.[1] || 0);
  check(n >= 60, `Evidence lists ≥ 60 sources (${n})`);
  check(/Strong evidence/i.test(et) && /Weak \/ mixed evidence/i.test(et), 'Evidence: grade legend');
  await shot(phone ? 'phone-sleep-evidence' : 'desktop-sleep-evidence');
  await clickText('Supplements', '.seg button');
  const st = await text();
  check(/Studied dose/i.test(st) && /DSHEA/.test(st) && /For you:/i.test(st), 'Supplements: dose, US regulatory note, personal status');
  await top(); await shot(phone ? 'phone-sleep-supplements' : 'desktop-sleep-supplements');

  // Fuel card now shows tonight's times
  await go('/fuel');
  check(!!(await page.$('[data-testid="sleep-card-times"]')), 'Fuel card shows tonight’s times');

  if (phone) {
    // Under 18 → food & drink only
    await go('/fuel/sleep/setup');
    await setInput('[data-testid="sleep-age"]', '16');
    await clickText('Continue');
    check(!!(await page.$('[data-testid="sleep-minor"]')) && /under 18/i.test(await text()), 'Safety: under 18 → food & drink only, no supplements');
    await top(); await shot('phone-sleep-safety-minor');
    await clickText('Back');
    await setInput('[data-testid="sleep-age"]', '40');
    await clickText('Kidney disease', 'label');
    await clickText('Continue');
    check(!!(await page.$('[data-testid="sleep-caution"]')) && /magnesium/i.test(await text()), 'Safety: kidney disease → talk to your doctor (magnesium)');
    const disabled = await page.$eval('[data-testid="sleep-safety-continue"]', (b) => b.disabled);
    check(disabled, 'Caution: continue needs the acknowledgement');
    await top(); await shot('phone-sleep-safety-caution');
  }
  await browser.close();
}

await run('phone');
await run('desktop');
if (errors.length) { console.error('\nERRORS:\n' + errors.join('\n')); process.exit(1); }
console.log('\nall sleep screenshot checks passed');
