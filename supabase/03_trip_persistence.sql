-- Travelvault MVP: policyer som trengs for å lagre og hente turer/medlemmer fra appen.
-- Kjør denne etter supabase/schema.sql hvis schema allerede er kjørt.

alter table public.trip_members enable row level security;

-- Rydd gamle MVP-policyer hvis filen kjøres flere ganger.
drop policy if exists "members can read own trip memberships" on public.trip_members;
drop policy if exists "trip owners can insert trip members" on public.trip_members;
drop policy if exists "trip owners can update trip members" on public.trip_members;
drop policy if exists "trip owners can delete trip members" on public.trip_members;

create policy "members can read own trip memberships"
on public.trip_members
for select
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.trips t
    where t.id = trip_members.trip_id
      and t.owner_id = auth.uid()
  )
);

create policy "trip owners can insert trip members"
on public.trip_members
for insert
with check (
  exists (
    select 1
    from public.trips t
    where t.id = trip_members.trip_id
      and t.owner_id = auth.uid()
  )
);

create policy "trip owners can update trip members"
on public.trip_members
for update
using (
  exists (
    select 1
    from public.trips t
    where t.id = trip_members.trip_id
      and t.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.trips t
    where t.id = trip_members.trip_id
      and t.owner_id = auth.uid()
  )
);

create policy "trip owners can delete trip members"
on public.trip_members
for delete
using (
  exists (
    select 1
    from public.trips t
    where t.id = trip_members.trip_id
      and t.owner_id = auth.uid()
  )
);
