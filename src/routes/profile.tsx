import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { AppHeader } from "@/components/AppHeader";
import { useLaundry } from "@/lib/laundry-store";
import { LogOut, User as UserIcon, Mail } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/profile")({ component: Profile });

function Profile() {
  const { user, logout } = useLaundry();
  const navigate = useNavigate();

  return (
    <AppLayout>
      <AppHeader subtitle="הפרופיל שלי" />
      <main className="px-5 mt-6 space-y-4">
        <div className="rounded-3xl bg-lavender text-lavender-foreground p-6 flex items-center gap-4">
          <div className="size-16 rounded-full bg-primary text-primary-foreground grid place-items-center text-2xl font-extrabold">
            {user?.name?.[0] ?? "?"}
          </div>
          <div>
            <p className="text-lg font-extrabold">{user?.name}</p>
            <p className="text-sm opacity-70 flex items-center gap-1">
              <Mail className="size-3.5" strokeWidth={1.75} /> {user?.email}
            </p>
          </div>
        </div>

        <button
          onClick={() => { logout(); navigate({ to: "/login" }); }}
          className="w-full flex items-center justify-between rounded-3xl bg-primary text-primary-foreground p-5 font-semibold"
        >
          <span className="flex items-center gap-3"><LogOut className="size-5" strokeWidth={1.75} /> התנתקות</span>
        </button>
      </main>
    </AppLayout>
  );
}
