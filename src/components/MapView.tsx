import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { RoutePoint } from '../lib/types';
import { useUserLocation, zoneName } from '../lib/location';
import { isIOS } from '../lib/cues';
import { useStore } from '../lib/store';
import { hasConsent } from '../lib/legal';

export interface MapRoute { id: string; segments: RoutePoint[][]; highlight?: boolean }

/**
 * Leaflet + OpenStreetMap tiles (attribution always visible, tiles only for the visible area).
 * With routes: fits them. Without: centers on the user (GPS → last known → time-zone guess), never a fixed city.
 */
export function MapView({ routes, height = 320, follow, live, onSelect, locateOnOpen }: { routes: MapRoute[]; height?: number | string; follow?: boolean; live?: RoutePoint | null; onSelect?: (id: string) => void; locateOnOpen?: boolean }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const dot = useRef<L.CircleMarker | null>(null);
  const me = useRef<L.LayerGroup | null>(null);
  const fitted = useRef('');
  const centeredOnUser = useRef(false);
  const hasPoints = routes.some((r) => r.segments.some((s) => s.length > 0));
  // Ask for location when there is nothing else to show (or the caller asks for it)
  const { profile } = useStore();
  // Auto-locating on open needs the precise-location consent; the "Locate me" button is an explicit user action.
  const loc = useUserLocation((locateOnOpen ?? (!hasPoints && !live)) && hasConsent(profile?.legal, 'location'));
  const [hint, setHint] = useState(false);

  useEffect(() => {
    if (!el.current) return;
    const start = loc.pos;
    const m = L.map(el.current, { zoomControl: true, attributionControl: true }).setView([start.lat, start.lng], loc.source === 'tz' ? 10 : 15);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
    }).addTo(m);
    const mark = () => { const c = m.getCenter(); el.current?.setAttribute('data-center', `${c.lat.toFixed(5)},${c.lng.toFixed(5)},${m.getZoom()}`); };
    m.on('moveend', mark); mark();
    layer.current = L.layerGroup().addTo(m);
    me.current = L.layerGroup().addTo(m);
    map.current = m;
    const ro = new ResizeObserver(() => { if (map.current === m) m.invalidateSize({ animate: false }); });
    ro.observe(el.current);
    return () => { ro.disconnect(); map.current = null; m.stop(); m.off(); m.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Routes: draw and fit
  useEffect(() => {
    const m = map.current, g = layer.current; if (!m || !g) return;
    g.clearLayers();
    const all: L.LatLngExpression[] = [];
    const sorted = [...routes].sort((a) => (a.highlight ? 1 : -1));
    for (const r of sorted) {
      for (const seg of r.segments) {
        if (seg.length < 2) continue;
        const ll = seg.map((p) => [p.lat, p.lng] as [number, number]);
        all.push(...ll);
        const dim = routes.length > 1 && !r.highlight;
        const line = L.polyline(ll, { color: dim ? '#8a8a8a' : '#FFE600', weight: dim ? 3 : 5, opacity: dim ? 0.6 : 1 }).addTo(g);
        if (onSelect) line.on('click', () => onSelect(r.id));
      }
      const first = r.segments.find((s) => s.length)?.[0];
      const lastSeg = [...r.segments].reverse().find((s) => s.length);
      if (first && (r.highlight || routes.length === 1)) {
        L.circleMarker([first.lat, first.lng], { radius: 6, color: '#0a0a0a', weight: 2, fillColor: '#22c55e', fillOpacity: 1 }).addTo(g);
        if (lastSeg && !live) { const l = lastSeg[lastSeg.length - 1]; L.circleMarker([l.lat, l.lng], { radius: 6, color: '#0a0a0a', weight: 2, fillColor: '#ef4444', fillOpacity: 1 }).addTo(g); }
      }
    }
    const key = routes.map((r) => r.id + (r.highlight ? '*' : '')).join(',');
    if (all.length && (fitted.current !== key || follow)) {
      if (follow && live) m.setView([live.lat, live.lng], Math.max(m.getZoom(), 16), { animate: false });
      else m.fitBounds(L.latLngBounds(all), { padding: [24, 24], maxZoom: 17, animate: false });
      fitted.current = key;
    } else if (!all.length && live) m.setView([live.lat, live.lng], 16, { animate: false });
  }, [routes, follow, live, onSelect]);

  // Live recording dot
  useEffect(() => {
    const m = map.current; if (!m) return;
    if (!live) { dot.current?.remove(); dot.current = null; return; }
    if (!dot.current) dot.current = L.circleMarker([live.lat, live.lng], { radius: 8, color: '#0a0a0a', weight: 3, fillColor: '#FFE600', fillOpacity: 1 }).addTo(m);
    else dot.current.setLatLng([live.lat, live.lng]);
  }, [live]);

  // "You are here": dot + accuracy circle; center on the user when there's nothing else to show
  useEffect(() => {
    const m = map.current, g = me.current; if (!m || !g) return;
    g.clearLayers();
    const p = loc.pos;
    if (!live && (loc.source === 'gps' || loc.source === 'last')) {
      if (p.acc && p.acc < 2000) L.circle([p.lat, p.lng], { radius: p.acc, color: '#3b82f6', weight: 1, opacity: 0.6, fillColor: '#3b82f6', fillOpacity: 0.12, interactive: false }).addTo(g);
      L.circleMarker([p.lat, p.lng], { radius: 7, color: '#ffffff', weight: 2.5, fillColor: '#3b82f6', fillOpacity: loc.source === 'gps' ? 1 : 0.45 }).bindTooltip(loc.source === 'gps' ? 'You are here' : 'Last known position').addTo(g);
    }
    if (!hasPoints && !live && loc.source === 'gps' && !centeredOnUser.current) { m.setView([p.lat, p.lng], 15, { animate: false }); centeredOnUser.current = true; }
  }, [loc.pos, loc.source, live, hasPoints]);

  const locateMe = async () => {
    setHint(true);
    const p = await loc.locate();
    const m = map.current; if (!m) return;
    const q = p || loc.pos;
    m.setView([q.lat, q.lng], p ? Math.max(m.getZoom(), 15) : loc.source === 'tz' ? 10 : 15);
  };
  const off = loc.status === 'denied' || loc.status === 'unavailable';
  const showNote = off && (!hasPoints || hint);
  return (
    <div className="map-wrap" style={{ height }}>
      <div ref={el} className="map" style={{ height: '100%' }} />
      <button className={`map-locate ${loc.status === 'locating' ? 'busy' : ''}`} aria-label="Locate me" title="Locate me" onClick={locateMe}>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></svg>
      </button>
      {showNote && <div className="map-note" role="status">
        <b>{loc.status === 'denied' ? 'Location is off.' : 'Can’t get your location.'}</b>{' '}
        {loc.source === 'last' ? 'Showing your last known position.' : `Showing a rough area from ${zoneName()}.`}{' '}
        {loc.status === 'denied' ? (isIOS() ? 'To allow: Settings › Privacy & Security › Location Services › Safari Websites (or HYBRD) › While Using.' : 'To allow: tap the lock/site icon next to the address bar › Location › Allow, then tap ◎.') : 'Head outside or turn on Location Services, then tap ◎.'}
      </div>}
    </div>
  );
}
