import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { Loader2 } from "lucide-react";
import { seedDefaultsIfEmpty } from "@/hooks/use-laundry-options";

export const Route = createFileRoute("/shop/$slug")({
  component: ShopSlugResolver,
});

/**
 * Public route: /shop/<shopSlug>
 *
 * 1. Looks up the laundry user whose `shopSlug` matches the URL param.
 * 2. FORCEFULLY overwrites localStorage tenant state (activeLaundryId / activeLaundryName).
 * 3. Seeds default add-ons & delivery tiers for that tenant if none exist yet.
 * 4. Redirects to "/signup?laundryId=VENDOR_ID" for guests, or "/" for logged-in users.
 *
 * Graceful fallback: if no matching vendor is found, redirects to "/" with no tenant.
 */
function ShopSlugResolver() {
  const { slug } = useParams({ from: "/shop/$slug" });
  const navigate = useNavigate();

  useEffect(() => {
    if (!slug) {
      navigate({ to: "/", replace: true });
      return;
    }

    let cancelled = false;

    async function resolveSlug() {
      let targetPath = "/";
      let targetSearch: { laundryId?: string } | undefined = undefined;

      try {
        // Query Firestore for the vendor whose shopSlug matches
        const q = query(
          collection(db, "users"),
          where("shopSlug", "==", slug),
          where("role", "==", "laundry"),
        );
        const snap = await getDocs(q);

        if (!cancelled && !snap.empty) {
          const vendorDoc = snap.docs[0];
          const data = vendorDoc.data();
          const vendorId = vendorDoc.id;
          const vendorName: string =
            data.businessName || data.fullName || data.name || "מכבסה";

          // Force-overwrite any existing tenant state in localStorage
          localStorage.setItem("activeLaundryId", vendorId);
          localStorage.setItem("activeLaundryName", vendorName);
          localStorage.setItem("activeLaundrySlug", slug);

          // Dispatch storage events so the LaundryProvider can react without a reload
          window.dispatchEvent(
            new StorageEvent("storage", {
              key: "activeLaundryId",
              newValue: vendorId,
            }),
          );
          window.dispatchEvent(
            new StorageEvent("storage", {
              key: "activeLaundryName",
              newValue: vendorName,
            }),
          );
          window.dispatchEvent(
            new StorageEvent("storage", {
              key: "activeLaundrySlug",
              newValue: slug,
            }),
          );

          // Seed default add-ons / tiers in the background (non-blocking)
          seedDefaultsIfEmpty(vendorId).catch((err) =>
            console.warn("[shop-slug] seedDefaultsIfEmpty failed:", err),
          );

          if (!auth.currentUser) {
            targetPath = "/signup";
            targetSearch = { laundryId: vendorId };
          } else {
            targetPath = "/";
          }
        } else if (!cancelled) {
          // Unknown slug — clear any stale tenant state and fall through
          localStorage.removeItem("activeLaundryId");
          localStorage.removeItem("activeLaundryName");
          localStorage.removeItem("activeLaundrySlug");

          // Dispatch storage events to clear the tenant state in context
          window.dispatchEvent(
            new StorageEvent("storage", {
              key: "activeLaundryId",
              newValue: null,
            }),
          );
          window.dispatchEvent(
            new StorageEvent("storage", {
              key: "activeLaundryName",
              newValue: null,
            }),
          );
          window.dispatchEvent(
            new StorageEvent("storage", {
              key: "activeLaundrySlug",
              newValue: null,
            }),
          );
        }
      } catch (err) {
        console.error("[shop-slug] resolution error:", err);
      } finally {
        if (!cancelled) {
          if (targetPath === "/signup" && targetSearch) {
            navigate({ to: "/signup", search: targetSearch, replace: true });
          } else {
            navigate({ to: "/", replace: true });
          }
        }
      }
    }

    resolveSlug();
    return () => { cancelled = true; };
  }, [slug, navigate]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
      <Loader2 className="size-10 text-primary animate-spin" />
      <p className="text-sm text-muted-foreground font-medium">
        טוען את החנות שלך...
      </p>
    </div>
  );
}
