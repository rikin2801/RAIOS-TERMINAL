"use client";

import { useState, useEffect, useCallback } from "react";
import type { IndexQuote } from "@/app/api/market/indices/route";

function isMarketOpen(): boolean {
  const now = new Date();
  const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const day = ist.getDay();
  const h = ist.getHours();
  const m = ist.getMinutes();
  const mins = h * 60 + m;
  if (day === 0 || day === 6) return false;
  return mins >= 555 && mins < 930; // 9:15 AM to 3:30 PM IST
}

function formatINR(n: number): string {
  if (n >= 1e7) return `${(n / 1e7).toFixed(2)}Cr`;
  if (n >= 1e5) return `${(n / 1e5).toFixed(2)}L`;
  return n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function ISTClock() {
  const [time, setTime] = useState("");
  useEffect(() => {
    const tick = () => {
      const t = new Date().toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
      setTime(t);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="font-mono text-sm tabular-nums font-medium">{time} IST</span>;
}

export function MarketBar() {
  const [indices, setIndices] = useState<IndexQuote[]>([]);
  const [open, setOpen] = useState(isMarketOpen());

  const fetchIndices = useCallback(async () => {
    try {
      const res = await fetch("/api/market/indices");
      if (res.ok) setIndices(await res.json());
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    fetchIndices();
    const iv = setInterval(() => {
      setOpen(isMarketOpen());
      fetchIndices();
    }, 60_000);
    return () => clearInterval(iv);
  }, [fetchIndices]);

  return (
    <div className="h-12 flex items-center gap-0 border-b border-border bg-card/50 backdrop-blur-sm px-4 overflow-x-auto shrink-0">
      {/* Market status */}
      <div className="flex items-center gap-2 pr-5 border-r border-border mr-6 shrink-0">
        <span className={`h-2 w-2 rounded-full ${open ? "bg-green-400 animate-pulse" : "bg-muted-foreground"}`} />
        <span className={`text-sm font-bold tracking-widest ${open ? "text-green-400" : "text-muted-foreground"}`}>
          {open ? "MARKET OPEN" : "MARKET CLOSED"}
        </span>
      </div>

      {/* Indices */}
      <div className="flex items-center gap-7 overflow-x-auto flex-1">
        {indices.map((idx) => {
          const up = idx.changePercent >= 0;
          return (
            <div key={idx.symbol} className="flex items-center gap-2.5 shrink-0">
              <span className="text-sm font-semibold text-muted-foreground tracking-wide">{idx.name}</span>
              <span className="text-base font-mono font-bold">{formatINR(idx.price)}</span>
              <span className={`text-sm font-mono font-semibold ${up ? "text-green-400" : "text-red-400"}`}>
                {up ? "▲" : "▼"} {Math.abs(idx.changePercent).toFixed(2)}%
              </span>
            </div>
          );
        })}
        {indices.length === 0 && (
          <span className="text-sm text-muted-foreground animate-pulse">Loading market data…</span>
        )}
      </div>

      {/* Clock */}
      <div className="pl-5 border-l border-border ml-4 shrink-0 text-muted-foreground">
        <ISTClock />
      </div>
    </div>
  );
}
