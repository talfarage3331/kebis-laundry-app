// ============================================================
// Kebisa Laundry App — Service Worker
// File: public/sw.js
// ============================================================
// This service worker handles:
//   1. Installation & activation (cache management)
//   2. Push events → native OS notifications (Hebrew text)
//   3. notificationclick → open/focus the app
// ============================================================

const APP_CACHE = "kebisa-v2";
const OFFLINE_URL = "/";

// ─── Install ────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  console.log("[Service Worker] Install event triggered");
  self.skipWaiting(); // Call immediately
  event.waitUntil(
    caches
      .open(APP_CACHE)
      .then((cache) => {
        return cache.addAll([OFFLINE_URL]).catch((err) => {
          console.warn("[Service Worker] Offline cache addAll failed, continuing anyway:", err);
        });
      })
  );
});

// ─── Activate ───────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  console.log("[Service Worker] Activate event triggered");
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
      .then(() => {
        console.log("[Service Worker] clients.claim() called");
        return self.clients.claim();
      })
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
//
// iOS/Safari strict requirements:
//   • self.registration.showNotification() MUST be called inside
//     event.waitUntil() — the SW is killed the moment the Promise
//     returned to waitUntil() settles.
//   • Any uncaught exception before showNotification() is called
//     silently drops the notification.
//   • 'actions' and 'requireInteraction' are not supported on iOS
//     and must be omitted.
//   • navigator.setAppBadge is NOT available in SW scope (use
//     self.navigator with a guard).
//
// Expected push payload (JSON from server):
// {
//   "title":      "הכביסה מוכנה ✨",
//   "body":       "ההזמנה שלך מוכנה לאיסוף",
//   "icon":       "/icon-192.png",
//   "badge":      "/icon-192.png",   ← URL string (not a number)
//   "badgeCount": 2,                 ← numeric, for App Badging API
//   "tag":        "order-status",
//   "url":        "/tracking"
// }

self.addEventListener("push", (event) => {
  // ── Step 1: Parse payload with full defensive fallbacks ──────
  const FALLBACK = {
    title:      "עדכון מקביסה 🧺",
    body:       "יש עדכון חדש בהזמנה שלך",
    icon:       "/icon-192.png",
    badge:      "/icon-192.png",
    badgeCount: 1,
    tag:        "kebisa-general",
    url:        "/",
  };

  let data = { ...FALLBACK };

  try {
    if (event.data) {
      let parsed = null;

      // Try JSON first (expected path)
      try {
        parsed = event.data.json();
      } catch (_jsonErr) {
        // Not JSON — treat raw text as the notification body
        const rawText = event.data.text();
        if (rawText && rawText.trim().length > 0) {
          parsed = { body: rawText.trim() };
        }
      }

      if (parsed && typeof parsed === "object") {
        // Merge only defined, non-null fields
        for (const key of Object.keys(parsed)) {
          if (parsed[key] !== null && parsed[key] !== undefined) {
            data[key] = parsed[key];
          }
        }
      }
    }
  } catch (parseErr) {
    // Last-resort: payload extraction itself failed — use FALLBACK
    console.error("[SW] Push payload extraction failed:", parseErr);
    data = { ...FALLBACK };
  }

  // ── Step 2: Sanitise badge — must always be an image URL ─────
  // The server may send badgeCount as a number for the App Badging API.
  // The showNotification 'badge' field MUST be an image URL string.
  const badgeUrl =
    typeof data.badge === "string" && data.badge.startsWith("/")
      ? data.badge
      : "/icon-192.png";

  const badgeCount =
    typeof data.badgeCount === "number" && data.badgeCount > 0
      ? data.badgeCount
      : 1;

  // ── Step 3: Build notification options (iOS-safe) ─────────────
  // 'actions' and 'requireInteraction' are deliberately omitted —
  // Safari/WebKit silently drops notifications whose options object
  // contains unsupported keys on some versions.
  const notificationOptions = {
    body:    data.body  || FALLBACK.body,
    icon:    data.icon  || "/icon-192.png",
    badge:   badgeUrl,
    tag:     data.tag   || FALLBACK.tag,
    dir:     "rtl",
    lang:    "he",
    vibrate: [100, 50, 100, 50, 200],
    // Store the target URL for the notificationclick handler
    data:    { url: data.url || "/" },
  };

  // ── Step 4: Show notification inside event.waitUntil ──────────
  // This is the ONLY thing in waitUntil. The SW cannot terminate
  // until this Promise resolves, guaranteeing iOS sees the call.
  event.waitUntil(
    self.registration
      .showNotification(data.title || FALLBACK.title, notificationOptions)
      .then(() => {
        // App Badging API — self.navigator guard required in SW scope
        const nav = self.navigator;
        if (nav && typeof nav.setAppBadge === "function") {
          return nav.setAppBadge(badgeCount).catch((err) => {
            console.warn("[SW] setAppBadge failed (non-fatal):", err);
          });
        }
      })
      .catch((err) => {
        // showNotification itself failed — log but do NOT re-throw
        // (re-throwing here would cause the browser to log an
        //  "unhandled push event" error and suppress future pushes)
        console.error("[SW] showNotification failed:", err);
      })
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
