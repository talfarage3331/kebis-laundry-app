import { useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { useLaundry } from "@/lib/laundry-store";
import { BottomNav } from "./BottomNav";

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, loading, isProfileReady, role, isRoleLoading } = useLaundry();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const isFullyLoaded = !loading && isProfileReady && !isRoleLoading;

  useEffect(() => {
    if (!isFullyLoaded) return;

    if (!user) {
      const isPublicPath = ["/login", "/signup"].includes(pathname) || pathname.startsWith("/shop");
      if (!isPublicPath) {
        navigate({ to: "/login" });
      }
      return;
    }

    const currentRole = user.role || role || "customer";

    // Role-Based Access Control Redirection
    if (currentRole === "admin") {
      if (pathname !== "/admin" && !pathname.startsWith("/admin/") && pathname !== "/admin-chat") {
        window.location.href = "/admin";
      }
    } else if (currentRole === "laundry") {
      if (pathname !== "/laundry-dashboard" && pathname !== "/admin-chat") {
        window.location.href = "/laundry-dashboard";
      }
    } else {
      // customer
      if (
        pathname === "/admin" ||
        pathname.startsWith("/admin/") ||
        pathname === "/laundry-dashboard" ||
        pathname === "/admin-chat"
      ) {
        window.location.href = "/";
      }
    }
  }, [user, isFullyLoaded, role, pathname, navigate]);

  if (!isFullyLoaded) {
    return (
      <div className="min-h-screen bg-background grid place-items-center">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) return null;

  const currentRole = user.role || role || "customer";
  const isSpecialDashboard =
    ["/admin", "/laundry-dashboard", "/admin-chat"].includes(pathname) ||
    currentRole === "admin" ||
    currentRole === "laundry";
  const hideBottomNav = isSpecialDashboard || pathname === "/chat";

  return (
    <div className="min-h-screen bg-background">
      <div className={isSpecialDashboard ? "w-full" : "mx-auto max-w-md"}>
        {children}
        {/* Spacer to prevent content overlap with BottomNav if visible */}
        {!hideBottomNav && <div className="h-40" />}
      </div>
      {!hideBottomNav && <BottomNav />}
    </div>
  );
}
