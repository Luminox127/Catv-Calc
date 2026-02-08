const CACHE = "catvcalc-v7"; // bump this if you ever want to force-refresh everyone's cache

const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => (k !== CACHE ? caches.delete(k) : Promise.resolve())));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req);
      if (cached) return cached;

      try {
        const fresh = await fetch(req);
        // Cache GET only
        if (req.method === "GET" && fresh && fresh.status === 200) {
          cache.put(req, fresh.clone());
        }
        return fresh;
      } catch (e) {
        // Offline fallback
        const fallback = await cache.match("./index.html");
        return fallback || new Response("Offline", { status: 200 });
      }
    })()
  );
});
