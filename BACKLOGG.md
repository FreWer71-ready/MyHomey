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
