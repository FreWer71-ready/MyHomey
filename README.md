# MyHomey

Dashboard för hemmet (surfplatta, liggande) byggd på Homey Pro (Early 2019), Supabase och Next.js.

```
Homey Pro 2019
  └─ HomeyScript homey-ingest.js (flöde var 1–2 min)
       → Edge Function homey-ingest (delad hemlighet, Vault)
       → ingest_homey(): zones, devices, capability_state, readings
Supabase (Postgres + RLS + Realtime)
  → apps/web: Next.js PWA (inloggning med länk, Hem, Rum)
```

Homey 2019 saknar lokala API-nycklar, därför skickar Homey själv data via HomeyScript i stället för en lokal bridge.

## Struktur

```
apps/web/            Next.js 15 (App Router, Tailwind 4), PWA
homey/               HomeyScripts: homey-ingest.js (data), scen.js (Ljust/Mys/Släck)
supabase/migrations/ Schema, RLS, Realtime
supabase/functions/  Edge Function homey-ingest
supabase/tests/      SQL-tester (körs mot lokal Postgres)
scripts/test-db.sh   Kör migrationer + tester
```

## Kom igång (webb)

```bash
cd apps/web
cp .env.example .env.local   # fyll i URL + publishable key
npm install
npm run dev
```

Lokalt demoläge utan Supabase: `DEMO_DATA=$PWD/demo/demo.json npm run dev` (bara i `next dev`).

## Tester

```bash
scripts/test-db.sh          # migrationer, ingest, RLS (kräver Postgres 15+ lokalt)
cd apps/web && npm test     # logik för hemöversikten
npm run typecheck && npm run build
```

## Säkerhet

- Endast e-postadresser i `app_users` får inloggningslänk och kan läsa data (RLS).
- Hemligheter ligger i Supabase Vault (`homey_ingest_secret`, `unifi_api_key`), aldrig i git.
- HomeyScripts har platshållare för hemligheter; fyll i dem bara på Homey.

## Byggordning

1. ✅ Datahämtning (HomeyScript → Supabase)
2. ✅ Inloggning, Hem och Rum (läsläge, live-uppdatering)
3. ⏳ Kommandon: Ljust/Mys/Släck via `commands` → Edge Function → Homey-webhook
4. ⏳ Närvaro via UniFi (Site Manager connector)
5. ⏳ Elpris SE3 + Energi-vy
6. ⏳ Rensning av gammal data (pg_cron), historik, larm
