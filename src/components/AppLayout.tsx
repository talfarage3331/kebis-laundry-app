import { Outlet, useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";
import { useLaundry } from "@/lib/laundry-store";
import { BottomNav } from "./BottomNav";

export function AppLayout() {
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
    <div className="min-h-screen bg-background pb-24">
      <div className="mx-auto max-w-md">
        <Outlet />
      </div>
      <BottomNav />
    </div>
  );
}
