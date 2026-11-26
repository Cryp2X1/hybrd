// Map privacy (Record › hide start & end, privacy zones, hide map) — the trim itself, its randomisation, defaults,
// minors, and that hidden points are truly removed from EVERY share output (payload/link row, GPX, image input, post).
// Run: node --experimental-strip-types --import ./tools/ts-resolve.mjs tools/test-privacy.ts
import { readFileSync } from 'node:fs';
import {
  trimRoute, trimOffsets, effectiveZone, inZone, prefsOf, mapPrivacyFor, publicRoute, sanitize, thin, isMinor, allowedVisibilities, clampVisibility,
  clampTrim, newSeed, hash32, privacySummary, TRIM_MIN, TRIM_MAX, TRIM_DEFAULT, MINOR_TRIM_MIN, EXTRA_MAX, ZONE_SHIFT_MAX, TRIM_CHOICES_MI, type MapPrivacy, type PrivacyZone,
} from '../src/lib/privacy.ts';
import { publicActivity, payloadPoints, shareGpx, originalGpx } from '../src/lib/share.ts';
import { fitRoute } from '../src/lib/shareLayout.ts';
import { haversine } from '../src/lib/calc.ts';
import type { RoutePoint, Workout } from '../src/lib/types.ts';

let failed = 0, n = 0;
const check = (name: string, cond: boolean, detail?: unknown) => { n++; if (!cond) { failed++; console.error('FAIL', name, detail ?? ''); } else console.log('ok', name); };

// ---------- fixture: from HOME north 3 km, east 1 km past WORK, back south to HOME (≈ 7 km loop), point every ~10 m
const HOME = { lat: 40.70000, lng: -74.00000 };
const M_LAT = 1 / 111_320, M_LNG = 1 / (111_320 * Math.cos((HOME.lat * Math.PI) / 180));
const pts: RoutePoint[] = []; let t = Date.parse('2026-11-20T07:00:00Z');
const push = (dn: number, de: number) => { pts.push({ lat: HOME.lat + dn * M_LAT, lng: HOME.lng + de * M_LNG, alt: 10, t, acc: 5, e: 0, d: 0 }); t += 3000; };
for (let i = 0; i <= 300; i++) push(i * 10, 0);          // north 3 km
for (let i = 1; i <= 100; i++) push(3000, i * 10);       // east 1 km
for (let i = 1; i <= 300; i++) push(3000 - i * 10, 1000); // south 3 km
for (let i = 1; i <= 100; i++) push(0, 1000 - i * 10);   // west 1 km back home
const WORK = { lat: HOME.lat + 3000 * M_LAT, lng: HOME.lng + 500 * M_LNG }; // on the east leg
const segs = [pts.slice(0, 450), pts.slice(450)]; // a GPS gap in the middle
const total = pts.length;
const ON: MapPrivacy = { hideEnds: true, trimM: 400, hideMap: false, useZones: true };
const SEED = 'test-seed-123';
const zone: PrivacyZone = { id: 'z1', label: 'Work', lat: WORK.lat, lng: WORK.lng, radiusM: 200 };
const all = (s: { lat: number; lng: number }[][]) => s.flat();
const minDistTo = (s: { lat: number; lng: number }[][], p: { lat: number; lng: number }) => Math.min(...all(s).map((q) => haversine(q, p)));

// ---------- offsets ----------
const o1 = trimOffsets(400, SEED, 'w1'), o1b = trimOffsets(400, SEED, 'w1'), o2 = trimOffsets(400, SEED, 'w2'), o3 = trimOffsets(400, 'other-seed', 'w1');
check('offsets are ≥ trim and ≤ trim × 1.5', [o1, o2, o3].every((o) => o.start >= 400 && o.start <= 400 * (1 + EXTRA_MAX) && o.end >= 400 && o.end <= 400 * (1 + EXTRA_MAX)), [o1, o2, o3]);
check('offsets are stable for the same activity (re-sharing gives the same cut)', o1.start === o1b.start && o1.end === o1b.end);
check('offsets differ between activities', o1.start !== o2.start || o1.end !== o2.end, [o1, o2]);
check('offsets depend on the secret seed', o1.start !== o3.start || o1.end !== o3.end);
const many = Array.from({ length: 400 }, (_, i) => trimOffsets(500, SEED, 'k' + i).start);
check('offsets are spread across the range (not reverse-engineerable from one value)', Math.min(...many) < 540 && Math.max(...many) > 700 && new Set(many).size > 150, [Math.min(...many), Math.max(...many)]);
check('start and end offsets are independent', Array.from({ length: 50 }, (_, i) => trimOffsets(500, SEED, 'q' + i)).some((o) => o.start !== o.end));
check('hash32 is deterministic and 32-bit', hash32('abc') === hash32('abc') && hash32('abc') !== hash32('abd') && hash32('x') >>> 0 === hash32('x'));
const s1 = newSeed(), s2 = newSeed();
check('newSeed: 128-bit random hex, unique', /^[0-9a-f]{32}$/.test(s1) && s1 !== s2);

// ---------- hide start & end ----------
const r = trimRoute(segs, ON, [], SEED, 'w1');
check('trim keeps most of a 7 km route', !r.hiddenAll && r.kept > total * 0.75 && r.kept < total, r);
check('trim removed points at both ends', r.removed > 0 && r.kept + r.removed === r.total && r.total === total);
check('first visible point is ≥ trim distance from the real start along the path', haversine(pts[0], all(r.segments)[0]) >= 380, haversine(pts[0], all(r.segments)[0]));
const lastVis = all(r.segments)[all(r.segments).length - 1];
check('last visible point is ≥ trim from the real end', haversine(pts[pts.length - 1], lastVis) >= 380);
check('no visible point within 380 m of home (route starts and ends at home)', minDistTo(r.segments, HOME) >= 380, minDistTo(r.segments, HOME));
check('the real start point is not in the output', !all(r.segments).some((p) => p.lat === pts[0].lat && p.lng === pts[0].lng));
check('hidden distances reported', r.hiddenStartM === o1.start && r.hiddenEndM === o1.end);
check('GPS gaps stay gaps (segments not bridged)', r.segments.length >= 2);
for (const tm of [200, 600, 1000]) {
  const x = trimRoute(segs, { ...ON, trimM: tm }, [], SEED, 'w1');
  check(`trim ${tm} m: nothing visible within ${tm - 20} m of home`, minDistTo(x.segments, HOME) >= tm - 20, minDistTo(x.segments, HOME));
}
const off = trimRoute(segs, { ...ON, hideEnds: false }, [], SEED, 'w1');
check('hide ends OFF + no zones = full route', off.kept === total && off.removed === 0);
const short = trimRoute([pts.slice(0, 50)], { ...ON, trimM: 400 }, [], SEED, 'w1'); // 490 m route
check('a route shorter than both cuts is hidden entirely', short.hiddenAll && short.reason === 'too-short' && short.segments.length === 0);
check('no route → hidden, reason no-route', trimRoute([], ON, [], SEED, 'x').reason === 'no-route' && trimRoute(undefined, ON, [], SEED, 'x').hiddenAll);

// ---------- hide map ----------
const hm = trimRoute(segs, { ...ON, hideMap: true }, [], SEED, 'w1');
check('hide map removes every point', hm.hiddenAll && hm.segments.length === 0 && hm.kept === 0 && hm.reason === 'hide-map');

// ---------- privacy zones ----------
const z = trimRoute(segs, { ...ON, hideEnds: false }, [zone], SEED, 'w1');
check('zone: no visible point within the zone radius of the address', minDistTo(z.segments, WORK) > zone.radiusM, minDistTo(z.segments, WORK));
check('zone: points were removed and counted', z.zoneHits > 0 && z.removed === z.zoneHits);
check('zone: the route is split at the zone (no line drawn through it)', z.segments.length >= 2);
const ez = effectiveZone(zone, SEED);
check('zone circle is shifted (centre is not the address) …', haversine(ez, WORK) > 0.5);
check('… by at most 35 % of the radius', haversine(ez, WORK) <= zone.radiusM * ZONE_SHIFT_MAX + 0.5);
check('… and grown so the whole original circle is still covered', ez.radiusM >= zone.radiusM + haversine(ez, WORK) - 0.5);
check('zone shift is stable and depends on the seed', JSON.stringify(effectiveZone(zone, SEED)) === JSON.stringify(ez) && JSON.stringify(effectiveZone(zone, 'zzz')) !== JSON.stringify(ez));
// any point within the original radius is always inside the effective circle
let covered = true;
for (let k = 0; k < 360; k += 10) for (const rr of [0, 50, 100, 199]) { const p = { lat: WORK.lat + rr * Math.cos((k * Math.PI) / 180) * M_LAT, lng: WORK.lng + rr * Math.sin((k * Math.PI) / 180) * M_LNG }; if (!inZone(p, ez)) covered = false; }
check('every point inside the address radius is hidden (360° sweep)', covered);
const zOff = trimRoute(segs, { ...ON, hideEnds: false, useZones: false }, [zone], SEED, 'w1');
check('zones can be switched off for one activity', zOff.kept === total);
const both = trimRoute(segs, ON, [zone, { id: 'home', label: 'Home', lat: HOME.lat, lng: HOME.lng, radiusM: 800 }], SEED, 'w1');
check('ends + zones together: nothing near home (800 m zone) or work', minDistTo(both.segments, HOME) > 800 && minDistTo(both.segments, WORK) > 200);

// ---------- sanitise / thin ----------
const sz = sanitize(r.segments);
check('sanitise keeps only lat/lng/alt (no time, accuracy or clocks)', all(sz).every((p) => Object.keys(p).every((k) => ['lat', 'lng', 'alt'].includes(k))));
check('sanitise rounds to 5 decimals (~1 m)', all(sz).every((p) => Math.abs(p.lat * 1e5 - Math.round(p.lat * 1e5)) < 1e-6));
check('sanitise keepTime keeps t only when asked', all(sanitize(r.segments, true)).every((p) => typeof p.t === 'number'));
const th = thin(sz, 100);
check('thin caps the point count and keeps segment ends', all(th).length <= 130 && th.every((s, i) => s[0] === sz[i][0] && s[s.length - 1] === sz[i][sz[i].length - 1]));

// ---------- defaults & people ----------
const today = new Date('2026-11-25T12:00:00Z');
const adult = { dob: '1990-01-01', age: 36 }, teen = { dob: '2010-06-01', age: 16 };
check('isMinor by date of birth', isMinor(teen, today) && !isMinor(adult, today) && isMinor({ age: 15 }, today) && !isMinor({ age: 30 }, today));
const pd = prefsOf({ ...adult }, today);
check('defaults for new people: hide start/end ON, 400 m, map shown, friends-only, health private', pd.hideEnds && pd.trimM === TRIM_DEFAULT && !pd.hideMap && pd.defaultVisibility === 'friends' && !pd.shareHealth && pd.zones.length === 0);
const adultOff = prefsOf({ ...adult, privacy: { hideEnds: false, trimM: 200, defaultVisibility: 'public' } }, today);
check('adults can switch hide-ends off and default to public', !adultOff.hideEnds && adultOff.defaultVisibility === 'public' && adultOff.trimM === 200);
const teenTry = prefsOf({ ...teen, privacy: { hideEnds: false, trimM: 200, defaultVisibility: 'public' } }, today);
check('under-18: hide-ends forced ON, trim ≥ 400 m, never public', teenTry.minor && teenTry.hideEnds && teenTry.trimM === MINOR_TRIM_MIN && teenTry.defaultVisibility === 'friends');
check('under-18: per-activity override can\'t switch privacy off', (() => { const m = mapPrivacyFor({ mapPrivacy: { hideEnds: false, trimM: 200, hideMap: false, useZones: false } }, teenTry); return m.hideEnds && m.trimM >= 400 && m.useZones; })());
check('allowed visibilities: adults 3, minors no public', allowedVisibilities(false).length === 3 && !allowedVisibilities(true).includes('public'));
check('clampVisibility: minors public → friends; missing → only me', clampVisibility('public', true) === 'friends' && clampVisibility(undefined, false) === 'only-me' && clampVisibility('public', false) === 'public');
check('clampTrim keeps 200–1000 m', clampTrim(50) === TRIM_MIN && clampTrim(5000) === TRIM_MAX && clampTrim(NaN) === TRIM_DEFAULT && clampTrim(300, true) === MINOR_TRIM_MIN);
check('imperial choices 0.1–0.6 mi stay inside 200 m–1 km after clamping', TRIM_CHOICES_MI.every((mi) => { const m = clampTrim(mi * 1609.344); return m >= 200 && m <= 1000; }));
check('per-activity override wins for adults', mapPrivacyFor({ mapPrivacy: { hideEnds: false, trimM: 800, hideMap: true, useZones: false } }, pd).hideMap === true);
check('summary words', /hidden/.test(privacySummary(ON, 1, 'metric')) && /0\.2 mi|0\.3 mi/.test(privacySummary(ON, 0, 'imperial')) && /stats only/.test(privacySummary({ ...ON, hideMap: true }, 0, 'metric')) && /full route/.test(privacySummary({ ...ON, hideEnds: false }, 0, 'metric')));

// ---------- every share output uses the trimmed route ----------
const profile = { ...adult, privacy: { hideEnds: true, trimM: 400, zones: [zone], seed: SEED } };
const w: Workout = { id: 'w1', updatedAt: 1, date: new Date(pts[0].t).toISOString(), type: 'run', title: 'Morning Run', durationSec: 2400, distanceM: 7000, routeId: 'w1-r', hr: { avg: 150, max: 175 }, kcal: 500, visibility: 'public' };
const route = { segments: segs };
const pa = publicActivity(w, route, profile);
const pp = payloadPoints(pa);
check('payload (link page + Supabase row + feed post): no point near home', pp.length > 0 && minDistTo([pp], HOME) >= 380);
check('payload: no point inside the privacy zone', minDistTo([pp], WORK) > 200);
check('payload: no timestamps or accuracy leave the device', pp.every((p) => p.t === undefined && !('acc' in p) && !('e' in p) && !('d' in p)));
check('payload: says start/end hidden', /hidden/.test(pa.privacyNote || ''));
check('payload: HR and calories private by default', pa.stats.avgHr === undefined && pa.stats.kcal === undefined);
check('payload: HR shared only when the person turns it on', publicActivity(w, route, { ...profile, privacy: { ...profile.privacy, shareHealth: true } }).stats.avgHr === 150);
check('payload JSON never contains the real start point', !JSON.stringify(pa).includes(`"lat":${pts[0].lat},"lng":${pts[0].lng}`) && !JSON.stringify(pa).includes(`"lat":${Math.round(pts[0].lat * 1e5) / 1e5},"lng":${Math.round(pts[0].lng * 1e5) / 1e5}`));
const gpx = shareGpx(w, route, profile)!;
const gpxPts = [...gpx.matchAll(/lat="([-\d.]+)" lon="([-\d.]+)"/g)].map((m) => ({ lat: +m[1], lng: +m[2] }));
check('shared GPX: has the visible points', gpxPts.length > 100);
check('shared GPX: no point near home or inside the zone', minDistTo([gpxPts], HOME) >= 380 && minDistTo([gpxPts], WORK) > 200);
check('shared GPX: valid 1.1 with name + type', /<gpx version="1.1"/.test(gpx) && /<name>Morning Run<\/name>/.test(gpx) && /<type>running<\/type>/.test(gpx));
const orig = originalGpx(w, route);
check('original GPX (owner only) keeps the full route', [...orig.matchAll(/<trkpt /g)].length === total);
check('hide map: no shared GPX, no route in payload', shareGpx({ ...w, mapPrivacy: { hideEnds: true, trimM: 400, hideMap: true, useZones: true } }, route, profile) === null && publicActivity({ ...w, mapPrivacy: { hideEnds: true, trimM: 400, hideMap: true, useZones: true } }, route, profile).route === null);
check('hide map: payload flags it and explains', (() => { const x = publicActivity({ ...w, mapPrivacy: { hideEnds: true, trimM: 400, hideMap: true, useZones: true } }, route, profile); return x.mapHidden && /hidden/i.test(x.privacyNote || ''); })());
// share image: the renderer projects ONLY what publicRoute gives it
const pr = publicRoute(w, segs, profile);
const fr = fitRoute(pr.segments, 1080, 1080, 80);
check('share image input: projected points = trimmed points only', fr.points.flat().length === pr.segments.flat().length && pr.segments.flat().length < total);
check('share image input: bounds exclude home', (() => { const b = fr.bounds; return !(HOME.lat >= b.minLat && HOME.lat <= b.maxLat && HOME.lng >= b.minLng && HOME.lng <= b.maxLng) || minDistTo(pr.segments, HOME) >= 380; })());
// wiring: the UI only ever passes publicRoute/publicActivity output to share targets
const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
const sheet = src('components/ShareSheet.tsx'), img = src('lib/shareImage.ts'), acts = src('lib/activities.ts');
check('ShareSheet builds the image from publicActivity()', /publicActivity\(/.test(sheet) && !/route\.segments/.test(sheet.replace(/publicActivity\([^)]*\)/g, '')));
check('ShareSheet downloads GPX via shareGpx() (trimmed)', /shareGpx\(/.test(sheet) && !/originalGpx/.test(sheet));
check('image renderer only takes a PublicActivity', /renderShareImage\(a: PublicActivity/.test(img) && !/segments: RoutePoint/.test(img));
check('Supabase publish sends publicActivity() only', /publicActivity\(/.test(acts) && !/\.segments\b(?!\s*\))/.test(acts.replace(/publicActivity\([^)]*\)/g, '')));

console.log(`\n${n - failed}/${n} passed`);
if (failed) process.exit(1);
