# Backlogg

Skjutet på framtiden. Ta inte upp något härifrån förrän det efterfrågas.

## 1. Ring iPhone (Ulrika)
- **Läge:** "Ringa mobilen" (`app/actions/ping.ts`) skickar en brådskande ntfy-notis. Det larmar tills det stängs på Android. ntfy-appen på iPhone är osäker som larm (kan inte tillförlitligt gå förbi ljudlöst och Stör ej).
- **Förslag:** Pushover med prioritet 2 (*emergency*): repeterar tills det kvitteras, och med iOS *Critical Alerts* går det förbi ljudlöst och Stör ej. Ulrika slår på Critical Alerts i Pushover-appen.
- **Bygge:** Byt ntfy-anropet i `ping.ts` mot Pushovers API (`priority=2`, `retry`, `expire`). Nya hemliga miljövariabler i Vercel (app-token och användarnyckel per förnamn). Android behåller ntfy och iPhone får Pushover, per person.
- **Alternativ:** Riktigt samtal via 46elks eller Twilio (inte verifierat hur det beter sig med ljudlöst och Stör ej). Apples "Spela upp ljud" (Hitta) har inget officiellt API; finns redan i Fredriks dashboard via Homey.
- **Öppen fråga:** Vem av oss har iPhone?

## 2. Larmknapp (112)
- **Ingen automatisk uppringning av 112.** Såvitt känt går nödnummer normalt inte via samtals-API:er, platsinfo saknas och falsklarm kan få följder (inte verifierat).
- **Förslag:** Röd knapp med `tel:112` som öppnar telefonens uppringare (bekräftas med ett tryck). Håll in i 2 sekunder mot misstryck.
- **Samtidigt:** Brådskande larm till familjens telefoner (Pushover prio 2 eller ntfy) och blinka lamporna rött.
- **Ordning:** Larmknappen först, sedan Pushover för iPhone.

## 3. Redigera kalenderhändelser i appen med synk mot Google
- **Läge:** Kalendrarna läses via hemliga iCal-länkar: skrivskyddat och utan händelse-ID:n. Jobbets Outlook ("Möten på jobbet") och Forza-matcherna är skrivskyddade och ska förbli det.
- **Krav:** Google Calendar API med OAuth per konto (scope `calendar.events`, snävare scope finns). Läsningen av redigerbara kalendrar flyttas till API:t (ger id och etag). Tokens lagras som Hue-tokens (tabell med RLS, hemlig nyckel i Vault).
- **Klurigt:**
  1. Googles testläge: refresh-token går ut efter 7 dagar. Sätt appen i produktion (en overifierad app med varning går bra för två användare).
  2. Återkommande händelser: bara denna, denna och följande, eller alla. Börja med enskilda händelser och en enskild förekomst.
  3. Synk: Google är sanningen. Uppdatera direkt efter skrivning, läs om var 5–10:e minut, `etag`/If-Match mot krockar. Push (webhook) senare.
  4. Rättigheter: bara kalendrar kontot får skriva i. Den andras kalender kräver delning med "Gör ändringar". Speglingen mellan dashboards förblir skrivskyddad.
  5. Heldag, tidszon och sommartid, radering med bekräftelse, mobilark för titel, tid, plats och anteckning.
- **Steg:** 1) Koppla Google-kontot (som Hue), läs egna kalendern via API, skapa/ändra/radera enskilda händelser (cirka 1–2 arbetspass). 2) Återkommande händelser. 3) Båda kalendrarna, ev. push.
- **Billigare alternativ:** Knapp "Lägg till i Google Kalender" med förifylld mall (ingen inloggning, bara skapa).
- **Behövs från Fredrik:** OAuth-klient i Google Cloud Console (jag guidar), vems kalender som ska kunna ändras, och om skapa/ändra/radera enskilda händelser räcker först.
