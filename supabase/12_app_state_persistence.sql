-- Travelvault: persisted app state for registered users.
-- Run after supabase/schema.sql / existing migrations. Safe to rerun.

alter table public.profiles
  add column if not exists app_state jsonb not null default '{}'::jsonb;

alter table public.trips
  add column if not exists app_state jsonb not null default '{}'::jsonb;

alter table public.profiles
  drop constraint if exists profiles_app_state_object_chk;

alter table public.profiles
  add constraint profiles_app_state_object_chk
  check (jsonb_typeof(app_state) = 'object');

alter table public.trips
  drop constraint if exists trips_app_state_object_chk;

alter table public.trips
  add constraint trips_app_state_object_chk
  check (jsonb_typeof(app_state) = 'object');

notify pgrst, 'reload schema';
