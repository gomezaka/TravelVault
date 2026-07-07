# Travelvault patch – redigering av planpunkt i appen

Endringer:

- Fjernet bruk av `window.prompt` ved redigering av planpunkt.
- Rediger-knappen åpner nå et eget Travelvault-skjema inne i appen/nettsiden.
- Skjemaet lar brukeren fylle inn manglende felter:
  - tittel
  - dato
  - tidspunkt/oppmøte
  - sted
  - type
  - status
  - detaljer/notat
- Skjemaet fungerer som modal på desktop og som bunnark på mobil.
- Planpunkt beholdes åpnet etter lagring.
- Manuell knapp på tom plan heter nå `Legg til planpunkt manuelt`.

Test:

- `npm run build` fullfører OK.
- Målrettet test kjørt OK: `npx vitest run tests/smoke.test.jsx -t "plan" --pool=threads`.
- Full `npm test` ble forsøkt tidligere, men bruker for lang tid i agentmiljøet.
