import { useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { useLaundry } from "@/lib/laundry-store";
import { BottomNav } from "./BottomNav";

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, loading } = useLaundry();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  useEffect(() => {
    if (loading) return;

    if (!user) {
      if (!["/login", "/signup"].includes(pathname)) {
        navigate({ to: "/login" });
      }
      return;
    }

    // Role-Based Access Control Redirection
    if (user.role === "admin") {
      if (pathname !== "/admin" && !pathname.startsWith("/admin/") && pathname !== "/admin-chat") {
        navigate({ to: "/admin" });
      }
    } else if (user.role === "laundry") {
      if (pathname !== "/laundry-dashboard" && pathname !== "/admin-chat") {
        navigate({ to: "/laundry-dashboard" });
      }
    } else {
      // customer
      if (pathname === "/admin" || pathname.startsWith("/admin/") || pathname === "/laundry-dashboard" || pathname === "/admin-chat") {
        navigate({ to: "/" });
      }
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

  const isSpecialDashboard = ["/admin", "/laundry-dashboard", "/admin-chat"].includes(pathname) || user?.role === "admin" || user?.role === "laundry";

  return (
    <div className="min-h-screen bg-background">
      <div className={isSpecialDashboard ? "w-full" : "mx-auto max-w-md"}>
        {children}
        {/* Spacer to prevent content overlap with BottomNav if visible */}
        {!isSpecialDashboard && <div className="h-40" />}
      </div>
      {!isSpecialDashboard && <BottomNav />}
    </div>
  );
}
