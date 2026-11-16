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


## HYBRD Coach (`/coach`)

- Files: `src/lib/coach.ts` (pure, deterministic generator + check-in rules + "why"), `src/pages/CoachSetup.tsx` (intake), `src/pages/Coach.tsx` (plan / weeks / food / why / check-in), `src/components/CoachCard.tsx` (Home, Train, Fuel), `src/lib/entitlements.ts`. Logger accepts `?coach=<planId>&w=<week>&d=<weekday>` and saves with source `coach:<id>:<w>:<wd>`.
- Not AI: no model, no server, no API cost. Same answers + seed → same plan. UI copy says "rule-based planner … not AI, and not medical advice".
- Storage: collection `coachplans` → table `coach_plans` (same row shape and RLS as the other tables; `supabase/schema.sql` is idempotent). Newest non-deleted plan is active. The plan stores slots + per-week layout/volume/adjustment; sessions are materialized on the fly, so edits, check-ins and pain swaps stay consistent.
- Level rules: strength Expert = 30+ push-ups, 12+ pull-ups and 1+ year; Intermediate = 12+ push-ups and 3+ pull-ups (or 20+ push-ups with no bar). Endurance Expert = 10K with 5K ≤ 25 min and 1+ year; Intermediate = 5K/10K (5K < 35 min) or a mile ≤ 9 min. Caps: new → Beginner; pregnant → Beginner; injury, medical/diabetes or under 18 → Intermediate. Goal picks which level drives the plan; HYROX/brick/HIIT use the lower of the two.
- Swaps: equipment needs per exercise (gym implies bar/dumbbells/bike/treadmill); injury avoid-lists per area; ordered alternatives searched breadth-first, then a safe category fallback; regressions for < 5 push-ups (incline) and 0 pull-ups (Australian rows). Knee issues turn runs into rides/walks except for run-race goals (unless pain is reported in a check-in).
- Schedule: days spread so hard sessions are never back to back (when possible), strength never the day before quality/long work, long session last; volume 1 → 1.05 → 1.1 → 0.7 (deload) and repeats; races of 6+ weeks end with a taper; HYROX race plans place a sim in the last build week of each block. Minutes are a hard cap.
- Check-ins (applied to next week, logged in the changelog): sharp or repeat pain → deload + see a physio/doctor; any pain → swaps for that area + hold; too hard with low energy / high soreness / < 50% done → ~25% lighter; too hard or < 50% done → hold (twice → suggest fewer days); too easy with ≥ 75% done → +5%, twice in a row → next level.
- Nutrition: reuses `wl.ts` (screen, computeWL, buildWeek, exclusions). Fat loss → WL targets; muscle → maintenance + 250 kcal (+150 Expert, none if BMI ≥ 30); otherwise maintenance. Under 18 / pregnancy / breastfeeding / eating disorder → no calorie numbers. PAR-Q positive → no plan at all. Fuel target precedence: weight-loss plan → coach plan (if "Use in Fuel") → profile.

### Premium later (not built — everything is free now)

- `src/lib/entitlements.ts` lists every coach feature (`coach.plan`, `coach.regenerate`, `coach.edit`, `coach.checkin`, `coach.nutrition`, `coach.mealplan`, `coach.why`) with `free: true`, and the UI already asks `can(feature)` before showing them. No paywall, prices or "Premium" badges are shown anywhere.
- To launch a tier later: flip chosen features to `free: false`, make `getEntitlements()` read a server-verified entitlement (e.g. a `entitlements` table written only by a Stripe or RevenueCat webhook — never trust a client flag), and add the upgrade screen where `can()` returns false. Keep existing users' plans readable (gate creation/edits, not access to data they made). Check app-store rules if it ships as a native wrapper (in-app purchase requirements).

## Fasting (Fuel › Fasting, `/fuel/fasting`)

- Files: `src/lib/fasting.ts` (pure: protocols, `screen`, `allowedProtocols`, `recommend`, `placeWindow`, timer math, `STAGES`, streaks, week view), `src/data/fastingContent.ts` (Research + Tips copy, each item with source ids), sources `fast-*` in `src/data/sources.ts` (29 new; Research tab lists 36 incl. reused `wl-lowe`, `wl-liu`, `wl-issn-diets`, `issn-protein`, `issn-timing`, `acsm-fluid`, `nasem-water`, `acsm2016`, `wl-helms-protein`). Pages `src/pages/Fasting.tsx` (`?tab=timer|plans|history|tips|research`) and `src/pages/FastingSetup.tsx` (5-step check). Entry `src/components/FastingCard.tsx` on Home and Fuel (setup prompt → live ring → eating-window status); Fuel tab "Fasting" navigates to the route. Shared `src/lib/useNow.ts`, `src/components/SrcPills.tsx`.
- Storage: logs in collection `fasts` → table `fasting_logs` (same row shape/RLS; `day` = local start date). Kinds: `timed` (start/end/targetH) and `lowcal` (5:2 / ADF day, id `low-YYYY-MM-DD`). The plan lives on the profile (`profile.fasting`: quiz, protocol, window, lowDays, level) so it syncs with `profiles`.
- Protocols (9): 12:12, 14:10 (beginner) · 16:8, early 8 h, 5:2 (intermediate) · 18:6, 20:4, modified ADF, 24 h once a week (advanced). Nothing over 24 h; the timer warns past 24 h. 20:4 is never auto-recommended.
- Safety: stop (no plan, no timer) for under 18, pregnant, breastfeeding, eating-disorder history, type 1, type 2 on insulin/sulfonylurea, BMI < 18.5. Caution (must tick "I'll check with my doctor"; beginner patterns only) for diabetes tablets / diet-only type 2, meds that need food or lower glucose/BP, heart disease (daily windows ≥ 10 h only), kidney disease, low BP/fainting, osteoporosis/falls risk. Any diabetes other than prediabetes → no low-calorie-day protocols. If re-screening returns "stop", the saved plan is switched off (`level: 'stop'`) and a running fast is ended.
- Levels: never fasted → beginner; tried → up to intermediate; regular (16:8+ for 4+ weeks) → advanced. Timer fast-length chips are capped at the longest protocol the person may use.
- Recommendation: beginner → 14:10 (start 12:12, per de Cabo & Mattson NEJM gradual plan); tried → 16:8 (14:10 if performance goal, 5+ training days or hard sessions); regular → 16:8 (weight or heavy training) or 18:6; health goal + morning/midday training or early riser → early 8 h; weekly preference + weight goal + light training → 5:2. Weight-goal copy always says fasting matched, didn't beat, calorie control.
- Window placement (`placeWindow`): works in minutes-since-waking (night shifts / midnight-crossing windows OK). Must contain the post-workout meal (session end + 30 min) and, for hard or > 60 min sessions, a pre-workout meal 2 h before; first meal ≥ 1 h after waking, last ≥ 1 h before bed, preferring to finish ~3 h before bed (7:00–23:00 → 16:8 = 12:00–20:00). Early TRE takes the earliest valid window. Notes explain trade-offs.
- Tie-ins: protein per meal from `fuelTargets` (`proteinPlan`: meals = 2–4 by window length); water target; 5:2 low day = 500 (women) / 600 (men) kcal (Hopkins), ADF = 25% of TDEE (`computeTargets().tdee`), compared with today's logged food.
- Stage copy is deliberately hedged (switch "typically beyond ~12 h", autophagy "animal and cell studies; human data early; no set hour"). Tests guard this wording.
- Entitlements: `fasting.plan`, `fasting.timer`, `fasting.history`, `fasting.research` — all `free: true`.
- Tests `tools/test-fasting.ts` (90 checks); screenshots `tools/shoot-fasting.mjs`. Routes `fuel/fasting(/setup)` added to `tools/postbuild.mjs`.
- Known limits: no notifications when the goal is reached (would need Web Push, installed-PWA only on iOS); timer is timestamp-based so it survives closing the app; no Apple Health / glucose / ketone data; 12:12 and once-weekly 24 h have little direct trial evidence (labelled "Limited evidence").

---

## Profile photo & Gallery (Me) — built 16 Nov 2026

**What it is:** a profile picture (shown in the Me header, mobile top bar, bottom-nav "Me" tab, desktop sidebar and the Home greeting; initials fallback) and a private photo Gallery at `/me/gallery` for progress / training photos. No sharing, no public feed. All features are `free: true` in `src/lib/entitlements.ts` (`profile.avatar`, `gallery.photos`, `gallery.download`, `gallery.compare`).

**Files**
- `src/lib/media.ts` — pure, unit-tested: `fitWithin` / `fitPixels` (≤ 16 MP so iOS canvas works), avatar `cropRect` / `clampOffset`, JPEG `readExif` (DateTimeOriginal, GPS present?), `stripJpegMetadata` / `stripPngMetadata`, `checkFile` (types + caps), `pickDate`, `filterItems` / `tagCounts`, `usage` / `fmtBytes`, `downloadName`, store-only `makeZip` + `crc32`, `initials`.
- `src/lib/gallery.tsx` — `MediaProvider` (in `main.tsx`, inside `StoreProvider`): canvas re-encode (`preparePhoto`, `renderAvatar`), IndexedDB blob store `hybrd-media/blobs` (keys `g:<id>:orig|disp|thumb`, `avatar:<ns>`), object-URL cache, downloads, Supabase Storage sync.
- `src/components/Avatar.tsx` — `Avatar`, `AvatarEditor` (drag, pinch, wheel, slider; circular mask; 512 px WebP/JPEG), `ProfilePhotoCard`, `GalleryPreview`.
- `src/pages/Gallery.tsx` — grid by month + tag filter (`?tag=progress|training|other`), upload sheet (caption, tag, date, "tag all"), full-screen viewer (swipe, ← →, Esc, edit details), multi-select, download (single original or ZIP), delete with confirm, before/after compare (exactly 2 selected; days apart).

**Processing rules**
- Accepts JPEG, PNG, WebP, HEIC/HEIF. HEIC works where the browser decodes it (Safari; iOS file pickers usually hand over JPEG anyway); otherwise a friendly error with the iPhone "Most Compatible" tip. SVG / GIF / video / PDF refused.
- Every image is decoded (EXIF orientation applied) and re-encoded via canvas, so **all metadata incl. GPS is dropped**; a byte-level strip runs on the output as belt-and-braces. Upload sheet tells the user when GPS was found ("location removed").
- Three copies per photo: **original** (full resolution ≤ 16 MP, JPEG q 0.92 or PNG kept as PNG, ≤ 10 MB — larger ones are re-encoded down with a warning; > 40 MB refused), **display** 1600 px WebP q 0.82, **thumb** 480 px WebP. WebP falls back to JPEG where the browser can't encode it.
- Date = EXIF DateTimeOriginal → file modified date (if not "just now") → today; editable.
- Max 30 files per batch. `navigator.storage.persist()` is requested after the first save; Gallery shows "N photos · X MB" and the browser's free quota.

**Data / sync**
- Metadata is a normal store collection `gallery` (`GalleryItem`, synced to table `gallery_items` like every other collection). Blobs never go into the JSON store or export.
- Signed in: background upload of thumb → disp → orig to the private bucket `user-media` at `<uid>/gallery/<id>/<kind>.<ext>`, then the row gets `remote` paths. Other devices fetch thumbnails lazily and the original only on download. Avatar → `<uid>/avatar.<ext>`, path saved in `profile.avatar.path` and `profiles.avatar_url` (a storage path, not a public URL). Deletes remove storage objects (queued in IDB if offline).
- `supabase/schema.sql` (safe to re-run): `gallery_items` table + RLS, `profiles.avatar_url`, private bucket (10 MB, jpeg/png/webp only) and four `storage.objects` policies where `(storage.foldername(name))[1] = auth.uid()`. Documented in `SETUP.md` §2 and §10.
- "Delete all data" (Me › Your data) also deletes photos and the avatar. JSON export notes that images are downloaded from the Gallery.

**Tests / screenshots:** `tools/test-gallery.ts` (80 checks; uses `tools/exif-fixture.mjs` to build real EXIF+GPS JPEGs; ZIP verified with Python `zipfile`). `tools/shoot-gallery.mjs` draws abstract sample images (no real people), uploads them, and checks stored blobs + downloads have no Exif/GPS, ZIP validity, filters, viewer swipe/keys, compare, delete, persistence after reload, avatar in nav. Route `me/gallery` in `tools/postbuild.mjs`.

**Known limits**
- iPhone Safari (not installed to Home Screen) may clear site data after 7 days without a visit — UI tells users to add to Home Screen and download backups. Local-mode photos exist only on that device/browser.
- Downloads on iPhone go to Files (not Photos); saving straight to Photos would need the share sheet, deliberately left out (no sharing).
- ZIP is built in memory (store, no compression) — fine for dozens of photos, heavy for hundreds of originals on older phones.
- Local → account import moves photo metadata; the image blobs are keyed by photo id so they stay usable and upload after sign-in; the local-mode avatar is per namespace, so it has to be re-picked after signing in. Orphaned storage objects are possible if a delete fails and the device never comes back online.
- No server-side virus/image validation beyond the bucket's MIME/size limits; no face blurring; no cloud thumbnails (Supabase image transforms are a paid feature).

## Bio (Me) — built 16 Nov 2026

- Card on Me, directly under the profile header/avatar (`src/components/BioCard.tsx`, helpers in `src/lib/bio.ts`). Free-form text, 1,000 character cap.
- View: line breaks preserved (`pre-wrap`), emoji ok, "Read more" after 280 characters or 5 lines. Edit: textarea, live counter, Save / Cancel. Empty prompt: "Tell your story: goals, sports, why you train...".
- Rendered as React text (no `dangerouslySetInnerHTML`). `http://` / `https://` URLs are auto-linked (`rel="noopener noreferrer nofollow"`, `target="_blank"`). `javascript:` / `data:` and markup are not links; `<script>` and other HTML display as characters.
- Stored on the profile (`profile.bio`), so it persists locally, syncs with the profile JSON, is included in the JSON export, and is cleared by "Delete all data" (`store.wipe` → `clearedBio()`). Private — there is no public profile; the card says "Only you can see this."
- `supabase/schema.sql` (safe to re-run): `profiles.bio text` with a dropped-then-recreated `profiles_bio_len` check (`char_length(bio) <= 1000`). Documented in `SETUP.md` §2 and §10. Profile upsert writes the column; if an older database is missing it, the profile JSON still saves.
- Entitlement `profile.bio` is `free: true`.
- Tests: `tools/test-bio.ts` (length limit, trimming, plain-text escaping, safe / rejected links, collapse, persistence via normalize, export / delete helpers, schema + entitlements). Screenshots: `tools/shoot-bio.mjs` → `phone-me-bio.png`, `phone-me-bio-edit.png`, `phone-me-bio-empty.png`, `desktop-me-bio.png`.

## Ultra & Backyard (Train) — built 16 Nov 2026

- Routes: `/train/ultra` (tabs Plan · Weeks · Fuel · Prep · Research; landing when there's no plan), `/train/ultra/setup` (5-step quiz), and Timers modes `/timers?t=backyard[&yards=&lap=]` (backyard lap timer) and `/timers?t=ultra&w=&d=` (a plan session in the sequence timer, saved with `source = ultra:<week>:<weekday>` so the day shows as done). Entry cards: Train › Programs (`ultra-entry`) and the Expert level filter (`ultra-entry-expert`). Postbuild route copies were added for `train/ultra` and `train/ultra/setup`.
- Code: `src/lib/ultra.ts` (pure: screening, readiness, plan builder, fuelling, backyard maths/status, `unitText` for imperial), `src/data/ultraContent.ts` (research cards, checklists, crew, acclimation, race week/day, recovery, warning signs, USDA real foods, `ULTRA_SOURCE_IDS`), `src/pages/Ultra.tsx`, `src/pages/UltraSetup.tsx`, `src/components/BackyardTimer.tsx`. Styles are under `/* Ultra & Backyard */` in `styles.css`.
- Storage: `profile.ultra` (`UltraSaved`: quiz answers, createdAt, target, yards, level, applyToFuel, checks, fuel prefs). It syncs inside the profile JSON, so there's **no schema change**. The plan is rebuilt deterministically from the answers and createdAt (`planOf`). Backyard timer state is in localStorage `hybrd:t:byu` (timestamps, so it survives reloads and a locked screen).
- Safety: **stop** if under 18, chest pain/fainting/palpitations, pregnancy or a current injury (shows the safety block, and pauses any saved plan). **Doctor gate** (needs "my doctor cleared me") for a heart condition, kidney disease, insulin/sulfonylureas, a past heat stroke/hyponatremia/rhabdo/AKI, or an eating-disorder history. With ED history, calorie/macro numbers are hidden and never pushed to Fuel.
- Readiness: ready / stretch / bridge / too-soon, from prerequisite thresholds that are **HYBRD coaching guidelines** (labelled so in the UI). Bridge recommends a shorter race, fewer yards, or the 8–12-week Ultra Base Builder.
- Plan safety rules (all tested in `tools/test-ultra.ts` over 216 profiles):
  - weekly km ≤ 1.1× the last full week's *actual* km
  - long run ≤ 1.1× the longest of the previous 4 weeks (or of the reported last-30-day longest run)
  - cut-back every 3rd week (under 2 years of running or age 50+) or every 4th, at −30% of actual
  - phases base → build → specific → taper
  - taper of 2 weeks, or 3 for 100 mi and backyards of 20+ yards, averaging ~41–60% less (Bosquet 2007)
  - time-on-feet caps on long runs
  - easy days are consolidated so no easy run is under 5 km
- Backyard: 6.7056 km / 4.167 mi every hour (24 yards = 100 mi). The plan includes on-the-hour simulations, yard-pace "gears", night yards and a between-yards routine. The timer shows:
  - bell countdown, lap time, rest left, yards, distance, elapsed, average lap
  - 3/2/1-minute and bell cues (sound/voice/vibration)
  - a routine checklist, a missed-bell DNF state, and save-to-history (run, distance = yards × 6705.6 m, source `byu`)
- Fuel: race planner for carbs, fluid, sodium, kcal, protein and caffeine per hour, by gut training, weather, sweat test and salty-sweater flag.
  - Carbs: 30–50 g/h untrained, up to 60–90 g/h trained (never above 90). ISSN kcal is 150–300/h, or 200–400/h for long races.
  - Fluid is 450–750 mL/h, or capped at the measured sweat rate (≤ 1000 mL/h hot, ≤ 800 otherwise).
  - Sodium is 500–700 mg/L, at least 300–600 mg/h in the heat.
  - Caffeine is 1–2 mg/kg per dose with a 6 mg/kg/24 h cap.
  - Per-yard / per-aid schedule, 12 USDA real foods, sleep plan.
- Daily training nutrition: carbs 4–10 g/kg by the day's session, protein 1.6–1.8 g/kg, fat ~1 g/kg. The **"Use in Fuel"** toggle feeds `fuelTargets` (precedence: weight-loss → Coach → Ultra → profile). REDs warning card.
- Prep: gear lists filtered by race type, crew guide, heat/cold/altitude, your taper, race-week checklist (ticks saved to `profile.ultra.checks`), race-day plan, recovery and return to run (labelled as a HYBRD guideline), and warning signs with what to do (hyponatremia, heat illness, rhabdo/AKI, cardiac, hypothermia, altitude).
- Research: 18 summary cards plus a list of all 52 cited sources (44 new `ultra-*` entries in `sources.ts`). Citations were checked against PubMed/DOIs and the original pages.
- Entitlements `ultra.plan`, `ultra.backyardTimer`, `ultra.fueling`, `ultra.prep` and `ultra.research` are all `free: true`.
- Tests: `tools/test-ultra.ts` (81 checks). Screenshots: `tools/shoot-ultra.mjs` → `screenshots/phone-ultra-*.png`, `desktop-ultra*.png`. It fails on any console error.
- Known limits:
  - No push notifications for bells (the web app can't wake a locked phone reliably; cues play while the screen is on, and the screen is kept awake while the timer runs).
  - The backyard timer is a manual "Finished yard" tap (no GPS auto-lap).
  - Finish times and calories are estimates.
  - Plan text is written in metric and converted for imperial display by `unitText`.
  - Apple Health can't be read from the web app.
