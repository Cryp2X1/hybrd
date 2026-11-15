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

-- ---------- shared shape for the log tables ----------
-- id is generated on the device (UUID string) so offline records can sync later.
do $$
declare t text;
begin
  foreach t in array array['workouts', 'gps_routes', 'food_logs', 'water_logs', 'body_logs', 'templates', 'step_logs', 'burn_logs', 'wl_plans'] loop
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
  foreach t in array array['workouts', 'gps_routes', 'food_logs', 'water_logs', 'body_logs', 'templates', 'step_logs', 'burn_logs', 'wl_plans'] loop
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
revoke all on public.profiles, public.workouts, public.gps_routes, public.food_logs, public.water_logs, public.body_logs, public.templates, public.step_logs, public.burn_logs, public.wl_plans from anon;
grant select, insert, update, delete on public.profiles, public.workouts, public.gps_routes, public.food_logs, public.water_logs, public.body_logs, public.templates, public.step_logs, public.burn_logs, public.wl_plans to authenticated;

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
  and tablename in ('profiles','workouts','gps_routes','food_logs','water_logs','body_logs','templates','step_logs','burn_logs','wl_plans');
