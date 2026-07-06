/**
 * POST /api/admin/reassign-customer-laundry
 *
 * Admin-only endpoint that reassigns a customer to a different laundry
 * vendor. The customer is guaranteed to belong to exactly ONE laundry
 * after the call:
 *   1. Delete all pre-existing `laundries/*&#47;customers/{uid}` docs.
 *   2. Upsert `laundries/{newLaundryId}/customers/{uid}` with the current
 *      profile snapshot.
 *   3. Patch `users/{uid}.associatedLaundryId = newLaundryId`.
 *
 * Body: { customerUid: string, newLaundryId: string }
 * Response: { success: true, laundryId } | { error }
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/admin/reassign-customer-laundry")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          // 1. Verify Firebase ID token
          const { verifyIdToken, getCallerRole } = await import(
            "@/lib/verify-id-token.server"
          );
          let claims;
          try {
            claims = await verifyIdToken(request);
          } catch (resp) {
            if (resp instanceof Response) return resp;
            throw resp;
          }

          // 2. AuthZ — admin only. Prefer custom claim, fall back to Firestore role.
          const role = claims.role ?? (await getCallerRole(claims.uid));
          if (role !== "admin") {
            return new Response(JSON.stringify({ error: "forbidden" }), {
              status: 403,
              headers: { "Content-Type": "application/json" },
            });
          }

          // 3. Parse + validate body
          const body = (await request.json().catch(() => ({}))) as {
            customerUid?: string;
            newLaundryId?: string;
          };
          const customerUid = String(body.customerUid || "").trim();
          const newLaundryId = String(body.newLaundryId || "").trim();
          if (!customerUid || !newLaundryId) {
            return new Response(
              JSON.stringify({ error: "customerUid and newLaundryId are required" }),
              { status: 400, headers: { "Content-Type": "application/json" } },
            );
          }

          const {
            findUserById,
            findCustomerLaundryIds,
            setCustomerProfile,
            deleteCustomerProfile,
            updateUserAssociatedLaundry,
          } = await import("@/lib/firestore-admin.server");

          // 4. Load both users; verify the target is a laundry and the customer is not admin
          const [userDoc, laundryDoc] = await Promise.all([
            findUserById(customerUid),
            findUserById(newLaundryId),
          ]);
          if (!userDoc) {
            return new Response(JSON.stringify({ error: "customer not found" }), {
              status: 404,
              headers: { "Content-Type": "application/json" },
            });
          }
          if (!laundryDoc) {
            return new Response(JSON.stringify({ error: "laundry not found" }), {
              status: 404,
              headers: { "Content-Type": "application/json" },
            });
          }
          const targetRole = laundryDoc.fields?.role?.stringValue;
          if (targetRole !== "laundry") {
            return new Response(
              JSON.stringify({ error: "target user is not a laundry vendor" }),
              { status: 400, headers: { "Content-Type": "application/json" } },
            );
          }
          const customerRole = userDoc.fields?.role?.stringValue;
          if (customerRole === "admin") {
            return new Response(
              JSON.stringify({ error: "cannot reassign an admin account" }),
              { status: 400, headers: { "Content-Type": "application/json" } },
            );
          }

          const email = userDoc.fields?.email?.stringValue || "";
          const fullName = userDoc.fields?.fullName?.stringValue || "";
          const shopSlug =
            laundryDoc.fields?.shopSlug?.stringValue ||
            laundryDoc.fields?.slug?.stringValue ||
            "";

          // 5. Remove any pre-existing tenant profiles that aren't the new target.
          const existing = await findCustomerLaundryIds(customerUid);
          await Promise.all(
            existing
              .filter((id) => id && id !== newLaundryId)
              .map((id) =>
                deleteCustomerProfile(id, customerUid).catch((err) =>
                  console.error(
                    `[reassign-customer-laundry] failed to delete ${id}/${customerUid}:`,
                    err,
                  ),
                ),
              ),
          );

          // 6. Upsert the new tenant profile + patch the user doc.
          await setCustomerProfile(newLaundryId, customerUid, {
            email,
            fullName,
            activeTenantSlug: shopSlug,
          });
          await updateUserAssociatedLaundry(customerUid, newLaundryId);

          return Response.json({ success: true, laundryId: newLaundryId });
        } catch (err: any) {
          console.error("[reassign-customer-laundry] error:", err);
          return new Response(
            JSON.stringify({ error: err?.message || "internal error" }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
