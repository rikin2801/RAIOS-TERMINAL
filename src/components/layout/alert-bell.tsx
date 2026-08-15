"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, X, TrendingUp, TrendingDown, AlertTriangle, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StockAlert } from "@/app/api/alerts/route";

const POLL_INTERVAL_MS = 5 * 60_000; // 5 minutes

const SEVERITY_STYLES: Record<StockAlert["severity"], string> = {
  green: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
  amber: "text-amber-400  bg-amber-400/10  border-amber-400/20",
  red:   "text-red-400    bg-red-400/10    border-red-400/20",
};

const TYPE_ICON: Record<StockAlert["type"], typeof TrendingUp> = {
  ENTRY_ZONE:          TrendingUp,
  CONFIRMATION_BREAK:  TrendingUp,
  PROFIT_ALERT:        AlertTriangle,
  EXIT_SIGNAL:         TrendingDown,
};

export function AlertBell() {
  const [alerts, setAlerts]       = useState<StockAlert[]>([]);
  const [open, setOpen]           = useState(false);
  const [loading, setLoading]     = useState(false);
  const [read, setRead]           = useState<Set<string>>(new Set());
  const panelRef                  = useRef<HTMLDivElement>(null);

  const alertKey = (a: StockAlert) => `${a.symbol}:${a.type}`;
  const unread = alerts.filter((a) => !read.has(alertKey(a))).length;

  async function fetchAlerts(force = false) {
    setLoading(true);
    try {
      const res = await fetch(`/api/alerts${force ? "?force=true" : ""}`);
      if (res.ok) {
        const data = await res.json();
        setAlerts(data.alerts ?? []);
      }
    } catch { /* network error — keep previous */ }
    setLoading(false);
  }

  // Initial fetch + polling
  useEffect(() => {
    fetchAlerts();
    const id = setInterval(() => fetchAlerts(), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  // Click-outside to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  function handleOpen() {
    setOpen((o) => !o);
    // Mark all as read when opening
    setRead(new Set(alerts.map(alertKey)));
  }

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={handleOpen}
        className={cn(
          "relative flex h-7 w-7 items-center justify-center rounded-md transition-colors",
          open ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"
        )}
        aria-label="Alerts"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white leading-none">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-9 z-50 w-80 rounded-lg border border-border bg-card shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <div className="flex items-center gap-2">
              <Bell className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold text-foreground">Portfolio Alerts</span>
              {alerts.length > 0 && (
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {alerts.length}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => fetchAlerts(true)}
                className="rounded px-2 py-1 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                disabled={loading}
              >
                {loading ? "Checking…" : "Refresh"}
              </button>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Alert list */}
          <div className="max-h-96 overflow-y-auto">
            {alerts.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <CheckCircle className="h-8 w-8 text-emerald-400/50" />
                <p className="text-xs font-medium text-muted-foreground">All clear</p>
                <p className="text-[10px] text-muted-foreground/60">No alerts for your portfolio right now</p>
              </div>
            ) : (
              alerts.map((alert, i) => {
                const Icon = TYPE_ICON[alert.type];
                return (
                  <div
                    key={i}
                    className={cn(
                      "flex gap-3 border-b border-border/50 px-4 py-3 last:border-0",
                      !read.has(alertKey(alert)) && "bg-accent/30"
                    )}
                  >
                    <div className={cn("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border", SEVERITY_STYLES[alert.severity])}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-foreground truncate">{alert.title}</p>
                        <span className="text-[10px] text-muted-foreground shrink-0">₹{alert.price.toFixed(0)}</span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground leading-snug">{alert.message}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-border px-4 py-2">
            <p className="text-[10px] text-muted-foreground/60">Auto-refreshes every 5 min · Checks all holdings</p>
          </div>
        </div>
      )}
    </div>
  );
}
