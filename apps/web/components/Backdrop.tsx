'use client';
import { useEffect, useState } from 'react';
import { phaseWeights, skyTint, solarElevation, type Condition, type Phase, type SkyState } from '@/lib/sky';
import { SkyCanvas } from './SkyCanvas';

const ORDER: Phase[] = ['night', 'dusk', 'day'];

/** Dev: ?sky=villkor,solhöjd,mm,vind,moln (t.ex. rain,-10,2,8,0.9) för att se alla lägen. */
function devOverride(sky: SkyState): { sky: SkyState; el: number } | null {
  if (process.env.NODE_ENV !== 'development' || typeof window === 'undefined') return null;
  const q = new URLSearchParams(window.location.search).get('sky');
  if (!q) return null;
  const [c, el, mm, wind, clouds] = q.split(',');
  return {
    el: Number(el ?? 20),
    sky: { ...sky, condition: c as Condition, precip: Number(mm ?? 1), wind: Number(wind ?? 4), clouds: Number(clouds ?? 0.6), thunder: c === 'storm' ? 0.8 : 0 },
  };
}

/**
 * Helskärmsbakgrund som speglar tid och väder:
 * 1) väderbilder för natt/skymning/dag som tonar mjukt efter solens höjd,
 * 2) färgton för gyllene och blå timme, 3) rörligt väderlager (moln, regn, snö, stjärnor, blixtar),
 * 4) mörk slöja för textens kontrast. Byte av väder tonas in över 3 s.
 */
export function Backdrop({ condition, sky, el0, lat, lon }: { condition: Condition; sky: SkyState; el0: number; lat: number; lon: number }) {
  const [el, setEl] = useState(el0);
  const [override, setOverride] = useState<{ sky: SkyState; el: number } | null>(null);
  const [layers, setLayers] = useState([{ condition, key: 0 }]);

  useEffect(() => {
    setOverride(devOverride(sky));
    const tick = () => setEl(solarElevation(Date.now(), lat, lon));
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [lat, lon, sky]);

  const cond = override?.sky.condition ?? condition;
  useEffect(() => {
    setLayers((ls) => {
      const top = ls[ls.length - 1];
      return top.condition === cond ? ls : [top, { condition: cond, key: top.key + 1 }];
    });
  }, [cond]);
  useEffect(() => {
    if (layers.length < 2) return;
    const t = setTimeout(() => setLayers((ls) => ls.slice(-1)), 3000);
    return () => clearTimeout(t);
  }, [layers]);

  const e = override?.el ?? el;
  const w = phaseWeights(e);
  // Rätt blandning: första synliga bilden täcker helt, nästa läggs på med sin andel av summan hittills.
  let acc = 0;
  const shown = ORDER.filter((p) => w[p] > 0.001).map((p, i) => {
    acc += w[p];
    return { phase: p, opacity: i === 0 ? 1 : w[p] / acc };
  });

  return (
    <div aria-hidden="true" className="fixed inset-0 -z-10 overflow-hidden bg-ground">
      {layers.map((l, i) => (
        <div key={l.key} className={i > 0 ? 'backdrop-fadein absolute inset-0' : 'absolute inset-0'}>
          {shown.map((s) => (
            <picture key={s.phase}>
              <source media="(orientation: portrait)" srcSet={`/mydashboard/bg/${l.condition}-${s.phase}-p.jpg`} />
              <img
                src={`/mydashboard/bg/${l.condition}-${s.phase}.jpg`}
                alt="" decoding="async" className="backdrop-img"
                style={{ opacity: s.opacity, transition: 'opacity 60s linear' }}
              />
            </picture>
          ))}
        </div>
      ))}
      <div className="absolute inset-0" style={{ background: skyTint(e), transition: 'background 60s linear' }} />
      <SkyCanvas sky={override?.sky ?? sky} el={e} />
      <div className="backdrop-veil" />
    </div>
  );
}
