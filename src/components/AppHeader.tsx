import { Flower2 } from "lucide-react";
import { Link } from "@tanstack/react-router";

export function AppHeader({ subtitle }: { subtitle?: string }) {
  return (
    <header className="bg-primary text-primary-foreground rounded-b-[2rem] px-5 pt-6 pb-7 shadow-lg">
      <div className="flex items-center gap-3">
        <Link to="/" className="grid place-items-center size-10 rounded-full bg-primary-foreground/15">
          <Flower2 className="size-5" strokeWidth={1.75} />
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">כביסה</h1>
      </div>
      {subtitle && <p className="mt-3 text-sm opacity-90">{subtitle}</p>}
    </header>
  );
}
