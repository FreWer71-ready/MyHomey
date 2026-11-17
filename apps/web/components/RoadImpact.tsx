import { IMPACT, TONE_COLOR, type Tone } from '@/lib/commute';

/**
 * Vägens påverkan: form + text (färgen är aldrig ensam bärare). `plain`: vit text och bara formen i färg,
 * för ytor som redan är tonade i samma färg (där färgad text inte når 4,5:1).
 */
export function RoadImpact({ tone, plain = false, className = '' }: { tone: Tone; plain?: boolean; className?: string }) {
  const i = IMPACT[tone];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 font-semibold ${className}`} style={plain ? undefined : { color: TONE_COLOR[tone] }}>
      <span aria-hidden="true" style={{ color: TONE_COLOR[tone] }}>{i.mark}</span>{i.label}
    </span>
  );
}
