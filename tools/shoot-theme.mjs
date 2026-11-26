// Appearance (Light / Dark / System) checks + the deliverable screenshots, in a real Chrome.
// Needs `node tools/serve.mjs` on :4173 (set DIST=/path to serve a copy of dist). Writes to screenshots/.
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
const BASE = 'http://localhost:4173/hybrd/';
const OUT = new URL('../screenshots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (ok, name, extra = '') => { if (ok) pass++; else { fail++; console.log('FAIL', name, extra); } if (ok) console.log('ok  ', name); };
const errors = [];

async function open(browser, { kind = 'phone', theme = null, scheme = null, onboard = true, width }) {
  const phone = kind === 'phone';
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.emulateTimezone('America/New_York');
  await page.setViewport(phone ? { width: width || 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width: 1440, height: 900, deviceScaleFactor: 1 });
  if (phone) await page.setUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36');
  if (scheme) await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
  if (theme) await page.evaluateOnNewDocument((t) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('hybrd:theme', t); sessionStorage.setItem('seeded', '1'); } }, theme);
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('dialog', (d) => d.accept());
  const S = { ctx, page };
  S.click = async (sel) => { const ok = await page.evaluate((s) => { const e = document.querySelector(s); if (e) { e.click(); return true; } return false; }, sel); if (!ok) throw new Error('no ' + sel); await sleep(450); };
  S.clickText = async (t) => { const ok = await page.evaluate((t) => { const e = [...document.querySelectorAll('button, a')].find((x) => x.textContent.trim().includes(t) && x.offsetParent !== null); if (e) { e.click(); return true; } return false; }, t); if (!ok) throw new Error('no text ' + t); await sleep(400); };
  S.setVal = async (sel, v) => { await page.evaluate((s, v) => { const i = document.querySelector(s); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })); }, sel, v); await sleep(200); };
  S.go = async (path, wait = 1200) => { await page.evaluate((p) => { history.pushState({}, '', p); dispatchEvent(new PopStateEvent('popstate')); }, '/hybrd' + path); await sleep(wait); };
  S.shot = (name, opts = {}) => page.screenshot({ path: OUT + name + '.png', ...opts });
  S.state = () => page.evaluate(() => ({ theme: document.documentElement.dataset.theme, cs: document.documentElement.style.colorScheme, meta: document.querySelector('meta[name="theme-color"]')?.content, ios: document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.content, stored: localStorage.getItem('hybrd:theme'), bg: getComputedStyle(document.body).backgroundColor }));
  S.overflow = () => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  if (onboard) {
    await S.clickText('Get started');
    await page.type('input[autocomplete="given-name"]', 'José Cruz');
    await S.clickText('Continue'); await S.clickText('Continue'); await S.clickText('Continue');
    await S.clickText('Running'); await S.clickText('Continue');
    await S.clickText('Explore with sample data first'); await sleep(1500);
  }
  return S;
}
async function demoSocial(S) {
  await S.go('/messages'); await S.click('[data-testid="enter-demo"]'); await sleep(900);
  await S.setVal('[data-testid="setup-dob"]', '1994-06-12'); await S.setVal('[data-testid="setup-handle"]', 'jose.cruz');
  await S.clickText('I agree to the community rules'); await S.click('[data-testid="setup-save"]'); await sleep(1600);
}

const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  // ---------- 1. First paint: no flash, right meta ----------
  for (const [pref, scheme, want, color] of [['light', 'dark', 'light', '#f4f4f1'], ['dark', 'light', 'dark', '#0a0a0a']]) {
    const ctx = await browser.createBrowserContext(); const page = await ctx.newPage();
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
    await page.evaluateOnNewDocument((t) => { localStorage.setItem('hybrd:theme', t); window.__frames = []; const f = () => { window.__frames.push(document.documentElement.dataset.theme + '|' + getComputedStyle(document.documentElement).backgroundColor); if (window.__frames.length < 6) requestAnimationFrame(f); }; requestAnimationFrame(f); }, pref);
    await page.goto(BASE, { waitUntil: 'domcontentloaded' }); await sleep(900);
    const frames = await page.evaluate(() => window.__frames);
    check(frames.length > 0 && frames.every((f) => f.startsWith(want + '|')), `No flash: stored "${pref}" beats a "${scheme}" device on every early frame`, JSON.stringify(frames));
    const meta = await page.evaluate(() => document.querySelector('meta[name="theme-color"]').content);
    check(meta === color, `theme-color meta is ${color} for ${want}`, meta);
    await ctx.close();
  }
  // ---------- 2. System follows the device, live ----------
  {
    const S = await open(browser, { onboard: false, scheme: 'dark' });
    let st = await S.state();
    check(st.theme === 'dark' && st.meta === '#0a0a0a' && st.stored === null, 'Default = System → dark on a dark device', JSON.stringify(st));
    await S.page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]); await sleep(500);
    st = await S.state();
    check(st.theme === 'light' && st.meta === '#f4f4f1' && st.cs === 'light', 'System follows the device live (dark → light) incl. theme-color', JSON.stringify(st));
    await S.ctx.close();
  }
  // ---------- 3. Appearance in Settings: choose, persist, sync to profile ----------
  {
    const S = await open(browser, { scheme: 'light' });
    await S.go('/settings'); await sleep(300);
    check(await S.page.evaluate(() => /Appearance/.test(document.body.innerText)), 'Settings home lists Appearance');
    await S.go('/settings/appearance');
    check(!!(await S.page.$('[data-testid="theme-pick"]')) && (await S.page.$$('[data-testid^="theme-"] ')).length >= 3, 'Appearance shows Light / Dark / System');
    await S.shot('phone-settings-appearance-light');
    await S.click('[data-testid="theme-dark"]');
    let st = await S.state();
    check(st.theme === 'dark' && st.stored === 'dark' && st.meta === '#0a0a0a' && st.ios === 'black-translucent', 'Dark applies instantly + saved + theme-color + iOS status bar', JSON.stringify(st));
    await S.shot('phone-settings-appearance-dark');
    const inProfile = await S.page.evaluate(async () => {
      const dbs = (await indexedDB.databases?.()) || [];
      for (const d of dbs) {
        const db = await new Promise((res, rej) => { const r = indexedDB.open(d.name); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
        for (const name of [...db.objectStoreNames]) {
          const rows = await new Promise((res) => { const rq = db.transaction(name).objectStore(name).getAll(); rq.onsuccess = () => res(rq.result); rq.onerror = () => res([]); });
          if (JSON.stringify(rows).includes('"theme":"dark"')) return true;
        }
      }
      return false;
    });
    check(inProfile, 'Choice is also saved in the profile (so it syncs)');
    await S.click('[data-testid="theme-light"]');
    st = await S.state();
    check(st.theme === 'light' && st.stored === 'light' && st.meta === '#f4f4f1' && st.ios === 'default', 'Light applies + saved', JSON.stringify(st));
    await S.page.reload({ waitUntil: 'networkidle0' }); await sleep(600);
    st = await S.state();
    check(st.theme === 'light' && st.stored === 'light', 'Choice survives a reload', JSON.stringify(st));
    await S.page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]); await sleep(400);
    check((await S.state()).theme === 'light', 'Explicit Light ignores the device setting');
    await S.go('/settings/appearance'); await S.click('[data-testid="theme-system"]');
    st = await S.state();
    check(st.theme === 'dark' && st.stored === 'system', 'System → follows device (dark) and is stored as "system"', JSON.stringify(st));
    await S.ctx.close();
  }
  // ---------- 4. Phone: nav + header, light and dark, plus overflow at small widths ----------
  for (const theme of ['light', 'dark']) {
    const S = await open(browser, { theme });
    await demoSocial(S);
    await S.go('/');
    const labels = await S.page.$$eval('.bottom-nav a', (as) => as.map((a) => a.textContent.trim().toLowerCase().replace(/^\d+/, '')));
    check(JSON.stringify(labels) === JSON.stringify(['home', 'social', 'record', 'train', 'fuel']), `Phone bottom bar: Home, Social, Record, Train, Fuel (${theme})`, JSON.stringify(labels));
    check(!!(await S.page.$('[data-testid="nav-social-badge"]')), 'Social badge sits on the nav item');
    const dm = await S.page.$eval('[data-testid="top-messages"]', (e) => { const r = e.getBoundingClientRect(); return { w: r.width, h: r.height, bg: getComputedStyle(e).backgroundColor, top: r.top, left: r.left }; });
    check(dm.w >= 40 && dm.h >= 40 && /255, 230, 0/.test(dm.bg), 'Messages button is ≥40px, yellow, in the header', JSON.stringify(dm));
    check(!!(await S.page.$('[data-testid="dm-badge"]')), 'Messages shows an unread badge');
    const nav = await S.page.$('.bottom-nav'); const nb = await nav.boundingBox();
    await S.shot(`phone-nav-${theme}`, { clip: { x: 0, y: 844 - 190, width: 390, height: 190 } });
    await S.shot(`phone-header-messages-badge-${theme}`, { clip: { x: 0, y: 0, width: 390, height: 120 } });
    await S.go('/', 900);
    await S.shot(`phone-${theme}-home`);
    if (theme === 'dark') {
      await S.go('/record', 2600); await S.shot('phone-dark-record');
      await S.go('/social', 1500); await S.shot('phone-dark-social');
      await S.go('/messages', 1500); await S.shot('phone-dark-messages');
      await S.go('/fuel', 1500); await S.shot('phone-dark-fuel');
    } else {
      for (const w of [320, 360, 430]) {
        await S.page.setViewport({ width: w, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
        for (const r of ['/', '/social', '/messages', '/fuel', '/settings/appearance']) { await S.go(r, 700); const o = await S.overflow(); check(o <= 0, `No sideways overflow at ${w}px on ${r}`, String(o)); }
        if (w === 320) {
          await S.go('/', 700);
          const ov = await S.page.evaluate(() => { const t = document.querySelector('.topbar'); return [...t.children].some((c) => c.getBoundingClientRect().right > innerWidth + 0.5); });
          check(!ov, 'Header items all fit at 320px');
          await S.shot('phone-header-320');
        }
      }
    }
    await S.ctx.close();
  }
  // ---------- 5. Sheets / modals / inputs in light ----------
  {
    const S = await open(browser, { theme: 'light' });
    await S.go('/train/log', 1000);
    await S.clickText('Add exercise'); await sleep(500);
    const sheet = await S.page.$eval('.sheet', (e) => getComputedStyle(e).backgroundColor);
    check(/255, 255, 255|rgb\(2[34]\d/.test(sheet), 'Sheet is a light surface in Light mode', sheet);
    await S.shot('phone-light-sheet');
    await S.ctx.close();
  }
  // ---------- 6. Desktop dark + light ----------
  for (const theme of ['dark', 'light']) {
    const S = await open(browser, { kind: 'desktop', theme });
    await demoSocial(S);
    await S.go('/', 1200);
    const side = await S.page.$$eval('.side-nav a', (as) => as.map((a) => a.textContent.trim().replace(/\d+$/, '')).slice(0, 3));
    check(side[0] === 'Home' && side[1] === 'Social' && side[2] === 'Messages', `Desktop nav starts Home, Social, Messages (${theme})`, JSON.stringify(side));
    check(!!(await S.page.$('[data-testid="desk-messages"]')) && !!(await S.page.$('[data-testid="desk-messages-badge"]')), 'Desktop has a labelled Messages button with badge');
    await S.shot(`desktop-${theme}`);
    await S.ctx.close();
  }
} catch (e) { fail++; console.log('CRASH', e.stack || e.message); } finally { await browser.close(); }
console.log(errors.length ? 'page errors:\n' + errors.join('\n') : 'no page errors');
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
