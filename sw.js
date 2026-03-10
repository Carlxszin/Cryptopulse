const CACHE_NAME = 'recargafast-v1';
const ASSETS = [
  'index.html',
  'manifest.json'
];

// Instala o Service Worker e armazena arquivos básicos em cache
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

// Responde às requisições
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((response) => {
      return response || fetch(e.request);
    })
  );
});
