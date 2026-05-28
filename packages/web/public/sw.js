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

function cacheCopy(req, res) {
  if (res && res.ok && res.status === 200) {
    const copy = res.clone();
    caches.open(SHELL_CACHE).then((cache) => cache.put(req, copy));
  }
  return res;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Never cache API responses — the local daemon is the source of truth.
  if (url.pathname.startsWith("/api/")) return;

  // Built bundles under /assets/ are content-hashed → immutable. Cache-FIRST so
  // the JS/CSS shell is reliably served from cache (offline-capable after one
  // load); fall to the network + cache on a miss. This is what makes the app —
  // not just the HTML — work offline (the precache can't name hashed files).
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches
        .match(req)
        .then((hit) => hit ?? fetch(req).then((res) => cacheCopy(req, res))),
    );
    return;
  }

  // HTML / shell: network-first with cache fallback (so the app updates when
  // online, and the installed app still opens when the daemon isn't running).
  event.respondWith(
    fetch(req)
      .then((res) => cacheCopy(req, res))
      .catch(() =>
        caches.match(req).then((hit) => hit ?? caches.match("/index.html")),
      ),
  );
});
