# Travelvault patch: hoveddesign + responsiv app/nettside

## Endret

- Brukt TripVault/Travelvault-designdokumentet som hovedretning for app-skallet:
  - Inter som hovedfont.
  - Nøytral `#fafafa` appflate.
  - Hvite kort med tynn kant, lavere visuell støy og orange aksent.
  - Mindre tunge skygger og mørke informasjonsbokser.
- Gjort appen responsiv:
  - Mobil beholder bunnnavigasjon og appfølelse.
  - Nettbrett/desktop får bredere innhold.
  - Turvisning på desktop får venstrestilt, fast navigasjon og innholdsområde til høyre.
- Oppdatert `Reise og opphold` til designets listebaserte oppsett på mobil, med ryddigere rader og chevron.
- Lagt inn responsiv `Nå`-visning med:
  - Diskré `Neste hendelse`-kort.
  - Reise/opphold.
  - Pakkefremdrift.
  - Ekte varselkort med farger/ikoner.
  - Dagens oversikt.
- Strammet inn chat, kort, plan, pakkeliste, dokumenter, tomtilstander og skjemaer visuelt slik at de følger samme formspråk.

## Teknisk

- Endret `src/main.jsx` for desktopklasse på turvisningen og nytt strukturert `NowView`-oppsett.
- Erstattet `src/styles/app.css` med ryddig responsivt designsystem.
- `npm run build` er kjørt og fullfører OK.

## Merknad

`npm test` ble forsøkt kjørt, men testkjøringen fullførte ikke innen tidsgrensen i agentmiljøet. Builden er verifisert.
