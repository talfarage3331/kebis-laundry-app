import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useLaundry } from "@/lib/laundry-store";
import { Flower2 } from "lucide-react";
import { toast } from "sonner";
import { auth, db } from "@/lib/firebase";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

export const Route = createFileRoute("/signup")({ component: Signup });

function Signup() {
  const { user, loading: authLoading } = useLaundry();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user && !authLoading) {
      if (user.role === "admin") {
        navigate({ to: "/admin" });
      } else if (user.role === "laundry") {
        navigate({ to: "/laundry-dashboard" });
      } else {
        navigate({ to: "/" });
      }
    }
  }, [user, authLoading, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !password) return toast.error("יש למלא את כל השדות");

    setLoading(true);
    try {
      const result = await createUserWithEmailAndPassword(auth, email, password);
      const fbUser = result.user;

      // Update Auth display name
      await updateProfile(fbUser, { displayName: name });

      // Save profile in Firestore users collection
      const role = email === "talfarage3331@gmail.com" ? "admin" : "customer";
      await setDoc(doc(db, "users", fbUser.uid), {
        fullName: name,
        email: email,
        role: role,
        createdAt: serverTimestamp(),
      });

      setLoading(false);
      toast.success("נרשמת בהצלחה");

      if (role === "admin") {
        navigate({ to: "/admin" });
      } else {
        navigate({ to: "/" });
      }
    } catch (error: any) {
      setLoading(false);
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
            <p className="text-xs sm:text-sm opacity-80">הצטרפו אלינו</p>
          </div>
        </div>
      </div>

      <form
        onSubmit={submit}
        className="mx-auto max-w-md w-full px-4 sm:px-6 mt-6 sm:mt-8 space-y-4 flex-1 pb-8"
      >
        <div>
          <label className="text-sm font-semibold">שם מלא</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1.5 w-full rounded-2xl border border-border bg-background px-4 py-3 sm:py-3.5 text-base min-h-[48px] focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="ישראל ישראלי"
          />
        </div>
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
