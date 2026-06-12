/**
 * useFcm — request notification permission, get an FCM registration token,
 * and store it in Firestore under users/{uid}.fcmTokens (array).
 *
 * The token is saved whenever BOTH the token and the authenticated user
 * are available — fixing the race where auth restores after the token
 * was generated (which previously dropped the token silently).
 */
import { useCallback, useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, setDoc, arrayUnion, arrayRemove, serverTimestamp } from "firebase/firestore";
import { requestFcmToken, onForegroundMessage } from "@/lib/firebase-messaging";
import { toast } from "sonner";

export type FcmStatus = "idle" | "unsupported" | "denied" | "granted" | "loading" | "error";

async function persistToken(user: User, fcmToken: string) {
  try {
    await setDoc(
      doc(db, "users", user.uid),
      {
        fcmTokens: arrayUnion(fcmToken),
        fcmTokensUpdatedAt: serverTimestamp(),
        email: user.email,
      },
      { merge: true }
    );
    console.log("[useFcm] token saved to users/" + user.uid);
  } catch (err) {
    console.error("[useFcm] failed to save token to Firestore:", err);
  }
}

export function useFcm() {
  const [status, setStatus] = useState<FcmStatus>("idle");
  const [token, setToken] = useState<string | null>(null);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "default"
  );

  // Track auth state — auth.currentUser is null on first paint
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setAuthUser(u));
    return () => unsub();
  }, []);

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
      if (auth.currentUser) {
        await persistToken(auth.currentUser, fcmToken);
      }
      // If auth hasn't restored yet, the effect below saves it once it does.
      setStatus("granted");
      return fcmToken;
    } catch (err: any) {
      console.error("[useFcm] enable failed:", err);
      setStatus("error");
      return null;
    }
  }, []);

  // Save the token as soon as we have BOTH a token and a signed-in user
  useEffect(() => {
    if (token && authUser) {
      persistToken(authUser, token);
    }
  }, [token, authUser]);

  const disable = useCallback(async () => {
    if (!token) return;
    const u = auth.currentUser;
    if (u) {
      await setDoc(doc(db, "users", u.uid), { fcmTokens: arrayRemove(token) }, { merge: true });
    }
    setToken(null);
    setStatus("idle");
  }, [token]);

  // Auto-refresh token on login if permission was previously granted
  useEffect(() => {
    if (typeof Notification === "undefined") return;
    if (authUser && Notification.permission === "granted" && !token) {
      enable();
    }
  }, [enable, token, authUser]);

  return { status, token, permission, enable, disable };
}
