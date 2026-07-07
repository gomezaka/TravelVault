-- Travelvault: metadata for uploaded trip documents.
-- Kjor etter supabase/schema.sql / eksisterende migrasjoner.

alter table public.trip_documents
  add column if not exists storage_bucket text not null default 'trip-documents',
  add column if not exists original_file_name text,
  add column if not exists mime_type text,
  add column if not exists file_size bigint,
  add column if not exists extracted_data jsonb;
