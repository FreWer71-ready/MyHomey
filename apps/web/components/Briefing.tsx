import { loadBriefing } from '@/lib/briefing-source';
import { SpeakBriefing } from './SpeakBriefing';

/** Rapportknappen med innehållet. Asynkron serverkomponent i Suspense: hämtningen blockerar inte resten av Hem. */
export async function Briefing({ className = '' }: { className?: string }) {
  const b = await loadBriefing().catch(() => null);
  return b ? <SpeakBriefing name={b.name} weather={b.weather} parts={b.parts} className={className} /> : null;
}
