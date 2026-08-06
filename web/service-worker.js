/* Service Worker – macht die App installierbar und offline-fähig.

   VERSION wird beim Veröffentlichen automatisch durch den Commit-Kürzel ersetzt (siehe
   .github/workflows/deploy.yml). Dadurch ändert sich diese Datei bei JEDER neuen Version, das
   Handy erkennt die Aktualisierung von selbst und lädt sie – früher musste die Zahl von Hand
   erhöht werden, und genau das wurde einmal vergessen: die App blieb dann für immer auf der
   alten Fassung stehen, egal wie oft man sie neu startete. */
var VERSION = "__VERSION__";
var CACHE = "ytz-" + VERSION;
var ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

/* Die App fragt nach der laufenden Version (für die Anzeige in den Einstellungen). */
self.addEventListener("message", function (e) {
  if (e.data === "version" && e.source) e.source.postMessage({ version: VERSION });
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);

  // Navigationen (auch das Teilen-Ziel "./?url=…"): zuerst das Netz fragen, damit eine neue
  // Version sofort ankommt; ohne Netz kommt die gespeicherte Fassung.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put("./index.html", copy); });
        return res;
      }).catch(function () {
        return caches.match("./index.html").then(function (c) { return c || Response.error(); });
      })
    );
    return;
  }

  // Externe Aufrufe (Apps Script, YouTube-Thumbnails, Sprachausgabe) nicht abfangen.
  if (url.origin !== location.origin) return;

  e.respondWith(
    caches.match(req).then(function (cached) {
      return cached || fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
        return res;
      }).catch(function () { return cached; });
    })
  );
});
