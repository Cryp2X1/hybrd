// Me › Gallery: private progress / training photos and videos. Upload or record one or many, tag + caption + date, grid by
// month with type + tag filters, full-screen viewer (swipe / arrows / keys; inline video with mute + loop), multi-select,
// download (original or ZIP; individual files when too big to zip), delete, before/after compare (photos only).
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Page, Card, Sheet, Banner, Empty } from '../components/ui';
import { Icon } from '../components/Icon';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { useMedia, preparePhoto, prepareVideo, useGalleryUrl, type Prepared } from '../lib/gallery';
import {
  ACCEPT, VIDEO_ACCEPT, MAX_FILES, MAX_VIDEOS, TAGS, CLOUD_FILE_CAP, ZIP_MAX, VIDEO_CAP, VIDEO_MAX_SECONDS, filterItems, tagCounts, typeCounts, usage, fmtBytes, fmtDuration, daysBetween,
  checkMedia, isVideo, quotaState, zipPlan, downloadName, type GalleryItem, type GalleryTag, type TagFilter, type TypeFilter,
} from '../lib/media';

const fmtDay = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const fmtMonth = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
const tagLabel = (t: GalleryTag) => TAGS.find((x) => x.v === t)!.label;
const kindWord = (it: GalleryItem) => (isVideo(it) ? 'video' : 'photo');
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
/** "2 photos & 1 video" */
const countWords = (photos: number, videos: number) => [photos ? plural(photos, 'photo') : '', videos ? plural(videos, 'video') : ''].filter(Boolean).join(' & ') || '0 photos';
const coarse = () => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

function Tile({ it, selecting, selected, onOpen, onToggle }: { it: GalleryItem; selecting: boolean; selected: boolean; onOpen: () => void; onToggle: () => void }) {
  const u = useGalleryUrl(it, 'thumb');
  return (
    <button className={`g-tile ${selected ? 'sel' : ''} ${isVideo(it) ? 'vid' : ''}`} onClick={selecting ? onToggle : onOpen} aria-pressed={selecting ? selected : undefined} aria-label={`${tagLabel(it.tag)} ${kindWord(it)}${isVideo(it) ? ` (${fmtDuration(it.duration)})` : ''}, ${fmtDay(it.date)}${it.caption ? `: ${it.caption}` : ''}`} data-testid="g-tile" data-kind={it.kind || 'photo'}>
      {u ? <img src={u} alt="" loading="lazy" /> : <span className="g-missing"><Icon name={isVideo(it) ? 'video' : 'image'} size={22} />{u === '' && <small>Not on this device</small>}</span>}
      {isVideo(it) && <><span className="g-play" aria-hidden="true"><Icon name="play" size={18} fill /></span><span className="g-dur mono" data-testid="g-dur">{fmtDuration(it.duration)}</span></>}
      <span className={`g-tag t-${it.tag}`}>{tagLabel(it.tag)}</span>
      {selecting && <span className="g-check">{selected && <Icon name="check" size={16} stroke={3} />}</span>}
    </button>
  );
}

function Viewer({ list, index, onIndex, onClose, onDelete }: { list: GalleryItem[]; index: number; onIndex: (i: number) => void; onClose: () => void; onDelete: (it: GalleryItem) => void }) {
  const it = list[index];
  const { download, updatePhoto } = useMedia();
  const { user } = useAuth();
  const toast = useToast();
  const vid = !!it && isVideo(it);
  const u = useGalleryUrl(it, 'disp');
  const vu = useGalleryUrl(vid ? it : undefined, 'orig');
  const [edit, setEdit] = useState(false);
  const [muted, setMuted] = useState(true); // videos start muted (gym audio can be loud; autoplay needs it)
  const [loop, setLoop] = useState(false);
  const vref = useRef<HTMLVideoElement>(null);
  const touch = useRef<{ x: number; y: number }>();
  const go = useCallback((d: number) => { const n = index + d; if (n >= 0 && n < list.length) { onIndex(n); setEdit(false); } }, [index, list.length, onIndex]);
  useEffect(() => { if (vref.current) vref.current.muted = muted; }, [muted, vu]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); } else if (e.key === 'ArrowRight') { e.preventDefault(); go(1); } else if (e.key === 'Escape') onClose();
      else if (vref.current && (e.key === 'm' || e.key === 'M')) setMuted((m) => !m);
      else if (vref.current && (e.key === 'l' || e.key === 'L')) setLoop((l) => !l);
      else if (vref.current && e.key === ' ' && tag !== 'BUTTON' && tag !== 'VIDEO') { e.preventDefault(); const v = vref.current; if (v.paused) v.play().catch(() => {}); else v.pause(); }
    };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [go, onClose]);
  if (!it) return null;
  const localOnlyHere = vid && it.localOnly && !!user;
  return (
    <div className="gv" role="dialog" aria-label={vid ? 'Video viewer' : 'Photo viewer'} data-testid="g-viewer"
      onTouchStart={(e) => {
        // don't treat drags on the video's control bar (scrubbing) as swipes
        const t = e.target as HTMLElement;
        if (t.tagName === 'VIDEO' && e.touches[0].clientY > t.getBoundingClientRect().bottom - 64) { touch.current = undefined; return; }
        touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }}
      onTouchEnd={(e) => { const t = touch.current; if (!t) return; const dx = e.changedTouches[0].clientX - t.x, dy = e.changedTouches[0].clientY - t.y; if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1); else if (dy > 110) onClose(); }}>
      <div className="gv-top">
        <button className="icon-btn" aria-label="Close" onClick={onClose}><Icon name="x" /></button>
        <span className="mono small">{index + 1} / {list.length}</span>
        <span className="spacer" />
        {vid && <button className={`icon-btn ${muted ? '' : 'on'}`} aria-label={muted ? 'Unmute (M)' : 'Mute (M)'} aria-pressed={!muted} onClick={() => setMuted((m) => !m)} data-testid="gv-mute"><Icon name={muted ? 'mute' : 'volume'} /></button>}
        {vid && <button className={`icon-btn ${loop ? 'on' : ''}`} aria-label={loop ? 'Loop on (L)' : 'Loop off (L)'} aria-pressed={loop} onClick={() => setLoop((l) => !l)} data-testid="gv-loop"><Icon name="repeat" /></button>}
        <button className="icon-btn" aria-label={`Download original ${kindWord(it)}`} onClick={async () => { const r = await download([it]); if (r.status === 'missing') toast(`This ${kindWord(it)} isn’t on this device`); }} data-testid="gv-download"><Icon name="download" /></button>
        <button className="icon-btn" aria-label="Edit details" onClick={() => setEdit((e) => !e)}><Icon name="edit" /></button>
        <button className="icon-btn" aria-label={`Delete ${kindWord(it)}`} onClick={() => onDelete(it)}><Icon name="trash" /></button>
      </div>
      <div className="gv-stage">
        {vid ? (
          vu ? <video key={it.id} ref={vref} src={vu} poster={u || undefined} controls playsInline autoPlay muted={muted} loop={loop} preload="metadata" controlsList="nodownload" disablePictureInPicture={false}
            onVolumeChange={(e) => setMuted(e.currentTarget.muted)} aria-label={it.caption || `${tagLabel(it.tag)} video`} data-testid="gv-video" />
            : <div className="gv-vwait">{u ? <img src={u} alt="" /> : null}<div className="muted small">{vu === '' ? (localOnlyHere ? 'This video is stored only on the device it was added on (too big for cloud backup).' : 'This video isn’t on this device.') : 'Loading video…'}</div></div>
        ) : u ? <img src={u} alt={it.caption || `${tagLabel(it.tag)} photo`} /> : <div className="muted">{u === '' ? 'This photo isn’t on this device.' : 'Loading…'}</div>}
        {index > 0 && <button className="gv-nav prev" aria-label="Previous" onClick={() => go(-1)}><Icon name="back" /></button>}
        {index < list.length - 1 && <button className="gv-nav next" aria-label="Next" onClick={() => go(1)}><Icon name="chevron" /></button>}
      </div>
      <div className="gv-info">
        {edit ? (
          <div className="gv-edit">
            <input className="input" placeholder="Caption" defaultValue={it.caption || ''} maxLength={140} onBlur={(e) => updatePhoto(it, { caption: e.target.value.trim() || undefined })} aria-label="Caption" />
            <div className="row wrap">
              {TAGS.map((t) => <button key={t.v} className={`chip ${it.tag === t.v ? 'on' : ''}`} onClick={() => updatePhoto(it, { tag: t.v })}>{t.label}</button>)}
              <input className="input" type="date" style={{ width: 170 }} value={it.date} max={new Date().toISOString().slice(0, 10)} onChange={(e) => e.target.value && updatePhoto(it, { date: e.target.value })} aria-label={vid ? 'Video date' : 'Photo date'} />
            </div>
          </div>
        ) : (
          <>
            <div className="row wrap"><span className={`g-tag inline t-${it.tag}`}>{tagLabel(it.tag)}</span><b>{fmtDay(it.date)}</b><span className="muted small">{vid ? `${fmtDuration(it.duration)} · ` : ''}{it.w ? `${it.w}×${it.h} · ` : ''}{fmtBytes(it.bytes.orig)}{vid && it.container ? ` · ${it.container.toUpperCase()}` : ''}</span>{localOnlyHere && <span className="pill" data-testid="gv-local-only">Device only</span>}</div>
            {it.caption && <div className="gv-cap">{it.caption}</div>}
            {it.hadGps && <div className="muted small"><Icon name="lock" size={12} /> Location data was removed from this {kindWord(it)}{vid ? ' (the video itself wasn’t changed)' : ''}.</div>}
            {vid && it.telemetry && <div className="small" style={{ color: 'var(--y)' }}>This video has a GPS track from an action camera that HYBRD can’t remove. Keep it private.</div>}
            {vid && it.playable === false && <div className="muted small">This browser couldn’t play this format when it was added (often iPhone HEVC outside Safari). Download it to watch at full quality.</div>}
            {localOnlyHere && <div className="muted small">Over the {fmtBytes(CLOUD_FILE_CAP)} cloud limit{it.cloudNote === 'refused' ? ' set on your storage bucket' : ''}, so the video stays on this device; its preview is backed up.</div>}
          </>
        )}
      </div>
    </div>
  );
}

function Compare({ pair, onClose }: { pair: [GalleryItem, GalleryItem]; onClose: () => void }) {
  const [a, b] = [...pair].sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : x.createdAt - y.createdAt));
  const ua = useGalleryUrl(a, 'disp'), ub = useGalleryUrl(b, 'disp');
  const days = daysBetween(a.date, b.date);
  return (
    <div className="gv cmp" role="dialog" aria-label="Compare photos" data-testid="g-compare">
      <div className="gv-top"><button className="icon-btn" aria-label="Close" onClick={onClose}><Icon name="x" /></button><h2 style={{ fontSize: 20 }}>Compare</h2><span className="spacer" /><span className="pill yellow">{days === 0 ? 'Same day' : `${days} day${days === 1 ? '' : 's'} apart`}</span></div>
      <div className="cmp-grid">
        {[[a, ua, 'Before'], [b, ub, 'After']].map(([it, u, l]) => {
          const x = it as GalleryItem;
          return <figure key={x.id}><div className="cmp-img">{u ? <img src={u as string} alt={`${l}: ${fmtDay(x.date)}`} /> : null}</div><figcaption><b>{l as string}</b> · {fmtDay(x.date)}{x.caption ? <div className="muted small">{x.caption}</div> : null}</figcaption></figure>;
        })}
      </div>
      <p className="muted small center">Same light, pose and distance make progress photos easier to compare.</p>
    </div>
  );
}

type Draft = Prepared & { tag: GalleryTag; caption: string };
function UploadSheet({ drafts, setDrafts, errors, busy, est, onClose, onSave }: { drafts: Draft[]; setDrafts: Dispatch<SetStateAction<Draft[]>>; errors: string[]; busy: number; est?: { usage?: number; quota?: number }; onClose: () => void; onSave: () => void }) {
  const upd = (k: string, p: Partial<Draft>) => setDrafts((ds) => ds.map((d) => (d.key === k ? { ...d, ...p } : d)));
  const gpsP = drafts.filter((d) => d.hadGps && d.kind !== 'video').length;
  const gpsV = drafts.filter((d) => d.hadGps && d.kind === 'video').length;
  const nV = drafts.filter((d) => d.kind === 'video').length, nP = drafts.length - nV;
  const open = drafts.length > 0 || errors.length > 0 || busy > 0;
  const total = drafts.reduce((n, d) => n + d.orig.size + d.disp.size + d.thumb.size, 0);
  const q = quotaState(est, total);
  return (
    <Sheet open={open} onClose={onClose} title={busy ? `Preparing ${plural(busy, 'file')}…` : `Add ${countWords(nP, nV)}`}>
      <div data-testid="g-upload">
        {errors.map((e) => <Banner key={e} tone="warn">{e}</Banner>)}
        {gpsP > 0 && <Banner tone="ok">Location data (GPS) found in {plural(gpsP, 'photo')} — it’s removed before saving.</Banner>}
        {gpsV > 0 && <Banner tone="ok">Location tags found in {plural(gpsV, 'video')} — removed. The video and sound are kept exactly as recorded.</Banner>}
        {q.state === 'full' && <Banner tone="warn">Not enough browser storage: these files need {fmtBytes(total)} but only about {fmtBytes(q.free)} is free. Remove a few (videos are the big ones) or free up space on this device.</Banner>}
        {q.state === 'near' && <Banner tone="warn">After saving, HYBRD will use {Math.round(q.pct * 100)}% of the storage this browser allows. Download a backup of older videos and delete them to keep room.</Banner>}
        {drafts.length > 1 && (
          <div className="row wrap" style={{ margin: '4px 0 12px' }}><span className="muted small">Tag all:</span>{TAGS.map((t) => <button key={t.v} className={`chip sm ${drafts.every((d) => d.tag === t.v) ? 'on' : ''}`} onClick={() => setDrafts((ds) => ds.map((d) => ({ ...d, tag: t.v })))}>{t.label}</button>)}</div>
        )}
        <div className="up-list">
          {drafts.map((d) => (
            <div className="up-row" key={d.key}>
              <span className={`up-thumb ${d.kind === 'video' ? 'vid' : ''}`}><img src={d.preview} alt="" />{d.kind === 'video' && <span className="g-dur mono">{fmtDuration(d.duration)}</span>}</span>
              <div className="up-f">
                <input className="input" placeholder="Caption (optional)" maxLength={140} value={d.caption} onChange={(e) => upd(d.key, { caption: e.target.value })} aria-label="Caption" />
                <div className="row wrap">
                  {TAGS.map((t) => <button key={t.v} className={`chip sm ${d.tag === t.v ? 'on' : ''}`} onClick={() => upd(d.key, { tag: t.v })}>{t.label}</button>)}
                  <input className="input sm" type="date" value={d.date} max={new Date().toISOString().slice(0, 10)} onChange={(e) => e.target.value && upd(d.key, { date: e.target.value, dateSource: 'manual' })} aria-label={d.kind === 'video' ? 'Video date' : 'Photo date'} />
                </div>
                <div className="muted small" data-testid="up-meta">{d.kind === 'video' ? `Video · ${fmtDuration(d.duration)} · ` : ''}{d.w ? `${d.w}×${d.h} · ` : ''}{fmtBytes(d.orig.size)}{d.dateSource === 'exif' ? ` · date from ${d.kind === 'video' ? 'video' : 'photo'}` : d.dateSource === 'file' ? ' · date from file' : ''}{d.hadGps ? ' · location removed' : ''}</div>
                {d.warn && <div className="small" style={{ color: 'var(--y)' }}>{d.warn}</div>}
              </div>
              <button className="icon-btn" aria-label={`Don’t add this ${d.kind === 'video' ? 'video' : 'photo'}`} onClick={() => { URL.revokeObjectURL(d.preview); setDrafts((ds) => ds.filter((x) => x.key !== d.key)); }}><Icon name="x" size={18} /></button>
            </div>
          ))}
        </div>
        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn y" style={{ flex: 1 }} disabled={!drafts.length || busy > 0 || q.state === 'full'} onClick={onSave} data-testid="g-save">Save {drafts.length ? countWords(nP, nV) : 'photos'}</button>
        </div>
        <p className="muted small" style={{ marginTop: 10 }}>Private to you. Photos are re-saved without hidden metadata (camera details, GPS location).{nV ? ' Videos keep their original quality — HYBRD doesn’t re-encode them. Phones also hide the recording location inside video files; HYBRD removes the location tags iPhone and Android cameras write, but can’t remove GPS tracks recorded by action cameras (GoPro-style).' : ''}</p>
      </div>
    </Sheet>
  );
}

/** Files too big to zip together: download them one at a time (browsers block a burst of automatic downloads). */
function BigDownload({ its, onClose }: { its: GalleryItem[] | null; onClose: () => void }) {
  const { download } = useMedia();
  const toast = useToast();
  const [done, setDone] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  useEffect(() => { setDone(new Set()); }, [its]);
  if (!its) return <Sheet open={false} onClose={onClose} title="">{null}</Sheet>;
  const plan = zipPlan(its);
  const photos = its.filter((i) => !isVideo(i));
  const one = async (it: GalleryItem) => { const r = await download([it]); if (r.status === 'missing') toast(`This ${kindWord(it)} isn’t on this device`); else setDone((d) => new Set(d).add(it.id)); };
  return (
    <Sheet open onClose={onClose} title="Too big for one .zip">
      <div data-testid="g-bigdl">
        <p className="muted small">These files add up to {fmtBytes(plan.total)}. Zipping more than {fmtBytes(ZIP_MAX)} at once can crash the browser on phones, so download them one by one — each keeps its original quality.</p>
        {photos.length > 1 && plan.photoTotal <= ZIP_MAX && <button className="btn" disabled={busy} style={{ width: '100%', margin: '6px 0 12px' }} onClick={async () => { setBusy(true); try { await download(photos); setDone((d) => { const n = new Set(d); photos.forEach((p) => n.add(p.id)); return n; }); } finally { setBusy(false); } }}><Icon name="download" size={16} />Photos only as .zip ({plural(photos.length, 'photo')}, {fmtBytes(plan.photoTotal)})</button>}
        <div className="dl-list">
          {its.map((it) => (
            <div className="dl-row" key={it.id}>
              <Icon name={isVideo(it) ? 'video' : 'image'} size={18} />
              <span className="dl-name">{downloadName(it)}<small className="muted"> · {fmtBytes(it.bytes.orig)}{isVideo(it) ? ` · ${fmtDuration(it.duration)}` : ''}</small></span>
              <button className={`btn sm ${done.has(it.id) ? '' : 'y'}`} onClick={() => one(it)} aria-label={`Download ${downloadName(it)}`}>{done.has(it.id) ? <Icon name="check" size={16} /> : <Icon name="download" size={16} />}</button>
            </div>
          ))}
        </div>
      </div>
    </Sheet>
  );
}

export default function Gallery() {
  const { items, avatarBytes, addPhotos, deletePhotos, download, uploading, synced, syncError } = useMedia();
  const { user } = useAuth();
  const toast = useToast();
  const [q, setQ] = useSearchParams();
  const tag = (['progress', 'training', 'other'].includes(q.get('tag') || '') ? q.get('tag') : 'all') as TagFilter;
  const type = (['photo', 'video'].includes(q.get('type') || '') ? q.get('type') : 'all') as TypeFilter;
  const list = useMemo(() => filterItems(items, tag, type), [items, tag, type]);
  const counts = tagCounts(items, type);
  const tcounts = typeCounts(items, tag);
  const u = usage(items, avatarBytes);
  const [selecting, setSelecting] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [view, setView] = useState<number | null>(null);
  const [cmp, setCmp] = useState<[GalleryItem, GalleryItem] | null>(null);
  const [confirm, setConfirm] = useState<GalleryItem[] | null>(null);
  const [big, setBig] = useState<GalleryItem[] | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(0);
  const [zipping, setZipping] = useState(false);
  const [est, setEst] = useState<{ usage?: number; quota?: number }>();
  const lib = useRef<HTMLInputElement>(null), cam = useRef<HTMLInputElement>(null), rec = useRef<HTMLInputElement>(null);
  useEffect(() => { navigator.storage?.estimate?.().then(setEst).catch(() => {}); }, [items.length]);
  useEffect(() => { setSel(new Set()); }, [tag, type]);
  const setFilter = (k: 'tag' | 'type', v: string) => { const n = new URLSearchParams(q); if (v === 'all') n.delete(k); else n.set(k, v); setQ(n, { replace: true }); };

  const onFiles = async (fl: FileList | null) => {
    const files = [...(fl || [])];
    if (!files.length) return;
    const errs: string[] = [];
    const known = files.map((f) => ({ f, c: checkMedia(f) }));
    const nVid = known.filter((x) => x.c.kind === 'video').length, nPic = known.filter((x) => x.c.kind === 'photo').length;
    for (const x of known) if (!x.c.kind || (x.c.kind === 'video' && !x.c.ok)) errs.push(x.c.error!);
    if (nPic > MAX_FILES) errs.push(`You picked ${nPic} photos — adding the first ${MAX_FILES}. Add the rest in another batch.`);
    if (nVid > MAX_VIDEOS) errs.push(`You picked ${nVid} videos — adding the first ${MAX_VIDEOS}. Add the rest in another batch.`);
    // keep the order the user picked them in, capped per type
    let cp = 0, cv = 0;
    const pick = known.filter((x) => (x.c.kind === 'photo' ? ++cp <= MAX_FILES : x.c.kind === 'video' && x.c.ok ? ++cv <= MAX_VIDEOS : false)).map((x) => x.f);
    setErrors([...errs]); setBusy(pick.length);
    const out: Draft[] = [];
    const defTag: GalleryTag = tag === 'all' ? 'training' : tag;
    for (const f of pick) {
      try { out.push({ ...(await (checkMedia(f).kind === 'video' ? prepareVideo(f) : preparePhoto(f))), tag: defTag, caption: '' }); } catch (e) { errs.push((e as Error).message); }
      setBusy((n) => n - 1);
    }
    navigator.storage?.estimate?.().then(setEst).catch(() => {});
    setErrors([...errs]); setDrafts((d) => [...d, ...out]); setBusy(0);
  };
  const closeUpload = () => { drafts.forEach((d) => URL.revokeObjectURL(d.preview)); setDrafts([]); setErrors([]); };
  const save = async () => {
    const nV = drafts.filter((d) => d.kind === 'video').length;
    try {
      const n = await addPhotos(drafts); setDrafts([]); setErrors([]); toast(`Saved ${countWords(n - nV, nV)}`);
    } catch (e) {
      setErrors([/quota/i.test((e as Error).name + (e as Error).message) ? 'This browser ran out of storage space. Some files may not have been saved — remove large videos or free up space on this device.' : `Couldn’t save: ${(e as Error).message}`]);
    }
  };
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const selected = list.filter((i) => sel.has(i.id));
  const selPhotos = selected.filter((i) => !isVideo(i));
  const doDownload = async (its: GalleryItem[]) => {
    setZipping(its.length > 1);
    try {
      const r = await download(its);
      const v = its.filter(isVideo).length;
      if (r.status === 'too-big') { setBig(its); return; }
      if (r.status === 'missing') { toast(its.length > 1 ? 'None of these files are on this device' : `This ${kindWord(its[0])} isn’t on this device`); return; }
      toast(its.length > 1 ? `Downloading ${countWords(r.saved - Math.min(v, r.saved), Math.min(v, r.saved))} (.zip)${r.missing ? ` · ${r.missing} not on this device` : ''}` : `Downloading ${kindWord(its[0])}`);
    } finally { setZipping(false); }
  };
  const doDelete = async () => {
    if (!confirm) return; const ids = confirm.map((i) => i.id);
    const nV = confirm.filter(isVideo).length;
    await deletePhotos(ids); setConfirm(null); setSel(new Set()); setSelecting(false);
    if (view !== null) { const left = list.length - ids.length; if (left <= 0) setView(null); else setView(Math.min(view, left - 1)); }
    toast(`Deleted ${countWords(ids.length - nV, nV)}`);
  };
  const cNV = confirm?.filter(isVideo).length || 0, cNP = (confirm?.length || 0) - cNV;
  const qs = quotaState(est);

  // month groups
  const groups: { m: string; its: GalleryItem[] }[] = [];
  for (const it of list) { const m = it.date.slice(0, 7); if (groups[groups.length - 1]?.m !== m) groups.push({ m, its: [] }); groups[groups.length - 1].its.push(it); }
  const emptyWhat = type === 'video' ? 'videos' : type === 'photo' ? 'photos' : 'photos or videos';

  return (
    <Page title="Gallery" kicker="Me · private" back="/me" wide actions={
      <>
        {list.length > 0 && <button className={`btn sm ${selecting ? 'y' : ''}`} onClick={() => { setSelecting((s) => !s); setSel(new Set()); }} data-testid="g-select" aria-label={selecting ? 'Done selecting' : 'Select'}>{selecting ? 'Done' : <><Icon name="select" size={18} /><span className="btn-l">Select</span></>}</button>}
        {coarse() && <button className="btn sm" onClick={() => cam.current?.click()} aria-label="Take a photo"><Icon name="camera" size={18} /></button>}
        {coarse() && <button className="btn sm" onClick={() => rec.current?.click()} aria-label="Record a video" data-testid="g-record"><Icon name="video" size={18} /></button>}
        <button className="btn sm y" onClick={() => lib.current?.click()} data-testid="g-add"><Icon name="plus" size={18} /><span className="btn-l">Add photos & videos</span></button>
      </>
    }>
      <input ref={lib} type="file" accept={`${ACCEPT},${VIDEO_ACCEPT}`} multiple hidden onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} data-testid="g-input" />
      <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
      <input ref={rec} type="file" accept="video/*" capture="environment" hidden onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} data-testid="g-rec-input" />

      <div className="g-bar">
        <div className="g-filterset">
          <div className="seg g-types" role="tablist" aria-label="Filter by type" data-testid="g-types">
            {(['all', 'photo', 'video'] as TypeFilter[]).map((t) => (
              <button key={t} role="tab" aria-selected={type === t} className={type === t ? 'on' : ''} onClick={() => setFilter('type', t)} data-testid={`g-type-${t}`}>
                {t === 'all' ? 'All' : t === 'photo' ? 'Photos' : 'Videos'} <span className="mono">{tcounts[t]}</span>
              </button>
            ))}
          </div>
          <div className="chips g-filters" role="tablist" aria-label="Filter by tag">
            {(['all', 'progress', 'training', 'other'] as TagFilter[]).map((t) => (
              <button key={t} role="tab" aria-selected={tag === t} className={`chip sm ${tag === t ? 'on' : ''}`} onClick={() => setFilter('tag', t)}>
                {t === 'all' ? 'All tags' : tagLabel(t)} <span className="mono">{counts[t]}</span>
              </button>
            ))}
          </div>
        </div>
        {list.length > 1 && !selecting && <button className="link" onClick={() => doDownload(list)} disabled={zipping} data-testid="g-download-all"><Icon name="download" size={14} /> {zipping ? 'Preparing…' : `Download ${tag === 'all' && type === 'all' ? 'all' : 'these'}`}</button>}
      </div>

      {list.length === 0 ? (
        <Card>
          <Empty icon={type === 'video' ? 'video' : 'image'} title={items.length ? `No ${tag === 'all' ? '' : tagLabel(tag as GalleryTag).toLowerCase() + ' '}${emptyWhat} yet` : 'Your photo & video gallery'}>
            Keep progress photos and training videos in one private place. Add one or many at a time (videos up to {fmtDuration(VIDEO_MAX_SECONDS)} and {fmtBytes(VIDEO_CAP)}) — tag them, add a caption, and compare two photos side by side.
          </Empty>
          <div className="center" style={{ marginTop: 12 }}><button className="btn y" onClick={() => lib.current?.click()}><Icon name="upload" size={18} />Add photos & videos</button></div>
        </Card>
      ) : groups.map((g) => (
        <section key={g.m} className="g-group">
          <h3 className="g-month">{fmtMonth(g.m + '-15')} <span className="muted small mono">{g.its.length}</span></h3>
          <div className="g-grid">{g.its.map((it) => <Tile key={it.id} it={it} selecting={selecting} selected={sel.has(it.id)} onToggle={() => toggle(it.id)} onOpen={() => setView(list.indexOf(it))} />)}</div>
        </section>
      ))}

      <Card className="g-store">
        <div className="row wrap"><Icon name="lock" size={18} className="y" /><b>Private to you</b><span className="spacer" /><span className="mono small" data-testid="g-usage">{plural(u.photos, 'photo')} · {plural(u.videos, 'video')} · {fmtBytes(u.bytes)}</span></div>
        {est?.quota ? (
          <div className="g-quota" data-testid="g-quota" title="Browser storage used by this site">
            <div className={`g-quota-bar ${qs.state}`}><span style={{ width: `${Math.max(1, Math.round(qs.pct * 100))}%` }} /></div>
            <span className="muted small">{fmtBytes(est.usage || 0)} of about {fmtBytes(est.quota)} browser storage used{u.videos ? ` · videos ${fmtBytes(u.videoBytes)}` : ''}</span>
          </div>
        ) : null}
        {qs.state === 'near' || qs.state === 'full' ? <Banner tone="warn">Browser storage is nearly full. Download older videos and delete them here, or new files may not save.</Banner> : null}
        <p className="muted small" style={{ margin: '8px 0 0' }}>
          No sharing, no public feed. Files are stored on this device{user ? ' and in your private account storage (only you can read it)' : ' (Local mode)'}. GPS location and other hidden metadata are removed from every photo, including downloads. Videos are kept exactly as recorded; HYBRD removes the location tags phones write into them, but not GPS tracks from action cameras.
          {user ? ` Videos over ${fmtBytes(CLOUD_FILE_CAP)} stay on this device only (cloud storage limit).` : ''}
          {' '}On iPhone, add HYBRD to your Home Screen — Safari can clear website data after 7 days without a visit — and download a backup now and then.
        </p>
        {user && <p className="small" style={{ margin: '8px 0 0', color: syncError ? 'var(--bad)' : 'var(--mut)' }}>{syncError ? `Gallery sync error: ${syncError}` : uploading ? `Uploading ${plural(uploading, 'file')}…` : synced ? 'Everything is backed up to your account (big videos stay on this device).' : 'Files will upload when you’re online.'}</p>}
      </Card>

      {selecting && (
        <div className="g-selbar" data-testid="g-selbar">
          <span><b>{sel.size}</b> selected</span>
          <button className="link" onClick={() => setSel(sel.size === list.length ? new Set() : new Set(list.map((i) => i.id)))}>{sel.size === list.length ? 'None' : 'All'}</button>
          <span className="spacer" />
          <button className="btn sm" disabled={!sel.size || zipping} onClick={() => doDownload(selected)} data-testid="g-dl-sel"><Icon name="download" size={16} /><span className="btn-l">{zipping ? 'Zipping…' : 'Download'}</span></button>
          <button className="btn sm" disabled={sel.size !== 2 || selPhotos.length !== 2} onClick={() => setCmp([selPhotos[0], selPhotos[1]])} title={selected.some(isVideo) ? 'Compare works with two photos (not videos)' : 'Pick two photos'} data-testid="g-compare-btn"><Icon name="compare" size={16} /><span className="btn-l">Compare</span></button>
          <button className="btn sm danger" disabled={!sel.size} onClick={() => setConfirm(selected)} aria-label="Delete selected"><Icon name="trash" size={16} /></button>
        </div>
      )}

      {view !== null && <Viewer list={list} index={view} onIndex={setView} onClose={() => setView(null)} onDelete={(it) => setConfirm([it])} />}
      {cmp && <Compare pair={cmp} onClose={() => setCmp(null)} />}
      <BigDownload its={big} onClose={() => setBig(null)} />
      <UploadSheet drafts={drafts} setDrafts={setDrafts} errors={errors} busy={busy} est={est} onClose={closeUpload} onSave={save} />
      <Sheet open={!!confirm} onClose={() => setConfirm(null)} title={`Delete ${confirm?.length === 1 ? kindWord(confirm[0]) : countWords(cNP, cNV)}?`}>
        <p>{confirm?.length === 1 ? `This ${kindWord(confirm[0])}` : 'These files'} will be removed from this device{user ? ' and your account' : ''}. This can’t be undone — download a copy first if you want to keep {confirm?.length === 1 ? 'it' : 'them'}.</p>
        <div className="row"><button className="btn ghost" onClick={() => setConfirm(null)}>Cancel</button><button className="btn danger" style={{ flex: 1 }} onClick={doDelete} data-testid="g-confirm-delete">Delete</button></div>
      </Sheet>
    </Page>
  );
}
