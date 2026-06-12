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
export const FCM_VAPID_PUBLIC_KEY = "BMF5z1ekGHC08nZjh-IIwG0zklaM9MLzimhzgt28mfBIMvo_MaDwJZqD2mA4Ictm4EkfN4iRvJRoF7M-PY_hl1A";

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

async function waitForRegistrationActive(reg: ServiceWorkerRegistration): Promise<ServiceWorkerRegistration> {
  if (reg.active) {
    return reg;
  }
  
  const serviceWorker = reg.installing || reg.waiting;
  if (!serviceWorker) {
    return reg;
  }
  
  return new Promise<ServiceWorkerRegistration>((resolve) => {
    const stateChangeHandler = () => {
      if (serviceWorker.state === "activated" || reg.active) {
        serviceWorker.removeEventListener("statechange", stateChangeHandler);
        resolve(reg);
      }
    };
    serviceWorker.addEventListener("statechange", stateChangeHandler);
  });
}

export async function registerFcmServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.register("/firebase-messaging-sw.js", {
      scope: "/firebase-cloud-messaging-push-scope",
    });
    
    // Wrap custom service worker readiness check with a strict 5-second timeout
    await Promise.race([
      waitForRegistrationActive(reg),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error("FCM_SW_READY_TIMEOUT")), 5000)
      )
    ]);
    
    return reg;
  } catch (err: any) {
    console.error("[fcm] SW registration or readiness check failed:", err);
    if (err?.message === "FCM_SW_READY_TIMEOUT") {
      window.alert("Stuck waiting for Service Worker (timed out after 5 seconds)");
    } else {
      window.alert(`Service Worker registration failed: ${err?.message || err}`);
    }
    throw err;
  }
}

export async function requestFcmToken(): Promise<string | null> {
  const messaging = await getMessagingIfSupported();
  if (!messaging) return null;
  
  // Validate VAPID Key: Ensure VAPID key is properly loaded and not empty/placeholder
  if (!FCM_VAPID_PUBLIC_KEY || FCM_VAPID_PUBLIC_KEY.startsWith("REPLACE_WITH")) {
    const errMsg = "[fcm] FCM_VAPID_PUBLIC_KEY is not set or invalid in src/lib/firebase-messaging.ts";
    console.error(errMsg);
    window.alert(errMsg);
    return null;
  }
  
  try {
    const reg = await registerFcmServiceWorker();
    if (!reg) return null;

    // Wrap getToken() call with a strict 5-second timeout
    const token = await Promise.race([
      getToken(messaging, {
        vapidKey: FCM_VAPID_PUBLIC_KEY,
        serviceWorkerRegistration: reg,
      }),
      new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error("FCM_REGISTRATION_TIMEOUT")), 5000)
      )
    ]);
    
    return token || null;
  } catch (err: any) {
    console.error("[fcm] requestFcmToken failed:", err);
    if (err?.message === "FCM_REGISTRATION_TIMEOUT") {
      window.alert("Stuck fetching FCM Token (timed out after 5 seconds)");
    }
    throw err;
  }
}

export async function onForegroundMessage(handler: (payload: any) => void) {
  const messaging = await getMessagingIfSupported();
  if (!messaging) return () => {};
  return onMessage(messaging, handler);
}
