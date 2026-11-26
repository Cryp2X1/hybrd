// Screenshots + checks for Social: Friends & Stories (phone + desktop) in DEMO mode with clearly-labelled sample people.
// Also captures the Local-mode gate. Uses one generated sample image (an illustration, with real EXIF GPS so the
// "location removed" path runs). Needs `node tools/serve.mjs` running on :4173.
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { withExif, buildExifApp1 } from './exif-fixture.mjs';
const BASE = 'http://localhost:4173/hybrd/';
const OUT = new URL('../screenshots/', import.meta.url).pathname;
const IMG = '/tmp/hybrd-social-samples/track-session-gps.jpg';
const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function makeSample(browser) {
  mkdirSync('/tmp/hybrd-social-samples', { recursive: true });
  const page = await browser.newPage();
  const url = await page.evaluate(() => {
    const w = 1600, h = 2000, c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#1d3b5c'); g.addColorStop(1, '#0b0b0b'); x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.strokeStyle = '#d9534f'; x.lineWidth = 120; x.beginPath(); x.ellipse(w / 2, h * 0.62, w * 0.42, h * 0.3, 0, 0, Math.PI * 2); x.stroke();
    x.strokeStyle = 'rgba(255,255,255,.8)'; x.lineWidth = 6; for (const r of [0.36, 0.4, 0.44, 0.48]) { x.beginPath(); x.ellipse(w / 2, h * 0.62, w * r, h * r * 0.72, 0, 0, Math.PI * 2); x.stroke(); }
    x.fillStyle = '#FFE600'; x.font = '700 150px Impact, Arial Narrow, sans-serif'; x.textAlign = 'center'; x.fillText('6 × 800 M', w / 2, h * 0.2);
    x.fillStyle = 'rgba(255,255,255,.45)'; x.font = '600 44px sans-serif'; x.textAlign = 'right'; x.fillText('SAMPLE IMAGE', w - 60, 80);
    return c.toDataURL('image/jpeg', 0.9);
  });
  await page.close();
  writeFileSync(IMG, withExif(new Uint8Array(Buffer.from(url.split(',')[1], 'base64')), buildExifApp1({ date: '2026:11:15 07:10:00', lat: 40.78, lng: -73.96 })));
}

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
  page.on('dialog', (d) => d.accept());
  const shot = async (name, full = false) => {
    await sleep(700);
    await page.evaluate(() => { let st = document.getElementById('shot-css'); if (!st) { st = document.createElement('style'); st.id = 'shot-css'; document.head.appendChild(st); } st.textContent = '.toast{display:none!important}'; });
    const ov = await page.evaluate(() => { const W = document.documentElement.clientWidth; if (document.documentElement.scrollWidth <= W + 1) return ''; return [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > W + 1 && !e.closest('.s-tabs, .seg, .s-stories, .chips, .react-bar, .react-tip')).slice(0, 6).map((e) => e.tagName + '.' + [...e.classList].join('.') + ':' + Math.round(e.getBoundingClientRect().right)).join(' '); });
    check(!ov, `${name}: no horizontal overflow ${ov}`);
    await page.screenshot({ path: `${OUT}${name}.png`, fullPage: full });
    console.log('shot', name);
  };
  const go = async (path, wait = 1100) => { await page.evaluate((p) => { history.pushState({}, '', p); dispatchEvent(new PopStateEvent('popstate')); }, '/hybrd' + path); await sleep(wait); };
  const clickText = async (txt, sel = 'button, a') => {
    const ok = await page.evaluate((t, s) => { const el = [...document.querySelectorAll(s)].find((e) => e.textContent.trim().includes(t) && e.offsetParent !== null); if (el) { el.click(); return true; } return false; }, txt, sel);
    if (!ok) throw new Error(`no element with text ${txt}`); await sleep(400);
  };
  const click = async (sel) => { const ok = await page.evaluate((s) => { const el = document.querySelector(s); if (el) { el.click(); return true; } return false; }, sel); if (!ok) throw new Error(`no ${sel}`); await sleep(400); };
  const setVal = async (sel, v) => {
    const ok = await page.evaluate((s, v) => {
      const i = document.querySelector(s); if (!i) return false;
      const proto = i.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); return true;
    }, sel, v);
    if (!ok) throw new Error(`no ${sel}`); await sleep(250);
  };
  const text = () => page.evaluate(() => document.body.innerText);
  const check = (cond, msg) => { if (!cond) errors.push(`[${kind}] ${msg}`); else console.log('ok', kind, msg); };
  const top = () => page.evaluate(() => window.scrollTo(0, 0));

  // onboarding with sample training data (so there are workouts to attach)
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.evaluate((() => ['agree-terms', 'consent-location', 'consent-health'].forEach((t) => { const el = document.querySelector(`[data-testid="${t}"]`); if (el && !el.checked) el.click(); }))); await clickText('Get started');
  await page.type('input[autocomplete="given-name"]', 'José Cruz');
  await clickText('Continue'); await clickText('Continue'); await clickText('Continue');
  await clickText('HYROX'); await clickText('Running');
  await clickText('Continue');
  await clickText('Explore with sample data first');
  await sleep(1500);

  // ----- local-mode gate -----
  await go('/social');
  const gate = await text();
  check(/Connect accounts to use Friends & Stories/i.test(gate), 'Local mode shows the connect gate');
  check(/Explore the demo/i.test(gate) && /sample people/i.test(gate), 'Gate offers a clearly-labelled demo');
  check(!(await page.$('[data-testid="post-card"]')), 'No posts shown before the demo is chosen');
  if (phone) await shot('phone-social-connect');

  // ----- demo → profile setup -----
  await click('[data-testid="enter-demo"]');
  await sleep(1200);
  check(page.url().endsWith('/social/setup'), 'Entering the demo asks for a public profile first');
  check(!!(await page.$('[data-testid="demo-banner"]')), 'Demo banner visible on setup');
  if (kind === 'underage') {
    await setVal('[data-testid="setup-dob"]', '2016-03-01');
    check(/13 and up/i.test(await text()), 'Under-13 date of birth flagged on the form');
    await click('[data-testid="setup-save"]');
    await sleep(800);
    check(/Friends & Stories is for ages 13\+/i.test(await text()) && !(await page.$('[data-testid="setup"]')), 'Under-13 → social turned off (no profile, no demo)');
    await go('/social');
    check(/ages 13\+/i.test(await text()) && !(await page.$('[data-testid="post-card"]')), 'Under-13 cannot reach the feed');
    await go('/');
    check(!(await page.$('[data-testid="nav-social-badge"]')), 'No social badge for under-13');
    await ctx.close();
    return;
  }
  await setVal('[data-testid="setup-dob"]', '1994-06-12');
  check((await page.$eval('[data-testid="setup-handle"]', (e) => e.value)) === 'jose.cruz', 'Handle suggested from the name');
  await setVal('[data-testid="setup-handle"]', 'sample.jose');
  check(/reserved/i.test(await text()), 'sample.* handles are reserved');
  await setVal('[data-testid="setup-handle"]', 'jose.cruz');
  await setVal('textarea', 'Hybrid athlete. HYROX + running. Building the best training app.');
  await click('[data-testid="setup-stats"]');
  await clickText('I agree to the community rules');
  await click('[data-testid="setup-save"]');
  await sleep(1500);
  check(page.url().endsWith('/social'), 'Profile created → feed');

  // ----- feed -----
  await top();
  const feed = await text();
  check(!!(await page.$('[data-testid="stories-ring"]')) && (await page.$$('[data-testid="story-bubble"]')).length >= 4, 'Stories ring with sample stories');
  check((await page.$$('[data-testid="post-card"]')).length >= 5, 'Feed shows sample posts');
  check(/Demo mode: sample people, not real users/i.test(feed), 'Demo banner says sample people are not real');
  check((await page.$$('.sample-tag')).length >= 5, 'Every sample person carries a SAMPLE tag');
  check(!/Kai W\./.test(feed), 'Friends-only post of a non-friend is not in the feed');
  check(!!(await page.$('[data-testid="workout-card"]')), 'Workout summary cards render in the feed');
  check(phone ? !!(await page.$('[data-testid="nav-social-badge"]')) : !!(await page.$('[data-testid="side-social-badge"]')), 'Nav badge shows pending requests');
  if (phone) await shot('phone-social-feed');
  else await shot('desktop-social-feed');

  // like + save on the first post (p1 = Maya's long run)
  const firstLikes = await page.$eval('[data-testid="like-count"]', (e) => e.textContent.trim());
  await click('[data-testid="like-btn"]');
  check((await page.$eval('[data-testid="like-count"]', (e) => e.textContent.trim())) === String(+firstLikes + 1), 'Like increments the count');
  await click('[data-testid="save-btn"]');
  await page.evaluate(() => document.querySelectorAll('[data-testid="save-btn"]')[1]?.click()); await sleep(300);

  if (phone) {
    // ----- comment + post reaction bar -----
    await go('/social/post?id=p1', 1500);
    await page.waitForSelector('[data-testid="comment-bubble"]', { timeout: 10000 });
    await page.evaluate(() => document.querySelector('[data-testid="comment-bubble"]')?.scrollIntoView({ block: 'center' }));
    await sleep(400);
    const bubble = await page.$('[data-testid="comment-bubble"]');
    const box = await bubble.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + Math.min(20, box.height / 2));
    await page.mouse.down();
    await sleep(550);
    await page.mouse.up();
    await sleep(400);
    check(!!(await page.$('[data-testid="reaction-bar"]')), 'Long-press on a comment opens the reaction bar');
    check((await page.$$('[data-testid="reaction-bar"] [data-reaction]')).length === 7, 'Reaction bar has 7 emoji (no Care, includes Dislike)');
    const kinds = await page.$$eval('[data-testid="reaction-bar"] [data-reaction]', (els) => els.map((e) => e.getAttribute('data-reaction')).join());
    check(kinds === 'like,love,haha,wow,sad,angry,dislike', 'Reaction order is Like, Love, Haha, Wow, Sad, Angry, Dislike');
    await shot('phone-reactions-comment-bar');
    await click('[data-testid="reaction-love"]');
    await sleep(500);
    check(/Love/.test(await page.$eval('[data-testid="comment-react"]', (e) => e.textContent)), 'Chosen Love reaction is shown on the comment');
    await shot('phone-reactions-chosen');
    await click('[data-testid="comment"] [data-testid="reaction-summary"]');
    await sleep(700);
    check(!!(await page.$('[data-testid="reactors-sheet"]')), 'Tapping the count opens the reactor list');
    await shot('phone-reactions-sheet');
    await page.keyboard.press('Escape'); await sleep(400);
    // post reaction bar
    await page.evaluate(() => document.querySelector('[data-testid="like-btn"]')?.scrollIntoView({ block: 'center' }));
    await sleep(500);
    const likeBtn = await page.$('[data-testid="like-btn"]');
    const lb = await likeBtn.boundingBox();
    await page.mouse.move(lb.x + lb.width / 2, lb.y + lb.height / 2);
    await page.mouse.down();
    await sleep(550);
    await page.mouse.up();
    await sleep(400);
    check(!!(await page.$('[data-testid="reaction-bar"]')), 'Long-press on the post Like button opens the reaction bar');
    await shot('phone-reactions-post-bar');
    await page.keyboard.press('Escape'); await sleep(400);
    await go('/social');

    // ----- stories viewer -----
    await click('[data-testid="story-bubble"]');
    await sleep(900);
    check(!!(await page.$('[data-testid="story-viewer"]')), 'Story viewer opens');
    await page.evaluate(() => { const s = document.querySelector('.s-story'); s.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); });
    await shot('phone-social-stories');
    await page.keyboard.press('Escape'); await sleep(400);

    // ----- create a post: photo with GPS EXIF + workout card -----
    await go('/social/new');
    await setVal('[data-testid="post-text"]', 'Track session done: 6 × 800 m. Felt strong on the last two. Who’s in for next Tuesday?');
    const inp = await page.$('[data-testid="photo-input"]');
    await inp.uploadFile(IMG);
    await sleep(2500);
    check((await page.$$('.s-prev img')).length === 1, 'Photo preview added');
    await click('[data-testid="attach-workout"]');
    await click('[data-testid="pick-workout"]');
    check(!!(await page.$('.s-attached [data-testid="workout-card"]')), 'Workout card attached');
    await clickText('Public', '.s-aud-pick button');
    await top();
    await shot('phone-social-create');
    await click('[data-testid="publish"]');
    await sleep(1500);
    const myPost = await page.evaluate(() => document.querySelector('[data-testid="post-card"] .s-who-n')?.textContent || '');
    check(/José Cruz/i.test(myPost), 'New post is at the top of the feed');
    const pid = await page.evaluate(() => { const a = [...document.querySelectorAll('[data-testid="post-card"]')][0]; a.querySelector('[data-testid="comment-btn"]').click(); return true; });
    await sleep(1200);
    const myPostUrl = page.url();
    check(/\/social\/post\?id=/i.test(myPostUrl) && pid, 'Opened own post');
    await top();
    await shot('phone-social-post');

    // ----- comments on Maya's post -----
    await go('/social/post?id=p1');
    await setVal('[data-testid="comment-input"]', 'Huge effort! What gels do you use?');
    await click('[data-testid="comment-send"]');
    await sleep(800);
    check((await page.$$('[data-testid="comment"]')).length === 4, 'Comment added');
    await page.evaluate(() => document.querySelector('.s-comments')?.scrollIntoView({ block: 'start' })); await sleep(300);
    await shot('phone-social-comments');

    // ----- report -----
    await top();
    await click('[data-testid="post-menu"]');
    await click('[data-testid="report-post"]');
    await click('[data-testid="reason-spam"]');
    check(!!(await page.$('[data-testid="report-sheet"]')), 'Report sheet open with reasons');
    await shot('phone-social-report');
    await click('[data-testid="send-report"]');
    await sleep(500);
    check(!!(await page.$('[data-testid="report-done"]')), 'Report confirmation shown');
    await click('[data-testid="report-done-close"]');

    // ----- friends + requests -----
    await go('/social/friends');
    check((await page.$$('[data-testid="user-row"]')).length >= 3, 'Friends list');
    await shot('phone-friends');
    await go('/social/friends?tab=requests');
    check(/Received · 2/i.test(await text()), 'Two incoming sample requests');
    await shot('phone-friend-requests');
    await clickText('Accept', '.s-user button');
    await sleep(700);
    check(/Received · 1/i.test(await text()), 'Accept removes the request');
    await go('/social/friends?tab=find');
    await page.type('[data-testid="people-search"]', 'kai'); await sleep(900);
    await click('[data-testid="add-friend"]'); await sleep(600);
    check(!!(await page.$('[data-testid="rel-cancel"]')), 'Send request → Requested · Cancel');
    await click('[data-testid="rel-cancel"]'); await sleep(600);
    check(!!(await page.$('[data-testid="add-friend"]')), 'Cancel request → Add friend again');

    // ----- profile -----
    await go('/social/profile?u=sample.maya');
    const prof = await text();
    check(/Maya R\./i.test(prof) && /Sample/i.test(prof) && /Hybrid Score/i.test(prof), 'Sample profile with SAMPLE tag and opted-in stats');
    await shot('phone-social-profile');

    // ----- notifications -----
    await go('/social/notifications');
    const nt = await text();
    check(/liked your post/i.test(nt) && /commented on your post/.test(nt) && /sent you a friend request/.test(nt), 'Notifications: likes, comments, requests');
    await shot('phone-social-notifications');

    // ----- saved -----
    await go('/social/saved');
    check((await page.$$('[data-testid="post-card"]')).length >= 2, 'Saved tab lists saved posts');
    await shot('phone-social-saved');

    // ----- invite landing -----
    await go('/invite?u=sample.leo', 1500);
    check(/\/social\/profile\?u=sample\.leo&invite=1/i.test(page.url()) && /invited you to HYBRD/.test(await text()), 'Invite link opens the profile with an invite banner');
    // ----- block hides everywhere -----
    await go('/social/profile?u=sample.jordan');
    await page.waitForSelector('[aria-label="Profile options"]', { timeout: 10000 });
    await click('[aria-label="Profile options"]'); await sleep(700);
    await clickText('Block', '.s-menu button'); await sleep(1200);
    await go('/social');
    check(!/Jordan B\./.test(await text()), 'Blocked person disappears from the feed');
  } else {
    await go('/social/friends?tab=find');
    await page.type('[data-testid="people-search"]', 'sample'); await sleep(900);
    check((await page.$$('[data-testid="user-row"]')).length >= 5, 'Search by handle');
    await shot('desktop-friends');
  }
  await ctx.close();
}

const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
try {
  await makeSample(browser);
  await run(browser, 'phone');
  await run(browser, 'desktop');
  await run(browser, 'underage');
} finally { await browser.close(); }
if (errors.length) { console.error('\nERRORS:\n' + errors.join('\n')); process.exit(1); }
console.log('\nALL SOCIAL SCREENSHOT CHECKS PASSED');
