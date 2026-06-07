/**
 * POST /api/push/subscribe
 * ─────────────────────────────────────────────────────────────────
 * Called by the client hook (use-push-notifications.ts) after the
 * user grants Notification permission and the browser creates a
 * PushSubscription. Saves the subscription in Firestore so the
 * backend can send pushes to this device later.
 *
 * Expected JSON body:
 * {
 *   "endpoint": "https://fcm.googleapis.com/...",
 *   "keys": { "p256dh": "...", "auth": "..." },
 *   "userEmail": "user@example.com"   ← optional; falls back to endpoint-keyed storage
 * }
 *
 * The route is already rate-limited in server.ts (100 req/min/IP).
 */

import { createFileRoute } from "@tanstack/react-router";
import { saveSubscription } from "@/lib/push-service";

export const Route = createFileRoute("/api/push/subscribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json() as {
            endpoint?: string;
            keys?: { p256dh?: string; auth?: string };
            userEmail?: string;
          };

          // Validate only the fields required for push delivery
          if (
            !body?.endpoint ||
            !body?.keys?.p256dh ||
            !body?.keys?.auth
          ) {
            return new Response(
              JSON.stringify({ error: "Missing required fields: endpoint, keys.p256dh, keys.auth" }),
              { status: 400, headers: { "Content-Type": "application/json" } }
            );
          }

          // Use email if provided, otherwise derive a stable key from the endpoint URL
          const storageKey = body.userEmail?.trim()
            ? body.userEmail.trim()
            : `anon_${btoa(body.endpoint).replace(/[^a-zA-Z0-9]/g, "").slice(0, 40)}`;

          await saveSubscription(storageKey, {
            endpoint: body.endpoint,
            keys: {
              p256dh: body.keys.p256dh,
              auth: body.keys.auth,
            },
          });

          return new Response(
            JSON.stringify({ success: true, message: "Subscription saved" }),
            { status: 201, headers: { "Content-Type": "application/json" } }
          );
        } catch (err) {
          console.error("[push/subscribe] Error:", err);
          return new Response(
            JSON.stringify({ error: "Internal server error" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
          );
        }
      },
    },
  },
});
