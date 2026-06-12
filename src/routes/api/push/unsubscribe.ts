/**
 * POST /api/push/unsubscribe
 * Removes an FCM token from all user docs so no further pushes are
 * attempted to this device.
 *
 * Body: { fcmToken: string }
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/push/unsubscribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as { fcmToken?: string; endpoint?: string };
          const token = body?.fcmToken || body?.endpoint;

          if (!token || typeof token !== "string" || token.length > 4096) {
            return new Response(JSON.stringify({ error: "Missing required field: fcmToken" }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }

          const { removeFcmToken } = await import("@/lib/push-service.server");
          await removeFcmToken(token);

          return new Response(JSON.stringify({ success: true, message: "Token removed" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err) {
          console.error("[push/unsubscribe] Error:", err);
          return new Response(JSON.stringify({ error: "Internal server error" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
