// Avvecklad: tar bort sig själv från enheter som registrerade den (installationen sker som förut, utan service worker).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.registration.unregister()));
