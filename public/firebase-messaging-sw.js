/* eslint-disable */
// Firebase Cloud Messaging service worker — handles background pushes
// when the PWA is not focused or fully closed.
//
// IMPORTANT: this file MUST live at /firebase-messaging-sw.js (the path
// the Firebase SDK looks up by default).

importScripts("https://www.gstatic.com/firebasejs/12.14.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.14.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyBTFvdeLDkWKfUrNWCe7wWMk9VNzxwP8Ss",
  authDomain: "kevisa-5983b.firebaseapp.com",
  projectId: "kevisa-5983b",
  storageBucket: "kevisa-5983b.firebasestorage.app",
  messagingSenderId: "1009737796478",
  appId: "1:1009737796478:web:d55807a14c66ae901bc12f",
});

const messaging = firebase.messaging();

// Background message handler — fires when the app is in the background
// or closed entirely. The notification "data" payload is used (NOT
// the "notification" payload) so we have full control over rendering.
messaging.onBackgroundMessage((payload) => {
  console.log("[firebase-messaging-sw] Background message:", payload);

  const data = payload.data || {};
  const title = data.title || "עדכון מקביסה 🧺";
  const body = data.body || "יש עדכון חדש בהזמנה שלך";
  const url = data.url || "/";
  const tag = data.tag || "kebisa-general";
  const badgeCount = Number(data.badgeCount) > 0 ? Number(data.badgeCount) : 1;

  // App Badging API — works in SW scope on supporting platforms
  if (self.navigator && typeof self.navigator.setAppBadge === "function") {
    self.navigator.setAppBadge(badgeCount).catch(() => {});
  }

  return self.registration.showNotification(title, {
    body,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag,
    dir: "rtl",
    lang: "he",
    vibrate: [100, 50, 100, 50, 200],
    data: { url },
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";
  const absoluteUrl = new URL(targetUrl, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          client.focus();
          if ("navigate" in client) return client.navigate(absoluteUrl);
          return;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(absoluteUrl);
    })
  );
});
