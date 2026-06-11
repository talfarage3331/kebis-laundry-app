/**
 * push-service.ts — SERVER-ONLY
 * Now backed by FCM HTTP v1 (was web-push/VAPID). The existing API
 * routes (subscribe/notify/unsubscribe) keep the same shape so the
 * client code doesn't need to change — but they now operate on FCM
 * registration tokens stored under users/{uid}.fcmTokens.
 */
import { db } from "./firebase";
import {
  doc,
  setDoc,
  collection,
  query,
  where,
  getDocs,
  arrayUnion,
  arrayRemove,
  serverTimestamp,
} from "firebase/firestore";
import { sendFcmMessage } from "./fcm-admin.server";

// ─── Notification templates ───────────────────────────────────────
export type NotificationEvent =
  | "laundry-picked-up"
  | "laundry-in-progress"
  | "laundry-ready"
  | "laundry-delivered"
  | "price-updated"
  | "invoice-ready"
  | "chat-to-customer"
  | "chat-to-staff";

export interface PushPayload {
  title: string;
  body: string;
  tag: string;
  url: string;
  icon: string;
  badge: string;
  badgeCount?: number;
}

export const NOTIFICATION_TEMPLATES: Record<NotificationEvent, PushPayload> = {
  "laundry-picked-up": { title: "הכביסה נלקחה 🧺", body: "הכביסה שלך נאספה ובדרכה לניקוי", tag: "order-status", url: "/tracking", icon: "/icon-192.png", badge: "/icon-192.png" },
  "laundry-in-progress": { title: "הכביסה בטיפול 🧼", body: "הכביסה שלך בתהליך ניקוי", tag: "order-status", url: "/tracking", icon: "/icon-192.png", badge: "/icon-192.png" },
  "laundry-ready": { title: "הכביסה מוכנה ✨", body: "ההזמנה שלך מוכנה לאיסוף", tag: "order-status", url: "/tracking", icon: "/icon-192.png", badge: "/icon-192.png" },
  "laundry-delivered": { title: "הכביסה נמסרה 🎉", body: "הכביסה שלך נמסרה בהצלחה", tag: "order-status", url: "/tracking", icon: "/icon-192.png", badge: "/icon-192.png" },
  "price-updated": { title: "מחיר עודכן 💳", body: "נקבע מחיר חדש להזמנה שלך", tag: "price", url: "/payments", icon: "/icon-192.png", badge: "/icon-192.png" },
  "invoice-ready": { title: "החשבונית מוכנה 🧾", body: "חשבונית חדשה זמינה לצפייה", tag: "invoice", url: "/payments", icon: "/icon-192.png", badge: "/icon-192.png" },
  "chat-to-customer": { title: "הודעה חדשה מהמכבסה 💬", body: "יש לך הודעה חדשה", tag: "chat", url: "/chat", icon: "/icon-192.png", badge: "/icon-192.png" },
  "chat-to-staff": { title: "הודעה חדשה מלקוח 💬", body: "התקבלה הודעה חדשה", tag: "chat", url: "/admin-chat", icon: "/icon-192.png", badge: "/icon-192.png" },
};

// ─── Token storage ─────────────────────────────────────────────
async function findUserDocByEmail(email: string) {
  const q = query(collection(db, "users"), where("email", "==", email));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return snap.docs[0];
}

export async function saveFcmToken(userEmail: string, token: string) {
  const userDoc = await findUserDocByEmail(userEmail);
  if (userDoc) {
    await setDoc(
      doc(db, "users", userDoc.id),
      { fcmTokens: arrayUnion(token), fcmTokensUpdatedAt: serverTimestamp(), email: userEmail },
      { merge: true }
    );
    return;
  }
  // Fallback: anonymous bucket keyed by token
  await setDoc(doc(db, "fcmTokens", token.slice(0, 100)), {
    token,
    userEmail: userEmail || null,
    createdAt: serverTimestamp(),
  });
}

export async function removeFcmToken(token: string) {
  const usersSnap = await getDocs(collection(db, "users"));
  for (const u of usersSnap.docs) {
    const tokens: string[] = (u.data() as any)?.fcmTokens || [];
    if (tokens.includes(token)) {
      await setDoc(doc(db, "users", u.id), { fcmTokens: arrayRemove(token) }, { merge: true });
    }
  }
}

async function getTokensForUser(userEmail: string): Promise<string[]> {
  if (userEmail === "laundry-staff") {
    // Send to all admin/laundry roles
    const q = query(collection(db, "users"), where("role", "in", ["admin", "laundry"]));
    const snap = await getDocs(q);
    const all: string[] = [];
    snap.forEach((d) => {
      const t = (d.data() as any)?.fcmTokens;
      if (Array.isArray(t)) all.push(...t);
    });
    return [...new Set(all)];
  }
  const userDoc = await findUserDocByEmail(userEmail);
  if (!userDoc) return [];
  const t = (userDoc.data() as any)?.fcmTokens;
  return Array.isArray(t) ? t : [];
}

// ─── Notify ────────────────────────────────────────────────────
export async function notifyUser(
  userEmail: string,
  event: NotificationEvent,
  options?: { customTitle?: string; customBody?: string }
) {
  const tpl = NOTIFICATION_TEMPLATES[event];
  if (!tpl) throw new Error(`Unknown event: ${event}`);

  const tokens = await getTokensForUser(userEmail);
  if (tokens.length === 0) {
    return { sent: 0, failed: 0, note: "no tokens registered for user" };
  }

  let sent = 0;
  let failed = 0;
  const invalidTokens: string[] = [];

  await Promise.all(
    tokens.map(async (token) => {
      try {
        const res = await sendFcmMessage({
          token,
          title: options?.customTitle || tpl.title,
          body: options?.customBody || tpl.body,
          url: tpl.url,
          tag: tpl.tag,
          badgeCount: 1,
        });
        if (res.ok) {
          sent++;
        } else {
          failed++;
          // 404 / UNREGISTERED → token expired, prune it
          if (res.status === 404 || res.status === 400) invalidTokens.push(token);
          console.warn("[fcm] send failed", res.status, res.body);
        }
      } catch (err) {
        failed++;
        console.error("[fcm] send error", err);
      }
    })
  );

  // Cleanup invalid tokens
  for (const t of invalidTokens) {
    try { await removeFcmToken(t); } catch {}
  }

  return { sent, failed };
}

// ─── Back-compat shims (used by the existing /api routes) ──────
export async function saveSubscription(
  storageKey: string,
  sub: { endpoint: string; keys: { p256dh: string; auth: string } }
) {
  // Legacy path — kept so old callers don't break. Treat the endpoint
  // as a pseudo-token bucket. New clients should POST { fcmToken }.
  await setDoc(doc(db, "legacyPushSubscriptions", btoa(sub.endpoint).slice(0, 100)), {
    storageKey,
    endpoint: sub.endpoint,
    createdAt: serverTimestamp(),
  });
}

export async function removeSubscription(endpoint: string) {
  // No-op for legacy endpoints; for FCM tokens, use removeFcmToken instead.
  await setDoc(
    doc(db, "legacyPushSubscriptions", btoa(endpoint).slice(0, 100)),
    { removedAt: serverTimestamp() },
    { merge: true }
  );
}
