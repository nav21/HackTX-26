-- =============================================================
-- BWS schema (SPEC.md §7). Full data model for all phases.
--
-- Apply with `npm --prefix server run db:migrate` (runs in one transaction),
-- or paste into Supabase Dashboard -> SQL Editor -> Run.
-- Idempotent: safe to re-run (IF NOT EXISTS / OR REPLACE / DROP IF EXISTS).
--
-- RULES (README "Security checklist", SETUP.md Step 4b):
--   * Every table in public has RLS enabled right after CREATE TABLE.
--   * Clients only get SELECT policies (plus a few own-row UPDATEs).
--     All writes go through the server (service role bypasses RLS).
--   * No USING (true).
--   * Column grants hide secrets: clients can't select devices.secret_hash /
--     devices.pairing_code, so never `select('*')` from devices with the anon key;
--     list the columns (or use the API). Add new device columns to the grant below.
-- =============================================================


-- -------------------------------------------------------------
-- Enums
-- -------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'device_mode' and typnamespace = 'public'::regnamespace) then
    create type public.device_mode as enum ('care', 'habit', 'security');
  end if;
  if not exists (select 1 from pg_type where typname = 'member_role' and typnamespace = 'public'::regnamespace) then
    create type public.member_role as enum ('owner', 'caregiver', 'viewer');
  end if;
  if not exists (select 1 from pg_type where typname = 'event_source' and typnamespace = 'public'::regnamespace) then
    create type public.event_source as enum ('device', 'simulator', 'server', 'manual');
  end if;
end $$;


-- -------------------------------------------------------------
-- profiles: one row per auth user
-- -------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url   text,
  created_at   timestamptz not null default now()
);
alter table public.profiles add column if not exists timezone text not null default 'America/Chicago';
alter table public.profiles add column if not exists email text;
create index if not exists profiles_email_lower_idx on public.profiles (lower(email));

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

-- Profiles are created by the signup trigger only.
drop policy if exists "profiles_insert_own" on public.profiles;

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Users may only edit these columns directly (email is synced from auth.users and
-- used for caregiver lookup, so it must not be client-writable).
revoke update on public.profiles from anon, authenticated;
grant update (display_name, avatar_url, timezone) on public.profiles to authenticated;


-- -------------------------------------------------------------
-- groups + group_members (Habit)
-- -------------------------------------------------------------
create table if not exists public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  invite_code text not null unique,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);
alter table public.groups enable row level security;

create table if not exists public.group_members (
  group_id  uuid not null references public.groups (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists group_members_user_idx on public.group_members (user_id);
alter table public.group_members enable row level security;


-- -------------------------------------------------------------
-- devices
-- -------------------------------------------------------------
create table if not exists public.devices (
  id             uuid primary key default gen_random_uuid(),
  name           text not null default 'BWS',
  mode           public.device_mode not null default 'care',
  container_type text not null default 'other'
                 check (container_type in ('pillbox', 'supplement', 'backpack', 'drawer', 'other')),
  icon           text,
  armed          boolean not null default false,
  silent         boolean not null default false,
  tone           text not null default 'supportive' check (tone in ('supportive', 'roast')),
  timezone       text not null default 'America/Chicago',
  pairing_code   text not null unique check (pairing_code ~ '^[0-9]{4}$'),
  secret_hash    text not null,
  claimed_at     timestamptz,
  last_seen_at   timestamptz,
  lid_state      text not null default 'unknown' check (lid_state in ('open', 'closed', 'unknown')),
  group_id       uuid references public.groups (id) on delete set null,
  created_at     timestamptz not null default now()
);
-- Server-managed state (API.md / ingest dedupe / offline detection).
alter table public.devices add column if not exists led text not null default 'OFF';
alter table public.devices add column if not exists last_seq int;            -- highest OPEN/CLOSE seq since boot
alter table public.devices add column if not exists last_seq_at timestamptz; -- occurred_at of that event
alter table public.devices add column if not exists boot_count int not null default 0;
alter table public.devices add column if not exists last_boot_at timestamptz;
alter table public.devices add column if not exists offline_since timestamptz; -- set once when `offline` fires
-- Habit config (SPEC §6.2): optional reminder time + microcopy ("Nav took creatine").
alter table public.devices add column if not exists reminder_time time;
alter table public.devices add column if not exists habit_label text;   -- defaults to the device name
alter table public.devices add column if not exists habit_action text;  -- e.g. "took creatine"
create index if not exists devices_group_idx on public.devices (group_id);
alter table public.devices enable row level security;

create table if not exists public.device_members (
  device_id  uuid not null references public.devices (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  role       public.member_role not null,
  created_at timestamptz not null default now(),
  primary key (device_id, user_id)
);
create index if not exists device_members_user_idx on public.device_members (user_id);
create unique index if not exists device_members_one_owner on public.device_members (device_id) where role = 'owner';
alter table public.device_members enable row level security;


-- -------------------------------------------------------------
-- RLS helpers (security definer avoids policy recursion on device_members)
-- -------------------------------------------------------------
create or replace function public.is_device_member(device uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.device_members m
    where m.device_id = device and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_device_owner(device uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.device_members m
    where m.device_id = device and m.user_id = auth.uid() and m.role = 'owner'
  );
$$;

create or replace function public.is_group_member(gid uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.group_members g
    where g.group_id = gid and g.user_id = auth.uid()
  );
$$;

revoke execute on function public.is_device_member(uuid) from public, anon;
revoke execute on function public.is_device_owner(uuid) from public, anon;
revoke execute on function public.is_group_member(uuid) from public, anon;
grant execute on function public.is_device_member(uuid) to authenticated, service_role;
grant execute on function public.is_device_owner(uuid) to authenticated, service_role;
grant execute on function public.is_group_member(uuid) to authenticated, service_role;


-- devices policies + column grants (hide secret_hash, pairing_code)
drop policy if exists "devices_select_member" on public.devices;
create policy "devices_select_member" on public.devices for select to authenticated
  using (public.is_device_member(id));

revoke select on public.devices from anon, authenticated;
grant select (id, name, mode, container_type, icon, armed, silent, tone, timezone, claimed_at,
              last_seen_at, lid_state, group_id, created_at, led, last_seq, boot_count, offline_since,
              reminder_time, habit_label, habit_action)
  on public.devices to authenticated;

drop policy if exists "device_members_select" on public.device_members;
create policy "device_members_select" on public.device_members for select to authenticated
  using (user_id = (select auth.uid()) or public.is_device_owner(device_id));

drop policy if exists "groups_select_member" on public.groups;
create policy "groups_select_member" on public.groups for select to authenticated
  using (public.is_group_member(id));

drop policy if exists "group_members_select_member" on public.group_members;
create policy "group_members_select_member" on public.group_members for select to authenticated
  using (public.is_group_member(group_id));


-- -------------------------------------------------------------
-- schedules + dose_instances (Care)
-- -------------------------------------------------------------
create table if not exists public.schedules (
  id                 uuid primary key default gen_random_uuid(),
  device_id          uuid not null references public.devices (id) on delete cascade,
  label              text not null,
  time_of_day        time not null,
  days               int[] not null default '{0,1,2,3,4,5,6}',
  window_before_min  int not null default 60 check (window_before_min >= 0),
  grace_min          int not null default 30 check (grace_min >= 0),
  escalate_after_min int not null default 30 check (escalate_after_min >= 0),
  active             boolean not null default true,
  created_at         timestamptz not null default now()
);
create index if not exists schedules_device_idx on public.schedules (device_id);
alter table public.schedules enable row level security;

drop policy if exists "schedules_select_member" on public.schedules;
create policy "schedules_select_member" on public.schedules for select to authenticated
  using (public.is_device_member(device_id));

create table if not exists public.dose_instances (
  id          uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.schedules (id) on delete cascade,
  device_id   uuid not null references public.devices (id) on delete cascade,
  date        date not null,
  status      text not null default 'upcoming' check (status in ('upcoming', 'taken', 'late', 'missed')),
  opened_at   timestamptz,
  escalated   boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (schedule_id, date)
);
alter table public.dose_instances add column if not exists source text check (source in ('sensor', 'manual'));
alter table public.dose_instances add column if not exists scheduled_at timestamptz;     -- dose time as an instant
alter table public.dose_instances add column if not exists last_reminder_at timestamptz; -- re-notify every 15 min
create index if not exists dose_instances_device_date_idx on public.dose_instances (device_id, date desc);
alter table public.dose_instances enable row level security;

drop policy if exists "dose_instances_select_member" on public.dose_instances;
create policy "dose_instances_select_member" on public.dose_instances for select to authenticated
  using (public.is_device_member(device_id));


-- -------------------------------------------------------------
-- events: tamper-evident log (hash chain, SPEC §8)
-- -------------------------------------------------------------
create table if not exists public.events (
  id          bigserial primary key,
  device_id   uuid not null references public.devices (id) on delete cascade,
  type        text not null,
  source      public.event_source not null,
  seq         int,
  occurred_at timestamptz not null,
  payload     jsonb not null default '{}'::jsonb,
  prev_hash   text not null,
  hash        text not null,
  created_at  timestamptz not null default now()
);
create index if not exists events_device_id_idx on public.events (device_id, id desc);
create index if not exists events_device_type_time_idx on public.events (device_id, type, occurred_at desc);
alter table public.events enable row level security;

drop policy if exists "events_select_member" on public.events;
create policy "events_select_member" on public.events for select to authenticated
  using (public.is_device_member(device_id));

-- Appends one event to a device's chain. The hash is computed in Node
-- (server/lib/hash.js); this function serializes appends per device and rejects
-- the insert if p_prev_hash is stale (SQLSTATE BWS01, DETAIL = current head hash),
-- so the caller recomputes and retries. Service role only.
create or replace function public.append_event(
  p_device      uuid,
  p_type        text,
  p_source      public.event_source,
  p_seq         int,
  p_occurred_at timestamptz,
  p_payload     jsonb,
  p_prev_hash   text,
  p_hash        text
)
returns public.events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_head text;
  v_row  public.events;
begin
  perform pg_advisory_xact_lock(hashtextextended('bws_events:' || p_device::text, 0));

  select e.hash into v_head
  from public.events e
  where e.device_id = p_device
  order by e.id desc
  limit 1;

  v_head := coalesce(v_head, 'GENESIS');
  if v_head is distinct from p_prev_hash then
    raise exception 'chain_conflict' using errcode = 'BWS01', detail = v_head;
  end if;

  insert into public.events (device_id, type, source, seq, occurred_at, payload, prev_hash, hash)
  values (p_device, p_type, p_source, p_seq, p_occurred_at, coalesce(p_payload, '{}'::jsonb), p_prev_hash, p_hash)
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function public.append_event(uuid, text, public.event_source, int, timestamptz, jsonb, text, text)
  from public, anon, authenticated;
grant execute on function public.append_event(uuid, text, public.event_source, int, timestamptz, jsonb, text, text)
  to service_role;


-- -------------------------------------------------------------
-- notifications
-- -------------------------------------------------------------
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  device_id  uuid references public.devices (id) on delete cascade,
  kind       text not null,
  title      text not null,
  body       text,
  urgent     boolean not null default false,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_created_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_user_unread_idx on public.notifications (user_id) where read_at is null;
alter table public.notifications enable row level security;

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own" on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own" on public.notifications for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke update on public.notifications from anon, authenticated;
grant update (read_at) on public.notifications to authenticated;


-- -------------------------------------------------------------
-- streaks (Habit)
-- -------------------------------------------------------------
create table if not exists public.streaks (
  device_id      uuid not null references public.devices (id) on delete cascade,
  user_id        uuid not null references public.profiles (id) on delete cascade,
  current        int not null default 0,
  best           int not null default 0,
  last_done_date date,
  updated_at     timestamptz not null default now(),
  primary key (device_id, user_id)
);
alter table public.streaks enable row level security;

drop policy if exists "streaks_select_member" on public.streaks;
create policy "streaks_select_member" on public.streaks for select to authenticated
  using (public.is_device_member(device_id));


-- -------------------------------------------------------------
-- group_posts: group feed (friends aren't members of each other's devices,
-- so the feed can't be built from events under RLS)
-- -------------------------------------------------------------
create table if not exists public.group_posts (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups (id) on delete cascade,
  user_id    uuid references public.profiles (id) on delete set null,
  device_id  uuid references public.devices (id) on delete set null,
  kind       text not null check (kind in ('habit_done', 'streak_broken', 'ai')),
  body       text not null,
  ai         boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists group_posts_group_created_idx on public.group_posts (group_id, created_at desc);
alter table public.group_posts enable row level security;

drop policy if exists "group_posts_select_member" on public.group_posts;
create policy "group_posts_select_member" on public.group_posts for select to authenticated
  using (public.is_group_member(group_id));


-- -------------------------------------------------------------
-- ai_insights
-- -------------------------------------------------------------
create table if not exists public.ai_insights (
  id         uuid primary key default gen_random_uuid(),
  device_id  uuid not null references public.devices (id) on delete cascade,
  kind       text not null,
  content    text not null,
  data       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.ai_insights drop constraint if exists ai_insights_kind_check;
alter table public.ai_insights add constraint ai_insights_kind_check
  check (kind in ('daily_summary', 'nudge', 'incident', 'schedule_parse', 'group_post'));
create index if not exists ai_insights_device_created_idx on public.ai_insights (device_id, kind, created_at desc);
alter table public.ai_insights enable row level security;

drop policy if exists "ai_insights_select_member" on public.ai_insights;
create policy "ai_insights_select_member" on public.ai_insights for select to authenticated
  using (public.is_device_member(device_id));


-- -------------------------------------------------------------
-- device_commands: server -> bridge queue. No client access at all.
-- -------------------------------------------------------------
create table if not exists public.device_commands (
  id           bigserial primary key,
  device_id    uuid not null references public.devices (id) on delete cascade,
  command      text not null,
  created_at   timestamptz not null default now(),
  delivered_at timestamptz
);
create index if not exists device_commands_pending_idx on public.device_commands (device_id, id) where delivered_at is null;
alter table public.device_commands enable row level security;
revoke all on public.device_commands from anon, authenticated;


-- -------------------------------------------------------------
-- scheduler_lease: every server on this DB runs the 15 s scheduler; only the lease holder ticks.
-- (A row lease instead of pg_try_advisory_lock: PostgREST pools connections, so session locks would leak.)
-- -------------------------------------------------------------
create table if not exists public.scheduler_lease (
  id         int primary key default 1 check (id = 1),
  holder     text not null,
  expires_at timestamptz not null
);
alter table public.scheduler_lease enable row level security;
revoke all on public.scheduler_lease from anon, authenticated;

-- Take or renew the lease. → true if p_holder holds it for the next p_ttl_seconds.
create or replace function public.claim_scheduler_lease(p_holder text, p_ttl_seconds int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_holder text;
begin
  insert into public.scheduler_lease (id, holder, expires_at)
  values (1, p_holder, now() + make_interval(secs => p_ttl_seconds))
  on conflict (id) do update
    set holder = excluded.holder, expires_at = excluded.expires_at
    where scheduler_lease.holder = excluded.holder or scheduler_lease.expires_at < now()
  returning holder into v_holder;
  return v_holder is not null;
end;
$$;

revoke execute on function public.claim_scheduler_lease(text, int) from public, anon, authenticated;
grant execute on function public.claim_scheduler_lease(text, int) to service_role;


-- -------------------------------------------------------------
-- push_prefs
-- -------------------------------------------------------------
create table if not exists public.push_prefs (
  user_id         uuid primary key references public.profiles (id) on delete cascade,
  browser_enabled boolean not null default false,
  email_enabled   boolean not null default false,
  updated_at      timestamptz not null default now()
);
alter table public.push_prefs enable row level security;

drop policy if exists "push_prefs_select_own" on public.push_prefs;
create policy "push_prefs_select_own" on public.push_prefs for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "push_prefs_update_own" on public.push_prefs;
create policy "push_prefs_update_own" on public.push_prefs for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke update on public.push_prefs from anon, authenticated;
grant update (browser_enabled, email_enabled) on public.push_prefs to authenticated;


-- -------------------------------------------------------------
-- Signup trigger: profile (+ email) and push_prefs for every new auth user.
-- SECURITY DEFINER because it runs inside the auth.users insert. Locked down:
-- empty search_path, only touches NEW.id, EXECUTE revoked from clients.
-- -------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do update set email = excluded.email;

  insert into public.push_prefs (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep profiles.email in sync when a user changes their email.
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

revoke execute on function public.handle_user_email_change() from public, anon, authenticated;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function public.handle_user_email_change();

-- Backfill users that signed up before this version of the schema.
insert into public.profiles (id, display_name, email)
select u.id, coalesce(u.raw_user_meta_data ->> 'display_name', split_part(u.email, '@', 1)), u.email
from auth.users u
on conflict (id) do nothing;

update public.profiles p set email = u.email
from auth.users u
where u.id = p.id and p.email is distinct from u.email;

insert into public.push_prefs (user_id)
select p.id from public.profiles p
on conflict (user_id) do nothing;


-- -------------------------------------------------------------
-- Realtime: publish the tables the client subscribes to (RLS still applies).
-- -------------------------------------------------------------
do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array['events', 'notifications', 'devices', 'dose_instances', 'streaks', 'group_posts'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- UPDATE payloads include the old row (client animates lid/mode changes).
alter table public.devices replica identity full;
