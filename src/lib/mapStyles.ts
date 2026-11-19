// Map styles for the Record map (MapLibre style JSON). Pure functions — tested in tools/test-record-map.ts.
// Tiles: OpenFreeMap (free, no key, OpenStreetMap data · OpenMapTiles schema), EOX Sentinel‑2 cloudless 2016
// (CC BY 4.0, worldwide) and USGS The National Map imagery (US public domain, higher detail inside the US).
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { MapStyleId } from './recordMap';

export const OFM = 'https://tiles.openfreemap.org';
export const STYLE_URL: Record<'dark' | 'standard', string> = { dark: `${OFM}/styles/dark`, standard: `${OFM}/styles/liberty` };
export const ATTR_OFM = '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">© OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
export const ATTR_SAT = '<a href="https://s2maps.eu" target="_blank" rel="noopener">Sentinel-2 cloudless 2016</a> by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016) · Imagery: <a href="https://www.usgs.gov/programs/national-geospatial-program/national-map" target="_blank" rel="noopener">USGS The National Map</a>';
export const MAP_STYLES: { id: MapStyleId; label: string; note: string }[] = [
  { id: 'dark', label: 'Dark', note: 'Night-mode streets — best for recording' },
  { id: 'standard', label: 'Standard', note: 'Daylight map with parks, shops and 3D buildings' },
  { id: 'satellite', label: 'Satellite', note: 'Aerial imagery (sharpest in the US) with street names' },
];
/** Road colours for the dark map: blue → violet glow, brighter for bigger roads. */
export const ROAD = { path: '#3a3f8f', minor: '#4b4fc4', major: '#6d63ff', motorway: '#9a6bff', glow: '#5b5bff' };
const roadColor = ['match', ['get', 'class'], 'motorway', ROAD.motorway, ['trunk', 'primary'], ROAD.major, ['secondary', 'tertiary'], '#5f5ae8', ['path', 'track'], ROAD.path, ROAD.minor];

/** Extra dark-theme layers: road glow, POIs, 3D buildings (hidden until 3D is on). Also used to rebuild after errors. */
function darkExtras(): any[] {
  return [
    {
      id: 'hybrd-road-glow', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', minzoom: 10,
      filter: ['match', ['get', 'class'], ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service', 'path', 'track'], true, false],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': roadColor, 'line-blur': ['interpolate', ['linear'], ['zoom'], 12, 2, 17, 8], 'line-opacity': 0.38, 'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 10, 1.5, 14, 5, 17, 16, 20, 40] },
    },
  ];
}
export const BUILDINGS_3D = 'hybrd-3d-buildings';
function buildings3d(color: string, opacity = 0.85): any {
  return {
    id: BUILDINGS_3D, type: 'fill-extrusion', source: 'openmaptiles', 'source-layer': 'building', minzoom: 14,
    filter: ['!', ['has', 'hide_3d']], layout: { visibility: 'none' },
    paint: { 'fill-extrusion-color': color, 'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 8], 'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0], 'fill-extrusion-opacity': opacity },
  };
}
function poiLayer(textColor: string, halo: string): any {
  return {
    id: 'hybrd-poi', type: 'symbol', source: 'openmaptiles', 'source-layer': 'poi', minzoom: 15,
    filter: ['all', ['match', ['geometry-type'], ['Point', 'MultiPoint'], true, false], ['<', ['get', 'rank'], 25]],
    layout: {
      'icon-image': ['match', ['get', 'subclass'], ['florist', 'furniture'], ['get', 'subclass'], ['get', 'class']], 'icon-size': 0.9,
      'text-field': ['coalesce', ['get', 'name_en'], ['get', 'name']], 'text-font': ['Noto Sans Regular'], 'text-size': 11,
      'text-anchor': 'top', 'text-offset': [0, 0.7], 'text-max-width': 9, 'text-optional': true,
    },
    paint: { 'text-color': textColor, 'text-halo-color': halo, 'text-halo-width': 1.2, 'icon-opacity': 0.75 },
  };
}

/** Recolour OpenFreeMap "dark" into HYBRD's night map: glowing blue/violet streets, readable labels, POIs, 3D. */
export function transformDark(style: any): any {
  const s = JSON.parse(JSON.stringify(style));
  s.layers = s.layers || [];
  const out: any[] = [];
  for (const l of s.layers) {
    const L = { ...l, paint: { ...(l.paint || {}) }, layout: { ...(l.layout || {}) } };
    const id: string = L.id;
    if (id === 'background') L.paint['background-color'] = '#07070d';
    else if (id === 'water') L.paint['fill-color'] = '#0b1020';
    else if (id === 'building') { L.paint['fill-color'] = '#11121c'; L.paint['fill-outline-color'] = '#1d1f33'; }
    else if (/^landuse_park|^landcover_wood/.test(id)) L.paint['fill-color'] = '#0b120e';
    else if (L.type === 'line' && /^highway_(minor|path)/.test(id)) { L.paint['line-color'] = id.includes('path') ? ROAD.path : ROAD.minor; L.paint['line-opacity'] = 0.95; }
    else if (L.type === 'line' && /^highway_major_(inner|subtle)/.test(id)) L.paint['line-color'] = ROAD.major;
    else if (L.type === 'line' && /^highway_motorway_(inner|subtle)/.test(id)) L.paint['line-color'] = ROAD.motorway;
    else if (L.type === 'line' && /casing$/.test(id) && id.startsWith('highway')) L.paint['line-color'] = '#141633';
    else if (L.type === 'symbol' && /^highway_name/.test(id)) { L.paint['text-color'] = '#a9b0ff'; L.paint['text-halo-color'] = '#05050a'; L.paint['text-halo-width'] = 1.4; }
    else if (L.type === 'symbol' && /^place_|water_name/.test(id)) { L.paint['text-color'] = '#c9cbe0'; L.paint['text-halo-color'] = '#05050a'; L.paint['text-halo-width'] = 1.2; }
    if (id === 'highway_path') out.push(...darkExtras()); // glow sits under every road line
    out.push(L);
    if (id === 'building') out.push(buildings3d('#1b1d33', 0.92));
  }
  if (!out.some((l) => l.id === 'hybrd-road-glow')) out.splice(Math.max(1, out.findIndex((l) => l.type === 'line')), 0, ...darkExtras());
  if (!out.some((l) => l.id === BUILDINGS_3D)) out.push(buildings3d('#1b1d33', 0.92));
  const firstPlace = out.findIndex((l) => l.type === 'symbol' && /^place_/.test(l.id));
  out.splice(firstPlace >= 0 ? firstPlace : out.length, 0, poiLayer('#b7b9d6', '#05050a'));
  s.layers = out;
  for (const src of Object.values<any>(s.sources || {})) if (src.url?.startsWith(OFM) || src.tiles?.[0]?.startsWith(OFM)) src.attribution = ATTR_OFM;
  return s;
}
/** OpenFreeMap "liberty" already has POIs and 3D buildings: hide its own 3D layer and use ours so the toggle works the same. */
export function transformStandard(style: any): any {
  const s = JSON.parse(JSON.stringify(style));
  const out: any[] = [];
  for (const l of s.layers || []) {
    if (l.id === 'building-3d') { out.push(buildings3d('hsl(35,8%,85%)', 0.8)); continue; }
    out.push(l);
  }
  if (!out.some((l) => l.id === BUILDINGS_3D)) out.push(buildings3d('hsl(35,8%,85%)', 0.8));
  s.layers = out;
  for (const src of Object.values<any>(s.sources || {})) if (src.url?.startsWith(OFM) || src.tiles?.[0]?.startsWith(OFM)) src.attribution = ATTR_OFM;
  return s;
}
/** Satellite: EOX worldwide base + USGS (US only; returns 404 elsewhere so EOX shows through) + OFM street names. */
export function satelliteStyle(): any {
  return {
    version: 8,
    glyphs: `${OFM}/fonts/{fontstack}/{range}.pbf`,
    sprite: `${OFM}/sprites/ofm_f384/ofm`,
    sources: {
      eox: { type: 'raster', tileSize: 256, maxzoom: 15, attribution: ATTR_SAT, tiles: ['https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg'] },
      usgs: { type: 'raster', tileSize: 256, maxzoom: 16, tiles: ['https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}'] },
      openmaptiles: { type: 'vector', url: `${OFM}/planet`, attribution: ATTR_OFM },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#0b0d10' } },
      { id: 'sat-eox', type: 'raster', source: 'eox' },
      { id: 'sat-usgs', type: 'raster', source: 'usgs', minzoom: 8 },
      buildings3d('#d8d2c4', 0.75),
      {
        id: 'sat-road-names', type: 'symbol', source: 'openmaptiles', 'source-layer': 'transportation_name', minzoom: 14,
        layout: { 'symbol-placement': 'line', 'text-field': ['coalesce', ['get', 'name_en'], ['get', 'name']], 'text-font': ['Noto Sans Regular'], 'text-size': 11 },
        paint: { 'text-color': '#ffffff', 'text-halo-color': 'rgba(0,0,0,.85)', 'text-halo-width': 1.4 },
      },
      {
        id: 'sat-places', type: 'symbol', source: 'openmaptiles', 'source-layer': 'place', maxzoom: 15,
        layout: { 'text-field': ['coalesce', ['get', 'name_en'], ['get', 'name']], 'text-font': ['Noto Sans Bold'], 'text-size': 12 },
        paint: { 'text-color': '#ffffff', 'text-halo-color': 'rgba(0,0,0,.85)', 'text-halo-width': 1.5 },
      },
    ],
  };
}
/** Used when tiles can't load (offline / blocked): plain dark background with no remote sources. Track + dot still draw. */
export function blankStyle(): any {
  return { version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#0a0b10' } }] };
}
export const usesRemote = (style: any) => Object.keys(style?.sources || {}).length > 0;
