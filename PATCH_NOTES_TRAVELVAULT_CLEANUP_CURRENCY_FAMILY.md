# Travelvault patch – rydding, valuta, familie og desktopmeny

Endringer:

- Dokumentimport lager ikke lenger generiske detaljer i planpunkt som `Lagt inn fra ...`, `Kontroller tidspunkt ...` eller `Dokument: ...`.
- Planpunkter viser bare detaljfelt når det finnes faktiske notater eller bruker har lagt inn detaljer selv.
- Standard pakkeliste er endret fra cup-/idrettsutstyr til normal reisepakking.
- Chat-skjemaet viser ikke lenger `Skriv som deg` / `Skriv som`.
- Utlegg har fått valutavalg og omregning til NOK.
- Valutakurs hentes i nettleseren fra gratis/no-key Frankfurter først, med ExchangeRate-API open endpoint som fallback.
- Utlegg/oppgjør bruker NOK-beløp for fordeling, men viser original valuta når relevant.
- Tilbakeknapp i utlegg/oppgjør er stylet likt resten av appen.
- Desktop/nettside viser alle kategorier direkte i sidemenyen i stedet for å gjemme dem bak `Mer`.
- Mobil beholder `Mer` i bunnmenyen.
- `Min familie` har fått luftigere kortdesign og bedre tekstflyt.
- Travelvault-logo vises i toppfelt og desktop-sidemeny slik at merkevaren følger skjermbildene.

Test:

- `npm run build` fullfører OK.
- Full `npx vitest run tests/smoke.test.jsx --pool=threads` ble forsøkt, men fullførte ikke innen tidsgrensen i agentmiljøet.
