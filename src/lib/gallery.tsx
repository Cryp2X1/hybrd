// Me › Profile photo & Gallery — browser side: image processing (canvas re-encode = all EXIF/GPS dropped), IndexedDB blob
// storage (works fully offline), and Supabase Storage sync to the private `user-media` bucket when signed in.
// Pure math / parsing lives in ./media.ts (unit-tested in tools/test-gallery.ts).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createStore, get, set, del } from 'idb-keyval';
import { useStore, uid } from './store';
import { useAuth } from './auth';
import { getSupabase, MEDIA_BUCKET } from './supabase';
import {
  checkFile, readExif, fitPixels, fitWithin, pickDate, stripJpegMetadata, stripPngMetadata, extFor, uniqueNames, downloadName, localDay,
  checkVideo, checkDuration, videoMime, cloudPlan, isBackedUp, zipPlan, zipLayout, crc32Update, fmtDuration, CLOUD_FILE_CAP,
  ORIG_CAP, DISP_EDGE, THUMB_EDGE, AVATAR_PX, HEIC_ERROR, type GalleryItem, type GalleryTag, type BlobKind, type MediaKind,
} from './media';
import { sniffContainer, readTopHeader, parseMoov, stripLocationInBox, CLEAN_TOP, MAX_META_BOX, type MoovInfo, type VideoContainer } from './mp4';

const media = createStore('hybrd-media', 'blobs');
const bkey = (id: string, kind: BlobKind) => `g:${id}:${kind}`;
const akey = (ns: string) => `avatar:${ns}`;
const dkey = (ns: string) => `pending-delete:${ns}`;

// ---------- canvas helpers ----------
interface Decoded { src: CanvasImageSource; w: number; h: number; close(): void }
export async function decodeImage(file: Blob): Promise<Decoded> {
  if ('createImageBitmap' in window) {
    try {
      const bm = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { src: bm, w: bm.width, h: bm.height, close: () => bm.close() };
    } catch { /* fall back to <img> (older Safari) */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = url; await img.decode();
    return { src: img, w: img.naturalWidth, h: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch (e) { URL.revokeObjectURL(url); throw e; }
}
export function draw(src: CanvasImageSource, w: number, h: number, crop?: { sx: number; sy: number; sw: number; sh: number }, opaque = false) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  if (opaque) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h); }
  if (crop) ctx.drawImage(src, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, w, h); else ctx.drawImage(src, 0, 0, w, h);
  return c;
}
const toBlob = (c: HTMLCanvasElement, type: string, q?: number) => new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not encode the image'))), type, q));
/** WebP where the browser can encode it (Chrome, Firefox, Safari 17+ on some paths), otherwise JPEG. */
export async function toWebpOrJpeg(c: HTMLCanvasElement, q: number) {
  const b = await toBlob(c, 'image/webp', q);
  return b.type === 'image/webp' ? b : toBlob(c, 'image/jpeg', q);
}
/** Re-encoded output never carries EXIF, but strip any metadata segment anyway (belt and braces). */
export async function clean(b: Blob): Promise<Blob> {
  const u = new Uint8Array(await b.arrayBuffer());
  const s = b.type === 'image/jpeg' ? stripJpegMetadata(u) : b.type === 'image/png' ? stripPngMetadata(u) : u;
  return s === u ? b : new Blob([s as BlobPart], { type: b.type });
}

export interface Prepared {
  key: string; name: string; orig: Blob; disp: Blob; thumb: Blob; w: number; h: number; mime: string;
  hadGps: boolean; hadExif: boolean; date: string; dateSource: GalleryItem['dateSource']; warn?: string; preview: string;
  kind?: MediaKind; duration?: number; container?: VideoContainer; playable?: boolean; telemetry?: boolean; localOnly?: boolean;
}
/** Decode → re-encode at full resolution (≤ 16 MP, ≤ 10 MB) for download, 1600 px WebP for viewing, 480 px thumbnail. */
export async function preparePhoto(file: File): Promise<Prepared> {
  const chk = checkFile(file);
  if (!chk.ok) throw new Error(chk.error);
  const head = new Uint8Array(await file.slice(0, 512 * 1024).arrayBuffer());
  const exif = readExif(head);
  let d: Decoded;
  try { d = await decodeImage(file); } catch { throw new Error(chk.heic ? HEIC_ERROR : `${file.name}: this image couldn’t be opened. Try a JPEG or PNG.`); }
  try {
    let dim = fitPixels(d.w, d.h);
    const png = file.type === 'image/png' || /\.png$/i.test(file.name);
    let orig = await clean(await toBlob(draw(d.src, dim.w, dim.h, undefined, !png), png ? 'image/png' : 'image/jpeg', 0.92));
    let warn = chk.warn;
    // keep originals ≤ 10 MB: lower JPEG quality, then size, until it fits
    for (let q = 0.86, i = 0; orig.size > ORIG_CAP && i < 8; i++) {
      if (q < 0.72) dim = { w: Math.round(dim.w * 0.85), h: Math.round(dim.h * 0.85) }; else q -= 0.06;
      orig = await clean(await toBlob(draw(d.src, dim.w, dim.h, undefined, true), 'image/jpeg', Math.max(q, 0.72)));
      warn ||= `${file.name} was large, so HYBRD saved a high-quality copy under 10 MB.`;
    }
    const dd = fitWithin(d.w, d.h, DISP_EDGE), td = fitWithin(d.w, d.h, THUMB_EDGE);
    const disp = await toWebpOrJpeg(draw(d.src, dd.w, dd.h), 0.82);
    const thumb = await toWebpOrJpeg(draw(d.src, td.w, td.h), 0.78);
    const pd = pickDate(exif.date, file.lastModified);
    return {
      key: uid(), name: file.name.replace(/\.[^.]+$/, '').slice(0, 60), orig, disp, thumb, w: dim.w, h: dim.h, mime: orig.type,
      hadGps: exif.hasGps, hadExif: exif.hasExif, date: pd.date, dateSource: pd.src, warn, preview: URL.createObjectURL(thumb),
    };
  } finally { d.close(); }
}
// ---------- videos ----------
/** Remove location records from an MP4/MOV without touching the audio/video data: only the small metadata boxes (moov,
 *  top-level udta / XMP uuid) are read into memory, cleaned in place (same length) and spliced back between untouched
 *  slices of the original file. WebM has no standard location field. */
export async function cleanVideo(file: Blob, container: VideoContainer): Promise<{ blob: Blob; found: string[]; telemetry: string[]; info: MoovInfo; checked: boolean }> {
  const found: string[] = [], telemetry: string[] = []; let info: MoovInfo = {};
  if (container === 'webm') return { blob: file, found, telemetry, info, checked: true };
  const parts: BlobPart[] = []; let pos = 0, copied = 0, n = 0;
  try {
    while (pos + 8 <= file.size && n++ < 10_000) {
      const head = new Uint8Array(await file.slice(pos, pos + 16).arrayBuffer());
      const bx = readTopHeader(head, pos, file.size);
      if (!bx) break;
      if (CLEAN_TOP.has(bx.type) && bx.size <= MAX_META_BOX) {
        const bytes = new Uint8Array(await file.slice(bx.start, bx.end).arrayBuffer());
        if (bx.type === 'moov') info = parseMoov(bytes);
        const r = stripLocationInBox(bytes);
        telemetry.push(...r.telemetry);
        if (r.found.length) { found.push(...r.found); parts.push(file.slice(copied, bx.start), bytes); copied = bx.end; }
      }
      pos = bx.end;
    }
  } catch { return { blob: file, found: [], telemetry, info, checked: false }; }
  const checked = pos >= file.size;
  if (!found.length) return { blob: file, found, telemetry, info, checked };
  parts.push(file.slice(copied));
  return { blob: new Blob(parts, { type: file.type }), found, telemetry, info, checked };
}

const once = (el: HTMLMediaElement, ev: string, ms: number) => new Promise<void>((res, rej) => {
  const t = window.setTimeout(() => { cleanup(); rej(new Error('timeout')); }, ms);
  const ok = () => { cleanup(); res(); }, bad = () => { cleanup(); rej(new Error('decode')); };
  const cleanup = () => { window.clearTimeout(t); el.removeEventListener(ev, ok); el.removeEventListener('error', bad); };
  el.addEventListener(ev, ok); el.addEventListener('error', bad);
});
/** Duration, display size and a poster frame via a hidden <video>. Throws if this browser can't decode the file. */
export async function probeVideo(blob: Blob): Promise<{ duration?: number; w: number; h: number; frame: HTMLCanvasElement }> {
  const v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.preload = 'auto';
  const url = URL.createObjectURL(blob);
  try {
    v.src = url;
    await once(v, 'loadedmetadata', 15000);
    let d = v.duration;
    if (!isFinite(d)) { // MediaRecorder WebM: duration is unknown until you seek past the end
      v.currentTime = 1e7; await once(v, 'seeked', 8000).catch(() => {}); d = v.duration;
    }
    const at = isFinite(d) && d > 0 ? Math.min(1, d / 3) : 0;
    v.currentTime = at;
    await once(v, 'seeked', 10000).catch(() => {});
    if (v.readyState < 2) await once(v, 'loadeddata', 8000);
    const w = v.videoWidth, h = v.videoHeight;
    if (!w || !h) throw new Error('no frame');
    const dim = fitWithin(w, h, DISP_EDGE);
    return { duration: isFinite(d) ? d : undefined, w, h, frame: draw(v, dim.w, dim.h, undefined, true) };
  } finally { v.removeAttribute('src'); v.load(); URL.revokeObjectURL(url); }
}
/** Stand-in poster when the browser can't decode the video (e.g. HEVC outside Safari): dark card with a play mark. */
function placeholderPoster(w: number, h: number, label: string): HTMLCanvasElement {
  const d = fitWithin(w || 1280, h || 720, 960);
  const c = document.createElement('canvas'); c.width = d.w; c.height = d.h;
  const x = c.getContext('2d')!; const m = Math.min(d.w, d.h);
  x.fillStyle = '#141414'; x.fillRect(0, 0, d.w, d.h);
  x.fillStyle = '#ffe600'; x.beginPath(); x.moveTo(d.w / 2 - m * 0.09, d.h / 2 - m * 0.12); x.lineTo(d.w / 2 + m * 0.12, d.h / 2); x.lineTo(d.w / 2 - m * 0.09, d.h / 2 + m * 0.12); x.closePath(); x.fill();
  x.fillStyle = '#9a9a9a'; x.font = `600 ${Math.round(m * 0.06)}px sans-serif`; x.textAlign = 'center'; x.fillText(label, d.w / 2, d.h / 2 + m * 0.26);
  return c;
}
/** Keep the original video bytes (no re-encode), minus location tags; read duration / size; make poster + thumbnail. */
export async function prepareVideo(file: File): Promise<Prepared> {
  const chk = checkVideo(file);
  if (!chk.ok) throw new Error(chk.error);
  const container = sniffContainer(new Uint8Array(await file.slice(0, 64).arrayBuffer()));
  if (!container) throw new Error(`${file.name} doesn’t look like a video file (MP4, MOV or WebM).`);
  const mime = videoMime(file, container)!;
  const cv = await cleanVideo(file, container);
  const orig = cv.blob.type === mime ? cv.blob : new Blob([cv.blob], { type: mime });
  let meta: Awaited<ReturnType<typeof probeVideo>> | undefined;
  try { meta = await probeVideo(orig); } catch { /* browser can't decode this codec — keep the file, explain in the UI */ }
  const duration = meta?.duration ?? cv.info.duration;
  const dc = checkDuration(file.name, duration);
  if (!dc.ok) throw new Error(dc.error);
  const w = meta?.w || cv.info.w || 0, h = meta?.h || cv.info.h || 0;
  const frame = meta?.frame || placeholderPoster(w, h, `${container.toUpperCase()} video${duration ? ` · ${fmtDuration(duration)}` : ''}`);
  const disp = await toWebpOrJpeg(frame, 0.82);
  const td = fitWithin(frame.width, frame.height, THUMB_EDGE);
  const thumb = await toWebpOrJpeg(draw(frame, td.w, td.h), 0.78);
  const pd = cv.info.created ? { date: localDay(cv.info.created), src: 'exif' as const } : pickDate(undefined, file.lastModified);
  const localOnly = cloudPlan(orig.size) === 'local-only';
  const warns = [chk.warn];
  if (!meta) warns.push('This browser can’t play this video format (often iPhone HEVC outside Safari). It’s saved and can be downloaded at full quality.');
  if (!cv.checked) warns.push('HYBRD couldn’t fully read this file’s metadata, so it may still contain location data.');
  if (cv.telemetry.length) warns.push('This video has a GPS track (action-camera telemetry) that HYBRD can’t remove without re-encoding. Keep it private.');
  return {
    key: uid(), name: file.name.replace(/\.[^.]+$/, '').slice(0, 60), orig, disp, thumb, w, h, mime, kind: 'video', duration, container,
    playable: !!meta, telemetry: cv.telemetry.length > 0 || undefined, localOnly,
    hadGps: cv.found.length > 0, hadExif: cv.found.length > 0, date: pd.date, dateSource: pd.src, warn: warns.filter(Boolean).join(' ') || undefined,
    preview: URL.createObjectURL(thumb),
  };
}

/** Square crop → 512 px avatar. */
export async function renderAvatar(src: CanvasImageSource, crop: { sx: number; sy: number; sw: number; sh: number }): Promise<Blob> {
  return clean(await toWebpOrJpeg(draw(src, AVATAR_PX, AVATAR_PX, crop, true), 0.86));
}

// ---------- object-URL cache ----------
const urlCache = new Map<string, string>();
// revoke a little later: an open <video> may still be reading the URL while React swaps it out (avoids ERR_FILE_NOT_FOUND)
function dropUrls(id: string) { for (const k of ['orig', 'disp', 'thumb']) { const key = `${id}:${k}`; const u = urlCache.get(key); if (u) { urlCache.delete(key); window.setTimeout(() => URL.revokeObjectURL(u), 3000); } } }

export function saveBlob(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
}

// ---------- context ----------
interface MediaCtx {
  avatarUrl?: string;
  avatarBytes: number;
  setAvatar(b: Blob): Promise<void>;
  removeAvatar(): Promise<void>;
  items: GalleryItem[];
  addPhotos(p: (Prepared & { tag: GalleryTag; caption?: string; id?: string })[]): Promise<number>;
  updatePhoto(it: GalleryItem, patch: Partial<Pick<GalleryItem, 'caption' | 'tag' | 'date'>>): void;
  deletePhotos(ids: string[]): Promise<void>;
  getBlob(it: GalleryItem, kind: BlobKind): Promise<Blob | undefined>;
  getUrl(it: GalleryItem, kind: BlobKind): Promise<string | undefined>;
  /** One file → saved directly; several → one ZIP. Returns 'too-big' (nothing saved) when the originals exceed ZIP_MAX. */
  download(its: GalleryItem[]): Promise<{ status: 'ok' | 'too-big' | 'missing'; saved: number; missing: number }>;
  uploading: number;
  synced: boolean;
  syncError: string;
}
const Ctx = createContext<MediaCtx>(null as unknown as MediaCtx);
export const useMedia = () => useContext(Ctx);

export function MediaProvider({ children }: { children: ReactNode }) {
  const { ns, ready, data, profile, upsert, remove, setProfile } = useStore();
  const { user } = useAuth();
  const signedIn = !!user && ns !== 'local';
  const [avatarUrl, setAvatarUrl] = useState<string>();
  const [uploading, setUploading] = useState(0);
  const [syncError, setSyncError] = useState('');
  const items = data.gallery;
  const itemsRef = useRef(items); itemsRef.current = items;

  // ----- avatar -----
  const av = profile.avatar;
  useEffect(() => {
    let alive = true, url: string | undefined;
    (async () => {
      if (!ready || !av) { setAvatarUrl(undefined); return; }
      let b = await get<Blob>(akey(ns), media);
      if (!b && av.path && signedIn) {
        const sb = await getSupabase();
        const r = await sb?.storage.from(MEDIA_BUCKET).download(av.path);
        if (r?.data) { b = r.data; await set(akey(ns), b, media); }
      }
      if (!alive) return;
      url = b ? URL.createObjectURL(b) : undefined; setAvatarUrl(url);
    })().catch(() => setAvatarUrl(undefined));
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [ns, ready, av?.v, av?.path, signedIn]); // eslint-disable-line react-hooks/exhaustive-deps

  const setAvatar = useCallback(async (b: Blob) => {
    await set(akey(ns), b, media);
    const v = Date.now();
    setProfile({ avatar: { v, bytes: b.size } });
    if (signedIn && user) {
      try {
        const sb = await getSupabase(); if (!sb) return;
        const path = `${user.id}/avatar.${extFor(b.type)}`;
        const { error } = await sb.storage.from(MEDIA_BUCKET).upload(path, b, { upsert: true, contentType: b.type, cacheControl: '60' });
        if (error) throw error;
        setProfile({ avatar: { v, bytes: b.size, path } });
        await sb.from('profiles').update({ avatar_url: path }).eq('id', user.id);
      } catch (e) { setSyncError((e as Error).message); }
    }
  }, [ns, signedIn, user, setProfile]);
  const removeAvatar = useCallback(async () => {
    const path = profile.avatar?.path;
    await del(akey(ns), media);
    setProfile({ avatar: undefined });
    if (signedIn && user) {
      const sb = await getSupabase();
      if (path) await sb?.storage.from(MEDIA_BUCKET).remove([path]);
      await sb?.from('profiles').update({ avatar_url: null }).eq('id', user.id);
    }
  }, [ns, signedIn, user, setProfile, profile.avatar?.path]);

  // ----- gallery blobs -----
  const getBlob = useCallback(async (it: GalleryItem, kind: BlobKind) => {
    let b = await get<Blob>(bkey(it.id, kind), media);
    if (!b && it.remote?.[kind] && signedIn && navigator.onLine) {
      const sb = await getSupabase();
      const r = await sb?.storage.from(MEDIA_BUCKET).download(it.remote[kind]!);
      if (r?.data) { b = r.data; await set(bkey(it.id, kind), b, media); }
    }
    return b;
  }, [signedIn]);
  const getUrl = useCallback(async (it: GalleryItem, kind: BlobKind) => {
    const k = `${it.id}:${kind}`;
    const hit = urlCache.get(k); if (hit) return hit;
    const b = await getBlob(it, kind); if (!b) return;
    const u = URL.createObjectURL(b); urlCache.set(k, u); return u;
  }, [getBlob]);

  const addPhotos: MediaCtx['addPhotos'] = useCallback(async (list) => {
    let n = 0;
    for (const p of list) {
      const id = p.id || uid();
      await set(bkey(id, 'orig'), p.orig, media); await set(bkey(id, 'disp'), p.disp, media); await set(bkey(id, 'thumb'), p.thumb, media);
      const it: Omit<GalleryItem, 'updatedAt'> = {
        id, date: p.date, dateSource: p.dateSource, tag: p.tag, caption: p.caption?.trim() || undefined, w: p.w, h: p.h, mime: p.mime,
        bytes: { orig: p.orig.size, disp: p.disp.size, thumb: p.thumb.size }, name: p.name, createdAt: Date.now() + n, hadGps: p.hadGps || undefined,
        ...(p.kind === 'video' ? {
          kind: 'video' as const, duration: p.duration !== undefined ? Math.round(p.duration * 100) / 100 : undefined, container: p.container,
          playable: p.playable === false ? false : undefined, telemetry: p.telemetry || undefined,
          ...(p.localOnly ? { localOnly: true, cloudNote: 'too-big' as const } : {}),
        } : {}),
      };
      upsert<GalleryItem>('gallery', it); n++;
      URL.revokeObjectURL(p.preview);
    }
    // ask the browser not to evict photos under storage pressure (granted silently for installed PWAs / engaged sites)
    navigator.storage?.persist?.().catch(() => {});
    return n;
  }, [upsert]);

  const updatePhoto: MediaCtx['updatePhoto'] = useCallback((it, patch) => {
    upsert<GalleryItem>('gallery', { ...it, ...patch, ...(patch.date ? { dateSource: 'manual' as const } : {}) });
  }, [upsert]);

  const deletePhotos = useCallback(async (ids: string[]) => {
    const paths: string[] = [];
    for (const id of ids) {
      const it = itemsRef.current.find((x) => x.id === id);
      if (it?.remote) paths.push(...Object.values(it.remote).filter(Boolean) as string[]);
      for (const k of ['orig', 'disp', 'thumb'] as BlobKind[]) await del(bkey(id, k), media);
      dropUrls(id);
      remove('gallery', id);
    }
    if (paths.length && signedIn) {
      const sb = await getSupabase();
      const r = navigator.onLine ? await sb?.storage.from(MEDIA_BUCKET).remove(paths) : undefined;
      if (!r || r.error) await set(dkey(ns), [...((await get<string[]>(dkey(ns), media)) || []), ...paths], media); // retry later
    }
  }, [remove, signedIn, ns]);

  const download: MediaCtx['download'] = useCallback(async (its) => {
    if (!its.length) return { status: 'ok', saved: 0, missing: 0 };
    if (its.length === 1) { const b = await getBlob(its[0], 'orig'); if (!b) return { status: 'missing', saved: 0, missing: 1 }; saveBlob(b, downloadName(its[0])); return { status: 'ok', saved: 1, missing: 0 }; }
    if (zipPlan(its).mode === 'individual') return { status: 'too-big', saved: 0, missing: 0 };
    // ZIP assembled from Blob parts: each original is hashed in 8 MB slices, never copied into one big array
    const names = uniqueNames(its.map((i) => downloadName(i)));
    const entries: { name: string; size: number; crc: number; date: Date }[] = [], blobs: Blob[] = [];
    let missing = 0;
    for (let i = 0; i < its.length; i++) {
      const b = await getBlob(its[i], 'orig');
      if (!b) { missing++; continue; }
      let crc = 0;
      for (let o = 0; o < b.size; o += 8 * 1024 * 1024) crc = crc32Update(crc, new Uint8Array(await b.slice(o, o + 8 * 1024 * 1024).arrayBuffer()));
      entries.push({ name: names[i], size: b.size, crc, date: new Date(its[i].date + 'T12:00:00') }); blobs.push(b);
    }
    if (!entries.length) return { status: 'missing', saved: 0, missing };
    const { headers, central } = zipLayout(entries);
    const parts: BlobPart[] = [];
    entries.forEach((_, i) => parts.push(headers[i] as BlobPart, blobs[i]));
    parts.push(central as BlobPart);
    const videos = its.some((i) => i.kind === 'video');
    saveBlob(new Blob(parts, { type: 'application/zip' }), `hybrd-${videos ? 'gallery' : 'photos'}-${new Date().toISOString().slice(0, 10)}.zip`);
    return { status: 'ok', saved: entries.length, missing };
  }, [getBlob]);

  // ----- background upload (Supabase mode) -----
  const busy = useRef(false);
  const sync = useCallback(async () => {
    if (!signedIn || !user || busy.current || !navigator.onLine) return;
    const sb = await getSupabase(); if (!sb) return;
    busy.current = true;
    try {
      const pend = (await get<string[]>(dkey(ns), media)) || [];
      if (pend.length) { const r = await sb.storage.from(MEDIA_BUCKET).remove(pend); if (!r.error) await set(dkey(ns), [], media); }
      const todo = itemsRef.current.filter((i) => !i.deleted && !isBackedUp(i));
      setUploading(todo.length);
      for (const it of todo) {
        const remoteP: Partial<Record<BlobKind, string>> = { ...it.remote };
        let localOnly = it.localOnly, cloudNote = it.cloudNote;
        for (const kind of ['thumb', 'disp', 'orig'] as BlobKind[]) {
          if (remoteP[kind]) continue;
          const b = await get<Blob>(bkey(it.id, kind), media); if (!b) continue;
          // big videos stay on this device (Supabase free plan: 50 MB per file); the poster + thumbnail still sync
          if (kind === 'orig' && it.kind === 'video' && (localOnly || cloudPlan(b.size, CLOUD_FILE_CAP) === 'local-only')) { localOnly = true; cloudNote ||= 'too-big'; continue; }
          const path = `${user.id}/gallery/${it.id}/${kind}.${extFor(b.type)}`;
          const { error } = await sb.storage.from(MEDIA_BUCKET).upload(path, b, { upsert: true, contentType: b.type, cacheControl: '3600' });
          if (error) {
            const e = error as { message?: string; statusCode?: string | number };
            // bucket refused the video (size limit lowered, or schema.sql not re-run so video/* isn't allowed): keep it local, carry on
            if (kind === 'orig' && it.kind === 'video' && (String(e.statusCode) === '413' || String(e.statusCode) === '415' || /size|exceed|mime|type|not allowed|payload/i.test(e.message || ''))) { localOnly = true; cloudNote = 'refused'; continue; }
            throw error;
          }
          remoteP[kind] = path;
        }
        const cur = itemsRef.current.find((x) => x.id === it.id);
        if (cur && (remoteP.orig || (localOnly && remoteP.thumb))) upsert<GalleryItem>('gallery', { ...cur, remote: remoteP, ...(localOnly ? { localOnly: true, cloudNote } : {}) });
        setUploading((n) => Math.max(0, n - 1));
      }
      setSyncError('');
    } catch (e) { setSyncError((e as Error).message || String(e)); }
    finally { busy.current = false; setUploading(0); }
  }, [signedIn, user, ns, upsert]);
  const pendingCount = items.filter((i) => !i.deleted && !isBackedUp(i)).length;
  useEffect(() => { if (ready && signedIn && pendingCount) { const t = window.setTimeout(sync, 1200); return () => window.clearTimeout(t); } }, [ready, signedIn, pendingCount, sync]);
  useEffect(() => { const on = () => sync(); window.addEventListener('online', on); return () => window.removeEventListener('online', on); }, [sync]);

  const value = useMemo<MediaCtx>(() => ({
    avatarUrl, avatarBytes: profile.avatar?.bytes || 0, setAvatar, removeAvatar, items, addPhotos, updatePhoto, deletePhotos, getBlob, getUrl, download,
    uploading, synced: signedIn && pendingCount === 0, syncError,
  }), [avatarUrl, profile.avatar?.bytes, setAvatar, removeAvatar, items, addPhotos, updatePhoto, deletePhotos, getBlob, getUrl, download, uploading, signedIn, pendingCount, syncError]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Object URL for one gallery image (cached for the session). undefined while loading, '' if the image isn't on this device. */
export function useGalleryUrl(it: GalleryItem | undefined, kind: BlobKind): string | undefined {
  const { getUrl } = useMedia();
  const [u, setU] = useState<string | undefined>(() => (it ? urlCache.get(`${it.id}:${kind}`) : undefined));
  useEffect(() => {
    let alive = true;
    if (!it) { setU(undefined); return; }
    const hit = urlCache.get(`${it.id}:${kind}`);
    if (hit) { setU(hit); return; }
    setU(undefined);
    getUrl(it, kind).then((x) => alive && setU(x ?? '')).catch(() => alive && setU(''));
    return () => { alive = false; };
  }, [it?.id, it?.remote?.[kind], kind, getUrl]); // eslint-disable-line react-hooks/exhaustive-deps
  return u;
}
