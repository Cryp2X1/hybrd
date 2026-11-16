// Profile photo: avatar (initials fallback), crop editor, and the Me › profile + gallery preview cards.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './Icon';
import { Card, Sheet } from './ui';
import { useStore } from '../lib/store';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { useMedia, decodeImage, renderAvatar, useGalleryUrl } from '../lib/gallery';
import { ACCEPT, checkFile, clampOffset, cropRect, initials, filterItems, fmtBytes, HEIC_ERROR, usage, type GalleryItem } from '../lib/media';

export function Avatar({ size = 40, className = '', ring }: { size?: number; className?: string; ring?: boolean }) {
  const { avatarUrl } = useMedia();
  const { profile } = useStore();
  const ini = initials(profile.name);
  return (
    <span className={`avatar ${ring ? 'ring' : ''} ${className}`} style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }} data-testid={avatarUrl ? 'avatar-img' : 'avatar-initials'}>
      {avatarUrl ? <img src={avatarUrl} alt="Your profile photo" draggable={false} /> : ini ? <span aria-label={`${profile.name} (no photo)`}>{ini}</span> : <Icon name="me" size={Math.round(size * 0.5)} />}
    </span>
  );
}

const STAGE = 280;
export function AvatarEditor({ file, onClose }: { file: File | null; onClose: () => void }) {
  const { setAvatar } = useMedia();
  const toast = useToast();
  const [img, setImg] = useState<{ url: string; w: number; h: number; src: CanvasImageSource; close(): void }>();
  const [err, setErr] = useState('');
  const [zoom, setZoom] = useState(1);
  const [off, setOff] = useState({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; z: number }>();

  useEffect(() => {
    if (!file) return;
    setErr(''); setZoom(1); setOff({ x: 0, y: 0 }); setImg(undefined);
    const chk = checkFile(file);
    if (!chk.ok) { setErr(chk.error!); return; }
    let alive = true; const url = URL.createObjectURL(file);
    decodeImage(file).then((d) => { if (alive) setImg({ url, ...d }); else d.close(); })
      .catch(() => alive && setErr(chk.heic ? HEIC_ERROR : 'This image couldn’t be opened. Try a JPEG or PNG.'));
    return () => { alive = false; URL.revokeObjectURL(url); };
  }, [file]);
  useEffect(() => () => img?.close(), [img]);

  const setZ = (z: number) => { const nz = Math.max(1, Math.min(4, z)); setZoom(nz); if (img) setOff((o) => clampOffset(img.w, img.h, STAGE, nz, o.x, o.y)); };
  const s = img ? (STAGE / Math.min(img.w, img.h)) * zoom : 1;
  const onDown = (e: React.PointerEvent) => { (e.target as Element).setPointerCapture?.(e.pointerId); ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (ptrs.current.size === 2) { const [a, b] = [...ptrs.current.values()]; pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), z: zoom }; } };
  const onMove = (e: React.PointerEvent) => {
    const p = ptrs.current.get(e.pointerId); if (!p || !img) return;
    if (ptrs.current.size === 2 && pinch.current) {
      ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const [a, b] = [...ptrs.current.values()];
      setZ(pinch.current.z * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.current.d)); return;
    }
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setOff((o) => clampOffset(img.w, img.h, STAGE, zoom, o.x + dx, o.y + dy));
  };
  const onUp = (e: React.PointerEvent) => { ptrs.current.delete(e.pointerId); if (ptrs.current.size < 2) pinch.current = undefined; };
  const save = async () => {
    if (!img) return; setSaving(true);
    try { await setAvatar(await renderAvatar(img.src, cropRect(img.w, img.h, STAGE, zoom, off.x, off.y))); toast('Profile photo saved'); onClose(); }
    catch (e) { setErr((e as Error).message); } finally { setSaving(false); }
  };
  return (
    <Sheet open={!!file} onClose={onClose} title="Profile photo">
      {err ? <div className="banner warn" role="alert"><Icon name="info" size={18} /><div>{err}</div></div> : (
        <div className="crop" data-testid="avatar-crop">
          <div className="crop-stage" style={{ width: STAGE, height: STAGE }} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
            onWheel={(e) => setZ(zoom * (e.deltaY < 0 ? 1.08 : 0.93))}>
            {img && <img src={img.url} alt="" draggable={false} style={{ width: img.w * s, height: img.h * s, left: (STAGE - img.w * s) / 2 + off.x, top: (STAGE - img.h * s) / 2 + off.y }} />}
            <div className="crop-mask" />
          </div>
          <label className="crop-zoom"><Icon name="minus" size={16} /><input type="range" min={1} max={4} step={0.01} value={zoom} onChange={(e) => setZ(+e.target.value)} aria-label="Zoom" /><Icon name="plus" size={16} /></label>
          <p className="muted small center">Drag to reposition · pinch or slide to zoom. Saved as a 512 px image; location data is removed.</p>
          <div className="row"><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn y" style={{ flex: 1 }} disabled={!img || saving} onClick={save} data-testid="avatar-save">{saving ? 'Saving…' : 'Use this photo'}</button></div>
        </div>
      )}
    </Sheet>
  );
}

/** Me: profile header with the avatar, change / take / remove photo. */
export function ProfilePhotoCard() {
  const { profile } = useStore();
  const { user, configured } = useAuth();
  const { avatarUrl, removeAvatar } = useMedia();
  const toast = useToast();
  const [menu, setMenu] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const lib = useRef<HTMLInputElement>(null), cam = useRef<HTMLInputElement>(null);
  const pick = (f?: File) => { setMenu(false); if (f) setFile(f); };
  return (
    <Card className="me-head">
      <button className="me-av" onClick={() => setMenu(true)} aria-label={avatarUrl ? 'Change profile photo' : 'Add profile photo'} data-testid="avatar-button">
        <Avatar size={84} ring />
        <span className="me-av-cam"><Icon name="camera" size={15} /></span>
      </button>
      <div className="me-head-t">
        <div className="kicker">{user ? user.email || 'Signed in' : configured ? 'Not signed in' : 'Local mode'}</div>
        <h2>{profile.name || 'Your profile'}</h2>
        <button className="link" onClick={() => setMenu(true)}>{avatarUrl ? 'Change photo' : 'Add a profile photo'}</button>
      </div>
      <input ref={lib} type="file" accept={ACCEPT} hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} data-testid="avatar-input" />
      <input ref={cam} type="file" accept="image/*" capture="user" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
      <Sheet open={menu} onClose={() => setMenu(false)} title="Profile photo">
        <div className="stack">
          <button className="btn block" onClick={() => lib.current?.click()}><Icon name="image" size={18} />Choose a photo</button>
          <button className="btn block" onClick={() => cam.current?.click()}><Icon name="camera" size={18} />Take a selfie</button>
          {avatarUrl && <button className="btn block danger" onClick={async () => { await removeAvatar(); setMenu(false); toast('Profile photo removed'); }}><Icon name="trash" size={18} />Remove photo</button>}
          <p className="muted small">Only you see it. It stays on this device{user ? ' and in your private account storage' : ''}.</p>
        </div>
      </Sheet>
      <AvatarEditor file={file} onClose={() => setFile(null)} />
    </Card>
  );
}

function Thumb({ it }: { it: GalleryItem }) {
  const u = useGalleryUrl(it, 'thumb');
  return <span className="gp-thumb">{u ? <img src={u} alt={it.caption || `${it.tag} photo`} /> : <Icon name="image" size={18} />}</span>;
}
/** Me: latest photos + link to the gallery. */
export function GalleryPreview() {
  const { items, avatarBytes } = useMedia();
  const list = filterItems(items, 'all');
  const u = usage(items, avatarBytes);
  return (
    <Card className="gallery-preview">
      <div className="card-head"><h3>Gallery</h3><Link to="/me/gallery" data-testid="open-gallery">{list.length ? 'Open' : 'Add photos'} →</Link></div>
      {list.length ? (
        <Link to="/me/gallery" className="gp-grid">{list.slice(0, 4).map((it) => <Thumb key={it.id} it={it} />)}</Link>
      ) : (
        <Link to="/me/gallery" className="gp-empty"><Icon name="image" size={26} /><span>Progress and training photos, private to you.</span></Link>
      )}
      <div className="muted small" style={{ marginTop: 10 }}>{u.photos} photo{u.photos === 1 ? '' : 's'} · {fmtBytes(u.bytes)} on this device</div>
    </Card>
  );
}
