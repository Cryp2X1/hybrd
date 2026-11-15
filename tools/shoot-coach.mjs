// Screenshots + checks for HYBRD Coach: first-run offer, intake, plan, week (edit), why, check-in, Home card (phone) and desktop plan.
// Needs `node tools/serve.mjs` running on :4173.
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
  const shot = async (name, full = false) => { await sleep(700); await page.screenshot({ path: `${OUT}${name}.png`, fullPage: full }); console.log('shot', name); };
  const go = async (path, wait = 900) => { await page.evaluate((p) => { history.pushState({}, '', p); dispatchEvent(new PopStateEvent('popstate')); }, '/hybrd' + path); await sleep(wait); };
  const clickText = async (txt, sel = 'button, a') => {
    const ok = await page.evaluate((t, s) => { const els = [...document.querySelectorAll(s)]; const el = els.find((e) => e.textContent.trim() === t) || els.find((e) => e.textContent.trim().includes(t)); if (el) { el.click(); return true; } return false; }, txt, sel);
    if (!ok) throw new Error(`[${kind}] no element with text ${txt} @ ${page.url()}`); await sleep(400);
  };
  const tid = async (id) => { const ok = await page.evaluate((i) => { const el = document.querySelector(`[data-testid="${i}"]`); if (el) el.click(); return !!el; }, id); if (!ok) throw new Error(`[${kind}] no testid ${id} @ ${page.url()}`); await sleep(450); };
  const step = () => page.evaluate(() => document.querySelector('[data-testid^="coach-step-"]')?.getAttribute('data-testid')?.replace('coach-step-', ''));
  const next = () => tid('coach-next');
  const text = () => page.evaluate(() => document.body.innerText);
  const check = (cond, msg) => { if (!cond) errors.push(`[${kind}] ${msg}`); else console.log('ok', kind, msg); };
  const top = () => page.evaluate(() => window.scrollTo(0, 0));

  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await clickText('Get started');
  await page.type('input[autocomplete="given-name"]', 'José');
  await clickText('Continue'); await clickText('Continue'); await clickText('Continue');
  await clickText('HYROX'); await clickText('Running');
  await clickText('Continue');
  await clickText('Start training');
  await sleep(1200);

  // First run: coach offer
  check(!!(await page.$('[data-testid="coach-intro"]')) && /Let HYBRD build your plan/i.test(await text()), 'First run lands on the coach offer');
  check(!/\bAI\b|premium|pricing|\$\d/i.test((await text()).replace(/not AI/gi, '')), 'No AI / premium / pricing wording on the offer');
  if (phone) await shot('phone-coach-intro');
  await tid('coach-start');

  // Intake — one question per screen
  check((await step()) === 'goal', 'Intake starts with the goal');
  if (phone) {
    await tid('goal-race'); await sleep(300);
    check((await step()) === 'race', 'Race goal asks which race'); await clickText('HYROX', '.coach-opt'); await sleep(300);
    await clickText('More than a year', '.coach-opt'); await sleep(300);
    check((await step()) === 'push', 'Push-up self-test');
    await top(); await shot('phone-coach-question');
    await tid('push-25'); await sleep(300);
    await clickText('4–7', 'button.chip'); await sleep(300);
    await clickText('5K (3.1 mi)', '.coach-opt'); await clickText('25–30 min', 'button.chip'); await next();
    await tid('days-4'); await sleep(300);
    await clickText('60 min', 'button.chip'); await sleep(300);
    check((await step()) === 'prefs', 'Preferences step'); await clickText('Weights', 'button.chip'); await clickText('Running', 'button.chip'); await clickText('HYROX', 'button.chip'); await next();
    await clickText('Full gym', '.coach-opt'); await next();
    check((await step()) === 'injuries', 'Injuries step'); await clickText('Lower back', 'button.chip'); await next();
    check((await step()) === 'body', 'Profile step (reused)'); await next();
    check((await step()) === 'health', 'Health screen'); await next();
    check((await step()) === 'diet', 'Diet step'); await clickText('Mediterranean', '.coach-opt'); await clickText('Nuts & peanuts', 'button.chip'); await next();
    check((await step()) === 'meals', 'Meals step'); await next();
    check((await step()) === 'weeks', 'Block length + summary'); await tid('weeks-8');
  } else {
    await tid('goal-fat-loss'); await sleep(300);
    while ((await step()) !== 'weeks') { const s = await step(); if (s === 'equipment') await clickText('Dumbbells / kettlebells', '.coach-opt'); if (s === 'days') { await tid('days-4'); continue; } if (s === 'push') { await tid('push-15'); continue; } if (s === 'experience') { await clickText('A while', '.coach-opt'); continue; } if (s === 'minutes') { await clickText('45 min', 'button.chip'); continue; } if (s === 'pace') { await clickText('Moderate', 'button.wl-pace'); continue; } if (s === 'pull') { await clickText('No bar / not sure', 'button.chip'); continue; } if (s === 'prefs') { await clickText('Weights', 'button.chip'); await clickText('Walking', 'button.chip'); } await next(); }
    await tid('weeks-6');
  }
  await tid('coach-build'); await sleep(2200);
  const pl = await text();
  check(/Week 1 of (8|6)/i.test(pl) && /Today/i.test(pl) && /This week/i.test(pl), 'Plan overview built');
  check(/kcal/.test(pl), 'Plan shows today’s food target');
  if (!phone) {
    check(!!(await page.$('.coach-grid')), 'Desktop two-column plan');
    await sleep(2600); await top(); await shot('desktop-coach-plan'); await browser.close(); return;
  }
  await sleep(2600); await top(); await shot('phone-coach-plan');

  // Week view + edit (move a session)
  await go('/coach?tab=week');
  check(!!(await page.$('[data-testid="coach-week"]')) && (await page.$$('.coach-day:not(.rest)')).length === 4, 'Week view shows 4 sessions');
  check(!/Back squat|Deadlift\b|Kettlebell swing/i.test(await page.$$eval('.coach-day', (e) => e.map((x) => x.textContent).join(' '))) , 'Lower-back swaps applied (no squats/deadlifts/swings)');
  await top(); await shot('phone-coach-week');
  await page.evaluate(() => document.querySelector('.coach-day.rest .icon-btn').click()); await sleep(500);
  check(!!(await page.$('[data-testid="coach-edit"]')), 'Edit sheet opens');
  await clickText('Add mobility', '.coach-alt'); await sleep(500);
  check((await page.$$('.coach-day:not(.rest)')).length === 5, 'Added a session to a rest day');
  await page.evaluate(() => document.querySelector('.coach-day:not(.rest) .icon-btn').click()); await sleep(500);
  await clickText('Make it a rest day'); await sleep(500);
  check((await page.$$('.coach-day:not(.rest)')).length === 4, 'Made a day a rest day');

  // Why
  await go('/coach?tab=why');
  const why = await text();
  check(/Why this plan/i.test(why) && /Level: /i.test(why) && /Sources/i.test(why) && /not AI/.test(why), 'Why tab with sources + not-AI note');
  await sleep(2600); await top(); await shot('phone-coach-why');

  // Food
  await go('/coach?tab=food');
  check(!!(await page.$('[data-testid="coach-food"]')) && (await page.$$('.wl-meal')).length >= 3, 'Food tab with meals');
  const meals = await page.$$eval('.wl-meal', (els) => els.map((e) => e.textContent).join(' | '));
  check(!/almond|walnut|peanut|cashew|pistachio/i.test(meals), 'No nut meals shown');
  await clickText('Log', '.wl-meal-act button'); await sleep(500);
  check(/Logged/.test(await text()), 'Meal logged to Fuel');

  // Check-in
  await go('/coach?tab=checkin');
  await tid('feel-hard'); await clickText('5', '.coach-scale button.chip').catch(() => {});
  await page.evaluate(() => { const f = [...document.querySelectorAll('.field')].find((x) => x.textContent.includes('Muscle soreness')); f?.querySelectorAll('.coach-scale .chip')[4]?.click(); }); await sleep(300);
  await tid('coach-ci-submit'); await sleep(800);
  const ci = await text();
  check(/Plan updated/i.test(ci) && /Deload|Hold/i.test(ci) && /Changelog/i.test(ci), 'Check-in adjusts the plan with a visible changelog');
  await sleep(2600); await top(); await shot('phone-coach-checkin');

  // Home: today highlighted
  await go('/');
  check(!!(await page.$('[data-testid="coach-home"]')) && /HYBRD Coach · week 1/i.test(await text()), 'Home shows today’s coach session');
  await top(); await shot('phone-home-coach');
  await go('/train'); check(!!(await page.$('[data-testid="coach-entry"]')) || /HYBRD Coach/i.test(await text()), 'Train shows coach card');
  await go('/fuel'); check(/HYBRD Coach/i.test(await text()), 'Fuel shows coach card');
  // Start link goes to an existing tool
  await go('/');
  const go1 = await page.$('[data-testid="coach-go"]');
  if (go1) { await page.evaluate(() => document.querySelector('[data-testid="coach-go"]').click()); await sleep(900); check(/\/(timers|record|train\/log)/.test(page.url()), 'Start opens timers / record / logger'); }
  await browser.close();
}

await run('phone');
await run('desktop');
if (errors.length) { console.log('\nPROBLEMS:\n' + errors.join('\n')); process.exitCode = 1; } else console.log('\nall checks passed');
