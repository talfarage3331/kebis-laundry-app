/**
 * Client-side Firebase Cloud Messaging (FCM) helpers.
 * Only imported in the browser — guarded with isSupported().
 */
import { getMessaging, getToken, onMessage, isSupported, type Messaging } from "firebase/messaging";
import { initializeApp, getApps, getApp } from "firebase/app";

// Same config as src/lib/firebase.ts — duplicated so messaging can be
// initialized lazily on the client without a circular module load.
const firebaseConfig = {
  apiKey: "AIzaSyBTFvdeLDkWKfUrNWCe7wWMk9VNzxwP8Ss",
  authDomain: "kevisa-5983b.firebaseapp.com",
  projectId: "kevisa-5983b",
  storageBucket: "kevisa-5983b.firebasestorage.app",
  messagingSenderId: "1009737796478",
  appId: "1:1009737796478:web:d55807a14c66ae901bc12f",
};

/**
 * ⚠️  YOU MUST REPLACE THIS WITH YOUR FCM WEB PUSH CERTIFICATE KEY ⚠️
 *
 * Firebase Console → Project Settings → Cloud Messaging tab →
 * "Web configuration" → "Web Push certificates" → Generate key pair
 * (or copy the existing key). It looks like:
 *   BLe...80-character-base64url-string...XYZ
 *
 * It's a PUBLIC key — safe to commit. Without it getToken() throws.
 */
export const FCM_VAPID_PUBLIC_KEY = "REPLACE_WITH_YOUR_FCM_WEB_PUSH_CERTIFICATE_KEY";

let messagingInstance: Messaging | null = null;

export async function getMessagingIfSupported(): Promise<Messaging | null> {
  if (typeof window === "undefined") return null;
  if (messagingInstance) return messagingInstance;
  try {
    const supported = await isSupported();
    if (!supported) return null;
    const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    messagingInstance = getMessaging(app);
    return messagingInstance;
  } catch (err) {
    console.warn("[fcm] getMessaging failed:", err);
    return null;
  }
}

export async function registerFcmServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.register("/firebase-messaging-sw.js", {
      scope: "/firebase-cloud-messaging-push-scope",
    });
    await navigator.serviceWorker.ready;
    return reg;
  } catch (err) {
    console.error("[fcm] SW registration failed:", err);
    return null;
  }
}

export async function requestFcmToken(): Promise<string | null> {
  const messaging = await getMessagingIfSupported();
  if (!messaging) return null;
  if (!FCM_VAPID_PUBLIC_KEY || FCM_VAPID_PUBLIC_KEY.startsWith("REPLACE_WITH")) {
    console.error("[fcm] FCM_VAPID_PUBLIC_KEY is not set in src/lib/firebase-messaging.ts");
    return null;
  }
  const reg = await registerFcmServiceWorker();
  if (!reg) return null;
  try {
    const token = await getToken(messaging, {
      vapidKey: FCM_VAPID_PUBLIC_KEY,
      serviceWorkerRegistration: reg,
    });
    return token || null;
  } catch (err) {
    console.error("[fcm] getToken failed:", err);
    return null;
  }
}

export async function onForegroundMessage(handler: (payload: any) => void) {
  const messaging = await getMessagingIfSupported();
  if (!messaging) return () => {};
  return onMessage(messaging, handler);
}
