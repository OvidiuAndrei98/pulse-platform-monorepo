const CACHE_NAME = "glow-offline-scanner-v2";
const SCANNER_ROUTE = "/dashboard/ticket-validation";

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
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll([SCANNER_ROUTE, "/manifest.json", ...assets]).catch(() => undefined),
    ),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  const isScannerRequest =
    url.pathname === SCANNER_ROUTE ||
    url.pathname.startsWith("/_next/") ||
    url.pathname === "/manifest.json";
  if (!isScannerRequest) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === "navigate") return caches.match(SCANNER_ROUTE);
        return Response.error();
      }),
  );
});
