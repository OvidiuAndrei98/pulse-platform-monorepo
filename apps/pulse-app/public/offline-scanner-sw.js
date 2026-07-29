const CACHE_NAME = "glow-offline-scanner-v3";
const SCANNER_ROUTE = "/dashboard/ticket-validation";

async function putInCache(request, response) {
  if (!response || !response.ok) return response;
  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response.clone());
  return response;
}

async function fetchAndCache(request) {
  const response = await fetch(request);
  return putInCache(request, response);
}

async function cacheScannerShell(assets) {
  const cache = await caches.open(CACHE_NAME);
  const requests = [SCANNER_ROUTE, "/manifest.json", ...assets];
  await Promise.allSettled(
    requests.map(async (request) => {
      const response = await fetch(request, { cache: "reload" });
      if (response.ok) await cache.put(request, response);
    }),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(async (keys) => {
      await Promise.all(
        keys
          .filter((key) => key.startsWith("glow-offline-scanner-") && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    }),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "PREPARE_OFFLINE_SCANNER") return;
  const assets = Array.isArray(event.data.assets)
    ? event.data.assets.filter((asset) => {
        try {
          const url = new URL(asset, self.location.origin);
          return url.origin === self.location.origin && url.pathname.startsWith("/_next/");
        } catch {
          return false;
        }
      })
    : [];
  event.waitUntil(cacheScannerShell(assets));
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  const isScannerPage = url.pathname === SCANNER_ROUTE;
  const isNextAsset = url.pathname.startsWith("/_next/");
  const isManifest = url.pathname === "/manifest.json";
  if (!isScannerPage && !isNextAsset && !isManifest) return;

  if (request.mode === "navigate" && isScannerPage) {
    const refresh = fetchAndCache(request).catch(() => undefined);
    event.waitUntil(refresh);
    event.respondWith(
      caches.match(SCANNER_ROUTE).then(async (cached) =>
        cached || await refresh || await caches.match(SCANNER_ROUTE) || Response.error(),
      ),
    );
    return;
  }

  if (isNextAsset || isManifest) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetchAndCache(request).catch(() => Response.error())),
    );
  }
});
