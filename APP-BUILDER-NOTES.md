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

## Backyard distance units — built 16 Nov 2026

- A backyard **yard is one loop**, not a length unit: 4.167 mi / 6.706 km / 6,706 m / 22,000 ft (exact: 6,705.6 m and 22,000 ft; 24 yards = 100 mi = 160.9 km = 160,934 m = 528,000 ft).
- Backyard features (lap timer at `/timers?t=backyard`, setup when the race is a backyard, the Plan backyard card, Fuel per-yard schedule, and saved backyard history) have a **mi / km / m / ft** toggle. Yard (loop) counts are unchanged.
- The toggle defaults from the user's global mi/km setting (`profile.units`) and is persisted per user as `profile.byuDistUnit`. It does **not** change the global units setting used elsewhere.
- Loop distance, cumulative distance, a yards-to-distance table (thousands separators on m and ft), "A yard = one loop", and pace are all shown in the chosen unit. Pace is per mile for mi and ft, per kilometre for km and m; m/ft also show speed (m/s or ft/s) on the timer setup.
- Saved backyard workouts (`source: 'byu'`) store metres as before; history (Workout detail, Train history, Home recent) formats them in the chosen backyard unit (yard count is recovered from metres so 22,000 ft/yard stays exact). The timer now also saves per-yard laps.
- Code: `src/lib/ultra.ts` (`YARD_FT`, `fmtByuDist`, `fmtByuEquals`, `resolveByuUnit`, …), `src/components/ByuUnits.tsx`, timer / setup / plan / history views. Tests in `tools/test-ultra.ts`. Screenshots: `tools/shoot-backyard-units.mjs` → `phone-backyard-units-picker.png`, `phone-backyard-units-m.png`, `phone-backyard-units-ft.png`, `desktop-backyard-units.png`.


## Social: Friends & Stories — built 16 Nov 2026

**What it is:** a social layer at `/social`: public profiles, friends (requests, accept or decline, cancel, unfriend, block, invite links), a feed of posts (photos, text, workout card), 24-hour stories, likes and emoji reactions, comments, share and re-share, saves, notifications, reports and hiding. All 9 `social.*` features are `free: true` in `src/lib/entitlements.ts`. It needs Supabase accounts. In Local mode `SocialGate` shows "Connect accounts to use Friends & Stories" plus an opt-in **demo** with fictional sample people. Never present those as real users: every sample person has a `sample.` handle, a SAMPLE tag and a demo banner, and the sample images are SVGs labelled "SAMPLE ILLUSTRATION".

**Files**
- `src/lib/social.ts`: pure, unit-tested rules that mirror the SQL. It covers limits, the handle and display-name rules (reserved and `sample.*` names), the profanity filter (leet folding, word tokens, masking), age gates (`ageFromDob` and `ageGate`: under 13 blocked, under 18 forced to friends-only), the friend-graph reducer `applyAction`, `rateCheck`/`LIMITS`, `canSee`/`feedFor`/`visibleComments`/`canDeleteComment`, story expiry and grouping, notification text, URLs (`invite?u=`, `social/post?id=`, `social/profile?u=`; query params so GitHub Pages serves 200), `validatePost` and `checkSocialImage`.
- `src/lib/socialApi.ts` defines the `SocialBackend` interface, view types and `friendlyError`. `src/lib/socialDemo.ts` holds `seedDemo` and `DemoBackend` (idb-keyval `hybrd:social-demo:v1`; sample friends auto-react to your posts so alerts can be tried). `src/lib/socialSupabase.ts` holds `SupabaseSocial` (RPCs for the graph, the `social-media` bucket, signed URLs cached for 50 min, realtime on `notifications`). `src/lib/socialArt.ts` has the sample SVG art and initials avatars, and `src/lib/socialImage.ts` re-encodes images to ≤ 1440 px WebP/JPEG with metadata stripped (reusing the `gallery.tsx` helpers).
- `src/lib/socialStore.tsx`: `SocialProvider` (in `main.tsx`) and `useSocial()`. Its mode is `loading | underage | connect | signin | demo | live`. It also handles the badge (requests plus unread alerts), a 60 s poll, and a demo flag in localStorage `hybrd:social-demo`. Age comes from `profile.dob`, falling back to `profile.age`.
- `src/components/Social.tsx` holds the UI pieces: avatar, SampleTag, DemoBanner, SocialGate (it also resumes a pending invite), tabs, PostCard (with menu), ShareSheet, ReportSheet, StoriesRing/StoryViewer, RelButton and UserRow. `src/pages/Social.tsx` holds the pages: Feed, Create (post or story), Post and comments, Friends (friends/requests/find/blocked), Notifications, Saved, Profile, Setup, Rules and the Invite landing.
- Routes (lazy, in `App.tsx`; copies are made in `tools/postbuild.mjs`): `/social`, `/social/new`, `/social/post`, `/social/friends`, `/social/notifications`, `/social/saved`, `/social/profile`, `/social/setup`, `/social/rules` and `/invite`. Also: a Social item in the sidebar with a badge, a people icon in the phone top bar (on phones under 430 px the Coach pill becomes icon-only to make room), and Me › Friends & Stories. `Profile.dob` was added to `types.ts`.

**Supabase (`supabase/schema.sql`, Social section, safe to re-run; SETUP.md §11)**: 16 tables, all with RLS. The private DOB lives in `social_private`. Writes to the graph go only through `security definer` RPCs (`social_create_profile` checks age ≥ 13 and bans; then send, cancel, respond, unfriend, block and unblock, plus `social_my_blocks` and `social_handle_available`). BEFORE triggers force the author, timestamps, story expiry and friends-only for minors. AFTER triggers maintain counters and notifications. Rate limits go through `social_rate_check`. The `social_can_view*` helpers back the select policies. Policies are dropped in a loop and recreated, and there are column-level grants. The private bucket `social-media` (8 MB, jpeg/png/webp) has 4 policies, and reads follow post or story visibility. `notifications` is added to realtime when the publication exists. `social_cleanup_expired()` is for pg_cron. Reports keep a snapshot, and the moderation SQL is in SETUP.md §11.3.

**Tests and screenshots**
- `tools/test-social.ts`: 141 checks, including reactions (toggle, change, remove, top-3, like migration, blocked users).
- `bash tools/test-social-sql.sh`: applies the schema twice to real Postgres 17 using `tools/sql/supabase-local-shim.sql`, which provides local-only roles, `auth.uid()` and a storage stub. Then the Friends & Stories SQL checks in `tools/sql/test-social.sql` (122 policies after reactions were added). For `PG_BIN`, this box used the `@embedded-postgres/linux-x64` binaries in `/tmp/pgtest`.
- `tools/test-gallery.ts` now counts only the user-media storage policies.
- `tools/shoot-social.mjs`: 74 checks across phone, desktop and under-13 runs. It also fails on console errors and horizontal overflow. It writes `screenshots/phone-social-*.png`, `phone-friends.png`, `phone-friend-requests.png`, `desktop-social-feed.png` and `desktop-friends.png`, plus `phone-reactions-*.png` (comment bar, chosen reaction, reactor list, post bar).

**Emoji reactions (19 Nov 2026):** press-and-hold (~400 ms, touch and mouse) on a comment bubble or the React / Like button opens a floating pill with seven system emoji — Like 👍, Love ❤️, Haha 😆, Wow 😮, Sad 😢, Angry 😠, Dislike 👎 — no Care/hug, and not Facebook's artwork. Short tap on React/Like toggles Like; picking the same reaction again removes it; one reaction per user per post or comment. A coloured label sits next to Reply, with the top reaction icons and a count; tapping the count opens a sheet of who reacted, with tabs by type. The same bar is on post likes. Old likes migrate to the Like reaction (`migrateLikesToReactions`, and `likes` rows sync with `kind = 'like'` in SQL). Keyboard: context-menu key or Shift+F10, arrow keys, Enter, Escape. iOS callout and text selection are suppressed on the bubble without breaking scrolling. Haptics fire where `navigator.vibrate` exists; the scale-in animation respects reduced motion.

Pure helpers live in `src/lib/social.ts`. The UI is `src/components/Reactions.tsx`, wired into `PostCard` and the comments list. `SocialBackend.setReaction` / `listReactions` (demo + Supabase); `setLike` is a Like-shaped wrapper. Table `public.reactions` (check on the 7 kinds, unique `(user_id, target_type, target_id)`, owner-only write RLS, visibility inherited from the post/comment, `like_count` = total post reactions). Schema is safe to re-run and migrates existing `likes`. Demo seed includes mixed reactions on posts and comments. Notifications stay type `like`, with an optional `reaction` column and wording for comments / non-Like types.

**Known limits**
- The live Supabase client (`socialSupabase.ts`) is typechecked, and its SQL is verified on Postgres, but it hasn't been run end to end against a hosted Supabase project yet. Test it with two accounts (SETUP.md §11.4) before launch.
- The profanity filter is client-side and English-centric. There's no automated image moderation, so moderation means reports plus manual SQL.
- Expired stories vanish from the app at 24 h, but rows stay until `social_cleanup_expired` runs, and their image files stay until deleted in Storage.
- There are no push notifications (alerts arrive in-app via realtime or a 60 s poll). There are no DMs and no video.
- Live-mode "suggested" people are recent public profiles, not friends-of-friends.
- Demo data stays on the device (Reset/Exit in the banner). A user who enters an under-13 DOB is locked out of Social on that device (by design). Everything else in HYBRD still works.

## Gallery videos (Me › Gallery) — built 16 Nov 2026

**What it is:** the private Gallery at `/me/gallery` now takes videos as well as photos: upload one or many (MP4, MOV/QuickTime, WebM) or record one on a phone (`accept="video/*" capture="environment"`), tag / caption / date them like photos, play them in the full-screen viewer, and download them at original quality. Entitlement `gallery.videos` is `free: true`.

**Files**
- `src/lib/mp4.ts` (new, pure, unit-tested): ISO BMFF box walking (32/64-bit sizes, size 0 = to end), `sniffContainer` (ftyp brand `qt  ` = MOV, EBML = WebM), `parseMoov` (duration from `mvhd`, display size + rotation from the video `tkhd` matrix, recording date from `mvhd` creation time, GPS telemetry track types), `stripLocationInBox` / `stripVideoLocation` / `hasVideoLocation`.
- `src/lib/media.ts`: `GalleryItem` gains `kind` ('video'; missing = photo), `duration`, `container`, `localOnly` + `cloudNote`, `telemetry`, `playable`. New `detectKind`, `videoMime`, `checkVideo`, `checkDuration`, `checkMedia`, `fmtDuration`, `typeCounts`, `quotaState`, `isBackedUp`, `cloudPlan`, `zipPlan`, `zipLayout` + `crc32Update`; `filterItems` / `tagCounts` take a type filter; `usage` counts videos; `extFor` knows mp4/mov/webm.
- `src/lib/gallery.tsx`: `cleanVideo` (location strip on Blob slices), `probeVideo` (hidden `<video>`: duration incl. the MediaRecorder-WebM "seek to the end" trick, size, poster frame), `prepareVideo`; ZIP is now assembled from Blob parts (each original hashed in 8 MB slices, never copied into one array); sync handles device-only videos.
- `src/pages/Gallery.tsx`: type filter (All / Photos / Videos, `?type=photo|video`, combines with `?tag=`), video tiles (play mark + duration badge), viewer video player, upload sheet video rows + quota warnings, "Too big for one .zip" sheet, Record button.

**Behaviour**
- Caps: 200 MB and 5:00 per video (`VIDEO_CAP`, `VIDEO_MAX_SECONDS`), 10 videos + 30 photos per batch. Unknown duration (codec the browser can't read) is allowed. AVI / MKV / 3GP refused with a friendly message.
- Original bytes are kept — **no client-side re-encode**. For videos `orig` = the video file, `disp` = 1600 px poster (WebP/JPEG), `thumb` = 480 px poster; same IndexedDB keys as photos (`g:<id>:orig|disp|thumb`).
- Poster + duration + size come from the browser; if it can't decode the codec (e.g. iPhone HEVC in Chrome on some systems) the file is still saved with a drawn placeholder poster, `playable: false`, and duration/size from the `moov` box. The viewer then explains and offers the download.
- Date: `mvhd` recording time → file modified date → today (editable). Labelled "date from video".
- Viewer: inline `<video controls playsInline autoPlay>` with the poster, **muted by default** (top-bar mute button, `M` key), loop toggle (`L` key), `Space` play/pause, ← → / swipe between photos and videos (drags on the bottom 64 px control bar are not swipes), Esc closes.
- Downloads: a single video downloads as its original file (`hybrd-<date>-<tag>-<id>.mp4|mov|webm`). Several files → one store-only ZIP while the originals total ≤ 500 MB (`ZIP_MAX`); above that a sheet lists each file for one-by-one download (+ "Photos only as .zip").
- Storage: the Gallery card shows photos / videos / MB, a browser-storage bar from `navigator.storage.estimate()` and a warning at ≥ 80 %. The upload sheet blocks saving when the batch won't fit (5 % reserve) and warns when it will push usage over 80 %. A `QuotaExceededError` while saving shows a clear message.
- Compare stays photos-only (button disabled unless exactly two photos are selected). The Social story picker only lists photos.

**Privacy of video metadata**
- Phones hide the recording location inside MP4/MOV files. Because videos are not re-encoded, HYBRD strips it at byte level before saving or uploading: QuickTime/Android `udta/©xyz`, 3GPP `udta/loci`, iTunes-style `ilst/©xyz`, Apple `meta/keys` + `ilst` entries named `com.apple.quicktime.location.*` (value zeroed, key renamed) and XMP packets that mention GPS. Each blanked box is renamed `free` and zeroed **in place without changing any size**, so `stco/co64` sample offsets stay valid and the audio/video data is byte-for-byte identical. Only the small metadata boxes are read into memory (`moov` is a few MB even for 5 min); the rest of the file is spliced back as Blob slices.
- Not removable without a remux: GPS **telemetry tracks** (GoPro `gpmd`, Android `camm`). They are detected and the user is warned (upload sheet + viewer). If a file's box structure can't be fully read, the user is told it may still contain location data. WebM has no standard location field.
- Other metadata (camera make, creation time) is kept.

**Supabase**
- `gallery_items` gets generated, read-only columns `media_type`, `duration_s`, `poster_path`, `local_only` (from the row JSON; safe to re-run) + index on `(user_id, media_type)`.
- `user-media` bucket: 50 MB per file (the Free plan's global maximum) and `video/mp4`, `video/quicktime`, `video/webm` allowed. `CLOUD_FILE_CAP` in `media.ts` must match the bucket limit. Pro can raise the global limit (up to 500 GB per file) — raise the bucket limit and `CLOUD_FILE_CAP` together (SETUP.md §10.1).
- Videos over the cap stay on the device (`localOnly`, "Device only" pill in the viewer when signed in); their poster + thumbnail still upload so other devices show the tile. If the bucket refuses a video (413/415 or a size/MIME message — e.g. schema not re-run), the item is marked device-only with `cloudNote: 'refused'` instead of blocking the sync queue.

**Tests and screenshots**
- `tools/test-gallery.ts`: 169 checks without the old photo fixture (171 with it). New video checks cover type detection, sniffing, caps, `fmtDuration`, synthetic MOV boxes (duration, rotation, date, every location record, length unchanged, mdat untouched, idempotent, GoPro telemetry detection), real ffmpeg files (Android-style MP4 `loci`, QuickTime `©xyz`, iPhone keys, faststart MP4) checked with `ffprobe` before and after, decode check and identical video frame MD5s, filters / counts / usage, quota states, cloud plan, ZIP size guard and the streamed ZIP layout checked with Python `zipfile`, and schema / SETUP / Social wiring.
- `tools/sql/test-gallery-video.sql` (run by `tools/test-social-sql.sh`): generated columns on real Postgres, read-only, bucket limits.
- `tools/shoot-gallery-videos.mjs`: 103 checks across phone and desktop. Sample videos are generated with ffmpeg (motion graphics, no people), one iPhone-style MOV with a real location tag. Checks: refusals (6:10 video, AVI), drafts, location removed in IndexedDB and in the download (ffprobe), same size, frames identical, filters, autoplay muted, loop, `M` key, keyboard + swipe nav, ZIP of video + photo, compare rules, Me preview, reload persistence, delete, no console errors, no horizontal overflow. Writes `screenshots/phone-gallery-videos.png`, `phone-gallery-video-player.png`, `phone-gallery-video-upload.png`, `desktop-gallery-videos.png`.

**Known limits**
- No trimming: a trim without re-encoding needs an MP4 remux (keyframe-accurate cuts, edit lists), which isn't robust enough in the browser. Users trim in their phone's Photos app first (the error messages say so).
- Playback depends on the browser's codecs: HEVC/H.265 (iPhone "High Efficiency") plays in Safari but not in every Chrome / Firefox. Those files are kept and downloadable.
- GPS telemetry tracks (GoPro / some Android) are detected but not removed.
- Large videos fill browser storage fast; iOS Safari may evict site data after 7 days without a visit unless HYBRD is on the Home Screen. Uploads use the standard Supabase upload (not resumable TUS); a failed upload retries on the next sync.
- Supabase upload of videos hasn't been run end to end against a hosted project yet (no keys in `config.js`).

---

## Sleep nutrition (Fuel › Sleep, `/fuel/sleep`) — built 16 Nov 2026

- Files: `src/lib/sleep.ts` (pure, Node-testable: safety `screen`, `suppStatus`/`suppSuggestions`, caffeine model `halfLife`/`caffeineAt`/`cutoffHours`/`latestFor`/`band`, `buildPlan` timeline, `pickDinner`/`pickSnack`/`pickDrink`, log `stats`/streaks/`trend`/`compareFlag`, `DRINKS`). `src/data/sleepContent.ts` (31 graded evidence items + tips, `SLEEP_SOURCE_IDS`). `src/data/sleep-recipes.json`, built by `tools/build_sleep_recipes.py` from USDA SR Legacy (`public/data/foods-usda.json`): 19 recipes (4 dinners, 8 bedtime snacks, 7 drinks), ids `sleep-*`, `cat: 'sleep'`, plus `kind`, `timing`, `grade` and `sugar`. They're in `ALL_RECIPES`, so `/fuel/recipe/:id` works (the back link goes to the Sleep foods tab) and Fuel › Meals & drinks has a "Sleep & evening" filter. Pages: `src/pages/Sleep.tsx` (`?tab=plan|caffeine|log|foods|evidence`) and `src/pages/SleepSetup.tsx` (Health → Your night → Caffeine → Goal → Your plan). The entry card is `src/components/SleepCard.tsx` on Fuel, and Fuel's "Sleep" tab goes to the route. CSS is under `/* Fuel › Sleep */` (`sl-*`); the `sl-root` wrapper stops long source chips from overflowing on phones. A `moon` icon was added.
- Sources: 68 new `sleep-*` entries in `src/data/sources.ts` (PubMed-verified citations with DOIs, NIH/NCCIH/ODS, FDA, EFSA, USDA, AASM, ACP, ACG, IOC). The Evidence tab lists 73 (it reuses `issn-protein`, `issn-timing`, `acsm-fluid`, `acsm2016` and `ultra-caffeine`). Every timeline item, note, evidence card, drink and recipe cites at least one id, and tests check that each id exists.
- Grades: **strong** for caffeine harming sleep (Gardiner 2023 meta, EFSA), alcohol cutting REM (Gardiner 2025 meta) and CBT-I as first-line (AASM, ACP). **Moderate** for late meals and reflux (Fujiwara, ACG 2–3 h), nicotine, evening exercise (fine unless vigorous and ending ≤ 1 h before bed; Stutz), pre-sleep casein 30–40 g (ISSN, Res, Snijders), melatonin for jet lag across 5+ time zones (Cochrane) and decaf swaps. **Limited** for tart cherry, kiwifruit, milk, tryptophan, high-GI carbs ~4 h before bed, fatty fish, Mediterranean diet, magnesium, glycine, L-theanine, ashwagandha, chamomile, late fluids and race/shift guidance. **Weak** for valerian and spicy food (6 people).
- Caffeine model, labelled an estimate everywhere: first-order decay, instant absorption. Half-life is 5 h (IOM mean, range 1.5–9.5). "Barely affects me" uses 3 h and "very sensitive" 7 h. Smoking ×0.6, oral contraceptives ×2 (IOM "can double"), pregnancy ×2 (a modelling assumption), clamped to 1.5–15 h. The bedtime "line" `SAFE_MG` = 107·0.5^(8.8/5) ≈ 31.6 mg, i.e. what one coffee leaves at Gardiner's 8.8 h cutoff, so `cutoffHours(107)` = 8.8 h exactly. A pre-workout (217.5 mg) gets 13.9 h, slightly stricter than the study's 13.2 h. Colour bands: ≤ 31.6 low, < 100 some, ≥ 100 high (EFSA: 100 mg near bedtime may affect sleep). `latestFor` gives the latest time for another drink counting what's already logged. Drink mg values: USDA (coffee 95, espresso 64/127, black tea 47, green 28, cola 33, energy 75, dark chocolate 22, decaf 2); the pre-workout serve is from Gardiner.
- Plan logic (`buildPlan`, all in minutes before bed, so midnight-crossing and day-sleep shift schedules work):
  - Caffeine cutoff from the usual drink. If the cutoff is longer than the waking day, the plan says "skip it today".
  - Last big meal 3 h before bed (4 h for the onset goal, per Afaghi, and for GERD).
  - If training ends after that, a main meal comes 2–3 h before the session and a recovery meal ~45 min after it. Under 90 min before bed that becomes a recovery shake, which counts as the snack and the drink.
  - A vigorous session ending < 60 min before bed gets a warning. A caffeinated pre-workout gets flagged when it would leave more than the line at bed.
  - Alcohol item: "skip it" for race/recovery nights, otherwise "one, with dinner".
  - Rehydrate after training (ACSM). Taper fluids 2 h before bed (3 h if waking to pee). The taper is labelled a "HYBRD default" because it isn't a tested rule; with kidney disease it defers to the clinician.
  - Evening drink by goal: chamomile for onset (not with blood thinners, sedatives, pregnancy or breastfeeding), tart cherry for deeper sleep, warm milk or soy otherwise, herbal for shift work. It's skipped when the bedtime protein is a shake.
  - Bedtime snack by goal and diet. GERD: snack ≥ 90 min before bed.
  - Under 7 h in bed gets a warning.
  - Notes for race night/jet lag, shift work (Lowden), nicotine, pregnancy caffeine (200 mg), teens and drug-tested athletes (IOC).
- Safety screen:
  - Under 18 → `minor`: food and drink only, no supplements, teen caffeine/energy-drink notes.
  - Any of these → `caution`, and the user must tick "I'll talk to my doctor": pregnancy, breastfeeding, sedatives, antidepressants, blood thinners, BP meds, other prescription meds, sleep disorder, insomnia > 3 months, kidney, GERD, liver, epilepsy, thyroid/autoimmune.
  - Per supplement (`suppStatus`): ok / doctor / avoid. Avoid when: under 18 (all), ashwagandha in pregnancy, breastfeeding, liver or thyroid, valerian with sedatives or liver, magnesium with kidney disease. Doctor otherwise whenever any flag is set; melatonin with blood thinners or epilepsy is doctor.
  - Suggestions appear only if the person opts in and the status is ok. Melatonin is suggested only for race + 5 time zones. Valerian and ashwagandha are never suggested.
  - The CBT-I / not-medical-advice banner is on every tab and in setup.
- Storage: collection `sleeps` → table `sleep_logs` (one row per night, id `night-YYYY-MM-DD`, `date` = morning woke) and `caffeine` → `caffeine_logs` (one row per drink). Both are in `COLLECTIONS`, `emptyData`, `TABLES` and `schema.sql`: inserted before `fasting_logs` in both table loops, plus RLS enable, anon revoke, authenticated grant and the check list. The plan lives on the profile (`profile.sleep`: quiz, level, ack), so it syncs in `profiles.data`. "Late caffeine" is pre-ticked in the morning log when logged caffeine left more than the line at bedtime. Sample data adds 13 nights (tagged `sample-sleep-*`, removed with the other sample data).
- Log stats: 7-night average hours and quality, nights ≥ 7 h, logging streak, 7 h+ streak and best, a 14-night trend (bars with a 7 h line, quality numbers). "Your patterns" compares nights with and without late caffeine, alcohol or a late meal, shown only with ≥ 3 nights on each side, and labelled "a pattern, not proof".
- Entitlements: `sleep.plan`, `sleep.caffeine`, `sleep.log`, `sleep.recipes`, `sleep.research`, all `free: true`. Routes `fuel/sleep` and `fuel/sleep/setup` were added to `tools/postbuild.mjs` and `App.tsx` (lazy).
- Tests: `tools/test-sleep.ts` (123 checks: model and the 8.8 h anchor, decay, latestFor, plan timing incl. midnight/shift/GERD/late training, safety and supplement gates, stats/streaks/trend/compare, content and source integrity, recipe macros, storage/schema/route wiring). `tools/sql/test-sleep.sql` (owner-only RLS, anon denied) runs from `tools/test-social-sql.sh`. Screenshots: `tools/shoot-sleep.mjs` (phone + desktop, includes a no-horizontal-overflow check) → `screenshots/phone-sleep-*`, `desktop-sleep-*`.
- Known limits:
  - The caffeine curve is a population model, not a measurement (genetics, liver disease, medicines and absorption time aren't modelled beyond the sensitivity choice).
  - The pre-workout default (218 mg) must be replaced by the label value through the custom amount.
  - No reminders/notifications for the cutoff (Web Push is installed-PWA only on iOS).
  - No wearable sleep import.
  - Most food evidence is small or short trials, and that's how it's graded.
  - Recipe macros are USDA estimates.
  - Supabase sync of the two new tables is covered by the local SQL test, but hasn't been run against the hosted project.

## Mind & Recovery (`/mind`) — built 17 Nov 2026

- **Where it lives:** a new top-level route `/mind` (“Mind” in the desktop side nav, between Fuel and Burn; the phone bottom nav stays at 5 items). Entry points: a Home card (`src/components/MindCard.tsx`: readiness chip or “Check in · 20 s”, Breathe 5 min, Get help), two Me rows (Mind & Recovery, Get help now), and a readiness line on Coach › Today (`ReadinessChip`). Routes: `/mind?tab=today|breathe|skills|recover|journal|trends|evidence`, `/mind/setup`, `/mind/help`, `/mind/breathe/:id` (`sigh|box|resonance|prerace`, `?min=`), `/mind/routine/:id` (`post-run|upper|hips-ankles|foam|downshift`), `/mind/program/:id?day=N` (`discipline|prerace|stress|focus`). `mind`, `mind/setup` and `mind/help` are in `tools/postbuild.mjs`; the dynamic ones use the 404 fallback.
- **Files:** `src/lib/mind.ts` (pure, Node-testable logic: crisis constants + `crisisInText`, setup screen + `toolStatus`, WHO-5 / PHQ-4 scoring + `screenOutcome`, `readiness`, `baselines`, `sleepPenalty`, session-RPE load (`loadSummary`, `isHard`, `hardYesterday`), `recoveryPlan`, `coldHeatAdvice`, `deloadSignal`, breathing `PATTERNS` + pacer maths (`sessionTimeline`, `phaseAt`, `scaleAt`), streaks / `trend` / `patterns` / `moodWatch` / `programProgress`). `src/data/mindContent.ts` (41 graded evidence cards, 4 programs with 24 written lessons, 5 timed routines, tips, `MIND_SOURCE_IDS`). Pages: `Mind.tsx`, `MindSetup.tsx`, `MindHelp.tsx`, `MindPlayer.tsx` (breathing + routines), `MindProgram.tsx`. Shared UI: `src/components/MindBits.tsx` (CrisisCard, NotTherapy, MGrade, Ring). CSS under `/* Mind & Recovery */` (`mn-*`, reusing `sl-*` grade/trend/grid classes); `mn-root` guards against sideways overflow. New `mind` icon.
- **Storage / sync:** collections `checkins` → `mind_checkins`, `journal` → `journal_entries`, `mindsessions` → `mind_sessions`, `screens` → `mind_screens` (types.ts, `emptyData`, `TABLES`, `schema.sql` in all four places, inserted *before* `sleep_logs` so the sleep/gallery test contracts hold). `profile.mind` (setup answers) syncs with the profile. **Privacy:** if the user picks “keep my journal and check-ups on this device only”, new journal entries and check-ups get `localOnly: true`; `store.tsx` (`isLocalOnlyRec`) never uploads them or queues them on pull, and the database rejects them anyway (`journal_entries_not_local_only`, `mind_screens_not_local_only` check constraints). Daily check-ins and sessions always sync so readiness works across devices. Known limit: turning privacy on later does not delete copies that already synced (delete them in the app — deletes sync as `deleted: true`).
- **Safety layer (every Mind screen):** a compact crisis strip (call/text 988, 911, “contact your local emergency services”, findahelpline.com) plus “HYBRD Mind is self-care and training support, not therapy, diagnosis or medical advice”. `/mind/help` has big Call 988 / Text 988 / 911 buttons (`tel:` / `sms:` links work offline), NIMH warning signs, how to help a friend, when to see a professional, and the physical red flags. Crisis language in a journal entry, program note or check-in note (`crisisInText`, which ignores training slang like “suicide sprints/drills/runs”) shows the full crisis card — it never blocks saving and never claims to assess risk. Answering “yes” to the direct safety question in the check-up → crisis outcome with 988/911 first. Low mood on 3 days running → gentle note; low mood on ≥ 10 of the last 14 days (≥ 7 logged) → “worth talking to a professional” (NIMH’s 2-week guidance). Under 18: “talk to a parent, guardian, school counselor or doctor” wording everywhere, an extra crisis card in setup, no cold-water immersion, sleep need 8 h. Health toggles adapt tools: breath-holds removed (5 in · 5 out) for pregnancy, heart, lung, epilepsy or panic; cold water “ask your doctor” with heart/pregnancy, “skip” with Raynaud’s; sauna “ask your doctor” with heart/pregnancy. Red flags (chest pain, one-sided numbness, dark urine with severe muscle pain, head knock, pop/swelling, bony-spot pain, fever) force “Stop — get checked”, three with “call 911”.
- **Readiness (labelled “Heuristic”, formula v1):** wellness = sleep quality 20% + soreness 20% + energy 20% + stress 15% + mood 15% + motivation 10% (1–5 each; stress/soreness inverted; Hooper/McLean domains) → 0–100. Adjustments: sleep < 7 h −5, < 6 h −10, < 5 h −15 (teens 8 h); HRV (rMSSD) > 1 SD below the 7-day ln-mean (needs ≥ 5 readings) −10; resting HR ≥ 5 bpm above the 7-day mean −5; hard session yesterday −5. Bands: ≥ 70 train as planned, 50–69 go easier, < 50 recovery day. Overrides: red flag or sharp pain → stop; ill → recover; niggle caps at go easier. Sleep hours pre-fill from today’s Fuel › Sleep log entry. The card shows every factor and the points it cost. HYBRD defaults (weights, −5/−10 values, 70/50 bands) are practice-based choices, not validated cut-offs — the underlying wellness questions and session-RPE are what the evidence supports.
- **Training load:** session RPE × minutes (Foster). Sessions without RPE use a typical RPE per type and are counted as “estimated”. Acute = last 7 days, chronic = weekly average of the 21 days before (uncoupled), ratio shown only with ≥ 28 days of history and **graded weak / “not an injury predictor”** (Impellizzeri, Lolli). Monotony and strain shown. “Hard” = RPE ≥ 7, ≥ 90 min, or ≥ 1.5 × your typical session.
- **Recovery toolkit:** planner after the latest hard session in 48 h (refuel ~0.3 g/kg protein, rehydrate, cold-water advice by goal and session type, mobility link, Sleep link, alcohol, next-day guidance, back-to-back warning), a “racing within 24 h” toggle, cold & heat guide with safety rules, deload signal (≥ 4 weeks since a week < 70% of average **and** a second signal) + how-to, 14-day load bars, DOMS vs injury. 5 routines with a move timer (sides doubled, 5 s transitions, prev/next/pause, wake lock).
- **Breathing player:** cyclic sighing (5 min, moderate), box (limited), resonance 5/6/7 per min (moderate), pre-race calm (4 min: sigh → resonance with imagery cue → “switch on”; limited). Animated orb; `prefers-reduced-motion` swaps it for a progress bar and text. Optional soft tone (Web Audio) and vibration (`navigator.vibrate`, where supported — not on iOS Safari). Sessions ≥ 1 min are logged to `mind_sessions`.
- **Programs (all original text):** 7-Day Discipline Reset, Pre-Race Confidence (7 days, incl. PETTLEP imagery scripts), Stress Reset (5), Focus (5). Each day: lesson, steps, optional tool (breathing / imagery / routine), journal prompt; completion = a `program` session `id:day`.
- **Journal:** win / gratitude / reflect / free with rotating prompts, 4,000-character cap, edit/delete, device-only badge. **Trends:** 14/30-day readiness bars, mood/stress strip, streaks (check-in streak, best, days logged, averages, minutes), “your patterns” (sleep 7 h+, day after a hard session, high stress) only with ≥ 3 days on each side, labelled “a pattern, not proof”. **Check-up:** WHO-5 + PHQ-2 + GAD-2 + direct safety question, every ~2 weeks, never a diagnosis.
- **Evidence:** 41 cards. Strong (11): if–then plans, progress monitoring, external focus, exercise for mood, sleep, stretching doesn’t reduce soreness, wellness self-report, session RPE, WHO-5, PHQ-2/GAD-2, athlete mental health. Moderate (19): breathwork, cyclic sighing, resonance, mindfulness, self-talk, imagery, goal setting, habits, routines, burnout, CWI soreness, CWI blunting strength gains, massage, compression, DOMS vs injury, overreaching vs OTS, alcohol, life stress & injury, asking about suicide. Limited (10): box breathing, reappraisal, gratitude, expressive writing, self-compassion, sauna, foam rolling, cool-down, deload, HRV-guided training. Weak (1): ACWR. Sources: 120 new `mind-*` entries in `src/data/sources.ts` (DOIs verified via Crossref; abstracts read via Europe PMC; NIMH, SAMHSA 988, WHO, NCCIH, APA, AAOS, MedlinePlus, NHLBI pages). The Evidence tab lists 130 (it reuses `foster`, `sleep-walsh`, `sleep-watson`, `sleep-gardiner-alcohol`, `ultra-racinais`, `ultra-riebe`, `issn-protein`, `issn-timing`, `acsm-fluid`, `wl-reds`). 988lifeline.org, heart.org and cdc.gov block automated checks, so the SAMHSA 988 and NHLBI pages are cited instead.
- **Licensing — decision for José:** PHQ-2 / GAD-2 are free to reproduce (Pfizer; attribution shown). **WHO-5 is © WHO 2024 under CC BY-NC-SA 3.0 IGO — non-commercial use only**, unchanged, cited, no WHO logo or endorsement. That’s fine while everything is free; **before any paid tier, ads or a commercial native app, ask WHO for permission or drop WHO-5** (the PHQ-4 part and the rest of the feature work without it). No other licensed instruments are used; the daily check-in uses generic wellness wording, not a copyrighted questionnaire.
- Entitlements: `mind.checkin`, `mind.breathe`, `mind.programs`, `mind.recovery`, `mind.journal`, `mind.trends`, `mind.screening`, `mind.research`, all `free: true`. Sample data adds 18 check-ins (today left open), 4 journal entries, 10 sessions (Discipline days 1–3) and one check-up, all removable with the rest of the sample data.
- Tests: `tools/test-mind.ts` (178 checks: readiness maths and overrides, baselines, crisis words incl. slang exclusions, crisis/professional messaging + under-18 wording, red flags, tool gating, WHO-5/PHQ-4 scoring + cut-offs, load/ratio/monotony/hard sessions, planner, cold/heat, deload, pacer timing + orb, streaks/trends/patterns/mood watch, programs, content + source integrity, storage/sync/schema/route/entitlement wiring, safety UI presence). `tools/sql/test-mind.sql` (owner-only RLS, anon denied, device-only rows rejected) runs from `tools/test-social-sql.sh`. Screenshots: `tools/shoot-mind.mjs` (phone + desktop, no-horizontal-overflow check on every shot, reduced-motion check) → `screenshots/phone-mind-*`, `desktop-mind-*`.
- Known limits:
  - Readiness is a transparent heuristic, not a validated score; it can’t see illness, under-eating (RED-S) or life events you don’t log.
  - HRV / resting HR are typed in — no wearable import yet (native app later: HealthKit / Health Connect).
  - Crisis-word detection is a simple English phrase list: it will miss some messages and is not a risk assessment. No human monitors entries, and HYBRD can’t contact anyone. Non-English text isn’t checked.
  - 988 is US-only; other countries get “contact local emergency services” + findahelpline.com, not a per-country number.
  - Vibration doesn’t work on iPhone Safari; audio cues need a tap first (browser autoplay rules). No background audio when the screen locks.
  - Turning on “device only” later doesn’t remove entries that already synced.
  - WHO-5 licence is non-commercial (see above).
  - Supabase sync of the four new tables is covered by the local SQL test, but hasn’t been run against the hosted project.


## Messages (private DMs + group chats, `/messages`) — built 19 Nov 2026

**What it is:** Instagram/Messenger-style private messages. People can message each other even if they aren't friends: non-friends land in **Requests**. It covers 1:1 chats and groups (up to 32 people), text and emoji, photos and videos, workout cards, replies, the same 7 press-and-hold reactions as posts (👍 ❤️ 😆 😮 😢 😠 👎), editing within 15 minutes ("Edited"), unsend for everyone, delete for me, copy and forward. It also has sent / delivered / seen, typing indicators, date separators, unread counts and a badge, mute, pin (max 3), archive, search, and an offline outbox with retry. All 7 `messages.*` features are `free: true`.

**PRIVACY (say it exactly like this, never "encrypted"):** messages are stored in Supabase and protected by Row Level Security. Only people in a chat can read it, and the HYBRD team can read reported messages. They are **NOT end-to-end encrypted.** The UI says so in the inbox footer, chat details and Messages › Privacy. Email addresses and phone numbers are never shown. Profiles only carry a handle, display name and avatar.

**Rules (enforced by the database; `src/lib/messages.ts` mirrors them for the demo and instant UI feedback)**
- **Who can message me** (`dm_settings.who_can_message`): Everyone (default for adults) / Friends of friends / Friends only (default for under-18s) / No one. "No one" stops new chats; existing chats keep working.
- **Requests:** a non-friend's first message creates a request. The sender can send **3 messages** until it's accepted (`dm_request_limit`). They see only "Sent", never Delivered/Seen, until acceptance. Decline is silent: the sender still sees a pending request. Becoming friends turns a pending request into a normal chat (`friendships_dm_after` trigger). Request previews, notifications and media are hidden or blurred until you tap. Requests can be Accepted, Deleted, Blocked or Reported.
- **Under 18 (13–17):** minors and adults can only chat while they're friends, in both directions and for existing chats too. If they unfriend, the chat stops (`dm_minor_block`, checked on every message). A teen can join a group only if they're friends with every adult in it. The 13+ gate is the existing `SocialGate`.
- **Blocks** reuse `blocks` from Friends & Stories. A block stops sending, reacting, presence and new chats both ways, and the error is a generic "You can't message this account".
- **Groups:** you can add friends only. Admins rename the group, remove people and make admins. Anyone can leave, and if the last admin leaves the next member is promoted. People added later don't see earlier history (`cleared_at` = join time).
- **Edit/unsend:** only the sender. Edits are allowed for 15 minutes on text and captions. Unsend wipes the text, media and reactions and leaves a placeholder. "Delete for me" is per person (`message_hidden`), and "Delete chat" hides history for me only (`cleared_at`).
- **Read receipts and activity status are reciprocal:** turn yours off and you don't see others'.
- **Safety:** the profanity filter masks words (`cleanText`). Rate limits are 30 messages a minute, 400 an hour, 20 new chats an hour, 30 requests a day, 20 groups a day, 300 reactions an hour and 30 reports a day. Links are http(s) only, never auto-fetched or previewed. Risky links (shorteners, raw IPs, punycode, http, fake "hybrd") get a ⚠️, and links from non-friends open through a "Leaving HYBRD" sheet. Scam wording or links from strangers show a "Be careful" banner, and sharing a phone or email with a stranger shows a caution. Crisis words in the composer show the Mind 988 card (`crisisInText` + `CrisisCard`). It **never blocks sending**.
- **Reports** (`message_reports`): the reasons are the same as Friends & Stories. A trigger snapshots the reported message, or the last 20 messages for a conversation report, plus the reported user. Reporters can't read reports, and moderators use the SQL editor (SETUP.md §12).

**Files**
- `src/lib/messages.ts`: pure rules (eligibility, requests, groups, edit/unsend, reactions, unread/folders/badge, status, presence, links/scams, grouping, search, outbox, notifications). It is Node-safe and unit-tested.
- `src/lib/messagesApi.ts`: the `DmBackend` contract.
- `src/lib/messagesDemo.ts`: `DemoDm`, which runs on the device with the SAMPLE people from the social demo (idb `hybrd:dm-demo:v1`). Sample friends mark your messages delivered and seen, type, and reply, so receipts and typing can be tried. The demo user is `me`. An under-18 demo user gets no adult requests.
- `src/lib/messagesSupabase.ts`: `SupabaseDm` (dm_* RPCs, the private `message-media` bucket with 1 h signed URLs, realtime `postgres_changes` on messages, reactions and my memberships, plus Broadcast on private channels `dm:<conversation id>` for typing and "seen" pings).
- `src/lib/messagesStore.tsx`: `MessagesProvider`/`useMessages()`, inside `SocialProvider` in `main.tsx`. It handles the backend choice, inbox, badge, settings, typing map, a 45 s poll plus a heartbeat, the **offline outbox** (idb `hybrd:dm-outbox:v1`; client UUID = message id, so retries can't duplicate; exponential backoff up to 6 tries, then "Not sent · Retry") and in-app notifications.
- `src/components/Messages.tsx`: bubbles, menus, report/forward/workout sheets, `DmBanner` and `MessagesLink`. `src/pages/Messages.tsx` holds the inbox, chat, new message/group, chat details and privacy settings.
- Routes: `/messages` (`?folder=requests|archived`), `/messages/chat?c=<id>` or `?to=<handle>` (the chat is created on the first send), `/messages/new` and `/messages/settings`. Static copies come from `tools/postbuild.mjs`. Entry points are the phone top-bar chat icon with a badge, the sidebar "Messages" item with a badge, a Social tab, the **Message** button on profiles and the chat icon in the Friends list.
- Media reuses the gallery pipeline. Photos go through `prepareSocialImage` (≤1440 px WebP, metadata stripped) with an 8 MB cap. Videos go through `prepareVideo` (location tags removed, no re-encode) with caps of 50 MB and 3 min. Forwarded media is copied into the destination chat's folder so access follows that chat.

**Notifications:** in-app only for now (a banner plus badges). Every notice goes through `deliverNotice()` in `messagesStore.tsx`. To add **push** later, register a service-worker Web Push subscription (iOS 16.4+ only for installed PWAs, see §3.6) or a native APNs/FCM token into `public.push_subscriptions` (already created, with RLS: own rows only). Then send from a Supabase Edge Function on a `messages` insert webhook. Use `notificationFor()` rules server-side: never include request content, and skip muted, blocked or self.

**Phone top bar:** under 430 px the Local/Sync mode chip collapses to a status dot (the label stays for screen readers and as a tooltip) so Social + Messages + Coach + avatar fit without sideways scroll.

**Tests:** `tools/test-messages.ts` (unit + demo end to end), `tools/sql/test-messages.sql` (RLS/trigger/RPC checks, run by `tools/test-social-sql.sh` after the schema runs twice) and `tools/shoot-messages.mjs` (screenshots `screenshots/phone-messages-*`, desktop two-pane, no sideways overflow).

**Known limits:** no end-to-end encryption. No voice notes, GIF search or message requests' "hidden requests" folder. Push isn't wired up yet. Search on live covers the latest 50 matching messages through `ilike` (add a trigram index or full-text search at scale). The live chat loads the latest 300 messages. Server-side profanity masking isn't done; the client masks before sending, like posts. A minor and an adult in the same group are only checked when someone is added.

## Calls (voice + video in Messages) — built 19 Nov 2026
- **What**: there are 📞 and 🎥 buttons in every chat header. Calls can be 1:1 or group calls of up to **4 people** (WebRTC mesh: everyone sends to everyone, so groups stay small; video bitrate drops as the call grows, from 1.2 Mb/s for 1:1 to 420 kb/s with 4 people).
- **Screens**:
  - A full-screen incoming call with Accept, Decline, and "Voice only" for video calls, plus a Web Audio ringtone (no sound files).
  - The outgoing ringing screen. It times out after 40 s and becomes "No answer" / missed.
  - The in-call screen has mute, camera on/off, flip camera, audio output (only where the browser supports `setSinkId`), voice → video upgrade, a draggable mirrored self view that snaps to corners, a timer, a 3-bar connection quality indicator (RTT / loss / jitter from `getStats`), "Reconnecting…" with an ICE restart, and end call.
  - Minimizing shows a green call bar while you browse.
- **Chat and inbox**: each call gets a card in the chat (missed in red / declined / duration, tap to call back). There's a **Calls** tab in Messages with All/Missed filters and a missed badge, and you can remove calls from it.
- **Safety**: only people you can message can call you:
  - Message requests and blocked accounts can't call.
  - Under-18s can only call friends, which is stricter than messages.
  - "Who can call me" offers People you chat with / Friends only / No one.
  - Do not disturb (1 h / 8 h / until 8 AM / until off) just rings out on the caller's side, so they never learn it's on.
  - There's a Report button on the call screen (ⓘ).
  - A camera/mic explainer shows before the browser asks, with clear per-platform help if access was blocked (and "Use voice only").
- **Honesty**: the app says calls are encrypted in transit peer to peer by WebRTC (DTLS-SRTP) and that calling hasn't had an independent security audit. It also says people in a call can see your IP unless "Protect my IP address" is on, which only appears once a TURN relay is configured. It never claims end-to-end encryption.
- **How it works**:
  - `src/lib/calls.ts` holds the pure rules, state machine, quality, signal validation and errors.
  - `callEngine.ts` runs one `RTCPeerConnection` per person with perfect negotiation. Every connection always has an audio and a video sender: voice calls send a blank canvas track, so switching to video, flipping or turning the camera off is `replaceTrack` with no renegotiation.
  - Signaling uses Supabase Realtime Broadcast on the private channel `call:<id>` (`callsSupabase.ts`).
  - Rings arrive via `postgres_changes` on `call_participants`, with a 12 s poll as a fallback.
  - `callStore.tsx` is the provider, and `components/Call.tsx` is the UI.
  - On the server, the `CALLS` section of `supabase/schema.sql` has the tables, RLS, RPCs and Realtime policies.
  - TURN uses `supabase/functions/turn-credentials` (coturn REST HMAC / Cloudflare / Metered; secrets only as env vars). See SETUP.md §13.
- **Demo mode** (before Supabase): calls are simulated on the device with the SAMPLE people. Their "video" is an animated avatar labelled "SAMPLE · SIMULATED VIDEO" and nothing is sent. Maya and Leo pick up, Ana declines, and the Calls tab has "… calls you" buttons to try an incoming call.
- **Tests**:
  - `tools/test-calls.ts` covers the rules, state machine, cards, quality, ICE, signals, the TURN function, docs guards and the demo end to end.
  - `tools/test-calls-webrtc.mjs` runs real Chrome peer connections through a local coturn: audio packets, video frames, voice→video, flip, camera off, mesh of 3 and 4, 5th person refused, junk signals ignored.
  - `tools/sql/test-calls.sql` covers RLS and RPCs.
  - Screenshots are `screenshots/phone-calls-*.png` and `desktop-calls-*.png` (`tools/shoot-calls.mjs`).
- **Known limits**:
  - No push notifications: a call only rings while HYBRD is open.
  - iOS stops calls when the app is backgrounded or the screen locks.
  - The mesh is capped at 4.
  - Some networks need a TURN relay (§13.4).
  - The audio output picker only works where `setSinkId` exists (not iOS Safari).
  - No call recording, screen share or CallKit/ConnectionService integration.
  - Not independently audited.
  - Next step for scale: an SFU (e.g. Cloudflare Realtime SFU or LiveKit) for bigger groups, plus Web Push / VoIP push for ringing when the app is closed.

