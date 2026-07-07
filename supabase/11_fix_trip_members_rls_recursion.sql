-- Travelvault: fix RLS recursion between trips and trip_members.
-- Run after the existing migrations in Supabase projects that already have the old policies.

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

do $$
begin
  if to_regclass('public.trip_chat_messages') is not null then
    execute 'alter table public.trip_chat_messages enable row level security';
    execute 'drop policy if exists "members can read trip chat" on public.trip_chat_messages';
    execute 'drop policy if exists "members can write trip chat" on public.trip_chat_messages';
    execute 'create policy "members can read trip chat" on public.trip_chat_messages for select using (public.is_trip_owner(trip_id) or public.is_trip_member(trip_id))';
    execute 'create policy "members can write trip chat" on public.trip_chat_messages for insert with check (public.is_trip_owner(trip_id) or public.is_trip_member(trip_id))';
  end if;
end $$;

notify pgrst, 'reload schema';
