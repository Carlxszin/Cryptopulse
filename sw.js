const CACHE_NAME = 'recargafast-v4'; // Incremente este número para forçar atualização
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/lucide@latest'
];

// Instalação: Salva arquivos no cache
self.addEventListener('install', (e) => {
  self.skipWaiting(); // Força o Service Worker a se tornar ativo imediatamente
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

// Ativação: Limpa caches antigos
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  return self.clients.claim(); // Assume o controle de todas as abas abertas
});

// Fetch: Responde com cache primeiro, depois busca na rede
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((response) => {
      return response || fetch(e.request);
    })
  );
});
