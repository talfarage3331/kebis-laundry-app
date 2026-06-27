import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useLaundry } from "@/lib/laundry-store";
import { useBrand } from "@/hooks/use-brand";
import { Flower2, Building2, Store } from "lucide-react";
import { toast } from "sonner";
import { auth, db, googleProvider } from "@/lib/firebase";
import {
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  createUserWithEmailAndPassword,
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
import { generateSlug } from "@/lib/slug";

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

export const Route = createFileRoute("/login")({
  component: Login,
  validateSearch: (search: Record<string, unknown>): { laundryId?: string; slug?: string } => ({
    laundryId: typeof search.laundryId === "string" ? search.laundryId : undefined,
    slug: typeof search.slug === "string" ? search.slug : undefined,
  }),
});

/** Ensure the generated slug is unique — append a short suffix if needed */
async function ensureUniqueSlug(base: string): Promise<string> {
  let candidate = base;
  let attempt = 0;
  while (attempt < 10) {
    const q = query(collection(db, "users"), where("shopSlug", "==", candidate));
    const snap = await getDocs(q);
    if (snap.empty) return candidate;
    attempt++;
    candidate = `${base}-${attempt}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}

function Login() {
  const { user, loading: authLoading, isProfileReady, role, isRoleLoading } = useLaundry();
  const { laundryId, slug } = Route.useSearch();
  const navigate = useNavigate();

  // ── Brand assets (white-labeling when slug is present) ────────────────────
  const { brandName, brandLogoUrl, brandColor, isLoading: isBrandLoading } = useBrand(slug);

  // ── View state: "login" or "register-laundry" ─────────────────────────────
  const [view, setView] = useState<"login" | "register-laundry">("login");

  // ── Shared form state ─────────────────────────────────────────────────────
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // ── Laundry registration fields ───────────────────────────────────────────
  const [name, setName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [businessNameError, setBusinessNameError] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && laundryId) {
      localStorage.setItem("activeLaundryId", laundryId);
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "activeLaundryId",
          newValue: laundryId,
        })
      );
    }
  }, [laundryId]);

  useEffect(() => {
    if (typeof window !== "undefined" && slug) {
      localStorage.setItem("pendingLaundrySlug", slug);
    }
  }, [slug]);

  useEffect(() => {
    if (typeof window !== "undefined" && laundryId) {
      localStorage.setItem("pendingLaundryId", laundryId);
    }
  }, [laundryId]);

  // ── Redirect already-authenticated users ─────────────────────────────────
  useEffect(() => {
    if (user && !authLoading && isProfileReady && !isRoleLoading) {
      const currentRole = user.role || role || "customer";
      if (currentRole === "admin") {
        navigate({ to: "/admin" });
      } else if (currentRole === "laundry") {
        navigate({ to: "/laundry-dashboard" });
      } else {
        // Resolve shop to redirect customer into
        const cachedSlug = typeof window !== "undefined" ? localStorage.getItem("pendingLaundrySlug") : null;
        const cachedId   = typeof window !== "undefined" ? localStorage.getItem("pendingLaundryId") : null;
        const activeSlug = typeof window !== "undefined" ? localStorage.getItem("activeLaundrySlug") : null;
        const targetSlug = slug || cachedSlug || cachedId || activeSlug;
        if (targetSlug) {
          if (typeof window !== "undefined") {
            localStorage.removeItem("pendingLaundrySlug");
            localStorage.removeItem("pendingLaundryId");
          }
          navigate({ to: "/shop/$slug", params: { slug: targetSlug } });
        } else {
          navigate({ to: "/" });
        }
      }
    }
  }, [user, authLoading, isProfileReady, isRoleLoading, role, navigate, slug]);

  // ─────────────────────────────────────────────────────────────────────────
  // LOGIN VIEW handlers
  // ─────────────────────────────────────────────────────────────────────────

  // Fix #2: Google guard ONLY applies when view === "login"
  const signInWithGoogleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const fbUser = result.user;
      if (fbUser) {
        const userDoc = await getDoc(doc(db, "users", fbUser.uid));
        if (!userDoc.exists()) {
          // Block — this is the login view, not registration
          await signOut(auth);
          toast.error(
            "לא נמצא חשבון קיים במערכת. הרשמה כלקוח מתאפשרת רק דרך לינק ייעודי של המכבסה.",
            { duration: 6000 }
          );
          return;
        }

        const existingRole = userDoc.data().role || "customer";
        toast.success("התחברת בהצלחה");

        if (existingRole === "admin") {
          navigate({ to: "/admin" });
        } else if (existingRole === "laundry") {
          navigate({ to: "/laundry-dashboard" });
        } else {
          // Fix #1: redirect to shop if slug present
          const cachedSlug = typeof window !== "undefined" ? localStorage.getItem("pendingLaundrySlug") : null;
          const cachedId   = typeof window !== "undefined" ? localStorage.getItem("pendingLaundryId") : null;
          const activeSlug = typeof window !== "undefined" ? localStorage.getItem("activeLaundrySlug") : null;
          const targetSlug = slug || cachedSlug || cachedId || activeSlug;
          if (targetSlug) {
            if (typeof window !== "undefined") {
              localStorage.removeItem("pendingLaundrySlug");
              localStorage.removeItem("pendingLaundryId");
            }
            navigate({ to: "/shop/$slug", params: { slug: targetSlug } });
          } else {
            navigate({ to: "/" });
          }
        }
      }
    } catch (error: unknown) {
      const err = error as { code?: string; message?: string };
      if (err.code !== "auth/popup-closed-by-user") {
        console.error("Error logging in with Google:", err.message);
        toast.error("התחברות עם גוגל נכשלה: " + err.message);
      }
    }
  };

  const submitLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return toast.error("יש למלא את כל השדות");

    setLoading(true);
    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      const fbUser = result.user;

      const userDoc = await getDoc(doc(db, "users", fbUser.uid));

      if (!userDoc.exists()) {
        await signOut(auth);
        setLoading(false);
        return toast.error("משתמש זה אינו קיים במערכת. אנא עבר לדף ההרשמה.");
      }

      const existingRole = userDoc.data().role || "customer";
      setLoading(false);
      toast.success("התחברת בהצלחה");

      if (existingRole === "admin") {
        navigate({ to: "/admin" });
      } else if (existingRole === "laundry") {
        navigate({ to: "/laundry-dashboard" });
      } else {
        // Fix #1: redirect to shop if slug present
        const cachedSlug = typeof window !== "undefined" ? localStorage.getItem("pendingLaundrySlug") : null;
        const cachedId   = typeof window !== "undefined" ? localStorage.getItem("pendingLaundryId") : null;
        const activeSlug = typeof window !== "undefined" ? localStorage.getItem("activeLaundrySlug") : null;
        const targetSlug = slug || cachedSlug || cachedId || activeSlug;
        if (targetSlug) {
          if (typeof window !== "undefined") {
            localStorage.removeItem("pendingLaundrySlug");
            localStorage.removeItem("pendingLaundryId");
          }
          navigate({ to: "/shop/$slug", params: { slug: targetSlug } });
        } else {
          navigate({ to: "/" });
        }
      }
    } catch (error: unknown) {
      setLoading(false);
      const err = error as { code?: string; message?: string };
      const code = err?.code ?? "";
      if (
        code === "auth/invalid-credential" ||
        code === "auth/user-not-found" ||
        code === "auth/wrong-password"
      ) {
        return toast.error("משתמש זה אינו קיים במערכת. אנא עבר לדף ההרשמה.");
      }
      return toast.error(err.message ?? "שגיאה בהתחברות");
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // LAUNDRY REGISTRATION VIEW handlers
  // ─────────────────────────────────────────────────────────────────────────

  // Fix #2: When view === "register-laundry", Google acts as registration — no block
  const signInWithGoogleRegisterLaundry = async () => {
    if (!businessName.trim()) {
      setBusinessNameError(true);
      return toast.error("חובה להזין את שם העסק לפני ההרשמה עם גוגל.");
    }

    setLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const fbUser = result.user;

      if (!fbUser) {
        setLoading(false);
        return;
      }

      const userDocRef = doc(db, "users", fbUser.uid);
      const userDoc = await getDoc(userDocRef);

      if (userDoc.exists()) {
        // Returning user — log them in normally
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

      // New laundry owner via Google — provision vendor profile
      const displayName = fbUser.displayName || fbUser.email?.split("@")[0] || "בעל מכבסה";
      const baseSlug = generateSlug(businessName.trim() || displayName);
      const uniqueSlug = await ensureUniqueSlug(baseSlug);

      await setDoc(userDocRef, {
        fullName: displayName,
        email: fbUser.email || "",
        role: "laundry",
        status: "pending_approval",
        businessName: businessName.trim(),
        shopSlug: uniqueSlug,
        slug: uniqueSlug,
        createdAt: serverTimestamp(),
      });

      setLoading(false);
      toast.success("נרשמת בהצלחה — ממתין לאישור המנהל");
      navigate({ to: "/laundry-dashboard" });
    } catch (error: unknown) {
      setLoading(false);
      const err = error as { code?: string; message?: string };
      if (err.code !== "auth/popup-closed-by-user") {
        toast.error("התחברות עם גוגל נכשלה: " + err.message);
      }
    }
  };

  const submitRegisterLaundry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !password) return toast.error("יש למלא את כל השדות");
    if (!businessName.trim()) {
      setBusinessNameError(true);
      return toast.error("יש להזין שם עסק");
    }

    setLoading(true);
    try {
      const result = await createUserWithEmailAndPassword(auth, email, password);
      const fbUser = result.user;

      await updateProfile(fbUser, { displayName: name });

      const assignedRole = email === "talfarage3331@gmail.com" ? "admin" : "laundry";

      const baseSlug = generateSlug(businessName.trim() || name);
      const uniqueSlug = await ensureUniqueSlug(baseSlug);

      await setDoc(doc(db, "users", fbUser.uid), {
        fullName: name,
        email: email,
        role: assignedRole,
        status: "pending_approval",
        businessName: businessName.trim(),
        shopSlug: uniqueSlug,
        slug: uniqueSlug,
        createdAt: serverTimestamp(),
      });

      setLoading(false);
      toast.success("נרשמת בהצלחה — ממתין לאישור המנהל");

      if (assignedRole === "admin") {
        navigate({ to: "/admin" });
      } else {
        navigate({ to: "/laundry-dashboard" });
      }
    } catch (error: unknown) {
      setLoading(false);
      const err = error as { message?: string };
      return toast.error(err.message ?? "שגיאה בהרשמה");
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  // ── LOGIN VIEW ────────────────────────────────────────────────────────────
  // Resolved brand values — fall back to Kebis defaults
  const headerBg    = brandColor || "var(--primary)";
  const headerName  = brandName  || "כביסה";
  const btnBg       = brandColor || "";

  if (view === "login") {
    return (
      <div className="min-h-[100dvh] bg-background flex flex-col overflow-x-hidden" dir="rtl">
        <div
          className="text-white rounded-b-[2rem] sm:rounded-b-[2.5rem] px-4 sm:px-6 pt-safe-auth pb-8 sm:pb-12"
          style={{ backgroundColor: headerBg }}
        >
          <div className="mx-auto max-w-md flex items-center gap-3">
            <div className="size-10 sm:size-12 rounded-full bg-white/15 grid place-items-center shrink-0 overflow-hidden">
              {brandLogoUrl ? (
                <img
                  src={brandLogoUrl}
                  alt={headerName}
                  className="size-full object-cover rounded-full"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                />
              ) : (
                <Flower2 className="size-5 sm:size-6" strokeWidth={1.75} />
              )}
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-extrabold">{headerName}</h1>
              <p className="text-xs sm:text-sm opacity-80">
                {brandName ? `ברוכים הבאים ל${brandName}` : "ברוכים השבים"}
              </p>
            </div>
          </div>
        </div>

        <form
          onSubmit={submitLogin}
          className="mx-auto max-w-md w-full px-4 sm:px-6 mt-6 sm:mt-8 space-y-4 flex-1 pb-8"
        >
          <div>
            <label className="text-sm font-semibold">דוא&quot;ל</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5 w-full rounded-2xl border border-border bg-background px-4 py-3 sm:py-3.5 text-base min-h-[48px] focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="name@example.com"
            />
          </div>
          <div>
            <label className="text-sm font-semibold">סיסמה</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1.5 w-full rounded-2xl border border-border bg-background px-4 py-3 sm:py-3.5 text-base min-h-[48px] focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-3xl py-3.5 sm:py-4 text-base sm:text-lg font-extrabold min-h-[48px] active:scale-[0.98] transition disabled:opacity-50"
            style={btnBg
              ? { backgroundColor: btnBg, color: "#fff", boxShadow: `0 15px 40px -15px ${btnBg}99` }
              : { backgroundColor: "oklch(0.92 0.18 125)", color: "var(--lime-foreground)", boxShadow: "0 15px 40px -15px oklch(0.92 0.18 125/0.6)" }
            }
          >
            {loading ? "מתחבר..." : "התחברות"}
          </button>
          <button
            type="button"
            onClick={signInWithGoogleLogin}
            className="w-full mt-2 flex items-center justify-center gap-2 rounded-3xl bg-white text-gray-800 py-3.5 sm:py-4 text-base sm:text-lg font-semibold min-h-[48px] shadow-md hover:bg-gray-100 transition"
          >
            <GoogleIcon className="size-5" />
            התחברות עם Google
          </button>

          {/* Fix #3: Link to switch back when in login view (link to register-laundry) */}
          <div className="border-t border-border pt-4 flex flex-col gap-2 text-center">
            <button
              type="button"
              onClick={() => {
                setView("register-laundry");
                setEmail("");
                setPassword("");
              }}
              className="w-full rounded-2xl bg-[hsl(270,60%,35%)]/10 text-[hsl(270,60%,35%)] border border-[hsl(270,60%,35%)]/20 py-3 text-sm font-extrabold hover:bg-[hsl(270,60%,35%)] hover:text-white active:scale-[0.98] transition flex items-center justify-center gap-2 min-h-[48px]"
            >
              <Store className="size-4" />
              הרשם כמכבסה חדשה
            </button>
            {(slug || laundryId) && (
              <Link
                to="/signup"
                search={slug ? { slug } : { laundryId }}
                className="text-sm text-primary font-bold hover:underline mt-1"
              >
                הרשמה כלקוח דרך הקישור שלך
              </Link>
            )}
          </div>
        </form>
      </div>
    );
  }

  // ── LAUNDRY REGISTER VIEW ─────────────────────────────────────────────────
  return (
    <div className="min-h-[100dvh] bg-background flex flex-col overflow-x-hidden" dir="rtl">
      <div className="bg-[hsl(270,60%,35%)] text-white rounded-b-[2rem] px-4 sm:px-6 pt-safe-auth pb-8 sm:pb-12">
        <div className="mx-auto max-w-md flex items-center gap-3">
          <div className="size-10 sm:size-12 rounded-full bg-white/15 grid place-items-center shrink-0">
            <Store className="size-5 sm:size-6" strokeWidth={1.75} />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-extrabold">כביסה</h1>
            <p className="text-xs sm:text-sm opacity-80">הרשמת עסק חדש</p>
          </div>
        </div>
      </div>

      <form
        onSubmit={submitRegisterLaundry}
        className="mx-auto max-w-md w-full px-4 sm:px-6 mt-5 space-y-4 flex-1 pb-10"
      >
        {/* Pending approval notice */}
        <div className="animate-in slide-in-from-top-2 duration-200 rounded-2xl bg-amber-50 border border-amber-200 p-3.5 flex gap-3 items-start">
          <span className="text-lg shrink-0 mt-0.5">⏳</span>
          <p className="text-xs text-amber-700 font-semibold leading-relaxed">
            לאחר ההרשמה, החשבון שלך יהיה ממתין לאישור המנהל הראשי.
            תקבל גישה מלאה לפאנל הניהול מיד לאחר האישור.
          </p>
        </div>

        {/* Business name — FIRST */}
        <div className="animate-in slide-in-from-top-3 duration-300">
          <label className={`text-sm font-semibold flex items-center gap-1.5 ${businessNameError ? "text-destructive" : "text-foreground"}`}>
            <Building2 className={`size-3.5 ${businessNameError ? "text-destructive" : "text-[hsl(270,60%,35%)]"}`} />
            שם העסק / המכבסה
            <span className="text-destructive text-base leading-none">*</span>
          </label>
          <input
            value={businessName}
            onChange={(e) => {
              setBusinessName(e.target.value);
              if (e.target.value.trim()) setBusinessNameError(false);
            }}
            className={`mt-1.5 w-full rounded-2xl border bg-background px-4 py-3 sm:py-3.5 text-base min-h-[48px] focus:outline-none focus:ring-2 placeholder:text-muted-foreground/50 transition-colors ${
              businessNameError
                ? "border-destructive focus:ring-destructive/40 bg-destructive/5"
                : "border-border focus:ring-[hsl(270,60%,35%)]"
            }`}
            placeholder="מכבסת כביסה פרמיום"
          />
          {businessNameError && (
            <p className="mt-1 text-[11px] text-destructive font-semibold">
              שדה חובה — נדרש לפני ההרשמה עם גוגל או דוא&quot;ל.
            </p>
          )}
          {businessName && !businessNameError && (
            <p className="mt-1.5 text-[11px] text-muted-foreground bg-muted/40 px-3 py-1.5 rounded-xl">
              קישור החנות שלך:{" "}
              <span className="font-bold text-[hsl(270,60%,35%)]">
                /shop/{generateSlug(businessName)}
              </span>
            </p>
          )}
        </div>

        {/* Google button — laundry registration, no block guard */}
        <button
          type="button"
          onClick={signInWithGoogleRegisterLaundry}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2.5 rounded-3xl bg-white text-gray-800 border border-gray-200 py-3.5 text-sm font-bold min-h-[48px] shadow-sm hover:bg-gray-50 active:scale-[0.98] transition disabled:opacity-50"
        >
          <GoogleIcon className="size-4.5" />
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
            className="mt-1.5 w-full rounded-2xl border border-border bg-background px-4 py-3 sm:py-3.5 text-base min-h-[48px] focus:outline-none focus:ring-2 focus:ring-[hsl(270,60%,35%)] placeholder:text-muted-foreground/50"
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
            className="mt-1.5 w-full rounded-2xl border border-border bg-background px-4 py-3 sm:py-3.5 text-base min-h-[48px] focus:outline-none focus:ring-2 focus:ring-[hsl(270,60%,35%)] placeholder:text-muted-foreground/50"
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
            className="mt-1.5 w-full rounded-2xl border border-border bg-background px-4 py-3 sm:py-3.5 text-base min-h-[48px] focus:outline-none focus:ring-2 focus:ring-[hsl(270,60%,35%)] placeholder:text-muted-foreground/50"
            placeholder="••••••••"
          />
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-3xl bg-[hsl(270,60%,35%)] text-white py-4 text-base sm:text-lg font-extrabold min-h-[52px] shadow-[0_15px_40px_-15px_hsl(270,60%,35%,0.6)] active:scale-[0.98] transition disabled:opacity-50"
        >
          {loading ? "נרשם..." : "הרשמה כבעל מכבסה"}
        </button>

        {/* Fix #3: Link back to login view */}
        <p className="text-center text-sm text-muted-foreground">
          כבר יש לך מכבסה?{" "}
          <button
            type="button"
            onClick={() => {
              setView("login");
              setName("");
              setBusinessName("");
              setBusinessNameError(false);
            }}
            className="text-primary font-bold hover:underline"
          >
            התחבר כאן
          </button>
        </p>
      </form>
    </div>
  );
}
