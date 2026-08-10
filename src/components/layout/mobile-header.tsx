"use client";

import Link from "next/link";
import { TrendingUp } from "lucide-react";
import { PortfolioSelector } from "./portfolio-selector";

export function MobileHeader() {
  return (
    <div className="flex md:hidden h-14 items-center justify-between border-b border-border bg-card px-4 shrink-0">
      <Link href="/dashboard" className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
          <TrendingUp className="h-3.5 w-3.5 text-primary-foreground" />
        </div>
        <div>
          <p className="text-xs font-bold leading-none">RAIOS</p>
          <p className="text-[10px] text-muted-foreground leading-none mt-0.5">AI Investment OS</p>
        </div>
      </Link>
      <PortfolioSelector />
    </div>
  );
}
