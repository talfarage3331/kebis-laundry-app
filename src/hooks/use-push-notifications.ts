/**
 * usePushNotifications
 * ---------------------
 * Registers the service worker, requests notification permission,
 * and subscribes to the Push API.
 *
 * Returns:
 *  - supported:     boolean — is the Push API available in this browser?
 *  - permission:    NotificationPermission — "default" | "granted" | "denied"
 *  - subscription:  PushSubscription | null — send this object to your backend
 *  - isLoading:     boolean
 *  - error:         string | null
 *  - requestPermission(): async function — call this on a user gesture
 *
 * VAPID Public Key:
 *  Generate a key pair on your backend once with:
 *    npx web-push generate-vapid-keys
 *  Then set VITE_VAPID_PUBLIC_KEY in your .env file.
 */

import { useState, useEffect, useCallback, useRef } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PushStatus =
  | "idle"
  | "registering"
  | "requesting-permission"
  | "subscribing"
  | "subscribed"
  | "denied"
  | "unsupported"
  | "error";

export interface UsePushNotificationsReturn {
  /** Browser supports service workers + Push API */
  supported: boolean;
  /** Current Notification permission */
  permission: NotificationPermission;
  /** Active push subscription — POST this to your backend */
  subscription: PushSubscription | null;
  /** Current state of the registration/subscription flow */
  status: PushStatus;
  /** Human-readable error message, if any */
  error: string | null;
  /** Call this on a user gesture to request permission and subscribe */
  requestPermission: () => Promise<void>;
  /** Unsubscribe from push (and optionally notify backend) */
  unsubscribe: () => Promise<void>;
}

export interface UsePushNotificationsOptions {
  /** The authenticated user's email — required to store the subscription server-side */
  userEmail?: string;
}

// ─── Helper: Convert VAPID public key ─────────────────────────────────────────

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  try {
    const cleanString = base64String.trim().replace(/\s/g, "");
    const padding = "=".repeat((4 - (cleanString.length % 4)) % 4);
    const base64 = (cleanString + padding)
      .replace(/-/g, "+")
      .replace(/_/g, "/");
    const rawData = atob(base64);
    return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
  } catch (err) {
    const errorMsg = "VAPID key parsing failed: " + (err instanceof Error ? err.message : String(err));
    alert(errorMsg);
    throw new Error(errorMsg);
  }
}

// ─── Helper: Register service worker ──────────────────────────────────────────

async function registerServiceWorker(): Promise<ServiceWorkerRegistration> {
  if (!("serviceWorker" in navigator)) {
    throw new Error("Service workers are not supported in this browser.");
  }
  console.log("[usePushNotifications] Registering service worker /sw.js...");
  const registration = await navigator.serviceWorker.register("/sw.js", {
    scope: "/",
    updateViaCache: "none", // always check for SW updates
  });
  console.log("[usePushNotifications] Service worker registered. Scope:", registration.scope);
  
  // Wait until the SW is active (handles first load and updates)
  console.log("[usePushNotifications] Waiting for service worker to become active...");
  if (!registration.active) {
    console.log("[usePushNotifications] Active worker not found. Waiting on ready promise...");
    await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Service Worker activation timed out after 10s")), 10000)
      ),
    ]);
  }
  console.log("[usePushNotifications] Service worker is active and ready.");
  return registration;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function usePushNotifications(
  options: UsePushNotificationsOptions = {}
): UsePushNotificationsReturn {
  const { userEmail } = options;
  const supported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;

  const [permission, setPermission] = useState<NotificationPermission>(
    supported ? Notification.permission : "denied"
  );
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [status, setStatus] = useState<PushStatus>(
    supported ? "idle" : "unsupported"
  );
  const [error, setError] = useState<string | null>(null);

  // Cache the SW registration so we don't re-register on every call
  const swRegRef = useRef<ServiceWorkerRegistration | null>(null);

  // ── On mount: register SW & check for an existing subscription ──────────────
  useEffect(() => {
    if (!supported) return;

    let cancelled = false;

    (async () => {
      try {
        console.log("[usePushNotifications] Initializing Service Worker on mount...");
        setStatus("registering");
        const reg = await registerServiceWorker();
        if (cancelled) return;
        swRegRef.current = reg;

        // Check whether there's already an active subscription
        console.log("[usePushNotifications] Checking for active subscription on mount...");
        const existing = await reg.pushManager.getSubscription();
        if (cancelled) return;
        console.log("[usePushNotifications] Active subscription checked. Found:", !!existing);

        if (existing) {
          setSubscription(existing);
          setStatus("subscribed");
          setPermission(Notification.permission);
        } else {
          setStatus(
            Notification.permission === "denied" ? "denied" : "idle"
          );
          setPermission(Notification.permission);
        }
      } catch (err) {
        if (cancelled) return;
        const errMsg = err instanceof Error ? err.message : "Failed to register service worker.";
        console.error("[usePushNotifications] Error on mount:", err);
        setStatus("error");
        setError(errMsg);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported]);

  // ── requestPermission ────────────────────────────────────────────────────────
  const requestPermission = useCallback(async () => {
    try {
      console.log("[usePushNotifications] requestPermission triggered. status =", status, "supported =", supported);
      if (!supported) {
        throw new Error(
          "Push notifications are not supported in this browser. Diagnostics: serviceWorker=" +
            ("serviceWorker" in navigator) +
            ", PushManager=" +
            ("PushManager" in window) +
            ", Notification=" +
            ("Notification" in window)
        );
      }

      if (typeof Notification === "undefined") {
        throw new Error("Notification API is undefined in this browser/environment.");
      }

      if (status === "subscribed") {
        console.log("[usePushNotifications] Already subscribed. Skipping.");
        return;
      }

      setError(null);

      // 1. Request notification permission IMMEDIATELY to preserve the user gesture.
      // This is crucial for Safari / iOS 16.4+ standalone PWAs!
      console.log("[usePushNotifications] Requesting push permission...");
      setStatus("requesting-permission");
      const perm = await Notification.requestPermission();
      console.log("[usePushNotifications] Permission prompt result:", perm);
      setPermission(perm);

      if (perm !== "granted") {
        setStatus("denied");
        throw new Error("הרשאת ההתראות נדחתה. אפשר להפעיל בהגדרות הדפדפן.");
      }

      // 2. Register SW if not already done
      console.log("[usePushNotifications] Checking active registration...");
      setStatus("registering");
      let reg = swRegRef.current;
      if (!reg) {
        console.log("[usePushNotifications] Registering new service worker instance...");
        reg = await registerServiceWorker();
        swRegRef.current = reg;
      }
      console.log("[usePushNotifications] Service worker registration ready.");

      // 3. Subscribe to Push API
      console.log("[usePushNotifications] Subscribing to PushManager...");
      setStatus("subscribing");

      const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
      console.log("[usePushNotifications] VAPID Key status: present =", !!vapidPublicKey);
      if (!vapidPublicKey) {
        throw new Error(
          "VITE_VAPID_PUBLIC_KEY is not set. Add it to your .env file."
        );
      }

      const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
      console.log("[usePushNotifications] Subscribing with key: length =", applicationServerKey.length);

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey as any,
      });

      console.log("[usePushNotifications] Subscription succeeded. Endpoint:", sub.endpoint);
      setSubscription(sub);
      setStatus("subscribed");

      // 4. Send subscription to backend so it can trigger pushes
      console.log("[usePushNotifications] Sending subscription to server...");
      await sendSubscriptionToServer(sub, userEmail);
      console.log("[usePushNotifications] Subscription synced successfully.");
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("[usePushNotifications] Error enabling push:", err);
      
      // Temporary mobile alert for easy debugging as requested by the user
      alert("Push Error: " + errMsg);
      
      setStatus("error");
      setError(errMsg);
    }
  }, [supported, status, userEmail]);

  // Automatically sync / link subscription to user's email if it becomes available or changes
  useEffect(() => {
    if (supported && subscription && userEmail && userEmail.trim() !== "") {
      console.log("[usePushNotifications] Auto-syncing subscription for email:", userEmail);
      sendSubscriptionToServer(subscription, userEmail).catch((err) => {
        console.error("[usePushNotifications] Auto-sync subscription failed:", err);
      });
    }
  }, [subscription, userEmail, supported]);

  // ── unsubscribe ──────────────────────────────────────────────────────────────
  const unsubscribe = useCallback(async () => {
    if (!subscription) return;
    try {
      console.log("[usePushNotifications] Unsubscribing...");
      await subscription.unsubscribe();
      await removeSubscriptionFromServer(subscription);
      setSubscription(null);
      setStatus("idle");
      console.log("[usePushNotifications] Unsubscribed successfully.");
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      alert("Unsubscribe Error: " + errMsg);
      setError(errMsg);
    }
  }, [subscription]);

  return { supported, permission, subscription, status, error, requestPermission, unsubscribe };
}

// ─── Backend API helpers ──────────────────────────────────────────────────────
// These call your TanStack Start server-side API routes.
// Adjust the endpoints to match your actual backend routes.

async function sendSubscriptionToServer(
  sub: PushSubscription,
  userEmail?: string
): Promise<void> {
  const subJson = sub.toJSON();
  console.log("[usePushNotifications] Fetching /api/push/subscribe...");
  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint: subJson.endpoint,
      keys: subJson.keys,
      userEmail: userEmail ?? "",
    }),
  });
  if (!res.ok) {
    const errorText = await res.text().catch(() => "Could not read error payload");
    console.error("[usePushNotifications] Server subscription response failed:", res.status, errorText);
    throw new Error(`Backend rejected subscription (Status ${res.status}): ${errorText}`);
  }
  console.log("[usePushNotifications] Server subscription response OK.");
}

async function removeSubscriptionFromServer(sub: PushSubscription): Promise<void> {
  await fetch("/api/push/unsubscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  }).catch(() => {
    // Fire-and-forget — don't block the client-side unsubscription
  });
}
