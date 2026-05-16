import { Link, useLocation } from "@tanstack/react-router";
import { Home, Activity, Wallet, User } from "lucide-react";

const items = [
  { to: "/", label: "הבית", Icon: Home },
  { to: "/tracking", label: "מעקב", Icon: Activity },
  { to: "/payments", label: "תשלומים", Icon: Wallet },
  { to: "/profile", label: "פרופיל", Icon: User },
] as const;

export function BottomNav() {
  const { pathname } = useLocation();
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 bg-background border-t border-border">
      <ul className="mx-auto max-w-md grid grid-cols-4">
        {items.map(({ to, label, Icon }) => {
          const active = pathname === to;
          return (
            <li key={to}>
              <Link
                to={to}
                className="flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium"
              >
                <span
                  className={`grid place-items-center size-10 rounded-full transition-colors ${
                    active ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                  }`}
                >
                  <Icon strokeWidth={1.75} className="size-5" />
                </span>
                <span className={active ? "text-primary" : "text-muted-foreground"}>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  );
}
