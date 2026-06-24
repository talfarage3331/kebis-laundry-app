import {
  createFileRoute,
  useNavigate,
  useParams,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { getApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  updateDoc,
} from "firebase/firestore";
import { Loader2 } from "lucide-react";
import { seedDefaultsIfEmpty } from "@/hooks/use-laundry-options";
import { useLaundry } from "@/lib/laundry-store";

export const Route = createFileRoute("/shop/$slug")({
  component: ShopSlugResolver,
});

/**
 * Returns a live Firestore instance, bypassing the module-level cached
 * reference that can be `null` during SSR.
 */
function getDb() {
  const apps = getApps();
  if (!apps.length) throw new Error("Firebase app not initialised");
  return getFirestore(apps[0]);
}

/**
 * Returns a live Auth instance with the same safety guarantee.
 */
function getLiveAuth() {
  const apps = getApps();
  if (!apps.length) throw new Error("Firebase app not initialised");
  return getAuth(apps[0]);
}

/**
 * This component handles resolution of the shop slug on the client side.
 * If the user is a guest, they are redirected to /signup?slug=<slug>.
 * If they are logged in, we resolve the slug to its vendor, set the active
 * tenant state in localStorage, permanently link their profile in Firestore
 * if it has no associated laundry, and navigate them to the home screen.
 */
function ShopSlugResolver() {
  const { slug } = useParams({ from: "/shop/$slug" });
  const navigate = useNavigate();
  const { user, loading: authLoading, isProfileReady, isRoleLoading } = useLaundry();

  useEffect(() => {
    // Wait until auth state is fully loaded
    if (authLoading || !isProfileReady || isRoleLoading) return;

    if (!slug) {
      navigate({ to: "/", replace: true });
      return;
    }

    // 1. If user is guest, redirect to signup
    if (!user) {
      navigate({
        to: "/signup",
        search: { slug },
        replace: true,
      });
      return;
    }

    // 2. User is logged in -> resolve slug and navigate
    let cancelled = false;

    async function resolveAndRedirect() {
      try {
        const db = getDb();
        const liveAuth = getLiveAuth();
        const currentUser = liveAuth.currentUser;

        // Try shopSlug first, fall back to slug
        let snap = await getDocs(
          query(collection(db, "users"), where("shopSlug", "==", slug)),
        );
        if (snap.empty) {
          snap = await getDocs(
            query(collection(db, "users"), where("slug", "==", slug)),
          );
        }

        if (!cancelled && !snap.empty) {
          const vendorDoc = snap.docs[0];
          const data = vendorDoc.data();
          const vendorId = vendorDoc.id;
          const vendorName: string =
            data.businessName || data.name || data.fullName || "מכבסה";

          // Save active laundry tenant in localStorage
          localStorage.setItem("activeLaundryId", vendorId);
          localStorage.setItem("activeLaundryName", vendorName);
          localStorage.setItem("activeLaundrySlug", slug);

          // Dispatch storage events to synchronize the layout
          window.dispatchEvent(
            new StorageEvent("storage", { key: "activeLaundryId", newValue: vendorId }),
          );
          window.dispatchEvent(
            new StorageEvent("storage", { key: "activeLaundryName", newValue: vendorName }),
          );
          window.dispatchEvent(
            new StorageEvent("storage", { key: "activeLaundrySlug", newValue: slug }),
          );

          // Permanently associate user if they don't have associatedLaundryId yet
          if (currentUser) {
            const userDocRef = doc(db, "users", currentUser.uid);
            const userDoc = await getDoc(userDocRef);
            if (userDoc.exists()) {
              const userData = userDoc.data();
              if (userData.role === "customer" && !userData.associatedLaundryId) {
                await updateDoc(userDocRef, {
                  associatedLaundryId: vendorId,
                });
              }
            }
          }

          // Seed default configurations if empty
          await seedDefaultsIfEmpty(vendorId).catch((err) =>
            console.warn("[shop-slug] seedDefaultsIfEmpty failed:", err),
          );
        } else if (!cancelled) {
          // Clear active tenant if slug is invalid
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

    resolveAndRedirect();
    return () => {
      cancelled = true;
    };
  }, [slug, navigate, user, authLoading, isProfileReady, isRoleLoading]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
      <Loader2 className="size-10 text-primary animate-spin" />
      <p className="text-sm text-muted-foreground font-medium">
        טוען את החנות שלך...
      </p>
    </div>
  );
}
