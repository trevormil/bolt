/* Vellum service worker (#38). Local-first PWA: the app shell installs once;
 * API calls always go to the network (localhost is the daemon — fresh data
 * matters more than offline). When the network fails for an HTML navigation,
 * fall back to the cached shell so the installed app opens to a usable view.
 *
 * Bump SHELL_CACHE on shell changes; old caches are pruned on activate. */
const SHELL_CACHE = "vellum-shell-v1";
const SHELL_ASSETS = ["/", "/index.html", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== SHELL_CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Never cache API responses — the local daemon is the source of truth.
  if (url.pathname.startsWith("/api/")) return;

  // App shell: network-first with cache fallback (so the installed app opens
  // even when the daemon isn't running yet).
  event.respondWith(
    fetch(req)
      .then((res) => {
        // Cache successful static responses for offline shell.
        if (res.ok && res.status === 200) {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then((hit) => hit ?? caches.match("/index.html")),
      ),
  );
});
