# Travelvault patch: opprettelsesflyt + kartdata

Endring:
- Når brukeren velger turtype ved opprettelse av ny tur, går dialogen automatisk videre uten egen `Neste`-knapp.
- Opprettelsesflyten er delt i fem steg:
  1. Turtype
  2. Navn og dato
  3. Hvor?
  4. Familie og deltakere
  5. Startinnhold
- `Hovedsted` er flyttet til nytt `Hvor?`-steg.
- `Hvor?` har stedsøk mot kartdata via OpenStreetMap/Nominatim.
- Søket skjer kun når brukeren trykker `Søk`, ikke som autosøk/autocomplete.
- Valgt sted viser kartpreview og lagrer navn, adresse, koordinater og OSM-ID.
- Eksempelknapp for `Lillehammer` er lagt inn i stedsøksteget.
- Supabase får ny migrering for kartfelter på `trips`.
- Ny Supabase Edge Function `search-location` proxyer kartstedsøk, slik at appen kan bruke en identifiserbar server-side request.

Endrede/nye filer:
- `src/main.jsx`
- `src/styles/app.css`
- `src/lib/tripRepository.js`
- `src/lib/locationSearch.js`
- `supabase/05_trip_locations.sql`
- `supabase/schema.sql`
- `supabase/functions/search-location/index.ts`
- `.env.example`
- `supabase/.env.example`
- `README.md`
- `supabase/functions/search-location/deno.json`

## Retting: loading screen i appens faktiske design

Endring:
- Fjernet den konseptskjerm-/presentasjonsaktige splash-stilen.
- `LoadingSplash` er bygget om til en vanlig app-loading screen som bruker samme designsystem som resten av Travelvault.
- Loading-siden bruker nå appens faktiske `appHeader`, `brandRow`, `hero`, `tripCard`, `eventTop`, `iconTile` og `nextPill`-formspråk.
- Fjernet egne reiseillustrasjoner/fjell/flyrute-konstruksjoner fra CSS.
- Beholder ekte progresjonsindikator og skeleton-kort for `Turer`, `Dokumenter` og `Familie`.
- Vises fortsatt ved auth/session-loading og kort ved lokal testmodus.

Overskrevne filer i dette tillegget:
- `src/main.jsx`
- `src/styles/app.css`
- `README.md`
- `PATCH_NOTES.md`

## Retting: alle funksjoner fungerer + smoketester

Feil rettet:
- `Legg til utlegg`-knappen i tomtilstanden på Utlegg-fanen gjorde ingenting (manglende `onAction`). Nå åpner den utleggskjemaet.
- Startinnhold-bryterne i steg 5 av opprettelsen var ren dekorasjon. Nå er de ekte brytere som faktisk styrer turen:
  - `Opprett pakkeliste` seeder standardliste (cupliste for cupturer, generell reiseliste ellers).
  - `Legg til dokumenter` legger inn startdokumentet `Billetter og reisedokumenter`.
  - `Legg til første planpunkt` oppretter `Ankomst <hovedsted>` på startdatoen.
  - `Aktiver utlegg` av skjuler Utlegg-fanen for turen (tabbaren tilpasser seg).
  - `Aktiver cupkamper` viser Kamper-menyen under Mer også for andre turtyper enn cup.
- Utlegg ble bare delt mellom de 5 første deltakerne (`slice(0, 5)`). Nå deles utlegg mellom alle deltakere.
- Valgt betaler i utleggskjemaet kunne peke på et fjernet medlem. Nå faller den tilbake til første gyldige deltaker.
- Planpunkter vises nå kronologisk (dato + klokkeslett) i stedet for innleggelsesrekkefølge. Hendelser lagrer nå ISO-dato (`date`) i tillegg til visningsdag.
- `Neste nå` på Nå-fanen viser nå neste kommende hendelse (ikke bare første innlagte), og `Åpne kart` håndterer `Ikke satt`-steder uten å søke på teksten «Ikke satt».
- Etter `Lagre endringer` i turredigering settes både fanen (`Mer`) og undermenyen (`Innstillinger`) riktig, så du lander der du kom fra.
- Deltakerlisten i opprettelsessteg 4 manglet `member`-klassen og rendret uten radlayout.

Nytt:
- `tests/smoke.test.jsx`: 19 smoketester som klikker gjennom hele testmodus-flyten (opprettelse med kartsøk og manuelt sted, datovalidering, plan, pakkeliste, utlegg + oppgjør, dokumenter, bilder, deltakere, kamper, redigering, sletting, familie, invitasjonskode, localStorage-persistens og startinnhold).
- `vitest.config.js` og `npm run test` (devDependencies: vitest, jsdom, testing-library).
- `main.jsx` eksporterer nå `App`, og mount er beskyttet med sjekk på `#root` slik at testmiljøet kan importere modulen.

Endrede/nye filer:
- `src/main.jsx`
- `src/styles/app.css`
- `package.json`
- `vitest.config.js` (ny)
- `tests/smoke.test.jsx` (ny)
- `PATCH_NOTES.md`
