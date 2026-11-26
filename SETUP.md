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
   - **Mind & Recovery (added 17 Nov 2026):** running the file again also adds `mind_checkins` (daily check-in: 1–5 answers, optional HRV / resting HR, readiness score; `day` = local date), `journal_entries` (private journal), `mind_sessions` (completed breathing sessions, program days and recovery routines) and `mind_screens` (weekly HYBRD Pulse check-ins: six 0–4 answers in `data.pulse`, `data.v = 2`, the safety answer, and optional PHQ-2 / GAD-2 answers; rows saved before 26 Nov 2026 may hold answers to the retired WHO-5 in `data.who5` — they are kept as-is and never scored, so no migration is needed). Same owner-only RLS, nothing for `anon`. `journal_entries` and `mind_screens` also carry a check constraint that rejects any row marked `localOnly` — people who choose “keep my journal on this device only” never have those entries stored server-side (the app doesn't send them either). The Mind setup answers live on your `profiles` row (`data.mind`). No extra setup is needed.

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
   The Client ID is public, so it is safe in the published `config.js`. To test before publishing, paste it in **Settings › Devices & integrations › Spotify › Spotify app setup** instead. That copy is saved on that device only.
5. **Add each friend under User Management:** in Settings → **User Management** → **Add new user**, enter their name and **the email of their Spotify account**. Do this for everyone who will press Connect, up to 5 people including you. If someone isn't on the list, Spotify may let them log in, but every request then fails with a 403 ("not registered"). HYBRD says so on screen.
6. Publish (step 6). Then open HYBRD → **Settings › Devices & integrations › Spotify** → **Connect Spotify**, approve, and you return to the same screen, connected.
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

HYBRD works without this: Bluetooth heart rate and watch-file import (.fit/.tcx/.gpx) need no setup. Until steps 1–4 are done, Settings › Devices & integrations shows **"Strava setup needed"** and nothing breaks.

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
Rebuild or re-publish. To test without publishing, open Settings › Devices & integrations › Strava, choose "Enter Client ID & function URL", and enter both on that one device.

### 9.4 Test
1. Go to Settings › Devices & integrations › Connect with Strava, read the consent screen, and approve on strava.com.
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
- **Bucket `user-media`** — Storage → Buckets should show it with **Public: off**. Limit 50 MB per file; accepts JPEG, PNG and WebP photos (the app converts HEIC before upload) and MP4, MOV and WebM videos. If you ran an older `schema.sql`, run the current one again (it's safe to re-run) so videos are allowed — until then, videos simply stay on the device and say so.
- **Folder per user** — files are saved as `<user id>/avatar.webp` and `<user id>/gallery/<photo id>/{thumb,disp,orig}.<ext>`. Four policies on `storage.objects` (`user_media_select_own / insert_own / update_own / delete_own`) only allow a signed-in user inside the folder named after their own `auth.uid()`. No one else — and no signed-out visitor — can list, read or change them.
- **Table `gallery_items`** — one row per photo (date, tag, caption, size, storage paths), RLS like every other table. `profiles.avatar_url` holds the avatar's storage *path* (it is not a public link). `profiles.bio` is the Me › Bio text (max 1,000 characters; `profiles_bio_len` enforces the cap). The app also keeps the bio inside the profile JSON, so it still syncs if you have not re-run this file yet. The bio is private: existing RLS means only you can read or change your profile row, and HYBRD has no public profile page.
- **How sync works** — photos are always saved on the device first (IndexedDB, works offline). When signed in, HYBRD uploads the thumbnail, the 1600 px view copy and the full-quality original in the background, then marks the row as uploaded. On another device the grid downloads thumbnails as you scroll and the original only when you download it. Deleting a photo removes its files from the bucket (retried later if you're offline).
- **Privacy** — every image is re-encoded in the browser before it's stored or uploaded, so EXIF/GPS location and camera metadata never leave the phone.
- **Check:** Storage → `user-media` → Policies should list the four policies above. Sign in, add a photo, then open Storage → `user-media`: you'll see one folder named after your user id.
- **Free tier note:** Supabase's free plan includes 1 GB of file storage; a typical phone photo uses about 2–5 MB here (original + view copy + thumbnail).

### 10.1 Gallery videos — storage limits (checked Nov 16, 2026)
- **What's stored:** the original video file exactly as recorded (no re-encode, no quality loss), plus a poster frame (`disp.webp`) and a thumbnail (`thumb.webp`): `<user id>/gallery/<item id>/orig.mp4|mov|webm`.
- **In the app (local mode and signed in):** up to **200 MB** and **5 minutes** per video, 10 videos per batch. Everything is saved on the device first; the Gallery shows how much browser storage is used and warns at 80%.
- **Supabase Free plan:** the maximum file size is **50 MB** per file for the whole project, and the plan includes **1 GB** of storage in total. HYBRD therefore uploads videos up to 50 MB; bigger videos stay on the device they were added on and are labelled **Device only** (their poster and thumbnail still sync, so other devices show the tile and explain where the file is). For scale, iPhone's own Camera settings estimate about 40–60 MB per minute at 1080p 30 fps and about 170 MB per minute at 4K 30 fps, so on the Free plan cloud-backed videos are mostly clips under about a minute (and the 200 MB in-app cap means a 4K video can be at most about 1 minute long).
- **Supabase Pro (and up):** the global file size limit can be raised (Dashboard → Storage → Settings; up to 500 GB per file on paid plans), with 100 GB of storage included and more billed per GB. To use it: raise the global limit, change `52428800` for `user-media` in `schema.sql` (or in Storage → Buckets → user-media → Edit) and set `CLOUD_FILE_CAP` in `src/lib/media.ts` to the same number.
- **Table columns:** `gallery_items.media_type` (`photo` / `video`), `duration_s`, `poster_path`, `local_only` are generated from the row's JSON — read-only, always in sync, nothing for the app to write.
- **Upload size note:** the app uses the standard upload call. Supabase recommends resumable (TUS) uploads above 6 MB on flaky connections; a failed upload is simply retried on the next sync.
- **Privacy:** video files are not re-encoded, so HYBRD removes the location tags phones write into MP4/MOV files (QuickTime `©xyz`, 3GPP `loci`, Apple `com.apple.quicktime.location.*` keys, XMP GPS) before saving or uploading, without changing the audio/video data. GPS *telemetry tracks* recorded by action cameras (GoPro `gpmd`, Android `camm`) can't be removed without re-encoding — the app detects them and warns the user.

## 11. Friends & Stories (social) — created by `schema.sql`
Friends, posts, stories, likes, emoji reactions, comments, saves, notifications and reports all live in Supabase. Until the keys in `public/config.js` are filled in, the Social tab shows **"Connect accounts to use Friends & Stories"** plus an optional demo with clearly labelled **sample people** (handles start with `sample.`; nothing leaves the device). Once accounts are on, the demo is replaced by the real thing.

**11.1 Turn it on**
1. Run the whole `supabase/schema.sql` again in SQL Editor → **Run**. It's safe to re-run: tables use `if not exists`, constraints and policies are dropped and recreated, and storage buckets use `on conflict`.
2. Check **Table Editor** for these tables: `social_profiles`, `social_private`, `social_bans`, `friend_requests`, `friendships`, `blocks`, `posts`, `post_media`, `stories`, `likes`, `reactions`, `comments`, `saves`, `hidden_posts`, `reports` and `notifications`. Each should show **RLS enabled**.
3. Check **Storage → Buckets** for `social-media` with **Public: off**, a limit of 8 MB, and JPEG/PNG/WebP only. It needs four policies (`social_media_select / insert_own / update_own / delete_own`). Uploads must go in your own `<uid>/…` folder. A file can only be read by someone who can see the post, story or profile it belongs to, and the app reads it through 1-hour signed links.
4. Optional live alerts: in **Database → Publications → supabase_realtime**, `notifications` is added automatically if the publication exists. Without it, the app checks for new alerts every 60 s.
5. Optional story cleanup: stories disappear from the app after 24 h, but their rows stay until cleanup runs. With **pg_cron** (Database → Extensions), run:
   ```sql
   select cron.schedule('hybrd-stories-cleanup', '15 * * * *', $$select public.social_cleanup_expired()$$);
   ```
   This deletes story rows more than a day past expiry. It does not remove their image files. For those, see "Clean up story images" below.

**11.2 How it's protected (server-side)**
- **Age 13+.** `social_create_profile` reads the private date of birth (`social_private.birth_date`, which only its owner can read) and refuses anyone under 13. Under-18 profiles are forced to **friends-only**, and so are their posts and stories. The app also keeps under-13 users out of Social entirely.
- **Friend graph.** Friend requests, accepts, declines, cancels, unfriends, blocks and unblocks only happen through `security definer` RPCs, which check blocks, bans and duplicates. There are no direct inserts. Blocking removes the friendship and any pending requests, and hides both people from each other everywhere: search, profiles, feed, stories, comments, likes and reactions.
- **Visibility.** `social_can_view_post` allows: the author; friends for friends-only posts; signed-in members for public posts on public profiles. Nobody can see across a block, and signed-out visitors see nothing. Comments, likes, reactions, media and saves inherit their post's visibility. Reactions on a comment inherit the parent post. Each person may leave one of seven reactions (Like, Love, Haha, Wow, Sad, Angry, Dislike) on a post or a comment; existing likes are stored as Like.
- **Server-owned fields.** Triggers set the author, counts, timestamps and the story expiry (24 h). Column grants stop clients from changing counters, `status` or other protected fields.
- **Rate limits** (enforced in triggers and RPCs): 20 friend requests/hour and 60/day; 30 posts/day; 30 stories/day; 60 comments/hour; 30 reports/day.
- **Limits.** Handles are 3–20 characters (`a–z 0–9 . _`). `sample.*` and reserved names are blocked. Text caps: posts 2,000 characters, comments 500, story text 200, public bio 160. Up to 4 photos per post. Photos are re-encoded in the browser (≤ 1440 px), which strips EXIF and GPS.
- **Profanity.** The client filter masks or blocks common slurs and profanity. It's a convenience, not moderation. Reports are the real safety net.
- **Verified locally.** `bash tools/test-social-sql.sh` applies the schema twice to a real Postgres with a Supabase shim, then runs 83 RLS, trigger and RPC checks.

**11.3 Moderation workflow (you, in the SQL Editor)**
Reports land in `public.reports` with the reason, details and a **snapshot** of the reported text, so it survives if the poster deletes it. Users can't read reports, including their own.
```sql
-- 1. Queue: newest open reports, with who reported and who was reported
select r.created_at, r.target_type, r.reason, r.details, r.snapshot, r.target_id,
       rp.username as reporter, tp.username as reported_user, r.id
from public.reports r
left join public.social_profiles rp on rp.id = r.reporter_id
left join public.social_profiles tp on tp.id = r.target_user_id
where r.status = 'open' order by r.created_at desc;

-- 2. Mark one as being reviewed
update public.reports set status = 'reviewing' where id = '<report id>';

-- 3a. Remove content (comments, likes, media rows and saves cascade with the post)
delete from public.posts    where id = '<post id>';
delete from public.comments where id = '<comment id>';
delete from public.stories  where id = '<story id>';

-- 3b. Ban an account from Social (it can't create a profile again)
insert into public.social_bans (user_id, reason) values ('<user id>', 'harassment') on conflict do nothing;
delete from public.social_profiles where id = '<user id>';   -- removes their posts, friends, comments …

-- 4. Close the report
update public.reports set status = 'actioned', reviewed_at = now(), moderator_note = 'removed post' where id = '<report id>';
-- or: status = 'dismissed'
```
- **Image files.** Deleting a row doesn't delete its file. In Storage → `social-media` → the user's `<uid>` folder, delete `posts/<post id>/` or `stories/<story id>.*`. To remove a banned user's files, delete their whole folder.
- **Clean up story images** (monthly is enough): in Storage, delete `<uid>/stories/` files older than 2 days, or use the Storage API from a scheduled Edge Function.
- **Lift a ban:** `delete from public.social_bans where user_id = '<user id>';`
- **Urgent reports** (self-harm, a minor at risk, threats): act on them first. Where the law requires it, report to the authorities or NCMEC. HYBRD has no automated detection.
- **A user deleting their own social profile.** The app's Social › Profile › Edit › **Leave Friends & Stories → Delete public profile** removes their profile, posts, stories, comments, likes and friendships, and their files in `social-media`. Their private training data is not touched.

**11.4 Test it**
Create two accounts in two browsers (one private window). Set up a social profile in each with an adult date of birth. In browser A, open Friends › Find and search B's handle, then **Add friend**. Accept in B, where the Alerts badge appears. Post a photo in A as **Friends**, then like it and comment on it in B. Report the comment in A, and confirm it appears in `public.reports`. Finally, block B from A, and confirm the two can no longer find each other.

## 12. Messages (DMs + group chats) — created by `schema.sql`

Messages are private to the people in each chat and protected by Row Level Security. **They are not end-to-end encrypted**: the database owner (you, in the Supabase dashboard) can read them, and reported messages are snapshotted for review. Say this plainly in your privacy policy.

**12.1 What `schema.sql` creates** (safe to re-run)
- Tables: `dm_settings`, `conversations`, `conversation_members`, `messages`, `message_reactions`, `message_hidden`, `message_reports` and `push_subscriptions`. All have RLS on.
- Functions: `dm_open_direct`, `dm_create_group`, `dm_add_members`, `dm_remove_member`, `dm_set_admin`, `dm_rename_group`, `dm_leave`, `dm_accept`, `dm_decline`, `dm_mark_read`, `dm_mark_delivered`, `dm_heartbeat`, `dm_can_message`, `dm_members`, `dm_inbox` and `dm_presence`. Triggers enforce blocks, the 3-message request limit, under-18 rules, rate limits, the 15-minute edit window and unsend.
- Storage bucket **`message-media`**: private, 50 MB per file, images (JPEG/PNG/WebP) and video (MP4/MOV/WebM). Files live at `<conversation id>/<sender id>/…`. Only active members can upload into a chat's folder, and only people who can read the message can open the file.

**12.2 Turn on Realtime** (new messages, typing, "seen")
1. **Database → Publications → `supabase_realtime`**: check that `messages`, `message_reactions` and `conversation_members` are listed. `schema.sql` adds them when the publication exists; if not, toggle them on there.
2. **Realtime → Settings**: turn **off** "Allow public access", so private channels are required. Typing and "seen" pings use Broadcast on private channels named `dm:<conversation id>`, and `schema.sql` adds policies on `realtime.messages` so only active members can join. If you skip this step typing still works, but anyone signed in who guesses a chat id could listen to typing pings; message content never goes over Broadcast.
3. Without Realtime the app still works: it refreshes every 45 s and when you open a chat.

**12.3 Moderation** (SQL editor)
```sql
-- open message reports, newest first (snapshot = the reported message, or the last 20 messages of the chat)
select id, created_at, reason, details, target_type, target_user_id, snapshot from public.message_reports where status = 'open' order by created_at desc;
-- mark handled
update public.message_reports set status = 'actioned', reviewed_at = now(), moderator_note = 'warned' where id = '<report id>';
-- remove a message for everyone (keeps a placeholder)
update public.messages set deleted_at = now(), body = '', media = null where id = '<message id>';
-- ban: stops them posting, commenting and sending messages
insert into public.social_bans (user_id, reason) values ('<user id>', 'harassment in DMs');
```
Media files of removed messages stay in Storage → `message-media` → `<conversation id>/<sender id>/` until you delete them. Treat self-harm, threats and anything involving a minor as urgent; where the law requires it, report to the authorities or NCMEC.

**12.4 Push notifications (later)**
`push_subscriptions` is ready (own rows only). Add Web Push (installed PWA, iOS 16.4+) or APNs/FCM, and send from an Edge Function on a `messages` insert webhook. Never include the text of message **requests** in a notification.

**12.5 Test it**
Use two accounts in two browsers. A opens B's profile → **Message** and sends "hi". B sees it under Messages › **Requests**, and A sees only "Sent". Try a 4th message from A: it's refused. B taps **Accept**, and A now sees "Seen" when B reads. Send a photo, react with a long-press, reply, edit within 15 minutes, then unsend. In B, go to Messages › Privacy › **Friends only**, then try to start a new chat from a third account: it's refused. Report a message and confirm it appears in `public.message_reports`.

## 13. Calls (voice + video in Messages) — created by `schema.sql`

People can voice or video call from any chat (1:1, or group calls of **up to 4 people**). Audio and video go **peer to peer** between the browsers with WebRTC and are encrypted in transit (DTLS-SRTP). They never pass through Supabase. Supabase only stores call history, decides who may call whom, and carries the short "connection setup" messages (signaling). Be honest in your privacy policy: calls are encrypted in transit peer to peer, HYBRD's calling has **not** had an independent security audit, and people in a call can see each other's network (IP) address unless calls go through a TURN relay.

**There are no push notifications for calls (yet).** A call only rings while HYBRD is open (a browser tab or the installed app). Everyone else gets a missed call in the chat and the Calls tab the next time they open the app. The app says this in Messages › Privacy and the Calls tab.

**13.1 What `schema.sql` creates** (safe to re-run; run the whole file again after updating)
- `dm_settings` gets two columns: `who_can_call` (`everyone` = people you chat with · `friends` · `none`) and `dnd_until` (Do not disturb).
- Tables `calls` and `call_participants`, with RLS on. They're read-only for the people in the call; all changes go through functions. `quiet` (Do not disturb), `hidden` and `last_seen_at` aren't readable by the app at all.
- Functions: `call_start`, `call_answer`, `call_decline`, `call_leave`, `call_heartbeat`, `call_incoming`, `call_history` and `call_hide`. These enforce the rules:
  - Message requests (not accepted) can't call. Blocked accounts can't call, and it's never revealed who blocked whom.
  - Under-18s can only call, and be called by, friends.
  - "Who can call me" applies. With Do not disturb on, it just rings out on the caller's side ("No answer") and never rings for you.
  - One call at a time ("busy"). A group call allows at most 4 people at once.
  - Limit of 30 calls an hour.
  - Calls nobody closed are tidied up: a ring older than 60 s becomes missed, and a call with no heartbeat for 90 s ends.
  - A call card (missed / declined / duration) is posted into the chat once.

**13.2 Turn on Realtime**
1. **Database → Publications → `supabase_realtime`**: make sure `calls` and `call_participants` are listed (`schema.sql` adds them when the publication exists). This is how a call rings instantly. Without it, the app checks for incoming calls every 12 s while it's open.
2. **Realtime → Settings**: keep **"Allow public access" off** (same as §12.2). Browsers exchange connection details over private Broadcast channels named `call:<call id>`, and `schema.sql` adds `call_broadcast_read/write` policies so only people who have joined that call can use the channel.

**13.3 STUN (free, already on)**
The app uses free public STUN servers (`stun.l.google.com:19302`, `stun.cloudflare.com:3478`) to find a direct path. That's enough for most home Wi-Fi. Some networks block direct connections (strict NATs, many mobile carriers, office/school Wi-Fi), and those calls will fail ("Couldn't connect") unless you add a **TURN relay**.

**13.4 TURN relay (recommended before launch)** — pick one. Facts checked Nov 19, 2026; check the provider's site before relying on them:
- **Cloudflare Realtime TURN**: 1,000 GB/month free (shared with Cloudflare's SFU), then $0.05/GB. Create a TURN key in the Cloudflare dashboard (Realtime → TURN), then set the function secrets `CF_TURN_KEY_ID` and `CF_TURN_API_TOKEN`.
- **Metered Open Relay**: a free tier with an account (20 GB/month at the time of checking). Set `METERED_DOMAIN` (e.g. `yourapp.metered.live`) and `METERED_API_KEY`.
- **Self-hosted coturn** (any small VPS; you pay only for the server and bandwidth). In `/etc/turnserver.conf`:
  ```
  use-auth-secret
  static-auth-secret=<long random secret>
  realm=turn.yourdomain.com
  listening-port=3478
  tls-listening-port=5349
  cert=/etc/letsencrypt/live/turn.yourdomain.com/fullchain.pem
  pkey=/etc/letsencrypt/live/turn.yourdomain.com/privkey.pem
  no-cli
  no-multicast-peers
  denied-peer-ip=10.0.0.0-10.255.255.255
  denied-peer-ip=172.16.0.0-172.31.255.255
  denied-peer-ip=192.168.0.0-192.168.255.255
  ```
  Open UDP/TCP 3478, TCP 5349 and the relay UDP range (default 49152–65535). Then set `TURN_URLS="turn:turn.yourdomain.com:3478?transport=udp,turns:turn.yourdomain.com:5349?transport=tcp"` and `TURN_SECRET=<the same secret>` (optional `TURN_TTL`, seconds, default 21600).

Then deploy the credentials function and point the app at it:
```bash
supabase secrets set ALLOWED_ORIGINS=https://<you>.github.io CF_TURN_KEY_ID=... CF_TURN_API_TOKEN=...   # or the coturn / Metered secrets
supabase functions deploy turn-credentials        # keep JWT verification ON (the default)
```
In `public/config.js` set `turnFunction: 'supabase'`, or a full `https://…` URL if you host it elsewhere. Signed-in users then get **short-lived** TURN credentials. No TURN secret is ever in the website. Once a relay is set up, Messages › Privacy shows **"Protect my IP address in calls"**, which forces calls through the relay.
Quick test without the function: `turnUrls`, `turnUsername` and `turnCredential` in `public/config.js` (or `VITE_TURN_URLS`, `VITE_TURN_USERNAME`, `VITE_TURN_CREDENTIAL` in `.env`). Anything you put there is **public**, so only use it for a short test with credentials you can revoke.

**13.5 Moderation** (SQL editor)
```sql
-- recent calls between two people (no audio/video is ever stored)
select c.id, c.kind, c.status, c.created_at, c.answered_at, c.ended_at, c.end_reason from public.calls c
  join public.call_participants a on a.call_id = c.id and a.user_id = '<user A>'
  join public.call_participants b on b.call_id = c.id and b.user_id = '<user B>' order by c.created_at desc;
```
Reports made from the call screen land in `public.message_reports` like other chat reports (§12.3). A ban (`social_bans`) also stops calls.

**13.6 Test it**
Use two accounts on two devices, ideally one on mobile data so you also test the relay. A opens a chat with B and taps the phone icon, and B's app rings (it has to be open). Accept, talk, switch to video, flip the camera, mute, then minimize and browse, then hang up. The chat shows "Voice call · 2 min". Then check these:
- From a message request, the call buttons are disabled.
- With B on Do not disturb, A hears it ring out and gets "No answer".
- With B on Friends only, a non-friend's call is refused.
- In a group, a 5th person can't join.

## 14. Shared activities (save & share, public links) — created by `schema.sql`
Nothing extra to set up: re-run the whole `supabase/schema.sql` in the SQL editor (it is safe to run again; existing data is kept). It adds:
- **Table `shared_activities`** — the *public copy* of an activity that someone chose to share (Friends or Everyone). It holds a random id (used in the link), a JSON summary (title, description, type, key stats, splits, exercise names/set counts) and the route **after** start/end trimming and privacy zones, rounded to ~1 m with no timestamps. The full private route stays in `gps_routes`, readable only by its owner. Limits: `data` ≤ 512 KB and must be format v1; 100 shares per user per day; banned accounts can't share; you must have set up a social profile.
- **Who can read a share**: the owner; friends when it's Friends or Everyone; and anyone (signed out too) only when it's Everyone — through the `activity_public(id)` function, which shows the author's @handle only if their profile is public (or the viewer is a friend). Blocked people can't see it. Under-18 accounts can't pick Everyone, and if an account becomes under-18 its Everyone shares drop to Friends automatically.
- **Storage bucket `activity-images`** (private, PNG only, 5 MB) — the share image at `<user id>/<share id>.png`. Readable by the same people who can read the share; only the owner can write or delete.
- Changing an activity to **Only me**, or deleting it, removes the shared copy and its image, so the link stops working.

How links work: `https://<user>.github.io/hybrd/a?id=<uuid>`. The page loads the share with the anon key, so it works for logged-out visitors when the activity is Everyone. Link previews (Open Graph cards on Facebook/X/iMessage) need server-side HTML, which GitHub Pages can't do, so links show as plain links; the image is shared as a file instead.

Test: `PG_BIN=... bash tools/test-social-sql.sh` (step "== shared activities": 39 checks — RLS, anon reads, minors, bans, blocks, the 100-a-day limit, storage paths).

## 15. Safety: reporting, restrict, time off, account deletion, appeals, moderation — created by `schema.sql`

Re-running `supabase/schema.sql` (SQL Editor › paste › Run) adds everything below. It's safe to run again; every new
table has Row Level Security on. Until it's run, the app shows "The safety features need the latest database setup".

### 15.1 What the database does
| Feature | Tables / functions | Rules enforced by the database |
|---|---|---|
| Report user / content | `reports`, `message_reports` (+ `priority`, `message_ids`) | 10 reports an hour, 30 a day, no duplicate of the same thing within 24 h. Reporters only ever see their own reports (`safety_my_reports()`); the reported person can't read them. Minor-safety and self-harm reports get priority 0 (top of the queue). |
| Restrict | `dm_restricts` | Only you can see who you restricted. Restricted people don't get your read receipts (`dm_members`) or online status (`dm_presence`) and can't call you (`call_unavailable`). The app files their chats under Requests without a badge. |
| Delete for me / unsend | `message_hidden`, `messages.deleted_at` | Unsend for everyone works for 24 hours (`dm_unsend_window`); delete for me always works. |
| Moderator removal | `removed_at` on posts, stories, comments, messages, shared activities | Removed items are hidden from everyone except the owner, who sees a notice naming the guideline. Only moderator functions can set or clear `removed_at`. |
| Time off | `account_state.paused_at / pause_until`, `account_pause()`, `account_resume()` | While paused: profile, posts, stories, comments, activities and presence are hidden; nobody can message or call; notifications are dropped; nothing is deleted. Pauses end on their own at `pause_until`. |
| Delete account | `account_state.deletion_requested_at / purge_after`, `account_request_deletion()`, `account_reopen()` | Needs a password sign-in within the last 10 minutes (the app asks for the password again). Hidden immediately; reopen any time in the 30 days; purged after that by the Edge Function below. |
| Suspensions, messaging restrictions | `moderation_actions` (audit log of every moderator action) | Suspended accounts are hidden and can't post, message or call; restricted ones can't message or call. Both end at `ends_at`. |
| Appeals | `appeals`, `appeal_submit()`, `mod_decide_appeal()` | One appeal per decision, within 30 days, 10–1,000 characters, 10 a day. Reversing restores the content or lifts the limit. |
| Moderation queue | `mod_queue()`, `mod_act()`, `mod_decide_appeal()` | Only accounts with `profiles.is_moderator = true`. Users can't set this flag themselves (a trigger freezes it for app roles). |

### 15.2 Make someone a moderator (SQL Editor only)
```sql
update public.profiles set is_moderator = true
 where id = (select id from auth.users where email = 'moderator@example.com');
```
They then see **Settings › Safety › Moderation queue** (route `/hybrd/moderation`). To remove the role, set it back to `false`.
Moderators can't act on reports about themselves.

### 15.3 Deleting accounts after 30 days (Edge Function + daily schedule)
Storage files can't be deleted from SQL, so a small Edge Function does the purge.

1. Pick a long random secret (for example `openssl rand -hex 32`). Don't commit it anywhere.
2. Deploy the function and set the secret (Supabase CLI):
   ```bash
   supabase functions deploy purge-accounts --no-verify-jwt
   supabase secrets set PURGE_SECRET=<your secret>
   ```
3. Store the same secret and your project URL in Vault (SQL Editor), then schedule it daily with pg_cron + pg_net
   (Dashboard › Database › Extensions: enable **pg_cron** and **pg_net** first):
   ```sql
   select vault.create_secret('<your secret>', 'purge_secret');
   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');

   select cron.schedule('hybrd-purge-accounts', '17 3 * * *', $$
     select net.http_post(
       url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/purge-accounts',
       headers := jsonb_build_object('Content-Type', 'application/json',
                    'x-purge-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'purge_secret')),
       body    := '{}'::jsonb)
   $$);
   ```
   Check runs with `select * from cron.job_run_details order by start_time desc limit 5;` and the function's logs.
4. What it deletes for each due account: files under `user-media/<uid>/`, `social-media/<uid>/`, `activity-images/<uid>/`,
   the photos/videos they sent in `message-media`, their messages, then the auth user (which cascades to every table).
   `moderation_actions` rows stay, with the user id set to null.

Without this function, accounts stay hidden after 30 days but aren't actually purged. Run it by hand with
`curl -X POST -H "x-purge-secret: <secret>" https://<project-ref>.supabase.co/functions/v1/purge-accounts`.

### 15.4 Operating notes (please read)
- Reports aren't monitored around the clock. The app says so and points people to 911 / 988.
- **Child sexual exploitation:** in the US, providers who become aware of apparent child sexual abuse material must report it
  to NCMEC's CyberTipline (report.cybertip.org) and preserve it. Don't just delete it; get legal advice on your obligations.
- **Imminent risk** (a credible threat or someone about to hurt themselves): contact local emergency services.
- The app's legal copy (Community Guidelines, How reporting works, Privacy) is plain-language product copy, not reviewed legal
  terms. Have it reviewed before a public launch.
- Demo / Local mode: every safety screen works on the device with simulated decisions and a demo queue of SAMPLE reports;
  nothing is sent anywhere.

## 16. Legal: Terms, Privacy, health-data consent, re-accept (v1.7) — `schema.sql` LEGAL section

The app ships with Terms of Service, a Privacy Policy (with cookies & local storage), a Consumer Health Data Privacy
Policy (Washington MHMDA / Nevada / Connecticut), a Fitness & Nutrition Disclaimer, a DMCA policy and an Account & Data
Deletion page, at `/legal`, `/legal/terms`, `/legal/privacy`, `/legal/health-data`, `/legal/disclaimer`, `/legal/dmca`,
`/legal/delete-account`. They open without an account (public URLs). Source: `src/legal/*.md`.
**Draft — not legal advice. Have a lawyer review before launch or before charging money.**

1. **Owner details are filled in** (Nov 26, 2026): José Manuel Cruz Ortiz, an individual doing business as HYBRD;
   all notices by email to hybrdbeast@gmail.com (no postal address yet); Ohio law; venue and small claims in Delaware
   County, Ohio, USA; US only; backups kept up to 30 days; minimum age 18. The final text is in `src/legal/*.md`, and
   the same values are in `LEGAL_DEFAULTS` (`src/lib/legal.ts`) and `public/config.js` (used by the hub's contact link).
   To change a detail, edit the documents (and those two places), bump `LEGAL_VERSIONS`, and run `tools/test-legal.ts`.
   Changing `minAge` also needs the age in `terms.md` §2 changed to match (the test checks this).
2. **Run `schema.sql`** — adds `legal_acceptances` (proof of assent: versions, timestamp, source, age confirmation,
   consents; users can read only their own; written only via the `legal_record_acceptance` RPC, rate-limited).
3. **Register a DMCA agent** at https://www.copyright.gov/dmca-directory/ ($6, renew every 3 years) *before* relying on
   the DMCA page; put the same details in config.js.
4. **Google Play** → Data safety → "Delete account URL": `https://cryp2x1.github.io/hybrd/legal/delete-account`.
   Apple 5.1.1(v): in-app deletion already exists (Settings › Account).
5. **MHMDA**: the Consumer Health Data policy must be linked from the homepage — it is on the welcome screen, the sign-up
   form, the legal hub and Settings. If you launch a marketing site, link it there too.
6. **Changing a document**: edit `src/legal/<doc>.md`, bump its date in `src/lib/legal.ts` (`LEGAL_VERSIONS`) and add
   a line to `LEGAL_CHANGES`. Everyone gets the "We've updated our Terms" prompt on next open.
   Preview it without changing versions: `sessionStorage.setItem('hybrd:legal-preview','1')` then reload.
7. **Export** for a lawyer: `node --experimental-strip-types --import ./tools/ts-resolve.mjs tools/export-legal.ts`
   → `/workspace/hybrd-legal/`.

Tests: `tools/test-legal.ts`, `tools/sql/test-legal.sql` (in `test-social-sql.sh`), `tools/shoot-legal.mjs`.

## Local development
```bash
npm install
npm run dev            # http://localhost:5173/hybrd/  (for Spotify sign-in: npm run dev -- --host 127.0.0.1 → http://127.0.0.1:5173/hybrd/)
npm run build          # outputs dist/ (GitHub Pages-ready)
node tools/serve.mjs   # serves dist at http://localhost:4173/hybrd/
```
Env alternative to config.js: copy `.env.example` → `.env` and set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, optionally `VITE_BASE`.
Key precedence: keys saved on the device > `config.js` > `.env` build values.
