import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useLaundry } from "@/lib/laundry-store";
import { Flower2, Building2, User, Store } from "lucide-react";
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

export const Route = createFileRoute("/signup")({
  component: Signup,
  validateSearch: (search: Record<string, unknown>): { laundryId?: string } => ({
    laundryId: typeof search.laundryId === "string" ? search.laundryId : undefined,
  }),
});

function Signup() {
  const { user, loading: authLoading, isProfileReady, role, isRoleLoading } = useLaundry();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [selectedRole, setSelectedRole] = useState<"customer" | "laundry">("customer");
  const [businessName, setBusinessName] = useState("");
  const [loading, setLoading] = useState(false);
  const [businessNameError, setBusinessNameError] = useState(false);

  const { laundryId: urlLaundryId } = Route.useSearch();

  const [activeLaundryId, setActiveLaundryId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const localId = localStorage.getItem("activeLaundryId");
    if (localId) return localId;
    if (urlLaundryId) {
      localStorage.setItem("activeLaundryId", urlLaundryId);
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "activeLaundryId",
          newValue: urlLaundryId,
        })
      );
      return urlLaundryId;
    }
    return null;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const checkId = urlLaundryId || localStorage.getItem("activeLaundryId");
    if (checkId && checkId !== activeLaundryId) {
      setActiveLaundryId(checkId);
      localStorage.setItem("activeLaundryId", checkId);
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "activeLaundryId",
          newValue: checkId,
        })
      );

      const localName = localStorage.getItem("activeLaundryName");
      if (!localName) {
        getDoc(doc(db, "users", checkId))
          .then((snap) => {
            if (snap.exists()) {
              const data = snap.data();
              const vendorName = data.businessName || data.fullName || data.name || "מכבסה";
              const vendorSlug = data.shopSlug || "";
              localStorage.setItem("activeLaundryName", vendorName);
              localStorage.setItem("activeLaundrySlug", vendorSlug);
              window.dispatchEvent(
                new StorageEvent("storage", {
                  key: "activeLaundryName",
                  newValue: vendorName,
                })
              );
              window.dispatchEvent(
                new StorageEvent("storage", {
                  key: "activeLaundrySlug",
                  newValue: vendorSlug,
                })
              );
            }
          })
          .catch((err) => console.warn("[signup] failed to fetch laundry name for guard:", err));
      }
    }
  }, [urlLaundryId, activeLaundryId]);

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

  // ── Email/password signup ─────────────────────────────────────────────────
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !password) return toast.error("יש למלא את כל השדות");
    if (selectedRole === "laundry" && !businessName.trim()) {
      setBusinessNameError(true);
      return toast.error("יש להזין שם עסק");
    }
    const finalLaundryId = activeLaundryId || urlLaundryId;
    if (selectedRole === "customer" && !finalLaundryId) {
      return toast.error("ההרשמה כלקוח מתאפשרת רק דרך קישור ייעודי של המכבסה.");
    }

    setLoading(true);
    try {
      const result = await createUserWithEmailAndPassword(auth, email, password);
      const fbUser = result.user;

      await updateProfile(fbUser, { displayName: name });

      const assignedRole = email === "talfarage3331@gmail.com" ? "admin" : selectedRole;

      const docData: Record<string, any> = {
        fullName: name,
        email: email,
        role: assignedRole,
        createdAt: serverTimestamp(),
      };

      if (assignedRole === "laundry") {
        const baseSlug = generateSlug(businessName.trim() || name);
        const uniqueSlug = await ensureUniqueSlug(baseSlug);
        docData.shopSlug = uniqueSlug;
        docData.businessName = businessName.trim();
        docData.status = "pending_approval";
      } else if (assignedRole === "customer" && finalLaundryId) {
        docData.associatedLaundryId = finalLaundryId;
      }

      await setDoc(doc(db, "users", fbUser.uid), docData);

      setLoading(false);
      toast.success("נרשמת בהצלחה");

      if (assignedRole === "admin") {
        navigate({ to: "/admin" });
      } else if (assignedRole === "laundry") {
        navigate({ to: "/laundry-dashboard" });
      } else {
        navigate({ to: "/" });
      }
    } catch (error: any) {
      setLoading(false);
      return toast.error(error.message);
    }
  };

  // ── Google signup/login ───────────────────────────────────────────────────
  const signInWithGoogle = async () => {
    // Hard guard: laundry tab requires businessName before opening OAuth popup
    if (selectedRole === "laundry" && !businessName.trim()) {
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

      // Check if Firestore profile already exists (returning user)
      const userDocRef = doc(db, "users", fbUser.uid);
      const userDoc = await getDoc(userDocRef);

      if (userDoc.exists()) {
        // ── Returning user: log in normally ──
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

      // ── New user via Google ──
      if (selectedRole === "laundry") {
        // Provision laundry vendor profile
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
          createdAt: serverTimestamp(),
        });

        setLoading(false);
        toast.success("נרשמת בהצלחה — ממתין לאישור המנהל");
        navigate({ to: "/laundry-dashboard" });
      } else {
        // Customer tab: new Google user
        if (activeLaundryId) {
          const displayName = fbUser.displayName || fbUser.email?.split("@")[0] || "לקוח";
          await setDoc(userDocRef, {
            fullName: displayName,
            email: fbUser.email || "",
            role: "customer",
            associatedLaundryId: activeLaundryId,
            createdAt: serverTimestamp(),
          });
          setLoading(false);
          toast.success("נרשמת בהצלחה");
          navigate({ to: "/" });
        } else {
          // No active invite link → block & sign out
          await signOut(auth);
          setLoading(false);
          toast.error(
            "לא נמצא חשבון קיים במערכת. הרשמה כלקוח מתאפשרת רק דרך לינק ייעודי של המכבסה.",
            { duration: 6000 }
          );
        }
      }
    } catch (error: any) {
      setLoading(false);
      if (error.code !== "auth/popup-closed-by-user") {
        toast.error("התחברות עם גוגל נכשלה: " + error.message);
      }
    }
  };

  // ─── BLOCKED SCREEN: Customer without invite link ────────────────────────
  const isBlocked = selectedRole === "customer" && !activeLaundryId && !urlLaundryId;
  if (isBlocked) {
    return (
      <div className="min-h-[100dvh] bg-background flex flex-col overflow-x-hidden" dir="rtl">
        {/* Header */}
        <div className="bg-primary text-primary-foreground rounded-b-[2rem] px-4 sm:px-6 pt-safe-auth pb-10">
          <div className="mx-auto max-w-md flex items-center gap-3 mb-6">
            <div className="size-10 rounded-full bg-primary-foreground/15 grid place-items-center shrink-0">
              <Flower2 className="size-5" strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold">כביסה</h1>
              <p className="text-xs opacity-80">הרשמה</p>
            </div>
          </div>

          {/* Prominent tab bar in header */}
          <div className="mx-auto max-w-md">
            <div className="relative flex bg-primary-foreground/10 rounded-2xl p-1 gap-1">
              <button
                type="button"
                onClick={() => setSelectedRole("customer")}
                className="relative flex-1 flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-black transition-all duration-200 bg-white text-primary shadow-md"
              >
                <User className="size-4" />
                לקוח
              </button>
              <button
                type="button"
                onClick={() => setSelectedRole("laundry")}
                className="relative flex-1 flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-black transition-all duration-200 text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10"
              >
                <Store className="size-4" />
                בעל מכבסה
              </button>
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
            <button
              type="button"
              onClick={() => setSelectedRole("laundry")}
              className="w-full rounded-2xl bg-primary/10 text-primary border border-primary/20 py-3.5 text-sm font-extrabold hover:bg-primary hover:text-primary-foreground active:scale-[0.98] transition flex items-center justify-center gap-2 min-h-[48px]"
            >
              <Store className="size-4" />
              הרשמה כבעל מכבסה
            </button>
            <Link
              to="/login"
              search={urlLaundryId ? { laundryId: urlLaundryId } : undefined}
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

  // ─── MAIN SIGNUP FORM ────────────────────────────────────────────────────
  const isLaundry = selectedRole === "laundry";

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col overflow-x-hidden" dir="rtl">

      {/* ── Header with embedded role tab switcher ── */}
      <div
        className={`text-primary-foreground rounded-b-[2rem] px-4 sm:px-6 pt-safe-auth pb-10 transition-colors duration-300 ${
          isLaundry ? "bg-[hsl(270,60%,35%)]" : "bg-primary"
        }`}
      >
        {/* Logo row */}
        <div className="mx-auto max-w-md flex items-center gap-3 mb-6">
          <div className="size-10 rounded-full bg-primary-foreground/15 grid place-items-center shrink-0">
            <Flower2 className="size-5" strokeWidth={1.75} />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold">כביסה</h1>
            <p className="text-xs opacity-80">
              {isLaundry ? "הרשמת עסק" : "הצטרפו אלינו"}
            </p>
          </div>
        </div>

        {/* ── Prominent role tab bar ── */}
        <div className="mx-auto max-w-md">
          <p className="text-[11px] font-bold text-primary-foreground/60 mb-2 tracking-widest uppercase">
            סוג חשבון
          </p>
          <div className="relative flex bg-black/20 rounded-2xl p-1 gap-1">
            {/* sliding indicator */}
            <div
              className={`absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-xl bg-white shadow-md transition-all duration-250 ease-out ${
                isLaundry ? "translate-x-[-100%] right-1" : "right-1"
              }`}
              aria-hidden="true"
            />

            <button
              id="tab-customer"
              type="button"
              onClick={() => setSelectedRole("customer")}
              className={`relative flex-1 flex items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-black transition-colors duration-200 z-10 ${
                !isLaundry
                  ? "text-primary"
                  : "text-primary-foreground/70 hover:text-primary-foreground"
              }`}
            >
              <User className="size-4 shrink-0" />
              לקוח
            </button>

            <button
              id="tab-laundry"
              type="button"
              onClick={() => { setSelectedRole("laundry"); setBusinessNameError(false); }}
              className={`relative flex-1 flex items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-black transition-colors duration-200 z-10 ${
                isLaundry
                  ? "text-[hsl(270,60%,35%)]"
                  : "text-primary-foreground/70 hover:text-primary-foreground"
              }`}
            >
              <Store className="size-4 shrink-0" />
              בעל מכבסה
            </button>
          </div>

          {/* Context label under tabs */}
          <p className="mt-2.5 text-[11px] text-primary-foreground/70 font-semibold text-center">
            {isLaundry
              ? "הרשמה לניהול מכבסה — ממתין לאישור מנהל"
              : "הרשמה דרך קישור ייעודי של המכבסה"}
          </p>
        </div>
      </div>

      {/* ── Form body ── */}
      <form
        onSubmit={submit}
        className="mx-auto max-w-md w-full px-4 sm:px-6 mt-5 space-y-4 flex-1 pb-10"
      >
        {/* Pending approval notice for laundry */}
        {isLaundry && (
          <div className="animate-in slide-in-from-top-2 duration-200 rounded-2xl bg-amber-50 border border-amber-200 p-3.5 flex gap-3 items-start">
            <span className="text-lg shrink-0 mt-0.5">⏳</span>
            <p className="text-xs text-amber-700 font-semibold leading-relaxed">
              לאחר ההרשמה, החשבון שלך יהיה ממתין לאישור המנהל הראשי.
              תקבל גישה מלאה לפאנל הניהול מיד לאחר האישור.
            </p>
          </div>
        )}

        {/* Business name — FIRST for laundry, with error highlight */}
        {isLaundry && (
          <div className="animate-in slide-in-from-top-3 duration-300">
            <label className={`text-sm font-semibold flex items-center gap-1.5 ${businessNameError ? "text-destructive" : "text-foreground"}`}>
              <Building2 className={`size-3.5 ${businessNameError ? "text-destructive" : "text-primary"}`} />
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
                  : "border-border focus:ring-primary"
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
                <span className="font-bold text-primary">
                  /shop/{generateSlug(businessName)}
                </span>
              </p>
            )}
          </div>
        )}

        {/* Google button — placed prominently for laundry, with business name gate */}
        {isLaundry && (
          <button
            type="button"
            onClick={signInWithGoogle}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2.5 rounded-3xl bg-white text-gray-800 border border-gray-200 py-3.5 text-sm font-bold min-h-[48px] shadow-sm hover:bg-gray-50 active:scale-[0.98] transition disabled:opacity-50"
          >
            <GoogleIcon className="size-4.5" />
            המשך עם Google
          </button>
        )}

        {isLaundry && (
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-[11px] text-muted-foreground font-semibold">או הרשמה עם אימייל</span>
            <div className="flex-1 h-px bg-border" />
          </div>
        )}

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
          {loading ? "נרשם..." : isLaundry ? "הרשמה כבעל מכבסה" : "הרשמה"}
        </button>

        <p className="text-center text-sm text-muted-foreground">
          כבר רשום?{" "}
          <Link to="/login" search={urlLaundryId ? { laundryId: urlLaundryId } : undefined} className="text-primary font-bold hover:underline">
            התחבר
          </Link>
        </p>
      </form>
    </div>
  );
}
