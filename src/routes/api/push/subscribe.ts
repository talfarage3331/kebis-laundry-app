/**
 * POST /api/push/subscribe
 * Saves an FCM registration token for the user (server-side fallback —
 * the client also writes directly to users/{uid}.fcmTokens).
 *
 * Body: { fcmToken: string, userEmail: string }
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/push/subscribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as {
            fcmToken?: string;
            userEmail?: string;
          };

          if (
            !body?.fcmToken ||
            typeof body.fcmToken !== "string" ||
            body.fcmToken.length > 4096 ||
            !body?.userEmail ||
            typeof body.userEmail !== "string" ||
            body.userEmail.length > 255
          ) {
            return new Response(
              JSON.stringify({ error: "Missing or invalid fcmToken / userEmail" }),
              { status: 400, headers: { "Content-Type": "application/json" } },
            );
          }

          const { saveFcmToken } = await import("@/lib/push-service.server");
          await saveFcmToken(body.userEmail, body.fcmToken);
          return new Response(JSON.stringify({ success: true, type: "fcm" }), {
            status: 201,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("[push/subscribe] Error:", message);
          return new Response(JSON.stringify({ error: "Internal server error", message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
