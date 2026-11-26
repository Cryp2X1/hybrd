// Share an activity: image preview (1:1 · 4:5 · 9:16; map / route / sticker / stats), post to the HYBRD feed,
// Instagram / Facebook / X / copy link / more, and downloads (PNG + privacy-trimmed GPX).
// Everything here is built from publicActivity() — the privacy-trimmed payload — never the raw route.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sheet, Segmented, Banner } from './ui';
import { Icon, BrandIcon } from './Icon';
import { useStore } from '../lib/store';
import { useSocial } from '../lib/socialStore';
import { useToast } from '../lib/toast';
import { saveBlob } from '../lib/gallery';
import { workoutCard } from '../lib/social';
import { friendlyError } from '../lib/socialApi';
import { activityLabel } from '../lib/calc';
import { publicActivity, shareGpx, shareText, xIntentUrl, facebookShareUrl, shareFileName, IMAGE_STYLES, RATIOS, visibilityLabel, type ImageStyle, type Ratio } from '../lib/share';
import { renderShareImage, type Rendered } from '../lib/shareImage';
import { useActivityPublisher } from '../lib/useShare';
import { activityError } from '../lib/activities';
import { prefsOf, clampVisibility, type Visibility } from '../lib/privacy';
import { VisibilityPicker } from './ActivityPrivacy';
import type { GpsRoute, Workout } from '../lib/types';

const canShareFiles = (f: File) => { try { return !!navigator.canShare?.({ files: [f] }); } catch { return false; } };
const openOut = (url: string) => { window.open(url, '_blank', 'noopener,noreferrer'); };

export function ShareSheet({ open, onClose, w, route }: { open: boolean; onClose: () => void; w: Workout; route?: GpsRoute }) {
  const { profile, upsert } = useStore();
  const { backend, me, mode } = useSocial();
  const toast = useToast();
  const pub = useActivityPublisher();
  const u = profile.units;
  const prefs = prefsOf(profile);
  const a = useMemo(() => publicActivity(w, route, profile), [w, route, profile]);
  const hasMap = !!a.route;
  const [ratio, setRatio] = useState<Ratio>('square');
  const [style, setStyle] = useState<ImageStyle>(hasMap ? 'map' : 'stats');
  const [img, setImg] = useState<Rendered | null>(null);
  const [rendering, setRendering] = useState(false);
  const [busy, setBusy] = useState('');
  const [igHelp, setIgHelp] = useState(false);
  const [askVis, setAskVis] = useState<null | 'link' | 'post'>(null);
  const [caption, setCaption] = useState('');
  const gen = useRef(0);
  const strava = w.source === 'strava';
  const ls = pub.linkState(w);
  const link = ls === 'ready' && w.shareId ? pub.linkFor(w.shareId) : '';
  const text = shareText(a, u);
  const author = me?.username;
  useEffect(() => { if (!hasMap && style !== 'stats' && style !== 'transparent') setStyle('stats'); }, [hasMap, style]);
  useEffect(() => {
    if (!open || strava) return;
    const g = ++gen.current; setRendering(true);
    renderShareImage(a, { ratio, style, units: u, author }).then((r) => { if (g === gen.current) { setImg((old) => { if (old) URL.revokeObjectURL(old.url); return r; }); } }).catch(() => toast('Couldn’t make the image')).finally(() => { if (g === gen.current) setRendering(false); });
  }, [open, a, ratio, style, u, author, strava]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) { setCaption(w.description || ''); setIgHelp(false); setAskVis(null); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const file = () => (img ? new File([img.blob], shareFileName(a, 'png', style === 'transparent' ? 'sticker' : ratio), { type: 'image/png' }) : null);
  const download = () => { if (!img) return; saveBlob(img.blob, shareFileName(a, 'png', style === 'transparent' ? 'sticker' : ratio)); toast('Image saved to your downloads'); };
  const gpx = () => { const g = shareGpx(w, route, profile); if (!g) return; saveBlob(new Blob([g], { type: 'application/gpx+xml' }), shareFileName(a, 'gpx')); toast('GPX saved — start & end hidden'); };
  const setVisibility = (v: Visibility) => { const nw = { ...w, visibility: clampVisibility(v, prefs.minor), updatedAt: Date.now() }; upsert<Workout>('workouts', nw); return nw; };

  // Link: publish (or refresh) the shared copy, then return its URL.
  const ensureLink = async (nw: Workout = w): Promise<string> => {
    const st = pub.linkState(nw);
    if (st === 'needs-visibility') { setAskVis('link'); return ''; }
    if (st !== 'ready') return '';
    setBusy('link');
    try {
      const sq = style === 'stats' || !hasMap ? img?.blob : (await renderShareImage(a, { ratio: 'square', style: 'map', units: u, author })).blob;
      const id = await pub.publish(nw, route, sq);
      return id ? pub.linkFor(id) : '';
    } catch (e) { toast(activityError(e)); return ''; } finally { setBusy(''); }
  };
  const copy = async (nw?: Workout) => {
    const l = link || (await ensureLink(nw));
    if (!l) return;
    try { await navigator.clipboard.writeText(l); toast('Link copied'); } catch { window.prompt('Copy this link', l); }
  };
  const shareX = async () => { const l = ls === 'ready' ? link || (await ensureLink()) : ''; openOut(xIntentUrl(caption.trim() ? `${caption.trim()} — ${text}` : text, l || undefined)); };
  const shareFb = async () => {
    const f = file();
    if (ls !== 'ready' && f && canShareFiles(f)) { try { await navigator.share({ files: [f], title: a.title }); } catch { /* cancelled */ } return; }
    const l = link || (await ensureLink()); if (l) openOut(facebookShareUrl(l));
  };
  const shareIg = async () => {
    const f = file(); if (!f) return;
    if (canShareFiles(f)) { try { await navigator.share({ files: [f], title: a.title }); return; } catch (e) { if ((e as Error).name === 'AbortError') return; } }
    download(); setIgHelp(true);
  };
  const more = async () => {
    const f = file(); const l = ls === 'ready' ? link || (await ensureLink()) : '';
    try {
      if (f && canShareFiles(f)) await navigator.share({ files: [f], title: a.title, text: l ? `${text} ${l}` : text });
      else if (navigator.share) await navigator.share({ title: a.title, text, ...(l ? { url: l } : {}) });
      else { download(); }
    } catch { /* cancelled */ }
  };
  const post = async (nw: Workout = w) => {
    if (!backend || !me) return;
    const v = nw.visibility || 'only-me';
    if (v === 'only-me') { setAskVis('post'); return; }
    if (!img) return;
    setBusy('post');
    try {
      const feedImg = ratio === 'story' ? await renderShareImage(a, { ratio: 'portrait', style, units: u, author }) : img;
      const audience = v === 'public' && !me.isMinor && me.privacy === 'public' ? 'public' : 'friends';
      const id = await backend.createPost({ text: caption.trim() || a.title, images: [{ blob: feedImg.blob, w: feedImg.w, h: feedImg.h }], workout: workoutCard({ ...nw, kcal: prefs.shareHealth ? nw.kcal : undefined }, activityLabel(nw)), audience });
      upsert<Workout>('workouts', { ...nw, postId: id, updatedAt: Date.now() });
      if (pub.canPublish) pub.publish(nw, route, null).catch(() => {});
      toast(audience === 'public' ? 'Posted to HYBRD · Everyone' : 'Posted to HYBRD · Friends');
    } catch (e) { toast(friendlyError(e)); } finally { setBusy(''); }
  };
  const pickVis = async (v: Visibility) => { const nw = setVisibility(v); const what = askVis; setAskVis(null); if (what === 'link') await copy(nw); else if (what === 'post') await post(nw); };

  const linkNote = ls === 'local' ? 'Share links work once accounts are switched on for HYBRD (local mode). You can still download the image or share it straight to apps.'
    : ls === 'demo' ? 'Demo mode: links work once accounts are on. Posting goes to the demo feed with SAMPLE people only.'
    : ls === 'signin' ? 'Sign in to get a share link.'
    : ls === 'needs-profile' ? 'Set up your HYBRD public profile to get share links.' : '';

  return (
    <Sheet open={open} onClose={onClose} title="Share activity">
      {strava ? <Banner>Activities from Strava can’t be shared from HYBRD (Strava’s API terms keep that data private to you). Share it from the Strava app instead.</Banner> : <>
      <div className={`share-prev r-${ratio} ${style === 'transparent' ? 'checker' : ''}`} data-testid="share-preview">
        {img ? <img src={img.url} alt={`Share image: ${a.title}`} /> : <div className="share-prev-ph" />}
        {rendering && <div className="share-prev-busy"><span className="spin" /></div>}
      </div>
      <div className="share-opts">
        <Segmented small value={ratio} onChange={setRatio} options={(Object.keys(RATIOS) as Ratio[]).map((r) => ({ v: r, label: `${RATIOS[r].label} ${RATIOS[r].sub}` }))} />
        <div className="chips share-styles">{IMAGE_STYLES.filter((s) => hasMap || s.v === 'stats' || s.v === 'transparent').map((s) => <button key={s.v} type="button" className={`chip ${style === s.v ? 'on' : ''}`} onClick={() => setStyle(s.v)} data-testid={`style-${s.v}`} title={s.sub}>{s.label}</button>)}</div>
        {a.privacyNote && <p className="muted small share-priv" data-testid="share-privacy"><Icon name="shield" size={14} /> {a.privacyNote} Same for the link, the post and the GPX. <Link className="link" to={`/settings/privacy`}>Privacy settings</Link></p>}
      </div>
      <label className="field"><span>Caption</span><input value={caption} maxLength={280} onChange={(e) => setCaption(e.target.value)} placeholder={a.title} data-testid="share-caption" /></label>
      {askVis && <div className="card share-ask" data-testid="share-ask-vis"><b>Who can see it?</b><p className="muted small" style={{ margin: '4px 0 10px' }}>This activity is set to Only me. Choose who can see it to {askVis === 'link' ? 'get a link' : 'post it'}.</p><VisibilityPicker value="only-me" minor={prefs.minor} onChange={(v) => v !== 'only-me' && pickVis(v)} testid="ask-vis" /></div>}
      <div className="share-grid" data-testid="share-grid">
        {backend && me ? <button type="button" className="share-btn hybrd" onClick={() => post()} disabled={!!busy || !img} data-testid="share-post"><span className="sb-ic"><span className="brand-mark" style={{ width: 26, height: 26, fontSize: 16 }}>H</span></span><span>{w.postId ? 'Post again' : 'Post to feed'}</span></button>
          : <Link className="share-btn hybrd" to="/social" data-testid="share-post-setup"><span className="sb-ic"><span className="brand-mark" style={{ width: 26, height: 26, fontSize: 16 }}>H</span></span><span>{mode === 'connect' ? 'HYBRD feed' : 'Set up feed'}</span></Link>}
        <button type="button" className="share-btn ig" onClick={shareIg} disabled={!img} data-testid="share-instagram"><span className="sb-ic"><BrandIcon name="instagram" /></span><span>Instagram</span></button>
        <button type="button" className="share-btn fb" onClick={shareFb} disabled={!img || (ls !== 'ready' && !(file() && canShareFiles(file()!)))} data-testid="share-facebook"><span className="sb-ic"><BrandIcon name="facebook" /></span><span>Facebook</span></button>
        <button type="button" className="share-btn x" onClick={shareX} data-testid="share-x"><span className="sb-ic"><BrandIcon name="x" size={19} /></span><span>X</span></button>
        <button type="button" className="share-btn" onClick={() => copy()} disabled={!!busy || (ls !== 'ready' && ls !== 'needs-visibility')} data-testid="share-copy"><span className="sb-ic"><Icon name="link" /></span><span>{busy === 'link' ? 'Getting link…' : 'Copy link'}</span></button>
        <button type="button" className="share-btn" onClick={download} disabled={!img} data-testid="share-download"><span className="sb-ic"><Icon name="download" /></span><span>Save image</span></button>
        <button type="button" className="share-btn" onClick={gpx} disabled={!hasMap} data-testid="share-gpx"><span className="sb-ic"><Icon name="route" /></span><span>GPX file</span></button>
        <button type="button" className="share-btn" onClick={more} disabled={!img} data-testid="share-more"><span className="sb-ic"><Icon name="share" /></span><span>More…</span></button>
      </div>
      {igHelp && <Banner tone="yellow"><b>Instagram:</b> the image is in your downloads. Open Instagram › + › Post or Story › pick it from your photos. (Instagram doesn’t accept shares from websites on this device.)</Banner>}
      {linkNote && <p className="muted small" data-testid="share-link-note"><Icon name="info" size={14} /> {linkNote}{ls === 'needs-profile' && <> <Link className="link" to="/social/setup">Set up</Link></>}</p>}
      {link && <p className="muted small share-link" data-testid="share-link">{visibilityLabel(w.visibility)} · <span className="mono">{link}</span></p>}
      {!hasMap && a.mapHidden && <p className="muted small">The map is hidden for this activity, so images, links and posts show stats only.</p>}
      </>}
    </Sheet>
  );
}
