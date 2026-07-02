/**
 * POST /api/push/unsubscribe
 *
 * Removes an FCM token from the AUTHENTICATED caller's user document
 * only. Previously any anonymous request could wipe a token from every
 * user doc it appeared on — that surface is now closed by verifying the
 * ID token and restricting the removal to the caller's own record.
 *
 * Body: { fcmToken: string }
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/push/unsubscribe")({
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

          const body = (await request.json()) as { fcmToken?: string; endpoint?: string };
          const token = body?.fcmToken || body?.endpoint;
          if (!token || typeof token !== "string" || token.length > 4096) {
            return new Response(JSON.stringify({ error: "Missing required field: fcmToken" }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }

          const { removeFcmTokenFromDoc } = await import("@/lib/firestore-admin.server");
          // Remove only from the caller's own user doc (name segment is the uid).
          const { getFirebaseProjectId } = await import("@/lib/fcm-admin.server");
          const docName = `projects/${getFirebaseProjectId()}/databases/(default)/documents/users/${claims.uid}`;
          await removeFcmTokenFromDoc(docName, token);

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
