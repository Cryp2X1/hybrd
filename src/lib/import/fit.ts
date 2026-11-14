// FIT files (Garmin, Coros, Wahoo, Suunto, Polar, Zwift, Apple-Health exporters…) via fit-file-parser (MIT,
// github.com/jimmykane/fit-parser). Positions come back in degrees, distances/altitude in metres.
import FitParser, { getFitGarminProductDisplayName } from 'fit-file-parser';
import { buildFromPoints, finish, type Pt } from './common';
import type { ParsedActivity } from './types';
import type { Lap } from '../types';

type M = Record<string, unknown>;
const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const tms = (v: unknown) => (v instanceof Date ? v.getTime() : typeof v === 'string' ? Date.parse(v) : undefined);
const opts = { speedUnit: 'm/s', lengthUnit: 'm', mode: 'list' as const };

export async function parseFit(buf: ArrayBuffer, fileName: string, hash: string): Promise<ParsedActivity[]> {
  const warnings: string[] = [];
  let d: M;
  try { d = await new FitParser({ ...opts, force: false }).parseAsync(buf) as unknown as M; }
  catch (strictErr) {
    // CRC mismatch / cut-short file: read what we can and say so
    try { d = await new FitParser({ ...opts, force: true }).parseAsync(buf) as unknown as M; }
    catch (e) { throw new Error(`Couldn’t read this FIT file (${String((e as Error)?.message || e || strictErr)}).`); }
    warnings.push('The file’s checksum doesn’t match (it may be cut short); HYBRD read what it could.');
  }
  const fileId = (((d.file_ids as M[]) || [])[0] || {}) as M;
  if (fileId.type && fileId.type !== 'activity') throw new Error(`This FIT file is a “${String(fileId.type).replace(/_/g, ' ')}” file, not a recorded activity.`);
  const recs = (d.records || []) as M[];
  if (!recs.length && !((d.sessions as M[]) || []).length) throw new Error('No activity data in this FIT file.');
  const sessions = ((d.sessions as M[]) || []).length ? (d.sessions as M[]) : [{} as M];
  const laps = (d.laps || []) as M[];
  const manu = typeof fileId.manufacturer === 'string' ? fileId.manufacturer : undefined;
  const prod = (fileId.product_name as string) || (fileId.garmin_product != null ? getFitGarminProductDisplayName(fileId.garmin_product as string) : null) || undefined;
  const device = [manu && manu[0].toUpperCase() + manu.slice(1), prod].filter(Boolean).join(' ').replace(/_/g, ' ') || undefined;

  return sessions.map((s, i) => {
    const st = tms(s.start_time), dur = n(s.total_elapsed_time);
    const inS = (t?: number) => t != null && (st == null || (t >= st - 1000 && (dur == null || t <= st + dur * 1000 + 1000)));
    const pts: Pt[] = recs.filter((r) => sessions.length === 1 || inS(tms(r.timestamp))).map((r) => ({
      t: tms(r.timestamp), lat: n(r.position_lat), lng: n(r.position_long),
      alt: n(r.enhanced_altitude) ?? n(r.altitude) ?? null,
      hr: n(r.heart_rate), cad: n(r.cadence) != null ? (r.cadence as number) + (n(r.fractional_cadence) || 0) : undefined, dist: n(r.distance),
    }));
    const sport = [s.sport, s.sub_sport].filter((x) => typeof x === 'string' && x !== 'generic').join(' ');
    const running = /running|walking|hiking/.test(String(s.sport));
    const b = buildFromPoints(pts, { cadenceDouble: running }); // FIT running cadence is strides/min (one foot)
    const lapsHere = laps.filter((l) => sessions.length === 1 || inS(tms(l.start_time))).map((l): Lap => ({
      sec: Math.round(n(l.total_timer_time) ?? n(l.total_elapsed_time) ?? 0), distanceM: n(l.total_distance), avgHr: n(l.avg_heart_rate), maxHr: n(l.max_heart_rate),
    }));
    const avgCad = n(s.avg_running_cadence) ?? n(s.avg_cadence);
    const hr = b.hr || (n(s.avg_heart_rate) ? { avg: s.avg_heart_rate as number, max: (n(s.max_heart_rate) ?? s.avg_heart_rate) as number, samples: [] } : undefined);
    const recsHere = recs.filter((r) => sessions.length === 1 || inS(tms(r.timestamp)));
    const recW = recsHere.map((r) => n(r.power) ?? n(r.enhanced_power)).filter((v): v is number => v != null && v > 0);
    const avgW = n(s.avg_power) ?? (recW.length ? recW.reduce((a, b) => a + b, 0) / recW.length : undefined);
    const maxW = n(s.max_power) ?? (recW.length ? Math.max(...recW) : undefined);
    return finish({
      fileName, format: 'FIT', hash: sessions.length > 1 ? `${hash}:${i}` : hash, sportRaw: sport || undefined,
      start: st ?? b.start, durationSec: Math.round(n(s.total_timer_time) ?? (b.movingSec || b.elapsedSec)), elapsedSec: Math.round(dur ?? b.elapsedSec),
      distanceM: n(s.total_distance) ?? b.distanceM, elevGainM: n(s.total_ascent) ?? b.elevGainM, segments: b.segments, hr,
      cadence: avgCad != null ? Math.round(running ? (avgCad + (n(s.avg_fractional_cadence) || 0)) * 2 : avgCad) : b.cadence,
      avgWatts: avgW != null ? Math.round(avgW) : undefined, maxWatts: maxW != null ? Math.round(maxW) : undefined,
      laps: lapsHere.length > 1 ? lapsHere : undefined, kcal: n(s.total_calories), device, warnings: [...warnings],
    });
  });
}
