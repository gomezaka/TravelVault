-- Travelvault MVP: policyer som trengs for å lagre og hente turer/medlemmer fra appen.
-- Kjør denne etter supabase/schema.sql hvis schema allerede er kjørt.

alter table public.trips enable row level security;
alter table public.trip_members enable row level security;

create or replace function public.is_trip_owner(target_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.trips t
    where t.id = target_trip_id
      and t.owner_id = auth.uid()
  );
$$;

create or replace function public.is_trip_member(target_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.trip_members tm
    where tm.trip_id = target_trip_id
      and tm.user_id = auth.uid()
  );
$$;

-- Rydd gamle MVP-policyer hvis filen kjøres flere ganger.
drop policy if exists "members can read trips" on public.trips;
drop policy if exists "members can read own trip memberships" on public.trip_members;
drop policy if exists "trip owners can insert trip members" on public.trip_members;
drop policy if exists "trip owners can update trip members" on public.trip_members;
drop policy if exists "trip owners can delete trip members" on public.trip_members;

create policy "members can read trips"
on public.trips
for select
using (
  owner_id = auth.uid()
  or public.is_trip_member(id)
);

create policy "members can read own trip memberships"
on public.trip_members
for select
using (
  user_id = auth.uid()
  or public.is_trip_owner(trip_id)
);

create policy "trip owners can insert trip members"
on public.trip_members
for insert
with check (
  public.is_trip_owner(trip_id)
);

create policy "trip owners can update trip members"
on public.trip_members
for update
using (
  public.is_trip_owner(trip_id)
)
with check (
  public.is_trip_owner(trip_id)
);

create policy "trip owners can delete trip members"
on public.trip_members
for delete
using (
  public.is_trip_owner(trip_id)
);
