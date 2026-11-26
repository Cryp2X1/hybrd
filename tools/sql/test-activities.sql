-- LOCAL TESTING ONLY. Shared activities (Record › Share): who can read a shared activity (owner, friends, everyone,
-- signed-out), under-18 rules, blocking, bans, the share-image bucket and the activity_public() RPC.
-- Runs from tools/test-social-sql.sh (uses the t.* helpers from test-social.sql).
-- Users: A adult · B adult, A's friend · C adult stranger · E 15 years old, A's friend · G adult, blocked by A
\set ON_ERROR_STOP 1
set client_min_messages = notice;
reset role;
insert into auth.users (id, email) values ('ac000000-0000-0000-0000-00000000000a', 'aa@x'), ('ac000000-0000-0000-0000-00000000000b', 'ab@x'), ('ac000000-0000-0000-0000-00000000000c', 'acc@x'),
  ('ac000000-0000-0000-0000-00000000000e', 'ae@x'), ('ac000000-0000-0000-0000-000000000001', 'ag@x'), ('ac000000-0000-0000-0000-000000000002', 'anp@x');
-- test-only: Supabase gives anon these grants on storage.objects; the shim doesn't
grant select on storage.objects to anon;
set role authenticated;
select t.as('ac000000-0000-0000-0000-00000000000a'); select public.social_create_profile('act.a', 'Act A', '1990-01-01');
select t.as('ac000000-0000-0000-0000-00000000000b'); select public.social_create_profile('act.b', 'Act B', '1991-01-01', 'friends');
select t.as('ac000000-0000-0000-0000-00000000000c'); select public.social_create_profile('act.c', 'Act C', '1985-01-01');
select t.as('ac000000-0000-0000-0000-00000000000e'); select public.social_create_profile('act.e', 'Act E', (current_date - interval '15 years')::date);
select t.as('ac000000-0000-0000-0000-000000000001'); select public.social_create_profile('act.g', 'Act G', '1988-01-01');
select t.as('ac000000-0000-0000-0000-00000000000a'); select public.social_send_request('ac000000-0000-0000-0000-00000000000b'); select t.as('ac000000-0000-0000-0000-00000000000b'); select public.social_respond_request('ac000000-0000-0000-0000-00000000000a', true);
select t.as('ac000000-0000-0000-0000-00000000000a'); select public.social_send_request('ac000000-0000-0000-0000-00000000000e'); select t.as('ac000000-0000-0000-0000-00000000000e'); select public.social_respond_request('ac000000-0000-0000-0000-00000000000a', true);

-- ===== A shares a public run, a friends-only ride
select t.as('ac000000-0000-0000-0000-00000000000a');
insert into public.shared_activities (id, workout_id, visibility, data, image_path) values
  ('a1000000-0000-4000-8000-000000000001', 'w-run', 'public', '{"v":1,"title":"Morning Run","route":[[{"lat":40.71,"lng":-74.0}]]}', 'ac000000-0000-0000-0000-00000000000a/a1000000-0000-4000-8000-000000000001.png'),
  ('a1000000-0000-4000-8000-000000000002', 'w-ride', 'friends', '{"v":1,"title":"Evening Ride","route":null}', null);
select t.ok((select count(*) from public.shared_activities) = 2, 'owner reads both shares');
select t.ok((select user_id from public.shared_activities where id = 'a1000000-0000-4000-8000-000000000001') = 'ac000000-0000-0000-0000-00000000000a', 'user_id defaults to the signed-in user');
select t.fails($$insert into public.shared_activities (id, workout_id, data) values ('a1000000-0000-4000-8000-000000000003', 'w-run', '{"v":1}')$$, 'duplicate key|shared_activities_workout_key', 'one share per workout');
select t.fails($$insert into public.shared_activities (id, workout_id, visibility, data) values ('a1000000-0000-4000-8000-000000000004', 'w-x', 'only-me', '{"v":1}')$$, 'shared_activities_vis_chk', 'visibility must be friends or public (private = no row)');
select t.fails($$insert into public.shared_activities (id, workout_id, data) values ('a1000000-0000-4000-8000-000000000005', 'w-y', '{"title":"no version"}')$$, 'shared_activities_data_chk', 'payload must be a v1 PublicActivity object');
select t.fails($$insert into public.shared_activities (id, workout_id, data) values ('a1000000-0000-4000-8000-000000000006', 'w-z', jsonb_build_object('v', 1, 'pad', repeat('x', 600000)))$$, 'shared_activities_data_chk', 'payload size is capped');
select t.fails($$insert into public.shared_activities (id, user_id, workout_id, data) values ('a1000000-0000-4000-8000-000000000007', 'ac000000-0000-0000-0000-00000000000c', 'w-q', '{"v":1}')$$, 'row-level security|not_allowed', 'cannot share as someone else');
select t.fails($$insert into public.shared_activities (id, workout_id, data, image_path) values ('a1000000-0000-4000-8000-000000000008', 'w-i', '{"v":1}', 'ac000000-0000-0000-0000-00000000000c/x.png')$$, 'shared_activities_img_chk', 'image path must be the owner''s own <uid>/<share id>.png');
update public.shared_activities set user_id = 'ac000000-0000-0000-0000-00000000000c', created_at = now() - interval '9 days' where id = 'a1000000-0000-4000-8000-000000000002';
select t.ok((select user_id from public.shared_activities where id = 'a1000000-0000-4000-8000-000000000002') = 'ac000000-0000-0000-0000-00000000000a' and (select created_at from public.shared_activities where id = 'a1000000-0000-4000-8000-000000000002') > now() - interval '1 hour', 'owner and created_at cannot be changed');
insert into storage.objects (bucket_id, name) values ('activity-images', 'ac000000-0000-0000-0000-00000000000a/a1000000-0000-4000-8000-000000000001.png');
select t.fails($$insert into storage.objects (bucket_id, name) values ('activity-images', 'ac000000-0000-0000-0000-00000000000c/a.png')$$, 'row-level security', 'cannot upload a share image into someone else''s folder');
insert into storage.objects (bucket_id, name) values ('activity-images', 'ac000000-0000-0000-0000-00000000000a/orphan.png');

-- ===== friend B
select t.as('ac000000-0000-0000-0000-00000000000b');
select t.ok((select count(*) from public.shared_activities) = 2, 'friend sees public + friends-only shares');
select t.ok(public.activity_public('a1000000-0000-4000-8000-000000000002')->'data'->>'title' = 'Evening Ride', 'activity_public: friend gets the friends-only ride');
select t.ok((public.activity_public('a1000000-0000-4000-8000-000000000001')->'author'->>'username') = 'act.a', 'author handle shown (public profile)');
select t.ok(not (public.activity_public('a1000000-0000-4000-8000-000000000001')->>'mine')::boolean, 'mine = false for viewers');
update public.shared_activities set visibility = 'friends' where id = 'a1000000-0000-4000-8000-000000000001';
select t.ok((select visibility from public.shared_activities where id = 'a1000000-0000-4000-8000-000000000001') = 'public', 'friend cannot edit A''s share');
select t.ok((select count(*) from storage.objects where bucket_id = 'activity-images') = 1, 'friend can read the image of a visible share (not the orphan file)');
-- B is a friends-only profile: shares publicly but the handle is hidden from strangers
insert into public.shared_activities (id, workout_id, visibility, data) values ('a1000000-0000-4000-8000-0000000000b1', 'w-b', 'public', '{"v":1,"title":"B walk"}');

-- ===== stranger C
select t.as('ac000000-0000-0000-0000-00000000000c');
select t.ok((select count(*) from public.shared_activities where user_id = 'ac000000-0000-0000-0000-00000000000a') = 1, 'stranger sees only the public share');
select t.ok(public.activity_public('a1000000-0000-4000-8000-000000000002') is null, 'activity_public: friends-only → null for strangers');
select t.ok(public.activity_public('a1000000-0000-4000-8000-0000000000b1')->'author'->>'username' is null and public.activity_public('a1000000-0000-4000-8000-0000000000b1')->'author'->>'display_name' = 'Act B', 'friends-only profile: display name shown, handle hidden from strangers');
select t.ok((select count(*) from public.shared_activities where id = 'a1000000-0000-4000-8000-000000000001' and visibility = 'public') = 1, 'stranger can read the public run');
delete from public.shared_activities where id = 'a1000000-0000-4000-8000-000000000001';
select t.ok((select count(*) from public.shared_activities where id = 'a1000000-0000-4000-8000-000000000001') = 1, 'stranger cannot delete it (0 rows)');

-- ===== signed out (anon)
reset role; set role anon; select t.as('');
select t.ok(public.activity_public('a1000000-0000-4000-8000-000000000001')->'data'->>'title' = 'Morning Run', 'signed-out: public share opens');
select t.ok(public.activity_public('a1000000-0000-4000-8000-000000000002') is null, 'signed-out: friends-only share → null');
select t.ok(public.activity_public('a1000000-0000-4000-8000-0000000000ff') is null, 'signed-out: unknown id → null (same as not allowed)');
select t.fails($$select count(*) from public.shared_activities$$, 'permission denied', 'signed-out cannot list the table');
select t.ok((select count(*) from storage.objects where bucket_id = 'activity-images') = 1, 'signed-out can load the image of a public share only');
reset role; set role authenticated;

-- ===== blocking: A blocks G
select t.as('ac000000-0000-0000-0000-00000000000a'); select public.social_block('ac000000-0000-0000-0000-000000000001');
select t.as('ac000000-0000-0000-0000-000000000001');
select t.ok(public.activity_public('a1000000-0000-4000-8000-000000000001') is null and (select count(*) from public.shared_activities where user_id = 'ac000000-0000-0000-0000-00000000000a') = 0, 'blocked person cannot see even public shares');
select t.ok((select count(*) from storage.objects where bucket_id = 'activity-images') = 0, 'blocked person cannot load the image');

-- ===== under-18 E
select t.as('ac000000-0000-0000-0000-00000000000e');
select t.fails($$insert into public.shared_activities (id, workout_id, visibility, data) values ('a1000000-0000-4000-8000-0000000000e1', 'w-e', 'public', '{"v":1}')$$, 'minor_public', 'under-18 cannot share publicly');
insert into public.shared_activities (id, workout_id, visibility, data) values ('a1000000-0000-4000-8000-0000000000e2', 'w-e', 'friends', '{"v":1,"title":"Teen run"}');
select t.fails($$update public.shared_activities set visibility = 'public' where id = 'a1000000-0000-4000-8000-0000000000e2'$$, 'minor_public', 'under-18 cannot switch a share to public');
select t.as('ac000000-0000-0000-0000-00000000000a');
select t.ok(public.activity_public('a1000000-0000-4000-8000-0000000000e2')->'data'->>'title' = 'Teen run', 'friend sees the teen''s friends-only share');
select t.as('ac000000-0000-0000-0000-00000000000c');
select t.ok(public.activity_public('a1000000-0000-4000-8000-0000000000e2') is null, 'stranger cannot see the teen''s share');
-- a public share whose owner later becomes a minor (DOB corrected) is pulled back to friends and hidden from the public
reset role;
update public.social_private set birth_date = (current_date - interval '16 years')::date where id = 'ac000000-0000-0000-0000-00000000000b';
update public.social_profiles set display_name = display_name where id = 'ac000000-0000-0000-0000-00000000000b';
select t.ok((select visibility from public.shared_activities where id = 'a1000000-0000-4000-8000-0000000000b1') = 'friends', 'becoming a minor turns public shares into friends-only');
update public.social_private set birth_date = '1991-01-01' where id = 'ac000000-0000-0000-0000-00000000000b';
update public.social_profiles set display_name = display_name where id = 'ac000000-0000-0000-0000-00000000000b';
set role authenticated;

-- ===== no public profile → can't share (the 13+ age gate lives on the profile)
select t.as('ac000000-0000-0000-0000-000000000002');
select t.fails($$insert into public.shared_activities (id, workout_id, data) values ('a1000000-0000-4000-8000-0000000000f1', 'w-n', '{"v":1}')$$, 'not_member', 'sharing needs a HYBRD public profile');

-- ===== bans
reset role; insert into public.social_bans (user_id) values ('ac000000-0000-0000-0000-00000000000c') on conflict do nothing; set role authenticated;
select t.as('ac000000-0000-0000-0000-00000000000c');
select t.fails($$insert into public.shared_activities (id, workout_id, data) values ('a1000000-0000-4000-8000-0000000000c1', 'w-c', '{"v":1}')$$, 'banned', 'banned accounts cannot share');

-- ===== rate limit: 100 new shares a day
select t.as('ac000000-0000-0000-0000-000000000001');
insert into public.shared_activities (id, workout_id, data) select gen_random_uuid(), 'w-rate-' || g, '{"v":1}' from generate_series(1, 100) g;
select t.fails($$insert into public.shared_activities (id, workout_id, data) values (gen_random_uuid(), 'w-rate-101', '{"v":1}')$$, 'rate_limit', 'more than 100 shares a day is refused');
reset role; delete from public.shared_activities where user_id = 'ac000000-0000-0000-0000-000000000001'; set role authenticated;

-- ===== owner turns sharing off (Only me) = deletes the row
select t.as('ac000000-0000-0000-0000-00000000000a');
delete from public.shared_activities where id = 'a1000000-0000-4000-8000-000000000002';
select t.as('ac000000-0000-0000-0000-00000000000b');
select t.ok(public.activity_public('a1000000-0000-4000-8000-000000000002') is null, 'after Only me, the link stops working');
select t.as('ac000000-0000-0000-0000-00000000000a');
select t.ok((select count(*) from pg_policies where tablename = 'shared_activities') = 4, '4 policies on shared_activities');
select t.ok((select not public from storage.buckets where id = 'activity-images'), 'activity-images bucket is private');
reset role;
