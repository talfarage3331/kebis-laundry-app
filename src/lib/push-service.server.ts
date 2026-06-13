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
  findUserById,
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
  "laundry-picked-up": {
    title: "הכביסה נלקחה 🧺",
    body: "הכביסה שלך נאספה ובדרכה לניקוי",
    tag: "order-status",
    url: "/tracking",
  },
  "laundry-in-progress": {
    title: "הכביסה בטיפול 🧼",
    body: "הכביסה שלך בתהליך ניקוי",
    tag: "order-status",
    url: "/tracking",
  },
  "laundry-ready": {
    title: "הכביסה מוכנה ✨",
    body: "ההזמנה שלך מוכנה לאיסוף",
    tag: "order-status",
    url: "/tracking",
  },
  "laundry-delivered": {
    title: "הכביסה נמסרה 🎉",
    body: "הכביסה שלך נמסרה בהצלחה",
    tag: "order-status",
    url: "/tracking",
  },
  "price-updated": {
    title: "מחיר עודכן 💳",
    body: "נקבע מחיר חדש להזמנה שלך",
    tag: "price",
    url: "/payments",
  },
  "invoice-ready": {
    title: "החשבונית מוכנה 🧾",
    body: "חשבונית חדשה זמינה לצפייה",
    tag: "invoice",
    url: "/payments",
  },
  "chat-to-customer": {
    title: "הודעה חדשה מהמכבסה 💬",
    body: "יש לך הודעה חדשה",
    tag: "chat",
    url: "/chat",
  },
  "chat-to-staff": {
    title: "הודעה חדשה מלקוח 💬",
    body: "התקבלה הודעה חדשה",
    tag: "chat",
    url: "/admin-chat",
  },
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

async function getTargetUsers(
  identifier: string | { userEmail?: string; userId?: string },
): Promise<UserDoc[]> {
  const email = typeof identifier === "string" ? identifier : identifier.userEmail;
  const uid = typeof identifier === "string" ? undefined : identifier.userId;

  if (email === "laundry-staff") {
    return findUsersByRole(["admin", "laundry"]);
  }

  if (uid) {
    const user = await findUserById(uid);
    if (user) return [user];
  }

  if (email) {
    const emailLower = email.toLowerCase();
    const users = await findUsersByEmail(emailLower);
    if (users.length > 0) return users;
    if (email !== emailLower) {
      const usersRaw = await findUsersByEmail(email);
      if (usersRaw.length > 0) return usersRaw;
    }
  }

  return [];
}

// ─── Notify ────────────────────────────────────────────────────
export async function notifyUser(
  identifier: string | { userEmail?: string; userId?: string },
  event: NotificationEvent,
  options?: { customTitle?: string; customBody?: string },
) {
  try {
    const tpl = NOTIFICATION_TEMPLATES[event];
    if (!tpl) throw new Error(`Unknown event: ${event}`);

    const targets = await getTargetUsers(identifier);
    const identifierStr =
      typeof identifier === "string"
        ? identifier
        : `${identifier.userId || ""}:${identifier.userEmail || ""}`;
    if (targets.length === 0) {
      console.warn(`[push] no Firestore user found for "${identifierStr}"`);
      return {
        sent: 0,
        failed: 0,
        note: "no user found for identifier",
        errors: ["no user found for identifier"],
      };
    }

    // 1) Bump unreadCount on every target user so the in-app badge
    //    listener fires even if the push itself can't be delivered.
    await Promise.all(
      targets.map((t) =>
        incrementUnreadCount(t.name).catch((err) =>
          console.error("[push] unreadCount increment failed:", err),
        ),
      ),
    );

    // 2) Collect tokens
    const tokens = [...new Set(targets.flatMap((t) => getStringArrayField(t.fields, "fcmTokens")))];
    if (tokens.length === 0) {
      const targetEmail = typeof identifier === "string" ? identifier : identifier.userEmail;
      console.warn(`[push] user "${targetEmail || identifierStr}" has no FCM tokens registered`);
      return {
        sent: 0,
        failed: 0,
        note: "no tokens registered for user",
        errors: ["no tokens registered for user"],
      };
    }

    let sent = 0;
    let failed = 0;
    const invalidTokens: string[] = [];
    const errors: string[] = [];
    const resultsDetail: Record<string, unknown>[] = [];

    await Promise.all(
      tokens.map(async (token) => {
        const targetUser = targets.find((t) => {
          const userTokens = getStringArrayField(t.fields, "fcmTokens");
          return userTokens.includes(token);
        });
        const badgeCount = targetUser
          ? Number(targetUser.fields?.unreadCount?.integerValue ?? 0) + 1
          : 1;

        try {
          const res = await sendFcmMessage({
            token,
            title: options?.customTitle || tpl.title,
            body: options?.customBody || tpl.body,
            url: tpl.url,
            tag: tpl.tag,
            badgeCount,
          });
          resultsDetail.push({
            token: token.substring(0, 15) + "...",
            ok: res.ok,
            status: res.status,
            body: res.body,
          });
          if (res.ok) {
            sent++;
          } else {
            failed++;
            const errCode = (
              res.body?.error?.details?.find?.((d: { errorCode?: string }) => d?.errorCode) as
                | { errorCode?: string }
                | undefined
            )?.errorCode;
            const errMsg = res.body?.error?.message || "Unknown error";
            errors.push(`${errCode || "FCM_ERROR"}: ${errMsg}`);
            if (res.status === 404 || errCode === "UNREGISTERED") invalidTokens.push(token);
            console.warn("[fcm] send failed", res.status, JSON.stringify(res.body));
          }
        } catch (err) {
          failed++;
          const errMsg = err instanceof Error ? err.message : String(err);
          errors.push(errMsg);
          resultsDetail.push({
            token: token.substring(0, 15) + "...",
            error: errMsg,
          });
          console.error("[fcm] send error", err);
        }
      }),
    );

    for (const t of invalidTokens) {
      try {
        await removeFcmToken(t);
      } catch (e) {
        console.warn("[push] failed to prune invalid token:", e);
      }
    }

    // Log to Firestore notification_logs collection
    try {
      const { logNotification } = await import("./firestore-admin.server");
      await logNotification({
        recipient: identifierStr,
        event,
        title: options?.customTitle || tpl.title,
        body: options?.customBody || tpl.body,
        status: failed === 0 && sent > 0 ? "success" : "failed",
        results: resultsDetail,
        error: errors.length > 0 ? errors.join("; ") : undefined,
      });
    } catch (logErr) {
      console.error("[push] Failed to write notification log:", logErr);
    }

    console.log(`[push] event=${event} target=${identifierStr} sent=${sent} failed=${failed}`);
    return { sent, failed, errors };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("[push] error in notifyUser:", error);
    // Return a safe fallback instead of throwing — prevents hard 500 in the API route
    return { sent: 0, failed: 0, errors: [errMsg] };
  }
}
