import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useLaundry } from "@/lib/laundry-store";
import { Flower2, Building2 } from "lucide-react";
import { toast } from "sonner";
import { auth, db } from "@/lib/firebase";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { doc, setDoc, serverTimestamp, collection, query, where, getDocs } from "firebase/firestore";
import { generateSlug } from "@/lib/slug";

export const Route = createFileRoute("/signup")({ component: Signup });

function Signup() {
  const { user, loading: authLoading, isProfileReady, role, isRoleLoading } = useLaundry();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [selectedRole, setSelectedRole] = useState<"customer" | "laundry">("customer");
  const [businessName, setBusinessName] = useState("");
  const [loading, setLoading] = useState(false);

  const [activeLaundryId, setActiveLaundryId] = useState<string | null>(() =>
    typeof window !== "undefined" ? localStorage.getItem("activeLaundryId") : null
  );

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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !password) return toast.error("יש למלא את כל השדות");
    if (selectedRole === "laundry" && !businessName.trim()) {
      return toast.error("יש להזין שם עסק");
    }

    setLoading(true);
    try {
      const result = await createUserWithEmailAndPassword(auth, email, password);
      const fbUser = result.user;

      // Update Auth display name
      await updateProfile(fbUser, { displayName: name });

      const assignedRole = email === "talfarage3331@gmail.com" ? "admin" : selectedRole;

      const docData: Record<string, any> = {
        fullName: name,
        email: email,
        role: assignedRole,
        createdAt: serverTimestamp(),
      };

      // For laundry vendors, generate & persist a unique shopSlug
      if (assignedRole === "laundry") {
        const baseSlug = generateSlug(businessName.trim() || name);
        const uniqueSlug = await ensureUniqueSlug(baseSlug);
        docData.shopSlug = uniqueSlug;
        docData.businessName = businessName.trim();
      } else if (assignedRole === "customer" && activeLaundryId) {
        docData.associatedLaundryId = activeLaundryId;
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

  if (!activeLaundryId) {
    return (
      <div className="min-h-[100dvh] bg-background flex flex-col overflow-x-hidden" dir="rtl">
        <div className="bg-primary text-primary-foreground rounded-b-[2rem] sm:rounded-b-[2.5rem] px-4 sm:px-6 pt-safe-auth pb-8 sm:pb-12">
          <div className="mx-auto max-w-md flex items-center gap-3">
            <div className="size-10 sm:size-12 rounded-full bg-primary-foreground/15 grid place-items-center shrink-0">
              <Flower2 className="size-5 sm:size-6" strokeWidth={1.75} />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-extrabold">כביסה</h1>
              <p className="text-xs sm:text-sm opacity-80">הרשמה חסומה</p>
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-md w-full px-6 mt-12 text-center space-y-6">
          <div className="size-16 rounded-full bg-destructive/10 grid place-items-center mx-auto animate-bounce">
            <Building2 className="size-8 text-destructive" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl sm:text-2xl font-black text-foreground">שגיאה בהרשמה</h2>
            <p className="text-sm text-muted-foreground font-extrabold">
              ההרשמה מתאפשרת רק דרך קישור ייעודי של המכבסה.
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

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col overflow-x-hidden">
      <div className="bg-primary text-primary-foreground rounded-b-[2rem] sm:rounded-b-[2.5rem] px-4 sm:px-6 pt-safe-auth pb-8 sm:pb-12">
        <div className="mx-auto max-w-md flex items-center gap-3">
          <div className="size-10 sm:size-12 rounded-full bg-primary-foreground/15 grid place-items-center shrink-0">
            <Flower2 className="size-5 sm:size-6" strokeWidth={1.75} />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-extrabold">כביסה</h1>
            <p className="text-xs sm:text-sm opacity-80">הצטרפו אלינו</p>
          </div>
        </div>
      </div>

      <form
        onSubmit={submit}
        className="mx-auto max-w-md w-full px-4 sm:px-6 mt-6 sm:mt-8 space-y-4 flex-1 pb-8"
      >
        {/* Role selector */}
        <div>
          <label className="text-sm font-semibold">סוג חשבון</label>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setSelectedRole("customer")}
              className={`rounded-2xl border py-3 text-sm font-bold transition-all min-h-[48px] flex items-center justify-center gap-2 ${
                selectedRole === "customer"
                  ? "bg-primary text-primary-foreground border-primary shadow-md"
                  : "bg-background border-border text-foreground hover:border-primary/40"
              }`}
            >
              👤 לקוח
            </button>
            <button
              type="button"
              onClick={() => setSelectedRole("laundry")}
              className={`rounded-2xl border py-3 text-sm font-bold transition-all min-h-[48px] flex items-center justify-center gap-2 ${
                selectedRole === "laundry"
                  ? "bg-primary text-primary-foreground border-primary shadow-md"
                  : "bg-background border-border text-foreground hover:border-primary/40"
              }`}
            >
              🏪 בעל מכבסה
            </button>
          </div>
        </div>

        <div>
          <label className="text-sm font-semibold">שם מלא</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1.5 w-full rounded-2xl border border-border bg-background px-4 py-3 sm:py-3.5 text-base min-h-[48px] focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="ישראל ישראלי"
          />
        </div>

        {/* Business name — only for laundry owners */}
        {selectedRole === "laundry" && (
          <div className="animate-in slide-in-from-top-2 duration-200">
            <label className="text-sm font-semibold flex items-center gap-1.5">
              <Building2 className="size-3.5 text-primary" />
              שם העסק / המכבסה
            </label>
            <input
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              className="mt-1.5 w-full rounded-2xl border border-border bg-background px-4 py-3 sm:py-3.5 text-base min-h-[48px] focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder='מכבסת כביסה פרמיום'
            />
            {businessName && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                קישור החנות שלך:{" "}
                <span className="font-bold text-primary">
                  /shop/{generateSlug(businessName)}
                </span>
              </p>
            )}
          </div>
        )}

        <div>
          <label className="text-sm font-semibold">דוא"ל</label>
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
          className="w-full rounded-3xl bg-lime text-lime-foreground py-3.5 sm:py-4 text-base sm:text-lg font-extrabold min-h-[48px] shadow-[0_15px_40px_-15px_oklch(0.92_0.18_125/0.6)] active:scale-[0.98] transition disabled:opacity-50"
        >
          {loading ? "נרשם..." : "הרשמה"}
        </button>
        <p className="text-center text-sm text-muted-foreground">
          כבר רשום?{" "}
          <Link to="/login" className="text-primary font-bold">
            התחבר
          </Link>
        </p>
      </form>
    </div>
  );
}
