# App Builder notes — Hybrid Fit PWA

Product and UX notes for José. Written 14 Nov 2026 (America/New_York) against current Apple/WebKit docs (2025–2026). **Do not treat this as a spec to implement blindly mid-build** — it is a prioritized idea and gotcha list.

**Source I actually saw:** as of this writing the mid-build tree only contained `tools/build_foods.py` and `public/data/foods-usda.json` (USDA FoodData Central, SR Legacy, April 2018, per 100 g, with portion sizes). Suggestions below assume the brief: Vite + React + TypeScript PWA, Supabase auth (login, change password, change email) plus a local/offline mode, GitHub Pages, Leaflet GPS, timers, nutrition, and a Hybrid Score. Brand matches Discipline Reset: `#0a0a0a` background, white, `#FFE600` accent, Anton (heavy condensed) headlines.

**Hard rules:** no medical claims, no invented stats/testimonials, no “guaranteed results.” Calorie, TDEE, and pace numbers must be labeled **estimates**.

---

## 1. What would make it unique

Most fitness PWAs are generic loggers. The wedge is **honest hybrid training**: one place for calisthenics, cardio, and HYROX-style mixed work, with a score you can explain, and Discipline Reset’s accountability tone — not another black-box “AI coach.”

### 1.1 Transparent Hybrid Score (highest product priority)

Three axes, not a mysterious single number:

| Axis | What it reflects | Example inputs (user’s own recent work) |
| --- | --- | --- |
| **Strength** | Force / bodyweight skill | Pull-ups, push-ups, squats/lunges, loaded carries, wall balls |
| **Endurance** | Steady aerobic work | Run/walk/ride time-trials (e.g. 5K), longer easy efforts |
| **Engine** | Mixed work capacity | HYROX sims, bricks, AMRAPs, EMOMs after a run |

**Implementation hints**

- **Explain every number.** Tapping a score opens the formula, the sessions used, and the dates. If Engine is low: “Engine is behind Strength because your last 3 mixed sessions are slower than your 8-week best. Try a 30-min run + wall-ball brick.”
- **No fake precision.** Use whole numbers or three bars, never “87.42.” If an axis has fewer than *N* qualifying sessions in the last 28–42 days, show “Not enough data” instead of a guess.
- **Compare the athlete to themselves**, not to invented “elite percentiles” unless you later license a real dataset.
- **Time decay.** Sessions older than ~6–8 weeks count less so a stale PR cannot prop up the score.
- **Balance is the hook.** A composite (optional, integer 0–100, only when all three axes are populated) should reward even development. A huge Strength / weak Engine gap is the insight, not a vanity total.
- Store the formula version next to each saved score so you can change weights later without rewriting history.

### 1.2 HYROX station splits and simulation mode

This is the feature gym apps usually skip.

- **Race clock + 8 stations + 8 × 1 km runs**, with per-station and per-run splits, transition time, and a simple pace band (ahead / on / behind a *user-set* target — do not invent official cutoff times).
- **Simulation modes:** single station, station + run “brick,” or full sim. Indoor (no GPS) and outdoor (GPS on the runs) variants.
- **Split board** after the session: yellow highlight on the slowest station vs the athlete’s own last sim. That feeds weakness suggestions.
- Allow manual splits (tap “lap”) when a SkiErg/rower is not connected — do not depend on Bluetooth sensors for v1.

### 1.3 Brick / hybrid session builder

A visual builder, not a form: **A → transition → B** (e.g. 5 km run + 50 burpee broad jumps + 1 km walk-down). Presets for:

- Run / ride / walk + calisthenics
- HYROX station + run repeats
- Engine day (short intervals) vs long aerobic + easy strength

Show total estimated duration up front. Keep the in-session UI on one screen (timer + current block + next block). Save as a reusable template.

### 1.4 Discipline Reset–style streaks and accountability

Same voice as the workbook: direct, no shame, start-again is allowed.

- Daily “did the work” check-in (workout *or* a planned rest day both count — rest should be a first-class log, or streaks punish recovery).
- Streak + weekly consistency bar, Anton headline, `#FFE600` on the current day.
- Missed a day: one-tap **Reset and start today**, no lecture.
- Optional reminder via Web Push **only after the app is on the Home Screen** (see §3.6). Never spam; one reminder window the user chooses.
- Local-first: streaks must work with no account.

### 1.5 Weakness targeting (suggestions, not prescriptions)

From the Score and recent splits, offer 1–3 **suggested sessions**, clearly labeled as training ideas, not medical or coaching advice.

- Engine lagging → a short HYROX brick or EMOM after an easy run.
- Endurance lagging → a time-on-feet session at easy effort.
- Strength lagging → a calisthenics density session.

If data is thin, say so and suggest a baseline test (e.g. a 20-min AMRAP, a 5K, a max-strict pull-up set) rather than inventing a plan.

### 1.6 PR board

A single board: PRs by movement, distance, and HYROX station. Date, value, and a small sparkline. Offline, instant, no social feed required. A “since 8 weeks ago” filter keeps it honest with the Score decay.

### 1.7 Offline-first (and nutrition estimates)

You already have a local USDA SR Legacy food table (`kcal`, macros, fiber, sugar, sodium, portion + grams, `fdc_id`, per 100 g). Use it.

- **IndexedDB is the source of truth** for workouts, GPS tracks, logs, and food diary. Supabase is a signed-in sync layer, not a requirement to train.
- Food search must work offline from the bundled JSON (or a slimmed IndexedDB index). Prefer portion-based entry (“1 medium banana”) over raw grams, but keep grams available.
- **Label every energy figure as an estimate.** USDA values are averages; TDEE/calorie targets (e.g. Mifflin–St Jeor × activity factor) are estimates; GPS-derived calorie burn is a rough estimate — show “Est.” in the UI, never “you burned 732 kcal.”
- Do not diagnose, treat, or promise body-composition outcomes. No supplement or medical guidance.

---

## 2. Mobile UX for GPS tracking and timers in the browser

The session screen *is* the product on a run or AMRAP. Design it for a bouncing phone, one thumb, and a glance in sunlight.

### 2.1 Glanceable, one-handed session UI

- **One primary number**, huge (Anton, white on `#0a0a0a`): elapsed time *or* distance, user-pickable. Secondary row: distance / pace / split — high contrast, not tiny captions.
- `#FFE600` only for the live state, the hold-to-stop ring, and alerts (off-pace, auto-paused).
- Controls in the **thumb zone** (bottom, above `env(safe-area-inset-bottom)`): Lap | Pause | Hold-to-Stop. Minimum ~56–64 px targets, plenty of gap.
- **Lock / press-and-hold to stop** (800–1000 ms) with a visible progress ring. A single tap must never end a run. Optional 4-digit unlock if the phone is in a pocket/armband and is getting palm taps.
- Keep the map **off by default** during the activity (see §2.5). A “Show map” toggle is enough; the live screen is numbers + cues.
- After stop: summary first (time, distance, pace, Hybrid Score impact), map of the path second.

### 2.2 Cues, countdowns, interval builders

- **3–2–1 countdown** before start and before each work interval, with audio beeps.
- Interval builder: **EMOM, AMRAP, Tabata, custom (work/rest × rounds), HYROX race clock** (station + run list). Show *this interval* and *what’s next*.
- Audio is the primary cue. **Do not rely on `navigator.vibrate()`** — iOS Safari has no Vibration API. Feature-detect and use vibration only as a bonus on Android.
- **Unlock audio on the Start tap** (see §3.7). Use one shared `AudioContext` or one `HTMLAudioElement`; call `context.resume()` / `audio.play()` inside that gesture, then beep from the already-unlocked context.
- Interval boundary: short beep; last 3 seconds of work/rest: distinct beep; errors (GPS lost): a different tone + on-screen banner, not a modal.

### 2.3 Drift-free timing and crash recovery

- **Timestamps are the source of truth**, not `setInterval` tick counts. Store `startedAt`, `pausedAt`, `accumulatedPauseMs`. Displayed time = `now - startedAt - accumulatedPauseMs`.
- Use `setInterval` / `requestAnimationFrame` only to refresh the UI (~100–250 ms). On `visibilitychange`, recompute from timestamps so a backgrounded tab does not “lose” minutes in the display (the clock can still be correct even if GPS was not — be honest about that; see §3.2).
- **Persist the active session continuously** to IndexedDB (fallback: `localStorage` for a tiny pointer + last snapshot):
  - timer metadata on every pause/resume/lap
  - GPS points batched every 1–2 s (and immediately on pause/stop)
- On launch, if an unfinished session exists, show **Resume session** (time already elapsed, last point, “GPS was paused while the screen was off” if a gap was recorded). Never silently discard. Offer Discard with a confirm.

### 2.4 GPS quality, distance, auto-pause, battery

- Request location **only from the Start / Enable GPS control**, with `enableHighAccuracy: true` for outdoor run/ride. Explain why in one line before the system prompt.
- **Accuracy filter:** drop points with `accuracy` worse than ~30–40 m (tunable). Drop 0,0, identical repeats, and implausible jumps (e.g. > 100 m in 1 s).
- **Smooth the display** (exponential moving average or a short Kalman on lat/lng) so the pace number does not jitter. Compute **distance from filtered (not heavily smoothed) points** with haversine:

```js
// d = 2R arcsin(sqrt(haversin(Δφ) + cos φ1 cos φ2 haversin(Δλ)))
// R = 6371000 m; φ, λ in radians
```

- **Auto-pause** when filtered speed stays near 0 for ~8–10 s (higher threshold for walking). Auto-resume on movement. Show a clear AUTO-PAUSED state. Let the user disable it for intervals / traffic lights.
- **Gap handling:** if `timestamp` jumps (screen locked, app backgrounded), do **not** draw a straight line across the gap and do **not** add that haversine to distance. Record a gap, split the polyline, and say “tracking paused for 4:12.”
- Battery: no map tiles or Leaflet during the run by default; consider a slightly lower watch rate when accuracy is already good; stop `watchPosition` when the user pauses; offer an indoor / treadmill mode that is timer-only (no GPS).
- Calorie estimates from distance/time, if shown at all, get an **Est.** label and a “very approximate” footnote.

### 2.5 Leaflet, tiles, and OSM policy

Official OSMF raster policy ([Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/)):

- Use `https://tile.openstreetmap.org/{z}/{x}/{y}.png` (not the old `a/b/c` subdomains).
- **Visible attribution** on the map, always, not behind a toggle: © OpenStreetMap contributors.
- Honor cache headers (browsers already do). **Do not** build “download this city for offline” or pre-seed z14+ tiles — bulk/offline use of `tile.openstreetmap.org` is **prohibited**.
- Do not send `Cache-Control: no-cache` / strip `Referer`. Avoid a site-wide `Referrer-Policy` that blanks the Referer on tile requests.
- If you need real offline maps later, use self-hosted tiles or a provider that explicitly allows packaging — not OSMF’s public raster.

**Practical default:** map off during the activity; after stop, render the path once and let the browser cache the few tiles for that viewport. A short look-ahead while the user pans the summary map is fine; prefetching a whole city is not.

---

## 3. iOS Safari / Home Screen PWA gotchas

Verified against Apple and WebKit docs current as of late 2025 / 2026. iOS is the hard path; treat these as product requirements, not polish.

### 3.1 Geolocation needs HTTPS + permission (and a user gesture)

- The Geolocation API is a **secure context** (HTTPS or localhost). GitHub Pages is fine; `http://` LAN previews are not, except localhost. ([MDN: Geolocation API](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API), [W3C Geolocation](https://www.w3.org/TR/geolocation/))
- The user must grant permission. Call `getCurrentPosition` / `watchPosition` from a **direct tap** (Start), never on page load. Handle `PERMISSION_DENIED` with Settings guidance (Safari vs the Home Screen app are different — §3.4).
- Prefer a short pre-prompt (“We use GPS only during a run, on this device”) then the system dialog.

### 3.2 No background geolocation — tracking pauses when the screen locks

WebKit has **not** implemented background geolocation for the web (“Geolocation Sensor (background geolocation)” is listed as deliberately unimplemented). ([Tracking Prevention in WebKit](https://webkit.org/tracking-prevention/))

When the screen locks, the app is backgrounded, or the PWA is swapped away, JavaScript is suspended and `watchPosition` stops. There is no web equivalent of native “Always” / background location.

**Mitigations (do all of them):**

1. Request a **Screen Wake Lock** while a session is running, and show a persistent “Keep this screen on — iPhone cannot track GPS with the screen locked.”
2. Detect gaps on resume (§2.4) and tell the user what was lost.
3. Offer armband / bike-mount guidance and a “screen dimmed but awake” state (wake lock holds the screen on; you can still use a dark, glanceable UI).
4. Never market “tracks in your pocket with the phone locked.” That is a native-app capability, not a PWA one.

### 3.3 Screen Wake Lock: iOS 16.4 API, broken in Home Screen apps until 18.4

- `navigator.wakeLock.request('screen')` shipped in Safari 16.4. ([MDN: Screen Wake Lock API](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API))
- On **iOS / iPadOS 16.4–18.3**, the API appeared to work in a Safari tab but **had no effect in Home Screen web apps** ([WebKit bug 254545](https://bugs.webkit.org/show_bug.cgi?id=254545)).
- **Fixed in iOS / iPadOS 18.4** (shipped 31 Mar 2025). Official note: “The Screen Wake Lock API now also works in Home Screen Web Apps.” ([WebKit: Safari 18.4](https://webkit.org/blog/16574/webkit-features-in-safari-18-4/), [Safari 18.4 release notes](https://developer.apple.com/documentation/safari-release-notes/safari-18_4-release-notes))

**Implementation hints**

```js
let sentinel;
async function armWakeLock() {
  try { sentinel = await navigator.wakeLock.request('screen'); }
  catch { /* unsupported, denied, or low-power mode */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && sessionIsRunning) armWakeLock();
});
```

- The lock is **released whenever the document is hidden**; you must re-request on `visibilitychange`. A wake lock does **not** survive a locked screen / app switch, and it does not enable background GPS.
- Feature-detect. If the lock fails in a standalone PWA on < 18.4, keep the warning banner up. `try/catch` — low battery and Low Power Mode can reject the request.
- Show a small “Screen will stay on” indicator and a way to turn it off.

### 3.4 Install path: no `beforeinstallprompt`; Safari tab ≠ Home Screen app

- iOS has **no** `beforeinstallprompt` and no install button API. Installation is **Share → Add to Home Screen** (Safari or another browser’s Share sheet). On **iOS 26 / iPadOS 26**, added sites open as a web app **by default**; the user can turn off “Open as Web App” to get a bookmark instead. There are “zero requirements for installability,” but a manifest still supplies name, icons, `display`, and `start_url`. ([WebKit: Safari 26.0](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/))
- On **iOS 16.4–18**, `display: "standalone"` (or `fullscreen`) — or the legacy `apple-mobile-web-app-capable` meta — is what makes the icon a real web app rather than a Safari bookmark. Keep both the manifest and the meta tag.
- **Ship a custom install sheet** (Safari-only hint, with Share icon + “Add to Home Screen” steps). Detect `window.navigator.standalone === true` or `display-mode: standalone` to hide it once installed.
- **Storage and permissions are isolated.** A Home Screen web app’s website data is kept separate from Safari, and the domain is exempt from ITP’s 7-day cap (see §3.5). ([Tracking Prevention in WebKit](https://webkit.org/tracking-prevention/)) Location, notifications, and the Supabase session in a Safari tab will **not** reliably carry into the icon. Plan for a second login / second GPS prompt the first time the user opens the icon. Say this in the install sheet: “Add to Home Screen so your training log is not wiped, then sign in once inside the app.”

### 3.5 Storage eviction (7-day ITP rule)

If the user only uses the site in a **Safari tab**, ITP deletes script-writable storage after **7 days of Safari use without interaction** with the site: IndexedDB, localStorage, sessionStorage, service worker registrations and cache. ([Tracking Prevention in WebKit](https://webkit.org/tracking-prevention/))

**Home Screen web apps are exempt** from that 7-day cap, and their data is isolated from Safari. This is the main product reason to push install hard for an offline-first trainer. Still back up to Supabase when the user has an account, and do not promise that a never-installed Safari tab will keep years of logs.

### 3.6 Web Push only for installed PWAs (16.4+)

On iOS / iPadOS, Web Push, Notifications, and Badging work in **Home Screen web apps from 16.4 on**, after a user-gesture permission request. They do **not** work in a Safari tab. ([Web Push for Web Apps on iOS and iPadOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/), [Apple: Sending web push notifications in web apps and browsers](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers))

- Ask only after install, from a “Remind me to train” control — never on first launch.
- `userVisibleOnly: true`. Safari can revoke permission if push events are silent.
- Declarative Web Push also exists as of iOS 18.4 for Home Screen apps; not required for v1.
- No Apple Developer Program membership is required for Web Push.

### 3.7 Audio autoplay

iOS will not autoplay unmuted audio. Unlock on the first user tap (Start / Enable sounds): `audioContext.resume()` or `audio.play()` on a persistent element created up front. Later beeps reuse that context. A `new Audio()` created outside a gesture will be silent. ([MDN: Autoplay guide](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay))

### 3.8 GitHub Pages: `base`, `start_url`, `scope`, service worker

Project Pages live at `https://<user>.github.io/<repo>/`, not the domain root. Mismatched paths are the usual “PWA doesn’t install / SW never controls the page / white screen” failure.

- Vite: `base: '/<repo>/'` (or `./` only if you are sure all assets are relative).
- Manifest: `"start_url": "./"` (or `"/<repo>/"`), `"scope": "/<repo>/"`, `"id"` stable and under that scope, `"display": "standalone"`. **Do not** use `start_url: "/"` or a service worker at `/sw.js`.
- Register the worker with the same prefix, e.g. `register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })`.
- If you use `vite-plugin-pwa` / Workbox, configure `base` and `navigateFallback` for the repo subpath.
- Prefer **BrowserRouter + a GitHub Pages SPA fallback** (`404.html` copying `index.html`, or the standard redirect trick) so auth query params survive. HashRouter works without a fallback but collides with auth hashes (§3.9).

### 3.9 Supabase auth redirects vs GitHub Pages and HashRouter

Configure **Site URL** and exact **Redirect URLs** for production and local, including the repo subpath and trailing slash. ([Supabase: Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls))

Examples to allow:

- `http://localhost:5173/**`
- `https://<user>.github.io/<repo>`
- `https://<user>.github.io/<repo>/**`

Pass that exact origin as `redirectTo` on login, email change, and password recovery. Set Site URL to the production Pages URL (not `http://localhost:3000`).

**Hash collisions:** implicit/session links often return tokens in the URL hash (`#access_token=...` or `#error=...`). `HashRouter` also owns the hash (`#/login`). Those two will fight. Prefer:

- **PKCE** (`flowType: 'pkce'`) so the return is a query string (`?code=`), which the client exchanges with the stored `code_verifier`, **and**
- **BrowserRouter** (with the 404 fallback), **or** a dedicated redirect landing URL with **no hash route** (e.g. `https://<user>.github.io/<repo>/`) that parses the session then navigates into the app.

Email templates that change password or email must use a `redirectTo` that is on the allow list. Test all three: magic/login link, change email, change password, on both localhost and Pages.

### 3.10 Safe areas, `100vh`, icons, status bar

- Viewport: `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`.
- **Do not use `100vh` alone** for full-height shells — on iOS it does not match the visible viewport. Use `100dvh` (and `100svh` for “stable while chrome shows”) with a `100vh` fallback.
- Pad with `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)` so timers and hold-to-stop are not under the status bar, Dynamic Island, or home indicator.
- `theme-color` = `#0a0a0a`.
- Status bar: `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">` so the dark chrome sits over the `#0a0a0a` background. This only applies in standalone. ([Configuring Web Applications](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html))
- Icons: `<link rel="apple-touch-icon" sizes="180x180" href="...">` (apple-touch-icon takes precedence over manifest icons on iOS). Also ship 192 / 512 in the manifest. Add `apple-mobile-web-app-title` (short name) and `apple-mobile-web-app-capable` = `yes`.
- Optional `apple-touch-startup-image` — otherwise iOS may flash a screenshot of the last launch.

---

## 4. Suggested next steps (priority order)

1. **Offline core first.** IndexedDB as source of truth; resume-safe timer + session persistence; USDA food search already bundled — wire logging to it and stamp “Est.” on every calorie figure.
2. **PWA plumbing for GitHub Pages.** Correct `base` / manifest `start_url` + `scope` / service worker scope; `apple-touch-icon`, status-bar and viewport-fit meta; BrowserRouter + 404 fallback; install instruction sheet (no `beforeinstallprompt`).
3. **Supabase auth on Pages.** Exact redirect allow list, PKCE, test login / change email / change password on localhost and on the Pages URL, including the first open from the Home Screen icon (separate storage).
4. **Session UX.** Glanceable timer, hold-to-stop, audio unlock on Start, EMOM/AMRAP/Tabata/HYROX interval builder, timestamp-based clock.
5. **GPS v1 with honest limits.** User-gesture permission, accuracy filter, haversine, auto-pause, gap handling, wake lock + “keep the screen on” banner, map off during the run, OSM attribution, no tile prefetch.
6. **Hybrid Score v1.** Three axes, visible formula, no fake precision, “not enough data” states, self-comparison only.
7. **HYROX sim + brick builder + PR board + weakness suggestions** on top of the score and splits.
8. **Streaks / reminders.** Local streaks that respect rest days; Web Push only after Home Screen install, opt-in, one quiet window.
9. **Account sync (when signed in).** Conflict-safe merge of IDB ↔ Supabase; local mode remains fully usable signed out.
10. **Do not** sign up for stores, pay for accounts, or promise background tracking / medical outcomes. If a native wrapper is ever needed, it would be for locked-phone GPS — that is a later, explicit decision.

---

## Sources

- [MDN: Geolocation API](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API) — secure context, user permission
- [W3C Geolocation Standard](https://www.w3.org/TR/geolocation/)
- [Tracking Prevention in WebKit](https://webkit.org/tracking-prevention/) — no background geolocation; 7-day script-writable storage cap; Home Screen apps isolated and exempt
- [WebKit bug 254545](https://bugs.webkit.org/show_bug.cgi?id=254545) — Wake Lock ineffective in Home Screen web apps until 18.4
- [WebKit: Safari 18.4 features](https://webkit.org/blog/16574/webkit-features-in-safari-18-4/) (31 Mar 2025) — Wake Lock fixed for Home Screen web apps; Declarative Web Push for installed apps
- [Safari 18.4 release notes](https://developer.apple.com/documentation/safari-release-notes/safari-18_4-release-notes)
- [MDN: Screen Wake Lock API](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API)
- [WebKit: Web Push for Web Apps on iOS and iPadOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/) (16.4+, installed only)
- [Apple: Sending web push notifications in web apps and browsers](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers)
- [WebKit: Safari 26.0 features](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/) (15 Sep 2025) — every site added to the Home Screen opens as a web app by default
- [Apple: Configuring Web Applications](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html) — apple-touch-icon, capable, status-bar-style
- [MDN: Autoplay guide for media and Web Audio](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay)
- [MDN: Navigator.vibrate()](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/vibrate) — not available in iOS Safari
- [OSMF Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/)
- [Supabase: Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)

## Weight-loss programs (Fuel › Weight loss)
- Pure logic in `src/lib/wl.ts` (screen, computeWL, buildWeek/solveDay, groceryList, weightTrend, suggest); catalog = `src/data/planCatalog.ts` (recipes.json planner meta + `plan-foods.json`, rebuilt by `python3 tools/build_plan_foods.py`).
- Pages: `src/pages/WeightLoss.tsx` (`?tab=plan|week|grocery|progress|research`) and `src/pages/WeightLossSetup.tsx`. Entry: `src/components/WLCard.tsx` on Home and Fuel. Fuel/Home targets via `src/lib/fuelTargets.ts` (plan target when "Use in Fuel" is on; burn is not added on top).
- Collection `wlplans` → table `wl_plans`; weigh-ins reuse `body`. Newest non-deleted plan is active.
- Safety levels: stop (under 18, pregnant, breastfeeding, ED history) / maintain (BMI < 18.5) / gentle (diabetes, medical, BMI < 20). Suggestions never auto-apply.
- Tests `tools/test-wl.ts`; screenshots `tools/shoot-wl.mjs`. Routes `fuel/weight-loss(/setup)` are in `tools/postbuild.mjs`.
