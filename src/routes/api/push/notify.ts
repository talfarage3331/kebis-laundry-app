/**
 * POST /api/push/notify
 * Server-side trigger to send an FCM push to a user (and bump their
 * Firestore unreadCount so the PWA app badge updates).
 *
 * Body: { userEmail, event, customTitle?, customBody? }
 */
import { createFileRoute } from "@tanstack/react-router";

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
            event?: string;
            customBody?: string;
            customTitle?: string;
          };

          if (!body?.userEmail || !body?.event) {
            return new Response(
              JSON.stringify({ error: "Missing required fields: userEmail, event" }),
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
        } catch (err) {
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
