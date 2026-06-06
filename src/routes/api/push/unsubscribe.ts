/**
 * POST /api/push/unsubscribe
 * ─────────────────────────────────────────────────────────────────
 * Called when the user disables push notifications in the app.
 * Removes the subscription from Firestore so no further pushes
 * are attempted to this device.
 *
 * Expected JSON body:
 * { "endpoint": "https://fcm.googleapis.com/..." }
 */

import { createFileRoute } from "@tanstack/react-router";
import { removeSubscription } from "@/lib/push-service";

export const Route = createFileRoute("/api/push/unsubscribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json() as { endpoint?: string };

          if (!body?.endpoint) {
            return new Response(
              JSON.stringify({ error: "Missing required field: endpoint" }),
              { status: 400, headers: { "Content-Type": "application/json" } }
            );
          }

          await removeSubscription(body.endpoint);

          return new Response(
            JSON.stringify({ success: true, message: "Subscription removed" }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        } catch (err) {
          console.error("[push/unsubscribe] Error:", err);
          return new Response(
            JSON.stringify({ error: "Internal server error" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
          );
        }
      },
    },
  },
});
