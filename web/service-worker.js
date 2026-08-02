/* Service Worker – macht die App installierbar und offline-fähig.
   Bei jeder neuen App-Version die Zahl erhöhen (v2 -> v3 ...), damit Handys die Änderung laden. */
var CACHE = "ytz-v12";
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

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);

  // Navigationen (auch das Teilen-Ziel "./?url=…") immer mit der App-Shell beantworten.
  if (req.mode === "navigate") {
    e.respondWith(
      caches.match("./index.html").then(function (c) { return c || fetch(req); })
    );
    return;
  }

  // Externe Aufrufe (Apps Script, YouTube-Thumbnails) nicht abfangen.
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
