# Travelvault

React/Vite-app for **familiens felles Travelvault**. Appen samler hverdag, familie, handleliste, chat, oppgaver og reiser i samme skall, der reiseplanlegging, cuper, helger og ferier ligger under `Planer og reiser`.

Startskjermen er `Travelvault` og samler:

- hjem-side med dagens/neste punkt, kommende avtaler, oppgaver og turer
- kalender med manuelle avtaler og iCal/ICS-import; Google Calendar vises bare når OAuth client-ID er konfigurert
- felles `Må ordnes`-liste
- felles handleliste
- chat med generell tråd og hendelses-/plantråder
- eksisterende turmodul som plan-/reisemodul
- familieprofil med medlemmer og e-postinvitasjoner til samme familiehjem

## Nytt i 0.7.0

Denne versjonen er en oppryddings- og ferdigstillingsrunde etter familieomleggingen.

- Fjernet uønsket hero-boks fra hjem-siden.
- Hjem-siden bruker nå samme Travelvault-designspråk som resten av appen: vanlig header, flate statuskort, vanlige dashboardkort og samme navigasjon tilbake til `Planer og reiser`.
- Endret tekst fra `Travelvault Family` til `Travelvault`, slik at familie, hverdag og reiser oppleves som én app.
- Ryddet `Planer og reiser` slik at reisemodulen ligger under samme app, med tydelig vei tilbake til hjem.
- Kalenderen starter ryddig uten automatisk å åpne skjema ved tom kalender.
- Google Calendar-knapper vises bare når `VITE_GOOGLE_CALENDAR_CLIENT_ID` faktisk finnes. Uten client-ID vises ikke et halvferdig Google-oppsett.
- Spond omtales og håndteres som iCal/ICS-import i denne versjonen, ikke som direkte Spond-API.
- Fjernet kunstig oppstartsforsinkelse i test/lokalmodus.
- PDF-leseren lastes nå først når en ekte PDF faktisk må leses. Rene tekst-/test-PDF-er leses uten tung PDF-worker.
- Fjernet ubrukt CSS for den gamle hero/statuspillen.
- Røyk-testene er oppdatert for ny kalender- og chatflyt.

## Nytt i 0.6.0

- Koblet `Min familie` til de nye `household_members`-tabellene.
- Lagt til tokenbasert familieinvitasjon med ny migrasjon `supabase/14_household_invites.sql`.
- Lagt til `household_invites` med hash av token, utløp, status og kobling til `family_members`/`trip_members`.
- Lagt til databasefunksjonen `accept_household_invite(invite_token text)` som godtar invitasjon etter innlogging med riktig e-post.
- Oppdatert Edge Function `send-family-invite` slik at e-posten inneholder lenke med `?householdInvite=...`.
- Appen fanger invitasjonstoken fra URL, lagrer det midlertidig, ber mottaker logge inn og kobler brukeren til riktig `household`.
- `Min familie` viser medlemmer fra samme familiehjem og skjuler fjerning av eier/egen bruker.
- Støtte for avsender `noreply@notools.no` via `SMTP_FROM`, `INVITE_FROM_EMAIL`, `INVITE_FROM` eller `FROM_EMAIL`.
- Fikset idempotent hale i `supabase/13_household_realtime.sql`.

## Kjør lokalt

På Windows kan `npm` mangle fra PowerShell PATH selv om Node er installert. Denne varianten virker direkte:

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

Uten Supabase-variabler starter appen i lokal testmodus. Data lagres i nettleserens `localStorage`, slik at du kan teste familiehjem, handleliste, chat, kalender, oppgaver, familie og turer uten backend.

## Tester og build

```bash
npm test
npm run build
npm audit --audit-level=moderate
```

Status for denne pakken:

- `npm test`: passerer med 25/25 tester.
- `npm run build`: passerer uten Vite chunk-advarselen fra tidligere. PDF-worker lastes dynamisk ved behov.
- `npm audit --audit-level=moderate`: 0 sårbarheter.

Testscriptet kjører røyk-testene med én Vitest-worker for stabilitet:

```json
"test": "vitest run tests/smoke.test.jsx --pool=forks --maxWorkers=1 --reporter verbose --testTimeout=30000 --hookTimeout=30000"
```

## Testmodus

Testmodus brukes automatisk når Supabase-klient ikke er konfigurert, eller når testene mocker Supabase bort. Lokal teststate lagres i:

```txt
travelvault-test-state-v2
```

I testmodus kan du:

- bruke familiehjemmet som startside
- legge inn og krysse av felles handleliste
- sende meldinger i chat
- velge chat-tråd for familie, kalenderpunkt, oppgave eller tur
- legge inn manuelle kalenderavtaler
- importere `.ics`/iCal-fil i kalenderen
- legge inn og fullføre `Må ordnes`-oppgaver
- sende `Må kjøpes`-punkter fra pakkeliste til handlelisten
- opprette flere turer, cuper og helgeplaner
- ha separat plan, pakkeliste, utlegg, kamper, dokumenter og bilder per tur
- legge til og fjerne deltakere
- bruke invitasjonskode lokalt
- registrere familie
- simulere e-postinvitasjon til familiemedlemmer
- slette turer

## Appstruktur

`src/main.jsx` er fortsatt en monolittisk React-fil, men appen har fått et tydelig familielag:

```txt
Hjem
├─ Kalender
│  ├─ Manuelle avtaler
│  ├─ iCal/ICS-import
│  └─ Google Calendar read-only når client-ID er konfigurert
├─ Må ordnes
├─ Handleliste
├─ Chat
│  ├─ Familien
│  ├─ Avtaler
│  ├─ Oppgaver
│  └─ Planer/reiser
├─ Planer og reiser
│  └─ Tur, cup, ferie, dokumenter, pakkeliste, utlegg, chat, bilder
└─ Min familie
```

Viktige familiekomponenter:

- `FamilyHome`
- `FamilyCalendarView`
- `CalendarIntegrationPanel`
- `HouseholdTasksView`
- `ShoppingListView`
- `FamilyChatView`
- `AgendaPreview`
- `HomeTasksPreview`
- `HomeShoppingPreview`
- `HomeChatPreview`

Delt app-state er nå versjon 4:

```js
household: {
  shopping: [],
  messages: [],
  calendarEvents: [],
  tasks: [],
  calendarSources: {
    google: {
      connected: false,
      selectedCalendarIds: [],
      calendarNames: {},
      lastImportAt: null,
      lastImportCount: 0
    }
  }
}
```

I lokal testmodus lagres dette i `travelvault-test-state-v2`. Med Supabase aktivert er `profiles.app_state` fortsatt kompatibilitets- og metadata-lag, men familiehjemmets lister, chat og kalender flyttes til egne tabeller når migrasjon 13 er kjørt.

## Supabase Realtime for familiehjem

`supabase/13_household_realtime.sql` legger til disse tabellene:

```txt
households
household_members
household_shopping_items
household_tasks
household_calendar_events
household_messages
```

Appen gjør dette ved innlasting:

1. Henter `profiles.app_state` som før for bakoverkompatibilitet og Google-kildemetadata.
2. Forsøker å hente eller opprette standard `household` for innlogget bruker.
3. Leser handleliste, oppgaver, kalenderhendelser og chatmeldinger fra de nye tabellene.
4. Hvis tabellene ikke finnes, brukes gammel `profiles.app_state`-lagring uten at appen stopper.
5. Hvis tabellene finnes, men er tomme, kopieres eksisterende familieinnhold fra `profiles.app_state` over til tabellene.
6. Når tabellene finnes, abonnerer appen på Supabase Realtime `postgres_changes` for de fire innholdstabellene.

## Familieinvitasjoner til samme household

`supabase/14_household_invites.sql` bygger videre på migrasjon 13 og legger til:

```txt
household_invites
accept_household_invite(invite_token text)
ekstra felter på household_members
Realtime for household_members
oppdaterte RLS-policyer for medlemskap og invitasjoner
```

Flyt:

1. Eier går til `Min familie`.
2. Eier legger inn navn, e-post og relasjon.
3. Hvis `Send invitasjon automatisk` er krysset av, kalles Edge Function `send-family-invite`.
4. Edge Function oppretter en rad i `household_invites`, lagrer bare hash av token og sender e-postlenke.
5. Mottakeren åpner lenken `?householdInvite=...`.
6. Appen lagrer token midlertidig og ber mottaker logge inn.
7. Etter innlogging kalles RPC-en `accept_household_invite`.
8. RPC-en sjekker at innlogget e-post matcher invitasjonen og legger brukeren inn i samme `household_members`.
9. `Min familie` viser deretter medlemmene som har tilgang til samme familiehjem.

Avsender er satt opp for `noreply@notools.no`. Bruk én av disse, der `SMTP_FROM` har høyest prioritet hvis flere er satt:

```env
SMTP_FROM=Travelvault <noreply@notools.no>
INVITE_FROM_EMAIL=noreply@notools.no
```

## Kalenderimport

### iCal/ICS og Spond

Kalenderen kan importere `.ics`/iCal-filer direkte fra UI-et via `Importer .ics-fil`. Importen:

- leser `VEVENT`-blokker
- henter `SUMMARY`, `DTSTART`, `DTEND`, `LOCATION`, `DESCRIPTION` og `UID`
- merker filer med `spond` i filnavnet som `Spond/iCal`
- dedupliserer på `sourceKey`
- legger avtalene inn i `household.calendarEvents`

Dette er den anbefalte første Spond-veien: synkroniser Spond til kalender/iCal og importer derfra, før eventuell direkte Spond-integrasjon vurderes.

### Google Calendar read-only

Google Calendar-støtten ligger i `src/lib/googleCalendar.js` og bruker scope:

```txt
https://www.googleapis.com/auth/calendar.readonly
```

For å teste Google-import lokalt, legg dette i `.env.local`:

```env
VITE_GOOGLE_CALENDAR_CLIENT_ID=DIN_GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com
VITE_GOOGLE_CALENDAR_DAYS_AHEAD=90
```

Dette skal være OAuth Client ID for en webapp. Ikke legg Google client secret i frontend. Når client-ID finnes, viser kalenderen `Koble Google`, kalender-valg og `Synkroniser` for å hente read-only hendelser inn i kalenderen.

Google-hendelser lagres lokalt/Supabase-state som kalenderhendelser med `sourceType: 'google'`, `calendarId`, `calendarName`, `sourceKey` og eventuell ekstern lenke.

## Hva er koblet nå

- Familiehjem som ny startside
- Kort for kalender, `Må ordnes`, handleliste, chat, planer/reiser og familie
- Felles handleliste med legg til, avkryssing, filter og sletting
- Chat med trådvalg og meldinger i delt `household.messages`
- Kalender med manuelle avtaler og `.ics`/iCal-import; Google Calendar read-only vises bare når client-ID er konfigurert
- `Må ordnes` med frist, prioritet, person, notat, filter og ferdigmarkering
- Pakkelister per tur, inkludert fellespunkter, personlige punkter, `må kjøpes`, pakket-status og sletting
- Bro fra `må kjøpes` i pakkelister til felles handleliste
- Eksisterende turmodul beholdt som `Planer og reiser`
- Lokal testmodus uten innlogging
- Opprette, åpne, bli med i, redigere og slette lokale turer
- Separat lokalt innhold per tur
- Planpunkter med enkel redigering og kartlenke
- Utlegg og oppgjørsoversikt
- Deltakere med pakkestatus og opprydding ved sletting
- Kamper med resultatstatus
- Dokument- og bildeflyt som testdata uten opplasting
- Supabase-klient, magic link, profil-upsert og grunnleggende tur-/deltakerlagring når auth slås på igjen
- Familieprofil med navn, e-post, relasjon og invitasjonsstatus
- Supabase Edge Function for tokenbasert familieinvitasjon via SMTP/notools.no
- Opprettelsesflyt med automatisk videreføring etter turtype
- Stedsøk/kartvalg for hovedsted via OpenStreetMap/Nominatim

## Koble til Supabase senere

1. Opprett eller oppdater `.env.local` i prosjektroten:

```env
VITE_SUPABASE_URL=https://DIN-PROSJEKTREF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=DIN_PUBLISHABLE_ELLER_ANON_PUBLIC_KEY
VITE_ENABLE_AUTH=true
VITE_ENABLE_GOOGLE_AUTH=false
```

2. I Supabase: Project Settings -> API. Kopier `Project URL` og publishable/anon public key.
3. I Supabase: Authentication -> URL Configuration:
   - Site URL lokalt: `http://localhost:5173`
   - Redirect URL lokalt: `http://localhost:5173`
   - Når Netlify er klar: legg også inn Netlify-URL-en.
4. Kjør SQL-filene i rekkefølge:
   - `supabase/schema.sql`
   - `supabase/02_storage.sql`
   - `supabase/03_trip_persistence.sql`
   - `supabase/04_family_invites.sql`
   - `supabase/05_trip_locations.sql`
   - `supabase/06_trip_edit_delete.sql`
   - `supabase/07_trip_logistics.sql`
   - `supabase/08_trip_document_uploads.sql`
   - `supabase/09_trip_duration_days.sql`
   - `supabase/10_trip_chat.sql`
   - `supabase/11_fix_trip_members_rls_recursion.sql`
   - `supabase/12_app_state_persistence.sql`
   - `supabase/13_household_realtime.sql`
   - `supabase/14_household_invites.sql`

`12_app_state_persistence.sql` legger `app_state jsonb` på `profiles` og `trips`. `13_household_realtime.sql` flytter familiehjemmets handleliste, oppgaver, kalender og chat til egne tabeller med RLS og Realtime. `14_household_invites.sql` kobler e-postinvitasjoner til samme `household_members`-struktur.

## Google-innlogging via Supabase Auth

Dette er separat fra Google Calendar-importen over. Google-knappen for innlogging slås på med:

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

## Familie og e-postinvitasjoner

Flyt:

1. Gå til `Min familie` fra familiehjemmet.
2. Legg inn navn, e-post og relasjon.
3. Hvis Supabase-auth er aktivert, kalles Supabase Edge Function `send-family-invite`.
4. Edge Function sender e-post via SMTP-kontoen på `notools.no`.
5. Mottakeren åpner invitasjonslenken, logger inn med samme e-post og får tilgang til samme familiehjem.
6. Når du oppretter tur, kan du hente personer fra familien. Personer med e-post og avkrysset invitasjon får samme standardmail automatisk.

Dette er ikke Supabase Auth Admin-invite. Mottakeren får en vanlig e-post med lenke til Travelvault og logger inn selv med Google eller e-postlenke.

Supabase Function secrets:

```env
SMTP_HOST=mail.notools.no
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=travelvault@notools.no
SMTP_PASS=passordet_til_epostkontoen
SMTP_FROM=Travelvault <noreply@notools.no>
INVITE_FROM_EMAIL=noreply@notools.no
PUBLIC_APP_URL=https://travelvault.notools.no
NOMINATIM_CONTACT_EMAIL=travelvault@notools.no
```

Deploy Edge Functions:

```bash
supabase functions deploy send-family-invite
supabase functions deploy search-location
supabase secrets set SMTP_HOST=mail.notools.no SMTP_PORT=465 SMTP_SECURE=true SMTP_USER=travelvault@notools.no SMTP_PASS=passordet_til_epostkontoen SMTP_FROM='Travelvault <noreply@notools.no>' INVITE_FROM_EMAIL=noreply@notools.no PUBLIC_APP_URL=https://travelvault.notools.no NOMINATIM_CONTACT_EMAIL=travelvault@notools.no
```

## Opprett tur og kartdata

Opprettelsesflyt:

1. Velg turtype. Valget går automatisk videre uten egen `Neste`-knapp.
2. Legg inn navn, dato og beskrivelse.
3. Steget `Hvor?` søker i kartdata og lar deg velge riktig sted.
4. Valgt sted lagres med navn, full adresse, koordinater og OpenStreetMap-ID i `trips`.
5. Kartvisning i appen bruker valgt sted.

Kart-/stedsøk bruker Supabase Edge Function `search-location`, som igjen søker i Nominatim/OpenStreetMap. Søk kjøres bare når brukeren trykker `Søk`, ikke som autosøk for hvert tastetrykk.

## Loading screen ved oppstart

Appen har en egen `LoadingSplash` som vises mens innlogging, turer, familie og bruker-state lastes i bakgrunnen. Den er bygget som vanlig React/CSS og bruker samme formspråk som resten av appen.

Ved åpning av en familieinvitasjon vises samme loading-skjerm mens invitasjonen godtas og brukeren kobles til familiehjemmet.

## Redigering og sletting av tur

En tur kan ikke opprettes før disse feltene finnes:

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

## Kjente begrensninger

- Google Calendar-importen er frontend-utløst read-only import når client-ID er konfigurert; den er ikke bakgrunnssynk eller toveis kalenderredigering.
- Direkte Spond-API er ikke implementert.
- Chat, handleliste, kalender og oppgaver bruker egne Supabase-tabeller først når `supabase/13_household_realtime.sql` er kjørt; ellers faller appen tilbake til `profiles.app_state`.
- Ekte familieinvitasjoner krever at både `supabase/13_household_realtime.sql` og `supabase/14_household_invites.sql` er kjørt, og at Edge Function-secrets er satt.
- Det finnes foreløpig ingen UI for å bytte mellom flere familiehjem dersom en bruker senere blir medlem i flere households.
- `.ics`-parseren dekker vanlige `VEVENT`-felt, men er ikke en komplett RFC 5545-parser.
- `src/main.jsx` bør splittes i mindre moduler før appen vokser mer.

## Neste utviklingssteg

1. Legg til household-velger for brukere som er med i flere familiehjem.
2. Fullfør Google Calendar som egen kontrollert modul: refresh/ny tokenflyt, valgt kalender per familie, feillogging og bedre konflikthåndtering.
3. Legg til automatisk ukesoppsummering på familiehjemmet.
4. Lag handlevare-kategorier og flere lister: `Hytte`, `Cup`, `Ferie`, `Apotek`.
5. Legg til notifikasjoner for frister, kollisjoner og “må kjøpes”.
6. Koble dokument-/bildeopplasting til Supabase Storage.
7. Splitt `src/main.jsx` i mindre moduler.

## Deploy på Netlify

Build command:

```bash
npm run build
```

Publish directory:

```bash
dist
```

Environment variables for test/deploy uten auth:

```env
VITE_ENABLE_AUTH=false
VITE_ENABLE_GOOGLE_AUTH=false
```

Environment variables for Supabase-auth:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
VITE_ENABLE_AUTH=true
VITE_ENABLE_GOOGLE_AUTH=false
```
