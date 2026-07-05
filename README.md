# Travelvault MVP Shell

Mobilførst React/Vite-skall for Travelvault: privat turmappe med plan, pakkeliste, utlegg, dokumenter, bilder, deltakere og cupkamper.

## Kjør lokalt

```bash
npm install
npm run dev
```

Uten `.env` kjører appen i demomodus. Med Supabase-variabler aktivert vises innlogging med magic link.

## Koble til Supabase

1. Opprett `.env.local` i prosjektroten:

```env
VITE_SUPABASE_URL=https://DIN-PROSJEKTREF.supabase.co
VITE_SUPABASE_ANON_KEY=DIN_ANON_KEY
```

2. I Supabase: Project Settings → API. Kopier `Project URL` og `anon public` key.
3. I Supabase: Authentication → URL Configuration:
   - Site URL lokalt: `http://localhost:5173`
   - Redirect URL lokalt: `http://localhost:5173`
   - Når Netlify er klar: legg også inn Netlify-URL-en.
4. Kjør SQL:
   - `supabase/schema.sql` er hovedschema.
   - `supabase/02_storage.sql` oppretter Storage-buckets for dokumenter, bilder og kvitteringer.
   - `supabase/03_trip_persistence.sql` legger til policyer for å lagre og hente turmedlemmer.

## Hva er koblet nå

- Supabase-klient
- Magic link-innlogging
- Automatisk profil-upsert ved innlogging
- Ekte lagring av nye turer i `trips`
- Ekte lagring av turmedlemmer i `trip_members`
- Henting av brukerens egne turer fra Supabase
- Henting av deltakere når en Supabase-tur åpnes
- Demomodus hvis `.env.local` mangler

## Viktig migrering etter denne patchen

Hvis `schema.sql` allerede er kjørt i Supabase, kjør også:

```sql
supabase/03_trip_persistence.sql
```

Denne legger til RLS-policyer for `trip_members`, slik at appen kan opprette eier og deltakere på en ny tur.

## Neste utviklingssteg

1. Koble pakkeliste til `packing_items`.
2. Koble planpunkter til `trip_events`.
3. Koble utlegg til `expenses` og `expense_participants`.
4. Koble dokument-/bildeopplasting til Supabase Storage.
5. Lage invitasjonskodeflyt via `trip_invites`.
6. Stramme inn RLS-policyer på Storage til faktisk trip-medlemskap.

## Deploy på Netlify

Build command:

```bash
npm run build
```

Publish directory:

```bash
dist
```

Legg inn disse Environment variables i Netlify:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```
