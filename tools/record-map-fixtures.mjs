// One-off: fetches real street geometry (OSRM foot routing on routing.openstreetmap.de, OSM data) for the Record map
// screenshots and writes tools/fixtures/record-map-routes.json so tools/shoot-record-map.mjs runs without the router.
// Run: node tools/record-map-fixtures.mjs
import { writeFileSync } from 'node:fs';
const W = (lng, lat) => `${lng},${lat}`;
const SPOTS = {
  arch: W(-73.99708, 40.73116), union: W(-73.99050, 40.73590), madison: W(-73.98770, 40.74200), chelsea: W(-73.99970, 40.74530),
  hudson14: W(-74.00860, 40.74000), hudson23: W(-74.00870, 40.74880), hudsonHouston: W(-74.01150, 40.72830), bleecker: W(-74.00300, 40.73300),
  christopher: W(-74.00620, 40.73330), w4th: W(-74.00030, 40.73190), houstonBway: W(-73.99630, 40.72540), fifth14: W(-73.99395, 40.73586),
};
const ROUTES = {
  live: ['arch', 'fifth14', 'madison'],
  plan: ['arch', 'fifth14', 'madison', 'chelsea', 'hudson14', 'christopher', 'bleecker', 'arch'],
  greenway: ['hudsonHouston', 'hudson23', 'hudsonHouston'],
  fifth: ['arch', 'fifth14', 'madison', 'union', 'arch'],
  village: ['arch', 'w4th', 'christopher', 'hudson14', 'bleecker', 'arch'],
  broadway: ['union', 'houstonBway', 'arch'],
};
const out = {};
for (const [k, stops] of Object.entries(ROUTES)) {
  const url = `https://routing.openstreetmap.de/routed-foot/route/v1/driving/${stops.map((s) => SPOTS[s]).join(';')}?overview=full&geometries=geojson`;
  const j = await (await fetch(url)).json();
  if (j.code !== 'Ok') throw new Error(`${k}: ${j.code}`);
  out[k] = { distanceM: Math.round(j.routes[0].distance), coords: j.routes[0].geometry.coordinates.map(([a, b]) => [+a.toFixed(6), +b.toFixed(6)]) };
  console.log(k, out[k].distanceM, 'm', out[k].coords.length, 'pts');
  await new Promise((r) => setTimeout(r, 700));
}
writeFileSync(new URL('./fixtures/record-map-routes.json', import.meta.url), JSON.stringify({ source: 'OSRM foot routing (routing.openstreetmap.de) on OpenStreetMap data, ODbL', fetched: new Date().toISOString().slice(0, 10), routes: out }));
