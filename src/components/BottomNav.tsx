import { Link, useLocation } from "@tanstack/react-router";
import { Home, Activity, Wallet } from "lucide-react";

const items = [
  { to: "/tracking", label: "מעקב", Icon: Activity },
  { to: "/", label: "הבית", Icon: Home },
  { to: "/payments", label: "תשלומים", Icon: Wallet },
] as const;

export function BottomNav() {
  const { pathname } = useLocation();
  return (
    <nav className="fixed bottom-6 inset-x-5 z-40">
      <div className="mx-auto max-w-md bg-background/80 backdrop-blur-xl border border-white/20 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.3)] rounded-[2.5rem] px-2 py-2">
        <ul className="grid grid-cols-3 items-end">
          {items.map(({ to, label, Icon }, idx) => {
            const active = pathname === to;
            const isHome = idx === 1;

            if (isHome) {
              return (
                <li key={to} className="relative -top-6 flex flex-col items-center">
                  <Link
                    to={to}
                    className={`grid place-items-center size-16 rounded-full transition-all duration-500 shadow-2xl ${
                      active 
                        ? "bg-primary text-primary-foreground scale-110 rotate-[360deg]" 
                        : "bg-muted text-muted-foreground hover:bg-primary/10"
                    }`}
                  >
                    <Icon strokeWidth={2.25} className="size-7" />
                  </Link>
                  <span className={`mt-2 text-xs font-bold transition-colors ${active ? "text-primary" : "text-muted-foreground"}`}>
                    {label}
                  </span>
                </li>
              );
            }

            return (
              <li key={to} className="pb-1">
                <Link
                  to={to}
                  className="flex flex-col items-center gap-1.5 py-2 transition-all active:scale-90"
                >
                  <Icon 
                    strokeWidth={active ? 2.5 : 1.75} 
                    className={`size-6 transition-colors ${active ? "text-primary" : "text-muted-foreground"}`} 
                  />
                  <span className={`text-[11px] font-bold transition-colors ${active ? "text-primary" : "text-muted-foreground"}`}>
                    {label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
