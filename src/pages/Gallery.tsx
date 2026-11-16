// Me › Gallery: private progress / training photos. Upload one or many, tag + caption + date, grid by month with tag
// filter, full-screen viewer (swipe / arrows / keys), multi-select, download (original or ZIP), delete, before/after compare.
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Page, Card, Sheet, Banner, Empty } from '../components/ui';
import { Icon } from '../components/Icon';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { useMedia, preparePhoto, useGalleryUrl, type Prepared } from '../lib/gallery';
import { ACCEPT, MAX_FILES, TAGS, filterItems, tagCounts, usage, fmtBytes, daysBetween, type GalleryItem, type GalleryTag, type TagFilter } from '../lib/media';

const fmtDay = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const fmtMonth = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
const tagLabel = (t: GalleryTag) => TAGS.find((x) => x.v === t)!.label;
const coarse = () => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

function Tile({ it, selecting, selected, onOpen, onToggle }: { it: GalleryItem; selecting: boolean; selected: boolean; onOpen: () => void; onToggle: () => void }) {
  const u = useGalleryUrl(it, 'thumb');
  return (
    <button className={`g-tile ${selected ? 'sel' : ''}`} onClick={selecting ? onToggle : onOpen} aria-pressed={selecting ? selected : undefined} aria-label={`${tagLabel(it.tag)} photo, ${fmtDay(it.date)}${it.caption ? `: ${it.caption}` : ''}`} data-testid="g-tile">
      {u ? <img src={u} alt="" loading="lazy" /> : <span className="g-missing"><Icon name="image" size={22} />{u === '' && <small>Not on this device</small>}</span>}
      <span className={`g-tag t-${it.tag}`}>{tagLabel(it.tag)}</span>
      {selecting && <span className="g-check">{selected && <Icon name="check" size={16} stroke={3} />}</span>}
    </button>
  );
}

function Viewer({ list, index, onIndex, onClose, onDelete }: { list: GalleryItem[]; index: number; onIndex: (i: number) => void; onClose: () => void; onDelete: (it: GalleryItem) => void }) {
  const it = list[index];
  const { download, updatePhoto } = useMedia();
  const u = useGalleryUrl(it, 'disp');
  const [edit, setEdit] = useState(false);
  const touch = useRef<{ x: number; y: number }>();
  const go = useCallback((d: number) => { const n = index + d; if (n >= 0 && n < list.length) { onIndex(n); setEdit(false); } }, [index, list.length, onIndex]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.target as HTMLElement).tagName === 'INPUT') return; if (e.key === 'ArrowLeft') go(-1); else if (e.key === 'ArrowRight') go(1); else if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [go, onClose]);
  if (!it) return null;
  return (
    <div className="gv" role="dialog" aria-label="Photo viewer" data-testid="g-viewer"
      onTouchStart={(e) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
      onTouchEnd={(e) => { const t = touch.current; if (!t) return; const dx = e.changedTouches[0].clientX - t.x, dy = e.changedTouches[0].clientY - t.y; if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1); else if (dy > 110) onClose(); }}>
      <div className="gv-top">
        <button className="icon-btn" aria-label="Close" onClick={onClose}><Icon name="x" /></button>
        <span className="mono small">{index + 1} / {list.length}</span>
        <span className="spacer" />
        <button className="icon-btn" aria-label="Download original" onClick={() => download([it])} data-testid="gv-download"><Icon name="download" /></button>
        <button className="icon-btn" aria-label="Edit details" onClick={() => setEdit((e) => !e)}><Icon name="edit" /></button>
        <button className="icon-btn" aria-label="Delete photo" onClick={() => onDelete(it)}><Icon name="trash" /></button>
      </div>
      <div className="gv-stage">
        {u ? <img src={u} alt={it.caption || `${tagLabel(it.tag)} photo`} /> : <div className="muted">{u === '' ? 'This photo isn’t on this device.' : 'Loading…'}</div>}
        {index > 0 && <button className="gv-nav prev" aria-label="Previous photo" onClick={() => go(-1)}><Icon name="back" /></button>}
        {index < list.length - 1 && <button className="gv-nav next" aria-label="Next photo" onClick={() => go(1)}><Icon name="chevron" /></button>}
      </div>
      <div className="gv-info">
        {edit ? (
          <div className="gv-edit">
            <input className="input" placeholder="Caption" defaultValue={it.caption || ''} maxLength={140} onBlur={(e) => updatePhoto(it, { caption: e.target.value.trim() || undefined })} aria-label="Caption" />
            <div className="row wrap">
              {TAGS.map((t) => <button key={t.v} className={`chip ${it.tag === t.v ? 'on' : ''}`} onClick={() => updatePhoto(it, { tag: t.v })}>{t.label}</button>)}
              <input className="input" type="date" style={{ width: 170 }} value={it.date} max={new Date().toISOString().slice(0, 10)} onChange={(e) => e.target.value && updatePhoto(it, { date: e.target.value })} aria-label="Photo date" />
            </div>
          </div>
        ) : (
          <>
            <div className="row"><span className={`g-tag inline t-${it.tag}`}>{tagLabel(it.tag)}</span><b>{fmtDay(it.date)}</b><span className="muted small">{it.w}×{it.h} · {fmtBytes(it.bytes.orig)}</span></div>
            {it.caption && <div className="gv-cap">{it.caption}</div>}
            {it.hadGps && <div className="muted small"><Icon name="lock" size={12} /> Location data was removed from this photo.</div>}
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
function UploadSheet({ drafts, setDrafts, errors, busy, onClose, onSave }: { drafts: Draft[]; setDrafts: Dispatch<SetStateAction<Draft[]>>; errors: string[]; busy: number; onClose: () => void; onSave: () => void }) {
  const upd = (k: string, p: Partial<Draft>) => setDrafts((ds) => ds.map((d) => (d.key === k ? { ...d, ...p } : d)));
  const gps = drafts.filter((d) => d.hadGps).length;
  const open = drafts.length > 0 || errors.length > 0 || busy > 0;
  return (
    <Sheet open={open} onClose={onClose} title={busy ? `Preparing ${busy} photo${busy === 1 ? '' : 's'}…` : `Add ${drafts.length} photo${drafts.length === 1 ? '' : 's'}`}>
      <div data-testid="g-upload">
        {errors.map((e) => <Banner key={e} tone="warn">{e}</Banner>)}
        {gps > 0 && <Banner tone="ok">Location data (GPS) found in {gps} photo{gps === 1 ? '' : 's'} — it’s removed before saving.</Banner>}
        {drafts.length > 1 && (
          <div className="row wrap" style={{ margin: '4px 0 12px' }}><span className="muted small">Tag all:</span>{TAGS.map((t) => <button key={t.v} className={`chip sm ${drafts.every((d) => d.tag === t.v) ? 'on' : ''}`} onClick={() => setDrafts((ds) => ds.map((d) => ({ ...d, tag: t.v })))}>{t.label}</button>)}</div>
        )}
        <div className="up-list">
          {drafts.map((d) => (
            <div className="up-row" key={d.key}>
              <img src={d.preview} alt="" />
              <div className="up-f">
                <input className="input" placeholder="Caption (optional)" maxLength={140} value={d.caption} onChange={(e) => upd(d.key, { caption: e.target.value })} aria-label="Caption" />
                <div className="row wrap">
                  {TAGS.map((t) => <button key={t.v} className={`chip sm ${d.tag === t.v ? 'on' : ''}`} onClick={() => upd(d.key, { tag: t.v })}>{t.label}</button>)}
                  <input className="input sm" type="date" value={d.date} max={new Date().toISOString().slice(0, 10)} onChange={(e) => e.target.value && upd(d.key, { date: e.target.value, dateSource: 'manual' })} aria-label="Photo date" />
                </div>
                <div className="muted small">{d.w}×{d.h} · {fmtBytes(d.orig.size)}{d.dateSource === 'exif' ? ' · date from photo' : d.dateSource === 'file' ? ' · date from file' : ''}{d.hadGps ? ' · location removed' : ''}</div>
                {d.warn && <div className="small" style={{ color: 'var(--y)' }}>{d.warn}</div>}
              </div>
              <button className="icon-btn" aria-label="Don’t add this photo" onClick={() => { URL.revokeObjectURL(d.preview); setDrafts((ds) => ds.filter((x) => x.key !== d.key)); }}><Icon name="x" size={18} /></button>
            </div>
          ))}
        </div>
        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn y" style={{ flex: 1 }} disabled={!drafts.length || busy > 0} onClick={onSave} data-testid="g-save">Save {drafts.length || ''} photo{drafts.length === 1 ? '' : 's'}</button>
        </div>
        <p className="muted small" style={{ marginTop: 10 }}>Photos are private to you. HYBRD re-saves each one without its hidden metadata (camera details, GPS location).</p>
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
  const list = useMemo(() => filterItems(items, tag), [items, tag]);
  const counts = tagCounts(items);
  const u = usage(items, avatarBytes);
  const [selecting, setSelecting] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [view, setView] = useState<number | null>(null);
  const [cmp, setCmp] = useState<[GalleryItem, GalleryItem] | null>(null);
  const [confirm, setConfirm] = useState<GalleryItem[] | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(0);
  const [zipping, setZipping] = useState(false);
  const [est, setEst] = useState<{ usage?: number; quota?: number }>();
  const lib = useRef<HTMLInputElement>(null), cam = useRef<HTMLInputElement>(null);
  useEffect(() => { navigator.storage?.estimate?.().then(setEst).catch(() => {}); }, [items.length]);
  useEffect(() => { setSel(new Set()); }, [tag]);

  const onFiles = async (fl: FileList | null) => {
    const files = [...(fl || [])];
    if (!files.length) return;
    const errs: string[] = [];
    if (files.length > MAX_FILES) errs.push(`You picked ${files.length} photos — adding the first ${MAX_FILES}. Add the rest in another batch.`);
    const pick = files.slice(0, MAX_FILES);
    setErrors(errs); setBusy(pick.length);
    const out: Draft[] = [];
    const defTag: GalleryTag = tag === 'all' ? 'training' : tag;
    for (const f of pick) {
      try { out.push({ ...(await preparePhoto(f)), tag: defTag, caption: '' }); } catch (e) { errs.push((e as Error).message); }
      setBusy((n) => n - 1);
    }
    setErrors([...errs]); setDrafts((d) => [...d, ...out]); setBusy(0);
  };
  const closeUpload = () => { drafts.forEach((d) => URL.revokeObjectURL(d.preview)); setDrafts([]); setErrors([]); };
  const save = async () => { const n = await addPhotos(drafts); setDrafts([]); setErrors([]); toast(`Saved ${n} photo${n === 1 ? '' : 's'}`); };
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const selected = list.filter((i) => sel.has(i.id));
  const doDownload = async (its: GalleryItem[]) => { setZipping(its.length > 1); try { await download(its); toast(its.length > 1 ? `Downloading ${its.length} photos (.zip)` : 'Downloading photo'); } finally { setZipping(false); } };
  const doDelete = async () => {
    if (!confirm) return; const ids = confirm.map((i) => i.id);
    await deletePhotos(ids); setConfirm(null); setSel(new Set()); setSelecting(false);
    if (view !== null) { const left = list.length - ids.length; if (left <= 0) setView(null); else setView(Math.min(view, left - 1)); }
    toast(`Deleted ${ids.length} photo${ids.length === 1 ? '' : 's'}`);
  };

  // month groups
  const groups: { m: string; its: GalleryItem[] }[] = [];
  for (const it of list) { const m = it.date.slice(0, 7); if (groups[groups.length - 1]?.m !== m) groups.push({ m, its: [] }); groups[groups.length - 1].its.push(it); }

  return (
    <Page title="Gallery" kicker="Me · private photos" back="/me" wide actions={
      <>
        {list.length > 0 && <button className={`btn sm ${selecting ? 'y' : ''}`} onClick={() => { setSelecting((s) => !s); setSel(new Set()); }} data-testid="g-select">{selecting ? 'Done' : 'Select'}</button>}
        {coarse() && <button className="btn sm" onClick={() => cam.current?.click()} aria-label="Take a photo"><Icon name="camera" size={18} /></button>}
        <button className="btn sm y" onClick={() => lib.current?.click()} data-testid="g-add"><Icon name="plus" size={18} /><span className="btn-l">Add photos</span></button>
      </>
    }>
      <input ref={lib} type="file" accept={ACCEPT} multiple hidden onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} data-testid="g-input" />
      <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />

      <div className="g-bar">
        <div className="chips g-filters" role="tablist" aria-label="Filter by tag">
          {(['all', 'progress', 'training', 'other'] as TagFilter[]).map((t) => (
            <button key={t} role="tab" aria-selected={tag === t} className={`chip sm ${tag === t ? 'on' : ''}`} onClick={() => setQ(t === 'all' ? {} : { tag: t }, { replace: true })}>
              {t === 'all' ? 'All' : tagLabel(t)} <span className="mono">{counts[t]}</span>
            </button>
          ))}
        </div>
        {list.length > 1 && !selecting && <button className="link" onClick={() => doDownload(list)} disabled={zipping} data-testid="g-download-all"><Icon name="download" size={14} /> {zipping ? 'Preparing…' : `Download ${tag === 'all' ? 'all' : tagLabel(tag as GalleryTag).toLowerCase()}`}</button>}
      </div>

      {list.length === 0 ? (
        <Card>
          <Empty icon="image" title={items.length ? `No ${tagLabel(tag as GalleryTag).toLowerCase()} photos yet` : 'Your photo gallery'}>
            Keep progress and training photos in one private place. Add one or many at a time — tag them, add a caption, and compare two side by side.
          </Empty>
          <div className="center" style={{ marginTop: 12 }}><button className="btn y" onClick={() => lib.current?.click()}><Icon name="upload" size={18} />Add photos</button></div>
        </Card>
      ) : groups.map((g) => (
        <section key={g.m} className="g-group">
          <h3 className="g-month">{fmtMonth(g.m + '-15')} <span className="muted small mono">{g.its.length}</span></h3>
          <div className="g-grid">{g.its.map((it) => <Tile key={it.id} it={it} selecting={selecting} selected={sel.has(it.id)} onToggle={() => toggle(it.id)} onOpen={() => setView(list.indexOf(it))} />)}</div>
        </section>
      ))}

      <Card className="g-store">
        <div className="row wrap"><Icon name="lock" size={18} className="y" /><b>Private to you</b><span className="spacer" /><span className="mono small" data-testid="g-usage">{u.photos} photo{u.photos === 1 ? '' : 's'} · {fmtBytes(u.bytes)}</span></div>
        <p className="muted small" style={{ margin: '8px 0 0' }}>
          No sharing, no public feed. Photos are stored on this device{user ? ' and in your private account storage (only you can read it)' : ' (Local mode)'}. GPS location and other hidden metadata are removed from every photo, including downloads. Downloads keep the full-quality copy (up to 10 MB each).
          {est?.quota ? ` This browser has about ${fmtBytes(Math.max(0, est.quota - (est.usage || 0)))} free for HYBRD.` : ''}
          {' '}On iPhone, add HYBRD to your Home Screen — Safari can clear website data after 7 days without a visit — and download a backup now and then.
        </p>
        {user && <p className="small" style={{ margin: '8px 0 0', color: syncError ? 'var(--bad)' : 'var(--mut)' }}>{syncError ? `Photo sync error: ${syncError}` : uploading ? `Uploading ${uploading} photo${uploading === 1 ? '' : 's'}…` : synced ? 'All photos backed up to your account.' : 'Photos will upload when you’re online.'}</p>}
      </Card>

      {selecting && (
        <div className="g-selbar" data-testid="g-selbar">
          <span><b>{sel.size}</b> selected</span>
          <button className="link" onClick={() => setSel(sel.size === list.length ? new Set() : new Set(list.map((i) => i.id)))}>{sel.size === list.length ? 'None' : 'All'}</button>
          <span className="spacer" />
          <button className="btn sm" disabled={!sel.size || zipping} onClick={() => doDownload(selected)} data-testid="g-dl-sel"><Icon name="download" size={16} /><span className="btn-l">{zipping ? 'Zipping…' : 'Download'}</span></button>
          <button className="btn sm" disabled={sel.size !== 2} onClick={() => setCmp([selected[0], selected[1]])} title="Pick two photos" data-testid="g-compare-btn"><Icon name="compare" size={16} /><span className="btn-l">Compare</span></button>
          <button className="btn sm danger" disabled={!sel.size} onClick={() => setConfirm(selected)} aria-label="Delete selected"><Icon name="trash" size={16} /></button>
        </div>
      )}

      {view !== null && <Viewer list={list} index={view} onIndex={setView} onClose={() => setView(null)} onDelete={(it) => setConfirm([it])} />}
      {cmp && <Compare pair={cmp} onClose={() => setCmp(null)} />}
      <UploadSheet drafts={drafts} setDrafts={setDrafts} errors={errors} busy={busy} onClose={closeUpload} onSave={save} />
      <Sheet open={!!confirm} onClose={() => setConfirm(null)} title={`Delete ${confirm?.length === 1 ? 'photo' : `${confirm?.length} photos`}?`}>
        <p>{confirm?.length === 1 ? 'This photo' : 'These photos'} will be removed from this device{user ? ' and your account' : ''}. This can’t be undone — download a copy first if you want to keep {confirm?.length === 1 ? 'it' : 'them'}.</p>
        <div className="row"><button className="btn ghost" onClick={() => setConfirm(null)}>Cancel</button><button className="btn danger" style={{ flex: 1 }} onClick={doDelete} data-testid="g-confirm-delete">Delete</button></div>
      </Sheet>
    </Page>
  );
}
