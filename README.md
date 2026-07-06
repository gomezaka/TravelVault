# Travelvault MVP Shell

Mobilførst React/Vite-app for Travelvault: privat turmappe med plan, pakkeliste, utlegg, dokumenter, bilder, deltakere og cupkamper.

## Kjør lokalt

På denne Windows-maskinen kan `npm` mangle fra PowerShell PATH selv om Node er installert. Denne varianten virker direkte:

```powershell
$env:Path = "C:\Program Files\nodejs;" + $env:Path
& "C:\Program Files\nodejs\npm.cmd" install
& "C:\Program Files\nodejs\npm.cmd" run dev
```

Når PATH er riktig i en ny terminal, holder det med:

```bash
npm install
npm run dev
```

Appen starter nå i lokal testmodus uten innlogging. Data lagres i nettleserens `localStorage`, slik at du kan opprette turer, deltakere og ulike pakkelister uten Supabase.

## Testmodus

Testmodus er styrt av:

```env
VITE_ENABLE_AUTH=false
VITE_ENABLE_GOOGLE_AUTH=false
```

I tillegg er auth midlertidig låst av i `src/main.jsx` med `authLockedForTesting = true`. Det gjør at gamle Netlify-variabler ikke kan slå innlogging på igjen før vi bevisst fjerner testlåsen.

I testmodus kan du:

- opprette flere turer
- ha separat plan, pakkeliste, utlegg, kamper, dokumenter og bilder per tur
- legge til og fjerne deltakere
- bruke invitasjonskode lokalt
- slette turer

## Koble til Supabase senere

1. Sett `authLockedForTesting = false` i `src/main.jsx`.
2. Opprett eller oppdater `.env.local` i prosjektroten:

```env
VITE_SUPABASE_URL=https://DIN-PROSJEKTREF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=DIN_PUBLISHABLE_ELLER_ANON_PUBLIC_KEY
VITE_ENABLE_AUTH=true
VITE_ENABLE_GOOGLE_AUTH=false
```

3. I Supabase: Project Settings -> API. Kopier `Project URL` og publishable/anon public key.
4. I Supabase: Authentication -> URL Configuration:
   - Site URL lokalt: `http://localhost:5173`
   - Redirect URL lokalt: `http://localhost:5173`
   - Når Netlify er klar: legg også inn Netlify-URL-en.
5. Kjør SQL:
   - `supabase/schema.sql`
   - `supabase/02_storage.sql`
   - `supabase/03_trip_persistence.sql`

## Google-innlogging

Google-knappen er skjult nå. Slå den bare på når Supabase OAuth-secret er konfigurert:

```env
VITE_ENABLE_GOOGLE_AUTH=true
```

I Supabase:

- Authentication -> Providers -> Google
- Aktiver Google-provider
- Lim inn Client ID og Client Secret
- Authentication -> URL Configuration:
  - `http://localhost:5173/**`
  - `https://travelvault.notools.no/**`
  - `https://travel-vault.netlify.app/**`

## Hva er koblet nå

- Lokal testmodus uten innlogging
- Opprette, åpne, bli med i og slette lokale turer
- Separat lokalt innhold per tur
- Pakkelister per tur, inkludert fellespunkter, personlige punkter, "må kjøpes", pakket-status og sletting
- Planpunkter med enkel redigering og kartlenke
- Utlegg og oppgjørsoversikt
- Deltakere med pakkestatus og opprydding ved sletting
- Kamper med resultatstatus
- Dokument- og bildeflyt som testdata uten opplasting
- Supabase-klient, magic link, profil-upsert og grunnleggende tur-/deltakerlagring når auth slås på igjen

## Neste utviklingssteg

1. Koble plan, pakkeliste, utlegg, dokumenter, bilder og kamper til Supabase-tabeller.
2. Lage ekte invitasjonsflyt via `trip_invites`.
3. Koble dokument-/bildeopplasting til Supabase Storage.
4. Legge til redigeringsskjemaer i stedet for enkle prompt-dialoger.
5. Stramme inn RLS-policyer på Storage til faktisk trip-medlemskap.

## Deploy på Netlify

Build command:

```bash
npm run build
```

Publish directory:

```bash
dist
```

Environment variables:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
VITE_ENABLE_AUTH=false
VITE_ENABLE_GOOGLE_AUTH=false
```
