#!/data/data/com.termux/files/usr/bin/sh
# Termux:Boot – startar TV-agenten när plattan startas. Installeras med:
#   mkdir -p ~/.termux/boot && cp ~/MyHomey/agents/tv-adb/termux-boot.sh ~/.termux/boot/tv-agent && chmod +x ~/.termux/boot/tv-agent
termux-wake-lock
sleep 20   # vänta på wifi
bash "$HOME/MyHomey/agents/tv-adb/start.sh" >> "$HOME/tv-agent.log" 2>&1
