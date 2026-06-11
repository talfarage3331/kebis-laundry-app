/**
 * POST /api/push/subscribe
 * Saves an FCM registration token for the user.
 *
 * Body: { fcmToken: string, userEmail?: string }
 *
 * Legacy body { endpoint, keys, userEmail } is still accepted for
 * backward-compat but is now a no-op write to a legacy collection.
 */
import { createFileRoute } from "@tanstack/react-router";
import { saveFcmToken, saveSubscription } from "@/lib/push-service";

export const Route = createFileRoute("/api/push/subscribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as {
            fcmToken?: string;
            userEmail?: string;
            endpoint?: string;
            keys?: { p256dh?: string; auth?: string };
          };

          if (body?.fcmToken && body?.userEmail) {
            await saveFcmToken(body.userEmail, body.fcmToken);
            return new Response(
              JSON.stringify({ success: true, type: "fcm" }),
              { status: 201, headers: { "Content-Type": "application/json" } }
            );
          }

          // Legacy web-push shape — accept silently
          if (body?.endpoint && body?.keys?.p256dh && body?.keys?.auth) {
            await saveSubscription(body.userEmail || "anon", {
              endpoint: body.endpoint,
              keys: { p256dh: body.keys.p256dh, auth: body.keys.auth },
            });
            return new Response(
              JSON.stringify({ success: true, type: "legacy" }),
              { status: 201, headers: { "Content-Type": "application/json" } }
            );
          }

          return new Response(
            JSON.stringify({ error: "Missing fcmToken+userEmail (or legacy endpoint+keys)" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("[push/subscribe] Error:", message);
          return new Response(
            JSON.stringify({ error: "Internal server error", message }),
            { status: 500, headers: { "Content-Type": "application/json" } }
          );
        }
      },
    },
  },
});
