-- LOCAL TESTING ONLY. Mind & Recovery tables (mind_checkins, journal_entries, mind_sessions, mind_screens): owner-only RLS,
-- anon has no access, default user_id, and "keep on this device" entries are rejected by the database.
-- Run by tools/test-social-sql.sh after schema.sql (applied twice), test-social.sql and test-sleep.sql (which creates the t.* helpers).
\set ON_ERROR_STOP 1
set client_min_messages = notice;
set role authenticated;
select t.as('aaaaaaaa-0000-0000-0000-000000000001');
insert into public.mind_checkins (id, day, data) values ('ci-2026-11-16', '2026-11-16', '{"date":"2026-11-16","mood":4,"stress":2,"energy":4,"motivation":4,"soreness":2,"sleepQ":4,"score":78,"rec":"go","v":1}');
insert into public.journal_entries (id, day, data) values ('j1', '2026-11-16', '{"date":"2026-11-16","kind":"win","text":"Held pace on the last km."}');
insert into public.mind_sessions (id, day, data) values ('s1', '2026-11-16', '{"date":"2026-11-16","kind":"breathe","ref":"sigh","minutes":5}');
insert into public.mind_screens (id, day, data) values ('sc1', '2026-11-16', '{"date":"2026-11-16","who5":[3,3,3,3,3],"safety":"no"}');
select t.ok((select user_id from public.mind_checkins where id = 'ci-2026-11-16') = 'aaaaaaaa-0000-0000-0000-000000000001', 'mind_checkins: user_id defaults to the signed-in user');
select t.ok((select count(*) from public.journal_entries) = 1 and (select count(*) from public.mind_sessions) = 1 and (select count(*) from public.mind_screens) = 1, 'journal / sessions / screens: owner can read own rows');
update public.journal_entries set data = jsonb_set(data, '{text}', '"Edited"') where id = 'j1';
select t.ok((select data->>'text' from public.journal_entries where id = 'j1') = 'Edited', 'journal_entries: owner can update own row');
select t.fails($$insert into public.journal_entries (id, day, data) values ('j-local', '2026-11-16', '{"date":"2026-11-16","kind":"free","text":"x","localOnly":true}')$$, 'not_local_only|check constraint', 'journal_entries: device-only entries are rejected');
select t.fails($$insert into public.mind_screens (id, day, data) values ('sc-local', '2026-11-16', '{"date":"2026-11-16","localOnly":true}')$$, 'not_local_only|check constraint', 'mind_screens: device-only check-ups are rejected');
select t.as('bbbbbbbb-0000-0000-0000-000000000002');
select t.ok((select count(*) from public.mind_checkins) + (select count(*) from public.journal_entries) + (select count(*) from public.mind_sessions) + (select count(*) from public.mind_screens) = 0, 'Mind tables: another user sees nothing');
update public.journal_entries set deleted = true where id = 'j1';
delete from public.mind_checkins where id = 'ci-2026-11-16';
select t.as('aaaaaaaa-0000-0000-0000-000000000001');
select t.ok((select deleted from public.journal_entries where id = 'j1') = false and (select count(*) from public.mind_checkins) = 1, 'Mind tables: another user cannot update or delete my rows');
select t.as('bbbbbbbb-0000-0000-0000-000000000002');
select t.fails($$insert into public.journal_entries (id, user_id, day, data) values ('x', 'aaaaaaaa-0000-0000-0000-000000000001', '2026-11-16', '{"date":"2026-11-16","kind":"free","text":"x"}')$$, 'row-level security|violates', 'journal_entries: cannot insert a row for someone else');
reset role;
set role anon;
select t.fails($$select * from public.mind_checkins$$, 'permission denied', 'mind_checkins: anon has no access');
select t.fails($$select * from public.journal_entries$$, 'permission denied', 'journal_entries: anon has no access');
select t.fails($$select * from public.mind_sessions$$, 'permission denied', 'mind_sessions: anon has no access');
select t.fails($$select * from public.mind_screens$$, 'permission denied', 'mind_screens: anon has no access');
reset role;
select t.ok((select bool_and(rowsecurity) from pg_tables where schemaname = 'public' and tablename in ('mind_checkins','journal_entries','mind_sessions','mind_screens')) and (select count(*) from pg_policies where schemaname = 'public' and tablename in ('mind_checkins','journal_entries','mind_sessions','mind_screens')) = 16, 'Mind tables: RLS on with 4 owner policies each');
