// ============================================================
// Kebisa Laundry App — Service Worker
// File: public/sw.js
// ============================================================
// This service worker handles:
//   1. Installation & activation (cache management)
//   2. Push events → native OS notifications (Hebrew text)
//   3. notificationclick → open/focus the app
// ============================================================

const APP_CACHE = "kebisa-v1";
const OFFLINE_URL = "/";

// ─── Install ────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(APP_CACHE)
      .then((cache) => cache.addAll([OFFLINE_URL]))
      .then(() => self.skipWaiting())
  );
});

// ─── Activate ───────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== APP_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ─── Fetch (network-first, cache fallback) ──────────────────
self.addEventListener("fetch", (event) => {
  // Only handle same-origin GET requests
  if (
    event.request.method !== "GET" ||
    !event.request.url.startsWith(self.location.origin)
  )
    return;

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
      .catch(() => caches.match(event.request).then((r) => r ?? caches.match(OFFLINE_URL)))
  );
});

// ─── Push Event ─────────────────────────────────────────────
// Expected push payload (JSON):
// {
//   "title": "הכביסה מוכנה",
//   "body": "ההזמנה שלך מוכנה לאיסוף!",
//   "icon": "/icon-192.png",
//   "badge": "/icon-192.png",
//   "tag": "order-status",        // optional – replaces previous same-tag notif
//   "url": "/"                    // optional – URL to open on click
// }
self.addEventListener("push", (event) => {
  let data = {
    title: "כביסה",
    body: "יש עדכון חדש",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: "kebisa-general",
    url: "/",
  };

  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch {
      data.body = event.data.text();
    }
  }

  const notificationOptions = {
    body: data.body,
    icon: data.icon,
    badge: data.badge,
    tag: data.tag,
    dir: "rtl",
    lang: "he",
    // Vibration pattern: short-short-long (pulse, pause, pulse, pause, buzz)
    vibrate: [100, 50, 100, 50, 200],
    // Keep notification on screen until user taps it
    requireInteraction: false,
    // Store the target URL so notificationclick can open it
    data: { url: data.url ?? "/" },
    actions: [
      {
        action: "open",
        title: "פתח",
      },
      {
        action: "dismiss",
        title: "סגור",
      },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(data.title, notificationOptions)
  );
});

// ─── Notification Click ─────────────────────────────────────
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  if (event.action === "dismiss") return;

  const targetUrl = (event.notification.data?.url) ?? "/";
  const absoluteUrl = new URL(targetUrl, self.location.origin).href;

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // If the app is already open, focus it and navigate
        for (const client of clientList) {
          if (client.url.startsWith(self.location.origin) && "focus" in client) {
            client.focus();
            if ("navigate" in client) {
              return client.navigate(absoluteUrl);
            }
            return;
          }
        }
        // Otherwise open a new window
        if (self.clients.openWindow) {
          return self.clients.openWindow(absoluteUrl);
        }
      })
  );
});

// ─── Push Subscription Change ───────────────────────────────
// Fires when the push service rotates the subscription (e.g. expiry).
// Re-subscribe and POST the new subscription to the backend.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    self.registration.pushManager
      .subscribe({
        userVisibleOnly: true,
        // The applicationServerKey will be re-read from the existing subscription
        applicationServerKey: event.oldSubscription?.options?.applicationServerKey,
      })
      .then((newSubscription) => {
        return fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newSubscription),
        });
      })
  );
});
