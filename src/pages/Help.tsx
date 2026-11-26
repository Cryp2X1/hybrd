import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Page, Card, Disclaimer } from '../components/ui';
import { isIOS, isStandalone, wakeLockSupported } from '../lib/cues';

export default function Help() {
  const loc = useLocation();
  useEffect(() => { if (loc.hash) setTimeout(() => document.getElementById(loc.hash.slice(1))?.scrollIntoView({ block: 'start' }), 50); }, [loc.hash]);
  return (
    <Page title="Help & tips" kicker="Install · GPS · Devices · iPhone limits · Privacy" back="/settings">
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
        <p className="muted small" style={{ margin: 0 }}>Tap the <b>mi | km</b> switch on the Record screen (before or during an activity) or go to <b>Settings › Units &amp; display</b>. Everything updates instantly — distance, pace, speed, splits, elevation (ft / m) and charts. HYBRD stores every value in metric, so switching never changes or loses your data; mid-run splits are rebuilt from the raw GPS points. Weight (lb / kg) has its own switch in Me › Units.</p>
      </Card>
      <Card>
        <h3 style={{ marginBottom: 8 }}>Steps — what a web app can and can’t do</h3>
        <ul className="cues">
          <li><b>During Walk and Run recordings</b> HYBRD counts steps with your phone’s motion sensor (accelerometer). On iPhone, tap <b>Allow</b> when asked for motion access after you press Start.</li>
          <li>The sensor only works <b>while HYBRD is open and the screen is on</b>. Browsers pause motion and GPS when the screen locks or you switch apps, so steps taken then aren’t counted.</li>
          <li>If motion access is denied or the browser has no sensor (most laptops), steps are <b>estimated</b> from GPS distance ÷ your step length and marked “est.”. Set your step length in Me › Units & goals for better estimates.</li>
          <li><b>The web can’t read Apple Health or Google Fit.</b> For all-day steps, open the Health / Fit app, copy today’s number and use <b>Set day total</b> on the Steps card. In-app walks and runs are already inside that number, so nothing is counted twice. Use <b>Add to today</b> only for steps your phone didn’t see.</li>
          <li>Calories from steps (≈0.0005 × body weight in kg × step length in m per step, from the ACSM walking equation) are an estimate and only count steps outside recorded workouts, which already have their own estimate. The full method is in Burn › How it’s estimated.</li>
        </ul>
      </Card>
      <Card>
        <h3 style={{ marginBottom: 8 }} id="music">Music with Spotify — what works and the limits</h3>
        <ul className="cues">
          <li><b>No account needed:</b> Settings › Devices › Music player and the <b>Music</b> button (Record, Timers, workout logger) show public workout playlists from Spotify. They play 30-second previews, or full tracks if you’re logged in to Spotify in the same browser.</li>
          <li><b>Connect Spotify</b> to control your own Spotify from HYBRD: see what’s playing, play/pause, skip, choose the device and start your playlists. HYBRD signs in with Spotify’s PKCE flow — no password or secret touches HYBRD, and the tokens stay on this device (Disconnect deletes them).</li>
          <li><b>Spotify Premium is required</b> for play/pause/skip/device control (Spotify’s rule for the playback API). Free accounts can still use the embedded playlists.</li>
          <li><b>On phones</b> the music plays in the <b>Spotify app</b> and HYBRD is the remote (Spotify Connect). If it says no device, open Spotify on the phone, play any song for a second, come back and tap Refresh devices. Keep HYBRD on screen while recording — the phone pauses a web app’s GPS when you switch apps.</li>
          <li><b>On a computer</b> you can also choose <b>Play in this browser</b> (Spotify Web Playback SDK, Premium, needs DRM support). It asks for one extra permission (“streaming”).</li>
          <li><b>Development-mode limits:</b> HYBRD’s Spotify app is a personal, non-commercial project in Spotify’s development mode. The app owner must have Premium, at most <b>5 people</b> can use it, and each one must be added by Spotify email in the developer dashboard first — otherwise Spotify answers “not registered”. Spotify only grants wider access to registered companies with 250k+ monthly users.</li>
          <li><b>Cues + music:</b> beeps and voice cues still play over your music. With “Lower music during voice cues” on, HYBRD turns Spotify down while it speaks and back up afterwards (only on devices that allow remote volume — many phones don’t). On iPhone, Safari 16.4+ lets HYBRD mark its beeps as short notification sounds so they play on top of Spotify.</li>
        </ul>
      </Card>
      <Card>
        <h3 style={{ marginBottom: 8 }} id="devices">Heart-rate straps, watch files and Strava</h3>
        <ul className="cues">
          <li><b>Bluetooth heart rate</b> (Settings › Devices, or the ♥ button in Record, Timers and the logger): HYBRD talks to any sensor that uses the standard Bluetooth Heart Rate profile — most chest straps and armbands, and watches with “broadcast heart rate” turned on. Live BPM and your zone show during the session; the HR curve, average and max are saved with the workout.</li>
          <li><b>Which browsers:</b> Web Bluetooth works in <b>Chrome, Edge, Opera and Samsung Internet on Android</b>, and Chrome/Edge on Windows, macOS and ChromeOS (on Linux it’s behind a Chrome flag). <b>Safari and every browser on iPhone/iPad don’t support Web Bluetooth</b> (Apple hasn’t implemented it), and Firefox doesn’t either. On iPhone, record with your watch and import the file, or connect Strava. Third-party iOS browsers such as Bluefy add Web Bluetooth, but HYBRD hasn’t been tested there.</li>
          <li><b>If the sensor drops out</b> HYBRD reconnects by itself (it retries for about a minute). If that fails, tap <b>Reconnect</b>. Keep HYBRD on screen — phones can pause web apps in the background. Wet the strap’s electrodes if the reading is “no skin contact”.</li>
          <li><b>Zones</b> are 50/60/70/80/90 % of max HR. Enter your measured max HR in Settings › Units; otherwise HYBRD uses 208 − 0.7 × age (Tanaka 2001).</li>
          <li><b>Calories from heart rate</b> (Keytel 2005) replace the MET estimate for runs, walks, rides, indoor/stationary bike and cardio when at least half the session has HR. Calories from a watch file or Strava are used as-is. Strength sessions stay MET-based: the Keytel equation was developed on steady running and cycling, not lifting.</li>
          <li><b>Watch files</b> (Settings › Devices › Import files): drop one or many .fit, .tcx or .gpx files. You see a preview — route, time, distance, HR, cadence, elevation, laps — before anything is saved. Files are read on your device and never uploaded. The same file, or an activity that starts within 3 minutes with a similar length, is flagged as a duplicate.</li>
          <li><b>Strava:</b> Connect with Strava imports your recent activities (7, 30 or 90 days) with a “from Strava” badge. Strava’s API rules: Strava data is <b>shown only to you</b>, kept on this device for <b>at most 7 days</b> (HYBRD refreshes it when you open the app), not synced to your HYBRD account or exports, and never used for AI. Activities you delete on Strava disappear here at the next sync. To keep one forever, export its file on strava.com and import it. <b>Disconnect & delete</b> removes everything and revokes access.</li>
          <li><b>Strava limits:</b> a new Strava API app starts in “Single Player Mode” — only the app owner can connect (1 athlete). The owner can raise it to 10 athletes in Strava’s API settings; more than 10 needs Strava’s review. Strava allows 100 reads per 15 minutes and 1,000 per day for the whole app at first; A HYBRD sync uses 1–4 reads to list activities plus one per new activity (at most 20 per sync), and opening a Strava activity uses one more for its full route and heart rate. Creating the Strava API app needs a Strava subscription.</li>
        </ul>
      </Card>
      <Card>
        <h3 style={{ marginBottom: 8 }}>Indoor Bike and Stationary Bike</h3>
        <ul className="cues">
          <li>On <b>Train</b> (or Record › Indoor) you can start an <b>Indoor Bike</b> or <b>Stationary Bike</b> session. There is no map and no GPS — it’s a timer. When you finish, enter distance in mi or km (the same units switch as everywhere else), plus optional average speed, cadence (rpm), resistance level and average/max watts from the bike console.</li>
          <li><b>Calories</b> use average watts when you enter them (mechanical work ÷ a 24% efficiency assumption — an estimate). If there’s no power, a connected Bluetooth heart-rate strap uses the Keytel 2005 formula. Otherwise HYBRD uses Compendium of Physical Activities MET values for stationary cycling by effort (very light 3.5, light-to-moderate 4.8, moderate 6.8, vigorous 8.8, very vigorous 11.0).</li>
          <li>The <b>Indoor / Stationary Bike</b> program has a recovery spin, an endurance ride, 4 × 4 min intervals and HIIT sprints. Interval days open the existing interval timer (warm-up and cool-down included).</li>
          <li>Imported FIT files from indoor rides (cycling with no GPS) and Strava <b>VirtualRide</b> or trainer rides map to Indoor Bike. Watts in the file are kept when the file has them.</li>
          <li><b>Limit:</b> this web app can connect a Bluetooth heart-rate strap, but it cannot read power or cadence live from a trainer or gym bike. Copy those numbers from the console, or import a file from a head unit or watch.</li>
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
          <li><b>No Bluetooth heart-rate sensors</b> in Safari (no Web Bluetooth on iOS). Import your watch’s files or connect Strava instead.</li>
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
        <p className="muted small" style={{ margin: 0 }}>No ads, no trackers. Without an account, your data never leaves this device. With an account, it’s stored in the app owner’s Supabase database and row-level security lets only you read it. Location is used only while you record. Map tiles come from OpenStreetMap; product lookups go to Open Food Facts. Imported watch files are parsed on your device. Strava data stays on this device only (up to 7 days) and is never added to your account sync or exports.</p>
        <p className="muted small" style={{ margin: '8px 0 0' }}>Photos (profile picture and Gallery) are private to you — there’s no sharing or public feed. HYBRD re-saves every photo in your browser before storing it, which removes hidden metadata such as GPS location and camera details. With an account, photos go to a private storage bucket only your login can read.</p>
        <h3 style={{ margin: '14px 0 8px' }} id="deletion">Taking time off and deleting your account</h3>
        <p className="muted small" style={{ margin: 0 }} data-testid="privacy-deletion"><b>Time off</b> (Settings › Account) hides your profile, posts, stories, comments and shared activities and stops messages, calls and notifications. Nothing is deleted. <b>Delete account</b> deactivates your account straight away and deletes it permanently 30 days later: your account, training data, posts, stories, comments, shared activities, messages you sent and the photos and videos you uploaded. During those 30 days you can sign in and reopen it. Records of moderation decisions are kept without your account attached. Copies other people made themselves (for example screenshots) are outside HYBRD’s control, and the hosting provider’s backups expire on their own schedule.</p>
        <p className="muted small" style={{ margin: '8px 0 0' }}>Reports are anonymous to the person reported. See the <Link className="link" to="/safety/guidelines">Community Guidelines</Link> and <Link className="link" to="/safety/reporting">How reporting works</Link>.</p>
      </Card>
      <Disclaimer />
      <p className="muted small">Exercise carries risk. Check with a doctor before starting a new program if you have a medical condition, and stop if you feel pain, dizziness or chest discomfort.</p>
    </Page>
  );
}
