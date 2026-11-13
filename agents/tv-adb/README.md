# TV-agent (Google TV / Android TV via ADB)

Liten lokal tjänst som läser vad Google TV visar och skickar det till dashboarden.
Var 10:e sekund körs tre ADB-kommandon:

- `dumpsys power` ger om TV:n är vaken eller i viloläge.
- `dumpsys window` ger appen i förgrunden, till exempel Netflix eller SVT Play.
- `dumpsys media_session` ger titel, avsnitt eller artist, och om det spelar eller är pausat.

Agenten skickar bara när något ändras, plus ett hjärtslag varje minut. Dashboarden visar titeln i TV-rutan längst ner
på Hem. Har agenten varit tyst i 3 minuter används Homeys cast-data som förut.

Inga npm-beroenden: Node 20+ har `fetch` och `--env-file`, och `adb` körs som externt kommando.

## Säkerhet

- Agenten har **ingen** Supabase-nyckel. Den skickar till edge-funktionen `tv-ingest` med en egen hemlighet
  (`TV_SECRET`, i Vault som `tv_secret`). Hemligheten kan bara skriva TV-status och aldrig läsa något.
- ADB ger full kontroll över TV:n. Kör agenten på en dator du litar på i hemnätet, och öppna aldrig port 5555 mot internet.
- `.env` ligger i `.gitignore` och får aldrig checkas in.

## 1. Förbered TV:n

1. Slå på utvecklarläget genom att trycka 7 gånger tills "Du är nu utvecklare" visas:
   - **Google TV:** Inställningar → System → Om → **Android TV OS-version** (eller "Build").
   - **Android TV** (t.ex. Philips, Sony, TCL): Inställningar → Enhetsinställningar → Om → **Version**.
2. **Inställningar → System → Utvecklaralternativ**: slå på **USB-felsökning**. Slå också på **Nätverksfelsökning** om den finns.
3. Ge TV:n en fast IP-adress i routern, till exempel 192.168.1.50.

## 2. Installera på datorn (t.ex. Raspberry Pi)

```bash
sudo apt install -y adb nodejs        # Node 20 eller senare krävs
git clone … && cd MyHomey/agents/tv-adb
cp .env.example .env                  # fyll i TV_HOST och TV_SECRET (hemligheten får du separat)
adb connect 192.168.1.50:5555         # godkänn "Tillåt alltid från den här datorn" på TV:n
npm test && npm start
```

Rätt uppsatt syns till exempel `Ny status: Netflix · Stranger Things (playing)` i loggen.

## 3. Kör som tjänst (startar vid uppstart, startar om vid fel)

`/etc/systemd/system/tv-agent.service`:

```ini
[Unit]
Description=TV-agent (Google TV -> dashboard)
After=network-online.target
Wants=network-online.target

[Service]
WorkingDirectory=/home/pi/MyHomey/agents/tv-adb
ExecStart=/usr/bin/node --env-file=.env index.js
Restart=always
RestartSec=10
User=pi

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now tv-agent
journalctl -u tv-agent -f
```

## Flera hushåll

Varje hushåll har en egen hemlighet i Vault: `tv_secret` för fredrik och `tv_secret_<hushåll>` för övriga, till exempel
`tv_secret_ulrika`. Hemligheten avgör vilket hushåll agenten får skriva till. Sätt `HOUSEHOLD` och `TV_SECRET` i `.env`
efter det, och ge `DEVICE_ID` ett eget namn, t.ex. `android-tv`.

## Begränsningar

- Titeln kommer bara från appar som delar sin mediasession. Netflix, YouTube, Spotify och Plex brukar dela den,
  medan vissa svenska play-tjänster bara ger appens namn.
- I djup viloläge kan ADB tappa anslutningen. Agenten återansluter automatiskt med ökande väntetid, upp till 60 s.
- Byter TV:n IP-adress måste `TV_HOST` uppdateras, så sätt en fast adress i routern.
