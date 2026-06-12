/**
 * push-service.server.ts — SERVER-ONLY
 * FCM HTTP v1 push pipeline backed by the Firestore REST API (admin).
 * Sends pushes to FCM tokens stored under users/{uid}.fcmTokens and
 * bumps users/{uid}.unreadCount so the PWA app-icon badge updates.
 */
import { sendFcmMessage } from "./fcm-admin.server";
import {
  findUsersByEmail,
  findUsersByRole,
  findUsersWithToken,
  appendFcmToken,
  removeFcmTokenFromDoc,
  incrementUnreadCount,
  saveOrphanToken,
  getStringArrayField,
  type UserDoc,
} from "./firestore-admin.server";

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
}

export const NOTIFICATION_TEMPLATES: Record<NotificationEvent, PushPayload> = {
  "laundry-picked-up": { title: "הכביסה נלקחה 🧺", body: "הכביסה שלך נאספה ובדרכה לניקוי", tag: "order-status", url: "/tracking" },
  "laundry-in-progress": { title: "הכביסה בטיפול 🧼", body: "הכביסה שלך בתהליך ניקוי", tag: "order-status", url: "/tracking" },
  "laundry-ready": { title: "הכביסה מוכנה ✨", body: "ההזמנה שלך מוכנה לאיסוף", tag: "order-status", url: "/tracking" },
  "laundry-delivered": { title: "הכביסה נמסרה 🎉", body: "הכביסה שלך נמסרה בהצלחה", tag: "order-status", url: "/tracking" },
  "price-updated": { title: "מחיר עודכן 💳", body: "נקבע מחיר חדש להזמנה שלך", tag: "price", url: "/payments" },
  "invoice-ready": { title: "החשבונית מוכנה 🧾", body: "חשבונית חדשה זמינה לצפייה", tag: "invoice", url: "/payments" },
  "chat-to-customer": { title: "הודעה חדשה מהמכבסה 💬", body: "יש לך הודעה חדשה", tag: "chat", url: "/chat" },
  "chat-to-staff": { title: "הודעה חדשה מלקוח 💬", body: "התקבלה הודעה חדשה", tag: "chat", url: "/admin-chat" },
};

// ─── Token storage ─────────────────────────────────────────────
export async function saveFcmToken(userEmail: string, token: string) {
  const users = await findUsersByEmail(userEmail);
  if (users.length > 0) {
    await appendFcmToken(users[0].name, token);
    return;
  }
  await saveOrphanToken(token, userEmail || null);
}

export async function removeFcmToken(token: string) {
  const users = await findUsersWithToken(token);
  await Promise.all(users.map((u) => removeFcmTokenFromDoc(u.name, token)));
}

async function getTargetUsers(userEmail: string): Promise<UserDoc[]> {
  if (userEmail === "laundry-staff") {
    return findUsersByRole(["admin", "laundry"]);
  }
  return findUsersByEmail(userEmail);
}

// ─── Notify ────────────────────────────────────────────────────
export async function notifyUser(
  userEmail: string,
  event: NotificationEvent,
  options?: { customTitle?: string; customBody?: string }
) {
  const tpl = NOTIFICATION_TEMPLATES[event];
  if (!tpl) throw new Error(`Unknown event: ${event}`);

  const targets = await getTargetUsers(userEmail);
  if (targets.length === 0) {
    console.warn(`[push] no Firestore user found for "${userEmail}"`);
    return { sent: 0, failed: 0, note: "no user found for email" };
  }

  // 1) Bump unreadCount on every target user so the in-app badge
  //    listener fires even if the push itself can't be delivered.
  await Promise.all(
    targets.map((t) =>
      incrementUnreadCount(t.name).catch((err) =>
        console.error("[push] unreadCount increment failed:", err)
      )
    )
  );

  // 2) Collect tokens
  const tokens = [
    ...new Set(targets.flatMap((t) => getStringArrayField(t.fields, "fcmTokens"))),
  ];
  if (tokens.length === 0) {
    console.warn(`[push] user "${userEmail}" has no FCM tokens registered`);
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
          const errCode = res.body?.error?.details?.find?.(
            (d: any) => d?.errorCode
          )?.errorCode;
          // UNREGISTERED / INVALID_ARGUMENT → token expired, prune it
          if (res.status === 404 || errCode === "UNREGISTERED") invalidTokens.push(token);
          console.warn("[fcm] send failed", res.status, JSON.stringify(res.body));
        }
      } catch (err) {
        failed++;
        console.error("[fcm] send error", err);
      }
    })
  );

  for (const t of invalidTokens) {
    try {
      await removeFcmToken(t);
    } catch {}
  }

  console.log(`[push] event=${event} target=${userEmail} sent=${sent} failed=${failed}`);
  return { sent, failed };
}
