# MyHomey: regler för fortsatt utveckling

Svara och skriv på svenska (kommentarer, UI-text, commit-meddelanden).

## Arbetssätt
- **Korta, kärnfulla svar.** Håll tokenförbrukningen nere: läs bara det som behövs, undvik onödiga agenter och föreslå billigare alternativ när de finns.
- **Mobile first.** Designa för mobil (390 px) först: knappar minst 44 px, inget sidledes sidscroll, kontrollera UI-ändringar på mobilbredd.
- **Fråga före** PR, merge, databasändringar och allt annat som påverkar produktion. Ett "ja", "kör", "merga" eller "publicera" gäller bara det steget.
- **"Publicera"** = commit → push → PR → merge → kontrollera att Vercel-bygget blir `READY`.
- Allt ska vara committat och pushat (stopp-hook). Utvecklingsgren: `claude/charming-dirac-60g8ft`. Har fjärrgrenen avvikande historik: cherry-picka, aldrig force-push.
- Före commit: `npm test`, `npx tsc --noEmit` och eslint på ändrade filer (i `apps/web`). Databas: `scripts/test-db.sh`. Större UI-ändringar: `next build`.

## Plats och integritet
- Prioritet: **mobilens plats → Life360 (eller Apple Watch) → hemmet/jobbet.**
- Platsåtkomst frågas bara vid tryck, aldrig vid sidladdning. Nekas den används nästa källa.
- Positioner lagras inte. Noggrannhet sämre än 1 km används inte.

## Resor och pendling
- Reseben visas som **starttid · symbol för färdsätt · text · sluttid**.
- Ressätt: kollektivt (ResRobot) och bil (TomTom). Gång och cykel är inte infört.
- Tåg sparas i `train_trips` **bara när användaren bekräftar** "Jag är på tåget", aldrig vid gissning.
- Konstanter i `lib/trips.ts`: `CLAIM_MIN = 20` (ersättning från 20 min eller mer), `DELAYED_MIN = 5`, `ROUTE_KM = 109`. Ändra där.
- Resor med 20 min försening eller mer visas i "Begär ersättning" med status och kopierbart underlag.

## Prestanda
- Klientcache 30 s (`staleTimes`), `loading.tsx` vid sidhopp. Ändra inte utan skäl.
- Hämta data via de cachade `load*`-funktionerna i `lib/data.ts` (React `cache()`). Sekundär data strömmas i `Suspense`.
- Inga extra nätanrop i middleware. Inloggning kontrolleras med `getClaims()`, hushållskontrollen är cachad 10 min.

## Databas och säkerhet
- Migrationer i `supabase/migrations/`, med RLS per hushåll (`household_id default public.my_household()`).
- Körs mot Supabase-projektet `homey-dashboard` (`swqaqtcjimyoxcyejrrd`) först efter ok.
- Inga nycklar eller hemligheter i kod, loggar eller svar.

## Kod
- Ren logik i `lib/*.ts` med tester (`node --test`). Hämtning och sparande i `*-source.ts` (`server-only`).
