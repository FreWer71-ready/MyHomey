'use client';
import { useEffect } from 'react';

/** Skrollar valda knappar (aria-current) in i bild i rader som sveps i sidled (mobil). */
export function ScrollActive() {
  useEffect(() => {
    document.querySelectorAll<HTMLElement>('.scroll-x [aria-current="page"]').forEach((el) => {
      const row = el.parentElement!;
      if (row.scrollWidth > row.clientWidth) row.scrollLeft = el.offsetLeft - row.clientWidth / 2 + el.offsetWidth / 2;
    });
  });
  return null;
}
