// Screenshots + checks for Calls (voice + video in Messages) in DEMO mode with clearly-labelled SAMPLE people and
// Chrome's fake camera/microphone. Phone (390×844) + desktop (1440×900). Needs `node tools/serve.mjs` on :4173.
// Output: screenshots/phone-calls-*.png, screenshots/desktop-calls-*.png
import puppeteer from 'puppeteer-core';
const BASE = 'http://localhost:4173/hybrd/';
const OUT = new URL('../screenshots/', import.meta.url).pathname;
const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run(browser, kind) {
  const phone = kind !== 'desktop';
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.emulateTimezone('America/New_York');
  await page.setViewport(phone ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width: 1440, height: 900, deviceScaleFactor: 1 });
  if (phone) await page.setUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36');
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${kind}] console.error: ${m.text()} @ ${page.url()}`); });
  page.on('pageerror', (e) => errors.push(`[${kind}] pageerror: ${e.message}`));
  page.on('response', (r) => { if (r.status() >= 400 && r.url().startsWith('http://localhost')) errors.push(`[${kind}] HTTP ${r.status()}: ${r.url()}`); });
  const check = (cond, msg) => { if (!cond) errors.push(`[${kind}] ${msg}`); else console.log('ok', kind, msg); };
  const overflow = () => page.evaluate(() => {
    const W = document.documentElement.clientWidth; const bad = [];
    if (document.documentElement.scrollWidth > W + 1) bad.push('document:' + document.documentElement.scrollWidth);
    for (const e of document.querySelectorAll('body *')) {
      const r = e.getBoundingClientRect(); if (!r.width || r.right <= W + 1) continue;
      if (e.closest('.s-tabs, .seg, .chips, .react-bar, .dm-tabs, .call-bg, [aria-hidden="true"]')) continue;
      let p = e.parentElement, clipped = false; while (p) { const cs = getComputedStyle(p); if (/(auto|scroll|hidden|clip)/.test(cs.overflowX) && p.getBoundingClientRect().right <= W + 1) { clipped = true; break; } p = p.parentElement; }
      if (!clipped) bad.push(e.tagName + '.' + [...e.classList].join('.') + ':' + Math.round(r.right));
      if (bad.length > 5) break;
    }
    return bad.join(' ');
  });
  const shot = async (name, wait = 700) => {
    await sleep(wait);
    await page.evaluate(() => { let st = document.getElementById('shot-css'); if (!st) { st = document.createElement('style'); st.id = 'shot-css'; document.head.appendChild(st); } st.textContent = '.toast{display:none!important}'; });
    const ov = await overflow();
    check(!ov, `${name}: no sideways overflow ${ov}`);
    await page.screenshot({ path: `${OUT}${name}.png` });
    console.log('shot', name);
  };
  const go = async (path, wait = 1200) => { await page.evaluate((p) => { history.pushState({}, '', p); dispatchEvent(new PopStateEvent('popstate')); }, '/hybrd' + path); await sleep(wait); };
  const clickText = async (txt, sel = 'button, a') => {
    const ok = await page.evaluate((t, s) => { const el = [...document.querySelectorAll(s)].find((e) => e.textContent.trim().includes(t) && e.offsetParent !== null); if (el) { el.click(); return true; } return false; }, txt, sel);
    if (!ok) throw new Error(`no element with text ${txt}`); await sleep(400);
  };
  const click = async (sel) => { const ok = await page.evaluate((s) => { const el = document.querySelector(s); if (el) { el.click(); return true; } return false; }, sel); if (!ok) throw new Error(`no ${sel}`); await sleep(450); };
  const setVal = async (sel, v) => {
    const ok = await page.evaluate((s, v) => { const i = document.querySelector(s); if (!i) return false; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); return true; }, sel, v);
    if (!ok) throw new Error(`no ${sel}`); await sleep(250);
  };
  const text = () => page.evaluate(() => document.body.innerText);
  const attr = (sel, a) => page.evaluate((s, a) => document.querySelector(s)?.getAttribute(a) ?? null, sel, a);
  const waitFor = async (sel, ms = 8000) => { try { await page.waitForSelector(sel, { timeout: ms }); return true; } catch { return false; } };
  const toBottom = () => page.evaluate(() => { const s = document.querySelector('[data-testid="dm-scroll"]'); if (s) s.scrollTop = s.scrollHeight; });
  const explainIfAsked = async () => { await sleep(500); if (await page.$('[data-testid="call-explain"]')) { check(/microphone/i.test(await text()), 'Explainer before the browser asks for the mic/camera'); await click('[data-testid="call-explain-go"]'); } };

  // ----- onboarding + demo -----
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.evaluate((() => ['agree-terms', 'consent-location', 'consent-health'].forEach((t) => { const el = document.querySelector(`[data-testid="${t}"]`); if (el && !el.checked) el.click(); }))); await clickText('Get started');
  await page.type('input[autocomplete="given-name"]', 'José Cruz');
  await clickText('Continue'); await clickText('Continue'); await clickText('Continue');
  await clickText('HYROX'); await clickText('Running');
  await clickText('Continue');
  await clickText('Explore with sample data first');
  await sleep(1500);
  await go('/messages');
  await click('[data-testid="enter-demo"]');
  await sleep(1200);
  await setVal('[data-testid="setup-dob"]', '1994-06-12');
  await setVal('[data-testid="setup-handle"]', 'jose.cruz');
  await clickText('I agree to the community rules');
  await click('[data-testid="setup-save"]');
  await sleep(1600);

  // ----- chat header buttons; requests can't call -----
  await go('/messages/chat?c=r-jordan', 1400);
  check(await page.$('[data-testid="dm-call-voice"]') && (await attr('[data-testid="dm-call-voice"]', 'disabled')) !== null, 'Message request: call buttons disabled');
  await go('/messages/chat?c=c-maya', 1400);
  check(!!(await page.$('[data-testid="dm-call-voice"]')) && !!(await page.$('[data-testid="dm-call-video"]')), 'Chat header: voice + video call buttons');

  if (!phone) {
    // desktop: video call with Maya
    await click('[data-testid="dm-call-video"]'); await explainIfAsked();
    check(await waitFor('[data-testid="call-screen"]'), 'Desktop: call screen opens');
    await waitFor('[data-testid="call-screen"][data-phase="active"]', 9000);
    await shot('desktop-calls-in-call-video', 2500);
    await click('[data-testid="call-end"]'); await sleep(3200);
    await go('/messages?folder=calls', 1200);
    await click('[data-testid="calls-sim-video-c-leo"]');
    check(await waitFor('[data-testid="call-incoming"]'), 'Desktop: incoming call screen');
    await shot('desktop-calls-incoming', 900);
    await click('[data-testid="call-decline"]');
    await ctx.close();
    return;
  }

  // ----- outgoing voice call → Maya answers -----
  await click('[data-testid="dm-call-voice"]');
  await explainIfAsked();
  check(await waitFor('[data-testid="call-screen"][data-phase="outgoing"]'), 'Outgoing ringing screen');
  check(/SAMPLE/.test(await text()) && /simulated/i.test(await text()), 'Demo call is labelled SAMPLE / simulated');
  await shot('phone-calls-outgoing', 900);
  check(await waitFor('[data-testid="call-screen"][data-phase="active"]', 9000), 'Maya (SAMPLE) picks up → active');
  check(/0:0\d/.test(await page.$eval('[data-testid="call-status"]', (e) => e.textContent)), 'Call timer running');
  await click('[data-testid="call-mic"]');
  check((await attr('[data-testid="call-mic"]', 'aria-pressed')) === 'true', 'Mute toggles');
  await shot('phone-calls-in-call-voice', 2600);
  await click('[data-testid="call-mic"]');

  // ----- switch to video -----
  await click('[data-testid="call-cam"]');
  await explainIfAsked();
  check(await waitFor('[data-testid="call-screen"][data-mode="video"]'), 'Voice → video upgrade');
  check(await waitFor('[data-testid="call-self"] video'), 'Self view (PiP) shows my camera');
  check(await waitFor('[data-testid="call-tile"] video', 4000), 'Maya’s simulated video tile');
  // drag the self view to the top-left corner
  const box = await (await page.$('[data-testid="call-self"]')).boundingBox();
  await page.mouse.move(box.x + 30, box.y + 30); await page.mouse.down(); await page.mouse.move(60, 160, { steps: 6 }); await page.mouse.up(); await sleep(500);
  const nb = await (await page.$('[data-testid="call-self"]')).boundingBox();
  check(nb.x < 40 && nb.y < 200, `Self view drags and snaps to a corner (${Math.round(nb.x)},${Math.round(nb.y)})`);
  await shot('phone-calls-in-call-video', 1500);

  // ----- info / report -----
  await page.evaluate(() => document.querySelector('.call-screen')?.classList.remove('bare'));
  await click('[data-testid="call-more"]');
  check(/DTLS-SRTP/.test(await text()) && /audit/i.test(await text()) && !!(await page.$('[data-testid="call-report"]')), 'Call info: honest encryption note + Report');
  await page.keyboard.press('Escape'); await sleep(400);

  // ----- minimize → call bar -----
  await page.evaluate(() => document.querySelector('.call-screen')?.classList.remove('bare'));
  await click('[data-testid="call-minimize"]');
  check(!!(await page.$('[data-testid="call-bar"]')), 'Minimized call bar');
  await go('/', 900);
  check(!!(await page.$('[data-testid="call-bar"]')), 'Call bar stays while browsing');
  await shot('phone-calls-minimized');
  await click('[data-testid="call-bar-end"]');
  await sleep(2400);

  // ----- incoming call (a SAMPLE person calls) -----
  await go('/messages?folder=calls', 1200);
  check(!!(await page.$('[data-testid="calls-tab"]')), 'Calls tab');
  await click('[data-testid="calls-sim-video-c-maya"]');
  check(await waitFor('[data-testid="call-incoming"]'), 'Incoming call screen');
  check(!!(await page.$('[data-testid="call-accept"]')) && !!(await page.$('[data-testid="call-decline"]')) && !!(await page.$('[data-testid="call-accept-voice"]')), 'Accept / Decline / Voice only');
  await shot('phone-calls-incoming', 900);
  await click('[data-testid="call-decline"]');
  check(!(await page.$('[data-testid="call-incoming"]')), 'Decline closes it');
  // accept one, then end
  await click('[data-testid="calls-sim-voice-c-leo"]');
  await waitFor('[data-testid="call-incoming"]');
  await click('[data-testid="call-accept"]');
  check(await waitFor('[data-testid="call-screen"][data-phase="active"]', 6000), 'Accept → connected');
  await sleep(2200);
  await click('[data-testid="call-end"]'); await sleep(3000);

  // ----- call cards in the chat -----
  await go('/messages/chat?c=c-maya', 1500); await toBottom();
  const cards = await page.$$eval('[data-testid="dm-call-log"]', (l) => l.map((e) => e.textContent));
  check(cards.length >= 2 && cards.some((t) => /Voice call/.test(t) && /sec|min/.test(t)) && cards.some((t) => /declined/i.test(t)), `Call cards in the chat (${cards.join(' | ')})`);
  await shot('phone-calls-chat-log');

  // ----- Calls tab -----
  await go('/messages?folder=calls', 1200);
  check((await page.$$('[data-testid="calls-row"]')).length >= 3, 'Calls tab lists calls');
  check(/no push notifications for calls/i.test(await text()), 'Calls tab says it only rings while open');
  await shot('phone-calls-tab');

  // ----- settings -----
  await go('/messages/settings', 1200);
  for (const w of ['everyone', 'friends', 'none']) check(!!(await page.$(`[data-testid="dm-callwho-${w}"]`)), `Who can call: ${w}`);
  await click('[data-testid="dm-dnd-1h"]');
  check(!!(await page.$('[data-testid="dm-dnd-status"]')), 'Do not disturb on');
  await page.evaluate(() => { document.getElementById('calls')?.scrollIntoView({ block: 'start' }); window.scrollBy(0, -90); });
  await shot('phone-calls-settings');
  // DND: a sample call doesn't ring
  await go('/messages?folder=calls', 1000);
  await click('[data-testid="calls-sim-voice-c-ana"]'); await sleep(800);
  check(!(await page.$('[data-testid="call-incoming"]')), 'Do not disturb: incoming call does not ring');
  await ctx.close();
}

const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-gpu', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
try {
  for (const k of process.argv.slice(2).length ? process.argv.slice(2) : ['phone', 'desktop']) await run(browser, k);
} finally { await browser.close(); }
if (errors.length) { console.error('\nERRORS:\n' + errors.join('\n')); process.exit(1); }
console.log('\nALL CALLS SCREENSHOT CHECKS PASSED');
