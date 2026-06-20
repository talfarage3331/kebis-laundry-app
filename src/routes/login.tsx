import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useLaundry } from "@/lib/laundry-store";
import { Flower2 } from "lucide-react";
import { toast } from "sonner";
import { auth, db, googleProvider } from "@/lib/firebase";
import { signInWithEmailAndPassword, signInWithPopup, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

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
  validateSearch: (search: Record<string, unknown>): { laundryId?: string } => ({
    laundryId: typeof search.laundryId === "string" ? search.laundryId : undefined,
  }),
});

function Login() {
  const { user, loading: authLoading, isProfileReady, role, isRoleLoading } = useLaundry();
  const { laundryId } = Route.useSearch();

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
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

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

  const signInWithGoogle = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const fbUser = result.user;
      if (fbUser) {
        // Guard: check Firestore doc exists — block new users registering via Google on Login page
        const userDoc = await getDoc(doc(db, "users", fbUser.uid));
        if (!userDoc.exists()) {
          // Force sign-out immediately — this is a login page, not registration
          await signOut(auth);
          toast.error(
            "לא נמצא חשבון קיים במערכת. הרשמה כלקוח מתאפשרת רק דרך לינק ייעודי של המכבסה.",
            { duration: 6000 }
          );
          return;
        }

        const role = userDoc.data().role || "customer";
        toast.success("התחברת בהצלחה");

        if (role === "admin") {
          navigate({ to: "/admin" });
        } else if (role === "laundry") {
          navigate({ to: "/laundry-dashboard" });
        } else {
          navigate({ to: "/" });
        }
      }
    } catch (error: any) {
      console.error("Error logging in with Google:", error.message);
      toast.error("התחברות עם גוגל נכשלה: " + error.message);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return toast.error("יש למלא את כל השדות");

    setLoading(true);
    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      const fbUser = result.user;

      const userDoc = await getDoc(doc(db, "users", fbUser.uid));

      // Guard: if no Firestore profile exists, this account was never properly registered
      if (!userDoc.exists()) {
        await signOut(auth);
        setLoading(false);
        return toast.error("משתמש זה אינו קיים במערכת. אנא עבר לדף ההרשמה.");
      }

      const role = userDoc.data().role || "customer";

      setLoading(false);
      toast.success("התחברת בהצלחה");

      if (role === "admin") {
        navigate({ to: "/admin" });
      } else if (role === "laundry") {
        navigate({ to: "/laundry-dashboard" });
      } else {
        navigate({ to: "/" });
      }
    } catch (error: any) {
      setLoading(false);
      const code = error?.code ?? "";
      if (
        code === "auth/invalid-credential" ||
        code === "auth/user-not-found" ||
        code === "auth/wrong-password"
      ) {
        return toast.error("משתמש זה אינו קיים במערכת. אנא עבר לדף ההרשמה.");
      }
      return toast.error(error.message);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col overflow-x-hidden">
      <div className="bg-primary text-primary-foreground rounded-b-[2rem] sm:rounded-b-[2.5rem] px-4 sm:px-6 pt-safe-auth pb-8 sm:pb-12">
        <div className="mx-auto max-w-md flex items-center gap-3">
          <div className="size-10 sm:size-12 rounded-full bg-primary-foreground/15 grid place-items-center shrink-0">
            <Flower2 className="size-5 sm:size-6" strokeWidth={1.75} />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-extrabold">כביסה</h1>
            <p className="text-xs sm:text-sm opacity-80">ברוכים השבים</p>
          </div>
        </div>
      </div>

      <form
        onSubmit={submit}
        className="mx-auto max-w-md w-full px-4 sm:px-6 mt-6 sm:mt-8 space-y-4 flex-1 pb-8"
      >
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
          {loading ? "מתחבר..." : "התחברות"}
        </button>
        <button
          type="button"
          onClick={signInWithGoogle}
          className="w-full mt-2 flex items-center justify-center gap-2 rounded-3xl bg-white text-gray-800 py-3.5 sm:py-4 text-base sm:text-lg font-semibold min-h-[48px] shadow-md hover:bg-gray-100 transition"
        >
          <GoogleIcon className="size-5" />
          התחברות עם Google
        </button>
        <p className="text-center text-sm text-muted-foreground">
          אין לך חשבון?{" "}
          <Link to="/signup" search={laundryId ? { laundryId } : undefined} className="text-primary font-bold">
            הירשם עכשיו
          </Link>
        </p>
      </form>
    </div>
  );
}
