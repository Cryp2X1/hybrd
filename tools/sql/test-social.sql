-- LOCAL TESTING ONLY. Exercises the Friends & Stories RLS policies, triggers and RPCs after schema.sql has been applied
-- (twice) on top of supabase-local-shim.sql. Run via tools/test-social-sql.sh. Any failed check raises and stops psql.
\set ON_ERROR_STOP 1
set client_min_messages = warning;
create schema if not exists t;
grant usage on schema t to authenticated, anon;
create or replace function t.ok(cond boolean, msg text) returns void language plpgsql as $$
begin if cond is not true then raise exception 'FAIL: %', msg; end if; raise notice 'ok %', msg; end $$;
create or replace function t.fails(sql text, pattern text, msg text) returns void language plpgsql as $$
begin
  begin execute sql; exception when others then
    if sqlerrm ~* pattern then raise notice 'ok % (%)', msg, sqlerrm; return; end if;
    raise exception 'FAIL: % — wrong error: %', msg, sqlerrm;
  end;
  raise exception 'FAIL: % — expected an error', msg;
end $$;
grant execute on all functions in schema t to authenticated, anon;
create or replace function t.as(u text) returns void language sql as $$ select set_config('request.jwt.claim.sub', u, false) $$;
grant execute on function t.as(text) to authenticated, anon;
set client_min_messages = notice;

-- users: A, B adults · C adult friends-only · D 15 years old · E 12 years old · X signed in but no social profile
insert into auth.users (id, email) values
 ('aaaaaaaa-0000-0000-0000-000000000001', 'a@x'), ('bbbbbbbb-0000-0000-0000-000000000002', 'b@x'),
 ('cccccccc-0000-0000-0000-000000000003', 'c@x'), ('dddddddd-0000-0000-0000-000000000004', 'd@x'),
 ('eeeeeeee-0000-0000-0000-000000000005', 'e@x'), ('ffffffff-0000-0000-0000-000000000006', 'x@x');
select t.ok((select count(*) from public.profiles) = 6, 'private profiles row auto-created for each user');

set role authenticated;
select t.as('aaaaaaaa-0000-0000-0000-000000000001');
select t.ok((public.social_create_profile('athlete.a', 'Athlete A', (current_date - interval '30 years')::date, 'public', 'Runner')).username = 'athlete.a', 'A creates a public profile');
select t.fails($$select public.social_create_profile('bad..name', 'A', '1990-01-01')$$, 'username_format', 'double-dot handle rejected by check');
select t.fails($$select public.social_create_profile('Sample.bot', 'A', '1990-01-01')$$, 'username_format', 'sample.* handles reserved for demo people');
select t.as('bbbbbbbb-0000-0000-0000-000000000002');
select t.fails($$select public.social_create_profile('athlete.a', 'B', '1990-01-01')$$, 'username_taken', 'duplicate handle → username_taken');
select t.ok(not public.social_handle_available('athlete.a'), 'handle availability check');
select public.social_create_profile('athlete.b', 'Athlete B', '1992-05-05');
select t.as('cccccccc-0000-0000-0000-000000000003');
select public.social_create_profile('athlete.c', 'Athlete C', '1988-02-02', 'friends');
select t.as('dddddddd-0000-0000-0000-000000000004');
select t.ok((public.social_create_profile('teen.d', 'Teen D', (current_date - interval '15 years')::date, 'public')).is_minor, 'a 15-year-old is flagged as a minor');
select t.ok((select privacy from public.social_profiles where id = auth.uid()) = 'friends', 'minor profile forced to friends-only');
update public.social_profiles set privacy = 'public' where id = auth.uid();
select t.ok((select privacy from public.social_profiles where id = auth.uid()) = 'friends', 'minor cannot switch to public');
select t.as('eeeeeeee-0000-0000-0000-000000000005');
select t.fails($$select public.social_create_profile('kid.e', 'Kid E', (current_date - interval '12 years')::date)$$, 'under_13', 'under-13 is refused');
select t.ok((select count(*) from public.social_profiles) = 0, 'non-member (under 13) sees no profiles');
select t.as('ffffffff-0000-0000-0000-000000000006');
select t.ok((select count(*) from public.social_profiles) = 0, 'signed-in non-member sees no profiles');
select t.fails($$insert into public.posts (body) values ('hi')$$, 'not_member|row-level security', 'non-member cannot post');
select t.fails($$insert into public.social_profiles (id, username, display_name) values (auth.uid(), 'sneaky', 'S')$$, 'permission denied', 'direct profile insert blocked (RPC only)');

-- friend requests
select t.as('aaaaaaaa-0000-0000-0000-000000000001');
select t.ok((select count(*) from public.social_profiles) = 4, 'A sees the 4 member profiles');
select t.ok(public.social_send_request('bbbbbbbb-0000-0000-0000-000000000002') = 'sent', 'A → B request sent');
select t.ok(public.social_send_request('bbbbbbbb-0000-0000-0000-000000000002') = 'already_sent', 'duplicate request is a no-op');
select t.fails($$select public.social_send_request('aaaaaaaa-0000-0000-0000-000000000001')$$, 'self', 'cannot friend yourself');
select t.fails($$insert into public.friend_requests (sender_id, receiver_id) values (auth.uid(), 'cccccccc-0000-0000-0000-000000000003')$$, 'permission denied', 'direct friend_requests insert blocked');
select t.as('bbbbbbbb-0000-0000-0000-000000000002');
select t.ok((select count(*) from public.friend_requests where receiver_id = auth.uid() and status = 'pending') = 1, 'B sees the incoming request');
select t.ok((select count(*) from public.notifications where type = 'friend_request') = 1, 'B got a friend_request notification');
select public.social_respond_request('aaaaaaaa-0000-0000-0000-000000000001', true);
select t.ok(public.social_are_friends('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002'), 'A and B are friends');
select t.ok((select friend_count from public.social_profiles where id = auth.uid()) = 1, 'friend_count trigger');
select t.ok((select count(*) from public.notifications where type = 'friend_request') = 0, 'request notification cleared after answering');
update public.social_profiles set display_name = 'B Renamed' where id = auth.uid();
select t.fails($$update public.social_profiles set friend_count = 999 where id = auth.uid()$$, 'permission denied', 'friend_count not client-editable');
select t.fails($$update public.social_profiles set is_minor = true where id = auth.uid()$$, 'permission denied', 'is_minor not client-editable');
select t.as('aaaaaaaa-0000-0000-0000-000000000001');
select t.ok((select count(*) from public.notifications where type = 'friend_accept') = 1, 'A notified of the accept');
-- incoming request + send = accept
select t.as('dddddddd-0000-0000-0000-000000000004');
select public.social_send_request('aaaaaaaa-0000-0000-0000-000000000001');
select t.as('aaaaaaaa-0000-0000-0000-000000000001');
select t.ok(public.social_send_request('dddddddd-0000-0000-0000-000000000004') = 'accepted', 'sending to someone who asked first accepts');
select public.social_unfriend('dddddddd-0000-0000-0000-000000000004');
select t.ok(not public.social_are_friends('aaaaaaaa-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000004'), 'unfriend');
select public.social_send_request('cccccccc-0000-0000-0000-000000000003');
select public.social_cancel_request('cccccccc-0000-0000-0000-000000000003');
select t.ok((select status from public.friend_requests where receiver_id = 'cccccccc-0000-0000-0000-000000000003') = 'cancelled', 'cancel request');

-- posts + audience
insert into public.posts (id, body, audience, like_count) values ('11111111-0000-0000-0000-000000000001', 'friends only run', 'friends', 999);
insert into public.posts (id, body, audience) values ('11111111-0000-0000-0000-000000000002', 'public run', 'public');
select t.ok((select like_count from public.posts where id = '11111111-0000-0000-0000-000000000001') = 0, 'clients cannot fake like_count on insert');
select t.ok((select post_count from public.social_profiles where id = auth.uid()) = 2, 'post_count trigger');
select t.fails($$update public.posts set like_count = 50 where id = '11111111-0000-0000-0000-000000000001'$$, 'permission denied', 'like_count not client-editable');
update public.posts set body = 'friends only run (edited)' where id = '11111111-0000-0000-0000-000000000001';
select t.ok((select edited_at is not null from public.posts where id = '11111111-0000-0000-0000-000000000001'), 'edit sets edited_at');
insert into public.post_media (post_id, path, w, h) values ('11111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001/posts/11111111-0000-0000-0000-000000000001/0.webp', 10, 10);
select t.fails($$insert into public.post_media (post_id, path) values ('11111111-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002/posts/x/0.webp')$$, 'row-level security', 'post_media path must be in your own folder');
insert into storage.objects (bucket_id, name) values ('social-media', 'aaaaaaaa-0000-0000-0000-000000000001/posts/11111111-0000-0000-0000-000000000001/0.webp');
select t.fails($$insert into storage.objects (bucket_id, name) values ('social-media', 'bbbbbbbb-0000-0000-0000-000000000002/posts/x/0.webp')$$, 'row-level security', 'cannot upload into someone else''s folder');

select t.as('bbbbbbbb-0000-0000-0000-000000000002');
select t.ok((select count(*) from public.posts) = 2, 'friend B sees friends + public posts');
select t.ok((select count(*) from storage.objects where bucket_id = 'social-media') = 1, 'friend B may read the post photo');
select t.as('cccccccc-0000-0000-0000-000000000003');
select t.ok((select count(*) from public.posts) = 1, 'non-friend C sees only the public post');
select t.ok((select count(*) from storage.objects where bucket_id = 'social-media') = 0, 'non-friend C cannot read the friends-only photo');
select t.fails($$insert into public.comments (post_id, body) values ('11111111-0000-0000-0000-000000000001', 'hi')$$, 'row-level security', 'C cannot comment on a post it cannot see');
select t.fails($$insert into public.likes (post_id) values ('11111111-0000-0000-0000-000000000001')$$, 'row-level security', 'C cannot like a post it cannot see');
insert into public.posts (body, audience) values ('C public?', 'public');
select t.ok((select audience from public.posts where author_id = auth.uid()) = 'friends', 'friends-only profile → post forced to friends');
select t.as('dddddddd-0000-0000-0000-000000000004');
insert into public.posts (body, audience) values ('teen post', 'public');
select t.ok((select audience from public.posts where author_id = auth.uid()) = 'friends', 'minor post forced to friends');

-- likes, comments, saves, reshare
select t.as('bbbbbbbb-0000-0000-0000-000000000002');
insert into public.likes (post_id) values ('11111111-0000-0000-0000-000000000001');
insert into public.comments (id, post_id, body) values ('22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'Nice pace!');
insert into public.comments (id, post_id, body) values ('22222222-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001', 'Again!');
insert into public.saves (post_id) values ('11111111-0000-0000-0000-000000000001');
insert into public.posts (body, audience, reshare_of) values ('look at this', 'friends', '11111111-0000-0000-0000-000000000002');
select t.ok((select like_count from public.posts where id = '11111111-0000-0000-0000-000000000001') = 1, 'like_count trigger');
select t.ok((select comment_count from public.posts where id = '11111111-0000-0000-0000-000000000001') = 2, 'comment_count trigger');
select t.ok((select share_count from public.posts where id = '11111111-0000-0000-0000-000000000002') = 1, 'share_count trigger');
delete from public.likes where post_id = '11111111-0000-0000-0000-000000000001';
insert into public.likes (post_id) values ('11111111-0000-0000-0000-000000000001');
select t.as('aaaaaaaa-0000-0000-0000-000000000001');
select t.ok((select count(*) from public.notifications where type = 'like') = 1, 'one like notification per liker (unlike/like does not spam)');
select t.ok((select count(*) from public.notifications where type = 'comment') = 2, 'comment notifications');
select t.ok((select count(*) from public.notifications where type = 'reshare') = 1, 'reshare notification');
select t.ok((select count(*) from public.saves) = 0, 'saves are private to the saver');
delete from public.comments where id = '22222222-0000-0000-0000-000000000001';
select t.ok((select comment_count from public.posts where id = '11111111-0000-0000-0000-000000000001') = 1, 'post owner can delete a comment on their post');
update public.notifications set read_at = now();
select t.ok((select count(*) from public.notifications where read_at is null) = 0, 'mark notifications read');
select t.fails($$update public.notifications set type = 'like'$$, 'permission denied', 'only read_at is client-editable on notifications');
select t.as('cccccccc-0000-0000-0000-000000000003');
delete from public.comments where id = '22222222-0000-0000-0000-000000000002';
select t.as('aaaaaaaa-0000-0000-0000-000000000001');
select t.ok((select comment_count from public.posts where id = '11111111-0000-0000-0000-000000000001') = 1, 'a stranger cannot delete someone else''s comment');

-- emoji reactions (posts + comments)
select t.as('bbbbbbbb-0000-0000-0000-000000000002');
select t.ok((select kind from public.reactions where target_type = 'post' and target_id = '11111111-0000-0000-0000-000000000001' and user_id = auth.uid()) = 'like', 'inserting a like also stores a Like reaction');
update public.reactions set kind = 'wow' where target_type = 'post' and target_id = '11111111-0000-0000-0000-000000000001' and user_id = auth.uid();
select t.ok((select like_count from public.posts where id = '11111111-0000-0000-0000-000000000001') = 1, 'changing reaction type does not change like_count');
select t.ok((select kind from public.reactions where target_type = 'post' and target_id = '11111111-0000-0000-0000-000000000001' and user_id = auth.uid()) = 'wow', 'user can change their reaction');
select t.ok((select count(*) from public.likes where post_id = '11111111-0000-0000-0000-000000000001' and user_id = auth.uid()) = 0, 'likes row dropped when the reaction is no longer Like');
select t.fails($$insert into public.reactions (target_type, target_id, kind) values ('post', '11111111-0000-0000-0000-000000000001', 'love')$$, 'unique|duplicate', 'one reaction per user per target');
select t.fails($$update public.reactions set kind = 'care' where target_type = 'post' and target_id = '11111111-0000-0000-0000-000000000001'$$, 'check|reactions_kind', 'Care/hug and unknown kinds are rejected');
select t.as('aaaaaaaa-0000-0000-0000-000000000001');
select t.ok((select reaction from public.notifications where type = 'like' and comment_id is null and actor_id = 'bbbbbbbb-0000-0000-0000-000000000002') = 'wow', 'changing kind updates the existing like notification');
insert into public.reactions (target_type, target_id, kind) values ('comment', '22222222-0000-0000-0000-000000000002', 'love');
select t.ok((select like_count from public.posts where id = '11111111-0000-0000-0000-000000000001') = 1, 'comment reactions do not change the post like_count');
select t.as('bbbbbbbb-0000-0000-0000-000000000002');
select t.ok((select type from public.notifications where comment_id = '22222222-0000-0000-0000-000000000002' and actor_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 'like', 'comment author is notified of a reaction');
select t.ok((select reaction from public.notifications where comment_id = '22222222-0000-0000-0000-000000000002') = 'love', 'comment reaction kind is stored on the notification');
update public.reactions set kind = 'haha' where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
delete from public.reactions where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
select t.ok((select kind from public.reactions where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' and target_type = 'comment') = 'love', 'cannot change or delete someone else''s reaction');
delete from public.reactions where target_type = 'post' and target_id = '11111111-0000-0000-0000-000000000001' and user_id = auth.uid();
select t.ok((select like_count from public.posts where id = '11111111-0000-0000-0000-000000000001') = 0, 'removing a reaction decrements like_count');
select t.as('cccccccc-0000-0000-0000-000000000003');
select t.fails($$insert into public.reactions (target_type, target_id, kind) values ('post', '11111111-0000-0000-0000-000000000001', 'like')$$, 'row-level security', 'C cannot react to a post it cannot see');
select t.ok((select count(*) from public.reactions where target_id in ('11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002')) = 0, 'C cannot see reactions on a post it cannot see');

-- hide
select t.as('bbbbbbbb-0000-0000-0000-000000000002');
insert into public.hidden_posts (post_id) values ('11111111-0000-0000-0000-000000000002');
select t.ok((select count(*) from public.posts where id = '11111111-0000-0000-0000-000000000002') = 0, 'hidden post disappears for the hider');
delete from public.hidden_posts;

-- stories
select t.as('aaaaaaaa-0000-0000-0000-000000000001');
insert into public.stories (id, body, audience, expires_at) values ('33333333-0000-0000-0000-000000000001', 'Leg day', 'friends', now() + interval '30 days');
select t.ok((select expires_at - created_at from public.stories where id = '33333333-0000-0000-0000-000000000001') = interval '24 hours', 'story expiry forced to 24 h');
select t.as('bbbbbbbb-0000-0000-0000-000000000002');
select t.ok((select count(*) from public.stories) = 1, 'friend sees the active story');
select t.as('cccccccc-0000-0000-0000-000000000003');
select t.ok((select count(*) from public.stories) = 0, 'non-friend does not see a friends story');
reset role;
update public.stories set created_at = now() - interval '25 hours', expires_at = now() - interval '1 hour';
set role authenticated;
select t.as('bbbbbbbb-0000-0000-0000-000000000002');
select t.ok((select count(*) from public.stories) = 0, 'expired story is hidden');
select t.as('aaaaaaaa-0000-0000-0000-000000000001');
select t.ok((select count(*) from public.stories) = 1, 'author still sees own expired story (until cleanup)');

-- reports
select t.as('bbbbbbbb-0000-0000-0000-000000000002');
insert into public.reports (target_type, target_id, reason, details, status) values ('post', '11111111-0000-0000-0000-000000000002', 'spam', 'test', 'dismissed');
select t.ok((select status from public.reports) = 'open' and (select target_user_id from public.reports) = 'aaaaaaaa-0000-0000-0000-000000000001', 'report stored as open with the content owner');
select t.as('bbbbbbbb-0000-0000-0000-000000000002');
insert into public.reactions (target_type, target_id, kind) values ('post', '11111111-0000-0000-0000-000000000002', 'haha');
select t.as('aaaaaaaa-0000-0000-0000-000000000001');
select t.ok((select count(*) from public.reports) = 0, 'reports are visible only to the reporter');
select t.ok((select count(*) from public.reactions where user_id = 'bbbbbbbb-0000-0000-0000-000000000002') = 1, 'A can see B''s reaction before a block');

-- block
select public.social_block('bbbbbbbb-0000-0000-0000-000000000002');
select t.ok(not public.social_are_friends('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002'), 'block removes the friendship');
select t.ok((select friend_count from public.social_profiles where id = auth.uid()) = 0, 'friend_count back to 0');
select t.ok((select count(*) from public.social_profiles where id = 'bbbbbbbb-0000-0000-0000-000000000002') = 0, 'blocker no longer sees the blocked profile');
select t.ok((select count(*) from public.comments where author_id = 'bbbbbbbb-0000-0000-0000-000000000002') = 0, 'blocked person''s comments hidden');
select t.ok((select count(*) from public.reactions where user_id = 'bbbbbbbb-0000-0000-0000-000000000002') = 0, 'blocked person''s reactions hidden');
select t.ok((select count(*) from public.notifications where actor_id = 'bbbbbbbb-0000-0000-0000-000000000002') = 0, 'notifications between them cleared');
select t.ok((select username from public.social_my_blocks()) = 'athlete.b', 'block list shows the blocked handle');
select t.as('bbbbbbbb-0000-0000-0000-000000000002');
select t.ok((select count(*) from public.social_my_blocks()) = 0, 'block list is private to the blocker');
select t.ok((select count(*) from public.social_profiles where id = 'aaaaaaaa-0000-0000-0000-000000000001') = 0, 'blocked person no longer sees the blocker');
select t.ok((select count(*) from public.posts where author_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 0, 'blocked person sees none of the blocker''s posts (even public)');
select t.ok((select count(*) from storage.objects where bucket_id = 'social-media') = 0, 'blocked person cannot read the blocker''s photos');
select t.fails($$select public.social_send_request('aaaaaaaa-0000-0000-0000-000000000001')$$, 'not_allowed', 'blocked person cannot send a request');
select t.as('aaaaaaaa-0000-0000-0000-000000000001');
select public.social_unblock('bbbbbbbb-0000-0000-0000-000000000002');
select t.ok(not public.social_are_friends('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002'), 'unblock does not restore the friendship');
select t.ok((select count(*) from public.social_profiles where id = 'bbbbbbbb-0000-0000-0000-000000000002') = 1, 'unblocked profile visible again');

-- rate limit (posts: 30/day — A already has 2)
do $$ begin for i in 1..28 loop insert into public.posts (body) values ('p' || i); end loop; end $$;
select t.fails($$insert into public.posts (body) values ('one too many')$$, 'rate_limit', 'post rate limit (30/day)');

-- anon gets nothing
reset role;
set role anon;
select t.fails($$select count(*) from public.posts$$, 'permission denied', 'anon cannot read posts');
select t.fails($$select count(*) from public.social_profiles$$, 'permission denied', 'anon cannot read profiles');
select t.fails($$select count(*) from public.reactions$$, 'permission denied', 'anon cannot read reactions');
select t.fails($$select public.social_send_request('aaaaaaaa-0000-0000-0000-000000000001')$$, 'permission denied', 'anon cannot call RPCs');
reset role;
-- deleting the account cascades everything
delete from auth.users where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select t.ok((select count(*) from public.posts where author_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 0, 'account deletion removes posts');
select t.ok((select count(*) from public.social_private where id = 'aaaaaaaa-0000-0000-0000-000000000001') = 0, 'account deletion removes the birth date');
select t.ok((select count(*) from pg_tables where schemaname = 'public' and not rowsecurity) = 0, 'every public table has RLS on');
\echo ALL SQL CHECKS PASSED
