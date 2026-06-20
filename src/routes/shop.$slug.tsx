import {
  createFileRoute,
  redirect,
  useNavigate,
  useParams,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { Loader2 } from "lucide-react";
import { seedDefaultsIfEmpty } from "@/hooks/use-laundry-options";

export const Route = createFileRoute("/shop/$slug")({
  /**
   * beforeLoad fires SYNCHRONOUSLY before any component renders.
   * For unauthenticated guests, we immediately throw a redirect to
   * /signup?slug=<slug> so the router never strips a laundryId that
   * hasn't been resolved yet.  The actual Firestore look-up happens
   * inside signup.tsx while the user fills in the form.
   *
   * Logged-in users fall through to the component which does the
   * async Firestore resolution and then navigates to the home screen.
   */
  beforeLoad: ({ params }) => {
    // Only redirect guests — auth.currentUser is null before Firebase
    // has settled, so we treat null === guest here (safe: worst case the
    // signup page shows for a split-second, then its own useEffect
    // redirects the logged-in user to the right dashboard).
    if (!auth?.currentUser) {
      throw redirect({
        to: "/signup",
        search: { slug: params.slug },
        replace: true,
      });
    }
  },
  component: ShopSlugResolver,
});

/**
 * This component only runs for LOGGED-IN users (guests are redirected
 * in beforeLoad above).  It resolves the Firestore vendor, updates
 * tenant localStorage state, and navigates to the home screen.
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
      try {
        const q = query(
          collection(db, "laundries"),
          where("slug", "==", slug),
        );
        const snap = await getDocs(q);

        if (!cancelled && !snap.empty) {
          const vendorDoc = snap.docs[0];
          const data = vendorDoc.data();
          const vendorId = vendorDoc.id;
          const vendorName: string =
            data.name || data.businessName || data.fullName || "מכבסה";

          localStorage.setItem("activeLaundryId", vendorId);
          localStorage.setItem("activeLaundryName", vendorName);
          localStorage.setItem("activeLaundrySlug", slug);

          window.dispatchEvent(
            new StorageEvent("storage", { key: "activeLaundryId", newValue: vendorId }),
          );
          window.dispatchEvent(
            new StorageEvent("storage", { key: "activeLaundryName", newValue: vendorName }),
          );
          window.dispatchEvent(
            new StorageEvent("storage", { key: "activeLaundrySlug", newValue: slug }),
          );

          seedDefaultsIfEmpty(vendorId).catch((err) =>
            console.warn("[shop-slug] seedDefaultsIfEmpty failed:", err),
          );
        } else if (!cancelled) {
          // Unknown slug — clear stale tenant state
          localStorage.removeItem("activeLaundryId");
          localStorage.removeItem("activeLaundryName");
          localStorage.removeItem("activeLaundrySlug");
          localStorage.removeItem("pendingLaundrySlug");

          window.dispatchEvent(
            new StorageEvent("storage", { key: "activeLaundryId", newValue: null }),
          );
          window.dispatchEvent(
            new StorageEvent("storage", { key: "activeLaundryName", newValue: null }),
          );
          window.dispatchEvent(
            new StorageEvent("storage", { key: "activeLaundrySlug", newValue: null }),
          );
        }
      } catch (err) {
        console.error("[shop-slug] resolution error:", err);
      } finally {
        if (!cancelled) {
          navigate({ to: "/", replace: true });
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
