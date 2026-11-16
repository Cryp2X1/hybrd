// Pure helpers for Me › Profile photo & Gallery. No DOM / IndexedDB here so tools/test-gallery.ts can run them in Node.
// - resize / crop math (avatar crop, display + thumbnail sizes, canvas pixel caps)
// - JPEG EXIF reading (capture date, "has GPS?") and metadata stripping (belt-and-braces after the canvas re-encode)
// - file validation (types, size caps), tag filtering, storage accounting, a tiny store-only ZIP writer
import type { Rec } from './types';
import type { VideoContainer } from './mp4';

export type GalleryTag = 'progress' | 'training' | 'other';
export const TAGS: { v: GalleryTag; label: string }[] = [
  { v: 'progress', label: 'Progress' }, { v: 'training', label: 'Training' }, { v: 'other', label: 'Other' },
];
/** For videos: orig = the video file (original bytes), disp = poster frame (1600 px), thumb = 480 px poster. */
export type BlobKind = 'orig' | 'disp' | 'thumb';
export type MediaKind = 'photo' | 'video';
export interface GalleryItem extends Rec {
  /** Local calendar date the photo was taken, YYYY-MM-DD (from EXIF, the file date or today; editable). */
  date: string;
  dateSource: 'exif' | 'file' | 'today' | 'manual';
  tag: GalleryTag;
  caption?: string;
  /** Original (download) image: re-encoded without metadata, full resolution up to MAX_PIXELS. */
  w: number; h: number; mime: string;
  bytes: Record<BlobKind, number>;
  /** File name stem the user picked (for downloads). */
  name?: string;
  createdAt: number;
  /** Storage paths in the private `user-media` bucket once uploaded (Supabase mode only). */
  remote?: Partial<Record<BlobKind, string>>;
  /** True when the source file carried GPS/location metadata that was removed. */
  hadGps?: boolean;
  /** 'video' for gallery videos; missing = photo (every item saved before videos existed). */
  kind?: MediaKind;
  /** Video length in seconds. */
  duration?: number;
  /** Video container (mp4 / mov / webm). */
  container?: VideoContainer;
  /** Video kept on this device only (bigger than the cloud per-file limit, or the bucket refused it). Poster still syncs. */
  localOnly?: boolean;
  cloudNote?: 'too-big' | 'refused';
  /** Video has a GPS telemetry track (GoPro gpmd / Android camm) that HYBRD can't remove without re-encoding. */
  telemetry?: boolean;
  /** False when this browser couldn't decode the video when it was added (e.g. HEVC outside Safari). */
  playable?: boolean;
}
export const isVideo = (i: Pick<GalleryItem, 'kind'>) => i.kind === 'video';

// ---------- limits ----------
export const MB = 1024 * 1024;
/** Originals above this are re-encoded down to fit (with a warning). */
export const ORIG_CAP = 10 * MB;
/** Files above this are refused outright (phones produce 2–12 MB photos; 40 MB+ is usually a RAW/pano). */
export const HARD_CAP = 40 * MB;
/** iOS Safari's canvas limit is 16,777,216 px; stay under it so the re-encode works everywhere. */
export const MAX_PIXELS = 16_000_000;
export const DISP_EDGE = 1600;
export const THUMB_EDGE = 480;
export const AVATAR_PX = 512;
export const MAX_FILES = 30;

// videos: original bytes are kept (no re-encode), so caps are about device storage and upload size
/** Max size of one video (local mode). */
export const VIDEO_CAP = 200 * MB;
/** Max length of one video, seconds (5 min; a little slack for containers that round up). */
export const VIDEO_MAX_SECONDS = 300;
export const MAX_VIDEOS = 10;
/** Supabase free plan: 50 MB per file (Pro can raise it — keep in sync with the user-media bucket limit in schema.sql). */
export const CLOUD_FILE_CAP = 50 * MB;
/** Above this a multi-file download is offered as individual files instead of one in-memory ZIP. */
export const ZIP_MAX = 500 * MB;
export const VIDEO_ACCEPT = 'video/mp4,video/quicktime,video/webm,.mp4,.m4v,.mov,.webm';
const VIDEO_TYPES: Record<string, string> = { 'video/mp4': 'video/mp4', 'video/x-m4v': 'video/mp4', 'video/quicktime': 'video/quicktime', 'video/webm': 'video/webm' };
const VIDEO_EXT: Record<string, string> = { mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', qt: 'video/quicktime', webm: 'video/webm' };

export const ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif';
const OK_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

export interface FileCheck { ok: boolean; error?: string; warn?: string; heic?: boolean; kind?: MediaKind; mime?: string }
/** Validate a picked file by MIME type / extension and size. HEIC is allowed; decoding may still fail (friendly error later). */
export function checkFile(f: { name: string; type: string; size: number }): FileCheck {
  const ext = (f.name.split('.').pop() || '').toLowerCase();
  const type = (f.type || '').toLowerCase();
  const heic = /hei[cf]/.test(type) || ext === 'heic' || ext === 'heif';
  const okType = OK_TYPES.includes(type) || (!type && ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'].includes(ext)) || heic;
  if (!okType) return { ok: false, error: `${f.name}: only photos can be added (JPEG, PNG, WebP or HEIC).` };
  if (f.size <= 0) return { ok: false, error: `${f.name}: the file is empty.` };
  if (f.size > HARD_CAP) return { ok: false, error: `${f.name} is ${fmtBytes(f.size)} — the limit is ${fmtBytes(HARD_CAP)} per photo.` };
  if (f.size > ORIG_CAP) return { ok: true, heic, warn: `${f.name} is ${fmtBytes(f.size)}. HYBRD keeps a high-quality copy under ${fmtBytes(ORIG_CAP)}.` };
  return { ok: true, heic };
}
/** Photo, video or neither — by MIME type, else extension (Windows / some Android pickers send an empty type). */
export function detectKind(f: { name: string; type: string }): MediaKind | undefined {
  const ext = (f.name.split('.').pop() || '').toLowerCase();
  const type = (f.type || '').toLowerCase();
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('image/')) return 'photo';
  if (!type || type === 'application/octet-stream') { if (VIDEO_EXT[ext]) return 'video'; if (['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'].includes(ext)) return 'photo'; }
  return undefined;
}
/** Normalised video MIME type (mp4 / quicktime / webm) or undefined if unsupported. `sniffed` (from the file's first bytes) wins. */
export function videoMime(f: { name: string; type: string }, sniffed?: VideoContainer): string | undefined {
  if (sniffed) return sniffed === 'webm' ? 'video/webm' : sniffed === 'mov' ? 'video/quicktime' : 'video/mp4';
  const t = VIDEO_TYPES[(f.type || '').toLowerCase()];
  if (t) return t;
  if (!f.type || f.type === 'application/octet-stream') return VIDEO_EXT[(f.name.split('.').pop() || '').toLowerCase()];
  return undefined;
}
/** Validate a picked video by type + size (duration is checked after the metadata is read). */
export function checkVideo(f: { name: string; type: string; size: number }): FileCheck {
  const mime = videoMime(f);
  if (!mime) return { ok: false, kind: 'video', error: `${f.name}: this video type isn’t supported. Use MP4, MOV or WebM.` };
  if (f.size <= 0) return { ok: false, kind: 'video', error: `${f.name}: the file is empty.` };
  if (f.size > VIDEO_CAP) return { ok: false, kind: 'video', error: `${f.name} is ${fmtBytes(f.size)} — the limit is ${fmtBytes(VIDEO_CAP)} per video. Trim it in your phone’s Photos app first.` };
  const warn = f.size > CLOUD_FILE_CAP ? `${fmtBytes(f.size)} is over the ${fmtBytes(CLOUD_FILE_CAP)} cloud backup limit, so this video stays on this device only.` : undefined;
  return { ok: true, kind: 'video', mime, warn };
}
/** Duration cap. Unknown duration (browser can't read it) is allowed with a note. */
export function checkDuration(name: string, sec: number | undefined): { ok: boolean; error?: string } {
  if (sec === undefined || !isFinite(sec)) return { ok: true };
  if (sec > VIDEO_MAX_SECONDS + 0.5) return { ok: false, error: `${name} is ${fmtDuration(sec)} long — the limit is ${fmtDuration(VIDEO_MAX_SECONDS)} per video. Trim it in your phone’s Photos app first.` };
  return { ok: true };
}
/** Photo or video check in one call. */
export function checkMedia(f: { name: string; type: string; size: number }): FileCheck {
  const k = detectKind(f);
  if (k === 'video') return checkVideo(f);
  if (k === 'photo') return { ...checkFile(f), kind: 'photo' };
  return { ok: false, error: `${f.name}: only photos (JPEG, PNG, WebP, HEIC) and videos (MP4, MOV, WebM) can be added.` };
}
/** 42 → "0:42", 125.4 → "2:05", 3725 → "1:02:05". */
export function fmtDuration(sec: number | undefined): string {
  if (sec === undefined || !isFinite(sec) || sec < 0) return '–:––';
  const t = Math.round(sec), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

export const HEIC_ERROR = 'This browser can’t open HEIC photos. On iPhone, Safari converts them automatically; elsewhere, export the photo as JPEG (or iPhone Settings › Camera › Formats › Most Compatible).';

// ---------- resize / crop math ----------
/** Scale (w,h) to fit inside a max edge, never upscaling. */
export function fitWithin(w: number, h: number, maxEdge: number): { w: number; h: number } {
  const s = Math.min(1, maxEdge / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}
/** Scale (w,h) down so w*h ≤ maxPixels, never upscaling. */
export function fitPixels(w: number, h: number, maxPixels = MAX_PIXELS): { w: number; h: number } {
  const s = Math.min(1, Math.sqrt(maxPixels / (w * h)));
  let nw = Math.max(1, Math.floor(w * s)), nh = Math.max(1, Math.floor(h * s));
  while (nw * nh > maxPixels) { nw--; nh = Math.max(1, Math.floor(nw * h / w)); }
  return { w: nw, h: nh };
}
/** Avatar crop: the image "covers" a square stage at zoom 1. Clamp the drag offset so no empty space shows. */
export function clampOffset(imgW: number, imgH: number, stage: number, zoom: number, x: number, y: number): { x: number; y: number } {
  const s = (stage / Math.min(imgW, imgH)) * zoom;
  const mx = Math.max(0, (imgW * s - stage) / 2), my = Math.max(0, (imgH * s - stage) / 2);
  return { x: Math.max(-mx, Math.min(mx, x)), y: Math.max(-my, Math.min(my, y)) };
}
/** Source rectangle (in image pixels) under the square stage, for drawImage(src, sx, sy, sw, sh, 0, 0, out, out). */
export function cropRect(imgW: number, imgH: number, stage: number, zoom: number, offX: number, offY: number) {
  const { x, y } = clampOffset(imgW, imgH, stage, zoom, offX, offY);
  const s = (stage / Math.min(imgW, imgH)) * zoom;
  const left = (stage - imgW * s) / 2 + x, top = (stage - imgH * s) / 2 + y;
  const sw = stage / s;
  return { sx: -left / s, sy: -top / s, sw, sh: sw, scale: s };
}

// ---------- EXIF (JPEG) ----------
export interface ExifInfo { hasExif: boolean; hasGps: boolean; date?: string; orientation?: number }
function u16(b: Uint8Array, o: number, le: boolean) { return le ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1]; }
function u32(b: Uint8Array, o: number, le: boolean) { return le ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)) + b[o + 3] * 0x1000000 : b[o] * 0x1000000 + ((b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]); }
const isJpeg = (b: Uint8Array) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8;
export const isPng = (b: Uint8Array) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;

/** Read capture date / orientation and whether a GPS block exists, from a JPEG's APP1 Exif segment. */
export function readExif(b: Uint8Array): ExifInfo {
  const out: ExifInfo = { hasExif: false, hasGps: false };
  if (!isJpeg(b)) return out;
  let o = 2;
  while (o + 4 <= b.length && b[o] === 0xff) {
    const m = b[o + 1];
    if (m === 0xda || m === 0xd9) break; // start of scan / end
    const len = (b[o + 2] << 8) | b[o + 3];
    if (m === 0xe1 && b[o + 4] === 0x45 && b[o + 5] === 0x78 && b[o + 6] === 0x69 && b[o + 7] === 0x66) {
      out.hasExif = true;
      const t = o + 10; // TIFF header
      const le = b[t] === 0x49;
      const ifd = (start: number, fn: (tag: number, type: number, count: number, valOff: number) => void) => {
        if (start <= 0 || t + start + 2 > b.length) return;
        const n = u16(b, t + start, le);
        for (let i = 0; i < n; i++) { const e = t + start + 2 + i * 12; if (e + 12 > b.length) break; fn(u16(b, e, le), u16(b, e + 2, le), u32(b, e + 4, le), e + 8); }
      };
      let exifPtr = 0, gpsPtr = 0, dt0 = '';
      const str = (count: number, valOff: number) => { const p = count > 4 ? t + u32(b, valOff, le) : valOff; return String.fromCharCode(...b.subarray(p, p + count)).replace(/\0+$/, ''); };
      ifd(u32(b, t + 4, le), (tag, _ty, count, v) => {
        if (tag === 0x8769) exifPtr = u32(b, v, le);
        else if (tag === 0x8825) gpsPtr = u32(b, v, le);
        else if (tag === 0x0112) out.orientation = u16(b, v, le);
        else if (tag === 0x0132) dt0 = str(count, v);
      });
      let dto = '';
      ifd(exifPtr, (tag, _ty, count, v) => { if (tag === 0x9003) dto = str(count, v); });
      if (gpsPtr) { let n = 0; ifd(gpsPtr, (tag) => { if (tag >= 1 && tag <= 4) n++; }); out.hasGps = n > 0; }
      const d = exifDate(dto || dt0);
      if (d) out.date = d;
    }
    o += 2 + len;
  }
  return out;
}
/** "2026:03:14 07:05:00" → "2026-03-14" (rejects zeros / nonsense). */
export function exifDate(s: string): string | undefined {
  const m = /^(\d{4}):(\d{2}):(\d{2})/.exec(s || '');
  if (!m) return;
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  if (y < 1990 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/** Remove every metadata segment from a JPEG (APP1 Exif/XMP incl. GPS, APP3–APP13, APP15, comments). Keeps JFIF (APP0),
 * ICC colour profiles (APP2 "ICC_PROFILE") and Adobe (APP14, affects colour decoding). Image data is copied untouched. */
export function stripJpegMetadata(b: Uint8Array): Uint8Array {
  if (!isJpeg(b)) return b;
  const parts: Uint8Array[] = [b.subarray(0, 2)];
  let o = 2;
  while (o + 4 <= b.length) {
    if (b[o] !== 0xff) return b; // not a well-formed header — leave the file alone
    const m = b[o + 1];
    if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01) { parts.push(b.subarray(o, o + 2)); o += 2; continue; }
    if (m === 0xda) { parts.push(b.subarray(o)); break; } // scan data to the end
    const len = (b[o + 2] << 8) | b[o + 3];
    const seg = b.subarray(o, o + 2 + len);
    const isIcc = m === 0xe2 && String.fromCharCode(...b.subarray(o + 4, o + 15)) === 'ICC_PROFILE';
    const drop = m === 0xfe || (m >= 0xe1 && m <= 0xef && m !== 0xee && !isIcc);
    if (!drop) parts.push(seg);
    o += 2 + len;
  }
  return concat(parts);
}
/** Remove text / EXIF / time chunks from a PNG (eXIf, tEXt, zTXt, iTXt, tIME). */
export function stripPngMetadata(b: Uint8Array): Uint8Array {
  if (!isPng(b)) return b;
  const parts: Uint8Array[] = [b.subarray(0, 8)];
  let o = 8;
  while (o + 12 <= b.length) {
    const len = u32(b, o, false);
    const type = String.fromCharCode(b[o + 4], b[o + 5], b[o + 6], b[o + 7]);
    const end = o + 12 + len;
    if (!['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME'].includes(type)) parts.push(b.subarray(o, end));
    o = end;
    if (type === 'IEND') break;
  }
  return concat(parts);
}
/** True if the bytes still carry location-capable metadata (Exif/XMP APP1 in JPEG, eXIf/text in PNG). */
export function hasMetadata(b: Uint8Array): boolean {
  if (isJpeg(b)) { const s = stripJpegMetadata(b); return s.length !== b.length; }
  if (isPng(b)) { const s = stripPngMetadata(b); return s.length !== b.length; }
  return false;
}
export function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

// ---------- dates ----------
export const localDay = (t: number | Date = Date.now()) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
/** Best guess for when a photo was taken: EXIF date, else the file's modified date (if not "just now"), else today. */
export function pickDate(exif: string | undefined, lastModified: number | undefined, now = Date.now()): { date: string; src: GalleryItem['dateSource'] } {
  if (exif) return { date: exif, src: 'exif' };
  if (lastModified && lastModified < now - 60_000 && lastModified > Date.UTC(1990, 0, 1)) return { date: localDay(lastModified), src: 'file' };
  return { date: localDay(now), src: 'today' };
}
export function daysBetween(a: string, b: string): number { return Math.round(Math.abs(Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86_400_000); }

// ---------- list helpers ----------
export type TagFilter = GalleryTag | 'all';
export type TypeFilter = MediaKind | 'all';
/** Visible items for a tag (and media type), newest photo date first (ties: newest upload first). */
export function filterItems<T extends Pick<GalleryItem, 'tag' | 'date' | 'createdAt'> & { deleted?: boolean; kind?: MediaKind }>(items: T[], tag: TagFilter, type: TypeFilter = 'all'): T[] {
  return items.filter((i) => !i.deleted && (tag === 'all' || i.tag === tag) && (type === 'all' || (i.kind || 'photo') === type)).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt));
}
export function tagCounts(items: (Pick<GalleryItem, 'tag'> & { deleted?: boolean; kind?: MediaKind })[], type: TypeFilter = 'all'): Record<TagFilter, number> {
  const c: Record<TagFilter, number> = { all: 0, progress: 0, training: 0, other: 0 };
  for (const i of items) { if (i.deleted || (type !== 'all' && (i.kind || 'photo') !== type)) continue; c.all++; c[i.tag]++; }
  return c;
}
/** Counts per media type (for the All / Photos / Videos filter), within a tag. */
export function typeCounts(items: (Pick<GalleryItem, 'tag'> & { deleted?: boolean; kind?: MediaKind })[], tag: TagFilter = 'all'): Record<TypeFilter, number> {
  const c: Record<TypeFilter, number> = { all: 0, photo: 0, video: 0 };
  for (const i of items) { if (i.deleted || (tag !== 'all' && i.tag !== tag)) continue; c.all++; c[i.kind || 'photo']++; }
  return c;
}

// ---------- storage accounting ----------
export interface Usage { photos: number; videos: number; bytes: number; origBytes: number; videoBytes: number; avatarBytes: number }
export function usage(items: (Pick<GalleryItem, 'bytes'> & { deleted?: boolean; kind?: MediaKind })[], avatarBytes = 0): Usage {
  let bytes = 0, origBytes = 0, photos = 0, videos = 0, videoBytes = 0;
  for (const i of items) {
    if (i.deleted) continue;
    const all = (i.bytes.orig || 0) + (i.bytes.disp || 0) + (i.bytes.thumb || 0);
    if (i.kind === 'video') { videos++; videoBytes += all; } else photos++;
    origBytes += i.bytes.orig || 0; bytes += all;
  }
  return { photos, videos, bytes: bytes + avatarBytes, origBytes, videoBytes, avatarBytes };
}
export type QuotaState = 'ok' | 'near' | 'full' | 'unknown';
/** Browser storage check before saving `addBytes` more: full = wouldn't fit (keep a 5% reserve), near = ≥ 80% used after. */
export function quotaState(est: { usage?: number; quota?: number } | undefined, addBytes = 0): { state: QuotaState; free: number; pct: number } {
  if (!est?.quota) return { state: 'unknown', free: Infinity, pct: 0 };
  const used = (est.usage || 0) + addBytes, free = Math.max(0, est.quota - (est.usage || 0));
  const pct = Math.min(1, used / est.quota);
  return { state: used > est.quota * 0.95 ? 'full' : pct >= 0.8 ? 'near' : 'ok', free, pct };
}
/** Whether an item's files are backed up: thumbnail + original uploaded, or poster uploaded and the video is device-only. */
export function isBackedUp(i: Pick<GalleryItem, 'remote' | 'localOnly'>): boolean {
  return !!i.remote?.orig || (!!i.localOnly && !!i.remote?.thumb);
}
/** Cloud upload decision for a video original. */
export function cloudPlan(bytes: number, cap = CLOUD_FILE_CAP): 'upload' | 'local-only' { return bytes > cap ? 'local-only' : 'upload'; }
/** Multi-download plan: one ZIP (store-only, built in memory) while the originals total ≤ ZIP_MAX, else individual files. */
export function zipPlan(items: (Pick<GalleryItem, 'bytes'> & { kind?: MediaKind })[], max = ZIP_MAX): { mode: 'zip' | 'individual'; total: number; photoTotal: number } {
  let total = 0, photoTotal = 0;
  for (const i of items) { total += i.bytes.orig || 0; if (i.kind !== 'video') photoTotal += i.bytes.orig || 0; }
  return { mode: total > max ? 'individual' : 'zip', total, photoTotal };
}
export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < MB) return `${Math.round(n / 1024)} KB`;
  if (n < 1024 * MB) return `${(n / MB).toFixed(n < 10 * MB ? 1 : 0)} MB`;
  return `${(n / (1024 * MB)).toFixed(2)} GB`;
}

// ---------- downloads ----------
export const extFor = (mime: string) => (mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : mime === 'video/mp4' ? 'mp4' : mime === 'video/quicktime' ? 'mov' : mime === 'video/webm' ? 'webm' : 'jpg');
export function downloadName(i: Pick<GalleryItem, 'date' | 'tag' | 'mime' | 'id'>, n?: number): string {
  return `hybrd-${i.date}-${i.tag}${n ? `-${n}` : `-${i.id.slice(0, 6)}`}.${extFor(i.mime)}`;
}
/** Give duplicate names a -2, -3 … suffix (zip entries must be unique). */
export function uniqueNames(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((n) => { const c = (seen.get(n) || 0) + 1; seen.set(n, c); if (c === 1) return n; const dot = n.lastIndexOf('.'); return `${n.slice(0, dot)}-${c}${n.slice(dot)}`; });
}

// ---------- tiny ZIP writer (store / no compression — photos are already compressed) ----------
let CRC: Uint32Array | undefined;
/** Incremental CRC-32: start with 0, feed chunks (lets big videos be hashed slice by slice). */
export function crc32Update(prev: number, b: Uint8Array): number {
  if (!CRC) { CRC = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c >>> 0; } }
  let c = (prev ^ 0xffffffff) >>> 0; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
export function crc32(b: Uint8Array): number { return crc32Update(0, b); }
export function makeZip(files: { name: string; data: Uint8Array; date?: Date }[]): Uint8Array {
  const { headers, central } = zipLayout(files.map((f) => ({ name: f.name, size: f.data.length, crc: crc32(f.data), date: f.date })));
  return concat([...files.flatMap((f, i) => [headers[i], f.data]), central]);
}
/** ZIP structure without the file data: one local header per entry (file data goes right after it) + the central
 *  directory. Lets the browser assemble `new Blob([h0, file0, h1, file1, …, central])` without copying videos. */
export function zipLayout(files: { name: string; size: number; crc: number; date?: Date }[]): { headers: Uint8Array[]; central: Uint8Array } {
  const enc = new TextEncoder();
  const local: Uint8Array[] = [], central: Uint8Array[] = [];
  let off = 0;
  for (const f of files) {
    const name = enc.encode(f.name), d = f.date || new Date();
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const date = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    const crc = f.crc, size = f.size;
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
    h.setUint16(10, time, true); h.setUint16(12, date, true); h.setUint32(14, crc, true); h.setUint32(18, size, true); h.setUint32(22, size, true);
    h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
    local.push(concat([new Uint8Array(h.buffer), name]));
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
    c.setUint16(12, time, true); c.setUint16(14, date, true); c.setUint32(16, crc, true); c.setUint32(20, size, true); c.setUint32(24, size, true);
    c.setUint16(28, name.length, true); c.setUint32(42, off, true);
    central.push(new Uint8Array(c.buffer), name);
    off += 30 + name.length + size;
  }
  const cd = concat(central);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
  e.setUint32(12, cd.length, true); e.setUint32(16, off, true);
  return { headers: local, central: concat([cd, new Uint8Array(e.buffer)]) };
}

// ---------- avatar initials ----------
export function initials(name: string): string {
  const w = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!w.length) return '';
  return (w.length === 1 ? w[0].slice(0, 2) : w[0][0] + w[w.length - 1][0]).toUpperCase();
}
