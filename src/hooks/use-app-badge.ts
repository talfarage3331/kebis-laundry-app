/**
 * useAppBadge — listens to a Firestore unread counter and updates the
 * PWA application icon badge in real time. Call clearAppBadgeAndUnread()
 * when the user views the notifications/chat to reset the badge.
 *
 * Data model:
 *   users/{uid}.unreadCount  (number) — incremented server-side on every
 *   push notification, reset to 0 by clearAppBadgeAndUnread().
 */
import { useEffect } from "react";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot, setDoc } from "firebase/firestore";

function setBadge(count: number) {
  if (typeof navigator === "undefined") return;
  const nav: any = navigator;
  if (count > 0) {
    if (typeof nav.setAppBadge === "function") nav.setAppBadge(count).catch(() => {});
  } else {
    if (typeof nav.clearAppBadge === "function") nav.clearAppBadge().catch(() => {});
  }
}

export function useAppBadge() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    let unsubSnap: (() => void) | null = null;

    // Wait for auth to restore — auth.currentUser is null on first paint,
    // which previously meant the listener never attached.
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      if (unsubSnap) {
        unsubSnap();
        unsubSnap = null;
      }
      if (!u) {
        setBadge(0);
        return;
      }
      const ref = doc(db, "users", u.uid);
      unsubSnap = onSnapshot(
        ref,
        (snap) => {
          const count = Number((snap.data() as any)?.unreadCount ?? 0);
          setBadge(Number.isFinite(count) && count > 0 ? count : 0);
        },
        (err) => console.warn("[badge] unreadCount listener error:", err)
      );
    });

    return () => {
      unsubAuth();
      if (unsubSnap) unsubSnap();
    };
  }, []);
}

export async function clearAppBadgeAndUnread() {
  setBadge(0);
  const u = auth.currentUser;
  if (!u) return;
  try {
    await setDoc(doc(db, "users", u.uid), { unreadCount: 0 }, { merge: true });
  } catch (err) {
    console.warn("[badge] clear unread failed:", err);
  }
}
