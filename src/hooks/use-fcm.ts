/**
 * useFcm — request notification permission, get an FCM registration token,
 * and store it in Firestore under users/{uid}.fcmTokens (array).
 */
import { useCallback, useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { doc, setDoc, arrayUnion, arrayRemove, serverTimestamp } from "firebase/firestore";
import { requestFcmToken, onForegroundMessage } from "@/lib/firebase-messaging";
import { toast } from "sonner";

export type FcmStatus = "idle" | "unsupported" | "denied" | "granted" | "loading" | "error";

export function useFcm() {
  const [status, setStatus] = useState<FcmStatus>("idle");
  const [token, setToken] = useState<string | null>(null);
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "default"
  );

  // Foreground messages → toast
  useEffect(() => {
    let unsub: any;
    (async () => {
      unsub = await onForegroundMessage((payload) => {
        const title = payload?.data?.title || payload?.notification?.title || "התראה חדשה";
        const body = payload?.data?.body || payload?.notification?.body || "";
        toast(title, { description: body });
      });
    })();
    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, []);

  const enable = useCallback(async () => {
    if (typeof Notification === "undefined" || !("serviceWorker" in navigator)) {
      setStatus("unsupported");
      return null;
    }
    setStatus("loading");
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        setStatus("denied");
        return null;
      }
      const fcmToken = await requestFcmToken();
      if (!fcmToken) {
        setStatus("error");
        return null;
      }
      setToken(fcmToken);
      // Save under users/{uid}.fcmTokens
      const u = auth.currentUser;
      if (u) {
        await setDoc(
          doc(db, "users", u.uid),
          {
            fcmTokens: arrayUnion(fcmToken),
            fcmTokensUpdatedAt: serverTimestamp(),
            email: u.email,
          },
          { merge: true }
        );
      }
      setStatus("granted");
      return fcmToken;
    } catch (err: any) {
      console.error("[useFcm] enable failed:", err);
      setStatus("error");
      return null;
    }
  }, []);

  const disable = useCallback(async () => {
    if (!token) return;
    const u = auth.currentUser;
    if (u) {
      await setDoc(doc(db, "users", u.uid), { fcmTokens: arrayRemove(token) }, { merge: true });
    }
    setToken(null);
    setStatus("idle");
  }, [token]);

  // Auto-refresh token on login if previously granted
  useEffect(() => {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "granted" && !token) {
      enable();
    }
  }, [enable, token]);

  return { status, token, permission, enable, disable };
}
