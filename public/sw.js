// K-Uniformes service worker.
// Intentionally conservative: this is an authenticated app, so we NEVER cache
// HTML/navigation responses or server-action POSTs (that could leak stale
// logged-in/out pages). We only cache-first immutable, content-hashed static
// assets. The fetch handler exists mainly to make the app installable (PWA).
const CACHE = "kuniformes-static-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Web Push: v1 sends no payload (a "tickle"), so we show a fixed message.
// `event.data` may be present in a future v2 with an encrypted payload.
self.addEventListener("push", (event) => {
  let title = "K-Uniformes";
  let body = "Se registró una nueva venta.";
  let url = "/ventas";
  if (event.data) {
    try {
      const data = event.data.json();
      title = data.title || title;
      body = data.body || body;
      url = data.url || url;
    } catch {
      const text = event.data.text();
      if (text) body = text;
    }
  }
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url },
      tag: "kuniformes-venta",
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/ventas";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(target).catch(() => {});
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // never touch server actions / mutations

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const isImmutable =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/assets/");

  if (!isImmutable) return; // default network handling for dynamic/auth content

  event.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(req).then(
        (cached) =>
          cached ||
          fetch(req).then((res) => {
            if (res && res.status === 200 && res.type === "basic") {
              cache.put(req, res.clone());
            }
            return res;
          })
      )
    )
  );
});
