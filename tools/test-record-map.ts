// Unit checks for the map-first Record screen: card stats (pace / speed / distance in mi & km), GPS quality,
// screen state machine, route following (distance remaining, off-route, out-and-back), personal heat aggregation,
// route-file parsing (GPX trk/rte without times, TCX), map style transforms + attribution, prefs/route storage, wiring.
// Run: node --experimental-strip-types --import ./tools/ts-resolve.mjs tools/test-record-map.ts
import { readFileSync } from 'node:fs';
import {
  cardStats, currentRate, fmtPaceShort, fmtShortDist, gpsQuality, nextPhase, phaseOf, controlsFor, bearing, trackHeading, pathLength,
  cumulative, project, projectAll, followStep, followTrack, buildHeat, simplify, makeRoute, circleRing, boundsOf, parseRouteText, loadPrefs, savePrefs,
  loadRoutes, saveRoutes, loadActive, saveActive, layerCount, DEFAULT_PREFS, MAX_ROUTES, ON_ROUTE_M, isGpsSport, type LatLng, type Phase, type PhaseEvent,
} from '../src/lib/recordMap.ts';
import { transformDark, transformStandard, satelliteStyle, blankStyle, BUILDINGS_3D, ATTR_OFM, ATTR_SAT, MAP_STYLES, usesRemote, STYLE_URL } from '../src/lib/mapStyles.ts';
import { haversine } from '../src/lib/calc.ts';
import type { RoutePoint } from '../src/lib/types.ts';

let failed = 0, n = 0;
const check = (name: string, cond: boolean, detail?: unknown) => { n++; if (!cond) { failed++; console.error('FAIL', name, detail ?? ''); } else console.log('ok', name); };
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

// ---------- card stats ----------
// 5 km in 25:00 → 5:00 /km = 8:03 /mi (1609.344 m: 1500 s / 3.10686 mi = 482.8 s)
let c = cardStats('run', 1500, 5000, 'metric');
check('run metric: time 25:00', c.time === '25:00', c.time);
check('run metric: distance 5.00 km', c.distance === '5.00' && c.distUnit === 'km', c);
check('run metric: Avg. pace 5:00 /km', c.rateLabel === 'Avg. pace' && c.rate === '5:00' && c.rateUnit === '/km', c);
c = cardStats('run', 1500, 5000, 'imperial');
check('run imperial: 3.11 mi', c.distance === '3.11' && c.distUnit === 'mi', c);
check('run imperial: 8:02 /mi (482.8 s floors to 8:02)', c.rate === '8:02' && c.rateUnit === '/mi', c);
c = cardStats('walk', 3600, 5000, 'metric');
check('walk: 12:00 /km', c.rate === '12:00', c);
c = cardStats('cycle', 3600, 30000, 'metric');
check('ride metric: Avg. speed 30.0 km/h', c.rateLabel === 'Avg. speed' && c.rate === '30.0' && c.rateUnit === 'km/h', c);
c = cardStats('cycle', 3600, 30000, 'imperial');
check('ride imperial: 18.6 mph · 18.64 mi', c.rate === '18.6' && c.rateUnit === 'mph' && c.distance === '18.64', c);
c = cardStats('run', 0, 0, 'imperial');
check('idle: 0:00 · --:-- · 0.00', c.time === '0:00' && c.rate === '--:--' && c.distance === '0.00', c);
check('ride idle: 0.0', cardStats('cycle', 0, 0, 'metric').rate === '0.0');
check('hour+ time format 1:02:05', cardStats('run', 3725, 12000, 'metric').time === '1:02:05');
check('too-slow pace shows --:-- (≥ 60 min/unit)', cardStats('walk', 3700, 1000, 'metric').rate === '--:--');
check('negative inputs clamp', cardStats('run', -5, -10, 'metric').time === '0:00');
check('fmtPaceShort 300 → 5:00', fmtPaceShort(300) === '5:00');
// current rate from sec/m
check('current pace 0.3 s/m → 5:00 /km', currentRate('run', 0.3, 'metric') === '5:00');
check('current pace 0.3 s/m → 8:02 /mi', currentRate('run', 0.3, 'imperial') === '8:02', currentRate('run', 0.3, 'imperial'));
check('current speed 0.12 s/m → 30.0 km/h', currentRate('cycle', 0.12, 'metric') === '30.0');
check('current speed 0.12 s/m → 18.6 mph', currentRate('cycle', 0.12, 'imperial') === '18.6');
check('current rate unknown → placeholders', currentRate('run', 0, 'metric') === '--:--' && currentRate('cycle', 0, 'metric') === '0.0');
// short distances
check('fmtShortDist 50 m imperial → 164 ft', fmtShortDist(50, 'imperial') === '164 ft');
check('fmtShortDist 2000 m imperial → 1.24 mi', fmtShortDist(2000, 'imperial') === '1.24 mi');
check('fmtShortDist 80 m metric → 80 m', fmtShortDist(80, 'metric') === '80 m');
check('fmtShortDist 2500 m metric → 2.50 km', fmtShortDist(2500, 'metric') === '2.50 km');
check('fmtShortDist negative → 0', fmtShortDist(-4, 'metric') === '0 m');

// ---------- GPS quality ----------
check('gps: denied → off', gpsQuality(5, true) === 'off');
check('gps: null → searching', gpsQuality(null) === 'searching');
check('gps: 6 m good · 18 m ok · 40 m weak', gpsQuality(6) === 'good' && gpsQuality(18) === 'ok' && gpsQuality(40) === 'weak');

// ---------- state machine ----------
const seq = (evs: PhaseEvent[], p: Phase = 'idle') => evs.reduce((a, e) => nextPhase(a, e), p);
check('idle → start → recording', nextPhase('idle', 'start') === 'recording');
check('recording → pause → paused → resume → recording', seq(['start', 'pause', 'resume']) === 'recording');
check('auto-pause and auto-resume', seq(['start', 'autopause']) === 'autopaused' && seq(['start', 'autopause', 'automove']) === 'recording');
check('finish → save → idle', seq(['start', 'pause', 'finish', 'save']) === 'idle');
check('finish → cancel → paused', seq(['start', 'finish', 'cancel']) === 'paused');
check('finish → discard → idle', seq(['start', 'finish', 'discard']) === 'idle');
check('invalid events are ignored (idle pause, recording start)', nextPhase('idle', 'pause') === 'idle' && nextPhase('recording', 'start') === 'recording' && nextPhase('idle', 'save') === 'idle');
check('phaseOf maps recorder status', phaseOf('idle', false, false) === 'idle' && phaseOf('recording', false, false) === 'recording' && phaseOf('recording', true, false) === 'autopaused' && phaseOf('paused', false, false) === 'paused' && phaseOf('paused', false, true) === 'finishing');
check('controls idle: Start, sport changeable, no finish', (() => { const k = controlsFor('idle'); return k.primary === 'start' && k.primaryLabel === 'Start' && k.canChangeSport && !k.showFinish; })());
check('controls recording: Pause, follows, sport locked', (() => { const k = controlsFor('recording'); return k.primary === 'pause' && k.follow && !k.canChangeSport && !k.showFinish; })());
check('controls auto-paused behaves like recording', JSON.stringify(controlsFor('autopaused')) === JSON.stringify(controlsFor('recording')));
check('controls paused: Resume + Finish', (() => { const k = controlsFor('paused'); return k.primary === 'resume' && k.showFinish && !k.side; })());
check('every phase × event lands in a valid phase', (['idle', 'recording', 'autopaused', 'paused', 'finishing'] as Phase[]).every((p) => (['start', 'pause', 'resume', 'autopause', 'automove', 'finish', 'cancel', 'save', 'discard'] as PhaseEvent[]).every((e) => ['idle', 'recording', 'autopaused', 'paused', 'finishing'].includes(nextPhase(p, e)))));
check('isGpsSport', isGpsSport('run') && isGpsSport('cycle') && !isGpsSport('indoor-cycle') && !isGpsSport('strength'));

// ---------- geometry ----------
const O: LatLng = { lat: 40.73, lng: -73.99 };
const north = (p: LatLng, m: number): LatLng => ({ lat: p.lat + m / 111195, lng: p.lng });
const east = (p: LatLng, m: number): LatLng => ({ lat: p.lat, lng: p.lng + m / (111195 * Math.cos((p.lat * Math.PI) / 180)) });
check('bearing north ≈ 0°, east ≈ 90°', near(bearing(O, north(O, 100)), 0, 0.5) && near(bearing(O, east(O, 100)), 90, 0.5));
const seg: RoutePoint[] = [0, 5, 12, 20].map((m, i) => ({ ...east(O, m), t: i * 1000 }));
check('trackHeading uses points ≥ 8 m apart (east = 90°)', near(trackHeading([seg]) ?? -1, 90, 1));
check('trackHeading null when barely moving', trackHeading([[{ ...O, t: 0 }, { ...east(O, 2), t: 1 }]]) === null);
const line = [O, north(O, 500), east(north(O, 500), 500)];
check('pathLength 1000 m (±2)', near(pathLength(line), 1000, 2), pathLength(line));
check('cumulative ends at length', near(cumulative(line)[2], 1000, 2));
const ring = circleRing(O, 100);
check('accuracy circle: 49 points, radius ≈ 100 m', ring.length === 49 && ring.every(([lng, lat]) => near(haversine(O, { lat, lng }), 100, 1.5)));
check('boundsOf', JSON.stringify(boundsOf([O, north(O, 10)])) === JSON.stringify([[O.lng, O.lat], [O.lng, north(O, 10).lat]]) && boundsOf([]) === null);
const dense = Array.from({ length: 200 }, (_, i) => north(O, i * 1));
check('simplify drops points closer than 5 m, keeps ends', (() => { const s = simplify(dense, 5); return s.length < 45 && s[0].lat === Math.round(O.lat * 1e6) / 1e6 && near(s[s.length - 1].lat, dense[199].lat, 1e-6); })());
check('simplify caps the count', simplify(Array.from({ length: 5000 }, (_, i) => north(O, i * 10)), 5, 300).length === 300);

// ---------- route following ----------
const route = makeRoute('Test loop', line, 'drawn', 'r1');
check('makeRoute measures distance', near(route.distanceM, 1000, 2) && route.name === 'Test loop' && route.id === 'r1');
check('makeRoute trims + defaults the name', makeRoute('   ', line, 'drawn').name === 'Route' && makeRoute('x'.repeat(90), line, 'drawn').name.length === 60);
const cum = cumulative(route.points);
const pr = project(route.points, cum, east(north(O, 200), 10));
check('project: 200 m along, 10 m off', !!pr && near(pr.alongM, 200, 2) && near(pr.offM, 10, 1), pr);
let f = followStep(route, north(O, 250), 0);
check('follow: 250 m along → 750 m to go, on route', near(f.alongM, 250, 2) && near(f.remainingM, 750, 3) && f.onRoute && !f.done, f);
check('follow: pct 25%', near(f.pct, 0.25, 0.01));
f = followStep(route, east(north(O, 300), 120), 250);
check(`follow: 120 m off → off route (> ${ON_ROUTE_M} m), progress kept`, !f.onRoute && near(f.offM, 120, 2) && near(f.alongM, 250, 1), f);
f = followStep(route, east(north(O, 500), 495), 900);
check('follow: at the end → done', f.done && f.remainingM < 30, f);
check('follow: GPS jitter backwards ≤ 25 m tolerated, not more', near(followStep(route, north(O, 240), 250).alongM, 240, 0.5) && near(followStep(route, north(O, 100), 250).alongM, 225, 0.5));
// out-and-back: the return leg overlaps the outbound leg; progress must keep moving forward
const ob = makeRoute('Out and back', [O, north(O, 1000), O], 'drawn', 'ob');
const outPts = Array.from({ length: 21 }, (_, i) => north(O, i * 50));
const backPts = Array.from({ length: 21 }, (_, i) => north(O, 1000 - i * 50));
const st = followTrack(ob, [[...outPts, ...backPts]]);
check('out-and-back: finishes with ~0 m to go (no jump to the far leg)', !!st && st.remainingM < 30 && st.done, st);
const half = followTrack(ob, [[...outPts, ...backPts.slice(0, 6)]]);
check('out-and-back: 250 m into the return → 750 m to go', !!half && near(half.remainingM, 750, 30), half);
const outHalf = followTrack(ob, [outPts.slice(0, 7)]);
check('out-and-back: 300 m out → 1700 m to go (not the return leg)', !!outHalf && near(outHalf.remainingM, 1700, 30), outHalf);
check('followTrack with no points → null', followTrack(ob, []) === null);
// figure-8 / crossing: at the crossing point progress stays on the current leg
const fig = makeRoute('X', [O, north(O, 400), east(north(O, 400), 200), east(north(O, 200), 200), east(north(O, 200), -100)], 'drawn', 'fig');
const cross = followStep(fig, north(O, 200), 180);
check('crossing route: stays on the current leg at the crossing', near(cross.alongM, 200, 3), cross);
check('projectAll returns one projection per segment', projectAll(fig.points, cumulative(fig.points), O).length === fig.points.length - 1);
// starting away from the route: global search finds it
f = followStep(route, east(north(O, 500), 250), 0);
check('follow: joining mid-route finds the right place (global search)', f.onRoute && near(f.alongM, 750, 3), f);

// ---------- heat ----------
check('heat: empty', buildHeat([]).features.length === 0 && buildHeat([]).activities === 0);
const A = { id: 'a', segments: [Array.from({ length: 41 }, (_, i) => north(O, i * 10))] };   // 400 m north
const B = { id: 'b', segments: [Array.from({ length: 21 }, (_, i) => north(O, i * 10))] };   // first 200 m of the same street
const Cx = { id: 'c', segments: [Array.from({ length: 21 }, (_, i) => east(O, 300 + i * 10))] }; // a different street
let h = buildHeat([A, B, Cx]);
check('heat: 3 activities, max count 2', h.activities === 3 && h.maxCount === 2, { a: h.activities, m: h.maxCount });
const twice = h.features.filter((x) => x.properties.count === 2);
const twiceLen = twice.reduce((s, x) => s + pathLength(x.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }))), 0);
check('heat: shared street (~200 m, drawn by both tracks) has count 2', twiceLen > 350 && twiceLen < 460, twiceLen);
check('heat: the rest of A and street C stay at count 1', h.features.filter((x) => x.properties.count === 1).length >= 2);
check('heat: t normalised 0..1, brightest last', h.features.every((x) => x.properties.t >= 0 && x.properties.t <= 1) && h.features[h.features.length - 1].properties.count === 2);
// the same activity going over a street twice still counts once
const loopBack = { id: 'd', segments: [[...Array.from({ length: 21 }, (_, i) => north(O, i * 10)), ...Array.from({ length: 21 }, (_, i) => north(O, 200 - i * 10))]] };
h = buildHeat([loopBack]);
check('heat: one activity repeating a street counts once', h.maxCount === 1, h.maxCount);
// lines follow the real path (not grid edges): every heat vertex is a point of (densified) input track
h = buildHeat([A]);
const offGrid = h.features.flatMap((x) => x.geometry.coordinates).every(([lng]) => near(lng, O.lng, 1e-6));
check('heat: lines follow the actual track (no grid stair-steps)', offGrid);
// gaps between segments are never bridged
const gap = { id: 'g', segments: [[O, north(O, 30)], [north(O, 2000), north(O, 2030)]] };
h = buildHeat([gap]);
const maxSpan = Math.max(...h.features.map((x) => pathLength(x.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })))));
check('heat: separate segments never bridged', maxSpan < 100, maxSpan);
check('heat: skips activities without a usable track', buildHeat([{ id: 'x', segments: [[O]] }]).activities === 0);
// performance: 60 activities × 5 km
const big = Array.from({ length: 60 }, (_, k) => ({ id: `k${k}`, segments: [Array.from({ length: 500 }, (_, i) => east(north(O, (k % 6) * 40), i * 10))] }));
const t0 = Date.now(); h = buildHeat(big); const ms = Date.now() - t0;
check(`heat: 60 × 5 km builds fast (${ms} ms)`, ms < 1500 && h.maxCount === 10, { ms, max: h.maxCount });

// ---------- route files ----------
const rte = `<?xml version="1.0"?><gpx version="1.1" creator="planner"><rte><name>River &amp; Park</name><rtept lat="40.73" lon="-73.99"/><rtept lon="-73.98" lat="40.74"></rtept><rtept lat="40.75" lon="-73.97"/></rte></gpx>`;
let pr2 = parseRouteText(rte, 'x.gpx');
check('GPX <rte> without times: 3 points, entity-decoded name', pr2.points.length === 3 && pr2.name === 'River & Park' && pr2.points[1].lng === -73.98, pr2);
const trk = `<gpx xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>Meta</name></metadata><trk><name><![CDATA[Morning <Run>]]></name><trkseg><trkpt lat='40.1' lon='-73.1'><ele>3</ele></trkpt><trkpt lat='40.2' lon='-73.2'/><trkpt lat="0" lon="0"/></trkseg></trk></gpx>`;
pr2 = parseRouteText(trk, 'run.gpx');
check('GPX <trk>: single quotes, CDATA name, drops 0,0', pr2.points.length === 2 && pr2.name === 'Morning <Run>', pr2);
const tcx = `<TrainingCenterDatabase><Courses><Course><Name>Hill loop</Name><Track><Trackpoint><Position><LatitudeDegrees>51.5</LatitudeDegrees><LongitudeDegrees>-0.12</LongitudeDegrees></Position></Trackpoint><Trackpoint><Position>\n<LatitudeDegrees>51.51</LatitudeDegrees>\n<LongitudeDegrees>-0.13</LongitudeDegrees></Position></Trackpoint></Track></Course></Courses></TrainingCenterDatabase>`;
pr2 = parseRouteText(tcx, 'hill.tcx');
check('TCX course: 2 points + name', pr2.points.length === 2 && pr2.name === 'Hill loop', pr2);
check('name falls back to the file name', parseRouteText('<gpx><trk><trkseg><trkpt lat="1" lon="1"/><trkpt lat="1.1" lon="1"/></trkseg></trk></gpx>', 'Sunday.gpx').name === 'Sunday');
let threw = ''; try { parseRouteText('<gpx><trk></trk></gpx>', 'e.gpx'); } catch (e) { threw = (e as Error).message; }
check('no points → friendly error', /No route points/.test(threw), threw);
threw = ''; try { parseRouteText('hello', 'e.txt'); } catch (e) { threw = (e as Error).message; }
check('unknown file → friendly error', /Unsupported file/.test(threw), threw);
const fixture = JSON.parse(readFileSync(new URL('./fixtures/record-map-routes.json', import.meta.url), 'utf8'));
const fixGpx = `<gpx><rte><name>Fixture</name>${fixture.routes.plan.coords.map((c: number[]) => `<rtept lat="${c[1]}" lon="${c[0]}"/>`).join('')}</rte></gpx>`;
const fixRoute = makeRoute('F', parseRouteText(fixGpx).points, 'file');
check('real street route (fixture) measured within 2% of the router distance', near(fixRoute.distanceM, fixture.routes.plan.distanceM, fixture.routes.plan.distanceM * 0.02), { got: fixRoute.distanceM, want: fixture.routes.plan.distanceM });

// ---------- styles ----------
const darkRaw = { version: 8, sources: { openmaptiles: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' } }, layers: [
  { id: 'background', type: 'background', paint: { 'background-color': '#000' } },
  { id: 'water', type: 'fill', source: 'openmaptiles', 'source-layer': 'water', paint: {} },
  { id: 'building', type: 'fill', source: 'openmaptiles', 'source-layer': 'building', paint: {} },
  { id: 'highway_path', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', paint: { 'line-color': '#111' } },
  { id: 'highway_minor', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', paint: { 'line-color': '#111' } },
  { id: 'highway_major_inner', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', paint: { 'line-color': '#111' } },
  { id: 'highway_motorway_inner', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', paint: { 'line-color': '#111' } },
  { id: 'highway_name_other', type: 'symbol', source: 'openmaptiles', 'source-layer': 'transportation_name', paint: {}, layout: {} },
  { id: 'place_city', type: 'symbol', source: 'openmaptiles', 'source-layer': 'place', paint: {}, layout: {} },
] };
const dk = transformDark(darkRaw);
const ids = dk.layers.map((l: { id: string }) => l.id);
check('dark: original not mutated', darkRaw.layers.length === 9 && darkRaw.layers[4].paint['line-color'] === '#111');
check('dark: road glow sits under the road lines', ids.indexOf('hybrd-road-glow') >= 0 && ids.indexOf('hybrd-road-glow') < ids.indexOf('highway_path'));
check('dark: roads recoloured blue/violet', dk.layers.find((l: { id: string }) => l.id === 'highway_minor').paint['line-color'] === '#4b4fc4' && dk.layers.find((l: { id: string }) => l.id === 'highway_motorway_inner').paint['line-color'] === '#9a6bff');
check('dark: 3D buildings layer added, hidden by default', (() => { const b = dk.layers.find((l: { id: string }) => l.id === BUILDINGS_3D); return b && b.type === 'fill-extrusion' && b.layout.visibility === 'none'; })());
check('dark: POI labels added before place labels', ids.indexOf('hybrd-poi') >= 0 && ids.indexOf('hybrd-poi') < ids.indexOf('place_city'));
check('dark: attribution on the OpenFreeMap source', dk.sources.openmaptiles.attribution === ATTR_OFM);
const std = transformStandard({ version: 8, sources: { openmaptiles: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' } }, layers: [{ id: 'building-3d', type: 'fill-extrusion' }, { id: 'x', type: 'fill' }] });
check('standard: liberty 3D layer replaced by the toggleable one', std.layers.some((l: { id: string }) => l.id === BUILDINGS_3D) && !std.layers.some((l: { id: string }) => l.id === 'building-3d'));
const sat = satelliteStyle();
check('satellite: EOX worldwide + USGS + street names + 3D layer', !!sat.sources.eox && !!sat.sources.usgs && sat.layers.some((l: { id: string }) => l.id === 'sat-road-names') && sat.layers.some((l: { id: string }) => l.id === BUILDINGS_3D));
check('satellite attribution names EOX (CC BY 4.0 2016 layer) + USGS', /Sentinel-2 cloudless 2016/.test(ATTR_SAT) && /EOX/.test(ATTR_SAT) && /USGS/.test(ATTR_SAT) && /s2cloudless_3857\//.test(sat.sources.eox.tiles[0]));
check('blank style has no remote sources (offline fallback)', !usesRemote(blankStyle()) && usesRemote(sat));
check('OFM attribution text: OpenFreeMap © OpenMapTiles + OpenStreetMap', /OpenFreeMap/.test(ATTR_OFM) && /OpenMapTiles/.test(ATTR_OFM) && /openstreetmap\.org\/copyright/.test(ATTR_OFM));
check('three map styles; keyless URLs', MAP_STYLES.map((m) => m.id).join() === 'dark,standard,satellite' && !/key=|token=/.test(JSON.stringify(STYLE_URL) + JSON.stringify(sat)));

// ---------- storage ----------
const mem = new Map<string, string>();
const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
check('prefs default', JSON.stringify(loadPrefs(store)) === JSON.stringify(DEFAULT_PREFS));
savePrefs({ ...DEFAULT_PREFS, style: 'satellite', threeD: true }, store);
check('prefs round-trip', loadPrefs(store).style === 'satellite' && loadPrefs(store).threeD);
mem.set('hybrd:recmap', '{"style":"bogus"}');
check('prefs: unknown style falls back to dark', loadPrefs(store).style === 'dark');
mem.set('hybrd:recmap', 'not json');
check('prefs: corrupt JSON → defaults', loadPrefs(store).style === 'dark');
const many = Array.from({ length: MAX_ROUTES + 5 }, (_, i) => ({ ...makeRoute(`R${i}`, line, 'drawn', `id${i}`), createdAt: i }));
const kept = saveRoutes(many, store);
check(`routes capped at ${MAX_ROUTES}, newest kept`, kept.length === MAX_ROUTES && kept[0].id === `id${MAX_ROUTES + 4}` && loadRoutes(store).length === MAX_ROUTES);
mem.set('hybrd:planned-routes', '[{"id":"bad","points":[]}, null]');
check('routes: invalid entries dropped', loadRoutes(store).length === 0);
saveActive(route, store);
check('active route round-trip + clear', loadActive(store)?.id === 'r1' && (saveActive(null, store), loadActive(store) === null));
check('layer badge counts heat + route + 3D', layerCount({ ...DEFAULT_PREFS, heat: true, threeD: true }, true) === 3 && layerCount({ ...DEFAULT_PREFS, showPlan: false }, true) === 0 && layerCount(DEFAULT_PREFS, false) === 0);

// ---------- wiring ----------
const rec = readFileSync(new URL('../src/pages/Record.tsx', import.meta.url), 'utf8');
const scr = readFileSync(new URL('../src/pages/RecordMapScreen.tsx', import.meta.url), 'utf8');
const mapc = readFileSync(new URL('../src/components/RecordMap.tsx', import.meta.url), 'utf8');
const vite = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
check('Record: map screen only for outdoor GPS (indoor + treadmill keep the classic screen)', /if \(!s\.indoor && s\.type !== 'indoor-cycle'\)/.test(rec) && /<RecordMapScreen/.test(rec));
check('Record: map screen reuses the same start/resume/finish + save flow', /onStart=\{begin\} onResume=\{resume\} onAskFinish=\{askFinish\}/.test(rec) && /if \(finishing\) \{/.test(rec) && /<SaveActivityForm /.test(rec)); // finish → full Save activity screen (was a sheet)
check('MapLibre is lazy-loaded (not in the Record chunk)', /lazy\(\(\) => import\('\.\.\/components\/RecordMap'\)\)/.test(scr) && /import\('maplibre-gl'\)/.test(mapc) && !/^import (?!type ).* from 'maplibre-gl';/m.test(mapc));
check('worker URL set explicitly (works under /hybrd/)', /setWorkerUrl/.test(mapc) && /maplibre-gl-worker\.mjs\?url/.test(mapc));
check('no-WebGL fallback + offline blank style', /TrackSvg/.test(mapc) && /blankStyle\(\)/.test(mapc) && /'online'/.test(mapc));
check('reduced motion respected (map + CSS)', /reducedMotion/.test(mapc) && /prefers-reduced-motion: reduce\) \{ \.rm-pulse/.test(css));
check('safe-area insets used on the map screen', /\.rm-top \{[^}]*var\(--sat\)/.test(css) && /\.rm-sheet \{[^}]*var\(--sab\)/.test(css));
check('attribution always rendered (sheet + draw bar + layers)', (scr.match(/__html: attr/g) || []).length >= 3);
check('service worker caches OpenFreeMap + satellite tiles', /tiles\\\.openfreemap\\\.org/.test(vite) && /eox/.test(vite));
check('wake lock still used by the recorder', /acquireWakeLock\(\)/.test(readFileSync(new URL('../src/lib/recorder.tsx', import.meta.url), 'utf8')));
check('controls have accessible labels', /aria-label=\{`Map layers/.test(scr) && /aria-label="3D view"/.test(scr) && /aria-label="Centre on my location and follow"/.test(scr) && /aria-label="Expand stats"/.test(scr) && /aria-label="Back"/.test(scr));
check('no Strava branding or trademark wording in the UI', !/strava|heatmap/i.test(scr.replace(/From Strava, Garmin, Komoot/, '')) && !/heatmap/i.test(css));

console.log(`\n${n - failed}/${n} passed`);
if (failed) process.exit(1);
