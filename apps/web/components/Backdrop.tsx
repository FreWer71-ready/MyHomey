'use client';
import { useEffect, useState } from 'react';

/**
 * Helskärmsbakgrund: väderbild med långsam panorering och mörk slöja.
 * Vid byte tonas nya bilden in ovanpå den gamla, som sedan tas bort.
 */
export function Backdrop({ src }: { src: string }) {
  const [layers, setLayers] = useState([{ src, key: 0 }]);

  useEffect(() => {
    setLayers((ls) => {
      const top = ls[ls.length - 1];
      return top.src === src ? ls : [top, { src, key: top.key + 1 }];
    });
  }, [src]);

  useEffect(() => {
    if (layers.length < 2) return;
    const t = setTimeout(() => setLayers((ls) => ls.slice(-1)), 3000);
    return () => clearTimeout(t);
  }, [layers]);

  return (
    <div aria-hidden="true" className="fixed inset-0 -z-10 overflow-hidden bg-ground">
      {layers.map((l, i) => (
        <picture key={l.key}>
          <source media="(orientation: portrait)" srcSet={`${l.src}-p.jpg`} />
          <img src={`${l.src}.jpg`} alt="" decoding="async" className={i > 0 ? 'backdrop-img backdrop-in' : 'backdrop-img'} />
        </picture>
      ))}
      <div className="backdrop-veil" />
    </div>
  );
}
