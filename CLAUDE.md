# MyHomey: regler för fortsatt utveckling

Svara och skriv på svenska (kommentarer, UI-text, commit-meddelanden).

## Arbetssätt
- **Korta, kärnfulla svar.** Håll tokenförbrukningen nere: läs bara det som behövs, undvik onödiga agenter och föreslå billigare alternativ när de finns.
- **Mobile first.** Designa för mobil (390 px) först: knappar minst 44 px, inget sidledes sidscroll, kontrollera UI-ändringar på mobilbredd.
- **Backlogg:** `BACKLOGG.md` (iPhone-ring, larmknapp 112). Ta inte upp den förrän det efterfrågas.
- **Fråga före** PR, merge, databasändringar och allt annat som påverkar produktion. Ett "ja", "kör", "merga" eller "publicera" gäller bara det steget.
- **"Publicera"** = commit → push → PR → merge → kontrollera att Vercel-bygget blir `READY` – alltid för **båda** dashboards (`myhomey` = Fredrik, `ulrikasdashboard` = Ulrika). Fråga först, varje gång.
- Allt ska vara committat och pushat (stopp-hook). Utvecklingsgren: `claude/charming-dirac-60g8ft`. Har fjärrgrenen avvikande historik: cherry-picka, aldrig force-push.
- Före commit: `npm test`, `npx tsc --noEmit` och eslint på ändrade filer (i `apps/web`). Databas: `scripts/test-db.sh`. Större UI-ändringar: `next build`.

## Plats och integritet
- Prioritet: **mobilens plats → Life360 (eller Apple Watch) → hemmet/jobbet.**
- Platsåtkomst frågas bara vid tryck, aldrig vid sidladdning. Nekas den används nästa källa.
- Positioner lagras inte. Noggrannhet sämre än 1 km används inte.

## Resor och pendling
- Reseben visas som **starttid · symbol för färdsätt · text · sluttid**.
- Ressätt: kollektivt (ResRobot) och bil (TomTom). Gång och cykel är inte infört.
- Tåg sparas i `train_trips` när användaren bekräftar "Jag är på tåget" (`source = user`) och när tågläget hittat tåget via tågets GPS (`gps`) eller gissat ur positionen (`guess`). "Fel tåg ✕" döljer resan (`hidden`), så samma gissning sparas inte igen; bekräftas den visas den igen.
- Ersättning enligt Mälardalstrafik (Movingo): 20–39 min 50 %, 40–59 min 75 %, 60+ min 100 % av snittpriset per resa (`MOVINGO_TYPE`, `MOVINGO_PRICE` i Vercel). Ingen automatisk ansökan – appen ger belopp, underlag och länk.
- Konstanter i `lib/trips.ts`: `CLAIM_MIN = 20` (ersättning från 20 min eller mer), `DELAYED_MIN = 5`, `ROUTE_KM = 109`. Ändra där.
- Resor med 20 min försening eller mer visas i "Begär ersättning" med status och kopierbart underlag.

## Hue (Ulrika)
- Hallsensorns automation ligger i Hue-bryggan (behavior_instance "Sensor hall"): rörelse 08–22 tänder zonen "Alla rum" (scen "Ljust", allt utom "Använts ej"), 22–08 gör ingenting, ingen automatisk släckning. Ändras i Hue-appen eller via CLIP v2.
- Favoriter: Rutiner i fyra kolumner (`ActionTiles` layout `tiles`) med plats för 8 rutiner för hela hemmet, "Mys i hela huset" och "Släck alla lampor" först. Fler fälls ut under "Fler rutiner".
- Hem: Snabbval ligger under trafikkortet (Till jobbet), i fyra kolumner med 8 rutor: Ljust/Mys/Släck i hela huset, förvalen (`QUICK_SCENES`), favoriterna och hemmets scener (dubbletter på namn bort). Fler visas på Favoriter. Andra hushåll har Snabbval kvar i vänsterkolumnen.
- "Ringa mobilen" (`NTFY_TOPICS`) ligger i varningsraden på Hem, direkt under klockan. Lägg den inte i Snabbval: kortet klipper innehåll på stor skärm.
- Hemkomst sköts av Hues egen automation "Komma hem" (geofence i Hue-appen). Dashboardens egen variant är borttagen (kod och tabellen `arrival_lights`).

## Kalender
- Egen kalender på Hem: idag + 14 dagar, högst 8 händelser per dag. Den speglade (den andres, `compact`): idag + 7 dagar, högst 4. "Månad" visar 30 dagar. Konstanter överst i `CalendarWidget`.

## Tomma avsnitt (gäller alla dashboards: `myhomey` och `ulrikasdashboard`)
- **Visa inte avsnitt, kort, flikar eller rader utan data.** Inga "Ingen X-data"-texter, tomma diagram eller flikar som leder till en tom vy. Exempel: Historik visar bara de flikar (Fukt, Effekt, Energi, Tåg, Vin …) som hushållet har data för.
- **Villkora på datan, inte på inställningar:** `data.length > 0 && …`. När data kommer in visas avsnittet av sig självt vid nästa laddning, utan kodändring.
- **"Inga problem" är data:** statusrader som "Inga störningar", "Alla batterier är ok" och "Alla dörrar är stängda" visas så länge underlaget finns (enheterna eller källan). Saknas underlaget (t.ex. inga batterienheter) döljs hela avsnittet.
- **Undantag:** en sida eller vald vy som blir helt tom visar en kort rad (t.ex. "Ingen historik än.") så att den inte blir blank.
- Ny funktion: kontrollera sidan med ett hushåll som saknar data. Ulrika saknar flöden, TV, nätverk, vin, tåg, fukt-, effekt- och dörrsensorer.

## Födelsedagar
- `BIRTHDAYS="Förnamn=MM-DD,…"` i Vercel (t.ex. `Ulrika=11-23`). Upprepas varje år (29 feb firas 28 feb under icke-skottår). Ny variabel kräver ny deploy.
- `BirthdayOverlay` (i layouten) visar grattis med konfetti, blommor och champagne i cirka 4,8 s vid varje full omladdning under dagen, inte vid sidbyte eller automatisk uppdatering. Tryck stänger direkt. Utan `BIRTHDAYS` visas inget.

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
