-- Travelvault: reise og opphold per tur.
-- Kjor etter supabase/schema.sql / eksisterende migrasjoner.

alter table public.trips
  add column if not exists travel_logistics jsonb not null default '{"accommodation":{},"transports":[]}'::jsonb;

alter table public.trips
  drop constraint if exists trips_travel_logistics_object_chk;

alter table public.trips
  add constraint trips_travel_logistics_object_chk
  check (jsonb_typeof(travel_logistics) = 'object');
