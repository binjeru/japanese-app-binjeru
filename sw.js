"use strict";
// Service Worker: holt jede Datei der App zuerst frisch vom Server (der Browser-Zwischenspeicher wird
// umgangen, unveränderte Dateien kosten nur eine kurze Rückfrage). Damit genügt nach einem Update
// einfaches Neuladen. Die zuletzt geladenen Dateien bleiben als Reserve, falls kein Netz da ist.
// Fremde Adressen (GitHub-API, CDN) werden nicht angefasst.

const CACHE = "binjeru";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req.url, { cache: "no-cache", credentials: "same-origin" })
      .then(res => {
        if (res.ok) {
          const copy = res.clone();
          e.waitUntil(caches.open(CACHE).then(c => c.put(req.url, copy)));
        }
        return res;
      })
      .catch(() => caches.match(req.url).then(hit => hit || Response.error()))
  );
});
