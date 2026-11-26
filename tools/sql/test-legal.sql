-- LOCAL TESTING ONLY. Legal (v1.7): proof-of-assent log (legal_acceptances) written only through
-- legal_record_acceptance(); owner-only reads; no edits or deletes; clamped timestamps; rows go with the account.
-- Runs from tools/test-social-sql.sh after test-social.sql (which creates the t.* helpers). Any failed check stops psql.
\set ON_ERROR_STOP 1
set client_min_messages = notice;
reset role;
insert into auth.users (id, email) values ('1e000000-0000-0000-0000-0000000000a1', 'lg-ann@x'), ('1e000000-0000-0000-0000-0000000000b2', 'lg-bob@x');
set role authenticated;
select t.as('1e000000-0000-0000-0000-0000000000a1');
select t.ok(public.legal_record_acceptance('2026-11-26', '2026-11-26', 'onboarding', 18, now(), '{"health":{"granted":true}}') is not null, 'signed-in user records an acceptance');
select t.ok((select count(*) from public.legal_acceptances) = 1, 'owner sees own acceptance');
select t.ok(public.legal_record_acceptance('2026-11-26', '2026-11-26', 'reaccept', 18, now() + interval '3 days', '{}') is not null, 'second acceptance (re-accept) recorded');
select t.ok((select bool_and(accepted_at <= recorded_at) from public.legal_acceptances), 'future accepted_at is clamped to now');
select t.ok((select consents->'health'->>'granted' from public.legal_acceptances where source = 'onboarding') = 'true', 'consents snapshot stored');
select t.fails($$ select public.legal_record_acceptance('2026-11-26', '2026-11-26', 'browsewrap', 18, now(), '{}') $$, 'legal_acceptances_source_chk', 'unknown source rejected');
select t.fails($$ select public.legal_record_acceptance('2026-11-26', '2026-11-26', 'onboarding', 12, now(), '{}') $$, 'legal_acceptances_len_chk', 'minimum age below 13 rejected');
select t.fails($$ insert into public.legal_acceptances (user_id, terms_version, privacy_version, source, min_age, accepted_at) values ('1e000000-0000-0000-0000-0000000000a1', 'x', 'x', 'onboarding', 18, now()) $$, 'permission denied', 'no direct inserts');
select t.fails($$ update public.legal_acceptances set terms_version = 'forged' $$, 'permission denied', 'no updates');
select t.fails($$ delete from public.legal_acceptances $$, 'permission denied', 'no deletes');
select t.as('1e000000-0000-0000-0000-0000000000b2');
select t.ok((select count(*) from public.legal_acceptances) = 0, 'other users cannot read someone else''s acceptances');
select t.as('');
reset role;
set role anon;
select t.fails($$ select public.legal_record_acceptance('2026-11-26', '2026-11-26', 'onboarding', 18, now(), '{}') $$, 'permission denied|not_signed_in', 'anon cannot record');
reset role;
select t.ok((select relrowsecurity from pg_class where oid = 'public.legal_acceptances'::regclass), 'RLS is on for legal_acceptances');
delete from auth.users where id in ('1e000000-0000-0000-0000-0000000000a1', '1e000000-0000-0000-0000-0000000000b2');
select t.ok((select count(*) from public.legal_acceptances where user_id = '1e000000-0000-0000-0000-0000000000a1') = 0, 'rows go with the account when it is purged');
do $$ begin raise notice 'ALL LEGAL SQL CHECKS PASSED'; end $$;
