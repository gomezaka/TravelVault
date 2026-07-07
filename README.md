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
- registrere familie
- simulere e-postinvitasjon til familiemedlemmer
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
   - `supabase/04_family_invites.sql`
   - `supabase/05_trip_locations.sql`

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
- Familieprofil med navn, e-post, relasjon og invitasjonsstatus
- Supabase Edge Function for vanlig e-postinvitasjon via SMTP/notools.no
- Opprettelsesflyt med automatisk videreføring etter turtype
- Stedsøk/kartvalg for hovedsted via OpenStreetMap/Nominatim

## Neste utviklingssteg

1. Koble plan, pakkeliste, utlegg, dokumenter, bilder og kamper til Supabase-tabeller.
2. Koble invitasjonslenke til en egen mottaksside som viser turen før brukeren godtar.
3. Vurdere betalt/egen geokoding senere hvis appen får mange brukere.
4. Koble dokument-/bildeopplasting til Supabase Storage.
5. Legge til redigeringsskjemaer i stedet for enkle prompt-dialoger.
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

Environment variables:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
VITE_ENABLE_AUTH=false
VITE_ENABLE_GOOGLE_AUTH=false
```


## Familie og e-postinvitasjoner

Ny flyt:

1. Gå til `Min familie` fra forsiden.
2. Legg inn navn, e-post og relasjon.
3. Hvis Supabase-auth er aktivert, kalles Supabase Edge Function `send-family-invite`.
4. Edge Function sender en vanlig e-post via SMTP-kontoen på `notools.no`.
5. Når du oppretter tur, kan du hente personer fra familien. Personer med e-post og avkrysset invitasjon får samme standardmail automatisk.

Dette er ikke Supabase Auth Admin-invite. Mottakeren får bare en vanlig e-post med lenke til Travelvault og logger inn selv med Google.

Supabase Function secrets:

```env
SMTP_HOST=mail.notools.no
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=travelvault@notools.no
SMTP_PASS=passordet_til_epostkontoen
SMTP_FROM=Travelvault <travelvault@notools.no>
PUBLIC_APP_URL=https://travelvault.notools.no
NOMINATIM_CONTACT_EMAIL=travelvault@notools.no
```

Deploy Edge Function:

```bash
supabase functions deploy send-family-invite
supabase functions deploy search-location
supabase secrets set SMTP_HOST=mail.notools.no SMTP_PORT=465 SMTP_SECURE=true SMTP_USER=travelvault@notools.no SMTP_PASS=passordet_til_epostkontoen SMTP_FROM='Travelvault <travelvault@notools.no>' PUBLIC_APP_URL=https://travelvault.notools.no NOMINATIM_CONTACT_EMAIL=travelvault@notools.no
```

Lokal test av vanlig app:

```bash
npm install
npm run dev
```

Lokal test av Edge Function krever Supabase CLI.


## Opprett tur og kartdata

Ny opprettelsesflyt:

1. Velg turtype. Valget går automatisk videre uten egen `Neste`-knapp.
2. Legg inn navn, dato og beskrivelse.
3. Steget `Hvor?` søker i kartdata og lar deg velge riktig sted.
4. Valgt sted lagres med navn, full adresse, koordinater og OpenStreetMap-ID i `trips`.
5. Kartvisning i appen bruker valgt sted.

Kart-/stedsøk bruker Supabase Edge Function `search-location`, som igjen søker i Nominatim/OpenStreetMap. Søk kjøres bare når brukeren trykker `Søk`, ikke som autosøk for hvert tastetrykk. Det er bevisst for å holde trafikken lav.

## Loading screen ved oppstart

Appen har en egen `LoadingSplash` som vises når Travelvault åpnes og mens innlogging, turer og familiedata lastes i bakgrunnen. Den er bygget som vanlig React/CSS og bruker samme formspråk som resten av appen: `appHeader`, `brandRow`, `hero`, `tripCard`, `eventTop`, `iconTile`, `nextPill` og eksisterende Travelvault-farger.

Siden viser:

- Travelvault-logo og appslagord i samme toppstil som hovedsiden
- mørk `hero`-flate med lastebeskjed og progresjonsindikator
- ekte skeleton-/loading-kort for `Turer`, `Dokumenter` og `Familie`
- liten synkroniseringslinje mens data hentes

Den bruker ikke konseptbilde eller screenshot som bakgrunn. I testmodus vises den kort ved oppstart. Med ekte Supabase-innlogging vises den mens auth/session og appdata lastes.

## Redigering og sletting av tur

Denne versjonen hindrer tomme turer. En tur kan ikke opprettes før disse feltene finnes:

- Turtype
- Navn på tur
- Hovedsted

Eksisterende turer kan endres eller slettes fra:

```txt
Tur -> Mer -> Innstillinger
```

Kjør denne SQL-filen i Supabase for å åpne for sletting av egne turer:

```sql
supabase/06_trip_edit_delete.sql
```
