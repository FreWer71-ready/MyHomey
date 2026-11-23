'use client';
import { useEffect, useRef, useState } from 'react';
import { briefingText, pickVoice, speechChunks } from '@/lib/briefing';

/**
 * "Läs upp rapport": webbläsarens svenska talsyntes (inga nycklar, ingen kostnad). Startar bara vid tryck (iPhone tillåter
 * inget annat), läser en mening i taget och byter till "Stoppa" medan den talar. Visas inte där talsyntes saknas.
 * Texten byggs vid tryck (rätt hälsning och datum även om sidan stått öppen länge); `weather` = väderfras till första
 * meningen, `parts` = övriga meningar (se lib/briefing-source.ts).
 */
export function SpeakBriefing({ name, weather = '', parts = [], className = '' }: { name?: string; weather?: string; parts?: string[]; className?: string }) {
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const run = useRef(0);

  useEffect(() => {
    setSupported('speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined');
    const stop = () => window.speechSynthesis?.cancel();
    window.addEventListener('pagehide', stop);
    return () => { window.removeEventListener('pagehide', stop); stop(); };
  }, []);
  if (!supported) return null;

  const stop = () => { run.current++; window.speechSynthesis.cancel(); setSpeaking(false); };
  const speak = () => {
    const synth = window.speechSynthesis;
    synth.cancel();
    const id = ++run.current;
    const chunks = speechChunks(briefingText({ name, now: Date.now(), weather, parts }));
    const voice = pickVoice(synth.getVoices());
    setSpeaking(true);
    // Första yttrandet startas direkt i trycket (krav på iPhone); resten när föregående är klart.
    const next = (i: number) => {
      if (id !== run.current) return;
      if (i >= chunks.length) { setSpeaking(false); return; }
      const u = new SpeechSynthesisUtterance(chunks[i]);
      u.lang = 'sv-SE';
      if (voice) u.voice = voice;
      u.rate = 0.95;
      u.onend = () => next(i + 1);
      u.onerror = () => { if (id === run.current) setSpeaking(false); };
      synth.speak(u);
    };
    next(0);
  };

  return (
    <button type="button" onClick={speaking ? stop : speak} aria-pressed={speaking}
      className={`pill h-11 shrink-0 px-4 text-[0.9375rem] ${speaking ? 'on' : ''} ${className}`}>
      {speaking ? '⏹ Stoppa' : '🔊 Läs upp rapport'}
    </button>
  );
}
