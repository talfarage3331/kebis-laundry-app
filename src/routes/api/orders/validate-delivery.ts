/**
 * POST /api/orders/validate-delivery
 *
 * Validates whether a customer's coordinates fall within a vendor's
 * configured delivery radius using the Haversine formula.
 *
 * Body: { laundryId: string, customerLat: number, customerLng: number }
 * Response: { allowed: boolean, warning?: string } | { error: string }
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/orders/validate-delivery")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as {
            laundryId: string;
            customerLat: number;
            customerLng: number;
          };

          const { laundryId, customerLat, customerLng } = body;

          if (!laundryId) {
            return new Response(
              JSON.stringify({ error: "חובה לציין מזהה מכבסה" }),
              { status: 400, headers: { "Content-Type": "application/json" } },
            );
          }

          if (customerLat === undefined || customerLng === undefined) {
            return new Response(
              JSON.stringify({ error: "מיקום הלקוח לא צוין" }),
              { status: 400, headers: { "Content-Type": "application/json" } },
            );
          }

          const { findUserById, getCoordinates, getDoubleValue } = await import("@/lib/firestore-admin.server");
          const { haversineDistanceKm } = await import("@/lib/haversine");

          const vendorDoc = await findUserById(laundryId);
          if (!vendorDoc) {
            return new Response(
              JSON.stringify({ error: "המכבסה לא נמצאה במערכת" }),
              { status: 400, headers: { "Content-Type": "application/json" } },
            );
          }

          const vendorCoords = getCoordinates(vendorDoc.fields.deliveryCoordinates);
          const maxRadius = getDoubleValue(vendorDoc.fields.maxDeliveryRadiusKm);

          if (!vendorCoords || maxRadius === null) {
            return new Response(
              JSON.stringify({ allowed: true, warning: "מיקום המכבסה אינו מוגדר, מאשר משלוח באופן חריג" }),
              { status: 200, headers: { "Content-Type": "application/json" } },
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
              JSON.stringify({ allowed: false, message: "מיקום המשלוח רחוק מידי עבור המכבסה" }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            );
          }

          return new Response(
            JSON.stringify({ allowed: true }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error("[api/orders/validate-delivery] error:", message);
          return new Response(
            JSON.stringify({ error: "שגיאת שרת פנימית", message }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
