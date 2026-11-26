// Save & share activities: key stats, the public payload, share links (X / Facebook / copy), file names, GPX,
// share-image geometry (ratios, fitting, map tiles), and the wiring of the share sheet, save screen and share page.
// Run: node --experimental-strip-types --import ./tools/ts-resolve.mjs tools/test-share.ts
import { readFileSync } from 'node:fs';
import {
  keyStats, publicActivity, shareUrl, isShareId, newShareId, shareText, xIntentUrl, facebookShareUrl, shareFileName, slug, toGpx, autoTitle,
  visibilityLabel, RATIOS, IMAGE_STYLES, SHARE_PATH,
} from '../src/lib/share.ts';
import { fitRoute, tilesFor, layoutFor, worldPx, OSM_TILE, OSM_ATTRIBUTION } from '../src/lib/shareLayout.ts';
import type { Workout } from '../src/lib/types.ts';

let failed = 0, n = 0;
const check = (name: string, cond: boolean, detail?: unknown) => { n++; if (!cond) { failed++; console.error('FAIL', name, detail ?? ''); } else console.log('ok', name); };
const adult = { dob: '1990-01-01', age: 36, privacy: { seed: 's' } };

// ---------- key stats ----------
const run = { type: 'run' as const, stats: { distanceM: 5000, movingSec: 1500, elevGainM: 42 } };
const km = keyStats(run, 'metric'), mi = keyStats(run, 'imperial');
check('run: distance, pace, time, elevation', km.map((k) => k.label).join() === 'Distance,Pace,Time,Elev gain', km);
check('run metric: 5.00 km · 5:00 /km', km[0].value === '5.00' && km[0].unit === 'km' && km[1].value === '5:00' && km[1].unit === '/km');
check('run imperial: 3.11 mi · 8:02 /mi (same formatter as the Record screen) · ft', mi[0].value === '3.11' && mi[0].unit === 'mi' && mi[1].value === '8:02' && mi[1].unit === '/mi' && mi[3].unit === 'ft' && mi[3].value === '138');
const ride = keyStats({ type: 'cycle', stats: { distanceM: 30000, movingSec: 3600 } }, 'metric');
check('ride: speed instead of pace (30.0 km/h)', ride[1].label === 'Speed' && ride[1].value === '30.0' && ride[1].unit === 'km/h');
check('ride imperial: mph', keyStats({ type: 'cycle', stats: { distanceM: 30000, movingSec: 3600 } }, 'imperial')[1].unit === 'mph');
const lift = keyStats({ type: 'strength', stats: { movingSec: 3300, exercises: 5, sets: 18 } }, 'metric');
check('gym session: time, exercises, sets (no distance)', lift.map((k) => k.label).join() === 'Time,Exercises,Sets', lift);
check('at most 4 stats', keyStats({ type: 'run', stats: { distanceM: 5000, movingSec: 1500, elevGainM: 10, avgHr: 150, kcal: 400, steps: 5000 } }, 'metric').length === 4);
check('HR shown only when in the payload', keyStats({ type: 'indoor-cycle', stats: { movingSec: 1800, avgHr: 140 } }, 'metric').some((k) => k.label === 'Avg HR'));

// ---------- payload ----------
const w: Workout = { id: 'w9', updatedAt: 1, date: '2026-11-20T12:00:00.000Z', type: 'strength', title: '  Push day  ', durationSec: 3300, rpe: 7, description: '  Felt strong  ', kcal: 320, hr: { avg: 120, max: 160 },
  exercises: [{ exId: 'a', name: 'Bench press', sets: [{ reps: 5, weightKg: 80, done: true }, { reps: 5, weightKg: 80, done: true }] }, { exId: 'b', name: 'Dips', sets: [{ reps: 10 }] }] };
const pa = publicActivity(w, undefined, adult);
check('payload v1, label, trimmed description', pa.v === 1 && pa.label === 'Strength' && pa.description === 'Felt strong');
check('payload: lifts (names + set counts only, no weights)', pa.lifts?.length === 2 && pa.lifts[0].name === 'Bench press' && pa.lifts[0].sets === 2 && !JSON.stringify(pa).includes('weightKg'));
check('payload: no map for gym sessions, not flagged hidden', pa.route === null && !pa.mapHidden && !pa.privacyNote);
check('payload: stats exercises / sets / effort', pa.stats.exercises === 2 && pa.stats.sets === 3 && pa.stats.rpe === 7);
check('payload: kcal + HR private by default', pa.stats.kcal === undefined && pa.stats.avgHr === undefined);
check('payload: never includes notes, ids, photos, gear or source', !('notes' in pa) && !JSON.stringify(pa).includes('w9') && !('photos' in pa) && !('gearId' in pa));
const runW: Workout = { id: 'r1', updatedAt: 1, date: '2026-11-20T07:00:00.000Z', type: 'run', title: 'Morning Run', durationSec: 1500, elapsedSec: 1620, distanceM: 5000, splits: [{ label: '1', sec: 300, distanceM: 1000 }] };
const rp = publicActivity(runW, undefined, adult);
check('payload: moving + elapsed time, splits', rp.stats.movingSec === 1500 && rp.stats.elapsedSec === 1620 && rp.splits?.[0].sec === 300);

// ---------- links ----------
const id = newShareId();
check('share id is a random UUID', isShareId(id) && id !== newShareId());
check('isShareId rejects junk / injection', !isShareId('1 or 1=1') && !isShareId('') && !isShareId(null) && !isShareId('w9'));
const url = shareUrl('https://ex.github.io/hybrd/', id);
check('share URL = <app>/a?id=<uuid>', url === `https://ex.github.io/hybrd/${SHARE_PATH}?id=${id}`);
check('share URL works without a trailing slash', shareUrl('https://ex.github.io/hybrd', id) === url);
const x = xIntentUrl('Morning Run · 5.00 km & more', url);
check('X: intent URL with encoded text + url (opens composer, posts nothing)', x.startsWith('https://x.com/intent/post?') && new URL(x).searchParams.get('text') === 'Morning Run · 5.00 km & more' && new URL(x).searchParams.get('url') === url);
check('X: text-only when there is no link (local mode)', !new URL(xIntentUrl('hi')).searchParams.has('url'));
check('X: text capped', new URL(xIntentUrl('a'.repeat(500))).searchParams.get('text')!.length === 240);
check('Facebook: sharer URL with the link', facebookShareUrl(url) === `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`);
check('share text: title + 3 stats + HYBRD', shareText({ ...rp, title: 'Morning Run' }, 'metric') === 'Morning Run · 5.00 km · 5:00 /km · 25:00 on HYBRD', shareText(rp, 'metric'));
check('file names: dated, slugged, variant', shareFileName({ title: 'Morning Run!', date: '2026-11-20T07:00:00Z' }, 'png', 'story') === 'hybrd-2026-11-20-morning-run-story.png' && slug('Café  Run ¿?') === 'cafe-run' && slug('!!!') === 'activity');
check('visibility labels', visibilityLabel('public') === 'Everyone' && visibilityLabel('friends') === 'Friends' && visibilityLabel(undefined) === 'Only me');
check('auto titles by time of day', autoTitle('run', 'Run', new Date(2026, 0, 1, 7)) === 'Morning Run' && autoTitle('cycle', 'Ride', new Date(2026, 0, 1, 12, 30)) === 'Lunch Ride' && autoTitle('walk', 'Walk', new Date(2026, 0, 1, 15)) === 'Afternoon Walk' && autoTitle('run', 'Run', new Date(2026, 0, 1, 19)) === 'Evening Run' && autoTitle('run', 'Run', new Date(2026, 0, 1, 2)) === 'Night Run');

// ---------- GPX ----------
const g = toGpx({ title: 'A <b>&</b> "B"', type: 'cycle', date: '2026-11-20T07:00:00Z', description: 'x<y' }, [[{ lat: 1, lng: 2, alt: 3, t: Date.parse('2026-11-20T07:00:00Z') }, { lat: 1.001, lng: 2.001 }], [{ lat: 5, lng: 5 }]]);
check('GPX: XML-escaped name/desc', g.includes('<name>A &lt;b&gt;&amp;&lt;/b&gt; &quot;B&quot;</name>') && g.includes('<desc>x&lt;y</desc>'));
check('GPX: cycling type, ele + time, 1-point segments dropped', g.includes('<type>cycling</type>') && g.includes('<ele>3.0</ele>') && g.includes('<time>2026-11-20T07:00:00.000Z</time>') && (g.match(/<trkseg>/g) || []).length === 1);

// ---------- image geometry ----------
check('ratios: 1080×1080, 1080×1350, 1080×1920', RATIOS.square.h === 1080 && RATIOS.portrait.h === 1350 && RATIOS.story.h === 1920 && Object.values(RATIOS).every((r) => r.w === 1080));
check('styles: map, route, transparent sticker, stats', IMAGE_STYLES.map((s) => s.v).join() === 'map,route,transparent,stats');
const [wx, wy] = worldPx(0, 0, 0);
check('web mercator: (0,0) is the centre of tile 0', Math.abs(wx - 128) < 1e-9 && Math.abs(wy - 128) < 1e-9);
const segs = [[{ lat: 40.70, lng: -74.0 }, { lat: 40.72, lng: -74.0 }, { lat: 40.72, lng: -73.98 }]];
for (const r of ['square', 'portrait', 'story'] as const) {
  const L = layoutFor(r);
  const f = fitRoute(segs, L.W, L.H, 30, L.route);
  const xs = f.points.flat().map((p) => p[0]), ys = f.points.flat().map((p) => p[1]);
  check(`${r}: route fits inside its box`, Math.min(...xs) >= L.route.x + 29 && Math.max(...xs) <= L.route.x + L.route.w - 29 && Math.min(...ys) >= L.route.y + 29 && Math.max(...ys) <= L.route.y + L.route.h - 29);
  check(`${r}: route box sits above the stats`, L.route.y + L.route.h < L.statsY && L.statsY < L.safeBottom && L.safeBottom <= L.H);
  const tiles = tilesFor(f, L.W, L.H);
  const cover = tiles.length > 0 && Math.min(...tiles.map((t) => t.dx)) <= 0 && Math.min(...tiles.map((t) => t.dy)) <= 0 && Math.max(...tiles.map((t) => t.dx + t.size)) >= L.W && Math.max(...tiles.map((t) => t.dy + t.size)) >= L.H;
  check(`${r}: map tiles cover the whole image, ≤ 60 tiles, drawn ≤ 2× size`, cover && tiles.length <= 60 && tiles.every((t) => t.size >= 256 && t.size < 512.01), { n: tiles.length });
}
check('story keeps clear of Instagram UI (top ≥ 180 px, bottom ≥ 200 px)', layoutFor('story').logoY >= 180 && layoutFor('story').H - layoutFor('story').safeBottom >= 200);
check('a single point / empty route does not crash', fitRoute([[{ lat: 1, lng: 1 }]], 100, 100).points.length === 1 && fitRoute([], 100, 100).bounds === null && tilesFor(fitRoute([], 100, 100), 100, 100).length === 0);
check('OSM tiles + attribution', OSM_TILE({ z: 3, x: 1, y: 2 }) === 'https://tile.openstreetmap.org/3/1/2.png' && /OpenStreetMap contributors/.test(OSM_ATTRIBUTION));

// ---------- wiring ----------
const src = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const sheet = src('src/components/ShareSheet.tsx'), img = src('src/lib/shareImage.ts'), rec = src('src/pages/Record.tsx'), save = src('src/components/SaveActivity.tsx');
const det = src('src/pages/WorkoutDetail.tsx'), pub = src('src/pages/SharedActivity.tsx'), app = src('src/App.tsx'), post = src('tools/postbuild.mjs'), sql = src('supabase/schema.sql');
check('share sheet: feed, Instagram, Facebook, X, copy link, image, GPX, more', ['share-post', 'share-instagram', 'share-facebook', 'share-x', 'share-copy', 'share-download', 'share-gpx', 'share-more'].every((t) => sheet.includes(`data-testid="${t}"`)));
check('share sheet: Web Share API with files where supported', /navigator\.canShare\?\.\(\{ files/.test(sheet) && /navigator\.share\(\{ files: \[f\]/.test(sheet));
check('share sheet: X via intent URL, Facebook via sharer', /xIntentUrl\(/.test(sheet) && /facebookShareUrl\(/.test(sheet));
check('share sheet: Instagram → Web Share, else download + instructions', /shareIg/.test(sheet) && /setIgHelp\(true\)/.test(sheet) && /Instagram › \+/.test(sheet));
check('share sheet: local / demo mode explains links', /Share links work once accounts are switched on/.test(sheet) && /Demo mode: links work once accounts are on/.test(sheet));
check('share sheet: Strava activities can’t be shared (API terms)', /source === 'strava'/.test(sheet) && /Strava’s API terms/.test(sheet));
check('share sheet: asks who can see it before a link or post when Only me', /setAskVis\('link'\)/.test(sheet) && /setAskVis\('post'\)/.test(sheet));
check('share sheet: posts to the HYBRD feed with the image + workout card', /backend\.createPost\(\{ text: caption\.trim\(\) \|\| a\.title, images: \[/.test(sheet) && /workoutCard\(/.test(sheet));
check('share sheet: minors / private profiles never post publicly', /v === 'public' && !me\.isMinor && me\.privacy === 'public' \? 'public' : 'friends'/.test(sheet));
check('image: map tiles with CORS + OSM attribution drawn', /crossOrigin = 'anonymous'/.test(img) && /OSM_ATTRIBUTION/.test(img) && /toBlob/.test(img));
check('save screen: title, description, type, effort, photos, gear, visibility, map privacy', ['sa-title', 'sa-desc', 'sa-add-photo', 'sa-save'].every((t) => save.includes(t)) && /VisibilityPicker/.test(save) && /MapPrivacyControls/.test(save) && /PrivacyPreview/.test(save) && /Gear/.test(save));
check('Record: hold to finish → Save activity page → activity detail', /title="Save activity"/.test(rec) && /nav\(`\/train\/workout\/\$\{id\}\?saved=1`\)/.test(rec) && /autoTitle\(/.test(rec));
check('Record: saves description, visibility, map privacy, gear, photos, elapsed time', ['w.description', 'w.visibility', 'w.mapPrivacy', 'w.gearId', 'w.photos', 'w.elapsedSec'].every((k) => rec.includes(k)));
check('activity page: share, edit, visibility, privacy view, original GPX for the owner', /act-share/.test(det) && /act-edit/.test(det) && /What others see/.test(det) && /originalGpx\(/.test(det) && /<ShareSheet /.test(det));
check('deleting a shared activity removes the shared copy', /pub\.unpublish\(w\)/.test(det));
check('share page: signed-out viewers, local-mode explanation, not-available state', /activity_public|fetchSharedActivity/.test(pub) && /data-testid="pub-local"/.test(pub) && /data-testid="pub-missing"/.test(pub));
check('App: /a opens without onboarding', /loc\.pathname === '\/a' && !profile\.onboarded/.test(app) && /path="\/a"/.test(app));
check('postbuild: real pages for /a and the settings routes', /'a'/.test(post) && /'settings'/.test(post) && /'settings\/privacy'/.test(post));
check('schema: shared_activities with RLS, activity_public RPC, private image bucket', /create table if not exists public\.shared_activities/.test(sql) && /alter table public\.shared_activities enable row level security/.test(sql) && /function public\.activity_public\(p_id uuid\)/.test(sql) && /'activity-images', 'activity-images', false/.test(sql));

console.log(`\n${n - failed}/${n} passed`);
if (failed) process.exit(1);
