"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Briefcase,
  TrendingUp,
  BarChart2,
  Brain,
  Search,
  PieChart,
  Settings,
  ChevronRight,
  Lightbulb,
  Target,
  ArrowLeftRight,
} from "lucide-react";
import { PortfolioSelector } from "./portfolio-selector";

const nav = [
  { href: "/portfolio-manager", label: "AI Portfolio Manager", icon: Target },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/portfolio", label: "Portfolio", icon: Briefcase },
  { href: "/market", label: "Market Explorer", icon: TrendingUp },
  { href: "/analysis", label: "Analysis", icon: BarChart2 },
  { href: "/strategy", label: "Strategy Center", icon: Lightbulb },
  { href: "/ai", label: "AI Advisor", icon: Brain },
  { href: "/portfolio-analysis", label: "Portfolio Analysis", icon: PieChart },
  { href: "/search", label: "Search", icon: Search },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-56 flex-col border-r border-border bg-card">
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b border-border px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
          <TrendingUp className="h-4 w-4 text-primary-foreground" />
        </div>
        <div>
          <p className="text-xs font-bold text-foreground leading-none">RAIOS</p>
          <p className="text-xs text-muted-foreground">AI Investment OS</p>
        </div>
      </div>

      {/* Portfolio Profile Selector */}
      <div className="pt-3 pb-1 border-b border-border">
        <p className="px-4 pb-1 text-[10px] font-semibold text-muted-foreground tracking-widest uppercase">
          Active Portfolio
        </p>
        <PortfolioSelector />
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 p-2 overflow-y-auto">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          const isPrimary = href === "/portfolio-manager";
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all",
                active
                  ? "bg-primary/10 text-primary"
                  : isPrimary
                  ? "text-primary/80 hover:bg-primary/5 hover:text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <Icon className={cn("h-4 w-4 shrink-0", isPrimary && !active && "text-primary/70")} />
              <span className="flex-1 text-xs">{label}</span>
              {active && <ChevronRight className="h-3 w-3" />}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-border p-3">
        <div className="flex items-center gap-2 text-muted-foreground">
          <ArrowLeftRight className="h-3 w-3" />
          <p className="text-xs">NSE · BSE · Yahoo Finance</p>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 pl-5">Gemini 2.5 Flash AI</p>
      </div>
    </aside>
  );
}
