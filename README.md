# Travelvault MVP-skall

React/Vite-skall for Travelvault: en privat delt turhub/PWA som samler plan, pakkeliste, dokumenter, bilder, utlegg, deltakere og cupkamper på ett sted.

## Kom i gang

```bash
npm install
npm run dev
```

## Miljøvariabler

Kopier `.env.example` til `.env.local` og fyll inn Supabase-verdier:

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

## Innhold

- Mobilførst React/Vite-app
- Mine turer
- Opprett tur-flyt
- Nå-skjerm
- Plan
- Pakkeliste
- Utlegg og oppgjør
- Dokumenter
- Bilder
- Deltakere
- Cupkamper
- Supabase-klient
- Supabase SQL-schema
- Netlify-konfigurasjon
- PWA-manifest og logo

## Foreslått neste steg

1. Opprett Supabase-prosjekt `travelvault`.
2. Kjør `supabase/schema.sql`.
3. Aktiver Auth med e-post/magic link og eventuelt Google.
4. Opprett Storage buckets: `documents`, `photos`, `receipts`, `avatars`.
5. Koble skjemaene i frontend til Supabase-tabellene.
6. Legg til RLS-policyer før ekte brukerdata.
