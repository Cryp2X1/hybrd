// Screenshots + checks for v1.7 Legal: clickwrap gating, legal hub and documents, consents, re-accept prompt,
// public legal URLs. Phone light + dark, desktop. Needs `DIST=/tmp/dist-theme node tools/serve.mjs` on :4173.
import puppeteer from 'puppeteer-core';
const BASE = 'http://localhost:4173/hybrd/';
const OUT = new URL('../screenshots/', import.meta.url).pathname;
const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run(browser, kind) {
  const phone = kind !== 'desktop';
  const dark = kind === 'dark';
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.emulateTimezone('America/New_York');
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }]);
  await page.setViewport(phone ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width: 1440, height: 900, deviceScaleFactor: 1 });
  if (phone) await page.setUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36');
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${kind}] console.error: ${m.text()} @ ${page.url()}`); });
  page.on('pageerror', (e) => errors.push(`[${kind}] pageerror: ${e.message}`));
  page.on('response', (r) => { if (r.status() >= 400 && r.url().startsWith('http://localhost')) errors.push(`[${kind}] HTTP ${r.status()}: ${r.url()}`); });
  page.on('dialog', (d) => d.accept());
  const check = (cond, msg) => { if (!cond) errors.push(`[${kind}] ${msg}`); else console.log('ok', kind, msg); };
  const shot = async (name, full = false) => {
    await sleep(700);
    await page.evaluate((f) => { let st = document.getElementById('shot-css'); if (!st) { st = document.createElement('style'); st.id = 'shot-css'; document.head.appendChild(st); } st.textContent = `.toast{display:none!important}${f ? '.bottom-nav{display:none!important}' : ''}`; }, full);
    const ov = await page.evaluate(() => { const W = document.documentElement.clientWidth; if (document.documentElement.scrollWidth <= W + 1) return ''; return [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > W + 1).slice(0, 3).map((e) => e.className || e.tagName).join(', '); });
    check(!ov, `${name}: no horizontal overflow ${ov}`);
    await page.screenshot({ path: `${OUT}${name}.png`, fullPage: full });
    console.log('shot', name);
    if (full) await page.evaluate(() => { document.getElementById('shot-css').textContent = '.toast{display:none!important}'; });
  };
  const go = async (path, wait = 1100) => { await page.evaluate((p) => { history.pushState({}, '', p); dispatchEvent(new PopStateEvent('popstate')); }, '/hybrd' + path); await sleep(wait); };
  const clickText = async (txt, sel = 'button, a') => {
    const ok = await page.evaluate((t, s) => { const el = [...document.querySelectorAll(s)].find((e) => e.textContent.trim().includes(t) && e.offsetParent !== null); if (el) { el.click(); return true; } return false; }, txt, sel);
    if (!ok) throw new Error(`no element with text ${txt}`); await sleep(400);
  };
  const click = async (sel) => { const ok = await page.evaluate((s) => { const el = document.querySelector(s); if (el) { el.click(); return true; } return false; }, sel); if (!ok) throw new Error(`no ${sel}`); await sleep(450); };
  const setVal = async (sel, v) => {
    const ok = await page.evaluate((s, v) => {
      const i = document.querySelector(s); if (!i) return false;
      const proto = i.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); return true;
    }, sel, v);
    if (!ok) throw new Error(`no ${sel}`); await sleep(250);
  };
  const text = () => page.evaluate(() => document.body.innerText);
  const scrollTo = (sel) => page.evaluate((s) => { const el = document.querySelector(s); if (el) { el.scrollIntoView({ block: 'start' }); window.scrollBy(0, -70); } }, sel);
  const scrollSheet = (sel) => page.evaluate((s) => { const el = document.querySelector(s); el?.scrollIntoView({ block: 'center' }); }, sel);
  const newSession = async () => { await page.evaluate(() => sessionStorage.clear()); await page.reload({ waitUntil: 'networkidle0' }); await sleep(1500); };


  const AG = (ids) => page.evaluate((ids) => ids.forEach((t) => { const el = document.querySelector(`[data-testid="${t}"]`); if (el && !el.checked) el.click(); }), ids);
  const disabled = (sel) => page.$eval(sel, (e) => e.disabled);
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await sleep(800);

  if (kind === 'phone') {
    // ----- clickwrap on the welcome screen -----
    check(!!(await page.$('[data-testid="agree-terms"]')) && !(await page.$eval('[data-testid="agree-terms"]', (e) => e.checked)), 'clickwrap checkbox present and NOT pre-checked');
    check(await disabled('[data-testid="get-started"]'), 'Get started disabled until the box is checked');
    await page.evaluate(() => document.querySelector('[data-testid="get-started"]').click()); await sleep(300);
    check(!!(await page.$('[data-testid="agree-terms"]')), 'clicking the disabled button does not continue');
    const t0 = await text();
    check(/I agree to the Terms of Service and Privacy Policy/.test(t0) && /18 or older/.test(t0), 'checkbox text: agree to Terms + Privacy, confirm 18+');
    check(/Consumer Health Data/.test(t0) && !!(await page.$('[data-testid="consent-health"]')) && !!(await page.$('[data-testid="consent-location"]')), 'separate optional consents + separate health-data link on the homepage');
    await shot('phone-legal-signup-checkbox');
    // links open the public Terms without onboarding
    await page.evaluate(() => [...document.querySelectorAll('.lg-agree a')].find((a) => a.textContent.includes('Terms'))?.click()); await sleep(1200);
    check(!!(await page.$('[data-testid="legal-doc-terms"]')) && /ASSUMPTION OF RISK/.test(await text()), 'Terms open before onboarding (public URL)');
    await page.goBack(); await sleep(1000);
    await AG(['agree-terms']);
    check(!(await disabled('[data-testid="get-started"]')), 'checked → Get started enabled');
  } else {
    await AG(['agree-terms', 'consent-location']);
  }
  await clickText('Get started');
  await page.type('input[autocomplete="given-name"]', 'José Cruz');
  await clickText('Continue');
  if (kind === 'phone') {
    await setVal('input[inputmode="numeric"]', '16');
    check(!!(await page.$('[data-testid="onb-too-young"]')), 'under the minimum age is flagged in onboarding');
    check(await page.evaluate(() => [...document.querySelectorAll('.onb-foot button')].find((b) => b.textContent.includes('Continue'))?.disabled), 'Continue blocked when under the minimum age');
    await setVal('input[inputmode="numeric"]', '31');
  }
  await clickText('Continue'); await clickText('Continue');
  await clickText('Running'); await clickText('Continue');
  await clickText('Explore with sample data first');
  await sleep(1500);
  check(!(await page.$('[data-testid="legal-gate"]')), 'new user who accepted at sign-up sees no re-accept prompt');

  // ----- legal hub + documents -----
  await go('/legal', 1200);
  check((await page.$$('[data-testid="legal-hub"] .row-link')).length >= 8, 'hub lists 6 documents + Community Guidelines + How reporting works');
  check(!/Draft\./.test(await text()) && !(await page.$('[data-testid="legal-placeholder"]')), 'hub: no draft banner, no placeholders');
  check(/hybrdbeast@gmail\.com/.test(await page.$eval('[data-testid="legal-contact"]', (e) => e.textContent)), 'hub contact shows hybrdbeast@gmail.com');
  check(!!(await page.$('[data-testid="legal-accepted"]')), 'hub shows the accepted version and time');
  if (kind === 'phone') await shot('phone-legal-hub');
  if (kind === 'desktop') await shot('desktop-legal-hub');
  await go('/legal/terms', 1200);
  const terms = await text();
  check(/Terms of Service/.test(terms) && /Contents/.test(terms) && (await page.$$('[data-testid="legal-placeholder"]')).length === 0, 'Terms render with contents and no placeholders');
  check(/José Manuel Cruz Ortiz, an individual doing business as HYBRD/.test(terms) && /November 26, 2026/.test(terms) && /Delaware County, Ohio, USA/.test(terms) && /hybrdbeast@gmail\.com/.test(terms) && !/\[\[|TODO|YOUR_|placeholder/i.test(terms), 'Terms show the operator, date, Ohio / Delaware County and the email; no placeholder text');
  if (kind === 'phone') await shot('phone-legal-terms');
  if (kind === 'phone') {
    const scrollToText = (re) => page.evaluate((src) => { const r = new RegExp(src); const el = [...document.querySelectorAll('.lg-doc p, .lg-doc h2, .lg-doc h3')].find((e) => r.test(e.textContent)); if (el) { el.scrollIntoView({ block: 'start' }); window.scrollBy(0, -70); } return !!el; }, re.source);
    check(await scrollToText(/30-DAY RIGHT TO OPT OUT/), 'found the arbitration opt-out (email) section');
    await shot('phone-legal-terms-optout-governing-law');
    check(await scrollToText(/Contact and notices/), 'found the Contact and notices section');
    await shot('phone-legal-terms-contact');
    await page.evaluate(() => window.scrollTo(0, 0));
  }
  if (kind === 'dark') await shot('phone-legal-terms-dark');
  await go('/legal/privacy', 1200);
  check(/do not sell your personal information/i.test(await text()) && !!(await page.$('.lg-table')), 'Privacy Policy renders (incl. the retention table)');
  if (kind === 'phone') await shot('phone-legal-privacy');
  if (kind === 'desktop') await shot('desktop-legal-privacy');
  for (const id of ['terms', 'privacy', 'health-data', 'disclaimer', 'dmca', 'delete-account']) { await go(`/legal/${id}`, 900); check(!!(await page.$(`[data-testid="legal-doc-${id}"]`)), `/legal/${id} renders`); const tx = await text(); check(!/\[\[|TODO|YOUR_|placeholder|\bTBD\b|\[[A-Z][A-Za-z _]*\]/i.test(tx) && !(await page.$('[data-testid="legal-placeholder"]')) && /November 26, 2026/.test(tx), `/legal/${id}: no placeholder text, dated November 26, 2026`); }

  if (kind === 'phone') {
    // ----- just-in-time consents -----
    await go('/mind', 1300);
    check(!!(await page.$('[data-testid="consent-health"]')), 'Mind asks for health/mood consent first');
    check(await disabled('[data-testid="consent-health-allow"]'), 'Allow disabled until the consent box is checked');
    await AG(['consent-health-check']);
    await shot('phone-legal-health-consent');
    await click('[data-testid="consent-health-allow"]'); await sleep(900);
    check(!(await page.$('[data-testid="consent-health"]')), 'consent given → Mind opens');
    await go('/record', 1300);
    check(!!(await page.$('[data-testid="consent-location"]')), 'Record asks for location consent first');
    await click('[data-testid="consent-location-decline"]'); await sleep(600);
    check(!!(await page.$('[data-testid="consent-location-declined"]')) && /Log a workout/.test(await text()), 'declined → indoor logging offered, no GPS');
    await go('/settings/privacy', 1300);
    check(await page.$eval('[data-testid="consent-toggle-health"]', (e) => e.getAttribute('aria-pressed') === 'true') && await page.$eval('[data-testid="consent-toggle-location"]', (e) => e.getAttribute('aria-pressed') === 'false'), 'Settings › Privacy shows both consents');
    await click('[data-testid="consent-toggle-health"]');
    check(await page.$eval('[data-testid="consent-toggle-health"]', (e) => e.getAttribute('aria-pressed') === 'false'), 'health consent can be withdrawn');
    await go('/mind', 1000);
    check(!!(await page.$('[data-testid="consent-health"]')) || !!(await page.$('[data-testid="consent-health-declined"]')), 'withdrawn → Mind gated again');
    await go('/sign-up', 1200);
    check(!!(await page.$('[data-testid="signup-agree"]')) && await disabled('[data-testid="auth-submit"]'), 'sign-up form has the clickwrap and blocks submit');
    await shot('phone-legal-signup-form');
  }

  // ----- re-accept prompt (preview of a Terms version change) -----
  if (kind !== 'desktop') {
    await go('/', 800);
    await page.evaluate(() => sessionStorage.setItem('hybrd:legal-preview', '1')); await page.reload({ waitUntil: 'networkidle0' }); await sleep(1500);
    check(!!(await page.$('[data-testid="legal-gate"]')) && /updated our Terms/i.test(await text()), 're-accept prompt shown after a version change');
    check(await disabled('[data-testid="reaccept-accept"]'), 'Accept disabled until checked');
    await shot(kind === 'dark' ? 'phone-legal-reaccept-dark' : 'phone-legal-reaccept');
    await go('/legal/terms', 900);
    check(!(await page.$('[data-testid="legal-gate"]')), 'Terms stay readable while the prompt is pending');
    await go('/', 900);
    check(!!(await page.$('[data-testid="legal-gate"]')), 'prompt returns until accepted');
    await AG(['reaccept-agree']); await click('[data-testid="reaccept-accept"]'); await sleep(800);
    check(!(await page.$('[data-testid="legal-gate"]')), 'accepting closes the prompt');
    await go('/legal', 900);
    check(/version 2026-11-26/.test(await text()), 'acceptance recorded');
  }
  await ctx.close();
}

async function publicPage(browser) {
  const ctx = await browser.createBrowserContext(); const page = await ctx.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await page.goto(BASE + 'legal/delete-account', { waitUntil: 'networkidle0' }); await sleep(1200);
  const ok = !!(await page.$('[data-testid="legal-doc-delete-account"]')) && /Delete my HYBRD account/.test(await page.evaluate(() => document.body.innerText));
  if (!ok) errors.push('[public] /legal/delete-account does not open as a public page'); else console.log('ok public deletion URL works without onboarding (Google Play)');
  await page.goto(BASE + 'legal/health-data', { waitUntil: 'networkidle0' }); await sleep(1000);
  if (!(await page.$('[data-testid="legal-doc-health-data"]'))) errors.push('[public] /legal/health-data not public'); else console.log('ok public health-data policy');
  await ctx.close();
}

const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
try {
  for (const k of ['phone', 'dark', 'desktop']) { try { await run(browser, k); } catch (e) { errors.push(`[${k}] ${e.stack || e}`); } }
  try { await publicPage(browser); } catch (e) { errors.push(`[public] ${e.stack || e}`); }
} finally { await browser.close(); }
if (errors.length) { console.log('\nPROBLEMS:\n' + errors.join('\n')); process.exit(1); }
console.log('\nALL LEGAL SCREEN CHECKS PASSED');
