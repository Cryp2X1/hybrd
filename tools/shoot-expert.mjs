// Phone screenshots for the Expert tier: Train filter, HYROX + calisthenics programs, a plan session in the timer,
// and a guided-stopwatch session. Also checks history/PR wiring by saving a timer session.
import puppeteer from 'puppeteer-core';
const BASE = 'http://localhost:4173/hybrd/';
const OUT = new URL('../screenshots/', import.meta.url).pathname;
const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  const ctx = await browser.createBrowserContext();
  await ctx.overridePermissions('http://localhost:4173', ['geolocation']);
  const page = await ctx.newPage();
  await page.emulateTimezone('America/New_York');
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.setUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36');
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.${m.type()}: ${m.text()} @ ${page.url()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('response', (r) => { if (r.status() >= 400 && r.url().startsWith('http://localhost') && !r.url().includes('openstreetmap')) errors.push(`HTTP ${r.status()}: ${r.url()}`); });

  const shot = async (name, full = false) => { await sleep(600); await page.screenshot({ path: `${OUT}${name}.png`, fullPage: full }); console.log('shot', name); };
  const clickText = async (txt, sel = 'button, a') => {
    const ok = await page.evaluate((t, s) => { const el = [...document.querySelectorAll(s)].find((e) => e.textContent.trim().includes(t)); if (el) { el.click(); return true; } return false; }, txt, sel);
    if (!ok) throw new Error(`no element with text ${txt}`);
    await sleep(400);
  };
  const go = async (path, wait = 900) => {
    await page.evaluate((p) => { history.pushState({}, '', p); dispatchEvent(new PopStateEvent('popstate')); }, '/hybrd' + path);
    await sleep(wait);
  };
  const text = () => page.evaluate(() => document.body.textContent);
  const scrollToH3 = (t) => page.evaluate((t) => { const h = [...document.querySelectorAll('h3,h2')].find((e) => e.textContent.includes(t)); if (h) h.scrollIntoView({ block: 'start' }); window.scrollBy(0, -70); }, t);

  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await clickText('Get started');
  await page.type('input[autocomplete="given-name"]', 'José');
  await clickText('Continue'); await clickText('Continue'); await clickText('Continue');
  await clickText('HYROX'); await clickText('Continue');
  await clickText('Start training');
  await page.waitForFunction(() => !document.body.innerText.includes('Your daily targets'), { timeout: 15000 });
  await sleep(600);

  // 1. Train › All levels shows the Expert tier section; Expert filter shows only Expert programs + the note
  await go('/train');
  let t = await text();
  if (!/Expert tier/.test(t)) errors.push('All-levels view missing Expert tier section');
  if (!/Indoor Bike/.test(t)) errors.push('Indoor Bike tile missing from All levels');
  await clickText('Expert', '[data-testid="level-filter"] button');
  await sleep(500);
  t = await text();
  const tiles = await page.evaluate(() => [...document.querySelectorAll('[data-testid="program-grid"] .tile')].map((e) => e.querySelector('h3').textContent));
  if (tiles.length !== 5) errors.push(`Expert filter shows ${tiles.length} programs: ${tiles.join(' | ')}`);
  if (!/read first/i.test(t)) errors.push('Expert filter missing readiness note');
  if (/Stationary Bike/.test(t)) errors.push('Expert filter should hide the bike tiles');
  await shot('phone-train-expert');
  await shot('phone-train-expert-full', true);

  // 2. HYROX expert program
  await go('/train/program/hyrox-expert');
  t = await text();
  for (const k of ['Before you start', 'Race format', 'Compromised Run Repeats', 'Wall-Ball & Lunge EMOM 16', 'Full Simulation at Race Standard', 'Sources', 'Rulebook']) if (!t.includes(k)) errors.push(`HYROX expert missing "${k}"`);
  await shot('phone-expert-hyrox');
  await shot('phone-expert-hyrox-full', true);

  // 3. Calisthenics expert program
  await go('/train/program/cali-expert');
  t = await text();
  for (const k of ['Front lever', 'Planche', 'One-arm push-up', 'Weighted pull-up', 'Weighted dip', 'Skill EMOM 20', 'Overcoming Gravity']) if (!t.includes(k)) errors.push(`Cali expert missing "${k}"`);
  await scrollToH3('A · Pull Skill');
  await shot('phone-expert-calisthenics');
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot('phone-expert-calisthenics-full', true);

  // 4. Running expert: set a 5K race → paces appear in mi
  await go('/train/program/run-expert');
  await page.type('input[aria-label="Race time"]', '21:30');
  await clickText('Set paces');
  await sleep(500);
  t = await text();
  if (!/T \d:\d\d \/mi|T \d:\d\d \/km/.test(t)) errors.push('Running expert: personal T pace not shown after setting race');
  await scrollToH3('Your targets');
  await shot('phone-expert-running');

  // 5. Cycling expert: set FTP → watts
  await go('/train/program/ride-expert');
  await page.type('input[aria-label="FTP watts"]', '250');
  await clickText('Save FTP');
  await sleep(400);
  t = await text();
  if (!t.includes('220–235 W')) errors.push('Cycling expert: sweet-spot watts (220–235 W) not shown for FTP 250');
  await scrollToH3('Over-Unders');
  await shot('phone-expert-cycling');

  // 6. Plan session in the timer (VO2max 5 × 1000 m with personal I pace)
  await go('/timers?t=plan&program=run-expert&session=vo2');
  t = await text();
  if (!/VO2max 5 × 1000 m/.test(t)) errors.push('Plan timer missing session title');
  await clickText('Start');
  await sleep(7000); // past get-ready into warm-up
  await shot('phone-expert-timer');
  // jump ahead into the first Interval rep by shifting the persisted start time
  await page.evaluate(() => {
    const k = 'hybrd:t:plan-run-expert-vo2'; const c = JSON.parse(localStorage.getItem(k));
    c.startedAt -= (5 + 15 * 60 + 4 * 80 + 30) * 1000; localStorage.setItem(k, JSON.stringify(c));
  });
  await page.reload({ waitUntil: 'networkidle0' }); await sleep(1500);
  t = await text();
  if (!/Interval/.test(t) || !/I \d:\d\d \/mi/.test(t)) errors.push(`Plan timer: interval phase / I pace note missing: ${t.slice(0, 300)}`);
  await shot('phone-expert-timer-interval');
  // finish it and save → history + program count
  await page.evaluate(() => { const k = 'hybrd:t:plan-run-expert-vo2'; const c = JSON.parse(localStorage.getItem(k)); c.startedAt -= 3 * 3600 * 1000; localStorage.setItem(k, JSON.stringify(c)); });
  await page.reload({ waitUntil: 'networkidle0' }); await sleep(1200);
  await clickText('Save to history');
  await sleep(1200);
  t = await text();
  if (!/VO2max 5 × 1000 m/.test(t) || !/kcal/i.test(t)) errors.push('Saved plan session: workout page missing title or kcal');

  // 7. Guided stopwatch (HYROX compromised repeats)
  await go('/timers?t=stopwatch&program=hyrox-expert&session=compromised');
  await page.click('button[aria-label="Start"]');
  await sleep(1500);
  await page.click('button[aria-label="Lap"]'); await sleep(300);
  t = await text();
  if (!/R1 · 500 m SkiErg/.test(t)) errors.push('Guided stopwatch did not advance to piece 2');
  await shot('phone-expert-stopwatch');
  await page.evaluate(() => { localStorage.removeItem('hybrd:t:sw:hyrox-expert:compromised'); });

  // 8. Program page shows logged count (history wiring)
  await go('/train/program/run-expert');
  t = await text();
  if (!/1 logged/.test(t)) errors.push('Program page does not count the saved timer session');

  // 9. Desktop: Train expert + plan timer
  await page.setViewport({ width: 1366, height: 900, deviceScaleFactor: 1 });
  await go('/train?tab=programs&level=Expert');
  await shot('desktop-train-expert');
  await go('/timers?t=plan&program=ride-expert&session=ou');
  await shot('desktop-expert-timer');

  await browser.close();
  const noise = errors.filter((e) => !/Failed to load resource/.test(e));
  if (noise.length) { console.error('\nISSUES'); for (const e of noise) console.error(' -', e); process.exit(2); }
  console.log('expert screenshots ok');
}
run().catch((e) => { console.error(e); process.exit(1); });
