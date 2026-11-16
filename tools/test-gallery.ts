// Unit checks for Me › Profile photo & Gallery: resize / crop math, EXIF reading + stripping (GPS), file type + size caps,
// date picking, tag filtering + counts, storage accounting, download names, ZIP writer (verified with Python's zipfile),
// schema / entitlements wiring.
// Run: node --experimental-strip-types --import ./tools/ts-resolve.mjs tools/test-gallery.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import {
  fitWithin, fitPixels, clampOffset, cropRect, readExif, exifDate, stripJpegMetadata, stripPngMetadata, hasMetadata, checkFile, pickDate, localDay,
  filterItems, tagCounts, usage, fmtBytes, downloadName, uniqueNames, crc32, makeZip, initials, daysBetween,
  MAX_PIXELS, ORIG_CAP, HARD_CAP, MB, HEIC_ERROR, type GalleryItem,
} from '../src/lib/media.ts';
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
check('usage counts 5 live photos', u.photos === 5);
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
check('schema: 4 storage policies, folder = auth.uid()', ['select', 'insert', 'update', 'delete'].every((op) => schema.includes(`"user_media_${op}_own" on storage.objects for ${op}`)) && (schema.match(/storage\.foldername\(name\)\)\[1\] = \(select auth\.uid\(\)\)::text/g) || []).length === 5);
check('schema: every policy is dropped first (safe to re-run)', ['select', 'insert', 'update', 'delete'].every((op) => schema.includes(`drop policy if exists "user_media_${op}_own" on storage.objects`)));
const types = readFileSync(new URL('../src/lib/supabase.ts', import.meta.url), 'utf8');
check('gallery collection syncs to gallery_items', /gallery: 'gallery_items'/.test(types));
const post = readFileSync(new URL('./postbuild.mjs', import.meta.url), 'utf8');
check('postbuild has me/gallery route', post.includes("'me/gallery'"));

console.log(failed ? `\n${failed} FAILED` : '\nall gallery checks passed');
process.exit(failed ? 1 : 0);
