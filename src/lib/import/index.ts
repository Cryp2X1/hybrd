import { sha256 } from './common';
import type { ParsedActivity } from './types';
export type { ParsedActivity } from './types';

export const ACCEPT = '.gpx,.tcx,.fit,application/gpx+xml,application/vnd.garmin.tcx+xml,application/octet-stream';
export const MAX_BYTES = 40 * 1024 * 1024;

/** Reads one file in the browser (nothing is uploaded). FIT parsing is loaded on demand. */
export async function parseFile(f: File): Promise<ParsedActivity[]> {
  if (f.size > MAX_BYTES) throw new Error('File is larger than 40 MB.');
  const buf = await f.arrayBuffer();
  const hash = await sha256(buf);
  const ext = f.name.toLowerCase().split('.').pop();
  const head = new Uint8Array(buf.slice(0, 14));
  const isFit = head.length >= 12 && String.fromCharCode(...head.slice(8, 12)) === '.FIT';
  if (ext === 'fit' || isFit) { const { parseFit } = await import('./fit'); return parseFit(buf, f.name, hash); }
  if (ext === 'gz' || ext === 'zip') throw new Error('Unzip the file first (HYBRD reads .gpx, .tcx and .fit).');
  const text = new TextDecoder().decode(buf).replace(/^\uFEFF/, '').trimStart();
  const { parseGpx, parseTcx } = await import('./xml');
  if (ext === 'gpx' || /<gpx[\s>]/i.test(text.slice(0, 2000))) return parseGpx(text, f.name, hash);
  if (ext === 'tcx' || /TrainingCenterDatabase/.test(text.slice(0, 2000))) return parseTcx(text, f.name, hash);
  throw new Error('Unsupported file type — use .gpx, .tcx or .fit.');
}
