-- Travelvault: gjør det mulig for eier å redigere og slette egne turer.
-- Kjør etter supabase/schema.sql / 03_trip_persistence.sql.

alter table public.trips enable row level security;

drop policy if exists "owners can update trips" on public.trips;
drop policy if exists "owners can delete trips" on public.trips;

create policy "owners can update trips"
on public.trips
for update
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "owners can delete trips"
on public.trips
for delete
using (owner_id = auth.uid());
