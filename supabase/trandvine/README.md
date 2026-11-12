# Trandvine → MyHomey

Körs i **Trandvine-projektet** (eget Supabase-projekt), inte i dashboardens.
Triggern `myhomey_push_cellar` på `bottles` skickar en sammanfattning av källaren till
edge-funktionen `wine-ingest` när en flaska läggs till, ändras eller tas bort.

- Delad hemlighet: Vault `myhomey_wine_secret` (Trandvine) = Vault `wine_secret` (dashboarden).
- Bara konton i listan i funktionen skickas (i dag frewer71@gmail.com).
- SQL: se migrationen `myhomey_cellar_push` i Trandvine-projektet.
