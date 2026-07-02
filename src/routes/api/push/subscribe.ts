/**
 * POST /api/push/subscribe
 *
 * Stores an FCM registration token against the authenticated caller's
 * user document. The caller identity comes exclusively from the verified
 * Firebase ID token — the `userEmail` in the body is IGNORED to prevent
 * an attacker from binding a token to a victim's account (token hijack).
 *
 * Body: { fcmToken: string }
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/push/subscribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { verifyIdToken } = await import("@/lib/verify-id-token.server");
          let claims;
          try {
            claims = await verifyIdToken(request);
          } catch (resp) {
            if (resp instanceof Response) return resp;
            throw resp;
          }

          const body = (await request.json()) as { fcmToken?: string };
          if (
            !body?.fcmToken ||
            typeof body.fcmToken !== "string" ||
            body.fcmToken.length > 4096
          ) {
            return new Response(JSON.stringify({ error: "Missing or invalid fcmToken" }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }

          const email = (claims.email || "").toLowerCase();
          if (!email) {
            return new Response(
              JSON.stringify({ error: "authenticated user has no email" }),
              { status: 400, headers: { "Content-Type": "application/json" } },
            );
          }

          const { saveFcmToken } = await import("@/lib/push-service.server");
          await saveFcmToken(email, body.fcmToken);
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
