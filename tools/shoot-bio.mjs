// Screenshots + checks for Me › Bio (phone + desktop). Needs `node tools/serve.mjs` running on :4173.
import puppeteer from 'puppeteer-core';
const BASE = 'http://localhost:4173/hybrd/';
const OUT = new URL('../screenshots/', import.meta.url).pathname;
const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SAMPLE = 'HYROX racer and hybrid athlete.\nI train 5 days a week — running, calisthenics and the bike.\nGoal: a strong 2027 race season. 💪';
const LONG = ('I started training because I wanted more energy and a clear head, not just a number on the scale. Now I run, lift and ride the indoor bike, and I am building up to my first HYROX. I like early sessions, simple food, and finishing the week tired but proud. This bio is only here so I can look back later and remember why I started. ' + 'Keep going. '.repeat(20)).trim();

async function onboard(page, clickText) {
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.evaluate((() => ['agree-terms', 'consent-location', 'consent-health'].forEach((t) => { const el = document.querySelector(`[data-testid="${t}"]`); if (el && !el.checked) el.click(); }))); await clickText('Get started');
  await page.type('input[autocomplete="given-name"]', 'José Cruz');
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
    await sleep(600);
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
  const setArea = async (value) => {
    const ok = await page.evaluate((v) => {
      const i = document.querySelector('[data-testid="bio-input"]');
      if (!i) return false;
      const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      set.call(i, v);
      i.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }, value);
    if (!ok) throw new Error('no bio textarea');
    await sleep(200);
  };

  await onboard(page, clickText);
  await go('/me');
  await page.evaluate(() => document.querySelector('[data-testid="bio-card"]')?.scrollIntoView({ block: 'center' }));
  await sleep(400);

  const empty = await text();
  check(!!(await page.$('[data-testid="bio-empty"]')), 'Empty state is shown');
  check(/Tell your story: goals, sports, why you train/.test(empty), 'Empty prompt text');
  check(/Only you can see this/.test(empty), 'Privacy line on empty state');
  if (phone) await shot('phone-me-bio-empty');

  // Cancel discards a draft
  await page.click('[data-testid="bio-empty"]'); await sleep(300);
  check(!!(await page.$('[data-testid="bio-input"]')), 'Edit mode opens from empty prompt');
  await setArea('this should be discarded');
  await page.click('[data-testid="bio-cancel"]'); await sleep(300);
  check(!!(await page.$('[data-testid="bio-empty"]')) && !(await text()).includes('this should be discarded'), 'Cancel discards the draft');

  // Edit + counter + screenshot
  await page.click('[data-testid="bio-edit"]'); await sleep(300);
  await setArea(SAMPLE);
  const count = await page.$eval('[data-testid="bio-count"]', (e) => e.textContent);
  check(count.trim() === `${SAMPLE.length} / 1000`, `Live counter shows ${count}`);
  await page.evaluate(() => document.querySelector('[data-testid="bio-card"]')?.scrollIntoView({ block: 'center' }));
  if (phone) await shot('phone-me-bio-edit');

  await page.click('[data-testid="bio-save"]'); await sleep(600);
  const shown = await page.$eval('[data-testid="bio-text"]', (e) => e.innerText);
  check(shown === SAMPLE, 'Saved bio is shown with line breaks');
  check(/Only you can see this/.test(await text()), 'Privacy line on view');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(() => document.querySelector('[data-testid="bio-card"]')?.scrollIntoView({ block: 'start' }));
  await sleep(300);
  if (phone) await shot('phone-me-bio');
  else await shot('desktop-me-bio');

  // Persistence after reload
  await page.reload({ waitUntil: 'networkidle0' }); await sleep(1200);
  await go('/me');
  await page.evaluate(() => document.querySelector('[data-testid="bio-card"]')?.scrollIntoView({ block: 'center' }));
  const after = await page.$eval('[data-testid="bio-text"]', (e) => e.innerText).catch(() => '');
  check(after === SAMPLE, 'Bio persists after reload');

  // HTML is shown as text, not executed
  await page.click('[data-testid="bio-edit"]'); await sleep(250);
  await setArea('Hello <script>alert(1)</script> and https://example.com');
  await page.click('[data-testid="bio-save"]'); await sleep(500);
  const html = await page.$eval('[data-testid="bio-text"]', (e) => e.innerHTML);
  const vis = await page.$eval('[data-testid="bio-text"]', (e) => e.innerText);
  check(!html.includes('<script') && vis.includes('<script>alert(1)</script>'), 'HTML is rendered as plain text');
  check(html.includes('href="https://example.com"') && html.includes('rel="noopener noreferrer nofollow"'), 'https URL is auto-linked safely');

  // Read more on a long bio
  await page.click('[data-testid="bio-edit"]'); await sleep(250);
  await setArea(LONG);
  await page.click('[data-testid="bio-save"]'); await sleep(500);
  check(!!(await page.$('[data-testid="bio-more"]')), 'Read more appears on a long bio');
  const preview = await page.$eval('[data-testid="bio-text"]', (e) => e.innerText);
  check(preview.length < LONG.length, 'Collapsed preview is shorter than the full bio');
  await page.click('[data-testid="bio-more"]'); await sleep(250);
  const full = await page.$eval('[data-testid="bio-text"]', (e) => e.innerText);
  check(full === LONG && /Show less/.test(await text()), 'Read more expands to the full bio');

  // Delete all data clears the bio
  await go('/me/data');
  page.once('dialog', (d) => d.accept());
  await clickText('Delete all data');
  await sleep(800);
  await go('/me');
  check(!!(await page.$('[data-testid="bio-empty"]')), 'Delete all data clears the bio');

  await page.close();
  await ctx.close();
  await browser.close();
}

for (const k of ['phone', 'desktop']) {
  try { await run(k); } catch (e) { errors.push(`[${k}] crashed: ${e.message}\n${e.stack}`); console.error(e); }
}
if (errors.length) { console.error('\nERRORS:\n' + errors.join('\n')); process.exit(1); }
console.log('\nall bio screenshot checks passed');
