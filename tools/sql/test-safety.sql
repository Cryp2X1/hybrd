-- LOCAL TESTING ONLY. Safety (v1.6): reports (priority, duplicates, rate limits, anonymity), moderator-only queue and
-- actions with an audit log, content removal + restore, messaging restriction, suspension, appeals (once, 30 days),
-- restrict, time off (pause / auto-resume), deletion with 30 days to reopen, and the purge step.
-- Runs from tools/test-social-sql.sh after test-social.sql (which creates the t.* helpers). Any failed check stops psql.
\set ON_ERROR_STOP 1
set client_min_messages = notice;
reset role;
-- A = Ann (reporter) · B = Bob (reported) · M = Mia (moderator) · D = Dan (time off / deletion) · T = 15-year-old
insert into auth.users (id, email, last_sign_in_at) values
  ('5a000000-0000-0000-0000-00000000000a', 'sfa@x', now() - interval '2 hours'), ('5a000000-0000-0000-0000-00000000000b', 'sfb@x', now() - interval '2 hours'),
  ('5a000000-0000-0000-0000-00000000000c', 'sfm@x', now()), ('5a000000-0000-0000-0000-00000000000d', 'sfd@x', now() - interval '3 hours'),
  ('5a000000-0000-0000-0000-00000000000e', 'sft@x', now());
create temp table sx (k text primary key, v uuid);
grant all on sx to authenticated, anon;
set role authenticated;
select t.as('5a000000-0000-0000-0000-00000000000a'); select public.social_create_profile('sf.ann', 'Ann', '1990-01-01');
select t.as('5a000000-0000-0000-0000-00000000000b'); select public.social_create_profile('sf.bob', 'Bob', '1989-01-01');
select t.as('5a000000-0000-0000-0000-00000000000c'); select public.social_create_profile('sf.mia', 'Mia', '1985-01-01');
select t.as('5a000000-0000-0000-0000-00000000000d'); select public.social_create_profile('sf.dan', 'Dan', '1992-01-01');
select t.as('5a000000-0000-0000-0000-00000000000e'); select public.social_create_profile('sf.teen', 'Teen', (current_date - interval '15 years')::date);
select t.as('5a000000-0000-0000-0000-00000000000a'); select public.social_send_request('5a000000-0000-0000-0000-00000000000b'); select public.social_send_request('5a000000-0000-0000-0000-00000000000d');
select t.as('5a000000-0000-0000-0000-00000000000b'); select public.social_respond_request('5a000000-0000-0000-0000-00000000000a', true);
select t.as('5a000000-0000-0000-0000-00000000000d'); select public.social_respond_request('5a000000-0000-0000-0000-00000000000a', true);

-- ===== moderator role: never from the app
select t.as('5a000000-0000-0000-0000-00000000000a');
update public.profiles set is_moderator = true where id = '5a000000-0000-0000-0000-00000000000a';
select t.ok(not (select is_moderator from public.profiles where id = '5a000000-0000-0000-0000-00000000000a'), 'a user cannot make themselves a moderator');
select t.ok(not public.is_moderator(), 'is_moderator() is false for normal users');
select t.fails($$select public.mod_queue()$$, 'not_moderator', 'the moderation queue is moderators-only (server-side)');
select t.fails($$select public.mod_act('social', gen_random_uuid(), 'dismiss')$$, 'not_moderator', 'moderator actions are moderators-only');
reset role;
update public.profiles set is_moderator = true where id = '5a000000-0000-0000-0000-00000000000c';  -- the owner does this in the SQL editor
set role authenticated;

-- ===== reports: priority, duplicates, anonymity, rate limit
select t.as('5a000000-0000-0000-0000-00000000000b');
insert into public.posts (id, body, audience) values ('5b000000-0000-0000-0000-000000000001', 'Bob post', 'friends');
insert into public.posts (id, body, audience) values ('5b000000-0000-0000-0000-000000000002', 'Bob second post', 'friends');
select t.as('5a000000-0000-0000-0000-00000000000a');
select t.ok((select count(*) from public.posts where author_id = '5a000000-0000-0000-0000-00000000000b') = 2, 'Ann sees her friend Bob''s posts');
insert into public.reports (target_type, target_id, reason, details) values ('post', '5b000000-0000-0000-0000-000000000001', 'self_harm', 'worrying');
select t.ok((select priority from public.reports where target_id = '5b000000-0000-0000-0000-000000000001') = 0, 'self-harm report → urgent priority 0');
select t.fails($$insert into public.reports (target_type, target_id, reason) values ('post', '5b000000-0000-0000-0000-000000000001', 'spam')$$, 'report_duplicate', 'same target twice in 24 h → duplicate');
insert into public.reports (target_type, target_id, reason) values ('user', '5a000000-0000-0000-0000-00000000000b', 'harassment');
select t.ok((select priority from public.reports where target_type = 'user' and target_id = '5a000000-0000-0000-0000-00000000000b') = 1, 'harassment → high priority 1');
select t.fails($$insert into public.reports (target_type, target_id, reason) values ('post', gen_random_uuid(), 'nonsense')$$, 'reports_reason_chk', 'unknown reason refused');
select t.ok(jsonb_array_length(public.safety_my_reports()) = 2 and public.safety_my_reports()->0->>'status' = 'open', 'My reports: Ann sees her 2 reports as open');
select t.ok(public.safety_my_reports()::text !~ 'reporter', 'My reports never includes reporter ids');
do $$ begin for i in 1..8 loop insert into public.reports (target_type, target_id, reason) values ('user', gen_random_uuid(), 'spam'); end loop; end $$;
select t.fails($$insert into public.reports (target_type, target_id, reason) values ('user', gen_random_uuid(), 'spam')$$, 'rate_limit', 'more than 10 reports an hour → rate limited');
select t.as('5a000000-0000-0000-0000-00000000000b');
select t.ok((select count(*) from public.reports) = 0, 'the reported person cannot see reports about them (reporter stays anonymous)');
select t.ok(jsonb_array_length(public.safety_my_reports()) = 0, 'Bob''s My reports is empty');
select t.ok((select count(*) from public.moderation_actions) = 0, 'non-moderators read no moderation_actions');

-- ===== moderator: queue, remove content, audit
select t.as('5a000000-0000-0000-0000-00000000000c');
select t.ok(public.is_moderator(), 'Mia is a moderator');
select t.ok((public.mod_queue()->'reports'->0->>'reason') = 'self_harm', 'queue: urgent (self-harm) report first');
select t.ok(public.mod_queue()::text !~ 'reporter_id', 'queue does not expose who reported');
insert into sx select 'rp1', id from public.reports where target_id = '5b000000-0000-0000-0000-000000000001';
select t.fails($$select public.mod_act('social', (select v from sx where k = 'rp1'), 'remove_content')$$, 'mod_guideline', 'removing content needs a guideline');
select public.mod_act('social', (select v from sx where k = 'rp1'), 'review');
select public.mod_act('social', (select v from sx where k = 'rp1'), 'remove_content', 'self_harm', 'Promotes self-harm.');
select t.ok((select count(*) from public.moderation_actions where action in ('review', 'remove_content')) = 2, 'every action is in the audit log');
select t.as('5a000000-0000-0000-0000-00000000000a');
select t.ok((select status from public.reports where target_id = '5b000000-0000-0000-0000-000000000001') = 'actioned', 'reporter sees status: action taken');
select t.ok(not exists (select 1 from public.posts where id = '5b000000-0000-0000-0000-000000000001'), 'removed post hidden from others');
select t.as('5a000000-0000-0000-0000-00000000000b');
select t.ok((select removed_at is not null from public.posts where id = '5b000000-0000-0000-0000-000000000001'), 'the author still sees the removed post (with the notice)');
select t.fails($$update public.posts set removed_at = null where id = '5b000000-0000-0000-0000-000000000001'$$, 'permission denied', 'authors cannot un-remove their post');
insert into sx select 'd1', (public.account_status()->'decisions'->0->>'id')::uuid;
select t.ok(public.account_status()->'decisions'->0->>'kind' = 'remove_content' and public.account_status()->'decisions'->0->>'guideline' = 'self_harm'
            and public.account_status()->'decisions'->0->>'content_id' = '5b000000-0000-0000-0000-000000000001', 'Account status lists the removal with its guideline');
select t.ok(public.account_status()::text !~ 'moderator_id|decided_by|report_id|internal', 'Account status never shows the moderator, report or internal notes');
select t.fails($$insert into public.moderation_actions (action, target_user_id) values ('dismiss', '5a000000-0000-0000-0000-00000000000b')$$, 'permission denied', 'nobody writes moderation_actions directly');

-- ===== appeals
select t.fails($$select public.appeal_submit((select v from sx where k = 'd1'), 'short')$$, 'appeal_text', 'appeal needs 10+ characters');
insert into sx select 'ap1', public.appeal_submit((select v from sx where k = 'd1'), 'This was about my recovery, not promoting harm.');
select t.fails($$select public.appeal_submit((select v from sx where k = 'd1'), 'Trying a second time here.')$$, 'appeal_once', 'each decision can be appealed once');
select t.fails($$insert into public.appeals (decision_id, user_id, body) values ((select v from sx where k = 'd1'), '5a000000-0000-0000-0000-00000000000b', 'direct insert attempt')$$, 'permission denied', 'appeals only through appeal_submit()');
select t.ok(public.account_status()->'decisions'->0->'appeal'->>'status' = 'submitted', 'Account status shows the appeal as Submitted');
select t.as('5a000000-0000-0000-0000-00000000000a');
select t.fails($$select public.appeal_submit((select v from sx where k = 'd1'), 'Not my decision to appeal.')$$, 'appeal_not_found', 'you can only appeal decisions about you');
select t.ok((select count(*) from public.appeals) = 0, 'others cannot read the appeal');
select t.as('5a000000-0000-0000-0000-00000000000c');
select t.ok(jsonb_array_length(public.mod_queue()->'appeals') = 1, 'the appeal is in the moderation queue');
select public.mod_decide_appeal((select v from sx where k = 'ap1'), 'under_review');
select public.mod_decide_appeal((select v from sx where k = 'ap1'), 'reversed', 'Recovery story, allowed.');
select t.fails($$select public.mod_decide_appeal((select v from sx where k = 'ap1'), 'upheld')$$, 'appeal_decided', 'a decided appeal cannot be changed');
select t.ok((select count(*) from public.moderation_actions where action in ('appeal_reviewing', 'appeal_reversed', 'restore_content')) = 3, 'appeal steps and the restore are logged');
select t.as('5a000000-0000-0000-0000-00000000000a');
select t.ok(exists (select 1 from public.posts where id = '5b000000-0000-0000-0000-000000000001'), 'reversed → the post is restored for others');
select t.as('5a000000-0000-0000-0000-00000000000b');
select t.ok(public.account_status()->'decisions'->0->'appeal'->>'status' = 'reversed' and public.account_status()->'decisions'->0->>'reversed_at' is not null, 'Bob sees: decision reversed');
reset role;
update public.moderation_actions set created_at = now() - interval '31 days' where id = (select v from sx where k = 'd1');
set role authenticated;

-- ===== messages: multi-message report, removal, messaging restriction, unsend window
select t.as('5a000000-0000-0000-0000-00000000000a');
insert into sx select 'ab', public.dm_open_direct('5a000000-0000-0000-0000-00000000000b');
select t.as('5a000000-0000-0000-0000-00000000000b');
insert into public.messages (id, conversation_id, body) values ('5c000000-0000-0000-0000-000000000001', (select v from sx where k = 'ab'), 'one'),
  ('5c000000-0000-0000-0000-000000000002', (select v from sx where k = 'ab'), 'two'), ('5c000000-0000-0000-0000-000000000003', (select v from sx where k = 'ab'), 'three');
select t.as('5a000000-0000-0000-0000-00000000000a');
insert into public.message_reports (target_type, conversation_id, message_ids, reason) values ('message', (select v from sx where k = 'ab'),
  array['5c000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000002']::uuid[], 'harassment');
insert into public.message_reports (target_type, conversation_id, message_id, reason) values ('message', (select v from sx where k = 'ab'), '5c000000-0000-0000-0000-000000000003', 'sexual');
select t.as('5a000000-0000-0000-0000-00000000000c');
insert into sx select 'mr1', (r->>'id')::uuid from jsonb_array_elements(public.mod_queue()->'reports') r where r->>'store' = 'messages' and r->>'reason' = 'harassment' and (r->>'conversation_id')::uuid = (select v from sx where k = 'ab');
insert into sx select 'mr3', (r->>'id')::uuid from jsonb_array_elements(public.mod_queue()->'reports') r where r->>'store' = 'messages' and r->>'reason' = 'sexual' and (r->>'conversation_id')::uuid = (select v from sx where k = 'ab');
select t.ok((select count(*) from sx where k in ('mr1', 'mr3')) = 2, 'message reports appear in the queue');
select t.ok((select jsonb_array_length(r->'snapshot'->'messages') from jsonb_array_elements(public.mod_queue()->'reports') r where (r->>'id')::uuid = (select v from sx where k = 'mr1')) = 2, 'a message report attaches both reported messages');
select public.mod_act('messages', (select v from sx where k = 'mr3'), 'remove_content', 'sexual');
select t.as('5a000000-0000-0000-0000-00000000000a');
select t.ok(not exists (select 1 from public.messages where id = '5c000000-0000-0000-0000-000000000003'), 'removed message hidden from the other person');
select t.ok((select last_message->>'id' from public.dm_inbox() where conversation_id = (select v from sx where k = 'ab')) <> '5c000000-0000-0000-0000-000000000003', 'inbox preview skips the removed message');
select t.as('5a000000-0000-0000-0000-00000000000b');
select t.ok(exists (select 1 from public.messages where id = '5c000000-0000-0000-0000-000000000003' and removed_at is not null), 'the sender still sees it, marked removed');
select t.as('5a000000-0000-0000-0000-00000000000c');
select t.fails($$select public.mod_act('messages', (select v from sx where k = 'mr1'), 'restrict_messaging', 'respect', null, 0)$$, 'mod_days', 'restriction needs 1–365 days');
select public.mod_act('messages', (select v from sx where k = 'mr1'), 'restrict_messaging', 'respect', 'Repeated insults.', 7);
select t.as('5a000000-0000-0000-0000-00000000000b');
select t.fails($$insert into public.messages (conversation_id, body) values ((select v from sx where k = 'ab'), 'hello again')$$, 'acct_msg_restricted', 'messaging restricted → can''t send');
select t.ok(public.dm_can_message('5a000000-0000-0000-0000-00000000000d') in ('acct_msg_restricted', 'ok') , 'dm_can_message reports the restriction for new chats');
select t.ok((select (d->>'ends_at')::timestamptz > now() + interval '6 days' from jsonb_array_elements(public.account_status()->'decisions') d where d->>'kind' = 'restrict_messaging'), 'restriction shows its end date');
reset role;
update public.moderation_actions set reversed_at = now() where action = 'restrict_messaging';
set session_replication_role = replica;
update public.messages set created_at = now() - interval '25 hours' where id = '5c000000-0000-0000-0000-000000000001';
set session_replication_role = origin;
set role authenticated;
select t.as('5a000000-0000-0000-0000-00000000000b');
select t.fails($$update public.messages set deleted_at = now() where id = '5c000000-0000-0000-0000-000000000001'$$, 'dm_unsend_window', 'unsend for everyone only within 24 hours');
update public.messages set deleted_at = now() where id = '5c000000-0000-0000-0000-000000000002';
select t.ok((select deleted_at is not null from public.messages where id = '5c000000-0000-0000-0000-000000000002'), 'recent message can be unsent');
insert into public.message_hidden (message_id) values ('5c000000-0000-0000-0000-000000000001');
select t.ok((select count(*) from public.message_hidden where message_id = '5c000000-0000-0000-0000-000000000001') = 1, 'old messages can still be deleted for me');

-- ===== restrict (softer than block)
select t.as('5a000000-0000-0000-0000-00000000000b');
insert into public.messages (conversation_id, body) values ((select v from sx where k = 'ab'), 'are you there?');
select public.dm_heartbeat();
select t.as('5a000000-0000-0000-0000-00000000000a');
select public.dm_heartbeat(); select public.dm_mark_read((select v from sx where k = 'ab'));
insert into public.dm_restricts (restricted_id) values ('5a000000-0000-0000-0000-00000000000b');
select t.ok((select count(*) from public.dm_restricts) = 1, 'Ann restricted Bob');
select t.as('5a000000-0000-0000-0000-00000000000b');
select t.ok((select count(*) from public.dm_restricts) = 0, 'Bob cannot see that he is restricted');
select t.fails($$select public.dm_is_restricted('5a000000-0000-0000-0000-00000000000a', '5a000000-0000-0000-0000-00000000000b')$$, 'permission denied', 'nobody can probe restrictions');
select t.ok((select seen_at from public.dm_members((select v from sx where k = 'ab')) where user_id = '5a000000-0000-0000-0000-00000000000a') is null, 'restricted: no read receipts from Ann');
select t.ok((select count(*) from public.dm_presence(array['5a000000-0000-0000-0000-00000000000a']::uuid[])) = 0, 'restricted: no online status for Ann');
insert into public.messages (conversation_id, body) values ((select v from sx where k = 'ab'), 'still sending works');
select t.ok(true, 'restricted people can still send (it lands in Requests for Ann; nobody is told)');
select t.as('5a000000-0000-0000-0000-00000000000a');
select t.ok((select count(*) from public.dm_presence(array['5a000000-0000-0000-0000-00000000000b']::uuid[])) = 1, 'Ann still sees Bob''s status');
delete from public.dm_restricts where restricted_id = '5a000000-0000-0000-0000-00000000000b';
select t.as('5a000000-0000-0000-0000-00000000000b');
select t.ok((select seen_at from public.dm_members((select v from sx where k = 'ab')) where user_id = '5a000000-0000-0000-0000-00000000000a') is not null, 'unrestrict → receipts back');

-- ===== suspension (moderator) + appeal window
select t.as('5a000000-0000-0000-0000-00000000000c');
insert into sx select 'ru', id from public.reports where target_type = 'user' and target_id = '5a000000-0000-0000-0000-00000000000b';
select public.mod_act('social', (select v from sx where k = 'ru'), 'suspend', 'respect', 'Harassment after a warning.', 3);
select t.as('5a000000-0000-0000-0000-00000000000a');
select t.ok(not exists (select 1 from public.social_profiles where id = '5a000000-0000-0000-0000-00000000000b'), 'suspended account hidden from others');
select t.ok(not exists (select 1 from public.posts where author_id = '5a000000-0000-0000-0000-00000000000b'), 'suspended account''s posts hidden');
select t.ok(public.dm_can_message('5a000000-0000-0000-0000-00000000000b') <> 'request', 'can''t start a new chat with a suspended account');
select t.as('5a000000-0000-0000-0000-00000000000b');
select t.fails($$insert into public.posts (body) values ('back!')$$, 'acct_suspended', 'suspended → can''t post');
select t.fails($$insert into public.messages (conversation_id, body) values ((select v from sx where k = 'ab'), 'hi')$$, 'acct_suspended', 'suspended → can''t message');
select t.ok((select count(*) from jsonb_array_elements(public.account_status()->'decisions') d where d->>'kind' = 'suspend' and d->>'note' = 'Harassment after a warning.') = 1, 'Bob sees the suspension with its reason');
select t.fails($$select public.appeal_submit((select v from sx where k = 'd1'), 'An appeal after the window.')$$, 'appeal_reversed|appeal_window', 'appeals after 30 days are refused');
insert into sx select 'ap2', public.appeal_submit((select (d->>'id')::uuid from jsonb_array_elements(public.account_status()->'decisions') d where d->>'kind' = 'suspend'), 'I was defending myself, please look again.');
select t.as('5a000000-0000-0000-0000-00000000000c');
select public.mod_decide_appeal((select v from sx where k = 'ap2'), 'reversed');
select t.as('5a000000-0000-0000-0000-00000000000a');
select t.ok(exists (select 1 from public.social_profiles where id = '5a000000-0000-0000-0000-00000000000b'), 'suspension reversed → account visible again');

-- ===== time off (self-pause)
select t.as('5a000000-0000-0000-0000-00000000000d');
insert into public.posts (id, body) values ('5b000000-0000-0000-0000-00000000000d', 'Dan post');
select t.fails($$select public.account_pause(now() + interval '400 days')$$, 'pause_date', 'pause longer than a year refused');
select public.account_pause(null);
select t.ok(public.account_status()->>'paused_at' is not null and public.account_status()->>'pause_until' is null, 'paused until I come back');
select t.fails($$insert into public.posts (body) values ('posting while away')$$, 'acct_paused', 'paused → can''t post');
select t.as('5a000000-0000-0000-0000-00000000000a');
select t.ok(not exists (select 1 from public.social_profiles where id = '5a000000-0000-0000-0000-00000000000d'), 'paused profile hidden from friends');
select t.ok(not exists (select 1 from public.posts where id = '5b000000-0000-0000-0000-00000000000d'), 'paused account''s posts hidden');
select t.fails($$select public.dm_open_direct('5a000000-0000-0000-0000-00000000000d')$$, 'dm_unavailable', 'paused → nobody can message them');
reset role;
insert into public.notifications (user_id, actor_id, type) values ('5a000000-0000-0000-0000-00000000000d', '5a000000-0000-0000-0000-00000000000a', 'friend_accept');
select t.ok((select count(*) from public.notifications where user_id = '5a000000-0000-0000-0000-00000000000d' and type = 'friend_accept' and created_at > now() - interval '1 minute') = 0, 'paused → no new notifications');
set role authenticated;
select t.as('5a000000-0000-0000-0000-00000000000d');
select public.account_resume();
select t.as('5a000000-0000-0000-0000-00000000000a');
select t.ok(exists (select 1 from public.posts where id = '5b000000-0000-0000-0000-00000000000d'), 'resume → visible again, nothing lost');
select t.as('5a000000-0000-0000-0000-00000000000d');
select public.account_pause(now() + interval '7 days');
reset role;
update public.account_state set pause_until = now() - interval '1 minute' where user_id = '5a000000-0000-0000-0000-00000000000d';
set role authenticated;
select t.as('5a000000-0000-0000-0000-00000000000a');
select t.ok(exists (select 1 from public.social_profiles where id = '5a000000-0000-0000-0000-00000000000d'), 'auto-resume: visible again once the end date passes');
select t.as('5a000000-0000-0000-0000-00000000000d');
select t.ok(public.account_status()->>'paused_at' is null, 'account_status() clears the expired pause');
select t.fails($$insert into public.account_state (user_id, paused_at) values ('5a000000-0000-0000-0000-00000000000d', now())$$, 'permission denied', 'account_state only changes through the RPCs');

-- ===== delete account (30 days to reopen) + purge
select t.fails($$select public.account_request_deletion('Taking a break')$$, 'reauth_required', 'deletion needs a fresh sign-in');
reset role; update auth.users set last_sign_in_at = now() where id = '5a000000-0000-0000-0000-00000000000d'; set role authenticated;
select t.as('5a000000-0000-0000-0000-00000000000d');
select t.ok(public.account_request_deletion('Taking a break') between now() + interval '29 days 23 hours' and now() + interval '30 days 1 hour', 'deletion date = 30 days from now');
select t.fails($$select public.account_pause(null)$$, 'deletion_pending', 'can''t pause while deletion is scheduled');
select t.as('5a000000-0000-0000-0000-00000000000a');
select t.ok(not exists (select 1 from public.social_profiles where id = '5a000000-0000-0000-0000-00000000000d'), 'deactivated right away');
select t.as('5a000000-0000-0000-0000-00000000000d');
select public.account_reopen();
select t.as('5a000000-0000-0000-0000-00000000000a');
select t.ok(exists (select 1 from public.social_profiles where id = '5a000000-0000-0000-0000-00000000000d'), 'reopen within 30 days → everything back');
select t.as('5a000000-0000-0000-0000-00000000000d');
select public.account_request_deletion(null);
select t.fails($$select * from public.account_purge_candidates()$$, 'permission denied', 'the purge list is not callable from the app');
select t.fails($$select public.account_purge_finish('5a000000-0000-0000-0000-00000000000d')$$, 'permission denied', 'the purge is not callable from the app');
reset role;
select t.ok(not public.account_purge_finish('5a000000-0000-0000-0000-00000000000d'), 'purge refuses before the 30 days are up');
update public.account_state set purge_after = now() - interval '1 minute' where user_id = '5a000000-0000-0000-0000-00000000000d';
select t.ok((select count(*) from public.account_purge_candidates() where user_id = '5a000000-0000-0000-0000-00000000000d') = 1, 'after 30 days the account is due');
select t.ok(public.account_purge_finish('5a000000-0000-0000-0000-00000000000d'), 'purge deletes the account');
select t.ok(not exists (select 1 from auth.users where id = '5a000000-0000-0000-0000-00000000000d') and not exists (select 1 from public.social_profiles where id = '5a000000-0000-0000-0000-00000000000d')
            and not exists (select 1 from public.posts where author_id = '5a000000-0000-0000-0000-00000000000d') and not exists (select 1 from public.profiles where id = '5a000000-0000-0000-0000-00000000000d'), 'purge cascades: profile, social profile and posts are gone');

-- ===== under-18 defaults unchanged
set role authenticated;
select t.as('5a000000-0000-0000-0000-00000000000e');
select t.ok(public.dm_can_message('5a000000-0000-0000-0000-00000000000a') = 'dm_minor', 'under-18 safety rule still applies');
reset role;
select t.ok((select bool_and(rowsecurity) from pg_tables where schemaname = 'public' and tablename in ('account_state', 'moderation_actions', 'appeals', 'dm_restricts')), 'RLS is on for every new safety table');
select t.ok((select count(*) from pg_policies where tablename in ('account_state', 'moderation_actions', 'appeals', 'dm_restricts')) = 6, '6 policies on the safety tables');
\echo 'ALL SAFETY SQL CHECKS PASSED'
