/**
 * POST /api/push/notify
 * ─────────────────────────────────────────────────────────────────
 * Internal server route — called from laundry-dashboard's
 * saveAllChanges() whenever a status, price, or invoice changes.
 *
 * Expected JSON body:
 * {
 *   "userEmail": "customer@example.com",
 *   "event": "laundry-ready" | "laundry-picked-up" | "laundry-delivered"
 *           | "price-updated" | "invoice-ready"
 * }
 *
 * The Cloudflare env (with VAPID secrets) is accessed via the
 * request's platform context injected by the worker runtime.
 */

import { createFileRoute } from "@tanstack/react-router";
import {
  notifyUser,
  NotificationEvent,
  NOTIFICATION_TEMPLATES,
} from "@/lib/push-service";
import { getServerEnv } from "@/lib/server-env";

const VALID_EVENTS = new Set(Object.keys(NOTIFICATION_TEMPLATES));

export const Route = createFileRoute("/api/push/notify")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json() as {
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
              JSON.stringify({
                error: `Invalid event. Must be one of: ${[...VALID_EVENTS].join(", ")}`,
              }),
              { status: 400, headers: { "Content-Type": "application/json" } }
            );
          }

          // Read VAPID secrets from Cloudflare Worker environment (globally stored) or process.env (fallback)
          const env = getServerEnv();

          const vapidEnv = {
            VAPID_PRIVATE_KEY: env.VAPID_PRIVATE_KEY ?? "",
            VAPID_PUBLIC_KEY: env.VAPID_PUBLIC_KEY ?? "",
            VAPID_SUBJECT: env.VAPID_SUBJECT ?? "mailto:admin@kebisa.app",
          };

          if (!vapidEnv.VAPID_PRIVATE_KEY || !vapidEnv.VAPID_PUBLIC_KEY) {
            console.error("[push/notify] VAPID secrets not configured in environment");
            return new Response(
              JSON.stringify({ error: "Push service not configured" }),
              { status: 503, headers: { "Content-Type": "application/json" } }
            );
          }

          const result = await notifyUser(
            body.userEmail,
            body.event as NotificationEvent,
            vapidEnv,
            { customBody: body.customBody, customTitle: body.customTitle }
          );

          return new Response(JSON.stringify(result), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err) {
          console.error("[push/notify] Error:", err);
          return new Response(
            JSON.stringify({ error: "Internal server error" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
          );
        }
      },
    },
  },
});
