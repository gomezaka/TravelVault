-- Travelvault: kartdata for hovedsted på turer.
-- Kjør etter supabase/schema.sql / 03_trip_persistence.sql.

alter table public.trips
  add column if not exists main_location_address text,
  add column if not exists main_location_lat double precision,
  add column if not exists main_location_lng double precision,
  add column if not exists main_location_osm_type text,
  add column if not exists main_location_osm_id text,
  add column if not exists main_location_source text;

create index if not exists trips_main_location_coords_idx
on public.trips(main_location_lat, main_location_lng)
where main_location_lat is not null and main_location_lng is not null;
