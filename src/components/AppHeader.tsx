import { Flower2, User } from "lucide-react";
import { Link } from "@tanstack/react-router";

export function AppHeader({ subtitle }: { subtitle?: string }) {
  return (
    <header className="bg-primary text-primary-foreground rounded-b-[2.5rem] px-6 pt-10 pb-8 shadow-xl relative overflow-hidden">
      {/* Decorative background element */}
      <div className="absolute top-0 left-0 w-32 h-32 bg-primary-foreground/5 rounded-full -translate-x-1/2 -translate-y-1/2" />
      
      <div className="flex items-center justify-between relative z-10">
        <div className="flex items-center gap-3.5">
          <Link to="/" className="grid place-items-center size-11 rounded-2xl bg-primary-foreground/15 backdrop-blur-md shadow-inner">
            <Flower2 className="size-6" strokeWidth={1.5} />
          </Link>
          <div>
            <h1 className="text-3xl font-black tracking-tight leading-none">כביסה</h1>
            {subtitle && <p className="mt-1 text-xs font-medium opacity-75">{subtitle}</p>}
          </div>
        </div>
        
        <Link 
          to="/profile" 
          className="grid place-items-center size-11 rounded-full bg-primary-foreground/10 hover:bg-primary-foreground/20 transition-colors border border-primary-foreground/10"
        >
          <User className="size-5.5" strokeWidth={1.75} />
        </Link>
      </div>
    </header>
  );
}
