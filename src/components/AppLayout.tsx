import { useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { useLaundry } from "@/lib/laundry-store";
import { BottomNav } from "./BottomNav";

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, loading } = useLaundry();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  useEffect(() => {
    if (!loading && !user && !["/login", "/signup"].includes(pathname)) {
      navigate({ to: "/login" });
    }
  }, [user, loading, pathname, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background grid place-items-center">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-md">
        {children}
        {/* Spacer to prevent content overlap with BottomNav */}
        <div className="h-40" />
      </div>
      <BottomNav />
    </div>
  );
}
