'use client';
import { useEffect, useRef, useState } from 'react';
import { briefingText, pickVoice, speechChunks } from '@/lib/briefing';

/**
 * "Läs upp rapport": webbläsarens svenska talsyntes (inga nycklar, ingen kostnad). Startar bara vid tryck (iPhone tillåter
 * inget annat), köar meningarna och byter till "Stoppa" medan den talar. Visas inte där talsyntes saknas.
 * Texten byggs vid tryck (rätt hälsning och datum även om sidan stått öppen länge); `weather` = väderfras till första
 * meningen, `parts` = övriga meningar (se lib/briefing-source.ts).
 */
export function SpeakBriefing({ name, weather = '', parts = [], className = '' }: { name?: string; weather?: string; parts?: string[]; className?: string }) {
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const run = useRef(0);
  const utter = useRef<SpeechSynthesisUtterance[]>([]);

  useEffect(() => {
    setSupported('speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined');
    const stop = () => window.speechSynthesis?.cancel();
    window.addEventListener('pagehide', stop);
    return () => { window.removeEventListener('pagehide', stop); stop(); };
  }, []);
  if (!supported) return null;

  const stop = () => { run.current++; utter.current = []; window.speechSynthesis.cancel(); setSpeaking(false); };
  const speak = () => {
    const synth = window.speechSynthesis;
    // Chrome: cancel() direkt före speak() kan svälja uppläsningen, och talet kan fastna i pausat läge.
    if (synth.speaking || synth.pending) synth.cancel();
    synth.resume();
    const id = ++run.current;
    const chunks = speechChunks(briefingText({ name, now: Date.now(), weather, parts }));
    if (!chunks.length) return;
    const voice = pickVoice(synth.getVoices());
    setSpeaking(true);
    const done = () => { if (id === run.current) { utter.current = []; setSpeaking(false); } };
    // Alla meningar köas direkt i trycket (krav på iPhone; webbläsaren läser dem i tur och ordning). Referenserna sparas,
    // annars kan Chrome städa bort dem mitt i uppläsningen så att den tystnar efter första meningen.
    utter.current = chunks.map((text, i) => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'sv-SE';
      if (voice) u.voice = voice;
      u.rate = 0.95;
      if (i === chunks.length - 1) u.onend = done;
      u.onerror = done;
      return u;
    });
    utter.current.forEach((u) => synth.speak(u));
    // Reserv om webbläsaren inte skickar onend: släpp "Stoppa" när inget längre talas.
    const watch = setInterval(() => {
      if (id !== run.current) return clearInterval(watch);
      if (!synth.speaking && !synth.pending) { clearInterval(watch); done(); }
    }, 1000);
  };

  return (
    <button type="button" onClick={speaking ? stop : speak} aria-pressed={speaking}
      className={`btn min-h-12 shrink-0 px-4 text-[0.9375rem] ${speaking ? 'on' : ''} ${className}`}>
      {speaking ? '⏹ Stoppa' : '🔊 Läs upp rapport'}
    </button>
  );
}
