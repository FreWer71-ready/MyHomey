import { Icon, type IconName } from './Icon';

const SCENES: { key: string; label: string; icon: IconName; className: string }[] = [
  { key: 'ljust', label: 'Ljust', icon: 'sun', className: 'bg-sun text-ink' },
  { key: 'mys', label: 'Mys', icon: 'moon', className: 'bg-white text-ink' },
  { key: 'slack', label: 'Släck', icon: 'power', className: 'bg-ink text-white' },
];

/**
 * Ljust / Mys / Släck för ett rum. Inaktiva tills kommandovägen
 * (commands → Edge Function → Homey-webhook) är byggd.
 */
export function SceneButtons({ room, size }: { room: string; size: 'icon' | 'large' }) {
  return (
    <div className={`grid grid-cols-3 ${size === 'large' ? 'gap-3.5' : 'gap-1.5'}`}>
      {SCENES.map((s) => (
        <button
          key={s.key}
          type="button"
          disabled
          title="Kommer snart"
          aria-label={`${s.label} i ${room}`}
          className={`flex items-center justify-center rounded-[14px] disabled:cursor-not-allowed ${s.className} ${
            size === 'large' ? 'min-h-24 gap-3.5 rounded-[28px] text-[26px] font-extrabold' : 'min-h-11'
          }`}
        >
          <Icon name={s.icon} size={size === 'large' ? 40 : 24} />
          {size === 'large' && s.label}
        </button>
      ))}
    </div>
  );
}
