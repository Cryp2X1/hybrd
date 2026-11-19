-- LOCAL TESTING ONLY. Calls: who can call whom, ringing / answer / decline / busy / Do not disturb / timeouts,
-- group calls (max 4 in a call), the call card in the chat, history, RLS and the private Realtime topic check.
-- Runs from tools/test-social-sql.sh after test-messages.sql (uses the t.* helpers from test-social.sql).
-- Users: A, B adults and friends · C adult stranger (message request to A) · D adult, A's friend, "friends only" calls
--        E 15 years old, A's friend · F adult, B's friend, not A's (group member) · G adult outsider
\set ON_ERROR_STOP 1
set client_min_messages = notice;
reset role;
insert into auth.users (id, email) values ('ca000000-0000-0000-0000-00000000000a', 'ca@x'), ('ca000000-0000-0000-0000-00000000000b', 'cb@x'), ('ca000000-0000-0000-0000-00000000000c', 'cc@x'),
  ('ca000000-0000-0000-0000-00000000000d', 'cd@x'), ('ca000000-0000-0000-0000-00000000000e', 'ce@x'), ('ca000000-0000-0000-0000-00000000000f', 'cf@x'), ('ca000000-0000-0000-0000-000000000001', 'cg@x');
create temp table cids (k text primary key, v uuid);
grant all on cids to authenticated, anon;
set role authenticated;
select t.as('ca000000-0000-0000-0000-00000000000a'); select public.social_create_profile('call.a', 'Call A', '1990-01-01');
select t.as('ca000000-0000-0000-0000-00000000000b'); select public.social_create_profile('call.b', 'Call B', '1991-01-01');
select t.as('ca000000-0000-0000-0000-00000000000c'); select public.social_create_profile('call.c', 'Call C', '1985-01-01');
select t.as('ca000000-0000-0000-0000-00000000000d'); select public.social_create_profile('call.d', 'Call D', '1992-01-01');
select t.as('ca000000-0000-0000-0000-00000000000e'); select public.social_create_profile('call.e', 'Call E', (current_date - interval '15 years')::date);
select t.as('ca000000-0000-0000-0000-00000000000f'); select public.social_create_profile('call.f', 'Call F', '1989-01-01');
select t.as('ca000000-0000-0000-0000-000000000001'); select public.social_create_profile('call.g', 'Call G', '1988-01-01');
-- friendships: A–B, A–D, A–E, B–F, B–D, D–F
select t.as('ca000000-0000-0000-0000-00000000000a'); select public.social_send_request('ca000000-0000-0000-0000-00000000000b'); select t.as('ca000000-0000-0000-0000-00000000000b'); select public.social_respond_request('ca000000-0000-0000-0000-00000000000a', true);
select t.as('ca000000-0000-0000-0000-00000000000a'); select public.social_send_request('ca000000-0000-0000-0000-00000000000d'); select t.as('ca000000-0000-0000-0000-00000000000d'); select public.social_respond_request('ca000000-0000-0000-0000-00000000000a', true);
select t.as('ca000000-0000-0000-0000-00000000000a'); select public.social_send_request('ca000000-0000-0000-0000-00000000000e'); select t.as('ca000000-0000-0000-0000-00000000000e'); select public.social_respond_request('ca000000-0000-0000-0000-00000000000a', true);
select t.as('ca000000-0000-0000-0000-00000000000b'); select public.social_send_request('ca000000-0000-0000-0000-00000000000f'); select t.as('ca000000-0000-0000-0000-00000000000f'); select public.social_respond_request('ca000000-0000-0000-0000-00000000000b', true);
select t.as('ca000000-0000-0000-0000-00000000000b'); select public.social_send_request('ca000000-0000-0000-0000-00000000000d'); select t.as('ca000000-0000-0000-0000-00000000000d'); select public.social_respond_request('ca000000-0000-0000-0000-00000000000b', true);
select t.as('ca000000-0000-0000-0000-00000000000d'); select public.social_send_request('ca000000-0000-0000-0000-00000000000f'); select t.as('ca000000-0000-0000-0000-00000000000f'); select public.social_respond_request('ca000000-0000-0000-0000-00000000000d', true);

-- chats
select t.as('ca000000-0000-0000-0000-00000000000a');
insert into cids select 'ab', public.dm_open_direct('ca000000-0000-0000-0000-00000000000b');
insert into cids select 'ad', public.dm_open_direct('ca000000-0000-0000-0000-00000000000d');
insert into cids select 'ae', public.dm_open_direct('ca000000-0000-0000-0000-00000000000e');
select t.as('ca000000-0000-0000-0000-00000000000c');
insert into cids select 'ca', public.dm_open_direct('ca000000-0000-0000-0000-00000000000a');
insert into public.messages (conversation_id, body) values ((select v from cids where k = 'ca'), 'hi, can we talk?');

-- ===== 1:1: start → ring → answer → hang up
select t.as('ca000000-0000-0000-0000-00000000000a');
insert into cids select 'c1', (public.call_start((select v from cids where k = 'ab'), 'video')->>'id')::uuid;
select t.ok((select status from public.calls where id = (select v from cids where k = 'c1')) = 'ringing', 'call_start: a ringing call');
select t.ok((select count(*) from public.call_participants where call_id = (select v from cids where k = 'c1')) = 2, 'caller + callee are participants');
select t.fails($$select public.call_start((select v from cids where k = 'ad'), 'voice')$$, 'call_busy', 'one call at a time');
select t.fails($$select quiet from public.call_participants$$, 'permission denied', 'the Do-not-disturb flag is not readable by the app');
select t.as('ca000000-0000-0000-0000-00000000000b');
select t.ok((select count(*) from public.call_incoming() where call_id = (select v from cids where k = 'c1') and kind = 'video' and caller_id = 'ca000000-0000-0000-0000-00000000000a') = 1, 'call_incoming: B sees the ring');
select t.ok(not public.call_topic_ok('call:' || (select v from cids where k = 'c1')), 'Realtime topic: not before answering');
select public.call_answer((select v from cids where k = 'c1'));
select t.ok((select status from public.calls where id = (select v from cids where k = 'c1')) = 'active' and (select answered_at from public.calls where id = (select v from cids where k = 'c1')) is not null, 'answer → active');
select t.ok(public.call_topic_ok('call:' || (select v from cids where k = 'c1')), 'Realtime topic: allowed once joined');
select t.ok(not public.call_topic_ok('call:nope') and not public.call_topic_ok('dm:' || (select v from cids where k = 'c1')) and not public.call_topic_ok(null), 'Realtime topic: junk refused');
select t.ok(public.call_heartbeat((select v from cids where k = 'c1')) = 'active', 'heartbeat returns the status');
select t.as('ca000000-0000-0000-0000-000000000001');
select t.ok(not public.call_topic_ok('call:' || (select v from cids where k = 'c1')), 'Realtime topic: outsider refused');
select t.ok((select count(*) from public.calls) = 0 and (select count(*) from public.call_participants) = 0, 'outsider: sees no calls or participants');
select t.ok(public.call_heartbeat((select v from cids where k = 'c1')) is null, 'outsider: heartbeat says nothing');
select public.call_leave((select v from cids where k = 'c1'), 'hangup');
select t.as('ca000000-0000-0000-0000-00000000000a');
select t.ok((select status from public.calls where id = (select v from cids where k = 'c1')) = 'active', 'outsider can''t end someone''s call');
reset role;
update public.calls set answered_at = now() - interval '95 seconds' where id = (select v from cids where k = 'c1');
set role authenticated;
select t.as('ca000000-0000-0000-0000-00000000000a');
select public.call_leave((select v from cids where k = 'c1'), 'hangup');
select t.ok((select status from public.calls where id = (select v from cids where k = 'c1')) = 'ended', 'hang up → ended');
select t.ok((select meta->'call'->>'status' from public.messages where conversation_id = (select v from cids where k = 'ab') and kind = 'system' and meta->>'type' = 'call') = 'ended'
        and (select (meta->'call'->>'durationSec')::int from public.messages where conversation_id = (select v from cids where k = 'ab') and kind = 'system' and meta->>'type' = 'call') between 94 and 97
        and (select meta->>'actor' from public.messages where conversation_id = (select v from cids where k = 'ab') and kind = 'system' and meta->>'type' = 'call') = 'ca000000-0000-0000-0000-00000000000a', 'call card in the chat: status, duration, caller');
select public.call_leave((select v from cids where k = 'c1'), 'hangup');
select t.ok((select count(*) from public.messages where conversation_id = (select v from cids where k = 'ab') and meta->>'type' = 'call') = 1, 'the call card is posted once');
select t.as('ca000000-0000-0000-0000-00000000000b');
select t.ok((select status from public.call_history(10) where call_id = (select v from cids where k = 'c1')) = 'ended' and (select peers from public.call_history(10) where call_id = (select v from cids where k = 'c1')) = array['ca000000-0000-0000-0000-00000000000a'::uuid], 'call_history for the callee');
select t.ok(not public.call_topic_ok('call:' || (select v from cids where k = 'c1')), 'Realtime topic: closed after the call');
select t.fails($$select public.call_answer((select v from cids where k = 'c1'))$$, 'call_ended', 'can''t answer an ended call');

-- ===== no direct writes
select t.fails($$insert into public.calls (conversation_id, caller_id) values ((select v from cids where k = 'ab'), 'ca000000-0000-0000-0000-00000000000b')$$, 'permission denied', 'no direct insert into calls');
select t.fails($$update public.calls set status = 'ringing' where id = (select v from cids where k = 'c1')$$, 'permission denied', 'no direct update of calls');
select t.fails($$insert into public.call_participants (call_id, user_id) values ((select v from cids where k = 'c1'), 'ca000000-0000-0000-0000-000000000001')$$, 'permission denied', 'no direct insert into call_participants');
select t.fails($$select public.call_finish((select v from cids where k = 'c1'), 'ended')$$, 'permission denied', 'internal helpers are not callable');
select t.fails($$select public.call_who('ca000000-0000-0000-0000-00000000000a')$$, 'permission denied', 'other people''s call settings are not readable');

-- ===== decline, cancel, timeout, busy
select t.as('ca000000-0000-0000-0000-00000000000a');
insert into cids select 'c2', (public.call_start((select v from cids where k = 'ab'), 'voice')->>'id')::uuid;
select t.as('ca000000-0000-0000-0000-00000000000b'); select public.call_decline((select v from cids where k = 'c2'));
select t.ok((select status from public.calls where id = (select v from cids where k = 'c2')) = 'declined', 'decline → declined');
select t.as('ca000000-0000-0000-0000-00000000000a');
insert into cids select 'c3', (public.call_start((select v from cids where k = 'ab'), 'voice')->>'id')::uuid;
select public.call_leave((select v from cids where k = 'c3'), 'hangup');
select t.ok((select status from public.calls where id = (select v from cids where k = 'c3')) = 'canceled', 'caller hangs up before an answer → canceled');
select t.as('ca000000-0000-0000-0000-00000000000b');
select t.ok((select status from public.call_history(10) where call_id = (select v from cids where k = 'c3')) = 'canceled', 'the callee sees the canceled call (shown as missed)');
select t.as('ca000000-0000-0000-0000-00000000000a');
insert into cids select 'c4', (public.call_start((select v from cids where k = 'ab'), 'voice')->>'id')::uuid;
select public.call_leave((select v from cids where k = 'c4'), 'timeout');
select t.ok((select status from public.calls where id = (select v from cids where k = 'c4')) = 'missed', 'rang out → missed');
select t.as('ca000000-0000-0000-0000-00000000000b');
select t.ok((select status from public.call_history(10) where call_id = (select v from cids where k = 'c4')) = 'missed', 'history: missed for the callee');
select public.call_hide((select v from cids where k = 'c4'));
select t.ok((select count(*) from public.call_history(10) where call_id = (select v from cids where k = 'c4')) = 0, 'hide → gone from my Calls tab');
select t.as('ca000000-0000-0000-0000-00000000000a');
select t.ok((select count(*) from public.call_history(10) where call_id = (select v from cids where k = 'c4')) = 1, 'hiding is per person');
-- stale ring (app closed): cleanup → missed
insert into cids select 'c5', (public.call_start((select v from cids where k = 'ab'), 'voice')->>'id')::uuid;
reset role; update public.calls set created_at = now() - interval '2 minutes' where id = (select v from cids where k = 'c5'); update public.call_participants set invited_at = now() - interval '2 minutes' where call_id = (select v from cids where k = 'c5'); set role authenticated;
select t.as('ca000000-0000-0000-0000-00000000000b');
select t.ok((select count(*) from public.call_incoming()) = 0, 'an old ring never shows');
select t.ok((select status from public.calls where id = (select v from cids where k = 'c5')) = 'missed', 'cleanup: stale ringing call → missed');
-- stale active call (both apps gone): ended
select t.as('ca000000-0000-0000-0000-00000000000a');
insert into cids select 'c6', (public.call_start((select v from cids where k = 'ab'), 'voice')->>'id')::uuid;
select t.as('ca000000-0000-0000-0000-00000000000b'); select public.call_answer((select v from cids where k = 'c6'));
reset role; update public.call_participants set last_seen_at = now() - interval '3 minutes' where call_id = (select v from cids where k = 'c6'); set role authenticated;
select t.as('ca000000-0000-0000-0000-00000000000a'); select public.call_history(5);
select t.ok((select status from public.calls where id = (select v from cids where k = 'c6')) = 'ended', 'cleanup: call with no heartbeats → ended');
-- busy: B is in a call with D, A calls B
select t.as('ca000000-0000-0000-0000-00000000000b');
insert into cids select 'bd', public.dm_open_direct('ca000000-0000-0000-0000-00000000000d');
insert into cids select 'c7', (public.call_start((select v from cids where k = 'bd'), 'voice')->>'id')::uuid;
select t.as('ca000000-0000-0000-0000-00000000000a');
select t.ok(public.call_start((select v from cids where k = 'ab'), 'voice')->>'status' = 'busy', 'callee already on a call → busy');
select t.as('ca000000-0000-0000-0000-00000000000b'); select public.call_leave((select v from cids where k = 'c7'), 'hangup');
-- simultaneous calls in one chat merge: B rings A while A's call to B is ringing
select t.as('ca000000-0000-0000-0000-00000000000a');
insert into cids select 'c8', (public.call_start((select v from cids where k = 'ab'), 'voice')->>'id')::uuid;
select t.as('ca000000-0000-0000-0000-00000000000b');
select t.ok((select r->>'status' = 'join' and (r->>'id')::uuid = (select v from cids where k = 'c8') from (select public.call_start((select v from cids where k = 'ab'), 'voice') r) x), 'calling back while they ring you → joins their call');
select t.ok((select status from public.calls where id = (select v from cids where k = 'c8')) = 'active', 'merged call is active');
select public.call_leave((select v from cids where k = 'c8'), 'hangup');

-- ===== who may call
-- message request: neither side can call
select t.as('ca000000-0000-0000-0000-00000000000c');
select t.fails($$select public.call_start((select v from cids where k = 'ca'), 'voice')$$, 'call_request_out', 'request sender can''t call before it''s accepted');
select t.as('ca000000-0000-0000-0000-00000000000a');
select t.fails($$select public.call_start((select v from cids where k = 'ca'), 'voice')$$, 'call_request', 'request receiver can''t call from Requests');
select t.ok((select count(*) from public.call_incoming()) = 0, 'requests never ring');
-- accepted stranger chat: allowed (default "people you chat with")
select public.dm_accept((select v from cids where k = 'ca'));
select t.as('ca000000-0000-0000-0000-00000000000c');
insert into cids select 'c9', (public.call_start((select v from cids where k = 'ca'), 'voice')->>'id')::uuid;
select t.ok((select v from cids where k = 'c9') is not null, 'accepted chat: an adult stranger can call (default setting)');
select public.call_leave((select v from cids where k = 'c9'), 'hangup');
-- "friends only" and "no one"
select t.as('ca000000-0000-0000-0000-00000000000a'); insert into public.dm_settings (user_id, who_can_call) values ('ca000000-0000-0000-0000-00000000000a', 'friends') on conflict (user_id) do update set who_can_call = 'friends';
select t.as('ca000000-0000-0000-0000-00000000000c');
select t.fails($$select public.call_start((select v from cids where k = 'ca'), 'voice')$$, 'call_friends_only', 'who_can_call = friends: strangers refused');
select t.as('ca000000-0000-0000-0000-00000000000b');
insert into cids select 'c10', (public.call_start((select v from cids where k = 'ab'), 'voice')->>'id')::uuid;
select t.ok((select v from cids where k = 'c10') is not null, 'who_can_call = friends: friends still can');
select public.call_leave((select v from cids where k = 'c10'), 'hangup');
select t.as('ca000000-0000-0000-0000-00000000000a'); update public.dm_settings set who_can_call = 'none' where user_id = 'ca000000-0000-0000-0000-00000000000a';
select t.as('ca000000-0000-0000-0000-00000000000b');
select t.fails($$select public.call_start((select v from cids where k = 'ab'), 'voice')$$, 'call_no_one', 'who_can_call = none: nobody can call');
select t.as('ca000000-0000-0000-0000-00000000000a'); update public.dm_settings set who_can_call = 'everyone' where user_id = 'ca000000-0000-0000-0000-00000000000a';
select t.fails($$update public.dm_settings set who_can_call = 'strangers' where user_id = 'ca000000-0000-0000-0000-00000000000a'$$, 'dm_settings_call_chk', 'who_can_call: only known values');
-- blocked: refused both ways, without saying who blocked whom
select t.as('ca000000-0000-0000-0000-00000000000c'); select public.social_block('ca000000-0000-0000-0000-00000000000a');
select t.fails($$select public.call_start((select v from cids where k = 'ca'), 'voice')$$, 'call_unavailable|call_not_member', 'blocker can''t call');
select t.as('ca000000-0000-0000-0000-00000000000a');
select t.fails($$select public.call_start((select v from cids where k = 'ca'), 'voice')$$, 'call_unavailable|call_not_member', 'blocked person can''t call');
-- under 18: friends only, whatever the setting
select t.as('ca000000-0000-0000-0000-00000000000e'); insert into public.dm_settings (user_id, who_can_call) values ('ca000000-0000-0000-0000-00000000000e', 'everyone');
select t.as('ca000000-0000-0000-0000-00000000000a');
insert into cids select 'c11', (public.call_start((select v from cids where k = 'ae'), 'voice')->>'id')::uuid;
select t.ok((select v from cids where k = 'c11') is not null, 'under-18: a friend can call');
select public.call_leave((select v from cids where k = 'c11'), 'hangup');
select public.social_unfriend('ca000000-0000-0000-0000-00000000000e');
select t.fails($$select public.call_start((select v from cids where k = 'ae'), 'voice')$$, 'call_minor|call_not_member|call_request', 'under-18: no calls once not friends');
-- unfriended mid-call: the heartbeat ends it
select public.social_send_request('ca000000-0000-0000-0000-00000000000e'); select t.as('ca000000-0000-0000-0000-00000000000e'); select public.social_respond_request('ca000000-0000-0000-0000-00000000000a', true);
select t.as('ca000000-0000-0000-0000-00000000000a');
insert into cids select 'c12', (public.call_start((select v from cids where k = 'ae'), 'voice')->>'id')::uuid;
select t.as('ca000000-0000-0000-0000-00000000000e'); select public.call_answer((select v from cids where k = 'c12'));
select public.social_unfriend('ca000000-0000-0000-0000-00000000000a');
select t.ok(public.call_heartbeat((select v from cids where k = 'c12')) = 'ended', 'under-18: unfriending ends the call at the next heartbeat');

-- ===== Do not disturb: rings out quietly, the caller can't tell
select t.as('ca000000-0000-0000-0000-00000000000d'); insert into public.dm_settings (user_id, dnd_until) values ('ca000000-0000-0000-0000-00000000000d', now() + interval '1 hour');
select t.as('ca000000-0000-0000-0000-00000000000a');
insert into cids select 'c13', (public.call_start((select v from cids where k = 'ad'), 'voice')->>'id')::uuid;
select t.ok((select state from public.call_participants where call_id = (select v from cids where k = 'c13') and user_id = 'ca000000-0000-0000-0000-00000000000d') = 'ringing', 'DND: the caller just sees it ringing');
select t.as('ca000000-0000-0000-0000-00000000000d');
select t.ok((select count(*) from public.call_incoming()) = 0, 'DND: it never rings');
select t.as('ca000000-0000-0000-0000-00000000000a'); select public.call_leave((select v from cids where k = 'c13'), 'timeout');
select t.ok((select meta->'call'->>'status' from public.messages where meta->'call'->>'id' = (select v from cids where k = 'c13')::text) = 'missed', 'DND: the chat card just says missed');
select t.as('ca000000-0000-0000-0000-00000000000d');
select t.ok((select status from public.call_history(10) where call_id = (select v from cids where k = 'c13')) = 'unavailable', 'DND: only my own history says Do not disturb was on');
update public.dm_settings set dnd_until = null where user_id = 'ca000000-0000-0000-0000-00000000000d';

-- ===== group calls (max 4 in a call)
select t.as('ca000000-0000-0000-0000-00000000000b');
insert into cids select 'grp', public.dm_create_group('Run club', array['ca000000-0000-0000-0000-00000000000a', 'ca000000-0000-0000-0000-00000000000d', 'ca000000-0000-0000-0000-00000000000f']::uuid[]);
select t.as('ca000000-0000-0000-0000-00000000000a');
-- F (not A's friend) allows calls from people they chat with, so A's group call rings B, D and F
select t.as('ca000000-0000-0000-0000-00000000000f'); insert into public.dm_settings (user_id, who_can_call) values ('ca000000-0000-0000-0000-00000000000f', 'friends');
select t.as('ca000000-0000-0000-0000-00000000000a');
insert into cids select 'g0', (public.call_start((select v from cids where k = 'grp'), 'voice')->>'id')::uuid;
select t.ok((select count(*) from public.call_participants where call_id = (select v from cids where k = 'g0')) = 3, 'group call only rings the members who allow a call from the caller (F: friends only)');
select public.call_leave((select v from cids where k = 'g0'), 'hangup');
select t.as('ca000000-0000-0000-0000-00000000000f'); update public.dm_settings set who_can_call = 'everyone' where user_id = 'ca000000-0000-0000-0000-00000000000f';
select t.as('ca000000-0000-0000-0000-00000000000a');
insert into cids select 'g1', (public.call_start((select v from cids where k = 'grp'), 'video')->>'id')::uuid;
select t.ok((select count(*) from public.call_participants where call_id = (select v from cids where k = 'g1')) = 4 and (select is_group from public.calls where id = (select v from cids where k = 'g1')), 'group call rings every member');
select t.as('ca000000-0000-0000-0000-00000000000b'); select public.call_answer((select v from cids where k = 'g1'));
select t.as('ca000000-0000-0000-0000-00000000000d'); select public.call_answer((select v from cids where k = 'g1'));
select t.ok((select count(*) from public.call_participants where call_id = (select v from cids where k = 'g1') and state = 'joined') = 3, 'three people in the group call');
-- F picks up by pressing call in the chat (the call is already going on)
select t.as('ca000000-0000-0000-0000-00000000000f');
select t.ok(public.call_start((select v from cids where k = 'grp'), 'voice')->>'status' = 'join', 'a member can join an ongoing group call');
select t.ok((select count(*) from public.call_participants where call_id = (select v from cids where k = 'g1') and state = 'joined') = 4, 'four in the call');
-- a fifth person can't join
reset role;
insert into public.conversation_members (conversation_id, user_id, state, role) values ((select v from cids where k = 'grp'), 'ca000000-0000-0000-0000-000000000001', 'active', 'member');
insert into public.call_participants (call_id, user_id, state) values ((select v from cids where k = 'g1'), 'ca000000-0000-0000-0000-000000000001', 'ringing');
set role authenticated;
select t.as('ca000000-0000-0000-0000-000000000001');
select t.fails($$select public.call_answer((select v from cids where k = 'g1'))$$, 'call_full', 'max 4 people in a call');
select t.as('ca000000-0000-0000-0000-00000000000b'); select public.call_leave((select v from cids where k = 'g1'), 'hangup');
select t.ok((select status from public.calls where id = (select v from cids where k = 'g1')) = 'active', 'group: one person leaving doesn''t end it');
select t.as('ca000000-0000-0000-0000-00000000000d'); select public.call_leave((select v from cids where k = 'g1'), 'hangup');
select t.as('ca000000-0000-0000-0000-00000000000f'); select public.call_leave((select v from cids where k = 'g1'), 'hangup');
select t.ok((select status from public.calls where id = (select v from cids where k = 'g1')) = 'ended', 'group: ends when one person is left');
select t.ok((select (meta->'call'->>'people')::int from public.messages where meta->'call'->>'id' = (select v from cids where k = 'g1')::text) = 4, 'group call card counts the people who joined');
select t.as('ca000000-0000-0000-0000-000000000001');
select t.ok((select status from public.call_history(5) where call_id = (select v from cids where k = 'g1')) = 'missed', 'group: the person who never joined has it as missed');
-- everyone declines a group call
select t.as('ca000000-0000-0000-0000-00000000000b');
insert into cids select 'g2', (public.call_start((select v from cids where k = 'grp'), 'voice')->>'id')::uuid;
select t.as('ca000000-0000-0000-0000-00000000000a'); select public.call_decline((select v from cids where k = 'g2'));
select t.ok((select status from public.calls where id = (select v from cids where k = 'g2')) = 'ringing', 'group: one decline keeps ringing the others');
select t.as('ca000000-0000-0000-0000-00000000000d'); select public.call_decline((select v from cids where k = 'g2'));
select t.as('ca000000-0000-0000-0000-00000000000f'); select public.call_decline((select v from cids where k = 'g2'));
select t.as('ca000000-0000-0000-0000-000000000001'); select public.call_decline((select v from cids where k = 'g2'));
select t.ok((select status from public.calls where id = (select v from cids where k = 'g2')) = 'declined', 'group: everyone declined → declined');

-- ===== banned, anon, rate limit
reset role; insert into public.social_bans (user_id, reason) values ('ca000000-0000-0000-0000-00000000000f', 'test'); set role authenticated;
select t.as('ca000000-0000-0000-0000-00000000000f');
select t.fails($$select public.call_start((select v from cids where k = 'grp'), 'voice')$$, 'banned', 'banned accounts can''t call');
reset role; delete from public.social_bans where user_id = 'ca000000-0000-0000-0000-00000000000f';
set role anon;
select t.fails($$select public.call_start((select v from cids where k = 'ab'), 'voice')$$, 'permission denied', 'anon: no calls');
select t.fails($$select * from public.calls$$, 'permission denied', 'anon: can''t read calls');
reset role;
insert into public.calls (conversation_id, caller_id, status, created_at, logged) select (select v from cids where k = 'ab'), 'ca000000-0000-0000-0000-00000000000b', 'missed', now() - interval '5 minutes', true from generate_series(1, 30);
set role authenticated;
select t.as('ca000000-0000-0000-0000-00000000000b');
select t.fails($$select public.call_start((select v from cids where k = 'ab'), 'voice')$$, 'rate_limit', 'rate limit: 30 calls an hour');
reset role;
\echo calls: all checks passed
