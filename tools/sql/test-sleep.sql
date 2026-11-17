-- LOCAL TESTING ONLY. Fuel › Sleep tables (sleep_logs, caffeine_logs): owner-only RLS, anon has no access, default user_id.
-- Run by tools/test-social-sql.sh after schema.sql (applied twice) and test-social.sql (which creates the t.* helpers and users A/B).
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
create or replace function t.as(u text) returns void language sql as $$ select set_config('request.jwt.claim.sub', u, false) $$;
grant execute on all functions in schema t to authenticated, anon;
insert into auth.users (id, email) values ('aaaaaaaa-0000-0000-0000-000000000001', 'a@x'), ('bbbbbbbb-0000-0000-0000-000000000002', 'b@x') on conflict do nothing;
set client_min_messages = notice;
set role authenticated;
select t.as('aaaaaaaa-0000-0000-0000-000000000001');
insert into public.sleep_logs (id, day, data) values ('night-2026-11-16', '2026-11-16', '{"date":"2026-11-16","hours":7.5,"quality":4,"caffeineLate":false,"alcohol":false,"lateMeal":false}');
insert into public.caffeine_logs (id, day, data) values ('c1', '2026-11-16', '{"date":"2026-11-16","at":1763290800000,"mg":95,"drink":"coffee","label":"Brewed coffee"}');
select t.ok((select user_id from public.sleep_logs where id = 'night-2026-11-16') = 'aaaaaaaa-0000-0000-0000-000000000001', 'sleep_logs: user_id defaults to the signed-in user');
select t.ok((select count(*) from public.caffeine_logs) = 1, 'caffeine_logs: owner can read own row');
update public.sleep_logs set data = jsonb_set(data, '{quality}', '5') where id = 'night-2026-11-16';
select t.ok((select (data->>'quality')::int from public.sleep_logs where id = 'night-2026-11-16') = 5, 'sleep_logs: owner can update own row');
select t.as('bbbbbbbb-0000-0000-0000-000000000002');
select t.ok((select count(*) from public.sleep_logs) = 0 and (select count(*) from public.caffeine_logs) = 0, 'sleep + caffeine logs: another user sees nothing');
update public.sleep_logs set deleted = true where id = 'night-2026-11-16';
select t.as('aaaaaaaa-0000-0000-0000-000000000001');
select t.ok((select deleted from public.sleep_logs where id = 'night-2026-11-16') = false, 'sleep_logs: another user cannot update my row');
select t.as('bbbbbbbb-0000-0000-0000-000000000002');
select t.fails($$insert into public.sleep_logs (id, user_id, day, data) values ('x', 'aaaaaaaa-0000-0000-0000-000000000001', '2026-11-16', '{}')$$, 'row-level security|violates', 'sleep_logs: cannot insert a row for someone else');
reset role;
set role anon;
select t.fails($$select * from public.sleep_logs$$, 'permission denied', 'sleep_logs: anon has no access');
select t.fails($$select * from public.caffeine_logs$$, 'permission denied', 'caffeine_logs: anon has no access');
reset role;
