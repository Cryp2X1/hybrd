import { Link } from 'react-router-dom';
import { Page, Card } from '../components/ui';
import { Icon } from '../components/Icon';
import { HrPanel } from '../components/HeartRate';
import { StravaCard } from '../components/Strava';
import { useStore } from '../lib/store';
import { hrMaxOf } from '../lib/calc';
import { SpotifySettings, MusicPanel } from '../components/Music';

export default function Devices() {
  const { profile, data } = useStore();
  const imported = data.workouts.filter((w) => w.source === 'file').length;
  return (
    <Page title="Devices & integrations" kicker="Settings · heart rate · watch files · Strava · music" back="/settings">
      <Card>
        <div className="row gap8" style={{ marginBottom: 8 }}><Icon name="heart" /><h3 style={{ margin: 0 }}>Bluetooth heart rate</h3></div>
        <p className="muted small" style={{ marginTop: 0 }}>Live BPM shows in Record, Timers and the Logger and is saved with the workout. Zones use max HR {hrMaxOf(profile)} bpm{profile.hrMax ? ' (set in Settings › Units)' : ' (estimated from age — set yours in Settings › Units)'}.</p>
        <HrPanel />
      </Card>
      <Card>
        <div className="row gap8" style={{ marginBottom: 8 }}><Icon name="watch" /><h3 style={{ margin: 0 }}>Watch files</h3></div>
        <p className="muted small" style={{ marginTop: 0 }}>Import .fit, .tcx or .gpx files exported from Garmin, Coros, Polar, Suunto, Wahoo, Apple Watch apps or Strava — with route, heart rate, cadence, elevation and laps. {imported ? `${imported} imported so far.` : ''}</p>
        <Link to="/me/import" className="btn y" data-testid="go-import"><Icon name="upload" size={18} />Import files</Link>
      </Card>
      <Card>
        <div className="row gap8" style={{ marginBottom: 8 }}><Icon name="link" /><h3 style={{ margin: 0 }}>Strava</h3></div>
        <StravaCard />
      </Card>
      <Card className="music-card">
        <div className="card-head" id="music"><h3>Music · Spotify</h3><span className="muted small">Optional</span></div>
        <SpotifySettings />
      </Card>
      <Card>
        <h3 style={{ marginBottom: 10 }}>Music player</h3>
        <MusicPanel />
      </Card>
      <p className="muted small">{window.HYBRD_CONFIG?.supportEmail ? <>Questions or data-deletion requests: <a className="link" href={`mailto:${window.HYBRD_CONFIG.supportEmail}`}>{window.HYBRD_CONFIG.supportEmail}</a>. </> : null}Manage apps connected to your Strava account at <a className="link" href="https://www.strava.com/settings/apps" target="_blank" rel="noopener">strava.com/settings/apps</a>. <Link className="link" to="/settings/help#devices">Help: devices →</Link></p>
    </Page>
  );
}
