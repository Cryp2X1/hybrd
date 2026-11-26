// Record › Save activity (after Hold to finish): title, description, type, effort, photos, gear, who can see it and
// map privacy with a live "what others see" preview. Also used by Activity › Edit.
import { useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import { Banner } from './ui';
import { useStore, uid } from '../lib/store';
import { preparePhoto, type Prepared } from '../lib/gallery';
import { prefsOf, mapPrivacyFor, newSeed, type MapPrivacy, type Visibility } from '../lib/privacy';
import { MapPrivacyControls, PrivacyPreview, VisibilityPicker } from './ActivityPrivacy';
import type { Profile, RoutePoint, Workout, WorkoutType } from '../lib/types';

export const EFFORT: Record<number, string> = { 1: 'Very easy', 2: 'Easy', 3: 'Easy', 4: 'Moderate', 5: 'Moderate', 6: 'Hard-ish', 7: 'Hard', 8: 'Very hard', 9: 'Max effort', 10: 'All out' };
export const MAX_ACTIVITY_PHOTOS = 6;
export interface SaveFields {
  title: string; description: string; type: WorkoutType; rpe: number; visibility: Visibility; mapPrivacy?: MapPrivacy; gearId?: string;
  newPhotos: Prepared[];
}
export function gearKindFor(t: WorkoutType): 'shoes' | 'bike' | 'other' { return t === 'cycle' || t === 'indoor-cycle' ? 'bike' : t === 'run' || t === 'walk' ? 'shoes' : 'other'; }

/** Make sure the person has a secret privacy seed (random offsets). Returns the profile patch, if any. */
export function ensureSeed(p: Profile): Partial<Profile> | null { return p.privacy?.seed ? null : { privacy: { ...(p.privacy || {}), seed: newSeed() } }; }

export function SaveActivityForm({ id, initial, typeOptions, segments, extra, summary, onSave, saveLabel = 'Save activity', secondary, existingPhotos }: {
  id: string; initial: Partial<Workout> & { title: string; type: WorkoutType }; typeOptions?: { v: WorkoutType; label: string }[]; segments?: RoutePoint[][];
  extra?: ReactNode; summary?: ReactNode; onSave: (f: SaveFields) => void; saveLabel?: string; secondary?: ReactNode; existingPhotos?: ReactNode;
}) {
  const { profile, setProfile } = useStore();
  const prefs = prefsOf(profile);
  const u = profile.units;
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description || '');
  const [type, setType] = useState<WorkoutType>(initial.type);
  const [rpe, setRpe] = useState(initial.rpe || 5);
  const [visibility, setVisibility] = useState<Visibility>(initial.visibility || prefs.defaultVisibility);
  const [mp, setMp] = useState<MapPrivacy>(mapPrivacyFor(initial, prefs));
  const [gearId, setGearId] = useState<string | undefined>(initial.gearId);
  const [photos, setPhotos] = useState<Prepared[]>([]);
  const [photoErr, setPhotoErr] = useState('');
  const [newGear, setNewGear] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const hasRoute = !!segments?.some((s) => s.length > 1);
  const kind = gearKindFor(type);
  const gear = (profile.gear || []).filter((g) => !g.retired && (g.kind === kind || g.kind === 'other' || kind === 'other'));
  const addPhotos = async (files: FileList | null) => {
    setPhotoErr('');
    const list = [...(files || [])].slice(0, Math.max(0, MAX_ACTIVITY_PHOTOS - photos.length));
    for (const f of list) { try { const p = await preparePhoto(f); setPhotos((x) => [...x, p]); } catch (e) { setPhotoErr((e as Error).message); } }
  };
  const addGear = () => {
    const name = newGear.trim().slice(0, 40); if (!name) return;
    const g = { id: uid(), name, kind };
    setProfile({ gear: [...(profile.gear || []), g] }); setGearId(g.id); setNewGear('');
  };
  const save = () => {
    const seed = ensureSeed(profile); if (seed) setProfile(seed);
    onSave({ title: title.trim() || initial.title, description: description.trim(), type, rpe, visibility, mapPrivacy: hasRoute ? mp : undefined, gearId, newPhotos: photos });
  };
  return (
    <div className="save-act" data-testid="save-activity">
      {summary}
      <section className="sa-sec">
        <label className="field"><span>Title</span><input value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} data-testid="sa-title" /></label>
        <label className="field"><span>Description</span><textarea className="input" rows={3} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="How did it go? Route notes, how you felt…" data-testid="sa-desc" /></label>
        {typeOptions && typeOptions.length > 1 && <div className="field"><span>Activity type</span><div className="chips">{typeOptions.map((o) => <button key={o.v} type="button" className={`chip ${type === o.v ? 'on' : ''}`} onClick={() => setType(o.v)} data-testid={`sa-type-${o.v}`}>{o.label}</button>)}</div></div>}
        {extra}
        <div className="field"><span>Effort <b className="y" style={{ marginLeft: 6 }}>{rpe}/10 · {EFFORT[rpe]}</b></span><div className="rpe">{Array.from({ length: 10 }, (_, k) => k + 1).map((n) => <button type="button" key={n} className={rpe === n ? 'on' : ''} onClick={() => setRpe(n)} aria-label={`Effort ${n}: ${EFFORT[n]}`}>{n}</button>)}</div></div>
      </section>
      <section className="sa-sec">
        <div className="sa-h"><Icon name="camera" size={18} /><b>Photos</b><span className="muted small">{photos.length}/{MAX_ACTIVITY_PHOTOS} · location data removed · saved to your private Gallery</span></div>
        <div className="sa-photos">
          {existingPhotos}
          {photos.map((p, i) => <div key={p.key} className="sa-ph"><img src={p.preview} alt="" /><button type="button" aria-label="Remove photo" onClick={() => setPhotos((x) => x.filter((_, j) => j !== i))}><Icon name="x" size={14} /></button></div>)}
          {photos.length < MAX_ACTIVITY_PHOTOS && <button type="button" className="sa-ph add" onClick={() => file.current?.click()} data-testid="sa-add-photo"><Icon name="plus" /><span>Add</span></button>}
        </div>
        <input ref={file} type="file" accept="image/*" multiple hidden onChange={(e) => { addPhotos(e.target.files); e.target.value = ''; }} />
        {photoErr && <p className="form-err">{photoErr}</p>}
      </section>
      <section className="sa-sec">
        <div className="sa-h"><Icon name={kind === 'bike' ? 'bike' : 'run'} size={18} /><b>Gear</b><span className="muted small">Optional</span></div>
        <div className="chips">
          <button type="button" className={`chip ${!gearId ? 'on' : ''}`} onClick={() => setGearId(undefined)}>None</button>
          {gear.map((g) => <button key={g.id} type="button" className={`chip ${gearId === g.id ? 'on' : ''}`} onClick={() => setGearId(g.id)}>{g.name}</button>)}
        </div>
        <div className="row gap8" style={{ marginTop: 8 }}><input className="input" value={newGear} maxLength={40} onChange={(e) => setNewGear(e.target.value)} placeholder={kind === 'bike' ? 'Add a bike…' : kind === 'shoes' ? 'Add shoes…' : 'Add gear…'} aria-label="New gear name" onKeyDown={(e) => e.key === 'Enter' && addGear()} /><button type="button" className="btn sm" onClick={addGear} disabled={!newGear.trim()}>Add</button></div>
      </section>
      <section className="sa-sec">
        <div className="sa-h"><Icon name="eye" size={18} /><b>Who can see this</b></div>
        <VisibilityPicker value={visibility} onChange={setVisibility} minor={prefs.minor} testid="sa-vis" />
        {prefs.minor && <p className="muted small"><Icon name="lock" size={13} /> Under-18 accounts share with friends only, and start & end are always hidden.</p>}
      </section>
      {hasRoute && <section className="sa-sec" data-testid="sa-map-privacy">
        <div className="sa-h"><Icon name="shield" size={18} /><b>Map privacy</b><span className="muted small">for this activity</span></div>
        <PrivacyPreview id={id} segments={segments!} mp={mp} zones={prefs.zones} seed={prefs.seed || profile.privacy?.seed || 'preview'} units={u} />
        <MapPrivacyControls value={mp} onChange={setMp} minor={prefs.minor} units={u} zones={prefs.zones.length} />
      </section>}
      {visibility !== 'only-me' && <Banner><Icon name="info" size={14} /> {visibility === 'public' ? 'Everyone' : 'Your friends'} can see this after you share it — post it to your feed or share a link from the next screen.</Banner>}
      <div className="sa-actions">
        <button type="button" className="btn y big block" onClick={save} data-testid="sa-save"><Icon name="check" />{saveLabel}</button>
      </div>
      {secondary}
    </div>
  );
}
