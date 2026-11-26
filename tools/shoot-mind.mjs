// Screenshots + checks for Mind & Recovery (/mind): Home card, 20-second check-in → readiness, setup (health → goal → privacy → ready),
// breathing pacer (normal + reduced motion), programs, recovery planner + routine timer, journal (incl. crisis-language support and the
// training-slang exclusion), trends, evidence + sources, HYBRD Pulse with the crisis outcome, help page, under-18 framing.
// Includes a no-horizontal-overflow check on every shot. Needs `node tools/serve.mjs` on :4173.
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
  const check = (cond, msg) => { if (!cond) errors.push(`[${kind}] ${msg}`); else console.log('ok', kind, msg); };
  const shot = async (name, full = false) => {
    await sleep(700);
    await page.evaluate((f) => { let st = document.getElementById('shot-css'); if (!st) { st = document.createElement('style'); st.id = 'shot-css'; document.head.appendChild(st); } st.textContent = `.toast{display:none!important}${f ? '.bottom-nav{display:none!important}' : ''}`; }, full);
    const over = await page.evaluate(() => Math.max(document.documentElement.scrollWidth - window.innerWidth, ...[...document.querySelectorAll('.sl-root *, .mn-root *, .wl-tabs, .mn-home *')].filter((e) => !e.closest('.seg') && !e.closest('.mn-days') && e.getClientRects().length).map((e) => Math.round(e.getBoundingClientRect().right - window.innerWidth))));
    check(over <= 1, `${name}: no horizontal overflow (${over}px)`);
    await page.screenshot({ path: `${OUT}${name}.png`, fullPage: full });
    await page.evaluate(() => { const st = document.getElementById('shot-css'); if (st) st.textContent = ''; });
    console.log('shot', name);
  };
  const go = async (path, wait = 900) => { await page.evaluate((p) => { history.pushState({}, '', p); dispatchEvent(new PopStateEvent('popstate')); }, '/hybrd' + path); await sleep(wait); };
  const clickText = async (txt, sel = 'button, a') => {
    const ok = await page.evaluate((t, s) => { const el = [...document.querySelectorAll(s)].find((e) => e.textContent.trim().includes(t)); if (el) { el.click(); return true; } return false; }, txt, sel);
    if (!ok) throw new Error(`no element with text ${txt}`); await sleep(350);
  };
  const tid = async (id) => { const ok = await page.evaluate((i) => { const el = document.querySelector(`[data-testid="${i}"]`); if (el) { el.click(); return true; } return false; }, id); if (!ok) throw new Error(`no testid ${id}`); await sleep(250); };
  const setVal = async (sel, value) => {
    const ok = await page.evaluate((s, v) => { const i = document.querySelector(s); if (!i) return false; const proto = i.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })); return true; }, sel, value);
    if (!ok) throw new Error(`no input ${sel}`); await sleep(250);
  };
  const text = () => page.evaluate(() => document.body.innerText);
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

  // Home card
  check(!!(await page.$('[data-testid="home-mind-checkin"]')), 'Home: Mind & Recovery card with check-in button');
  if (phone) { await page.evaluate(() => document.querySelector('.mn-home')?.scrollIntoView({ block: 'center' })); await shot('phone-mind-home'); }
  check(phone || !!(await page.$('a[href="/hybrd/mind"]')), 'Desktop side nav links to Mind');

  // Check-in
  await go('/mind');
  const t0 = await text();
  check(!!(await page.$('[data-testid="ci-save"]')) && /How are you today/i.test(t0), 'Today: check-in form (today not logged yet)');
  check(/From your Sleep log/i.test(t0), 'Sleep hours pre-filled from the Sleep log');
  check(!!(await page.$('[data-testid="mind-crisis"]')) && /988/i.test(t0) && /911/i.test(t0) && /local emergency services/i.test(t0), 'Crisis line visible (988 / 911 / local emergency services)');
  check(/not therapy/i.test(t0), '“Not therapy or medical advice” note');
  check(await page.$eval('[data-testid="ci-save"]', (b) => b.disabled), 'Save disabled until all 6 answered');
  for (const [k, v] of [['sleepQ', 4], ['energy', 3], ['soreness', 4], ['stress', 2], ['mood', 4], ['motivation', 4]]) await tid(`ci-${k}-${v}`);
  if (phone) { await top(); await shot('phone-mind-checkin', true); } else await shot('desktop-mind-checkin');
  await tid('ci-save'); await sleep(800);
  const t1 = await text();
  check(!!(await page.$('[data-testid="mind-readiness"]')) && /Readiness · today/i.test(t1) && /(Train as planned|Go easier|Recovery day)/i.test(t1), 'Saved → readiness score + recommendation');
  check(/Heuristic/i.test(t1) && /not a medical measure/i.test(t1), 'Readiness labelled as a heuristic');
  await top(); await shot(phone ? 'phone-mind-readiness' : 'desktop-mind-today', phone);

  // Setup
  await go('/mind/setup');
  check(/Quick health check/i.test(await text()), 'Setup step 1: health');
  await tid('mind-q-panic');
  await tid('mind-next'); await tid('mind-next'); await sleep(300);
  check(/Your journal is private/i.test(await text()), 'Setup step 3: privacy');
  await tid('mind-q-privateJournal');
  await tid('mind-next'); await sleep(300);
  const t2 = await text();
  check(/Adjusted for you/i.test(t2) && /Panic attacks/i.test(t2) && await page.$eval('[data-testid="mind-save"]', (b) => b.disabled), 'Ready step: panic adaptation shown, acknowledgement required');
  await tid('mind-ack');
  if (phone) { await top(); await shot('phone-mind-setup', true); }
  await tid('mind-save'); await sleep(900);
  check(page.url().endsWith('/mind'), 'Saved setup → /mind');

  // Breathe
  await tab('Breathe');
  check((await page.$$('[data-testid^="mind-pattern-"]')).length === 4 && /Adapted for you/i.test(await text()), 'Breathe: 4 patterns, adapted badge for panic');
  await shot(phone ? 'phone-mind-breathe' : 'desktop-mind-breathe');
  await go('/mind/breathe/sigh');
  check(/Adapted for you/i.test(await text()) && /Moderate/i.test(await text()), 'Sighing: grade + adaptation note');
  await tid('mind-breathe-start'); await sleep(phone ? 1600 : 2600);
  check(!!(await page.$('.mn-orb')) && /Inhale|Top up|exhale/i.test(await text()), 'Pacer running with animated orb');
  await shot(phone ? 'phone-mind-pacer' : 'desktop-mind-pacer');
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await go('/mind/breathe/resonance'); await tid('mind-breathe-start'); await sleep(1200);
  check(!!(await page.$('.mn-pacer.reduced')) && !(await page.$('.mn-orb')) && !!(await page.$('.mn-bar')), 'Reduced motion: no orb, progress bar instead');
  if (phone) await shot('phone-mind-pacer-reduced');
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);

  // Skills
  await go('/mind?tab=skills');
  check((await page.$$('[data-testid^="mind-program-"]')).length === 4, 'Skills: 4 programs');
  await shot(phone ? 'phone-mind-skills' : 'desktop-mind-skills');
  await go('/mind/program/discipline');
  const t3 = await text();
  check(/Day 4 of 7/i.test(t3) && /Build your self-talk/i.test(t3), 'Program opens at the next day (sample did days 1–3)');
  await shot(phone ? 'phone-mind-program' : 'desktop-mind-program', phone);
  await go('/mind/program/prerace?day=2');
  check(!!(await page.$('[data-testid="mind-imagery"]')), 'Pre-race day 2: imagery script');

  // Recover
  await go('/mind?tab=recover');
  const t4 = await text();
  check(!!(await page.$('[data-testid="mind-recovery-plan"]')) && /Cold & heat guide/i.test(t4) && /Deload/i.test(t4) && (await page.$$('[data-testid^="mind-routine-"]')).length === 5, 'Recover: planner, cold/heat, deload, 5 routines');
  await top(); await shot(phone ? 'phone-mind-recover' : 'desktop-mind-recover', phone);
  await go('/mind/routine/post-run');
  await tid('mind-routine-start'); await sleep(1300);
  check(/Move 1 of 11/i.test(await text()) && /Wall calf stretch/i.test(await text()), 'Routine timer running (sides doubled → 11 moves)');
  await shot(phone ? 'phone-mind-routine' : 'desktop-mind-routine');

  // Journal
  await go('/mind?tab=journal');
  check(/This device only/i.test(await text()), 'Journal: device-only badge after choosing privacy');
  await setVal('[data-testid="mind-journal-text"]', 'Suicide sprints at the end of practice. Legs gone but kept form.');
  await tid('mind-journal-save'); await sleep(500);
  check(!(await page.$('[data-testid="mind-crisis-full"]')), 'Training slang (“suicide sprints”) does not trigger crisis support');
  await shot(phone ? 'phone-mind-journal' : 'desktop-mind-journal');
  await setVal('[data-testid="mind-journal-text"]', 'Honestly some days I want to end my life.');
  await tid('mind-journal-save'); await sleep(500);
  const t5 = await text();
  check(!!(await page.$('[data-testid="mind-crisis-full"]')) && /Call 988/i.test(t5) && /Text 988/i.test(t5), 'Crisis language → supportive message with 988 call/text + 911');
  await top(); await shot(phone ? 'phone-mind-journal-support' : 'desktop-mind-journal-support');
  await page.evaluate(() => { const b = document.querySelector('[aria-label="Delete entry"]'); b?.click(); }); await sleep(300);

  // Trends
  await go('/mind?tab=trends');
  const t6 = await text();
  check(!!(await page.$('[data-testid="mind-trend"]')) && /check-in streak/i.test(t6), 'Trends: 14-day readiness bars + streaks');
  check(!!(await page.$('[data-testid="mind-patterns"]')) && /a pattern, not proof/i.test(t6), 'Trends: own patterns with enough data');
  await clickText('30 days', '.seg button');
  check(!!(await page.$('.mn-trend.n30')), 'Trends: 30-day view');
  await top(); await shot(phone ? 'phone-mind-trends' : 'desktop-mind-trends', phone);

  // Evidence
  await go('/mind?tab=evidence');
  const t7 = await text();
  const n = +(t7.match(/All sources \((\d+)\)/i)?.[1] || 0);
  check(n >= 100, `Evidence lists ≥ 100 sources (${n})`);
  await shot(phone ? 'phone-mind-evidence' : 'desktop-mind-evidence');
  await clickText('Monitoring', '.seg button');
  check(/does not predict injury/i.test(await text()), 'Monitoring: ACWR shown as weak / not an injury predictor');
  await clickText('Safety & screening', '.seg button');
  check(/HYBRD Pulse:/.test(await text()) && /original HYBRD tool/i.test(await text()) && !/WHO-?5|CC BY-NC-SA/.test(await text()) && /educational grant from Pfizer/i.test(await text()), 'Check-in tools: HYBRD Pulse is original, PHQ attribution, no WHO-5');

  // Check-up → crisis outcome
  await go('/mind');
  await tid('mind-checkup-open'); await sleep(400);
  for (const k of ['energy', 'sleep', 'mood', 'stress', 'drive', 'recovery']) await tid(`pulse-${k}-2`);
  await tid('scr-safety-yes'); await sleep(300);
  await tid('scr-save'); await sleep(500);
  const t8 = await text();
  check(!!(await page.$('[data-testid="scr-out-crisis"]')) && /You don’t have to handle this alone/i.test(t8) && /988/i.test(t8), 'Pulse: “yes” to the safety question → crisis outcome with 988');
  await shot(phone ? 'phone-mind-checkup-crisis' : 'desktop-mind-checkup-crisis');
  await page.keyboard.press('Escape'); await sleep(300);

  // Help page
  await go('/mind/help');
  const t9 = await text();
  check(!!(await page.$('[data-testid="mind-call-988"]')) && !!(await page.$('[data-testid="mind-text-988"]')) && !!(await page.$('[data-testid="mind-call-911"]')) && /findahelpline/i.test(t9), 'Help: call/text 988, 911, international helplines');
  check(await page.$eval('[data-testid="mind-call-988"]', (a) => a.getAttribute('href')) === 'tel:988' && await page.$eval('[data-testid="mind-text-988"]', (a) => a.getAttribute('href')) === 'sms:988', 'Help: tel:/sms: links');
  await shot(phone ? 'phone-mind-help' : 'desktop-mind-help', phone);

  // Me row
  await go('/me');
  check(!!(await page.$('a[href="/hybrd/mind"]')) && /Get help now/i.test(await text()), 'Me: Mind & Recovery + Get help rows');
  // Home card now shows readiness
  await go('/');
  check(!!(await page.$('[data-testid="home-readiness"]')), 'Home card shows today’s readiness');

  if (phone) {
    // under 18
    await go('/mind/setup');
    await setVal('[data-testid="mind-age"]', '16');
    await tid('mind-next'); await tid('mind-next'); await tid('mind-next'); await sleep(300);
    const tm = await text();
    check(/Written for you too/i.test(tm) && /parent, guardian/i.test(tm) && /Not offered/i.test(tm), 'Under 18: trusted-adult framing, no ice baths');
    await top(); await shot('phone-mind-minor', true);
  }
  await browser.close();
}

await run('phone');
await run('desktop');
if (errors.length) { console.error('\nERRORS:\n' + errors.join('\n')); process.exit(1); }
console.log('\nall mind screenshot checks passed');
