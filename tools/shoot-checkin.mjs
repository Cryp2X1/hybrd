// Screenshots + checks for HYBRD Pulse (/mind): the weekly check-in card, the emoji questions, the result (score, areas, focus),
// the general-wellness disclaimer, the gentle 988 support line on a low week, and the Pulse trend. Phone (390×844) + one desktop shot.
// Needs `node tools/serve.mjs` (PORT / BASE env supported by this script: PORT=4173 by default).
import puppeteer from 'puppeteer-core';
const PORT = process.env.PORT || 4173;
const BASE = `http://localhost:${PORT}/hybrd/`;
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
  const check = (cond, msg) => { if (!cond) errors.push(`[${kind}] ${msg}`); else console.log('ok', kind, msg); };
  const shot = async (name) => {
    await sleep(600);
    await page.evaluate(() => { let st = document.getElementById('shot-css'); if (!st) { st = document.createElement('style'); st.id = 'shot-css'; document.head.appendChild(st); } st.textContent = '.toast{display:none!important}'; });
    const over = await page.evaluate(() => Math.max(document.documentElement.scrollWidth - window.innerWidth, ...[...document.querySelectorAll('.pl-sheet *, .mn-root *')].filter((e) => e.getClientRects().length && !e.closest('.seg')).map((e) => Math.round(e.getBoundingClientRect().right - window.innerWidth))));
    check(over <= 1, `${name}: no horizontal overflow (${over}px)`);
    await page.screenshot({ path: `${OUT}${name}.png` });
    console.log('shot', name);
  };
  const go = async (path, wait = 900) => { await page.evaluate((p) => { history.pushState({}, '', p); dispatchEvent(new PopStateEvent('popstate')); }, '/hybrd' + path); await sleep(wait); };
  const clickText = async (txt, sel = 'button, a') => {
    const ok = await page.evaluate((t, s) => { const el = [...document.querySelectorAll(s)].find((e) => e.textContent.trim().includes(t)); if (el) { el.click(); return true; } return false; }, txt, sel);
    if (!ok) throw new Error(`no element with text ${txt}`); await sleep(350);
  };
  const tid = async (id) => { const ok = await page.evaluate((i) => { const el = document.querySelector(`[data-testid="${i}"]`); if (el) { el.click(); return true; } return false; }, id); if (!ok) throw new Error(`no testid ${id}`); await sleep(200); };
  const text = () => page.evaluate(() => document.body.innerText);
  const sheetTo = (sel, block = 'start') => page.evaluate((s, b) => { const el = document.querySelector(s); el?.scrollIntoView({ block: b }); }, sel, block);
  const answer = async (vals) => { const ks = ['energy', 'sleep', 'mood', 'stress', 'drive', 'recovery']; for (let i = 0; i < 6; i++) await tid(`pulse-${ks[i]}-${vals[i]}`); };

  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.evaluate((() => ['agree-terms', 'consent-location', 'consent-health'].forEach((t) => { const el = document.querySelector(`[data-testid="${t}"]`); if (el && !el.checked) el.click(); }))); await clickText('Get started');
  await page.type('input[autocomplete="given-name"]', 'José');
  await clickText('Continue'); await clickText('Continue'); await clickText('Continue');
  await clickText('HYROX'); await clickText('Running');
  await clickText('Continue');
  await clickText('Explore with sample data first');
  await sleep(1500);

  // Card on Today (sample data has 3 weekly Pulses)
  await go('/mind');
  const t0 = await text();
  check(/HYBRD Pulse/i.test(t0) && /Last Pulse/i.test(t0) && !/WHO-?5/.test(t0), 'Today: HYBRD Pulse card with last score, no WHO-5');
  if (phone) { await page.evaluate(() => [...document.querySelectorAll('h3')].find((h) => h.textContent === 'HYBRD Pulse')?.scrollIntoView({ block: 'center' })); await shot('phone-checkin-card'); }

  // Questions
  await tid('mind-checkup-open'); await sleep(500);
  const tq = await text();
  check(/Six quick questions/.test(tq) && /For general wellness only/.test(tq), 'Sheet: intro + short disclaimer at the top');
  check(await page.$eval('[data-testid="scr-save"]', (b) => b.disabled), 'Save disabled until answered');
  await tid('pulse-energy-3'); await tid('pulse-sleep-2');
  if (phone) { await sheetTo('.sheet-body', 'start'); await page.evaluate(() => { const b = document.querySelector('.sheet'); if (b) b.scrollTop = 0; document.querySelector('.sheet-body')?.scrollTo?.(0, 0); }); await shot('phone-checkin-questions'); }
  await answer([3, 2, 3, 3, 4, 3]);
  await tid('scr-safety-no');
  check(!(await page.$eval('[data-testid="scr-save"]', (b) => b.disabled)), 'Save enabled after 6 answers + safety question (PHQ add-on optional)');
  await tid('scr-save'); await sleep(700);
  const tr = await text();
  check(!!(await page.$('[data-testid="pulse-result"]')) && /Your Pulse/i.test(tr) && /75/.test(tr) && /Thriving/i.test(tr), 'Result: 75/100 · Thriving');
  check(/since/.test(tr), 'Result: change since the last Pulse');
  check(!!(await page.$('[data-testid="pulse-disclaimer"]')) && /not a medical device/.test(tr) && /not medical advice/.test(tr), 'Result: full general-wellness disclaimer');
  check(!(await page.$('[data-testid="pulse-support"]')), 'Good week: no support line');
  if (phone) {
    await sheetTo('[data-testid="pulse-result"]'); await shot('phone-checkin-result');
    await sheetTo('[data-testid="pulse-disclaimer"]', 'end'); await shot('phone-checkin-disclaimer');
  } else await shot('desktop-checkin-result');
  await clickText('See my trend'); await sleep(800);

  // Trend
  const tt = await text();
  check(!!(await page.$('[data-testid="pulse-trend"]')) && /HYBRD Pulse/i.test(tt) && /not a clinical measure/.test(tt), 'Trends: Pulse trend chart with 4 Pulses');
  check((await page.$$('[data-testid="pulse-trend"] .c')).length === 4, 'Trend has 4 bars (3 sample + new)');
  if (phone) { await sheetTo('[data-testid="pulse-trend"]', 'center'); await shot('phone-checkin-trend'); }

  // Low week → gentle support line with 988
  await go('/mind');
  await tid('mind-checkup-open'); await sleep(400);
  await answer([1, 1, 1, 1, 1, 1]);
  await tid('scr-safety-no');
  await tid('scr-save'); await sleep(700);
  const tl = await text();
  check(!!(await page.$('[data-testid="pulse-support"]')) && /988/.test(tl) && /Go easy on yourself/i.test(tl) && !/diagnos(is|ed)|disorder|abnormal/i.test(tl.split(/Go easy on yourself/i)[1]?.split('HYBRD Pulse is an original')[0] || ''), 'Low week: gentle 988 support line, no diagnosis language');
  check(await page.$eval('[data-testid="pulse-call-988"]', (a) => a.getAttribute('href')) === 'tel:988', 'Support line: tel:988');
  check(!(await page.$('[data-testid="scr-out-crisis"]')), 'Low week is not shown as a crisis');
  if (phone) { await sheetTo('[data-testid="pulse-support"]', 'center'); await shot('phone-checkin-support'); }
  await page.keyboard.press('Escape'); await sleep(300);

  // Evidence licence card
  await go('/mind?tab=evidence');
  await clickText('Safety & screening', '.seg button');
  const te = await text();
  check(/original HYBRD tool/.test(te) && !/WHO-?5|CC BY-NC-SA/.test(te), 'Evidence: Pulse listed as original, no WHO-5 licence');
  await browser.close();
}

await run('phone');
await run('desktop');
if (errors.length) { console.error('\nERRORS:\n' + errors.join('\n')); process.exit(1); }
console.log('\nall checkin screenshot checks passed');
