-- Travelvault: chatmeldinger per tur.
-- Kjør etter supabase/schema.sql / 03_trip_persistence.sql.

create table if not exists public.trip_chat_messages (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  member_id uuid references public.trip_members(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  author_name text not null default 'Deltaker',
  author_email text,
  message text not null check (char_length(trim(message)) > 0),
  created_at timestamptz default now()
);

alter table public.trip_chat_messages enable row level security;

drop policy if exists "members can read trip chat" on public.trip_chat_messages;
drop policy if exists "members can write trip chat" on public.trip_chat_messages;

create policy "members can read trip chat"
on public.trip_chat_messages
for select
using (
  public.is_trip_owner(trip_id)
  or public.is_trip_member(trip_id)
);

create policy "members can write trip chat"
on public.trip_chat_messages
for insert
with check (
  public.is_trip_owner(trip_id)
  or public.is_trip_member(trip_id)
);
