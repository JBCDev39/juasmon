// Service worker de JUASmon: guarda el juego en el teléfono para que
// abra rápido y se pueda jugar sin internet (1 jugador, multijugador local, rosco).
// Al publicar una versión nueva, cambia VERSION para que los teléfonos la descarguen.
const VERSION = 'juasmon-v7';
const SHELL = [
  './', './index.html', './manifest.webmanifest',
  './js/ui.js', './js/engine.js', './js/preguntas.js', './js/rosco.js', './js/util.js', './js/nube.js', './js/firebase-config.js',
  './data/pokemon.json', './data/preguntas.json', './data/historia.json', './data/mundo.json', './data/pokedex.json', './data/rosco.json', './data/extra.json',
  './icons/icon-192.png', './icons/icon-512.png', './icons/favicon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Firebase y sus servicios siempre van directo a internet.
  if (/googleapis\.com$|firebaseio\.com$|gstatic\.com$/.test(url.hostname) && !url.hostname.startsWith('fonts.')) return;
  // Fuentes de Google: se guardan la primera vez.
  if (url.hostname.startsWith('fonts.')) {
    e.respondWith(caches.open(VERSION).then(async c => (await c.match(req)) || fetch(req).then(r => { c.put(req, r.clone()); return r; })));
    return;
  }
  if (url.origin !== location.origin) return;
  // Archivos del juego: primero lo guardado; de fondo se busca la versión nueva.
  e.respondWith(caches.open(VERSION).then(async c => {
    const hit = await c.match(req, { ignoreSearch: true });
    const net = fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});
