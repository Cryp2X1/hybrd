// GPX 1.0/1.1 (with Garmin TrackPointExtension hr/cad) and Garmin TCX v2 parsers — namespace-agnostic.
import { buildFromPoints, finish, type Pt } from './common';
import type { ParsedActivity } from './types';
import type { Lap } from '../types';

const kids = (el: Element | Document, name: string) => Array.from(el.getElementsByTagNameNS('*', name));
const first = (el: Element | Document, name: string) => el.getElementsByTagNameNS('*', name)[0];
const num = (el: Element | undefined | null) => { if (!el?.textContent) return undefined; const v = parseFloat(el.textContent); return Number.isFinite(v) ? v : undefined; };
const time = (el: Element | undefined | null) => { const v = el?.textContent ? Date.parse(el.textContent.trim()) : NaN; return Number.isFinite(v) ? v : undefined; };

function parseXml(text: string) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('The file isn’t valid XML.');
  return doc;
}

export function parseGpx(text: string, fileName: string, hash: string): ParsedActivity[] {
  const doc = parseXml(text);
  if (!kids(doc, 'gpx').length) throw new Error('Not a GPX file.');
  const creator = doc.documentElement.getAttribute('creator') || undefined;
  const trks = kids(doc, 'trk');
  if (!trks.length) throw new Error(kids(doc, 'rte').length ? 'This GPX has a planned route but no recorded track (no times).' : 'No track in this GPX file.');
  return trks.map((trk, i) => {
    const pts: Pt[] = kids(trk, 'trkpt').map((p) => ({
      lat: parseFloat(p.getAttribute('lat') || ''), lng: parseFloat(p.getAttribute('lon') || ''),
      alt: num(first(p, 'ele')) ?? null, t: time(first(p, 'time')),
      hr: num(first(p, 'hr')) ?? num(first(p, 'heartrate')), cad: num(first(p, 'cad')),
    }));
    const warnings: string[] = [];
    if (!pts.some((p) => p.t)) throw new Error('This GPX track has no timestamps, so it can’t become a workout (it’s a route, not a recording).');
    const b = buildFromPoints(pts, { cadenceDouble: true });
    const typeEl = first(trk, 'type');
    return finish({
      fileName, format: 'GPX', hash: trks.length > 1 ? `${hash}:${i}` : hash, name: first(trk, 'name')?.textContent?.trim() || undefined,
      sportRaw: typeEl?.textContent?.trim(), start: b.start, durationSec: Math.round(b.movingSec || b.elapsedSec), elapsedSec: Math.round(b.elapsedSec),
      distanceM: b.distanceM, elevGainM: b.elevGainM, segments: b.segments, hr: b.hr, cadence: b.cadence, device: creator, warnings,
    });
  });
}

export function parseTcx(text: string, fileName: string, hash: string): ParsedActivity[] {
  const doc = parseXml(text);
  const acts = kids(doc, 'Activity');
  if (!acts.length) throw new Error(kids(doc, 'Course').length ? 'This TCX is a course (a planned route), not a recorded activity.' : 'No activity in this TCX file.');
  return acts.map((a, i) => {
    const laps: Lap[] = []; let timer = 0, dist = 0, kcal = 0;
    const pts: Pt[] = [];
    for (const lap of kids(a, 'Lap')) {
      const sec = num(first(lap, 'TotalTimeSeconds')) || 0, dm = num(first(lap, 'DistanceMeters'));
      timer += sec; dist += dm || 0; kcal += num(first(lap, 'Calories')) || 0;
      const avg = first(lap, 'AverageHeartRateBpm'), mx = first(lap, 'MaximumHeartRateBpm');
      laps.push({ sec: Math.round(sec), distanceM: dm, avgHr: avg ? num(first(avg, 'Value')) : undefined, maxHr: mx ? num(first(mx, 'Value')) : undefined });
      for (const tp of kids(lap, 'Trackpoint')) {
        const pos = first(tp, 'Position'), hr = first(tp, 'HeartRateBpm');
        pts.push({ t: time(first(tp, 'Time')), lat: pos ? num(first(pos, 'LatitudeDegrees')) : undefined, lng: pos ? num(first(pos, 'LongitudeDegrees')) : undefined,
          alt: num(first(tp, 'AltitudeMeters')) ?? null, dist: num(tp.getElementsByTagNameNS('*', 'DistanceMeters')[0]), hr: hr ? num(first(hr, 'Value')) : undefined,
          cad: num(first(tp, 'RunCadence')) ?? num(first(tp, 'Cadence')) });
      }
    }
    const sport = a.getAttribute('Sport') || undefined;
    const b = buildFromPoints(pts, { cadenceDouble: !!first(a, 'RunCadence') || /run/i.test(sport || '') });
    const creator = first(a, 'Creator');
    const dev = creator ? [first(creator, 'Name')?.textContent?.trim()].filter(Boolean).join(' ') : undefined;
    const start = b.start || time(first(a, 'Id')) || Date.parse(kids(a, 'Lap')[0]?.getAttribute('StartTime') || '');
    return finish({
      fileName, format: 'TCX', hash: acts.length > 1 ? `${hash}:${i}` : hash, name: first(a, 'Notes')?.textContent?.trim() || undefined,
      sportRaw: sport === 'Other' ? undefined : sport, start, durationSec: Math.round(timer || b.movingSec || b.elapsedSec), elapsedSec: Math.round(b.elapsedSec || timer),
      distanceM: dist || b.distanceM, elevGainM: b.elevGainM, segments: b.segments, hr: b.hr, cadence: b.cadence,
      laps: laps.length > 1 ? laps : undefined, kcal: kcal || undefined, device: dev, warnings: [],
    });
  });
}
