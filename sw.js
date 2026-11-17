// Service worker : l'application fonctionne sans réseau une fois ouverte une première fois.
// Changer VERSION à chaque livraison pour que les téléphones prennent la nouvelle version.
const VERSION = 'releves-poc-7';
const FICHIERS = [
  './', 'index.html', 'css/app.css', 'manifest.webmanifest',
  'js/app.js', 'js/avancement.js', 'js/config.js', 'js/db.js', 'js/donnees.js', 'js/exemple.js',
  'js/geo.js', 'js/images.js', 'js/metier.js', 'js/outils.js', 'js/rendu.js', 'js/synchro.js',
  'js/ui.js', 'js/visu.js',
  'icones/icone-180.png', 'icones/icone-192.png', 'icones/icone-512.png', 'icones/icone-masquable-512.png',
  'exemple/plan-poste-exemple.svg', 'exemple/plan-claix.jpg',
  'vendor/pdfjs/pdf.min.mjs', 'vendor/pdfjs/pdf.worker.min.mjs',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FICHIERS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((cles) => Promise.all(cles.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.includes('/api/')) return;
  // Cache d'abord (hors ligne), mise à jour en arrière-plan
  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const cle = e.request.mode === 'navigate' ? 'index.html' : e.request;
      const enCache = await cache.match(cle, { ignoreSearch: true });
      const reseau = fetch(e.request).then((r) => {
        if (r.ok && e.request.mode !== 'navigate') cache.put(e.request, r.clone());
        return r;
      }).catch(() => null);
      return enCache || (await reseau) || new Response('Hors ligne', { status: 503 });
    }),
  );
});
