import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './Icon';
import { Banner, Segmented, Sheet } from './ui';
import { WORKOUT_PLAYLISTS } from '../data/spotifyPlaylists';
import {
  useSpotify, connect, disconnect, loadMe, loadDevices, loadPlaylists, play, pause, next, previous, playContext, transfer,
  watchPlayback, startBrowserPlayer, stopBrowserPlayer, isMobileDevice, setClientId, setPrefs, redirectUri, onLocalhostName,
  configFileHasClientId, clearError, type Device, type SpState,
} from '../lib/spotify';
import { isIOS } from '../lib/cues';

const fmt = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const devIcon = (t: string) => (t === 'Smartphone' || t === 'Tablet' ? 'phone' : t === 'Computer' ? 'laptop' : 'speaker');

function ConnectButton({ block }: { block?: boolean }) {
  const sp = useSpotify();
  const [err, setErr] = useState('');
  if (!sp.clientId) return <Link to="/me#music" className={`btn sm ${block ? 'block' : ''}`}><Icon name="gear" size={16} />Set up Spotify in Me › Music</Link>;
  return (
    <>
      <button className={`btn y ${block ? 'block' : ''} sm sp-connect`} disabled={!!sp.loading.connect} onClick={() => connect().catch((e) => setErr(e.message))}><Icon name="music" size={18} />{sp.loading.connect ? 'Connecting…' : 'Connect Spotify'}</button>
      {err && <p className="small" style={{ color: '#ff8a8a', margin: '6px 0 0' }}>{err}</p>}
    </>
  );
}

function ErrorBanner({ sp }: { sp: SpState }) {
  const e = sp.error; if (!e) return null;
  if (e.kind === 'nodevice') return (
    <Banner tone="warn"><b>{e.message === 'No active Spotify device.' ? (isMobileDevice() ? 'Open Spotify on this phone first' : 'No Spotify device is open') : 'No active Spotify device'}</b>
      <div className="small">{e.message === 'No active Spotify device.' ? (isMobileDevice() ? 'Open the Spotify app, play any song for a second, then come back and tap Refresh devices.' : 'Open Spotify on your phone or computer (or use Play in this browser), then tap Refresh devices.') : e.message}</div>
      <div className="row gap8" style={{ marginTop: 8 }}><a className="btn sm" href="https://open.spotify.com" target="_blank" rel="noopener"><Icon name="external" size={16} />Open Spotify</a><button className="btn sm" onClick={() => { clearError(); loadDevices(); }}><Icon name="refresh" size={16} />Refresh devices</button></div>
    </Banner>
  );
  return (
    <Banner tone="warn"><b>{e.kind === 'premium' ? 'Spotify Premium needed' : e.kind === 'allowlist' ? 'Not on the app’s user list' : e.kind === 'auth' ? 'Spotify sign-in' : e.kind === 'quota' ? 'Spotify limit reached' : 'Spotify'}</b>
      <div className="small">{e.message}</div>
      {e.kind === 'auth' && !sp.connected && <div style={{ marginTop: 8 }}><ConnectButton /></div>}
      <button className="link small" style={{ marginTop: 6 }} onClick={clearError}>Dismiss</button>
    </Banner>
  );
}

export function MiniPlayer() {
  const sp = useSpotify();
  const pb = sp.playback;
  const [, tick] = useState(0);
  useEffect(() => { if (!pb?.is_playing) return; const t = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(t); }, [pb?.is_playing]);
  const it = pb?.item;
  const imgs = it?.album?.images || it?.images || it?.show?.images || [];
  const art = imgs.find((i) => ((i as { width?: number }).width || 0) <= 320)?.url || imgs[0]?.url;
  const prog = pb && it ? Math.min(it.duration_ms, (pb.progress_ms || 0) + (pb.is_playing ? Date.now() - pb.at : 0)) : 0;
  const busy = !!sp.loading.cmd;
  return (
    <div className="sp-player" data-testid="sp-player">
      <div className="sp-art">{art ? <img src={art} alt={it?.album?.name ? `Cover: ${it.album.name}` : 'Cover art'} /> : <Icon name="music" size={26} />}</div>
      <div className="sp-meta">
        {pb === undefined ? <div className="muted small">Checking what’s playing…</div>
          : !it ? <><div className="sp-title">Nothing playing</div><div className="muted small">{pb ? `On ${pb.device.name}` : 'Pick a playlist below, or press play'}</div></>
          : <>
            <div className="sp-title" data-testid="sp-title">{it.name}</div>
            <div className="sp-artist muted small">{it.artists?.map((a) => a.name).join(', ') || it.show?.name}</div>
            <div className="sp-bar"><span style={{ width: `${(prog / Math.max(1, it.duration_ms)) * 100}%` }} /></div>
            <div className="sp-dev small"><Icon name={devIcon(pb!.device.type)} size={13} /> {pb!.device.name} · {fmt(prog)} / {fmt(it.duration_ms)}</div>
          </>}
      </div>
      <div className="sp-ctrls">
        <button className="icon-btn" aria-label="Previous track" disabled={busy} onClick={() => previous()}><Icon name="prev" size={18} fill /></button>
        <button className="icon-btn sp-pp" aria-label={pb?.is_playing ? 'Pause' : 'Play'} disabled={busy} onClick={() => (pb?.is_playing ? pause() : play())}><Icon name={pb?.is_playing ? 'pause' : 'play'} size={20} fill /></button>
        <button className="icon-btn" aria-label="Next track" disabled={busy} onClick={() => next()}><Icon name="next" size={18} fill /></button>
      </div>
    </div>
  );
}

function Devices({ sp }: { sp: SpState }) {
  const mobile = isMobileDevice();
  const ds = sp.devices;
  const active = sp.playback?.device?.id;
  return (
    <div className="sp-devices">
      <div className="card-head"><h4>Play on</h4><button className="link small" onClick={() => loadDevices()}><Icon name="refresh" size={14} /> {sp.loading.devices ? 'Looking…' : 'Refresh devices'}</button></div>
      {ds === undefined ? <p className="muted small">Tap Refresh devices to list phones, computers and speakers signed in to your Spotify.</p>
        : !ds.length ? <p className="muted small" data-testid="sp-nodevices">{mobile ? 'No devices yet. Open Spotify on this phone first, play any song for a second, then tap Refresh devices.' : 'No devices yet. Open Spotify on your phone or computer, or use Play in this browser.'}</p>
        : ds.map((d: Device) => (
          <button key={d.id || d.name} className={`sp-dev-row ${d.id === active || d.is_active ? 'on' : ''}`} disabled={!d.id || d.is_restricted} onClick={() => d.id && transfer(d.id)}>
            <Icon name={devIcon(d.type)} size={18} /><span>{d.name}<small className="muted"> · {d.type}</small></span>
            <small className="muted">{d.is_restricted ? 'Can’t be controlled' : d.id === active || d.is_active ? 'Playing here' : 'Play here'}</small>
          </button>
        ))}
      {!mobile ? (
        <div className="sp-browser">
          {sp.sdk.status === 'off' || sp.sdk.status === 'error'
            ? <button className="btn sm" onClick={() => startBrowserPlayer()}><Icon name="laptop" size={16} />Play in this browser</button>
            : <button className="btn sm ghost" onClick={stopBrowserPlayer}>{sp.sdk.status === 'loading' ? 'Starting browser player…' : 'Stop browser player'}</button>}
          <span className="muted small">Desktop Chrome, Edge, Firefox or Safari · Premium · {sp.sdk.status === 'ready' ? 'ready ✓' : 'adds the “streaming” permission'}</span>
          {sp.sdk.error && <div className="small" style={{ color: '#ff8a8a' }}>{sp.sdk.error}</div>}
        </div>
      ) : <p className="muted small" style={{ margin: '6px 0 0' }}>{isIOS() ? 'On iPhone the music plays in the Spotify app and HYBRD is the remote. ' : 'Music plays in the Spotify app; HYBRD is the remote. '}Keep HYBRD on screen while recording — phones pause a web app’s GPS when you switch apps.</p>}
    </div>
  );
}

function MyPlaylists({ sp }: { sp: SpState }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="sp-lists">
      <button className="btn sm block" onClick={() => { setOpen(!open); if (!open && !sp.playlists) loadPlaylists(); }}><Icon name="layers" size={16} />{open ? 'Hide your playlists' : 'Your playlists'}</button>
      {open && (sp.loading.playlists && !sp.playlists ? <p className="muted small">Loading…</p>
        : !sp.playlists?.length ? <p className="muted small">No playlists in your library.</p>
        : <div className="sp-pl-list">{sp.playlists.map((p) => (
          <div key={p.id} className="sp-pl">
            <span className="sp-pl-img">{p.images?.[0]?.url ? <img src={p.images[p.images.length - 1].url} alt="" /> : <Icon name="music" size={16} />}</span>
            <span className="sp-pl-t"><b>{p.name}</b><small className="muted">{p.total != null ? `${p.total} tracks` : ''}{p.owner?.display_name ? ` · ${p.owner.display_name}` : ''}</small></span>
            <button className="icon-btn" aria-label={`Play ${p.name}`} onClick={() => playContext(p.uri)}><Icon name="play" size={16} fill /></button>
          </div>
        ))}</div>)}
    </div>
  );
}

/** Public workout playlists as Spotify embeds — work with no connection at all (previews, or full tracks if you're logged in to Spotify in this browser). */
export function WorkoutPlaylists({ compact }: { compact?: boolean }) {
  const sp = useSpotify();
  const [cat, setCat] = useState<'run' | 'hiit' | 'lift' | 'walk'>('run');
  const group = WORKOUT_PLAYLISTS.find((g) => g.key === cat)!;
  const [pick, setPick] = useState(group.lists[0].id);
  const cur = group.lists.find((l) => l.id === pick) || group.lists[0];
  return (
    <div className="sp-workout" data-testid="workout-playlists">
      <Segmented small value={cat} options={WORKOUT_PLAYLISTS.map((g) => ({ v: g.key, label: g.label }))} onChange={(v) => { setCat(v); setPick(WORKOUT_PLAYLISTS.find((g) => g.key === v)!.lists[0].id); }} />
      <div className="chips" style={{ margin: '10px 0' }}>{group.lists.map((l) => <button key={l.id} className={`chip ${l.id === cur.id ? 'on' : ''}`} onClick={() => setPick(l.id)}>{l.name}</button>)}</div>
      <iframe key={cur.id} title={`Spotify playlist: ${cur.name}`} className="sp-embed" src={`https://open.spotify.com/embed/playlist/${cur.id}?utm_source=generator&theme=0`} height={compact ? 152 : 352} loading="lazy" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" />
      <div className="row gap8 wrap" style={{ marginTop: 8 }}>
        <a className="btn sm" href={`https://open.spotify.com/playlist/${cur.id}`} target="_blank" rel="noopener"><Icon name="external" size={16} />Open in Spotify</a>
        {sp.connected && <button className="btn sm" onClick={() => playContext(`spotify:playlist:${cur.id}`)}><Icon name="play" size={16} fill />Play on my Spotify</button>}
      </div>
      <p className="muted small" style={{ margin: '8px 0 0' }}>Playlists by Spotify. The player shows 30-second previews unless you’re logged in to Spotify in this browser{isIOS() ? ' (on iPhone, tapping a song may open the Spotify app)' : ''}.</p>
    </div>
  );
}

/** Player + devices + playlists when connected; connect prompt + public playlists when not. */
export function MusicPanel({ inSheet }: { inSheet?: boolean }) {
  const sp = useSpotify();
  useEffect(() => { if (!sp.connected) return; if (!sp.me) loadMe(); return watchPlayback(); }, [sp.connected]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!sp.connected) return (
    <div className="sp-panel" data-testid="music-panel">
      <ErrorBanner sp={sp} />
      <div className="sp-cta">
        <div><b>Control your Spotify from HYBRD</b><div className="muted small">Play, pause, skip and pick playlists without leaving your workout. Needs Spotify Premium.</div></div>
        <ConnectButton block />
      </div>
      <h4 style={{ margin: '16px 0 8px' }}>Workout playlists — no account needed</h4>
      <WorkoutPlaylists compact={inSheet} />
    </div>
  );
  return (
    <div className="sp-panel" data-testid="music-panel">
      <ErrorBanner sp={sp} />
      <MiniPlayer />
      <Devices sp={sp} />
      <MyPlaylists sp={sp} />
      <details className="sp-more" open={!inSheet}><summary>Workout playlists</summary><WorkoutPlaylists compact={inSheet} /></details>
      <p className="muted small" style={{ margin: '10px 0 0' }}>{sp.me ? `Connected as ${sp.me.name}. ` : ''}Track info and artwork from Spotify.</p>
    </div>
  );
}

/** "Music" button for Record, Timers and Logger: opens the player in a sheet. */
export function MusicButton() {
  const sp = useSpotify();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn sm" aria-label="Music" data-testid="music-btn" onClick={() => setOpen(true)}><Icon name="music" size={18} /><span className="btn-l">Music</span>{sp.playback?.is_playing && <span className="sp-live" aria-hidden="true" />}</button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Music"><MusicPanel inSheet /></Sheet>
    </>
  );
}

/** Me › Music: Client ID, connect / disconnect, preferences. */
export function SpotifySettings() {
  const sp = useSpotify();
  const [cid, setCid] = useState(sp.cidOrigin === 'device' ? sp.clientId : '');
  const [msg, setMsg] = useState('');
  const fromConfig = configFileHasClientId();
  const T = ({ on, label, sub, onClick }: { on: boolean; label: string; sub: string; onClick: () => void }) => (
    <button className="toggle" style={{ width: '100%', textAlign: 'left' }} onClick={onClick}><span><b>{label}</b><div className="muted small">{sub}</div></span><span className={`switch ${on ? 'on' : ''}`} /></button>
  );
  return (
    <div className="sp-settings">
      <div className="sp-status small"><span className={`dot ${sp.connected ? 'on' : ''}`} />{sp.connected ? `Spotify connected${sp.me ? ` · ${sp.me.name}` : ''}` : sp.clientId ? 'Spotify not connected' : 'Spotify not set up yet'}</div>
      {sp.connected
        ? <button className="btn sm danger" onClick={() => { disconnect(); setMsg('Disconnected. HYBRD deleted its Spotify tokens from this device.'); }}>Disconnect Spotify</button>
        : <ConnectButton />}
      {msg && <p className="muted small">{msg}</p>}
      <T on={sp.prefs.duck} label="Lower music during voice cues" sub="Turns Spotify down while HYBRD speaks a split or interval, then back up (devices that allow remote volume)" onClick={() => setPrefs({ duck: !sp.prefs.duck })} />
      <details className="sp-more" open={!sp.clientId}>
        <summary>Spotify app setup (Client ID)</summary>
        {fromConfig && sp.cidOrigin === 'config.js' ? <p className="muted small">Client ID is set in config.js ({sp.clientId.slice(0, 6)}…). You can override it on this device below.</p>
          : <p className="muted small">Create a free app at <a className="link" href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener">developer.spotify.com/dashboard</a>, tick <b>Web API</b> (and <b>Web Playback SDK</b>), add the redirect URI below, then paste the Client ID here. No secret is needed.</p>}
        <label className="field"><span>Client ID</span>
          <div className="row gap8"><input className="input" value={cid} onChange={(e) => setCid(e.target.value)} placeholder="32-character Client ID" spellCheck={false} autoCapitalize="off" aria-label="Spotify Client ID" />
            <button className="btn sm" onClick={() => { try { setClientId(cid); setMsg(cid ? 'Client ID saved on this device.' : 'Device Client ID removed.'); } catch (e) { setMsg((e as Error).message); } }}>Save</button></div>
        </label>
        <p className="muted small" style={{ marginBottom: 4 }}>Redirect URI to add in the dashboard (exact match):</p>
        <code className="sp-uri" data-testid="sp-redirect">{redirectUri()}</code>
        {onLocalhostName() && <Banner tone="warn">Spotify doesn’t accept “localhost” redirect URIs. Open this page at <b>{window.location.href.replace('//localhost', '//127.0.0.1')}</b> instead and register that address.</Banner>}
      </details>
      <p className="muted small" style={{ margin: '8px 0 0' }}>Limits while the Spotify app is in development mode: the app owner needs Premium, up to 5 people (added by email in the dashboard), and play/pause/skip need Premium. <Link className="link" to="/me/help#music">Details</Link></p>
    </div>
  );
}
