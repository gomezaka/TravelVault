-- Travelvault Family: tokenbaserte invitasjoner til felles household.
-- Kjør etter 13_household_realtime.sql. Trygg å kjøre flere ganger.

create extension if not exists "pgcrypto";

create table if not exists public.household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  email text not null,
  display_name text not null default 'Familiemedlem',
  relation text not null default 'family',
  role text not null default 'member' check (role in ('admin','member','viewer')),
  token_hash text not null unique,
  status text not null default 'pending' check (status in ('pending','sent','failed','accepted','revoked','expired')),
  family_member_id uuid references public.family_members(id) on delete set null,
  trip_id uuid references public.trips(id) on delete cascade,
  member_id uuid references public.trip_members(id) on delete set null,
  invited_by uuid references public.profiles(id) on delete set null default auth.uid(),
  invited_at timestamptz,
  accepted_by uuid references public.profiles(id) on delete set null,
  accepted_at timestamptz,
  expires_at timestamptz not null default now() + interval '30 days',
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

alter table public.household_members
  add column if not exists family_member_id uuid references public.family_members(id) on delete set null,
  add column if not exists invite_id uuid references public.household_invites(id) on delete set null,
  add column if not exists status text not null default 'active',
  add column if not exists updated_at timestamptz;

create index if not exists household_invites_household_idx on public.household_invites(household_id, created_at desc);
create index if not exists household_invites_email_idx on public.household_invites(household_id, lower(email));
create index if not exists household_invites_status_idx on public.household_invites(status, expires_at);
create index if not exists household_members_family_member_idx on public.household_members(family_member_id);
create index if not exists household_members_email_idx on public.household_members(household_id, lower(email));

-- Sørg for at eier-medlemskap har status og oppdatert metadata.
update public.household_members
set status = coalesce(nullif(status, ''), 'active')
where status is null or status = '';

-- Realtime også for medlemskap, slik at Min familie kan oppdateres senere uten manuell refresh.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.household_members; exception when duplicate_object then null; end;
  end if;
end $$;

-- Oppdatert helper: alle innloggede medlemmer kan lese alle medlemmer i samme household.
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

create or replace function public.is_household_admin(target_household_id uuid)
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
      and hm.role in ('owner','admin')
  );
$$;

alter table public.household_invites enable row level security;

-- Oppdater membership-policyene fra 13 slik at alle medlemmer ser hele familielisten,
-- mens bare eier/admin kan endre den.
drop policy if exists "household members can read memberships" on public.household_members;
drop policy if exists "owners can add household members" on public.household_members;
drop policy if exists "owners can update household members" on public.household_members;
drop policy if exists "owners can remove household members" on public.household_members;

drop policy if exists "household members can read all memberships" on public.household_members;
drop policy if exists "household admins can add household members" on public.household_members;
drop policy if exists "household admins can update household members" on public.household_members;
drop policy if exists "household admins can remove household members" on public.household_members;

create policy "household members can read all memberships"
on public.household_members
for select
using (public.is_household_member(household_id));

create policy "household admins can add household members"
on public.household_members
for insert
with check (public.is_household_admin(household_id));

create policy "household admins can update household members"
on public.household_members
for update
using (public.is_household_admin(household_id))
with check (public.is_household_admin(household_id));

create policy "household admins can remove household members"
on public.household_members
for delete
using (public.is_household_admin(household_id));

-- Invitasjoner kan administreres av eier/admin. Mottaker aksepterer via security-definer-funksjonen under.
drop policy if exists "household admins can read invites" on public.household_invites;
drop policy if exists "household admins can create invites" on public.household_invites;
drop policy if exists "household admins can update invites" on public.household_invites;
drop policy if exists "household admins can delete invites" on public.household_invites;

create policy "household admins can read invites"
on public.household_invites
for select
using (public.is_household_admin(household_id));

create policy "household admins can create invites"
on public.household_invites
for insert
with check (public.is_household_admin(household_id));

create policy "household admins can update invites"
on public.household_invites
for update
using (public.is_household_admin(household_id))
with check (public.is_household_admin(household_id));

create policy "household admins can delete invites"
on public.household_invites
for delete
using (public.is_household_admin(household_id));

create or replace function public.set_household_invite_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_household_invites_updated_at on public.household_invites;
create trigger set_household_invites_updated_at
before update on public.household_invites
for each row execute function public.set_household_invite_updated_at();

drop trigger if exists set_household_members_updated_at on public.household_members;
create trigger set_household_members_updated_at
before update on public.household_members
for each row execute function public.set_updated_at();

create or replace function public.accept_household_invite(invite_token text)
returns table(household_id uuid, household_name text, role text)
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_row public.household_invites%rowtype;
  current_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  current_name text := coalesce(
    nullif(auth.jwt() -> 'user_metadata' ->> 'full_name', ''),
    nullif(auth.jwt() -> 'user_metadata' ->> 'name', ''),
    nullif(split_part(lower(coalesce(auth.jwt() ->> 'email', '')), '@', 1), ''),
    'Familiemedlem'
  );
begin
  if auth.uid() is null then
    raise exception 'Du må være innlogget for å godta familieinvitasjonen.';
  end if;

  if current_email = '' then
    raise exception 'Kontoen mangler e-postadresse. Logg inn med samme e-post som invitasjonen ble sendt til.';
  end if;

  select *
  into invite_row
  from public.household_invites
  where token_hash = encode(digest(coalesce(invite_token, ''), 'sha256'), 'hex')
  limit 1
  for update;

  if not found then
    raise exception 'Invitasjonen er ugyldig eller finnes ikke.';
  end if;

  if invite_row.status = 'revoked' then
    raise exception 'Invitasjonen er trukket tilbake.';
  end if;

  if invite_row.status = 'accepted' and invite_row.accepted_by = auth.uid() then
    return query
      select h.id, h.name, invite_row.role
      from public.households h
      where h.id = invite_row.household_id;
    return;
  end if;

  if invite_row.expires_at < now() then
    update public.household_invites
    set status = 'expired'
    where id = invite_row.id;
    raise exception 'Invitasjonen er utløpt. Be familien sende en ny invitasjon.';
  end if;

  if lower(invite_row.email) <> current_email then
    raise exception 'Invitasjonen er sendt til %, men du er logget inn som %. Logg inn med riktig e-postadresse.', invite_row.email, current_email;
  end if;

  insert into public.profiles(id, display_name)
  values (auth.uid(), current_name)
  on conflict (id) do update
  set display_name = coalesce(public.profiles.display_name, excluded.display_name);

  insert into public.household_members(
    household_id,
    user_id,
    role,
    display_name,
    email,
    family_member_id,
    invite_id,
    status
  ) values (
    invite_row.household_id,
    auth.uid(),
    invite_row.role,
    coalesce(nullif(invite_row.display_name, ''), current_name),
    invite_row.email,
    invite_row.family_member_id,
    invite_row.id,
    'active'
  )
  on conflict (household_id, user_id) do update
  set role = case
      when public.household_members.role = 'owner' then 'owner'
      else excluded.role
    end,
    display_name = excluded.display_name,
    email = excluded.email,
    family_member_id = coalesce(excluded.family_member_id, public.household_members.family_member_id),
    invite_id = excluded.invite_id,
    status = 'active',
    updated_at = now();

  update public.household_invites
  set status = 'accepted',
      accepted_by = auth.uid(),
      accepted_at = now()
  where id = invite_row.id;

  if invite_row.family_member_id is not null then
    update public.family_members
    set invite_status = 'accepted',
        invited_at = coalesce(invited_at, invite_row.created_at)
    where id = invite_row.family_member_id;
  end if;

  if invite_row.member_id is not null then
    update public.trip_members
    set user_id = auth.uid(),
        invite_status = 'accepted',
        status = 'active'
    where id = invite_row.member_id
      and (email is null or lower(email) = current_email);
  end if;

  return query
    select h.id, h.name, invite_row.role
    from public.households h
    where h.id = invite_row.household_id;
end;
$$;

grant execute on function public.accept_household_invite(text) to authenticated;

notify pgrst, 'reload schema';
