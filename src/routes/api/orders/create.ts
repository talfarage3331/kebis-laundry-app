/**
 * POST /api/orders/create
 *
 * Server-side order creation with:
 *   • Firebase ID-token authentication (Authorization: Bearer …)
 *   • IDOR hardening — userId/userEmail come from the verified token,
 *     never the request body
 *   • Server-side Haversine delivery-radius validation
 *
 * Body: OrderCreatePayload (see type below). Fields `userId`/`userEmail`
 * in the body are IGNORED.
 * Response: { success: true, orderId: string, warning?: string } | { error }
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/orders/create")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          // ── 1. AuthN: verify Firebase ID token ─────────────────────
          const { verifyIdToken } = await import("@/lib/verify-id-token.server");
          let claims;
          try {
            claims = await verifyIdToken(request);
          } catch (resp) {
            if (resp instanceof Response) return resp;
            throw resp;
          }

          const body = (await request.json()) as {
            notes?: string;
            images?: string[];
            requiresIroning?: boolean;
            requiresDryCleaning?: boolean;
            requiresWashing?: boolean;
            deliveryMethod: "none" | "self_pickup" | "home_delivery";
            addons?: string[];
            deliveryTier?: string;
            basePrice?: number;
            totalPrice?: number;
            laundryId: string;
            customerLat?: number;
            customerLng?: number;
          };

          const {
            notes,
            images,
            requiresIroning,
            requiresDryCleaning,
            requiresWashing,
            deliveryMethod,
            addons,
            deliveryTier,
            basePrice,
            totalPrice,
            laundryId,
            customerLat,
            customerLng,
          } = body;

          // ── 2. AuthZ + payload validation ──────────────────────────
          if (!laundryId || typeof laundryId !== "string" || laundryId.length > 128) {
            return new Response(
              JSON.stringify({ error: "חובה לציין מזהה מכבסה" }),
              { status: 400, headers: { "Content-Type": "application/json" } },
            );
          }
          if (!["none", "self_pickup", "home_delivery"].includes(deliveryMethod)) {
            return new Response(
              JSON.stringify({ error: "שיטת משלוח לא חוקית" }),
              { status: 400, headers: { "Content-Type": "application/json" } },
            );
          }
          // Reasonable price ceiling so a compromised client can't submit
          // absurd amounts. Definitive pricing is still recomputed by the
          // laundry when they accept the order.
          const safeTotal =
            typeof totalPrice === "number" && totalPrice >= 0 && totalPrice <= 100000
              ? totalPrice
              : 0;
          const safeBase =
            typeof basePrice === "number" && basePrice >= 0 && basePrice <= 100000
              ? basePrice
              : 0;

          const userId = claims.uid;
          const userEmail = (claims.email || "").toLowerCase();

          const {
            findUserById,
            getCoordinates,
            getDoubleValue,
            createOrderAdmin,
            tenantMembershipExists,
          } = await import("@/lib/firestore-admin.server");
          const { haversineDistanceKm } = await import("@/lib/haversine");

          // ── 2b. Tenant isolation: caller must be a registered
          //        customer of the target laundry. This closes the
          //        cross-tenant IDOR where a customer of laundry A
          //        could submit an order to laundry B.
          const isMember = await tenantMembershipExists(laundryId, userId);
          if (!isMember) {
            return new Response(
              JSON.stringify({ error: "אינך רשום כלקוח של מכבסה זו" }),
              { status: 403, headers: { "Content-Type": "application/json" } },
            );
          }

          let warning: string | null = null;

          // ── 3. Haversine validation for home delivery ──────────────
          if (deliveryMethod === "home_delivery") {
            const vendorDoc = await findUserById(laundryId);
            if (!vendorDoc) {
              return new Response(
                JSON.stringify({ error: "המכבסה המבוקשת לא נמצאה במערכת" }),
                { status: 400, headers: { "Content-Type": "application/json" } },
              );
            }

            const vendorCoords = getCoordinates(vendorDoc.fields.deliveryCoordinates);
            const maxRadius = getDoubleValue(vendorDoc.fields.maxDeliveryRadiusKm);

            if (!vendorCoords || maxRadius === null) {
              return new Response(
                JSON.stringify({ error: "המכבסה טרם הגדירה אזור משלוח, לא ניתן לבצע הזמנות משלוח כרגע" }),
                { status: 400, headers: { "Content-Type": "application/json" } },
              );
            }
            if (customerLat === undefined || customerLng === undefined) {
              return new Response(
                JSON.stringify({ error: "מיקום הלקוח לא זוהה לצורך חישוב מרחק משלוח" }),
                { status: 400, headers: { "Content-Type": "application/json" } },
              );
            }
            const distance = haversineDistanceKm(
              customerLat,
              customerLng,
              vendorCoords.lat,
              vendorCoords.lng,
            );
            if (distance > maxRadius) {
              return new Response(
                JSON.stringify({ error: "מיקום המשלוח רחוק מידי עבור המכבסה" }),
                { status: 400, headers: { "Content-Type": "application/json" } },
              );
            }
          }

          // ── 4. Persist order via admin REST client ─────────────────
          const orderData: Record<string, any> = {
            user_id: userId,
            userId: userId,
            status: "pending",
            delivery_method: deliveryMethod,
            deliveryMethod: deliveryMethod,
            payment_state: "unpaid",
            paymentState: "unpaid",
            amount_due: safeTotal,
            total_price: safeTotal,
            user_email: userEmail,
            userEmail: userEmail,
            requires_ironing: !!requiresIroning,
            requiresIroning: !!requiresIroning,
            requires_dry_cleaning: !!requiresDryCleaning,
            requiresDryCleaning: !!requiresDryCleaning,
            requires_washing: !!requiresWashing,
            requiresWashing: !!requiresWashing,
            notes: (notes || "").slice(0, 2000),
            images: Array.isArray(images) ? images.slice(0, 20) : [],
            invoiceUrl: "",
            invoiceName: "",
            created_at: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            addons: Array.isArray(addons) ? addons.slice(0, 20) : [],
            deliveryTier: deliveryTier || "standard",
            basePrice: safeBase,
            laundryId: laundryId,
          };

          const orderId = await createOrderAdmin(orderData);

          return new Response(
            JSON.stringify({ success: true, orderId, warning }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error("[api/orders/create] error:", message);
          return new Response(
            JSON.stringify({ error: message || "שגיאת שרת פנימית ביצירת ההזמנה" }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
