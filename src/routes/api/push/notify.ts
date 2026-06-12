/**
 * POST /api/push/notify
 * ─────────────────────────────────────────────────────────────────
 * Internal server route — called from client code and dashboards
 * to dispatch push notifications using FCM HTTP v1 REST API.
 *
 * Expected JSON body:
 * {
 *   "userEmail": "customer@example.com", // OR direct token
 *   "token": "d_token_...",             // Optional, for direct testing
 *   "event": "laundry-ready",
 *   "customTitle": "Optional title override",
 *   "customBody": "Optional body override",
 *   "url": "/payments"
 * }
 */
import { createFileRoute } from "@tanstack/react-router";
import { sendFcmMessage } from "@/lib/fcm-admin.server";

const VALID_EVENTS = new Set([
  "laundry-picked-up",
  "laundry-in-progress",
  "laundry-ready",
  "laundry-delivered",
  "price-updated",
  "invoice-ready",
  "chat-to-customer",
  "chat-to-staff",
]);

export const Route = createFileRoute("/api/push/notify")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as {
            userEmail?: string;
            token?: string;
            event?: string;
            customBody?: string;
            customTitle?: string;
            url?: string;
          };

          const title = body.customTitle || "עדכון מקביסה 🧺";
          const bodyText = body.customBody || "יש עדכון חדש בהזמנה שלך";
          const targetUrl = body.url || "/";

          // ─── Direct Token Diagnostic Testing Mode ──────────────────
          if (body.token) {
            console.log("[push/notify] Sending test push direct to token...");
            const res = await sendFcmMessage({
              token: body.token,
              title,
              body: bodyText,
              url: targetUrl,
              badgeCount: 1,
            });
            return new Response(JSON.stringify({ success: true, result: res }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }

          // ─── Standard User Email Routing Mode ──────────────────────
          if (!body?.userEmail || !body?.event) {
            return new Response(
              JSON.stringify({ error: "Missing required fields: userEmail and event (or token)" }),
              { status: 400, headers: { "Content-Type": "application/json" } }
            );
          }

          if (
            typeof body.userEmail !== "string" ||
            body.userEmail.length > 255 ||
            !VALID_EVENTS.has(body.event)
          ) {
            return new Response(
              JSON.stringify({ error: `Invalid payload. event must be one of: ${[...VALID_EVENTS].join(", ")}` }),
              { status: 400, headers: { "Content-Type": "application/json" } }
            );
          }

          if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
            console.error("[push/notify] FIREBASE_SERVICE_ACCOUNT secret missing");
            return new Response(
              JSON.stringify({ error: "Push service not configured: FIREBASE_SERVICE_ACCOUNT secret missing" }),
              { status: 503, headers: { "Content-Type": "application/json" } }
            );
          }

          const { notifyUser } = await import("@/lib/push-service.server");
          const result = await notifyUser(
            body.userEmail,
            body.event as import("@/lib/push-service.server").NotificationEvent,
            {
              customBody: typeof body.customBody === "string" ? body.customBody.slice(0, 500) : undefined,
              customTitle: typeof body.customTitle === "string" ? body.customTitle.slice(0, 200) : undefined,
            }
          );

          console.log("[push/notify]", body.event, "→", body.userEmail, JSON.stringify(result));
          return new Response(JSON.stringify(result), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err: any) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("[push/notify] Unhandled error:", message);
          return new Response(
            JSON.stringify({ error: "Internal server error", detail: message }),
            { status: 500, headers: { "Content-Type": "application/json" } }
          );
        }
      },
    },
  },
});
