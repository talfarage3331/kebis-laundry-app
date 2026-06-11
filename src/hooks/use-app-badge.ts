/**
 * useAppBadge — listens to a Firestore unread counter and updates the
 * PWA application icon badge in real time. Call clear() when the user
 * views the notifications/chat to reset the badge.
 *
 * Data model:
 *   users/{uid}.unreadCount  (number)
 *
 * Anything in your app that increases unread items should bump that
 * field (or, for chat, count unread messages on snapshot).
 */
import { useEffect } from "react";
import { auth, db } from "@/lib/firebase";
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
    const u = auth.currentUser;
    if (!u) return;
    const ref = doc(db, "users", u.uid);
    const unsub = onSnapshot(ref, (snap) => {
      const count = Number((snap.data() as any)?.unreadCount ?? 0);
      setBadge(count);
    });
    return () => unsub();
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
