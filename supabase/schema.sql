-- Mexico City Trip Planner schema
-- Run this in the Supabase SQL editor for a fresh project.

create extension if not exists "pgcrypto";

create table if not exists trips (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Mexico City Trip',
  created_at timestamptz not null default now()
);

do $$ begin
  create type event_category as enum (
    'daytrip', 'museums', 'food', 'attractions', 'cafe', 'drinks', 'architecture', 'stores'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  title text not null,
  category event_category not null default 'food',
  start_time timestamptz not null,
  end_time timestamptz not null,
  address text,
  place_name text,
  lat double precision,
  lng double precision,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint end_after_start check (end_time > start_time)
);

create index if not exists events_trip_id_idx on events(trip_id);
create index if not exists events_trip_time_idx on events(trip_id, start_time);

-- Realtime's server-side filter (trip_id=eq.<id>) is evaluated against the
-- OLD row on UPDATE/DELETE. With the default replica identity (primary key
-- only), the old row only carries `id`, so the filter can't be evaluated
-- and Realtime silently drops the event. FULL identity includes trip_id.
alter table events replica identity full;

-- Keep updated_at accurate on every edit, independent of client clocks.
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists events_set_updated_at on events;
create trigger events_set_updated_at
  before update on events
  for each row
  execute function set_updated_at();

-- Row Level Security.
-- There is no login/auth in this app: a trip's UUID in the URL is the
-- entire "credential", the same model as an unlisted shareable-link doc.
-- The app must never query these tables without a trip_id filter, so
-- trips stay effectively unenumerable even though these policies are
-- permissive.
alter table trips enable row level security;
alter table events enable row level security;

drop policy if exists "anyone can read a trip" on trips;
create policy "anyone can read a trip" on trips
  for select using (true);

drop policy if exists "anyone can create a trip" on trips;
create policy "anyone can create a trip" on trips
  for insert with check (true);

drop policy if exists "anyone can read events" on events;
create policy "anyone can read events" on events
  for select using (true);

drop policy if exists "anyone can insert events" on events;
create policy "anyone can insert events" on events
  for insert with check (true);

drop policy if exists "anyone can update events" on events;
create policy "anyone can update events" on events
  for update using (true);

drop policy if exists "anyone can delete events" on events;
create policy "anyone can delete events" on events
  for delete using (true);

-- Enable Realtime broadcasts for live collaboration.
-- (If this fails because the publication already includes the table, that's fine.)
do $$ begin
  alter publication supabase_realtime add table events;
exception
  when duplicate_object then null;
end $$;
