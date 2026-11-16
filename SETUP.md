# HYBRD — Setup (Supabase accounts + GitHub Pages)

The app works right away in **Local mode** (no account, data stays on the device).
Follow these steps to switch on sign-up / login / change password / change email / password reset and sync.
Everything here uses free tiers. Nothing has been deployed or created yet.

Assumed public URL: `https://cryp2x1.github.io/hybrd/`
(If you use a different repo name, rebuild with `VITE_BASE=/<repo>/ npm run build` and replace `hybrd` below.)

---

## 1. Create the Supabase project (≈3 min)
1. Go to https://supabase.com → **Start your project** → sign up (GitHub or email).
2. **New project** → pick your organization.
3. Name: `hybrd` · Database password: click **Generate a password** (save it in your password manager) · Region: closest to you (e.g. *East US (North Virginia)*) · Plan: **Free**.
4. Click **Create new project** and wait until the dashboard says the project is ready.

## 2. Create the tables + Row Level Security
1. Left sidebar → **SQL Editor** → **New query**.
2. Open `supabase/schema.sql` from this folder, copy everything, paste it into the editor.
3. Click **Run**. You should see "Success". The result grids list the 13 tables, each with `rowsecurity = true`.
   - Tables: `profiles`, `workouts`, `gps_routes`, `food_logs`, `water_logs`, `body_logs`, `templates`, `step_logs`, `burn_logs`, `wl_plans`, `coach_plans`, `fasting_logs`. (Already ran an older version? Just run the file again — it is safe to re-run and adds `step_logs`, `burn_logs` (manual calories-burned entries) and `wl_plans` (weight-loss programs: quiz answers, targets, the 7-day meal plan, grocery checks and your adjustments; one row per plan, RLS so only you can read it). Weigh-ins for the plan reuse `body_logs`. It also adds `coach_plans` (HYBRD Coach: your intake answers, the generated schedule, check-ins, changelog and meal plan; one row per plan, RLS so only you can read or change it). And it adds `fasting_logs` (Fuel › Fasting: one row per fast — start, end, target hours and protocol — or per low-calorie day; `day` = the local date the fast started; same RLS, so only you can read or change your rows). Your fasting plan itself (screening answers, chosen protocol, eating window) is saved on your `profiles` row. And it adds `gallery_items` (Me › Gallery photo details — date, tag, caption, size and where the image file is stored; same RLS), an `avatar_url` column on `profiles`, a `bio` text column on `profiles` (Me › Bio, max 1,000 characters, with a `profiles_bio_len` check; the bio is also stored in the profile JSON and is private — only you can read your row, and there is no public profile), and the private **`user-media`** Storage bucket for the images themselves — see §10.)
   - Every table has RLS on; each user can only read/write their own rows. The `anon` role has no table access.

## 3. Set the redirect URLs (needed for confirm / reset / change-email links)
1. Left sidebar → **Authentication** → **URL Configuration**.
2. **Site URL**: `https://cryp2x1.github.io/hybrd/` → **Save**.
3. **Redirect URLs** → **Add URL** and add both:
   - `https://cryp2x1.github.io/hybrd/**`
   - `http://localhost:4173/**` (only for local preview)
4. **Save**.

How it works: every email link lands on the app root (`/hybrd/?next=reset-password` or `?next=account`), which always loads on GitHub Pages, and the app then opens the right screen.
Note: password-reset links must be opened **in the same browser** where you tapped "Forgot password" (Supabase PKCE security).

## 4. (Optional) Email settings
- **Authentication → Sign In / Providers → Email**: "Confirm email" is ON by default (recommended). Turn it off if you want instant sign-up without the confirmation email.
- Supabase's built-in email sender is for testing and is heavily rate-limited (only a few emails per hour). For real users, add your own SMTP under **Authentication → Emails → SMTP Settings** (e.g. Resend, Brevo, or Postmark free tiers).

## 5. Copy the keys into the app
1. Left sidebar → **Project Settings** → **API** (or **Data API / API Keys**).
2. Copy **Project URL** (looks like `https://abcd1234.supabase.co`).
3. Copy the **anon / public** key (the long `eyJ…` key, or the `sb_publishable_…` key). **Never** use the `service_role` / secret key.
4. Open `config.js` at the root of the site (in this folder: `public/config.js` before build, or `config.js` inside the zip / repo) and fill it in:
   ```js
   window.HYBRD_CONFIG = {
     supabaseUrl: "https://abcd1234.supabase.co",
     supabaseAnonKey: "eyJhbGciOi..."
   };
   ```
   The anon key is designed to be public; RLS is what protects the data.
   Alternative for quick testing: in the app, **Me → Account → Connect backend on this device** and paste the same two values.
5. Reload the app: the "Local mode" chip disappears and **Sign in / Create account** appears.

## 6. Publish on GitHub Pages (only after you approve)
1. https://github.com/new → Repository name: **`hybrd`** → Public → **Create repository**.
2. Upload the **contents** of `hybrid-fit-web.zip` (unzipped — `index.html`, `404.html`, `.nojekyll`, `config.js`, `assets/`, … at the repo root). "Add file → Upload files" works; make sure `.nojekyll` is included (with git: `git add -A`).
3. Repo → **Settings → Pages** → Source: **Deploy from a branch** → Branch: `main` / `/ (root)` → **Save**.
4. After ~1 minute the site is at `https://cryp2x1.github.io/hybrd/`.
5. On iPhone: open it in Safari → Share → **Add to Home Screen**. On Android/Chrome: menu → **Install app**.

## 7. Test the account flows
1. Create account → confirm via email → you're signed in.
2. Me → Account → **Change password** (asks for the current one) and **Change email** (a confirmation link is sent; with "Secure email change" on, both old and new addresses must confirm).
3. Sign out → **Forgot password** → open the email link in the same browser → set a new password.
4. Log a workout on the phone, open the site on the laptop, sign in → it syncs.

## 8. (Optional) Spotify — "Connect Spotify" + mini player
Without this step HYBRD still shows the public **Workout playlists** (Spotify embeds). These steps turn on **Connect Spotify** (play/pause/skip, device picker, your playlists). HYBRD uses Spotify's *Authorization Code with PKCE* flow, which runs in the browser and needs **no Client Secret**. Never put a secret in `config.js`.

**Before you start:** under Spotify's current development-mode rules (Feb 2026) the app owner needs an **active Spotify Premium** account. Each app allows **up to 5 users**, every user must be added by email, and the playback-control endpoints only work for **Premium** listeners.

1. Go to **https://developer.spotify.com/dashboard**, log in with your Spotify account, and accept the Developer Terms.
2. Click **Create app** and fill it in:
   - **App name:** `HYBRD`. **Description:** "Personal workout app – controls my Spotify during workouts".
   - **Website:** `https://cryp2x1.github.io/hybrd/`
   - **Redirect URIs:** add these two, exactly as written (the trailing slash matters):
     - `https://cryp2x1.github.io/hybrd/`
     - `http://127.0.0.1:5173/hybrd/`. This one is for local dev only. Spotify no longer accepts `localhost`, so use the 127.0.0.1 address. You can also add `http://127.0.0.1:4173/hybrd/` for `node tools/serve.mjs`.
   - **Which API/SDKs are you planning to use?** Tick **Web API** and **Web Playback SDK**. The SDK is only needed for "Play in this browser" on desktop.
   - Tick the Terms box and click **Save**.
3. Open the app's **Settings** and copy the **Client ID**, a 32-character string. Ignore "View client secret", because HYBRD doesn't use it.
4. Put the Client ID in **`config.js`** next to the Supabase keys:
   ```js
   window.HYBRD_CONFIG = { supabaseUrl: '…', supabaseAnonKey: '…', spotifyClientId: 'YOUR_CLIENT_ID' };
   ```
   The Client ID is public, so it is safe in the published `config.js`. To test before publishing, paste it in **Me › Music · Spotify › Spotify app setup** instead. That copy is saved on that device only.
5. **Add each friend under User Management:** in Settings → **User Management** → **Add new user**, enter their name and **the email of their Spotify account**. Do this for everyone who will press Connect, up to 5 people including you. If someone isn't on the list, Spotify may let them log in, but every request then fails with a 403 ("not registered"). HYBRD says so on screen.
6. Publish (step 6). Then open HYBRD → **Me › Music · Spotify** → **Connect Spotify**, approve, and you return to the same screen, connected.
7. Test it. Open Spotify on your phone and play any song for a second. In HYBRD → **Record** → **Music**, you should see the track. Pause, skip, then pick **Play on → your phone** and **Your playlists**. On a computer, try **Play in this browser**. It asks Spotify once more, for the "streaming" permission.

Scopes HYBRD asks for:
- `user-read-playback-state`, `user-modify-playback-state`, `user-read-currently-playing` and `playlist-read-private`.
- Only if you turn on "Play in this browser": `streaming`, `user-read-email` and `user-read-private`. The Web Playback SDK requires these three.

Tokens live in this device's localStorage. They refresh automatically about every hour, and **Disconnect** deletes them. To revoke access completely, go to spotify.com → Account → **Manage apps**.

Limits to know:
- Development mode is meant for personal, non-commercial use.
- Since May 2025 Spotify grants **extended quota** (more than 5 users) only to registered businesses with 250k+ monthly active users. A friends-and-family HYBRD stays at 5 Spotify users.
- Development-mode apps share a request quota per developer account. When it runs out, Spotify returns `429` with `QUOTA_EXCEEDED`, and HYBRD shows "limit reached".
- HYBRD checks playback only every 5 s, and only while a player is on screen.
- The **Web Playback SDK** must not be used in commercial projects without Spotify's written approval. It needs Premium (not "mobile-only" Premium plans), and it has limits on iOS. On phones, HYBRD controls the Spotify app instead.

Sources:
- https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow
- https://developer.spotify.com/documentation/web-api/concepts/redirect_uri
- https://developer.spotify.com/documentation/web-api/concepts/quota-modes
- https://developer.spotify.com/blog/2026-02-06-update-on-developer-access-and-platform-security
- https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide
- https://developer.spotify.com/blog/2026-07-23-web-api-quota-updates
- https://developer.spotify.com/documentation/web-playback-sdk

## 9. (Optional) Strava — "Connect with Strava" sync

HYBRD works without this: Bluetooth heart rate and watch-file import (.fit/.tcx/.gpx) need no setup. Until steps 1–4 are done, Me › Devices & sync shows **"Strava setup needed"** and nothing breaks.

Strava requires the **Client Secret** for the token exchange and for every token refresh, and a static GitHub Pages site can't keep a secret. So HYBRD ships a tiny, stateless **token-exchange function** that holds the secret. It stores nothing. Pick **one** host; both are $0:
- Supabase Edge Functions: the free plan includes 500,000 invocations a month (supabase.com/pricing).
- Cloudflare Workers: the free plan includes 100,000 requests a day (developers.cloudflare.com/workers/platform/pricing).

### 9.1 Create the Strava API app (Jose — needs a Strava subscription)
1. Sign in to Strava, then open https://www.strava.com/settings/api. Strava says a subscription is required to create an API app.
2. Fill in:
   - **Application Name**: HYBRD. Don't use "Strava" in the name.
   - **Category**: pick the closest one.
   - **Website**: https://cryp2x1.github.io/hybrd/
   - **Authorization Callback Domain**: `cryp2x1.github.io` (the domain only, with no https:// and no path). localhost and 127.0.0.1 are always allowed, for local testing.
   - Upload an icon.
3. Copy the **Client ID** (public) and the **Client Secret** (private; it goes only into the function).

### 9.2a Deploy the function on Supabase (recommended if accounts are on Supabase)
The code is `supabase/functions/strava-token/index.ts`.
- **CLI:**
  ```bash
  npx supabase login
  npx supabase link --project-ref <your-project-ref>
  npx supabase secrets set STRAVA_CLIENT_ID=<id> STRAVA_CLIENT_SECRET=<secret> ALLOWED_ORIGINS=https://cryp2x1.github.io,http://localhost:5173
  npx supabase functions deploy strava-token --no-verify-jwt
  ```
- **Dashboard instead:**
  1. Go to Edge Functions › Deploy a new function, choose the in-browser editor, name it `strava-token`, paste index.ts and deploy.
  2. In the function's settings, turn JWT verification **off**. The browser calls it before anyone signs in, and the function checks the Origin itself.
  3. Add the three secrets under Edge Functions › Secrets.
- The function URL is `https://<project-ref>.supabase.co/functions/v1/strava-token`.

### 9.2b …or on Cloudflare Workers
The code is in `workers/strava-token/`.
```bash
cd workers/strava-token
# edit wrangler.toml: STRAVA_CLIENT_ID = "<id>"
npx wrangler login
npx wrangler secret put STRAVA_CLIENT_SECRET
npx wrangler deploy
```
The URL is `https://hybrd-strava-token.<your-subdomain>.workers.dev`.

### 9.3 Turn it on in the app
Edit `public/config.js` (or `config.js` in the published site):
```js
stravaClientId: '<Client ID>',
stravaTokenUrl: 'https://<project-ref>.supabase.co/functions/v1/strava-token',
supportEmail: '<an address users can write to>', // Strava API Policy §2.4 requires a support contact
```
Rebuild or re-publish. To test without publishing, open Me › Devices & sync › Strava, choose "Enter Client ID & function URL", and enter both on that one device.

### 9.4 Test
1. Go to Me › Devices & sync › Connect with Strava, read the consent screen, and approve on strava.com.
2. You land back in HYBRD, and your last 30 days of activities appear in Train › History with a **from Strava** badge.
3. Open an activity: it shows the full route, the HR chart, laps or splits, and **View on Strava**.
4. Test **Disconnect & delete**. It revokes access and deletes all Strava data on the device, and HYBRD shows a written confirmation.

`tools/test-strava-fn.mjs` (`node tools/test-strava-fn.mjs`) unit-tests both functions against a mocked Strava. It needs no keys or network.

### 9.5 Strava limits and rules (checked Nov 14, 2026)
**Who can connect**
- A new app is in **Single Player Mode**: only the owner's own Strava account can connect (athlete capacity 1).
- In the API settings, the owner can self-serve up to **10 athletes**. That also raises the rate limits to 200 reads per 15 min and 2,000 a day.
- More than 10 athletes needs Strava's review through the Developer Program form, with screenshots of everywhere Strava data appears and of the Connect button.

**Rate limits**
- Defaults are 100 reads per 15 min and 1,000 a day, and 200 / 2,000 overall, per app. Going over returns `429`.
- HYBRD shows usage from the `X-ReadRateLimit-*` headers.
- A sync costs 1–4 list calls, plus at most 20 detail calls for new activities. Opening an activity costs 1 call for its streams.

**Tokens**
- Access tokens last 6 h. Refresh needs the secret (it goes through the function).
- The newest refresh token is always kept, because Strava may rotate it.
- Disconnect uses the new `/oauth/revoke` endpoint. Strava added it on June 1, 2026, and it will be the only method from June 1, 2027. If revoke fails, the app falls back to `/oauth/deauthorize`.

**Data rules HYBRD follows** (API Agreement and API Policy)
- Strava data is displayed **only to the athlete** who connected.
- It is cached for **at most 7 days** (§6.2), on that device only.
- It is not synced to Supabase or included in exports.
- It is never used for AI/ML (§5.3).
- Activities removed on Strava disappear at the next sync.
- Disconnecting deletes everything and confirms it in writing (§2.5 / §7.4).
- The consent screen discloses what is read and how to withdraw or delete (§2.1).
- The app links to strava.com/settings/apps (§2.4).

**Brand**
- HYBRD uses the official, unmodified "Connect with Strava" button (48 px) and the "Powered by Strava" logo, in `public/brand/strava/`.
- Links back read **View on Strava** in bold orange #FC5200.
- Don't add Strava's logo to HYBRD's own logo or icon.

**Upcoming change**
- Strava's API base URL moves to `https://api-v3.strava.com` from **Jan 4, 2027** (changelog). Update `API` in `src/lib/strava.ts` then if `www.strava.com/api/v3` stops answering.

Sources:
- https://developers.strava.com/docs/getting-started/
- https://developers.strava.com/docs/authentication/
- https://developers.strava.com/docs/rate-limits/
- https://developers.strava.com/docs/changelog/
- https://developers.strava.com/guidelines/
- https://www.strava.com/legal/api
- https://www.strava.com/legal/api_policy

## 10. Profile photos & Gallery storage (created by `schema.sql`)
Nothing extra to click: running `supabase/schema.sql` (§2) creates everything. What it sets up:
- **Bucket `user-media`** — Storage → Buckets should show it with **Public: off**. Limit 10 MB per file; only JPEG, PNG and WebP are accepted (the app converts HEIC before upload).
- **Folder per user** — files are saved as `<user id>/avatar.webp` and `<user id>/gallery/<photo id>/{thumb,disp,orig}.<ext>`. Four policies on `storage.objects` (`user_media_select_own / insert_own / update_own / delete_own`) only allow a signed-in user inside the folder named after their own `auth.uid()`. No one else — and no signed-out visitor — can list, read or change them.
- **Table `gallery_items`** — one row per photo (date, tag, caption, size, storage paths), RLS like every other table. `profiles.avatar_url` holds the avatar's storage *path* (it is not a public link). `profiles.bio` is the Me › Bio text (max 1,000 characters; `profiles_bio_len` enforces the cap). The app also keeps the bio inside the profile JSON, so it still syncs if you have not re-run this file yet. The bio is private: existing RLS means only you can read or change your profile row, and HYBRD has no public profile page.
- **How sync works** — photos are always saved on the device first (IndexedDB, works offline). When signed in, HYBRD uploads the thumbnail, the 1600 px view copy and the full-quality original in the background, then marks the row as uploaded. On another device the grid downloads thumbnails as you scroll and the original only when you download it. Deleting a photo removes its files from the bucket (retried later if you're offline).
- **Privacy** — every image is re-encoded in the browser before it's stored or uploaded, so EXIF/GPS location and camera metadata never leave the phone.
- **Check:** Storage → `user-media` → Policies should list the four policies above. Sign in, add a photo, then open Storage → `user-media`: you'll see one folder named after your user id.
- **Free tier note:** Supabase's free plan includes 1 GB of file storage; a typical phone photo uses about 2–5 MB here (original + view copy + thumbnail).

## Local development
```bash
npm install
npm run dev            # http://localhost:5173/hybrd/  (for Spotify sign-in: npm run dev -- --host 127.0.0.1 → http://127.0.0.1:5173/hybrd/)
npm run build          # outputs dist/ (GitHub Pages-ready)
node tools/serve.mjs   # serves dist at http://localhost:4173/hybrd/
```
Env alternative to config.js: copy `.env.example` → `.env` and set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, optionally `VITE_BASE`.
Key precedence: keys saved on the device > `config.js` > `.env` build values.
