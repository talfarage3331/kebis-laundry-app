/**
 * POST /api/push/notify
 * Server-side trigger to send an FCM push to a user.
 *
 * Body: { userEmail, event, customTitle?, customBody? }
 */
import { createFileRoute } from "@tanstack/react-router";
import { notifyUser, NotificationEvent, NOTIFICATION_TEMPLATES } from "@/lib/push-service";

const VALID_EVENTS = new Set(Object.keys(NOTIFICATION_TEMPLATES));

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
          if (!VALID_EVENTS.has(body.event)) {
            return new Response(
              JSON.stringify({ error: `Invalid event. Must be one of: ${[...VALID_EVENTS].join(", ")}` }),
              { status: 400, headers: { "Content-Type": "application/json" } }
            );
          }

          if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
            console.error("[push/notify] FIREBASE_SERVICE_ACCOUNT secret missing");
            return new Response(
              JSON.stringify({ error: "Push service not configured" }),
              { status: 503, headers: { "Content-Type": "application/json" } }
            );
          }

          const result = await notifyUser(body.userEmail, body.event as NotificationEvent, {
            customBody: body.customBody,
            customTitle: body.customTitle,
          });

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
