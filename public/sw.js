self.addEventListener('install', (event) => {
  event.waitUntil(caches.open('masjid-al-nour-v2').then((cache) => cache.addAll(['/','/mobile','/manifest.webmanifest','/icon.svg'])))
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key !== 'masjid-al-nour-v2').map((key) => caches.delete(key))
  )).then(() => self.clients.claim()));
});

self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : { title: 'Masjid Al Nour', body: 'Nouvelle information' };
  event.waitUntil(self.registration.showNotification(data.title || 'Mosquée', {
    body: data.body || '',
    icon: data.icon || '/icon.svg',
    badge: data.badge || '/icon.svg',
    data: data.data || {},
  }));
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  // Les pages et les fichiers de l'application sont prioritaires depuis le réseau :
  // une correction responsive est visible dès le rechargement.
  event.respondWith(fetch(event.request).then((response) => {
    if (event.request.url.startsWith(self.location.origin) && response.ok) {
      const copy = response.clone();
      void caches.open('masjid-al-nour-v2').then((cache) => cache.put(event.request, copy));
    }
    return response;
  }).catch(() => caches.match(event.request).then((cached) => cached || Response.error())));
});
