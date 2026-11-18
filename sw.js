// Generoitu: node tools/build-sw.js
// Välimuisti, jolla sovellus toimii ilman verkkoa. Uusi versio otetaan käyttöön seuraavalla avauksella.
const CACHE = 'kartat-c3e60036fcca';
const FILES = [
 "./",
 "index.html",
 "manifest.json",
 "css/app.css",
 "src/areas.js",
 "src/dungeon.js",
 "src/editor.js",
 "src/examples.js",
 "src/font.js",
 "src/generator.js",
 "src/main.js",
 "src/print.js",
 "src/renderer.js",
 "src/rlml.js",
 "src/tiles.js",
 "icons/apple-touch-icon.png",
 "icons/icon-192.png",
 "icons/icon-512.png",
 "icons/icon-maskable-512.png"
];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request)));
});
