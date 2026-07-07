-- Travelvault: store planned trip length even when exact dates are unknown.
-- Kjor etter supabase/schema.sql / eksisterende migrasjoner.

alter table public.trips
  add column if not exists duration_days integer;

alter table public.trips
  drop constraint if exists trips_duration_days_positive_chk;

alter table public.trips
  add constraint trips_duration_days_positive_chk
  check (duration_days is null or duration_days > 0);
