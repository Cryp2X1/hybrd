import { useState } from 'react';
import { Icon } from './Icon';
import { Banner, Segmented, Sheet } from './ui';
import { useStore } from '../lib/store';
import { useStrava, authorizeUrl, syncStrava, disconnectStrava, setSyncWindow, setStravaConfig, CACHE_DAYS, stravaVisible } from '../lib/strava';
import type { Workout } from '../lib/types';

const BASE = import.meta.env.BASE_URL;
export const PoweredByStrava = ({ h = 16 }: { h?: number }) => <img className="pwrd-strava" src={`${BASE}brand/strava/api_logo_pwrdBy_strava_horiz_white.svg`} alt="Powered by Strava" height={h} style={{ height: h, width: 'auto' }} />;
/** "from Strava" / "Imported" label for lists and detail pages. */
export function SourceBadge({ w }: { w: Workout }) {
  if (w.source === 'strava') return <span className="src-badge strava">from Strava</span>;
  if (w.source === 'file') return <span className="src-badge">Imported{w.device ? ` · ${w.device}` : ''}</span>;
  return null;
}
export const ViewOnStrava = ({ w }: { w: Workout }) => w.extId?.startsWith('strava:') ? <a className="view-on-strava" href={`https://www.strava.com/activities/${w.extId.slice(7)}`} target="_blank" rel="noopener">View on Strava</a> : null;

/** Strava card for Devices & sync. */
export function StravaCard() {
  const s = useStrava();
  const { profile, data } = useStore();
  const [consent, setConsent] = useState(false);
  const [href, setHref] = useState('');
  const [setup, setSetup] = useState(false);
  const [cid, setCid] = useState(s.origin === 'device' ? s.clientId : '');
  const [url, setUrl] = useState(s.origin === 'device' ? s.tokenUrl : '');
  const [msg, setMsg] = useState('');
  const n = Object.keys(s.cache).length;
  const dup = stravaVisible(data.workouts.filter((w) => w.source !== 'strava')).dup;
  return (
    <div className="strava-card" data-testid="strava-card">
      {s.setupNeeded ? (
        <div className="strava-setup" data-testid="strava-setup-needed">
          <b>Strava setup needed</b>
          <p className="muted small">Strava sign-in needs a small token-exchange function that holds HYBRD’s Strava client secret (a static website can’t keep a secret). Until it’s deployed, Strava sync is off — import your watch files below instead. Setup: SETUP.md § Strava.</p>
          <button className="btn sm" onClick={() => setSetup(!setup)}><Icon name="gear" size={16} />{setup ? 'Hide' : 'Enter Client ID & function URL'}</button>
        </div>
      ) : !s.connected ? (
        <>
          <p className="muted small" style={{ marginTop: 0 }}>Import your Strava activities — runs, rides, walks, workouts — with route, time, heart rate, calories and elevation.</p>
          <button className="strava-connect-btn" onClick={() => { setHref(authorizeUrl()); setConsent(true); }} aria-label="Connect with Strava"><img src={`${BASE}brand/strava/btn_strava_connect_with_orange.svg`} alt="Connect with Strava" height={48} /></button>
        </>
      ) : (
        <>
          <div className="sp-status small"><span className="dot on" />Connected · {s.athlete?.name}</div>
          <div className="row gap8 wrap" style={{ margin: '10px 0' }}>
            <button className="btn sm y" disabled={!!s.busy} onClick={() => syncStrava(profile)}><Icon name="refresh" size={16} />{s.busy === 'sync' ? 'Syncing…' : 'Sync now'}</button>
            <Segmented small value={String(s.meta.windowDays)} onChange={(v) => setSyncWindow(+v)} options={[{ v: '7', label: '7 d' }, { v: '30', label: '30 d' }, { v: '90', label: '90 d' }]} />
          </div>
          <p className="muted small" data-testid="strava-summary">{n} Strava activit{n === 1 ? 'y' : 'ies'} on this device{dup ? ` · ${dup} hidden as duplicate${dup > 1 ? "s" : ""} of workouts already in HYBRD` : ''}{s.meta.lastSync ? ` · last sync ${new Date(s.meta.lastSync).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : ''}.</p>
          <p className="muted small">Strava’s API rules let HYBRD keep Strava data for at most {CACHE_DAYS} days, on this device only, shown only to you. HYBRD refreshes it when you open the app (every 6 h at most); older items disappear until the next sync. To keep an activity permanently, download its original file on Strava (activity › ⋯ › Export Original) and use <b>Import files</b>.</p>
          <button className="btn sm danger" onClick={async () => { if (confirm('Disconnect Strava and delete all Strava data from this device?')) setMsg(await disconnectStrava()); }}>Disconnect & delete Strava data</button>
        </>
      )}
      {s.error && <Banner tone="warn">{s.error}</Banner>}
      {(msg || s.info) && <p className="small ok-text" data-testid="strava-info">{msg || s.info}</p>}
      {(setup || (!s.setupNeeded && s.origin === 'device' && !s.connected)) && (
        <details className="sp-more" open={setup}>
          <summary>Strava setup (this device)</summary>
          <label className="field"><span>Strava Client ID</span><input value={cid} onChange={(e) => setCid(e.target.value)} inputMode="numeric" placeholder="e.g. 123456" aria-label="Strava Client ID" /></label>
          <label className="field"><span>Token function URL</span><input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://<project>.supabase.co/functions/v1/strava-token" aria-label="Token function URL" spellCheck={false} autoCapitalize="off" /></label>
          <button className="btn sm" onClick={() => { try { setStravaConfig(cid, url); setMsg('Saved on this device.'); setSetup(false); } catch (e) { setMsg((e as Error).message); } }}>Save</button>
        </details>
      )}
      <div className="row" style={{ justifyContent: 'space-between', marginTop: 10 }}><PoweredByStrava />{s.usage && <span className="muted small mono">API {s.usage}</span>}</div>

      <Sheet open={consent} onClose={() => setConsent(false)} title="Connect Strava">
        <div className="consent" data-testid="strava-consent">
          <p style={{ marginTop: 0 }}>Before you continue on Strava’s site:</p>
          <ul className="cues">
            <li><b>What HYBRD reads:</b> your activities (including “Only You” ones) — type, name, date, distance, moving time, route, heart rate, calories, cadence, elevation — and your first name. Nothing is posted to Strava.</li>
            <li><b>How:</b> Strava’s official API after you approve on strava.com. You can untick permissions there (HYBRD needs “View data about your activities”).</li>
            <li><b>Where it’s kept:</b> on this device only, for at most 7 days, then refreshed or deleted. It isn’t synced to HYBRD accounts, shared with anyone, or used for AI.</li>
            <li><b>Withdraw or delete any time:</b> Devices › Strava › <b>Disconnect & delete</b> removes every Strava item from this device and revokes access, with a confirmation. You can also remove HYBRD at strava.com/settings/apps.</li>
          </ul>
          <a className="strava-connect-btn" href={href || '#'} data-testid="strava-authorize"><img src={`${BASE}brand/strava/btn_strava_connect_with_orange.svg`} alt="Connect with Strava" height={48} /></a>
          <p className="muted small">HYBRD is an independent app — not developed or endorsed by Strava.</p>
          <PoweredByStrava />
        </div>
      </Sheet>
    </div>
  );
}
