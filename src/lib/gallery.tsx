// Me › Profile photo & Gallery — browser side: image processing (canvas re-encode = all EXIF/GPS dropped), IndexedDB blob
// storage (works fully offline), and Supabase Storage sync to the private `user-media` bucket when signed in.
// Pure math / parsing lives in ./media.ts (unit-tested in tools/test-gallery.ts).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createStore, get, set, del } from 'idb-keyval';
import { useStore, uid } from './store';
import { useAuth } from './auth';
import { getSupabase, MEDIA_BUCKET } from './supabase';
import {
  checkFile, readExif, fitPixels, fitWithin, pickDate, stripJpegMetadata, stripPngMetadata, extFor, makeZip, uniqueNames, downloadName,
  ORIG_CAP, DISP_EDGE, THUMB_EDGE, AVATAR_PX, HEIC_ERROR, type GalleryItem, type GalleryTag, type BlobKind,
} from './media';

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
function draw(src: CanvasImageSource, w: number, h: number, crop?: { sx: number; sy: number; sw: number; sh: number }, opaque = false) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  if (opaque) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h); }
  if (crop) ctx.drawImage(src, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, w, h); else ctx.drawImage(src, 0, 0, w, h);
  return c;
}
const toBlob = (c: HTMLCanvasElement, type: string, q?: number) => new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not encode the image'))), type, q));
/** WebP where the browser can encode it (Chrome, Firefox, Safari 17+ on some paths), otherwise JPEG. */
async function toWebpOrJpeg(c: HTMLCanvasElement, q: number) {
  const b = await toBlob(c, 'image/webp', q);
  return b.type === 'image/webp' ? b : toBlob(c, 'image/jpeg', q);
}
/** Re-encoded output never carries EXIF, but strip any metadata segment anyway (belt and braces). */
async function clean(b: Blob): Promise<Blob> {
  const u = new Uint8Array(await b.arrayBuffer());
  const s = b.type === 'image/jpeg' ? stripJpegMetadata(u) : b.type === 'image/png' ? stripPngMetadata(u) : u;
  return s === u ? b : new Blob([s as BlobPart], { type: b.type });
}

export interface Prepared {
  key: string; name: string; orig: Blob; disp: Blob; thumb: Blob; w: number; h: number; mime: string;
  hadGps: boolean; hadExif: boolean; date: string; dateSource: GalleryItem['dateSource']; warn?: string; preview: string;
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
/** Square crop → 512 px avatar. */
export async function renderAvatar(src: CanvasImageSource, crop: { sx: number; sy: number; sw: number; sh: number }): Promise<Blob> {
  return clean(await toWebpOrJpeg(draw(src, AVATAR_PX, AVATAR_PX, crop, true), 0.86));
}

// ---------- object-URL cache ----------
const urlCache = new Map<string, string>();
function dropUrls(id: string) { for (const k of ['orig', 'disp', 'thumb']) { const key = `${id}:${k}`; const u = urlCache.get(key); if (u) { URL.revokeObjectURL(u); urlCache.delete(key); } } }

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
  addPhotos(p: (Prepared & { tag: GalleryTag; caption?: string })[]): Promise<number>;
  updatePhoto(it: GalleryItem, patch: Partial<Pick<GalleryItem, 'caption' | 'tag' | 'date'>>): void;
  deletePhotos(ids: string[]): Promise<void>;
  getBlob(it: GalleryItem, kind: BlobKind): Promise<Blob | undefined>;
  getUrl(it: GalleryItem, kind: BlobKind): Promise<string | undefined>;
  download(its: GalleryItem[]): Promise<void>;
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
      const id = uid();
      await set(bkey(id, 'orig'), p.orig, media); await set(bkey(id, 'disp'), p.disp, media); await set(bkey(id, 'thumb'), p.thumb, media);
      const it: Omit<GalleryItem, 'updatedAt'> = {
        id, date: p.date, dateSource: p.dateSource, tag: p.tag, caption: p.caption?.trim() || undefined, w: p.w, h: p.h, mime: p.mime,
        bytes: { orig: p.orig.size, disp: p.disp.size, thumb: p.thumb.size }, name: p.name, createdAt: Date.now() + n, hadGps: p.hadGps || undefined,
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

  const download = useCallback(async (its: GalleryItem[]) => {
    if (!its.length) return;
    if (its.length === 1) { const b = await getBlob(its[0], 'orig'); if (b) saveBlob(b, downloadName(its[0])); return; }
    const names = uniqueNames(its.map((i) => downloadName(i)));
    const files: { name: string; data: Uint8Array; date: Date }[] = [];
    for (let i = 0; i < its.length; i++) {
      const b = await getBlob(its[i], 'orig');
      if (b) files.push({ name: names[i], data: new Uint8Array(await b.arrayBuffer()), date: new Date(its[i].date + 'T12:00:00') });
    }
    saveBlob(new Blob([makeZip(files) as BlobPart], { type: 'application/zip' }), `hybrd-photos-${new Date().toISOString().slice(0, 10)}.zip`);
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
      const todo = itemsRef.current.filter((i) => !i.remote?.orig);
      setUploading(todo.length);
      for (const it of todo) {
        const remoteP: Partial<Record<BlobKind, string>> = {};
        for (const kind of ['thumb', 'disp', 'orig'] as BlobKind[]) {
          const b = await get<Blob>(bkey(it.id, kind), media); if (!b) continue;
          const path = `${user.id}/gallery/${it.id}/${kind}.${extFor(b.type)}`;
          const { error } = await sb.storage.from(MEDIA_BUCKET).upload(path, b, { upsert: true, contentType: b.type, cacheControl: '3600' });
          if (error) throw error;
          remoteP[kind] = path;
        }
        const cur = itemsRef.current.find((x) => x.id === it.id);
        if (cur && remoteP.orig) upsert<GalleryItem>('gallery', { ...cur, remote: remoteP });
        setUploading((n) => Math.max(0, n - 1));
      }
      setSyncError('');
    } catch (e) { setSyncError((e as Error).message || String(e)); }
    finally { busy.current = false; setUploading(0); }
  }, [signedIn, user, ns, upsert]);
  const pendingCount = items.filter((i) => !i.remote?.orig).length;
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
