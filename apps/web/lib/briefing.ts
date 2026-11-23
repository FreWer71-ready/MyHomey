// Rapport som läses upp ("Godmorgon Fredrik, här är din rapport …"). Ren logik, klientsäker (inga serverberoenden).
const TZ = 'Europe/Stockholm';

/** Hälsning efter klockan i Stockholm: Godmorgon 04–09, God förmiddag 10–11, God eftermiddag 12–17, God kväll 18–21, annars Hej. */
export function greeting(now: number): string {
  const h = Number(new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }).format(now));
  return h >= 4 && h < 10 ? 'Godmorgon' : h >= 10 && h < 12 ? 'God förmiddag' : h >= 12 && h < 18 ? 'God eftermiddag' : h >= 18 && h < 22 ? 'God kväll' : 'Hej';
}

/**
 * Rapportens text. `parts` = färdiga meningar (väder, kalender …) som läggs efter datumet; tomma hoppas över.
 * Klockslag undviks i grunden: talsyntesen läser "07:12" olika på olika enheter.
 */
export function briefingText({ name, now, parts = [] }: { name?: string; now: number; parts?: string[] }): string {
  const date = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' }).format(now);
  const who = name?.trim() ? ` ${name.trim().charAt(0).toUpperCase()}${name.trim().slice(1)}` : '';
  return [`${greeting(now)}${who}, här är din rapport.`, `Idag är det ${date}.`, ...parts.map((p) => p.trim()).filter(Boolean)].join(' ');
}

/**
 * Delar texten i meningar (högst `max` tecken, annars delat vid komma eller mellanslag). Långa yttranden klipps av
 * efter cirka 15 sekunder i flera webbläsare, så de läses upp ett i taget.
 */
export function speechChunks(text: string, max = 200): string[] {
  const out: string[] = [];
  for (const s of text.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean)) {
    let rest = s;
    while (rest.length > max) {
      const cut = Math.max(rest.lastIndexOf(', ', max), rest.lastIndexOf(' ', max));
      const at = cut > max / 2 ? cut + 1 : max;
      out.push(rest.slice(0, at).trim());
      rest = rest.slice(at).trim();
    }
    if (rest) out.push(rest);
  }
  return out;
}

type VoiceInfo = { name: string; lang: string };
/** Bästa svenska rösten: förbättrad/neural/premium först, sedan någon svensk. Null om ingen svensk röst finns (webbläsaren väljer då själv utifrån sv-SE). */
export function pickVoice<T extends VoiceInfo>(voices: T[]): T | null {
  const sv = voices.filter((v) => /^sv([-_]|$)/i.test(v.lang));
  return sv.find((v) => /premium|enhanced|förbättrad|neural|natural|online/i.test(v.name)) ?? sv[0] ?? null;
}
