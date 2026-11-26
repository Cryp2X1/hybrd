// Screenshots + checks for Messages (private DMs + groups) in DEMO mode with clearly-labelled SAMPLE people.
// Phone (390×844) + desktop two-pane (1440×900) + an under-18 run. Needs `node tools/serve.mjs` running on :4173.
// Output: screenshots/phone-messages-*.png, screenshots/desktop-messages-*.png
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { withExif, buildExifApp1 } from './exif-fixture.mjs';
const BASE = 'http://localhost:4173/hybrd/';
const OUT = new URL('../screenshots/', import.meta.url).pathname;
const IMG = '/tmp/hybrd-dm-samples/sled-gps.jpg';
const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function makeSample(browser) {
  mkdirSync('/tmp/hybrd-dm-samples', { recursive: true });
  const page = await browser.newPage();
  const url = await page.evaluate(() => {
    const w = 1500, h = 1200, c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#3a2a10'); g.addColorStop(1, '#0b0b0b'); x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = '#2b2b2b'; x.fillRect(0, h * 0.7, w, h * 0.3);
    x.fillStyle = '#FFE600'; x.fillRect(w * 0.3, h * 0.45, w * 0.4, h * 0.25); x.fillStyle = '#111'; x.fillRect(w * 0.33, h * 0.5, w * 0.34, h * 0.06);
    x.fillStyle = '#fff'; x.font = '700 120px Impact, Arial Narrow, sans-serif'; x.textAlign = 'center'; x.fillText('SLED PUSH 4×25 M', w / 2, h * 0.25);
    x.fillStyle = 'rgba(255,255,255,.45)'; x.font = '600 40px sans-serif'; x.textAlign = 'right'; x.fillText('SAMPLE IMAGE', w - 50, 70);
    return c.toDataURL('image/jpeg', 0.9);
  });
  await page.close();
  writeFileSync(IMG, withExif(new Uint8Array(Buffer.from(url.split(',')[1], 'base64')), buildExifApp1({ date: '2026:11:18 18:20:00', lat: 40.75, lng: -73.99 })));
}

async function run(browser, kind) {
  const phone = kind !== 'desktop';
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.emulateTimezone('America/New_York');
  if (kind === 'teen') {
    // v1.7: the default minimum age is 18, so the under-18 messaging protections are tested with minAge set to 13
    // (the config an owner would use to allow teens).
    const { readFileSync } = await import('node:fs');
    await page.setRequestInterception(true);
    page.on('request', (r) => {
      if (/\/config\.js(\?|$)/.test(r.url())) {
        let body = ''; try { body = readFileSync((process.env.DIST || '/tmp/dist-theme') + '/config.js', 'utf8'); } catch { body = 'window.HYBRD_CONFIG = {};'; }
        return r.respond({ status: 200, contentType: 'application/javascript', body: body + '\nwindow.HYBRD_CONFIG = Object.assign(window.HYBRD_CONFIG || {}, { minAge: 13 });\n' });
      }
      r.continue();
    });
  }
  await page.setViewport(phone ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width: 1440, height: 900, deviceScaleFactor: 1 });
  if (phone) await page.setUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36');
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${kind}] console.error: ${m.text()} @ ${page.url()}`); });
  page.on('pageerror', (e) => errors.push(`[${kind}] pageerror: ${e.message}`));
  page.on('response', (r) => { if (r.status() >= 400 && r.url().startsWith('http://localhost')) errors.push(`[${kind}] HTTP ${r.status()}: ${r.url()}`); });
  page.on('dialog', (d) => d.accept());
  const check = (cond, msg) => { if (!cond) errors.push(`[${kind}] ${msg}`); else console.log('ok', kind, msg); };
  const overflow = () => page.evaluate(() => {
    const W = document.documentElement.clientWidth; const bad = [];
    if (document.documentElement.scrollWidth > W + 1) bad.push('document:' + document.documentElement.scrollWidth);
    for (const e of document.querySelectorAll('body *')) {
      const r = e.getBoundingClientRect(); if (!r.width || r.right <= W + 1) continue;
      if (e.closest('.s-tabs, .seg, .chips, .react-bar, .react-tip, .dm-emoji, .dm-tabs, [aria-hidden="true"]')) continue;
      let p = e.parentElement, clipped = false; while (p) { const cs = getComputedStyle(p); if (/(auto|scroll|hidden|clip)/.test(cs.overflowX) && p.getBoundingClientRect().right <= W + 1) { clipped = true; break; } p = p.parentElement; }
      if (!clipped) bad.push(e.tagName + '.' + [...e.classList].join('.') + ':' + Math.round(r.right));
      if (bad.length > 5) break;
    }
    return bad.join(' ');
  });
  const shot = async (name) => {
    await sleep(700);
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
    const ok = await page.evaluate((s, v) => {
      const i = document.querySelector(s); if (!i) return false;
      const proto = i.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); return true;
    }, sel, v);
    if (!ok) throw new Error(`no ${sel}`); await sleep(250);
  };
  const text = () => page.evaluate(() => document.body.innerText);
  const count = (sel) => page.$$eval(sel, (l) => l.length);
  // open the press-and-hold bar + menu on the bubble containing `txt`
  const holdOn = async (txt) => {
    const ok = await page.evaluate((t) => {
      const b = [...document.querySelectorAll('.dm-bubble')].reverse().find((e) => e.textContent.includes(t)); if (!b) return false;
      b.scrollIntoView({ block: 'center' }); b.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })); return true;
    }, txt);
    if (!ok) throw new Error(`no bubble ${txt}`); await sleep(600);
  };
  const toBottom = () => page.evaluate(() => { const s = document.querySelector('[data-testid="dm-scroll"]'); if (s) s.scrollTop = s.scrollHeight; });

  // ----- onboarding with sample training data (so there are workouts to share) -----
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.evaluate((() => ['agree-terms', 'consent-location', 'consent-health'].forEach((t) => { const el = document.querySelector(`[data-testid="${t}"]`); if (el && !el.checked) el.click(); }))); await clickText('Get started');
  await page.type('input[autocomplete="given-name"]', 'José Cruz');
  await clickText('Continue'); await clickText('Continue'); await clickText('Continue');
  await clickText('HYROX'); await clickText('Running');
  await clickText('Continue');
  await clickText('Explore with sample data first');
  await sleep(1500);

  // ----- Local mode: Messages needs accounts (or the labelled demo) -----
  await go('/messages');
  check(/Connect accounts/i.test(await text()) && !(await page.$('[data-testid="dm-conv"]')), 'Local mode: no chats until accounts or the demo');
  await click('[data-testid="enter-demo"]');
  await sleep(1200);
  await setVal('[data-testid="setup-dob"]', kind === 'teen' ? '2011-05-02' : '1994-06-12');
  await setVal('[data-testid="setup-handle"]', 'jose.cruz');
  await clickText('I agree to the community rules');
  await click('[data-testid="setup-save"]');
  await sleep(1600);

  if (kind === 'teen') {
    await go('/messages');
    await click('[data-testid="dm-tab-requests"]');
    check(!/Jordan|Rivera/.test(await text()), 'Under-18: no requests from adult strangers');
    await go('/messages/settings');
    check(/Friends only/i.test(await text()) && /under 18/i.test(await text()), 'Under-18: Friends only, explained');
    await go('/messages/chat?to=sample.jordan');
    check(!!(await page.$('[data-testid="dm-disabled"], [data-testid="dm-minor-note"]')), 'Under-18: can’t start a chat with an adult stranger');
    await shot('phone-messages-teen');
    await ctx.close();
    return;
  }

  // ----- inbox -----
  await go('/messages');
  check(!!(await page.$('[data-testid="top-messages"] [data-testid="dm-badge"], [data-testid="top-messages"] .s-badge')) || !phone, 'Top-bar Messages icon with unread badge');
  check((await count('[data-testid="dm-conv"]')) >= 4, 'Inbox lists chats');
  const inbox = await text();
  check(/SAMPLE/.test(inbox), 'Sample people labelled SAMPLE');
  check(/HYROX Doubles Crew/.test(inbox), 'Group chat in inbox');
  check(/not end-to-end encrypted/i.test(inbox), 'Inbox states messages are not end-to-end encrypted');
  check(!/@[a-z0-9.-]+\.(com|org)|\+1[\d -]{9,}/i.test(inbox), 'No emails or phone numbers shown');
  if (!phone) {
    await go('/messages/chat?c=c-maya', 1600); await toBottom();
    check(!!(await page.$('[data-testid="dm-inbox"]')) && !!(await page.$('[data-testid="dm-chat"]')), 'Desktop: inbox and chat side by side');
    await shot('desktop-messages-two-pane');
    await go('/messages/chat?c=g-crew', 1500); await toBottom();
    await shot('desktop-messages-group');
    await ctx.close();
    return;
  }
  await shot('phone-messages-inbox');

  // ----- requests -----
  await click('[data-testid="dm-tab-requests"]');
  const req = await text();
  check(/Jordan/.test(req) && /Rivera/.test(req), 'Requests folder lists strangers');
  check(!/Do you train at a gym/.test(req), 'Request content hidden in the list');
  await shot('phone-messages-requests');
  await go('/messages/chat?c=r-jordan', 1500);
  for (const id of ['accept', 'block', 'report', 'delete']) check(!!(await page.$(`[data-testid="dm-req-${id}"]`)), `Request bar: ${id}`);
  check(!!(await page.$('[data-testid="dm-reveal"]')), 'Request media blurred until tapped');
  check(/see when you’ve read/i.test(await text()), 'Explains the sender can’t see read status');
  await shot('phone-messages-request-open');

  // ----- report sheet (from the request) -----
  await click('[data-testid="dm-req-report"]');
  check(!!(await page.$('[data-testid="dm-report-sheet"]')), 'Report sheet opens');
  await click('[data-testid^="dm-reason-"]');
  await shot('phone-messages-report');
  await page.keyboard.press('Escape'); await sleep(400);
  if (await page.$('[data-testid="dm-report-sheet"]')) await clickText('Cancel').catch(() => {});

  // ----- 1:1 chat -----
  await go('/messages/chat?c=c-maya', 1500); await toBottom();
  const chat = await text();
  check(!!(await page.$('.dm-quote')), 'Reply quote shown');
  check(/Tempo run/.test(chat), 'Workout card shown');
  check(!!(await page.$('.dm-bubble img, .dm-media img')), 'Photo shown');
  check(/Edited/i.test(chat), 'Edited label');
  check((await count('[data-testid="reaction-summary"], .dm-reacts')) >= 1, 'Reactions shown');
  check(/Seen/i.test(chat), 'Seen receipt');
  await page.evaluate(() => { const e = document.getElementById('m-m4'); e && e.scrollIntoView({ block: 'start' }); });
  await shot('phone-messages-thread');
  // send text + photo + workout
  await setVal('[data-testid="dm-input"]', 'Sled push felt strong today 💪');
  await click('[data-testid="dm-send"]'); await sleep(900);
  const [fc] = await Promise.all([page.waitForFileChooser(), click('[data-testid="dm-attach"]')]);
  await fc.accept([IMG]); await sleep(2200);
  check(!!(await page.$('[data-testid="dm-attachment"]')), 'Photo attached (location stripped)');
  await click('[data-testid="dm-send"]'); await sleep(1500);
  await click('[data-testid="dm-workout"]');
  if (await page.$('[data-testid="dm-pick-workout"]')) { await click('[data-testid="dm-pick-workout"]'); await click('[data-testid="dm-send"]'); await sleep(1200); check(true, 'Shared a workout'); }
  else check(false, 'Workout picker lists sample workouts');
  await sleep(4500); // sample friend marks seen / types / replies
  await toBottom();
  await shot('phone-messages-chat');
  // press and hold → reactions + menu
  await holdOn('Saturday works');
  check(!!(await page.$('.react-bar')), 'Press-and-hold opens the reaction bar');
  check(!!(await page.$('[data-testid="dm-menu"]')) && !!(await page.$('[data-testid="dm-act-reply"]')) && !!(await page.$('[data-testid="dm-act-report"]')), 'Message menu: Reply … Report');
  await shot('phone-messages-hold');
  await page.evaluate(() => { const b = document.querySelector('.react-bar button'); b && b.click(); }); await sleep(600);
  // own message menu has Edit + Unsend
  await holdOn('Sled push felt strong');
  check(!!(await page.$('[data-testid="dm-act-edit"]')) && !!(await page.$('[data-testid="dm-act-unsend"]')), 'Own message: Edit and Unsend');
  await click('[data-testid="dm-act-unsend"]'); await sleep(800);
  if (await page.$('.sheet button.danger, .dm-confirm button.danger')) await click('.sheet button.danger, .dm-confirm button.danger');
  await sleep(600);
  check(/You unsent a message/.test(await text()), 'Unsend leaves a placeholder');

  // ----- group -----
  await go('/messages/chat?c=g-crew', 1500); await toBottom();
  check(/Leo/.test(await text()) && !!(await page.$('.dm-sender')), 'Group shows sender names');
  await shot('phone-messages-group');
  await click('[data-testid="dm-info"]');
  check(!!(await page.$('[data-testid="dm-group-name"]')) && !!(await page.$('[data-testid="dm-members"]')), 'Group details: rename + members (admin)');
  await shot('phone-messages-group-info');

  // ----- privacy settings -----
  await go('/messages/settings');
  for (const w of ['everyone', 'fof', 'friends', 'none']) check(!!(await page.$(`[data-testid="dm-who-${w}"]`)), `Who can message: ${w}`);
  check(!!(await page.$('[data-testid="dm-receipts"]')) && !!(await page.$('[data-testid="dm-activity"]')), 'Read receipts + activity toggles');
  await shot('phone-messages-settings');

  // ----- new group -----
  await go('/messages/new?group=1');
  if (!(await page.$('[data-testid="dm-group-title"]'))) { const g = await page.$('[data-testid="dm-new-group"]'); if (g) await click('[data-testid="dm-new-group"]'); }
  check(!!(await page.$('[data-testid="dm-group-title"]')), 'New group form');
  await ctx.close();
}

const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
try {
  await makeSample(browser);
  for (const k of process.argv.slice(2).length ? process.argv.slice(2) : ['phone', 'desktop', 'teen']) await run(browser, k);
} finally { await browser.close(); }
if (errors.length) { console.error('\nERRORS:\n' + errors.join('\n')); process.exit(1); }
console.log('\nALL MESSAGES SCREENSHOT CHECKS PASSED');
