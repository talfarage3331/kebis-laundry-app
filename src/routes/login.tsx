import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useLaundry } from "@/lib/laundry-store";
import { Flower2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const { login } = useLaundry();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return toast.error("יש למלא את כל השדות");
    const name = email.split("@")[0] || "משתמש";
    login({ name, email });
    toast.success("התחברת בהצלחה");
    navigate({ to: "/" });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="bg-primary text-primary-foreground rounded-b-[2.5rem] px-6 pt-14 pb-12">
        <div className="mx-auto max-w-md flex items-center gap-3">
          <div className="size-12 rounded-full bg-primary-foreground/15 grid place-items-center">
            <Flower2 className="size-6" strokeWidth={1.75} />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold">כביסה</h1>
            <p className="text-sm opacity-80">ברוכים השבים</p>
          </div>
        </div>
      </div>

      <form onSubmit={submit} className="mx-auto max-w-md w-full px-6 mt-8 space-y-4 flex-1">
        <div>
          <label className="text-sm font-semibold">דוא"ל</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1.5 w-full rounded-2xl border border-border bg-background px-4 py-3.5 text-base focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="name@example.com"
          />
        </div>
        <div>
          <label className="text-sm font-semibold">סיסמה</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1.5 w-full rounded-2xl border border-border bg-background px-4 py-3.5 text-base focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="••••••••"
          />
        </div>
        <button
          type="submit"
          className="w-full rounded-3xl bg-lime text-lime-foreground py-4 text-lg font-extrabold shadow-[0_15px_40px_-15px_oklch(0.92_0.18_125/0.6)] active:scale-[0.98] transition"
        >
          התחברות
        </button>
        <p className="text-center text-sm text-muted-foreground">
          אין לך חשבון?{" "}
          <Link to="/signup" className="text-primary font-bold">הירשם עכשיו</Link>
        </p>
      </form>
    </div>
  );
}
