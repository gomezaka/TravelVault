-- Travelvault MVP Storage
-- Kjør etter schema.sql hvis du vil aktivere filopplasting senere.

insert into storage.buckets (id, name, public)
values
  ('trip-documents', 'trip-documents', false),
  ('trip-photos', 'trip-photos', false),
  ('trip-receipts', 'trip-receipts', false)
on conflict (id) do nothing;

-- Midlertidige MVP-policyer for innloggede brukere.
-- Strammes inn til trip-medlemskap når dokument-/bildeopplasting kobles fullt på.
create policy "Authenticated users can read trip documents"
on storage.objects for select
to authenticated
using (bucket_id = 'trip-documents');

create policy "Authenticated users can upload trip documents"
on storage.objects for insert
to authenticated
with check (bucket_id = 'trip-documents');

create policy "Authenticated users can update trip documents"
on storage.objects for update
to authenticated
using (bucket_id = 'trip-documents');

create policy "Authenticated users can read trip photos"
on storage.objects for select
to authenticated
using (bucket_id = 'trip-photos');

create policy "Authenticated users can upload trip photos"
on storage.objects for insert
to authenticated
with check (bucket_id = 'trip-photos');

create policy "Authenticated users can update trip photos"
on storage.objects for update
to authenticated
using (bucket_id = 'trip-photos');

create policy "Authenticated users can read trip receipts"
on storage.objects for select
to authenticated
using (bucket_id = 'trip-receipts');

create policy "Authenticated users can upload trip receipts"
on storage.objects for insert
to authenticated
with check (bucket_id = 'trip-receipts');

create policy "Authenticated users can update trip receipts"
on storage.objects for update
to authenticated
using (bucket_id = 'trip-receipts');
