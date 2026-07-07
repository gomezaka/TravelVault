-- Travelvault: family members and invite metadata.
-- Run after supabase/schema.sql. Safe to rerun.

create table if not exists public.family_members (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  display_name text not null,
  email text,
  relation text not null default 'family',
  invite_status text not null default 'not_sent',
  invited_at timestamptz,
  created_at timestamptz default now()
);

alter table public.trip_members
  add column if not exists family_member_id uuid references public.family_members(id) on delete set null,
  add column if not exists email text,
  add column if not exists relation text not null default 'family',
  add column if not exists invite_status text not null default 'not_needed',
  add column if not exists invited_at timestamptz;

alter table public.family_members enable row level security;

create index if not exists family_members_owner_created_idx
on public.family_members(owner_id, created_at);

create unique index if not exists family_members_owner_email_unique_idx
on public.family_members(owner_id, lower(email))
where email is not null;

drop policy if exists "users can manage own family members" on public.family_members;

create policy "users can manage own family members"
on public.family_members
for all
using (
  owner_id = auth.uid()
)
with check (
  owner_id = auth.uid()
);

notify pgrst, 'reload schema';
