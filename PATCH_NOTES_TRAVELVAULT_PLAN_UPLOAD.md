# Travelvault patch: Dokumentopplasting i Plan

Endringer:

- Plan-siden har nå en tydelig «Last opp dokument» som primær handling.
- Manuell planlegging er beholdt, men flyttet ned som sekundærvalg.
- Når dokumenter lastes opp, blir de lagt i dokumentlisten slik at brukeren ser hva som ble tolket.
- Etter dokumenttolking sendes brukeren tilbake til Plan, slik at nye planpunkter vises direkte.
- Lagt til enkel DOCX-tekstlesing i nettleseren for Word-dokumenter, i tillegg til eksisterende PDF/bildeflyt.
- Desktop og mobil har egne justeringer for opplastingspanelet.

Test:

- `npm run build` OK.
- `npm test` ble forsøkt kjørt, men Vitest fullførte ikke innen tidsgrensen i agentmiljøet.
- `npm test -- --runInBand` støttes ikke av denne Vitest-versjonen.
