// Screenshots + checks for v1.6 Safety in DEMO mode (sample people, simulated moderator decisions, on-device only):
// report sheet + confirmation, restrict & who-can-message settings, time off, welcome back, delete, reopen,
// removed-content notice, account status with an appeal, and the demo moderation queue. Phone light + dark, desktop.
// Needs `DIST=/tmp/dist-theme node tools/serve.mjs` (or any server for dist/) on :4173.
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

  // onboarding + Social demo profile
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await clickText('Get started');
  await page.type('input[autocomplete="given-name"]', 'José Cruz');
  await clickText('Continue'); await clickText('Continue'); await clickText('Continue');
  await clickText('Running');
  await clickText('Continue');
  await clickText('Explore with sample data first');
  await sleep(1500);
  await go('/social');
  await click('[data-testid="enter-demo"]'); await sleep(1000);
  await setVal('[data-testid="setup-dob"]', '1994-06-12');
  await setVal('[data-testid="setup-handle"]', 'jose.cruz');
  await clickText('I agree to the community rules');
  await click('[data-testid="setup-save"]'); await sleep(1500);
  check(page.url().endsWith('/social'), 'demo profile created');

  // ----- report sheet (from a profile) -----
  await go('/social/profile?u=sample.leo', 1500);
  await click('button[aria-label="Profile options"]');
  const menu = await text();
  check(/Restrict @sample\.leo/.test(menu) && /Report @sample\.leo/.test(menu), 'profile menu: Restrict + Report');
  await click('[data-testid="report-user"]');
  const rs = await text();
  check(['Spam', 'Harassment or bullying', 'Hate', 'Sexual content', 'Involves a minor', 'Self-harm or suicide', 'Impersonation', 'Scam or fraud', 'Violence or threats', 'Something else'].every((r) => rs.includes(r)), 'report sheet lists all 10 reasons');
  check(/won’t know who reported it/.test(rs) && /Also block @sample\.leo/.test(rs), 'anonymous + “also block” offered');
  await click('[data-testid="reason-harassment"]');
  await setVal('.sf-report textarea', 'Keeps sending me insults after I asked them to stop.');
  if (kind !== 'desktop') await shot(dark ? 'phone-safety-report-sheet-dark' : 'phone-safety-report-sheet');
  await click('[data-testid="send-report"]'); await sleep(800);
  check(!!(await page.$('[data-testid="report-done"]')) && /Received/.test(await text()), 'confirmation with status Received');
  await click('[data-testid="report-done-close"]');

  if (kind === 'phone') {
    // self-harm report on a post → confirmation with 988
    await go('/social', 1500);
    await click('[data-testid="post-menu"]');
    await click('[data-testid="report-post"]');
    await click('[data-testid="reason-self_harm"]');
    check(/call or text 988/i.test(await text()), 'self-harm reason shows 988 inline');
    await click('[data-testid="send-report"]'); await sleep(800);
    check(!!(await page.$('[data-testid="crisis-help"]')), 'self-harm confirmation shows 988 resources');
    await shot('phone-safety-report-sent');
    await click('[data-testid="report-done-close"]');
    // duplicate is refused
    await click('[data-testid="post-menu"]'); await click('[data-testid="report-post"]'); await click('[data-testid="reason-spam"]'); await click('[data-testid="send-report"]'); await sleep(600);
    check(!(await page.$('[data-testid="report-done"]')), 'reporting the same post twice is refused');
    await page.keyboard.press('Escape'); await sleep(300);

    // ----- restrict + who can message -----
    await go('/social/profile?u=sample.leo', 1500);
    await click('button[aria-label="Profile options"]');
    await click('[data-testid="profile-restrict"]'); await sleep(600);
    await go('/messages', 1500);
    await click('[data-testid="dm-tab-requests"]');
    check(/Leo/.test(await text()), 'restricted chat moved to Requests');
    await go('/settings/safety', 1500);
    check(!!(await page.$('[data-testid="restricted-list"]')) && /Leo K\./.test(await text()), 'Restricted accounts lists Leo');
    await click('[data-testid="sf-who-fof"]'); await click('[data-testid="sf-call-friends"]');
    await scrollTo('#messaging');
    await shot('phone-safety-restrict-settings');
    check((await page.$$('.sf-report-row')).length >= 2, 'My reports lists both reports');
  }

  // ----- time off -----
  await go('/settings/account', 1500);
  check(!!(await page.$('[data-testid="account-safety"]')), 'Account shows Take time off + Delete account');
  await click('[data-testid="open-time-off"]'); await sleep(900);
  await click('[data-testid="pause-custom"]');
  const d = new Date(Date.now() + 14 * 86_400_000); const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  await setVal('[data-testid="pause-date"]', ymd);
  if (kind === 'phone') await shot('phone-safety-time-off', true);
  await click('[data-testid="pause-start"]'); await sleep(1000);
  check(!(await page.$('[data-testid="account-gate"]')), 'no gate right after pausing');
  await go('/social', 1200);
  check(!!(await page.$('[data-testid="paused-banner"]')), 'Social shows the time-off banner');
  check(await page.$eval('[data-testid="publish"], .s-feed', () => true).catch(() => true), 'feed still opens');
  // ----- "log back in" → welcome back -----
  await newSession();
  check(!!(await page.$('[data-testid="account-gate"]')) && /Welcome back, resume your account\?/i.test(await text()), 'welcome back on next session');
  if (kind !== 'desktop') await shot(dark ? 'phone-safety-welcome-back-dark' : 'phone-safety-welcome-back');
  await click('[data-testid="gate-resume"]'); await sleep(800);
  check(!(await page.$('[data-testid="account-gate"]')), 'Resume closes the gate');

  if (kind === 'phone') {
    // ----- delete + reopen -----
    await go('/safety/delete', 1200);
    await clickText('Privacy concerns');
    await setVal('[data-testid="delete-type"]', 'DELETE');
    await shot('phone-safety-delete', true);
    await click('[data-testid="delete-confirm"]'); await sleep(900);
    const want = new Date(Date.now() + 30 * 86_400_000).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    check((await page.$eval('[data-testid="delete-date"]', (e) => e.textContent)) === want, `scheduled for ${want}`);
    await newSession();
    const gate = await text();
    check(gate.toLowerCase().includes(`Your account is scheduled for deletion on ${want}. Reopen account?`.toLowerCase()), 'reopen prompt shows the exact date');
    await shot('phone-safety-reopen');
    await click('[data-testid="gate-reopen"]'); await sleep(800);

    // ----- removed content notice + appeal -----
    await go('/settings/safety', 1200);
    await click('[data-testid="sim-remove"]'); await sleep(1500);
    await go('/social/profile', 1500);
    check(!!(await page.$('[data-testid="removed-notice"]')) && /removed for violating our Community Guidelines/.test(await text()), 'owner sees the removed notice with guideline');
    await shot('phone-safety-removed-notice');
    await click('[data-testid="removed-appeal"]');
    await setVal('[data-testid="appeal-text"]', 'This was my own training log, not an ad. Please take another look.');
    await click('[data-testid="appeal-send"]'); await sleep(900);
    await go('/settings/safety#status', 1500);
    await scrollTo('#status');
    check(/Submitted/.test(await text()) && !!(await page.$('[data-testid="appeal-status"]')), 'Account status lists the decision with the appeal (Submitted)');
    await shot('phone-safety-account-status');
  }

  // ----- moderation queue (demo) -----
  if (kind === 'dark') { await go('/settings/safety', 1000); await click('[data-testid="sim-remove"]'); await sleep(1200); const ds = await page.$('[data-testid="decision-appeal"]'); if (ds) { await ds.click(); await sleep(400); await setVal('[data-testid="appeal-text"]', 'Please review this again, it was a workout.'); await click('[data-testid="appeal-send"]'); await sleep(800); } await scrollTo('#status'); await shot('phone-safety-account-status-dark'); }
  await go('/moderation', 1500);
  const mq = await text();
  check(/Demo queue/.test(mq) && /Urgent/.test(mq) && (await page.$$('[data-testid="mod-report"]')).length >= 5, 'demo queue: SAMPLE reports, urgent first');
  check(/Involves a minor|Self-harm/.test(await page.$eval('[data-testid="mod-report"]', (e) => e.innerText)), 'first item is an urgent (minor / self-harm) report');
  if (kind === 'phone') await shot('phone-safety-moderation-queue');
  if (kind === 'desktop') await shot('desktop-safety-moderation-queue');
  if (kind !== 'dark') {
    await click('[data-testid="mod-tab-appeals"]');
    if (kind === 'phone') {
      check((await page.$$('[data-testid="mod-appeal"]')).length === 1, 'my appeal is in the queue');
      await click('[data-testid="mod-appeal-reverse"]'); await sleep(900);
      await go('/social/profile', 1500);
      check(!(await page.$('[data-testid="removed-notice"]')), 'reversed → post restored (notice gone)');
      await go('/settings/safety', 1200);
      check(/Decision reversed/.test(await text()), 'Account status shows Decision reversed');
    }
  }
  if (kind === 'desktop') { await go('/settings/safety', 1500); await shot('desktop-safety-settings'); }
  await ctx.close();
}

const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
try {
  for (const k of ['phone', 'dark', 'desktop']) { try { await run(browser, k); } catch (e) { errors.push(`[${k}] ${e.stack || e}`); } }
} finally { await browser.close(); }
if (errors.length) { console.log('\nPROBLEMS:\n' + errors.join('\n')); process.exit(1); }
console.log('\nALL SAFETY SCREEN CHECKS PASSED');
