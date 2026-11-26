// Settings: one place for every preference. Grouped like a phone's settings app, searchable, phone list → detail and
// a two-pane layout on desktop. Old settings pages (/me/account, /me/devices, /me/data, /me/help, /messages/settings)
// redirect here; the few in-context quick toggles (mi | km on Record, auto-pause) change these same settings.
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, Navigate, NavLink, useLocation, useNavigate, useParams } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Page, Card, Banner } from '../components/ui';
import { Icon } from '../components/Icon';
import { Avatar } from '../components/Avatar';
import { DistToggle, WeightToggle } from '../components/UnitToggle';
import { ByuUnitToggle } from '../components/ByuUnits';
import { Toggle, VisibilityPicker, TrimChips, PrivacyPreview } from '../components/ActivityPrivacy';
import { useStore, uid } from '../lib/store';
import { useAuth } from '../lib/auth';
import { useSocial } from '../lib/socialStore';
import { useToast } from '../lib/toast';
import { unlockAudio, cue } from '../lib/cues';
import { ACTIVITY_LEVELS, fromW, toW, wUnit, wu, stepGoalOf, strideM, hrMaxOf } from '../lib/calc';
import { burnGoalOf } from '../lib/burn';
import { HYROX_DIVISIONS } from '../data/programs';
import { loadPrefs, savePrefs, type MapPrefs } from '../lib/recordMap';
import { MAP_STYLES } from '../lib/mapStyles';
import { prefsOf, newSeed, MAX_ZONES, ZONE_RADII_M, type PrivacyPrefs, type PrivacyZone } from '../lib/privacy';
import { GROUPS, SECTIONS, searchSettings, sectionById, itemPath, LEGACY_REDIRECTS } from '../lib/settingsIndex';
import { trimLabel } from '../components/ActivityPrivacy';
import { THEME_OPTIONS, prefLabel, useTheme, type ThemePref } from '../lib/theme';
import type { Goal, Profile } from '../lib/types';

const Account = lazy(() => import('./Account'));
const Devices = lazy(() => import('./Devices'));
const DataPage = lazy(() => import('./DataPage'));
const Help = lazy(() => import('./Help'));
const MessageSettings = lazy(() => import('./Messages').then((m) => ({ default: m.MessageSettings })));

export const APP_VERSION = '1.4.0';

/** Old route → new Settings page, keeping #hash and ?query. */
export function LegacyRedirect({ from }: { from: keyof typeof LEGACY_REDIRECTS }) {
  const loc = useLocation();
  return <Navigate to={{ pathname: LEGACY_REDIRECTS[from], search: loc.search, hash: loc.hash }} replace />;
}

function SearchBox({ q, setQ, autoFocus }: { q: string; setQ: (s: string) => void; autoFocus?: boolean }) {
  return (
    <label className="set-search"><Icon name="search" size={18} /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search settings" aria-label="Search settings" autoFocus={autoFocus} data-testid="set-search" />{q && <button type="button" aria-label="Clear search" onClick={() => setQ('')}><Icon name="x" size={16} /></button>}</label>
  );
}

function SettingsNav({ q, compact }: { q: string; compact?: boolean }) {
  const res = useMemo(() => searchSettings(q), [q]);
  if (q.trim()) return (
    <div className="set-results" data-testid="set-results">
      {res.items.length === 0 && res.sections.length === 0 && <p className="muted small" style={{ padding: 12 }}>No settings match “{q}”.</p>}
      {res.sections.map((s) => <NavLink key={s.id} to={`/settings/${s.id}`} className="srow"><span className="set-ic"><Icon name={s.icon} size={19} /></span><span className="set-t"><b>{s.title}</b><span>{s.sub}</span></span><Icon name="chevron" size={16} /></NavLink>)}
      {res.items.map((i) => <Link key={i.label} to={itemPath(i)} className="srow" data-testid="set-result"><span className="set-ic dim"><Icon name={sectionById(i.section)!.icon} size={17} /></span><span className="set-t"><b>{i.label}</b><span>{sectionById(i.section)!.title}</span></span><Icon name="chevron" size={16} /></Link>)}
    </div>
  );
  return (
    <div className="set-groups">
      {GROUPS.map((g) => (
        <div key={g.id} className="set-group">
          <div className="set-gl">{g.label}</div>
          <div className="set-card">
            {SECTIONS.filter((s) => s.group === g.id).map((s) => (
              <NavLink key={s.id} to={`/settings/${s.id}`} className="srow" data-testid={`set-${s.id}`}>
                <span className={`set-ic c-${s.group}`}><Icon name={s.icon} size={19} /></span>
                <span className="set-t"><b>{s.title}</b>{!compact && <span>{s.sub}</span>}</span><Icon name="chevron" size={16} />
              </NavLink>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function AccountHeader() {
  const { profile } = useStore();
  const { configured, user } = useAuth();
  const { me } = useSocial();
  return (
    <Link to="/settings/profile" className="set-me" data-testid="set-me">
      <Avatar size={54} />
      <span className="set-t"><b>{profile.name || 'Your profile'}</b><span>{me ? `@${me.username} · ` : ''}{user?.email || (configured ? 'Not signed in' : 'Local mode · data on this device')}</span></span>
      <Icon name="chevron" size={16} />
    </Link>
  );
}

/** /settings — the list (phone) or the side panel + a welcome pane (desktop). */
export function SettingsHome() {
  const [q, setQ] = useState('');
  return (
    <div className="page set-page" data-testid="settings-home">
      <header className="page-head"><Link className="icon-btn" to="/me" aria-label="Back"><Icon name="back" /></Link><div className="page-title"><div className="kicker">HYBRD</div><h1>Settings</h1></div></header>
      <div className="set-shell home">
        <aside className="set-side">
          <SearchBox q={q} setQ={setQ} />
          {!q && <AccountHeader />}
          <SettingsNav q={q} />
          <p className="muted small set-ver">HYBRD {APP_VERSION} · <Link className="link" to="/settings/about">About</Link></p>
        </aside>
        <section className="set-main set-welcome">
          <Icon name="gear" size={34} />
          <h2>Settings</h2>
          <p className="muted">Pick a section on the left, or search for any setting.</p>
          <div className="set-quick">
            <Link to="/settings/privacy" className="set-qc"><Icon name="shield" /><b>Privacy & safety</b><span className="muted small">Hide your start & end, privacy zones</span></Link>
            <Link to="/settings/appearance" className="set-qc" data-testid="set-qc-appearance"><Icon name="sun" /><b>Appearance</b><span className="muted small">Light, Dark or System</span></Link>
            <Link to="/settings/units" className="set-qc"><Icon name="ruler" /><b>Units</b><span className="muted small">mi / km, lb / kg</span></Link>
            <Link to="/settings/devices" className="set-qc"><Icon name="watch" /><b>Devices</b><span className="muted small">Heart rate, Strava, music</span></Link>
          </div>
        </section>
      </div>
    </div>
  );
}

/** /settings/:section — side panel (desktop) + the section. */
export function SettingsSection() {
  const { section = '' } = useParams();
  const loc = useLocation();
  const [q, setQ] = useState('');
  const s = sectionById(section);
  useEffect(() => { if (loc.hash) window.setTimeout(() => document.getElementById(loc.hash.slice(1))?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 250); }, [loc.hash, section]);
  if (!s) return <Navigate to="/settings" replace />;
  return (
    <div className="set-shell sub" data-testid={`settings-${section}`}>
      <aside className="set-side desk-only">
        <div className="set-side-h"><Link to="/settings" className="brand-sm"><Icon name="gear" size={18} />Settings</Link></div>
        <SearchBox q={q} setQ={setQ} />
        <SettingsNav q={q} compact />
      </aside>
      <section className="set-main">
        <Suspense fallback={<div className="muted" style={{ padding: 30 }}>Loading…</div>}>{BODY[section]?.()}</Suspense>
      </section>
    </div>
  );
}

const SPage = ({ id, children, kicker }: { id: string; children: ReactNode; kicker?: string }) => {
  const s = sectionById(id)!;
  return <Page title={s.title} kicker={kicker || 'Settings'} back="/settings">{children}</Page>;
};
const Row = ({ title, sub, children, id }: { title: ReactNode; sub?: ReactNode; children: ReactNode; id?: string }) => (
  <div className="unit-row" id={id}><span><b>{title}</b>{sub && <span className="muted small">{sub}</span>}</span>{children}</div>
);

// ---------------------------------------------------------------- Profile
function ProfileSettings() {
  const { profile: p, setProfile } = useStore();
  const imp = p.units === 'imperial';
  return (
    <SPage id="profile">
      <Card>
        <div className="card-head" id="photo"><h3>Photo & bio</h3></div>
        <div className="row gap12"><Avatar size={56} /><div style={{ flex: 1 }}><b>{p.name || 'You'}</b><div className="muted small">Your photo, bio and gallery live on your Me page.</div></div><Link className="btn sm" to="/me">Edit on Me</Link></div>
      </Card>
      <Card>
        <div className="card-head" id="body"><h3>About you</h3><span className="muted small">Private · used for calories, zones and plans</span></div>
        <label className="field"><span>Name</span><input value={p.name} maxLength={60} onChange={(e) => setProfile({ name: e.target.value })} data-testid="set-name" /></label>
        <div className="grid2">
          <label className="field"><span>Sex</span><select value={p.sex} onChange={(e) => setProfile({ sex: e.target.value as Profile['sex'] })}><option value="male">Male</option><option value="female">Female</option></select></label>
          <label className="field"><span>Age</span><input inputMode="numeric" value={p.age || ''} onChange={(e) => { const v = parseInt(e.target.value, 10); if (v > 0 && v < 120) setProfile({ age: v }); }} /></label>
          <label className="field"><span>Height ({imp ? 'in' : 'cm'})</span><input inputMode="decimal" defaultValue={imp ? Math.round(p.heightCm / 2.54) : Math.round(p.heightCm)} onChange={(e) => { const v = parseFloat(e.target.value); if (v > 0) setProfile({ heightCm: imp ? v * 2.54 : v }); }} /></label>
          <label className="field"><span>Weight ({wUnit(wu(p))})</span><input inputMode="decimal" defaultValue={Math.round(toW(p.weightKg, wu(p)) * 10) / 10} onChange={(e) => { const v = parseFloat(e.target.value); if (v > 0) setProfile({ weightKg: fromW(v, wu(p)) }); }} /></label>
        </div>
        <label className="field"><span>Activity level</span><select value={p.activity} onChange={(e) => setProfile({ activity: +e.target.value as Profile['activity'] })}>{ACTIVITY_LEVELS.map((a) => <option key={a.v} value={a.v}>{a.label} — {a.hint}</option>)}</select></label>
        <label className="field"><span>Goal</span><select value={p.goal} onChange={(e) => setProfile({ goal: e.target.value as Goal })}><option value="lose">Lose fat</option><option value="maintain">Maintain / performance</option><option value="gain">Build muscle</option></select></label>
      </Card>
      <Card>
        <div className="card-head" id="training"><h3>Training</h3></div>
        <div className="grid2">
          <label className="field"><span>Training days / wk</span><select value={p.weeklySessions} onChange={(e) => setProfile({ weeklySessions: +e.target.value })}>{[2, 3, 4, 5, 6, 7].map((n) => <option key={n}>{n}</option>)}</select></label>
          <label className="field"><span>HYROX division</span><select value={p.hyroxDivision} onChange={(e) => setProfile({ hyroxDivision: e.target.value as Profile['hyroxDivision'] })}>{Object.entries(HYROX_DIVISIONS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
        </div>
        <p className="muted small">Date of birth is asked once by Friends & Stories for the 13+ age check and is never shown to anyone.</p>
      </Card>
    </SPage>
  );
}

// ---------------------------------------------------------------- Units
function UnitsSettings() {
  const { profile: p, setProfile } = useStore();
  const imp = p.units === 'imperial';
  const autoStride = Math.round(strideM({ heightCm: p.heightCm }, 'walk') * (imp ? 39.37 : 100));
  return (
    <SPage id="units">
      <Card className="units-card">
        <div className="card-head"><h3 id="units">Units</h3><span className="muted small">Applies everywhere, instantly</span></div>
        <Row title="Distance" sub={imp ? 'Miles · feet · mph · min/mi' : 'Kilometres · metres · km/h · min/km'}><DistToggle /></Row>
        <Row title="Weight" sub="Lifts, body weight"><WeightToggle /></Row>
        <Row title="Backyard ultra distance" sub="How Backyard laps show (doesn’t change mi/km elsewhere)"><ByuUnitToggle /></Row>
        <p className="muted small" style={{ marginBottom: 0 }}>The mi | km switch on the Record screen is this same setting. HYBRD stores everything in metric, so switching never changes your data.</p>
      </Card>
      <Card>
        <div className="card-head"><h3>Body & zones</h3></div>
        <Row title="Step length" sub={`Walking; used to estimate steps when the motion sensor isn’t available. Blank = auto from height (${autoStride} ${imp ? 'in' : 'cm'})`}>
          <input className="input" style={{ width: 110, textAlign: 'right' }} inputMode="decimal" aria-label={`Step length in ${imp ? 'inches' : 'centimetres'}`} placeholder={`${autoStride} ${imp ? 'in' : 'cm'}`} value={p.strideCm ? Math.round(p.strideCm / (imp ? 2.54 : 1)) : ''} onChange={(e) => { const v = parseFloat(e.target.value); setProfile({ strideCm: Number.isFinite(v) && v > 0 ? v * (imp ? 2.54 : 1) : undefined }); }} />
        </Row>
        <Row title="Max heart rate" sub={`For HR zones. Blank = 208 − 0.7 × age (Tanaka 2001)${p.age ? ` = ${hrMaxOf({ age: p.age })} bpm` : ''}. A measured max is better.`}>
          <input className="input" style={{ width: 110, textAlign: 'right' }} inputMode="numeric" aria-label="Max heart rate" placeholder={`${hrMaxOf({ age: p.age })} bpm`} value={p.hrMax ?? ''} onChange={(e) => { const v = parseInt(e.target.value.replace(/\D/g, ''), 10); setProfile({ hrMax: Number.isFinite(v) && v > 0 ? Math.min(v, 240) : undefined }); }} />
        </Row>
        <Row title="FTP" sub="Functional threshold power in watts, for %FTP cycling targets. Also set from Train › Expert.">
          <input className="input" style={{ width: 110, textAlign: 'right' }} inputMode="numeric" aria-label="FTP in watts" placeholder="— W" value={p.ftp ?? ''} onChange={(e) => { const v = parseInt(e.target.value.replace(/\D/g, ''), 10); setProfile({ ftp: Number.isFinite(v) && v >= 60 && v <= 600 ? v : v ? p.ftp : undefined }); }} />
        </Row>
      </Card>
    </SPage>
  );
}

// ---------------------------------------------------------------- Privacy
function ZoneEditor({ onAdd, onCancel, count }: { onAdd: (z: PrivacyZone) => void; onCancel: () => void; count: number }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const circle = useRef<L.Circle | null>(null);
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [radius, setRadius] = useState(400);
  const [label, setLabel] = useState(count === 0 ? 'Home' : count === 1 ? 'Work' : '');
  const [msg, setMsg] = useState('');
  const { data } = useStore();
  useEffect(() => {
    if (!el.current) return;
    const last = [...data.routes].sort((a, b) => b.updatedAt - a.updatedAt)[0]?.segments?.[0]?.[0];
    const m = L.map(el.current, { zoomControl: true, attributionControl: true }).setView(last ? [last.lat, last.lng] : [39.5, -98.35], last ? 14 : 4);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors' }).addTo(m);
    m.on('click', (e: L.LeafletMouseEvent) => setPos({ lat: e.latlng.lat, lng: e.latlng.lng }));
    map.current = m;
    return () => { m.remove(); map.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const m = map.current; if (!m) return;
    circle.current?.remove(); circle.current = null;
    if (pos) circle.current = L.circle([pos.lat, pos.lng], { radius, color: '#ef4444', weight: 2, fillColor: '#ef4444', fillOpacity: 0.18 }).addTo(m);
  }, [pos, radius]);
  const here = () => {
    setMsg('Finding you…');
    navigator.geolocation?.getCurrentPosition((p) => { const q = { lat: p.coords.latitude, lng: p.coords.longitude }; setPos(q); map.current?.setView([q.lat, q.lng], 15); setMsg(''); }, () => setMsg('Location is off — tap the map instead.'), { enableHighAccuracy: true, timeout: 10000 });
  };
  return (
    <div className="zone-ed" data-testid="zone-editor">
      <div className="row gap8 wrap" style={{ marginBottom: 8 }}><button type="button" className="btn sm" onClick={here}><Icon name="locate" size={16} />Use my location</button><span className="muted small">{msg || 'or tap the map where the zone should be'}</span></div>
      <div ref={el} className="map zone-map" />
      <div className="field" style={{ marginTop: 10 }}><span>Name</span><div className="chips">{['Home', 'Work', 'Gym', 'School'].map((n) => <button key={n} type="button" className={`chip ${label === n ? 'on' : ''}`} onClick={() => setLabel(n)}>{n}</button>)}</div><input className="input" style={{ marginTop: 8 }} value={label} maxLength={30} onChange={(e) => setLabel(e.target.value)} placeholder="Name (only you see it)" aria-label="Zone name" /></div>
      <div className="field"><span>Radius</span><div className="chips">{ZONE_RADII_M.map((r) => <button key={r} type="button" className={`chip ${radius === r ? 'on' : ''}`} onClick={() => setRadius(r)} data-testid={`zone-r-${r}`}>{trimLabel(r, 'metric')}</button>)}</div></div>
      <div className="row gap8"><button type="button" className="btn y" disabled={!pos} onClick={() => pos && onAdd({ id: uid(), label: label.trim() || 'Zone', lat: Math.round(pos.lat * 1e6) / 1e6, lng: Math.round(pos.lng * 1e6) / 1e6, radiusM: radius })} data-testid="zone-save">Add zone</button><button type="button" className="btn ghost" onClick={onCancel}>Cancel</button></div>
    </div>
  );
}

function PrivacySettings() {
  const { profile, setProfile, data } = useStore();
  const { me } = useSocial();
  const toast = useToast();
  const pr = prefsOf(profile);
  const u = profile.units;
  const [adding, setAdding] = useState(false);
  const set = (patch: Partial<PrivacyPrefs>) => setProfile({ privacy: { ...(profile.privacy || {}), seed: profile.privacy?.seed || newSeed(), ...patch } });
  const latest = useMemo(() => [...data.workouts].filter((w) => w.routeId && w.source !== 'strava').sort((a, b) => b.date.localeCompare(a.date)).map((w) => ({ w, r: data.routes.find((r) => r.id === w.routeId) })).find((x) => x.r?.segments.some((s) => s.length > 1)), [data.workouts, data.routes]);
  return (
    <SPage id="privacy">
      {pr.minor && <Banner tone="yellow"><Icon name="lock" size={14} /> You’re under 18, so start & end are always hidden, activities can be shared with friends only, and only friends can message or call you.</Banner>}
      <Card>
        <div className="card-head" id="activities"><h3>Your activities</h3><span className="muted small">Default for new activities</span></div>
        <VisibilityPicker value={pr.defaultVisibility} onChange={(v) => set({ defaultVisibility: v })} minor={pr.minor} testid="set-vis" />
        <p className="muted small">You can change it for any activity when you save or edit it. Only me = never shared, not even as a link.</p>
        <Toggle on={pr.shareHealth} onClick={() => set({ shareHealth: !pr.shareHealth })} title="Show heart rate & calories to others" sub="Off: others see distance, time, pace and elevation only. Your own view always has everything." testid="set-health" />
      </Card>
      <Card>
        <div className="card-head" id="map"><h3>Map visibility</h3><span className="muted small">Default for new activities</span></div>
        <Toggle on={pr.hideEnds} disabled={pr.minor} onClick={() => set({ hideEnds: !pr.hideEnds })} title="Hide start & end" testid="set-ends"
          sub={pr.minor ? 'Always on for under-18 accounts.' : 'Removes the first and last part of every shared route — a random extra on top of the distance below, different for each activity, so nobody can work out where you live.'} />
        {pr.hideEnds && <div style={{ padding: '6px 0 10px' }}><div className="muted small" style={{ marginBottom: 8 }}>Hide at least this much at each end</div><TrimChips value={pr.trimM} units={u} minor={pr.minor} onChange={(trimM) => set({ trimM })} testid="set-trim" /></div>}
        <Toggle on={pr.hideMap} onClick={() => set({ hideMap: !pr.hideMap })} title="Hide the map by default" sub="Others see your stats only. You can still show the map for one activity." testid="set-hidemap" />
        {latest?.r && <div style={{ marginTop: 10 }}><div className="muted small" style={{ marginBottom: 6 }}>Preview on your latest route: <b>{latest.w.title}</b></div>
          <PrivacyPreview id={latest.w.id} segments={latest.r.segments} mp={{ hideEnds: pr.hideEnds, trimM: pr.trimM, hideMap: pr.hideMap, useZones: true }} zones={pr.zones} seed={pr.seed || 'preview'} units={u} height={180} /></div>}
        <p className="muted small" style={{ marginBottom: 0 }}><Icon name="shield" size={13} /> Hidden parts are removed — not just covered — from everything you share: the share image, the link page, feed posts and GPX files. You always keep your full route.</p>
      </Card>
      <Card>
        <div className="card-head" id="zones"><h3>Privacy zones</h3><span className="muted small">{pr.zones.length}/{MAX_ZONES}</span></div>
        <p className="muted small" style={{ marginTop: 0 }}>Any part of a route inside a zone is hidden from others — handy for home, work or a friend’s place. The hidden circle is shifted randomly so its centre isn’t your door. Zones are private and only used on your device and in your private sync.</p>
        {pr.zones.map((z) => (
          <div key={z.id} className="zone-row" data-testid="zone-row"><span className="set-ic dim"><Icon name="place" size={18} /></span><span className="set-t"><b>{z.label}</b><span>{trimLabel(z.radiusM, 'metric')} radius{u === 'imperial' ? ` (${(z.radiusM / 1609.344).toFixed(2)} mi)` : ''}</span></span>
            <button className="icon-btn" aria-label={`Remove ${z.label}`} onClick={() => { set({ zones: pr.zones.filter((x) => x.id !== z.id) }); toast('Zone removed'); }}><Icon name="trash" size={17} /></button></div>
        ))}
        {adding ? <ZoneEditor count={pr.zones.length} onCancel={() => setAdding(false)} onAdd={(z) => { set({ zones: [...pr.zones, z].slice(0, MAX_ZONES) }); setAdding(false); toast(`${z.label} zone added`); }} />
          : pr.zones.length < MAX_ZONES && <button className="btn" onClick={() => setAdding(true)} data-testid="zone-add"><Icon name="plus" size={18} />Add a privacy zone</button>}
      </Card>
      <Card>
        <div className="card-head" id="social"><h3>People</h3></div>
        <Link className="srow plain" to="/social/setup"><span className="set-ic dim"><Icon name="globe" size={18} /></span><span className="set-t"><b>Public profile & posts</b><span>{me ? `@${me.username} · ${me.privacy === 'public' ? 'public profile' : 'friends only'}` : 'Handle, who sees your posts and stories'}</span></span><Icon name="chevron" size={16} /></Link>
        <Link className="srow plain" to="/settings/messages"><span className="set-ic dim"><Icon name="chat" size={18} /></span><span className="set-t"><b>Who can message or call you</b><span>Requests, read receipts, Do not disturb</span></span><Icon name="chevron" size={16} /></Link>
        <Link className="srow plain" to="/social/friends?tab=blocked"><span className="set-ic dim"><Icon name="ban" size={18} /></span><span className="set-t"><b>Blocked accounts</b><span>Blocked people can’t see your activities, posts or profile</span></span><Icon name="chevron" size={16} /></Link>
      </Card>
      <Card>
        <div className="card-head"><h3>Location & photos</h3></div>
        <ul className="cues"><li>GPS is used only while you record (or when you tap ◎ on a map).</li><li>Location data (EXIF/GPS) is removed from every photo before it’s saved or shared.</li><li>Your logs are private: nothing is shared unless you choose Friends or Everyone for an activity, or post it.</li></ul>
      </Card>
    </SPage>
  );
}

// ---------------------------------------------------------------- Sounds & voice
function SoundSettings() {
  const { profile: p, setProfile } = useStore();
  const perm = typeof Notification !== 'undefined' ? Notification.permission : 'unsupported';
  return (
    <SPage id="notifications">
      <Card>
        <div className="card-head"><h3>Cues</h3><span className="muted small">Record, Timers, the workout logger</span></div>
        <Toggle on={p.sound !== false} onClick={() => { unlockAudio(); setProfile({ sound: !(p.sound ?? true) }); setTimeout(() => cue('go'), 50); }} title="Sounds & vibration" sub="Beeps for intervals and splits (vibration on Android only)" testid="set-sound" />
        <Toggle on={!!p.voice} onClick={() => { unlockAudio(); setProfile({ voice: !p.voice }); }} title="Voice cues" sub="Speaks splits and interval names" testid="set-voice" />
        <button className="btn sm" onClick={() => { unlockAudio(); cue('go'); }}><Icon name="volume" size={16} />Test sound</button>
      </Card>
      <Card>
        <div className="card-head"><h3>Notifications</h3></div>
        <p className="muted small" style={{ marginTop: 0 }}>HYBRD shows friend requests, messages and calls inside the app while it’s open. There are no push notifications yet, so nothing reaches your lock screen. {perm === 'denied' ? 'Notifications are blocked for this site in your browser.' : ''}</p>
        <Link className="link" to="/settings/messages">Message & call settings →</Link>
      </Card>
    </SPage>
  );
}

// ---------------------------------------------------------------- Recording
function RecordingSettings() {
  const { profile: p, setProfile } = useStore();
  const [mp, setMp] = useState<MapPrefs>(() => loadPrefs());
  const setMap = (patch: Partial<MapPrefs>) => { const n = { ...mp, ...patch }; setMp(n); savePrefs(n); };
  return (
    <SPage id="recording">
      <Card>
        <div className="card-head"><h3>GPS sessions</h3></div>
        <Toggle on={p.recording?.autoPause ?? true} onClick={() => setProfile({ recording: { ...(p.recording || {}), autoPause: !(p.recording?.autoPause ?? true) } })} title="Auto-pause" sub="Pauses when you stop for ~10 s (lights, traffic). Same switch as on the Record screen." testid="set-autopause" />
        <Row title="Distance units" sub="Splits every mile or kilometre"><DistToggle /></Row>
        <Link className="link" to="/settings/privacy#map">Map privacy for shared activities →</Link>
      </Card>
      <Card>
        <div className="card-head"><h3>Record map</h3></div>
        <div className="chips" role="radiogroup" aria-label="Map style">{MAP_STYLES.map((s) => <button key={s.id} type="button" role="radio" aria-checked={mp.style === s.id} className={`chip ${mp.style === s.id ? 'on' : ''}`} onClick={() => setMap({ style: s.id })} title={s.note}>{s.label}</button>)}</div>
        <p className="muted small">{MAP_STYLES.find((s) => s.id === mp.style)?.note}</p>
        <Toggle on={mp.threeD} onClick={() => setMap({ threeD: !mp.threeD })} title="3D buildings" sub="Tilted view with buildings (uses more battery)" />
        <Toggle on={mp.showPlan} onClick={() => setMap({ showPlan: !mp.showPlan })} title="Show the planned route" sub="When you follow a route" />
      </Card>
      <Card>
        <div className="card-head"><h3>Phone tips</h3></div>
        <ul className="cues"><li>HYBRD keeps the screen on while you record. iPhone stops web GPS when the screen locks — add HYBRD to your Home Screen (iOS 18.4+) and use an armband or bike mount.</li><li>Heart rate: connect a Bluetooth strap in <Link className="link" to="/settings/devices">Devices</Link>.</li><li>Voice cues and beeps: <Link className="link" to="/settings/notifications">Sounds & voice cues</Link>.</li></ul>
      </Card>
    </SPage>
  );
}

// ---------------------------------------------------------------- Goals & fuel
function GoalsSettings() {
  const { profile: p, setProfile, data } = useStore();
  const plans: { to: string; title: string; on: boolean; icon: string }[] = [
    { to: '/coach/start', title: 'HYBRD Coach plan', on: data.coachplans.length > 0, icon: 'coach' },
    { to: '/fuel/weight-loss/setup', title: 'Weight-loss plan', on: data.wlplans.length > 0, icon: 'fuel' },
    { to: '/fuel/fasting/setup', title: 'Fasting', on: !!p.fasting, icon: 'timer' },
    { to: '/fuel/sleep/setup', title: 'Sleep', on: !!p.sleep, icon: 'moon' },
    { to: '/mind/setup', title: 'Mind & Recovery', on: !!p.mind, icon: 'mind' },
    { to: '/train/ultra/setup', title: 'Ultra & Backyard', on: !!p.ultra, icon: 'route' },
  ];
  return (
    <SPage id="goals">
      <Card>
        <div className="card-head"><h3>Daily goals</h3></div>
        <Row title="Daily step goal" sub="Default 10,000 · research benefits level off around 6,000–10,000 depending on age">
          <input className="input" style={{ width: 110, textAlign: 'right' }} inputMode="numeric" aria-label="Daily step goal" defaultValue={stepGoalOf(p)} onChange={(e) => { const v = parseInt(e.target.value.replace(/\D/g, ''), 10); if (Number.isFinite(v) && v >= 500) setProfile({ stepGoal: Math.min(v, 100000) }); }} data-testid="set-steps" />
        </Row>
        <Row title="Daily active-calorie goal" sub="Burn tracker ring (active kcal, not total)">
          <input className="input" style={{ width: 110, textAlign: 'right' }} inputMode="numeric" aria-label="Daily active calorie goal" defaultValue={burnGoalOf(p)} onChange={(e) => { const v = parseInt(e.target.value.replace(/\D/g, ''), 10); if (Number.isFinite(v) && v >= 50 && v <= 5000) setProfile({ burnGoal: v }); }} />
        </Row>
        <Row title="Training days per week" sub="Used by plans and the Hybrid Score"><select className="input" style={{ width: 110 }} value={p.weeklySessions} onChange={(e) => setProfile({ weeklySessions: +e.target.value })}>{[2, 3, 4, 5, 6, 7].map((n) => <option key={n}>{n}</option>)}</select></Row>
      </Card>
      <Card>
        <div className="card-head"><h3>Fuel targets</h3></div>
        <p className="muted small" style={{ marginTop: 0 }}>{p.targets && Object.keys(p.targets).length ? `Your own targets: ${[p.targets.kcal && `${p.targets.kcal} kcal`, p.targets.protein && `${p.targets.protein} g protein`, p.targets.waterMl && `${p.targets.waterMl} ml water`].filter(Boolean).join(' · ')}` : 'Calories, protein, carbs, fat and water are calculated from your profile (Mifflin-St Jeor). You can set your own.'}</p>
        <Link className="btn sm" to="/fuel/calculator"><Icon name="fuel" size={16} />Calorie & macro targets</Link>
      </Card>
      <Card>
        <div className="card-head" id="plans"><h3>Plans</h3><span className="muted small">Set up or change</span></div>
        {plans.map((x) => <Link key={x.to} className="srow plain" to={x.to}><span className="set-ic dim"><Icon name={x.icon} size={18} /></span><span className="set-t"><b>{x.title}</b><span>{x.on ? 'Set up · tap to change' : 'Not set up'}</span></span><Icon name="chevron" size={16} /></Link>)}
      </Card>
    </SPage>
  );
}

// ---------------------------------------------------------------- Help & About
function HelpSettings() {
  return (
    <>
      <Help />
      <div className="page" style={{ paddingTop: 0 }}>
        <Card>
          <div className="card-head"><h3>Legal & sources</h3></div>
          <Link className="srow plain" to="/fuel?tab=sources"><span className="set-ic dim"><Icon name="book" size={18} /></span><span className="set-t"><b>Sources</b><span>Where every number comes from</span></span><Icon name="chevron" size={16} /></Link>
          <Link className="srow plain" to="/social/rules"><span className="set-ic dim"><Icon name="flag" size={18} /></span><span className="set-t"><b>Community rules</b><span>What’s allowed in Friends & Stories and Messages</span></span><Icon name="chevron" size={16} /></Link>
          <Link className="srow plain" to="/mind/help"><span className="set-ic dim"><Icon name="phone" size={18} /></span><span className="set-t"><b>Get help now</b><span>988 call or text · 911 · helplines worldwide</span></span><Icon name="chevron" size={16} /></Link>
          <p className="muted small" style={{ marginBottom: 0 }}>Not medical advice. HYBRD’s numbers are estimates from public research.</p>
        </Card>
      </div>
    </>
  );
}
// ---------------------------------------------------------------- Appearance
function AppearanceSettings() {
  const { profile, setProfile } = useStore();
  const { pref, theme, setPref } = useTheme((p) => { if (profile.theme !== p) setProfile({ theme: p }); });
  return (
    <SPage id="appearance">
      <Card>
        <div className="card-head" id="theme"><h3>Theme</h3><span className="muted small">{pref === 'system' ? `System · ${theme === 'dark' ? 'Dark' : 'Light'} right now` : prefLabel(pref)}</span></div>
        <div className="theme-pick" role="radiogroup" aria-label="Theme" data-testid="theme-pick">
          {THEME_OPTIONS.map((o) => (
            <button key={o.v} type="button" role="radio" aria-checked={pref === o.v} className={`theme-opt ${pref === o.v ? 'on' : ''}`} onClick={() => setPref(o.v as ThemePref)} data-testid={`theme-${o.v}`}>
              <span className={`theme-prev ${o.v}`} aria-hidden="true"><i /><i /><i /></span>
              <span className="theme-t"><span className="theme-ic"><Icon name={o.icon} size={16} /></span><b>{o.label}</b><span className="s-radio" /></span>
              <span className="muted small">{o.sub}</span>
            </button>
          ))}
        </div>
        <p className="muted small" style={{ marginBottom: 0 }}>Your choice is saved on this device{profile.theme ? ' and in your profile, so it follows you to other devices' : ''}. Maps, photos and share images keep their own look.</p>
      </Card>
    </SPage>
  );
}

function AboutSettings() {
  const nav = useNavigate();
  return (
    <SPage id="about">
      <Card>
        <div className="row gap12"><span className="brand-mark" style={{ width: 52, height: 52, fontSize: 32, borderRadius: 14 }}>H</span><div><h3>HYBRD</h3><div className="muted small">Version {APP_VERSION} · Train · Track · Fuel</div></div></div>
        <p className="muted small">Made for José Manuel Cruz Ortiz & friends.</p>
      </Card>
      <Card>
        <div className="card-head"><h3>Credits</h3></div>
        <ul className="cues"><li>Maps © OpenStreetMap contributors; record map by OpenFreeMap / OpenMapTiles; satellite imagery EOX Sentinel‑2 cloudless and USGS The National Map.</li><li>Food data: USDA FoodData Central.</li><li>People marked SAMPLE in demos are made up.</li><li>Strava, Spotify, Instagram, Facebook and X are trademarks of their owners; HYBRD isn’t affiliated with them.</li></ul>
      </Card>
      <button className="btn ghost" onClick={() => nav('/settings/help')}>Help & legal</button>
    </SPage>
  );
}

const BODY: Record<string, () => ReactNode> = {
  account: () => <Account />,
  profile: () => <ProfileSettings />,
  privacy: () => <PrivacySettings />,
  units: () => <UnitsSettings />,
  recording: () => <RecordingSettings />,
  notifications: () => <SoundSettings />,
  goals: () => <GoalsSettings />,
  devices: () => <Devices />,
  messages: () => <MessageSettings />,
  appearance: () => <AppearanceSettings />,
  data: () => <DataPage />,
  help: () => <HelpSettings />,
  about: () => <AboutSettings />,
};
export const SETTINGS_BODIES = Object.keys(BODY);
