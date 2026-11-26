// Settings: one searchable place for every setting. Checks the index (sections, items, anchors, search),
// that old settings URLs redirect, the routes + gear links, that settings moved out of Me, and that the quick
// toggles left on Record (mi/km, auto-pause) change the same stored setting as Settings.
// Run: node --experimental-strip-types --import ./tools/ts-resolve.mjs tools/test-settings.ts
import { readFileSync, readdirSync } from 'node:fs';
import { SECTIONS, GROUPS, ITEMS, sectionById, itemPath, searchSettings, LEGACY_REDIRECTS } from '../src/lib/settingsIndex.ts';

let failed = 0, n = 0;
const check = (name: string, cond: boolean, detail?: unknown) => { n++; if (!cond) { failed++; console.error('FAIL', name, detail ?? ''); } else console.log('ok', name); };
const src = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const settings = src('src/pages/Settings.tsx'), app = src('src/App.tsx'), me = src('src/pages/Me.tsx'), rec = src('src/pages/Record.tsx'), post = src('tools/postbuild.mjs');
const anchorsIn = (code: string) => new Set([...code.matchAll(/\bid="([a-z-]+)"/g)].map((m) => m[1]));
const anchors = new Set([...anchorsIn(settings), ...anchorsIn(src('src/pages/Devices.tsx')), ...anchorsIn(src('src/pages/Messages.tsx'))]);

const allSrc = (readdirSync(new URL('../src', import.meta.url), { recursive: true }) as string[]).filter((f) => /\.tsx?$/.test(f)).map((f) => src(`src/${f}`)).join('\n');
// ---------- index ----------
const want = ['account', 'profile', 'privacy', 'units', 'recording', 'notifications', 'goals', 'devices', 'messages', 'data', 'help', 'about'];
check('12 sections: account, profile, privacy, units, recording, sounds, goals/fuel, devices, messages, data, help, about', want.every((id) => sectionById(id)) && SECTIONS.length === 12);
check('section ids are unique', new Set(SECTIONS.map((s) => s.id)).size === SECTIONS.length);
check('every section belongs to a group, every group has sections', SECTIONS.every((s) => GROUPS.some((g) => g.id === s.group)) && GROUPS.every((g) => SECTIONS.some((s) => s.group === g.id)));
check('every section has a title, subtitle and icon', SECTIONS.every((s) => s.title && s.sub && s.icon));
const bodies = [...settings.matchAll(/^\s{2}([a-z]+): \(\) => </gm)].map((m) => m[1]);
check('every section has a page body', want.every((id) => bodies.includes(id)) && bodies.length === SECTIONS.length, bodies);
check('every setting points at a real section', ITEMS.every((i) => sectionById(i.section)), ITEMS.filter((i) => !sectionById(i.section)));
check('every section has at least 2 searchable settings', SECTIONS.every((s) => ITEMS.filter((i) => i.section === s.id).length >= (s.id === 'about' ? 1 : 2)));
const badAnchor = ITEMS.filter((i) => i.anchor && !anchors.has(i.anchor));
check('every setting anchor exists on its page', badAnchor.length === 0, badAnchor);
check('item paths are /settings/<section>#<anchor>', itemPath({ label: 'x', section: 'privacy', anchor: 'zones' }) === '/settings/privacy#zones' && itemPath({ label: 'x', section: 'units' }) === '/settings/units');

// ---------- search ----------
const s1 = searchSettings('zones');
check('search “zones” → Privacy zones', s1.items[0]?.label === 'Privacy zones');
check('search by keyword “miles” → distance units', searchSettings('miles').items.some((i) => i.label.startsWith('Distance units')));
check('search “password” → Account', searchSettings('password').items.some((i) => i.section === 'account'));
check('search is case / accent insensitive', searchSettings('PRIVACÝ').sections.some((s) => s.id === 'privacy') || searchSettings('PRIVACY').sections.some((s) => s.id === 'privacy'));
check('search requires every word (“hide map”)', searchSettings('hide map').items.length >= 1 && searchSettings('hide map').items.every((i) => i.section === 'privacy'));
check('nonsense → nothing; empty → all sections', searchSettings('zzqx').items.length === 0 && searchSettings('zzqx').sections.length === 0 && searchSettings('  ').sections.length === 12);
check('search finds Strava, Spotify, heart-rate strap, 988', ['strava', 'spotify', 'strap', '988'].every((q) => searchSettings(q).items.length > 0));

// ---------- routes / redirects ----------
const routeTo = (p: string) => new RegExp(`path="${p.replace(/\//g, '\\/')}"`).test(app);
check('routes: /settings and /settings/:section', routeTo('/settings') && routeTo('/settings/:section'));
check('every old settings URL redirects to its new section', Object.entries(LEGACY_REDIRECTS).every(([from, to]) => sectionById(to.split('/')[2]) && new RegExp(`path="${from}" element=\\{<LegacyRedirect from="${from}" />\\}`).test(app)), LEGACY_REDIRECTS);
check('old: /me/account, /me/data, /me/help, /me/devices, /messages/settings', ['/me/account', '/me/data', '/me/help', '/me/devices', '/messages/settings'].every((p) => LEGACY_REDIRECTS[p]));
check('redirect keeps query + hash (e.g. Strava callback, #music)', /location\.search|loc\.search/.test(settings) && /location\.hash|loc\.hash/.test(settings));
check('old Me anchors (#units, #goals, #music) redirect into Settings', /#units/.test(me) && /#goals/.test(me) && /#music/.test(me) && /MeRedirect/.test(me));
check('gear icon in the sidebar and the phone top bar', /data-testid="side-settings"/.test(app) && /data-testid="top-settings"/.test(app) && /to="\/settings" className="top-set" aria-label="Settings"/.test(app));
check('Me links to Settings', /data-testid="me-settings"/.test(me) && /to="\/settings\/account"/.test(me));
check('no links left to the old pages (except redirects)', !/to="\/me\/(account|data|help|devices)"|nav\('\/me\/(account|data|help|devices)|to="\/messages\/settings"/.test(allSrc));
check('real pages for every settings route in the build', SECTIONS.every((s) => post.includes(`'settings/${s.id}'`)) && post.includes("'settings'"));

// ---------- moved out of Me ----------
check('Me no longer has settings controls (units, HR max, FTP, step goal, sounds, profile form)', !/aria-label="Max heart rate"|aria-label="FTP|DistToggle|WeightToggle|Daily step goal|voice cues|<Field/i.test(me));
check('those controls live in Settings', /aria-label="Max heart rate"/.test(settings) && /aria-label="FTP in watts"/.test(settings) && /<DistToggle \/>/.test(settings) && /aria-label="Daily step goal"/.test(settings));
check('Settings › Privacy: default visibility, health toggle, map privacy, zones, preview', /VisibilityPicker/.test(settings) && /shareHealth/.test(settings) && /TrimChips/.test(settings) && /hideMap/.test(settings) && /ZoneEditor/.test(settings) && /PrivacyPreview/.test(settings));
check('minors: Public hidden + longer trim forced in Settings too', /<VisibilityPicker [^\n]*minor=\{pr\.minor\}/.test(settings) && /on=\{pr\.hideEnds\} disabled=\{pr\.minor\}/.test(settings) && /const off = minor && o\.v === 'public'/.test(src('src/components/ActivityPrivacy.tsx')) && /minor=\{pr\.minor\} onChange=\{\(trimM\)/.test(settings));

// ---------- quick toggles stay in sync ----------
check('Record auto-pause writes profile.recording.autoPause', /setProfile\(\{ recording: \{ \.\.\.\(profile\.recording \|\| \{\}\), autoPause: v \} \}\)/.test(rec));
check('Settings auto-pause writes the same field', /recording: \{ \.\.\.\(p\.recording \|\| \{\}\), autoPause:/.test(settings));
check('Record applies the saved auto-pause default', /profile\.recording\?\.autoPause \?\? true/.test(rec));
check('mi/km on Record and in Settings is the same component (profile.units)', /<DistToggle \/>/.test(rec) && /<DistToggle \/>/.test(settings) && /setProfile\(\{ units/.test(src('src/components/UnitToggle.tsx')));

// ---------- layout ----------
check('desktop two-pane, phone single-pane', /set-shell/.test(settings) && /desk-only/.test(settings));
const css = src('src/styles.css');
check('settings + sharing styles exist', ['.set-shell', '.srow', '.set-search', '.share-grid', '.share-btn', '.save-act', '.pub-page', '.zone-map', '.priv-preview'].every((c) => css.includes(c)));

console.log(`\n${n - failed}/${n} passed`);
if (failed) process.exit(1);
