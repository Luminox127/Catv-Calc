// Bump VERSION anytime you change app.js / style.css / index.html
const VERSION = "vA1.0.0";
const CACHE = `catv-calc-${VERSION}`;

const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => (k === CACHE ? null : caches.delete(k))));
    await self.clients.claim();
  })());
});

// Network-first for core files so updates show quickly
function isCore(url){
  return (
    url.pathname.endsWith("/index.html") ||
    url.pathname.endsWith("/app.js") ||
    url.pathname.endsWith("/style.css") ||
    url.pathname.endsWith("/sw.js") ||
    url.pathname.endsWith("/manifest.json")
  );
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (isCore(url)) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(event.request, { cache: "no-store" });
        const cache = await caches.open(CACHE);
        cache.put(event.request, fresh.clone());
        return fresh;
      } catch (e) {
        const cached = await caches.match(event.request);
        return cached || caches.match("./index.html");
      }
    })());
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
