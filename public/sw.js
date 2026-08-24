const STATIC_CACHE = "tijra-static-v1";
const OPS_CACHE = "tijra-ops-v1";
const OPS_PATHS = new Set(["/sales", "/inventory/audit"]);

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith("tijra-") && ![STATIC_CACHE, OPS_CACHE].includes(key)).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

async function networkFirst(request) {
  const cache = await caches.open(OPS_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    const url = new URL(request.url);
    const fallback = await cache.match(url.pathname);
    if (fallback) return fallback;
    throw new Error("OFFLINE_PAGE_NOT_CACHED");
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname === "/favicon.ico") {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (OPS_PATHS.has(url.pathname)) {
    event.respondWith(networkFirst(request));
  }
});
