#!/data/data/com.termux/files/usr/bin/bash
# Startar TV-agenten (Termux på plattan, fungerar även på Linux/Raspberry Pi).
# Första gången skapas .env: från en nedladdad tv-agent*.env om den finns, annars frågar skriptet
# (hemligheten skrivs in dolt). Kör:  bash ~/MyHomey/agents/tv-adb/start.sh
set -e
cd "$(dirname "$0")"

# Verktyg (installeras bara om de saknas)
command -v node >/dev/null 2>&1 || pkg install -y nodejs-lts
command -v adb  >/dev/null 2>&1 || pkg install -y android-tools

if [ ! -f .env ]; then
  found=$(ls "$HOME"/storage/downloads/tv-agent*.env* 2>/dev/null | head -n 1 || true)
  if [ -n "$found" ]; then
    cp "$found" .env && echo "Hämtade inställningar från: $found"
  else
    read -rp "TV:ns IP-adress [192.168.1.91]: " ip; ip=${ip:-192.168.1.91}
    read -rp "Hushåll (fredrik/ulrika) [fredrik]: " hh; hh=${hh:-fredrik}
    read -rsp "TV_SECRET (klistra in, syns inte): " sec; echo
    [ -n "$sec" ] || { echo "Ingen hemlighet angiven, avbryter."; exit 1; }
    dev=google-tv-vardagsrum; [ "$hh" = fredrik ] || dev=android-tv
    printf 'TV_HOST=%s\nTV_PORT=5555\nINGEST_URL=https://swqaqtcjimyoxcyejrrd.supabase.co/functions/v1/tv-ingest\nTV_SECRET=%s\nHOUSEHOLD=%s\nDEVICE_ID=%s\nPOLL_MS=10000\n' \
      "$ip" "$sec" "$hh" "$dev" > .env
    echo "Skapade .env"
  fi
  chmod 600 .env
fi

# Valfritt paket för The Frames konstläge (ws). Installeras en gång.
[ -d node_modules/ws ] || npm install --omit=dev --no-audit --no-fund >/dev/null 2>&1 || true

# Håll Termux vaket och anslut till TV:n (första gången: välj "Tillåt alltid" på TV:n)
command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock || true
host=$(grep '^TV_HOST=' .env | cut -d= -f2)
port=$(grep '^TV_PORT=' .env | cut -d= -f2); port=${port:-5555}
adb connect "$host:$port" || true

echo "Startar agenten (stoppa med Ctrl+C)…"
exec node --env-file=.env index.js
