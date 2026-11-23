/** Mobilens plats (första prio), som frågetillägg för /api/trip. Tom sträng om den nekas, saknas eller dröjer: servern tar då Life360. */
export const phonePos = () => new Promise<string>((done) => {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return done('');
  navigator.geolocation.getCurrentPosition(
    (p) => done(`&lat=${p.coords.latitude.toFixed(5)}&lon=${p.coords.longitude.toFixed(5)}&acc=${Math.round(p.coords.accuracy)}`),
    () => done(''), { timeout: 4000, maximumAge: 60_000 },
  );
});
