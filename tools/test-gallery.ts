// Unit checks for Me › Profile photo & Gallery: resize / crop math, EXIF reading + stripping (GPS), file type + size caps,
// date picking, tag filtering + counts, storage accounting, download names, ZIP writer (verified with Python's zipfile),
// schema / entitlements wiring. Gallery videos: type detection + sniffing, caps, duration / size / date parsing from moov,
// MP4/MOV location stripping (synthetic boxes + real ffmpeg files checked with ffprobe), ZIP size guard + streamed ZIP
// layout, type filters, cloud plan, quota states.
// Run: node --experimental-strip-types --import ./tools/ts-resolve.mjs tools/test-gallery.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import {
  fitWithin, fitPixels, clampOffset, cropRect, readExif, exifDate, stripJpegMetadata, stripPngMetadata, hasMetadata, checkFile, pickDate, localDay,
  filterItems, tagCounts, usage, fmtBytes, downloadName, uniqueNames, crc32, makeZip, initials, daysBetween,
  MAX_PIXELS, ORIG_CAP, HARD_CAP, MB, HEIC_ERROR, type GalleryItem,
  detectKind, videoMime, checkVideo, checkDuration, checkMedia, fmtDuration, typeCounts, quotaState, isBackedUp, cloudPlan, zipPlan, zipLayout, crc32Update, extFor, isVideo,
  VIDEO_CAP, VIDEO_MAX_SECONDS, CLOUD_FILE_CAP, ZIP_MAX, MAX_VIDEOS,
} from '../src/lib/media.ts';
import { sniffContainer, parseMoov, stripVideoLocation, stripLocationInBox, hasVideoLocation, readBox, readTopHeader, children } from '../src/lib/mp4.ts';
import { FEATURES, can } from '../src/lib/entitlements.ts';
// @ts-expect-error plain JS fixture
import { buildExifApp1, withExif, tinyJpeg } from './exif-fixture.mjs';

let failed = 0;
const check = (name: string, cond: boolean, detail?: unknown) => { if (!cond) { failed++; console.error('FAIL', name, detail ?? ''); } else console.log('ok', name); };
const approx = (a: number, b: number, e = 1e-6) => Math.abs(a - b) <= e;

// ---------- resize math ----------
check('fitWithin 4032×3024 → 1600×1200', JSON.stringify(fitWithin(4032, 3024, 1600)) === '{"w":1600,"h":1200}', fitWithin(4032, 3024, 1600));
check('fitWithin portrait 3024×4032 → 1200×1600', JSON.stringify(fitWithin(3024, 4032, 1600)) === '{"w":1200,"h":1600}');
check('fitWithin never upscales', JSON.stringify(fitWithin(800, 600, 1600)) === '{"w":800,"h":600}');
check('fitWithin thumb 480 keeps aspect', (() => { const r = fitWithin(4000, 1000, 480); return r.w === 480 && r.h === 120; })());
check('fitPixels leaves 12 MP alone', JSON.stringify(fitPixels(4032, 3024)) === '{"w":4032,"h":3024}');
const big = fitPixels(8000, 6000);
check('fitPixels 48 MP → ≤ 16 MP, aspect kept', big.w * big.h <= MAX_PIXELS && approx(big.w / big.h, 8000 / 6000, 0.002), big);
const pano = fitPixels(20000, 2000);
check('fitPixels panorama ≤ 16 MP', pano.w * pano.h <= MAX_PIXELS && pano.w > pano.h, pano);

// ---------- avatar crop math ----------
// 4000×3000 landscape on a 280 stage: cover scale = 280/3000; at zoom 1 the full height is visible, centred.
let c = cropRect(4000, 3000, 280, 1, 0, 0);
check('crop zoom 1 centred: square of the short side', approx(c.sw, 3000) && approx(c.sh, 3000) && approx(c.sx, 500) && approx(c.sy, 0), c);
c = cropRect(4000, 3000, 280, 2, 0, 0);
check('crop zoom 2 centred: half the short side, centred', approx(c.sw, 1500) && approx(c.sx, 1250) && approx(c.sy, 750), c);
c = cropRect(4000, 3000, 280, 1, 9999, 0);
check('crop drag right is clamped to the left edge (sx = 0)', approx(c.sx, 0) && c.sx >= 0, c);
c = cropRect(4000, 3000, 280, 1, -9999, 0);
check('crop drag left is clamped to the right edge', approx(c.sx + c.sw, 4000), c);
check('crop vertical drag at zoom 1 on landscape is locked', clampOffset(4000, 3000, 280, 1, 0, 50).y === 0);
c = cropRect(3000, 4000, 280, 1.5, 0, -9999);
check('portrait crop stays inside the image at zoom 1.5', c.sx >= -1e-9 && c.sy >= -1e-9 && c.sx + c.sw <= 3000 + 1e-6 && c.sy + c.sh <= 4000 + 1e-6, c);
check('crop is always square', (() => { for (const z of [1, 1.3, 2.7, 4]) { const r = cropRect(1234, 987, 280, z, 33, -21); if (!approx(r.sw, r.sh)) return false; } return true; })());

// ---------- EXIF ----------
const base = tinyJpeg();
const app1 = buildExifApp1({ date: '2026:03:14 07:05:00', lat: 40.7128, lng: -74.006 });
const withGps = withExif(base, app1);
const ex = readExif(withGps);
check('readExif finds Exif', ex.hasExif);
check('readExif finds GPS block', ex.hasGps);
check('readExif DateTimeOriginal → 2026-03-14', ex.date === '2026-03-14', ex);
check('plain JPEG: no Exif / GPS', !readExif(base).hasExif && !readExif(base).hasGps);
const stripped = stripJpegMetadata(withGps);
check('strip removes the APP1 Exif segment', stripped.length === withGps.length - app1.length - 9 /* + the 9-byte comment segment */, [withGps.length, stripped.length, app1.length]);
check('stripped JPEG has no Exif / GPS', !readExif(stripped).hasExif && !readExif(stripped).hasGps);
check('stripped JPEG has no "Exif" bytes anywhere', !Buffer.from(stripped).includes(Buffer.from('Exif')));
check('stripped JPEG keeps JFIF APP0', Buffer.from(stripped).includes(Buffer.from('JFIF')));
check('stripped JPEG keeps image data (SOS…EOI) byte for byte', Buffer.from(stripped).subarray(-11).equals(Buffer.from(base).subarray(-11)));
check('strip is idempotent', stripJpegMetadata(stripped).length === stripped.length);
check('hasMetadata true before, false after', hasMetadata(withGps) && !hasMetadata(stripped));
check('exifDate rejects zero dates', exifDate('0000:00:00 00:00:00') === undefined && exifDate('') === undefined);
// a real camera-style JPEG from the screenshot fixtures, if present
try {
  const real = new Uint8Array(readFileSync('/tmp/hybrd-samples/progress-1-gps.jpg'));
  check('fixture photo: GPS detected', readExif(real).hasGps);
  check('fixture photo: stripped has no GPS', !readExif(stripJpegMetadata(real)).hasGps);
} catch { console.log('skip fixture photo (run tools/shoot-gallery.mjs to create /tmp/hybrd-samples)'); }
// PNG text chunk stripping
const pngChunk = (type: string, data: number[]) => { const len = data.length; const b = [len >>> 24, (len >> 16) & 255, (len >> 8) & 255, len & 255, ...[...type].map((ch) => ch.charCodeAt(0)), ...data, 0, 0, 0, 0]; return b; };
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...pngChunk('IHDR', new Array(13).fill(0)), ...pngChunk('eXIf', [1, 2, 3, 4]), ...pngChunk('tEXt', [65, 0, 66]), ...pngChunk('IDAT', [9, 9]), ...pngChunk('IEND', [])]);
const pngS = stripPngMetadata(png);
check('PNG: eXIf + tEXt chunks removed, IHDR/IDAT/IEND kept', pngS.length === png.length - 16 - 15 && Buffer.from(pngS).includes(Buffer.from('IDAT')) && !Buffer.from(pngS).includes(Buffer.from('eXIf')), [png.length, pngS.length]);

// ---------- file checks / size caps ----------
check('JPEG ok', checkFile({ name: 'a.jpg', type: 'image/jpeg', size: 3 * MB }).ok);
check('PNG / WebP ok', checkFile({ name: 'a.png', type: 'image/png', size: 1000 }).ok && checkFile({ name: 'a.webp', type: 'image/webp', size: 1000 }).ok);
check('HEIC accepted (flagged for decode check)', (() => { const r = checkFile({ name: 'IMG_1.HEIC', type: 'image/heic', size: 2 * MB }); return r.ok && r.heic === true; })());
check('HEIC with empty MIME (Windows) by extension', checkFile({ name: 'IMG_2.heic', type: '', size: 2 * MB }).heic === true);
check('PDF refused', !checkFile({ name: 'x.pdf', type: 'application/pdf', size: 1000 }).ok);
check('video refused', !checkFile({ name: 'clip.mov', type: 'video/quicktime', size: 1000 }).ok);
check('SVG refused (scripts)', !checkFile({ name: 'x.svg', type: 'image/svg+xml', size: 1000 }).ok);
check('GIF refused', !checkFile({ name: 'x.gif', type: 'image/gif', size: 1000 }).ok);
check('empty file refused', !checkFile({ name: 'a.jpg', type: 'image/jpeg', size: 0 }).ok);
check('exactly 10 MB: ok, no warning', (() => { const r = checkFile({ name: 'a.jpg', type: 'image/jpeg', size: ORIG_CAP }); return r.ok && !r.warn; })());
check('12 MB: ok with a warning', (() => { const r = checkFile({ name: 'a.jpg', type: 'image/jpeg', size: 12 * MB }); return r.ok && /10 MB/.test(r.warn || ''); })());
check('over 40 MB refused with the limit in the message', (() => { const r = checkFile({ name: 'a.jpg', type: 'image/jpeg', size: HARD_CAP + 1 }); return !r.ok && /40 MB/.test(r.error || ''); })());
check('HEIC error is friendly + gives the iPhone fix', /Most Compatible/.test(HEIC_ERROR));

// ---------- dates ----------
const now = Date.parse('2026-11-16T15:00:00Z');
check('pickDate: EXIF wins', pickDate('2026-03-14', now - 86400000, now).src === 'exif');
check('pickDate: file date when no EXIF', (() => { const r = pickDate(undefined, Date.parse('2026-10-01T12:00:00'), now); return r.src === 'file' && r.date === '2026-10-01'; })());
check('pickDate: "just now" file date (camera capture) → today', pickDate(undefined, now - 1000, now).src === 'today');
check('pickDate: nonsense file date → today', pickDate(undefined, 1000, now).date === localDay(now));
check('daysBetween 2026-09-01 → 2026-11-16 = 76', daysBetween('2026-09-01', '2026-11-16') === 76);
check('daysBetween across DST is whole days', daysBetween('2026-03-01', '2026-03-15') === 14);

// ---------- filtering / counts ----------
const mk = (id: string, tag: GalleryItem['tag'], date: string, createdAt: number, extra: Partial<GalleryItem> = {}): GalleryItem => ({
  id, tag, date, createdAt, updatedAt: createdAt, dateSource: 'exif', w: 100, h: 100, mime: 'image/jpeg', bytes: { orig: 2 * MB, disp: 300 * 1024, thumb: 40 * 1024 }, ...extra,
});
const items = [
  mk('a', 'progress', '2026-09-01', 1), mk('b', 'training', '2026-11-10', 2), mk('c', 'progress', '2026-11-15', 3),
  mk('d', 'other', '2026-10-05', 4), mk('e', 'training', '2026-11-10', 5), mk('x', 'progress', '2026-11-16', 6, { deleted: true }),
];
check('all: newest date first, deleted hidden', filterItems(items, 'all').map((i) => i.id).join('') === 'cebda', filterItems(items, 'all').map((i) => i.id));
check('same date: newest upload first', filterItems(items, 'training').map((i) => i.id).join('') === 'eb');
check('progress filter', filterItems(items, 'progress').map((i) => i.id).join('') === 'ca');
check('other filter', filterItems(items, 'other').map((i) => i.id).join('') === 'd');
check('filter does not mutate input order', items.map((i) => i.id).join('') === 'abcdex');
const tc = tagCounts(items);
check('tag counts skip deleted', tc.all === 5 && tc.progress === 2 && tc.training === 2 && tc.other === 1, tc);

// ---------- storage accounting ----------
const u = usage(items, 60 * 1024);
check('usage counts 5 live photos', u.photos === 5 && u.videos === 0);
check('usage bytes = (orig+disp+thumb) × 5 + avatar', u.bytes === 5 * (2 * MB + 340 * 1024) + 60 * 1024, u);
check('usage origBytes = 10 MB', u.origBytes === 10 * MB);
check('usage empty', usage([]).bytes === 0 && usage([]).photos === 0);
check('fmtBytes', fmtBytes(512) === '512 B' && fmtBytes(2048) === '2 KB' && fmtBytes(Math.round(2.5 * MB)) === '2.5 MB' && fmtBytes(250 * MB) === '250 MB' && fmtBytes(3 * 1024 * MB) === '3.00 GB');

// ---------- downloads / zip ----------
check('download name', downloadName({ id: 'abcdef123', date: '2026-11-15', tag: 'progress', mime: 'image/jpeg' }) === 'hybrd-2026-11-15-progress-abcdef.jpg');
check('download name png', downloadName({ id: 'abcdef123', date: '2026-11-15', tag: 'other', mime: 'image/png' }).endsWith('.png'));
check('unique zip names', uniqueNames(['a.jpg', 'a.jpg', 'b.jpg', 'a.jpg']).join() === 'a.jpg,a-2.jpg,b.jpg,a-3.jpg');
check('crc32("123456789") = cbf43926', crc32(new TextEncoder().encode('123456789')).toString(16) === 'cbf43926');
const f1 = withGps, f2 = new Uint8Array(5000).map((_, i) => (i * 31) & 255);
const zip = makeZip([{ name: 'hybrd-2026-11-15-progress.jpg', data: stripJpegMetadata(f1), date: new Date(2026, 10, 15, 12) }, { name: 'café-training.jpg', data: f2 }]);
writeFileSync('/tmp/hybrd-test.zip', zip);
const py = execFileSync('python3', ['-c', `import zipfile,sys
z=zipfile.ZipFile('/tmp/hybrd-test.zip'); bad=z.testzip(); print(bad); print('|'.join(i.filename+':'+str(i.file_size) for i in z.infolist())); print(z.infolist()[0].date_time[:3])`]).toString().trim().split('\n');
check('zip passes Python zipfile CRC test', py[0] === 'None', py);
check('zip entries + sizes', py[1] === `hybrd-2026-11-15-progress.jpg:${stripJpegMetadata(f1).length}|café-training.jpg:5000`, py[1]);
check('zip entry date = 2026-11-15', py[2] === '(2026, 11, 15)', py[2]);
check('zipped photo has no Exif', !Buffer.from(zip).includes(Buffer.from('Exif')));

// ---------- misc ----------
check('initials', initials('José Manuel Cruz Ortiz') === 'JO' && initials('jose') === 'JO' && initials('') === '' && initials('  Ana  Paula ') === 'AP');

// ---------- wiring ----------
for (const f of ['profile.avatar', 'gallery.photos', 'gallery.download', 'gallery.compare'] as const) check(`entitlement ${f} is free`, FEATURES[f].free === true && can(f));
const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
check('schema: gallery_items in both table loops', (schema.match(/'fasting_logs', 'gallery_items'\] loop/g) || []).length === 2);
check('schema: gallery_items RLS on + granted', /alter table public\.gallery_items enable row level security/.test(schema) && /public\.gallery_items to authenticated/.test(schema));
check('schema: avatar_url added idempotently', /add column if not exists avatar_url/.test(schema));
check('schema: user-media bucket is private + re-runnable', /values \('user-media', 'user-media', false/.test(schema) && /on conflict \(id\) do update set public = false/.test(schema));
check('schema: 4 storage policies, folder = auth.uid()', ['select', 'insert', 'update', 'delete'].every((op) => schema.includes(`"user_media_${op}_own" on storage.objects for ${op}`)) && (schema.slice(schema.indexOf('Storage: private bucket for profile photos'), schema.indexOf('Social: Friends & Stories')).match(/storage\.foldername\(name\)\)\[1\] = \(select auth\.uid\(\)\)::text/g) || []).length === 5); // user-media block only (social-media has its own policies)
check('schema: every policy is dropped first (safe to re-run)', ['select', 'insert', 'update', 'delete'].every((op) => schema.includes(`drop policy if exists "user_media_${op}_own" on storage.objects`)));
const types = readFileSync(new URL('../src/lib/supabase.ts', import.meta.url), 'utf8');
check('gallery collection syncs to gallery_items', /gallery: 'gallery_items'/.test(types));
const post = readFileSync(new URL('./postbuild.mjs', import.meta.url), 'utf8');
check('postbuild has me/gallery route', post.includes("'me/gallery'"));

// =====================================================================================================================
// Gallery videos
// ---------- type detection / caps ----------
check('detectKind: video MIME', detectKind({ name: 'a.mp4', type: 'video/mp4' }) === 'video' && detectKind({ name: 'IMG_1.MOV', type: 'video/quicktime' }) === 'video');
check('detectKind: empty MIME by extension', detectKind({ name: 'clip.MOV', type: '' }) === 'video' && detectKind({ name: 'x.webm', type: 'application/octet-stream' }) === 'video' && detectKind({ name: 'p.jpg', type: '' }) === 'photo');
check('detectKind: pdf / unknown → undefined', detectKind({ name: 'x.pdf', type: 'application/pdf' }) === undefined && detectKind({ name: 'x.avi', type: '' }) === undefined);
check('videoMime normalises m4v → mp4, mov → quicktime', videoMime({ name: 'a.m4v', type: 'video/x-m4v' }) === 'video/mp4' && videoMime({ name: 'a.mov', type: '' }) === 'video/quicktime' && videoMime({ name: 'a.webm', type: 'video/webm' }) === 'video/webm');
check('videoMime: sniffed container wins over a wrong extension', videoMime({ name: 'mislabelled.mp4', type: 'video/mp4' }, 'mov') === 'video/quicktime');
check('videoMime: AVI / MKV / 3GP refused', !videoMime({ name: 'a.avi', type: 'video/x-msvideo' }) && !videoMime({ name: 'a.mkv', type: 'video/x-matroska' }) && !videoMime({ name: 'a.3gp', type: 'video/3gpp' }));
check('checkVideo: 30 MB MP4 ok, no warning', (() => { const r = checkVideo({ name: 'a.mp4', type: 'video/mp4', size: 30 * MB }); return r.ok && !r.warn && r.kind === 'video' && r.mime === 'video/mp4'; })());
check('checkVideo: 120 MB ok but device-only warning (cloud cap 50 MB)', (() => { const r = checkVideo({ name: 'a.mov', type: 'video/quicktime', size: 120 * MB }); return r.ok && /50 MB/.test(r.warn || '') && /this device only/.test(r.warn || ''); })());
check('checkVideo: exactly 200 MB ok', checkVideo({ name: 'a.mp4', type: 'video/mp4', size: VIDEO_CAP }).ok);
check('checkVideo: over 200 MB refused with the limit', (() => { const r = checkVideo({ name: 'a.mp4', type: 'video/mp4', size: VIDEO_CAP + 1 }); return !r.ok && /200 MB/.test(r.error || ''); })());
check('checkVideo: empty refused', !checkVideo({ name: 'a.mp4', type: 'video/mp4', size: 0 }).ok);
check('checkVideo: AVI refused', !checkVideo({ name: 'a.avi', type: 'video/x-msvideo', size: 1000 }).ok);
check('checkDuration: 5:00 ok, 5:01 refused, unknown ok', checkDuration('a', VIDEO_MAX_SECONDS).ok && checkDuration('a', 300.4).ok && !checkDuration('a', 301).ok && /5:00/.test(checkDuration('a', 301).error || '') && checkDuration('a', undefined).ok && checkDuration('a', Infinity).ok);
check('checkMedia routes photo / video / other', checkMedia({ name: 'a.jpg', type: 'image/jpeg', size: 1000 }).kind === 'photo' && checkMedia({ name: 'a.mp4', type: 'video/mp4', size: 1000 }).kind === 'video' && !checkMedia({ name: 'a.pdf', type: 'application/pdf', size: 10 }).ok);
check('checkFile (avatar / photos) still refuses videos', !checkFile({ name: 'clip.mp4', type: 'video/mp4', size: 1000 }).ok);
check('fmtDuration', fmtDuration(42) === '0:42' && fmtDuration(125.4) === '2:05' && fmtDuration(3725) === '1:02:05' && fmtDuration(0) === '0:00' && fmtDuration(undefined) === '–:––' && fmtDuration(NaN) === '–:––');
check('extFor video types', extFor('video/mp4') === 'mp4' && extFor('video/quicktime') === 'mov' && extFor('video/webm') === 'webm');
check('download name for a video keeps its container', downloadName({ id: 'v12345678', date: '2026-11-12', tag: 'training', mime: 'video/quicktime' }) === 'hybrd-2026-11-12-training-v12345.mov');
check('MAX_VIDEOS per batch = 10', MAX_VIDEOS === 10);

// ---------- synthetic MP4 / MOV boxes ----------
const enc = new TextEncoder();
const u32b = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const box = (type: string | number[], ...payload: (number[] | Uint8Array)[]) => { const body = payload.flatMap((p) => [...p]); const t = typeof type === 'string' ? [...type].map((ch) => ch.charCodeAt(0) & 255) : type; return [...u32b(8 + body.length), ...t, ...body]; };
const XYZ = [0xa9, 0x78, 0x79, 0x7a];
const loc = '+40.7128-074.0060+010.000/';
const mvhd = (ts: number, dur: number, created: number) => box('mvhd', [0, 0, 0, 0], u32b(created), u32b(created), u32b(ts), u32b(dur), new Array(80).fill(0));
const tkhd = (w: number, h: number, rot: 0 | 90) => { const m = rot === 90 ? [0, 1, -1, 0] : [1, 0, 0, 1]; const fx = (v: number) => u32b((v * 65536) >>> 0); return box('tkhd', [0, 0, 0, 3], new Array(36).fill(0), fx(m[0]), fx(m[1]), u32b(0), fx(m[2]), fx(m[3]), u32b(0), u32b(0), u32b(0), u32b(0x40000000), u32b(w * 65536), u32b(h * 65536)); };
const hdlr = (t: string) => box('hdlr', [0, 0, 0, 0], u32b(0), [...enc.encode(t)], new Array(12).fill(0), [0]);
const created = Math.round(Date.parse('2026-11-12T18:30:00Z') / 1000) + 2082844800;
const keyName = 'com.apple.quicktime.location.ISO6709';
const keys = box('keys', [0, 0, 0, 0], u32b(2), u32b(8 + keyName.length), [...enc.encode('mdta')], [...enc.encode(keyName)], u32b(8 + 'com.apple.quicktime.make'.length), [...enc.encode('mdta')], [...enc.encode('com.apple.quicktime.make')]);
const dataBox = (v: string) => box('data', u32b(1), u32b(0), [...enc.encode(v)]);
const ilst = box('ilst', box(u32b(1), dataBox(loc)), box(u32b(2), dataBox('Apple')));
const moovSyn = box('moov', mvhd(600, 600 * 42.5, created), box('trak', tkhd(1920, 1080, 90), box('mdia', hdlr('vide'))),
  box('trak', tkhd(0, 0, 0), box('mdia', hdlr('soun'))),
  box('udta', box(XYZ, [0, loc.length, 0x15, 0xc7], [...enc.encode(loc)]), box('loci', [0, 0, 0, 0], new Array(20).fill(7)), box('meta', [0, 0, 0, 0], hdlr('mdir'), box('ilst', box(XYZ, dataBox(loc))))),
  box('meta', hdlr('mdta'), keys, ilst));
const mdatPayload = new Array(4000).fill(0).map((_, i) => (i * 13) & 255);
const syn = new Uint8Array([...box('ftyp', [...enc.encode('qt  ')], u32b(0), [...enc.encode('qt  ')]), ...box('mdat', mdatPayload), ...moovSyn]);
check('sniff: MOV (qt brand) / MP4 (isom) / WebM (EBML) / junk', sniffContainer(syn) === 'mov' && sniffContainer(new Uint8Array(box('ftyp', [...enc.encode('isom')], u32b(0)))) === 'mp4' && sniffContainer(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3, 4, 5, 6, 7, 8])) === 'webm' && sniffContainer(enc.encode('hello world, not a video')) === undefined);
check('readBox handles 64-bit largesize', (() => { const b = new Uint8Array([0, 0, 0, 1, ...enc.encode('mdat'), 0, 0, 0, 0, 0, 0, 0, 20, 1, 2, 3, 4]); const x = readBox(b, 0); return !!x && x.size === 20 && x.header === 16 && x.type === 'mdat'; })());
check('readTopHeader: size 0 = to end of file', (() => { const x = readTopHeader(new Uint8Array([0, 0, 0, 0, ...enc.encode('mdat')]), 100, 5000); return !!x && x.end === 5000; })());
check('readBox rejects a box that overruns its parent', readBox(new Uint8Array([0, 0, 0, 99, ...enc.encode('moov')]), 0) === undefined);
const top = children(syn, 0, syn.length);
const moovView = syn.subarray(top[2].start, top[2].end);
const info = parseMoov(moovView);
check('parseMoov: duration 42.5 s from mvhd', info.duration === 42.5, info);
check('parseMoov: rotated 1920×1080 track → portrait 1080×1920', info.w === 1080 && info.h === 1920 && info.rotation === 90, info);
check('parseMoov: recording date from mvhd', info.created === Date.parse('2026-11-12T18:30:00Z') && localDay(info.created!) === '2026-11-12', info.created);
check('parseMoov: no telemetry track', !info.telemetry);
check('synthetic MOV has location before stripping', hasVideoLocation(syn));
const sr = stripVideoLocation(syn);
check('strip: finds ©xyz, loci, iTunes ©xyz and Apple keys location', ['©xyz', 'loci', 'keys:location'].every((k) => sr.found.includes(k)) && sr.found.filter((k) => k === '©xyz').length === 2, sr.found);
check('strip: file length unchanged (sample offsets stay valid)', sr.out.length === syn.length);
check('strip: no "+40.7128" left anywhere', !Buffer.from(sr.out).includes(Buffer.from('+40.7128')));
check('strip: Apple location key name gone', !Buffer.from(sr.out).includes(Buffer.from('location.ISO6709')));
check('strip: other metadata kept (make = Apple)', Buffer.from(sr.out).includes(Buffer.from('Apple')) && Buffer.from(sr.out).includes(Buffer.from('com.apple.quicktime.make')));
check('strip: media data (mdat) byte for byte', Buffer.from(sr.out.subarray(top[1].start, top[1].end)).equals(Buffer.from(syn.subarray(top[1].start, top[1].end))));
check('strip: box tree still parses, same duration', parseMoov(sr.out.subarray(top[2].start, top[2].end)).duration === 42.5 && children(sr.out, 0, sr.out.length).map((b) => b.type).join() === 'ftyp,mdat,moov');
check('strip: blanked boxes renamed to free', (Buffer.from(sr.out).toString('latin1').match(/free/g) || []).length >= 3);
check('strip: idempotent (nothing left to find)', stripVideoLocation(sr.out).found.length === 0 && !hasVideoLocation(sr.out));
check('strip: input not mutated by stripVideoLocation', hasVideoLocation(syn));
check('stripLocationInBox mutates only the given moov slice', (() => { const copy = syn.slice(); const v = copy.subarray(top[2].start, top[2].end); const r = stripLocationInBox(v); return r.found.length === 4 && !hasVideoLocation(copy); })());
const gopro = new Uint8Array(box('moov', mvhd(1000, 5000, created), box('trak', box('mdia', hdlr('meta'), box('minf', box('stbl', box('stsd', [0, 0, 0, 0], u32b(1), box('gpmd', new Array(8).fill(0)))))))));
check('GoPro gpmd telemetry track detected (not removable — reported)', parseMoov(gopro).telemetry?.[0] === 'gpmd' && stripLocationInBox(gopro.slice()).telemetry[0] === 'gpmd');
check('WebM passes through untouched', (() => { const w = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 9, 9, 9, 9, 9, 9, 9, 9]); const r = stripVideoLocation(w); return r.found.length === 0 && Buffer.from(r.out).equals(Buffer.from(w)); })());
check('garbage after moov does not throw', (() => { try { stripVideoLocation(new Uint8Array([...syn, 0, 0, 0, 3, 1, 2])); return true; } catch { return false; } })());

// ---------- real files from ffmpeg (if installed): location really gone per ffprobe, video still decodes ----------
let ff = true; try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); } catch { ff = false; }
if (ff) {
  const D = '/tmp/hybrd-video-test/'; execFileSync('mkdir', ['-p', D]);
  const mk = (out: string, args: string[]) => execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=320x240:r=15:d=2', '-f', 'lavfi', '-i', 'sine=d=2', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', ...args, D + out]);
  mk('android.mp4', ['-metadata', `location=${loc}`]); // ffmpeg mp4 → udta/loci (3GPP)
  mk('qt.mov', ['-f', 'mov', '-metadata', `location=${loc}`]); // → udta/©xyz (QuickTime / Android)
  mk('iphone.mov', ['-movflags', 'use_metadata_tags', '-metadata', `com.apple.quicktime.location.ISO6709=${loc}`, '-metadata', 'com.apple.quicktime.make=Apple']); // → meta/keys+ilst (iPhone)
  mk('faststart.mp4', ['-movflags', '+faststart', '-metadata', `location=${loc}`]); // moov before mdat
  const probe = (f: string) => execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format_tags:format=duration:stream=width,height', '-of', 'json', f]).toString();
  for (const f of ['android.mp4', 'qt.mov', 'iphone.mov', 'faststart.mp4']) {
    const raw = new Uint8Array(readFileSync(D + f));
    const before = probe(D + f);
    const r = stripVideoLocation(raw);
    writeFileSync(D + 'clean-' + f, r.out);
    const after = probe(D + 'clean-' + f);
    check(`ffmpeg ${f}: ffprobe saw location before`, /40\.7128/.test(before), before);
    check(`ffmpeg ${f}: location found + removed (${r.found.join(',')})`, r.found.length > 0 && !/40\.7128/.test(after) && !Buffer.from(r.out).includes(Buffer.from('40.7128')), after);
    check(`ffmpeg ${f}: same size, duration ${r.info.duration}s, ${r.info.w}×${r.info.h}`, r.out.length === raw.length && Math.abs((r.info.duration || 0) - 2) < 0.1 && r.info.w === 320 && r.info.h === 240);
    let ok = true; try { execFileSync('ffmpeg', ['-v', 'error', '-xerror', '-i', D + 'clean-' + f, '-f', 'null', '-']); } catch { ok = false; }
    check(`ffmpeg ${f}: cleaned file decodes without errors`, ok);
    check(`ffmpeg ${f}: media data identical (md5 of decoded frames)`, execFileSync('ffmpeg', ['-v', 'error', '-i', D + f, '-map', '0:v', '-f', 'md5', '-']).toString() === execFileSync('ffmpeg', ['-v', 'error', '-i', D + 'clean-' + f, '-map', '0:v', '-f', 'md5', '-']).toString());
  }
  check('ffmpeg iphone.mov: make tag kept', /"com.apple.quicktime.make": "Apple"/.test(probe(D + 'clean-iphone.mov')));
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-display_rotation', '90', '-i', D + 'android.mp4', '-c', 'copy', D + 'rot.mp4']);
  const ri = stripVideoLocation(new Uint8Array(readFileSync(D + 'rot.mp4'))).info;
  check('ffmpeg rotated phone video → portrait 240×320', ri.w === 240 && ri.h === 320, ri);
} else console.log('skip ffmpeg video checks (ffmpeg not installed)');

// ---------- filters / counts / usage with videos ----------
const vids = [
  ...items, mk('v1', 'training', '2026-11-12', 7, { kind: 'video', duration: 42, mime: 'video/mp4', bytes: { orig: 120 * MB, disp: 200 * 1024, thumb: 30 * 1024 } }),
  mk('v2', 'progress', '2026-11-01', 8, { kind: 'video', duration: 20, mime: 'video/quicktime', bytes: { orig: 30 * MB, disp: 200 * 1024, thumb: 30 * 1024 } }),
  mk('v3', 'training', '2026-11-11', 9, { kind: 'video', deleted: true, bytes: { orig: MB, disp: 1, thumb: 1 } }),
];
check('type filter: videos only, newest first, deleted hidden', filterItems(vids, 'all', 'video').map((i) => i.id).join() === 'v1,v2');
check('type filter: photos only excludes videos (old items without kind = photo)', filterItems(vids, 'all', 'photo').map((i) => i.id).join('') === 'cebda');
check('type + tag filter combined', filterItems(vids, 'training', 'video').map((i) => i.id).join() === 'v1' && filterItems(vids, 'training', 'photo').map((i) => i.id).join('') === 'eb');
check('all filter mixes photos + videos by date', filterItems(vids, 'all').map((i) => i.id).join(',') === 'c,v1,e,b,v2,d,a');
check('typeCounts', JSON.stringify(typeCounts(vids)) === '{"all":7,"photo":5,"video":2}' && JSON.stringify(typeCounts(vids, 'training')) === '{"all":3,"photo":2,"video":1}');
check('tagCounts within videos', (() => { const t = tagCounts(vids, 'video'); return t.all === 2 && t.training === 1 && t.progress === 1; })());
const uv = usage(vids);
check('usage: 5 photos, 2 videos, video bytes', uv.photos === 5 && uv.videos === 2 && uv.videoBytes === 150 * MB + 2 * 230 * 1024, uv);
check('isVideo', isVideo(vids[6]) && !isVideo(vids[0]));
// ---------- quota ----------
check('quota unknown when the browser gives no estimate', quotaState(undefined).state === 'unknown');
check('quota ok', quotaState({ usage: 100 * MB, quota: 10_000 * MB }, 50 * MB).state === 'ok');
check('quota near ≥ 80% after adding', quotaState({ usage: 7_000 * MB, quota: 10_000 * MB }, 1_200 * MB).state === 'near');
check('quota full when it would not fit (5% reserve)', (() => { const q = quotaState({ usage: 900 * MB, quota: 1_000 * MB }, 100 * MB); return q.state === 'full' && q.free === 100 * MB; })());
// ---------- cloud plan / backed-up ----------
check('cloudPlan: ≤ 50 MB uploads, bigger stays local', cloudPlan(CLOUD_FILE_CAP) === 'upload' && cloudPlan(CLOUD_FILE_CAP + 1) === 'local-only' && cloudPlan(80 * MB, 500 * MB) === 'upload');
check('isBackedUp: photo needs orig; local-only video needs poster/thumb', isBackedUp({ remote: { orig: 'x' } }) && !isBackedUp({ remote: { thumb: 'x' } }) && isBackedUp({ remote: { thumb: 'x', disp: 'y' }, localOnly: true }) && !isBackedUp({ localOnly: true }));
// ---------- zip size guard + streamed layout ----------
check('zipPlan: ≤ 500 MB → zip', zipPlan([{ bytes: { orig: 200 * MB, disp: 0, thumb: 0 }, kind: 'video' }, { bytes: { orig: 300 * MB, disp: 0, thumb: 0 } }]).mode === 'zip');
check('zipPlan: > 500 MB → individual, photo total reported', (() => { const z = zipPlan([{ bytes: { orig: 400 * MB, disp: 0, thumb: 0 }, kind: 'video' }, { bytes: { orig: 150 * MB, disp: 0, thumb: 0 }, kind: 'video' }, { bytes: { orig: 3 * MB, disp: 0, thumb: 0 } }]); return z.mode === 'individual' && z.total === 553 * MB && z.photoTotal === 3 * MB; })());
check('ZIP_MAX = 500 MB', ZIP_MAX === 500 * MB);
check('crc32Update in chunks = one-shot crc32', (() => { const b = new Uint8Array(100_000).map((_, i) => (i * 7) & 255); let c = 0; for (let o = 0; o < b.length; o += 8191) c = crc32Update(c, b.subarray(o, o + 8191)); return c === crc32(b); })());
{
  const vidBytes = sr.out, photoBytes = stripJpegMetadata(withGps);
  const ents = [{ name: 'hybrd-2026-11-12-training-v1.mov', data: vidBytes }, { name: 'hybrd-2026-11-15-progress-p1.jpg', data: photoBytes }];
  const { headers, central } = zipLayout(ents.map((e) => ({ name: e.name, size: e.data.length, crc: crc32(e.data), date: new Date(2026, 10, 12, 9) })));
  const z = Buffer.concat([Buffer.from(headers[0]), Buffer.from(ents[0].data), Buffer.from(headers[1]), Buffer.from(ents[1].data), Buffer.from(central)]);
  writeFileSync('/tmp/hybrd-test-video.zip', z);
  const py2 = execFileSync('python3', ['-c', `import zipfile,hashlib
z=zipfile.ZipFile('/tmp/hybrd-test-video.zip'); print(z.testzip()); print('|'.join(i.filename+':'+str(i.file_size) for i in z.infolist())); print(hashlib.md5(z.read(z.infolist()[0])).hexdigest())`]).toString().trim().split('\n');
  check('streamed ZIP layout (video + photo) passes Python zipfile CRC test', py2[0] === 'None', py2);
  check('streamed ZIP keeps the video byte for byte', py2[1] === `hybrd-2026-11-12-training-v1.mov:${vidBytes.length}|hybrd-2026-11-15-progress-p1.jpg:${photoBytes.length}` && py2[2] === execFileSync('python3', ['-c', 'import hashlib,sys; print(hashlib.md5(sys.stdin.buffer.read()).hexdigest())'], { input: Buffer.from(vidBytes) }).toString().trim(), py2);
  check('makeZip (photos) still identical to the layout path', Buffer.from(makeZip(ents.map((e) => ({ ...e, date: new Date(2026, 10, 12, 9) })))).equals(z));
}
// ---------- wiring ----------
check('entitlement gallery.videos is free', FEATURES['gallery.videos'].free === true && can('gallery.videos'));
check('schema: gallery_items video columns (generated, re-runnable)', ['media_type text', 'duration_s numeric', 'poster_path text', 'local_only boolean'].every((c) => schema.includes(`add column if not exists ${c}`)) && (schema.match(/generated always as/g) || []).length >= 4);
check('schema: user-media 50 MB + video MIME types', /values \('user-media', 'user-media', false, 52428800, array\['image\/jpeg', 'image\/png', 'image\/webp', 'video\/mp4', 'video\/quicktime', 'video\/webm'\]\)/.test(schema));
check('CLOUD_FILE_CAP matches the bucket limit', CLOUD_FILE_CAP === 52428800);
const setup = readFileSync(new URL('../SETUP.md', import.meta.url), 'utf8');
check('SETUP.md documents video limits per plan', /50 MB/.test(setup) && /Pro/.test(setup) && /video/i.test(setup));
const social = readFileSync(new URL('../src/pages/Social.tsx', import.meta.url), 'utf8');
check('Social story picker offers photos only', /filterItems\(items, 'all', 'photo'\)/.test(social));

console.log(failed ? `\n${failed} FAILED` : '\nall gallery checks passed');
process.exit(failed ? 1 : 0);
