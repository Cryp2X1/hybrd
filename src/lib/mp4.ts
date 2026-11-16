// Pure MP4 / QuickTime (ISO BMFF) helpers for Gallery videos. No DOM, so tools/test-gallery.ts runs them in Node.
// - box walking (32-bit, 64-bit "largesize" and "to end of file" sizes)
// - container sniffing (MP4 / MOV / WebM) from the first bytes
// - duration + display size from moov/mvhd + tkhd (rotation aware), used when the browser can't decode the codec
// - location removal: blanks every location record phones write into the moov box, IN PLACE and without changing any box
//   size, so sample offsets (stco/co64) stay valid and the audio/video data is untouched (no re-encode):
//     udta/©xyz (QuickTime / Android), udta/loci (3GPP), meta/keys+ilst "com.apple.quicktime.location.*" (iPhone),
//     ilst/©xyz (iTunes style) and XMP packets (XMP_ / uuid BE7ACFCB…) that mention GPS.
//   Blanked boxes are renamed to `free` (a standard "ignore me" box) and their payload is zeroed.
//   Not removable without a remux: GPS *telemetry tracks* (GoPro `gpmd`, Android `camm`) — detected and reported instead.

export interface Box { type: string; start: number; size: number; header: number; end: number }

const td = new TextDecoder('latin1');
export const fourcc = (b: Uint8Array, o: number) => td.decode(b.subarray(o, o + 4));
const be32 = (b: Uint8Array, o: number) => b[o] * 0x1000000 + ((b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]);
const be64 = (b: Uint8Array, o: number) => be32(b, o) * 0x100000000 + be32(b, o + 4);
const s32 = (b: Uint8Array, o: number) => (be32(b, o) | 0);

/** Read one box header at `o` inside [o, limit). Returns undefined if it doesn't fit or is malformed. */
export function readBox(b: Uint8Array, o: number, limit = b.length): Box | undefined {
  if (o + 8 > limit) return;
  let size = be32(b, o), header = 8;
  const type = fourcc(b, o + 4);
  if (size === 1) { if (o + 16 > limit) return; size = be64(b, o + 8); header = 16; }
  else if (size === 0) size = limit - o;
  if (size < header || o + size > limit) return;
  return { type, start: o, size, header, end: o + size };
}
/** Child boxes of [start, end). Stops at the first malformed header. */
export function children(b: Uint8Array, start: number, end: number): Box[] {
  const out: Box[] = [];
  for (let o = start; o + 8 <= end;) { const x = readBox(b, o, end); if (!x) break; out.push(x); o = x.end; }
  return out;
}
/** Header of a top-level box from the first 16 bytes at `pos` of a file of `fileSize` bytes (for Blob.slice walking). */
export function readTopHeader(head: Uint8Array, pos: number, fileSize: number): Box | undefined {
  if (head.length < 8) return;
  let size = be32(head, 0), header = 8;
  if (size === 1) { if (head.length < 16) return; size = be64(head, 8); header = 16; }
  else if (size === 0) size = fileSize - pos;
  if (size < header || pos + size > fileSize) return;
  return { type: fourcc(head, 4), start: pos, size, header, end: pos + size };
}

// `meta` is a full box in ISO files (4 bytes version/flags before children) but a plain container in QuickTime files.
function metaOffset(b: Uint8Array, m: Box): number {
  const plain = m.start + m.header;
  const k = readBox(b, plain, m.end);
  return k && ['hdlr', 'keys', 'ilst', 'iinf', 'pitm', 'free', 'xml '].includes(k.type) ? plain : plain + 4;
}
const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'udta', 'edts', 'dinf', 'ilst', 'meta']);
function kids(b: Uint8Array, x: Box): Box[] {
  if (x.type === 'meta') return children(b, metaOffset(b, x), x.end);
  return children(b, x.start + x.header, x.end);
}

// ---------- sniffing ----------
export type VideoContainer = 'mp4' | 'mov' | 'webm';
/** Container from the first ≥ 12 bytes: `ftyp` brand (qt = MOV) or the EBML magic (WebM / Matroska). */
export function sniffContainer(head: Uint8Array): VideoContainer | undefined {
  if (head.length >= 4 && head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return 'webm';
  if (head.length >= 12) {
    const t = fourcc(head, 4);
    if (t === 'ftyp') return fourcc(head, 8) === 'qt  ' ? 'mov' : 'mp4';
    if (['moov', 'mdat', 'wide', 'free', 'skip'].includes(t)) return 'mov'; // old QuickTime files without ftyp
  }
  return undefined;
}

// ---------- duration / size ----------
export interface MoovInfo { /** Recording time (ms since epoch, UTC) from mvhd, when plausible. */ created?: number; duration?: number; w?: number; h?: number; rotation?: number; telemetry?: string[] }
/** Parse a moov box (bytes of the whole box): duration (s) from mvhd, display size + rotation from the video track's tkhd,
 *  and any GPS telemetry track types (gpmd / camm). */
export function parseMoov(moov: Uint8Array): MoovInfo {
  const root = readBox(moov, 0); const out: MoovInfo = {};
  if (!root || root.type !== 'moov') return out;
  const telemetry: string[] = [];
  for (const x of kids(moov, root)) {
    if (x.type === 'mvhd') {
      const p = x.start + x.header, v = moov[p];
      const ts = v === 1 ? be32(moov, p + 20) : be32(moov, p + 12);
      const du = v === 1 ? be64(moov, p + 24) : be32(moov, p + 16);
      if (ts > 0 && du > 0 && du !== 0xffffffff) out.duration = Math.round((du / ts) * 1000) / 1000;
      const ct = v === 1 ? be64(moov, p + 4) : be32(moov, p + 4); // seconds since 1904-01-01 UTC
      const ms = (ct - 2082844800) * 1000;
      if (ct && ms > Date.UTC(1990, 0, 1) && ms < Date.now() + 86_400_000) out.created = ms;
    } else if (x.type === 'trak') {
      let tkhd: Box | undefined, handler = '';
      const walk = (bx: Box) => { for (const c of kids(moov, bx)) {
        if (c.type === 'tkhd') tkhd = c;
        else if (c.type === 'hdlr' && !handler) handler = fourcc(moov, c.start + c.header + 8);
        else if (c.type === 'stsd') { const e = readBox(moov, c.start + c.header + 8, c.end); if (e && ['gpmd', 'camm'].includes(e.type)) telemetry.push(e.type); }
        else if (CONTAINERS.has(c.type) && c.type !== 'udta') walk(c);
      } };
      walk(x);
      if (handler === 'vide' && tkhd && out.w === undefined) {
        const p = tkhd.start + tkhd.header, v = moov[p];
        const mx = p + (v === 1 ? 52 : 40);
        const a = s32(moov, mx) / 65536, bb = s32(moov, mx + 4) / 65536;
        const w = Math.round(be32(moov, mx + 36) / 65536), h = Math.round(be32(moov, mx + 40) / 65536);
        const rot = ((Math.round(Math.atan2(bb, a) * 180 / Math.PI) % 360) + 360) % 360;
        out.rotation = rot;
        if (w && h) { if (rot === 90 || rot === 270) { out.w = h; out.h = w; } else { out.w = w; out.h = h; } }
      }
    }
  }
  if (telemetry.length) out.telemetry = telemetry;
  return out;
}

// ---------- location removal ----------
export interface StripResult { found: string[]; telemetry: string[] }
const XMP_UUID = [0xbe, 0x7a, 0xcf, 0xcb, 0x97, 0xa9, 0x42, 0xe8, 0x9c, 0x71, 0x99, 0x94, 0x91, 0xe3, 0xaf, 0xac];
const isLocKey = (k: string) => /location|gps|iso6709/i.test(k);
function blank(b: Uint8Array, x: Box) {
  b.fill(0, x.start + x.header, x.end);
  b[x.start + 4] = 0x66; b[x.start + 5] = 0x72; b[x.start + 6] = 0x65; b[x.start + 7] = 0x65; // 'free'
}
function hasGpsText(b: Uint8Array, s: number, e: number) { return /GPS|exif:GPS|Location|ISO6709/i.test(td.decode(b.subarray(s, Math.min(e, s + 4 * 1024 * 1024)))); }

/** Blank location metadata in a top-level box (normally `moov`; also top-level `udta` / XMP `uuid`). Mutates `box` in
 *  place, never changes its length, and returns what was found. Call on a copy if you need the original. */
export function stripLocationInBox(box: Uint8Array): StripResult {
  const res: StripResult = { found: [], telemetry: [] };
  const root = readBox(box, 0); if (!root) return res;
  const visit = (x: Box) => {
    const t = x.type;
    if (t === '\xa9xyz' || t === '©xyz') { blank(box, x); res.found.push('©xyz'); return; }
    if (t === 'loci') { blank(box, x); res.found.push('loci'); return; }
    if (t === 'XMP_' && hasGpsText(box, x.start + x.header, x.end)) { blank(box, x); res.found.push('xmp'); return; }
    if (t === 'uuid' && XMP_UUID.every((v, i) => box[x.start + x.header + i] === v) && hasGpsText(box, x.start + x.header + 16, x.end)) { blank(box, x); res.found.push('xmp'); return; }
    if (t === 'stsd') { const e = readBox(box, x.start + x.header + 8, x.end); if (e && ['gpmd', 'camm'].includes(e.type)) res.telemetry.push(e.type); return; }
    if (t === 'meta') {
      const cs = kids(box, x);
      const keys = cs.find((c) => c.type === 'keys'), ilst = cs.find((c) => c.type === 'ilst');
      if (keys && ilst) {
        // keys: [ver/flags 4][count 4] then entries [size 4][namespace 4][name…]; ilst children are typed by 1-based key index
        const loc = new Set<number>();
        let o = keys.start + keys.header + 8, idx = 1;
        const n = be32(box, keys.start + keys.header + 4);
        for (let i = 0; i < n && o + 8 <= keys.end; i++, idx++) {
          const sz = be32(box, o); if (sz < 8 || o + sz > keys.end) break;
          const name = td.decode(box.subarray(o + 8, o + sz));
          if (isLocKey(name)) { loc.add(idx); box.fill(0x78, o + 8, o + sz); } // 'xxxx…' — the key no longer names a location
          o += sz;
        }
        for (const it of children(box, ilst.start + ilst.header, ilst.end)) {
          if (loc.has(be32(box, it.start + 4))) {
            for (const d of children(box, it.start + it.header, it.end)) if (d.type === 'data') box.fill(0, d.start + d.header + 8, d.end);
            res.found.push('keys:location');
          }
        }
      }
      for (const c of cs) if (c.type !== 'keys') visit(c);
      return;
    }
    if (CONTAINERS.has(t) || t === 'moov') for (const c of kids(box, x)) visit(c);
  };
  if (root.type === 'uuid' || root.type === 'XMP_') visit(root);
  else for (const c of kids(box, root)) visit(c);
  return res;
}
/** Top-level box types worth loading and cleaning (everything except media data / padding). */
export const CLEAN_TOP = new Set(['moov', 'udta', 'uuid', 'meta']);
/** Max size of a top-level metadata box we load into memory to clean (moov of a 5-min phone video is ~1–4 MB). */
export const MAX_META_BOX = 64 * 1024 * 1024;

/** Whole-file convenience (tests / small files): returns a cleaned copy plus what was found. */
export function stripVideoLocation(file: Uint8Array): { out: Uint8Array; found: string[]; telemetry: string[]; info: MoovInfo } {
  const out = file.slice(); const found: string[] = [], telemetry: string[] = []; let info: MoovInfo = {};
  if (sniffContainer(file) === 'webm') return { out, found, telemetry, info };
  for (const x of children(out, 0, out.length)) {
    if (!CLEAN_TOP.has(x.type) || x.size > MAX_META_BOX) continue;
    const view = out.subarray(x.start, x.end);
    if (x.type === 'moov') info = parseMoov(view);
    const r = stripLocationInBox(view); found.push(...r.found); telemetry.push(...r.telemetry);
  }
  return { out, found, telemetry, info };
}
/** True if the bytes still carry a location record we know how to find (used by tests and as a post-check). */
export function hasVideoLocation(file: Uint8Array): boolean {
  return stripVideoLocation(file).found.length > 0;
}
