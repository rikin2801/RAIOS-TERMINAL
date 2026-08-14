"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { LayoutDashboard, Briefcase, Target, TrendingUp, BrainCircuit } from "lucide-react";

const nav = [
  { href: "/dashboard",    label: "Dashboard", icon: LayoutDashboard },
  { href: "/portfolio",    label: "Portfolio", icon: Briefcase },
  { href: "/ai-analysis",  label: "AI",        icon: BrainCircuit, primary: true },
  { href: "/portfolio-manager", label: "Mgr",  icon: Target },
  { href: "/market",       label: "Market",    icon: TrendingUp },
];

export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex h-16 items-center justify-around border-t border-border bg-card/95 backdrop-blur-sm px-2">
      {nav.map(({ href, label, icon: Icon, primary }) => {
        const active = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-all min-w-0",
              active ? "text-primary" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <div className={cn(
              "flex items-center justify-center rounded-lg transition-all",
              primary && "bg-primary/10 p-1.5",
              active && primary && "bg-primary/25"
            )}>
              <Icon className={cn(
                "h-5 w-5 shrink-0",
                primary ? "text-primary" : active ? "text-primary" : "text-muted-foreground"
              )} />
            </div>
            <span className={cn(
              "text-[10px] font-medium leading-none truncate",
              primary ? "text-primary" : active ? "text-primary" : ""
            )}>
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
