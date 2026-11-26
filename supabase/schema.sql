-- HYBRD — Supabase schema with Row Level Security.
-- Run once in Supabase: Dashboard → SQL Editor → New query → paste this file → Run.
-- Every table is locked down so a signed-in user can only read and write their own rows.
-- Records are stored as JSON (data) next to a few indexed columns; the app is local-first and syncs changed rows.

-- ---------- profiles (one row per user) ----------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- Profile photo: storage path of the avatar in the private user-media bucket (e.g. <uid>/avatar.webp). Not a public URL.
alter table public.profiles add column if not exists avatar_url text;

-- Me › Bio: free-form text, private (RLS on this table). Length check matches the in-app 1,000 character cap.
alter table public.profiles add column if not exists bio text;
alter table public.profiles drop constraint if exists profiles_bio_len;
alter table public.profiles add constraint profiles_bio_len check (bio is null or char_length(bio) <= 1000);

-- ---------- shared shape for the log tables ----------
-- id is generated on the device (UUID string) so offline records can sync later.
do $$
declare t text;
begin
  foreach t in array array['workouts', 'gps_routes', 'food_logs', 'water_logs', 'body_logs', 'templates', 'step_logs', 'burn_logs', 'wl_plans', 'coach_plans', 'mind_checkins', 'journal_entries', 'mind_sessions', 'mind_screens', 'sleep_logs', 'caffeine_logs', 'fasting_logs', 'gallery_items'] loop
    execute format($f$
      create table if not exists public.%1$I (
        id          text not null,
        user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
        day         date,
        data        jsonb not null,
        deleted     boolean not null default false,
        updated_at  timestamptz not null default now(),
        primary key (user_id, id)
      );
      create index if not exists %1$I_user_day_idx on public.%1$I (user_id, day);
      create index if not exists %1$I_user_updated_idx on public.%1$I (user_id, updated_at);
    $f$, t);
  end loop;
end $$;

-- Gallery videos: read-only columns derived from the row JSON (the app only writes `data`), so they can never disagree
-- with it and re-running this file is safe. media_type = 'photo' | 'video'; duration_s = video length in seconds;
-- poster_path = storage path of the video's poster frame; local_only = the video file itself is kept on the device only
-- (bigger than the per-file storage limit), only its poster + thumbnail are in the bucket.
alter table public.gallery_items add column if not exists media_type text
  generated always as (case when data->>'kind' = 'video' then 'video' else 'photo' end) stored;
alter table public.gallery_items add column if not exists duration_s numeric
  generated always as (case when jsonb_typeof(data->'duration') = 'number' then (data->>'duration')::numeric end) stored;
alter table public.gallery_items add column if not exists poster_path text
  generated always as (case when data->>'kind' = 'video' then data->'remote'->>'disp' end) stored;
alter table public.gallery_items add column if not exists local_only boolean
  generated always as (coalesce(data->>'localOnly' = 'true', false)) stored;
create index if not exists gallery_items_user_type_idx on public.gallery_items (user_id, media_type);

-- ---------- Row Level Security ----------
alter table public.profiles   enable row level security;
alter table public.workouts   enable row level security;
alter table public.gps_routes enable row level security;
alter table public.food_logs  enable row level security;
alter table public.water_logs enable row level security;
alter table public.body_logs  enable row level security;
alter table public.templates  enable row level security;
alter table public.step_logs  enable row level security;
alter table public.burn_logs  enable row level security; -- manual calories-burned entries (Burn tracker)
alter table public.wl_plans   enable row level security; -- weight-loss programs: quiz answers, targets, 7-day meal plan, adjustments (weigh-ins live in body_logs)
alter table public.coach_plans enable row level security; -- HYBRD Coach: intake answers, weekly schedule, check-ins, changelog, nutrition targets + meal plan
alter table public.gallery_items enable row level security; -- Me › Gallery: photo metadata (date, tag, caption, size, storage paths in the private user-media bucket); day = photo date
alter table public.sleep_logs enable row level security; -- Fuel › Sleep log: one row per night (hours, quality 1–5, late caffeine / alcohol / late meal flags, snack); day = morning woke
alter table public.caffeine_logs enable row level security; -- Fuel › Sleep caffeine tracker: one row per drink (time, mg, drink); day = local date
alter table public.fasting_logs enable row level security; -- Fasting timer: one row per fast (start, end, target hours, protocol) or low-calorie day; day = local start date
alter table public.mind_checkins enable row level security; -- Mind & Recovery daily check-in: mood/stress/energy/motivation/soreness/sleep 1–5, optional HRV + resting HR, readiness score; day = local date
alter table public.journal_entries enable row level security; -- Mind & Recovery journal (gratitude / wins / reflection). Private: owner-only, never shared
alter table public.mind_sessions enable row level security; -- Mind & Recovery: completed breathing sessions, program days and recovery routines; day = local date
alter table public.mind_screens enable row level security; -- Mind & Recovery HYBRD Pulse weekly check-ins (+ optional PHQ-2/GAD-2; no diagnosis; older retired-format rows kept as-is); day = local date

-- Defence in depth: entries the user marked "keep on this device" must never be stored server-side (the app never sends them).
alter table public.journal_entries drop constraint if exists journal_entries_not_local_only;
alter table public.journal_entries add constraint journal_entries_not_local_only check (coalesce(data->>'localOnly', 'false') <> 'true');
alter table public.mind_screens drop constraint if exists mind_screens_not_local_only;
alter table public.mind_screens add constraint mind_screens_not_local_only check (coalesce(data->>'localOnly', 'false') <> 'true');

-- profiles: you can only see / change your own row
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "profiles_update_own" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "profiles_delete_own" on public.profiles for delete to authenticated using ((select auth.uid()) = id);

-- log tables: same four policies on each
do $$
declare t text;
begin
  foreach t in array array['workouts', 'gps_routes', 'food_logs', 'water_logs', 'body_logs', 'templates', 'step_logs', 'burn_logs', 'wl_plans', 'coach_plans', 'mind_checkins', 'journal_entries', 'mind_sessions', 'mind_screens', 'sleep_logs', 'caffeine_logs', 'fasting_logs', 'gallery_items'] loop
    execute format('drop policy if exists "%1$s_select_own" on public.%1$I', t);
    execute format('drop policy if exists "%1$s_insert_own" on public.%1$I', t);
    execute format('drop policy if exists "%1$s_update_own" on public.%1$I', t);
    execute format('drop policy if exists "%1$s_delete_own" on public.%1$I', t);
    execute format('create policy "%1$s_select_own" on public.%1$I for select to authenticated using ((select auth.uid()) = user_id)', t);
    execute format('create policy "%1$s_insert_own" on public.%1$I for insert to authenticated with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "%1$s_update_own" on public.%1$I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "%1$s_delete_own" on public.%1$I for delete to authenticated using ((select auth.uid()) = user_id)', t);
  end loop;
end $$;

-- Anonymous (signed-out) visitors get nothing: no policies exist for the anon role.
revoke all on public.profiles, public.workouts, public.gps_routes, public.food_logs, public.water_logs, public.body_logs, public.templates, public.step_logs, public.burn_logs, public.wl_plans, public.coach_plans, public.mind_checkins, public.journal_entries, public.mind_sessions, public.mind_screens, public.sleep_logs, public.caffeine_logs, public.fasting_logs, public.gallery_items from anon;
grant select, insert, update, delete on public.profiles, public.workouts, public.gps_routes, public.food_logs, public.water_logs, public.body_logs, public.templates, public.step_logs, public.burn_logs, public.wl_plans, public.coach_plans, public.mind_checkins, public.journal_entries, public.mind_sessions, public.mind_screens, public.sleep_logs, public.caffeine_logs, public.fasting_logs, public.gallery_items to authenticated;

-- Create an empty profile row automatically when someone signs up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Check: every HYBRD table should show rowsecurity = true
select tablename, rowsecurity from pg_tables where schemaname = 'public'
  and tablename in ('profiles','workouts','gps_routes','food_logs','water_logs','body_logs','templates','step_logs','burn_logs','wl_plans','coach_plans','mind_checkins','journal_entries','mind_sessions','mind_screens','sleep_logs','caffeine_logs','fasting_logs','gallery_items');

-- ---------- Storage: private bucket for profile photos + gallery images and videos ----------
-- Files live under a folder named after the user's id:  <auth.uid()>/avatar.webp,  <auth.uid()>/gallery/<item id>/orig.jpg …
-- Videos: <auth.uid()>/gallery/<item id>/orig.mp4|mov|webm (original bytes) + disp.webp (poster) + thumb.webp.
-- The bucket is PRIVATE (no public URLs); the app downloads files with the signed-in user's session.
-- Size limit: 50 MB per file = the Supabase FREE plan's global maximum (a bucket can't go above the project limit).
-- On Pro you can raise the global limit (Storage settings) and this number — then also raise CLOUD_FILE_CAP in
-- src/lib/media.ts so bigger videos upload instead of staying on the device.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('user-media', 'user-media', false, 52428800, array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "user_media_select_own" on storage.objects;
drop policy if exists "user_media_insert_own" on storage.objects;
drop policy if exists "user_media_update_own" on storage.objects;
drop policy if exists "user_media_delete_own" on storage.objects;
create policy "user_media_select_own" on storage.objects for select to authenticated
  using (bucket_id = 'user-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "user_media_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'user-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "user_media_update_own" on storage.objects for update to authenticated
  using (bucket_id = 'user-media' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'user-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "user_media_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'user-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Check: the bucket must be private (public = false)
select id, public, file_size_limit from storage.buckets where id = 'user-media';

-- =====================================================================================================================
-- Social: Friends & Stories  (added 16 Nov 2026 — safe to re-run; see SETUP.md §11 for setup + moderation)
-- =====================================================================================================================
-- Model: a separate PUBLIC profile layer (social_profiles) that each person creates on purpose — the private
-- profiles row (Bio, body data, avatar) is never exposed. Everything below is RLS-protected:
--   * only members (13+) can see anything; signed-out visitors (anon) get nothing
--   * blocked people (either direction) never see each other's profile, posts, stories, comments, likes or reactions
--   * posts / stories are 'friends' or 'public'; friends-only profiles and under-18s can only publish to friends
--   * friend requests, blocks and profile creation go through SECURITY DEFINER functions (no direct writes)
--   * counters and notifications are maintained by triggers, so clients can't fake them
--   * rate limits are enforced by triggers (friend requests, posts, stories, comments, reactions, reports)

-- ---------- public profiles ----------
create table if not exists public.social_profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  username      text not null,
  display_name  text not null,
  avatar_path   text,                       -- social-media bucket: <uid>/avatar.webp (opt-in copy of the profile photo)
  public_bio    text,
  privacy       text not null default 'public',
  show_stats    boolean not null default false,
  stats         jsonb,                      -- only kept while show_stats = true (trigger clears it)
  is_minor      boolean not null default false,  -- 13–17: friends-only, maintained from social_private.birth_date
  friend_count  integer not null default 0,
  post_count    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.social_profiles drop constraint if exists social_profiles_username_format;
alter table public.social_profiles add constraint social_profiles_username_format
  check (username ~ '^[a-z0-9_.]{3,20}$' and username ~ '[a-z]' and username !~ '(^[.]|[.]$|[.][.])' and username !~ '^sample[._]');
alter table public.social_profiles drop constraint if exists social_profiles_name_len;
alter table public.social_profiles add constraint social_profiles_name_len check (char_length(btrim(display_name)) between 1 and 40);
alter table public.social_profiles drop constraint if exists social_profiles_bio_len;
alter table public.social_profiles add constraint social_profiles_bio_len check (public_bio is null or char_length(public_bio) <= 160);
alter table public.social_profiles drop constraint if exists social_profiles_privacy_chk;
alter table public.social_profiles add constraint social_profiles_privacy_chk check (privacy in ('public', 'friends'));
create unique index if not exists social_profiles_username_key on public.social_profiles (username);
create index if not exists social_profiles_username_prefix_idx on public.social_profiles (username text_pattern_ops);

-- Private: birth date for the 13+ gate (only the owner can read it; never shown to others).
create table if not exists public.social_private (
  id          uuid primary key references public.social_profiles (id) on delete cascade,
  birth_date  date not null,
  created_at  timestamptz not null default now()
);
-- Moderation: banned accounts can't (re)create a public profile.
create table if not exists public.social_bans (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  reason      text,
  created_at  timestamptz not null default now()
);

-- ---------- safety core (v1.6) — self-pause / deletion state, moderator decisions, appeals ----------
-- Defined here because the visibility helpers below use them; RLS, RPCs and the moderation queue are in the
-- SAFETY section at the end of this file (SETUP.md §15).
-- Moderators: set profiles.is_moderator = true for an account in the SQL editor (the app can never set it).
alter table public.profiles add column if not exists is_moderator boolean not null default false;
create table if not exists public.account_state (
  user_id                uuid primary key references auth.users (id) on delete cascade,
  paused_at              timestamptz,             -- "I need time off": hidden from everyone while paused
  pause_until            timestamptz,             -- null = until I come back; otherwise resumes by itself at this time
  deletion_requested_at  timestamptz,             -- "Delete account": deactivated now, purged after purge_after
  purge_after            timestamptz,
  deletion_reason        text,
  updated_at             timestamptz not null default now()
);
alter table public.account_state drop constraint if exists account_state_reason_len;
alter table public.account_state add constraint account_state_reason_len check (deletion_reason is null or char_length(deletion_reason) <= 200);
alter table public.account_state drop constraint if exists account_state_purge_chk;
alter table public.account_state add constraint account_state_purge_chk check ((deletion_requested_at is null) = (purge_after is null));
create index if not exists account_state_purge_idx on public.account_state (purge_after) where purge_after is not null;

-- Audit log of every moderator action. Rows with action remove_content / restrict_messaging / suspend are the
-- "decisions" a person sees in Settings › Safety › Account status (without the moderator, the report or internal notes).
create table if not exists public.moderation_actions (
  id               uuid primary key default gen_random_uuid(),
  moderator_id     uuid references auth.users (id) on delete set null,
  target_user_id   uuid references auth.users (id) on delete set null,
  action           text not null,
  content_type     text,
  content_id       uuid,
  content_preview  text,
  guideline        text,
  note             text,                        -- shown to the person
  internal_note    text,                        -- moderators only
  report_store     text,
  report_id        uuid,
  appeal_id        uuid,
  decision_id      uuid,                        -- for restore / appeal rows: the decision they act on
  ends_at          timestamptz,
  reversed_at      timestamptz,
  created_at       timestamptz not null default now()
);
alter table public.moderation_actions drop constraint if exists moderation_actions_action_chk;
alter table public.moderation_actions add constraint moderation_actions_action_chk check (action in
  ('dismiss', 'review', 'remove_content', 'restore_content', 'restrict_messaging', 'suspend', 'appeal_reviewing', 'appeal_upheld', 'appeal_reversed'));
alter table public.moderation_actions drop constraint if exists moderation_actions_content_chk;
alter table public.moderation_actions add constraint moderation_actions_content_chk check (content_type is null or content_type in ('post', 'story', 'comment', 'activity', 'message'));
alter table public.moderation_actions drop constraint if exists moderation_actions_guideline_chk;
alter table public.moderation_actions add constraint moderation_actions_guideline_chk check (guideline is null or guideline in
  ('respect', 'hate', 'sexual', 'minors', 'self_harm', 'violence', 'spam', 'authentic', 'privacy'));
alter table public.moderation_actions drop constraint if exists moderation_actions_note_len;
alter table public.moderation_actions add constraint moderation_actions_note_len check ((note is null or char_length(note) <= 500) and (internal_note is null or char_length(internal_note) <= 1000));
create index if not exists moderation_actions_target_idx on public.moderation_actions (target_user_id, created_at desc);
create index if not exists moderation_actions_active_idx on public.moderation_actions (target_user_id, action) where reversed_at is null;

create table if not exists public.appeals (
  id             uuid primary key default gen_random_uuid(),
  decision_id    uuid not null references public.moderation_actions (id) on delete cascade,
  user_id        uuid not null references auth.users (id) on delete cascade,
  body           text not null,
  status         text not null default 'submitted',
  created_at     timestamptz not null default now(),
  decided_at     timestamptz,
  decided_by     uuid references auth.users (id) on delete set null,
  decision_note  text
);
create unique index if not exists appeals_one_per_decision on public.appeals (decision_id);   -- once per decision
alter table public.appeals drop constraint if exists appeals_status_chk;
alter table public.appeals add constraint appeals_status_chk check (status in ('submitted', 'under_review', 'upheld', 'reversed'));
alter table public.appeals drop constraint if exists appeals_body_len;
alter table public.appeals add constraint appeals_body_len check (char_length(btrim(body)) between 10 and 1000);
create index if not exists appeals_status_idx on public.appeals (status, created_at);

-- Is `u` hidden from everyone else right now? (paused, deletion pending, or suspended by a moderator)
create or replace function public.acct_suspended(u uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.moderation_actions a where a.target_user_id = u and a.action = 'suspend' and a.reversed_at is null and a.ends_at > now())
$$;
create or replace function public.acct_msg_restricted(u uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.moderation_actions a where a.target_user_id = u and a.action = 'restrict_messaging' and a.reversed_at is null and a.ends_at > now())
$$;
create or replace function public.acct_paused(u uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.account_state s where s.user_id = u
                 and (s.deletion_requested_at is not null or (s.paused_at is not null and (s.pause_until is null or s.pause_until > now()))))
$$;
create or replace function public.acct_hidden(u uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select u is not null and (public.acct_paused(u) or public.acct_suspended(u))
$$;
create or replace function public.is_moderator() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.is_moderator from public.profiles p where p.id = auth.uid()), false)
$$;

-- ---------- friends ----------
create table if not exists public.friend_requests (
  id            uuid primary key default gen_random_uuid(),
  sender_id     uuid not null references public.social_profiles (id) on delete cascade,
  receiver_id   uuid not null references public.social_profiles (id) on delete cascade,
  status        text not null default 'pending',
  created_at    timestamptz not null default now(),
  responded_at  timestamptz
);
alter table public.friend_requests drop constraint if exists friend_requests_not_self;
alter table public.friend_requests add constraint friend_requests_not_self check (sender_id <> receiver_id);
alter table public.friend_requests drop constraint if exists friend_requests_status_chk;
alter table public.friend_requests add constraint friend_requests_status_chk check (status in ('pending', 'accepted', 'declined', 'cancelled'));
create unique index if not exists friend_requests_one_pending on public.friend_requests (least(sender_id, receiver_id), greatest(sender_id, receiver_id)) where status = 'pending';
create index if not exists friend_requests_receiver_idx on public.friend_requests (receiver_id, status);
create index if not exists friend_requests_sender_idx on public.friend_requests (sender_id, created_at);

create table if not exists public.friendships (
  user_a      uuid not null references public.social_profiles (id) on delete cascade,
  user_b      uuid not null references public.social_profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_a, user_b)
);
alter table public.friendships drop constraint if exists friendships_ordered;
alter table public.friendships add constraint friendships_ordered check (user_a < user_b);
create index if not exists friendships_b_idx on public.friendships (user_b);

create table if not exists public.blocks (
  blocker_id  uuid not null references public.social_profiles (id) on delete cascade,
  blocked_id  uuid not null references public.social_profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);
alter table public.blocks drop constraint if exists blocks_not_self;
alter table public.blocks add constraint blocks_not_self check (blocker_id <> blocked_id);
create index if not exists blocks_blocked_idx on public.blocks (blocked_id);

-- ---------- posts, media, stories ----------
create table if not exists public.posts (
  id             uuid primary key default gen_random_uuid(),
  author_id      uuid not null default auth.uid() references public.social_profiles (id) on delete cascade,
  body           text not null default '',
  workout        jsonb,                     -- optional workout summary card (type, distance, time, pace, Hybrid Score)
  audience       text not null default 'friends',
  reshare_of     uuid references public.posts (id) on delete cascade,
  like_count     integer not null default 0,
  comment_count  integer not null default 0,
  share_count    integer not null default 0,
  created_at     timestamptz not null default now(),
  edited_at      timestamptz
);
alter table public.posts drop constraint if exists posts_body_len;
alter table public.posts add constraint posts_body_len check (char_length(body) <= 2000);
alter table public.posts drop constraint if exists posts_audience_chk;
alter table public.posts add constraint posts_audience_chk check (audience in ('public', 'friends'));
create index if not exists posts_author_created_idx on public.posts (author_id, created_at desc);
create index if not exists posts_created_idx on public.posts (created_at desc);
create index if not exists posts_public_created_idx on public.posts (created_at desc) where audience = 'public';
create index if not exists posts_reshare_idx on public.posts (reshare_of) where reshare_of is not null;
-- Moderator removal (v1.6): hidden from everyone except the author, who sees a "removed" notice with an Appeal link.
alter table public.posts add column if not exists removed_at timestamptz;

create table if not exists public.post_media (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.posts (id) on delete cascade,
  author_id   uuid not null default auth.uid() references public.social_profiles (id) on delete cascade,
  path        text not null,                -- social-media bucket: <uid>/posts/<post id>/<n>.webp
  w           integer,
  h           integer,
  position    smallint not null default 0,
  created_at  timestamptz not null default now()
);
create unique index if not exists post_media_path_key on public.post_media (path);
create index if not exists post_media_post_idx on public.post_media (post_id, position);
alter table public.post_media drop constraint if exists post_media_position_chk;
alter table public.post_media add constraint post_media_position_chk check (position between 0 and 3);

create table if not exists public.stories (
  id          uuid primary key default gen_random_uuid(),
  author_id   uuid not null default auth.uid() references public.social_profiles (id) on delete cascade,
  body        text,
  bg          text,
  media_path  text,                         -- social-media bucket: <uid>/stories/<story id>.webp
  w           integer,
  h           integer,
  audience    text not null default 'friends',
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '24 hours')
);
alter table public.stories drop constraint if exists stories_body_len;
alter table public.stories add constraint stories_body_len check (body is null or char_length(body) <= 200);
alter table public.stories drop constraint if exists stories_audience_chk;
alter table public.stories add constraint stories_audience_chk check (audience in ('public', 'friends'));
alter table public.stories drop constraint if exists stories_expiry_chk;
alter table public.stories add constraint stories_expiry_chk check (expires_at <= created_at + interval '24 hours');
alter table public.stories drop constraint if exists stories_content_chk;
alter table public.stories add constraint stories_content_chk check (media_path is not null or char_length(coalesce(body, '')) > 0);
create index if not exists stories_author_expires_idx on public.stories (author_id, expires_at);
create index if not exists stories_expires_idx on public.stories (expires_at);
alter table public.stories add column if not exists removed_at timestamptz;

-- ---------- reactions ----------
create table if not exists public.likes (
  post_id     uuid not null references public.posts (id) on delete cascade,
  user_id     uuid not null default auth.uid() references public.social_profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index if not exists likes_user_idx on public.likes (user_id, created_at desc);

-- Emoji reactions on posts and comments (Like, Love, Haha, Wow, Sad, Angry, Dislike — no Care/hug).
-- Unique per user+target. Legacy post likes are migrated into kind = 'like' below (safe to re-run).
create table if not exists public.reactions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references public.social_profiles (id) on delete cascade,
  target_type  text not null,
  target_id    uuid not null,
  kind         text not null,
  created_at   timestamptz not null default now()
);
alter table public.reactions drop constraint if exists reactions_target_type_chk;
alter table public.reactions add constraint reactions_target_type_chk check (target_type in ('post', 'comment'));
alter table public.reactions drop constraint if exists reactions_kind_chk;
alter table public.reactions add constraint reactions_kind_chk check (kind in ('like', 'love', 'haha', 'wow', 'sad', 'angry', 'dislike'));
alter table public.reactions drop constraint if exists reactions_user_target_key;
alter table public.reactions add constraint reactions_user_target_key unique (user_id, target_type, target_id);
create index if not exists reactions_target_idx on public.reactions (target_type, target_id, created_at desc);
create index if not exists reactions_user_idx on public.reactions (user_id, created_at desc);

create table if not exists public.comments (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.posts (id) on delete cascade,
  author_id   uuid not null default auth.uid() references public.social_profiles (id) on delete cascade,
  body        text not null,
  created_at  timestamptz not null default now()
);
alter table public.comments drop constraint if exists comments_body_len;
alter table public.comments add constraint comments_body_len check (char_length(btrim(body)) between 1 and 500);
create index if not exists comments_post_idx on public.comments (post_id, created_at);
create index if not exists comments_author_idx on public.comments (author_id, created_at desc);
alter table public.comments add column if not exists removed_at timestamptz;

create table if not exists public.saves (
  user_id     uuid not null default auth.uid() references public.social_profiles (id) on delete cascade,
  post_id     uuid not null references public.posts (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, post_id)
);
create index if not exists saves_user_created_idx on public.saves (user_id, created_at desc);

create table if not exists public.hidden_posts (
  user_id     uuid not null default auth.uid() references public.social_profiles (id) on delete cascade,
  post_id     uuid not null references public.posts (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, post_id)
);

-- ---------- safety ----------
create table if not exists public.reports (
  id              uuid primary key default gen_random_uuid(),
  reporter_id     uuid default auth.uid() references auth.users (id) on delete set null,
  target_type     text not null,
  target_id       uuid not null,
  target_user_id  uuid references auth.users (id) on delete set null,  -- whose content / account was reported
  reason          text not null,
  details         text,
  snapshot        jsonb,                    -- copy of the reported text at report time (survives deletion)
  status          text not null default 'open',
  created_at      timestamptz not null default now(),
  reviewed_at     timestamptz,
  moderator_note  text
);
alter table public.reports drop constraint if exists reports_target_chk;
alter table public.reports add constraint reports_target_chk check (target_type in ('post', 'comment', 'user', 'story', 'activity', 'media'));
alter table public.reports drop constraint if exists reports_reason_chk;
alter table public.reports add constraint reports_reason_chk check (reason in ('spam', 'harassment', 'hate', 'sexual', 'minor', 'self_harm', 'impersonation', 'scam', 'violence', 'other',
  'nudity', 'misinformation', 'underage'));  -- last three: reasons used before v1.6 (kept so old rows stay valid)
-- Triage: 0 = urgent (minors, self-harm), 1 = high (violence, sexual content, harassment), 2 = normal. Set by the trigger.
alter table public.reports add column if not exists priority smallint not null default 2;
alter table public.reports drop constraint if exists reports_status_chk;
alter table public.reports add constraint reports_status_chk check (status in ('open', 'reviewing', 'actioned', 'dismissed'));
alter table public.reports drop constraint if exists reports_details_len;
alter table public.reports add constraint reports_details_len check (details is null or char_length(details) <= 500);
create index if not exists reports_status_created_idx on public.reports (status, created_at);
create index if not exists reports_reporter_idx on public.reports (reporter_id, created_at desc);
create index if not exists reports_queue_idx on public.reports (status, priority, created_at);
create or replace function public.report_priority(r text) returns smallint
language sql immutable as $$
  select (case when r in ('minor', 'underage', 'self_harm') then 0 when r in ('violence', 'sexual', 'nudity', 'harassment') then 1 else 2 end)::smallint
$$;

create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.social_profiles (id) on delete cascade,
  actor_id    uuid not null references public.social_profiles (id) on delete cascade,
  type        text not null,
  post_id     uuid references public.posts (id) on delete cascade,
  comment_id  uuid references public.comments (id) on delete cascade,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
alter table public.notifications add column if not exists reaction text;
alter table public.notifications drop constraint if exists notifications_type_chk;
alter table public.notifications add constraint notifications_type_chk check (type in ('friend_request', 'friend_accept', 'like', 'comment', 'reshare'));
alter table public.notifications drop constraint if exists notifications_reaction_chk;
alter table public.notifications add constraint notifications_reaction_chk check (reaction is null or reaction in ('like', 'love', 'haha', 'wow', 'sad', 'angry', 'dislike'));
create index if not exists notifications_user_created_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications (user_id) where read_at is null;

-- ---------- helper functions (SECURITY DEFINER: read past RLS, return only a boolean) ----------
create or replace function public.social_is_member(u uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select u is not null and exists (select 1 from public.social_profiles p where p.id = u)
$$;
create or replace function public.social_is_blocked(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.blocks k where (k.blocker_id = a and k.blocked_id = b) or (k.blocker_id = b and k.blocked_id = a))
$$;
create or replace function public.social_are_friends(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.friendships f where f.user_a = least(a, b) and f.user_b = greatest(a, b))
$$;
-- Can the signed-in user see content by `author` published to `aud`?
create or replace function public.social_can_view(author uuid, aud text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when auth.uid() is null then false
    when author = auth.uid() then true
    when not public.social_is_member(auth.uid()) then false
    when public.social_is_blocked(auth.uid(), author) then false
    when public.acct_hidden(author) then false   -- paused, deletion pending or suspended: hidden from everyone
    when public.social_are_friends(auth.uid(), author) then true
    when aud = 'public' then exists (select 1 from public.social_profiles p where p.id = author and p.privacy = 'public' and not p.is_minor)
    else false
  end
$$;
create or replace function public.social_can_view_post(pid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select public.social_can_view(p.author_id, p.audience) and (p.removed_at is null or p.author_id = auth.uid()) from public.posts p where p.id = pid), false)
$$;
create or replace function public.social_post_author(pid uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select p.author_id from public.posts p where p.id = pid
$$;
create or replace function public.social_comment_post(cid uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select c.post_id from public.comments c where c.id = cid
$$;
create or replace function public.social_comment_author(cid uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select c.author_id from public.comments c where c.id = cid
$$;
create or replace function public.social_can_view_reaction_target(t text, tid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case t
    when 'post' then public.social_can_view_post(tid)
    when 'comment' then public.social_can_view_post(public.social_comment_post(tid))
    else false
  end
$$;
-- Storage: who may read an object in the social-media bucket?
create or replace function public.social_can_view_object(p_name text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  parts text[] := string_to_array(p_name, '/');
  owner uuid;
begin
  if auth.uid() is null or parts is null or array_length(parts, 1) < 2 then return false; end if;
  begin owner := parts[1]::uuid; exception when others then return false; end;
  if owner = auth.uid() then return true; end if;
  if not public.social_is_member(auth.uid()) or public.social_is_blocked(auth.uid(), owner) then return false; end if;
  if array_length(parts, 1) = 2 and parts[2] like 'avatar%' then
    return exists (select 1 from public.social_profiles p where p.id = owner and p.avatar_path = p_name) and not public.acct_hidden(owner);
  elsif parts[2] = 'posts' then
    return exists (select 1 from public.post_media m where m.path = p_name and m.author_id = owner and public.social_can_view_post(m.post_id));
  elsif parts[2] = 'stories' then
    return exists (select 1 from public.stories s where s.media_path = p_name and s.author_id = owner and s.expires_at > now() and s.removed_at is null and public.social_can_view(s.author_id, s.audience));
  end if;
  return false;
end $$;

-- Rate limit helper: raise if `n` rows already exist in the window.
create or replace function public.social_rate_check(n bigint, lim integer, what text) returns void
language plpgsql as $$
begin
  if n >= lim then raise exception 'rate_limit: max % %', lim, what using errcode = 'P0001', hint = 'Try again later.'; end if;
end $$;

-- ---------- triggers ----------
-- social_profiles: keep is_minor in sync with the birth date, minors are friends-only, stats only when opted in.
create or replace function public.social_profiles_before() returns trigger
language plpgsql security definer set search_path = '' as $$
declare bd date;
begin
  select birth_date into bd from public.social_private where id = new.id;
  if bd is not null then new.is_minor := bd > (current_date - interval '18 years'); end if;
  if new.is_minor then new.privacy := 'friends'; end if;
  if not new.show_stats then new.stats := null; end if;
  new.username := lower(btrim(new.username));
  new.display_name := btrim(new.display_name);
  new.updated_at := now();
  -- counters / is_minor / created_at are not client-editable: the column grants below only allow profile fields.
  return new;
end $$;
drop trigger if exists social_profiles_before on public.social_profiles;
create trigger social_profiles_before before insert or update on public.social_profiles for each row execute function public.social_profiles_before();

-- posts: server-owned fields, audience rules, rate limit
create or replace function public.posts_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare a public.social_profiles;
begin
  select * into a from public.social_profiles where id = new.author_id;
  if a.id is null then raise exception 'not_member' using errcode = 'P0001'; end if;
  if a.is_minor or a.privacy = 'friends' then new.audience := 'friends'; end if;
  new.like_count := 0; new.comment_count := 0; new.share_count := 0; new.created_at := now(); new.edited_at := null;
  perform public.social_rate_check((select count(*) from public.posts where author_id = new.author_id and created_at > now() - interval '1 day'), 30, 'posts per day');
  return new;
end $$;
drop trigger if exists posts_before_insert on public.posts;
create trigger posts_before_insert before insert on public.posts for each row execute function public.posts_before_insert();

create or replace function public.posts_before_update() returns trigger
language plpgsql security definer set search_path = '' as $$
declare a public.social_profiles;
begin
  select * into a from public.social_profiles where id = new.author_id;
  if a.is_minor or a.privacy = 'friends' then new.audience := 'friends'; end if;
  if new.body is distinct from old.body or new.audience is distinct from old.audience then new.edited_at := now(); end if;
  return new;
end $$;
drop trigger if exists posts_before_update on public.posts;
create trigger posts_before_update before update on public.posts for each row execute function public.posts_before_update();

create or replace function public.posts_after() returns trigger
language plpgsql security definer set search_path = '' as $$
declare orig_author uuid;
begin
  if tg_op = 'INSERT' then
    update public.social_profiles set post_count = post_count + 1 where id = new.author_id;
    if new.reshare_of is not null then
      update public.posts set share_count = share_count + 1 where id = new.reshare_of returning author_id into orig_author;
      if orig_author is not null and orig_author <> new.author_id and not public.social_is_blocked(orig_author, new.author_id) then
        insert into public.notifications (user_id, actor_id, type, post_id) values (orig_author, new.author_id, 'reshare', new.reshare_of);
      end if;
    end if;
    return new;
  else
    update public.social_profiles set post_count = greatest(0, post_count - 1) where id = old.author_id;
    if old.reshare_of is not null then update public.posts set share_count = greatest(0, share_count - 1) where id = old.reshare_of; end if;
    return old;
  end if;
end $$;
drop trigger if exists posts_after on public.posts;
create trigger posts_after after insert or delete on public.posts for each row execute function public.posts_after();

-- stories: 24-hour expiry is set by the server; audience rules; rate limit
create or replace function public.stories_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare a public.social_profiles;
begin
  select * into a from public.social_profiles where id = new.author_id;
  if a.id is null then raise exception 'not_member' using errcode = 'P0001'; end if;
  if a.is_minor or a.privacy = 'friends' then new.audience := 'friends'; end if;
  new.created_at := now(); new.expires_at := now() + interval '24 hours';
  perform public.social_rate_check((select count(*) from public.stories where author_id = new.author_id and created_at > now() - interval '1 day'), 30, 'stories per day');
  return new;
end $$;
drop trigger if exists stories_before_insert on public.stories;
create trigger stories_before_insert before insert on public.stories for each row execute function public.stories_before_insert();

-- likes stay as a compatibility table for old 'like' rows. like_count and notifications
-- are maintained by reactions_after; this trigger just mirrors a Like reaction.
create or replace function public.likes_after() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.reactions (user_id, target_type, target_id, kind, created_at)
    values (new.user_id, 'post', new.post_id, 'like', new.created_at)
    on conflict (user_id, target_type, target_id) do update set kind = 'like', created_at = excluded.created_at;
    return new;
  else
    delete from public.reactions
      where user_id = old.user_id and target_type = 'post' and target_id = old.post_id and kind = 'like';
    return old;
  end if;
end $$;
drop trigger if exists likes_after on public.likes;
create trigger likes_after after insert or delete on public.likes for each row execute function public.likes_after();
create or replace function public.likes_before_insert() returns trigger language plpgsql as $$ begin new.created_at := now(); return new; end $$;
drop trigger if exists likes_before_insert on public.likes;
create trigger likes_before_insert before insert on public.likes for each row execute function public.likes_before_insert();

-- reactions: rate limit, like_count, notifications, and a likes-row mirror for kind = 'like' on posts
create or replace function public.reactions_before() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    if new.user_id is null then new.user_id := auth.uid(); end if;
    perform public.social_rate_check((select count(*) from public.reactions where user_id = new.user_id and created_at > now() - interval '1 hour'), 120, 'reactions per hour');
  elsif tg_op = 'UPDATE' then
    new.user_id := old.user_id;
    new.target_type := old.target_type;
    new.target_id := old.target_id;
    new.created_at := now();
  end if;
  return new;
end $$;
drop trigger if exists reactions_before on public.reactions;
create trigger reactions_before before insert or update on public.reactions for each row execute function public.reactions_before();

create or replace function public.reactions_after() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  owner uuid;
  post uuid;
  typ text;
  kid text;
  actor uuid;
  tgt text;
  tid uuid;
begin
  typ := coalesce(new.target_type, old.target_type);
  tid := coalesce(new.target_id, old.target_id);
  actor := coalesce(new.user_id, old.user_id);
  kid := coalesce(new.kind, old.kind);

  if typ = 'post' then
    post := tid;
    select author_id into owner from public.posts where id = tid;
    if tg_op = 'INSERT' then
      update public.posts set like_count = like_count + 1 where id = tid;
    elsif tg_op = 'DELETE' then
      update public.posts set like_count = greatest(0, like_count - 1) where id = tid;
    end if;
    -- keep likes in sync only for a current Like on a post
    if tg_op = 'DELETE' or (tg_op in ('INSERT', 'UPDATE') and coalesce(new.kind, '') <> 'like') then
      delete from public.likes where post_id = tid and user_id = actor;
    elsif new.kind = 'like' then
      insert into public.likes (post_id, user_id, created_at) values (tid, actor, new.created_at)
      on conflict (post_id, user_id) do nothing;
    end if;
  else
    select author_id, post_id into owner, post from public.comments where id = tid;
  end if;

  -- notify the content owner (one row per actor per target; changing kind updates it)
  if tg_op = 'DELETE' then
    return old;
  end if;
  if owner is not null and owner <> actor then
    if typ = 'comment' then
      delete from public.notifications where user_id = owner and actor_id = actor and type = 'like' and comment_id = tid;
      insert into public.notifications (user_id, actor_id, type, post_id, comment_id, reaction) values (owner, actor, 'like', post, tid, new.kind);
    else
      delete from public.notifications where user_id = owner and actor_id = actor and type = 'like' and post_id = tid and comment_id is null;
      insert into public.notifications (user_id, actor_id, type, post_id, reaction) values (owner, actor, 'like', tid, new.kind);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists reactions_after on public.reactions;
create trigger reactions_after after insert or update or delete on public.reactions for each row execute function public.reactions_after();


-- Migrate legacy likes into reactions (idempotent). Triggers are disabled so like_count is not double-counted, then recounted.
do $$
begin
  if to_regclass('public.likes') is not null and to_regclass('public.reactions') is not null then
    alter table public.reactions disable trigger user;
    insert into public.reactions (user_id, target_type, target_id, kind, created_at)
    select user_id, 'post', post_id, 'like', created_at from public.likes
    on conflict (user_id, target_type, target_id) do nothing;
    alter table public.reactions enable trigger user;
    update public.posts p set like_count = (select count(*) from public.reactions r where r.target_type = 'post' and r.target_id = p.id);
  end if;
end $$;

-- comments: rate limit, counter, notification
create or replace function public.comments_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.created_at := now(); new.body := btrim(new.body);
  perform public.social_rate_check((select count(*) from public.comments where author_id = new.author_id and created_at > now() - interval '1 hour'), 60, 'comments per hour');
  return new;
end $$;
drop trigger if exists comments_before_insert on public.comments;
create trigger comments_before_insert before insert on public.comments for each row execute function public.comments_before_insert();
create or replace function public.comments_after() returns trigger
language plpgsql security definer set search_path = '' as $$
declare owner uuid;
begin
  if tg_op = 'INSERT' then
    update public.posts set comment_count = comment_count + 1 where id = new.post_id returning author_id into owner;
    if owner is not null and owner <> new.author_id then
      insert into public.notifications (user_id, actor_id, type, post_id, comment_id) values (owner, new.author_id, 'comment', new.post_id, new.id);
    end if;
    return new;
  else
    update public.posts set comment_count = greatest(0, comment_count - 1) where id = old.post_id;
    return old;
  end if;
end $$;
drop trigger if exists comments_after on public.comments;
create trigger comments_after after insert or delete on public.comments for each row execute function public.comments_after();

-- friendships: friend counters
create or replace function public.friendships_after() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    update public.social_profiles set friend_count = friend_count + 1 where id in (new.user_a, new.user_b);
    return new;
  else
    update public.social_profiles set friend_count = greatest(0, friend_count - 1) where id in (old.user_a, old.user_b);
    return old;
  end if;
end $$;
drop trigger if exists friendships_after on public.friendships;
create trigger friendships_after after insert or delete on public.friendships for each row execute function public.friendships_after();

-- friend requests: rate limit + notifications
create or replace function public.friend_requests_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.created_at := now();
  perform public.social_rate_check((select count(*) from public.friend_requests where sender_id = new.sender_id and created_at > now() - interval '1 hour'), 20, 'friend requests per hour');
  perform public.social_rate_check((select count(*) from public.friend_requests where sender_id = new.sender_id and created_at > now() - interval '1 day'), 60, 'friend requests per day');
  return new;
end $$;
drop trigger if exists friend_requests_before_insert on public.friend_requests;
create trigger friend_requests_before_insert before insert on public.friend_requests for each row execute function public.friend_requests_before_insert();
create or replace function public.friend_requests_after() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    insert into public.notifications (user_id, actor_id, type) values (new.receiver_id, new.sender_id, 'friend_request');
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status <> 'pending' then
    delete from public.notifications where user_id = new.receiver_id and actor_id = new.sender_id and type = 'friend_request';
    if new.status = 'accepted' then
      insert into public.notifications (user_id, actor_id, type) values (new.sender_id, new.receiver_id, 'friend_accept');
    end if;
  end if;
  return new;
end $$;
drop trigger if exists friend_requests_after on public.friend_requests;
create trigger friend_requests_after after insert or update on public.friend_requests for each row execute function public.friend_requests_after();

-- reports: rate limit + who owns the target + a snapshot of the reported text
create or replace function public.reports_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.reporter_id := auth.uid(); new.status := 'open'; new.created_at := now(); new.reviewed_at := null; new.moderator_note := null;
  new.priority := public.report_priority(new.reason);
  perform public.social_rate_check((select count(*) from public.reports where reporter_id = new.reporter_id and created_at > now() - interval '1 hour'), 10, 'reports an hour');
  perform public.social_rate_check((select count(*) from public.reports where reporter_id = new.reporter_id and created_at > now() - interval '1 day'), 30, 'reports per day');
  if exists (select 1 from public.reports r where r.reporter_id = new.reporter_id and r.target_type = new.target_type and r.target_id = new.target_id and r.created_at > now() - interval '1 day') then
    raise exception 'report_duplicate: you already reported this' using errcode = 'P0001';
  end if;
  if new.target_type in ('post', 'media') then
    select author_id, jsonb_build_object('body', body, 'audience', audience) into new.target_user_id, new.snapshot from public.posts where id = new.target_id;
  elsif new.target_type = 'comment' then
    select author_id, jsonb_build_object('body', body, 'post_id', post_id) into new.target_user_id, new.snapshot from public.comments where id = new.target_id;
  elsif new.target_type = 'story' then
    select author_id, jsonb_build_object('body', body, 'media_path', media_path) into new.target_user_id, new.snapshot from public.stories where id = new.target_id;
  elsif new.target_type = 'activity' then
    select user_id, jsonb_build_object('title', data->>'title', 'type', data->>'type', 'visibility', visibility, 'image_path', image_path) into new.target_user_id, new.snapshot from public.shared_activities where id = new.target_id;
  else
    select id, jsonb_build_object('username', username, 'display_name', display_name, 'public_bio', public_bio) into new.target_user_id, new.snapshot from public.social_profiles where id = new.target_id;
  end if;
  return new;
end $$;
drop trigger if exists reports_before_insert on public.reports;
create trigger reports_before_insert before insert on public.reports for each row execute function public.reports_before_insert();

-- ---------- RPC functions (the only way to create a profile or change the friend graph) ----------
create or replace function public.social_handle_available(p_username text) returns boolean
language sql stable security definer set search_path = '' as $$
  select not exists (select 1 from public.social_profiles where username = lower(btrim(p_username)) and id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid))
$$;

create or replace function public.social_create_profile(p_username text, p_display_name text, p_birth_date date, p_privacy text default 'public', p_public_bio text default null)
returns public.social_profiles
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); bd date; r public.social_profiles;
begin
  if me is null then raise exception 'not_signed_in' using errcode = 'P0001'; end if;
  if exists (select 1 from public.social_bans where user_id = me) then raise exception 'banned' using errcode = 'P0001'; end if;
  select birth_date into bd from public.social_private where id = me;   -- the first birth date given is kept
  bd := coalesce(bd, p_birth_date);
  if bd is null or bd > current_date - interval '13 years' or bd < date '1900-01-01' then
    raise exception 'under_13: Friends & Stories is for ages 13 and up' using errcode = 'P0001';
  end if;
  begin
    insert into public.social_profiles (id, username, display_name, privacy, public_bio, is_minor)
    values (me, lower(btrim(p_username)), btrim(p_display_name), coalesce(p_privacy, 'public'), nullif(btrim(p_public_bio), ''), bd > current_date - interval '18 years')
    on conflict (id) do update set username = excluded.username, display_name = excluded.display_name, privacy = excluded.privacy, public_bio = excluded.public_bio
    returning * into r;
  exception when unique_violation then
    raise exception 'username_taken' using errcode = 'P0001';
  end;
  insert into public.social_private (id, birth_date) values (me, bd) on conflict (id) do nothing;
  update public.social_profiles set updated_at = now() where id = me returning * into r;  -- re-run trigger now that the birth date exists
  return r;
end $$;

create or replace function public.social_send_request(p_to uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); req public.friend_requests;
begin
  if me is null or not public.social_is_member(me) then raise exception 'not_member' using errcode = 'P0001'; end if;
  if p_to = me then raise exception 'self' using errcode = 'P0001'; end if;
  if not public.social_is_member(p_to) or public.social_is_blocked(me, p_to) then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  if public.social_are_friends(me, p_to) then return 'already_friends'; end if;
  select * into req from public.friend_requests where status = 'pending' and ((sender_id = me and receiver_id = p_to) or (sender_id = p_to and receiver_id = me));
  if req.id is not null then
    if req.sender_id = me then return 'already_sent'; end if;
    perform public.social_respond_request(p_to, true);   -- they asked first → accept
    return 'accepted';
  end if;
  insert into public.friend_requests (sender_id, receiver_id) values (me, p_to);
  return 'sent';
end $$;

create or replace function public.social_cancel_request(p_to uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.friend_requests set status = 'cancelled', responded_at = now()
   where sender_id = auth.uid() and receiver_id = p_to and status = 'pending';
  if not found then raise exception 'no_request' using errcode = 'P0001'; end if;
end $$;

create or replace function public.social_respond_request(p_from uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  update public.friend_requests set status = case when p_accept then 'accepted' else 'declined' end, responded_at = now()
   where sender_id = p_from and receiver_id = me and status = 'pending';
  if not found then raise exception 'no_request' using errcode = 'P0001'; end if;
  if p_accept then
    insert into public.friendships (user_a, user_b) values (least(me, p_from), greatest(me, p_from)) on conflict do nothing;
  end if;
end $$;

create or replace function public.social_unfriend(p_other uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.friendships where user_a = least(auth.uid(), p_other) and user_b = greatest(auth.uid(), p_other);
end $$;

-- Block: removes the friendship, cancels pending requests both ways and clears notifications between the two.
create or replace function public.social_block(p_other uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if me is null or not public.social_is_member(me) then raise exception 'not_member' using errcode = 'P0001'; end if;
  if p_other = me then raise exception 'self' using errcode = 'P0001'; end if;
  insert into public.blocks (blocker_id, blocked_id) values (me, p_other) on conflict do nothing;
  delete from public.friendships where user_a = least(me, p_other) and user_b = greatest(me, p_other);
  update public.friend_requests set status = 'cancelled', responded_at = now()
   where status = 'pending' and ((sender_id = me and receiver_id = p_other) or (sender_id = p_other and receiver_id = me));
  delete from public.notifications where (user_id = me and actor_id = p_other) or (user_id = p_other and actor_id = me);
end $$;

create or replace function public.social_unblock(p_other uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.blocks where blocker_id = auth.uid() and blocked_id = p_other;
end $$;

-- Your block list with names (blocked profiles are otherwise invisible to you via RLS).
create or replace function public.social_my_blocks() returns table (id uuid, username text, display_name text, blocked_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.id, p.username, p.display_name, k.created_at from public.blocks k join public.social_profiles p on p.id = k.blocked_id
   where k.blocker_id = auth.uid() order by k.created_at desc
$$;

-- Housekeeping: drop story rows a day after they expire (they're already invisible). Schedule with pg_cron (SETUP.md §11).
create or replace function public.social_cleanup_expired() returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  delete from public.stories where expires_at < now() - interval '1 day';
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------- Row Level Security ----------
alter table public.social_profiles enable row level security;
alter table public.social_private  enable row level security;
alter table public.social_bans     enable row level security;
alter table public.friend_requests enable row level security;
alter table public.friendships     enable row level security;
alter table public.blocks          enable row level security;
alter table public.posts           enable row level security;
alter table public.post_media      enable row level security;
alter table public.stories         enable row level security;
alter table public.likes           enable row level security;
alter table public.reactions       enable row level security;
alter table public.comments        enable row level security;
alter table public.saves           enable row level security;
alter table public.hidden_posts    enable row level security;
alter table public.reports         enable row level security;
alter table public.notifications   enable row level security;

do $$
declare r record;
begin
  -- drop every existing policy on the social tables so this block can be re-run
  for r in select policyname, tablename from pg_policies where schemaname = 'public' and tablename in
    ('social_profiles', 'social_private', 'social_bans', 'friend_requests', 'friendships', 'blocks', 'posts', 'post_media', 'stories', 'likes', 'reactions', 'comments', 'saves', 'hidden_posts', 'reports', 'notifications')
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- public profiles: members see each other unless blocked (either way). Create via social_create_profile().
create policy "social_profiles_select" on public.social_profiles for select to authenticated
  using (id = (select auth.uid()) or (public.social_is_member((select auth.uid())) and not public.social_is_blocked((select auth.uid()), id) and not public.acct_hidden(id)));
create policy "social_profiles_update_own" on public.social_profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "social_profiles_delete_own" on public.social_profiles for delete to authenticated using (id = (select auth.uid()));
-- birth date: owner can read it; nobody can change it from the app
create policy "social_private_select_own" on public.social_private for select to authenticated using (id = (select auth.uid()));
-- social_bans: no policies → no access from the app (moderators use the dashboard / service role)

create policy "friend_requests_select_own" on public.friend_requests for select to authenticated
  using (sender_id = (select auth.uid()) or receiver_id = (select auth.uid()));
create policy "friendships_select_own" on public.friendships for select to authenticated
  using (user_a = (select auth.uid()) or user_b = (select auth.uid()));
create policy "blocks_select_own" on public.blocks for select to authenticated using (blocker_id = (select auth.uid()));

create policy "posts_select_visible" on public.posts for select to authenticated
  using (public.social_can_view(author_id, audience) and (removed_at is null or author_id = (select auth.uid()))
         and not exists (select 1 from public.hidden_posts h where h.post_id = id and h.user_id = (select auth.uid())));
create policy "posts_insert_own" on public.posts for insert to authenticated
  with check (author_id = (select auth.uid()) and public.social_is_member((select auth.uid()))
              and (reshare_of is null or public.social_can_view_post(reshare_of)));
create policy "posts_update_own" on public.posts for update to authenticated
  using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
create policy "posts_delete_own" on public.posts for delete to authenticated using (author_id = (select auth.uid()));

create policy "post_media_select_visible" on public.post_media for select to authenticated using (public.social_can_view_post(post_id));
create policy "post_media_insert_own" on public.post_media for insert to authenticated
  with check (author_id = (select auth.uid()) and public.social_post_author(post_id) = (select auth.uid())
              and path like (select auth.uid())::text || '/posts/' || post_id::text || '/%');
create policy "post_media_delete_own" on public.post_media for delete to authenticated using (author_id = (select auth.uid()));

create policy "stories_select_visible" on public.stories for select to authenticated
  using (author_id = (select auth.uid()) or (expires_at > now() and removed_at is null and public.social_can_view(author_id, audience)));
create policy "stories_insert_own" on public.stories for insert to authenticated
  with check (author_id = (select auth.uid()) and public.social_is_member((select auth.uid()))
              and (media_path is null or media_path like (select auth.uid())::text || '/stories/%'));
create policy "stories_delete_own" on public.stories for delete to authenticated using (author_id = (select auth.uid()));

create policy "likes_select_visible" on public.likes for select to authenticated
  using (public.social_can_view_post(post_id) and (user_id = (select auth.uid()) or not public.social_is_blocked((select auth.uid()), user_id)));
create policy "likes_insert_own" on public.likes for insert to authenticated
  with check (user_id = (select auth.uid()) and public.social_can_view_post(post_id));
create policy "likes_delete_own" on public.likes for delete to authenticated using (user_id = (select auth.uid()));

create policy "reactions_select_visible" on public.reactions for select to authenticated
  using (public.social_can_view_reaction_target(target_type, target_id)
         and (user_id = (select auth.uid()) or not public.social_is_blocked((select auth.uid()), user_id)));
create policy "reactions_insert_own" on public.reactions for insert to authenticated
  with check (user_id = (select auth.uid()) and public.social_can_view_reaction_target(target_type, target_id)
              and case target_type
                when 'post' then not public.social_is_blocked((select auth.uid()), public.social_post_author(target_id))
                when 'comment' then not public.social_is_blocked((select auth.uid()), public.social_comment_author(target_id))
                else false
              end);
create policy "reactions_update_own" on public.reactions for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.social_can_view_reaction_target(target_type, target_id));
create policy "reactions_delete_own" on public.reactions for delete to authenticated using (user_id = (select auth.uid()));

create policy "comments_select_visible" on public.comments for select to authenticated
  using (public.social_can_view_post(post_id) and (author_id = (select auth.uid()) or (removed_at is null and not public.social_is_blocked((select auth.uid()), author_id) and not public.acct_hidden(author_id))));
create policy "comments_insert_own" on public.comments for insert to authenticated
  with check (author_id = (select auth.uid()) and public.social_can_view_post(post_id)
              and not public.social_is_blocked((select auth.uid()), public.social_post_author(post_id)));
-- delete: your own comment, or any comment on your post
create policy "comments_delete_own_or_post_owner" on public.comments for delete to authenticated
  using (author_id = (select auth.uid()) or public.social_post_author(post_id) = (select auth.uid()));

create policy "saves_select_own" on public.saves for select to authenticated using (user_id = (select auth.uid()));
create policy "saves_insert_own" on public.saves for insert to authenticated
  with check (user_id = (select auth.uid()) and public.social_can_view_post(post_id));
create policy "saves_delete_own" on public.saves for delete to authenticated using (user_id = (select auth.uid()));

create policy "hidden_posts_select_own" on public.hidden_posts for select to authenticated using (user_id = (select auth.uid()));
create policy "hidden_posts_insert_own" on public.hidden_posts for insert to authenticated with check (user_id = (select auth.uid()));
create policy "hidden_posts_delete_own" on public.hidden_posts for delete to authenticated using (user_id = (select auth.uid()));

create policy "reports_insert_own" on public.reports for insert to authenticated
  with check (reporter_id = (select auth.uid()) and public.social_is_member((select auth.uid())));
create policy "reports_select_own" on public.reports for select to authenticated using (reporter_id = (select auth.uid()));

create policy "notifications_select_own" on public.notifications for select to authenticated
  using (user_id = (select auth.uid()) and not public.social_is_blocked((select auth.uid()), actor_id));
create policy "notifications_update_own" on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "notifications_delete_own" on public.notifications for delete to authenticated using (user_id = (select auth.uid()));

-- ---------- grants (column-level where clients may only touch some fields) ----------
revoke all on public.social_profiles, public.social_private, public.social_bans, public.friend_requests, public.friendships, public.blocks,
  public.posts, public.post_media, public.stories, public.likes, public.reactions, public.comments, public.saves, public.hidden_posts, public.reports, public.notifications from anon;
revoke all on public.social_profiles, public.social_private, public.social_bans, public.friend_requests, public.friendships, public.blocks,
  public.posts, public.post_media, public.stories, public.likes, public.reactions, public.comments, public.saves, public.hidden_posts, public.reports, public.notifications from authenticated;
grant select, delete on public.social_profiles to authenticated;
grant update (username, display_name, avatar_path, public_bio, privacy, show_stats, stats) on public.social_profiles to authenticated;
grant select on public.social_private, public.friend_requests, public.friendships, public.blocks to authenticated;
grant select, insert, delete on public.posts to authenticated;
grant update (body, audience) on public.posts to authenticated;
grant select, insert, delete on public.post_media, public.stories, public.likes, public.reactions, public.comments, public.saves, public.hidden_posts to authenticated;
grant update (kind) on public.reactions to authenticated;
grant select, insert on public.reports to authenticated;
grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

revoke execute on function public.social_create_profile(text, text, date, text, text), public.social_handle_available(text),
  public.social_send_request(uuid), public.social_cancel_request(uuid), public.social_respond_request(uuid, boolean),
  public.social_unfriend(uuid), public.social_block(uuid), public.social_unblock(uuid), public.social_my_blocks(), public.social_cleanup_expired() from public, anon;
grant execute on function public.social_create_profile(text, text, date, text, text), public.social_handle_available(text),
  public.social_send_request(uuid), public.social_cancel_request(uuid), public.social_respond_request(uuid, boolean),
  public.social_unfriend(uuid), public.social_block(uuid), public.social_unblock(uuid), public.social_my_blocks() to authenticated;
revoke execute on function public.social_cleanup_expired() from authenticated;

-- Optional live updates for the in-app notifications badge (Supabase Realtime respects RLS).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
    execute 'alter publication supabase_realtime add table public.notifications';
  end if;
end $$;

-- ---------- Storage: social-media bucket (post photos, story photos, public avatar copy) ----------
-- Private bucket; the app reads files with short-lived signed URLs, and the select policy below decides who may sign them:
-- the owner, or a member allowed to see the post / active story / profile (never across a block).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('social-media', 'social-media', false, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "social_media_select" on storage.objects;
drop policy if exists "social_media_insert_own" on storage.objects;
drop policy if exists "social_media_update_own" on storage.objects;
drop policy if exists "social_media_delete_own" on storage.objects;
create policy "social_media_select" on storage.objects for select to authenticated
  using (bucket_id = 'social-media' and public.social_can_view_object(name));
create policy "social_media_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'social-media' and (storage.foldername(name))[1] = (select auth.uid())::text and public.social_is_member((select auth.uid())));
create policy "social_media_update_own" on storage.objects for update to authenticated
  using (bucket_id = 'social-media' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'social-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "social_media_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'social-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Check: every social table should show rowsecurity = true, and the bucket must be private
select tablename, rowsecurity from pg_tables where schemaname = 'public' and tablename in
  ('social_profiles', 'social_private', 'social_bans', 'friend_requests', 'friendships', 'blocks', 'posts', 'post_media', 'stories', 'likes', 'reactions', 'comments', 'saves', 'hidden_posts', 'reports', 'notifications');
select id, public, file_size_limit from storage.buckets where id = 'social-media';

-- =====================================================================================================================
-- MESSAGES: private 1:1 chats, message requests and group chats (SETUP.md §12, APP-BUILDER-NOTES.md › "Messages").
-- Safe to re-run. Messages are stored in this database and protected by Row Level Security: only members of a
-- conversation can read it. This is NOT end-to-end encryption (the project owner / service role can read messages).
-- =====================================================================================================================

-- ---------- tables ----------
create table if not exists public.dm_settings (
  user_id          uuid primary key default auth.uid() references public.social_profiles (id) on delete cascade,
  who_can_message  text not null default 'everyone',     -- everyone | fof (friends of friends) | friends | none
  read_receipts    boolean not null default true,        -- reciprocal: off = others don't see yours, you don't see theirs
  show_activity    boolean not null default true,        -- "Active now" / typing; reciprocal like read receipts
  last_active_at   timestamptz,
  updated_at       timestamptz not null default now()
);
alter table public.dm_settings drop constraint if exists dm_settings_who_chk;
alter table public.dm_settings add constraint dm_settings_who_chk check (who_can_message in ('everyone', 'fof', 'friends', 'none'));

create table if not exists public.conversations (
  id               uuid primary key default gen_random_uuid(),
  kind             text not null default 'direct',        -- direct | group
  title            text,                                  -- groups only
  created_by       uuid references public.social_profiles (id) on delete set null,
  direct_key       text,                                  -- "<smaller uuid>:<larger uuid>" for 1:1 chats (one chat per pair)
  created_at       timestamptz not null default now(),
  last_message_at  timestamptz
);
alter table public.conversations drop constraint if exists conversations_kind_chk;
alter table public.conversations add constraint conversations_kind_chk check (kind in ('direct', 'group'));
alter table public.conversations drop constraint if exists conversations_title_len;
alter table public.conversations add constraint conversations_title_len check (title is null or char_length(title) between 1 and 50);
alter table public.conversations drop constraint if exists conversations_direct_key_chk;
alter table public.conversations add constraint conversations_direct_key_chk check ((kind = 'direct') = (direct_key is not null));
create unique index if not exists conversations_direct_key_idx on public.conversations (direct_key) where direct_key is not null;

create table if not exists public.conversation_members (
  conversation_id    uuid not null references public.conversations (id) on delete cascade,
  user_id            uuid not null references public.social_profiles (id) on delete cascade,
  role               text not null default 'member',      -- admin | member (groups)
  state              text not null default 'active',      -- active | request (message request, not accepted yet) | declined | left | removed
  added_by           uuid references public.social_profiles (id) on delete set null,
  joined_at          timestamptz not null default now(),
  last_read_at       timestamptz,                         -- private; others only see it through dm_members().seen_at
  last_delivered_at  timestamptz,
  muted_until        timestamptz,
  archived           boolean not null default false,
  pinned_at          timestamptz,
  cleared_at         timestamptz,                         -- "delete chat" for me, and the join time of people added to a group later
  primary key (conversation_id, user_id)
);
alter table public.conversation_members drop constraint if exists conversation_members_role_chk;
alter table public.conversation_members add constraint conversation_members_role_chk check (role in ('admin', 'member'));
alter table public.conversation_members drop constraint if exists conversation_members_state_chk;
alter table public.conversation_members add constraint conversation_members_state_chk check (state in ('active', 'request', 'declined', 'left', 'removed'));
create index if not exists conversation_members_user_idx on public.conversation_members (user_id, state);

create table if not exists public.messages (
  id               uuid primary key default gen_random_uuid(),   -- the app sends its own UUID so offline retries can't duplicate
  conversation_id  uuid not null references public.conversations (id) on delete cascade,
  sender_id        uuid default auth.uid() references public.social_profiles (id) on delete set null,
  kind             text not null default 'text',          -- text | image | video | workout | system
  body             text not null default '',
  media            jsonb,                                 -- {path, w, h, mime, size, duration, poster_path} in the private message-media bucket
  workout          jsonb,                                 -- shared HYBRD workout / activity card
  meta             jsonb,                                 -- system events: {type, actor, targets, title}
  reply_to         uuid references public.messages (id) on delete set null,
  forwarded        boolean not null default false,
  created_at       timestamptz not null default now(),
  edited_at        timestamptz,
  deleted_at       timestamptz                            -- unsent for everyone (body + media wiped, placeholder stays)
);
alter table public.messages drop constraint if exists messages_kind_chk;
alter table public.messages add constraint messages_kind_chk check (kind in ('text', 'image', 'video', 'workout', 'system'));
alter table public.messages drop constraint if exists messages_body_len;
alter table public.messages add constraint messages_body_len check (char_length(body) <= 2000);
create index if not exists messages_conv_created_idx on public.messages (conversation_id, created_at desc);
create index if not exists messages_sender_created_idx on public.messages (sender_id, created_at desc);
alter table public.messages add column if not exists removed_at timestamptz;   -- moderator removal (v1.6): only the sender still sees it, with a notice

-- Restrict (v1.6): a softer step than blocking. Their new messages land in your Requests without a notification, and
-- they can't see when you've read their messages or when you're active. They aren't told.
create table if not exists public.dm_restricts (
  user_id        uuid not null default auth.uid() references public.social_profiles (id) on delete cascade,
  restricted_id  uuid not null references public.social_profiles (id) on delete cascade,
  created_at     timestamptz not null default now(),
  primary key (user_id, restricted_id)
);
alter table public.dm_restricts drop constraint if exists dm_restricts_not_self;
alter table public.dm_restricts add constraint dm_restricts_not_self check (user_id <> restricted_id);

create table if not exists public.message_reactions (
  message_id  uuid not null references public.messages (id) on delete cascade,
  user_id     uuid not null default auth.uid() references public.social_profiles (id) on delete cascade,
  kind        text not null,
  created_at  timestamptz not null default now(),
  primary key (message_id, user_id)
);
alter table public.message_reactions drop constraint if exists message_reactions_kind_chk;
alter table public.message_reactions add constraint message_reactions_kind_chk check (kind in ('like', 'love', 'haha', 'wow', 'sad', 'angry', 'dislike'));

-- "Delete for me": hides one message for one person.
create table if not exists public.message_hidden (
  message_id  uuid not null references public.messages (id) on delete cascade,
  user_id     uuid not null default auth.uid() references public.social_profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (message_id, user_id)
);

-- Moderation records. No foreign keys to the message / conversation so a report survives deletion; snapshot keeps the text.
create table if not exists public.message_reports (
  id               uuid primary key default gen_random_uuid(),
  reporter_id      uuid default auth.uid() references auth.users (id) on delete set null,
  target_type      text not null,                         -- message | conversation
  conversation_id  uuid not null,
  message_id       uuid,
  target_user_id   uuid references auth.users (id) on delete set null,
  reason           text not null,
  details          text,
  snapshot         jsonb,
  status           text not null default 'open',
  created_at       timestamptz not null default now(),
  reviewed_at      timestamptz,
  moderator_note   text
);
alter table public.message_reports drop constraint if exists message_reports_target_chk;
alter table public.message_reports add constraint message_reports_target_chk check (target_type in ('message', 'conversation', 'call'));
alter table public.message_reports add column if not exists message_ids uuid[];     -- several reported messages (v1.6), snapshotted below
alter table public.message_reports add column if not exists priority smallint not null default 2;
alter table public.message_reports drop constraint if exists message_reports_reason_chk;
alter table public.message_reports add constraint message_reports_reason_chk check (reason in ('spam', 'harassment', 'hate', 'sexual', 'minor', 'self_harm', 'impersonation', 'scam', 'violence', 'other',
  'nudity', 'misinformation', 'underage'));
alter table public.message_reports drop constraint if exists message_reports_status_chk;
alter table public.message_reports add constraint message_reports_status_chk check (status in ('open', 'reviewing', 'actioned', 'dismissed'));
alter table public.message_reports drop constraint if exists message_reports_details_len;
alter table public.message_reports add constraint message_reports_details_len check (details is null or char_length(details) <= 500);
create index if not exists message_reports_status_idx on public.message_reports (status, created_at);

-- Ready for push notifications later (Web Push / APNs / FCM tokens). Nothing writes here yet; owner-only.
create table if not exists public.push_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  platform      text not null,
  token         text not null,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz,
  unique (user_id, token)
);
alter table public.push_subscriptions drop constraint if exists push_subscriptions_platform_chk;
alter table public.push_subscriptions add constraint push_subscriptions_platform_chk check (platform in ('web', 'ios', 'android'));

-- ---------- helpers (SECURITY DEFINER: read past RLS, return small answers only) ----------
create or replace function public.dm_member_state(c uuid, u uuid) returns text
language sql stable security definer set search_path = '' as $$
  select m.state from public.conversation_members m where m.conversation_id = c and m.user_id = u
$$;
create or replace function public.dm_is_participant(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.dm_member_state(c, auth.uid()) in ('active', 'request'), false)
$$;
create or replace function public.dm_is_active(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.dm_member_state(c, auth.uid()) = 'active', false)
$$;
-- Can the signed-in user read a message sent at `at` in conversation `c`? (members only; not before they joined / cleared the chat)
create or replace function public.dm_can_read(c uuid, at timestamptz) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.conversation_members m where m.conversation_id = c and m.user_id = auth.uid()
                 and m.state in ('active', 'request') and (m.cleared_at is null or at > m.cleared_at))
$$;
create or replace function public.dm_can_read_message(mid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select public.dm_can_read(x.conversation_id, x.created_at) from public.messages x where x.id = mid), false)
$$;
create or replace function public.dm_who(u uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select s.who_can_message from public.dm_settings s where s.user_id = u),
                  case when coalesce((select p.is_minor from public.social_profiles p where p.id = u), false) then 'friends' else 'everyone' end)
$$;
create or replace function public.dm_receipts(u uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select s.read_receipts from public.dm_settings s where s.user_id = u), true)
$$;
create or replace function public.dm_activity(u uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select s.show_activity from public.dm_settings s where s.user_id = u), true)
$$;
-- Has `a` restricted `b`?
create or replace function public.dm_is_restricted(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.dm_restricts r where r.user_id = a and r.restricted_id = b)
$$;
create or replace function public.dm_is_minor(u uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.is_minor from public.social_profiles p where p.id = u), false)
$$;
create or replace function public.dm_is_fof(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.friendships f1 join public.friendships f2
      on (case when f1.user_a = a then f1.user_b else f1.user_a end) = (case when f2.user_a = b then f2.user_b else f2.user_a end)
    where (f1.user_a = a or f1.user_b = a) and (f2.user_a = b or f2.user_b = b))
$$;
-- May `me` start a 1:1 chat with `other`? 'ok' (straight to Chats), 'request' (lands in their Requests) or an error code.
-- Mirrors eligibility() in src/lib/messages.ts. Blocks are never revealed: both directions return dm_unavailable.
-- Under-18 safety: a minor and an adult can only chat while they are friends (checked again on every message).
create or replace function public.dm_minor_block(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.dm_is_minor(a) <> public.dm_is_minor(b) and not public.social_are_friends(a, b)
$$;
create or replace function public.dm_check(me uuid, other uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare fr boolean; who text;
begin
  if me = other then return 'dm_self'; end if;
  if not public.social_is_member(other) or public.social_is_blocked(me, other) or public.acct_hidden(other) then return 'dm_unavailable'; end if;
  if public.acct_hidden(me) then return 'acct_paused'; end if;
  if public.acct_msg_restricted(me) then return 'acct_msg_restricted'; end if;
  fr := public.social_are_friends(me, other);
  if not fr and public.dm_is_minor(me) <> public.dm_is_minor(other) then return 'dm_minor'; end if;
  who := public.dm_who(other);
  if who = 'none' then return 'dm_no_one'; end if;
  if fr then return 'ok'; end if;
  if who = 'friends' then return 'dm_friends_only'; end if;
  if who = 'fof' and not public.dm_is_fof(me, other) then return 'dm_fof_only'; end if;
  return 'request';
end $$;
-- Group rule: you add your own friends; nobody blocked (either way) with a member; under-18s and adults only when friends.
create or replace function public.dm_check_add(adder uuid, u uuid, members uuid[]) returns text
language plpgsql stable security definer set search_path = '' as $$
declare m uuid;
begin
  if u = adder or u = any(members) then return 'dm_already_member'; end if;
  if not public.social_is_member(u) or not public.social_are_friends(adder, u) then return 'dm_friends_only'; end if;
  if public.dm_who(u) = 'none' then return 'dm_no_one'; end if;
  foreach m in array members loop
    if public.social_is_blocked(m, u) then return 'dm_unavailable'; end if;
    if public.dm_is_minor(m) <> public.dm_is_minor(u) and not public.social_are_friends(m, u) then return 'dm_minor'; end if;
  end loop;
  return null;
end $$;
create or replace function public.dm_system_message(c uuid, ev jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('hybrd.dm_system', '1', true);
  insert into public.messages (conversation_id, sender_id, kind, body, meta) values (c, auth.uid(), 'system', '', ev);
  perform set_config('hybrd.dm_system', '', true);
end $$;
create or replace function public.dm_uuid_or_null(s text) returns uuid
language plpgsql immutable as $$
begin return s::uuid; exception when others then return null; end $$;
-- Storage: who may read an object in the message-media bucket (<conversation id>/<sender id>/<file>)?
create or replace function public.dm_can_read_object(p_name text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare parts text[] := string_to_array(p_name, '/'); c uuid; owner uuid;
begin
  if auth.uid() is null or parts is null or array_length(parts, 1) < 3 then return false; end if;
  begin c := parts[1]::uuid; owner := parts[2]::uuid; exception when others then return false; end;
  if owner = auth.uid() and public.dm_is_participant(c) then return true; end if;
  return exists (select 1 from public.messages x where x.conversation_id = c and x.sender_id = owner and x.deleted_at is null and x.removed_at is null
                 and (x.media->>'path' = p_name or x.media->>'poster_path' = p_name) and public.dm_can_read(c, x.created_at));
end $$;
create or replace function public.dm_topic_ok(topic text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare c uuid;
begin
  if topic is null or topic not like 'dm:%' then return false; end if;
  begin c := substr(topic, 4)::uuid; exception when others then return false; end;
  return public.dm_is_active(c);
end $$;

-- ---------- triggers ----------
create or replace function public.messages_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare k text; other uuid; ostate text; n bigint;
begin
  new.sender_id := auth.uid(); new.created_at := now(); new.edited_at := null; new.deleted_at := null; new.removed_at := null;
  if new.kind = 'system' then
    if coalesce(current_setting('hybrd.dm_system', true), '') <> '1' then raise exception 'dm_system: not allowed' using errcode = 'P0001'; end if;
    return new;
  end if;
  if new.sender_id is null or public.dm_member_state(new.conversation_id, new.sender_id) is distinct from 'active' then
    raise exception 'dm_not_member: you are not in this chat' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.social_bans b where b.user_id = new.sender_id) then raise exception 'banned' using errcode = 'P0001'; end if;
  if public.acct_suspended(new.sender_id) then raise exception 'acct_suspended: your account is suspended' using errcode = 'P0001'; end if;
  if public.acct_paused(new.sender_id) then raise exception 'acct_paused: resume your account to send messages' using errcode = 'P0001'; end if;
  if public.acct_msg_restricted(new.sender_id) then raise exception 'acct_msg_restricted: sending messages is restricted on your account for now' using errcode = 'P0001'; end if;
  select c.kind into k from public.conversations c where c.id = new.conversation_id;
  if k = 'direct' then
    select m.user_id, m.state into other, ostate from public.conversation_members m where m.conversation_id = new.conversation_id and m.user_id <> new.sender_id limit 1;
    if other is not null and public.acct_hidden(other) then raise exception 'dm_unavailable: you can''t message this account right now' using errcode = 'P0001'; end if;
    if other is not null and public.social_is_blocked(new.sender_id, other) then raise exception 'dm_blocked: you can''t message this account' using errcode = 'P0001'; end if;
    if other is not null and public.dm_minor_block(new.sender_id, other) then raise exception 'dm_minor: under-18s and adults can only chat while they are friends' using errcode = 'P0001'; end if;
    if ostate in ('request', 'declined') then
      select count(*) into n from public.messages x where x.conversation_id = new.conversation_id and x.sender_id = new.sender_id and x.kind <> 'system';
      if n >= 3 then raise exception 'dm_request_limit: wait for them to accept your request' using errcode = 'P0001'; end if;
    end if;
  end if;
  perform public.social_rate_check((select count(*) from public.messages x where x.sender_id = new.sender_id and x.created_at > now() - interval '1 minute'), 30, 'messages a minute');
  perform public.social_rate_check((select count(*) from public.messages x where x.sender_id = new.sender_id and x.created_at > now() - interval '1 hour'), 400, 'messages an hour');
  if new.kind = 'text' and btrim(new.body) = '' then raise exception 'dm_empty: write something first' using errcode = 'P0001'; end if;
  if new.kind = 'workout' and new.workout is null then raise exception 'dm_invalid: workout missing' using errcode = 'P0001'; end if;
  if new.kind in ('image', 'video') then
    if new.media is null or coalesce(new.media->>'path', '') not like new.conversation_id::text || '/' || new.sender_id::text || '/%'
       or (new.media ? 'poster_path' and coalesce(new.media->>'poster_path', '') not like new.conversation_id::text || '/' || new.sender_id::text || '/%') then
      raise exception 'dm_media_path: media must be uploaded to this chat''s folder' using errcode = 'P0001';
    end if;
  else
    new.media := null;
  end if;
  if new.reply_to is not null and not exists (select 1 from public.messages x where x.id = new.reply_to and x.conversation_id = new.conversation_id) then new.reply_to := null; end if;
  new.meta := null;
  return new;
end $$;
drop trigger if exists messages_before_insert on public.messages;
create trigger messages_before_insert before insert on public.messages for each row execute function public.messages_before_insert();

create or replace function public.messages_after_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id and (last_message_at is null or last_message_at < new.created_at);
  update public.conversation_members set last_read_at = new.created_at, last_delivered_at = new.created_at, archived = false
   where conversation_id = new.conversation_id and user_id = new.sender_id;
  return new;
end $$;
drop trigger if exists messages_after_insert on public.messages;
create trigger messages_after_insert after insert on public.messages for each row execute function public.messages_after_insert();

-- Only the sender may change a message (RLS); only the text within 15 minutes, or unsend (deleted_at). Everything else is frozen.
create or replace function public.messages_before_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then return new; end if;   -- service role / maintenance
  if old.deleted_at is not null then raise exception 'dm_deleted: this message was unsent' using errcode = 'P0001'; end if;
  new.conversation_id := old.conversation_id; new.sender_id := old.sender_id; new.kind := old.kind; new.created_at := old.created_at;
  new.reply_to := old.reply_to; new.forwarded := old.forwarded; new.meta := old.meta;
  if coalesce(current_setting('hybrd.mod', true), '') <> '1' then new.removed_at := old.removed_at; end if;
  if new.deleted_at is not null then
    if now() - old.created_at > interval '24 hours' then raise exception 'dm_unsend_window: messages can be unsent for 24 hours. Use Delete for me instead.' using errcode = 'P0001'; end if;
    new.deleted_at := now(); new.body := ''; new.media := null; new.workout := null; new.edited_at := old.edited_at;
    return new;
  end if;
  new.media := old.media; new.workout := old.workout;
  if new.body is distinct from old.body then
    if old.kind in ('system', 'workout') then raise exception 'dm_not_editable: this message can''t be edited' using errcode = 'P0001'; end if;
    if now() - old.created_at > interval '15 minutes' then raise exception 'dm_edit_window: messages can only be edited for 15 minutes' using errcode = 'P0001'; end if;
    if old.kind = 'text' and btrim(new.body) = '' then raise exception 'dm_empty: write something first' using errcode = 'P0001'; end if;
    new.edited_at := now();
  else
    new.edited_at := old.edited_at;
  end if;
  return new;
end $$;
drop trigger if exists messages_before_update on public.messages;
create trigger messages_before_update before update on public.messages for each row execute function public.messages_before_update();

create or replace function public.messages_after_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then delete from public.message_reactions where message_id = new.id; end if;
  return new;
end $$;
drop trigger if exists messages_after_update on public.messages;
create trigger messages_after_update after update on public.messages for each row execute function public.messages_after_update();

-- Members: read markers only move forward; at most 3 pinned chats.
create or replace function public.conversation_members_before_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then return new; end if;
  if new.last_read_at is distinct from old.last_read_at then new.last_read_at := greatest(old.last_read_at, least(new.last_read_at, now())); end if;
  if new.last_delivered_at is distinct from old.last_delivered_at then new.last_delivered_at := greatest(old.last_delivered_at, least(new.last_delivered_at, now())); end if;
  if new.pinned_at is not null and old.pinned_at is null then
    new.pinned_at := now();
    if (select count(*) from public.conversation_members m where m.user_id = new.user_id and m.pinned_at is not null and m.conversation_id <> new.conversation_id) >= 3 then
      raise exception 'dm_pins: you can pin up to 3 chats' using errcode = 'P0001';
    end if;
  end if;
  if new.cleared_at is distinct from old.cleared_at and new.cleared_at is not null then new.cleared_at := greatest(coalesce(old.cleared_at, new.cleared_at), least(new.cleared_at, now())); end if;
  return new;
end $$;
drop trigger if exists conversation_members_before_update on public.conversation_members;
create trigger conversation_members_before_update before update on public.conversation_members for each row execute function public.conversation_members_before_update();

create or replace function public.message_reactions_before() returns trigger
language plpgsql security definer set search_path = '' as $$
declare c uuid; s uuid; k text; d timestamptz;
begin
  new.user_id := auth.uid(); new.created_at := now();
  if tg_op = 'UPDATE' then new.message_id := old.message_id; end if;
  select x.conversation_id, x.sender_id, x.kind, x.deleted_at into c, s, k, d from public.messages x where x.id = new.message_id;
  if c is null or not public.dm_is_active(c) or not public.dm_can_read_message(new.message_id) then raise exception 'dm_not_member: you are not in this chat' using errcode = 'P0001'; end if;
  if k = 'system' or d is not null then raise exception 'dm_invalid: can''t react to this' using errcode = 'P0001'; end if;
  if s is not null and s <> new.user_id and public.social_is_blocked(new.user_id, s) then raise exception 'dm_blocked: can''t react to this' using errcode = 'P0001'; end if;
  if tg_op = 'INSERT' then
    perform public.social_rate_check((select count(*) from public.message_reactions r where r.user_id = new.user_id and r.created_at > now() - interval '1 hour'), 300, 'reactions an hour');
  end if;
  return new;
end $$;
drop trigger if exists message_reactions_before on public.message_reactions;
create trigger message_reactions_before before insert or update on public.message_reactions for each row execute function public.message_reactions_before();

create or replace function public.message_reports_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.reporter_id := auth.uid(); new.status := 'open'; new.created_at := now(); new.reviewed_at := null; new.moderator_note := null;
  if not public.dm_is_participant(new.conversation_id) then raise exception 'dm_not_member: you are not in this chat' using errcode = 'P0001'; end if;
  new.priority := public.report_priority(new.reason);
  perform public.social_rate_check((select count(*) from public.message_reports r where r.reporter_id = new.reporter_id and r.created_at > now() - interval '1 hour'), 10, 'reports an hour');
  perform public.social_rate_check((select count(*) from public.message_reports r where r.reporter_id = new.reporter_id and r.created_at > now() - interval '1 day'), 30, 'reports per day');
  if exists (select 1 from public.message_reports r where r.reporter_id = new.reporter_id and r.target_type = new.target_type
             and coalesce(r.message_id, r.conversation_id) = coalesce(new.message_id, new.conversation_id) and r.created_at > now() - interval '1 day') then
    raise exception 'report_duplicate: you already reported this' using errcode = 'P0001';
  end if;
  if new.target_type = 'message' and coalesce(array_length(new.message_ids, 1), 0) > 0 then
    -- several messages from the chat (up to 10), all attached as they are right now
    if array_length(new.message_ids, 1) > 10 then raise exception 'report_too_many: report up to 10 messages at once' using errcode = 'P0001'; end if;
    new.message_id := coalesce(new.message_id, new.message_ids[1]);
    select x.sender_id into new.target_user_id from public.messages x where x.id = new.message_id and x.conversation_id = new.conversation_id;
    select jsonb_build_object('messages', coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'sender_id', x.sender_id, 'body', x.body, 'kind', x.kind, 'media', x.media, 'workout', x.workout, 'created_at', x.created_at, 'edited_at', x.edited_at) order by x.created_at), '[]'::jsonb))
      into new.snapshot from public.messages x where x.id = any(new.message_ids) and x.conversation_id = new.conversation_id and public.dm_can_read(x.conversation_id, x.created_at);
    if new.target_user_id is null or jsonb_array_length(new.snapshot->'messages') = 0 then raise exception 'dm_not_found: message not found' using errcode = 'P0001'; end if;
  elsif new.target_type = 'message' then
    select x.sender_id, jsonb_build_object('body', x.body, 'kind', x.kind, 'media', x.media, 'workout', x.workout, 'created_at', x.created_at, 'edited_at', x.edited_at)
      into new.target_user_id, new.snapshot from public.messages x where x.id = new.message_id and x.conversation_id = new.conversation_id;
    if new.snapshot is null then raise exception 'dm_not_found: message not found' using errcode = 'P0001'; end if;
  else
    new.message_id := null;
    select m.user_id into new.target_user_id from public.conversation_members m join public.conversations c on c.id = m.conversation_id
     where m.conversation_id = new.conversation_id and c.kind = 'direct' and m.user_id <> new.reporter_id limit 1;
    -- context for moderators: the last 20 messages (text, media paths, who sent them)
    select jsonb_build_object('recent', coalesce(jsonb_agg(jsonb_build_object('sender_id', r.sender_id, 'kind', r.kind, 'body', r.body, 'media', r.media, 'created_at', r.created_at) order by r.created_at), '[]'::jsonb))
      into new.snapshot from (select * from public.messages x where x.conversation_id = new.conversation_id and x.kind <> 'system' order by x.created_at desc limit 20) r;
  end if;
  return new;
end $$;
drop trigger if exists message_reports_before_insert on public.message_reports;
create trigger message_reports_before_insert before insert on public.message_reports for each row execute function public.message_reports_before_insert();

create or replace function public.dm_settings_before() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null then new.user_id := auth.uid(); end if;
  new.updated_at := now();
  if tg_op = 'INSERT' and new.last_active_at is not null then new.last_active_at := now(); end if;
  return new;
end $$;
drop trigger if exists dm_settings_before on public.dm_settings;
create trigger dm_settings_before before insert or update on public.dm_settings for each row execute function public.dm_settings_before();

-- Becoming friends turns a pending message request between the two into a normal chat.
create or replace function public.friendships_dm_after() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.conversation_members m set state = 'active'
   from public.conversations c
   where c.id = m.conversation_id and c.direct_key = new.user_a::text || ':' || new.user_b::text and m.state = 'request';
  return new;
end $$;
drop trigger if exists friendships_dm_after on public.friendships;
create trigger friendships_dm_after after insert on public.friendships for each row execute function public.friendships_dm_after();

-- ---------- RPCs ----------
create or replace function public.dm_can_message(p_other uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := auth.uid(); cid uuid;
begin
  if me is null or not public.social_is_member(me) then return 'not_member'; end if;
  select c.id into cid from public.conversations c where c.direct_key = least(me, p_other)::text || ':' || greatest(me, p_other)::text;
  if public.social_is_member(p_other) and not public.social_is_blocked(me, p_other) and public.dm_minor_block(me, p_other) then return 'dm_minor'; end if;
  if cid is not null and not public.social_is_blocked(me, p_other) and public.dm_member_state(cid, p_other) = 'active'
     and exists (select 1 from public.messages x where x.conversation_id = cid) then return 'ok'; end if;
  return public.dm_check(me, p_other);
end $$;

create or replace function public.dm_open_direct(p_other uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); k text; cid uuid; v text;
begin
  if me is null or not public.social_is_member(me) then raise exception 'not_member' using errcode = 'P0001'; end if;
  if p_other = me then raise exception 'dm_self: that''s you' using errcode = 'P0001'; end if;
  if public.acct_hidden(me) then raise exception 'acct_paused: resume your account to message people' using errcode = 'P0001'; end if;
  if public.acct_hidden(p_other) then raise exception 'dm_unavailable: you can''t message this account right now' using errcode = 'P0001'; end if;
  k := least(me, p_other)::text || ':' || greatest(me, p_other)::text;
  select c.id into cid from public.conversations c where c.direct_key = k;
  if cid is not null then
    if public.social_is_blocked(me, p_other) then raise exception 'dm_unavailable: you can''t message this account' using errcode = 'P0001'; end if;
    if public.dm_minor_block(me, p_other) then raise exception 'dm_minor: not allowed' using errcode = 'P0001'; end if;
    if public.dm_member_state(cid, p_other) <> 'active' or not exists (select 1 from public.messages x where x.conversation_id = cid) then
      v := public.dm_check(me, p_other);
      if v not in ('ok', 'request') and public.dm_member_state(cid, me) <> 'request' then raise exception '%: not allowed', v using errcode = 'P0001'; end if;
    end if;
    -- opening a chat yourself = you're in it (accepts a pending request, un-hides a declined one)
    update public.conversation_members set state = 'active' where conversation_id = cid and user_id = me and state in ('request', 'declined');
    return cid;
  end if;
  v := public.dm_check(me, p_other);
  if v not in ('ok', 'request') then raise exception '%: not allowed', v using errcode = 'P0001'; end if;
  perform public.social_rate_check((select count(*) from public.conversations c where c.created_by = me and c.created_at > now() - interval '1 hour'), 20, 'new chats an hour');
  if v = 'request' then
    perform public.social_rate_check((select count(*) from public.conversation_members m join public.conversations c on c.id = m.conversation_id
      where m.added_by = me and m.state in ('request', 'declined') and c.created_at > now() - interval '1 day'), 30, 'message requests a day');
  end if;
  insert into public.conversations (kind, created_by, direct_key) values ('direct', me, k) on conflict (direct_key) where direct_key is not null do nothing returning id into cid;
  if cid is null then select c.id into cid from public.conversations c where c.direct_key = k; return cid; end if;
  insert into public.conversation_members (conversation_id, user_id, role, state, added_by, last_read_at) values
    (cid, me, 'member', 'active', me, now()),
    (cid, p_other, 'member', case when v = 'request' then 'request' else 'active' end, me, null);
  return cid;
end $$;

create or replace function public.dm_create_group(p_title text, p_members uuid[]) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); cid uuid; u uuid; added uuid[] := '{}'; t text := btrim(regexp_replace(coalesce(p_title, ''), '\s+', ' ', 'g')); err text;
begin
  if me is null or not public.social_is_member(me) then raise exception 'not_member' using errcode = 'P0001'; end if;
  if t = '' or char_length(t) > 50 then raise exception 'dm_title: give the group a name (up to 50 characters)' using errcode = 'P0001'; end if;
  if coalesce(array_length(p_members, 1), 0) = 0 then raise exception 'dm_empty: add at least one friend' using errcode = 'P0001'; end if;
  if (select count(distinct x) from unnest(p_members) x where x <> me) + 1 > 32 then raise exception 'dm_group_full: groups can have up to 32 people' using errcode = 'P0001'; end if;
  perform public.social_rate_check((select count(*) from public.conversations c where c.created_by = me and c.kind = 'group' and c.created_at > now() - interval '1 day'), 20, 'new groups a day');
  foreach u in array p_members loop
    continue when u = me or u = any(added);
    err := public.dm_check_add(me, u, array_prepend(me, added));
    if err is not null then raise exception '%: % can''t be added', err, u using errcode = 'P0001'; end if;
    added := added || u;
  end loop;
  insert into public.conversations (kind, title, created_by) values ('group', t, me) returning id into cid;
  insert into public.conversation_members (conversation_id, user_id, role, state, added_by, last_read_at) values (cid, me, 'admin', 'active', me, now());
  insert into public.conversation_members (conversation_id, user_id, role, state, added_by) select cid, x, 'member', 'active', me from unnest(added) x;
  perform public.dm_system_message(cid, jsonb_build_object('type', 'created', 'actor', me, 'title', t));
  perform public.dm_system_message(cid, jsonb_build_object('type', 'added', 'actor', me, 'targets', to_jsonb(added)));
  return cid;
end $$;

create or replace function public.dm_add_members(p_conv uuid, p_members uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); u uuid; cur uuid[]; added uuid[] := '{}'; err text;
begin
  if (select kind from public.conversations where id = p_conv) is distinct from 'group' or public.dm_member_state(p_conv, me) is distinct from 'active' then raise exception 'dm_not_member' using errcode = 'P0001'; end if;
  select array_agg(user_id) into cur from public.conversation_members where conversation_id = p_conv and state = 'active';
  foreach u in array p_members loop
    continue when u = any(cur) or u = any(added);
    err := public.dm_check_add(me, u, cur || added);
    if err is not null then raise exception '%: % can''t be added', err, u using errcode = 'P0001'; end if;
    added := added || u;
  end loop;
  if coalesce(array_length(cur, 1), 0) + coalesce(array_length(added, 1), 0) > 32 then raise exception 'dm_group_full: groups can have up to 32 people' using errcode = 'P0001'; end if;
  if coalesce(array_length(added, 1), 0) = 0 then return; end if;
  -- new members see the chat from the moment they join (cleared_at), not the history before
  insert into public.conversation_members (conversation_id, user_id, role, state, added_by, joined_at, cleared_at)
    select p_conv, x, 'member', 'active', me, now(), now() - interval '1 microsecond' from unnest(added) x
    on conflict (conversation_id, user_id) do update set state = 'active', role = 'member', added_by = me, joined_at = now(), cleared_at = now() - interval '1 microsecond', pinned_at = null, archived = false;
  perform public.dm_system_message(p_conv, jsonb_build_object('type', 'added', 'actor', me, 'targets', to_jsonb(added)));
end $$;

create or replace function public.dm_remove_member(p_conv uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if (select role from public.conversation_members where conversation_id = p_conv and user_id = me and state = 'active') is distinct from 'admin'
     or (select kind from public.conversations where id = p_conv) <> 'group' then raise exception 'dm_not_admin: only group admins can remove people' using errcode = 'P0001'; end if;
  if p_user = me then raise exception 'dm_self: use leave instead' using errcode = 'P0001'; end if;
  update public.conversation_members set state = 'removed', role = 'member' where conversation_id = p_conv and user_id = p_user and state = 'active';
  if found then perform public.dm_system_message(p_conv, jsonb_build_object('type', 'removed', 'actor', me, 'targets', jsonb_build_array(p_user))); end if;
end $$;

create or replace function public.dm_set_admin(p_conv uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if (select role from public.conversation_members where conversation_id = p_conv and user_id = me and state = 'active') is distinct from 'admin' then raise exception 'dm_not_admin' using errcode = 'P0001'; end if;
  update public.conversation_members set role = 'admin' where conversation_id = p_conv and user_id = p_user and state = 'active' and role <> 'admin';
  if found then perform public.dm_system_message(p_conv, jsonb_build_object('type', 'admin', 'actor', me, 'targets', jsonb_build_array(p_user))); end if;
end $$;

create or replace function public.dm_rename_group(p_conv uuid, p_title text) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); t text := btrim(regexp_replace(coalesce(p_title, ''), '\s+', ' ', 'g'));
begin
  if (select role from public.conversation_members where conversation_id = p_conv and user_id = me and state = 'active') is distinct from 'admin' then raise exception 'dm_not_admin: only group admins can rename the group' using errcode = 'P0001'; end if;
  if t = '' or char_length(t) > 50 then raise exception 'dm_title: give the group a name (up to 50 characters)' using errcode = 'P0001'; end if;
  update public.conversations set title = t where id = p_conv and kind = 'group';
  perform public.dm_system_message(p_conv, jsonb_build_object('type', 'renamed', 'actor', me, 'title', t));
end $$;

create or replace function public.dm_leave(p_conv uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); nxt uuid;
begin
  if (select kind from public.conversations where id = p_conv) is distinct from 'group' or public.dm_member_state(p_conv, me) is distinct from 'active' then raise exception 'dm_not_member' using errcode = 'P0001'; end if;
  perform public.dm_system_message(p_conv, jsonb_build_object('type', 'left', 'actor', me));
  update public.conversation_members set state = 'left', role = 'member', pinned_at = null where conversation_id = p_conv and user_id = me;
  if not exists (select 1 from public.conversation_members where conversation_id = p_conv and state = 'active' and role = 'admin') then
    select user_id into nxt from public.conversation_members where conversation_id = p_conv and state = 'active' order by joined_at, user_id limit 1;
    if nxt is not null then update public.conversation_members set role = 'admin' where conversation_id = p_conv and user_id = nxt; end if;
  end if;
end $$;

create or replace function public.dm_accept(p_conv uuid) returns void
language sql security definer set search_path = '' as $$
  update public.conversation_members set state = 'active', last_read_at = now(), last_delivered_at = now() where conversation_id = p_conv and user_id = auth.uid() and state = 'request';
$$;
create or replace function public.dm_decline(p_conv uuid) returns void
language sql security definer set search_path = '' as $$
  update public.conversation_members set state = 'declined', pinned_at = null where conversation_id = p_conv and user_id = auth.uid() and state = 'request';
$$;
create or replace function public.dm_mark_read(p_conv uuid) returns void
language sql security definer set search_path = '' as $$
  update public.conversation_members set last_read_at = now(), last_delivered_at = now() where conversation_id = p_conv and user_id = auth.uid() and state in ('active', 'request');
$$;
create or replace function public.dm_mark_delivered() returns void
language sql security definer set search_path = '' as $$
  update public.conversation_members m set last_delivered_at = now() from public.conversations c
   where c.id = m.conversation_id and m.user_id = auth.uid() and m.state = 'active' and c.last_message_at > coalesce(m.last_delivered_at, '-infinity');
$$;
create or replace function public.dm_heartbeat() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.social_is_member(auth.uid()) then return; end if;
  insert into public.dm_settings (user_id, who_can_message, last_active_at)
  values (auth.uid(), case when public.dm_is_minor(auth.uid()) then 'friends' else 'everyone' end, now())
  on conflict (user_id) do update set last_active_at = now();
end $$;

-- Members of a chat as the caller may see them: requests that were declined still look pending to the sender, and
-- seen_at is only shared when both people have read receipts on (and never before a request is accepted).
create or replace function public.dm_members(p_conv uuid) returns table (user_id uuid, role text, state text, joined_at timestamptz, seen_at timestamptz, delivered_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select m.user_id, m.role,
         case when m.state = 'declined' and m.user_id <> auth.uid() then 'request' else m.state end,
         m.joined_at,
         case when m.user_id = auth.uid() then m.last_read_at
              when m.state = 'active' and public.dm_receipts(auth.uid()) and public.dm_receipts(m.user_id) and not public.dm_is_restricted(m.user_id, auth.uid()) then m.last_read_at end,
         case when m.user_id = auth.uid() or m.state = 'active' then m.last_delivered_at end
  from public.conversation_members m
  where m.conversation_id = p_conv and public.dm_is_participant(p_conv) and m.state in ('active', 'request', 'declined')
$$;

-- One call for the inbox: my memberships with unread counts, the visible members and the last visible message.
create or replace function public.dm_inbox() returns table (
  conversation_id uuid, kind text, title text, created_by uuid, created_at timestamptz, last_message_at timestamptz,
  role text, state text, last_read_at timestamptz, muted_until timestamptz, archived boolean, pinned_at timestamptz, cleared_at timestamptz,
  unread bigint, requests_sent bigint, members jsonb, last_message jsonb)
language sql stable security definer set search_path = '' as $$
  select c.id, c.kind, c.title, c.created_by, c.created_at, c.last_message_at,
         me.role, me.state, me.last_read_at, me.muted_until, me.archived, me.pinned_at, me.cleared_at,
         (select count(*) from public.messages x where x.conversation_id = c.id and x.sender_id is distinct from me.user_id and x.kind <> 'system' and x.deleted_at is null and x.removed_at is null
            and x.created_at > greatest(coalesce(me.last_read_at, '-infinity'), coalesce(me.cleared_at, '-infinity'))
            and not exists (select 1 from public.message_hidden h where h.message_id = x.id and h.user_id = me.user_id)),
         (select count(*) from public.messages x where x.conversation_id = c.id and x.sender_id = me.user_id and x.kind <> 'system'),
         (select coalesce(jsonb_agg(to_jsonb(dm) order by dm.joined_at), '[]'::jsonb) from public.dm_members(c.id) dm),
         (select to_jsonb(l) from (select x.id, x.sender_id, x.kind, x.body, x.media, x.workout, x.meta, x.created_at, x.edited_at, x.deleted_at
            from public.messages x where x.conversation_id = c.id and x.created_at > coalesce(me.cleared_at, '-infinity')
              and (x.removed_at is null or x.sender_id = me.user_id)
              and not exists (select 1 from public.message_hidden h where h.message_id = x.id and h.user_id = me.user_id)
            order by x.created_at desc limit 1) l)
  from public.conversation_members me join public.conversations c on c.id = me.conversation_id
  where me.user_id = auth.uid() and me.state in ('active', 'request')
  order by c.last_message_at desc nulls last
$$;

-- "Active now": only between people who share a chat, both with activity status on, never across a block.
create or replace function public.dm_presence(p_users uuid[]) returns table (user_id uuid, last_active_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select s.user_id, s.last_active_at from public.dm_settings s
  where s.user_id = any(p_users) and s.show_activity and public.dm_activity(auth.uid()) and not public.social_is_blocked(auth.uid(), s.user_id)
    and not public.dm_is_restricted(s.user_id, auth.uid()) and not public.acct_hidden(s.user_id)
    and exists (select 1 from public.conversation_members a join public.conversation_members b on a.conversation_id = b.conversation_id
                where a.user_id = auth.uid() and b.user_id = s.user_id and a.state = 'active' and b.state = 'active')
$$;

-- ---------- Row Level Security ----------
alter table public.dm_settings          enable row level security;
alter table public.conversations        enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages             enable row level security;
alter table public.message_reactions    enable row level security;
alter table public.message_hidden       enable row level security;
alter table public.message_reports      enable row level security;
alter table public.push_subscriptions   enable row level security;

do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public' and tablename in
    ('dm_settings', 'conversations', 'conversation_members', 'messages', 'message_reactions', 'message_hidden', 'message_reports', 'push_subscriptions')
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

create policy "dm_settings_select_own" on public.dm_settings for select to authenticated using (user_id = (select auth.uid()));
create policy "dm_settings_insert_own" on public.dm_settings for insert to authenticated with check (user_id = (select auth.uid()) and public.social_is_member((select auth.uid())));
create policy "dm_settings_update_own" on public.dm_settings for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- conversations + members: created and changed only through the dm_* functions above
create policy "conversations_select_member" on public.conversations for select to authenticated using (public.dm_is_participant(id));
create policy "conversation_members_select_own" on public.conversation_members for select to authenticated using (user_id = (select auth.uid()));
create policy "conversation_members_update_own" on public.conversation_members for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "messages_select_member" on public.messages for select to authenticated
  using (public.dm_can_read(conversation_id, created_at) and (removed_at is null or sender_id = (select auth.uid())));
create policy "messages_insert_member" on public.messages for insert to authenticated
  with check (sender_id = (select auth.uid()) and kind <> 'system' and public.dm_member_state(conversation_id, (select auth.uid())) = 'active');
create policy "messages_update_sender" on public.messages for update to authenticated
  using (sender_id = (select auth.uid())) with check (sender_id = (select auth.uid()));

create policy "message_reactions_select_member" on public.message_reactions for select to authenticated
  using (public.dm_can_read_message(message_id) and (user_id = (select auth.uid()) or not public.social_is_blocked((select auth.uid()), user_id)));
create policy "message_reactions_insert_own" on public.message_reactions for insert to authenticated with check (user_id = (select auth.uid()));
create policy "message_reactions_update_own" on public.message_reactions for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "message_reactions_delete_own" on public.message_reactions for delete to authenticated using (user_id = (select auth.uid()));

create policy "message_hidden_select_own" on public.message_hidden for select to authenticated using (user_id = (select auth.uid()));
create policy "message_hidden_insert_own" on public.message_hidden for insert to authenticated with check (user_id = (select auth.uid()) and public.dm_can_read_message(message_id));
create policy "message_hidden_delete_own" on public.message_hidden for delete to authenticated using (user_id = (select auth.uid()));

-- reports: insert only (moderators read them in the dashboard / with the service role)
create policy "message_reports_insert_own" on public.message_reports for insert to authenticated with check (reporter_id = (select auth.uid()));

create policy "push_subscriptions_own" on public.push_subscriptions for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------- grants ----------
revoke all on public.dm_settings, public.conversations, public.conversation_members, public.messages, public.message_reactions,
  public.message_hidden, public.message_reports, public.push_subscriptions from anon;
revoke all on public.dm_settings, public.conversations, public.conversation_members, public.messages, public.message_reactions,
  public.message_hidden, public.message_reports, public.push_subscriptions from authenticated;
grant select, insert on public.dm_settings to authenticated;
grant update (who_can_message, read_receipts, show_activity) on public.dm_settings to authenticated;
grant select on public.conversations to authenticated;
grant select on public.conversation_members to authenticated;
grant update (last_read_at, last_delivered_at, muted_until, archived, pinned_at, cleared_at) on public.conversation_members to authenticated;
grant select, insert on public.messages to authenticated;
grant update (body, deleted_at) on public.messages to authenticated;
grant select, insert, delete on public.message_reactions, public.message_hidden to authenticated;
grant update (kind) on public.message_reactions to authenticated;
grant insert on public.message_reports to authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

revoke execute on function public.dm_can_message(uuid), public.dm_open_direct(uuid), public.dm_create_group(text, uuid[]), public.dm_add_members(uuid, uuid[]),
  public.dm_remove_member(uuid, uuid), public.dm_set_admin(uuid, uuid), public.dm_rename_group(uuid, text), public.dm_leave(uuid), public.dm_accept(uuid),
  public.dm_decline(uuid), public.dm_mark_read(uuid), public.dm_mark_delivered(), public.dm_heartbeat(), public.dm_members(uuid), public.dm_inbox(),
  public.dm_presence(uuid[]), public.dm_system_message(uuid, jsonb), public.dm_check(uuid, uuid), public.dm_check_add(uuid, uuid, uuid[]) from public, anon;
grant execute on function public.dm_can_message(uuid), public.dm_open_direct(uuid), public.dm_create_group(text, uuid[]), public.dm_add_members(uuid, uuid[]),
  public.dm_remove_member(uuid, uuid), public.dm_set_admin(uuid, uuid), public.dm_rename_group(uuid, text), public.dm_leave(uuid), public.dm_accept(uuid),
  public.dm_decline(uuid), public.dm_mark_read(uuid), public.dm_mark_delivered(), public.dm_heartbeat(), public.dm_members(uuid), public.dm_inbox(),
  public.dm_presence(uuid[]) to authenticated;
revoke execute on function public.dm_system_message(uuid, jsonb), public.dm_check(uuid, uuid), public.dm_check_add(uuid, uuid, uuid[]) from authenticated;
-- settings lookups are only used inside the functions above (never let clients read someone else's settings)
revoke execute on function public.dm_who(uuid), public.dm_receipts(uuid), public.dm_activity(uuid), public.dm_is_minor(uuid), public.dm_is_fof(uuid, uuid), public.dm_minor_block(uuid, uuid) from public, anon, authenticated;

-- ---------- Realtime ----------
-- New messages, edits/unsends, reactions and my membership changes stream to the app (Realtime applies the RLS above).
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['messages', 'message_reactions', 'conversation_members'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
-- Typing indicators + "seen" pings use Realtime Broadcast on private channels named dm:<conversation id>; only active members may join.
do $$
begin
  if to_regclass('realtime.messages') is not null then
    execute 'drop policy if exists "dm_broadcast_read" on realtime.messages';
    execute 'drop policy if exists "dm_broadcast_write" on realtime.messages';
    execute $p$create policy "dm_broadcast_read" on realtime.messages for select to authenticated using (public.dm_topic_ok(realtime.topic()))$p$;
    execute $p$create policy "dm_broadcast_write" on realtime.messages for insert to authenticated with check (public.dm_topic_ok(realtime.topic()))$p$;
  end if;
end $$;

-- ---------- Storage: message-media bucket (photos + videos sent in chats) ----------
-- Private. Path: <conversation id>/<sender id>/<message id>.<ext>. Readable only by members who can read the message that uses it.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('message-media', 'message-media', false, 52428800, array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "message_media_select" on storage.objects;
drop policy if exists "message_media_insert_member" on storage.objects;
drop policy if exists "message_media_delete_own" on storage.objects;
create policy "message_media_select" on storage.objects for select to authenticated
  using (bucket_id = 'message-media' and public.dm_can_read_object(name));
create policy "message_media_insert_member" on storage.objects for insert to authenticated
  with check (bucket_id = 'message-media' and (storage.foldername(name))[2] = (select auth.uid())::text
              and public.dm_is_active(public.dm_uuid_or_null((storage.foldername(name))[1])));
create policy "message_media_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'message-media' and (storage.foldername(name))[2] = (select auth.uid())::text);

-- Check: every Messages table should show rowsecurity = true, and the bucket must be private
select tablename, rowsecurity from pg_tables where schemaname = 'public' and tablename in
  ('dm_settings', 'conversations', 'conversation_members', 'messages', 'message_reactions', 'message_hidden', 'message_reports', 'push_subscriptions');
select id, public, file_size_limit from storage.buckets where id = 'message-media';


-- =====================================================================================================================
-- CALLS (voice + video calls inside Messages)
-- Safe to re-run. Audio/video never touch this database: they go peer to peer between browsers (WebRTC, encrypted
-- with DTLS-SRTP), through a TURN relay only when a network needs one. This section stores who called whom and when
-- (call history + the call card in the chat), decides who is ALLOWED to call (same people who can message you; never
-- message requests or blocked accounts; under-18s only friends; "Who can call me"; Do not disturb), and authorizes
-- the private Realtime channel `call:<id>` the browsers use to exchange connection details (signaling).
-- =====================================================================================================================

-- ---------- settings (added to the Messages settings row) ----------
alter table public.dm_settings add column if not exists who_can_call text not null default 'everyone';   -- everyone (people you chat with) | friends | none
alter table public.dm_settings add column if not exists dnd_until timestamptz;                             -- Do not disturb until (calls don't ring; callers just see "No answer")
alter table public.dm_settings drop constraint if exists dm_settings_call_chk;
alter table public.dm_settings add constraint dm_settings_call_chk check (who_can_call in ('everyone', 'friends', 'none'));

-- ---------- tables ----------
create table if not exists public.calls (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.conversations (id) on delete cascade,
  caller_id        uuid references public.social_profiles (id) on delete set null,
  kind             text not null default 'voice',          -- voice | video (how it started; people can switch on cameras later)
  status           text not null default 'ringing',        -- ringing | active | ended | missed | declined | canceled | busy | failed
  is_group         boolean not null default false,
  created_at       timestamptz not null default now(),
  answered_at      timestamptz,
  ended_at         timestamptz,
  end_reason       text,
  logged           boolean not null default false          -- the call card has been posted into the chat
);
alter table public.calls drop constraint if exists calls_kind_chk;
alter table public.calls add constraint calls_kind_chk check (kind in ('voice', 'video'));
alter table public.calls drop constraint if exists calls_status_chk;
alter table public.calls add constraint calls_status_chk check (status in ('ringing', 'active', 'ended', 'missed', 'declined', 'canceled', 'busy', 'unavailable', 'failed'));
create index if not exists calls_conversation_idx on public.calls (conversation_id, created_at desc);
create index if not exists calls_live_idx on public.calls (conversation_id) where status in ('ringing', 'active');
create index if not exists calls_caller_idx on public.calls (caller_id, created_at desc);

create table if not exists public.call_participants (
  call_id          uuid not null references public.calls (id) on delete cascade,
  user_id          uuid not null references public.social_profiles (id) on delete cascade,
  state            text not null default 'ringing',        -- ringing | joined | left | declined | missed | busy
  quiet            boolean not null default false,         -- Do not disturb was on: never rings, and nobody else can tell (not readable by the app)
  invited_at       timestamptz not null default now(),
  joined_at        timestamptz,
  left_at          timestamptz,
  last_seen_at     timestamptz not null default now(),     -- heartbeat while ringing / in the call
  hidden           boolean not null default false,         -- removed from my Calls tab
  primary key (call_id, user_id)
);
alter table public.call_participants drop constraint if exists call_participants_state_chk;
alter table public.call_participants add constraint call_participants_state_chk check (state in ('ringing', 'joined', 'left', 'declined', 'missed', 'busy', 'unavailable'));
create index if not exists call_participants_user_idx on public.call_participants (user_id, state);

-- ---------- helpers (SECURITY DEFINER, not callable from the app) ----------
create or replace function public.call_who(u uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case when public.dm_is_minor(u) and w = 'everyone' then 'friends' else w end
    from (select coalesce((select s.who_can_call from public.dm_settings s where s.user_id = u),
                          case when public.dm_is_minor(u) then 'friends' else 'everyone' end) as w) x
$$;
create or replace function public.call_dnd(u uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select s.dnd_until > now() from public.dm_settings s where s.user_id = u), false)
$$;
-- May `me` ring `other`? 'ok' or an error code. Mirrors pairCallCheck() in src/lib/calls.ts. Blocks are never revealed.
-- Under-18 safety (stricter than messages): anyone under 18 only calls / is called by friends.
create or replace function public.call_check(me uuid, other uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare fr boolean; who text;
begin
  if me = other then return 'call_self'; end if;
  if not public.social_is_member(other) or public.social_is_blocked(me, other) or public.acct_hidden(other) or public.dm_is_restricted(other, me) then return 'call_unavailable'; end if;
  if public.acct_hidden(me) or public.acct_msg_restricted(me) then return 'call_restricted'; end if;
  fr := public.social_are_friends(me, other);
  if not fr and (public.dm_is_minor(me) or public.dm_is_minor(other)) then return 'call_minor'; end if;
  who := public.call_who(other);
  if who = 'none' then return 'call_no_one'; end if;
  if who = 'friends' and not fr then return 'call_friends_only'; end if;
  return 'ok';
end $$;
create or replace function public.call_my_state(c uuid) returns text
language sql stable security definer set search_path = '' as $$
  select p.state from public.call_participants p where p.call_id = c and p.user_id = auth.uid()
$$;
create or replace function public.call_is_participant(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.call_participants p where p.call_id = c and p.user_id = auth.uid())
$$;
-- Is `u` in another live call right now?
create or replace function public.call_busy(u uuid, except_call uuid default null) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.call_participants p join public.calls c on c.id = p.call_id
                 where p.user_id = u and p.state = 'joined' and c.status in ('ringing', 'active')
                   and c.id is distinct from except_call and p.last_seen_at > now() - interval '90 seconds')
$$;
-- Post the call card into the chat, once.
create or replace function public.call_log(cid uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.calls; dur integer; ppl integer;
begin
  update public.calls set logged = true where id = cid and not logged returning * into c;
  if not found then return; end if;
  dur := case when c.answered_at is not null and c.ended_at is not null then greatest(1, round(extract(epoch from (c.ended_at - c.answered_at)))::integer) end;
  select count(*) into ppl from public.call_participants p where p.call_id = cid and p.joined_at is not null;
  perform public.dm_system_message(c.conversation_id, jsonb_build_object('type', 'call', 'actor', c.caller_id, 'call',
    jsonb_strip_nulls(jsonb_build_object('id', c.id, 'kind', c.kind, 'status', c.status, 'durationSec', dur, 'people', case when c.is_group then ppl end))));
end $$;
-- Finish a call: final status, everyone still ringing → missed, everyone in it → left, then the chat card.
create or replace function public.call_finish(cid uuid, st text, reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.calls set status = st, ended_at = now(), end_reason = coalesce(reason, end_reason) where id = cid and status in ('ringing', 'active');
  if not found then return; end if;
  update public.call_participants set state = 'missed' where call_id = cid and state = 'ringing';
  update public.call_participants set state = 'left', left_at = now() where call_id = cid and state = 'joined';
  perform public.call_log(cid);
end $$;
-- Tidy my calls that nobody closed (app killed, phone died): ringing > 60 s → missed; no heartbeat for 90 s → ended.
create or replace function public.call_cleanup() returns void
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in select c.id, c.status, c.answered_at from public.calls c join public.call_participants p on p.call_id = c.id and p.user_id = auth.uid()
           where c.status in ('ringing', 'active') loop
    if r.status = 'ringing' and exists (select 1 from public.calls c where c.id = r.id and c.created_at < now() - interval '60 seconds') then
      perform public.call_finish(r.id, 'missed', 'timeout');
    elsif r.status = 'active' then
      update public.call_participants set state = 'missed' where call_id = r.id and state = 'ringing' and invited_at < now() - interval '60 seconds';
      update public.call_participants set state = 'left', left_at = now() where call_id = r.id and state = 'joined' and last_seen_at < now() - interval '90 seconds';
      if (select count(*) from public.call_participants p where p.call_id = r.id and p.state = 'joined') < 2
         and not exists (select 1 from public.call_participants p where p.call_id = r.id and p.state = 'ringing') then
        perform public.call_finish(r.id, 'ended', 'stale');
      end if;
    end if;
  end loop;
end $$;
-- Realtime: may the signed-in user use the private channel `call:<id>`? Only people who have joined that live call.
create or replace function public.call_topic_ok(topic text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare c uuid;
begin
  if topic is null or topic not like 'call:%' then return false; end if;
  begin c := substr(topic, 6)::uuid; exception when others then return false; end;
  return exists (select 1 from public.call_participants p join public.calls x on x.id = p.call_id
                 where p.call_id = c and p.user_id = auth.uid() and p.state = 'joined' and x.status in ('ringing', 'active'));
end $$;

-- ---------- RPCs ----------
-- Start (or join) a call in a chat. Returns {id, status: ringing | busy | join, ringing: [user ids being rung]}.
create or replace function public.call_start(p_conv uuid, p_kind text default 'voice') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); k text; mystate text; cid uuid; ex public.calls; u uuid; ust text; chk text; st text; ring uuid[] := '{}'; n integer := 0; n_busy integer := 0;
begin
  if me is null or not public.social_is_member(me) then raise exception 'call_not_member: sign in first' using errcode = 'P0001'; end if;
  if exists (select 1 from public.social_bans b where b.user_id = me) then raise exception 'banned' using errcode = 'P0001'; end if;
  if p_kind not in ('voice', 'video') then raise exception 'call_invalid: kind' using errcode = 'P0001'; end if;
  mystate := public.dm_member_state(p_conv, me);
  if mystate = 'request' then raise exception 'call_request: accept the message request before calling' using errcode = 'P0001'; end if;
  if mystate is distinct from 'active' then raise exception 'call_not_member: you are not in this chat' using errcode = 'P0001'; end if;
  select c.kind into k from public.conversations c where c.id = p_conv;
  perform public.call_cleanup();
  if public.call_busy(me) then raise exception 'call_busy: you are already on a call' using errcode = 'P0001'; end if;
  -- a call is already going on in this chat (or they called me at the same moment): join it
  select * into ex from public.calls c where c.conversation_id = p_conv and c.status in ('ringing', 'active') order by c.created_at desc limit 1;
  if found and ex.created_at > now() - interval '60 seconds' or found and ex.status = 'active' then
    if public.call_my_state(ex.id) is null then
      if (select count(*) from public.call_participants p where p.call_id = ex.id and p.state = 'joined') >= 4 then raise exception 'call_full: calls can have up to 4 people' using errcode = 'P0001'; end if;
      insert into public.call_participants (call_id, user_id, state) values (ex.id, me, 'ringing');
    end if;
    perform public.call_answer(ex.id);
    return jsonb_build_object('id', ex.id, 'status', 'join', 'ringing', '[]'::jsonb);
  end if;
  perform public.social_rate_check((select count(*) from public.calls c where c.caller_id = me and c.created_at > now() - interval '1 hour'), 30, 'calls an hour');
  if k = 'direct' then
    select m.user_id, m.state into u, ust from public.conversation_members m where m.conversation_id = p_conv and m.user_id <> me limit 1;
    if u is null then raise exception 'call_empty: there is no one else in this chat' using errcode = 'P0001'; end if;
    if ust in ('request', 'declined') then raise exception 'call_request_out: you can call once they accept your message request' using errcode = 'P0001'; end if;
    if ust is distinct from 'active' then raise exception 'call_empty: there is no one else in this chat' using errcode = 'P0001'; end if;
    chk := public.call_check(me, u);
    if chk <> 'ok' then raise exception '%: not allowed', chk using errcode = 'P0001'; end if;
  end if;
  insert into public.calls (conversation_id, caller_id, kind, is_group) values (p_conv, me, p_kind, k = 'group') returning id into cid;
  insert into public.call_participants (call_id, user_id, state, joined_at) values (cid, me, 'joined', now());
  for u in select m.user_id from public.conversation_members m where m.conversation_id = p_conv and m.user_id <> me and m.state = 'active' order by m.joined_at limit 32 loop
    if k = 'group' and public.call_check(me, u) <> 'ok' then continue; end if;
    st := case when public.call_busy(u) then 'busy' else 'ringing' end;
    -- Do not disturb: recorded as ringing so the caller just hears it ring out ("No answer"); it never rings on their side
    insert into public.call_participants (call_id, user_id, state, quiet) values (cid, u, st, public.call_dnd(u));
    n := n + 1;
    if st = 'busy' then n_busy := n_busy + 1; else ring := ring || u; end if;
  end loop;
  if n = 0 then raise exception 'call_no_one: no one in this group can take a call from you right now' using errcode = 'P0001'; end if;
  if n_busy = n then
    perform public.call_finish(cid, 'busy', 'busy');
    return jsonb_build_object('id', cid, 'status', 'busy', 'ringing', '[]'::jsonb);
  end if;
  return jsonb_build_object('id', cid, 'status', 'ringing', 'ringing', to_jsonb(ring));
end $$;

create or replace function public.call_answer(p_call uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); c public.calls; u uuid;
begin
  select * into c from public.calls x where x.id = p_call;
  if not found or public.call_my_state(p_call) is null then raise exception 'call_not_found' using errcode = 'P0001'; end if;
  if c.status not in ('ringing', 'active') then raise exception 'call_ended: this call has ended' using errcode = 'P0001'; end if;
  if public.dm_member_state(c.conversation_id, me) is distinct from 'active' then raise exception 'call_not_member: you are not in this chat' using errcode = 'P0001'; end if;
  if exists (select 1 from public.social_bans b where b.user_id = me) then raise exception 'banned' using errcode = 'P0001'; end if;
  if public.call_my_state(p_call) = 'joined' then
    update public.call_participants set last_seen_at = now() where call_id = p_call and user_id = me;
    return;
  end if;
  if (select count(*) from public.call_participants p where p.call_id = p_call and p.state = 'joined') >= 4 then raise exception 'call_full: calls can have up to 4 people' using errcode = 'P0001'; end if;
  for u in select p.user_id from public.call_participants p where p.call_id = p_call and p.state = 'joined' and p.user_id <> me loop
    if public.social_is_blocked(me, u) then raise exception 'call_unavailable: you can''t join this call' using errcode = 'P0001'; end if;
    if (public.dm_is_minor(me) or public.dm_is_minor(u)) and not public.social_are_friends(me, u) then raise exception 'call_minor: under-18s can only be in calls with friends' using errcode = 'P0001'; end if;
  end loop;
  update public.call_participants set state = 'joined', joined_at = coalesce(joined_at, now()), last_seen_at = now(), quiet = false where call_id = p_call and user_id = me;
  update public.calls set status = 'active', answered_at = coalesce(answered_at, now()) where id = p_call;
end $$;

create or replace function public.call_decline(p_call uuid, p_busy boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); c public.calls;
begin
  select * into c from public.calls x where x.id = p_call;
  if not found or public.call_my_state(p_call) is distinct from 'ringing' then return; end if;
  update public.call_participants set state = case when p_busy then 'busy' else 'declined' end, left_at = now() where call_id = p_call and user_id = me;
  if c.status = 'ringing' and not exists (select 1 from public.call_participants p where p.call_id = p_call and p.state = 'ringing') then
    -- 1:1: they declined. Group: everybody said no.
    perform public.call_finish(p_call, case when p_busy and not c.is_group then 'busy' else 'declined' end, 'declined');
  end if;
end $$;

create or replace function public.call_leave(p_call uuid, p_reason text default 'hangup') returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); c public.calls; mine text;
begin
  select * into c from public.calls x where x.id = p_call;
  mine := public.call_my_state(p_call);
  if not found or mine is null or c.status not in ('ringing', 'active') then return; end if;
  if mine = 'ringing' then perform public.call_decline(p_call); return; end if;
  update public.call_participants set state = 'left', left_at = now() where call_id = p_call and user_id = me and state = 'joined';
  if c.answered_at is null then
    -- nobody picked up: the caller gave up (or it rang out / couldn't connect)
    if c.caller_id = me then
      perform public.call_finish(p_call, case p_reason when 'timeout' then 'missed' when 'failed' then 'failed' else 'canceled' end, p_reason);
    end if;
  elsif (select count(*) from public.call_participants p where p.call_id = p_call and p.state = 'joined') < 2 then
    perform public.call_finish(p_call, 'ended', p_reason);
  end if;
end $$;

-- Every few seconds while ringing / in a call. Returns the call status; ends it if someone got blocked or a teen
-- safety rule no longer holds (e.g. unfriended mid-call).
create or replace function public.call_heartbeat(p_call uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); s text; u uuid;
begin
  if public.call_my_state(p_call) is null then return null; end if;
  update public.call_participants set last_seen_at = now() where call_id = p_call and user_id = me;
  if public.call_my_state(p_call) = 'joined' then
    for u in select p.user_id from public.call_participants p where p.call_id = p_call and p.state = 'joined' and p.user_id <> me loop
      if public.social_is_blocked(me, u) or ((public.dm_is_minor(me) or public.dm_is_minor(u)) and not public.social_are_friends(me, u)) then
        perform public.call_finish(p_call, 'ended', 'blocked');
        exit;
      end if;
    end loop;
  end if;
  perform public.call_cleanup();
  select c.status into s from public.calls c where c.id = p_call;
  return s;
end $$;

-- Calls ringing for me right now (Do not disturb ones never show up).
create or replace function public.call_incoming() returns table (call_id uuid, conversation_id uuid, caller_id uuid, kind text, created_at timestamptz, is_group boolean)
language plpgsql security definer set search_path = '' as $$
begin
  perform public.call_cleanup();
  return query
    select c.id, c.conversation_id, c.caller_id, c.kind, c.created_at, c.is_group
      from public.call_participants p join public.calls c on c.id = p.call_id
     where p.user_id = auth.uid() and p.state = 'ringing' and not p.quiet and c.status in ('ringing', 'active')
       and p.invited_at > now() - interval '60 seconds' and public.dm_member_state(c.conversation_id, auth.uid()) = 'active'
       and not public.call_dnd(auth.uid())
     order by c.created_at desc limit 5;
end $$;

-- My call history (Calls tab). Status is from my point of view (a group call I didn't pick up is "missed" for me).
create or replace function public.call_history(p_limit integer default 60) returns table (
  call_id uuid, conversation_id uuid, kind text, status text, caller_id uuid, created_at timestamptz, answered_at timestamptz, ended_at timestamptz,
  peers uuid[], is_group boolean, title text)
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  perform public.call_cleanup();
  return query
    select c.id, c.conversation_id, c.kind,
           case when c.caller_id is distinct from me and p.quiet then 'unavailable'
                when c.caller_id is distinct from me and p.state in ('missed', 'ringing') then (case when c.status = 'canceled' then 'canceled' else 'missed' end)
                when c.caller_id is distinct from me and p.state = 'declined' then 'declined'
                when c.caller_id is distinct from me and p.state = 'busy' then 'busy'
                else c.status end,
           c.caller_id, c.created_at,
           case when p.joined_at is not null then c.answered_at end,
           case when p.joined_at is not null then coalesce(p.left_at, c.ended_at) end,
           array(select q.user_id from public.call_participants q where q.call_id = c.id and q.user_id <> me and not public.social_is_blocked(me, q.user_id)),
           c.is_group, case when c.is_group then v.title end
      from public.call_participants p join public.calls c on c.id = p.call_id join public.conversations v on v.id = c.conversation_id
     where p.user_id = me and not p.hidden and c.status not in ('ringing', 'active')
     order by c.created_at desc
     limit least(greatest(coalesce(p_limit, 60), 1), 200);
end $$;

create or replace function public.call_hide(p_call uuid) returns void
language sql security definer set search_path = '' as $$
  update public.call_participants set hidden = true where call_id = p_call and user_id = auth.uid()
$$;

-- ---------- RLS ----------
alter table public.calls             enable row level security;
alter table public.call_participants enable row level security;
do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public' and tablename in ('calls', 'call_participants') loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;
-- read-only for the people in the call; every change goes through the call_* functions above
create policy "calls_select_participant" on public.calls for select to authenticated using (public.call_is_participant(id));
create policy "call_participants_select_participant" on public.call_participants for select to authenticated using (public.call_is_participant(call_id));

-- ---------- grants ----------
revoke all on public.calls, public.call_participants from anon, authenticated;
grant select on public.calls to authenticated;
-- `quiet` (Do not disturb), `hidden` and `last_seen_at` stay private: not even readable by the other people in the call
grant select (call_id, user_id, state, invited_at, joined_at, left_at) on public.call_participants to authenticated;
grant update (who_can_call, dnd_until) on public.dm_settings to authenticated;

revoke execute on function public.call_start(uuid, text), public.call_answer(uuid), public.call_decline(uuid, boolean), public.call_leave(uuid, text),
  public.call_heartbeat(uuid), public.call_incoming(), public.call_history(integer), public.call_hide(uuid) from public, anon;
grant execute on function public.call_start(uuid, text), public.call_answer(uuid), public.call_decline(uuid, boolean), public.call_leave(uuid, text),
  public.call_heartbeat(uuid), public.call_incoming(), public.call_history(integer), public.call_hide(uuid) to authenticated;
revoke execute on function public.call_who(uuid), public.call_dnd(uuid), public.call_check(uuid, uuid), public.call_busy(uuid, uuid), public.call_log(uuid),
  public.call_finish(uuid, text, text), public.call_cleanup() from public, anon, authenticated;
-- used inside RLS policies / Realtime authorization: callable, but they only answer about the signed-in user
revoke execute on function public.call_my_state(uuid), public.call_is_participant(uuid), public.call_topic_ok(text) from public, anon;
grant execute on function public.call_my_state(uuid), public.call_is_participant(uuid), public.call_topic_ok(text) to authenticated;

-- ---------- Realtime ----------
-- Ringing + call status changes stream to the app (RLS above applies), and the private Broadcast channel
-- `call:<id>` (offers / answers / ICE candidates between the browsers) is limited to people who joined that call.
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['calls', 'call_participants'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
do $$
begin
  if to_regclass('realtime.messages') is not null then
    execute 'drop policy if exists "call_broadcast_read" on realtime.messages';
    execute 'drop policy if exists "call_broadcast_write" on realtime.messages';
    execute $p$create policy "call_broadcast_read" on realtime.messages for select to authenticated using (public.call_topic_ok(realtime.topic()))$p$;
    execute $p$create policy "call_broadcast_write" on realtime.messages for insert to authenticated with check (public.call_topic_ok(realtime.topic()))$p$;
  end if;
end $$;

-- Check: both call tables should show rowsecurity = true
select tablename, rowsecurity from pg_tables where schemaname = 'public' and tablename in ('calls', 'call_participants');

-- =====================================================================================================================
-- SHARED ACTIVITIES (Record › Save / Share): the public copy of an activity behind a share link /hybrd/a?id=<uuid>.
-- The app writes ONLY the privacy-trimmed payload here (start/end hidden by a random distance, privacy zones removed,
-- or no map at all) — the full route stays in the owner's private `workouts` / `gps_routes` rows.
-- Who can read:  owner · friends (visibility 'friends') · anyone incl. signed-out (visibility 'public', never minors)
-- Blocked people never see each other's activities. Re-runnable.
-- =====================================================================================================================
create table if not exists public.shared_activities (
  id          uuid primary key,                          -- random share id from the app (not the workout id)
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  workout_id  text not null,
  visibility  text not null default 'friends',
  data        jsonb not null,                            -- PublicActivity (src/lib/share.ts), already privacy-trimmed
  image_path  text,                                      -- activity-images bucket: <user_id>/<id>.png
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.shared_activities drop constraint if exists shared_activities_vis_chk;
alter table public.shared_activities add constraint shared_activities_vis_chk check (visibility in ('friends', 'public'));
alter table public.shared_activities drop constraint if exists shared_activities_data_chk;
alter table public.shared_activities add constraint shared_activities_data_chk check (jsonb_typeof(data) = 'object' and coalesce(data->>'v', '') = '1' and octet_length(data::text) <= 524288);
alter table public.shared_activities drop constraint if exists shared_activities_img_chk;
alter table public.shared_activities add constraint shared_activities_img_chk check (image_path is null or image_path = user_id::text || '/' || id::text || '.png');
create unique index if not exists shared_activities_workout_key on public.shared_activities (user_id, workout_id);
create index if not exists shared_activities_user_idx on public.shared_activities (user_id, created_at desc);
alter table public.shared_activities add column if not exists removed_at timestamptz;   -- moderator removal (v1.6)
alter table public.shared_activities enable row level security;
revoke all on public.shared_activities from anon;
grant select, insert, update, delete on public.shared_activities to authenticated;

-- Can the current viewer (signed in or not) see an activity by `owner` shared to `vis`?
create or replace function public.activity_can_view(owner uuid, vis text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when owner is null then false
    when owner = auth.uid() then true
    when auth.uid() is not null and public.social_is_blocked(auth.uid(), owner) then false
    when exists (select 1 from public.social_bans b where b.user_id = owner) then false
    when public.acct_hidden(owner) then false
    when vis = 'public' then not public.dm_is_minor(owner)
    when vis = 'friends' then auth.uid() is not null and public.social_are_friends(auth.uid(), owner)
    else false
  end
$$;
create or replace function public.activity_can_view_object(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.shared_activities a where a.image_path = p_name and a.removed_at is null and public.activity_can_view(a.user_id, a.visibility))
$$;

drop policy if exists "shared_activities_select" on public.shared_activities;
drop policy if exists "shared_activities_insert" on public.shared_activities;
drop policy if exists "shared_activities_update" on public.shared_activities;
drop policy if exists "shared_activities_delete" on public.shared_activities;
create policy "shared_activities_select" on public.shared_activities for select to authenticated
  using (public.activity_can_view(user_id, visibility) and (removed_at is null or user_id = (select auth.uid())));
create policy "shared_activities_insert" on public.shared_activities for insert to authenticated with check (user_id = (select auth.uid()));
create policy "shared_activities_update" on public.shared_activities for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "shared_activities_delete" on public.shared_activities for delete to authenticated using (user_id = (select auth.uid()));

-- Server-side rules: a public profile is required (that's where the 13+ age gate lives), under-18s can't share
-- publicly, banned accounts can't share, owner and creation time can't be changed, max 100 new shares a day.
create or replace function public.shared_activities_before() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.user_id is distinct from auth.uid() then raise exception 'not_allowed' using errcode = 'P0001'; end if;
    perform public.social_rate_check((select count(*) from public.shared_activities a where a.user_id = new.user_id and a.created_at > now() - interval '1 day'), 100, 'shared activities per day');
    new.created_at := now(); new.removed_at := null;
  else
    new.user_id := old.user_id; new.created_at := old.created_at; new.id := old.id;
    if coalesce(current_setting('hybrd.mod', true), '') <> '1' then new.removed_at := old.removed_at; end if;
  end if;
  if coalesce(current_setting('hybrd.mod', true), '') <> '1' and (public.acct_paused(new.user_id) or public.acct_suspended(new.user_id)) then
    raise exception 'acct_paused: resume your account to share activities' using errcode = 'P0001';
  end if;
  if not public.social_is_member(new.user_id) then raise exception 'not_member' using errcode = 'P0001'; end if;
  if exists (select 1 from public.social_bans b where b.user_id = new.user_id) then raise exception 'banned' using errcode = 'P0001'; end if;
  if new.visibility = 'public' and public.dm_is_minor(new.user_id) then raise exception 'minor_public' using errcode = 'P0001'; end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists shared_activities_before on public.shared_activities;
create trigger shared_activities_before before insert or update on public.shared_activities for each row execute function public.shared_activities_before();

-- If someone turns 18-or-under rules on (profile becomes minor), their public shares fall back to friends.
create or replace function public.shared_activities_minor_sync() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.is_minor and not coalesce(old.is_minor, false) then
    update public.shared_activities set visibility = 'friends' where user_id = new.id and visibility = 'public';
  end if;
  return new;
end $$;
drop trigger if exists social_profiles_shared_minor on public.social_profiles;
create trigger social_profiles_shared_minor after update on public.social_profiles for each row execute function public.shared_activities_minor_sync();

-- The share page (/hybrd/a?id=…) reads one activity through this function, also when signed out.
-- Returns null when the viewer may not see it (private, friends-only, blocked, minor, deleted) — no difference
-- between "doesn't exist" and "not allowed", so share ids can't be probed.
create or replace function public.activity_public(p_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', a.id, 'data', a.data, 'visibility', a.visibility, 'image_path', a.image_path, 'created_at', a.created_at, 'updated_at', a.updated_at,
    'mine', a.user_id = auth.uid(),
    'author', case when p.id is null then null else jsonb_build_object('display_name', p.display_name,
      'username', case when p.privacy = 'public' or a.user_id = auth.uid() or (auth.uid() is not null and public.social_are_friends(auth.uid(), a.user_id)) then p.username end) end)
  from public.shared_activities a left join public.social_profiles p on p.id = a.user_id
  where a.id = p_id and public.activity_can_view(a.user_id, a.visibility) and (a.removed_at is null or a.user_id = auth.uid())
$$;
revoke execute on function public.activity_public(uuid) from public;
grant execute on function public.activity_public(uuid) to anon, authenticated;
revoke execute on function public.activity_can_view(uuid, text), public.activity_can_view_object(text) from public;
grant execute on function public.activity_can_view(uuid, text), public.activity_can_view_object(text) to anon, authenticated;

-- ---------- Storage: share images (PNG made in the app from the trimmed route) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('activity-images', 'activity-images', false, 5242880, array['image/png'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "activity_images_select" on storage.objects;
drop policy if exists "activity_images_insert_own" on storage.objects;
drop policy if exists "activity_images_update_own" on storage.objects;
drop policy if exists "activity_images_delete_own" on storage.objects;
create policy "activity_images_select" on storage.objects for select to anon, authenticated
  using (bucket_id = 'activity-images' and ((storage.foldername(name))[1] = (select auth.uid())::text or public.activity_can_view_object(name)));
create policy "activity_images_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'activity-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "activity_images_update_own" on storage.objects for update to authenticated
  using (bucket_id = 'activity-images' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'activity-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "activity_images_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'activity-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Check: shared_activities should show rowsecurity = true, and the bucket public = false
select tablename, rowsecurity from pg_tables where schemaname = 'public' and tablename = 'shared_activities';
select id, public from storage.buckets where id = 'activity-images';

-- =====================================================================================================================
-- SAFETY (v1.6, added 26 Nov 2026 — safe to re-run; SETUP.md §15): report people and content, restrict, take time off,
-- delete your account with 30 days to reopen, moderator decisions, appeals and the moderation queue.
-- Tables account_state, moderation_actions, appeals (top of the social section) and dm_restricts (messages section)
-- are created earlier because the visibility helpers use them.
--   * Nobody can make themselves a moderator: profiles.is_moderator is frozen for app users (trigger below) and every
--     moderator RPC checks it on the server. The /moderation route in the app is only a view of these RPCs.
--   * Reporters stay anonymous: the reported person never sees reports, and decisions they see carry no reporter.
--   * Every moderator action is written to moderation_actions (audit log; moderators can read it, nobody can edit it).
-- =====================================================================================================================

-- ---------- guards ----------
-- profiles.is_moderator can only be changed from the SQL editor / service role, never by the app.
create or replace function public.profiles_protect_moderator() returns trigger
language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then new.is_moderator := false; else new.is_moderator := old.is_moderator; end if;
  end if;
  return new;
end $$;
drop trigger if exists profiles_protect_moderator on public.profiles;
create trigger profiles_protect_moderator before insert or update on public.profiles for each row execute function public.profiles_protect_moderator();

-- Paused or suspended accounts can't publish (posts, stories, comments). Removal flags can't be set by the author.
create or replace function public.safety_publish_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if public.acct_suspended(new.author_id) then raise exception 'acct_suspended: your account is suspended' using errcode = 'P0001'; end if;
  if public.acct_paused(new.author_id) then raise exception 'acct_paused: resume your account to post' using errcode = 'P0001'; end if;
  new.removed_at := null;
  return new;
end $$;
drop trigger if exists safety_publish_guard on public.posts;
create trigger safety_publish_guard before insert on public.posts for each row execute function public.safety_publish_guard();
drop trigger if exists safety_publish_guard on public.stories;
create trigger safety_publish_guard before insert on public.stories for each row execute function public.safety_publish_guard();
drop trigger if exists safety_publish_guard on public.comments;
create trigger safety_publish_guard before insert on public.comments for each row execute function public.safety_publish_guard();

-- Notifications stop while either side is paused, deactivated or suspended.
create or replace function public.notifications_safety() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if public.acct_hidden(new.user_id) or public.acct_hidden(new.actor_id) then return null; end if;
  return new;
end $$;
drop trigger if exists notifications_safety on public.notifications;
create trigger notifications_safety before insert on public.notifications for each row execute function public.notifications_safety();

-- ---------- Row Level Security ----------
alter table public.account_state      enable row level security;
alter table public.moderation_actions enable row level security;
alter table public.appeals            enable row level security;
alter table public.dm_restricts       enable row level security;
do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public' and tablename in ('account_state', 'moderation_actions', 'appeals', 'dm_restricts') loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;
-- account_state: read your own row; changes only through account_* RPCs
create policy "account_state_select_own" on public.account_state for select to authenticated using (user_id = (select auth.uid()));
-- moderation_actions: moderators only (people see their own decisions through account_status())
create policy "moderation_actions_select_mod" on public.moderation_actions for select to authenticated using (public.is_moderator());
-- appeals: your own, or moderators; created / decided only through RPCs
create policy "appeals_select_own_or_mod" on public.appeals for select to authenticated using (user_id = (select auth.uid()) or public.is_moderator());
-- restricts: your own list
create policy "dm_restricts_select_own" on public.dm_restricts for select to authenticated using (user_id = (select auth.uid()));
create policy "dm_restricts_insert_own" on public.dm_restricts for insert to authenticated
  with check (user_id = (select auth.uid()) and public.social_is_member((select auth.uid())) and public.social_is_member(restricted_id));
create policy "dm_restricts_delete_own" on public.dm_restricts for delete to authenticated using (user_id = (select auth.uid()));
-- moderators can read every report (the queue); reporters keep reading their own
drop policy if exists "reports_select_mod" on public.reports;
create policy "reports_select_mod" on public.reports for select to authenticated using (public.is_moderator());
drop policy if exists "message_reports_select_mod" on public.message_reports;
create policy "message_reports_select_mod" on public.message_reports for select to authenticated using (public.is_moderator());

revoke all on public.account_state, public.moderation_actions, public.appeals, public.dm_restricts from anon;
revoke all on public.account_state, public.moderation_actions, public.appeals, public.dm_restricts from authenticated;
grant select on public.account_state, public.moderation_actions, public.appeals to authenticated;
grant select, insert, delete on public.dm_restricts to authenticated;

-- ---------- reporter: my reports ----------
create or replace function public.safety_my_reports() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]'::jsonb) from (
    select jsonb_build_object('id', r.id, 'store', 'social', 'target_type', r.target_type, 'target_id', r.target_id, 'reason', r.reason, 'details', r.details,
             'status', r.status, 'created_at', r.created_at, 'reviewed_at', r.reviewed_at,
             'target_name', (select '@' || p.username from public.social_profiles p where p.id = r.target_user_id)) x
      from public.reports r where r.reporter_id = auth.uid()
    union all
    select jsonb_build_object('id', m.id, 'store', 'messages', 'target_type', m.target_type, 'target_id', coalesce(m.message_id, m.conversation_id), 'reason', m.reason, 'details', m.details,
             'status', m.status, 'created_at', m.created_at, 'reviewed_at', m.reviewed_at,
             'target_name', (select '@' || p.username from public.social_profiles p where p.id = m.target_user_id)) x
      from public.message_reports m where m.reporter_id = auth.uid()
    order by 1 limit 200
  ) q
$$;

-- ---------- account: status, time off, deletion ----------
-- One call for Settings › Safety › Account status and the welcome-back / deletion screens. Expired pauses are cleared here.
create or replace function public.account_status() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); st public.account_state;
begin
  if me is null then raise exception 'not_signed_in' using errcode = 'P0001'; end if;
  update public.account_state set paused_at = null, pause_until = null, updated_at = now()
   where user_id = me and paused_at is not null and pause_until is not null and pause_until <= now();
  select * into st from public.account_state where user_id = me;
  return jsonb_build_object(
    'paused_at', st.paused_at, 'pause_until', st.pause_until, 'deletion_requested_at', st.deletion_requested_at, 'purge_after', st.purge_after,
    'is_moderator', public.is_moderator(), 'now', now(),
    'decisions', coalesce((select jsonb_agg(jsonb_build_object(
        'id', a.id, 'kind', a.action, 'guideline', a.guideline, 'note', a.note, 'content_type', a.content_type, 'content_id', a.content_id,
        'content_preview', a.content_preview, 'created_at', a.created_at, 'ends_at', a.ends_at, 'reversed_at', a.reversed_at,
        'appeal', (select jsonb_build_object('id', p.id, 'body', p.body, 'status', p.status, 'created_at', p.created_at, 'decided_at', p.decided_at, 'note', p.decision_note)
                     from public.appeals p where p.decision_id = a.id)) order by a.created_at desc)
      from public.moderation_actions a where a.target_user_id = me and a.action in ('remove_content', 'restrict_messaging', 'suspend')), '[]'::jsonb));
end $$;

create or replace function public.account_pause(p_until timestamptz default null) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not_signed_in' using errcode = 'P0001'; end if;
  if p_until is not null and (p_until <= now() or p_until > now() + interval '366 days') then raise exception 'pause_date: pick a date within the next year' using errcode = 'P0001'; end if;
  if exists (select 1 from public.account_state s where s.user_id = me and s.deletion_requested_at is not null) then raise exception 'deletion_pending: reopen your account first' using errcode = 'P0001'; end if;
  insert into public.account_state (user_id, paused_at, pause_until, updated_at) values (me, now(), p_until, now())
  on conflict (user_id) do update set paused_at = now(), pause_until = p_until, updated_at = now();
end $$;

create or replace function public.account_resume() returns void
language sql security definer set search_path = '' as $$
  update public.account_state set paused_at = null, pause_until = null, updated_at = now() where user_id = auth.uid();
$$;

-- Deletion needs a fresh sign-in (the app asks for the password again right before calling this).
create or replace function public.account_request_deletion(p_reason text default null) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); signed timestamptz; purge timestamptz := now() + interval '30 days';
begin
  if me is null then raise exception 'not_signed_in' using errcode = 'P0001'; end if;
  select u.last_sign_in_at into signed from auth.users u where u.id = me;
  if signed is null or signed < now() - interval '10 minutes' then raise exception 'reauth_required: enter your password again' using errcode = 'P0001'; end if;
  insert into public.account_state (user_id, deletion_requested_at, purge_after, deletion_reason, paused_at, pause_until, updated_at)
  values (me, now(), purge, left(nullif(btrim(coalesce(p_reason, '')), ''), 200), null, null, now())
  on conflict (user_id) do update set deletion_requested_at = now(), purge_after = purge, deletion_reason = excluded.deletion_reason, paused_at = null, pause_until = null, updated_at = now();
  return purge;
end $$;

create or replace function public.account_reopen() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = 'P0001'; end if;
  update public.account_state set deletion_requested_at = null, purge_after = null, deletion_reason = null, updated_at = now()
   where user_id = auth.uid() and deletion_requested_at is not null and purge_after > now();
end $$;

-- ---------- appeals ----------
create or replace function public.appeal_submit(p_decision uuid, p_body text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); d public.moderation_actions; aid uuid;
begin
  select * into d from public.moderation_actions a where a.id = p_decision and a.target_user_id = me and a.action in ('remove_content', 'restrict_messaging', 'suspend');
  if d.id is null then raise exception 'appeal_not_found' using errcode = 'P0001'; end if;
  if d.reversed_at is not null then raise exception 'appeal_reversed: already reversed' using errcode = 'P0001'; end if;
  if d.created_at < now() - interval '30 days' then raise exception 'appeal_window: appeals must be sent within 30 days' using errcode = 'P0001'; end if;
  if exists (select 1 from public.appeals p where p.decision_id = d.id) then raise exception 'appeal_once: each decision can be appealed once' using errcode = 'P0001'; end if;
  if char_length(btrim(coalesce(p_body, ''))) not between 10 and 1000 then raise exception 'appeal_text: write 10 to 1,000 characters' using errcode = 'P0001'; end if;
  perform public.social_rate_check((select count(*) from public.appeals p where p.user_id = me and p.created_at > now() - interval '1 day'), 10, 'appeals per day');
  insert into public.appeals (decision_id, user_id, body) values (d.id, me, btrim(p_body)) returning id into aid;
  return aid;
end $$;

-- ---------- moderation (moderators only; every action is logged) ----------
create or replace function public.mod_require() returns uuid
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_moderator() then raise exception 'not_moderator: moderators only' using errcode = 'P0001'; end if;
  return auth.uid();
end $$;

create or replace function public.mod_queue() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.mod_require();
  return jsonb_build_object(
    'reports', coalesce((select jsonb_agg(q order by (q->>'priority')::int, q->>'created_at') from (
      select jsonb_build_object('id', r.id, 'store', 'social', 'target_type', r.target_type, 'target_id', r.target_id, 'target_user_id', r.target_user_id,
               'target_name', (select p.display_name || ' @' || p.username from public.social_profiles p where p.id = r.target_user_id),
               'reason', r.reason, 'details', r.details, 'snapshot', r.snapshot, 'status', r.status, 'priority', r.priority, 'created_at', r.created_at,
               'report_count', (select count(*) from public.reports x where x.target_type = r.target_type and x.target_id = r.target_id and x.status in ('open', 'reviewing'))) q
        from public.reports r where r.status in ('open', 'reviewing')
      union all
      select jsonb_build_object('id', m.id, 'store', 'messages', 'target_type', m.target_type, 'target_id', coalesce(m.message_id, m.conversation_id), 'conversation_id', m.conversation_id,
               'target_user_id', m.target_user_id, 'target_name', (select p.display_name || ' @' || p.username from public.social_profiles p where p.id = m.target_user_id),
               'reason', m.reason, 'details', m.details, 'snapshot', m.snapshot, 'status', m.status, 'priority', m.priority, 'created_at', m.created_at, 'report_count', 1) q
        from public.message_reports m where m.status in ('open', 'reviewing')
      limit 300) z), '[]'::jsonb),
    'appeals', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'body', p.body, 'status', p.status, 'created_at', p.created_at, 'user_id', p.user_id,
               'user_name', (select sp.display_name || ' @' || sp.username from public.social_profiles sp where sp.id = p.user_id),
               'decision', jsonb_build_object('id', a.id, 'kind', a.action, 'guideline', a.guideline, 'note', a.note, 'content_type', a.content_type, 'content_id', a.content_id,
                 'content_preview', a.content_preview, 'created_at', a.created_at, 'ends_at', a.ends_at, 'reversed_at', a.reversed_at)) order by p.created_at)
      from public.appeals p join public.moderation_actions a on a.id = p.decision_id where p.status in ('submitted', 'under_review')), '[]'::jsonb));
end $$;

-- Act on a report: review | dismiss | remove_content | restrict_messaging | suspend. Returns the moderation_actions id.
create or replace function public.mod_act(p_store text, p_report uuid, p_action text, p_guideline text default null, p_note text default null,
                                          p_days integer default null, p_internal text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.mod_require(); tt text; tid uuid; conv uuid; target uuid; ctype text; cid uuid; preview text; ends timestamptz; aid uuid; newstatus text;
begin
  if p_store = 'social' then
    select r.target_type, r.target_id, r.target_user_id into tt, tid, target from public.reports r where r.id = p_report;
  elsif p_store = 'messages' then
    select r.target_type, coalesce(r.message_id, r.conversation_id), r.conversation_id, r.target_user_id into tt, tid, conv, target from public.message_reports r where r.id = p_report;
  else raise exception 'mod_invalid: store' using errcode = 'P0001'; end if;
  if tt is null then raise exception 'mod_not_found: report not found' using errcode = 'P0001'; end if;
  if target = me and p_action in ('remove_content', 'restrict_messaging', 'suspend') then raise exception 'mod_self: another moderator must handle reports about you' using errcode = 'P0001'; end if;
  if p_action in ('remove_content', 'restrict_messaging', 'suspend') and p_guideline is null then raise exception 'mod_guideline: choose the guideline that was broken' using errcode = 'P0001'; end if;
  if p_action in ('restrict_messaging', 'suspend') then
    if target is null then raise exception 'mod_invalid: no account to act on' using errcode = 'P0001'; end if;
    if coalesce(p_days, 0) not between 1 and 365 then raise exception 'mod_days: choose 1 to 365 days' using errcode = 'P0001'; end if;
    ends := now() + make_interval(days => p_days);
  end if;
  perform set_config('hybrd.mod', '1', true);
  if p_action = 'remove_content' then
    if p_store = 'social' and tt in ('post', 'media') then
      ctype := 'post'; cid := tid; update public.posts set removed_at = now() where id = tid returning left(body, 140) into preview;
    elsif p_store = 'social' and tt = 'comment' then
      ctype := 'comment'; cid := tid; update public.comments set removed_at = now() where id = tid returning left(body, 140) into preview;
    elsif p_store = 'social' and tt = 'story' then
      ctype := 'story'; cid := tid; update public.stories set removed_at = now() where id = tid returning left(coalesce(body, 'Photo story'), 140) into preview;
    elsif p_store = 'social' and tt = 'activity' then
      ctype := 'activity'; cid := tid; update public.shared_activities set removed_at = now() where id = tid returning left(coalesce(data->>'title', 'Shared activity'), 140) into preview;
    elsif p_store = 'messages' and tt = 'message' then
      ctype := 'message'; cid := tid; update public.messages set removed_at = now() where id = tid and deleted_at is null returning left(case when body = '' then kind else body end, 140) into preview;
    else
      raise exception 'mod_invalid: this report is about an account or a whole chat — restrict messaging or suspend instead' using errcode = 'P0001';
    end if;
    if not found then raise exception 'mod_gone: the content was already deleted' using errcode = 'P0001'; end if;
  end if;
  perform set_config('hybrd.mod', '', true);
  newstatus := case p_action when 'review' then 'reviewing' when 'dismiss' then 'dismissed' else 'actioned' end;
  insert into public.moderation_actions (moderator_id, target_user_id, action, content_type, content_id, content_preview, guideline, note, internal_note, report_store, report_id, ends_at)
  values (me, target, p_action, ctype, cid, preview, p_guideline, left(nullif(btrim(coalesce(p_note, '')), ''), 500), left(nullif(btrim(coalesce(p_internal, '')), ''), 1000), p_store, p_report, ends)
  returning id into aid;
  -- the report and every other open report on the same thing move together
  if p_store = 'social' then
    update public.reports set status = newstatus, reviewed_at = case when newstatus = 'reviewing' then null else now() end
     where (id = p_report or (target_type = tt and target_id = tid and status in ('open', 'reviewing') and p_action <> 'review'));
  else
    update public.message_reports set status = newstatus, reviewed_at = case when newstatus = 'reviewing' then null else now() end
     where (id = p_report or (coalesce(message_id, conversation_id) = tid and target_type = tt and status in ('open', 'reviewing') and p_action <> 'review'));
  end if;
  return aid;
end $$;

-- Decide an appeal: under_review | upheld | reversed. Reversed = the decision is undone (content restored, restriction or suspension lifted).
create or replace function public.mod_decide_appeal(p_appeal uuid, p_status text, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.mod_require(); ap public.appeals; d public.moderation_actions;
begin
  select * into ap from public.appeals where id = p_appeal;
  if ap.id is null then raise exception 'appeal_not_found' using errcode = 'P0001'; end if;
  if ap.status in ('upheld', 'reversed') then raise exception 'appeal_decided: this appeal is already decided' using errcode = 'P0001'; end if;
  if p_status not in ('under_review', 'upheld', 'reversed') then raise exception 'mod_invalid: status' using errcode = 'P0001'; end if;
  if ap.user_id = me then raise exception 'mod_self: another moderator must decide your appeal' using errcode = 'P0001'; end if;
  select * into d from public.moderation_actions where id = ap.decision_id;
  update public.appeals set status = p_status, decided_at = case when p_status = 'under_review' then null else now() end,
         decided_by = me, decision_note = left(nullif(btrim(coalesce(p_note, '')), ''), 500) where id = ap.id;
  insert into public.moderation_actions (moderator_id, target_user_id, action, decision_id, appeal_id, note, content_type, content_id)
  values (me, ap.user_id, case p_status when 'under_review' then 'appeal_reviewing' when 'upheld' then 'appeal_upheld' else 'appeal_reversed' end, d.id, ap.id, left(nullif(btrim(coalesce(p_note, '')), ''), 500), d.content_type, d.content_id);
  if p_status = 'reversed' then
    update public.moderation_actions set reversed_at = now() where id = d.id and reversed_at is null;
    if d.action = 'remove_content' then
      perform set_config('hybrd.mod', '1', true);
      if d.content_type = 'post' then update public.posts set removed_at = null where id = d.content_id;
      elsif d.content_type = 'comment' then update public.comments set removed_at = null where id = d.content_id;
      elsif d.content_type = 'story' then update public.stories set removed_at = null where id = d.content_id;
      elsif d.content_type = 'activity' then update public.shared_activities set removed_at = null where id = d.content_id;
      elsif d.content_type = 'message' then update public.messages set removed_at = null where id = d.content_id;
      end if;
      perform set_config('hybrd.mod', '', true);
      insert into public.moderation_actions (moderator_id, target_user_id, action, decision_id, appeal_id, content_type, content_id)
      values (me, ap.user_id, 'restore_content', d.id, ap.id, d.content_type, d.content_id);
    end if;
  end if;
end $$;

-- ---------- scheduled jobs (service role / pg_cron only) ----------
-- Clears expired pauses (they already stop hiding the account the moment pause_until passes; this tidies the rows).
create or replace function public.account_housekeeping() returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  update public.account_state set paused_at = null, pause_until = null, updated_at = now() where paused_at is not null and pause_until is not null and pause_until <= now();
  get diagnostics n = row_count;
  return n;
end $$;
-- Accounts whose 30 days are up. The purge-accounts Edge Function deletes their storage files, then the auth user
-- (which cascades to every table: profile, logs, social profile, posts, stories, comments, chats membership …).
create or replace function public.account_purge_candidates(p_limit integer default 50) returns table (user_id uuid, purge_after timestamptz)
language sql stable security definer set search_path = '' as $$
  select s.user_id, s.purge_after from public.account_state s where s.purge_after is not null and s.purge_after <= now() order by s.purge_after limit greatest(1, least(p_limit, 500))
$$;
-- Files in the message-media bucket sent by the account (they live under <conversation>/<sender>/…).
create or replace function public.account_purge_message_media(p_user uuid) returns setof text
language sql stable security definer set search_path = '' as $$
  select distinct p from public.messages x, lateral (values (x.media->>'path'), (x.media->>'poster_path')) v(p)
   where x.sender_id = p_user and p is not null
$$;
-- Last step for one account (after its files are gone): delete the messages it sent, then the auth user.
create or replace function public.account_purge_finish(p_user uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.account_state s where s.user_id = p_user and s.purge_after <= now()) then return false; end if;
  delete from public.messages where sender_id = p_user;
  delete from auth.users where id = p_user;
  return true;
end $$;

-- ---------- function access ----------
-- acct_hidden() is used inside RLS policies, so app users may call it (it only says "hidden or not", which an invisible
-- profile already shows). Everything that would reveal more — paused vs suspended, or whether someone restricted you — is not callable.
revoke execute on function public.acct_suspended(uuid), public.acct_msg_restricted(uuid), public.acct_paused(uuid),
  public.dm_is_restricted(uuid, uuid), public.mod_require(), public.account_housekeeping(), public.account_purge_candidates(integer),
  public.account_purge_message_media(uuid), public.account_purge_finish(uuid), public.safety_publish_guard(), public.notifications_safety() from public, anon, authenticated;
revoke execute on function public.is_moderator(), public.safety_my_reports(), public.account_status(), public.account_pause(timestamptz), public.account_resume(),
  public.account_request_deletion(text), public.account_reopen(), public.appeal_submit(uuid, text), public.mod_queue(),
  public.mod_act(text, uuid, text, text, text, integer, text), public.mod_decide_appeal(uuid, text, text) from public, anon;
grant execute on function public.is_moderator(), public.safety_my_reports(), public.account_status(), public.account_pause(timestamptz), public.account_resume(),
  public.account_request_deletion(text), public.account_reopen(), public.appeal_submit(uuid, text), public.mod_queue(),
  public.mod_act(text, uuid, text, text, text, integer, text), public.mod_decide_appeal(uuid, text, text) to authenticated;
grant execute on function public.account_housekeeping(), public.account_purge_candidates(integer), public.account_purge_message_media(uuid), public.account_purge_finish(uuid) to service_role;

-- Check: the safety tables should show rowsecurity = true
select tablename, rowsecurity from pg_tables where schemaname = 'public' and tablename in ('account_state', 'moderation_actions', 'appeals', 'dm_restricts');
