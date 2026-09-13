/* Service Worker – macht die App installierbar und offline-fähig.

   VERSION wird beim Veröffentlichen automatisch durch den Commit-Kürzel ersetzt (siehe
   .github/workflows/deploy.yml). Dadurch ändert sich diese Datei bei JEDER neuen Version, das
   Handy erkennt die Aktualisierung von selbst und lädt sie – früher musste die Zahl von Hand
   erhöht werden, und genau das wurde einmal vergessen: die App blieb dann für immer auf der
   alten Fassung stehen, egal wie oft man sie neu startete. */
var VERSION = "__VERSION__";
var CACHE = "ytz-" + VERSION;
/* Eigener, versionsunabhaengiger Speicher fuer Daten (Zugang, Gesehen-Stand). Der Asset-Cache
   wird bei jeder Veroeffentlichung geleert – diese Daten sollen das ueberleben. */
var DATEN = "ytz-daten";
var ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png"
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
      return Promise.all(keys.filter(function (k) { return k !== CACHE && k !== DATEN; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

/* Die App fragt nach der laufenden Version (für die Anzeige in den Einstellungen) und
   hinterlegt die Zugangsdaten für den Hintergrund-Abgleich. */
self.addEventListener("message", function (e) {
  var d = e.data;
  if (d === "version" && e.source) { e.source.postMessage({ version: VERSION }); return; }
  if (d && d.typ === "zugang" && d.endpoint && d.secret) {
    e.waitUntil(zugangSpeichern({ endpoint: d.endpoint, secret: d.secret }));
  }
});

/* Zugangsdaten liegen im Cache-Speicher: der Service Worker wird zwischen zwei Aufrufen
   beendet, ein einfaches Feld im Arbeitsspeicher wäre danach leer. */
function zugangSpeichern(z) {
  return caches.open(DATEN).then(function (c) {
    return c.put("zsf-zugang", new Response(JSON.stringify(z), { headers: { "Content-Type": "application/json" } }));
  });
}
function zugangLesen() {
  return caches.match("zsf-zugang").then(function (r) { return r ? r.json() : null; }).catch(function () { return null; });
}

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);

  // Navigationen (auch das Teilen-Ziel "./?url=…"): die gespeicherte Fassung SOFORT ausliefern
  // und parallel im Hintergrund die neue holen ("stale-while-revalidate"). Vorher wartete der
  // Start jedes Mal auf GitHub Pages – bei mäßigem Netz sind das mehrere Sekunden vor dem
  // ersten Bild. Die frische Fassung übernimmt beim nächsten Start (bzw. sofort, sobald der
  // neue Service Worker aktiv wird).
  if (req.mode === "navigate") {
    e.respondWith(
      caches.match("./index.html").then(function (cached) {
        var netz = fetch(req).then(function (res) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put("./index.html", copy); });
          return res;
        }).catch(function () { return cached || Response.error(); });
        if (cached) { e.waitUntil(netz.catch(function () {})); return cached; }
        return netz;
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

/* Tippen auf eine Benachrichtigung – ohne diesen Teil schliesst Android nur das
   Benachrichtigungscenter: die Meldung blieb stehen und die App kam nie nach vorn.
   Jetzt wird die Meldung geschlossen, ein bereits offenes Fenster nach vorn geholt und ihm
   gesagt, welcher Eintrag gemeint war; laeuft die App nicht, wird sie direkt dort geoeffnet. */
self.addEventListener("notificationclick", function (e) {
  var d = (e.notification && e.notification.data) || {};
  e.notification.close();
  var ziel = "./?open=" + encodeURIComponent((d.kind || "yt") + ":" + (d.id || ""));
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if (String(c.url).indexOf(self.registration.scope) === 0) {
          if (d.id) { try { c.postMessage({ open: d.id, kind: d.kind }); } catch (err) {} }
          return c.focus ? c.focus() : undefined;
        }
      }
      return self.clients.openWindow(ziel);
    })
  );
});

/* ------------------------- Hintergrund-Abgleich ---------------------------
   Chrome weckt installierte PWAs in Ruhephasen kurz auf. Dann sieht die App nach, ob
   Zusammenfassungen fertig geworden sind, und meldet sie – auch wenn die App geschlossen ist.
   Vorher kam eine Meldung nur, solange die App offen war.
   (Echtes Web-Push wäre zuverlässiger, setzt aber einen Server voraus, der VAPID-Anfragen
   signieren kann – Apps Script kann das nicht.) */
self.addEventListener("periodicsync", function (e) {
  if (e.tag !== "zsf-check") return;
  e.waitUntil(pruefeFertige());
});
self.addEventListener("sync", function (e) {
  if (e.tag !== "zsf-check") return;
  e.waitUntil(pruefeFertige());
});

function gesehenLesen() {
  return caches.match("zsf-gesehen").then(function (r) { return r ? r.json() : {}; }).catch(function () { return {}; });
}
function gesehenSchreiben(o) {
  return caches.open(DATEN).then(function (c) {
    return c.put("zsf-gesehen", new Response(JSON.stringify(o), { headers: { "Content-Type": "application/json" } }));
  });
}

function pruefeFertige() {
  return zugangLesen().then(function (z) {
    if (!z) return;
    return gesehenLesen().then(function (gesehen) {
      var arten = ["yt", "news", "mail"];
      return Promise.all(arten.map(function (k) {
        var url = z.endpoint + (z.endpoint.indexOf("?") > -1 ? "&" : "?") +
          "action=list&light=1&kind=" + k + "&token=" + encodeURIComponent(z.secret);
        return fetch(url).then(function (r) { return r.json(); }).then(function (j) {
          if (!j || !j.ok) return;
          (j.entries || []).forEach(function (en) {
            var s = k + ":" + en.id;
            if (en.status === "done" && gesehen[s] && gesehen[s] !== "done") {
              self.registration.showNotification("✅ " + (en.title || "Zusammenfassung fertig"), {
                body: "Die Zusammenfassung ist fertig.",
                icon: "icons/icon-192.png", badge: "icons/icon-192.png",
                tag: "zsf-" + en.id, renotify: true, data: { id: String(en.id), kind: k }
              });
            }
            gesehen[s] = en.status;
          });
        }).catch(function () {});
      })).then(function () {
        // Speicher begrenzen: nur die jüngsten Einträge behalten
        var keys = Object.keys(gesehen);
        if (keys.length > 600) {
          keys.slice(0, keys.length - 400).forEach(function (x) { delete gesehen[x]; });
        }
        return gesehenSchreiben(gesehen);
      });
    });
  }).catch(function () {});
}
