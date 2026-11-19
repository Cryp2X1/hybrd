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
alter table public.mind_screens enable row level security; -- Mind & Recovery optional WHO-5 / PHQ-4 check-ups (screening answers only, no diagnosis); day = local date

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
alter table public.reports add constraint reports_target_chk check (target_type in ('post', 'comment', 'user', 'story'));
alter table public.reports drop constraint if exists reports_reason_chk;
alter table public.reports add constraint reports_reason_chk check (reason in ('spam', 'harassment', 'hate', 'nudity', 'violence', 'self_harm', 'misinformation', 'underage', 'impersonation', 'other'));
alter table public.reports drop constraint if exists reports_status_chk;
alter table public.reports add constraint reports_status_chk check (status in ('open', 'reviewing', 'actioned', 'dismissed'));
alter table public.reports drop constraint if exists reports_details_len;
alter table public.reports add constraint reports_details_len check (details is null or char_length(details) <= 500);
create index if not exists reports_status_created_idx on public.reports (status, created_at);
create index if not exists reports_reporter_idx on public.reports (reporter_id, created_at desc);

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
    when public.social_are_friends(auth.uid(), author) then true
    when aud = 'public' then exists (select 1 from public.social_profiles p where p.id = author and p.privacy = 'public' and not p.is_minor)
    else false
  end
$$;
create or replace function public.social_can_view_post(pid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select public.social_can_view(p.author_id, p.audience) from public.posts p where p.id = pid), false)
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
    return exists (select 1 from public.social_profiles p where p.id = owner and p.avatar_path = p_name);
  elsif parts[2] = 'posts' then
    return exists (select 1 from public.post_media m where m.path = p_name and m.author_id = owner and public.social_can_view_post(m.post_id));
  elsif parts[2] = 'stories' then
    return exists (select 1 from public.stories s where s.media_path = p_name and s.author_id = owner and s.expires_at > now() and public.social_can_view(s.author_id, s.audience));
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
  perform public.social_rate_check((select count(*) from public.reports where reporter_id = new.reporter_id and created_at > now() - interval '1 day'), 30, 'reports per day');
  if new.target_type = 'post' then
    select author_id, jsonb_build_object('body', body, 'audience', audience) into new.target_user_id, new.snapshot from public.posts where id = new.target_id;
  elsif new.target_type = 'comment' then
    select author_id, jsonb_build_object('body', body, 'post_id', post_id) into new.target_user_id, new.snapshot from public.comments where id = new.target_id;
  elsif new.target_type = 'story' then
    select author_id, jsonb_build_object('body', body, 'media_path', media_path) into new.target_user_id, new.snapshot from public.stories where id = new.target_id;
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
  using (id = (select auth.uid()) or (public.social_is_member((select auth.uid())) and not public.social_is_blocked((select auth.uid()), id)));
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
  using (public.social_can_view(author_id, audience)
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
  using (author_id = (select auth.uid()) or (expires_at > now() and public.social_can_view(author_id, audience)));
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
  using (public.social_can_view_post(post_id) and (author_id = (select auth.uid()) or not public.social_is_blocked((select auth.uid()), author_id)));
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
