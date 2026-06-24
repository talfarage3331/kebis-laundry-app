import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { useLaundry } from "@/lib/laundry-store";
import { Flower2, Building2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { googleProvider } from "@/lib/firebase";
import {
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  getAuth,
} from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  collection,
  query,
  where,
  getDocs,
  getFirestore,
} from "firebase/firestore";
import { getApp, getApps } from "firebase/app";

// ─── Google icon ─────────────────────────────────────────────────────────────
const GoogleIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 533.5 544.3" xmlns="http://www.w3.org/2000/svg" fill="currentColor" {...props}>
    <path d="M533.5 278.4c0-17.7-1.6-35-4.6-51.8H272v97.9h146.9c-6.3 34.1-25.5 63-54.3 82.4v68h87.8c51.4-47.4 80.9-117.3 80.9-196.5z" fill="#4285F4" />
    <path d="M272 544.3c73.4 0 135-24.3 180-66.1l-87.8-68c-24.4 16.4-55.6 26-92.2 26-70.9 0-131-47.9-152.5-112.4h-90.9v70.6c45.4 89.8 138.3 149.9 243.4 149.9z" fill="#34A853" />
    <path d="M119.5 323.8c-10.4-30.9-10.4-64.1 0-95l-90.9-70.6c-38.3 74.6-38.3 162.6 0 237.2l90.9-71.6z" fill="#FBBC05" />
    <path d="M272 107.9c39.7-.6 78 13.7 107.5 39.4l80.7-80.7C408.7 21.3 342.4-1.7 272 0 166.9 0 74 60.1 28.6 149.9l90.9 71.6C141 155.8 201.1 107.9 272 107.9z" fill="#EA4335" />
  </svg>
);

// ─── Route definition ─────────────────────────────────────────────────────────
export const Route = createFileRoute("/signup")({
  component: Signup,
  validateSearch: (search: Record<string, unknown>): { slug?: string; laundryId?: string } => ({
    slug: typeof search.slug === "string" ? search.slug : undefined,
    laundryId: typeof search.laundryId === "string" ? search.laundryId : undefined,
  }),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns a live Firestore instance, bypassing the module-level cached
 * reference that can be `null` during SSR or before Firebase initialises.
 * Throws if no Firebase app has been initialised yet.
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
 * Read the slug (or direct laundryId) from TanStack Router search params
 * with a raw-URL fallback to survive SSR hydration mismatches on Cloudflare Workers.
 *
 * Returns an object with both fields so callers can distinguish between the two.
 */
function useSignupParams(): { slug: string | undefined; laundryId: string | undefined } {
  // `Route.useSearch()` is evaluated in component context — always safe.
  const { slug: routerSlug, laundryId: routerLaundryId } = Route.useSearch();

  // Client-only fallback: read directly from the live browser URL.
  let rawSlug: string | undefined = undefined;
  let rawLaundryId: string | undefined = undefined;
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    const s = params.get("slug");
    if (s) rawSlug = s;
    const l = params.get("laundryId");
    if (l) rawLaundryId = l;
  }

  const foundSlug = routerSlug || rawSlug;
  const foundLaundryId = routerLaundryId || rawLaundryId;

  // Persist to localStorage so we survive client-side routing transitions
  if (typeof window !== "undefined") {
    if (foundSlug) {
      localStorage.setItem("pendingLaundrySlug", foundSlug);
    }
    if (foundLaundryId) {
      localStorage.setItem("pendingLaundryId", foundLaundryId);
    }

    // Fallback from localStorage if nothing found in URL
    if (!foundSlug && !foundLaundryId) {
      const fallbackSlug = localStorage.getItem("pendingLaundrySlug");
      const fallbackId   = localStorage.getItem("pendingLaundryId");
      return { slug: fallbackSlug ?? undefined, laundryId: fallbackId ?? undefined };
    }
  }

  return { slug: foundSlug, laundryId: foundLaundryId };
}

/**
 * Resolve a shop slug to a Firestore vendor document.
 *
 * Laundry owners are stored in the `users` collection.
 * Primary slug field  : `shopSlug`  (written by LaundrySettingsCRUDPanel and login.tsx)
 * Legacy alias        : `slug`      (written by login.tsx alongside shopSlug)
 *
 * Uses a freshly-obtained Firestore instance to avoid the module-level
 * `null` that exists during SSR.
 *
 * Returns `null` when no matching document is found.
 */
async function resolveSlugToVendor(
  slug: string,
): Promise<{ vendorId: string; vendorName: string; vendorSlug: string } | null> {
  console.log("[signup] resolving slug:", slug);

  let db: ReturnType<typeof getFirestore>;
  try {
    db = getDb();
  } catch (e) {
    console.error("[signup] Firebase not ready:", e);
    return null;
  }

  // Strategy 1 — users.shopSlug (primary, written by both registration paths)
  try {
    const snap1 = await getDocs(
      query(collection(db, "users"), where("shopSlug", "==", slug)),
    );
    if (!snap1.empty) {
      const d = snap1.docs[0];
      const data = d.data();
      console.log("[signup] found via shopSlug:", d.id, data);
      return {
        vendorId:   d.id,
        vendorName: data.businessName || data.name || data.fullName || "מכבסה",
        vendorSlug: data.shopSlug || slug,
      };
    }
  } catch (e) {
    console.warn("[signup] shopSlug query failed:", e);
  }

  // Strategy 2 — users.slug (legacy alias written at registration)
  try {
    const snap2 = await getDocs(
      query(collection(db, "users"), where("slug", "==", slug)),
    );
    if (!snap2.empty) {
      const d = snap2.docs[0];
      const data = d.data();
      console.log("[signup] found via slug:", d.id, data);
      return {
        vendorId:   d.id,
        vendorName: data.businessName || data.name || data.fullName || "מכבסה",
        vendorSlug: data.slug || slug,
      };
    }
  } catch (e) {
    console.warn("[signup] slug query failed:", e);
  }

  // Strategy 3 — treat the slug as a direct Firestore document ID (vendor UID)
  // This handles links of the form /signup?laundryId=<uid> or /signup?slug=<uid>
  try {
    const directSnap = await getDoc(doc(db, "users", slug));
    if (directSnap.exists()) {
      const data = directSnap.data();
      const role = data.role;
      if (role === "laundry" || role === "admin") {
        console.log("[signup] found via direct UID doc:", directSnap.id, data);
        return {
          vendorId:   directSnap.id,
          vendorName: data.businessName || data.name || data.fullName || "מכבסה",
          vendorSlug: data.shopSlug || data.slug || slug,
        };
      }
    }
  } catch (e) {
    console.warn("[signup] direct UID lookup failed:", e);
  }

  console.warn("[signup] No vendor document found for slug:", slug);
  return null;
}

/**
 * Resolve a vendor directly by their Firestore document UID.
 */
async function resolveVendorById(
  vendorId: string,
): Promise<{ vendorId: string; vendorName: string; vendorSlug: string } | null> {
  console.log("[signup] resolving vendor by UID:", vendorId);

  let db: ReturnType<typeof getFirestore>;
  try {
    db = getDb();
  } catch (e) {
    console.error("[signup] Firebase not ready:", e);
    return null;
  }

  try {
    const snap = await getDoc(doc(db, "users", vendorId));
    if (snap.exists()) {
      const data = snap.data();
      console.log("[signup] found vendor by UID:", snap.id, data);
      return {
        vendorId:   snap.id,
        vendorName: data.businessName || data.name || data.fullName || "מכבסה",
        vendorSlug: data.shopSlug || data.slug || "",
      };
    }
  } catch (e) {
    console.warn("[signup] direct UID vendor lookup failed:", e);
  }

  console.warn("[signup] No vendor found for UID:", vendorId);
  return null;
}

// ─── Component ────────────────────────────────────────────────────────────────
function Signup() {
  const { user, loading: authLoading, isProfileReady, role, isRoleLoading } = useLaundry();
  const navigate = useNavigate();

  // Form state
  const [name, setName]         = useState("");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);

  // Read slug and laundryId from router or raw URL
  const { slug: urlSlug, laundryId: urlLaundryId } = useSignupParams();

  // Background resolution — purely for UX (showing laundry name, spinner).
  // The ACTUAL resolution used for registration happens inline at submit time.
  const [resolvedLaundryName, setResolvedLaundryName] = useState<string | null>(null);
  const [isResolvingSlug, setIsResolvingSlug]         = useState(false);
  // Cache the resolved vendor so submit is instantaneous if resolution already finished.
  const resolvedVendorRef = useRef<{ vendorId: string; vendorName: string; vendorSlug: string } | null>(null);

  // Background resolve for UX feedback (non-blocking, best-effort)
  useEffect(() => {
    const identifier = urlLaundryId || urlSlug;
    if (!identifier) return;

    // Check localStorage fast-path first
    const cachedSlug = localStorage.getItem("activeLaundrySlug");
    const cachedId   = localStorage.getItem("activeLaundryId");
    if (cachedId && (cachedSlug === identifier || cachedId === identifier)) {
      const cachedName = localStorage.getItem("activeLaundryName") ?? null;
      resolvedVendorRef.current = {
        vendorId:   cachedId,
        vendorName: cachedName ?? "מכבסה",
        vendorSlug: cachedSlug ?? "",
      };
      setResolvedLaundryName(cachedName);
      return;
    }

    let cancelled = false;
    setIsResolvingSlug(true);

    // If we have a direct vendor UID, use it; otherwise resolve by slug
    const resolvePromise = urlLaundryId
      ? resolveVendorById(urlLaundryId)
      : resolveSlugToVendor(urlSlug!);

    resolvePromise
      .then((vendor) => {
        if (cancelled) return;
        if (vendor) {
          resolvedVendorRef.current = vendor;
          setResolvedLaundryName(vendor.vendorName);
          localStorage.setItem("activeLaundryId",   vendor.vendorId);
          localStorage.setItem("activeLaundryName", vendor.vendorName);
          localStorage.setItem("activeLaundrySlug", vendor.vendorSlug);
        }
      })
      .catch((e) => console.warn("[signup] background resolve error:", e))
      .finally(() => { if (!cancelled) setIsResolvingSlug(false); });

    return () => { cancelled = true; };
  }, [urlSlug, urlLaundryId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Redirect already-authenticated users
  useEffect(() => {
    if (user && !authLoading && isProfileReady && !isRoleLoading) {
      const r = user.role || role || "customer";
      if (r === "admin")   navigate({ to: "/admin" });
      else if (r === "laundry") navigate({ to: "/laundry-dashboard" });
      else                 navigate({ to: "/" });
    }
  }, [user, authLoading, isProfileReady, isRoleLoading, role, navigate]);

  // Block banner — only shown client-side after mount, never during SSR flash
  const [clientMounted, setClientMounted] = useState(false);
  useEffect(() => { setClientMounted(true); }, []);

  const showBlockBanner = clientMounted && !urlSlug && !urlLaundryId;

  // ─── Block banner (no slug) ─────────────────────────────────────────────
  if (showBlockBanner) {
    return (
      <div className="min-h-[100dvh] bg-background flex flex-col overflow-x-hidden" dir="rtl">
        <div className="bg-primary text-primary-foreground rounded-b-[2rem] px-4 sm:px-6 pt-safe-auth pb-10">
          <div className="mx-auto max-w-md flex items-center gap-3">
            <div className="size-10 rounded-full bg-primary-foreground/15 grid place-items-center shrink-0">
              <Flower2 className="size-5" strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold">כביסה</h1>
              <p className="text-xs opacity-80">הרשמה</p>
            </div>
          </div>
        </div>
        <div className="mx-auto max-w-md w-full px-6 mt-8 text-center space-y-6">
          <div className="size-16 rounded-full bg-destructive/10 grid place-items-center mx-auto">
            <Building2 className="size-8 text-destructive animate-bounce" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-black text-foreground">ההרשמה חסומה</h2>
            <p className="text-sm text-muted-foreground font-semibold leading-relaxed">
              ההרשמה כלקוח מתאפשרת רק דרך קישור ייעודי של המכבסה.
            </p>
          </div>
          <div className="border-t border-muted-foreground/10 pt-6 flex flex-col gap-2.5">
            <Link to="/login" className="w-full rounded-2xl bg-primary text-primary-foreground py-3 text-sm font-extrabold shadow-md hover:opacity-90 active:scale-[0.98] transition flex items-center justify-center min-h-[48px]">
              התחבר לחשבון קיים
            </Link>
            <Link to="/" className="w-full rounded-2xl bg-background border border-border text-foreground py-3 text-sm font-extrabold hover:bg-muted active:scale-[0.98] transition flex items-center justify-center min-h-[48px]">
              חזרה לדף הבית
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ─── Core: get vendor, resolving inline if needed ─────────────────────────
  /**
   * Returns the vendor for the current slug or laundryId.
   * Uses the background-resolved cache if available; otherwise performs a
   * fresh Firestore lookup so submit always works regardless of timing.
   */
  async function getVendorForSlug(): Promise<{ vendorId: string; vendorName: string; vendorSlug: string } | null> {
    // 1. Use background-resolved cache (instant)
    if (resolvedVendorRef.current) return resolvedVendorRef.current;

    const cachedId   = localStorage.getItem("activeLaundryId");
    const cachedSlug = localStorage.getItem("activeLaundrySlug");

    // 2a. Check localStorage cache by slug
    if (urlSlug && cachedId && cachedSlug === urlSlug) {
      const vendor = {
        vendorId:   cachedId,
        vendorName: localStorage.getItem("activeLaundryName") ?? "מכבסה",
        vendorSlug: urlSlug,
      };
      resolvedVendorRef.current = vendor;
      return vendor;
    }

    // 2b. Check localStorage cache by direct vendor UID
    if (urlLaundryId && cachedId === urlLaundryId) {
      const vendor = {
        vendorId:   cachedId,
        vendorName: localStorage.getItem("activeLaundryName") ?? "מכבסה",
        vendorSlug: cachedSlug ?? "",
      };
      resolvedVendorRef.current = vendor;
      return vendor;
    }

    // 3. Inline resolution — the source of truth
    // Priority: direct UID lookup > slug-based lookup
    if (urlLaundryId) {
      const vendor = await resolveVendorById(urlLaundryId);
      if (vendor) {
        resolvedVendorRef.current = vendor;
        localStorage.setItem("activeLaundryId",   vendor.vendorId);
        localStorage.setItem("activeLaundryName", vendor.vendorName);
        localStorage.setItem("activeLaundrySlug", vendor.vendorSlug);
      }
      return vendor;
    }

    if (!urlSlug) return null;
    const vendor = await resolveSlugToVendor(urlSlug);
    if (vendor) {
      resolvedVendorRef.current = vendor;
      localStorage.setItem("activeLaundryId",   vendor.vendorId);
      localStorage.setItem("activeLaundryName", vendor.vendorName);
      localStorage.setItem("activeLaundrySlug", vendor.vendorSlug);
    }
    return vendor;
  }

  // ─── Email/password submit ────────────────────────────────────────────────
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !password) return toast.error("יש למלא את כל השדות");

    setLoading(true);
    try {
      // Step 1: Authenticate first so the user has Firestore read permission.
      const liveAuth = getLiveAuth();
      const result   = await createUserWithEmailAndPassword(liveAuth, email, password);
      const fbUser   = result.user;

      await updateProfile(fbUser, { displayName: name });

      // Step 2: Now that the user is authenticated, resolve the vendor.
      const vendor = await getVendorForSlug();
      if (!vendor) {
        // Rollback — delete the orphaned auth account so the user can try again.
        await fbUser.delete();
        toast.error("לא ניתן היה לזהות את המכבסה. אנא נסה שוב דרך הקישור המקורי.");
        return;
      }

      const assignedRole = email === "talfarage3331@gmail.com" ? "admin" : "customer";

      const db = getDb();
      await setDoc(doc(db, "users", fbUser.uid), {
        fullName:             name,
        email:                email,
        role:                 assignedRole,
        associatedLaundryId:  vendor.vendorId,
        createdAt:            serverTimestamp(),
      } as Record<string, unknown>);

      toast.success("נרשמת בהצלחה");
      if (typeof window !== "undefined") {
        localStorage.removeItem("pendingLaundrySlug");
        localStorage.removeItem("pendingLaundryId");
      }
      navigate({ to: assignedRole === "admin" ? "/admin" : "/" });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // ─── Google signup ────────────────────────────────────────────────────────
  const signInWithGoogle = async () => {
    setLoading(true);
    try {
      // Step 1: Authenticate first so the user has Firestore read permission.
      const liveAuth = getLiveAuth();
      // googleProvider is a client-only singleton — safe to import at top.
      const result   = await signInWithPopup(liveAuth, googleProvider);
      const fbUser   = result.user;

      if (!fbUser) return;

      const db         = getDb();
      const userDocRef = doc(db, "users", fbUser.uid);
      const userDoc    = await getDoc(userDocRef);

      if (userDoc.exists()) {
        // Returning user — just log them in.
        const existingRole = userDoc.data().role || "customer";
        toast.success("התחברת בהצלחה");
        if (existingRole === "admin")   navigate({ to: "/admin" });
        else if (existingRole === "laundry") navigate({ to: "/laundry-dashboard" });
        else                            navigate({ to: "/" });
        return;
      }

      // Step 2: New user — now authenticated, resolve vendor (Firestore permission granted).
      const vendor = await getVendorForSlug();
      if (!vendor) {
        // Rollback — delete orphaned auth account so user can retry.
        await fbUser.delete();
        toast.error(
          "לא ניתן היה לזהות את המכבסה. אנא נסה שוב דרך הקישור המקורי.",
          { duration: 6000 },
        );
        return;
      }

      const displayName = fbUser.displayName || fbUser.email?.split("@")[0] || "לקוח";
      await setDoc(userDocRef, {
        fullName:             displayName,
        email:                fbUser.email || "",
        role:                 "customer",
        associatedLaundryId:  vendor.vendorId,
        createdAt:            serverTimestamp(),
      });

      toast.success("נרשמת בהצלחה");
      if (typeof window !== "undefined") {
        localStorage.removeItem("pendingLaundrySlug");
        localStorage.removeItem("pendingLaundryId");
      }
      navigate({ to: "/" });
    } catch (error: unknown) {
      if (error instanceof Error && (error as { code?: string }).code !== "auth/popup-closed-by-user") {
        toast.error("התחברות עם גוגל נכשלה: " + error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-[100dvh] bg-background flex flex-col overflow-x-hidden" dir="rtl">

      {/* Header */}
      <div className="bg-primary text-primary-foreground rounded-b-[2rem] px-4 sm:px-6 pt-safe-auth pb-10">
        <div className="mx-auto max-w-md flex items-center gap-3">
          <div className="size-10 rounded-full bg-primary-foreground/15 grid place-items-center shrink-0">
            <Flower2 className="size-5" strokeWidth={1.75} />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold">כביסה</h1>
            <p className="text-xs opacity-80">
              {resolvedLaundryName ? `הצטרפות ל${resolvedLaundryName}` : "הצטרפו אלינו"}
            </p>
          </div>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={submit} className="mx-auto max-w-md w-full px-4 sm:px-6 mt-5 space-y-4 flex-1 pb-10">

        {/* Optional: background-resolving indicator */}
        {isResolvingSlug && !resolvedLaundryName && (
          <div className="animate-in slide-in-from-top-2 duration-200 rounded-2xl bg-blue-50 border border-blue-200 p-3.5 flex gap-3 items-center">
            <Loader2 className="size-4 text-blue-500 animate-spin shrink-0" />
            <p className="text-xs text-blue-700 font-semibold">מאמת פרטי מכבסה...</p>
          </div>
        )}

        {/* Google button */}
        <button
          type="button"
          onClick={signInWithGoogle}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2.5 rounded-3xl bg-white text-gray-800 border border-gray-200 py-3.5 text-sm font-bold min-h-[48px] shadow-sm hover:bg-gray-50 active:scale-[0.98] transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? <Loader2 className="size-4.5 animate-spin" /> : <GoogleIcon className="size-4.5" />}
          המשך עם Google
        </button>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-border" />
          <span className="text-[11px] text-muted-foreground font-semibold">או הרשמה עם אימייל</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        {/* Full name */}
        <div>
          <label className="text-sm font-semibold text-foreground">שם מלא</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1.5 w-full rounded-2xl border border-border bg-background px-4 py-3 sm:py-3.5 text-base min-h-[48px] focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground/50"
            placeholder="ישראל ישראלי"
          />
        </div>

        {/* Email */}
        <div>
          <label className="text-sm font-semibold text-foreground">דוא&quot;ל</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1.5 w-full rounded-2xl border border-border bg-background px-4 py-3 sm:py-3.5 text-base min-h-[48px] focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground/50"
            placeholder="name@example.com"
          />
        </div>

        {/* Password */}
        <div>
          <label className="text-sm font-semibold text-foreground">סיסמה</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1.5 w-full rounded-2xl border border-border bg-background px-4 py-3 sm:py-3.5 text-base min-h-[48px] focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground/50"
            placeholder="••••••••"
          />
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-3xl bg-lime text-lime-foreground py-4 text-base sm:text-lg font-extrabold min-h-[52px] shadow-[0_15px_40px_-15px_oklch(0.92_0.18_125/0.6)] active:scale-[0.98] transition disabled:opacity-50"
        >
          {loading ? "נרשם..." : "הרשמה"}
        </button>

        <p className="text-center text-sm text-muted-foreground">
          כבר רשום?{" "}
          <Link to="/login" className="text-primary font-bold hover:underline">
            התחבר
          </Link>
        </p>
      </form>
    </div>
  );
}
