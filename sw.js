// HAVAKARE — servis worker: tekrar ziyaretlerde model/JS/CSS/görseller internetsiz anında açılır.
// Videolar (Cloudinary, range istekleri) bilerek önbelleğe alınmaz.
const VERSION = '20261028-2306';
const CACHE = 'havakare-' + VERSION;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('havakare-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Sayfa, kendi indirdiği (HTTP önbelleğindeki) dosyaların listesini gönderir; fazladan indirme olmaz.
self.addEventListener('message', (e) => {
  if (!e.data || e.data.type !== 'precache') return;
  e.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.all((e.data.urls || []).map((u) => cache.match(u).then((hit) => hit || cache.add(u).catch(() => {}))))
    )
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Cloudinary, fontlar vb. dokunulmaz
  if (req.headers.has('range')) return;

  // Sayfa: önce ağ (güncel kalsın), olmazsa önbellek
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
    );
    return;
  }

  // Statik dosyalar: önce önbellek, yoksa ağ. Her deploy'da CACHE adı değiştiği için eski içerik
  // kalmaz; arka planda "yenileme" isteği ATILMAZ (yavaş hatta gereksiz gidiş-dönüş yapmaz).
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }))
  );
});
