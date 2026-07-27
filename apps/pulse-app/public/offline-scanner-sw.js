const CACHE_NAME = "glow-offline-scanner-v1";
const SCANNER_ROUTE = "/dashboard/ticket-validation";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "PREPARE_OFFLINE_SCANNER") return;
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll([SCANNER_ROUTE, "/manifest.json"]).catch(() => undefined),
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
