# Travelvault patch – dashboarddesign, utlegg, pakkeliste og Google-innlogging

Endret:
- Implementert dashboard-/kortdesignet i kode for både desktop/nettside og mobil.
- Desktop viser alle hovedkategorier i sidemenyen, mens mobil beholder bunnmeny med Mer.
- Reise og opphold vises som tydelige kort for overnatting, reise dit og hjemreise.
- Fjernet forstyrrende tekstbokser og generiske hjelpetekster i chat.
- Fjernet synlig «Ikke satt» og viser bare klokkeslett/detaljer når det faktisk finnes data.
- Fjernet «Les dokument»-språk fra dokumentflyten og bruker «Last opp dokument».
- Startdato ligger før antall dager i opprettelse.
- Utlegg viser ikke «Betalt av deg».
- Fjernet dobbelt «Legg til utlegg»-flyt og beholdt én handling + egen «Scan kvittering».
- Lagt inn kvitteringsscan fra bilde/PDF som forsøker å lese beløp og tittel lokalt.
- Pakkeliste er endret til Google Keep-lignende flyt: skriv ett punkt, trykk enter, og punktet sorteres automatisk i kategori.
- Min familie viser familien som kort, med én knapp «Legg til familie» som åpner utvidet skjema.
- Google OAuth er ikke lenger låst av testmodus. Når Supabase er konfigurert og auth ikke er eksplisitt skrudd av, vises innlogging.
- `.env.example` er oppdatert med auth og Google auth aktivert.

Test:
- `npm run build` fullfører OK.

Viktig:
- For lokal test med Google må `.env.local` ha gyldig `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` eller `VITE_SUPABASE_ANON_KEY`, og `VITE_ENABLE_AUTH=true`, `VITE_ENABLE_GOOGLE_AUTH=true` hvis du bruker eksplisitte flagg.
