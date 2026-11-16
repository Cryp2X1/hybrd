// Test fixture: builds a real Exif APP1 segment (DateTimeOriginal + GPS lat/lng) and splices it into a JPEG,
// so tests and screenshots can prove HYBRD strips location metadata. Used by tools/test-gallery.ts and tools/shoot-gallery.mjs.
export function buildExifApp1({ date = '2026:03:14 07:05:00', lat = 40.7128, lng = -74.006 } = {}) {
  const entries0 = 2, exifN = 1, gpsN = 4;
  const ifd0 = 8, exifIfd = ifd0 + 2 + entries0 * 12 + 4, gpsIfd = exifIfd + 2 + exifN * 12 + 4;
  const dataStart = gpsIfd + 2 + gpsN * 12 + 4;
  const dateOff = dataStart, latOff = dateOff + 20, lngOff = latOff + 24, end = lngOff + 24;
  const t = new Uint8Array(end); const v = new DataView(t.buffer);
  t.set([0x4d, 0x4d, 0x00, 0x2a]); v.setUint32(4, ifd0);
  const ent = (o, tag, type, count, val) => { v.setUint16(o, tag); v.setUint16(o + 2, type); v.setUint32(o + 4, count); v.setUint32(o + 8, val); };
  v.setUint16(ifd0, entries0); ent(ifd0 + 2, 0x8769, 4, 1, exifIfd); ent(ifd0 + 14, 0x8825, 4, 1, gpsIfd); v.setUint32(ifd0 + 26, 0);
  v.setUint16(exifIfd, exifN); ent(exifIfd + 2, 0x9003, 2, 20, dateOff); v.setUint32(exifIfd + 14, 0);
  v.setUint16(gpsIfd, gpsN);
  const ref = (c) => (c.charCodeAt(0) << 24) >>> 0;
  ent(gpsIfd + 2, 1, 2, 2, ref(lat >= 0 ? 'N' : 'S')); ent(gpsIfd + 14, 2, 5, 3, latOff);
  ent(gpsIfd + 26, 3, 2, 2, ref(lng >= 0 ? 'E' : 'W')); ent(gpsIfd + 38, 4, 5, 3, lngOff); v.setUint32(gpsIfd + 50, 0);
  for (let i = 0; i < 19; i++) t[dateOff + i] = date.charCodeAt(i);
  const dms = (o, x) => { x = Math.abs(x); const d = Math.floor(x), m = Math.floor((x - d) * 60), s = Math.round(((x - d) * 60 - m) * 60 * 100); [[d, 1], [m, 1], [s, 100]].forEach(([n, den], i) => { v.setUint32(o + i * 8, n); v.setUint32(o + i * 8 + 4, den); }); };
  dms(latOff, lat); dms(lngOff, lng);
  const head = new Uint8Array([0x45, 0x78, 0x69, 0x66, 0, 0]);
  const len = 2 + head.length + t.length;
  const seg = new Uint8Array(2 + len);
  seg.set([0xff, 0xe1, len >> 8, len & 0xff]); seg.set(head, 4); seg.set(t, 4 + head.length);
  return seg;
}
/** Insert an APP1 right after SOI (and after APP0/JFIF if present, like cameras do). */
export function withExif(jpeg, app1 = buildExifApp1()) {
  let at = 2;
  if (jpeg[2] === 0xff && jpeg[3] === 0xe0) at = 4 + ((jpeg[4] << 8) | jpeg[5]);
  const out = new Uint8Array(jpeg.length + app1.length);
  out.set(jpeg.subarray(0, at)); out.set(app1, at); out.set(jpeg.subarray(at), at + app1.length);
  return out;
}
/** A minimal structurally-valid JPEG header sequence (SOI, APP0, a comment, SOS stub, EOI) for unit tests. */
export function tinyJpeg() {
  const app0 = [0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0];
  const com = [0xff, 0xfe, 0, 7, 0x68, 0x65, 0x6c, 0x6c, 0x6f];
  const dqt = [0xff, 0xdb, 0, 4, 0, 0];
  const sos = [0xff, 0xda, 0, 4, 0, 0, 0x12, 0x34, 0x56, 0xff, 0xd9];
  return new Uint8Array([0xff, 0xd8, ...app0, ...com, ...dqt, ...sos]);
}
