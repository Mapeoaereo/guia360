// Guía 360: service worker para usar la app sin internet.
// - La app (index.html, manifest, íconos) se guarda al instalar. Con señal se pide primero a la red (para recibir
//   actualizaciones) con un límite de 4 s; sin señal o con señal mala se usa la copia guardada.
// - OpenCV (motor de alineación, ~10 MB) se guarda en su propia caché la primera vez y después se sirve desde ahí.
const VERSION = 'b348c695600b';
const APP = 'guia360-app-' + VERSION;
const CV = 'guia360-opencv-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
const CV_HOSTS = ['cdn.jsdelivr.net', 'unpkg.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(APP).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('guia360-app-') && k !== APP).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
function timeout(ms) { return new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)); }
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (CV_HOSTS.includes(url.hostname) && url.pathname.includes('opencv')) {
    e.respondWith(caches.open(CV).then(async c => {
      const hit = await c.match(req.url); if (hit) return hit;
      const res = await fetch(req.url, { mode: 'cors' }); if (res.ok) c.put(req.url, res.clone()); return res;
    }));
    return;
  }
  if (url.origin !== self.location.origin) return;
  e.respondWith((async () => {
    const c = await caches.open(APP);
    try {
      const res = await Promise.race([fetch(req), timeout(4000)]);
      if (res && res.ok) c.put(req.mode === 'navigate' ? './index.html' : req, res.clone());
      return res;
    } catch (err) {
      const hit = await c.match(req.mode === 'navigate' ? './index.html' : req, { ignoreSearch: true });
      if (hit) return hit;
      throw err;
    }
  })());
});
