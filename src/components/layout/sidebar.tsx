"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Briefcase,
  TrendingUp,
  Settings,
  ChevronRight,
  Target,
  ArrowLeftRight,
  Search,
} from "lucide-react";
import { PortfolioSelector } from "./portfolio-selector";

const primaryNav = [
  { href: "/dashboard",          label: "Dashboard",         icon: LayoutDashboard },
  { href: "/portfolio-manager",  label: "AI Manager",        icon: Target,          accent: true },
  { href: "/portfolio",          label: "Portfolio",         icon: Briefcase },
  { href: "/market",             label: "Market",            icon: TrendingUp },
  { href: "/search",             label: "Search",            icon: Search },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex h-screen w-52 flex-col border-r border-border bg-card">
      {/* Logo */}
      <div className="flex h-14 items-center gap-3 border-b border-border px-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
          <TrendingUp className="h-3.5 w-3.5 text-primary-foreground" />
        </div>
        <div>
          <p className="text-sm font-bold text-foreground leading-none tracking-tight">RAIOS</p>
          <p className="text-[10px] text-muted-foreground leading-none mt-0.5">AI Investment OS</p>
        </div>
      </div>

      {/* Portfolio Selector */}
      <div className="py-2 border-b border-border">
        <p className="px-4 pb-1 text-[10px] font-semibold text-muted-foreground tracking-widest uppercase">
          Portfolio
        </p>
        <PortfolioSelector />
      </div>

      {/* Primary Nav */}
      <nav className="flex-1 p-2 space-y-0.5">
        {primaryNav.map(({ href, label, icon: Icon, accent }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-xs font-medium transition-all",
                active
                  ? "bg-primary/10 text-primary"
                  : accent
                  ? "text-primary/80 hover:bg-primary/5 hover:text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <Icon className={cn("h-3.5 w-3.5 shrink-0", accent && !active && "text-primary/70")} />
              <span className="flex-1">{label}</span>
              {active && <ChevronRight className="h-3 w-3" />}
            </Link>
          );
        })}
      </nav>

      {/* Settings at bottom */}
      <div className="border-t border-border p-2">
        <Link
          href="/settings"
          className={cn(
            "flex items-center gap-2.5 rounded-md px-3 py-2 text-xs font-medium transition-all",
            pathname === "/settings" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"
          )}
        >
          <Settings className="h-3.5 w-3.5 shrink-0" />
          <span>Settings</span>
        </Link>
        <div className="flex items-center gap-1.5 px-3 pt-2 pb-1">
          <ArrowLeftRight className="h-3 w-3 text-muted-foreground/50" />
          <p className="text-[10px] text-muted-foreground/60">NSE · BSE · Gemini AI</p>
        </div>
      </div>
    </aside>
  );
}
