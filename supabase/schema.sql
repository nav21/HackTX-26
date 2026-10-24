-- =============================================================
-- HackTX schema
-- Paste into Supabase Dashboard -> SQL Editor -> Run.
-- Safe to re-run: uses IF NOT EXISTS / OR REPLACE / DROP IF EXISTS.
--
-- RULES (see README "Security checklist"):
--   * Every table in public gets RLS enabled right after CREATE TABLE.
--   * Separate select / insert / update / delete policies, scoped to the owner.
--   * Insert + update policies always have WITH CHECK.
--   * No USING (true) for writes.
-- =============================================================


-- -------------------------------------------------------------
-- profiles: one row per auth user
-- -------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url   text,
  created_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  to authenticated
  with check ((select auth.uid()) = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- No delete policy on purpose: users can't delete their profile directly.
-- The row is removed automatically when the auth user is deleted (on delete cascade).


-- -------------------------------------------------------------
-- Auto-create a profile when a user signs up
-- -------------------------------------------------------------
-- This must be SECURITY DEFINER because it runs as part of the insert into
-- auth.users (no user session exists yet). It is locked down per Step 4b:
--   * search_path is empty, so every object is schema-qualified
--   * it only ever inserts a row for NEW.id (the user being created)
--   * EXECUTE is revoked from public/anon/authenticated
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
