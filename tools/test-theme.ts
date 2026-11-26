// Appearance (Light / Dark / System): the pure rules, the tokens in styles.css (both themes define every token and meet
// contrast targets), the no-flash script in index.html, the Settings screen, and the new navigation order.
// Run: node --experimental-strip-types --import ./tools/ts-resolve.mjs tools/test-theme.ts
import { readFileSync } from 'node:fs';
import { parsePref, resolveTheme, THEME_COLORS, THEME_KEY, THEME_OPTIONS, DEFAULT_PREF, prefLabel } from '../src/lib/theme.ts';

let failed = 0, n = 0;
const check = (name: string, cond: boolean, detail?: unknown) => { n++; if (!cond) { failed++; console.error('FAIL', name, detail ?? ''); } else console.log('ok', name); };
const src = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const css = src('src/styles.css'), html = src('index.html'), app = src('src/App.tsx'), settings = src('src/pages/Settings.tsx');

// ---------- rules ----------
check('parsePref accepts light / dark / system, anything else → default', parsePref('light') === 'light' && parsePref('dark') === 'dark' && parsePref('system') === 'system' && parsePref('purple') === DEFAULT_PREF && parsePref(null) === DEFAULT_PREF && parsePref(undefined) === DEFAULT_PREF);
check('default is System (follows the device)', DEFAULT_PREF === 'system');
check('resolveTheme: explicit choices ignore the device', resolveTheme('light', true) === 'light' && resolveTheme('dark', false) === 'dark');
check('resolveTheme: System follows the device', resolveTheme('system', true) === 'dark' && resolveTheme('system', false) === 'light');
check('three options with labels, descriptions and icons', THEME_OPTIONS.map((o) => o.v).join() === 'light,dark,system' && THEME_OPTIONS.every((o) => o.label && o.sub && o.icon) && prefLabel('system') === 'System');
check('storage key', THEME_KEY === 'hybrd:theme');

// ---------- tokens ----------
const block = (sel: RegExp) => { const m = css.match(sel); return m ? m[0] : ''; };
const dark = block(/:root, \[data-theme="dark"\][^{]*\{[^}]*\}/), light = block(/\[data-theme="light"\] \{[^}]*\}/);
const names = (b: string) => [...b.matchAll(/(--[a-z0-9-]+):/g)].map((m) => m[1]);
const dn = new Set(names(dark)), ln = new Set(names(light));
const missing = [...dn].filter((t) => !ln.has(t) && !['--head', '--body', '--mono', '--r', '--nav-h', '--sat', '--sab'].includes(t));
check('light theme defines every colour token dark does', missing.length === 0, missing);
check('both themes set color-scheme', /color-scheme: dark/.test(dark) && /color-scheme: light/.test(light));
check('immersive screens (Record map, calls, stories, viewer) always use the dark tokens', /:root, \[data-theme="dark"\], \.recmap, \.call-screen, \.call-bar, \.s-story, \.gv, \.dm-viewer \{/.test(css));
const val = (b: string, t: string) => b.match(new RegExp(`${t}: (#[0-9a-fA-F]{6})`))?.[1] ?? '';
const lum = (hex: string) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
for (const [name, b] of [['dark', dark], ['light', light]] as const) {
  const bgs = ['--bg', '--card', '--card2'].map((t) => [t, val(b, t)]);
  const textOk = (t: string, min: number) => bgs.every(([, bg]) => ratio(val(b, t), bg) >= min);
  check(`${name}: body text ≥ 7:1 on bg / card / card2`, textOk('--fg', 7));
  check(`${name}: muted text ≥ 4.5:1`, textOk('--mut', 4.5), bgs.map(([k, bg]) => `${k} ${ratio(val(b, '--mut'), bg).toFixed(2)}`));
  check(`${name}: accent text (--ya) ≥ 4.5:1`, textOk('--ya', 4.5), bgs.map(([k, bg]) => `${k} ${ratio(val(b, '--ya'), bg).toFixed(2)}`));
  for (const t of ['--bad-t', '--warn-t', '--ok-t', '--info-t', '--hr-t', '--strava-t', '--violet-t']) check(`${name}: ${t} ≥ 4.5:1 on cards`, textOk(t, 4.5), bgs.map(([k, bg]) => `${k} ${ratio(val(b, t), bg).toFixed(2)}`));
  check(`${name}: chart colour (--yc) ≥ 3:1 on cards`, ['--card', '--card2'].every((t) => ratio(val(b, '--yc'), val(b, t)) >= 3));
  check(`${name}: ink on the yellow buttons ≥ 12:1`, ratio(val(b, '--ink'), val(b, '--y')) >= 12);
}
check('browser chrome colours match --bg', THEME_COLORS.dark === val(dark, '--bg') && THEME_COLORS.light === val(light, '--bg'));

// ---------- no raw greys left in screens ----------
const lines = css.split('\n').map((l, i) => [i + 1, l] as const).filter(([i]) => i > 55);
const immersive = /^\s*(\.recmap|\.rm-|\.call-|\.s-story|\.gv\b|\.gv-|\.dm-viewer|\.crop-|\.g-tag|\.g-check|\.g-play|\.g-dur|\.up-thumb|\.gp-thumb|\.share-btn|\.sb-ic|\.s-prev|\.react-|\.dm-reveal|\.dm-att|\.dm-media|\.cmp-img|\.s-notif|\.sample-tag|\.dm-fcount|\.s-badge|video|@keyframes)/;
const isGrey = (h: string) => { const x = h.replace('#', ''); const f = x.length === 3 ? x.split('').map((c) => c + c).join('') : x.slice(0, 6); const v = [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16)); return Math.max(...v) - Math.min(...v) <= 14 && Math.max(...v) < 90; };
const greys = lines.filter(([, l]) => !immersive.test(l) && !/^\s*\.theme-prev/.test(l) && [...l.replace(/(^|[^-\w])color: ?#[0-9a-f]{3,6}/gi, '').matchAll(/(?:background|border[a-z-]*|box-shadow|outline)\s*:[^;]*?(#[0-9a-f]{3,6})\b/gi)].some((m) => isGrey(m[1]) && m[1].toLowerCase() !== '#0a0a0a'));
check('screens use tokens, not raw dark greys (immersive screens excepted)', greys.length === 0, greys.slice(0, 5).map(([i, l]) => `${i}: ${l.slice(0, 90)}`));
const rawText = lines.filter(([, l]) => !immersive.test(l) && /(^|[;{ ])color: ?#(ff8a8a|f87171|fb923c|ffb86b|4ade80|9ad0ff|ddd|7ee2a0|ff4d6d|FFE600)/i.test(l));
check('text colours come from tokens (--bad-t, --ok-t, --ya …)', rawText.length === 0, rawText.slice(0, 4).map(([i, l]) => `${i}: ${l.slice(0, 90)}`));
const yText = lines.filter(([, l]) => !immersive.test(l) && /(^|[;{ ])color: ?var\(--y\)(?!\w)/.test(l));
check('yellow text uses --ya (readable on white), never var(--y) as a text colour', yText.length === 0, yText.map(([i, l]) => `${i}: ${l.slice(0, 100)}`));

// ---------- first paint ----------
check('inline script in <head> sets data-theme before first paint', /<script>[\s\S]*hybrd:theme[\s\S]*setAttribute\('data-theme'/.test(html) && html.indexOf('hybrd:theme') < html.indexOf('<title>'));
check('script updates theme-color, and color-scheme meta is present', /theme-color[\s\S]*#f4f4f1/.test(html) && /<meta name="color-scheme" content="dark light"/.test(html));
check('the inline script and theme.ts agree on the storage key and light colour', html.includes(THEME_KEY) && html.includes(THEME_COLORS.light) && html.includes(THEME_COLORS.dark));
check('theme.ts updates the theme-color meta and the iOS status bar', /meta\[name="theme-color"\]/.test(src('src/lib/theme.ts')) && /apple-mobile-web-app-status-bar-style/.test(src('src/lib/theme.ts')));
check('follows the device live for System (matchMedia change)', /prefers-color-scheme: dark/.test(src('src/lib/theme.ts')) && /addEventListener\?\.\('change'/.test(src('src/lib/theme.ts')));

// ---------- settings + sync ----------
check('Settings › Appearance with Light / Dark / System radios', /function AppearanceSettings/.test(settings) && /role="radiogroup" aria-label="Theme"/.test(settings) && /data-testid=\{`theme-\$\{o\.v\}`\}/.test(settings) && /appearance: \(\) => <AppearanceSettings \/>/.test(settings));
check('choice is saved to the profile when it changes (syncs across devices)', /setProfile\(\{ theme: p \}\)/.test(settings) && /theme\?: 'light' \| 'dark' \| 'system'/.test(src('src/lib/types.ts')));
check('App applies the theme and adopts a synced profile choice', /useTheme\(\)/.test(app) && /profile\.theme/.test(app) && /setStoredPref\(parsePref\(profile\.theme\)\)/.test(app));
const idx = src('src/lib/settingsIndex.ts');
check('Appearance is searchable ("dark mode")', /id: 'appearance'/.test(idx) && /dark mode light mode/.test(idx));

// ---------- navigation ----------
const nav = app.slice(app.indexOf('const NAV = ['), app.indexOf('];', app.indexOf('const NAV = [')));
const order = [...nav.matchAll(/to: '([^']+)'/g)].map((m) => m[1]);
check('desktop nav: Home, Social, Messages, then the rest', order.slice(0, 3).join() === '/,/social,/messages' && order.includes('/coach') && order.includes('/progress') && order.length === 11, order);
const bn = app.slice(app.indexOf('<nav className="bottom-nav"'), app.indexOf('</nav>', app.indexOf('<nav className="bottom-nav"')));
const bnTo = [...bn.matchAll(/NavLink to="([^"]+)"/g)].map((m) => m[1]);
check('phone bottom bar: Home, Social, Record, Train, Fuel (Record stays centred)', bnTo.join() === '/,/social,/record,/train,/fuel', bnTo);
check('Social has an unread badge in the bottom bar', /data-testid="nav-social-badge"/.test(bn));
const top = app.slice(app.indexOf('<div className="topbar">'), app.indexOf('</div>', app.indexOf('<div className="topbar">') + 600));
check('phone header: Messages button first, then Coach, mode, settings, avatar', top.indexOf('<MessagesLink />') > 0 && top.indexOf('<MessagesLink />') < top.indexOf('/coach') && /top-av/.test(app) && !/top-social/.test(app));
check('desktop header has a labelled Messages button', /className="desk-dm"/.test(app) && /\.desk-dm \{/.test(css));
check('Messages link carries the unread badge and an accessible label', /Messages\$\{badge \? `, \$\{badge\} unread`/.test(src('src/components/Messages.tsx')));
for (const r of ['/social', '/social/friends', '/social/new', '/messages', '/messages/chat', '/me', '/settings/appearance', '/train', '/record', '/fuel']) check(`route still exists: ${r}`, r === '/settings/appearance' ? /path="\/settings\/:section"/.test(app) : new RegExp(`path="${r}"`).test(app));
check('Appearance has its own built page', src('tools/postbuild.mjs').includes("'settings/appearance'"));

console.log(`\n${n - failed}/${n} passed`);
if (failed) process.exit(1);
