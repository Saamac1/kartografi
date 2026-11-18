// Kirjoittaa sw.js:n: sovelluksen tiedostolista ja versio niiden sisällöstä.
// Aja aina ennen julkaisua: node tools/build-sw.js
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = path.join(__dirname, '..');
const files = ['./', 'index.html', 'manifest.json', 'css/app.css',
  ...fs.readdirSync(path.join(root, 'src')).filter(f => f.endsWith('.js')).sort().map(f => 'src/' + f),
  ...fs.readdirSync(path.join(root, 'icons')).sort().map(f => 'icons/' + f)];
const h = crypto.createHash('sha256');
for (const f of files) if (f !== './') h.update(fs.readFileSync(path.join(root, f)));
const version = h.digest('hex').slice(0, 12);
fs.writeFileSync(path.join(root, 'sw.js'), `// Generoitu: node tools/build-sw.js
// Välimuisti, jolla sovellus toimii ilman verkkoa. Uusi versio otetaan käyttöön seuraavalla avauksella.
const CACHE = 'kartat-${version}';
const FILES = ${JSON.stringify(files, null, 1)};
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request)));
});
`);
console.log('sw.js', version, files.length, 'tiedostoa');
