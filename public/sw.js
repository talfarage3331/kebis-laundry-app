// ============================================================
// Kebisa Laundry App — Service Worker
// File: public/sw.js
// ============================================================
// This service worker handles:
//   1. Installation & activation (cache management)
//   2. Push events → native OS notifications (Hebrew text)
//   3. notificationclick → open/focus the app
// ============================================================

const APP_CACHE = "kebisa-v3"; // Bumped 2026-06-13 — forces stale-asset eviction on next SW install

const OFFLINE_URL = "/";

// ─── Install ────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  console.log("[Service Worker] Install event triggered");
  self.skipWaiting(); // Call immediately
  event.waitUntil(
    caches.open(APP_CACHE).then((cache) => {
      return cache.addAll([OFFLINE_URL]).catch((err) => {
        console.warn("[Service Worker] Offline cache addAll failed, continuing anyway:", err);
      });
    }),
  );
});

// ─── Activate ───────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  console.log("[Service Worker] Activate event triggered");
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== APP_CACHE).map((k) => caches.delete(k))))
      .then(() => {
        console.log("[Service Worker] clients.claim() called");
        return self.clients.claim();
      }),
  );
});

// ─── Fetch (network-first, cache fallback) ──────────────────
self.addEventListener("fetch", (event) => {
  // Only handle same-origin GET requests
  if (event.request.method !== "GET" || !event.request.url.startsWith(self.location.origin)) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful navigations for offline fallback
        if (response.ok && event.request.mode === "navigate") {
          const clone = response.clone();
          caches.open(APP_CACHE).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((r) => r ?? caches.match(OFFLINE_URL))),
  );
});

// ─── Push handling moved to /firebase-messaging-sw.js ──────────
// FCM owns push/notification rendering now; this worker only handles
// the app-shell cache + offline fallback above.
