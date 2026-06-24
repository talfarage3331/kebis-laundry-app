import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { useLaundry } from "@/lib/laundry-store";
import { Flower2, Building2 } from "lucide-react";
import { toast } from "sonner";
import { auth, db, googleProvider } from "@/lib/firebase";
import {
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
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
} from "firebase/firestore";

// Custom Google brand icon (inline SVG)
const GoogleIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 533.5 544.3" xmlns="http://www.w3.org/2000/svg" fill="currentColor" {...props}>
    <path
      d="M533.5 278.4c0-17.7-1.6-35-4.6-51.8H272v97.9h146.9c-6.3 34.1-25.5 63-54.3 82.4v68h87.8c51.4-47.4 80.9-117.3 80.9-196.5z"
      fill="#4285F4"
    />
    <path
      d="M272 544.3c73.4 0 135-24.3 180-66.1l-87.8-68c-24.4 16.4-55.6 26-92.2 26-70.9 0-131-47.9-152.5-112.4h-90.9v70.6c45.4 89.8 138.3 149.9 243.4 149.9z"
      fill="#34A853"
    />
    <path
      d="M119.5 323.8c-10.4-30.9-10.4-64.1 0-95l-90.9-70.6c-38.3 74.6-38.3 162.6 0 237.2l90.9-71.6z"
      fill="#FBBC05"
    />
    <path
      d="M272 107.9c39.7-.6 78 13.7 107.5 39.4l80.7-80.7C408.7 21.3 342.4-1.7 272 0 166.9 0 74 60.1 28.6 149.9l90.9 71.6C141 155.8 201.1 107.9 272 107.9z"
      fill="#EA4335"
    />
  </svg>
);

export const Route = createFileRoute("/signup")({
  component: Signup,
  validateSearch: (search: Record<string, unknown>): { slug?: string } => ({
    slug: typeof search.slug === "string" ? search.slug : undefined,
  }),
});

function Signup() {
  const { user, loading: authLoading, isProfileReady, role, isRoleLoading } = useLaundry();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const { slug: urlSlug } = Route.useSearch();

  const [activeLaundryId, setActiveLaundryId] = useState<string | null>(null);
  const [resolvedLaundryName, setResolvedLaundryName] = useState<string | null>(null);

  const [isResolvingSlug, setIsResolvingSlug] = useState(() => {
    if (typeof window === "undefined") return false;
    return !!urlSlug;
  });

  const pendingActionRef = useRef<((resolvedId: string | null) => void) | null>(null);

  // ── Async: resolve vendor ID from slug ───────────────────────────────────
  useEffect(() => {
    const slug = urlSlug;

    if (!slug) {
      setIsResolvingSlug(false);
      return;
    }

    // If we already resolved this exact slug, skip
    const cachedSlug = typeof window !== "undefined" ? localStorage.getItem("activeLaundrySlug") : null;
    const cachedId = typeof window !== "undefined" ? localStorage.getItem("activeLaundryId") : null;
    if (cachedId && cachedSlug === slug) {
      setActiveLaundryId(cachedId);
      setResolvedLaundryName(
        typeof window !== "undefined" ? localStorage.getItem("activeLaundryName") : null
      );
      setIsResolvingSlug(false);
      // Execute any buffered submit
      if (pendingActionRef.current) {
        const action = pendingActionRef.current;
        pendingActionRef.current = null;
        action(cachedId);
      }
      return;
    }

    let cancelled = false;
    setIsResolvingSlug(true);

    async function resolveFromSlug() {
      try {
        // Laundry businesses are stored in the 'users' collection with
        // 'shopSlug' as the primary slug field (and 'slug' as a legacy alias).
        // Try shopSlug first, fall back to slug.
        let snap = await getDocs(
          query(collection(db, "users"), where("shopSlug", "==", slug)),
        );
        if (snap.empty) {
          snap = await getDocs(
            query(collection(db, "users"), where("slug", "==", slug)),
          );
        }
        if (!cancelled) {
          if (!snap.empty) {
            const vendorDoc = snap.docs[0];
            const data = vendorDoc.data();
            const vendorId = vendorDoc.id;
            const vendorName: string =
              data.businessName || data.name || data.fullName || "מכבסה";
            const vendorSlug: string = data.shopSlug || data.slug || slug;

            localStorage.setItem("activeLaundryId", vendorId);
            localStorage.setItem("activeLaundryName", vendorName);
            localStorage.setItem("activeLaundrySlug", vendorSlug);
            setActiveLaundryId(vendorId);
            setResolvedLaundryName(vendorName);

            window.dispatchEvent(
              new StorageEvent("storage", { key: "activeLaundryId", newValue: vendorId })
            );
            window.dispatchEvent(
              new StorageEvent("storage", { key: "activeLaundryName", newValue: vendorName })
            );
            window.dispatchEvent(
              new StorageEvent("storage", { key: "activeLaundrySlug", newValue: vendorSlug })
            );

            if (pendingActionRef.current) {
              const action = pendingActionRef.current;
              pendingActionRef.current = null;
              action(vendorId);
            }
          } else {
            console.warn("[signup] No laundry found for slug:", slug);
            if (pendingActionRef.current) {
              const action = pendingActionRef.current;
              pendingActionRef.current = null;
              action(null);
            }
          }
        }
      } catch (err) {
        console.warn("[signup] Failed to resolve slug:", err);
        if (!cancelled && pendingActionRef.current) {
          const action = pendingActionRef.current;
          pendingActionRef.current = null;
          action(null);
        }
      } finally {
        if (!cancelled) {
          setIsResolvingSlug(false);
        }
      }
    }

    resolveFromSlug();
    return () => {
      cancelled = true;
    };
  }, [urlSlug]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Redirect already-authenticated users ─────────────────────────────────
  useEffect(() => {
    if (user && !authLoading && isProfileReady && !isRoleLoading) {
      const currentRole = user.role || role || "customer";
      if (currentRole === "admin") {
        navigate({ to: "/admin" });
      } else if (currentRole === "laundry") {
        navigate({ to: "/laundry-dashboard" });
      } else {
        navigate({ to: "/" });
      }
    }
  }, [user, authLoading, isProfileReady, isRoleLoading, role, navigate]);

  // ─── BLOCKED SCREEN: no slug in URL ──────────────────────────────────────
  if (!urlSlug) {
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
              <p className="text-xs opacity-80">הרשמה</p>
            </div>
          </div>
        </div>

        {/* Blocked body */}
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
            <Link
              to="/login"
              className="w-full rounded-2xl bg-primary text-primary-foreground py-3 text-sm font-extrabold shadow-md hover:opacity-90 active:scale-[0.98] transition flex items-center justify-center min-h-[48px]"
            >
              התחבר לחשבון קיים
            </Link>
            <Link
              to="/"
              className="w-full rounded-2xl bg-background border border-border text-foreground py-3 text-sm font-extrabold hover:bg-muted active:scale-[0.98] transition flex items-center justify-center min-h-[48px]"
            >
              חזרה לדף הבית
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ─── MAIN CUSTOMER SIGNUP FORM ────────────────────────────────────────────

  // ── Email/password signup ─────────────────────────────────────────────────
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !password) return toast.error("יש למלא את כל השדות");

    const performSubmit = async (resolvedId: string | null) => {
      if (!resolvedId) {
        setLoading(false);
        return toast.error("לא ניתן היה לזהות את המכבסה. אנא נסה שוב דרך הקישור המקורי.");
      }

      setLoading(true);
      try {
        const result = await createUserWithEmailAndPassword(auth, email, password);
        const fbUser = result.user;

        await updateProfile(fbUser, { displayName: name });

        const assignedRole = email === "talfarage3331@gmail.com" ? "admin" : "customer";

        const docData: Record<string, unknown> = {
          fullName: name,
          email: email,
          role: assignedRole,
          associatedLaundryId: resolvedId,
          createdAt: serverTimestamp(),
        };

        await setDoc(doc(db, "users", fbUser.uid), docData);

        setLoading(false);
        toast.success("נרשמת בהצלחה");

        if (assignedRole === "admin") {
          navigate({ to: "/admin" });
        } else {
          navigate({ to: "/" });
        }
      } catch (error: unknown) {
        setLoading(false);
        const msg = error instanceof Error ? error.message : String(error);
        return toast.error(msg);
      }
    };

    // If slug is still resolving, buffer the submit
    if (!activeLaundryId) {
      if (urlSlug && isResolvingSlug) {
        setLoading(true);
        pendingActionRef.current = (resolvedId) => {
          performSubmit(resolvedId);
        };
        return;
      }
      return toast.error("לא ניתן היה לזהות את המכבסה. אנא נסה שוב דרך הקישור המקורי.");
    }

    performSubmit(activeLaundryId);
  };

  // ── Google signup ─────────────────────────────────────────────────────────
  // Fix #4: Disable the Google button while slug is still resolving
  const signInWithGoogle = async () => {
    if (isResolvingSlug) {
      // Buffer: wait for slug resolution then run
      setLoading(true);
      pendingActionRef.current = (resolvedId) => {
        performGoogleSignup(resolvedId);
      };
      return;
    }

    const resolvedId = activeLaundryId;
    if (!resolvedId) {
      return toast.error("לא ניתן היה לזהות את המכבסה. אנא נסה שוב דרך הקישור המקורי.");
    }

    performGoogleSignup(resolvedId);
  };

  const performGoogleSignup = async (resolvedId: string | null) => {
    setLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const fbUser = result.user;

      if (!fbUser) {
        setLoading(false);
        return;
      }

      // Check if Firestore profile already exists (returning user)
      const userDocRef = doc(db, "users", fbUser.uid);
      const userDoc = await getDoc(userDocRef);

      if (userDoc.exists()) {
        // Returning user: log in normally
        const existingRole = userDoc.data().role || "customer";
        toast.success("התחברת בהצלחה");
        setLoading(false);

        if (existingRole === "admin") {
          navigate({ to: "/admin" });
        } else if (existingRole === "laundry") {
          navigate({ to: "/laundry-dashboard" });
        } else {
          navigate({ to: "/" });
        }
        return;
      }

      // New user via Google
      if (!resolvedId) {
        await signOut(auth);
        setLoading(false);
        toast.error(
          "לא נמצא חשבון קיים במערכת. הרשמה כלקוח מתאפשרת רק דרך לינק ייעודי של המכבסה.",
          { duration: 6000 }
        );
        return;
      }

      const displayName = fbUser.displayName || fbUser.email?.split("@")[0] || "לקוח";
      await setDoc(userDocRef, {
        fullName: displayName,
        email: fbUser.email || "",
        role: "customer",
        associatedLaundryId: resolvedId,
        createdAt: serverTimestamp(),
      });

      setLoading(false);
      toast.success("נרשמת בהצלחה");
      navigate({ to: "/" });
    } catch (error: unknown) {
      setLoading(false);
      if (error instanceof Error && (error as { code?: string }).code !== "auth/popup-closed-by-user") {
        toast.error("התחברות עם גוגל נכשלה: " + error.message);
      }
    }
  };

  const isGoogleDisabled = loading || isResolvingSlug;

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col overflow-x-hidden" dir="rtl">

      {/* ── Header ── */}
      <div className="bg-primary text-primary-foreground rounded-b-[2rem] px-4 sm:px-6 pt-safe-auth pb-10">
        <div className="mx-auto max-w-md flex items-center gap-3">
          <div className="size-10 rounded-full bg-primary-foreground/15 grid place-items-center shrink-0">
            <Flower2 className="size-5" strokeWidth={1.75} />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold">כביסה</h1>
            <p className="text-xs opacity-80">
              {isResolvingSlug
                ? "טוען פרטי מכבסה..."
                : resolvedLaundryName
                ? `הצטרפות ל${resolvedLaundryName}`
                : "הצטרפו אלינו"}
            </p>
          </div>
        </div>
      </div>

      {/* ── Form body ── */}
      <form
        onSubmit={submit}
        className="mx-auto max-w-md w-full px-4 sm:px-6 mt-5 space-y-4 flex-1 pb-10"
      >
        {/* Resolving indicator */}
        {isResolvingSlug && (
          <div className="animate-in slide-in-from-top-2 duration-200 rounded-2xl bg-blue-50 border border-blue-200 p-3.5 flex gap-3 items-start">
            <span className="text-lg shrink-0 mt-0.5">⏳</span>
            <p className="text-xs text-blue-700 font-semibold leading-relaxed">
              מאמת פרטי מכבסה...
            </p>
          </div>
        )}

        {/* Google button */}
        <button
          type="button"
          onClick={signInWithGoogle}
          disabled={isGoogleDisabled}
          className="w-full flex items-center justify-center gap-2.5 rounded-3xl bg-white text-gray-800 border border-gray-200 py-3.5 text-sm font-bold min-h-[48px] shadow-sm hover:bg-gray-50 active:scale-[0.98] transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <GoogleIcon className="size-4.5" />
          {isResolvingSlug ? "ממתין לאימות..." : "המשך עם Google"}
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
