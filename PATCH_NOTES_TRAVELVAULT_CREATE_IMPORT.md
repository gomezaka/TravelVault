# Travelvault patch: enklere turoppretting + dokumentimport

Endringer:

- Opprett ny tur er forenklet til turtype, turnavn og varighet.
- Reisemål, datoer, overnatting, transport, deltakere og planpunkter fylles ut etterpå.
- Etter oppretting åpnes turen direkte i Dokumenter.
- Dokumentopplasting støtter flere filer samtidig.
- Tillatte filtyper: PDF, Word `.doc`, Word `.docx` og bilder.
- Dokumenter smarttolkes foreløpig fra filnavn/type og lager forslag til reisemål, datoer, varighet, overnatting, transport og planpunkter.
- Brukeren kan trykke “Bruk forslag på turen” for å legge forslagene inn i turen.
- Supabase får `duration_days` på `trips`, slik at turen kan ha varighet uten eksakte datoer.

SQL:

Kjør denne nye migrasjonen i Supabase hvis databasen allerede finnes:

```sql
supabase/09_trip_duration_days.sql
```

Nye installasjonsfiler i patchen:

- `src/main.jsx`
- `src/lib/tripRepository.js`
- `src/styles/app.css`
- `supabase/schema.sql`
- `supabase/09_trip_duration_days.sql`
- `tests/smoke.test.jsx`

Test:

- `npm run build` OK.
- `npm test -- --run --reporter=verbose` viste 16 grønne tester, inkludert Word-opplasting, men Vitest-prosessen avsluttet ikke før verktøy-timeout i dette miljøet.
