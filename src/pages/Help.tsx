import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Page, Card, Disclaimer } from '../components/ui';
import { isIOS, isStandalone, wakeLockSupported } from '../lib/cues';

export default function Help() {
  const loc = useLocation();
  useEffect(() => { if (loc.hash) setTimeout(() => document.getElementById(loc.hash.slice(1))?.scrollIntoView({ block: 'start' }), 50); }, [loc.hash]);
  return (
    <Page title="Help & tips" kicker="Install · GPS · iPhone limits · Privacy" back="/me">
      <Card>
        <h3 style={{ marginBottom: 8 }}>Install it like an app</h3>
        <ul className="cues">
          <li><b>iPhone / iPad (Safari):</b> tap Share → <b>Add to Home Screen</b>. On iOS 26 sites added this way open as a web app by default.</li>
          <li><b>Android (Chrome):</b> menu ⋮ → <b>Install app</b> / Add to Home screen.</li>
          <li><b>Mac / PC (Chrome, Edge):</b> the install icon in the address bar.</li>
        </ul>
        <p className="muted small" style={{ margin: 0 }}>Status on this device: {isStandalone() ? 'running as an installed app ✓' : 'running in a browser tab'} · screen wake lock {wakeLockSupported() ? 'supported' : 'not supported'}.</p>
      </Card>
      <Card>
        <h3 style={{ marginBottom: 8 }}>Miles or kilometres</h3>
        <p className="muted small" style={{ margin: 0 }}>Tap the <b>mi | km</b> switch on the Record screen (before or during an activity) or go to <b>Me › Units</b>. Everything updates instantly — distance, pace, speed, splits, elevation (ft / m) and charts. HYBRD stores every value in metric, so switching never changes or loses your data; mid-run splits are rebuilt from the raw GPS points. Weight (lb / kg) has its own switch in Me › Units.</p>
      </Card>
      <Card>
        <h3 style={{ marginBottom: 8 }}>Steps — what a web app can and can’t do</h3>
        <ul className="cues">
          <li><b>During Walk and Run recordings</b> HYBRD counts steps with your phone’s motion sensor (accelerometer). On iPhone, tap <b>Allow</b> when asked for motion access after you press Start.</li>
          <li>The sensor only works <b>while HYBRD is open and the screen is on</b>. Browsers pause motion and GPS when the screen locks or you switch apps, so steps taken then aren’t counted.</li>
          <li>If motion access is denied or the browser has no sensor (most laptops), steps are <b>estimated</b> from GPS distance ÷ your step length and marked “est.”. Set your step length in Me › Units & goals for better estimates.</li>
          <li><b>The web can’t read Apple Health or Google Fit.</b> For all-day steps, open the Health / Fit app, copy today’s number and use <b>Set day total</b> on the Steps card. In-app walks and runs are already inside that number, so nothing is counted twice. Use <b>Add to today</b> only for steps your phone didn’t see.</li>
          <li>Calories from steps (≈0.04 kcal per step × weight / 70 kg) are an estimate and only count steps outside recorded workouts, which already have their own estimate.</li>
        </ul>
      </Card>
      <Card>
        <h3 style={{ marginBottom: 8 }} id="music">Music with Spotify — what works and the limits</h3>
        <ul className="cues">
          <li><b>No account needed:</b> Me › Music player and the <b>Music</b> button (Record, Timers, workout logger) show public workout playlists from Spotify. They play 30-second previews, or full tracks if you’re logged in to Spotify in the same browser.</li>
          <li><b>Connect Spotify</b> to control your own Spotify from HYBRD: see what’s playing, play/pause, skip, choose the device and start your playlists. HYBRD signs in with Spotify’s PKCE flow — no password or secret touches HYBRD, and the tokens stay on this device (Disconnect deletes them).</li>
          <li><b>Spotify Premium is required</b> for play/pause/skip/device control (Spotify’s rule for the playback API). Free accounts can still use the embedded playlists.</li>
          <li><b>On phones</b> the music plays in the <b>Spotify app</b> and HYBRD is the remote (Spotify Connect). If it says no device, open Spotify on the phone, play any song for a second, come back and tap Refresh devices. Keep HYBRD on screen while recording — the phone pauses a web app’s GPS when you switch apps.</li>
          <li><b>On a computer</b> you can also choose <b>Play in this browser</b> (Spotify Web Playback SDK, Premium, needs DRM support). It asks for one extra permission (“streaming”).</li>
          <li><b>Development-mode limits:</b> HYBRD’s Spotify app is a personal, non-commercial project in Spotify’s development mode. The app owner must have Premium, at most <b>5 people</b> can use it, and each one must be added by Spotify email in the developer dashboard first — otherwise Spotify answers “not registered”. Spotify only grants wider access to registered companies with 250k+ monthly users.</li>
          <li><b>Cues + music:</b> beeps and voice cues still play over your music. With “Lower music during voice cues” on, HYBRD turns Spotify down while it speaks and back up afterwards (only on devices that allow remote volume — many phones don’t). On iPhone, Safari 16.4+ lets HYBRD mark its beeps as short notification sounds so they play on top of Spotify.</li>
        </ul>
      </Card>
      <Card>
        <h3 style={{ marginBottom: 8 }}>iPhone limits (honest version)</h3>
        <ul className="cues">
          <li><b>GPS stops when the screen locks.</b> iOS pauses websites and web apps when the screen turns off or you switch apps, so tracking pauses too. HYBRD marks the gap and never adds a straight line across it.</li>
          <li><b>Keeping the screen on</b> works in Safari, and in the Home Screen app only from <b>iOS / iPadOS 18.4</b>. On older iOS, set Auto-Lock to “Never” in Settings › Display & Brightness during a run.</li>
          <li><b>No vibration</b> on iPhone (Safari has no Vibration API) — HYBRD uses sound and voice cues instead. Sounds start after you tap Start.</li>
          <li>The Home Screen app and Safari keep <b>separate storage and sign-in</b>. Pick one and stick to it (the Home Screen app is better).</li>
          <li>Safari can clear a site’s data after <b>7 days</b> without a visit; the Home Screen app is exempt. Export your data now and then.</li>
          <li>Barcode scanning by camera isn’t available in Safari yet — type the barcode number instead.</li>
        </ul>
        {isIOS() && <p className="muted small" style={{ margin: 0 }}>You’re on an Apple device — these apply to you.</p>}
      </Card>
      <Card>
        <h3 style={{ marginBottom: 8 }}>GPS tips (all phones)</h3>
        <ul className="cues">
          <li>Start outside with a clear view of the sky and wait for “GPS ±10 m” or better.</li>
          <li>Keep HYBRD on screen during the activity; use an armband or a bike mount.</li>
          <li>Points worse than ±35 m and impossible jumps are filtered out, so distance can lag for a few seconds in tunnels or between tall buildings.</li>
          <li>Auto-pause stops the clock after ~10 s standing still — turn it off for intervals.</li>
          <li>The live map is off by default to save battery and data; tap “Show map” any time.</li>
          <li>Elevation appears only if your phone reports altitude; it’s approximate.</li>
          <li><b>Maps start where you are.</b> With no route to show, a map asks for your location and centers on you (blue dot + accuracy circle). Tap <b>◎</b> on any map to jump back to yourself. Your last position is remembered on this device only, so maps open there instantly next time.</li>
          <li>Location off? Maps fall back to your last known position, then a rough area from your phone’s time zone. To allow it: iPhone — Settings › Privacy & Security › Location Services › Safari Websites (or HYBRD) › While Using; Android/Chrome — tap the site icon next to the address › Permissions › Location › Allow.</li>
        </ul>
      </Card>
      <Card>
        <h3 style={{ marginBottom: 8 }}>Privacy</h3>
        <p className="muted small" style={{ margin: 0 }}>No ads, no trackers. Without an account, your data never leaves this device. With an account, it’s stored in the app owner’s Supabase database and row-level security lets only you read it. Location is used only while you record. Map tiles come from OpenStreetMap; product lookups go to Open Food Facts.</p>
      </Card>
      <Disclaimer />
      <p className="muted small">Exercise carries risk. Check with a doctor before starting a new program if you have a medical condition, and stop if you feel pain, dizziness or chest discomfort.</p>
    </Page>
  );
}
