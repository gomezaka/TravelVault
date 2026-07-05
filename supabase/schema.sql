create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz default now()
);

create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  trip_type text not null default 'family',
  start_date date,
  end_date date,
  main_location text,
  description text,
  owner_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now()
);

create table if not exists public.trip_members (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  display_name text not null,
  role text not null default 'participant',
  status text not null default 'active',
  created_at timestamptz default now()
);

create table if not exists public.trip_invites (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  invite_code text unique not null,
  role text not null default 'participant',
  expires_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists public.trip_events (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  title text not null,
  event_type text not null default 'activity',
  starts_at timestamptz,
  ends_at timestamptz,
  location_name text,
  address text,
  notes text,
  status text default 'planned',
  document_id uuid,
  created_at timestamptz default now()
);

create table if not exists public.packing_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  assigned_to_member_id uuid references public.trip_members(id) on delete set null,
  title text not null,
  category text,
  packed boolean default false,
  must_buy boolean default false,
  created_at timestamptz default now()
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  paid_by_member_id uuid references public.trip_members(id) on delete set null,
  title text not null,
  amount numeric(12,2) not null check (amount >= 0),
  currency text not null default 'NOK',
  category text,
  expense_date date default current_date,
  receipt_url text,
  notes text,
  status text default 'open',
  created_at timestamptz default now()
);

create table if not exists public.expense_participants (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  member_id uuid not null references public.trip_members(id) on delete cascade,
  share_amount numeric(12,2),
  included boolean default true
);

create table if not exists public.settlements (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  from_member_id uuid references public.trip_members(id) on delete cascade,
  to_member_id uuid references public.trip_members(id) on delete cascade,
  amount numeric(12,2) not null,
  currency text not null default 'NOK',
  status text default 'pending',
  created_at timestamptz default now()
);

create table if not exists public.trip_documents (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  title text not null,
  document_type text,
  file_url text not null,
  linked_event_id uuid references public.trip_events(id) on delete set null,
  linked_member_id uuid references public.trip_members(id) on delete set null,
  created_at timestamptz default now()
);

create table if not exists public.trip_photos (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  uploaded_by_member_id uuid references public.trip_members(id) on delete set null,
  file_url text not null,
  taken_at timestamptz,
  caption text,
  linked_event_id uuid references public.trip_events(id) on delete set null,
  created_at timestamptz default now()
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  team_name text,
  opponent text not null,
  match_date date,
  match_time time,
  meetup_time time,
  venue_name text,
  address text,
  kit_color text,
  match_number text,
  status text default 'planned',
  result text,
  notes text,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;
alter table public.trips enable row level security;
alter table public.trip_members enable row level security;
alter table public.trip_invites enable row level security;
alter table public.trip_events enable row level security;
alter table public.packing_items enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_participants enable row level security;
alter table public.settlements enable row level security;
alter table public.trip_documents enable row level security;
alter table public.trip_photos enable row level security;
alter table public.matches enable row level security;

-- MVP-policyer. Strammes inn videre når auth/invitasjon er ferdig.
create policy "profiles self read" on public.profiles for select using (auth.uid() = id);
create policy "profiles self write" on public.profiles for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "members can read trips" on public.trips for select using (
  owner_id = auth.uid() or exists (select 1 from public.trip_members tm where tm.trip_id = trips.id and tm.user_id = auth.uid())
);
create policy "users can create trips" on public.trips for insert with check (owner_id = auth.uid());
create policy "owners can update trips" on public.trips for update using (owner_id = auth.uid());

-- Helper pattern for child tables: trip member can read/write within own trips.
-- For production, split admin/participant rights per table.
