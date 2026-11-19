-- LOCAL TESTING ONLY. Messages (DMs, requests, groups): RLS, triggers, RPCs and the message-media bucket.
-- Runs from tools/test-social-sql.sh after schema.sql (applied twice) and test-social.sql (which creates the t.* helpers).
-- Users: P, Q adults and friends · R adult stranger · S adult, Q's friend (friend of a friend of P) · T 15 years old, Q's friend
--        N adult outsider · V adult (friendship turns a request into a chat). Any failed check raises and stops psql.
\set ON_ERROR_STOP 1
set client_min_messages = notice;
reset role;
insert into auth.users (id, email) values ('d0000000-0000-0000-0000-000000000001', 'dmp@x'), ('d0000000-0000-0000-0000-000000000002', 'dmq@x'), ('d0000000-0000-0000-0000-000000000003', 'dmr@x'), ('d0000000-0000-0000-0000-000000000004', 'dms@x'), ('d0000000-0000-0000-0000-000000000005', 'dmt@x'), ('d0000000-0000-0000-0000-000000000006', 'dmn@x'), ('d0000000-0000-0000-0000-000000000007', 'dmv@x');
create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated, anon;
set role authenticated;
select t.as('d0000000-0000-0000-0000-000000000001'); select public.social_create_profile('dm.p', 'DM P', '1990-01-01');
select t.as('d0000000-0000-0000-0000-000000000002'); select public.social_create_profile('dm.q', 'DM Q', '1991-01-01');
select t.as('d0000000-0000-0000-0000-000000000003'); select public.social_create_profile('dm.r', 'DM R', '1985-01-01');
select t.as('d0000000-0000-0000-0000-000000000004'); select public.social_create_profile('dm.s', 'DM S', '1993-01-01');
select t.as('d0000000-0000-0000-0000-000000000005'); select public.social_create_profile('dm.t', 'DM T', (current_date - interval '15 years')::date);
select t.as('d0000000-0000-0000-0000-000000000006'); select public.social_create_profile('dm.n', 'DM N', '1988-01-01');
select t.as('d0000000-0000-0000-0000-000000000007'); select public.social_create_profile('dm.v', 'DM V', '1987-01-01');
select t.as('d0000000-0000-0000-0000-000000000001'); select public.social_send_request('d0000000-0000-0000-0000-000000000002'); select t.as('d0000000-0000-0000-0000-000000000002'); select public.social_respond_request('d0000000-0000-0000-0000-000000000001', true);
select t.as('d0000000-0000-0000-0000-000000000002'); select public.social_send_request('d0000000-0000-0000-0000-000000000004'); select t.as('d0000000-0000-0000-0000-000000000004'); select public.social_respond_request('d0000000-0000-0000-0000-000000000002', true);
select t.as('d0000000-0000-0000-0000-000000000002'); select public.social_send_request('d0000000-0000-0000-0000-000000000005'); select t.as('d0000000-0000-0000-0000-000000000005'); select public.social_respond_request('d0000000-0000-0000-0000-000000000002', true);

-- ===== 1:1 chat between friends
select t.as('d0000000-0000-0000-0000-000000000001');
insert into ids select 'pq', public.dm_open_direct('d0000000-0000-0000-0000-000000000002');
select t.ok(public.dm_open_direct('d0000000-0000-0000-0000-000000000002') = (select v from ids where k = 'pq'), 'one 1:1 chat per pair (open again → same chat)');
select t.ok((select state from public.dm_members((select v from ids where k = 'pq')) where user_id = 'd0000000-0000-0000-0000-000000000002') = 'active', 'friends: the chat goes straight to Chats (no request)');
select t.ok((select count(*) from public.conversation_members) = 1, 'conversation_members: you only see your own membership rows');
insert into public.messages (id, conversation_id, body) values ('e0000000-0000-0000-0000-000000000001', (select v from ids where k = 'pq'), 'Hey Q');
select t.ok((select sender_id from public.messages where id = 'e0000000-0000-0000-0000-000000000001') = 'd0000000-0000-0000-0000-000000000001' and (select last_message_at from public.conversations where id = (select v from ids where k = 'pq')) is not null, 'sender forced to the signed-in user; chat last_message_at updated');
select t.fails($$insert into public.messages (conversation_id, kind, body, meta) values ((select v from ids where k = 'pq'), 'system', '', '{}')$$, 'row-level security|dm_system', 'clients cannot post system messages');
select t.fails($$insert into public.messages (conversation_id, body) values ((select v from ids where k = 'pq'), '   ')$$, 'dm_empty', 'empty text message refused');
select t.as('d0000000-0000-0000-0000-000000000002');
select t.ok((select count(*) from public.messages where conversation_id = (select v from ids where k = 'pq')) = 1, 'the other participant reads the message');
select t.ok((select unread from public.dm_inbox() where conversation_id = (select v from ids where k = 'pq')) = 1, 'dm_inbox: unread count 1');
select public.dm_mark_read((select v from ids where k = 'pq'));
select t.ok((select unread from public.dm_inbox() where conversation_id = (select v from ids where k = 'pq')) = 0, 'mark read → unread 0');
select t.as('d0000000-0000-0000-0000-000000000001');
select t.ok((select seen_at from public.dm_members((select v from ids where k = 'pq')) where user_id = 'd0000000-0000-0000-0000-000000000002') is not null, 'read receipts on both sides → seen_at shared');
select t.as('d0000000-0000-0000-0000-000000000002'); insert into public.dm_settings (user_id, read_receipts) values ('d0000000-0000-0000-0000-000000000002', false);
select t.as('d0000000-0000-0000-0000-000000000001');
select t.ok((select seen_at from public.dm_members((select v from ids where k = 'pq')) where user_id = 'd0000000-0000-0000-0000-000000000002') is null, 'read receipts off → seen_at hidden');
select t.as('d0000000-0000-0000-0000-000000000002'); update public.dm_settings set read_receipts = true where user_id = 'd0000000-0000-0000-0000-000000000002';

-- ===== someone who is not in the chat
select t.as('d0000000-0000-0000-0000-000000000006');
select t.ok((select count(*) from public.messages) = 0 and (select count(*) from public.conversations) = 0 and (select count(*) from public.conversation_members) = 0, 'non-participant: sees no messages, chats or members');
select t.ok((select count(*) from public.dm_members((select v from ids where k = 'pq'))) = 0, 'non-participant: dm_members returns nothing');
select t.fails($$insert into public.messages (conversation_id, body) values ((select v from ids where k = 'pq'), 'sneaky')$$, 'row-level security|dm_not_member', 'non-participant cannot post into a chat');
update public.messages set body = 'hacked' where id = 'e0000000-0000-0000-0000-000000000001';
select t.fails($$insert into public.conversation_members (conversation_id, user_id) values ((select v from ids where k = 'pq'), 'd0000000-0000-0000-0000-000000000006')$$, 'permission denied', 'cannot add yourself to a chat directly');
select t.fails($$insert into public.conversations (kind, direct_key) values ('direct', 'x:y')$$, 'permission denied', 'conversations are created only through the dm_* functions');
select t.fails($$select public.dm_system_message((select v from ids where k = 'pq'), '{}')$$, 'permission denied', 'dm_system_message is not callable from the app');
select t.fails($$select public.dm_who('d0000000-0000-0000-0000-000000000001')$$, 'permission denied', 'other people''s message settings are not readable');
select t.as('d0000000-0000-0000-0000-000000000001');
select t.ok((select body from public.messages where id = 'e0000000-0000-0000-0000-000000000001') = 'Hey Q', 'non-participant cannot change a message');

-- ===== message requests (not friends)
select t.as('d0000000-0000-0000-0000-000000000003');
insert into ids select 'rp', public.dm_open_direct('d0000000-0000-0000-0000-000000000001');
select t.ok((select state from public.dm_members((select v from ids where k = 'rp')) where user_id = 'd0000000-0000-0000-0000-000000000001') = 'request', 'stranger → lands in Requests');
insert into public.messages (id, conversation_id, body) values ('e0000000-0000-0000-0000-000000000003', (select v from ids where k = 'rp'), 'Hi P, saw your race'), ('e0000000-0000-0000-0000-000000000004', (select v from ids where k = 'rp'), 'Want to train together?');
insert into public.messages (id, conversation_id, body) values ('e0000000-0000-0000-0000-000000000005', (select v from ids where k = 'rp'), 'I''m local');
select t.fails($$insert into public.messages (conversation_id, body) values ((select v from ids where k = 'rp'), 'hello??')$$, 'dm_request_limit', 'request limit: 3 messages before acceptance');
select public.dm_heartbeat();
select t.as('d0000000-0000-0000-0000-000000000001');
select t.ok((select state from public.dm_inbox() where conversation_id = (select v from ids where k = 'rp')) = 'request' and (select unread from public.dm_inbox() where conversation_id = (select v from ids where k = 'rp')) = 3, 'recipient sees the request with 3 unread');
select t.fails($$insert into public.messages (conversation_id, body) values ((select v from ids where k = 'rp'), 'reply')$$, 'row-level security|dm_not_member', 'recipient must accept before replying');
select t.fails($$insert into public.message_reactions (message_id, kind) values ('e0000000-0000-0000-0000-000000000003', 'like')$$, 'dm_not_member', 'recipient cannot react before accepting');
select public.dm_mark_read((select v from ids where k = 'rp'));
select t.as('d0000000-0000-0000-0000-000000000003');
select t.ok((select seen_at from public.dm_members((select v from ids where k = 'rp')) where user_id = 'd0000000-0000-0000-0000-000000000001') is null and (select delivered_at from public.dm_members((select v from ids where k = 'rp')) where user_id = 'd0000000-0000-0000-0000-000000000001') is null, 'sender cannot see read / delivered status before acceptance');
select t.as('d0000000-0000-0000-0000-000000000001'); select public.dm_accept((select v from ids where k = 'rp'));
select t.as('d0000000-0000-0000-0000-000000000003');
select t.ok((select state from public.dm_members((select v from ids where k = 'rp')) where user_id = 'd0000000-0000-0000-0000-000000000001') = 'active' and (select seen_at from public.dm_members((select v from ids where k = 'rp')) where user_id = 'd0000000-0000-0000-0000-000000000001') is not null, 'accepted → normal chat, seen status visible');
insert into public.messages (conversation_id, body) values ((select v from ids where k = 'rp'), 'Great, thanks!');
select t.ok(true, 'after acceptance the request limit no longer applies');
select t.as('d0000000-0000-0000-0000-000000000001');
select t.ok((select count(*) from public.dm_presence(array['d0000000-0000-0000-0000-000000000003']::uuid[])) = 1, 'presence: shared between chat members with activity on');

-- ===== privacy settings: who can message me
select t.as('d0000000-0000-0000-0000-000000000001'); insert into public.dm_settings (user_id, who_can_message) values ('d0000000-0000-0000-0000-000000000001', 'friends');
select t.as('d0000000-0000-0000-0000-000000000006');
select t.ok(public.dm_can_message('d0000000-0000-0000-0000-000000000001') = 'dm_friends_only', 'Friends only: dm_can_message says so');
select t.fails($$select public.dm_open_direct('d0000000-0000-0000-0000-000000000001')$$, 'dm_friends_only', 'Friends only: a stranger cannot start a chat');
select t.as('d0000000-0000-0000-0000-000000000001'); update public.dm_settings set who_can_message = 'fof' where user_id = 'd0000000-0000-0000-0000-000000000001';
select t.as('d0000000-0000-0000-0000-000000000006'); select t.fails($$select public.dm_open_direct('d0000000-0000-0000-0000-000000000001')$$, 'dm_fof_only', 'Friends of friends: no mutual friend → refused');
select t.as('d0000000-0000-0000-0000-000000000004'); select t.ok(public.dm_can_message('d0000000-0000-0000-0000-000000000001') = 'request', 'Friends of friends: someone with a mutual friend can send a request');
select t.as('d0000000-0000-0000-0000-000000000001'); update public.dm_settings set who_can_message = 'none' where user_id = 'd0000000-0000-0000-0000-000000000001';
select t.as('d0000000-0000-0000-0000-000000000004'); select t.ok(public.dm_can_message('d0000000-0000-0000-0000-000000000001') = 'dm_no_one', 'No one: new chats refused');
select t.as('d0000000-0000-0000-0000-000000000002');
select t.ok(public.dm_can_message('d0000000-0000-0000-0000-000000000001') = 'ok', 'No one: an existing chat keeps working');
insert into public.messages (id, conversation_id, body) values ('e0000000-0000-0000-0000-000000000002', (select v from ids where k = 'pq'), 'Still here');
select t.as('d0000000-0000-0000-0000-000000000001'); update public.dm_settings set who_can_message = 'everyone' where user_id = 'd0000000-0000-0000-0000-000000000001';
select t.fails($$update public.dm_settings set last_active_at = now() - interval '1 day' where user_id = 'd0000000-0000-0000-0000-000000000001'$$, 'permission denied', 'last_active_at is not writable from the app');

-- ===== declining is silent
select t.as('d0000000-0000-0000-0000-000000000004');
insert into ids select 'sp', public.dm_open_direct('d0000000-0000-0000-0000-000000000001');
insert into public.messages (conversation_id, body) values ((select v from ids where k = 'sp'), 'hi from S');
select t.as('d0000000-0000-0000-0000-000000000001'); select public.dm_decline((select v from ids where k = 'sp'));
select t.ok((select count(*) from public.messages where conversation_id = (select v from ids where k = 'sp')) = 0 and not exists (select 1 from public.dm_inbox() where conversation_id = (select v from ids where k = 'sp')), 'declined request disappears for the recipient');
select t.as('d0000000-0000-0000-0000-000000000004');
select t.ok((select state from public.dm_members((select v from ids where k = 'sp')) where user_id = 'd0000000-0000-0000-0000-000000000001') = 'request', 'the sender is never told it was declined');

-- ===== block
select t.as('d0000000-0000-0000-0000-000000000001'); select public.social_block('d0000000-0000-0000-0000-000000000003');
select t.as('d0000000-0000-0000-0000-000000000003');
select t.fails($$insert into public.messages (conversation_id, body) values ((select v from ids where k = 'rp'), 'are you there?')$$, 'dm_blocked', 'blocked user cannot send');
select t.fails($$select public.dm_open_direct('d0000000-0000-0000-0000-000000000001')$$, 'dm_unavailable', 'blocked user cannot open a chat');
select t.ok(public.dm_can_message('d0000000-0000-0000-0000-000000000001') = 'dm_unavailable', 'block is not revealed (generic dm_unavailable)');
select t.as('d0000000-0000-0000-0000-000000000001');
select t.fails($$insert into public.messages (conversation_id, body) values ((select v from ids where k = 'rp'), 'bye')$$, 'dm_blocked', 'the blocker cannot send either');
select t.fails($$insert into public.message_reactions (message_id, kind) values ('e0000000-0000-0000-0000-000000000003', 'angry')$$, 'dm_blocked', 'no reacting across a block');
select t.ok((select count(*) from public.dm_presence(array['d0000000-0000-0000-0000-000000000003']::uuid[])) = 0, 'no online status across a block');

-- ===== under 18
select t.as('d0000000-0000-0000-0000-000000000003');
select t.ok(public.dm_can_message('d0000000-0000-0000-0000-000000000005') = 'dm_minor', 'adult stranger → teen: refused (dm_minor)');
select t.fails($$select public.dm_open_direct('d0000000-0000-0000-0000-000000000005')$$, 'dm_minor', 'adult stranger cannot open a chat with a teen');
select t.as('d0000000-0000-0000-0000-000000000005');
select t.fails($$select public.dm_open_direct('d0000000-0000-0000-0000-000000000003')$$, 'dm_minor', 'teen cannot open a chat with an adult stranger');
select t.as('d0000000-0000-0000-0000-000000000002');
insert into ids select 'qt', public.dm_open_direct('d0000000-0000-0000-0000-000000000005');
select t.ok((select state from public.dm_members((select v from ids where k = 'qt')) where user_id = 'd0000000-0000-0000-0000-000000000005') = 'active', 'adult friend ↔ teen: normal chat');
insert into public.messages (conversation_id, body) values ((select v from ids where k = 'qt'), 'Nice race today!');
select public.social_unfriend('d0000000-0000-0000-0000-000000000005');
select t.fails($$insert into public.messages (conversation_id, body) values ((select v from ids where k = 'qt'), 'still there?')$$, 'dm_minor', 'adult ↔ teen: chat stops if they stop being friends');
select t.ok(public.dm_can_message('d0000000-0000-0000-0000-000000000005') = 'dm_minor', 'adult ↔ teen ex-friends: dm_can_message says dm_minor');
select t.as('d0000000-0000-0000-0000-000000000005');
select t.fails($$insert into public.messages (conversation_id, body) values ((select v from ids where k = 'qt'), 'hey')$$, 'dm_minor', 'teen can’t keep messaging an adult who is no longer a friend');
select public.social_send_request('d0000000-0000-0000-0000-000000000002'); select t.as('d0000000-0000-0000-0000-000000000002'); select public.social_respond_request('d0000000-0000-0000-0000-000000000005', true);
reset role; select t.as('');
select t.ok(public.dm_who('d0000000-0000-0000-0000-000000000005') = 'friends' and public.dm_who('d0000000-0000-0000-0000-000000000001') = 'everyone', 'teens default to Friends only, adults to Everyone');
set role authenticated;

-- ===== edit + unsend: only the sender, edit within 15 minutes
select t.as('d0000000-0000-0000-0000-000000000001');
update public.messages set body = 'Hey Q!' where id = 'e0000000-0000-0000-0000-000000000001';
select t.ok((select body from public.messages where id = 'e0000000-0000-0000-0000-000000000001') = 'Hey Q!' and (select edited_at from public.messages where id = 'e0000000-0000-0000-0000-000000000001') is not null, 'sender edits within 15 minutes → edited_at set');
select t.fails($$update public.messages set conversation_id = (select v from ids where k = 'rp') where id = 'e0000000-0000-0000-0000-000000000001'$$, 'permission denied', 'only body / deleted_at are updatable');
select t.as('d0000000-0000-0000-0000-000000000002');
update public.messages set body = 'hacked' where id = 'e0000000-0000-0000-0000-000000000001';
update public.messages set deleted_at = now() where id = 'e0000000-0000-0000-0000-000000000001';
insert into public.message_reactions (message_id, kind) values ('e0000000-0000-0000-0000-000000000001', 'love');
select t.fails($$insert into public.message_reactions (message_id, kind) values ('e0000000-0000-0000-0000-000000000002', 'care')$$, 'check constraint|message_reactions_kind_chk', 'only the 7 reaction kinds');
select t.as('d0000000-0000-0000-0000-000000000001');
select t.ok((select body from public.messages where id = 'e0000000-0000-0000-0000-000000000001') = 'Hey Q!' and (select deleted_at from public.messages where id = 'e0000000-0000-0000-0000-000000000001') is null, 'only the sender can edit or unsend');
select t.ok((select count(*) from public.message_reactions where message_id = 'e0000000-0000-0000-0000-000000000001') = 1, 'participants see reactions');
select t.as('d0000000-0000-0000-0000-000000000006');
select t.fails($$insert into public.message_reactions (message_id, kind) values ('e0000000-0000-0000-0000-000000000001', 'like')$$, 'dm_not_member|row-level security', 'non-participant cannot react');
select t.ok((select count(*) from public.message_reactions) = 0, 'non-participant sees no reactions');
reset role; select t.as(''); update public.messages set created_at = now() - interval '20 minutes' where id = 'e0000000-0000-0000-0000-000000000001'; set role authenticated;
select t.as('d0000000-0000-0000-0000-000000000001');
select t.fails($$update public.messages set body = 'too late' where id = 'e0000000-0000-0000-0000-000000000001'$$, 'dm_edit_window', 'edit window: 15 minutes');
update public.messages set deleted_at = now() where id = 'e0000000-0000-0000-0000-000000000001';
select t.ok((select body from public.messages where id = 'e0000000-0000-0000-0000-000000000001') = '' and (select deleted_at from public.messages where id = 'e0000000-0000-0000-0000-000000000001') is not null and (select count(*) from public.message_reactions where message_id = 'e0000000-0000-0000-0000-000000000001') = 0, 'unsend wipes the text and its reactions (placeholder row stays)');
select t.fails($$update public.messages set deleted_at = null where id = 'e0000000-0000-0000-0000-000000000001'$$, 'dm_deleted', 'an unsent message cannot be restored');
select t.as('d0000000-0000-0000-0000-000000000002');
insert into public.message_hidden (message_id) values ('e0000000-0000-0000-0000-000000000002');
select t.ok((select count(*) from public.message_hidden) = 1, 'delete for me: stored for me');
select t.as('d0000000-0000-0000-0000-000000000001');
select t.ok((select count(*) from public.message_hidden) = 0 and (select count(*) from public.messages where id = 'e0000000-0000-0000-0000-000000000002') = 1, 'delete for me: the other person still has it');

-- ===== groups
select t.as('d0000000-0000-0000-0000-000000000001');
select t.fails($$select public.dm_create_group('Crew', array['d0000000-0000-0000-0000-000000000004']::uuid[])$$, 'dm_friends_only', 'groups: you can only add your friends');
insert into ids select 'g', public.dm_create_group('Crew', array['d0000000-0000-0000-0000-000000000002']::uuid[]);
select t.ok((select role from public.conversation_members where conversation_id = (select v from ids where k = 'g')) = 'admin' and (select count(*) from public.messages where conversation_id = (select v from ids where k = 'g') and kind = 'system') = 2, 'group created: creator is admin, two system messages');
select t.as('d0000000-0000-0000-0000-000000000002');
select t.fails($$select public.dm_rename_group((select v from ids where k = 'g'), 'Q crew')$$, 'dm_not_admin', 'members cannot rename the group');
select t.fails($$select public.dm_remove_member((select v from ids where k = 'g'), 'd0000000-0000-0000-0000-000000000001')$$, 'dm_not_admin', 'members cannot remove people');
insert into public.messages (conversation_id, body) values ((select v from ids where k = 'g'), 'before S joins');
select public.dm_add_members((select v from ids where k = 'g'), array['d0000000-0000-0000-0000-000000000004']::uuid[]);
select t.fails($$select public.dm_add_members((select v from ids where k = 'g'), array['d0000000-0000-0000-0000-000000000005']::uuid[])$$, 'dm_minor', 'groups: a teen can''t join adults they aren''t friends with');
select t.as('d0000000-0000-0000-0000-000000000004');
select t.ok((select count(*) from public.messages where conversation_id = (select v from ids where k = 'g') and body = 'before S joins') = 0, 'people added later don''t see earlier history');
select t.ok((select count(*) from public.messages where conversation_id = (select v from ids where k = 'g') and kind = 'system' and meta->>'type' = 'added') = 1, '…but they see that they were added');
select t.as('d0000000-0000-0000-0000-000000000001');
select public.dm_rename_group((select v from ids where k = 'g'), 'HYROX Crew');
select t.ok((select title from public.conversations where id = (select v from ids where k = 'g')) = 'HYROX Crew', 'admin renames the group');
select public.dm_remove_member((select v from ids where k = 'g'), 'd0000000-0000-0000-0000-000000000004');
select t.as('d0000000-0000-0000-0000-000000000004');
select t.fails($$insert into public.messages (conversation_id, body) values ((select v from ids where k = 'g'), 'let me in')$$, 'row-level security|dm_not_member', 'removed member cannot post');
select t.ok((select count(*) from public.messages where conversation_id = (select v from ids where k = 'g')) = 0, 'removed member cannot read the group');
select t.as('d0000000-0000-0000-0000-000000000001'); select public.dm_leave((select v from ids where k = 'g'));
select t.as('d0000000-0000-0000-0000-000000000002');
select t.ok((select role from public.conversation_members where conversation_id = (select v from ids where k = 'g')) = 'admin', 'last admin leaves → next member becomes admin');
reset role; select t.as('');
insert into auth.users select ('f0000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, 'g' || i || '@x' from generate_series(1, 32) i;
insert into public.social_profiles (id, username, display_name) select ('f0000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, 'dmg' || lpad(i::text, 3, '0'), 'Member ' || i from generate_series(1, 32) i;
insert into public.friendships (user_a, user_b) select least('d0000000-0000-0000-0000-000000000002'::uuid, id), greatest('d0000000-0000-0000-0000-000000000002'::uuid, id) from public.social_profiles where username like 'dmg%';
set role authenticated; select t.as('d0000000-0000-0000-0000-000000000002');
select t.fails($$select public.dm_create_group('Too big', array(select id from public.social_profiles where username like 'dmg%'))$$, 'dm_group_full', 'groups: 32 people max (you + 32 refused)');
insert into ids select 'gmax', public.dm_create_group('Max', array(select id from public.social_profiles where username like 'dmg%' and username <> 'dmg032'));
select t.ok((select count(*) from public.dm_members((select v from ids where k = 'gmax'))) = 32, 'groups: you + 31 = 32 allowed');
select t.fails($$select public.dm_add_members((select v from ids where k = 'gmax'), array(select id from public.social_profiles where username = 'dmg032'))$$, 'dm_group_full', 'groups: cannot add a 33rd person');

-- ===== reports (moderation records)
select t.as('d0000000-0000-0000-0000-000000000001'); insert into public.messages (id, conversation_id, body) values ('e0000000-0000-0000-0000-000000000006', (select v from ids where k = 'pq'), 'report me');
select t.as('d0000000-0000-0000-0000-000000000002');
insert into public.message_reports (target_type, conversation_id, message_id, reason, details) values ('message', (select v from ids where k = 'pq'), 'e0000000-0000-0000-0000-000000000006', 'harassment', 'not ok');
insert into public.message_reports (target_type, conversation_id, reason) values ('conversation', (select v from ids where k = 'pq'), 'spam');
select t.fails($$select * from public.message_reports$$, 'permission denied', 'reporters cannot read reports');
select t.as('d0000000-0000-0000-0000-000000000006');
select t.fails($$insert into public.message_reports (target_type, conversation_id, reason) values ('conversation', (select v from ids where k = 'pq'), 'spam')$$, 'dm_not_member', 'cannot report a chat you are not in');
reset role; select t.as('');
select t.ok((select snapshot->>'body' from public.message_reports where message_id = 'e0000000-0000-0000-0000-000000000006') = 'report me' and (select target_user_id from public.message_reports where message_id = 'e0000000-0000-0000-0000-000000000006') = 'd0000000-0000-0000-0000-000000000001', 'message report keeps a snapshot + who sent it');
select t.ok(jsonb_array_length((select snapshot->'recent' from public.message_reports where target_type = 'conversation')) >= 2 and (select target_user_id from public.message_reports where target_type = 'conversation') = 'd0000000-0000-0000-0000-000000000001', 'conversation report keeps the recent messages for context');
set role authenticated;

-- ===== storage: message-media bucket
select t.as('d0000000-0000-0000-0000-000000000002');
insert into storage.objects (bucket_id, name) values ('message-media', (select v from ids where k = 'pq')::text || '/d0000000-0000-0000-0000-000000000002/x.webp');
select t.fails($$insert into public.messages (conversation_id, kind, body, media) values ((select v from ids where k = 'pq'), 'image', '', jsonb_build_object('path', (select v from ids where k = 'rp')::text || '/d0000000-0000-0000-0000-000000000002/x.webp', 'w', 1, 'h', 1, 'mime', 'image/webp'))$$, 'dm_media_path', 'media must live in this chat''s folder');
select t.as('d0000000-0000-0000-0000-000000000006');
select t.fails($$insert into storage.objects (bucket_id, name) values ('message-media', (select v from ids where k = 'pq')::text || '/d0000000-0000-0000-0000-000000000006/y.webp')$$, 'row-level security', 'non-participant cannot upload into a chat folder');
select t.as('d0000000-0000-0000-0000-000000000001');
select t.ok((select count(*) from storage.objects where bucket_id = 'message-media') = 0, 'uploaded file is private until a message uses it');
select t.as('d0000000-0000-0000-0000-000000000002');
insert into public.messages (conversation_id, kind, body, media) values ((select v from ids where k = 'pq'), 'image', 'Look', jsonb_build_object('path', (select v from ids where k = 'pq')::text || '/d0000000-0000-0000-0000-000000000002/x.webp', 'w', 10, 'h', 10, 'mime', 'image/webp'));
select t.as('d0000000-0000-0000-0000-000000000001');
select t.ok((select count(*) from storage.objects where bucket_id = 'message-media') = 1, 'chat members can read media sent in the chat');
select t.as('d0000000-0000-0000-0000-000000000006');
select t.ok((select count(*) from storage.objects where bucket_id = 'message-media') = 0, 'non-participants cannot read message media');

-- ===== becoming friends turns a pending request into a chat
select t.as('d0000000-0000-0000-0000-000000000007');
insert into ids select 'vn', public.dm_open_direct('d0000000-0000-0000-0000-000000000006');
insert into public.messages (conversation_id, body) values ((select v from ids where k = 'vn'), 'Hi N');
select t.as('d0000000-0000-0000-0000-000000000006');
select t.ok((select state from public.dm_inbox() where conversation_id = (select v from ids where k = 'vn')) = 'request', 'V → N is a request');
select public.social_send_request('d0000000-0000-0000-0000-000000000007'); select t.as('d0000000-0000-0000-0000-000000000007'); select public.social_respond_request('d0000000-0000-0000-0000-000000000006', true);
select t.as('d0000000-0000-0000-0000-000000000006');
select t.ok((select state from public.dm_inbox() where conversation_id = (select v from ids where k = 'vn')) = 'active', 'after becoming friends the request moves to Chats');

-- ===== banned accounts can't send
reset role; insert into public.social_bans (user_id, reason) values ('d0000000-0000-0000-0000-000000000007', 'test'); set role authenticated;
select t.as('d0000000-0000-0000-0000-000000000007');
select t.fails($$insert into public.messages (conversation_id, body) values ((select v from ids where k = 'vn'), 'spam')$$, 'banned', 'banned account cannot send messages');
reset role; delete from public.social_bans where user_id = 'd0000000-0000-0000-0000-000000000007'; set role authenticated;

-- ===== anon + structure
reset role; set role anon;
select t.fails($$select * from public.messages$$, 'permission denied', 'anon: no messages');
select t.fails($$select * from public.conversations$$, 'permission denied', 'anon: no conversations');
select t.fails($$select * from public.conversation_members$$, 'permission denied', 'anon: no members');
select t.fails($$select * from public.dm_settings$$, 'permission denied', 'anon: no settings');
select t.fails($$select * from public.dm_inbox()$$, 'permission denied', 'anon: no inbox');
reset role;
select t.ok((select bool_and(rowsecurity) from pg_tables where schemaname = 'public' and tablename in ('dm_settings', 'conversations', 'conversation_members', 'messages', 'message_reactions', 'message_hidden', 'message_reports', 'push_subscriptions'))
  and (select count(*) from pg_tables where schemaname = 'public' and tablename in ('dm_settings', 'conversations', 'conversation_members', 'messages', 'message_reactions', 'message_hidden', 'message_reports', 'push_subscriptions')) = 8, 'Messages: RLS on all 8 tables');
select t.ok((select not public and file_size_limit = 52428800 from storage.buckets where id = 'message-media'), 'message-media bucket is private, 50 MB');
select t.ok((select count(*) from pg_policies where schemaname = 'storage' and policyname like 'message_media_%') = 3, 'message-media: 3 storage policies');
select t.ok(true, 'ALL MESSAGES SQL CHECKS PASSED');
