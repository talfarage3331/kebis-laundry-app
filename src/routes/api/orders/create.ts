/**
 * POST /api/orders/create
 *
 * Server-side order creation that enforces Haversine delivery radius
 * validation before writing the order to Firestore.
 *
 * Body: OrderCreatePayload (see type below)
 * Response: { success: true, orderId: string, warning?: string } | { error: string }
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/orders/create")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
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
            userId: string;
            userEmail: string;
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
            userId,
            userEmail,
            customerLat,
            customerLng,
          } = body;

          if (!laundryId) {
            return new Response(
              JSON.stringify({ error: "חובה לציין מזהה מכבסה" }),
              { status: 400, headers: { "Content-Type": "application/json" } },
            );
          }

          const { findUserById, getCoordinates, getDoubleValue, createOrderAdmin } =
            await import("@/lib/firestore-admin.server");
          const { haversineDistanceKm } = await import("@/lib/haversine");

          let warning: string | null = null;

          // ── Server-side Haversine validation for Home Delivery ────────────────
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
              // Vendor has no zone — allow with warning (graceful degradation)
              warning = "המכבסה לא הגדירה את אזור המשלוח שלה, ההזמנה אושרה באופן חריג";
            } else {
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
          }

          // ── Create Firestore order document via Admin REST API ────────────────
          const orderData: Record<string, any> = {
            user_id: userId,
            userId: userId,
            status: "pending",
            delivery_method: deliveryMethod,
            deliveryMethod: deliveryMethod,
            payment_state: "unpaid",
            paymentState: "unpaid",
            amount_due: totalPrice || 0,
            total_price: totalPrice || 0,
            user_email: userEmail,
            userEmail: userEmail,
            requires_ironing: !!requiresIroning,
            requiresIroning: !!requiresIroning,
            requires_dry_cleaning: !!requiresDryCleaning,
            requiresDryCleaning: !!requiresDryCleaning,
            requires_washing: !!requiresWashing,
            requiresWashing: !!requiresWashing,
            notes: notes || "",
            images: images || [],
            invoiceUrl: "",
            invoiceName: "",
            created_at: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            addons: addons || [],
            deliveryTier: deliveryTier || "standard",
            basePrice: basePrice || 0,
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
