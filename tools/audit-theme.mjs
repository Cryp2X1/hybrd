// Theme sweep: walks the app in Light and Dark (phone + desktop), screenshots every screen, and audits text contrast
// in the page (WCAG ratio of each visible text node against its effective background). Needs `node tools/serve.mjs` on :4173.
// Usage: node tools/audit-theme.mjs [outDir]   → prints problems, writes screenshots to outDir (default /tmp/sweep)
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
const BASE = 'http://localhost:4173/hybrid/'.replace('hybrid', 'hybrd');
const OUT = process.argv[2] || '/tmp/sweep';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const problems = [], notes = [];
const ROUTES = ['/', '/score', '/coach', '/train', '/train/log', '/train/ultra', '/record', '/routes', '/timers', '/fuel', '/fuel/add', '/fuel/calculator', '/fuel/weight-loss', '/fuel/weight-loss/setup', '/fuel/fasting', '/fuel/sleep', '/mind', '/mind/help', '/burn', '/progress', '/me', '/me/gallery', '/me/import', '/social', '/social/friends', '/social/new', '/social/notifications', '/social/profile', '/messages', '/settings', '/settings/account', '/settings/profile', '/settings/privacy', '/settings/units', '/settings/recording', '/settings/notifications', '/settings/goals', '/settings/devices', '/settings/messages', '/settings/appearance', '/settings/data', '/settings/help', '/settings/about', '/settings/safety', '/safety/guidelines', '/safety/reporting', '/safety/time-off', '/safety/delete', '/moderation', '/a?id=8d3c1a52-2f4e-4c36-9a77-0b1e5c2d9f10', '/sign-in', '/sign-up', '/legal', '/legal/terms', '/legal/privacy', '/legal/health-data', '/legal/disclaimer', '/legal/dmca', '/legal/delete-account'];
const only = process.env.ROUTES ? process.env.ROUTES.split(',') : null;

const AUDIT = () => {
  const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] === undefined ? 1 : p[3] }; };
  const lumOf = (c) => { const f = [c.r, c.g, c.b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2]; };
  const over = (top, bot) => ({ r: top.r * top.a + bot.r * (1 - top.a), g: top.g * top.a + bot.g * (1 - top.a), b: top.b * top.a + bot.b * (1 - top.a), a: 1 });
  const page = parse(getComputedStyle(document.body).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 };
  const out = []; const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    if (!node.nodeValue.trim()) continue;
    const el = node.parentElement; if (!el || ['SCRIPT', 'STYLE', 'OPTION'].includes(el.tagName)) continue;
    const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
    const cs = getComputedStyle(el); if (el.closest('button:disabled, [aria-disabled="true"]')) continue; // inactive controls are exempt (WCAG 1.4.3)
    if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) continue;
    if (el.closest('.leaflet-container, .maplibregl-map, [aria-hidden="true"], .recmap, .call-screen, .s-story, .gv, .sample-tag, svg')) continue;
    // background: walk up, compositing translucent layers
    let layers = [], p = el, unknown = false;
    while (p) { const c = getComputedStyle(p); if (c.backgroundImage && c.backgroundImage !== 'none') { if (/url\(/.test(c.backgroundImage)) { unknown = true; break; } } const b = parse(c.backgroundColor); if (b && b.a > 0) { layers.push(b); if (b.a >= 0.99) break; } p = p.parentElement; }
    if (unknown) continue;
    let bg = layers.length && layers[layers.length - 1].a >= 0.99 ? layers[layers.length - 1] : page;
    for (let i = layers.length - (layers[layers.length - 1]?.a >= 0.99 ? 2 : 1); i >= 0; i--) bg = over(layers[i], bg);
    let fg = parse(cs.color); if (!fg) continue; fg = { ...fg, a: fg.a * (+cs.opacity || 1) }; fg = over(fg, bg);
    const l1 = lumOf(fg), l2 = lumOf(bg); const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    const size = parseFloat(cs.fontSize), bold = +cs.fontWeight >= 700; const large = size >= 24 || (size >= 18.66 && bold);
    const need = large ? 3 : 4.5;
    if (ratio < need - 0.05) {
      const key = el.tagName + '.' + [...el.classList].join('.') + '|' + cs.color + '|' + cs.backgroundColor;
      if (seen.has(key)) continue; seen.add(key);
      out.push({ sel: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''), txt: node.nodeValue.trim().slice(0, 28), ratio: +ratio.toFixed(2), fg: cs.color, bg: `rgb(${Math.round(bg.r)},${Math.round(bg.g)},${Math.round(bg.b)})` });
    }
  }
  return out.slice(0, 25);
};

async function session(browser, kind, theme) {
  const phone = kind === 'phone';
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.emulateTimezone('America/New_York');
  await page.setViewport(phone ? { width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true } : { width: 1440, height: 900, deviceScaleFactor: 1 });
  if (phone) await page.setUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36');
  await page.evaluateOnNewDocument((t) => { try { localStorage.setItem('hybrd:theme', t); } catch {} }, theme);
  page.on('pageerror', (e) => problems.push(`[${kind}/${theme}] pageerror: ${e.message}`));
  page.on('dialog', (d) => d.accept());
  const click = async (sel) => { const ok = await page.evaluate((s) => { const e = document.querySelector(s); if (e) { e.click(); return true; } return false; }, sel); if (!ok) throw new Error('no ' + sel); await sleep(450); };
  const clickText = async (t) => { const ok = await page.evaluate((t) => { const e = [...document.querySelectorAll('button, a')].find((x) => x.textContent.trim().includes(t) && x.offsetParent !== null); if (e) { e.click(); return true; } return false; }, t); if (!ok) throw new Error('no text ' + t); await sleep(400); };
  const setVal = async (sel, v) => { await page.evaluate((s, v) => { const i = document.querySelector(s); const proto = i.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })); }, sel, v); await sleep(200); };
  const go = async (path, wait = 1100) => { await page.evaluate((p) => { history.pushState({}, '', p); dispatchEvent(new PopStateEvent('popstate')); }, '/hybrd' + path); await sleep(wait); };
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.evaluate((() => ['agree-terms', 'consent-location', 'consent-health'].forEach((t) => { const el = document.querySelector(`[data-testid="${t}"]`); if (el && !el.checked) el.click(); }))); await clickText('Get started');
  await page.type('input[autocomplete="given-name"]', 'José Cruz');
  await clickText('Continue'); await clickText('Continue'); await clickText('Continue');
  await clickText('Running'); await clickText('Continue');
  await clickText('Explore with sample data first'); await sleep(1500);
  await go('/messages'); await click('[data-testid="enter-demo"]'); await sleep(1000);
  await setVal('[data-testid="setup-dob"]', '1994-06-12'); await setVal('[data-testid="setup-handle"]', 'jose.cruz');
  await clickText('I agree to the community rules'); await click('[data-testid="setup-save"]'); await sleep(1600);
  const themeNow = await page.evaluate(() => document.documentElement.dataset.theme);
  if (themeNow !== theme) problems.push(`[${kind}/${theme}] data-theme is ${themeNow}`);
  for (const r of ROUTES) {
    if (only && !only.includes(r)) continue;
    await go(r, r.startsWith('/record') || r === '/routes' || r.startsWith('/me/import') ? 2200 : 1200);
    const name = `${kind}-${theme}-${r.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'home'}`;
    const bad = await page.evaluate(AUDIT);
    if (bad.length) problems.push(`[${kind}/${theme}] ${r}\n    ` + bad.map((b) => `${b.sel} "${b.txt}" ${b.ratio}:1 fg ${b.fg} on ${b.bg}`).join('\n    '));
    await page.screenshot({ path: `${OUT}/${name}.png` });
  }
  await ctx.close();
}

const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const combos = (process.env.COMBOS || 'phone:light,phone:dark,desktop:light').split(',').map((c) => c.split(':'));
  for (const [k, t] of combos) { await session(browser, k, t); console.log('done', k, t); }
} catch (e) { problems.push('CRASH ' + (e.stack || e.message)); } finally { await browser.close(); }
console.log(problems.length ? '\nPROBLEMS:\n' + problems.join('\n') : '\nno contrast problems');
