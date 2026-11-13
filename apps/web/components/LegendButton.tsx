import { Icon } from './Icon';
import { HEAT, tint } from '@/lib/scale';

/** Menyknapp som visar temperaturlegenden i en popup (native popover, stängs vid klick utanför). */
export function LegendButton() {
  return (
    <>
      <button
        type="button"
        popoverTarget="legend"
        className="flex w-full flex-col items-center gap-1 rounded-[18px] py-2.5 text-[12px] font-bold text-dim" title="Temperaturfärger"
      >
        <Icon name="thermo" size={24} />
        <span className="md:sr-only">Färger</span>
      </button>
      <div
        id="legend"
        popover="auto"
        className="m-auto w-[min(92vw,340px)] rounded-[24px] border border-line bg-ground/95 p-5 text-fg shadow-2xl backdrop:bg-black/50"
      >
        <h2 className="mb-3 text-lg font-extrabold">Temperaturfärger</h2>
        <ul className="flex flex-col gap-2">
          {HEAT.map((s) => (
            <li key={s.label} className="flex items-center gap-3 rounded-[14px] px-3 py-2 font-bold" style={{ background: tint(s.color, 0.35) }}>
              <span className="size-4 shrink-0 rounded-full" style={{ background: s.color }} />
              {s.label}
            </li>
          ))}
        </ul>
        <button type="button" popoverTarget="legend" popoverTargetAction="hide" className="mt-4 w-full rounded-[16px] bg-glass-hi py-2.5 font-extrabold">
          Stäng
        </button>
      </div>
    </>
  );
}
