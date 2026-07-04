/**
 * POST /api/push/notify
 * ─────────────────────────────────────────────────────────────────
 * Dispatch a push notification via FCM HTTP v1.
 *
 * Security model (post-hardening):
 *   • Requires a valid Firebase Auth ID token (Authorization: Bearer).
 *   • RBAC:
 *       - admin / laundry: may notify any user for any supported event.
 *       - customer: may only send `chat-to-staff` to the laundry-staff
 *         group. Everything else is rejected.
 *   • Direct-token diagnostic mode is admin-only.
 *   • The `userEmail` / `userId` in the body identifies the RECIPIENT.
 *     The caller identity comes exclusively from the verified JWT.
 */
import { createFileRoute } from "@tanstack/react-router";
import { sendFcmMessage } from "@/lib/fcm-admin.server";
import { getServerEnv } from "@/lib/server-env";

const VALID_EVENTS = new Set([
  "laundry-picked-up",
  "laundry-in-progress",
  "laundry-ready",
  "laundry-delivered",
  "price-updated",
  "invoice-ready",
  "chat-to-customer",
  "chat-to-staff",
  "admin-broadcast",
]);

export const Route = createFileRoute("/api/push/notify")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          // ── AuthN ──────────────────────────────────────────────────
          const { verifyIdToken, getCallerRole } = await import(
            "@/lib/verify-id-token.server"
          );
          let claims;
          try {
            claims = await verifyIdToken(request);
          } catch (resp) {
            if (resp instanceof Response) return resp;
            throw resp;
          }
          const role = await getCallerRole(claims.uid);

          const body = (await request.json()) as {
            userEmail?: string;
            userId?: string;
            token?: string;
            event?: string;
            customBody?: string;
            customTitle?: string;
            url?: string;
          };

          const title = body.customTitle || "עדכון מקביסה 🧺";
          const bodyText = body.customBody || "יש עדכון חדש בהזמנה שלך";
          const targetUrl = body.url || "/";

          // ── Direct token diagnostic — admin only ───────────────────
          if (body.token) {
            if (role !== "admin") {
              return new Response(
                JSON.stringify({ error: "forbidden: direct-token mode is admin-only" }),
                { status: 403, headers: { "Content-Type": "application/json" } },
              );
            }
            const res = await sendFcmMessage({
              token: body.token,
              title,
              body: bodyText,
              url: targetUrl,
              badgeCount: 1,
            });
            try {
              const { logNotification } = await import("@/lib/firestore-admin.server");
              await logNotification({
                recipient: `token:${body.token.substring(0, 15)}...`,
                event: "direct-token-test",
                title,
                body: bodyText,
                status: res.ok ? "success" : "failed",
                results: res.body,
                error: res.ok ? undefined : `FCM send returned status ${res.status}`,
              });
            } catch (logErr) {
              console.error("[push/notify] Failed to log direct-token notification:", logErr);
            }
            return new Response(JSON.stringify({ success: res.ok, result: res }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }

          // ── Standard payload validation ────────────────────────────
          if ((!body?.userEmail && !body?.userId) || !body?.event) {
            return new Response(
              JSON.stringify({
                error: "Missing required fields: userEmail/userId and event (or token)",
              }),
              { status: 400, headers: { "Content-Type": "application/json" } },
            );
          }
          if (
            (body.userEmail && (typeof body.userEmail !== "string" || body.userEmail.length > 255)) ||
            (body.userId && (typeof body.userId !== "string" || body.userId.length > 255)) ||
            !VALID_EVENTS.has(body.event)
          ) {
            return new Response(
              JSON.stringify({
                error: `Invalid payload. event must be one of: ${[...VALID_EVENTS].join(", ")}`,
              }),
              { status: 400, headers: { "Content-Type": "application/json" } },
            );
          }

          // ── RBAC: customers are limited to chat-to-staff ───────────
          if (role === "customer") {
            if (body.event !== "chat-to-staff") {
              return new Response(
                JSON.stringify({
                  error: "forbidden: customers may only send chat-to-staff notifications",
                }),
                { status: 403, headers: { "Content-Type": "application/json" } },
              );
            }
          }

          const env = getServerEnv();
          if (!env.FIREBASE_SERVICE_ACCOUNT) {
            console.error(
              "[push/notify] FIREBASE_SERVICE_ACCOUNT secret missing in getServerEnv()",
            );
            return new Response(
              JSON.stringify({
                error: "Push service not configured: FIREBASE_SERVICE_ACCOUNT secret missing",
              }),
              { status: 503, headers: { "Content-Type": "application/json" } },
            );
          }

          const { notifyUser } = await import("@/lib/push-service.server");
          const result = await notifyUser(
            { userEmail: body.userEmail, userId: body.userId },
            body.event as import("@/lib/push-service.server").NotificationEvent,
            {
              customBody:
                typeof body.customBody === "string" ? body.customBody.slice(0, 500) : undefined,
              customTitle:
                typeof body.customTitle === "string" ? body.customTitle.slice(0, 200) : undefined,
            },
          );

          console.log(
            "[push/notify]",
            body.event,
            "→",
            body.userId || body.userEmail,
            "by",
            `${claims.uid}(${role})`,
            JSON.stringify(result),
          );
          const success = result.sent > 0 && result.failed === 0;
          return new Response(JSON.stringify({ success, ...result }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err: any) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("[push/notify] Unhandled error:", err);
          const isExpectedError =
            message.includes("no tokens") ||
            message.includes("no user") ||
            message.includes("FCM tokens") ||
            message.includes("not found");
          return new Response(
            JSON.stringify({ success: false, sent: 0, failed: 0, error: message }),
            {
              status: isExpectedError ? 200 : 500,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
      },
    },
  },
});
