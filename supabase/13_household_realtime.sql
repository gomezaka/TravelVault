-- Travelvault Family: egne Supabase-tabeller for familiehjemmet.
-- Kjør etter 12_app_state_persistence.sql. Trygg å kjøre flere ganger.

create extension if not exists "pgcrypto";

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name text not null default 'Min familie',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member','viewer')),
  display_name text,
  email text,
  created_at timestamptz not null default now(),
  unique (household_id, user_id)
);

create table if not exists public.household_shopping_items (
  id text primary key default gen_random_uuid()::text,
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null check (char_length(trim(title)) > 0),
  quantity text not null default '',
  note text not null default '',
  category text not null default '',
  checked boolean not null default false,
  source text not null default 'family',
  source_ref text not null default '',
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists public.household_tasks (
  id text primary key default gen_random_uuid()::text,
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null check (char_length(trim(title)) > 0),
  done boolean not null default false,
  priority text not null default 'normal' check (priority in ('low','normal','high')),
  due_date date,
  person text not null default '',
  source text not null default 'family',
  source_ref text not null default '',
  notes text not null default '',
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists public.household_calendar_events (
  id text primary key default gen_random_uuid()::text,
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null check (char_length(trim(title)) > 0),
  event_date date not null,
  event_time time,
  end_date date,
  end_time time,
  person text not null default '',
  source text not null default 'Manuell',
  source_type text not null default 'manual',
  source_event_id text not null default '',
  source_key text not null default '',
  source_ref text not null default '',
  calendar_id text not null default '',
  calendar_name text not null default '',
  external_link text not null default '',
  location text not null default '',
  notes text not null default '',
  all_day boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  synced_at timestamptz
);

create table if not exists public.household_messages (
  id text primary key default gen_random_uuid()::text,
  household_id uuid not null references public.households(id) on delete cascade,
  author_name text not null default 'Du',
  message text not null check (char_length(trim(message)) > 0),
  thread_id text not null default 'family',
  thread_title text not null default '',
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists households_owner_idx on public.households(owner_id);
create index if not exists household_members_user_idx on public.household_members(user_id);
create index if not exists household_members_household_idx on public.household_members(household_id);
create index if not exists household_shopping_household_idx on public.household_shopping_items(household_id, created_at desc);
create index if not exists household_tasks_household_idx on public.household_tasks(household_id, due_date, created_at desc);
create index if not exists household_calendar_household_idx on public.household_calendar_events(household_id, event_date, event_time);
create index if not exists household_calendar_source_idx on public.household_calendar_events(household_id, source_type, calendar_id);
create index if not exists household_messages_household_idx on public.household_messages(household_id, created_at);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_households_updated_at on public.households;
create trigger set_households_updated_at
before update on public.households
for each row execute function public.set_updated_at();

drop trigger if exists set_household_shopping_updated_at on public.household_shopping_items;
create trigger set_household_shopping_updated_at
before update on public.household_shopping_items
for each row execute function public.set_updated_at();

drop trigger if exists set_household_tasks_updated_at on public.household_tasks;
create trigger set_household_tasks_updated_at
before update on public.household_tasks
for each row execute function public.set_updated_at();

create or replace function public.is_household_owner(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.households h
    where h.id = target_household_id
      and h.owner_id = auth.uid()
  );
$$;

create or replace function public.is_household_member(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.households h
    where h.id = target_household_id
      and h.owner_id = auth.uid()
  )
  or exists (
    select 1
    from public.household_members hm
    where hm.household_id = target_household_id
      and hm.user_id = auth.uid()
  );
$$;

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_shopping_items enable row level security;
alter table public.household_tasks enable row level security;
alter table public.household_calendar_events enable row level security;
alter table public.household_messages enable row level security;

drop policy if exists "household members can read households" on public.households;
drop policy if exists "users can create own household" on public.households;
drop policy if exists "owners can update household" on public.households;
drop policy if exists "owners can delete household" on public.households;

create policy "household members can read households"
on public.households
for select
using (public.is_household_member(id));

create policy "users can create own household"
on public.households
for insert
with check (owner_id = auth.uid());

create policy "owners can update household"
on public.households
for update
using (public.is_household_owner(id))
with check (public.is_household_owner(id));

create policy "owners can delete household"
on public.households
for delete
using (public.is_household_owner(id));

drop policy if exists "household members can read memberships" on public.household_members;
drop policy if exists "owners can add household members" on public.household_members;
drop policy if exists "owners can update household members" on public.household_members;
drop policy if exists "owners can remove household members" on public.household_members;

create policy "household members can read memberships"
on public.household_members
for select
using (user_id = auth.uid() or public.is_household_owner(household_id));

create policy "owners can add household members"
on public.household_members
for insert
with check (public.is_household_owner(household_id));

create policy "owners can update household members"
on public.household_members
for update
using (public.is_household_owner(household_id))
with check (public.is_household_owner(household_id));

create policy "owners can remove household members"
on public.household_members
for delete
using (public.is_household_owner(household_id));

-- Felles policyer for tabellene som eies av et familiehjem.
drop policy if exists "household members can read shopping" on public.household_shopping_items;
drop policy if exists "household members can write shopping" on public.household_shopping_items;
drop policy if exists "household members can update shopping" on public.household_shopping_items;
drop policy if exists "household members can delete shopping" on public.household_shopping_items;

create policy "household members can read shopping" on public.household_shopping_items for select using (public.is_household_member(household_id));
create policy "household members can write shopping" on public.household_shopping_items for insert with check (public.is_household_member(household_id));
create policy "household members can update shopping" on public.household_shopping_items for update using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "household members can delete shopping" on public.household_shopping_items for delete using (public.is_household_member(household_id));

drop policy if exists "household members can read tasks" on public.household_tasks;
drop policy if exists "household members can write tasks" on public.household_tasks;
drop policy if exists "household members can update tasks" on public.household_tasks;
drop policy if exists "household members can delete tasks" on public.household_tasks;

create policy "household members can read tasks" on public.household_tasks for select using (public.is_household_member(household_id));
create policy "household members can write tasks" on public.household_tasks for insert with check (public.is_household_member(household_id));
create policy "household members can update tasks" on public.household_tasks for update using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "household members can delete tasks" on public.household_tasks for delete using (public.is_household_member(household_id));

drop policy if exists "household members can read calendar" on public.household_calendar_events;
drop policy if exists "household members can write calendar" on public.household_calendar_events;
drop policy if exists "household members can update calendar" on public.household_calendar_events;
drop policy if exists "household members can delete calendar" on public.household_calendar_events;

create policy "household members can read calendar" on public.household_calendar_events for select using (public.is_household_member(household_id));
create policy "household members can write calendar" on public.household_calendar_events for insert with check (public.is_household_member(household_id));
create policy "household members can update calendar" on public.household_calendar_events for update using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "household members can delete calendar" on public.household_calendar_events for delete using (public.is_household_member(household_id));

drop policy if exists "household members can read messages" on public.household_messages;
drop policy if exists "household members can write messages" on public.household_messages;
drop policy if exists "household members can delete messages" on public.household_messages;

create policy "household members can read messages" on public.household_messages for select using (public.is_household_member(household_id));
create policy "household members can write messages" on public.household_messages for insert with check (public.is_household_member(household_id));
create policy "household members can delete messages" on public.household_messages for delete using (public.is_household_member(household_id));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.household_shopping_items; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.household_tasks; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.household_calendar_events; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.household_messages; exception when duplicate_object then null; end;
  end if;
end $$;

notify pgrst, 'reload schema';
