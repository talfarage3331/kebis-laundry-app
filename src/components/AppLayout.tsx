import { useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { useLaundry } from "@/lib/laundry-store";
import { BottomNav } from "./BottomNav";

export function AppLayout({ children }: { children: ReactNode }) {
  const { user } = useLaundry();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  useEffect(() => {
    if (!user && !["/login", "/signup"].includes(pathname)) {
      navigate({ to: "/login" });
    }
  }, [user, pathname, navigate]);

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background pb-28">
      <div className="mx-auto max-w-md">{children}</div>
      <BottomNav />
    </div>
  );
}
