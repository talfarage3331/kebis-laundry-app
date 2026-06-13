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
import { doc, updateDoc, arrayUnion, arrayRemove, serverTimestamp } from "firebase/firestore";
import { requestFcmToken, onForegroundMessage } from "@/lib/firebase-messaging";
import { toast } from "sonner";
import { useLocation } from "@tanstack/react-router";

export type FcmStatus = "idle" | "unsupported" | "denied" | "granted" | "loading" | "error";

async function persistToken(user: User, fcmToken: string) {
  try {
    await updateDoc(
      doc(db, "users", user.uid),
      {
        fcmTokens: arrayUnion(fcmToken),
        fcmTokensUpdatedAt: serverTimestamp(),
        email: user.email,
      }
    );
    console.log("[useFcm] token saved to users/" + user.uid);
  } catch (err) {
    console.error("[useFcm] failed to save token to Firestore:", err);
  }
}

const setAppBadge = (count: number) => {
  if (typeof navigator === "undefined") return;
  const nav = navigator as Navigator & {
    setAppBadge?: (count: number) => Promise<void>;
  };
  if (typeof nav.setAppBadge === "function") {
    nav.setAppBadge(count).catch(() => {});
  }
};

const clearAppBadge = () => {
  if (typeof navigator === "undefined") return;
  const nav = navigator as Navigator & {
    clearAppBadge?: () => Promise<void>;
  };
  if (typeof nav.clearAppBadge === "function") {
    nav.clearAppBadge().catch(() => {});
  }
};

export function useFcm() {
  const [status, setStatus] = useState<FcmStatus>("idle");
  const [token, setToken] = useState<string | null>(null);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "default",
  );

  const { pathname } = useLocation();

  // Track auth state — auth.currentUser is null on first paint
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setAuthUser(u));
    return () => unsub();
  }, []);

  // Foreground messages → toast + app badge
  useEffect(() => {
    let unsub: (() => void) | undefined;
    (async () => {
      unsub = (await onForegroundMessage((payload) => {
        const title = payload?.data?.title || payload?.notification?.title || "התראה חדשה";
        const body = payload?.data?.body || payload?.notification?.body || "";
        toast(title, { description: body });

        // Foreground badging update
        const badgeVal =
          payload?.data?.badgeCount || payload?.data?.unreadCount || payload?.notification?.badge;
        if (badgeVal) {
          const count = Number(badgeVal);
          if (Number.isFinite(count) && count > 0) {
            setAppBadge(count);
          } else {
            clearAppBadge();
          }
        }
      })) as (() => void) | undefined;
    })();
    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, []);

  // Listen for focus/visibility/route changes to sync badge
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof navigator === "undefined" ||
      !("setAppBadge" in navigator)
    )
      return;

    const syncBadge = async () => {
      if (!authUser) {
        clearAppBadge();
        return;
      }

      try {
        const { getDoc, doc: fsDoc } = await import("firebase/firestore");
        const snap = await getDoc(fsDoc(db, "users", authUser.uid));
        if (snap.exists()) {
          const count = Number(snap.data()?.unreadCount ?? 0);
          if (Number.isFinite(count) && count > 0) {
            setAppBadge(count);
          } else {
            clearAppBadge();
          }
        }
      } catch (err) {
        console.warn("[useFcm] Failed to sync app badge on focus/change:", err);
      }
    };

    // Run on mount or path change
    syncBadge();

    const handleFocus = () => {
      syncBadge();
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleFocus);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleFocus);
    };
  }, [authUser, pathname]);

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
    } catch (err) {
      console.error("[useFcm] enable failed:", err);
      setStatus("error");
      return null;
    } finally {
      // Strict state reset: ensure the loading state is never left true/active
      setStatus((currentStatus) => (currentStatus === "loading" ? "error" : currentStatus));
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
      await updateDoc(doc(db, "users", u.uid), { fcmTokens: arrayRemove(token) });
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

  return {
    status,
    token,
    permission,
    enable,
    disable,
    isLoading: status === "loading",
    requestPermission: enable,
  };
}
