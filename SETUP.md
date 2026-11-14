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
3. Click **Run**. You should see "Success". The final result grid lists 8 tables, each with `rowsecurity = true`.
   - Tables: `profiles`, `workouts`, `gps_routes`, `food_logs`, `water_logs`, `body_logs`, `templates`, `step_logs`. (Already ran an older version? Just run the file again — it is safe to re-run and adds `step_logs`.)
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

## Local development
```bash
npm install
npm run dev            # http://localhost:5173/hybrd/
npm run build          # outputs dist/ (GitHub Pages-ready)
node tools/serve.mjs   # serves dist at http://localhost:4173/hybrd/
```
Env alternative to config.js: copy `.env.example` → `.env` and set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, optionally `VITE_BASE`.
Key precedence: keys saved on the device > `config.js` > `.env` build values.
