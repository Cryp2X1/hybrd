// Full-screen MapLibre map for the Record screen. Lazy-loaded (MapLibre is ~300 KB gzipped and only needed here).
// Offline-tolerant: if the style or tiles can't load we switch to a blank dark style — the live track, planned route
// and your position are local GeoJSON, so they keep drawing. Without WebGL we fall back to an SVG track view.
import { useEffect, useRef, useState } from 'react';
import type { Map as MLMap, Marker as MLMarker, GeoJSONSource } from 'maplibre-gl';
import type { RoutePoint } from '../lib/types';
import { boundsOf, circleRing, type Heat, type LatLng, type MapPrefs, type PlannedRoute } from '../lib/recordMap';
import { BUILDINGS_3D, STYLE_URL, blankStyle, satelliteStyle, transformDark, transformStandard } from '../lib/mapStyles';

export type MapStatus = 'loading' | 'ready' | 'offline' | 'nogl';
export interface Me { lat: number; lng: number; acc: number; heading: number | null }
export interface RecordMapProps {
  prefs: MapPrefs;
  track: RoutePoint[][];
  me: Me | null;
  follow: boolean;
  onUserPan: () => void;
  plan: PlannedRoute | null;
  draft: LatLng[] | null;
  onMapTap?: (p: LatLng) => void;
  heat: Heat | null;
  recenterKey: number;
  fitKey: string;
  fitTo: LatLng[] | null;
  reducedMotion: boolean;
  onStatus: (s: MapStatus) => void;
  /** Leaves room for floating UI when fitting/centering (px). */
  padding: { top: number; bottom: number; left: number; right: number };
}

type ML = typeof import('maplibre-gl');
let mlPromise: Promise<ML> | null = null;
async function loadML(): Promise<ML> {
  if (!mlPromise) mlPromise = (async () => {
    const [ml, worker] = await Promise.all([import('maplibre-gl'), import('maplibre-gl/dist/maplibre-gl-worker.mjs?url'), import('maplibre-gl/dist/maplibre-gl.css')]);
    ml.setWorkerUrl(new URL(worker.default, location.href).href);
    return ml;
  })();
  return mlPromise;
}
const styleCache = new Map<string, unknown>();
async function fetchJson(url: string, ms = 8000) {
  if (styleCache.has(url)) return styleCache.get(url);
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
  try { const r = await fetch(url, { signal: c.signal }); if (!r.ok) throw new Error(`HTTP ${r.status}`); const j = await r.json(); styleCache.set(url, j); return j; }
  finally { clearTimeout(t); }
}
async function buildStyle(id: MapPrefs['style']) {
  if (id === 'satellite') return satelliteStyle();
  const raw = await fetchJson(STYLE_URL[id]);
  return id === 'dark' ? transformDark(raw) : transformStandard(raw);
}
export function webglOk() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}

const EMPTY = { type: 'FeatureCollection', features: [] } as const;
const lineFC = (segs: LatLng[][]) => ({ type: 'FeatureCollection', features: segs.filter((s) => s.length > 1).map((s) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: s.map((p) => [p.lng, p.lat]) } })) });
const pointFC = (pts: { p: LatLng; kind: string }[]) => ({ type: 'FeatureCollection', features: pts.map(({ p, kind }) => ({ type: 'Feature', properties: { kind }, geometry: { type: 'Point', coordinates: [p.lng, p.lat] } })) });

export default function RecordMap(props: RecordMapProps) {
  const { prefs, track, me, follow, plan, draft, heat, reducedMotion, padding } = props;
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const marker = useRef<MLMarker | null>(null);
  const [nogl, setNogl] = useState(() => !webglOk());
  const [styleKey, setStyleKey] = useState(0); // bumps after every style (re)load so data effects re-run
  const P = useRef(props); P.current = props;
  const tileErr = useRef(0), tileOk = useRef(0), offline = useRef(false);
  const centered = useRef(false);

  // ---- create the map once
  useEffect(() => {
    if (nogl || !box.current) return;
    let dead = false, ro: ResizeObserver | null = null;
    P.current.onStatus('loading');
    (async () => {
      let ml: ML;
      try { ml = await loadML(); } catch { if (!dead) { setNogl(true); P.current.onStatus('nogl'); } return; }
      if (dead || !box.current) return;
      const c = P.current.me || P.current.fitTo?.[0] || null;
      let m: MLMap;
      try {
        m = new ml.Map({
          container: box.current, style: blankStyle(), center: c ? [c.lng, c.lat] : [-73.99, 40.73], zoom: c ? 16 : 11,
          attributionControl: false, maxPitch: 70, pitch: P.current.prefs.threeD ? 60 : 0, dragRotate: true, fadeDuration: P.current.reducedMotion ? 0 : 300,
        });
      } catch { setNogl(true); P.current.onStatus('nogl'); return; }
      map.current = m;
      (window as unknown as { __hybrdMap?: MLMap }).__hybrdMap = m;
      const el = document.createElement('div');
      el.className = 'rm-me'; el.setAttribute('aria-hidden', 'true');
      el.innerHTML = '<div class="rm-cone"></div><div class="rm-pulse"></div><div class="rm-dot"></div>';
      marker.current = new ml.Marker({ element: el, rotationAlignment: 'map', pitchAlignment: 'viewport' });
      m.on('style.load', () => { addOverlays(m); setStyleKey((k) => k + 1); });
      m.on('dragstart', (e) => { if ((e as { originalEvent?: unknown }).originalEvent) P.current.onUserPan(); });
      m.on('click', (e) => P.current.onMapTap?.({ lat: e.lngLat.lat, lng: e.lngLat.lng }));
      m.on('error', (e) => {
        const ev = e as unknown as { sourceId?: string; tile?: unknown };
        if (ev.sourceId && !ev.sourceId.startsWith('hybrd-')) { tileErr.current++; if (tileErr.current >= 6 && tileOk.current === 0 && !offline.current) { offline.current = true; P.current.onStatus('offline'); } }
      });
      m.on('data', (e) => { const ev = e as unknown as { dataType?: string; tile?: unknown; sourceId?: string }; if (ev.dataType === 'source' && ev.tile && !ev.sourceId?.startsWith('hybrd-')) { tileOk.current++; if (offline.current) { offline.current = false; P.current.onStatus('ready'); } } });
      m.on('webglcontextlost', () => { setNogl(true); P.current.onStatus('nogl'); });
      ro = new ResizeObserver(() => m.resize()); ro.observe(box.current);
      const mark = () => { const ctr = m.getCenter(); box.current?.setAttribute('data-center', `${ctr.lat.toFixed(5)},${ctr.lng.toFixed(5)},${m.getZoom().toFixed(1)},${m.getPitch().toFixed(0)}`); };
      m.on('moveend', mark); mark();
      await applyStyle(m, P.current.prefs.style);
    })();
    return () => { dead = true; ro?.disconnect(); marker.current?.remove(); map.current?.remove(); map.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nogl]);

  async function applyStyle(m: MLMap, id: MapPrefs['style']) {
    tileErr.current = 0; tileOk.current = 0;
    try {
      const st = await buildStyle(id);
      if (map.current !== m) return;
      m.setStyle(st, { diff: false });
      offline.current = false; P.current.onStatus('ready');
    } catch {
      if (map.current !== m) return;
      m.setStyle(blankStyle(), { diff: false });
      offline.current = true; P.current.onStatus('offline');
    }
  }
  // ---- style switching + retry when the connection returns
  const firstStyle = useRef(true);
  useEffect(() => {
    if (firstStyle.current) { firstStyle.current = false; return; }
    if (map.current) applyStyle(map.current, prefs.style);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.style]);
  useEffect(() => {
    const on = () => { if (offline.current && map.current) applyStyle(map.current, P.current.prefs.style); };
    window.addEventListener('online', on); return () => window.removeEventListener('online', on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addOverlays(m: MLMap) {
    const add = (id: string) => { if (!m.getSource(id)) m.addSource(id, { type: 'geojson', data: EMPTY as never }); };
    ['hybrd-heat', 'hybrd-plan', 'hybrd-plan-pts', 'hybrd-draft', 'hybrd-track', 'hybrd-track-pts', 'hybrd-acc'].forEach(add);
    const L = (spec: object) => { const s = spec as { id: string }; if (!m.getLayer(s.id)) m.addLayer(spec as never); };
    L({ id: 'hybrd-heat-glow', type: 'line', source: 'hybrd-heat', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#FFE600', 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 4, 16, 14], 'line-blur': 6, 'line-opacity': ['interpolate', ['linear'], ['get', 't'], 0, 0.18, 1, 0.55] } });
    L({ id: 'hybrd-heat', type: 'line', source: 'hybrd-heat', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['interpolate', ['linear'], ['get', 't'], 0, '#b38f00', 0.5, '#FFE600', 1, '#fffbe0'], 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 1.2, 16, 3.5], 'line-opacity': 0.95 } });
    L({ id: 'hybrd-acc', type: 'fill', source: 'hybrd-acc', paint: { 'fill-color': '#3b82f6', 'fill-opacity': 0.14 } });
    L({ id: 'hybrd-plan-case', type: 'line', source: 'hybrd-plan', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#05050a', 'line-width': 8, 'line-opacity': 0.8 } });
    L({ id: 'hybrd-plan', type: 'line', source: 'hybrd-plan', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 4.5, 'line-opacity': 0.92 } });
    L({ id: 'hybrd-draft', type: 'line', source: 'hybrd-draft', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 4, 'line-dasharray': [2, 1.5] } });
    L({ id: 'hybrd-track-case', type: 'line', source: 'hybrd-track', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#0a0a0a', 'line-width': 9 } });
    L({ id: 'hybrd-track', type: 'line', source: 'hybrd-track', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#FFE600', 'line-width': 5.5 } });
    L({ id: 'hybrd-pts', type: 'circle', source: 'hybrd-plan-pts', paint: { 'circle-radius': ['match', ['get', 'kind'], 'vertex', 4, 7], 'circle-color': ['match', ['get', 'kind'], 'start', '#22c55e', 'end', '#ef4444', '#ffffff'], 'circle-stroke-color': '#0a0a0a', 'circle-stroke-width': 2 } });
    L({ id: 'hybrd-track-pts', type: 'circle', source: 'hybrd-track-pts', paint: { 'circle-radius': 6, 'circle-color': '#22c55e', 'circle-stroke-color': '#0a0a0a', 'circle-stroke-width': 2 } });
    if (m.getLayer(BUILDINGS_3D)) m.setLayoutProperty(BUILDINGS_3D, 'visibility', P.current.prefs.threeD ? 'visible' : 'none');
  }
  const src = (id: string) => map.current?.getSource(id) as GeoJSONSource | undefined;

  // ---- data → sources
  useEffect(() => { src('hybrd-track')?.setData(lineFC(track) as never); const f = track.find((s) => s.length)?.[0]; src('hybrd-track-pts')?.setData(pointFC(f ? [{ p: f, kind: 'start' }] : []) as never); }, [track, styleKey]);
  useEffect(() => {
    const on = plan && prefs.showPlan;
    src('hybrd-plan')?.setData((on ? lineFC([plan.points]) : EMPTY) as never);
    const pts: { p: LatLng; kind: string }[] = [];
    if (on) { pts.push({ p: plan.points[0], kind: 'start' }, { p: plan.points[plan.points.length - 1], kind: 'end' }); }
    if (draft) draft.forEach((p, i) => pts.push({ p, kind: i === 0 ? 'start' : 'vertex' }));
    src('hybrd-plan-pts')?.setData(pointFC(pts) as never);
    src('hybrd-draft')?.setData((draft ? lineFC([draft]) : EMPTY) as never);
  }, [plan, draft, prefs.showPlan, styleKey]);
  useEffect(() => { src('hybrd-heat')?.setData((prefs.heat && heat ? heat : EMPTY) as never); }, [heat, prefs.heat, styleKey]);
  useEffect(() => {
    const m = map.current; if (!m || !marker.current) return;
    if (!me) { marker.current.remove(); src('hybrd-acc')?.setData(EMPTY as never); return; }
    marker.current.setLngLat([me.lng, me.lat]).addTo(m);
    marker.current.getElement().classList.toggle('has-heading', me.heading != null);
    if (me.heading != null) marker.current.setRotation(me.heading);
    src('hybrd-acc')?.setData({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [circleRing(me, Math.min(Math.max(me.acc, 3), 200))] } } as never);
    if (!centered.current) { centered.current = true; m.jumpTo({ center: [me.lng, me.lat], zoom: Math.max(m.getZoom(), 16) }); }
    else if (follow) {
      const opts = { center: [me.lng, me.lat] as [number, number] };
      if (reducedMotion) m.jumpTo(opts); else m.easeTo({ ...opts, duration: 600 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.lat, me?.lng, me?.acc, me?.heading, follow, styleKey]);

  // ---- keep the camera centre in the part of the map not covered by the floating UI
  const padKey = `${padding.top},${padding.bottom},${padding.left},${padding.right}`;
  useEffect(() => { map.current?.setPadding(padding); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [padKey, styleKey > 0]);

  // ---- 3D
  useEffect(() => {
    const m = map.current; if (!m) return;
    if (m.getLayer(BUILDINGS_3D)) m.setLayoutProperty(BUILDINGS_3D, 'visibility', prefs.threeD ? 'visible' : 'none');
    const pitch = prefs.threeD ? 60 : 0, zoom = prefs.threeD ? Math.max(m.getZoom(), 16.2) : m.getZoom();
    if (reducedMotion) m.jumpTo({ pitch, zoom, bearing: prefs.threeD ? m.getBearing() || -20 : 0 }); else m.easeTo({ pitch, zoom, bearing: prefs.threeD ? m.getBearing() || -20 : 0, duration: 700 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.threeD, styleKey > 0]);

  // ---- recenter + fit
  useEffect(() => {
    const m = map.current; if (!m || !props.recenterKey || !me) return;
    const o = { center: [me.lng, me.lat] as [number, number], zoom: Math.max(m.getZoom(), 16) };
    if (reducedMotion) m.jumpTo(o); else m.easeTo({ ...o, duration: 500 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.recenterKey]);
  useEffect(() => {
    const m = map.current; if (!m || !props.fitKey || !props.fitTo?.length) return;
    const b = boundsOf(props.fitTo); if (!b) return;
    // the map's own padding already keeps the floating UI clear; this is just a margin around the route
    m.fitBounds(b, { padding: 28, maxZoom: 16.5, duration: reducedMotion ? 0 : 700 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.fitKey, styleKey > 0]);

  if (nogl) return <TrackSvg {...props} />;
  return <div ref={box} className="rm-canvas" data-testid="record-map" role="application" aria-label="Map. Your position and route are shown on the map; use the buttons to re-centre, change layers or toggle 3D." />;
}

/** No-WebGL fallback: the track, route and position drawn as SVG on a dark grid (north up, auto-fit). */
function TrackSvg({ track, me, plan, draft, heat, prefs }: RecordMapProps) {
  const pts: LatLng[] = [...track.flat(), ...(plan && prefs.showPlan ? plan.points : []), ...(draft || []), ...(me ? [me] : [])];
  const b = boundsOf(pts);
  const W = 1000, H = 1000;
  let proj = (p: LatLng) => [W / 2, H / 2] as [number, number];
  if (b) {
    const lat0 = (b[0][1] + b[1][1]) / 2, k = Math.cos((lat0 * Math.PI) / 180);
    const spanX = Math.max((b[1][0] - b[0][0]) * k, 0.004), spanY = Math.max(b[1][1] - b[0][1], 0.004);
    const s = Math.min(W / spanX, H / spanY) * 0.7, cx = (b[0][0] + b[1][0]) / 2, cy = (b[0][1] + b[1][1]) / 2;
    proj = (p) => [W / 2 + (p.lng - cx) * k * s, H / 2 - (p.lat - cy) * s];
  }
  const path = (seg: LatLng[]) => seg.map((p, i) => `${i ? 'L' : 'M'}${proj(p).map((v) => v.toFixed(1)).join(' ')}`).join('');
  return (
    <svg className="rm-canvas rm-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" data-testid="record-map-fallback" role="img" aria-label="Simplified track view (map unavailable on this device)">
      <defs><pattern id="rmgrid" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M50 0H0V50" fill="none" stroke="#1a1c2a" strokeWidth="1" /></pattern></defs>
      <rect width={W} height={H} fill="#0a0b10" /><rect width={W} height={H} fill="url(#rmgrid)" />
      {prefs.heat && heat?.features.map((f, i) => { const [a, c] = f.geometry.coordinates; const A = proj({ lng: a[0], lat: a[1] }), C = proj({ lng: c[0], lat: c[1] }); return <line key={i} x1={A[0]} y1={A[1]} x2={C[0]} y2={C[1]} stroke="#FFE600" strokeOpacity={0.25 + 0.6 * f.properties.t} strokeWidth={3} strokeLinecap="round" />; })}
      {plan && prefs.showPlan && <path d={path(plan.points)} fill="none" stroke="#fff" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />}
      {draft && <path d={path(draft)} fill="none" stroke="#fff" strokeWidth={5} strokeDasharray="12 9" />}
      {track.map((s, i) => <path key={i} d={path(s)} fill="none" stroke="#FFE600" strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" />)}
      {me && (() => { const [x, y] = proj(me); return <g><circle cx={x} cy={y} r={22} fill="#3b82f6" opacity={0.2} /><circle cx={x} cy={y} r={11} fill="#3b82f6" stroke="#fff" strokeWidth={4} /></g>; })()}
    </svg>
  );
}
