// Screenshots + checks for Fuel › Fasting: setup/health check, recommendation, protocols, running timer, history, tips,
// research, safety block (phone) and the desktop timer + protocols. Needs `node tools/serve.mjs` running on :4173.
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
    // hide toasts, and the fixed bottom nav on full-page captures (it would be painted mid-page)
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
  const setInput = async (sel, value) => {
    const ok = await page.evaluate((s, v) => { const i = document.querySelector(s); if (!i) return false; const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })); return true; }, sel, value);
    if (!ok) throw new Error(`no input ${sel}`); await sleep(250);
  };
  const setField = async (label, value) => {
    const ok = await page.evaluate((l, v) => { const i = [...document.querySelectorAll('label.field')].find((x) => x.textContent.includes(l))?.querySelector('input'); if (!i) return false; const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })); return true; }, label, value);
    if (!ok) throw new Error(`no field ${label}`); await sleep(250);
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

  check(!!(await page.$('[data-testid="fast-entry"]')), 'Home: fasting entry card');
  await go('/fuel'); check(/Fasting/.test(await text()) && !!(await page.$('[data-testid="fast-entry"]')), 'Fuel: Fasting tab + entry card');
  await clickText('Fasting', '.seg button'); await sleep(900);
  check(page.url().endsWith('/fuel/fasting') && !!(await page.$('[data-testid="fast-landing"]')), 'Fuel tab opens /fuel/fasting landing');
  if (phone) await shot('phone-fasting-landing');
  await page.click('[data-testid="fast-start"]'); await sleep(800);

  // Step 1 → 2 (health) → 3 (goal) → 4 (schedule) → 5 (plan)
  check(/About you/i.test(await text()), 'Setup step 1');
  await clickText('Continue');
  check(/Health check/i.test(await text()), 'Setup step 2: health check');
  if (phone) { await top(); await shot('phone-fasting-setup'); }
  await clickText('Continue');
  check(/Your goal/i.test(await text()), 'Setup step 3: goal');
  await clickText('Lose weight'); await clickText('Tried it');
  await clickText('Continue');
  check(/Your day/i.test(await text()), 'Setup step 4: schedule');
  await clickText('Evening', '.chip');
  await clickText('Continue');
  const rec = await page.$eval('[data-testid="fast-rec"]', (e) => e.textContent).catch(() => '');
  check(rec === '16:8', `Recommendation for some experience + weight goal = 16:8 (got ${rec})`);
  const t5 = await text();
  check(/12:00–20:00/.test(t5), 'Eating window 12:00–20:00 fits 18:00 training');
  check(/didn’t beat/i.test(t5), 'Honest “matched, didn’t beat” note shown');
  await top(); await shot(phone ? 'phone-fasting-recommendation' : 'desktop-fasting-recommendation', phone);
  await page.click('[data-testid="fast-save"]'); await sleep(1200);
  check(page.url().endsWith('/fuel/fasting') && /Ready to fast/i.test(await text()), 'Plan saved → timer ready');

  // Seed a week of history (as if logged on previous days), then reload
  await sleep(800);
  await page.evaluate(async () => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('keyval-store'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const get = (k) => new Promise((res) => { const q = db.transaction('keyval').objectStore('keyval').get(k); q.onsuccess = () => res(q.result); });
    const put = (k, v) => new Promise((res) => { const tx = db.transaction('keyval', 'readwrite'); tx.objectStore('keyval').put(v, k); tx.oncomplete = () => res(); });
    const data = await get('hybrd:local:data');
    const H = 3600000; const fasts = [];
    const hours = [16.4, 16.1, 14.2, 16.8, 17.0, 16.3]; // 6 days back → yesterday; day -4 ends early (missed goal)
    hours.forEach((h, i) => { const d = new Date(); d.setDate(d.getDate() - (6 - i)); d.setHours(12, 10 + i * 5, 0, 0); const end = d.getTime(); const start = end - h * H; const sd = new Date(start);
      fasts.push({ id: 'seed-' + i, date: `${sd.getFullYear()}-${String(sd.getMonth() + 1).padStart(2, '0')}-${String(sd.getDate()).padStart(2, '0')}`, kind: 'timed', start, end, targetH: 16, protocol: 'tre16', updatedAt: Date.now() }); });
    data.fasts = [...(data.fasts || []), ...fasts];
    await put('hybrd:local:data', data);
  });
  await page.reload({ waitUntil: 'networkidle0' }); await sleep(1500);

  // Start a fast, then set the start to ~14.5 h ago via Edit start
  await page.click('[data-testid="fast-go"]'); await sleep(900);
  check(!!(await page.$('[data-testid="fast-running"]')), 'Timer running after Start');
  await clickText('Edit start'); await sleep(500);
  const startClock = await page.evaluate(() => { const d = new Date(Date.now() - 14.5 * 3600000); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; });
  await setInput('[data-testid="fast-edit-time"]', startClock);
  await page.click('[data-testid="fast-edit-save"]'); await sleep(1200);
  const tt = await text();
  check(/Metabolic switch may begin/i.test(tt), 'Stage at ~14.5 h = “Metabolic switch may begin” (hedged)');
  check(/1[34]:\d\d:\d\d/.test(tt), 'Elapsed clock shows ~14 h');
  check(/day streak/i.test(tt), 'Streak card on timer tab');
  await top(); await shot(phone ? 'phone-fasting-timer' : 'desktop-fasting', !phone ? false : false);
  if (phone) { await page.evaluate(() => window.scrollTo(0, 560)); await shot('phone-fasting-timer-stage'); }

  // Home card reflects the running fast
  await go('/');
  check(!!(await page.$('[data-testid="fast-card-live"]')), 'Home: live fasting card');
  await go('/fuel/fasting');

  await tab('Protocols');
  const pt = await text();
  check(!!(await page.$('[data-testid="fast-protocols"]')) && /5:2/.test(pt) && /Needs regular fasting experience/i.test(pt), 'Protocols: library with locks for advanced');
  await shot(phone ? 'phone-fasting-protocols' : 'desktop-fasting-protocols');

  await tab('History');
  const ht = await text();
  check(/fasts logged/i.test(ht) && /of 16 h/i.test(ht), 'History: stats + log');
  if (phone) await shot('phone-fasting-history', true);

  await tab('Tips');
  check(/What breaks a fast|Calories break it/i.test(await text()), 'Tips tab');
  if (phone) await shot('phone-fasting-tips');

  await tab('Research');
  const rt = await text();
  check(/All sources \((\d+)\)/i.test(rt) && +rt.match(/All sources \((\d+)\)/i)[1] >= 25, `Research lists ≥ 25 sources (${rt.match(/All sources \((\d+)\)/i)?.[1]})`);
  check(/didn’t add weight loss/i.test(rt), 'Research: honest TRE vs calorie-restriction finding');
  if (phone) await shot('phone-fasting-research');

  // End the fast (goal not reached → confirm sheet)
  await tab('Timer');
  await page.click('[data-testid="fast-end"]'); await sleep(600);
  await page.click('[data-testid="fast-end-confirm"]'); await sleep(900);
  check(/Eating window open/i.test(await text()), 'After ending: eating window countdown');
  if (phone) await shot('phone-fasting-eating');

  // Safety block: under 18
  if (phone) {
    await go('/fuel/fasting/setup');
    await setField('Age', '16');
    await clickText('Continue'); await clickText('Continue');
    const st = await text();
    check(!!(await page.$('[data-testid="fast-safety"]')) && /under 18/i.test(st) && /won’t set a fasting plan/i.test(st), 'Safety: under 18 → no plan');
    await top(); await shot('phone-fasting-safety');
    // Caution path: medicine flag → doctor-check acknowledgement
    await clickText('Back'); await clickText('Back');
    await setField('Age', '45'); await clickText('Continue');
    await clickText('Heart disease', 'label');
    await clickText('Continue');
    check(!!(await page.$('[data-testid="fast-caution"]')), 'Caution: heart disease → check with doctor first');
    await top(); await shot('phone-fasting-caution');
    await go('/fuel/fasting');
    check(!!(await page.$('[data-testid="fast-landing"]')), 'Stop answer switched the saved plan off (landing shown, no timer)');
  }
  await browser.close();
}

await run('phone');
await run('desktop');
if (errors.length) { console.error('\nERRORS:\n' + errors.join('\n')); process.exit(1); }
console.log('\nall fasting screenshot checks passed');
