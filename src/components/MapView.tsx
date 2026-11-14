import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { RoutePoint } from '../lib/types';

export interface MapRoute { id: string; segments: RoutePoint[][]; highlight?: boolean }

/** Leaflet + OpenStreetMap tiles. Attribution is always visible (OSMF tile policy). */
export function MapView({ routes, height = 320, follow, live, onSelect }: { routes: MapRoute[]; height?: number | string; follow?: boolean; live?: RoutePoint | null; onSelect?: (id: string) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const dot = useRef<L.CircleMarker | null>(null);
  const fitted = useRef('');

  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current, { zoomControl: true, attributionControl: true }).setView([40.7128, -74.006], 13);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
    }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el.current);
    return () => { ro.disconnect(); m.remove(); map.current = null; };
  }, []);

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
      if (follow && live) m.setView([live.lat, live.lng], Math.max(m.getZoom(), 16));
      else m.fitBounds(L.latLngBounds(all), { padding: [24, 24], maxZoom: 17 });
      fitted.current = key;
    } else if (!all.length && live) m.setView([live.lat, live.lng], 16);
  }, [routes, follow, live, onSelect]);

  useEffect(() => {
    const m = map.current; if (!m) return;
    if (!live) { dot.current?.remove(); dot.current = null; return; }
    if (!dot.current) dot.current = L.circleMarker([live.lat, live.lng], { radius: 8, color: '#0a0a0a', weight: 3, fillColor: '#FFE600', fillOpacity: 1 }).addTo(m);
    else dot.current.setLatLng([live.lat, live.lng]);
  }, [live]);

  return <div ref={el} className="map" style={{ height }} />;
}
